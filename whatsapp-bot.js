/**
 * whatsapp-bot.js
 * Módulo de Atendimento Automático via WhatsApp usando IA
 */
const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { callGeminiApi } = require('./ia-service'); // Integrado ao Gemini 3.7 Flash recém atualizado

class WhatsAppBot {
    constructor(db) {
        this.db = db;
        this.sock = null;
        this.contextos = new Map(); // Histórico de mensagens por número
    }

    async iniciar() {
        console.log('Iniciando Robô de Atendimento WhatsApp...');
        const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
        
        this.sock = makeWASocket({
            auth: state,
            printQRInTerminal: true,
            browser: ['Chef Cozinha Atendimento', 'Chrome', '1.0']
        });

        this.sock.ev.on('creds.update', saveCreds);

        this.sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            if(connection === 'close') {
                const shouldReconnect = lastDisconnect.error?.output?.statusCode !== 401;
                console.log('Conexão fechada, reconectando:', shouldReconnect);
                if(shouldReconnect) this.iniciar();
            } else if(connection === 'open') {
                console.log('🤖 Robô do WhatsApp Conectado e Operacional!');
            }
        });

        this.sock.ev.on('messages.upsert', async ({ messages }) => {
            const msg = messages[0];
            if(!msg.message || msg.key.fromMe) return;

            const sender = msg.key.remoteJid;
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
            
            if(!text) return;

            console.log(`[WHATSAPP] Mensagem de ${sender}: ${text}`);
            await this.processarMensagem(sender, text);
        });
    }

    async processarMensagem(sender, text) {
        try {
            // Cria um contexto se não existir
            if (!this.contextos.has(sender)) {
                this.contextos.set(sender, [
                    { role: 'user', parts: [{ text: 'Oi' }] },
                    { role: 'model', parts: [{ text: 'Olá! Sou o assistente virtual do restaurante. Como posso ajudar?' }] }
                ]);
            }
            
            const history = this.contextos.get(sender);
            
            // Busca o cardápio no banco para contexto
            const cardapio = await this.buscarCardapioAtivo();
            
            const systemInstruction = `Você é o garçom virtual do restaurante. Seja muito educado, caloroso e conciso. 
O cardápio atual é: ${cardapio}.
Sua missão é tirar dúvidas, enviar o link do cardápio digital (http://seusite.com/cardapio) e ajudar o cliente a escolher.`;

            // Chama a IA do Chef Cozinha
            const respostaIA = await callGeminiApi(
                process.env.GEMINI_API_KEY, 
                'gemini-3.7-flash', 
                systemInstruction, 
                text
            );

            // Envia de volta para o cliente
            await this.sock.sendMessage(sender, { text: respostaIA });

            // Salva no contexto local (limitado a 10 interações para economizar memória)
            history.push({ role: 'user', parts: [{ text }] });
            history.push({ role: 'model', parts: [{ text: respostaIA }] });
            if (history.length > 20) history.splice(0, 2);

        } catch (error) {
            console.error('Erro ao processar mensagem do WhatsApp:', error);
            await this.sock.sendMessage(sender, { text: "Desculpe, nosso sistema de IA está momentaneamente indisponível. Por favor, acesse nosso cardápio online." });
        }
    }

    async buscarCardapioAtivo() {
        return new Promise((resolve) => {
            this.db.all("SELECT nome, preco, descricao FROM produtos WHERE status='ativo'", [], (err, rows) => {
                if (err || !rows) return resolve('Cardápio indisponível no momento.');
                const texto = rows.map(r => `- ${r.nome}: R$ ${r.preco} (${r.descricao || ''})`).join('\n');
                resolve(texto);
            });
        });
    }
}

module.exports = WhatsAppBot;
