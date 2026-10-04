/**
 * routes/admin.routes.js
 * Módulo Administrativo e Configurações extraído do server.js
 * Engloba configurações, funçōes/plugins, ativação e bloqueios.
 */
'use strict';

const express = require('express');
const { Router } = express;
const { getContext } = require('./shared/context');

const FUNCOES_MODULOS = [
  { chave: 'totem', nome: 'Totem de Autoatendimento Kiosk', desc: 'Quiosque touchscreen com bloqueio kiosk, montagem de pedidos e Pix na tela.', icone: 'ph-device-tablet', categorias: ['Hardware', 'Vendas'], preco: 'R$ 99/mês', roi: 'Reduz filas e custos com atendentes', badge: 'Alta Demanda' },
  { chave: 'pesagem_selfservice', nome: 'Pesagem Automática & Balança Self-Service', desc: 'Integração direta com balanças Toledo/Filizola/Urano, cálculo de tara e totem de pesagem.', icone: 'ph-scales', categorias: ['Hardware', 'Operação'], preco: 'R$ 69/mês', roi: 'Elimina erros de pesagem em buffets', badge: 'Novo' },
  { chave: 'fidelidade', nome: 'Clube Fidelidade & Cashback', desc: 'Programa de pontuação por compra, resgate de cashback no caixa e cupons automatizados.', icone: 'ph-gift', categorias: ['Vendas', 'Marketing'], preco: 'R$ 59/mês', roi: '+30% de retorno de clientes', badge: 'Mais Vendido' },
  { chave: 'whatsapp_bot', nome: 'WhatsApp Bot Notificador de Pedidos', desc: 'Avisos automáticos de status de entrega, rota do motoboy em tempo real e cupom de recompra.', icone: 'ph-whatsapp-logo', categorias: ['Marketing', 'Delivery'], preco: 'R$ 79/mês', roi: '-80% de chamadas de suporte', badge: 'Destaque' },
  { chave: 'rh', nome: 'Gestão de RH, Escalas & Comissões', desc: 'Escalas semanais, folgas, ponto eletrônico e rateio automático dos 10% e comissões da equipe.', icone: 'ph-users', categorias: ['Gestão', 'Equipe'], preco: 'R$ 49/mês', roi: 'Fechamento de comissões sem erro', badge: 'Produtividade' },
  { chave: 'cheff_ai', nome: 'Copiloto Cheff IA & Previsão de Demanda', desc: 'Inteligência preditiva de movimento, sugestão de compras de insumos e alerta anti-desperdício.', icone: 'ph-sparkle', categorias: ['Inteligência', 'Gestão'], preco: 'R$ 89/mês', roi: 'Reduz desperdício de insumos em 25%', badge: 'IA Exclusiva' },
  { chave: 'estoque_avancado', nome: 'Controle de Estoque com Ficha Técnica', desc: 'Baixa automática de gramaturas a cada prato vendido e cálculo analítico de CMV por receita.', icone: 'ph-package', categorias: ['Financeiro', 'Operação'], preco: 'R$ 69/mês', roi: 'Controle total do lucro real', badge: 'Financeiro' },
  { chave: 'kds_avancado', nome: 'KDS Multi-Praças Cozinha & Bar', desc: 'Monitor de produção dividido por setores (cozinha, bar, frios) com alertas de tempo e sonoros.', icone: 'ph-cooking-pot', categorias: ['Operação', 'Cozinha'], preco: 'R$ 59/mês', roi: 'Zera atrasos e perda de comandas', badge: 'Operacional' },
  { chave: 'hub_delivery', nome: 'Hub Delivery Multi-Canais', desc: 'Central de pedidos agregados de marketplaces (iFood, Rappi, WhatsApp) e frota própria.', icone: 'ph-moped', categorias: ['Delivery'], preco: 'R$ 79/mês', roi: 'Centraliza todos os pedidos em 1 tela', badge: 'Delivery' },
  { chave: 'reservas', nome: 'Reservas Futuras de Mesas', desc: 'Reservas online de mesas com calendário, aprovação e bloqueio automático no salão.', icone: 'ph-calendar-check', categorias: ['Operação', 'Vendas'], preco: 'R$ 49/mês', roi: 'Otimiza lotação em dias de pico', badge: 'Salão' },
  { chave: 'fila_espera', nome: 'Fila de Espera Digital', desc: 'Fila digital de clientes com estimativa de tempo e chamada automática no celular.', icone: 'ph-users-three', categorias: ['Operação'], preco: 'R$ 39/mês', roi: 'Retém clientes em horários de pico', badge: 'Atendimento' },
  { chave: 'jogos', nome: 'Jogos / Batalha de Mesas', desc: 'Quizzes interativos na mesa e premiação para clientes duelarem e aumentarem o consumo.', icone: 'ph-game-controller', categorias: ['Entretenimento'], preco: 'R$ 39/mês', roi: 'Aumenta consumo de bebidas e permanência', badge: 'Engajamento' },
  { chave: 'ifood', nome: 'Integração Oficial iFood', desc: 'Sincronização bidirecional de cardápio, pedidos e status com a rede iFood.', icone: 'ph-storefront', categorias: ['Delivery'], preco: 'Incluso no Pro/Premium', roi: 'Importação automática de pedidos', badge: 'Oficial' },
  { chave: 'nfce', nome: 'Emissão Fiscal NFC-e / SAT', desc: 'Emissão de cupom fiscal eletrônico na hora da venda com contingência offline automática.', icone: 'ph-receipt', categorias: ['Fiscal'], preco: 'Incluso no Pro/Premium', roi: 'Conformidade fiscal garantida', badge: 'Fiscal' },
  { chave: 'guardiao_compras_nfe', nome: 'Guardião de Compras & Leitor XML NFe', desc: 'Importação automática de XML de fornecedores, radar de inflação de insumos e contas a pagar.', icone: 'ph-file-arrow-up', categorias: ['Financeiro', 'Gestão'], preco: 'R$ 79/mês', roi: 'Economiza 20h/mês e zera aumentos abusivos', badge: 'Alta Economia' },
  { chave: 'resumo_noturno_whatsapp', nome: 'Resumo Noturno do Dono no WhatsApp', desc: 'Fechamento executivo automático às 23:45 direto no WhatsApp com faturamento, ticket e alertas.', icone: 'ph-moon-stars', categorias: ['Gestão', 'Marketing'], preco: 'R$ 49/mês', roi: 'Controle total na palma da mão sem stress', badge: 'Favorito dos Donos' },
  { chave: 'crm_whatsapp_ia', nome: 'WhatsApp CRM & Reativação por IA', desc: 'Piloto automático para reconquistar clientes inativos, felicitar aniversariantes e pós-venda NPS.', icone: 'ph-robot', categorias: ['Marketing', 'Vendas'], preco: 'R$ 99/mês', roi: 'Reativa de 20 a 50 clientes sumidos por mês', badge: 'IA Lucrativa' },
  { chave: 'clube_assinaturas', nome: 'Clube de Assinaturas & Fidelidade VIP', desc: 'Criação de planos de mensalidade (Chopp, Pizza, Executivo VIP) com receita recorrente garantida.', icone: 'ph-crown', categorias: ['Vendas', 'Marketing'], preco: 'R$ 79/mês', roi: 'Garante faturamento fixo antes do mês começar', badge: 'Receita Recorrente' },
  { chave: 'auditor_cartoes', nome: 'Auditor de Taxas de Cartão & Conciliador', desc: 'Audita taxas de adquirentes (Stone, Cielo, Rede) e recupera cobranças divergentes de MDR.', icone: 'ph-credit-card', categorias: ['Financeiro'], preco: 'R$ 99/mês', roi: 'Recupera de R$ 300 a R$ 2.000 cobrados a mais', badge: 'Recupere Dinheiro' },
  { chave: 'gamificacao_gorjetas', nome: 'Gamificação do Salão & Rateio Gorjetas', desc: 'Leaderboard de vendas em tempo real para garçons e divisão da taxa de serviço (Lei 13.419).', icone: 'ph-trophy', categorias: ['Gestão', 'Equipe'], preco: 'R$ 59/mês', roi: '+18% no ticket médio e zero passivo trabalhista', badge: 'Mais Vendido' },
  { chave: 'roteirizador_entregas_tsp', nome: 'Roteirizador de Entregas TSP & Rastreio ao Vivo', desc: 'Otimizador de rotas com algoritmo TSP, despacho em lote e link de rastreio ao vivo para WhatsApp.', icone: 'ph-navigation-arrow', categorias: ['Delivery', 'Operação'], preco: 'R$ 69/mês', roi: '-35% em combustível e fim do cliente cobrando status', badge: 'Economia' },
  { chave: 'seat_ordering', nome: 'Comanda por Assento & Split Instantâneo', desc: 'Organização de pedidos por cadeira/pessoa e fechamento parcial com Pix em 1 clique sem confusão.', icone: 'ph-chair', categorias: ['Operação', 'Vendas'], preco: 'R$ 49/mês', roi: 'Zera tempo de fechamento em mesas de 10+ pessoas', badge: 'Agilidade' },
  { chave: 'bar_guardiao_chopp', nome: 'Guardião do Bar & Doses de Chopp', desc: 'Controle milimétrico de volume de barris (50L/30L), copos servidos, sangrias e prevenção de perdas.', icone: 'ph-beer-bottle', categorias: ['Operação', 'Financeiro'], preco: 'R$ 69/mês', roi: 'Economiza até R$ 2.500/mês em chopp não faturado', badge: 'Anti-Perda' },
  { chave: 'cardapio_multilingue_i18n', nome: 'Cardápio Multilíngue Turístico por IA', desc: 'Tradução gastronômica automática para 5 idiomas (EN, ES, FR, DE, ZH) e filtro de alérgenos.', icone: 'ph-translate', categorias: ['Vendas', 'Marketing'], preco: 'R$ 59/mês', roi: '+40% de conversão de clientes estrangeiros', badge: 'Internacional' },
  { chave: 'totem_fastpass', nome: 'Totem Fast-Pass & Reconhecimento VIP', desc: 'Identificação por CPF/QR Code com repetição do combo habitual em 1 toque e Pix dinâmico.', icone: 'ph-lightning', categorias: ['Hardware', 'Vendas'], preco: 'R$ 89/mês', roi: 'Reduz fila de autoatendimento de 90s para 15s', badge: 'Fast-Track' },
  { chave: 'backup_nuvem_blindado', nome: 'Sentinela de Backup Criptografado em Nuvem', desc: 'Disaster recovery diário com AES-256 às 04:00, verificação de integridade e restore em 1 clique.', icone: 'ph-shield-check', categorias: ['Gestão', 'Segurança'], preco: 'R$ 49/mês', roi: 'Proteção blindada contra queima de HD ou perdas', badge: 'Segurança' },
  { chave: 'menu_engenharia_lucro', nome: 'Engenharia de Cardápio BCG (Kasavana & Smith)', desc: 'Matriz analítica de Estrelas, Burros de Carga, Quebra-Cabeças e Cães para maximizar margem.', icone: 'ph-chart-polar', categorias: ['Inteligência', 'Financeiro'], preco: 'R$ 89/mês', roi: '+12% a +22% no lucro líquido do cardápio', badge: 'Margem Máxima' },
  { chave: 'pague_na_mesa', nome: 'Auto-Pagamento na Mesa via QR Code (TabPay & Gorjeta)', desc: 'Cliente consulta comanda na mesa, divide a conta, insere gorjeta e paga com Pix/Cartão instantâneo liberando a mesa.', icone: 'ph-qr-code', categorias: ['Vendas', 'Operação'], preco: 'R$ 49/mês + 0.89% Pix', roi: 'Gira mesas até 20 minutos mais rápido e zera filas no caixa', badge: 'Fintech Salão' },
  { chave: 'validade_anvisa_perdas', nome: 'Sentinela de Validades ANVISA & Etiquetas Térmicas', desc: 'RDC 216 ANVISA: geração automática de etiquetas térmicas de manipulação, alerta diário de vencimento e queima promocional de estoque.', icone: 'ph-barcode', categorias: ['Operação', 'Financeiro'], preco: 'R$ 69/mês', roi: 'Zera multas sanitárias e reduz desperdício de insumos em até 80%', badge: 'Zero Multas' },
  { chave: 'cotacao_b2b_fornecedores', nome: 'Central de Cotações B2B & Compras Coletivas', desc: 'Disparo de cotações automáticas para distribuidores via WhatsApp, matriz comparativa de menores preços e pool de compras coletivas.', icone: 'ph-shopping-cart-simple', categorias: ['Financeiro', 'Gestão'], preco: 'R$ 89/mês', roi: 'Economiza até 18% nos insumos e poupa 10h/mês de cotações manuais', badge: 'Economia B2B' },
  { chave: 'reputacao_google_ia', nome: 'Guardião de Reputação & Avaliações por IA (Google Maps/iFood)', desc: 'Filtro inteligente de NPS: avaliações 5 estrelas são direcionadas ao Google Maps; notas 1 a 3 alertam o gerente no WhatsApp para contenção.', icone: 'ph-star', categorias: ['Marketing', 'Vendas'], preco: 'R$ 59/mês', roi: 'Multiplica reviews 5 estrelas no Google e intercepta clientes insatisfeitos', badge: '5 Estrelas' },
  { chave: 'painel_tv_senhas', nome: 'Painel TV de Senhas & Digital Signage (Fast-Food)', desc: 'Transforma qualquer Smart TV em painel profissional com voz sintetizada (Pronto/Preparando) e carrossel de ofertas/combos lucrativos.', icone: 'ph-television', categorias: ['Hardware', 'Operação'], preco: 'R$ 39/mês', roi: 'Atendimento profissional de fast-food com voz e +20% em vendas de sobremesas', badge: 'Fast-Food TV' },
  { chave: 'encomendas_eventos', nome: 'Gestão de Encomendas, Buffets & Ceias', desc: 'Controle de vendas com data futura, adiantamento de 50% de sinal via Pix, orçamentos personalizados e calendário de produção da cozinha.', icone: 'ph-cake', categorias: ['Vendas', 'Operação'], preco: 'R$ 69/mês', roi: 'Organiza pedidos com data futura e garante sinal de 50% antecipado', badge: 'Eventos & Ceias' },
  { chave: 'redes_franquias', nome: 'Gestão Multi-Lojas, Redes e Franquias (Master Chain)', desc: 'Dashboard executivo consolidado multi-CNPJ, transferência de insumos entre matriz e filiais, e replicação de cardápio com 1 clique.', icone: 'ph-buildings', categorias: ['Gestão'], preco: 'R$ 149/mês por filial', roi: 'DRE consolidado, transferências entre lojas e replicação de cardápio', badge: 'Corporativo' },
  { chave: 'gift_card_wallet', nome: 'Gift Cards Corporativos & Saldo Pré-Pago VIP', desc: 'Venda de vouchers para presentes ou empresas e carteira pré-paga para clientes fiéis (consumo antecipado com bônus).', icone: 'ph-wallet', categorias: ['Vendas', 'Marketing'], preco: 'R$ 49/mês + 1% recarga', roi: 'Injeção imediata de capital de giro e fidelização de clientes', badge: 'Capital Giro' },
  { chave: 'antecipacao_recebiveis_giro', nome: 'Antecipação de Recebíveis & Crédito Giro', desc: 'Crédito giro no Pix antecipando cartões e repasses iFood na hora com taxa competitiva.', icone: 'ph-currency-dollar', categorias: ['Financeiro', 'Fintech'], preco: '3.2% spread', roi: 'Capital de giro na mesma hora via Pix', badge: 'Fintech Banking' },
  { chave: 'totem_kiosk_touchscreen', nome: 'Totem Kiosk Touchscreen Autoatendimento', desc: 'Transforme tablets em terminais de autoatendimento estilo fast-food com pagamento e senha.', icone: 'ph-device-tablet-speaker', categorias: ['Hardware', 'Operação'], preco: 'R$ 69/mês', roi: 'Economia de R$ 2.500/mês por atendente', badge: 'Hardware Kiosk' },
  { chave: 'trafego_hiperlocal_1clique', nome: 'Piloto de Tráfego Pago Hiperlocal 1-Clique', desc: 'Dispare anúncios no Instagram/Meta no raio de 3km com 1 toque para lotar terças e quartas.', icone: 'ph-megaphone-simple', categorias: ['Marketing'], preco: 'R$ 49/mês', roi: '+25 a +40 clientes nas noites fracas', badge: 'Tráfego Pago' },
  { chave: 'auditor_glosas_ifood', nome: 'Auditor de Repasses & Glosas do iFood', desc: 'Detecte cancelamentos indevidos e retenções no extrato do iFood com laudo de contestação.', icone: 'ph-magnifying-glass-plus', categorias: ['Fiscal', 'Financeiro'], preco: 'R$ 89/mês', roi: 'Recupera em média R$ 1.400/mês', badge: 'Auditor Fiscal' },
  { chave: 'tv_senhas_chamada_voz', nome: 'TV Chamador de Senhas com Voz em Português', desc: 'Transforme qualquer Smart TV em painel profissional com voz sintetizada para balcão e delivery.', icone: 'ph-television', categorias: ['Hardware', 'Operação'], preco: 'R$ 39/mês', roi: 'Zero aglomeração e retirada rápida', badge: 'Smart TV' },
  { chave: 'gorjeta_legal_13419', nome: 'Split de Gorjeta Legalizada (Lei nº 13.419)', desc: 'Calcula a retenção de encargos (20%/33%) e distribui por pontos via Pix diretamente aos garçons.', icone: 'ph-hand-coins', categorias: ['Fiscal', 'Equipe'], preco: 'R$ 69/mês + R$ 0,25/op', roi: 'Blindagem contra passivo trabalhista e equipe motivada', badge: 'Lei da Gorjeta' },
  { chave: 'antichurn_preditivo_whats', nome: 'Robô Preditivo Anti-Churn WhatsApp', desc: 'Detecta desvio do intervalo de compra e dispara cupom de resgate personalizado no WhatsApp.', icone: 'ph-whatsapp-logo', categorias: ['Marketing', 'Vendas'], preco: 'R$ 59/mês', roi: 'Recupera em média 28% dos clientes sumidos', badge: 'Anti-Churn IA' },
  { chave: 'gamificacao_salao_metas', nome: 'Gamificação do Salão & Venda Sugestiva', desc: 'Metas em tempo real no PDV para garçons venderem sobremesas e bebidas com comissão ao vivo.', icone: 'ph-trophy', categorias: ['Gestão', 'Equipe'], preco: 'R$ 59/mês', roi: '+15% a +25% de aumento no ticket médio', badge: 'Venda Sugestiva' },
  { chave: 'influencer_roi_rastreado', nome: 'Portal do Influencer com ROI Real', desc: 'Links e cupons rastreados para blogueiros gastronômicos com comissão paga apenas sobre vendas reais.', icone: 'ph-instagram-logo', categorias: ['Marketing'], preco: 'R$ 49/mês', roi: 'Fim do jantar de graça sem retorno comprovado', badge: 'Influencer ROI' },
  { chave: 'voucher_vr_antecipacao', nome: 'Conciliação & Antecipação VR/VA', desc: 'Audita taxas de Ticket, Sodexo e Alelo e antecipa recebíveis futuros via Pix em minutos.', icone: 'ph-credit-card', categorias: ['Financeiro', 'Fintech'], preco: 'R$ 89/mês + 3.5% spread', roi: 'Fluxo de caixa imediato sem 60 dias de espera', badge: 'VR/VA Antecipado' },
  { chave: 'drivethru_curbside_geofence', nome: 'Drive-Thru & Pegue-e-Leve Geofence', desc: 'Rastreia aproximação por GPS (300m) e entrega a sacola quente direto na vaga do carro.', icone: 'ph-car', categorias: ['Operação', 'Delivery'], preco: 'R$ 49/mês', roi: 'Retirada rápida sem fila nem vaga de estacionamento', badge: 'Drive-Thru' },
  { chave: 'rfid_pulseira_cashless', nome: 'Comanda RFID / Pulseira Cashless', desc: 'Elimina filas de fechamento de conta com consumo por aproximação em bares, baladas e eventos.', icone: 'ph-broadcast', categorias: ['Hardware', 'Operação'], preco: 'R$ 99/mês + R$ 0,30/op', roi: 'Aumento de 25% a 35% no consumo interno', badge: 'Cashless RFID' },
  { chave: 'hotel_room_service_pms', nome: 'Room Service & Integração PMS Hotéis', desc: 'Lança consumos de frigobar e restaurante direto na conta do quarto do hóspede no check-out.', icone: 'ph-bed', categorias: ['Gestão'], preco: 'R$ 149/mês', roi: 'Atende hotéis, resorts e pousadas sem retrabalho', badge: 'Hotelaria PMS' },
  { chave: 'perdas_avarias_barata_zero', nome: 'Auditor de Quebras & Barata Zero', desc: 'Controle fotográfico e financeiro de pratos quebrados, chopp derramado e insumos queimados.', icone: 'ph-trash', categorias: ['Operação', 'Financeiro'], preco: 'R$ 59/mês', roi: 'Economiza R$ 2k-5k/mês eliminando vazamentos', badge: 'Zero Desperdício' },
  { chave: 'reforma_tributaria_simulador', nome: 'Simulador Reforma Tributária (IBS/CBS)', desc: 'Calcula o impacto da transição tributária, aproveitamento de créditos de insumos e split payment.', icone: 'ph-calculator', categorias: ['Fiscal'], preco: 'R$ 99/mês', roi: 'Adequação preventiva à nova legislação', badge: 'Reforma 2026' },
  { chave: 'marmitas_b2b_corporativo', nome: 'Assinatura Corporativa de Refeições B2B', desc: 'Contratos recorrentes com empresas para fornecimento diário de marmitas com portal de escolha.', icone: 'ph-buildings', categorias: ['Vendas'], preco: 'R$ 79/mês + 1% faturamento', roi: 'Faturamento corporativo garantido e previsível', badge: 'Contratos B2B' },
  { chave: 'recrutador_gastronomico_flash', nome: 'Recrutador Flash de Equipe Gastronômica', desc: 'Disparo de vagas urgentes e triagem expressa de garçons, chapeiros e cozinheiros com score.', icone: 'ph-user-plus', categorias: ['Gestão'], preco: 'R$ 49/mês', roi: 'Contratação em minutos para noites de pico', badge: 'RH Express' },
  { chave: 'franquias_royalties_fpp', nome: 'Franquias & Master Franchising', desc: 'Apuração automática de royalties, fundo de propaganda e gestão de redes auditada pelo PDV.', icone: 'ph-tree-structure', categorias: ['Gestão'], preco: 'R$ 199/mês por franqueado', roi: 'Prestação de contas blindada para o franqueador', badge: 'Redes & Franquias' },
  { chave: 'polo_gastronomico_compartilhado', nome: 'Polo Gastronômico Delivery Compartilhado', desc: 'Carrinho unificado para múltiplos restaurantes da mesma praça ou vila com frete único.', icone: 'ph-storefront', categorias: ['Delivery'], preco: 'R$ 149/mês + 2% take-rate', roi: 'Ticket médio 40% maior reunindo múltiplos parceiros', badge: 'Praça de Alimentação' },
  { chave: 'antifurto_inventario_cego', nome: 'Sentinela de Inventário Cego (Carnes & Whisky)', desc: 'Contagem cega de 3 minutos por turno dos 10 itens mais caros com alerta imediato de desvio no WhatsApp.', icone: 'ph-eye', categorias: ['Operação', 'Segurança'], preco: 'R$ 79/mês', roi: 'Elimina R$ 3k-8k/mês em desvios internos', badge: 'Antifurto Cego' },
  { chave: 'fidelidade_tiers_vip', nome: 'Fidelidade por Níveis VIP (Bronze a Diamante)', desc: 'Níveis de prestígio com benefícios exclusivos, drink cortesia e cashback progressivo.', icone: 'ph-medal', categorias: ['Marketing'], preco: 'R$ 69/mês', roi: 'Eleva ticket médio e frequência de clientes fiéis', badge: 'Tiers VIP' },
  { chave: 'menuboard_tv_balcao', nome: 'Menu Board Digital para TVs de Balcão', desc: 'Exibição de cardápio digital em Smart TVs com troca automática por momento do dia.', icone: 'ph-monitor', categorias: ['Hardware', 'Vendas'], preco: 'R$ 49/mês por tela', roi: '+20% em combos e visual profissional de fast-food', badge: 'Menu Board TV' },
  { chave: 'satisfacao_ia_emocional', nome: 'Totem de Satisfação IA Emocional & Áudio', desc: 'Totem tátil de 4 emojis com transcrição e análise de sentimento em áudio com alerta crítico no WhatsApp.', icone: 'ph-smiley', categorias: ['Operação'], preco: 'R$ 39/mês', roi: 'Alerta em 5s no WhatsApp antes do cliente postar no Google', badge: 'Satisfação IA' },
  { chave: 'hub_multi_marketplace', nome: 'Hub Multi-Marketplace (Rappi + Uber Eats + 99Food)', desc: 'Unificação de todos os pedidos de delivery externos em uma única tela, dispensando múltiplos tablets no balcão.', icone: 'ph-arrows-merge', categorias: ['Delivery', 'Operação'], preco: 'R$ 129/mês', roi: 'Zera atrasos e multas de cancelamento em marketplaces', badge: 'Tier S' },
  { chave: 'sped_fiscal_automatico', nome: 'SPED Fiscal & Exportação Contábil Automática', desc: 'Geração e envio automático mensal de arquivos SPED EFD, XMLs de NFC-e e relatórios fiscais diretamente ao contador.', icone: 'ph-file-archive', categorias: ['Fiscal', 'Financeiro'], preco: 'R$ 99/mês', roi: 'Elimina 100% do estresse e tempo gasto com fechamento contábil', badge: 'Tier S' },
  { chave: 'preco_dinamico_happyhour', nome: 'Precificação Dinâmica & Happy Hour Automático', desc: 'Ajuste inteligente de preços por horário de pico, dia da semana ou lotação do salão, maximizando faturamento.', icone: 'ph-chart-line-up', categorias: ['Financeiro', 'Vendas'], preco: 'R$ 59/mês', roi: '+15% de receita aproveitando horários de maior procura', badge: 'Tier A' },
  { chave: 'nutricional_calorias', nome: 'Controle Nutricional & Tabela de Calorias', desc: 'Cálculo de calorias (kcal), macronutrientes, alérgenos e selos funcionais (vegano, sem glúten) para o cardápio.', icone: 'ph-heartbeat', categorias: ['Vendas', 'Operação'], preco: 'R$ 49/mês', roi: 'Atrai o público fitness e atende exigências de rotulagem', badge: 'Tier A' },
  { chave: 'desperdicio_pesagem_lixo', nome: 'Controle de Desperdício com Balança de Descarte', desc: 'Pesagem e registro fotográfico de sobras de buffet, pré-preparo e devoluções com metas diárias anti-desperdício.', icone: 'ph-trash', categorias: ['Operação', 'Financeiro'], preco: 'R$ 69/mês', roi: 'Economiza até R$ 3.500/mês eliminando vazamentos de insumos', badge: 'Tier A' },
  { chave: 'checklist_abertura_fechamento', nome: 'Checklist de Abertura & Fechamento com Fotos', desc: 'Listas de verificação operacionais obrigatórias para a equipe antes de abrir e fechar a casa com evidências.', icone: 'ph-check-square-offset', categorias: ['Operação', 'Gestão'], preco: 'R$ 49/mês', roi: 'Garante padrão de excelência e higiene em todos os turnos', badge: 'Tier A' },
  { chave: 'manutencao_preventiva', nome: 'Manutenção Preventiva de Equipamentos', desc: 'Ordens de serviço, cronograma de preventiva de freezers, fogões e coifas, e histórico de custos por máquina.', icone: 'ph-wrench', categorias: ['Operação', 'Gestão'], preco: 'R$ 59/mês', roi: 'Evita paradas repentinas no meio do almoço de domingo', badge: 'Tier B' },
  { chave: 'academia_restaurante', nome: 'Academia do Restaurante & Treinamento Onboarding', desc: 'Plataforma interna com cursos, vídeos de atendimento e quizzes para capacitar novos garçons e ajudantes em 48h.', icone: 'ph-graduation-cap', categorias: ['Equipe', 'Gestão'], preco: 'R$ 69/mês', roi: 'Reduz o tempo de adaptação de novos contratados em 70%', badge: 'Tier B' },
  { chave: 'iot_temperatura_haccp', nome: 'Monitoramento de Temperatura IoT (HACCP)', desc: 'Sensores inteligentes de temperatura para câmaras frias e freezers com alerta sonoro e no WhatsApp se esquentar.', icone: 'ph-thermometer', categorias: ['Hardware', 'Segurança'], preco: 'R$ 79/mês', roi: 'Evita perda de milhares de reais em carnes e laticínios', badge: 'Tier B' },
  { chave: 'atendente_social_ia', nome: 'Atendente Virtual para Instagram & Facebook', desc: 'Robô com inteligência artificial para responder direct no Instagram, tirar dúvidas do cardápio e fechar pedidos.', icone: 'ph-chat-circle-dots', categorias: ['Marketing', 'Vendas'], preco: 'R$ 79/mês', roi: 'Zero perda de clientes que perguntam pelo Instagram à noite', badge: 'Tier B' },
  { chave: 'benchmark_anonimo_setor', nome: 'Benchmark Anônimo do Setor Gastronômico', desc: 'Comparativo do CMV, ticket médio e giro do seu restaurante contra a média do mercado da sua cidade e nicho.', icone: 'ph-scales', categorias: ['Inteligência', 'Financeiro'], preco: 'R$ 49/mês', roi: 'Descubra se está pagando caro em insumos ou cobrando pouco', badge: 'Tier C' },
  { chave: 'app_funcionario_ponto', nome: 'App do Funcionário (Ponto, Holerite & Escalas)', desc: 'Portal exclusivo para colaboradores visualizarem seus pontos, escalas de folga, gorjetas e comunicados do chefe.', icone: 'ph-user-list', categorias: ['Equipe', 'Gestão'], preco: 'R$ 49/mês', roi: 'Transparência total e comunicação sem ruídos com a equipe', badge: 'Tier C' },
  { chave: 'valet_estacionamento', nome: 'Valet & Controle de Estacionamento', desc: 'Registro de entrada e saída de veículos de clientes com foto de avarias, solicitação de carro e cobrança.', icone: 'ph-car-profile', categorias: ['Operação'], preco: 'R$ 49/mês', roi: 'Segurança jurídica contra falsas avarias e agilidade na saída', badge: 'Tier C' },
  { chave: 'gestao_playlist_ambiente', nome: 'Ambientação Sonora & Playlist por Horário', desc: 'Controle de trilha sonora integrada para almoço executivo, happy hour animado ou jantar romântico.', icone: 'ph-music-notes', categorias: ['Operação', 'Entretenimento'], preco: 'R$ 39/mês', roi: 'Aumenta o tempo de permanência e consumo em 18%', badge: 'Tier C' },
  { chave: 'portal_cliente_vip', nome: 'Portal do Cliente & Re-Pedir em 1 Clique', desc: 'Área exclusiva onde o cliente vê seu histórico de pedidos, salva pratos favoritos e repete pedidos em segundos.', icone: 'ph-user-circle', categorias: ['Vendas', 'Marketing'], preco: 'R$ 49/mês', roi: 'Aumenta a recompra espontânea de clientes habituais', badge: 'Tier C' }
];

