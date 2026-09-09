/**
 * feature-plans.js
 * Definição dos planos e features habilitáveis por tenant.
 * Usado pelo servidor (server.js) e pelo painel Super Admin.
 * Objetivo: permitir ligar/desligar funções por tenant ou por plano,
 * economizando recursos de servidor (sockets, pollers, consultas pesadas).
 */
'use strict';

// Features disponíveis para controle e add-ons contratáveis
const FEATURES = [
  { chave: 'tempo_real', nome: 'Tempo real (sockets)', desc: 'Dashboards, cozinha e fila atualizados em tempo real. Desligar reduz drasticamente o uso de sockets e broadcasts.', categoria: 'Operação' },
  { chave: 'ifood', nome: 'Integração iFood', desc: 'Poller de pedidos do iFood (consulta a cada 30s por tenant autorizado).', categoria: 'Delivery' },
  { chave: 'cardapio', nome: 'Cardápio QR', desc: 'Cardápio digital acessado por QR no balcão e mesas.', categoria: 'Vendas' },
  { chave: 'bi', nome: 'BI / Financeiro', desc: 'Relatórios financeiros, fluxo de caixa e DRE gerencial.', categoria: 'Financeiro' },
  { chave: 'delivery', nome: 'Delivery / Entregas', desc: 'Gestão de entregas, despacho e motoboys.', categoria: 'Delivery' },
  { chave: 'fidelidade', nome: 'Clube Fidelidade & Cashback', desc: 'Programa de pontos, cashback no pagamento e cupons de recompra.', categoria: 'Vendas', preco: 'R$ 59/mês', roi: '+30% de retenção de clientes' },
  { chave: 'nfce', nome: 'NFC-e (Nota Fiscal)', desc: 'Emissão de notas fiscais eletrônicas e contingência offline.', categoria: 'Fiscal' },
  { chave: 'telemetria', nome: 'Telemetria / Hub', desc: 'Envio de telemetria e sincronização com o hub central.', categoria: 'Infraestrutura' },
  { chave: 'totem', nome: 'Totem de Autoatendimento Kiosk', desc: 'Quiosque de autoatendimento com bloqueio kiosk, pedidos e Pix na tela.', categoria: 'Hardware', preco: 'R$ 99/mês', roi: 'Reduz filas e custos com atendentes' },
  { chave: 'jogos', nome: 'Jogos / Batalha de Mesas', desc: 'Jogos interativos na mesa e premiação para engajamento de clientes.', categoria: 'Entretenimento', preco: 'R$ 39/mês', roi: 'Aumenta consumo de bebidas no salão' },
  { chave: 'hub_delivery', nome: 'Hub Delivery Central', desc: 'Central agregadora de pedidos de marketplaces (iFood, Rappi, WhatsApp) e frota própria.', categoria: 'Delivery', preco: 'R$ 79/mês', roi: 'Unifica todos os canais de entrega' },
  { chave: 'reservas', nome: 'Reservas Futuras de Mesas', desc: 'Reservas antecipadas com calendário, lotação e confirmação automática.', categoria: 'Operação', preco: 'R$ 49/mês', roi: 'Otimiza taxa de ocupação do salão' },
  { chave: 'fila_espera', nome: 'Fila de Espera Digital', desc: 'Fila de clientes por mesas com notificação automática e estimativa de tempo.', categoria: 'Operação', preco: 'R$ 39/mês', roi: 'Evita desistências na entrada' },
  { chave: 'pesagem_selfservice', nome: 'Pesagem Automática & Self-Service', desc: 'Integração com balança Toledo/Filizola/Urano, tara automática e totem de pesagem.', categoria: 'Hardware', preco: 'R$ 69/mês', roi: 'Elimina erros de pesagem em até 100%' },
  { chave: 'whatsapp_bot', nome: 'WhatsApp Bot Notificador', desc: 'Disparos automáticos de status de entrega, link do motoboy e cupom pós-venda.', categoria: 'Marketing', preco: 'R$ 79/mês', roi: '-80% de chamados de suporte' },
  { chave: 'rh', nome: 'RH, Escalas & Comissões', desc: 'Controle de turnos, folgas, ponto e cálculo de 10% e comissões da equipe.', categoria: 'Gestão', preco: 'R$ 49/mês', roi: 'Fechamento de folha automático' },
  { chave: 'cheff_ai', nome: 'Copiloto Cheff IA & Previsão', desc: 'Previsão de movimento, sugestão de compras e análise preditiva anti-desperdício.', categoria: 'Inteligência', preco: 'R$ 89/mês', roi: 'Reduz desperdício em até 25%' },
  { chave: 'estoque_avancado', nome: 'Estoque com Ficha Técnica', desc: 'Baixa automática de ingredientes por receita vendida e cálculo de CMV analítico.', categoria: 'Financeiro', preco: 'R$ 69/mês', roi: 'Controle cirúrgico de custos' },
  { chave: 'kds_avancado', nome: 'KDS Multi-Praças Cozinha & Bar', desc: 'Monitor de produção com divisão de setores, tempos de preparo e alertas sonoros.', categoria: 'Operação', preco: 'R$ 59/mês', roi: 'Fim dos atrasos e pedidos perdidos' }
];

