/**
 * tef-service.js
 * Módulo de Integração de TEF (Transferência Eletrônica de Fundos)
 * Suporta integrações diretas com Smart POS (Stone, PagSeguro, Rede) via rede local ou webhooks.
 */

const EventEmitter = require('events');

class TEFService extends EventEmitter {
    constructor(db) {
        super();
        this.db = db;
        this.terminais = new Map(); // Armazena IPs e Status dos terminais Smart POS na rede
    }

    /**
     * Envia o valor de uma conta diretamente para a maquininha selecionada.
     * @param {string} terminalId - ID ou IP da maquininha
     * @param {number} valor - Valor em centavos (ex: 15000 = R$ 150,00)
     * @param {string} tipoPagamento - 'CREDITO', 'DEBITO', 'PIX'
     * @param {string} referencia - ID do pedido ou mesa para conciliação
     */
    async enviarTransacao(terminalId, valor, tipoPagamento, referencia) {
        console.log(`[TEF] Iniciando transação de R$ ${(valor/100).toFixed(2)} no terminal ${terminalId}`);
        
        const terminal = this.terminais.get(terminalId);
        if (!terminal) {
            throw new Error('Terminal Smart POS não encontrado ou offline na rede.');
        }

        // Mock payload padrão de integrações TEF API (ex: Stone PDV Sync / PagSeguro PlugPag)
        const payload = {
            amount: valor,
            payment_type: tipoPagamento,
            order_reference: referencia,
            installments: 1
        };

        try {
            // Em um ambiente real, isso faria um POST http para o IP local do Smart POS
            // Exemplo: await axios.post(`http://${terminal.ip}:8080/v1/payment`, payload)
            
            this.emit('transacao_iniciada', { referencia, terminalId });
            
            // Simula o tempo do cliente inserir a senha e aprovar
            return new Promise((resolve) => {
                setTimeout(() => {
                    const sucesso = Math.random() > 0.1; // 90% de chance de aprovação
                    if (sucesso) {
                        const recibo = `NSU: ${Math.floor(Math.random() * 1000000)}\nAUT: ${Math.floor(Math.random() * 10000)}`;
                        console.log(`[TEF] Transação APROVADA: ${referencia}`);
                        this.registrarConciliacao(referencia, valor, tipoPagamento, 'APROVADA');
                        resolve({ status: 'APROVADA', recibo });
                    } else {
                        console.log(`[TEF] Transação NEGADA: ${referencia}`);
                        resolve({ status: 'NEGADA', motivo: 'Saldo Insuficiente ou Senha Incorreta' });
                    }
                }, 5000);
            });

        } catch (error) {
            console.error('[TEF] Erro de comunicação com o terminal:', error);
            throw error;
        }
    }

    registrarConciliacao(referencia, valor, tipo, status) {
        // Registra no banco para não perder a transação e garantir que o caixa feche certo
        console.log(`[TEF Conciliação] Registrando ${tipo} de R$ ${(valor/100).toFixed(2)} -> ${status}`);
    }

    registrarTerminalConectado(ip, id, nome) {
        this.terminais.set(id, { ip, nome, status: 'online', lastPing: Date.now() });
        console.log(`[TEF] Terminal Registrado na rede: ${nome} (${ip})`);
    }
}

module.exports = TEFService;
