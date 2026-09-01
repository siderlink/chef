/**
 * plugins/theme-curator/index.js
 * Curadoria da App Store de Temas Chef Cozinha
 * Gerencia catálogo de temas, badges (Lançamento, Destaque, Desconto),
 * avaliações por restaurante, ordenação e aplicação em tempo real.
 */
'use strict';

module.exports = function ({ app, db, masterDb, io, options, log }) {
  const jwt = require('jsonwebtoken');
  const suporteSecret = process.env.SUPORTE_JWT_SECRET || 'chef-suporte-secret-key-2026';
  const mainSecret = (options && options.JWT_SECRET) || process.env.JWT_SECRET || 'chef-cozinha-secret-key-2026';

  log('Theme Curator ativado — App Store de Temas inicializada.');

  // ── Auth helpers ───────────────────────────────────────────────────────────
  const authCuradoria = (req, res, next) => {
    // 1. Token de Suporte via header x-suporte-token
    const supHeader = req.headers['x-suporte-token'];
    if (supHeader) {
      try {
        req.suporteData = jwt.verify(supHeader, suporteSecret);
        return next();
      } catch (e) {}
    }

    // 2. Token via Authorization Bearer
    const authHeader = req.headers['authorization'];
    if (authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      try {
        req.suporteData = jwt.verify(token, suporteSecret);
        return next();
      } catch (e1) {
        try {
          req.user = jwt.verify(token, mainSecret);
          return next();
        } catch (e2) {}
      }
    }

    // 3. Fallback para superAdminAuth ou verificarToken se fornecido pelo host
    if (options && typeof options.superAdminAuth === 'function') {
      return options.superAdminAuth(req, res, (err) => {
        if (!err) return next();
        if (options && typeof options.verificarToken === 'function') {
          return options.verificarToken(req, res, next);
        }
        res.status(401).json({ ok: false, erro: 'Acesso restrito ao Suporte ou Administração.' });
      });
    }

    if (options && typeof options.verificarToken === 'function') {
      return options.verificarToken(req, res, next);
    }
    next();
  };

  const authRestaurante = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : (req.headers['x-token'] || req.query.token);
    if (token) {
      try {
        req.user = jwt.verify(token, mainSecret);
        req.restaurante_id = req.user.restaurante_id || req.user.id;
        return next();
      } catch (e) {}
    }
    if (options && typeof options.verificarToken === 'function') {
      return options.verificarToken(req, res, next);
    }
    next();
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const safe = fn => async (req, res, next) => {
    try { await fn(req, res, next); }
    catch (e) { console.error('[theme-curator]', e.message); res.status(500).json({ ok: false, erro: e.message }); }
  };

  // Converte um tema da loja (cores da paleta) na configuração consumida pelo
  // theme-manager.js (applyCustomTheme) — usado para aplicar de verdade no salão.
  function themeToCfg(tema) {
    const c = (tema && tema.cores) || (tema && typeof tema.cores === 'string' ? JSON.parse(tema.cores || '{}') : {}) || {};
    return {
      storeTema: true,
      primary: c.primary || '#fc4b15',
      bgColor: c.bgPage || '#0b0f19',
      bgCard: c.bgCard || '#111827',
      borderColor: c.borderColor || '#1f2937',
      textPrimary: c.textMain || '#f3f4f6',
      statusOcupada: c.statusOcupada || '#ef4444',
      statusLivre: c.statusLivre || '#10b981',
      css_custom: (tema && tema.css_custom) || '',
      tema_nome: (tema && tema.nome) || ''
    };
  }

  function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => db.run(sql, params, function (err) {
      if (err) reject(err); else resolve(this);
    }));
  }
  function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => db.get(sql, params, (err, row) => {
      if (err) reject(err); else resolve(row);
    }));
  }
  function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => {
      if (err) reject(err); else resolve(rows || []);
    }));
  }

  // ── Catálogo padrão de temas embutido ─────────────────────────────────────
  const TEMAS_DEFAULT = [
    {
      id: 'theme_themeia_01',
      nome: 'Themeia',
      nicho: 'IA & High-Tech Futuristic',
      emoji_nicho: '🧠',
      descricao: 'Tema futurista com paleta Dark Glassmorphism, ciano elétrico espacial e bordas luminosas.',
      badge: 'destaque',
      desconto: 0,
      estrelas: 5.0,
      votos: 128,
      ordem: 1,
      novo: 0,
      cores: '{"primary":"#06b6d4","bgPage":"#050811","bgCard":"#0c1322","borderColor":"#1e293b","textMain":"#f0f9ff","statusOcupada":"#f43f5e","statusLivre":"#10b981"}'
    },
    {
      id: 'burger_neon',
      nome: 'Burger Cyberpunk Neon',
      nicho: 'Hamburgueria',
      emoji_nicho: '🍔',
      descricao: 'Dark mode profundo com detalhes em neon laranja e roxo para hamburguerias artesanais.',
      badge: 'lancamento',
      desconto: 0,
      estrelas: 4.8,
      votos: 84,
      ordem: 2,
      novo: 1,
      cores: '{"primary":"#f97316","bgPage":"#090d16","bgCard":"#131c2e","borderColor":"#1e293b","textMain":"#f8fafc","statusOcupada":"#ef4444","statusLivre":"#10b981"}'
    },
    {
      id: 'pizzaria_rustica',
      nome: 'Pizzaria & Forno à Lenha',
      nicho: 'Pizzaria',
      emoji_nicho: '🍕',
      descricao: 'Tons quentes terrosos de terracota, madeira e dourado italiano para pizzarias e trattorias.',
      badge: 'desconto',
      desconto: 20,
      estrelas: 4.7,
      votos: 62,
      ordem: 3,
      novo: 0,
      cores: '{"primary":"#c2410c","bgPage":"#1c1917","bgCard":"#292524","borderColor":"#44403c","textMain":"#fafaf9","statusOcupada":"#e11d48","statusLivre":"#22c55e"}'
    },
    {
      id: 'sushi_zen',
      nome: 'Sushi Bar Zen Minimalista',
      nicho: 'Japonês',
      emoji_nicho: '🍣',
      descricao: 'Visual sofisticado e limpo com preto fosco e detalhes em carmim japonês.',
      badge: 'destaque',
      desconto: 0,
      estrelas: 4.9,
      votos: 95,
      ordem: 4,
      novo: 0,
      cores: '{"primary":"#e11d48","bgPage":"#0b0f19","bgCard":"#111827","borderColor":"#1f2937","textMain":"#f3f4f6","statusOcupada":"#dc2626","statusLivre":"#059669"}'
    },
    {
      id: 'cafe_bistro',
      nome: 'Cafeteria & Bistrô Vintage',
      nicho: 'Cafeteria',
      emoji_nicho: '☕',
      descricao: 'Estilo aconchegante em tons de café, verde sálvia e creme suave para cafés e docerias.',
      badge: '',
      desconto: 0,
      estrelas: 4.5,
      votos: 41,
      ordem: 5,
      novo: 0,
      cores: '{"primary":"#78350f","bgPage":"#fdfbf7","bgCard":"#ffffff","borderColor":"#e7e5e4","textMain":"#292524","statusOcupada":"#b91c1c","statusLivre":"#15803d"}'
    },
    {
      id: 'pub_craft',
      nome: 'Pub & Choperia Craft Beer',
      nicho: 'Bar & Pub',
      emoji_nicho: '🍺',
      descricao: 'Identidade moderna com tons âmbar cervejeiro, madeira escura e alto contraste no salão.',
      badge: 'lancamento',
      desconto: 15,
      estrelas: 4.6,
      votos: 53,
      ordem: 6,
      novo: 1,
      cores: '{"primary":"#d97706","bgPage":"#0f172a","bgCard":"#1e293b","borderColor":"#334155","textMain":"#f8fafc","statusOcupada":"#f43f5e","statusLivre":"#10b981"}'
    },
    {
      id: 'churrascaria_premium',
      nome: 'Churrascaria Premium',
      nicho: 'Churrascaria',
      emoji_nicho: '🥩',
      descricao: 'Vermelho vinho profundo com dourado champanhe e black elegante para churrascarias premium.',
      badge: 'destaque',
      desconto: 0,
      estrelas: 4.8,
      votos: 71,
      ordem: 7,
      novo: 0,
      cores: '{"primary":"#991b1b","bgPage":"#0c0a0a","bgCard":"#1c1917","borderColor":"#292524","textMain":"#fafaf9","statusOcupada":"#dc2626","statusLivre":"#16a34a"}'
    },
    {
      id: 'acai_tropical',
      nome: 'Açaí & Tropical Fresh',
      nicho: 'Açaí & Sorveteria',
      emoji_nicho: '🫐',
      descricao: 'Roxo vibrante com gradientes tropicais e verde limão para açaí, sorvetes e bebidas frescas.',
      badge: 'lancamento',
      desconto: 25,
      estrelas: 4.7,
      votos: 38,
      ordem: 8,
      novo: 1,
      cores: '{"primary":"#7c3aed","bgPage":"#0f0a1e","bgCard":"#1a1030","borderColor":"#2d1b69","textMain":"#f5f3ff","statusOcupada":"#f43f5e","statusLivre":"#10b981"}'
    },
    {
      id: 'verde_campos',
      nome: 'Verde Campos da Serra',
      nicho: 'Saudável & Natural',
      emoji_nicho: '🌿',
      descricao: 'Paleta clara e vibrante em verde fresco, ideal para saudáveis, saladas, bowls e comida natural.',
      badge: 'lancamento',
      desconto: 0,
      estrelas: 4.6,
      votos: 12,
      ordem: 9,
      novo: 1,
      cores: '{"primary":"#16a34a","bgPage":"#f4faf4","bgCard":"#ffffff","borderColor":"#dfe9df","textMain":"#1c2b1c","statusOcupada":"#dc2626","statusLivre":"#16a34a"}'
    },
    {
      id: 'azul_marinho',
      nome: 'Azul Marinho Executivo',
      nicho: 'Frutos do Mar & Seafood',
      emoji_nicho: '🌊',
      descricao: 'Azul profundo e elegante sobre base escura, sofisticação náutica para peixarias e restaurantes de frutos do mar.',
      badge: 'destaque',
      desconto: 0,
      estrelas: 4.7,
      votos: 18,
      ordem: 10,
      novo: 1,
      cores: '{"primary":"#3b82f6","bgPage":"#0a1122","bgCard":"#12203f","borderColor":"#1e3a5f","textMain":"#eff6ff","statusOcupada":"#f43f5e","statusLivre":"#10b981"}'
    },
    {
      id: 'violeta_noite',
      nome: 'Violeta Noite Premium',
      nicho: 'Doceria & Confeitaria',
      emoji_nicho: '💜',
      descricao: 'Violeta luxuoso com fundo escuro profundo, charme noturno para docerias, confeitarias e cafés gourmet.',
      badge: 'lancamento',
      desconto: 0,
      estrelas: 4.5,
      votos: 9,
      ordem: 11,
      novo: 1,
      cores: '{"primary":"#a78bfa","bgPage":"#0e0714","bgCard":"#1c1029","borderColor":"#3b2a5c","textMain":"#f5f3ff","statusOcupada":"#f43f5e","statusLivre":"#10b981"}'
    },
    {
      id: 'areia_costa',
      nome: 'Areia & Costa Tropical',
      nicho: 'Praia & Esticão',
      emoji_nicho: '🏖️',
      descricao: 'Base clara em tom areia com toque aqua vibrante, frescor praiano para quiosques, açaí e drinks.',
      badge: 'lancamento',
      desconto: 0,
      estrelas: 4.6,
      votos: 11,
      ordem: 12,
      novo: 1,
      cores: '{"primary":"#0d9488","bgPage":"#fefbf3","bgCard":"#ffffff","borderColor":"#efe7d3","textMain":"#292524","statusOcupada":"#dc2626","statusLivre":"#0d9488"}'
    },
    {
      id: 'rouge_paris',
      nome: 'Rouge Paris Elegance',
      nicho: 'Cozinha Internacional',
      emoji_nicho: '🌹',
      descricao: 'Rosa-soberano e vinho profundo sobre fundo escuro aveludado, requinte parisiense para gastronomia fina.',
      badge: 'destaque',
      desconto: 0,
      estrelas: 4.8,
      votos: 15,
      ordem: 13,
      novo: 1,
      cores: '{"primary":"#fb7185","bgPage":"#160a0d","bgCard":"#241318","borderColor":"#4a2431","textMain":"#fdf2f8","statusOcupada":"#f43f5e","statusLivre":"#10b981"}'
    },
    {
      id: 'grafite_tech',
      nome: 'Grafite Steel Tech',
      nicho: 'Steakhouse Moderna',
      emoji_nicho: '⚙️',
      descricao: 'Cinza grafite industrial com contraste azul-aço, identidade moderna para steakhouse e cozinha de brasa.',
      badge: 'lancamento',
      desconto: 0,
      estrelas: 4.6,
      votos: 14,
      ordem: 14,
      novo: 1,
      cores: '{"primary":"#38bdf8","bgPage":"#0e1116","bgCard":"#161b24","borderColor":"#2a3443","textMain":"#f1f5f9","statusOcupada":"#f43f5e","statusLivre":"#10b981"}'
    }
  ];

  // ── Inicializar tabelas ────────────────────────────────────────────────────
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS temas_catalogo (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      nicho TEXT,
      emoji_nicho TEXT DEFAULT '🍽️',
      descricao TEXT,
      badge TEXT DEFAULT '',
      desconto INTEGER DEFAULT 0,
      estrelas REAL DEFAULT 5.0,
      votos INTEGER DEFAULT 0,
      ordem INTEGER DEFAULT 99,
      novo INTEGER DEFAULT 0,
      ativo INTEGER DEFAULT 1,
      cores TEXT DEFAULT '{}',
      css_custom TEXT DEFAULT '',
      criado_em DATETIME DEFAULT (datetime('now','localtime')),
      atualizado_em DATETIME DEFAULT (datetime('now','localtime'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS temas_avaliacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tema_id TEXT NOT NULL,
      restaurante_id INTEGER,
      estrelas INTEGER DEFAULT 5,
      comentario TEXT,
      criado_em DATETIME DEFAULT (datetime('now','localtime'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS temas_aplicados (
      restaurante_id INTEGER PRIMARY KEY,
      tema_id TEXT NOT NULL,
      tema_json TEXT,
      aplicado_em DATETIME DEFAULT (datetime('now','localtime'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS temas_solicitacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurante_id INTEGER,
      restaurante_nome TEXT DEFAULT '',
      tema_referencia TEXT DEFAULT '',
      mensagem TEXT DEFAULT '',
      contato TEXT DEFAULT '',
      status TEXT DEFAULT 'aguardando',
      criado_em DATETIME DEFAULT (datetime('now','localtime'))
    )`);

    // Tabela para Módulos Dinâmicos do Site de Vendas
    db.run(`CREATE TABLE IF NOT EXISTS site_vendas_modulos (
      id TEXT PRIMARY KEY,
      tipo TEXT NOT NULL,
      titulo TEXT NOT NULL,
      ativo INTEGER DEFAULT 1,
      ordem INTEGER DEFAULT 0,
      config_json TEXT DEFAULT '{}',
      criado_em DATETIME DEFAULT (datetime('now','localtime')),
      atualizado_em DATETIME DEFAULT (datetime('now','localtime'))
    )`);

    // Seed com temas padrão — SEMPRE INSERT OR IGNORE (idempotente): adiciona
    // temas novos em bancos já existentes sem sobrescrever ajustes da curadoria.
    const sqlInsert = `INSERT OR IGNORE INTO temas_catalogo
      (id, nome, nicho, emoji_nicho, descricao, badge, desconto, estrelas, votos, ordem, novo, cores)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`;
    TEMAS_DEFAULT.forEach(t => {
      db.run(sqlInsert, [t.id, t.nome, t.nicho, t.emoji_nicho, t.descricao, t.badge, t.desconto, t.estrelas, t.votos, t.ordem, t.novo, t.cores]);
    });
    log('Catálogo de temas semeado/verificado com ' + TEMAS_DEFAULT.length + ' temas padrão.');

    // Seed módulos padrão do site de vendas
    db.get(`SELECT COUNT(*) as n FROM site_vendas_modulos`, (err, row) => {
      if (err || (row && row.n > 0)) return;
      const defaultModulos = [
        {
          id: 'mod_whatsapp_vendas',
          tipo: 'whatsapp',
          titulo: 'Botão Flutuante WhatsApp de Vendas',
          ativo: 1,
          ordem: 1,
          config_json: JSON.stringify({
            numero: '5511999999999',
            mensagem: 'Olá! Gostaria de uma demonstração gratuita do Chef Cozinha para o meu restaurante.',
            posicao: 'bottom-right',
            pulsar: true,
            atendente: 'Consultor Comercial Chef'
          })
        },
        {
          id: 'mod_urgencia_topbar',
          tipo: 'urgencia_bar',
          titulo: 'Barra Superior de Urgência & Promoção',
          ativo: 1,
          ordem: 2,
          config_json: JSON.stringify({
            texto: '⚡ Promoção Especial de Lançamento: Ganhe 14 Dias Grátis + Setup Guiado sem custo!',
            cupom: 'CHEFPROMO',
            botaoTexto: 'Garantir Oferta',
            botaoLink: '#planos',
            corFundo: '#fc4b15',
            corTexto: '#ffffff'
          })
        },
        {
          id: 'mod_exit_popup',
          tipo: 'lead_popup',
          titulo: 'Pop-up de Retenção / Saída com Desconto',
          ativo: 1,
          ordem: 3,
          config_json: JSON.stringify({
            gatilho: 'exit_intent',
            titulo: 'Espere! Não deixe seu restaurante na mão.',
            subtitulo: 'Cadastre-se agora e ganhe 1 mês de KDS Grátis no seu plano.',
            botaoTexto: 'Quero meu Mês Grátis',
            descontoCupom: 'BEMVINDOCHEF'
          })
        },
        {
          id: 'mod_calculadora_lucro',
          tipo: 'calculadora',
          titulo: 'Calculadora Interativa de Economia',
          ativo: 1,
          ordem: 4,
          config_json: JSON.stringify({
            titulo: 'Quanto seu restaurante vai economizar por mês?',
            ticketMedioPadrao: 65,
            pedidosDiaPadrao: 120,
            economiaGarcomPct: 22
          })
        }
      ];

      defaultModulos.forEach(m => {
        db.run(`INSERT OR IGNORE INTO site_vendas_modulos (id, tipo, titulo, ativo, ordem, config_json) VALUES (?,?,?,?,?,?)`,
          [m.id, m.tipo, m.titulo, m.ativo, m.ordem, m.config_json]);
      });
      log('Módulos padrão do Site de Vendas semeados.');
    });

    log('Tabelas Theme Curator e Site Vendas criadas/verificadas.');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ROTAS PÚBLICAS (restaurantes)
  // ══════════════════════════════════════════════════════════════════════════

  // GET /api/modulo/temas/loja — Catálogo público para restaurantes
  app.get('/api/modulo/temas/loja', safe(async (req, res) => {
    const { ordenar = 'ordem', badge, nicho, busca } = req.query;
    let sql = `SELECT * FROM temas_catalogo WHERE ativo = 1`;
    const params = [];
    if (badge) { sql += ` AND badge = ?`; params.push(badge); }
    if (nicho) { sql += ` AND (nicho LIKE ? OR emoji_nicho LIKE ?)`; params.push(`%${nicho}%`, `%${nicho}%`); }
    if (busca) { sql += ` AND (nome LIKE ? OR descricao LIKE ? OR nicho LIKE ?)`; params.push(`%${busca}%`, `%${busca}%`, `%${busca}%`); }

    const ordenarMap = {
      ordem: 'ordem ASC, estrelas DESC',
      estrelas: 'estrelas DESC, votos DESC',
      novos: 'novo DESC, criado_em DESC',
      destaques: 'badge ASC, estrelas DESC',
      az: 'nome ASC'
    };
    sql += ` ORDER BY ${ordenarMap[ordenar] || 'ordem ASC'}`;

    const temas = await dbAll(sql, params);
    let temaAtivoId = null;
    const authHeader = req.headers['authorization'] || req.headers['x-token'] || req.query.token;
    if (authHeader) {
      const token = String(authHeader).replace(/^Bearer\s+/i, '').trim();
      try {
        const usr = jwt.verify(token, mainSecret);
        const rid = usr.restaurante_id || usr.id;
        const aplicado = await dbGet(`SELECT tema_id FROM temas_aplicados WHERE restaurante_id = ?`, [rid]);
        if (aplicado) temaAtivoId = aplicado.tema_id;
      } catch (e) { }
    }
    res.json({ ok: true, temas: temas.map(t => ({ ...t, ativo: temaAtivoId ? t.id === temaAtivoId : false, cores: JSON.parse(t.cores || '{}') })) });
  }));

  // POST /api/modulo/temas/avaliar — Restaurante avalia um tema
  app.post('/api/modulo/temas/avaliar', authRestaurante, safe(async (req, res) => {
    const { tema_id, estrelas, comentario } = req.body || {};
    const rid = req.restaurante_id || (req.user && req.user.restaurante_id);
    if (!tema_id || !estrelas) return res.json({ ok: false, erro: 'tema_id e estrelas são obrigatórios.' });
    // Verificar se já avaliou
    const existe = await dbGet(`SELECT id FROM temas_avaliacoes WHERE tema_id=? AND restaurante_id=?`, [tema_id, rid]);
    if (existe) {
      await dbRun(`UPDATE temas_avaliacoes SET estrelas=?, comentario=? WHERE id=?`, [parseInt(estrelas), comentario || '', existe.id]);
    } else {
      await dbRun(`INSERT INTO temas_avaliacoes (tema_id, restaurante_id, estrelas, comentario) VALUES (?,?,?,?)`,
        [tema_id, rid, parseInt(estrelas), comentario || '']);
    }
    // Recalcular média
    const media = await dbGet(`SELECT AVG(estrelas) as m, COUNT(*) as n FROM temas_avaliacoes WHERE tema_id=?`, [tema_id]);
    await dbRun(`UPDATE temas_catalogo SET estrelas=?, votos=?, atualizado_em=datetime('now','localtime') WHERE id=?`,
      [Math.round((media.m || 5) * 10) / 10, media.n || 0, tema_id]);
    res.json({ ok: true, nova_media: media.m, votos: media.n });
  }));

  // POST /api/modulo/temas/aplicar — Aplicar tema no restaurante (persiste no salão em tempo real)
  app.post('/api/modulo/temas/aplicar', authRestaurante, safe(async (req, res) => {
    const { tema_id, tema_json } = req.body || {};
    const rid = req.restaurante_id || (req.user && req.user.restaurante_id);
    if (!tema_id) return res.json({ ok: false, erro: 'tema_id obrigatório.' });

    await dbRun(`INSERT INTO temas_aplicados (restaurante_id, tema_id, tema_json) VALUES (?,?,?)
      ON CONFLICT(restaurante_id) DO UPDATE SET tema_id=excluded.tema_id, tema_json=excluded.tema_json,
      aplicado_em=datetime('now','localtime')`,
      [rid, tema_id, tema_json ? JSON.stringify(tema_json) : null]);

    // Constrói a configuração visual real e persiste por tenant (tenant_temas).
    // /api/public/theme passa a devolvê-la, então o tema sobrevive a reloads.
    const catalogado = await dbGet(`SELECT * FROM temas_catalogo WHERE id = ?`, [tema_id]).catch(() => null);
    const fonte = (catalogado && catalogado.cores) ? catalogado : tema_json;
    let cfg = null;
    if (fonte) {
      cfg = themeToCfg(Object.assign({}, fonte, { css_custom: (fonte.css_custom || (catalogado && catalogado.css_custom) || '') }));
      if (masterDb) {
        await new Promise((resolve, reject) => masterDb.run(
          `INSERT INTO tenant_temas (restaurante_id, tema_json) VALUES (?,?)
           ON CONFLICT(restaurante_id) DO UPDATE SET tema_json=excluded.tema_json, atualizado_em=datetime('now','localtime')`,
          [rid, JSON.stringify(cfg)], (err) => err ? reject(err) : resolve()));
      }
    }

    // Propaga em tempo real para todas as telas do restaurante
    if (io && rid) {
      const room = `restaurante_${rid}`;
      io.to(room).emit('tema_global_atualizado', cfg);
      io.to(room).emit('tema_aplicado', { tema_id });
    }
    res.json({ ok: true, cfg, tema_id });
  }));

  // DELETE /api/modulo/temas/aplicar — Remover tema aplicado (volta ao tema padrão/global)
  app.delete('/api/modulo/temas/aplicar', authRestaurante, safe(async (req, res) => {
    const rid = req.restaurante_id || (req.user && req.user.restaurante_id);
    await dbRun(`DELETE FROM temas_aplicados WHERE restaurante_id = ?`, [rid]);
    if (masterDb) {
      await new Promise((resolve) => masterDb.run(`DELETE FROM tenant_temas WHERE restaurante_id = ?`, [rid], () => resolve()));
    }
    if (io && rid) {
      const room = `restaurante_${rid}`;
      io.to(room).emit('tema_global_atualizado', null);
      io.to(room).emit('tema_aplicado', { tema_id: '' });
    }
    res.json({ ok: true });
  }));

  // GET /api/modulo/temas/ativo — Tema atualmente aplicado no restaurante
  app.get('/api/modulo/temas/ativo', authRestaurante, safe(async (req, res) => {
    const rid = req.restaurante_id || (req.user && req.user.restaurante_id);
    const row = await dbGet(`SELECT ta.tema_id, ta.tema_json, t.nome, t.nicho, t.emoji_nicho, t.descricao, t.badge
      FROM temas_aplicados ta LEFT JOIN temas_catalogo t ON ta.tema_id = t.id
      WHERE ta.restaurante_id = ?`, [rid]);
    if (!row) return res.json({ ok: true, tema: null });
    res.json({
      ok: true,
      tema: {
        tema_id: row.tema_id,
        nome: row.nome || (row.tema_json ? (JSON.parse(row.tema_json || '{}').nome || row.tema_id) : row.tema_id),
        nicho: row.nicho,
        emoji_nicho: row.emoji_nicho,
        descricao: row.descricao,
        badge: row.badge,
        cores: row.tema_json ? ((JSON.parse(row.tema_json).cores) || {}) : {}
      }
    });
  }));

  // POST /api/modulo/temas/solicitar — Restaurante solicita tema/ajustes à curadoria
  app.post('/api/modulo/temas/solicitar', authRestaurante, safe(async (req, res) => {
    const { tema_referencia, mensagem, contato } = req.body || {};
    if (!mensagem || !String(mensagem).trim()) return res.json({ ok: false, erro: 'Descreva o que você gostaria.' });
    const rid = req.restaurante_id || (req.user && req.user.restaurante_id) || null;
    const restNome = (req.user && req.user.nome) || (req.user && req.user.restaurante_nome) || '';
    await dbRun(`INSERT INTO temas_solicitacoes (restaurante_id, restaurante_nome, tema_referencia, mensagem, contato)
      VALUES (?,?,?,?,?)`,
      [rid, restNome, String(tema_referencia || ''), String(mensagem).trim(), String(contato || '')]);
    res.json({ ok: true, mensagem: 'Solicitação enviada à Equipe de Criação & Suporte!' });
  }));

  // ══════════════════════════════════════════════════════════════════════════
  // ROTAS DE CURADORIA (suporte/admin)
  // ══════════════════════════════════════════════════════════════════════════

  // GET /api/super/temas — Listar todos os temas (admin)
  app.get('/api/super/temas', authCuradoria, safe(async (req, res) => {
    const { ordenar = 'ordem', badge, ativo } = req.query;
    let sql = `SELECT * FROM temas_catalogo`;
    const params = [];
    const where = [];
    if (badge !== undefined && badge !== '') { where.push('badge = ?'); params.push(badge); }
    if (ativo !== undefined) { where.push('ativo = ?'); params.push(ativo === '1' || ativo === 'true' ? 1 : 0); }
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
    sql += ` ORDER BY ${ordenar === 'estrelas' ? 'estrelas DESC' : ordenar === 'novos' ? 'novo DESC, criado_em DESC' : 'ordem ASC'}`;
    const temas = await dbAll(sql, params);
    // Stats de uso
    const stats = await dbGet(`SELECT COUNT(*) as total_avaliacoes, COUNT(DISTINCT restaurante_id) as restaurantes_usando FROM temas_avaliacoes`);
    res.json({ ok: true, temas: temas.map(t => ({ ...t, cores: JSON.parse(t.cores || '{}') })), stats });
  }));

  // POST /api/super/temas — Criar novo tema
  app.post('/api/super/temas', authCuradoria, safe(async (req, res) => {
    const { id, nome, nicho, emoji_nicho, descricao, badge, desconto, ordem, novo, cores, css_custom } = req.body || {};
    if (!id || !nome) return res.json({ ok: false, erro: 'id e nome são obrigatórios.' });
    const r = await dbRun(`INSERT INTO temas_catalogo
      (id, nome, nicho, emoji_nicho, descricao, badge, desconto, ordem, novo, cores, css_custom)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [id, nome, nicho || '', emoji_nicho || '🍽️', descricao || '', badge || '', parseInt(desconto) || 0,
       parseInt(ordem) || 99, novo ? 1 : 0, cores ? JSON.stringify(cores) : '{}', css_custom || '']
    );
    res.json({ ok: true, id });
  }));

  // PUT /api/super/temas/:id — Editar tema (curadoria)
  app.put('/api/super/temas/:id', authCuradoria, safe(async (req, res) => {
    const { nome, nicho, emoji_nicho, descricao, badge, desconto, ordem, novo, ativo, cores, css_custom } = req.body || {};
    const updates = [];
    const params = [];

    if (nome !== undefined) { updates.push('nome=?'); params.push(nome); }
    if (nicho !== undefined) { updates.push('nicho=?'); params.push(nicho); }
    if (emoji_nicho !== undefined) { updates.push('emoji_nicho=?'); params.push(emoji_nicho); }
    if (descricao !== undefined) { updates.push('descricao=?'); params.push(descricao); }
    if (badge !== undefined) { updates.push('badge=?'); params.push(badge); }
    if (desconto !== undefined) { updates.push('desconto=?'); params.push(parseInt(desconto) || 0); }
    if (ordem !== undefined) { updates.push('ordem=?'); params.push(parseInt(ordem) || 99); }
    if (novo !== undefined) { updates.push('novo=?'); params.push(novo ? 1 : 0); }
    if (ativo !== undefined) { updates.push('ativo=?'); params.push(ativo ? 1 : 0); }
    if (cores !== undefined) { updates.push('cores=?'); params.push(typeof cores === 'object' ? JSON.stringify(cores) : cores); }
    if (css_custom !== undefined) { updates.push('css_custom=?'); params.push(css_custom); }

    if (!updates.length) return res.json({ ok: false, erro: 'Nada para atualizar.' });
    updates.push(`atualizado_em=datetime('now','localtime')`);
    params.push(req.params.id);
    await dbRun(`UPDATE temas_catalogo SET ${updates.join(',')} WHERE id=?`, params);
    res.json({ ok: true });
  }));

  // PUT /api/super/temas/ordenar/batch — Reordenar lote
  app.put('/api/super/temas/ordenar/batch', authCuradoria, safe(async (req, res) => {
    const { ordem } = req.body || {}; // [{ id, ordem }]
    if (!Array.isArray(ordem)) return res.json({ ok: false, erro: 'ordem deve ser um array [{id, ordem}].' });
    for (const item of ordem) {
      await dbRun(`UPDATE temas_catalogo SET ordem=? WHERE id=?`, [parseInt(item.ordem), item.id]);
    }
    res.json({ ok: true, atualizados: ordem.length });
  }));

  // DELETE /api/super/temas/:id — Desativar tema
  app.delete('/api/super/temas/:id', authCuradoria, safe(async (req, res) => {
    await dbRun(`UPDATE temas_catalogo SET ativo=0, atualizado_em=datetime('now','localtime') WHERE id=?`, [req.params.id]);
    res.json({ ok: true });
  }));

  // GET /api/super/temas/avaliacoes — Ver avaliações
  app.get('/api/super/temas/avaliacoes', authCuradoria, safe(async (req, res) => {
    const rows = await dbAll(`SELECT a.*, t.nome as tema_nome FROM temas_avaliacoes a
      LEFT JOIN temas_catalogo t ON a.tema_id = t.id
      ORDER BY a.criado_em DESC LIMIT 100`);
    res.json({ ok: true, avaliacoes: rows });
  }));

  // GET /api/super/temas/uso — Ver quais temas os restaurantes estão usando
  app.get('/api/super/temas/uso', authCuradoria, safe(async (req, res) => {
    const rows = await dbAll(`SELECT ta.tema_id, COUNT(*) as qtd, t.nome
      FROM temas_aplicados ta
      LEFT JOIN temas_catalogo t ON ta.tema_id = t.id
      GROUP BY ta.tema_id ORDER BY qtd DESC`);
    res.json({ ok: true, uso: rows });
  }));

  // GET /api/super/temas/solicitacoes — Solicitações de temas dos restaurantes (curadoria)
  app.get('/api/super/temas/solicitacoes', authCuradoria, safe(async (req, res) => {
    const rows = await dbAll(`SELECT s.*, t.nome AS tema_nome
      FROM temas_solicitacoes s
      LEFT JOIN temas_catalogo t ON s.tema_referencia = t.id
      ORDER BY s.criado_em DESC LIMIT 200`);
    res.json({ ok: true, solicitacoes: rows });
  }));

  // POST /api/super/temas/solicitacoes/:id — Atualizar status de uma solicitação
  app.put('/api/super/temas/solicitacoes/:id', authCuradoria, safe(async (req, res) => {
    const { status } = req.body || {};
    if (!status) return res.json({ ok: false, erro: 'status obrigatório.' });
    await dbRun(`UPDATE temas_solicitacoes SET status = ? WHERE id = ?`, [status, req.params.id]);
    res.json({ ok: true });
  }));

  // ══════════════════════════════════════════════════════════════════════════
  // ROTAS DE MÓDULOS DO SITE DE VENDAS (Suporte / Marketing / Landing)
  // ══════════════════════════════════════════════════════════════════════════

  // GET /api/public/site-vendas/modulos — Lista módulos ativos para renderizar no site de vendas
  app.get('/api/public/site-vendas/modulos', safe(async (req, res) => {
    const rows = await dbAll(`SELECT * FROM site_vendas_modulos WHERE ativo = 1 ORDER BY ordem ASC`);
    res.json({
      ok: true,
      modulos: rows.map(r => ({
        ...r,
        config: JSON.parse(r.config_json || '{}')
      }))
    });
  }));

  // GET /api/super/site-vendas/modulos — Listagem completa para o painel de suporte
  app.get('/api/super/site-vendas/modulos', authCuradoria, safe(async (req, res) => {
    const rows = await dbAll(`SELECT * FROM site_vendas_modulos ORDER BY ordem ASC`);
    res.json({
      ok: true,
      modulos: rows.map(r => ({
        ...r,
        config: JSON.parse(r.config_json || '{}')
      }))
    });
  }));

  // POST /api/super/site-vendas/modulos — Criar novo módulo do site de vendas
  app.post('/api/super/site-vendas/modulos', authCuradoria, safe(async (req, res) => {
    const { id, tipo, titulo, ativo, ordem, config } = req.body || {};
    if (!tipo || !titulo) return res.json({ ok: false, erro: 'tipo e titulo são obrigatórios.' });
    const modId = id || 'mod_' + Date.now();
    await dbRun(`INSERT INTO site_vendas_modulos (id, tipo, titulo, ativo, ordem, config_json)
      VALUES (?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET tipo=excluded.tipo, titulo=excluded.titulo, ativo=excluded.ativo,
      ordem=excluded.ordem, config_json=excluded.config_json, atualizado_em=datetime('now','localtime')`,
      [modId, tipo, titulo, ativo ? 1 : 0, parseInt(ordem) || 0, typeof config === 'object' ? JSON.stringify(config) : (config || '{}')]
    );
    res.json({ ok: true, id: modId });
  }));

  // PUT /api/super/site-vendas/modulos/:id — Atualizar módulo existente
  app.put('/api/super/site-vendas/modulos/:id', authCuradoria, safe(async (req, res) => {
    const { tipo, titulo, ativo, ordem, config } = req.body || {};
    const updates = [];
    const params = [];
    if (tipo !== undefined) { updates.push('tipo=?'); params.push(tipo); }
    if (titulo !== undefined) { updates.push('titulo=?'); params.push(titulo); }
    if (ativo !== undefined) { updates.push('ativo=?'); params.push(ativo ? 1 : 0); }
    if (ordem !== undefined) { updates.push('ordem=?'); params.push(parseInt(ordem) || 0); }
    if (config !== undefined) { updates.push('config_json=?'); params.push(typeof config === 'object' ? JSON.stringify(config) : config); }

    if (!updates.length) return res.json({ ok: false, erro: 'Nada para atualizar.' });
    updates.push(`atualizado_em=datetime('now','localtime')`);
    params.push(req.params.id);

    await dbRun(`UPDATE site_vendas_modulos SET ${updates.join(',')} WHERE id=?`, params);
    res.json({ ok: true });
  }));

  // DELETE /api/super/site-vendas/modulos/:id — Excluir ou desativar módulo
  app.delete('/api/super/site-vendas/modulos/:id', authCuradoria, safe(async (req, res) => {
    await dbRun(`DELETE FROM site_vendas_modulos WHERE id=?`, [req.params.id]);
    res.json({ ok: true });
  }));

  log('Theme Curator inicializado. Rotas: /api/modulo/temas/*, /api/super/temas/* e /api/super/site-vendas/*');
};
