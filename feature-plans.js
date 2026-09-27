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
  { chave: 'menu_engenharia_lucro', nome: 'Engenharia de Cardápio BCG (Kasavana & Smith)', desc: 'Matriz analítica de Estrelas, Burros de Carga, Quebra-Cabeças e Cães para maximizar margem.', categoria: 'Inteligência', preco: 'R$ 89/mês', roi: '+12% a +22% no lucro líquido do cardápio' },
  { chave: 'pague_na_mesa', nome: 'Auto-Pagamento na Mesa via QR Code (TabPay & Gorjeta)', desc: 'Cliente consulta comanda na mesa, divide a conta, insere gorjeta e paga com Pix/Cartão instantâneo liberando a mesa.', categoria: 'Fintech', preco: 'R$ 49/mês + 0.89% Pix', roi: 'Gira mesas até 20 minutos mais rápido e zera filas no caixa' },
  { chave: 'validade_anvisa_perdas', nome: 'Sentinela de Validades ANVISA & Etiquetas Térmicas', desc: 'RDC 216 ANVISA: geração automática de etiquetas térmicas de manipulação, alerta diário de vencimento e queima promocional de estoque.', categoria: 'Operação', preco: 'R$ 69/mês', roi: 'Zera multas sanitárias e reduz desperdício de insumos em até 80%' },
  { chave: 'cotacao_b2b_fornecedores', nome: 'Central de Cotações B2B & Compras Coletivas', desc: 'Disparo de cotações automáticas para distribuidores via WhatsApp, matriz comparativa de menores preços e pool de compras coletivas.', categoria: 'Financeiro', preco: 'R$ 89/mês', roi: 'Economiza até 18% nos insumos e poupa 10h/mês de cotações manuais' },
  { chave: 'reputacao_google_ia', nome: 'Guardião de Reputação & Avaliações por IA (Google Maps/iFood)', desc: 'Filtro inteligente de NPS: avaliações 5 estrelas são direcionadas ao Google Maps; notas 1 a 3 alertam o gerente no WhatsApp para contenção.', categoria: 'Marketing', preco: 'R$ 59/mês', roi: 'Multiplica reviews 5 estrelas no Google e intercepta clientes insatisfeitos' },
  { chave: 'painel_tv_senhas', nome: 'Painel TV de Senhas & Digital Signage (Fast-Food)', desc: 'Transforma qualquer Smart TV em painel profissional com voz sintetizada (Pronto/Preparando) e carrossel de ofertas/combos lucrativos.', categoria: 'Hardware', preco: 'R$ 39/mês', roi: 'Atendimento profissional de fast-food com voz e +20% em vendas de sobremesas' },
  { chave: 'encomendas_eventos', nome: 'Gestão de Encomendas, Buffets & Ceias', desc: 'Controle de vendas com data futura, adiantamento de 50% de sinal via Pix, orçamentos personalizados e calendário de produção da cozinha.', categoria: 'Vendas', preco: 'R$ 69/mês', roi: 'Organiza pedidos com data futura e garante sinal de 50% antecipado' },
  { chave: 'redes_franquias', nome: 'Gestão Multi-Lojas, Redes e Franquias (Master Chain)', desc: 'Dashboard executivo consolidado multi-CNPJ, transferência de insumos entre matriz e filiais, e replicação de cardápio com 1 clique.', categoria: 'Gestão', preco: 'R$ 149/mês por filial', roi: 'DRE consolidado, transferências entre lojas e replicação de cardápio' },
  { chave: 'gift_card_wallet', nome: 'Gift Cards Corporativos & Saldo Pré-Pago VIP', desc: 'Venda de vouchers para presentes ou empresas e carteira pré-paga para clientes fiéis (consumo antecipado com bônus).', categoria: 'Vendas', preco: 'R$ 49/mês + 1% recarga', roi: 'Injeção imediata de capital de giro e fidelização de clientes' },

  // ══════════════════════════════════════════════════════════════════
  // NOVOS MÓDULOS — TIER S (Dinheiro Imediato)
  // ══════════════════════════════════════════════════════════════════
  { chave: 'hub_multi_marketplace', nome: 'Hub Multi-Marketplace (Rappi, Uber Eats, 99Food, Aiqfome)', desc: 'Centraliza pedidos de todos os marketplaces em um único painel com aceite automático, sincronização de cardápio e pausa por esgotamento de insumo.', categoria: 'Delivery', preco: 'R$ 129/mês', roi: 'Elimina 3 tablets extras e reduz perda de pedidos em ~40%' },
  { chave: 'link_pagamento_virtual', nome: 'Maquininha Virtual & Link de Pagamento Instantâneo', desc: 'Gera link de pagamento via WhatsApp para delivery no crédito parcelado (até 12x) com integração automática ao caixa.', categoria: 'Fintech', preco: 'R$ 59/mês + 0.5% take-rate', roi: '+15% de ticket médio no delivery com parcelamento' },
  { chave: 'ficha_tecnica_visual', nome: 'Ficha Técnica Visual com Foto do Prato Montado', desc: 'Modo de preparo com foto do prato finalizado, checklist de montagem, timer e dicas do chef exibidos no KDS.', categoria: 'Operação', preco: 'R$ 49/mês', roi: 'Padronização = menos desperdício + consistência de marca' },
  { chave: 'dashboard_dono_mobile', nome: 'Dashboard do Dono em Tempo Real (Mobile PWA)', desc: 'Painel instalável no celular com vendas por hora, comparativo semanal, alertas de metas batidas e notificações de anomalias.', categoria: 'Gestão', preco: 'R$ 69/mês', roi: 'Controle total sem precisar estar no restaurante' },
  { chave: 'sped_exportacao_contabil', nome: 'SPED Fiscal & Exportação Contábil Automática', desc: 'Exportação automática de XML NFC-e, livro de entradas, apuração ICMS/PIS/COFINS e envio ao contador no dia 1 de cada mês.', categoria: 'Fiscal', preco: 'R$ 89/mês', roi: 'Elimina 8-12h/mês de trabalho manual e reduz risco de multa fiscal' },

  // ══════════════════════════════════════════════════════════════════
  // NOVOS MÓDULOS — TIER A (Alta Demanda)
  // ══════════════════════════════════════════════════════════════════
  { chave: 'preco_dinamico_happy_hour', nome: 'Precificação Dinâmica & Happy Hour Automático', desc: 'Motor de preços que ajusta automaticamente baseado em hora, dia, clima, ocupação e estoque. Happy Hour ativa quando salão < 30%.', categoria: 'Inteligência', preco: 'R$ 79/mês', roi: '+12-18% de faturamento em horários mortos' },
  { chave: 'nutricional_cardapio', nome: 'Controle Nutricional & Calorias no Cardápio', desc: 'Cálculo de macros (kcal, proteína, carbo, gordura) via tabela TACO/IBGE com filtros: Low Carb, Sem Glúten, Vegano, Até 500 kcal.', categoria: 'Vendas', preco: 'R$ 59/mês', roi: 'Atrai público fitness/saúde (ticket médio 20% maior)' },
  { chave: 'foto_ia_cardapio', nome: 'Cardápio com Foto IA (Geração Automática)', desc: 'Gera foto realista do prato a partir do nome + ingredientes. Inclui aprovação, remoção de fundo e padronização visual.', categoria: 'Marketing', preco: 'R$ 49/mês (100 gerações)', roi: '+22-35% de conversão em pedidos via cardápio digital' },
  { chave: 'push_notifications_clientes', nome: 'Central de Notificações Push para Clientes', desc: 'Web Push para clientes que acessaram o cardápio. Segmentação por frequência, bairro e preferências. Custo zero por mensagem.', categoria: 'Marketing', preco: 'R$ 49/mês', roi: 'Canal de marketing gratuito com 5-8% de CTR' },
  { chave: 'escala_inteligente_ia', nome: 'Agenda de Escalas Inteligente com IA', desc: 'Gera escala automática respeitando CLT (DSR, interjornada 11h, 44h semanais), histórico de vendas e preferências do funcionário.', categoria: 'Gestão', preco: 'R$ 69/mês', roi: '-30% em horas extras desperdiçadas e zero conflitos' },
  { chave: 'vitrine_delivery_propria', nome: 'Vitrine de Delivery Própria (Mini-Site White-Label)', desc: 'Loja online com domínio próprio, cardápio com fotos, checkout PIX/cartão, rastreio de motoboy e fidelidade integrada.', categoria: 'Vendas', preco: 'R$ 99/mês', roi: 'Cada pedido migrado do iFood economiza 27% de comissão' },
  { chave: 'controle_desperdicio', nome: 'Controle de Desperdício com Pesagem de Descarte', desc: 'Registro de descarte por categoria com pesagem, dashboard de desperdício e alertas quando ultrapassar benchmark do setor.', categoria: 'Financeiro', preco: 'R$ 49/mês', roi: 'Redução de 30-50% no desperdício = R$ 2-5k/mês economia' },
  { chave: 'checklist_operacional', nome: 'Checklist de Abertura & Fechamento do Restaurante', desc: 'Checklist digital por turno com itens obrigatórios, foto de evidência, registro de responsável e relatório de conformidade.', categoria: 'Operação', preco: 'R$ 29/mês', roi: 'Zero esquecimentos operacionais + evidência para seguro' },

  // ══════════════════════════════════════════════════════════════════
  // NOVOS MÓDULOS — TIER B (Premium)
  // ══════════════════════════════════════════════════════════════════
  { chave: 'manutencao_preventiva', nome: 'Manutenção Preventiva de Equipamentos', desc: 'Agenda de manutenção com alertas de revisão, registro de OS, custo acumulado por equipamento e integração com assistência técnica.', categoria: 'Operação', preco: 'R$ 39/mês', roi: 'Evita 1 pane crítica/trimestre = economia de R$ 3-8k' },
  { chave: 'academia_restaurante', nome: 'Academia do Restaurante (Treinamento & Onboarding)', desc: 'Vídeos curtos por cargo, checklist de onboarding com progresso, quiz de validação e certificado digital.', categoria: 'Gestão', preco: 'R$ 59/mês', roi: 'Funcionário produtivo em 3 dias (vs 14 dias)' },
  { chave: 'iot_temperatura_haccp', nome: 'Monitoramento de Temperatura IoT (HACCP Digital)', desc: 'Integração com sensores WiFi para câmaras frias com alertas push e relatório HACCP exportável em PDF para fiscalização.', categoria: 'Hardware', preco: 'R$ 79/mês', roi: 'Evita multa ANVISA de R$ 2-50k e perda de estoque' },
  { chave: 'bot_social_instagram', nome: 'Atendente Virtual para Instagram & Facebook DM', desc: 'Bot de IA que responde DMs com cardápio, preços, horário e link de pedido. Escala perguntas complexas ao gerente.', categoria: 'Marketing', preco: 'R$ 79/mês', roi: 'Converte DMs em pedidos 24/7 sem custo de atendente' },
  { chave: 'benchmark_setor', nome: 'Benchmark Anônimo do Setor (Inteligência Competitiva)', desc: 'Comparação anônima com restaurantes do mesmo nicho e região: ticket médio, CMV%, ocupação, tempo de preparo e NPS.', categoria: 'Inteligência', preco: 'R$ 49/mês', roi: 'Decisões baseadas em dados do mercado real' },

  // ══════════════════════════════════════════════════════════════════
  // NOVOS MÓDULOS — TIER C (Valor Agregado & Retenção)
  // ══════════════════════════════════════════════════════════════════
  { chave: 'app_funcionario', nome: 'App do Funcionário (Ponto, Holerite & Comunicação)', desc: 'PWA para marcação de ponto com geolocalização, holerite digital, mural de comunicados, pedido de folga e canal com RH.', categoria: 'Gestão', preco: 'R$ 39/mês', roi: '-40% em conflitos trabalhistas e RH organizado' },
  { chave: 'roleta_gamificacao_cliente', nome: 'Roleta & Promoções Gamificadas para Clientes', desc: 'Roleta da sorte no cardápio, raspadinha digital pós-compra, selos colecionáveis integrados ao programa de fidelidade.', categoria: 'Vendas', preco: 'R$ 49/mês', roi: '+25% de engajamento e +18% de retorno em 30 dias' },
  { chave: 'pesquisa_satisfacao_inloco', nome: 'Pesquisa de Satisfação In-Loco (Tablet na Mesa)', desc: 'Pesquisa rápida de 3 perguntas antes da conta com NPS automático e alerta instantâneo para notas baixas.', categoria: 'Operação', preco: 'R$ 39/mês', roi: 'Resolve problemas ANTES da avaliação negativa pública' },
  { chave: 'valet_estacionamento', nome: 'Valet & Controle de Estacionamento', desc: 'Registro digital de veículo, ticket no WhatsApp, botão "Solicitar carro" pelo celular e cobrança integrada na conta.', categoria: 'Operação', preco: 'R$ 49/mês', roi: 'Profissionaliza valet + nova fonte de receita' },
  { chave: 'playlist_ambientacao', nome: 'Gestão de Ambientação Sonora & Playlist Inteligente', desc: 'Playlists por momento (Almoço, Happy Hour, Jantar) com troca automática por horário e controle de volume por zona.', categoria: 'Operação', preco: 'R$ 29/mês', roi: 'Experiência consistente + permanência 15% maior' },
  { chave: 'portal_cliente_final', nome: 'Portal do Cliente (Histórico, Favoritos & Recompensas)', desc: 'Área logada com histórico de pedidos, re-pedido em 1 toque, saldo de cashback/pontos, cupons e login por WhatsApp OTP.', categoria: 'Vendas', preco: 'R$ 59/mês', roi: '+35% de recompra e dados proprietários de comportamento' }
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
