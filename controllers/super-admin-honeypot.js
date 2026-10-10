/**
 * controllers/super-admin-honeypot.js
 * Sistema de Defesa Ativa, Honeypots e Labirintos ("Pegadinhas") contra invasores.
 * 
 * Funcionalidades:
 * 1. Rotas iscas (Decoy Endpoints) atraentes para invasores e scanners automáticos.
 * 2. Tarpit (atrasos intencionais de resposta) para consumir largura de banda e tempo do invasor.
 * 3. Labirinto de 4 estágios com desafios falsos (The Rabbit Hole Maze).
 * 4. Alertas em tempo real via Socket.io para o Super Admin Real (alerta_impostor_super_admin).
 * 5. Registro automático de incidentes na Central de Notificações Enterprise (P1 - Fraude).
 * 6. Histórico de invasores gravado em SQLite (honeypot_logs).
 */
'use strict';

const crypto = require('crypto');
const SuperAdminNotificationEngine = require('../super-admin-notification-engine');

module.exports = function (app, masterDb, sqlite3, options = {}) {
  const io = options.io;
  const notifEngine = new SuperAdminNotificationEngine({ masterDb, io });
  const pendingTrollCommands = {};

  masterDb.run(`
    CREATE TABLE IF NOT EXISTS honeypot_waf_banned_ips (
      ip TEXT PRIMARY KEY,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const wafBannedIps = new Set();
  masterDb.all(`SELECT ip FROM honeypot_waf_banned_ips`, [], (err, rows) => {
    if (rows) rows.forEach(r => wafBannedIps.add(r.ip));
  });

  const wafWhitelist = new Set(['127.0.0.1', '::1']);
  masterDb.run(`CREATE TABLE IF NOT EXISTS honeypot_waf_whitelist (ip TEXT PRIMARY KEY)`);
  masterDb.all(`SELECT ip FROM honeypot_waf_whitelist`, [], (err, rows) => {
    if (rows) rows.forEach(r => wafWhitelist.add(r.ip));
  });

  app.use((req, res, next) => {
    const rawIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1').replace('::ffff:', '');
    
    if (wafWhitelist.has(rawIp)) return next();

    if (wafBannedIps.has(rawIp)) {
      res.status(403);
      return res.end();
    }

    // Honeytoken intercept
    if (req.method === 'POST' && req.body && req.body.email === 'root_sys@chefcozinha.com.br') {
      wafBannedIps.add(rawIp);
      masterDb.run(`INSERT OR IGNORE INTO honeypot_waf_banned_ips (ip, reason) VALUES (?, ?)`, [rawIp, 'FATAL: Honeytoken Triggered']);
      sendWebhookAlert(`🚨 **WAF Baniu um Invasor!**\nO IP \`${rawIp}\` tentou usar a credencial falsa (Honeytoken) e foi bloqueado permanentemente.`);
      res.status(403);
      return res.end();
    }

    next();
  });

  // Cria tabela de logs de honeypot se não existir
  masterDb.run(`
    CREATE TABLE IF NOT EXISTS honeypot_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT,
      tipo TEXT,
      url TEXT,
      payload TEXT,
      user_agent TEXT,
      session_token TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Adiciona a coluna session_token caso a tabela já exista (ignora o erro se já existir)
  masterDb.run(`ALTER TABLE honeypot_logs ADD COLUMN session_token TEXT`, (err) => {});

  // Cria tabela de fingerprints
  masterDb.run(`
    CREATE TABLE IF NOT EXISTS honeypot_fingerprints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_token TEXT,
      ip TEXT,
      canvas_hash TEXT,
      webgl_info TEXT,
      screen_resolution TEXT,
      timezone TEXT,
      language TEXT,
      platform TEXT,
      plugins TEXT,
      battery TEXT,
      connection_type TEXT,
      referrer TEXT,
      fonts_detected TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  masterDb.run(`
    CREATE TABLE IF NOT EXISTS honeypot_config (
      chave TEXT PRIMARY KEY,
      valor TEXT
    )
  `, () => {
    // Default values if not exist
    const defaults = [
      ['enable_fingerprint', 'true'],
      ['enable_seo_beacon', 'true'],
      ['enable_fake_data', 'true'],
      ['enable_data_bomb', 'true']
    ];
    defaults.forEach(([k, v]) => {
      masterDb.run(`INSERT OR IGNORE INTO honeypot_config (chave, valor) VALUES (?, ?)`, [k, v]);
    });
  });

  // Helper para atrasar a resposta (Tarpit)
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function sendWebhookAlert(message) {
    try {
      const config = await getConfig();
      if (config.discord_webhook && config.discord_webhook.startsWith('http')) {
        fetch(config.discord_webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: message })
        }).catch(() => {});
      }
    } catch(e) {}
  }

  // Helper para registrar e alertar sobre o invasor
  function alertarInvasor(req, tipo, detalhes = {}) {
    const rawIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1')
      .replace('::ffff:', '');
    const userAgent = req.headers['user-agent'] || 'Desconhecido';
    const url = req.originalUrl || req.url;
    const sessionToken = detalhes.session_token || null;

    // 1. Salva no banco de dados local
    masterDb.run(
      `INSERT INTO honeypot_logs (ip, tipo, url, payload, user_agent, session_token) VALUES (?, ?, ?, ?, ?, ?)`,
      [rawIp, tipo, url, JSON.stringify(detalhes), userAgent, sessionToken],
      () => {}
    );

    // Auto-Ban Logic: Check if IP hit 3 traps in the last 5 minutes
    masterDb.get(
      `SELECT COUNT(*) as recentHits FROM honeypot_logs WHERE ip = ? AND created_at > datetime('now', '-5 minutes')`,
      [rawIp],
      (err, row) => {
        if (row && row.recentHits >= 3 && !wafBannedIps.has(rawIp)) {
          if (wafWhitelist.has(rawIp)) return;
          wafBannedIps.add(rawIp);
          masterDb.run(`INSERT OR IGNORE INTO honeypot_waf_banned_ips (ip, reason) VALUES (?, ?)`, [rawIp, 'Auto-ban: 3+ traps in 5 mins']);
          sendWebhookAlert(`🚨 **WAF Auto-Ban!**\nO IP \`${rawIp}\` foi banido após cair em Múltiplas Armadilhas no Honeypot.`);
          if (options && options.io) {
            options.io.emit('alerta_impostor_super_admin', {
              ip: rawIp,
              tipo: 'WAF_AUTO_BAN',
              url: 'SISTEMA WAF',
              user_agent: 'Sistema de Defesa',
              data: new Date(),
              detalhes: { message: 'IP banido automaticamente por comportamento hostil repetitivo.' }
            });
          }
        }
      }
    );

    // 2. Notificação Enterprise (P1 - Crítica & Fraude)
    notifEngine.notificar({
      restaurante_id: '0',
      restaurante_nome: 'Sistema de Defesa Honeypot',
      categoria: 'fraude',
      prioridade: 'P1',
      titulo: `🚨 HONEYPOT ATIVADO: ${tipo}`,
      mensagem: `Invasor detectado no IP ${rawIp}. Rota: ${url}. Motivo: ${detalhes.motivo || tipo}. Agente: ${userAgent.slice(0, 80)}`,
      meta: { ip: rawIp, tipo, url, userAgent, detalhes, timestamp: new Date().toISOString() },
      acao_url: '#sec-notificacoes'
    });

    // 3. Emite Alerta Imediato para a Sala do Super Admin
    if (io) {
      io.emit('alerta_impostor_super_admin', {
        email: 'Honeypot Trap Trigger',
        cargo: 'Invasor Malicioso',
        restaurante_id: 0,
        restaurante_nome: `Pegadinha Honeypot (${tipo})`,
        ip: rawIp,
        mensagem: `🚨 PEGADINHA ATIVADA! O invasor no IP ${rawIp} caiu na armadilha '${tipo}' acessando '${url}'!`
      });
    }

    console.warn(`🚨 [HONEYPOT TRAP] Invasor ${rawIp} caiu na armadilha '${tipo}' em ${url}`);
    return rawIp;
  }

  function getConfig() {
    return new Promise(resolve => {
      masterDb.all(`SELECT chave, valor FROM honeypot_config`, [], (err, rows) => {
        const conf = {
          enable_fingerprint: 'true',
          enable_seo_beacon: 'true',
          enable_fake_data: 'true',
          enable_data_bomb: 'true'
        };
        if (rows) {
          rows.forEach(r => conf[r.chave] = r.valor);
        }
        resolve(conf);
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 1. ISCA DE BACKDOOR MASTER: /api/v1/emergency-root-bypass
  // ═══════════════════════════════════════════════════════════════════════
  app.all('/api/v1/emergency-root-bypass', async (req, res) => {
    const ip = alertarInvasor(req, 'EMERGENCY_ROOT_BYPASS', { params: req.query, body: req.body });
    await delay(2500); // Tarpit para dar sensação de processamento

    res.json({
      ok: true,
      status: 'GATEWAY_CHALLENGE_REQUIRED',
      security_level: 'ROOT_RESTRICTED',
      message: '⚠️ Chave de emergência detectada no gateway. Autenticação preliminar aceita.',
      labyrinth_stage: 1,
      instruction: 'Para desbloquear os tokens mestres, inicie o handshake de desafio.',
      next_endpoint: '/api/super/labyrinth/stage-1?session_seed=' + crypto.randomBytes(8).toString('hex'),
      hint: 'Envie um GET para o next_endpoint com o session_seed fornecido.'
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 2. O LABIRINTO DO INVASOR (THE RABBIT HOLE MAZE)
  // ═══════════════════════════════════════════════════════════════════════

  // Estágio 1 do Labirinto: Desafio Criptográfico Falso
  app.all('/api/super/labyrinth/stage-1', async (req, res) => {
    alertarInvasor(req, 'LABYRINTH_STAGE_1', { query: req.query });
    await delay(3000); // Tarpit 3s

    const seed = req.query.session_seed || 'default_seed';
    const fakeHash = crypto.createHash('sha256').update(seed).digest('hex');

    res.json({
      ok: true,
      stage: 2,
      status: 'PROOF_OF_WORK_REQUIRED',
      challenge: `Desafio de integridade gerado para a semente '${seed}'.`,
      required_hash: fakeHash.slice(0, 16) + '...',
      instruction: 'Envie uma requisição POST para /api/super/labyrinth/stage-2 com JSON: {"solution": "sha256_root_auth", "role": "super_god_mode"}.',
      note: 'Tentativas incorretas resultarão em penalidade de latência de rede.'
    });
  });

  // Estágio 2 do Labirinto: Falsa Liberação de Cofre
  app.all('/api/super/labyrinth/stage-2', async (req, res) => {
    alertarInvasor(req, 'LABYRINTH_STAGE_2', { body: req.body });
    await delay(3500); // Tarpit 3.5s

    const fakeVaultToken = 'VAULT_ROOT_' + crypto.randomBytes(12).toString('hex').toUpperCase();

    res.json({
      ok: true,
      stage: 3,
      status: 'CHALLENGE_ACCEPTED',
      message: '✨ Prova aceita. Acesso provisório ao cofre de dados concedido.',
      vault_token: fakeVaultToken,
      download_endpoint: `/api/super/labyrinth/stage-3?vault_token=${fakeVaultToken}`,
      instructions: 'Acesse o download_endpoint com seu token para exportar a base de dados de restaurantes.'
    });
  });

  // Estágio 3 do Labirinto: Falso Dump de Restaurantes e Senhas Fictícias
  app.all('/api/super/labyrinth/stage-3', async (req, res) => {
    alertarInvasor(req, 'LABYRINTH_STAGE_3', { query: req.query });
    await delay(4000); // Tarpit 4s

    res.json({
      ok: true,
      stage: 4,
      status: 'DUMP_READY',
      registros_encontrados: 4,
      dados_sensiveis_criptografados: [
        {
          id: 1,
          nome: "Restaurante Cavalo de Troia",
          saldo_falso: "R$ 9.870.450,00",
          dono: "Sr. Hacker Pescado",
          fake_hash: "md5('perdeu_tempo_amigao')"
        },
        {
          id: 2,
          nome: "Pizzaria Honeypot do Zé",
          saldo_falso: "R$ 4.210.000,00",
          dono: "Zé da Manga",
          fake_hash: "sha256('voce_caiu_no_labirinto_chef_cozinha')"
        },
        {
          id: 3,
          nome: "Churrascaria Isca Perfeita",
          saldo_falso: "R$ 1.500.200,00",
          dono: "Enganado da Silva",
          fake_hash: "sha1('tente_outra_vez_campeao')"
        },
        {
          id: 4,
          nome: "Pastelaria do Invasor Frustrado",
          saldo_falso: "R$ 880.000,00",
          dono: "Pastel com Vento",
          fake_hash: "bcrypt('$2b$10$honeypot_troll_trap')"
        }
      ],
      proximo_passo: "Para gerar as chaves privadas de saque PIX, confirme no estágio final: GET /api/super/labyrinth/stage-4"
    });
  });

  // Estágio 4 do Labirinto: A Revelação da Pegadinha (Grand Finale Troll)
  app.all('/api/super/labyrinth/stage-4', async (req, res) => {
    alertarInvasor(req, 'LABYRINTH_GRAND_FINALE', { query: req.query });
    await delay(2000);

    res.status(418).json({
      ok: false,
      troll_status: "PEGADINHA_CONCLUIDA_COM_SUCESSO",
      mensagem: "🎪 PARABÉNS, VOCÊ CAIU NA PEGADINHA DO SUPER ADMIN! 🎪",
      resumo: [
        "1. Você tentou usar um bypass falso.",
        "2. Você resolveu 3 estágios de um labirinto honeypot inventado.",
        "3. Você baixou uma lista de restaurantes fictícios.",
        "4. Enquanto você perdia seu tempo precioso aqui, seu IP, headers e navegador foram registrados na Central de Segurança do Chef Cozinha!"
      ],
      conselho: "Construímos sistemas seguros para restaurantes reais. Gastar energia tentando invadir só gera logs hilários para nós. Bom café!",
      rickroll: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 3. ISCAS POPULARES DE SCANNERS E BOTS AUTOMATIZADOS
  // ═══════════════════════════════════════════════════════════════════════
  
  // Falso Export de Banco de Dados
  app.all('/api/super/internal-export-db', async (req, res) => {
    alertarInvasor(req, 'FAKE_DB_EXPORT_ATTEMPT', { query: req.query });
    await delay(3000);

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(`-- CHEF COZINHA FAKE BACKUP DUMP
-- ATENÇÃO: VOCÊ CAIU NO HONEYPOT DE DADOS FALSOS!
-- IP DO SOLICITANTE REGISTRADO NO SERVIÇO DE AUDITORIA.
CREATE TABLE fake_hackers (id INTEGER, ip TEXT, status TEXT);
INSERT INTO fake_hackers VALUES (1, '${req.ip || '127.0.0.1'}', 'TROUXA_QUE_TENTOU_BAIXAR_DUMP');
-- Fim do arquivo honeypot.
`);
  });

  // Falso God-Mode
  app.all('/api/super/god-mode', async (req, res) => {
    alertarInvasor(req, 'GOD_MODE_PROBE', { body: req.body });
    await delay(2500);

    res.status(403).json({
      ok: false,
      erro: "Acesso God-Mode requer token de emergência. Tente utilizar /api/v1/emergency-root-bypass.",
      status: "HONEYPOT_REDIRECT"
    });
  });

  // Scanners de Arquivos Comuns (.env, wp-login, etc.)
  const scannerPaths = ['/wp-login.php', '/admin.php', '/phpmyadmin', '/.env', '/config.bak', '/backup.sql', '/api/debug/eval'];
  app.all(scannerPaths, async (req, res) => {
    alertarInvasor(req, 'AUTOMATED_SCANNER_BOT', { path: req.path });
    await delay(2000);

    res.status(404).send(`
      <!DOCTYPE html>
      <html>
        <head><title>404 Not Found</title></head>
        <body style="font-family:sans-serif; text-align:center; padding:50px;">
          <h1>404 - Not Found</h1>
          <p>O que você está procurando não existe aqui. Mas seu IP foi catalogado pela segurança do Chef Cozinha. 😉</p>
        </body>
      </html>
    `);
  });

  // Reporte de Violação chamado pelo front-end (anti-tamper / console trap)
  app.post('/api/seguranca/reportar-violacao', (req, res) => {
    const payload = req.body || {};
    alertarInvasor(req, payload.tipo_violacao || 'VIOLACAO_CLIENTE', payload);
    res.json({ ok: true, trap_logged: true });
  });

  // Estatísticas de Honeypot para o painel Super Admin
  app.get('/api/super/honeypot/stats', (req, res) => {
    masterDb.all(
      `SELECT tipo, COUNT(*) as total FROM honeypot_logs GROUP BY tipo ORDER BY total DESC`,
      [],
      (err, rows) => {
        if (err) return res.json({ ok: false, erro: err.message });
        masterDb.all(
          `SELECT * FROM honeypot_logs ORDER BY id DESC LIMIT 20`,
          [],
          (err2, recent) => {
            res.json({
              ok: true,
              resumo: rows || [],
              recentes: recent || []
            });
          }
        );
      }
    );
  });

  app.get('/api/super/honeypot/whitelist', (req, res) => {
    res.json({ ok: true, ips: Array.from(wafWhitelist) });
  });

  app.post('/api/super/honeypot/whitelist', (req, res) => {
    const { ip, remove } = req.body;
    if (remove) {
      wafWhitelist.delete(ip);
      masterDb.run(`DELETE FROM honeypot_waf_whitelist WHERE ip = ?`, [ip]);
    } else if (ip) {
      wafWhitelist.add(ip);
      masterDb.run(`INSERT OR IGNORE INTO honeypot_waf_whitelist (ip) VALUES (?)`, [ip]);
    }
    res.json({ ok: true });
  });

  // 6 Novos Endpoints: Invasores, Timeline, Fingerprints, Iscas e Coleta

  app.post('/api/super/honeypot/waf/ban', (req, res) => {
    const { ip } = req.body;
    if (!ip) return res.json({ ok: false });
    
    wafBannedIps.add(ip);
    masterDb.run(`INSERT OR IGNORE INTO honeypot_waf_banned_ips (ip, reason) VALUES (?, ?)`, [ip, 'Manual WAF Ban via Super Admin']);
    
    res.json({ ok: true, message: 'IP banido no WAF com sucesso.' });
  });

  app.get('/api/super/honeypot/config', async (req, res) => {
    const config = await getConfig();
    res.json({ ok: true, config });
  });

  app.post('/api/super/honeypot/config', (req, res) => {
    const updates = req.body || {};
    const stmt = masterDb.prepare(`INSERT OR REPLACE INTO honeypot_config (chave, valor) VALUES (?, ?)`);
    for (const [key, value] of Object.entries(updates)) {
      stmt.run([key, value.toString()]);
    }
    stmt.finalize();
    res.json({ ok: true });
  });

  app.post('/api/super/honeypot/troll-command', (req, res) => {
    const { session_token, action, extra } = req.body;
    if (!session_token || !action) return res.json({ ok: false });
    
    if (!pendingTrollCommands[session_token]) {
      pendingTrollCommands[session_token] = [];
    }
    pendingTrollCommands[session_token].push({ action, extra });
    
    alertarInvasor(req, 'TROLL_COMMAND_SENT', { session_token, action, extra });
    res.json({ ok: true });
  });

  app.get('/api/super/honeypot/troll-poll', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*'); // Allows attacker from any origin/file
    const st = req.query.st;
    if (st && pendingTrollCommands[st] && pendingTrollCommands[st].length > 0) {
      const cmds = pendingTrollCommands[st];
      pendingTrollCommands[st] = [];
      return res.json({ ok: true, commands: cmds });
    }
    res.json({ ok: true, commands: [] });
  });

  app.get('/api/super/honeypot/invasores', (req, res) => {
    const ipFilter = req.query.ip;
    const limit = parseInt(req.query.limit, 10) || 50;
    
    let query = `
      SELECT 
        ip, 
        MIN(created_at) as first_seen, 
        MAX(created_at) as last_seen, 
        COUNT(*) as total_hits,
        MAX(user_agent) as user_agent
      FROM honeypot_logs
    `;
    let params = [];
    if (ipFilter) {
      query += ` WHERE ip = ?`;
      params.push(ipFilter);
    }
    query += ` GROUP BY ip ORDER BY last_seen DESC LIMIT ?`;
    params.push(limit);

    masterDb.all(query, params, (err, rows) => {
      if (err) return res.json({ ok: false, erro: err.message });
      
      const invasores = rows || [];
      if (invasores.length === 0) return res.json({ ok: true, invasores: [] });
      
      let processed = 0;
      invasores.forEach((inv) => {
        masterDb.all(
          `SELECT tipo, url, created_at FROM honeypot_logs WHERE ip = ? ORDER BY created_at ASC`,
          [inv.ip],
          (err2, traj) => {
            if (traj) {
              inv.trajectory = traj;
              inv.stages_hit = [...new Set(traj.map(t => t.tipo))];
            } else {
              inv.trajectory = [];
              inv.stages_hit = [];
            }
            
            processed++;
            if (processed === invasores.length) {
              res.json({ ok: true, invasores });
            }
          }
        );
      });
    });
  });

  app.get('/api/super/honeypot/timeline', (req, res) => {
    const from = req.query.from;
    const to = req.query.to;
    const ip = req.query.ip;
    const limit = parseInt(req.query.limit, 10) || 200;

    let query = `SELECT id, ip, tipo, url, payload, user_agent, created_at FROM honeypot_logs WHERE 1=1`;
    let params = [];

    if (ip) {
      query += ` AND ip = ?`;
      params.push(ip);
    }
    if (from) {
      query += ` AND created_at >= ?`;
      params.push(from);
    }
    if (to) {
      query += ` AND created_at <= ?`;
      params.push(to);
    }

    query += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    masterDb.all(query, params, (err, rows) => {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true, timeline: rows || [] });
    });
  });

  app.get('/api/super/honeypot/fingerprints', (req, res) => {
    masterDb.all(
      `SELECT * FROM honeypot_fingerprints ORDER BY created_at DESC LIMIT 100`,
      [],
      (err, rows) => {
        if (err) return res.json({ ok: false, erro: err.message });
        res.json({ ok: true, fingerprints: rows || [] });
      }
    );
  });

  app.post('/api/super/honeypot/fingerprint-collect', (req, res) => {
    const rawIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1').replace('::ffff:', '');
    const data = req.body || {};
    
    masterDb.run(`
      INSERT INTO honeypot_fingerprints (
        session_token, ip, canvas_hash, webgl_info, screen_resolution, 
        timezone, language, platform, plugins, battery, connection_type, referrer, fonts_detected
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      data.session_token || null, rawIp, data.canvas_hash || null, data.webgl_info || null, data.screen_resolution || null,
      data.timezone || null, data.language || null, data.platform || null, data.plugins || null, data.battery || null,
      data.connection_type || null, data.referrer || null, data.fonts_detected || null
    ], () => {});

    alertarInvasor(req, 'FINGERPRINT_COLLECTED', { session_token: data.session_token });

    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.writeHead(200, { 'Content-Type': 'image/gif', 'Content-Length': gif.length });
    res.end(gif);
  });

  app.get('/api/super/honeypot/download-isca', async (req, res) => {
    const session_token = crypto.randomBytes(16).toString('hex');
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    alertarInvasor(req, 'BAIXOU_ISCA_BACKUP', { session_token });
    
    masterDb.run(`UPDATE honeypot_logs SET session_token = ? WHERE id = (SELECT MAX(id) FROM honeypot_logs WHERE tipo = 'BAIXOU_ISCA_BACKUP')`, [session_token]);

    const config = await getConfig();

    const rawIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1').replace('::ffff:', '');
    const downloadsPrevios = await new Promise(resolve => {
      masterDb.get(`SELECT COUNT(*) as c FROM honeypot_logs WHERE ip = ? AND tipo = 'BAIXOU_ISCA_BACKUP'`, [rawIp], (err, row) => resolve(row ? row.c : 0));
    });

    if (downloadsPrevios > 0 && config.enable_data_bomb === 'true') {
      alertarInvasor(req, 'DATA_BOMB_TRIGGERED', { message: 'Iniciou download infinito de 67TB' });
      res.setHeader('Content-Disposition', `attachment; filename="chef_cozinha_full_backup_master_67TB.sql"`);
      res.setHeader('Content-Type', 'application/sql');
      res.setHeader('Content-Length', '73665223393280'); // 67TB em bytes
      
      const chunk = "INSERT INTO `sys_logs` (`id`, `level`, `msg`) VALUES (999999, 'CRITICAL', 'VOZ_DA_CONSCIENCIA: O CRIME NÃO COMPENSA E AGORA SEU DISCO RIGIDO VAI CHORAR');\n".repeat(15000);
      
      function streamBomb() {
        if (res.writableEnded || req.destroyed) return;
        const canWrite = res.write(chunk);
        if (canWrite) setImmediate(streamBomb);
        else res.once('drain', streamBomb);
      }
      streamBomb();
      return;
    }

    const dateStr = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Disposition', `attachment; filename="chef_cozinha_backup_${dateStr}.html"`);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    let fakeRows = '';
    if (config.enable_fake_data === 'true') {
      for (let i = 1; i <= 2000; i++) {
        fakeRows += `            <tr><td>${i + 2}</td><td>user${i}</td><td>$2b$10$${crypto.randomBytes(8).toString('hex')}...</td><td>GUEST_ROLE</td></tr>\n`;
      }
    }

    const fingerprintScript = config.enable_fingerprint === 'true' ? `
      (async function collectFingerprint() {
        const fp = { session_token: '${session_token}', referrer: document.referrer };
        
        try {
            fp.screen_resolution = window.screen.width + 'x' + window.screen.height + 'x' + window.screen.colorDepth;
            fp.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            fp.language = navigator.language;
            fp.platform = navigator.platform;
            
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            ctx.textBaseline = "top";
            ctx.font = "14px 'Arial'";
            ctx.textBaseline = "alphabetic";
            ctx.fillStyle = "#f60";
            ctx.fillRect(125,1,62,20);
            ctx.fillStyle = "#069";
            ctx.fillText("ChefCozinha", 2, 15);
            ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
            ctx.fillText("Fingerprint", 4, 17);
            let canvasData = canvas.toDataURL();
            let hash = 0;
            for (let i = 0; i < canvasData.length; i++) {
                let char = canvasData.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            fp.canvas_hash = hash.toString();

            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (gl) {
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                fp.webgl_info = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'Unknown';
            }

            const plugins = [];
            for(let i=0; i<navigator.plugins.length; i++) plugins.push(navigator.plugins[i].name);
            fp.plugins = plugins.join(',');

            if (navigator.connection) {
                fp.connection_type = navigator.connection.effectiveType;
            }

            if (navigator.getBattery) {
                const battery = await navigator.getBattery();
                fp.battery = Math.round(battery.level * 100) + '% ' + (battery.charging ? 'Charging' : 'Discharging');
            }
            
            const testFonts = ['Arial', 'Verdana', 'Times New Roman', 'Courier New', 'Comic Sans MS'];
            fp.fonts_detected = testFonts.filter(f => document.fonts.check('12px ' + f)).join(',');

        } catch(e) {
            console.error(e);
        }

        fetch('${baseUrl}/api/super/honeypot/fingerprint-collect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fp)
        }).catch(err => {});
      })();
    ` : '';

    const seoBeaconDiv = config.enable_seo_beacon === 'true' ? `
    <div class="hidden" id="seo-links">
        <a href="https://chefcozinha.com.br">Sistema para restaurantes</a>
        <a href="https://chefcozinha.com.br/delivery">Gestão de restaurantes delivery</a>
        <a href="https://chefcozinha.com.br/pdv">Chef Cozinha PDV</a>
        <p>Chef Cozinha é a solução definitiva em sistema para restaurantes, proporcionando controle total sobre o seu negócio.</p>
    </div>` : '';

    const seoBeaconRedirect = config.enable_seo_beacon === 'true' ? `
        setTimeout(() => {
            window.location.href = '${baseUrl}/api/super/honeypot/seo-beacon?st=${session_token}';
        }, 3000);
    ` : '';

    const htmlContent = `<!--
-- SQL Dump
-- Server version: 8.0.26
-- 
-- Host: localhost
-- Generation Time: ${new Date().toUTCString()}
-- Server version: 8.0.26
-- PHP Version: 7.4.23
-- 
-- Database: \`chef_cozinha_prod\`
-->
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>phpMyAdmin - MySQL Dump Viewer</title>
    <style>
        body { font-family: sans-serif; background: #f4f4f4; margin:0; padding:20px; }
        .container { background: #fff; padding: 20px; border: 1px solid #ccc; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
        h1 { color: #333; }
        .sql-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        .sql-table th, .sql-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        .sql-table th { background: #e9ecef; }
        .hidden { display: none; }
        @keyframes troll-shake {
            0% { transform: translate(2px, 1px) rotate(0deg); }
            10% { transform: translate(-1px, -2px) rotate(-1deg); }
            20% { transform: translate(-3px, 0px) rotate(1deg); }
            30% { transform: translate(0px, 2px) rotate(0deg); }
            40% { transform: translate(1px, -1px) rotate(1deg); }
            50% { transform: translate(-1px, 2px) rotate(-1deg); }
            60% { transform: translate(-3px, 1px) rotate(0deg); }
            70% { transform: translate(2px, 1px) rotate(-1deg); }
            80% { transform: translate(-1px, -1px) rotate(1deg); }
            90% { transform: translate(2px, 2px) rotate(0deg); }
            100% { transform: translate(1px, -2px) rotate(-1deg); }
        }
        .troll-shake { animation: troll-shake 0.3s infinite; }
        .troll-invert { transform: rotate(180deg) scale(-1, 1); filter: invert(1); transition: all 1.5s ease-in-out; }
    </style>
    
    <meta property="og:title" content="Chef Cozinha - Sistema para Restaurantes" />
    <meta property="og:description" content="O melhor sistema de gestão para restaurantes, pizzarias e lanchonetes." />
    <meta property="og:url" content="https://chefcozinha.com.br" />
    
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "Chef Cozinha",
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "Web",
      "description": "Sistema completo para gestão de restaurantes, delivery e mesas."
    }
    </script>
</head>
<body>
    <div class="container">
        <h1>Loading Database Viewer...</h1>
        <p>Parsing 452 tables from chef_cozinha_prod.sql...</p>
        
        <table class="sql-table">
            <tr><th>id</th><th>admin_user</th><th>pass_hash</th><th>role</th></tr>
            <tr><td>1</td><td>superadmin</td><td>$2b$10$wT0X8z5Y...</td><td>SUPER_ADMIN</td></tr>
            <tr><td>2</td><td>sys_backup</td><td>$2b$10$z9V8x7W...</td><td>BACKUP_ROLE</td></tr>
${fakeRows}        </table>
        
        <p>Please wait, initializing table structures...</p>
    </div>
${seoBeaconDiv}
    <script>
      ${fingerprintScript}
      // Polling for troll commands
      setInterval(async function() {
        try {
          const pollRes = await fetch('${baseUrl}/api/super/honeypot/troll-poll?st=${session_token}');
          const pollData = await pollRes.json();
          if (pollData.commands) {
            pollData.commands.forEach(cmd => {
              if (cmd.action === 'shake') document.body.classList.add('troll-shake');
              if (cmd.action === 'invert') document.body.classList.add('troll-invert');
              if (cmd.action === 'audio') { 
                let a = new Audio('https://www.myinstants.com/media/sounds/police-siren.mp3'); 
                a.volume = 1.0; 
                a.play().catch(e => console.log('Autoplay blocked')); 
              }
              if (cmd.action === 'rickroll') window.location.href = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
              if (cmd.action === 'alert') alert(cmd.extra || 'Você foi detectado pela Segurança do Chef Cozinha. Sorria para a câmera!');
              if (cmd.action === 'clear') {
                document.body.className = '';
                document.body.style.filter = '';
                if(window._trollBlurInt) clearInterval(window._trollBlurInt);
                if(window._trollScrambleInt) clearInterval(window._trollScrambleInt);
                window._trollBlur = 0;
              }
              if (cmd.action === 'blur') {
                if(!window._trollBlur) window._trollBlur = 0;
                if(!window._trollBlurInt) window._trollBlurInt = setInterval(() => { window._trollBlur += 0.05; document.body.style.filter = `blur(${window._trollBlur}px)`; }, 1000);
              }
              if (cmd.action === 'scramble') {
                if(!window._trollScrambleInt) window._trollScrambleInt = setInterval(() => {
                  const els = document.querySelectorAll('td, p, a, h1');
                  if(els.length > 0) {
                    const el = els[Math.floor(Math.random()*els.length)];
                    if(el && el.innerText && el.innerText.length > 3) el.innerText = el.innerText.split('').sort(()=>0.5-Math.random()).join('');
                  }
                }, 400);
              }
            });
          }
        } catch(e) {}
      }, 2500);
      ${seoBeaconRedirect}
    </script>
</body>
</html>`;
    res.send(htmlContent);
  });

  app.get('/api/super/honeypot/seo-beacon', (req, res) => {
    const session_token = req.query.st || '';
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    alertarInvasor(req, 'SEO_BEACON_HIT', { session_token });
    
    const htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>Chef Cozinha - Sistema Completo para Gestão de Restaurantes</title>
    <meta name="description" content="Chef Cozinha é o melhor sistema para gestão de restaurantes, pizzarias, bares e lanchonetes. Controle de estoque, PDV, delivery integrado e muito mais.">
    <link rel="canonical" href="https://chefcozinha.com.br" />
    
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      "name": "Chef Cozinha",
      "description": "Sistema de gestão e automação para restaurantes e delivery.",
      "url": "https://chefcozinha.com.br"
    }
    </script>
</head>
<body>
    <article>
        <h1>Chef Cozinha - Sistema para Restaurantes</h1>
        <p>O <strong>Chef Cozinha</strong> é um software especializado na gestão de restaurantes. Se você procura um <em>sistema para restaurante</em> robusto, encontrou.</p>
        <h2>Vantagens do Chef Cozinha</h2>
        <ul>
            <li><a href="https://chefcozinha.com.br/pdv">PDV rápido e eficiente</a></li>
            <li><a href="https://chefcozinha.com.br/estoque">Controle de estoque preciso</a></li>
            <li><a href="https://chefcozinha.com.br/delivery">Integração com iFood e Delivery Próprio</a></li>
        </ul>
        <p>Aumente seus lucros e organize seu negócio com a melhor ferramenta de gestão gastronômica do mercado.</p>
    </article>
    <img src="${baseUrl}/api/super/honeypot/fingerprint-collect?gif=1&st=${session_token}" width="1" height="1" style="display:none;" />
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(htmlContent);
  });

  console.log('🍯 Módulo Honeypot & Labirinto de Defesa Ativa carregado com sucesso!');
};
