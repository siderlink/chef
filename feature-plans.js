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
  { chave: 'radar_concorrencia_geo', nome: 'Radar de Concorrência & Geomarketing por Raio (Km)', desc: 'Mapeamento de restaurantes vizinhos em raio de 1 a 15 km, benchmarking de preços de cardápio, taxa de entrega média, notas do Google e detecção de gaps de horários.', categoria: 'Inteligência', preco: 'R$ 89/mês', roi: 'Identifica brechas de mercado, compara preços dos vizinhos e atrai clientes da concorrência' },

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
  { chave: 'portal_cliente_final', nome: 'Portal do Cliente (Histórico, Favoritos & Recompensas)', desc: 'Área logada com histórico de pedidos, re-pedido em 1 toque, saldo de cashback/pontos, cupons e login por WhatsApp OTP.', categoria: 'Vendas', preco: 'R$ 59/mês', roi: '+35% de recompra e dados proprietários de comportamento' },

  // ══════════════════════════════════════════════════════════════════
  // MÓDULOS DE ALTA RENTABILIDADE & FINTECH (Receita Exponencial)
  // ══════════════════════════════════════════════════════════════════
  { chave: 'tributos_monofasicos', nome: 'Recuperador de Tributos Monofásicos (PIS/COFINS de Bebidas)', desc: 'Audita vendas de bebidas frias, identifica bitributação e gera laudo de segregação para abater de R$ 800 a R$ 3.000/mês no Simples Nacional.', categoria: 'Fiscal', preco: 'R$ 99/mês + 15% sucesso', roi: 'Economiza de R$ 800 a R$ 3.000 por mês em impostos pagos indevidamente' },
  { chave: 'sentinela_anti_fraude', nome: 'Sentinela Anti-Fraude & Cancelamentos Suspeitos', desc: 'Auditoria algorítmica de cancelamentos pós-produção, descontos manuais abusivos e reaberturas de comanda com alertas no WhatsApp do dono.', categoria: 'Operação', preco: 'R$ 79/mês', roi: 'Elimina desvios de caixa que representam 3% a 8% do faturamento' },
  { chave: 'banco_freelancers_plantao', nome: 'Banco de Freelancers de Pico & Plantão Urgente (Uberização)', desc: 'Chame garçons, chapeiros e barmans avaliados para turnos de pico em 1 clique com confirmação e pagamento via Pix.', categoria: 'Gestão', preco: 'R$ 49/mês + R$ 20/diária', roi: 'Salva noites de pico sem faturamento perdido por falta de equipe' },
  { chave: 'gatilho_clima_delivery', nome: 'Gatilho Meteorológico & Vendas Preditivas (Choveu, Vendeu)', desc: 'Monitora tempo e chuva na cidade, disparando campanhas automáticas de delivery e ativando combos quentes antes que o cliente peça no iFood.', categoria: 'Marketing', preco: 'R$ 49/mês', roi: '+35% de pedidos diretos em dias chuvosos sem comissão' },
  { chave: 'compras_coletivas_b2b', nome: 'Clube de Compras Coletivas B2B (Poder de Barganha)', desc: 'Une o volume de compra de restaurantes vizinhos para negociar queijo, carne e embalagens com preço de grande rede direto da indústria.', categoria: 'Financeiro', preco: 'R$ 89/mês + comissão B2B', roi: 'Reduz o custo de matéria-prima (CMV) em até 18%' },

  // ══════════════════════════════════════════════════════════════════
  // MÓDULOS DE EXPANSÃO & MONETIZAÇÃO TRANSACTIONAL (Mega ARPU)
  // ══════════════════════════════════════════════════════════════════
  { chave: 'despacho_multi_frota', nome: 'Central de Despacho Multi-Frota (Uber Direct + Lalamove)', desc: 'Chame motoboys terceirizados sob demanda em 1 clique com rastreio ao vivo para o cliente sem custos fixos de equipe.', categoria: 'Operação', preco: 'R$ 49/mês + R$ 1,50/corrida', roi: 'Zero entregas atrasadas no pico e economia de salários fixos' },
  { chave: 'reservas_vip_caucao', nome: 'Reservas VIP & Anti No-Show (com Caução Pix)', desc: 'Link de reservas com pagamento antecipado de caução que vira consumo no salão, eliminando mesas nobres vazias.', categoria: 'Vendas', preco: 'R$ 69/mês + 2,5% caução', roi: 'Fim do prejuízo de mesas que reservam e não aparecem' },
  { chave: 'wallet_digital_prepaga', nome: 'Carteira Digital Pré-Paga & Cashback Rotativo', desc: 'Clube de recarga antecipada de créditos com bônus de consumo, gerando capital de giro à vista para o restaurante.', categoria: 'Financeiro', preco: 'R$ 59/mês + 1% recarga', roi: 'Capital de giro antecipado a custo zero e retenção garantida' },
  { chave: 'escudo_reputacao_google', nome: 'Escudo de Reputação & Filtro Google Maps 5★', desc: 'Filtra notas altas direto para o Google Maps público e retém insatisfações privadamente no WhatsApp do gerente.', categoria: 'Marketing', preco: 'R$ 59/mês', roi: 'Nota 4.8+ garantida no Google sem avaliações negativas surpresa' },
  { chave: 'split_mesa_pix', nome: 'Split de Conta na Mesa com Pix Autônomo', desc: 'Clientes dividem a comanda pelo próprio celular e pagam individualmente via Pix sem travar a fila do caixa.', categoria: 'Operação', preco: 'R$ 69/mês + R$ 0,35/split', roi: 'Giro de mesas 25% mais rápido em noites movimentadas' },
  { chave: 'dark_kitchen_marcas', nome: 'Dark Kitchen Multi-Marcas na Mesma Cozinha', desc: 'Gerencie até 5 marcas virtuais diferentes compartilhando a mesma cozinha, estoque e KDS com DREs separados.', categoria: 'Gestão', preco: 'R$ 79/mês por marca extra', roi: 'Multiplica o faturamento da cozinha sem aumentar o aluguel' },

  // ══════════════════════════════════════════════════════════════════
  // MÓDULOS TURBO DE MONETIZAÇÃO & HARDWARE (Expansão Máxima)
  // ══════════════════════════════════════════════════════════════════
  { chave: 'antecipacao_recebiveis_giro', nome: 'Antecipação de Recebíveis & Crédito Giro Instantâneo', desc: 'Crédito imediato via Pix antecipando cartões e repasses iFood com spread financeiro retido para o SaaS.', categoria: 'Financeiro', preco: '3.2% de spread sobre o montante', roi: 'Capital de giro na mesma hora sem burocracia bancária' },
  { chave: 'totem_kiosk_touchscreen', nome: 'Totem Kiosk de Autoatendimento Touchscreen', desc: 'Transforme tablets ou telas touch em terminais de autoatendimento estilo fast-food reduzindo filas e custos de atendentes.', categoria: 'Hardware', preco: 'R$ 69/mês por tela ativa', roi: 'Economia de R$ 2.500/mês por atendente de caixa substituído' },
  { chave: 'trafego_hiperlocal_1clique', nome: 'Piloto de Tráfego Pago Hiperlocal 1-Clique', desc: 'Crie e suba anúncios geolocalizados no Instagram/Meta no raio de 3km com 1 toque para lotar terças e quartas.', categoria: 'Marketing', preco: 'R$ 49/mês + R$ 20 por campanha', roi: '+25 a +40 clientes nas noites mais fracas da semana' },
  { chave: 'auditor_glosas_ifood', nome: 'Auditor de Repasses & Glosas Indevidas de Marketplaces', desc: 'Audita automaticamente cada extrato e repasse do iFood apontando taxas indevidas e cancelamentos a recuperar.', categoria: 'Fiscal', preco: 'R$ 89/mês ou 20% do recuperado', roi: 'Recupera em média R$ 1.400/mês em retenções indevidas' },
  { chave: 'clube_assinaturas_prime', nome: 'Motor de Clube de Assinaturas B2B2C (Membros VIP)', desc: 'Crie o clube de membros do seu restaurante cobrando mensalidades recorrentes no cartão dos clientes com take-rate.', categoria: 'Vendas', preco: 'R$ 79/mês + 5% take-rate', roi: 'Receita previsível e recorrente antes de abrir a porta da loja' },
  { chave: 'tv_senhas_chamada_voz', nome: 'TV Chamador de Senhas com Áudio e Painel de Retirada', desc: 'Transforma qualquer Smart TV em painel profissional de senhas com voz sintetizada em português para balcão e delivery.', categoria: 'Operação', preco: 'R$ 39/mês por Smart TV', roi: 'Zero aglomeração no balcão e motoboys atendidos sem gritaria' },

  // ══════════════════════════════════════════════════════════════════
  // MÓDULOS DE RECEITA MÁXIMA & FINTECH TRANSACIONAL (Mega Take-Rate)
  // ══════════════════════════════════════════════════════════════════
  { chave: 'gorjeta_legal_13419', nome: 'Split de Gorjeta Legalizada (Lei nº 13.419/2017)', desc: 'Calcula gorjetas, retém encargos legais (20% Simples / 33% Lucro Real) e distribui por pontos via Pix com demonstrativo fiscal.', categoria: 'Fintech', preco: 'R$ 69/mês + R$ 0,25/repasse', roi: 'Blindagem contra passivos trabalhistas e retenção de equipe' },
  { chave: 'antichurn_preditivo_whats', nome: 'Robô Preditivo Anti-Churn de Clientes', desc: 'Detecta clientes inativos pelo desvio do LTV e dispara cupons irresistíveis personalizados no WhatsApp automaticamente.', categoria: 'Marketing', preco: 'R$ 59/mês', roi: 'Recupera em média 28% dos clientes sumidos do salão e delivery' },
  { chave: 'gamificacao_salao_metas', nome: 'Gamificação do Salão & Venda Sugestiva', desc: 'Metas em tempo real para garçons venderem sobremesas, entradas e bebidas com comissão instantânea e ranking ao vivo.', categoria: 'Operação', preco: 'R$ 59/mês', roi: '+15% a +25% de aumento imediato no ticket médio' },
  { chave: 'influencer_roi_rastreado', nome: 'Portal do Influencer com ROI Real', desc: 'Links e cupons rastreados para influenciadores gastronômicos com comissão paga apenas sobre vendas reais geradas.', categoria: 'Marketing', preco: 'R$ 49/mês', roi: 'Fim do jantar de graça sem retorno comprovado de clientes' },
  { chave: 'voucher_vr_antecipacao', nome: 'Conciliação & Antecipação de Vouchers VR/VA', desc: 'Audita taxas de Ticket, Sodexo, Alelo e Swile e antecipa recebíveis futuros com spread financeiro retido para o SaaS.', categoria: 'Fintech', preco: 'R$ 89/mês + 3.5% antecipação', roi: 'Fluxo de caixa imediato sem esperar 30 a 60 dias das bandeiras' },
  { chave: 'drivethru_curbside_geofence', nome: 'Drive-Thru & Pegue-e-Leve com Geofence', desc: 'Aviso de aproximação do cliente por GPS no raio de 300m para entrega do pedido na janela do carro sem filas.', categoria: 'Operação', preco: 'R$ 49/mês', roi: 'Agiliza retiradas e elimina congestionamento na porta do restaurante' },

  // ══════════════════════════════════════════════════════════════════
  // MÓDULOS DE EXPANSÃO EXTREMA (Cashless, Hotelaria, B2B & Fiscal)
  // ══════════════════════════════════════════════════════════════════
  { chave: 'rfid_pulseira_cashless', nome: 'Comanda RFID / Pulseira Cashless (Bares e Baladas)', desc: 'Elimina filas de fechamento de conta com consumo por aproximação e recarga pré/pós-paga.', categoria: 'Hardware', preco: 'R$ 99/mês + R$ 0,30/pulseira', roi: 'Aumento de 25% a 35% no consumo interno de bebidas' },
  { chave: 'hotel_room_service_pms', nome: 'Room Service & Integração PMS para Hotéis', desc: 'Lança consumos de frigobar e restaurante direto na conta do quarto do hóspede com faturamento no check-out.', categoria: 'Gestão', preco: 'R$ 149/mês', roi: 'Atende hotéis, resorts e pousadas sem retrabalho manual' },
  { chave: 'perdas_avarias_barata_zero', nome: 'Auditor de Quebras, Avarias & Barata Zero', desc: 'Controle fotográfico e financeiro de pratos quebrados, chopp derramado e insumos queimados.', categoria: 'Operação', preco: 'R$ 59/mês', roi: 'Economiza de R$ 2.000 a R$ 5.000/mês eliminando vazamentos de estoque' },
  { chave: 'reforma_tributaria_simulador', nome: 'Simulador da Reforma Tributária 2026/2027 (IBS/CBS)', desc: 'Calcula o impacto da transição tributária, aproveitamento de créditos de insumos e split payment.', categoria: 'Fiscal', preco: 'R$ 99/mês', roi: 'Adequação preventiva à nova legislação sem sustos contábeis' },
  { chave: 'marmitas_b2b_corporativo', nome: 'Assinatura Corporativa de Refeições B2B', desc: 'Contratos recorrentes com empresas para fornecimento diário de refeições com portal de escolha.', categoria: 'Vendas', preco: 'R$ 79/mês + 1% faturamento', roi: 'Faturamento corporativo garantido e previsível' },
  { chave: 'recrutador_gastronomico_flash', nome: 'Recrutador Flash de Equipe Gastronômica', desc: 'Disparo de vagas e triagem expressa de garçons, chapeiros e cozinheiros com score de qualificação.', categoria: 'Gestão', preco: 'R$ 49/mês', roi: 'Contratação em minutos para noites de pico sem faturamento perdido' },

  // ══════════════════════════════════════════════════════════════════
  // MÓDULOS DE MONETIZAÇÃO SUPREMA (Franquias, Polos & Hardware)
  // ══════════════════════════════════════════════════════════════════
  { chave: 'franquias_royalties_fpp', nome: 'Franquias & Master Franchising (Royalties e FPP)', desc: 'Apuração automática de royalties, fundo de propaganda e gestão multi-unidades auditada pelo PDV.', categoria: 'Gestão', preco: 'R$ 199/mês por franqueado', roi: 'Automatiza prestação de contas e blindagem de receitas da franqueadora' },
  { chave: 'polo_gastronomico_compartilhado', nome: 'Polo Gastronômico & Delivery Compartilhado', desc: 'Carrinho unificado para múltiplos restaurantes da mesma praça ou vila com frete único e split financeiro.', categoria: 'Delivery', preco: 'R$ 149/mês + 2% take-rate', roi: 'Converte pedidos com ticket médio 40% maior reunindo múltiplos estabelecimentos' },
  { chave: 'antifurto_inventario_cego', nome: 'Sentinela de Inventário Cego (Carnes e Destilados)', desc: 'Contagem cega de 3 minutos por turno dos 10 itens mais caros com alerta imediato de desvio no WhatsApp.', categoria: 'Operação', preco: 'R$ 79/mês', roi: 'Elimina desvios de carnes nobres e garrafas que custam R$ 3k-8k/mês' },
  { chave: 'fidelidade_tiers_vip', nome: 'Fidelidade por Níveis VIP (Bronze a Diamante)', desc: 'Categorização de clientes com benefícios exclusivos e cashback progressivo para estimular consumo.', categoria: 'Marketing', preco: 'R$ 69/mês', roi: 'Eleva a frequência de visitas e o ticket médio dos clientes mais fiéis' },
  { chave: 'menuboard_tv_balcao', nome: 'Menu Board Digital Interativo para TVs de Balcão', desc: 'Exibição de cardápio digital em Smart TVs com troca automática por momento do dia (almoço, café, happy hour).', categoria: 'Hardware', preco: 'R$ 49/mês por tela', roi: 'Visual de grandes redes (fast-food) e +20% em combos e sobremesas' },
  { chave: 'satisfacao_ia_emocional', nome: 'Totem de Satisfação com IA Emocional & Áudio', desc: 'Totem tátil de 4 emojis com transcrição e análise de sentimento em áudio com alerta crítico no WhatsApp.', categoria: 'Operação', preco: 'R$ 39/mês', roi: 'Alerta em tempo real no WhatsApp para gerentes reverterem atritos na saída' }
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
  },
  lite: {
    tempo_real: false,        // Desligado: sem WebSockets pesados/broadcasts constantes (poupa RAM/CPU)
    ifood: false,             // Desligado: sem pollers contínuos a cada 30s
    cardapio: true,           // Ligado: cardápio QR básico
    bi: false,                // Desligado: sem DRE analítico ou relatórios pesados
    delivery: false,          // Desligado: apenas balcão e salão enxuto
    fidelidade: false,        // Desligado
    nfce: false,              // Desligado (sem emissão fiscal em lote)
    telemetria: false,        // Desligado: sem sync contínuo de telemetria
    totem: false,             // Desligado
    jogos: false,             // Desligado
    hub_delivery: false,      // Desligado
    reservas: false,          // Desligado
    fila_espera: false,       // Desligado
    pesagem_selfservice: false,
    whatsapp_bot: false,      // Desligado
    rh: false,                // Desligado
    cheff_ai: false,          // Desligado: zero chamadas a APIs pagas de IA
    estoque_avancado: false,  // Desligado: sem ficha técnica complexa
    kds_avancado: false       // Desligado: sem KDS multi-telas
  }
};

