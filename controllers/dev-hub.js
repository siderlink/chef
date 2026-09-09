/**
 * controllers/dev-hub.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Central de Desenvolvimento & Hub de APIs Internas para a Equipe de Suporte
 * 
 * Fornece:
 *  1. Catálogo Completo de Rotas, Endpoints e Sockets do Ecossistema
 *  2. Sandbox / Playground Interativo para Teste de Requisições em Tempo Real
 *  3. Scaffolder & Presets Prontos de Plugins (Hardware, PIX, WhatsApp, KDS, BI)
 *  4. Compatibilidade com a Central de Módulos (/api/suporte/modulos/*)
 *  5. SDK Interno & Guias de Integração Multi-Tenant Hot-Reloadable
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const PLUGINS_DIR = path.join(__dirname, '..', 'plugins');
const MODULES_CONFIG_FILE = path.join(__dirname, '..', 'chef-modules.json');

module.exports = function (app, deps = {}) {
  const { db, masterDb, io, sqlite3, verificarToken, getTenantDb, JWT_SECRET } = deps;

  function loadModulesConfig() {
    if (fs.existsSync(MODULES_CONFIG_FILE)) {
      try {
        return JSON.parse(fs.readFileSync(MODULES_CONFIG_FILE, 'utf8'));
      } catch (e) {
        console.warn('[dev-hub] Erro ao ler chef-modules.json:', e.message);
      }
    }
    return { enabledModules: {}, order: [] };
  }

  function saveModulesConfig(cfg) {
    try {
      fs.writeFileSync(MODULES_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
      return true;
    } catch (e) {
      console.error('[dev-hub] Erro ao salvar chef-modules.json:', e);
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. CATÁLOGO COMPLETO DE ROTAS INTERNAS & SOCKETS
  // ═══════════════════════════════════════════════════════════════════════════
  const API_CATALOG = [
    // ── AUTENTICAÇÃO & CONTROLE DE SESSÃO ──
    {
      category: 'Autenticação & Sessões',
      method: 'POST',
      path: '/api/login',
      title: 'Login de Restaurante / Operador',
      description: 'Autentica o operador de caixa, gerente ou garçom com credenciais ou PIN.',
      auth: 'Nenhuma (Pública)',
      headers: { 'Content-Type': 'application/json' },
      sampleBody: { login: 'operador1', senha: '123' },
      sampleResponse: { sucesso: true, token: 'eyJhbGciOi...', restaurante: { id: 1, nome: 'Chef Cozinha Matriz' } }
    },
    {
      category: 'Autenticação & Sessões',
      method: 'POST',
      path: '/api/suporte/login',
      title: 'Login da Equipe de Suporte & Dev',
      description: 'Autentica membros da equipe técnica e suporte com níveis de acesso e gamificação.',
      auth: 'Nenhuma (Pública)',
      headers: { 'Content-Type': 'application/json' },
      sampleBody: { email: 'suporte@chefcozinha.com', senha: 'admin' },
      sampleResponse: { ok: true, token: 'sup_token_xyz', usuario: { id: 1, nome: 'Dev Suporte', nivel: 5, xp: 450 } }
    },
    {
      category: 'Autenticação & Sessões',
      method: 'GET',
      path: '/api/suporte/me',
      title: 'Perfil do Membro de Suporte Conectado',
      description: 'Retorna os dados do desenvolvedor/suporte logado, XP acumulado e permissões.',
      auth: 'Header x-suporte-token',
      headers: { 'x-suporte-token': 'SEU_TOKEN_AQUI' },
      sampleBody: null,
      sampleResponse: { ok: true, usuario: { id: 1, nome: 'Suporte Master', email: 'dev@chef.com', xp: 620, nivel: 7 } }
    },

    // ── GESTÃO MULTI-TENANT & CLIENTES ──
    {
      category: 'Tenants & Restaurantes',
      method: 'GET',
      path: '/api/suporte/restaurantes',
      title: 'Listar Todos os Restaurantes / Tenants',
      description: 'Retorna a lista global de todos os inquilinos registrados no master.sqlite.',
      auth: 'Header x-suporte-token',
      headers: { 'x-suporte-token': 'SEU_TOKEN_AQUI' },
      sampleBody: null,
      sampleResponse: { ok: true, restaurantes: [{ id: 1, nome: 'Pizzaria Bella', slug: 'pizzaria-bella', ativo: 1, licenca: 'plano_pro' }] }
    },
    {
      category: 'Tenants & Restaurantes',
      method: 'GET',
      path: '/api/suporte/restaurantes/:id/produtos',
      title: 'Consultar Cardápio de um Tenant Específico',
      description: 'Carrega os produtos e categorias do banco sqlite individual do restaurante informado.',
      auth: 'Header x-suporte-token',
      headers: { 'x-suporte-token': 'SEU_TOKEN_AQUI' },
      sampleBody: null,
      sampleResponse: { ok: true, produtos: [{ id: 10, nome: 'Pizza Margherita', preco: 49.9, categoria: 'Pizzas' }], categorias: ['Pizzas', 'Bebidas'] }
    },
    {
      category: 'Tenants & Restaurantes',
      method: 'GET',
      path: '/api/features/tenants/:id',
      title: 'Módulos & Features Habilitadas no Tenant',
      description: 'Verifica quais dos 19 módulos avançados estão ativos para a licença do tenant.',
      auth: 'Bearer JWT / SuperAdmin',
      headers: { 'Authorization': 'Bearer SEU_JWT' },
      sampleBody: null,
      sampleResponse: { sucesso: true, tenant_id: 1, plano: 'completo', features: { kds_cozinha: true, balanca_checkout: true, bi_lucratividade: true } }
    },

    // ── PEDIDOS, MESAS & ATENDIMENTO ──
    {
      category: 'Pedidos & Atendimento',
      method: 'GET',
      path: '/api/pedidos',
      title: 'Fila de Pedidos Ativos',
      description: 'Retorna os pedidos em aberto no turno atual (Balcão, Mesa, Delivery).',
      auth: 'Bearer JWT (Tenant)',
      headers: { 'Authorization': 'Bearer SEU_JWT' },
      sampleBody: null,
      sampleResponse: [{ id: 1042, mesa: 4, cliente: 'Carlos', total: 88.50, status: 'preparando', itens: [{ nome: 'Hambúrguer Gourmet', qtd: 2 }] }]
    },
    {
      category: 'Pedidos & Atendimento',
      method: 'POST',
      path: '/api/pedidos',
      title: 'Criar Novo Pedido / Comanda',
      description: 'Registra novo pedido, atualiza a mesa e notifica a cozinha via WebSocket.',
      auth: 'Bearer JWT (Tenant)',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer SEU_JWT' },
      sampleBody: {
        tipo: 'mesa',
        mesa: 5,
        cliente: 'Mariana Lima',
        itens: [{ produto_id: 12, quantidade: 2, observacao: 'Sem cebola' }],
        observacoes: 'Entregar com rapidez'
      },
      sampleResponse: { sucesso: true, pedido_id: 1043, total: 64.00, status: 'recebido' }
    },
    {
      category: 'Pedidos & Atendimento',
      method: 'PUT',
      path: '/api/pedidos/:id/status',
      title: 'Avançar Status do Pedido (KDS / Operação)',
      description: 'Altera o status do pedido (recebido → preparando → pronto → entregue → cancelado).',
      auth: 'Bearer JWT (Tenant)',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer SEU_JWT' },
      sampleBody: { status: 'pronto' },
      sampleResponse: { sucesso: true, pedido_id: 1043, novo_status: 'pronto', atualizado_em: '2026-09-08T23:30:00Z' }
    },
    {
      category: 'Pedidos & Atendimento',
      method: 'GET',
      path: '/api/mesas',
      title: 'Mapa do Salão & Status das Mesas',
      description: 'Retorna todas as mesas com status (livre, ocupada, fechando), tempo de permanência e saldo parcial.',
      auth: 'Bearer JWT (Tenant)',
      headers: { 'Authorization': 'Bearer SEU_JWT' },
      sampleBody: null,
      sampleResponse: [{ numero: 1, status: 'ocupada', tempo_minutos: 45, valor_atual: 132.00 }, { numero: 2, status: 'livre', valor_atual: 0 }]
    },

    // ── CAIXA & FINANCEIRO ──
    {
      category: 'Caixa & Financeiro',
      method: 'GET',
      path: '/api/caixa/status',
      title: 'Status do Turno Atual do Caixa',
      description: 'Retorna se o caixa está aberto, operador responsável, saldo inicial e total arrecadado.',
      auth: 'Bearer JWT (Tenant)',
      headers: { 'Authorization': 'Bearer SEU_JWT' },
      sampleBody: null,
      sampleResponse: { aberto: true, turno_id: 42, operador: 'Juliana', abertura: '2026-09-08 17:00', saldo_inicial: 150.00, total_vendas: 2340.50 }
    },
    {
      category: 'Caixa & Financeiro',
      method: 'POST',
      path: '/api/caixa/movimentacao',
      title: 'Lançar Sangria ou Suprimento',
      description: 'Registra retirada segura ou aporte de dinheiro em caixa com justificativa.',
      auth: 'Bearer JWT (Tenant)',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer SEU_JWT' },
      sampleBody: { tipo: 'sangria', valor: 200.00, motivo: 'Pagamento fornecedor de hortifruti' },
      sampleResponse: { sucesso: true, saldo_restante: 1250.00, comprovante_id: 'MOV-9981' }
    },

    // ── PAGAMENTOS & PIX DINÂMICO ──
    {
      category: 'Pagamentos & PIX',
      method: 'POST',
      path: '/api/pix/gerar',
      title: 'Gerar Cobrança PIX Dinâmica Instantânea',
      description: 'Gera Payload PIX EMV Copia-e-Cola e QR Code Base64 com expiração e confirmação via socket.',
      auth: 'Bearer JWT (Tenant)',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer SEU_JWT' },
      sampleBody: { valor: 75.50, descricao: 'Comanda #1042 - Mesa 4' },
      sampleResponse: { sucesso: true, txid: 'CHEF7762A81B', copia_cola: '00020126580014br.gov.bcb.pix...', qrcode_base64: 'data:image/png;base64,...' }
    },
    {
      category: 'Pagamentos & PIX',
      method: 'GET',
      path: '/api/pix/status/:txid',
      title: 'Consultar Liquidação de Cobrança PIX',
      description: 'Verifica se o PIX foi pago e liquidado na conta do restaurante.',
      auth: 'Bearer JWT (Tenant)',
      headers: { 'Authorization': 'Bearer SEU_JWT' },
      sampleBody: null,
      sampleResponse: { txid: 'CHEF7762A81B', pago: true, pago_em: '2026-09-08T23:35:12Z', valor: 75.50 }
    },

    // ── PLUGINS & EXTENSÕES MODULARES ──
    {
      category: 'Módulos & Plugins',
      method: 'GET',
      path: '/api/modules/all',
      title: 'Listar Todos os Plugins do Servidor',
      description: 'Descobre todos os módulos instalados na pasta plugins/ com manifesto e status de ativação.',
      auth: 'Nenhuma / Suporte',
      headers: {},
      sampleBody: null,
      sampleResponse: { sucesso: true, modules: [{ id: 'balanca', name: 'Balança Comercial', category: 'hardware', tier: 2, enabled: true }] }
    },
    {
      category: 'Módulos & Plugins',
      method: 'POST',
      path: '/api/modules/toggle',
      title: 'Ativar ou Desativar Plugin no Servidor',
      description: 'Modifica o chef-modules.json para habilitar ou desabilitar o plugin sem parar a aplicação.',
      auth: 'Nenhuma / Suporte',
      headers: { 'Content-Type': 'application/json' },
      sampleBody: { moduleId: 'balanca', enabled: true },
      sampleResponse: { sucesso: true, moduleId: 'balanca', enabled: true }
    },
    {
      category: 'Módulos & Plugins',
      method: 'POST',
      path: '/api/modules/reload',
      title: 'Hot-Reload Dinâmico de Plugins',
      description: 'Rescaneia a pasta plugins/ e carrega novos módulos imediatamente sem reiniciar o processo Node.js.',
      auth: 'Nenhuma / Suporte',
      headers: {},
      sampleBody: {},
      sampleResponse: { sucesso: true, total_ativos: 23, novos_carregados: 1, mensagem: 'Plugins recarregados em tempo real com sucesso!' }
    },

    // ── EVENTOS SOCKET.IO EM TEMPO REAL ──
    {
      category: 'WebSockets & Sockets.io',
      method: 'SOCKET (EMIT)',
      path: 'novo_pedido',
      title: 'Evento: Novo Pedido Criado',
      description: 'Emitido para os canais de KDS e Caixa quando um pedido entra no sistema.',
      auth: 'Socket Conectado',
      headers: {},
      sampleBody: { pedidoId: 1045, mesa: 3, total: 95.00, itensCount: 3 },
      sampleResponse: { status: 'broadcasted_to_room' }
    },
    {
      category: 'WebSockets & Sockets.io',
      method: 'SOCKET (EMIT)',
      path: 'pix_confirmado',
      title: 'Evento: Pagamento PIX Confirmado',
      description: 'Notifica imediatamente a tela do caixa ou autoatendimento que o pagamento caiu.',
      auth: 'Socket Conectado',
      headers: {},
      sampleBody: { txid: 'CHEF7762A81B', valor: 75.50, comprovante: 'BR98810293' },
      sampleResponse: { status: 'auto_dismiss_qr' }
    },
    {
      category: 'WebSockets & Sockets.io',
      method: 'SOCKET (EMIT)',
      path: 'solicitacao_modulo_admin',
      title: 'Evento: Restaurante Solicitou Módulo Pago',
      description: 'Alerta a equipe de suporte e vendas no dashboard em tempo real sobre um novo lead quente.',
      auth: 'Socket Conectado',
      headers: {},
      sampleBody: { restaurante_id: 1, restaurante_nome: 'Pizzaria Bella', feature: 'kds_cozinha', preco: 'R$ 69,00/mês' },
      sampleResponse: { status: 'badge_updated' }
    }
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. TEMPLATES PRONTOS PARA SCAFFOLDING DE MÓDULOS
  // ═══════════════════════════════════════════════════════════════════════════
  const TEMPLATES_MAP = {
    'hardware_balanca': {
      id: 'balanca-serial-pro',
      name: 'Balança Serial & USB Pro',
      category: 'hardware',
      tier: 2,
      description: 'Driver universal de pesagem com suporte a Toledo (Prix 3), Filizola e Elgin via porta Serial RS-232 / USB.',
      targets: ['caixa_v11', 'pdv_classico'],
      files: {
        'module.json': (cfg) => JSON.stringify({
          id: cfg.id,
          name: cfg.name,
          version: '1.0.0',
          author: 'Chef Suporte Dev Team',
          description: cfg.description,
          category: cfg.category,
          icon: 'ph-scales',
          enabled: true,
          tier: cfg.tier,
          targets: cfg.targets,
          hooks: { server: 'index.js', client: 'client.js', widget: 'widget.js', style: 'style.css' }
        }, null, 2),
        'index.js': (cfg) => `/**
 * Backend do Módulo: ${cfg.name} (${cfg.id})
 */
