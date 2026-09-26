/**
 * plugins/cheff-ai/index.js
 * CheffAI — Motor de IA completa para restaurantes
 * Automatiza WhatsApp, Funil de Vendas, Disparador em Massa, Fidelidade IA,
 * Cupons Google, CRM Recuperador, NFe, Frente de Caixa, Entregas e Relatórios.
 */
'use strict';

module.exports = function ({ app, db, masterDb, io, options, log }) {
  const { verificarToken } = options;

  log('CheffAI ativado — inicializando módulos de IA...');

  // ── Helpers ────────────────────────────────────────────────────────────────
  const safe = fn => async (req, res, next) => {
    try { await fn(req, res, next); }
    catch (e) { console.error('[cheff-ai]', e.message); res.status(500).json({ ok: false, erro: e.message }); }
  };

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

  // ── Inicializar tabelas ────────────────────────────────────────────────────
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS cheff_ai_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chave TEXT NOT NULL UNIQUE,
      valor TEXT,
      atualizado_em DATETIME DEFAULT (datetime('now','localtime'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS cheff_ai_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT,
      telefone TEXT,
      email TEXT,
      canal TEXT DEFAULT 'whatsapp',
      etapa TEXT DEFAULT 'novo',
      origem TEXT,
      notas TEXT,
      convertido INTEGER DEFAULT 0,
      valor_conversao REAL DEFAULT 0,
      criado_em DATETIME DEFAULT (datetime('now','localtime')),
      atualizado_em DATETIME DEFAULT (datetime('now','localtime'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS cheff_ai_conversas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telefone TEXT NOT NULL,
      nome_cliente TEXT,
      direcao TEXT DEFAULT 'in',
      tipo TEXT DEFAULT 'text',
      conteudo TEXT,
      status TEXT DEFAULT 'recebido',
      pedido_id INTEGER,
      criado_em DATETIME DEFAULT (datetime('now','localtime'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS cheff_ai_campanhas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      mensagem TEXT NOT NULL,
      segmento TEXT DEFAULT 'todos',
      status TEXT DEFAULT 'rascunho',
      agendado_em DATETIME,
      enviados INTEGER DEFAULT 0,
      falhas INTEGER DEFAULT 0,
      criado_em DATETIME DEFAULT (datetime('now','localtime'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS cheff_ai_cupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      descricao TEXT,
      codigo TEXT UNIQUE,
      tipo TEXT DEFAULT 'percentual',
      valor REAL DEFAULT 0,
      validade_em DATETIME,
      usos_max INTEGER DEFAULT 100,
      usos INTEGER DEFAULT 0,
      ativo INTEGER DEFAULT 1,
      criado_em DATETIME DEFAULT (datetime('now','localtime'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS cheff_ai_crm_acoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER,
      tipo TEXT,
      descricao TEXT,
      resultado TEXT,
      criado_em DATETIME DEFAULT (datetime('now','localtime'))
    )`);

    log('Tabelas CheffAI criadas/verificadas.');
  });

  // ═══════════════════════════════════════════
  // 1. CONFIGURAÇÕES
  // ═══════════════════════════════════════════

  app.get('/api/cheff-ai/config', verificarToken, safe(async (req, res) => {
    const rows = await dbAll('SELECT chave, valor FROM cheff_ai_config');
    const cfg = {};
    rows.forEach(r => { try { cfg[r.chave] = JSON.parse(r.valor); } catch { cfg[r.chave] = r.valor; } });
    res.json({ ok: true, config: cfg });
  }));

  app.post('/api/cheff-ai/config', verificarToken, safe(async (req, res) => {
    const updates = req.body || {};
    for (const [chave, valor] of Object.entries(updates)) {
      const val = typeof valor === 'object' ? JSON.stringify(valor) : String(valor);
      await dbRun(`INSERT INTO cheff_ai_config (chave, valor) VALUES (?, ?)
        ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor,
        atualizado_em = datetime('now','localtime')`, [chave, val]);
    }
    res.json({ ok: true, mensagem: 'Configuracoes CheffAI salvas.' });
  }));

  // ═══════════════════════════════════════════
  // 2. BOT WHATSAPP
  // ═══════════════════════════════════════════

  app.post('/api/cheff-ai/whatsapp/webhook', safe(async (req, res) => {
    const payload = req.body || {};
    const tel = String(payload.from || payload.telefone || '').replace(/\D/g, '');
    const msg = String(payload.message || payload.texto || payload.body || '');
    const tipo = payload.type || 'text';
    if (!tel) return res.json({ ok: false, erro: 'Telefone nao identificado.' });

    await dbRun(
      `INSERT INTO cheff_ai_conversas (telefone, nome_cliente, direcao, tipo, conteudo, status)
       VALUES (?, ?, 'in', ?, ?, 'recebido')`,
      [tel, payload.nome || null, tipo, msg]
    );

    const resposta = await processarIntencao(msg, tel, tipo);
    if (resposta) {
      await dbRun(
        `INSERT INTO cheff_ai_conversas (telefone, direcao, tipo, conteudo, status) VALUES (?, 'out', 'text', ?, 'enviado')`,
        [tel, resposta]
      );
    }
    if (io) io.emit('cheff_ai:mensagem', { tel, msg, tipo, resposta });
    res.json({ ok: true, resposta });
  }));

  async function processarIntencao(msg, tel, tipo) {
    const texto = msg.toLowerCase();
    if (/card[aá]pio|menu|pratos?|o que tem/i.test(texto)) {
      const itens = await dbAll(`SELECT nome, preco FROM produtos WHERE ativo = 1 ORDER BY RANDOM() LIMIT 5`).catch(() => []);
      if (itens.length) {
        const lista = itens.map(i => `* ${i.nome} - R$ ${parseFloat(i.preco || 0).toFixed(2)}`).join('\n');
        return `Cardapio (destaques):\n\n${lista}\n\nDiga o que deseja!`;
      }
      return 'Nosso cardapio esta disponivel online. Me diga o que deseja!';
    }
    if (/hor[aá]rio|funcionamento|aberto/i.test(texto)) return 'Funcionamos de Segunda a Domingo das 11h as 23h!';
    if (/quero|pedi[r|do]|manda|traz/i.test(texto))
      return 'Vou registrar seu pedido! Me informe:\n1. Nome\n2. Endereco de entrega\n3. Forma de pagamento (PIX/cartao/dinheiro)';
    if (/oi|ol[aá]|bom dia|boa tarde|boa noite|e ai/i.test(texto))
      return 'Ola! Sou o CheffAI, assistente virtual.\n\n1 - Ver cardapio\n2 - Fazer pedido\n3 - Horario\n4 - Atendente humano';
    if (tipo === 'audio' || tipo === 'ptt')
      return 'Recebi seu audio! Estou processando e logo retorno com a confirmacao do pedido.';
    return null;
  }

  app.get('/api/cheff-ai/whatsapp/conversas', verificarToken, safe(async (req, res) => {
    const { telefone, limit = 50, offset = 0 } = req.query;
    let sql = `SELECT * FROM cheff_ai_conversas`;
    const params = [];
    if (telefone) { sql += ` WHERE telefone = ?`; params.push(telefone); }
    sql += ` ORDER BY criado_em DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));
    const rows = await dbAll(sql, params);
    const total = (await dbGet(`SELECT COUNT(*) as n FROM cheff_ai_conversas${telefone ? ' WHERE telefone=?' : ''}`, telefone ? [telefone] : [])).n;
    res.json({ ok: true, conversas: rows, total });
  }));

  app.post('/api/cheff-ai/whatsapp/enviar', verificarToken, safe(async (req, res) => {
    const { telefone, mensagem } = req.body || {};
    if (!telefone || !mensagem) return res.json({ ok: false, erro: 'Telefone e mensagem sao obrigatorios.' });
    await dbRun(
      `INSERT INTO cheff_ai_conversas (telefone, direcao, tipo, conteudo, status) VALUES (?, 'out', 'text', ?, 'enviado')`,
      [telefone, mensagem]
    );
    if (io) io.emit('cheff_ai:mensagem_manual', { telefone, mensagem });
    res.json({ ok: true });
  }));

  // ═══════════════════════════════════════════
  // 3. FUNIL DE VENDAS
  // ═══════════════════════════════════════════

  const ETAPAS = ['novo', 'contato', 'demonstracao', 'proposta', 'negociacao', 'ganho', 'perdido'];

  app.get('/api/cheff-ai/funil', verificarToken, safe(async (req, res) => {
    const leads = await dbAll(`SELECT * FROM cheff_ai_leads ORDER BY atualizado_em DESC`);
    const kanban = {};
    ETAPAS.forEach(e => { kanban[e] = []; });
    leads.forEach(l => { if (kanban[l.etapa]) kanban[l.etapa].push(l); });
    res.json({
      ok: true,
      total: leads.length,
      convertidos: leads.filter(l => l.convertido).length,
      valor_total: leads.reduce((s, l) => s + (l.valor_conversao || 0), 0),
      por_etapa: kanban
    });
  }));

  app.post('/api/cheff-ai/funil/lead', verificarToken, safe(async (req, res) => {
    const { nome, telefone, email, canal, etapa, origem, notas } = req.body || {};
    if (!nome && !telefone) return res.json({ ok: false, erro: 'Nome ou telefone sao obrigatorios.' });
    const r = await dbRun(
      `INSERT INTO cheff_ai_leads (nome, telefone, email, canal, etapa, origem, notas) VALUES (?,?,?,?,?,?,?)`,
      [nome || '', telefone || '', email || '', canal || 'whatsapp', etapa || 'novo', origem || '', notas || '']
    );
    res.json({ ok: true, id: r.lastID });
  }));

  app.put('/api/cheff-ai/funil/lead/:id', verificarToken, safe(async (req, res) => {
    const { etapa, notas, convertido, valor_conversao } = req.body || {};
    const updates = [];
    const params = [];
    if (etapa) { updates.push('etapa=?'); params.push(etapa); }
    if (notas !== undefined) { updates.push('notas=?'); params.push(notas); }
    if (convertido !== undefined) { updates.push('convertido=?'); params.push(convertido ? 1 : 0); }
    if (valor_conversao !== undefined) { updates.push('valor_conversao=?'); params.push(parseFloat(valor_conversao) || 0); }
    if (!updates.length) return res.json({ ok: false, erro: 'Nada para atualizar.' });
    updates.push(`atualizado_em=datetime('now','localtime')`);
    params.push(parseInt(req.params.id));
    await dbRun(`UPDATE cheff_ai_leads SET ${updates.join(',')} WHERE id=?`, params);
    res.json({ ok: true });
  }));

  // ═══════════════════════════════════════════
  // 4. DISPARADOR WHATSAPP
  // ═══════════════════════════════════════════

  app.get('/api/cheff-ai/campanhas', verificarToken, safe(async (req, res) => {
    const rows = await dbAll(`SELECT * FROM cheff_ai_campanhas ORDER BY criado_em DESC LIMIT 50`);
    res.json({ ok: true, campanhas: rows });
  }));

  app.post('/api/cheff-ai/campanhas', verificarToken, safe(async (req, res) => {
    const { nome, mensagem, segmento, agendado_em } = req.body || {};
    if (!nome || !mensagem) return res.json({ ok: false, erro: 'Nome e mensagem sao obrigatorios.' });
    const r = await dbRun(
      `INSERT INTO cheff_ai_campanhas (nome, mensagem, segmento, agendado_em, status) VALUES (?,?,?,?,?)`,
      [nome, mensagem, segmento || 'todos', agendado_em || null, agendado_em ? 'agendada' : 'rascunho']
    );
    res.json({ ok: true, id: r.lastID });
  }));

  app.post('/api/cheff-ai/campanhas/:id/disparar', verificarToken, safe(async (req, res) => {
    const campanha = await dbGet(`SELECT * FROM cheff_ai_campanhas WHERE id=?`, [req.params.id]);
    if (!campanha) return res.json({ ok: false, erro: 'Campanha nao encontrada.' });
    let clientes = await dbAll(`SELECT telefone, nome FROM clientes WHERE ativo = 1 LIMIT 1000`).catch(() => []);
    if (campanha.segmento === 'inativos') {
      clientes = await dbAll(`SELECT telefone, nome FROM clientes WHERE ativo=1 AND (ultima_compra IS NULL OR ultima_compra < datetime('now','localtime','-30 days')) LIMIT 1000`).catch(() => []);
    }
    await dbRun(`UPDATE cheff_ai_campanhas SET status='enviando', enviados=0 WHERE id=?`, [campanha.id]);
    let enviados = 0;
    for (const c of clientes) {
      const msg = campanha.mensagem.replace('{nome}', c.nome || 'Cliente');
      await dbRun(`INSERT INTO cheff_ai_conversas (telefone, direcao, tipo, conteudo, status) VALUES (?, 'out', 'text', ?, 'enviado')`, [c.telefone, msg]).catch(() => {});
      enviados++;
    }
    await dbRun(`UPDATE cheff_ai_campanhas SET status='concluida', enviados=? WHERE id=?`, [enviados, campanha.id]);
    if (io) io.emit('cheff_ai:campanha_concluida', { id: campanha.id, enviados });
    res.json({ ok: true, enviados });
  }));

  // ═══════════════════════════════════════════
  // 5. CUPONS GOOGLE OFERTAS
  // ═══════════════════════════════════════════

  app.get('/api/cheff-ai/cupons', verificarToken, safe(async (req, res) => {
    const rows = await dbAll(`SELECT * FROM cheff_ai_cupons ORDER BY criado_em DESC`);
    res.json({ ok: true, cupons: rows });
  }));

  app.post('/api/cheff-ai/cupons', verificarToken, safe(async (req, res) => {
    const { titulo, descricao, codigo, tipo, valor, validade_em, usos_max } = req.body || {};
    if (!titulo) return res.json({ ok: false, erro: 'Titulo obrigatorio.' });
    const cod = codigo || `CHEF${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const r = await dbRun(
      `INSERT INTO cheff_ai_cupons (titulo, descricao, codigo, tipo, valor, validade_em, usos_max) VALUES (?,?,?,?,?,?,?)`,
      [titulo, descricao || '', cod, tipo || 'percentual', parseFloat(valor) || 0, validade_em || null, parseInt(usos_max) || 100]
    );
    res.json({ ok: true, id: r.lastID, codigo: cod });
  }));

  app.post('/api/cheff-ai/cupons/validar', safe(async (req, res) => {
    const { codigo } = req.body || {};
    const cupom = await dbGet(`SELECT * FROM cheff_ai_cupons WHERE codigo=? AND ativo=1`, [codigo]);
    if (!cupom) return res.json({ ok: false, erro: 'Cupom invalido ou inativo.' });
    if (cupom.validade_em && new Date(cupom.validade_em) < new Date()) return res.json({ ok: false, erro: 'Cupom expirado.' });
    if (cupom.usos >= cupom.usos_max) return res.json({ ok: false, erro: 'Cupom esgotado.' });
    await dbRun(`UPDATE cheff_ai_cupons SET usos=usos+1 WHERE id=?`, [cupom.id]);
    res.json({ ok: true, cupom: { tipo: cupom.tipo, valor: cupom.valor, titulo: cupom.titulo } });
  }));

  app.delete('/api/cheff-ai/cupons/:id', verificarToken, safe(async (req, res) => {
    await dbRun(`UPDATE cheff_ai_cupons SET ativo=0 WHERE id=?`, [req.params.id]);
    res.json({ ok: true });
  }));

  // ═══════════════════════════════════════════
  // 6. CRM RECUPERADOR DE VENDAS
  // ═══════════════════════════════════════════

  app.get('/api/cheff-ai/crm/inativos', verificarToken, safe(async (req, res) => {
    const { dias = 30, limit = 50 } = req.query;
    const clientes = await dbAll(
      `SELECT c.id, c.nome, c.telefone, c.email,
         MAX(p.criado_em) AS ultima_compra,
         COUNT(p.id) AS total_pedidos,
         COALESCE(SUM(p.total), 0) AS valor_total
       FROM clientes c
       LEFT JOIN pedidos p ON p.cliente_id = c.id
       WHERE c.ativo = 1
       GROUP BY c.id
       HAVING ultima_compra IS NULL OR ultima_compra < datetime('now','localtime','-' || ? || ' days')
       ORDER BY ultima_compra ASC LIMIT ?`,
      [parseInt(dias), parseInt(limit)]
    ).catch(() => []);
    res.json({ ok: true, clientes, total: clientes.length });
  }));

  app.post('/api/cheff-ai/crm/recuperar', verificarToken, safe(async (req, res) => {
    const { cliente_id, tipo, descricao } = req.body || {};
    if (!cliente_id) return res.json({ ok: false, erro: 'Cliente nao informado.' });
    await dbRun(`INSERT INTO cheff_ai_crm_acoes (cliente_id, tipo, descricao) VALUES (?,?,?)`,
      [cliente_id, tipo || 'mensagem_whatsapp', descricao || 'Acao de recuperacao']);
    res.json({ ok: true });
  }));

  // ═══════════════════════════════════════════
  // 7. DASHBOARD GERAL
  // ═══════════════════════════════════════════

  app.get('/api/cheff-ai/dashboard', verificarToken, safe(async (req, res) => {
    const [tl, tc, conv, camp, cups, inat, hoje] = await Promise.all([
      dbGet(`SELECT COUNT(*) as n FROM cheff_ai_leads`),
      dbGet(`SELECT COUNT(*) as n FROM cheff_ai_leads WHERE convertido=1`),
      dbGet(`SELECT COUNT(*) as n FROM cheff_ai_conversas WHERE direcao='in'`),
      dbGet(`SELECT COUNT(*) as n FROM cheff_ai_campanhas`),
      dbGet(`SELECT COUNT(*) as n FROM cheff_ai_cupons WHERE ativo=1`),
      dbGet(`SELECT COUNT(*) as n FROM clientes WHERE ativo=1`).catch(() => ({ n: 0 })),
      dbGet(`SELECT COUNT(*) as n FROM cheff_ai_conversas WHERE direcao='in' AND date(criado_em)=date('now','localtime')`)
    ]);
    res.json({
      ok: true,
      stats: {
        leads: { total: tl.n || 0, convertidos: tc.n || 0, taxa: tl.n > 0 ? Math.round(((tc.n || 0) / tl.n) * 100) : 0 },
        whatsapp: { total: conv.n || 0, hoje: hoje.n || 0 },
        campanhas: camp.n || 0,
        cupons_ativos: cups.n || 0,
        clientes: inat.n || 0
      }
    });
  }));

  // ═══════════════════════════════════════════
  // 8. CHEFF AI UPSELLING & CROSS-SELLING
  // ═══════════════════════════════════════════
  app.get('/api/cheff-ai/upsell', safe(async (req, res) => {
    const { itens = '', categoria = '' } = req.query;
    const itensArray = String(itens).split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

    // 1. Busca todos os produtos ativos do cardápio
    const todosProdutos = await dbAll(
      `SELECT id, nome, preco, categoria, COALESCE(imagem, '') as imagem
       FROM produtos
       WHERE ativo = 1
       ORDER BY preco ASC`
    );

    if (!todosProdutos || todosProdutos.length === 0) {
      return res.json({ ok: true, recomendacoes: [] });
    }

    // 2. Filtra produtos que NÃO estão no carrinho
    const disponiveis = todosProdutos.filter(p => {
      const nomeLower = String(p.nome).trim().toLowerCase();
      return !itensArray.some(it => nomeLower.includes(it) || it.includes(nomeLower));
    });

    // 3. Regras inteligentes por categoria
    const categoriasBebidas = ['bebidas', 'bebida', 'sucos', 'refrigerantes', 'cervejas', 'drinks'];
    const categoriasSobremesas = ['sobremesas', 'sobremesa', 'doces'];
    const categoriasAcompanhamentos = ['acompanhamentos', 'porções', 'porcoes', 'entradas'];

    let prioritarios = [];

    // Prioriza bebidas se o carrinho ainda não tem bebida
    const temBebida = itensArray.some(it => categoriasBebidas.some(cb => it.includes(cb)));
    const bebidas = disponiveis.filter(p => categoriasBebidas.includes(String(p.categoria).toLowerCase()));
    const sobremesas = disponiveis.filter(p => categoriasSobremesas.includes(String(p.categoria).toLowerCase()));
    const acompanhamentos = disponiveis.filter(p => categoriasAcompanhamentos.includes(String(p.categoria).toLowerCase()));

    if (!temBebida && bebidas.length > 0) {
      const topBebida = bebidas[0];
      prioritarios.push({
        ...topBebida,
        motivo: 'Refresque seu pedido',
        call_to_action: `Que tal adicionar ${topBebida.nome} por apenas + R$ ${Number(topBebida.preco).toFixed(2).replace('.', ',')}?`,
        tipo: 'cross_sell'
      });
    }

    if (acompanhamentos.length > 0) {
      const topAcomp = acompanhamentos[0];
      prioritarios.push({
        ...topAcomp,
        motivo: 'Mais pedido com seu prato',
        call_to_action: `Turbine sua refeição com ${topAcomp.nome} por + R$ ${Number(topAcomp.preco).toFixed(2).replace('.', ',')}!`,
        tipo: 'upsell'
      });
    }

    if (sobremesas.length > 0) {
      const topDoc = sobremesas[0];
      prioritarios.push({
        ...topDoc,
        motivo: 'Adoce seu momento',
        call_to_action: `Finalize com chave de ouro: ${topDoc.nome} por + R$ ${Number(topDoc.preco).toFixed(2).replace('.', ',')}!`,
        tipo: 'sobremesa'
      });
    }

    // Se ainda restou espaço, completa com produtos mais baratos (ticket boosters)
    if (prioritarios.length < 3) {
      disponiveis.slice(0, 3 - prioritarios.length).forEach(p => {
        if (!prioritarios.some(pr => pr.id === p.id)) {
          prioritarios.push({
            ...p,
            motivo: 'Destaque da Cozinha',
            call_to_action: `Experimente também ${p.nome} por + R$ ${Number(p.preco).toFixed(2).replace('.', ',')}!`,
            tipo: 'sugestao'
          });
        }
      });
    }

    res.json({
      ok: true,
      total: prioritarios.length,
      recomendacoes: prioritarios
    });
  }));

  // ═══════════════════════════════════════════
  // 9. ROBÔ DE REATIVAÇÃO DE CLIENTES VIA WHATSAPP (CHEFF AI)
  // ═══════════════════════════════════════════
  app.post('/api/cheff-ai/crm/reativacao-automatica', verificarToken, safe(async (req, res) => {
    const { dias = 20, cupom_prefixo = 'VOLTA', desconto_pct = 15, limite = 30 } = req.body || {};

    // 1. Busca clientes inativos com telefone válido
    const inativos = await dbAll(
      `SELECT c.id, c.nome, c.telefone,
         MAX(p.criado_em) AS ultima_compra,
         COUNT(p.id) AS total_pedidos
       FROM clientes c
       LEFT JOIN pedidos p ON p.cliente_id = c.id
       WHERE c.ativo = 1 AND c.telefone IS NOT NULL AND LENGTH(c.telefone) >= 8
       GROUP BY c.id
       HAVING ultima_compra IS NULL OR ultima_compra < datetime('now','localtime','-' || ? || ' days')
       ORDER BY ultima_compra ASC LIMIT ?`,
      [parseInt(dias), parseInt(limite)]
    );

    if (!inativos || inativos.length === 0) {
      return res.json({ ok: true, mensagem: 'Nenhum cliente inativo elegível no período selecionado.', disparados: 0 });
    }

    // 2. Busca nome do restaurante nas configurações
    const cfgNome = await dbGet(`SELECT valor FROM configuracoes WHERE chave = 'nome_restaurante'`).catch(() => null);
    const nomeRestaurante = (cfgNome && cfgNome.valor) || 'Chef Cozinha';

    // 3. Cria cupom de retorno ativo por 7 dias
    const codigoCupom = `${String(cupom_prefixo).toUpperCase()}${desconto_pct}-${Math.floor(100 + Math.random() * 900)}`;
    const validade = new Date();
    validade.setDate(validade.getDate() + 7);

    await dbRun(
      `INSERT INTO cheff_ai_cupons (titulo, descricao, codigo, tipo, valor, validade_em, usos_max, ativo)
       VALUES (?, ?, ?, 'percentual', ?, ?, ?, 1)`,
      [
        `Cupom de Reativação ${desconto_pct}%`,
        `Exclusivo para clientes que estão com saudades de nosso cardápio`,
        codigoCupom,
        parseFloat(desconto_pct),
        validade.toISOString(),
        inativos.length * 2
      ]
    );

    // 4. Dispara mensagens personalizadas para cada cliente inativo
    let disparados = 0;
    for (const c of inativos) {
      const primeiroNome = (c.nome || 'Amigo').split(' ')[0];
      const mensagem = `Olá ${primeiroNome}! 🍽️✨ Sentimos sua falta aqui no *${nomeRestaurante}*!\n\n` +
        `Para comemorar seu retorno, liberamos um cupom especial de *${desconto_pct}% OFF* para o seu próximo pedido:\n\n` +
        `🎟️ Cupom: *${codigoCupom}*\n` +
        `⏰ Válido pelos próximos 7 dias.\n\n` +
        `Acesse nosso cardápio e aproveite agora! Esperamos por você! 😊`;

      // Registra mensagem na conversa
      await dbRun(
        `INSERT INTO cheff_ai_conversas (telefone, nome_cliente, direcao, tipo, conteudo, status)
         VALUES (?, ?, 'out', 'text', ?, 'enviado')`,
        [c.telefone, c.nome, mensagem]
      );

      // Registra ação no CRM
      await dbRun(
        `INSERT INTO cheff_ai_crm_acoes (cliente_id, tipo, descricao)
         VALUES (?, 'whatsapp_reativacao_ia', ?)`,
        [c.id, `Disparo de cupom ${codigoCupom} (${desconto_pct}% OFF) após ${dias} dias inativo`]
      );

      disparados++;
    }

    res.json({
      ok: true,
      mensagem: `Robô Cheff AI disparou reativação para ${disparados} cliente(s) inativo(s)!`,
      cupom_gerado: codigoCupom,
      validade: validade.toISOString().slice(0, 10),
      total_disparados: disparados
    });
  }));

  if (io) {
    io.on('connection', socket => {
      socket.on('cheff_ai:join', () => socket.join('cheff_ai_room'));
    });
  }

  log('CheffAI inicializado. Rotas: /api/cheff-ai/* (Upsell, Cross-sell, Reativação CRM)');
};