const FUNCOES_CONFIG_KEY = function(chave) { return 'mod_' + chave; };

function createAdminRouter() {
  const router = Router();
  const getDb = () => getContext().getTenantDb();
  const { withTenant, verificarToken, io, masterDb, resolveTenantId, jwt, JWT_SECRET } = getContext();

  function lerStatusImplementacao(tid, cb) {
    if (!masterDb) return cb({});
    masterDb.all(
      `SELECT feature, status, mensagem, responsavel_nome, responsavel_tipo, observacao, criado_em, resolvido_em
         FROM solicitacoes_features WHERE restaurante_id = ? ORDER BY id DESC LIMIT 200`,
      [tid],
      (err, rows) => {
        const mapa = {};
        (rows || []).forEach(r => { if (!mapa[r.feature]) mapa[r.feature] = r; });
        cb(mapa);
      }
    );
  }

  // GET /api/configuracoes
  router.get('/configuracoes', (req, res) => {
    withTenant(req, () => {
      getDb().all('SELECT * FROM configuracoes', [], (err, rows) => {
        const configMap = {};
        if (rows) rows.forEach(r => { configMap[r.chave] = r.valor; });
        res.json(configMap);
      });
    });
  });

  // POST /api/configuracoes
  router.post('/configuracoes', (req, res) => {
    const configs = req.body || {};
    const entries = Object.entries(configs);
    let done = 0;
    if (entries.length === 0) return res.json({ success: true });
    withTenant(req, () => {
      const db = getDb();
      entries.forEach(([chave, valor]) => {
        const valStr = typeof valor === 'object' ? JSON.stringify(valor) : String(valor);
        db.run(
          'INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = ?',
          [chave, valStr, valStr],
          () => {
            done++;
            if (done === entries.length) res.json({ success: true });
          }
        );
      });
    });
  });

  // GET /api/funcoes
  router.get('/funcoes', (req, res) => {
    withTenant(req, () => {
      const tid = (resolveTenantId && resolveTenantId(req)) || 1;
      const features = (global.getTenantFeaturesSync && global.getTenantFeaturesSync(tid)) || {};
      getDb().all(`SELECT chave, valor FROM configuracoes WHERE chave LIKE 'mod_%'`, [], (err, rows) => {
        const mods = {};
        if (!err && rows) rows.forEach(r => { mods[r.chave] = r.valor; });
        lerStatusImplementacao(tid, (solsMap) => {
          const lista = FUNCOES_MODULOS.map(f => {
            const available = !!features[f.chave];
            const cfgKey = FUNCOES_CONFIG_KEY(f.chave);
            const raw = mods[cfgKey];
            const enabled = raw === undefined ? available : (raw === 'true' || raw === true);
            const sol = solsMap[f.chave];
            let statusImpl = null;
            let responsavel = null;
            if (available) {
              statusImpl = 'liberada';
            } else if (sol) {
              if (sol.status === 'em_implementacao') { statusImpl = 'em_implementacao'; responsavel = sol.responsavel_nome; }
              else if (sol.status === 'implementada' || sol.status === 'aprovada') { statusImpl = 'implementada'; responsavel = sol.responsavel_nome; }
              else if (sol.status === 'recusada') { statusImpl = 'recusada'; }
              else { statusImpl = 'solicitada'; }
            }
            return {
              chave: f.chave, nome: f.nome, desc: f.desc, icone: f.icone || null, categorias: f.categorias || [],
              preco: f.preco || 'Consulte', roi: f.roi || null, badge: f.badge || null,
              available, enabled: !!enabled, override: available, cfgKey, status_impl: statusImpl, responsavel_nome: responsavel,
              solicitacao_mensagem: sol ? sol.mensagem : null, solicitacao_id: sol ? sol.id : null, solicitacao_status: sol ? sol.status : null
            };
          });
          res.json({ success: true, features: lista });
        });
      });
    });
  });

  // GET /api/loja/plugins
  router.get('/loja/plugins', (req, res) => {
    withTenant(req, () => {
      const tid = (resolveTenantId && resolveTenantId(req)) || 1;
      const features = (global.getTenantFeaturesSync && global.getTenantFeaturesSync(tid)) || {};
      getDb().all(`SELECT chave, valor FROM configuracoes WHERE chave LIKE 'mod_%'`, [], (err, rows) => {
        const mods = {};
        if (!err && rows) rows.forEach(r => { mods[r.chave] = r.valor; });
        lerStatusImplementacao(tid, (solsMap) => {
          const catalogo = FUNCOES_MODULOS.map(f => {
            const available = !!features[f.chave];
            const raw = mods[FUNCOES_CONFIG_KEY(f.chave)];
            const enabled = raw === undefined ? available : (raw === 'true' || raw === true);
            const sol = solsMap[f.chave];
            let estado = 'disponivel'; 
            if (available) estado = 'liberado';
            else if (sol) {
              if (sol.status === 'em_implementacao') estado = 'em_implementacao';
              else if (sol.status === 'implementada' || sol.status === 'aprovada') estado = 'liberado';
              else if (sol.status === 'recusada') estado = 'recusado';
              else estado = 'solicitado';
            }
            return {
              chave: f.chave, nome: f.nome, desc: f.desc, categorias: f.categorias || [], icone: f.icone || null,
              preco: f.preco || 'Consulte', roi: f.roi || null, badge: f.badge || null, estado, ativo: !!enabled, available,
              responsavel_nome: (sol && (sol.status === 'em_implementacao' || sol.status === 'implementada')) ? sol.responsavel_nome : null,
              solicitacao_id: sol ? sol.id : null, solicitacao_mensagem: sol ? sol.mensagem : null, solicitacao_status: sol ? sol.status : null
            };
          });
          res.json({ success: true, catalogo });
        });
      });
    });
  });

  // POST /api/funcoes/ativar
  router.post('/funcoes/ativar', verificarToken, (req, res) => {
    const { feature, enabled } = req.body || {};
    if (!feature) return res.status(400).json({ success: false, error: 'Função não informada.' });
    const def = FUNCOES_MODULOS.find(f => f.chave === feature);
    if (!def) return res.status(400).json({ success: false, error: 'Função desconhecida.' });
    const tid = (resolveTenantId && resolveTenantId(req)) || 1;
    const features = (global.getTenantFeaturesSync && global.getTenantFeaturesSync(tid)) || {};
    if (!features[feature]) {
      return res.status(403).json({ success: false, error: 'Esta função não está liberada para o seu restaurante. Solicite a ativação ao super admin.' });
    }
    withTenant(req, () => {
      const cfgKey = FUNCOES_CONFIG_KEY(feature);
      const val = enabled ? 'true' : 'false';
      getDb().run(`INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [cfgKey, val], (e) => {
        if (e) return res.status(500).json({ success: false, error: e.message });
        if (io) setTimeout(() => io.emit('configuracoes_atualizadas'), 300);
        res.json({ success: true, mensagem: 'Função atualizada com sucesso!' });
      });
    });
  });

  // POST /api/funcoes/solicitar
  router.post('/funcoes/solicitar', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader ? authHeader.split(' ')[1] : (req.body && req.body.token);

    const processarSolicitacao = (tid, autorNome) => {
      if (!masterDb) return res.status(500).json({ success: false, error: 'Banco master não disponível para solicitação' });
      const { feature, mensagem, telefone } = req.body || {};
      const chave = feature || 'nova_solicitacao';
      const def = FUNCOES_MODULOS.find(f => f.chave === chave);
      const nome = def ? def.nome : chave;
      const msgFinal = (mensagem || '').trim() || `Interesse em adquirir o módulo: ${nome}${def && def.preco ? ' (' + def.preco + ')' : ''}`;
      const descRegistro = telefone ? `${msgFinal} • WhatsApp de contato: ${telefone}` : msgFinal;

      masterDb.get(`SELECT nome FROM restaurantes WHERE id = ?`, [tid], (errR, rowR) => {
        const nomeRestaurante = (errR || !rowR) ? ('Restaurante #' + tid) : rowR.nome;
        masterDb.run(
          `INSERT INTO solicitacoes_features (restaurante_id, feature, mensagem, criado_em) VALUES (?, ?, ?, datetime('now','localtime'))`,
          [tid, chave, descRegistro],
          function (err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            const novaSol = {
              id: this.lastID, restaurante_id: tid, restaurante_nome: nomeRestaurante, feature: chave,
              nome_modulo: nome, mensagem: descRegistro, autor: autorNome || 'Dono/Administrador'
            };
            if (io) {
              try { io.to('admin').emit('nova_solicitacao_feature', novaSol); } catch (e2) {}
              try { io.emit('nova_solicitacao_modulo_super', novaSol); } catch (e3) {}
            }
            res.json({ success: true, id: this.lastID, mensagem: `Solicitação do módulo "${nome}" recebida com sucesso!` });
          }
        );
      });
    };

    if (!token) {
      return processarSolicitacao((resolveTenantId && resolveTenantId(req)) || 1, 'Dono (Painel Local)');
    }
    jwt.verify(token, JWT_SECRET, (errToken, decoded) => {
      if (errToken || !decoded) return processarSolicitacao((resolveTenantId && resolveTenantId(req)) || 1, 'Dono (Painel)');
      processarSolicitacao(decoded.restaurante_id || (resolveTenantId && resolveTenantId(req)) || 1, decoded.nome || decoded.username || 'Dono');
    });
  });

  // GET /api/config/produtos
  router.get('/config/produtos', (req, res) => {
    withTenant(req, () => {
      getDb().all('SELECT id, nome, preco, emoji, categoria, visibilidade, status FROM produtos WHERE status != \'inativo\' ORDER BY nome', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
      });
    });
  });

  // Rota de compatibilidade (mocks e checks de status)
  router.get('/plugins/admin', (req, res) => res.json({ success: true, plugins: [] }));
  router.get('/plugins/list', (req, res) => res.json({ success: true, plugins: [] }));
  router.get('/mensagens', (req, res) => res.json({ success: true, mensagens: [] }));
  router.get('/licenca/status-quarentena', (req, res) => res.json({ status: 'ativa', quarentena: false, dias_restantes: 30 }));
  router.post('/pwa/telemetria', (req, res) => res.json({ success: true }));
  router.post('/seguranca/reportar-violacao', (req, res) => res.json({ success: true }));

  // GET /api/status-bloqueio
  router.get('/status-bloqueio', (req, res) => {
    withTenant(req, () => {
      getDb().get(`SELECT valor FROM configuracoes WHERE chave = 'restaurant_status'`, [], (err, row) => {
        const bloqueado = (row && row.valor === 'bloqueado') || global.__RESTAURANT_BLOQUEADO === true;
        getDb().get(`SELECT valor FROM configuracoes WHERE chave = 'bloqueado_motivo'`, [], (err2, row2) => {
          res.json({
            bloqueado,
            motivo: (row2 && row2.valor) || global.__BLOQUEIO_MOTIVO || 'Instalação suspensa pela administração central.',
            contato: 'Suporte Técnico Chef Cozinha'
          });
        });
      });
    });
  });

  // POST /api/sync/ativar-local
  router.post('/sync/ativar-local', express.json(), async (req, res) => {
    const { chave, hubUrl, email, senha } = req.body || {};
    const superUrl = (hubUrl || process.env.SUPER_ADMIN_URL || (global.deploymentConfig && global.deploymentConfig.getSuperAdminUrl()) || '').replace(/\/+$/, '');
    
    try {
      let payload = {};
      if (chave) payload = { type: 'key', chave_ativacao: chave };
      else if (email && senha) payload = { type: 'login', email, senha };
      else return res.status(400).json({ ok: false, error: 'Chave de ativação ou credenciais são obrigatórias.' });

      let result = null;
      if (superUrl) {
        const resp = await fetch(`${superUrl}/api/sync/activate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.assign({}, payload, { hostname: require('os').hostname(), platform: require('os').platform() }))
        });
        result = await resp.json();
      } else if (masterDb) {
        const chaveNorm = String(chave || '').trim().toUpperCase();
        const r = await new Promise((resolve, reject) => {
          masterDb.get(
            `SELECT * FROM restaurantes WHERE UPPER(TRIM(COALESCE(chave_ativacao,''))) = ? OR UPPER(TRIM('CHEF-LOCAL-' || printf('%04d', id))) = ? LIMIT 1`,
            [chaveNorm, chaveNorm],
            (e, row) => e ? reject(e) : resolve(row)
          );
        });
        if (r) {
          result = { ok: true, success: true, restaurant_id: r.id, restaurant_name: r.nome, plan: r.licenca || 'premium', activation_key: chaveNorm };
        } else {
          result = { ok: false, error: 'Chave inválida no banco local.' };
        }
      } else {
        return res.status(400).json({ ok: false, error: 'URL do Super Admin não configurada e banco master inexistente.' });
      }

      if (!result || !result.ok) return res.status(400).json({ ok: false, error: (result && result.error) || 'Falha ao ativar chave.' });

      withTenant(req, () => {
        const db = getDb();
        db.serialize(() => {
          db.run(`INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('restaurant_status', 'ativo')`);
          db.run(`DELETE FROM configuracoes WHERE chave = 'bloqueado_motivo'`);
          if (result.restaurant_name) db.run(`INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('nome_restaurante', ?)`, [result.restaurant_name]);
          if (result.plan) db.run(`INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('licenca', ?)`, [result.plan]);
          if (result.activation_key) db.run(`INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('chave_ativacao', ?)`, [result.activation_key]);
        });
      });

      global.__RESTAURANT_BLOQUEADO = false;
      global.__BLOQUEIO_MOTIVO = null;

      if (io) {
        io.emit('sistema_desbloqueado_remoto');
        io.emit('plano_atualizado', { plan: result.plan });
      }

      res.json({ ok: true, success: true, restaurant_name: result.restaurant_name, plan: result.plan, message: result.message || 'Instância ativada e conectada com sucesso!' });
    } catch (err) {
      console.error('[Ativacao Local] Erro:', err.message);
      res.status(500).json({ ok: false, error: 'Erro de comunicação ao ativar: ' + err.message });
    }
  });

  return router;
}

module.exports = { createAdminRouter };