module.exports = function ({ app, db, masterDb, io, log }) {
  log('⚡ [${cfg.id}] Backend do driver de balança inicializado.');

  // Endpoint para leitura simulada ou porta serial nativa
  app.get('/api/modulo/${cfg.id}/ler-peso', (req, res) => {
    // Retorna peso estável em kg
    const pesoSimulado = (Math.random() * (1.200 - 0.250) + 0.250).toFixed(3);
    res.json({
      sucesso: true,
      modulo: '${cfg.id}',
      pesoKg: parseFloat(pesoSimulado),
      estavel: true,
      unidade: 'kg',
      timestamp: Date.now()
    });
  });

  // Listener para acionamento remoto via socket
  io.on('connection', (socket) => {
    socket.on('${cfg.id}:solicitar_tara', (data) => {
      socket.emit('${cfg.id}:tara_confirmada', { status: 'zerado', valor: 0.000 });
    });
  });
};
`,
        'widget.js': (cfg) => `/**
 * Widget do Módulo: ${cfg.name}
 * Renderiza no painel do Caixa v1.1
 */
(function () {
  if (!window.ChefModules) window.ChefModules = { register: function(m) { (window._chefModQueue = window._chefModQueue || []).push(m); } };

  window.ChefModules.register({
    id: '${cfg.id}',
    name: '${cfg.name}',
    category: '${cfg.category}',
    icon: 'ph-scales',
    defaultSize: 'sz-m',
    render: function (container) {
      container.innerHTML = \`
        <div class="mod-balanca-card">
          <div class="mod-balanca-header">
            <span><i class="ph ph-scales"></i> Balança Serial</span>
            <span class="mod-status-dot online"></span>
          </div>
          <div class="mod-balanca-display">
            <span class="mod-peso-val" id="val-peso-${cfg.id}">0.000</span>
            <span class="mod-peso-unit">KG</span>
          </div>
          <div class="mod-balanca-actions">
            <button class="btn-mod-action" onclick="window._lerPeso('${cfg.id}')"><i class="ph ph-arrows-clockwise"></i> Capturar</button>
            <button class="btn-mod-action outline" onclick="window._zerarTara('${cfg.id}')"><i class="ph ph-arrow-counter-clockwise"></i> Tara</button>
          </div>
        </div>
      \`;
    }
  });

  window._lerPeso = async function(id) {
    try {
      const res = await fetch('/api/modulo/' + id + '/ler-peso');
      const data = await res.json();
      if (data.sucesso) {
        document.getElementById('val-peso-' + id).textContent = data.pesoKg.toFixed(3);
      }
    } catch(e) { console.error('Erro ao ler peso:', e); }
  };

  window._zerarTara = function(id) {
    document.getElementById('val-peso-' + id).textContent = '0.000';
  };
})();
`,
        'style.css': () => `.mod-balanca-card {
  background: #161a2b;
  border: 1px solid #2a2d3e;
  border-radius: 12px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.mod-balanca-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
  font-weight: 700;
  color: #38bdf8;
}
.mod-status-dot.online {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 8px #22c55e;
}
.mod-balanca-display {
  background: #090d16;
  border: 1.5px solid #0284c7;
  border-radius: 8px;
  padding: 12px;
  text-align: right;
}
.mod-peso-val {
  font-family: 'Courier New', monospace;
  font-size: 2.2rem;
  font-weight: 800;
  color: #38bdf8;
}
.mod-peso-unit {
  font-size: 0.9rem;
  color: #94a3b8;
  margin-left: 6px;
}
.mod-balanca-actions {
  display: flex;
  gap: 8px;
}
.btn-mod-action {
  flex: 1;
  padding: 8px;
  border-radius: 8px;
  background: #0284c7;
  color: #fff;
  border: none;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.btn-mod-action.outline {
  background: transparent;
  border: 1px solid #334155;
  color: #94a3b8;
}
`
      }
    },

    'checkout_pix': {
      id: 'pix-checkout-express',
      name: 'PIX Checkout Express & Webhook',
      category: 'financeiro',
      tier: 1,
      description: 'Gera cobranças PIX dinâmicas com verificação automática e baixa instantânea de comanda no Caixa.',
      targets: ['caixa_v11', 'pdv_classico'],
      files: {
        'module.json': (cfg) => JSON.stringify({
          id: cfg.id,
          name: cfg.name,
          version: '1.0.0',
          author: 'Chef Suporte Dev Team',
          description: cfg.description,
          category: cfg.category,
          icon: 'ph-qr-code',
          enabled: true,
          tier: cfg.tier,
          targets: cfg.targets,
          hooks: { server: 'index.js', client: 'client.js', widget: 'widget.js', style: 'style.css' }
        }, null, 2),
        'index.js': (cfg) => `/**
 * Backend do Módulo: ${cfg.name} (${cfg.id})
 */
module.exports = function ({ app, db, masterDb, io, log }) {
  log('⚡ [${cfg.id}] Gateway PIX Express inicializado.');

  app.post('/api/modulo/${cfg.id}/gerar-cobranca', (req, res) => {
    const { valor, pedidoId } = req.body;
    const txid = 'PIX' + Date.now().toString(36).toUpperCase();
    res.json({
      sucesso: true,
      txid,
      valor: parseFloat(valor) || 10.00,
      pedidoId,
      copiaCola: '00020126580014br.gov.bcb.pix0136' + txid,
      expiraEmSegundos: 300
    });
  });

  app.post('/api/modulo/${cfg.id}/webhook-simulado', (req, res) => {
    const { txid } = req.body;
    if (io) {
      io.emit('pix_express_confirmado', { txid, confirmado: true, timestamp: Date.now() });
    }
    res.json({ sucesso: true, mensagem: 'Webhook recebido com sucesso.' });
  });
};
`,
        'widget.js': (cfg) => `/**
 * Widget do Módulo: ${cfg.name}
 */
(function () {
  if (!window.ChefModules) window.ChefModules = { register: function(m) { (window._chefModQueue = window._chefModQueue || []).push(m); } };

  window.ChefModules.register({
    id: '${cfg.id}',
    name: '${cfg.name}',
    category: '${cfg.category}',
    icon: 'ph-qr-code',
    defaultSize: 'sz-m',
    render: function (container) {
      container.innerHTML = \`
        <div style="background:#161a2b;border:1px solid #2a2d3e;border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <strong style="color:#22c55e;"><i class="ph ph-qr-code"></i> PIX Express</strong>
            <span style="font-size:0.75rem;background:rgba(34,197,94,0.15);color:#22c55e;padding:2px 8px;border-radius:12px;font-weight:700;">Ativo</span>
          </div>
          <p style="font-size:0.8rem;color:#94a3b8;margin:0;">Cobranças instantâneas com conciliação automática por WebSocket.</p>
          <button class="btn btn-sm" style="background:#22c55e;color:#fff;font-weight:700;" onclick="alert('Módulo pronto para receber pagamentos!')">
            <i class="ph ph-lightning"></i> Testar Conexão PIX
          </button>
        </div>
      \`;
    }
  });
})();
`,
        'style.css': () => `/* CSS Customizado para PIX Checkout Express */`
      }
    },

    'whatsapp_bot': {
      id: 'whatsapp-notificacoes',
      name: 'WhatsApp Notificações & Pedidos',
      category: 'delivery',
      tier: 1,
      description: 'Disparo de status do pedido para o WhatsApp do cliente via Baileys / Evolution API com links de rastreamento.',
      targets: ['caixa_v11', 'kds', 'delivery'],
      files: {
        'module.json': (cfg) => JSON.stringify({
          id: cfg.id,
          name: cfg.name,
          version: '1.0.0',
          author: 'Chef Suporte Dev Team',
          description: cfg.description,
          category: cfg.category,
          icon: 'ph-whatsapp-logo',
          enabled: true,
          tier: cfg.tier,
          targets: cfg.targets,
          hooks: { server: 'index.js', client: 'client.js', widget: 'widget.js', style: 'style.css' }
        }, null, 2),
        'index.js': (cfg) => `/**
 * Backend do Módulo: ${cfg.name} (${cfg.id})
 */
module.exports = function ({ app, db, masterDb, io, log }) {
  log('⚡ [${cfg.id}] Módulo WhatsApp Notificações inicializado.');

  app.post('/api/modulo/${cfg.id}/enviar-notificacao', (req, res) => {
    const { telefone, mensagem, pedidoId } = req.body;
    log('Enviando WhatsApp para ' + telefone + ': ' + mensagem);
    res.json({
      sucesso: true,
      destinatario: telefone,
      pedidoId,
      statusEnvio: 'entregue',
      timestamp: Date.now()
    });
  });
};
`,
        'widget.js': (cfg) => `/**
 * Widget do Módulo: ${cfg.name}
 */
(function () {
  if (!window.ChefModules) window.ChefModules = { register: function(m) { (window._chefModQueue = window._chefModQueue || []).push(m); } };

  window.ChefModules.register({
    id: '${cfg.id}',
    name: '${cfg.name}',
    category: '${cfg.category}',
    icon: 'ph-whatsapp-logo',
    defaultSize: 'sz-s',
    render: function (container) {
      container.innerHTML = \`
        <div style="background:#161a2b;border:1px solid #2a2d3e;border-radius:12px;padding:12px;display:flex;align-items:center;gap:12px;">
          <i class="ph ph-whatsapp-logo" style="font-size:2rem;color:#22c55e;"></i>
          <div>
            <strong style="color:#fff;font-size:0.85rem;display:block;">WhatsApp Bot</strong>
            <small style="color:#94a3b8;">Disparo automático de comprovantes</small>
          </div>
        </div>
      \`;
    }
  });
})();
`,
        'style.css': () => `/* CSS Customizado para WhatsApp Bot */`
      }
    },

    'kds_touch': {
      id: 'kds-cozinha-touch',
      name: 'KDS Cozinha Touch Interativo',
      category: 'operacao',
      tier: 1,
      description: 'Painel visual de produção para cozinha com som de novo pedido, cronômetro de preparo e separação por setores (Chapa, Fritura, Bar).',
      targets: ['kds', 'caixa_v11'],
      files: {
        'module.json': (cfg) => JSON.stringify({
          id: cfg.id,
          name: cfg.name,
          version: '1.0.0',
          author: 'Chef Suporte Dev Team',
          description: cfg.description,
          category: cfg.category,
          icon: 'ph-cooking-pot',
          enabled: true,
          tier: cfg.tier,
          targets: cfg.targets,
          hooks: { server: 'index.js', client: 'client.js', widget: 'widget.js', style: 'style.css' }
        }, null, 2),
        'index.js': (cfg) => `/**
 * Backend do Módulo: ${cfg.name} (${cfg.id})
 */
module.exports = function ({ app, db, masterDb, io, log }) {
  log('⚡ [${cfg.id}] KDS Cozinha Touch inicializado.');

  app.get('/api/modulo/${cfg.id}/pedidos-producao', (req, res) => {
    res.json({
      sucesso: true,
      pedidos: [
        { id: 101, mesa: 4, itens: ['1x Burguer Costela', '1x Fritas Rústica'], minutos: 8, status: 'preparando' },
        { id: 102, mesa: 7, itens: ['2x Chopp Artesanal 500ml'], minutos: 2, status: 'recebido' }
      ]
    });
  });
};
`,
        'widget.js': (cfg) => `/**
 * Widget do Módulo: ${cfg.name}
 */
(function () {
  if (!window.ChefModules) window.ChefModules = { register: function(m) { (window._chefModQueue = window._chefModQueue || []).push(m); } };

  window.ChefModules.register({
    id: '${cfg.id}',
    name: '${cfg.name}',
    category: '${cfg.category}',
    icon: 'ph-cooking-pot',
    defaultSize: 'sz-l',
    render: function (container) {
      container.innerHTML = \`
        <div style="background:#161a2b;border:1px solid #2a2d3e;border-radius:12px;padding:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <strong style="color:#fc4b15;"><i class="ph ph-cooking-pot"></i> KDS Produção Ativa</strong>
            <span style="font-size:0.75rem;color:#94a3b8;">Fila: 2 pedidos</span>
          </div>
          <div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;">
            <div style="background:#0f172a;border:1px solid #fc4b15;border-radius:8px;padding:8px 12px;min-width:140px;">
              <span style="font-size:0.75rem;color:#f97316;font-weight:700;">Mesa #4 (8 min)</span>
              <p style="font-size:0.75rem;margin:4px 0;color:#fff;">1x Burguer Costela</p>
            </div>
            <div style="background:#0f172a;border:1px solid #38bdf8;border-radius:8px;padding:8px 12px;min-width:140px;">
              <span style="font-size:0.75rem;color:#38bdf8;font-weight:700;">Mesa #7 (2 min)</span>
              <p style="font-size:0.75rem;margin:4px 0;color:#fff;">2x Chopp Artesanal</p>
            </div>
          </div>
        </div>
      \`;
    }
  });
})();
`,
        'style.css': () => `/* CSS Customizado para KDS Cozinha Touch */`
      }
    },

    'bi_analytics': {
      id: 'bi-lucratividade-dre',
      name: 'BI Lucratividade & DRE em Tempo Real',
      category: 'marketing',
      tier: 2,
      description: 'Painel executivo com CMV real por prato, ticket médio por garçom, curva ABC de vendas e projeção de margem de lucro.',
      targets: ['painel_dono', 'configuracoes'],
      files: {
        'module.json': (cfg) => JSON.stringify({
          id: cfg.id,
          name: cfg.name,
          version: '1.0.0',
          author: 'Chef Suporte Dev Team',
          description: cfg.description,
          category: cfg.category,
          icon: 'ph-chart-line-up',
          enabled: true,
          tier: cfg.tier,
          targets: cfg.targets,
          hooks: { server: 'index.js', client: 'client.js', widget: 'widget.js', style: 'style.css' }
        }, null, 2),
        'index.js': (cfg) => `/**
 * Backend do Módulo: ${cfg.name} (${cfg.id})
 */
module.exports = function ({ app, db, masterDb, io, log }) {
  log('⚡ [${cfg.id}] Motor de BI & DRE inicializado.');

  app.get('/api/modulo/${cfg.id}/indicadores', (req, res) => {
    res.json({
      sucesso: true,
      faturamentoHoje: 4580.00,
      cmvMedioPercent: 28.4,
      lucroEstimado: 1960.00,
      ticketMedio: 74.20,
      pratoMaisLucrativo: 'Filé Mignon ao Molho Madeira (Margem 64%)'
    });
  });
};
`,
        'widget.js': (cfg) => `/**
 * Widget do Módulo: ${cfg.name}
 */
(function () {
  if (!window.ChefModules) window.ChefModules = { register: function(m) { (window._chefModQueue = window._chefModQueue || []).push(m); } };

  window.ChefModules.register({
    id: '${cfg.id}',
    name: '${cfg.name}',
    category: '${cfg.category}',
    icon: 'ph-chart-line-up',
    defaultSize: 'sz-m',
    render: function (container) {
      container.innerHTML = \`
        <div style="background:#161a2b;border:1px solid #2a2d3e;border-radius:12px;padding:14px;">
          <strong style="color:#a855f7;font-size:0.85rem;"><i class="ph ph-chart-line-up"></i> BI & DRE Financeiro</strong>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;">
            <div style="background:#0f172a;padding:8px;border-radius:8px;">
              <small style="color:#94a3b8;font-size:0.7rem;">CMV Médio</small>
              <div style="color:#22c55e;font-size:1.1rem;font-weight:700;">28.4%</div>
            </div>
            <div style="background:#0f172a;padding:8px;border-radius:8px;">
              <small style="color:#94a3b8;font-size:0.7rem;">Ticket Médio</small>
              <div style="color:#38bdf8;font-size:1.1rem;font-weight:700;">R$ 74,20</div>
            </div>
          </div>
        </div>
      \`;
    }
  });
})();
`,
        'style.css': () => `/* CSS Customizado para BI Analytics */`
      }
    },

    'widget_caixa': {
      id: 'custom-widget-caixa',
      name: 'Widget Customizado de Caixa v1.1',
      category: 'operacao',
      tier: 3,
      description: 'Card flexível para atalhos operacionais rápidos, chamadas de garçom ou ações personalizadas na tela principal do Caixa.',
      targets: ['caixa_v11'],
      files: {
        'module.json': (cfg) => JSON.stringify({
          id: cfg.id,
          name: cfg.name,
          version: '1.0.0',
          author: 'Chef Suporte Dev Team',
          description: cfg.description,
          category: cfg.category,
          icon: 'ph-squares-four',
          enabled: true,
          tier: cfg.tier,
          targets: cfg.targets,
          hooks: { server: 'index.js', client: 'client.js', widget: 'widget.js', style: 'style.css' }
        }, null, 2),
        'index.js': (cfg) => `/**
 * Backend do Módulo: ${cfg.name} (${cfg.id})
 */
module.exports = function ({ app, db, masterDb, io, log }) {
  log('⚡ [${cfg.id}] Widget Customizado de Caixa carregado.');

  app.get('/api/modulo/${cfg.id}/status', (req, res) => {
    res.json({ modulo: '${cfg.id}', status: 'online' });
  });
};
`,
        'widget.js': (cfg) => `/**
 * Widget do Módulo: ${cfg.name}
 */
(function () {
  if (!window.ChefModules) window.ChefModules = { register: function(m) { (window._chefModQueue = window._chefModQueue || []).push(m); } };

  window.ChefModules.register({
    id: '${cfg.id}',
    name: '${cfg.name}',
    category: '${cfg.category}',
    icon: 'ph-squares-four',
    defaultSize: 'sz-s',
    render: function (container) {
      container.innerHTML = \`
        <div style="background:#161a2b;border:1px solid #2a2d3e;border-radius:12px;padding:12px;text-align:center;">
          <i class="ph ph-squares-four" style="font-size:1.8rem;color:#38bdf8;margin-bottom:6px;"></i>
          <h4 style="font-size:0.85rem;color:#fff;margin:0 0 6px 0;">${cfg.name}</h4>
          <button class="btn btn-sm btn-primary" onclick="alert('Ação customizada executada!')" style="width:100%;font-size:0.75rem;">
            Executar Ação
          </button>
        </div>
      \`;
    }
  });
})();
`,
        'style.css': () => `/* CSS Customizado para Widget de Caixa */`
      }
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ROTAS DO HUB DE DESENVOLVIMENTO & SUPORTE
  // ═══════════════════════════════════════════════════════════════════════════

  // [GET] /api/dev/catalog — Catálogo Completo de APIs do Sistema
  app.get('/api/dev/catalog', (req, res) => {
    try {
      const { category, search } = req.query;
      let items = API_CATALOG;

      if (category && category !== 'todos') {
        items = items.filter(i => i.category.toLowerCase() === category.toLowerCase());
      }
      if (search) {
        const q = String(search).toLowerCase();
        items = items.filter(i => 
          i.title.toLowerCase().includes(q) || 
          i.path.toLowerCase().includes(q) || 
          i.description.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q)
        );
      }

      const categories = Array.from(new Set(API_CATALOG.map(i => i.category)));

      res.json({
        sucesso: true,
        total: items.length,
        categories,
        endpoints: items
      });
    } catch (err) {
      res.status(500).json({ sucesso: false, error: err.message });
    }
  });

  // [POST] /api/dev/execute-test — Sandbox / Playground de Execução de APIs
  app.post('/api/dev/execute-test', async (req, res) => {
    const startTime = Date.now();
    try {
      const { method = 'GET', url, headers = {}, body = null, tenantId } = req.body;

      if (!url) {
        return res.status(400).json({ sucesso: false, error: 'URL do endpoint é obrigatória.' });
      }

      // Preparar headers com suporte automático a autenticação e tenant se indicado
      const requestHeaders = { ...headers };
      if (!requestHeaders['Content-Type'] && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        requestHeaders['Content-Type'] = 'application/json';
      }
      if (tenantId && !requestHeaders['x-tenant-id']) {
        requestHeaders['x-tenant-id'] = String(tenantId);
      }

      // Constrói URL completa usando porta dinâmica da requisição atual
      let hostHeader = req.headers.host || '';
      let defaultPort = 8080;
      if (hostHeader.includes(':')) {
        defaultPort = parseInt(hostHeader.split(':')[1], 10) || 8080;
      } else if (req.socket && req.socket.localPort) {
        defaultPort = req.socket.localPort;
      } else if (process.env.PORT) {
        defaultPort = parseInt(process.env.PORT, 10);
      }

      let targetUrl = url;
      if (url.startsWith('/')) {
        targetUrl = `http://localhost:${defaultPort}${url}`;
      }

      const parsed = new URL(targetUrl);
      const isHttps = parsed.protocol === 'https:';
      const client = isHttps ? https : http;

      const bodyData = (body && typeof body === 'object') ? JSON.stringify(body) : (body || null);
      if (bodyData && !requestHeaders['Content-Length']) {
        requestHeaders['Content-Length'] = Buffer.byteLength(bodyData);
      }

      const options = {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: method.toUpperCase(),
        headers: requestHeaders,
        timeout: 10000
      };

      const requestPromise = new Promise((resolve, reject) => {
        const testReq = client.request(options, (testRes) => {
          let chunks = [];
          testRes.on('data', chunk => chunks.push(chunk));
          testRes.on('end', () => {
            const buffer = Buffer.concat(chunks);
            const timeMs = Date.now() - startTime;
            const resText = buffer.toString('utf8');
            let parsedBody = resText;
            try {
              parsedBody = JSON.parse(resText);
            } catch (e) {
              // Mantém texto bruto se não for JSON
            }

            resolve({
              statusCode: testRes.statusCode,
              statusText: testRes.statusMessage,
              headers: testRes.headers,
              timeMs,
              sizeBytes: buffer.length,
              data: parsedBody
            });
          });
        });

        testReq.on('error', err => reject(err));
        testReq.on('timeout', () => {
          testReq.destroy();
          reject(new Error('Timeout de requisição após 10 segundos'));
        });

        if (bodyData) {
          testReq.write(bodyData);
        }
        testReq.end();
      });

      const response = await requestPromise;
      res.json({
        sucesso: true,
        method: options.method,
        url: targetUrl,
        ...response
      });
    } catch (err) {
      res.json({
        sucesso: false,
        timeMs: Date.now() - startTime,
        error: err.message,
        statusCode: 500,
        statusText: 'Internal Execution Error'
      });
    }
  });

  // [GET] /api/dev/templates — Lista os Presets Prontos de Plugins
  app.get('/api/dev/templates', (req, res) => {
    try {
      const list = Object.keys(TEMPLATES_MAP).map(key => ({
        templateKey: key,
        id: TEMPLATES_MAP[key].id,
        name: TEMPLATES_MAP[key].name,
        category: TEMPLATES_MAP[key].category,
        tier: TEMPLATES_MAP[key].tier,
        description: TEMPLATES_MAP[key].description,
        targets: TEMPLATES_MAP[key].targets,
        filesAvailable: Object.keys(TEMPLATES_MAP[key].files)
      }));
      res.json({ sucesso: true, templates: list });
    } catch (err) {
      res.status(500).json({ sucesso: false, error: err.message });
    }
  });

  // [POST] /api/dev/scaffold — Gerador Instantâneo de Código & Arquivos de Plugin
  app.post('/api/dev/scaffold', (req, res) => {
    try {
      const { templateKey, id, name, category, tier, description, targets, customCode } = req.body;

      if (!id || !name) {
        return res.status(400).json({ sucesso: false, error: 'ID e Nome do módulo são obrigatórios.' });
      }

      const rawId = String(id).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const targetDir = path.join(PLUGINS_DIR, rawId);

      if (fs.existsSync(targetDir)) {
        return res.status(400).json({ sucesso: false, error: `Módulo "${rawId}" já existe no diretório plugins/. Escolha outro ID.` });
      }

      fs.mkdirSync(targetDir, { recursive: true });

      const template = TEMPLATES_MAP[templateKey] || TEMPLATES_MAP['widget_caixa'];
      const moduleConfig = {
        id: rawId,
        name: name || template.name,
        category: category || template.category,
        tier: Number.isFinite(parseInt(tier, 10)) ? parseInt(tier, 10) : template.tier,
        description: description || template.description,
        targets: Array.isArray(targets) && targets.length > 0 ? targets : template.targets
      };

      const filesCreated = [];

      // Gera cada arquivo a partir do template
      for (const [filename, generator] of Object.entries(template.files)) {
        const filePath = path.join(targetDir, filename);
        let content = generator(moduleConfig);

        // Se customCode foi enviado e é o widget.js, permite override
        if (filename === 'widget.js' && customCode && customCode.trim()) {
          content = customCode;
        }

        fs.writeFileSync(filePath, content, 'utf8');
        filesCreated.push(filename);
      }

      // Registra ativação no chef-modules.json
      const cfg = loadModulesConfig();
      cfg.enabledModules[rawId] = true;
      saveModulesConfig(cfg);

      if (io) {
        io.emit('novo_modulo_scaffolded', { id: rawId, name: moduleConfig.name, category: moduleConfig.category });
      }

      console.log(`🚀 [dev-hub] Módulo scaffolded com sucesso: plugins/${rawId} (${filesCreated.join(', ')})`);

      res.json({
        sucesso: true,
        id: rawId,
        name: moduleConfig.name,
        path: `plugins/${rawId}`,
        filesCreated,
        mensagem: `Módulo [${moduleConfig.name}] criado e ativado com sucesso! Pronto para hot-reload.`
      });
    } catch (err) {
      res.status(500).json({ sucesso: false, error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. COMPATIBILIDADE INTEGRAL COM A CENTRAL DE MÓDULOS DE SUPORTE
  //    (/api/suporte/modulos/*)
  // ═══════════════════════════════════════════════════════════════════════════

  // [GET] /api/suporte/modulos/listar
  app.get('/api/suporte/modulos/listar', (req, res) => {
    try {
      if (!fs.existsSync(PLUGINS_DIR)) {
        fs.mkdirSync(PLUGINS_DIR, { recursive: true });
      }

      const cfg = loadModulesConfig();
      const entries = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true });
      const pluginDirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'));

      const modulos = [];

      for (const dir of pluginDirs) {
        const modId = dir.name;
        const dirPath = path.join(PLUGINS_DIR, modId);
        const manifestFile = path.join(dirPath, 'module.json');

        let manifest = {
          id: modId,
          name: modId.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          description: 'Módulo da pasta plugins/' + modId,
          category: 'geral',
          icon: 'ph-puzzle-piece',
          defaultSize: 'sz-m',
          tier: 3
        };

        if (fs.existsSync(manifestFile)) {
          try {
            const data = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
            manifest = { ...manifest, ...data };
          } catch (e) {
            console.warn(`[dev-hub] Aviso ao ler module.json de ${modId}:`, e.message);
          }
        }

        const temWidget = fs.existsSync(path.join(dirPath, 'widget.js'));
        const temServer = fs.existsSync(path.join(dirPath, 'index.js'));
        const temStyle = fs.existsSync(path.join(dirPath, 'style.css'));
        const temClient = fs.existsSync(path.join(dirPath, 'client.js'));

        // Se estiver explicitamente false no chef-modules.json, é inativo
        const isEnabled = cfg.enabledModules[modId] !== false;

        modulos.push({
          ...manifest,
          enabled: isEnabled,
          temWidget,
          temServer,
          temStyle,
          temClient,
          dirName: modId
        });
      }

      res.json({ sucesso: true, modulos });
    } catch (err) {
      res.status(500).json({ sucesso: false, erro: err.message });
    }
  });

  // [POST] /api/suporte/modulos/toggle
  app.post('/api/suporte/modulos/toggle', (req, res) => {
    try {
      const { id, enabled } = req.body;
      if (!id) return res.status(400).json({ sucesso: false, erro: 'ID do módulo é obrigatório.' });

      const cfg = loadModulesConfig();
      cfg.enabledModules[id] = !!enabled;
      saveModulesConfig(cfg);

      if (io) {
        io.emit('modulo_status_alterado', { id, enabled: !!enabled });
      }

      res.json({ sucesso: true, id, enabled: !!enabled });
    } catch (err) {
      res.status(500).json({ sucesso: false, erro: err.message });
    }
  });

  // [POST] /api/suporte/modulos/salvar
  app.post('/api/suporte/modulos/salvar', (req, res) => {
    try {
      const { id, name, icon, category, defaultSize, description, widgetCode } = req.body;
      if (!id || !name) {
        return res.status(400).json({ sucesso: false, erro: 'ID e Nome são obrigatórios.' });
      }

      const rawId = String(id).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const targetDir = path.join(PLUGINS_DIR, rawId);

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const manifest = {
        id: rawId,
        name: name,
        version: '1.0.0',
        author: 'Chef Suporte Dev Team',
        description: description || `Módulo plug-and-play de ${name}.`,
        category: category || 'geral',
        icon: icon || 'ph-puzzle-piece',
        defaultSize: defaultSize || 'sz-m',
        enabled: true,
        tier: 2,
        targets: ['caixa_v11', 'pdv_classico'],
        hooks: {
          server: 'index.js',
          client: 'client.js',
          widget: 'widget.js',
          style: 'style.css'
        }
      };

      fs.writeFileSync(path.join(targetDir, 'module.json'), JSON.stringify(manifest, null, 2), 'utf8');

      // Backend index.js
      if (!fs.existsSync(path.join(targetDir, 'index.js'))) {
        fs.writeFileSync(path.join(targetDir, 'index.js'), `module.exports = function ({ app, db, io, log }) {
  log('Módulo ${name} inicializado com sucesso.');
  app.get('/api/modulo/${rawId}/status', (req, res) => {
    res.json({ modulo: '${rawId}', nome: '${name}', status: 'online' });
  });
};
`, 'utf8');
      }

      // Widget widget.js
      const widgetContent = widgetCode || `(function () {
  if (!window.ChefModules) window.ChefModules = { register: function(m) { (window._chefModQueue = window._chefModQueue || []).push(m); } };

  window.ChefModules.register({
    id: '${rawId}',
    name: '${name}',
    category: '${category || 'geral'}',
    icon: '${icon || 'ph-puzzle-piece'}',
    defaultSize: '${defaultSize || 'sz-m'}',
    render: function (container) {
      container.innerHTML = '<div style="padding:14px;background:#161a2b;border:1px solid #2a2d3e;border-radius:10px;"><strong style="color:#fc4b15;">${name}</strong><p style="font-size:0.8rem;color:#94a3b8;margin:6px 0 0 0;">${description || 'Módulo ativo e operacional.'}</p></div>';
    }
  });
})();
`;
      fs.writeFileSync(path.join(targetDir, 'widget.js'), widgetContent, 'utf8');

      // Style style.css
      if (!fs.existsSync(path.join(targetDir, 'style.css'))) {
        fs.writeFileSync(path.join(targetDir, 'style.css'), `/* Estilo do módulo ${name} */\n`, 'utf8');
      }

      // Salva no chef-modules.json
      const cfg = loadModulesConfig();
      cfg.enabledModules[rawId] = true;
      saveModulesConfig(cfg);

      if (io) {
        io.emit('novos_modulos_carregados', { count: 1 });
      }

      res.json({ sucesso: true, id: rawId, manifest });
    } catch (err) {
      res.status(500).json({ sucesso: false, erro: err.message });
    }
  });

  console.log('🛠️ [dev-hub] Central de Desenvolvimento & Hub de APIs carregada com sucesso.');
};