// Limites severos de recursos e cotas por plano (garantem margem máxima e protegem o servidor)
const PLAN_LIMITS = {
  lite: {
    chave: 'lite',
    nome: 'Plano Lite (Econômico / Ultra Margem)',
    preco_mensal: 39.90,
    preco_anual: 358.80,       // R$ 29,90/mês no anual
    custo_servidor_estimado: 0.15, // Custo médio de infraestrutura por tenant/mês
    margem_lucro_pct: 99.6,    // Margem de lucro astronômica
    max_produtos: 30,          // Limite rígido de produtos ativos no cardápio
    max_pedidos_mes: 150,       // Limite mensal de pedidos (~5 pedidos/dia)
    max_mesas: 8,               // Máximo de 8 mesas no salão
    max_usuarios_simultaneos: 1,// Apenas 1 operador/caixa conectado por vez
    max_fotos_produtos: 5,      // Máximo de 5 fotos no cardápio
    max_upload_kb: 100,         // Uploads restritos a 100KB (economia de disco e banda)
    tempo_real_socket: false,   // Sem WebSockets de alta frequência
    historico_dias: 30,         // Retenção máxima de 30 dias (banco SQLite < 2MB)
    permite_ia: false,          // Zero chamadas para APIs de IA
    permite_marketplaces: false,// Sem pollers rodando a cada 30 segundos
    permite_kds: false,         // Sem KDS multi-praças
    permite_nfce: false,        // Sem emissão fiscal automática
    rate_limit_rpm: 60,         // Limite de 60 requisições/minuto
    badge: 'Lite Econômico',
    descricao: 'Para pequenos balcões, MEIs e carrinhos de lanche. Custo de servidor quase nulo e altíssima margem de lucro.'
  },
  pro: {
    chave: 'pro',
    nome: 'Plano Pro (Profissional)',
    preco_mensal: 149.00,
    preco_anual: 1428.00,
    custo_servidor_estimado: 4.50,
    margem_lucro_pct: 97.0,
    max_produtos: 300,
    max_pedidos_mes: 3000,
    max_mesas: 50,
    max_usuarios_simultaneos: 5,
    max_fotos_produtos: 100,
    max_upload_kb: 500,
    tempo_real_socket: true,
    historico_dias: 365,
    permite_ia: false,
    permite_marketplaces: true,
    permite_kds: true,
    permite_nfce: true,
    rate_limit_rpm: 300,
    badge: 'Mais Popular',
    descricao: 'Operação completa para restaurantes em crescimento com delivery, salão e KDS.'
  },
  premium: {
    chave: 'premium',
    nome: 'Plano Premium (Ilimitado & IA)',
    preco_mensal: 249.00,
    preco_anual: 2388.00,
    custo_servidor_estimado: 12.00,
    margem_lucro_pct: 95.2,
    max_produtos: Infinity,
    max_pedidos_mes: Infinity,
    max_mesas: Infinity,
    max_usuarios_simultaneos: Infinity,
    max_fotos_produtos: Infinity,
    max_upload_kb: 5000,
    tempo_real_socket: true,
    historico_dias: Infinity,
    permite_ia: true,
    permite_marketplaces: true,
    permite_kds: true,
    permite_nfce: true,
    rate_limit_rpm: 1000,
    badge: 'Ilimitado',
    descricao: 'Poder total sem limites, inteligência artificial integrada e múltiplos terminais.'
  },
  trial: {
    chave: 'trial',
    nome: 'Trial (Período de Demonstração)',
    preco_mensal: 0.00,
    preco_anual: 0.00,
    custo_servidor_estimado: 0.05,
    margem_lucro_pct: 0,
    max_produtos: 15,
    max_pedidos_mes: 30,
    max_mesas: 5,
    max_usuarios_simultaneos: 1,
    max_fotos_produtos: 3,
    max_upload_kb: 100,
    tempo_real_socket: false,
    historico_dias: 7,
    permite_ia: false,
    permite_marketplaces: false,
    permite_kds: false,
    permite_nfce: false,
    rate_limit_rpm: 60,
    badge: 'Demonstração',
    descricao: 'Ambiente controlado de teste gratuito por 14 dias.'
  }
};

// Mapeia o valor da coluna restaurantes.licenca para a chave de plano
function planoParaChave(licenca) {
  const l = String(licenca || '').toLowerCase();
  if (l === 'trial') return 'trial';
  if (l === 'lite' || l === 'basico' || l === 'starter' || l === 'economico') return 'lite';
  if (l === 'pro') return 'pro';
  // plus, premium, ativo (e qualquer outro) caem no plano mais completo
  return 'premium';
}

function getPlanDefaults(licenca) {
  const chave = planoParaChave(licenca);
  return Object.assign({}, FEATURE_PLANS[chave] || FEATURE_PLANS.premium);
}

function getPlanLimits(licenca) {
  const chave = planoParaChave(licenca);
  return Object.assign({}, PLAN_LIMITS[chave] || PLAN_LIMITS.lite);
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
  PLAN_LIMITS,
  planoParaChave,
  getPlanDefaults,
  getPlanLimits,
  resolveFeatures
};