// Features padrão por plano
const FEATURE_PLANS = {
  trial: {
    tempo_real: false,
    ifood: false,
    cardapio: true,
    bi: false,
    delivery: false,
    fidelidade: false,
    nfce: false,
    telemetria: false,
    totem: false,
    jogos: false,
    hub_delivery: false,
    reservas: false,
    fila_espera: false,
    pesagem_selfservice: false,
    whatsapp_bot: false,
    rh: false,
    cheff_ai: false,
    estoque_avancado: false,
    kds_avancado: false
  },
  pro: {
    tempo_real: true,
    ifood: true,
    cardapio: true,
    bi: true,
    delivery: true,
    fidelidade: false,
    nfce: true,
    telemetria: true,
    totem: false,
    jogos: true,
    hub_delivery: true,
    reservas: true,
    fila_espera: true,
    pesagem_selfservice: false,
    whatsapp_bot: false,
    rh: true,
    cheff_ai: false,
    estoque_avancado: false,
    kds_avancado: true
  },
  premium: {
    tempo_real: true,
    ifood: true,
    cardapio: true,
    bi: true,
    delivery: true,
    fidelidade: true,
    nfce: true,
    telemetria: true,
    totem: false,
    jogos: true,
    hub_delivery: true,
    reservas: true,
    fila_espera: true,
    pesagem_selfservice: true,
    whatsapp_bot: true,
    rh: true,
    cheff_ai: true,
    estoque_avancado: true,
    kds_avancado: true
  }
};

// Mapeia o valor da coluna restaurantes.licenca para a chave de plano
function planoParaChave(licenca) {
  const l = String(licenca || '').toLowerCase();
  if (l === 'trial') return 'trial';
  if (l === 'pro') return 'pro';
  // plus, premium, ativo (e qualquer outro) caem no plano mais completo
  return 'premium';
}

function getPlanDefaults(licenca) {
  const chave = planoParaChave(licenca);
  return Object.assign({}, FEATURE_PLANS[chave] || FEATURE_PLANS.premium);
}

// Junta os padrões do plano com os overrides específicos do tenant
function resolveFeatures(licenca, overrides) {
  const base = getPlanDefaults(licenca);
  const result = {};
  Object.keys(base).forEach((k) => { result[k] = base[k]; });
  if (overrides && typeof overrides === 'object') {
    Object.keys(overrides).forEach((k) => {
      if (k in base) result[k] = !!overrides[k];
    });
  }
  return result;
}

module.exports = {
  FEATURES,
  FEATURE_PLANS,
  planoParaChave,
  getPlanDefaults,
  resolveFeatures
};
