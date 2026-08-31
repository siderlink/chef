/**
 * feature-plans.js
 * Definição dos planos e features habilitáveis por tenant.
 * Usado pelo servidor (server.js) e pelo painel Super Admin.
 * Objetivo: permitir ligar/desligar funções por tenant ou por plano,
 * economizando recursos de servidor (sockets, pollers, consultas pesadas).
 */
'use strict';

// Features disponíveis para controle (as que mais consomem recursos do servidor)
const FEATURES = [
  { chave: 'tempo_real', nome: 'Tempo real (sockets)', desc: 'Dashboards, cozinha e fila atualizados em tempo real. Desligar reduz drasticamente o uso de sockets e broadcasts.' },
  { chave: 'ifood', nome: 'Integração iFood', desc: 'Poller de pedidos do iFood (consulta a cada 30s por tenant autorizado).' },
  { chave: 'cardapio', nome: 'Cardápio QR', desc: 'Cardápio digital acessado por QR no balcão.' },
  { chave: 'bi', nome: 'BI / Financeiro', desc: 'Relatórios financeiros e BI (consultas agregadas no banco).' },
  { chave: 'delivery', nome: 'Delivery / Entregas', desc: 'Gestão de entregas e motoboys.' },
  { chave: 'fidelidade', nome: 'Fidelidade / Pontos', desc: 'Programa de fidelidade e pontos de clientes.' },
  { chave: 'nfce', nome: 'NFC-e (Nota Fiscal)', desc: 'Emissão de notas fiscais eletrônicas.' },
  { chave: 'telemetria', nome: 'Telemetria / Hub', desc: 'Envio de telemetria e sincronização com o hub.' },
  { chave: 'totem', nome: 'Totem de Autoatendimento', desc: 'Upsell: quiosque de autoatendimento com bloqueio kiosk, pedidos e Pix. Desligado por padrão em todos os planos; ativado por tenant pelo Super Admin.' },
  { chave: 'jogos', nome: 'Jogos / Premiações', desc: 'Jogos na mesa e sistema de premiação para os clientes duelarem entre si.' },
  { chave: 'hub_delivery', nome: 'Hub Delivery', desc: 'Hub de pedidos agregados de marketplaces (iFood, Rappi, Uber Eats, Mucho) e delivery próprio.' },
  { chave: 'reservas', nome: 'Reservas Futuras', desc: 'Reservas de mesas com calendário, prazos e aprovação do restaurante.' },
  { chave: 'fila_espera', nome: 'Fila de Espera', desc: 'Fila de espera de clientes por mesas, com chamada e alocação automática.' }
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
    fila_espera: false
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
    fila_espera: true
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
    fila_espera: true
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
