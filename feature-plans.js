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
  { chave: 'kds_avancado', nome: 'KDS Multi-Praças Cozinha & Bar', desc: 'Monitor de produção com divisão de setores, tempos de preparo e alertas sonoros.', categoria: 'Operação', preco: 'R$ 59/mês', roi: 'Fim dos atrasos e pedidos perdidos' },
  { chave: 'guardiao_compras_nfe', nome: 'Guardião de Compras & Leitor XML NFe', desc: 'Importação automática de XML de fornecedores, radar de inflação de insumos e contas a pagar.', categoria: 'Financeiro', preco: 'R$ 79/mês', roi: 'Economiza 20h/mês e zera aumentos abusivos' },
  { chave: 'resumo_noturno_whatsapp', nome: 'Resumo Noturno do Dono no WhatsApp', desc: 'Fechamento executivo automático às 23:45 direto no WhatsApp com faturamento, ticket e alertas.', categoria: 'Gestão', preco: 'R$ 49/mês', roi: 'Controle total na palma da mão sem stress' },
  { chave: 'crm_whatsapp_ia', nome: 'WhatsApp CRM & Reativação por IA', desc: 'Piloto automático para reconquistar clientes inativos, felicitar aniversariantes e pós-venda NPS.', categoria: 'Marketing', preco: 'R$ 99/mês', roi: 'Reativa de 20 a 50 clientes sumidos por mês' },
  { chave: 'clube_assinaturas', nome: 'Clube de Assinaturas & Fidelidade VIP', desc: 'Criação de planos de mensalidade (Chopp, Pizza, Executivo VIP) com receita recorrente garantida.', categoria: 'Vendas', preco: 'R$ 79/mês', roi: 'Garante faturamento fixo antes do mês começar' },
  { chave: 'auditor_cartoes', nome: 'Auditor de Taxas de Cartão & Conciliador', desc: 'Audita taxas de adquirentes (Stone, Cielo, Rede) e recupera cobranças divergentes de MDR.', categoria: 'Financeiro', preco: 'R$ 99/mês', roi: 'Recupera de R$ 300 a R$ 2.000 cobrados a mais' },
  { chave: 'gamificacao_gorjetas', nome: 'Gamificação do Salão & Rateio Gorjetas', desc: 'Leaderboard de vendas em tempo real para garçons e divisão da taxa de serviço (Lei 13.419).', categoria: 'Gestão', preco: 'R$ 59/mês', roi: '+18% no ticket médio e zero passivo trabalhista' },
  { chave: 'roteirizador_entregas_tsp', nome: 'Roteirizador de Entregas TSP & Rastreio ao Vivo', desc: 'Otimizador de rotas com algoritmo TSP, despacho em lote e link de rastreio ao vivo para WhatsApp.', categoria: 'Delivery', preco: 'R$ 69/mês', roi: '-35% em combustível e fim do cliente cobrando status' },
  { chave: 'seat_ordering', nome: 'Comanda por Assento & Split Instantâneo', desc: 'Organização de pedidos por cadeira/pessoa e fechamento parcial com Pix em 1 clique sem confusão.', categoria: 'Operação', preco: 'R$ 49/mês', roi: 'Zera tempo de fechamento em mesas de 10+ pessoas' },
  { chave: 'bar_guardiao_chopp', nome: 'Guardião do Bar & Doses de Chopp', desc: 'Controle milimétrico de volume de barris (50L/30L), copos servidos, sangrias e prevenção de perdas.', categoria: 'Operação', preco: 'R$ 69/mês', roi: 'Economiza até R$ 2.500/mês em chopp não faturado' },
  { chave: 'cardapio_multilingue_i18n', nome: 'Cardápio Multilíngue Turístico por IA', desc: 'Tradução gastronômica automática para 5 idiomas (EN, ES, FR, DE, ZH) e filtro de alérgenos.', categoria: 'Vendas', preco: 'R$ 59/mês', roi: '+40% de conversão de clientes estrangeiros' },
  { chave: 'totem_fastpass', nome: 'Totem Fast-Pass & Reconhecimento VIP', desc: 'Identificação por CPF/QR Code com repetição do combo habitual em 1 toque e Pix dinâmico.', categoria: 'Hardware', preco: 'R$ 89/mês', roi: 'Reduz fila de autoatendimento de 90s para 15s' },
  { chave: 'backup_nuvem_blindado', nome: 'Sentinela de Backup Criptografado em Nuvem', desc: 'Disaster recovery diário com AES-256 às 04:00, verificação de integridade e restore em 1 clique.', categoria: 'Gestão', preco: 'R$ 49/mês', roi: 'Proteção blindada contra queima de HD ou perdas' },
  { chave: 'menu_engenharia_lucro', nome: 'Engenharia de Cardápio BCG (Kasavana & Smith)', desc: 'Matriz analítica de Estrelas, Burros de Carga, Quebra-Cabeças e Cães para maximizar margem.', categoria: 'Inteligência', preco: 'R$ 89/mês', roi: '+12% a +22% no lucro líquido do cardápio' }
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
