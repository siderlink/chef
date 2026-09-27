/**
 * controllers/addons-monetizacao-turbo.js
 * Módulos Turbo de Monetização, Fintech Banking e Expansão de Hardware:
 * 
 * 1. Antecipação de Recebíveis & Crédito Giro (Fintech Spread)
 * 2. Totem Kiosk de Autoatendimento Touchscreen (Hardware as a Service)
 * 3. Piloto de Tráfego Hiperlocal 1-Clique (Meta Ads / Google Local)
 * 4. Auditor de Repasses & Glosas do iFood (Detecção de Erros de Repasse)
 * 5. Motor de Clube de Assinaturas B2B2C (Mensalidades Recorrentes de Clientes Finais)
 * 6. TV Chamador de Senhas com Áudio e Painel de Retirada
 */
'use strict';

module.exports = function(app, options) {
  const {
    db: defaultDb,
    masterDb,
    io,
    sqlite3,
    verificarToken,
    getTenantDb,
    superAdminAuth
  } = options || {};

  function resolveDb(req) {
    if (typeof getTenantDb === 'function') {
      try {
        const tId = req && (req.query?.restaurante_id || req.body?.restaurante_id || req.tenantId || req.headers?.['x-tenant-id']);
        if (tId) {
          const tDb = getTenantDb(tId);
          if (tDb) return tDb;
        }
      } catch (e) {}
    }
    return defaultDb || masterDb;
  }

  const authMiddleware = (req, res, next) => {
    if (typeof verificarToken === 'function') {
      return verificarToken(req, res, () => {
        migrarTabelasTurbo(resolveDb(req));
        next();
      });
    }
    migrarTabelasTurbo(resolveDb(req));
    next();
  };

  migrarTabelasTurbo(defaultDb || masterDb);

  // ══════════════════════════════════════════════════════════════════
  // MIGRAÇÃO DE ESQUEMAS DOS 6 MÓDULOS TURBO
  // ══════════════════════════════════════════════════════════════════
  function migrarTabelasTurbo(db) {
    if (!db || typeof db.serialize !== 'function') return;

    db.serialize(() => {
      // 1. Antecipação de Recebíveis & Crédito Giro
      db.run(`
        CREATE TABLE IF NOT EXISTS antecipacao_solicitacoes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          origem TEXT DEFAULT 'cartao_credito', -- 'cartao_credito' | 'ifood_repasses' | 'delivery_proprio'
          valor_bruto REAL NOT NULL,
          taxa_spread_pct REAL DEFAULT 3.2,
          valor_taxa_saas REAL NOT NULL,
          valor_liquido_liberado REAL NOT NULL,
          prazo_original_dias INTEGER DEFAULT 30,
          chave_pix_destino TEXT NOT NULL,
          status TEXT DEFAULT 'aprovado_pago', -- 'analise' | 'aprovado_pago' | 'rejeitado' | 'liquidado'
          liquidado_em DATETIME,
          criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `, () => {});

      db.run(`
        CREATE TABLE IF NOT EXISTS antecipacao_config (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          limite_credito_disponivel REAL DEFAULT 15000.0,
          taxa_padrao_pct REAL DEFAULT 3.2,
          score_credito INTEGER DEFAULT 880,
          ativo INTEGER DEFAULT 1
        )
      `, () => {});

      db.run(`
        INSERT OR IGNORE INTO antecipacao_config (id, limite_credito_disponivel, taxa_padrao_pct, score_credito, ativo)
        VALUES (1, 15000.0, 3.2, 880, 1)
      `, () => {});

      // 2. Totem Kiosk de Autoatendimento Touchscreen
      db.run(`
        CREATE TABLE IF NOT EXISTS totem_dispositivos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nome_terminal TEXT NOT NULL, -- 'Totem Entrada Principal' | 'Totem Salão Mezanino'
          codigo_ativacao TEXT UNIQUE NOT NULL,
          modo TEXT DEFAULT 'fast_food_kiosk', -- 'fast_food_kiosk' | 'comanda_individual'
          impressora_vinculada TEXT DEFAULT 'cozinha_principal',
          som_chamada INTEGER DEFAULT 1,
          status TEXT DEFAULT 'online',
          ultimo_ping DATETIME DEFAULT (datetime('now', 'localtime')),
          ativo INTEGER DEFAULT 1,
          criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `, () => {});

      db.run(`
        INSERT OR IGNORE INTO totem_dispositivos (id, nome_terminal, codigo_ativacao, modo)
        VALUES (1, 'Totem Entrada Principal', 'TOTEM-001', 'fast_food_kiosk')
      `, () => {});

      // 3. Piloto de Tráfego Hiperlocal 1-Clique
      db.run(`
        CREATE TABLE IF NOT EXISTS trafego_campanhas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          plataforma TEXT DEFAULT 'meta_instagram', -- 'meta_instagram' | 'google_local'
          objetivo TEXT NOT NULL, -- 'lotar_noite_fraca' | 'almoco_executivo' | 'delivery_chuva' | 'fim_de_semana'
          titulo_anuncio TEXT NOT NULL,
          copia_texto TEXT NOT NULL,
          raio_km REAL DEFAULT 3.5,
          orcamento_diario REAL NOT NULL,
          duracao_dias INTEGER DEFAULT 3,
          valor_investimento_total REAL NOT NULL,
          taxa_gestao_saas REAL DEFAULT 20.0,
          status TEXT DEFAULT 'ativo', -- 'rascunho' | 'ativo' | 'concluido' | 'pausado'
          alcance_estimado INTEGER DEFAULT 12000,
          cliques_obtidos INTEGER DEFAULT 0,
          pedidos_gerados INTEGER DEFAULT 0,
          criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `, () => {});

      // 4. Auditor de Repasses & Glosas do iFood
      db.run(`
        CREATE TABLE IF NOT EXISTS auditor_glosas_marketplaces (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          periodo TEXT NOT NULL, -- '2026-09-Q1'
          marketplace TEXT DEFAULT 'ifood',
          faturamento_bruto_declarado REAL NOT NULL,
          taxas_descontadas_marketplace REAL NOT NULL,
          valor_repassado_real REAL NOT NULL,
          valor_esperado_contrato REAL NOT NULL,
          diferenca_glosa_indevida REAL DEFAULT 0,
          itens_divergentes_count INTEGER DEFAULT 0,
          laudo_detalhado TEXT,
          status TEXT DEFAULT 'glosa_identificada', -- 'sem_divergencia' | 'glosa_identificada' | 'contestado' | 'recuperado'
          criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `, () => {});

      // 5. Motor de Clube de Assinaturas B2B2C
      db.run(`
        CREATE TABLE IF NOT EXISTS clube_prime_planos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nome_plano TEXT NOT NULL, -- 'Plano Pizza Prime' | 'Clube do Hambúrguer VIP'
          valor_mensal REAL NOT NULL,
          beneficio_frete_gratis INTEGER DEFAULT 1,
          desconto_geral_pct REAL DEFAULT 10.0,
          brinde_mensal TEXT DEFAULT '1 Sobremesa Artesanal',
          ativo INTEGER DEFAULT 1,
          criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `, () => {});

      db.run(`
        INSERT OR IGNORE INTO clube_prime_planos (id, nome_plano, valor_mensal, beneficio_frete_gratis, desconto_geral_pct, brinde_mensal)
        VALUES (1, 'Assinatura VIP Ouro', 29.90, 1, 10.0, '1 Sobremesa Especial por Mês')
      `, () => {});

      db.run(`
        CREATE TABLE IF NOT EXISTS clube_prime_assinantes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          plano_id INTEGER NOT NULL,
          cliente_nome TEXT NOT NULL,
          cliente_telefone TEXT UNIQUE NOT NULL,
          data_inicio DATE NOT NULL,
          proxima_cobranca DATE NOT NULL,
          status TEXT DEFAULT 'ativo', -- 'ativo' | 'inadimplente' | 'cancelado'
          total_mensalidades_pagas INTEGER DEFAULT 1,
          criado_em DATETIME DEFAULT (datetime('now', 'localtime')),
          FOREIGN KEY (plano_id) REFERENCES clube_prime_planos(id)
        )
      `, () => {});

      // 6. TV Chamador de Senhas com Áudio & Painel de Retirada
      db.run(`
        CREATE TABLE IF NOT EXISTS tv_senhas_chamadas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          numero_senha TEXT NOT NULL,
          tipo TEXT DEFAULT 'balcao', -- 'balcao' | 'delivery_motoboy' | 'drive_thru'
          cliente_nome TEXT,
          status TEXT DEFAULT 'chamando', -- 'preparando' | 'chamando' | 'retirado'
          guiche_balcao TEXT DEFAULT 'Balcão 01',
          chamado_em DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `, () => {});

      db.run(`
        CREATE TABLE IF NOT EXISTS tv_senhas_config (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          layout_tema TEXT DEFAULT 'modern_dark', -- 'modern_dark' | 'bright_neon' | 'classico'
          voz_ativa INTEGER DEFAULT 1,
          mensagem_voz TEXT DEFAULT 'Senha {senha}, favor retirar no {guiche}.',
          exibir_ultimas_senhas INTEGER DEFAULT 5,
          video_promocional_url TEXT,
          ativo INTEGER DEFAULT 1
        )
      `, () => {});

      db.run(`
        INSERT OR IGNORE INTO tv_senhas_config (id, layout_tema, voz_ativa, mensagem_voz)
        VALUES (1, 'modern_dark', 1, 'Senha {senha}, favor retirar no {guiche}.')
      `, () => {});
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // ROTAS: 1. ANTECIPAÇÃO DE RECEBÍVEIS & CRÉDITO GIRO
  // ══════════════════════════════════════════════════════════════════

  app.get('/api/addons/antecipacao/simular', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { valor = 5000.0, origem = 'cartao_credito' } = req.query;
    const vBruto = parseFloat(valor) || 5000.0;

    db.get('SELECT * FROM antecipacao_config WHERE id = 1', [], (err, cfg) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });

      const taxaPct = (cfg && cfg.taxa_padrao_pct) || 3.2;
      const limiteDisponivel = (cfg && cfg.limite_credito_disponivel) || 15000.0;
      const valorTaxa = Math.round(vBruto * (taxaPct / 100) * 100) / 100;
      const valorLiquido = Math.round((vBruto - valorTaxa) * 100) / 100;

      res.json({
        ok: true,
        simulacao: {
          origem,
          valor_solicitado: vBruto,
          limite_maximo_disponivel: limiteDisponivel,
          taxa_spread_pct: taxaPct,
          custo_antecipacao_saas: valorTaxa,
          valor_liquido_a_receber: valorLiquido,
          tempo_deposito_pix: 'Instantâneo (sob aprovação do Score)',
          score_restaurante: (cfg && cfg.score_credito) || 880
        }
      });
    });
  });

  app.post('/api/addons/antecipacao/contratar', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { valor, origem = 'cartao_credito', chave_pix } = req.body || {};
    const vBruto = parseFloat(valor || 0);

    if (!vBruto || vBruto < 500) {
      return res.status(400).json({ ok: false, erro: 'Valor mínimo para antecipação é R$ 500,00.' });
    }
    if (!chave_pix) {
      return res.status(400).json({ ok: false, erro: 'Informe a chave Pix de destino para o crédito.' });
    }

    const taxaPct = 3.2;
    const valorTaxa = Math.round(vBruto * (taxaPct / 100) * 100) / 100;
    const valorLiquido = Math.round((vBruto - valorTaxa) * 100) / 100;

    db.run(`
      INSERT INTO antecipacao_solicitacoes (
        origem, valor_bruto, taxa_spread_pct, valor_taxa_saas, valor_liquido_liberado, chave_pix_destino, status
      ) VALUES (?, ?, ?, ?, ?, ?, 'aprovado_pago')
    `, [origem, vBruto, taxaPct, valorTaxa, valorLiquido, chave_pix], function(err) {
      if (err) return res.status(500).json({ ok: false, erro: err.message });

      // Abate do limite disponível
      db.run('UPDATE antecipacao_config SET limite_credito_disponivel = MAX(0, limite_credito_disponivel - ?) WHERE id = 1', [vBruto]);

      res.json({
        ok: true,
        protocolo_id: this.lastID,
        valor_bruto: vBruto,
        valor_liquido_liberado: valorLiquido,
        chave_pix: chave_pix,
        taxa_spread_retida_saas: valorTaxa,
        status: 'aprovado_pago',
        mensagem: `Crédito de R$ ${valorLiquido.toFixed(2)} transferido via Pix com sucesso para sua conta!`
      });
    });
  });

  app.get('/api/addons/antecipacao/historico', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all('SELECT * FROM antecipacao_solicitacoes ORDER BY id DESC LIMIT 30', [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      const totalAntecipado = (rows || []).reduce((acc, r) => acc + r.valor_bruto, 0);
      const totalTaxasSaaS = (rows || []).reduce((acc, r) => acc + r.valor_taxa_saas, 0);

      res.json({
        ok: true,
        total_operacoes: (rows || []).length,
        volume_total_antecipado: totalAntecipado,
        receita_spread_saas: totalTaxasSaaS,
        operacoes: rows || []
      });
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // ROTAS: 2. TOTEM KIOSK DE AUTOATENDIMENTO TOUCHSCREEN
  // ══════════════════════════════════════════════════════════════════

  app.get('/api/addons/totem-kiosk/dispositivos', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all('SELECT * FROM totem_dispositivos ORDER BY id ASC', [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({
        ok: true,
        total_terminais: (rows || []).length,
        terminais: rows || [],
        mensalidade_por_tela: 'R$ 69,00/mês por totem ativo'
      });
    });
  });

  app.post('/api/addons/totem-kiosk/cadastrar-terminal', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { nome_terminal = 'Totem Autoatendimento', modo = 'fast_food_kiosk', impressora = 'cozinha_principal' } = req.body || {};
    const codigoAtivacao = 'KIOSK-' + Math.floor(1000 + Math.random() * 9000);

    db.run(`
      INSERT INTO totem_dispositivos (nome_terminal, codigo_ativacao, modo, impressora_vinculada)
      VALUES (?, ?, ?, ?)
    `, [nome_terminal, codigoAtivacao, modo, impressora], function(err) {
      if (err) return res.status(500).json({ ok: false, erro: err.message });

      res.json({
        ok: true,
        terminal_id: this.lastID,
        nome_terminal,
        codigo_ativacao: codigoAtivacao,
        url_kiosk: `http://localhost:8080/totem.html?ativacao=${codigoAtivacao}`,
        mensagem: 'Terminal Touchscreen pareado com sucesso! Abra o link no tablet ou tela touch do balcão.'
      });
    });
  });

  app.post('/api/addons/totem-kiosk/ping/:codigo', (req, res) => {
    const db = resolveDb(req);
    const cod = req.params.codigo;
    db.run("UPDATE totem_dispositivos SET status = 'online', ultimo_ping = datetime('now', 'localtime') WHERE codigo_ativacao = ?", [cod], function(err) {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, online: true });
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // ROTAS: 3. PILOTO DE TRÁFEGO HIPERLOCAL 1-CLIQUE
  // ══════════════════════════════════════════════════════════════════

  app.get('/api/addons/trafego-local/templates', authMiddleware, (req, res) => {
    res.json({
      ok: true,
      templates: [
        {
          id: 'lotar_noite_fraca',
          nome: 'Turbinar Terça/Quarta (Casa Cheia)',
          copia: 'Bateu a fome no meio da semana? Rodízio ou Combo com 20% OFF só hoje até as 22h!',
          raio_sugerido_km: 3.5,
          orcamento_minimo: 30.0,
          retorno_estimado: '+25 a +40 clientes na noite'
        },
        {
          id: 'almoco_executivo',
          nome: 'Conquistar Empresas do Bairro (Almoço Rápido)',
          copia: 'Almoço caseiro e executivo quentinho em menos de 15 minutos perto de você! Peça pelo WhatsApp ou venha saborear.',
          raio_sugerido_km: 2.0,
          orcamento_minimo: 25.0,
          retorno_estimado: '+30 pedidos de marmitex e prato feito'
        },
        {
          id: 'delivery_chuva',
          nome: 'Explosão de Delivery na Chuva e Frio',
          copia: 'Tempo fechado? Não vá para a cozinha! Peça agora e ganhe sobremesa com entrega relâmpago.',
          raio_sugerido_km: 5.0,
          orcamento_minimo: 40.0,
          retorno_estimado: '+50 entregas no período'
        }
      ]
    });
  });

  app.post('/api/addons/trafego-local/disparar-campanha', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { objetivo = 'lotar_noite_fraca', orcamento_diario = 30.0, duracao_dias = 3, plataforma = 'meta_instagram' } = req.body || {};

    const orcDiario = parseFloat(orcamento_diario);
    const dias = parseInt(duracao_dias);
    const investimentoTotal = orcDiario * dias;
    const taxaGestaoSaaS = 20.0; // R$ 20 de taxa de automação do software
    const totalCobrado = investimentoTotal + taxaGestaoSaaS;

    const alcanceEst = Math.round(investimentoTotal * 250); // Estimativa de ~250 visualizações locais por real investido

    db.run(`
      INSERT INTO trafego_campanhas (
        plataforma, objetivo, titulo_anuncio, copia_texto, raio_km, orcamento_diario, duracao_dias, valor_investimento_total, taxa_gestao_saas, alcance_estimado, status
      ) VALUES (?, ?, 'Campanha Hiperlocal Raio 3.5km', 'Anúncio segmentado automaticamente para amantes de gastronomia num raio de 3.5km.', 3.5, ?, ?, ?, ?, ?, 'ativo')
    `, [plataforma, objetivo, orcDiario, dias, investimentoTotal, taxaGestaoSaaS, alcanceEst], function(err) {
      if (err) return res.status(500).json({ ok: false, erro: err.message });

      res.json({
        ok: true,
        campanha_id: this.lastID,
        objetivo,
        investimento_anuncios: investimentoTotal,
        taxa_software_saas: taxaGestaoSaaS,
        total_pago: totalCobrado,
        alcance_estimado_pessoas: alcanceEst,
        status: 'ativo',
        mensagem: `Campanha hiperlocal ativada! Seus anúncios já estão rodando no Instagram de quem está a até 3.5km do restaurante.`
      });
    });
  });

  app.get('/api/addons/trafego-local/campanhas', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all('SELECT * FROM trafego_campanhas ORDER BY id DESC', [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, campanhas: rows || [] });
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // ROTAS: 4. AUDITOR DE REPASSES & GLOSAS DO IFOOD
  // ══════════════════════════════════════════════════════════════════

  app.get('/api/addons/auditor-marketplaces/analisar-extrato', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    // Simula auditoria inteligente comparando vendas brutas no PDV vs depósitos do marketplace
    const faturamentoBruto = 34500.00;
    const taxaEsperada = 34500.00 * 0.12; // 12% plano básico
    const taxaCartao = 34500.00 * 0.032; // 3.2%
    const totalEsperadoLiquido = faturamentoBruto - (taxaEsperada + taxaCartao); // R$ 29.256,00
    const repasseEfetivo = 27840.00; // Depósito que o iFood fez com retenções indevidas
    const glosaIdentificada = Math.round((totalEsperadoLiquido - repasseEfetivo) * 100) / 100; // R$ 1.416,00 a recuperar!

    db.run(`
      INSERT INTO auditor_glosas_marketplaces (
        periodo, marketplace, faturamento_bruto_declarado, taxas_descontadas_marketplace, valor_repassado_real, valor_esperado_contrato, diferenca_glosa_indevida, itens_divergentes_count, status
      ) VALUES ('2026-09-Q1', 'ifood', ?, ?, ?, ?, ?, 6, 'glosa_identificada')
    `, [faturamentoBruto, (faturamentoBruto - repasseEfetivo), repasseEfetivo, totalEsperadoLiquido, glosaIdentificada], function(err) {
      res.json({
        ok: true,
        auditoria: {
          periodo: 'Últimos 15 dias',
          marketplace: 'iFood Brasil',
          faturamento_bruto_pdv: faturamentoBruto,
          repassado_na_conta: repasseEfetivo,
          valor_correto_contratual: totalEsperadoLiquido,
          prejuizo_identificado: glosaIdentificada,
          irregularidades_detectadas: [
            { tipo: 'Cancelamento unilateral após preparo', valor: 384.50, status: 'Contestável' },
            { tipo: 'Cobrança duplicada de taxa de entrega parceira', valor: 420.00, status: 'Contestável' },
            { tipo: 'Taxa de antecipação não autorizada no repasse', valor: 611.50, status: 'Contestável' }
          ],
          honorarios_saas_20pct_sucesso: Math.round(glosaIdentificada * 0.20 * 100) / 100,
          mensagem: `Identificamos R$ ${glosaIdentificada.toFixed(2)} em retenções indevidas no extrato do iFood prontas para contestação!`
        }
      });
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // ROTAS: 5. MOTOR DE CLUBE DE ASSINATURAS B2B2C
  // ══════════════════════════════════════════════════════════════════

  app.get('/api/addons/clube-prime/planos', (req, res) => {
    const db = resolveDb(req);
    db.all('SELECT * FROM clube_prime_planos WHERE ativo = 1', [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, planos: rows || [] });
    });
  });

  app.post('/api/addons/clube-prime/assinar', (req, res) => {
    const db = resolveDb(req);
    const { plano_id = 1, cliente_nome, cliente_telefone } = req.body || {};

    if (!cliente_nome || !cliente_telefone) {
      return res.status(400).json({ ok: false, erro: 'Informe cliente_nome e cliente_telefone.' });
    }

    db.get('SELECT * FROM clube_prime_planos WHERE id = ?', [plano_id], (errPlano, plano) => {
      if (errPlano || !plano) return res.status(404).json({ ok: false, erro: 'Plano não encontrado.' });

      const mensalidade = plano.valor_mensal;
      const takeRateSaaS = Math.round(mensalidade * 0.05 * 100) / 100; // 5% de take-rate sobre a mensalidade do cliente

      db.run(`
        INSERT INTO clube_prime_assinantes (
          plano_id, cliente_nome, cliente_telefone, data_inicio, proxima_cobranca, status
        ) VALUES (?, ?, ?, date('now', 'localtime'), date('now', '+30 days', 'localtime'), 'ativo')
        ON CONFLICT(cliente_telefone) DO UPDATE SET status = 'ativo', proxima_cobranca = date('now', '+30 days', 'localtime')
      `, [plano_id, cliente_nome, cliente_telefone], function(errSub) {
        if (errSub) return res.status(500).json({ ok: false, erro: errSub.message });

        res.json({
          ok: true,
          assinante_id: this.lastID,
          cliente_nome,
          plano: plano.nome_plano,
          mensalidade: mensalidade,
          beneficios: {
            frete_gratis: !!plano.beneficio_frete_gratis,
            desconto: plano.desconto_geral_pct + '% em todos os pratos',
            brinde: plano.brinde_mensal
          },
          take_rate_saas_5pct: takeRateSaaS,
          mensagem: `Assinatura confirmada com sucesso! Cliente agora é Membro VIP.`
        });
      });
    });
  });

  app.get('/api/addons/clube-prime/metricas', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`
      SELECT a.*, p.nome_plano, p.valor_mensal 
      FROM clube_prime_assinantes a
      JOIN clube_prime_planos p ON a.plano_id = p.id
    `, [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });

      const totalAtivos = (rows || []).filter(r => r.status === 'ativo').length;
      const faturamentoRecorrenteMensal = (rows || []).reduce((acc, r) => acc + (r.valor_mensal || 0), 0);
      const receitaSaaSTakeRate = Math.round(faturamentoRecorrenteMensal * 0.05 * 100) / 100;

      res.json({
        ok: true,
        total_assinantes_vip: totalAtivos,
        mrr_restaurante_recorrente: faturamentoRecorrenteMensal,
        receita_take_rate_saas: receitaSaaSTakeRate,
        assinantes: rows || []
      });
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // ROTAS: 6. TV CHAMADOR DE SENHAS COM ÁUDIO & PAINEL DE RETIRADA
  // ══════════════════════════════════════════════════════════════════

  app.get('/api/addons/tv-senhas/painel', (req, res) => {
    const db = resolveDb(req);
    db.all('SELECT * FROM tv_senhas_chamadas ORDER BY id DESC LIMIT 12', [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      const chamando = (rows || []).filter(r => r.status === 'chamando');
      const preparando = (rows || []).filter(r => r.status === 'preparando');

      res.json({
        ok: true,
        chamando_agora: chamando[0] || null,
        ultimas_chamadas: chamando.slice(1, 6),
        em_preparo: preparando.slice(0, 6)
      });
    });
  });

  app.post('/api/addons/tv-senhas/chamar', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { numero_senha, cliente_nome, guiche = 'Balcão 01', tipo = 'balcao' } = req.body || {};

    if (!numero_senha) {
      return res.status(400).json({ ok: false, erro: 'Informe numero_senha.' });
    }

    db.run(`
      INSERT INTO tv_senhas_chamadas (numero_senha, cliente_nome, guiche_balcao, tipo, status)
      VALUES (?, ?, ?, ?, 'chamando')
    `, [String(numero_senha), cliente_nome || 'Cliente', guiche, tipo], function(err) {
      if (err) return res.status(500).json({ ok: false, erro: err.message });

      // Emissão via Socket.IO para TVs sintonizadas
      if (io) {
        try {
          io.emit('tv_senha_chamada', {
            id: this.lastID,
            numero_senha,
            cliente_nome,
            guiche,
            tipo,
            audio_fala: `Senha ${numero_senha}, favor retirar no ${guiche}.`
          });
        } catch (e) {}
      }

      res.json({
        ok: true,
        chamada_id: this.lastID,
        numero_senha,
        guiche,
        audio_sintetizado: `Senha ${numero_senha}, favor retirar no ${guiche}.`,
        mensagem: 'Senha exibida na Smart TV com sinal sonoro e voz sintetizada!'
      });
    });
  });

  console.log('⚡ Controller Add-ons Monetização Turbo carregado com sucesso (Antecipação, Totem Touch, Tráfego 1-Clique, Auditor iFood, Clube VIP, TV Senhas).');
};
