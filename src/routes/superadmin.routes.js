const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

function getDataDir() { return path.join(__dirname, '..', '..', 'data'); }

const licenseManager = require('../../license-manager');
const fsSync = require('fs');

module.exports = function(db, masterDb, superAdminAuth, upload, getIo, getTenantDb, options = {}) {
  const JWT_SECRET = (options && options.JWT_SECRET) || process.env.JWT_SECRET || 'chef_jwt_secret_key_default';
  const SUPORTE_JWT_SECRET = (options && options.SUPORTE_JWT_SECRET) || process.env.SUPORTE_JWT_SECRET || JWT_SECRET;

  const loginAttempts = (options && options.loginAttempts) || new Map();
  const CERTS_DIR = (options && options.CERTS_DIR) || path.join(__dirname, '..', '..', 'certs');
  const ensureCertsDir = (options && options.ensureCertsDir) || function() {
    if (!fs.existsSync(CERTS_DIR)) fs.mkdirSync(CERTS_DIR, { recursive: true });
  };
  const CERT_PASSPHRASE = (options && options.CERT_PASSPHRASE) || process.env.CERT_PASSPHRASE || '1234';
  const getActiveCertInfo = () => (typeof options.getActiveCertInfo === 'function' ? options.getActiveCertInfo() : null);
  const getIsHttps = () => (typeof options.isHttps === 'function' ? options.isHttps() : false);
  const aplicarCert = (options && options.aplicarCert) || function() { return { ok: false, erro: 'Função aplicarCert não configurada.' }; };
  const loginBloqueado = (options && options.loginBloqueado) || function(ip) {
    const rec = loginAttempts.get(ip);
    if (!rec) return false;
    if (Date.now() - rec.inicio > 15 * 60 * 1000) { loginAttempts.delete(ip); return false; }
    return rec.falhas >= 5;
  };
  const registrarFalhaLogin = (options && options.registrarFalhaLogin) || function(ip) {
    const rec = loginAttempts.get(ip);
    if (!rec || Date.now() - rec.inicio > 15 * 60 * 1000) {
      loginAttempts.set(ip, { inicio: Date.now(), falhas: 1 });
    } else {
      rec.falhas++;
    }
  };

  const verificarSenhaAdmin = (options && options.verificarSenhaAdmin) || function(senha) {
    return new Promise((resolve) => {
      if (!senha) return resolve(false);
      masterDb.get(`SELECT valor FROM configuracoes_global WHERE chave = 'super_admin_senha_hash'`, [], async (errC, rowC) => {
        if (!errC && rowC && rowC.valor) {
          try {
            if (await bcrypt.compare(String(senha), rowC.valor)) return resolve(true);
          } catch (e) { }
          return resolve(false);
        }
        masterDb.all(`SELECT password_hash FROM usuarios WHERE role = 'admin' AND ativo = 1`, [], async (err, users) => {
          if (err || !users || users.length === 0) return resolve(false);
          for (const user of users) {
            try {
              if (await bcrypt.compare(senha, user.password_hash)) return resolve(true);
            } catch(e) {}
          }
          resolve(false);
        });
      });
    });
  };

  const io = {
    emit: function(...args) {
      try {
        const realIo = typeof getIo === 'function' ? getIo() : (typeof global.io !== 'undefined' ? global.io : null);
        if (realIo && typeof realIo.emit === 'function') {
          return realIo.emit(...args);
        }
      } catch (e) {}
    }
  };

router.post('/api/super/login-local', async (req, res) => {
  const rawIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1').replace('::ffff:', '');
  if (loginBloqueado(rawIp)) {
    return res.status(429).json({ ok: false, erro: 'Muitas tentativas. Aguarde 15 minutos.' });
  }

  // 🍯 Verificação de Honeypot: Se bots/fraudadores preencherem campos ocultos
  if (req.body && (req.body.admin_backdoor_token || req.body.root_master_key)) {
    try {
      io.emit('alerta_impostor_super_admin', {
        email: 'Honeypot Input Trap',
        cargo: 'Bot / Fraudador de Login',
        restaurante_id: 0,
        restaurante_nome: 'Tentativa de Bypass no Login',
        ip: rawIp,
        mensagem: `🚨 BOT/FRAUDADOR DETECTADO: Tentativa de preenchimento de campo honeypot oculto no login do Super Admin! IP: ${rawIp}`
      });
    } catch (e) {}
    await new Promise(r => setTimeout(r, 3000));
    return res.status(403).json({
      ok: false,
      honeypot_triggered: true,
      erro: '⚠️ Dispositivo em quarentena de segurança. Handshake criptográfico rejeitado.'
    });
  }

  const senha = req.body && req.body.senha;
  const ok = await verificarSenhaAdmin(senha);
  if (!ok) {
    registrarFalhaLogin(rawIp);
    return res.json({ ok: false, erro: 'Senha de administrador inválida.' });
  }
  loginAttempts.delete(rawIp);
  const token = jwt.sign({ role: 'super_admin_local', restaurante_id: 1 }, JWT_SECRET, { expiresIn: '90d' });
  res.json({ ok: true, token });
});

// Tema Global: salva config e propaga em tempo real
router.post('/api/super/theme-custom', superAdminAuth, (req, res) => {
  const theme = req.body && req.body.theme;
  if (!theme || typeof theme !== 'object' || !Object.keys(theme).length) {
    return res.json({ ok: false, erro: 'Tema invalido.' });
  }
  const valor = JSON.stringify(theme);
  masterDb.run("INSERT INTO configuracoes_global (chave, valor) VALUES ('custom_theme', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor", [valor], (err) => {
    if (err) return res.json({ ok: false, erro: err.message });
    try { io.emit('tema_global_atualizado', theme); } catch (e) { }
    res.json({ ok: true, mensagem: 'Tema Global salvo e propagado em tempo real!' });
  });
});

// Tema Global publico: leitura apenas de cores/fontes (sem dados sensiveis)
router.get('/api/public/theme', (req, res) => {
  const tid = req.query.restaurante_id;
  if (tid) {
    masterDb.get("SELECT tema_json FROM tenant_temas WHERE restaurante_id = ?", [tid], (err, tRow) => {
      if (!err && tRow && tRow.tema_json) {
        try { return res.json({ ok: true, theme: JSON.parse(tRow.tema_json), source: 'tenant' }); } catch (e) {}
      }
      masterDb.get("SELECT valor FROM configuracoes_global WHERE chave = 'custom_theme'", [], (err2, row) => {
        if (err2 || !row || !row.valor) return res.json({ ok: true, theme: null, source: 'default' });
        try { return res.json({ ok: true, theme: JSON.parse(row.valor), source: 'global' }); }
        catch (e) { return res.json({ ok: true, theme: null, source: 'default' }); }
      });
    });
  } else {
    masterDb.get("SELECT valor FROM configuracoes_global WHERE chave = 'custom_theme'", [], (err, row) => {
      if (err || !row || !row.valor) return res.json({ ok: true, theme: null });
      try { return res.json({ ok: true, theme: JSON.parse(row.valor) }); }
      catch (e) { return res.json({ ok: true, theme: null }); }
    });
  }
});

router.get('/api/super/certs', superAdminAuth, (req, res) => {
  ensureCertsDir();
  let files = [];
  try {
    files = fs.readdirSync(CERTS_DIR).filter(f => /\.(pfx|p12)$/i.test(f));
  } catch (e) { }
  files.sort();
  const certs = files.map(f => {
    const c = { file: f };
    try {
      const st = fs.statSync(path.join(CERTS_DIR, f));
      c.size = st.size;
      c.mtime = st.mtime.toISOString();
    } catch (e) { }
    return c;
  });
  const currentActive = getActiveCertInfo();
  const currentHttps = getIsHttps();
  const ativo = currentActive ? currentActive.file : (currentHttps ? 'cert.pfx (legado)' : null);
  res.json({ ok: true, certs, ativo, isHttps: currentHttps, reiniciarNecessario: currentActive && currentActive.applied === false });
});

router.post('/api/super/certs/upload', superAdminAuth, upload.single('cert'), (req, res) => {
  if (!req.file) return res.json({ ok: false, erro: 'Nenhum arquivo enviado.' });
  const original = String(req.file.originalname || 'cert.pfx').replace(/^.*[\\/]/, '');
  if (!/\.(pfx|p12)$/i.test(original)) {
    try { fs.unlinkSync(req.file.path); } catch (e) { }
    return res.json({ ok: false, erro: 'Apenas arquivos .pfx ou .p12 são aceitos.' });
  }
  ensureCertsDir();
  const dest = path.join(CERTS_DIR, original);
  try {
    fs.copyFileSync(req.file.path, dest);
    fs.unlinkSync(req.file.path);
  } catch (e) {
    return res.json({ ok: false, erro: 'Falha ao salvar o arquivo: ' + (e.message || e) });
  }
  res.json({ ok: true, file: original });
});

router.post('/api/super/certs/ativar', superAdminAuth, (req, res) => {
  const file = String((req.body && req.body.file) || '').replace(/^.*[\\/]/, '').trim();
  if (!file || file.includes('..') || file.includes('/') || file.includes('\\')) {
    return res.json({ ok: false, erro: 'Nome de arquivo inválido.' });
  }
  if (!/\.(pfx|p12)$/i.test(file)) return res.json({ ok: false, erro: 'Extensão inválida.' });
  if (!fs.existsSync(path.join(CERTS_DIR, file))) return res.json({ ok: false, erro: 'Arquivo não encontrado na pasta certs.' });
  const passphrase = (req.body && req.body.passphrase) ? String(req.body.passphrase) : CERT_PASSPHRASE;
  res.json(aplicarCert({ file, passphrase }));
});

router.delete('/api/super/certs/:file', superAdminAuth, (req, res) => {
  const file = String(req.params.file || '').replace(/^.*[\\/]/, '').trim();
  if (!file || file.includes('..') || file.includes('/') || file.includes('\\')) return res.json({ ok: false, erro: 'Nome inválido.' });
  const currentActive = getActiveCertInfo();
  if (currentActive && currentActive.file === file) return res.json({ ok: false, erro: 'Não é possível remover o certificado em uso. Ative outro primeiro.' });
  const p = path.join(CERTS_DIR, file);
  if (!fs.existsSync(p)) return res.json({ ok: false, erro: 'Arquivo não encontrado.' });
  try {
    fs.unlinkSync(p);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, erro: 'Falha ao remover: ' + (e.message || e) });
  }
});

const TELEMETRIA_VERSION = '1.0.0';



// ════════════ TELEMETRIA ════════════
function registrarTelemetria(t) {
  const ip = trimStr(t.ip, 60);
  const agora = new Date().toLocaleString();
  masterDb.get(`SELECT id FROM telemetria WHERE install_id = ?`, [t.install_id || ''], (err, row) => {
    if (err) return;
    if (row) {
      masterDb.run(`UPDATE telemetria SET
        restaurante_id = ?, nome_restaurante = ?, versao = ?, ip = ?, plataforma = ?,
        admin_login = COALESCE(NULLIF(?, ''), admin_login), chave_ativacao = COALESCE(NULLIF(?, ''), chave_ativacao), online = 1,
        ultima_atividade = ?, tempo_uso_min = ?, pedidos_total = ?, vendas_total = ?, vendas_hoje = ?,
        comandas_abertas = ?, funcionarios_ativos = ?, garcons_online = ?, produtos_total = ?, setores_json = ?,
        mesas_total = ?, dispositivos = ?, funcoes_json = ?, erros_json = ?, custo_total = ?, folha_mes = ?,
        despesas_mes = ?, lucro = ?, disco_mb = ?, updated_at = ?
        WHERE install_id = ?`,
        [t.restaurante_id || null, trimStr(t.nome_restaurante, 120), trimStr(t.versao, 20), ip, trimStr(t.plataforma, 30), trimStr(t.admin_login, 120) || '', trimStr(t.chave_ativacao || t.chave, 30) || '', agora,
          t.tempo_uso_min || 0, t.pedidos_total || 0, t.vendas_total || 0, t.vendas_hoje || 0,
          t.comandas_abertas || 0, t.funcionarios_ativos || 0, t.garcons_online || 0, t.produtos_total || 0,
          t.setores_json || null, t.mesas_total || 0, t.dispositivos || 0, t.funcoes_json || null,
          t.erros_json || null, t.custo_total || 0, t.folha_mes || 0, t.despesas_mes || 0, t.lucro || 0,
          t.disco_mb || 0, agora, t.install_id || ''], (e) => { if (e) console.error('[Telemetria] update:', e.message); });
    } else {
      masterDb.run(`INSERT INTO telemetria (restaurante_id, install_id, nome_restaurante, versao, ip, plataforma, admin_login, chave_ativacao, online, ultima_atividade, tempo_uso_min, pedidos_total, vendas_total, vendas_hoje, comandas_abertas, funcionarios_ativos, garcons_online, produtos_total, setores_json, mesas_total, dispositivos, funcoes_json, erros_json, custo_total, folha_mes, despesas_mes, lucro, disco_mb, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [t.restaurante_id || null, t.install_id || '', trimStr(t.nome_restaurante, 120), trimStr(t.versao, 20), ip, trimStr(t.plataforma, 30), trimStr(t.admin_login, 120) || null, trimStr(t.chave_ativacao || t.chave, 30) || null, agora,
          t.tempo_uso_min || 0, t.pedidos_total || 0, t.vendas_total || 0, t.vendas_hoje || 0,
          t.comandas_abertas || 0, t.funcionarios_ativos || 0, t.garcons_online || 0, t.produtos_total || 0,
          t.setores_json || null, t.mesas_total || 0, t.dispositivos || 0, t.funcoes_json || null,
          t.erros_json || null, t.custo_total || 0, t.folha_mes || 0, t.despesas_mes || 0, t.lucro || 0,
          t.disco_mb || 0, agora], (e) => { if (e) console.error('[Telemetria] insert:', e.message); });
    }
  });
}

// ════════════ SEED DO ADMIN + FILA DE SINCRONIZAÇÃO (instalações remotas) ════════════

// Arquivo criado pelo instalador com os dados digitados pelo usuário:
// %APPDATA%\ChefCozinha\admin-seed.json
function getSeedPath() {
  return path.join(getDataDir(), 'admin-seed.json');
}

// Adiciona um item à fila de sincronização offline → hub
function enqueueSync(tipo, payload) {
  try {
    const state = licenseManager.getState ? licenseManager.getState() : {};
    const installId = (state && state.installId) || (payload && payload.install_id) || '';
    masterDb.run(`INSERT INTO sync_fila (tipo, install_id, payload) VALUES (?, ?, ?)`,
      [tipo, installId, JSON.stringify(payload || {})],
      (e) => { if (e) console.error('[Sync] enqueue:', e.message); });
  } catch (e) { console.error('[Sync] enqueue:', e.message); }
}

// Aplica os dados de configuração gravados pelo instalador:
// cria o admin local, define o nome do estabelecimento, ativa a chave de
// licença (mesmo offline) e agenda a sincronização com o hub.
function aplicarSeedAdmin() {
  return new Promise((resolve) => {
    const seedPath = getSeedPath();
    let seed = null;
    try {
      if (!fsSync.existsSync(seedPath)) return resolve();
      let raw = fsSync.readFileSync(seedPath, 'utf8');
      if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1); // remove BOM (UTF-8)
      seed = JSON.parse(raw);
    } catch (e) {
      console.error('[Seed] Erro ao ler admin-seed.json:', e.message);
      return resolve();
    }

    const username = trimStr(seed.username || seed.email || '', 120).toLowerCase();
    const senha = String(seed.senha || seed.password || '');
    const nomeRest = trimStr(seed.nome_restaurante || seed.estabelecimento || '', 120);
    const chave = trimStr(seed.chave || seed.chave_licenca || '', 30).toUpperCase();

    if (!username || !senha) {
      console.error('[Seed] admin-seed.json sem username/senha.');
      return resolve();
    }

    bcrypt.hash(senha, 10).then((hash) => {
      const upsertUser = () => new Promise((resU, rejU) => {
        masterDb.run(
          `INSERT INTO usuarios (restaurante_id, username, password_hash, role, ativo)
           VALUES (1, ?, ?, 'admin', 1)
           ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash, role = 'admin', ativo = 1`,
          [username, hash], (e) => e ? rejU(e) : resU());
      });

      const setNome = () => new Promise((resN, rejN) => {
        if (!nomeRest) return resN();
        masterDb.run(`UPDATE restaurantes SET nome = ? WHERE id = 1`, [nomeRest], (e) => e ? rejN(e) : resN());
      });

      Promise.all([upsertUser(), setNome()]).then(async () => {
        console.log(`[Seed] Admin local criado: ${username} (${nomeRest || 'Estabelecimento'})`);
        const state = licenseManager.getState ? licenseManager.getState() : {};
        const installId = (state && state.installId) || 'INST-UNKNOWN';

        // Ativa a chave (se informada) — suporta modo offline
        if (chave && licenseManager.validarChaveFormato(chave)) {
          const ativ = await licenseManager.activateLicense(chave, { restaurante: nomeRest });
          console.log(`[Seed] Ativação da chave: ${ativ.ok ? (ativ.offline ? 'offline (pendente)' : 'online') : ('falhou: ' + (ativ.error || ''))}`);
          enqueueSync('ativacao', { chave, install_id: installId, nome_restaurante: nomeRest || 'Estabelecimento', admin_login: username });
        }

        // Registra o estabelecimento + admin para o super admin ver
        enqueueSync('registro', {
          install_id: installId,
          nome_restaurante: nomeRest || 'Estabelecimento',
          admin_login: username,
          chave_ativacao: chave,
          plataforma: process.platform,
          versao: TELEMETRIA_VERSION,
          online: 1,
          ultima_atividade: new Date().toLocaleString()
        });

        try { fsSync.unlinkSync(seedPath); } catch (e) {}
        resolve();
      }).catch((err) => {
        console.error('[Seed] Erro ao aplicar seed:', err.message);
        resolve();
      });
    }).catch((e) => {
      console.error('[Seed] Erro bcrypt:', e.message);
      resolve();
    });
  });
}

// Envia os itens pendentes da fila para o hub central (com retry/backoff)
async function processarFilaSync() {
  if (!licenseManager.hubConfigurado || !licenseManager.hubConfigurado()) return;
  try {
    const rows = await new Promise((resolveP, rejectP) => {
      masterDb.all(`SELECT * FROM sync_fila WHERE sincronizado_em IS NULL AND proxima_tentativa <= datetime('now','localtime') ORDER BY id LIMIT 20`, [], (err, r) => err ? rejectP(err) : resolveP(r || []));
    });
    for (const item of rows) {
      let payload = {};
      try { payload = JSON.parse(item.payload || '{}'); } catch (e) {}
      const rota = item.tipo === 'ativacao' ? '/api/licenca/ativar' : '/api/telemetria';
      const result = await licenseManager.enviarParaHub(rota, payload);
      if (result && result.ok) {
        masterDb.run(`UPDATE sync_fila SET sincronizado_em = datetime('now','localtime') WHERE id = ?`, [item.id], () => {});
        console.log(`[Sync] ${item.tipo} sincronizado com o hub (item ${item.id})`);
      } else {
        const tent = (item.tentativas || 0) + 1;
        const backoffMin = Math.min(60, 10 * tent); // 10min, 20min... máx 1h
        masterDb.run(`UPDATE sync_fila SET tentativas = ?, proxima_tentativa = datetime('now','localtime','+${backoffMin} minutes') WHERE id = ?`,
          [tent, item.id], () => {});
        console.warn(`[Sync] ${item.tipo} falhou (tentativa ${tent}): ${(result && result.error) || 'erro desconhecido'}`);
      }
    }
  } catch (e) {
    console.error('[Sync] processar fila:', e.message);
  }
}

// Coleta métricas da própria instalação para enviar ao hub
function coletarTelemetriaInstalacao() {
  return new Promise((resolve) => {
    db.all(`SELECT COUNT(*) c FROM pedidos`, [], (e1, r1) => {
      db.all(`SELECT COALESCE(SUM(CAST(total AS REAL)),0) c FROM pedidos WHERE status IN ('Finalizado','Pago')`, [], (e2, r2) => {
        db.all(`SELECT COALESCE(SUM(custo),0) c FROM produtos`, [], (e3, r3) => {
          db.all(`SELECT COUNT(*) c FROM funcionarios WHERE status = 'Ativo'`, [], (e4, r4) => {
            db.all(`SELECT COUNT(*) c FROM produtos WHERE status = 'ativo'`, [], (e5, r5) => {
              const nome = licenseManager.getRestaurantName ? licenseManager.getRestaurantName() : '';
              const state = licenseManager.getState ? licenseManager.getState() : {};
              const hojeStr = new Date().toISOString().slice(0, 10);
              db.all(`SELECT COALESCE(SUM(CAST(total AS REAL)),0) c FROM pedidos WHERE status IN ('Finalizado','Pago') AND substr(createdAt,1,10) = ?`, [hojeStr], (e6, r6) => {
                const conectados = io.sockets.adapter.rooms.get('geral') ? io.sockets.adapter.rooms.get('geral').size : 0;
                const vendas = r2 && r2[0] ? parseFloat(r2[0].c || 0) : 0;
                const custo = r3 && r3[0] ? parseFloat(r3[0].c || 0) : 0;
                let discoMb = 0;
                try { const dbPath = getTenantDbPath(1); if (fsSync.existsSync(dbPath)) discoMb = fsSync.statSync(dbPath).size / (1024 * 1024); } catch (e) {}
                resolve({
                  install_id: state.installId || 'INST-UNKNOWN',
                  nome_restaurante: nome,
                  chave: state.chave || '',
                  versao: TELEMETRIA_VERSION,
                  plataforma: process.platform,
                  online: 1,
                  ultima_atividade: new Date().toLocaleString(),
                  tempo_uso_min: 0,
                  pedidos_total: r1 && r1[0] ? r1[0].c : 0,
                  vendas_total: vendas,
                  vendas_hoje: r6 && r6[0] ? parseFloat(r6[0].c || 0) : 0,
                  comandas_abertas: 0,
                  funcionarios_ativos: r4 && r4[0] ? r4[0].c : 0,
                  garcons_online: conectados,
                  produtos_total: r5 && r5[0] ? r5[0].c : 0,
                  mesas_total: 0,
                  dispositivos: conectados,
                  custo_total: custo,
                  folha_mes: 0,
                  despesas_mes: 0,
                  lucro: Math.round((vendas - custo) * 100) / 100,
                  disco_mb: Math.round(discoMb * 100) / 100
                });
              });
            });
          });
        });
      });
    });
  });
}

// Envia telemetria para o hub central (quando instalado remotamente).
// Em vez de enviar direto, enfileira — a fila reenvia com backoff até conseguir.
async function enviarTelemetriaRemota() {
  if (!licenseManager.hubConfigurado || !licenseManager.hubConfigurado()) return;
  try {
    const t = await coletarTelemetriaInstalacao();
    if (!t) return;
    enqueueSync('telemetria', t);
  } catch (e) {
    console.error('[Telemetria] envio remoto:', e.message);
  }
}

// Dispara o seed do instalador e a sincronização no startup e periodicamente
setTimeout(() => { enviarTelemetriaRemota(); }, 3000);
setInterval(() => { enviarTelemetriaRemota(); }, 5 * 60 * 1000);
setTimeout(() => { aplicarSeedAdmin().then(() => processarFilaSync()); }, 2500);
setInterval(() => processarFilaSync(), 60 * 1000);

// ─── SUPER ADMIN: EXEC (terminal de comandos com seguranca) ───
const { exec } = require('child_process');
const CMD_BLOCKLIST = [
  /\brm\s+-rf\s+\/\b/,           // rm -rf /
  /\bmkfs\b/,                     // formatacao de disco (Linux)
  /\bdd\s+.*of=\/dev\//,          // dd direto em disco
  /\bcurl\b.*\|\s*bash/,         // pipe remoto para bash
  /\bwget\b.*\|\s*bash/,
  /\bchmod\s+777\s+\//,          // chmod global
  /\bshutdown\b/i,                // desligar servidor
  /\breboot\b/i,
  /\binit\s+[06]\b/,
  /\bformat\s+[a-z]:/i,           // format C:
  /\bdiskpart\b/i,                // particionamento
  /\bdel\s+(\/[sfq]+\s+)+[a-z]:\\\s*$/i,   // del /S /Q na raiz de disco
  /\brd\s+\/s\s+\/q\s+[a-z]:\\\s*$/i,    // rd /S /Q na raiz de disco
  /\bvssadmin\b.*delete/i,        // apagar shadow copies
  /\bbcdedit\b/i,                 // boot config
  /\bcipher\s+\/w/i               // wipe de disco
];
// POST /api/super/exec centralizado em controllers/super-admin.js (evita conflito e duplicação)
  const initAfiliadosTables = (targetDb) => {
    if (!targetDb || typeof targetDb.run !== 'function') return;
    targetDb.run(`CREATE TABLE IF NOT EXISTS afiliados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      telefone TEXT,
      codigo_ref TEXT NOT NULL UNIQUE,
      comissao_percentual REAL DEFAULT 10,
      chave_pix TEXT,
      password_hash TEXT,
      status TEXT DEFAULT 'ativo',
      criado_em DATETIME DEFAULT (datetime('now','localtime'))
    )`, () => {});
    targetDb.run(`CREATE TABLE IF NOT EXISTS afiliado_vendas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      afiliado_id INTEGER NOT NULL,
      restaurante_id INTEGER,
      restaurante_nome TEXT,
      plano TEXT,
      valor_venda REAL DEFAULT 0,
      comissao_valor REAL DEFAULT 0,
      data_venda DATETIME DEFAULT (datetime('now','localtime')),
      status TEXT DEFAULT 'aprovado'
    )`, () => {});
  };
  initAfiliadosTables(db);
  initAfiliadosTables(masterDb);

  router.get('/api/super/afiliados', superAdminAuth, (req, res) => {
  db.all(`
    SELECT a.*, 
           COUNT(DISTINCT v.id) as total_vendas,
           COALESCE(SUM(v.valor_venda), 0) as total_faturado,
           COALESCE(SUM(v.comissao_valor), 0) as total_comissoes
    FROM afiliados a
    LEFT JOIN afiliado_vendas v ON a.id = v.afiliado_id
    GROUP BY a.id
    ORDER BY a.id DESC
  `, [], (err, rows) => {
    if (err) return res.json({ ok: false, erro: err.message });
    res.json({ ok: true, afiliados: rows || [] });
  });
});

// Criar novo afiliado
router.post('/api/super/afiliados', superAdminAuth, async (req, res) => {
  try {
    const { nome, email, telefone, codigo_ref, comissao_percentual, chave_pix, senha } = req.body;
    if (!nome || !email || !codigo_ref) {
      return res.json({ ok: false, erro: 'Nome, E-mail e Código de Afiliado são obrigatórios.' });
    }
    const codeClean = codigo_ref.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const passHash = senha ? await bcrypt.hash(senha, 10) : await bcrypt.hash('123456', 10);
    const comissao = parseFloat(comissao_percentual) || 10;

    db.run(
      `INSERT INTO afiliados (nome, email, telefone, codigo_ref, comissao_percentual, chave_pix, password_hash, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'ativo')`,
      [nome.trim(), email.trim().toLowerCase(), telefone || '', codeClean, comissao, chave_pix || '', passHash],
      function (err) {
        if (err) {
          if (err.message.includes('UNIQUE')) {
            return res.json({ ok: false, erro: 'E-mail ou Código de Afiliado já cadastrado.' });
          }
          return res.json({ ok: false, erro: err.message });
        }
        res.json({ ok: true, id: this.lastID, codigo_ref: codeClean });
      }
    );
  } catch (e) {
    res.json({ ok: false, erro: e.message });
  }
});

// Editar afiliado
router.put('/api/super/afiliados/:id', superAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, email, telefone, comissao_percentual, chave_pix, status, senha } = req.body;
    
    let updates = ['nome = ?', 'email = ?', 'telefone = ?', 'comissao_percentual = ?', 'chave_pix = ?', 'status = ?'];
    let params = [nome, email, telefone, parseFloat(comissao_percentual) || 10, chave_pix, status || 'ativo'];

    if (senha && senha.trim().length >= 4) {
      const hash = await bcrypt.hash(senha.trim(), 10);
      updates.push('password_hash = ?');
      params.push(hash);
    }

    params.push(id);
    db.run(`UPDATE afiliados SET ${updates.join(', ')} WHERE id = ?`, params, function (err) {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true });
    });
  } catch (e) {
    res.json({ ok: false, erro: e.message });
  }
});

// Excluir afiliado
router.delete('/api/super/afiliados/:id', superAdminAuth, (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM afiliados WHERE id = ?`, [id], (err) => {
    if (err) return res.json({ ok: false, erro: err.message });
    res.json({ ok: true });
  });
});

// Detalhes / Métricas completas de um afiliado (Super Admin)
router.get('/api/super/afiliados/:id/metricas', superAdminAuth, (req, res) => {
  const { id } = req.params;
  db.get(`SELECT * FROM afiliados WHERE id = ?`, [id], (err, afil) => {
    if (err || !afil) return res.json({ ok: false, erro: 'Afiliado não encontrado.' });

    db.all(`SELECT * FROM afiliado_vendas WHERE afiliado_id = ? ORDER BY id DESC`, [id], (errVendas, vendas) => {
      res.json({
        ok: true,
        afiliado: afil,
        vendas: vendas || []
      });
    });
  });
});

// ════════════════════════════════════════════════════════════════════
// SUPER ADMIN: EQUIPE DE SUPORTE + MONITOR/TELEMETRIA + VITE + HEATMAP + PLUGINS
// (Endpoints consumidos pelo painel super-admin.js em super-admin.html)
// ════════════════════════════════════════════════════════════════════
masterDb.run(`CREATE TABLE IF NOT EXISTS equipe_suporte_restaurantes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipe_id INTEGER NOT NULL,
  restaurante_id INTEGER NOT NULL,
  UNIQUE(equipe_id, restaurante_id)
)`, () => {});
masterDb.run(`CREATE TABLE IF NOT EXISTS equipe_avisos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT,
  tipo TEXT DEFAULT 'info',
  corpo TEXT,
  destino TEXT DEFAULT '',
  suporte_ids_json TEXT,
  enviado_por TEXT DEFAULT 'super_admin',
  criado_em DATETIME DEFAULT (datetime('now','localtime'))
)`, () => {});

// CADASTROS RECENTES (monitor/central de notificações do painel)
router.get('/api/super/cadastros-monitor', superAdminAuth, (req, res) => {
  const horas = Math.max(1, parseInt(req.query.horas, 10) || 48);
  masterDb.all(`SELECT install_id, nome_restaurante, versao, ip, plataforma, online,
    created_at, updated_at, ultima_atividade, admin_login, chave_ativacao
    FROM telemetria
    WHERE created_at >= datetime('now','localtime', ?)
    ORDER BY created_at DESC LIMIT 100`, ['-' + horas + ' hours'], (err, rows) => {
    if (err) return res.json({ ok: true, cadastros: [] });
    const cadastros = (rows || []).map(r => {
      const campos = { restaurante_nome: r.nome_restaurante || '', versao: r.versao || '', instalacao: r.created_at || '' };
      if (r.admin_login) campos.admin = r.admin_login;
      if (r.chave_ativacao) campos.chave = r.chave_ativacao;
      return {
        sessao_id: r.install_id,
        etapa: r.online ? 'ativo' : 'parado',
        campos_json: JSON.stringify(campos),
        localizacao: null,
        dispositivo: r.plataforma || '',
        bateria: null,
        rede: null,
        ip: r.ip || '',
        status: r.online ? 'concluido' : 'em_andamento',
        atualizado_em: r.updated_at || r.ultima_atividade || r.created_at
      };
    });
    res.json({ ok: true, cadastros });
  });
});

// EQUIPE DE SUPORTE (CRUD completo)
router.get('/api/super/equipe', superAdminAuth, (req, res) => {
  masterDb.all(`SELECT id, nome, email, telefone, cargo, especialidade, status, xp, nivel, data_cadastro
    FROM equipe_suporte ORDER BY data_cadastro DESC`, [], (err, rows) => {
    if (err) return res.json({ ok: false, erro: err.message });
    res.json({ ok: true, equipe: rows || [] });
  });
});

router.post('/api/super/equipe', superAdminAuth, async (req, res) => {
  const { nome, email, telefone, cargo, especialidade, senha, status } = req.body || {};
  if (!nome || !email) return res.json({ ok: false, erro: 'Nome e email são obrigatórios.' });
  if (!senha || String(senha).length < 4) return res.json({ ok: false, erro: 'Senha deve ter no mínimo 4 caracteres.' });
  try {
    const hash = await bcrypt.hash(String(senha), 10);
    masterDb.run(`INSERT INTO equipe_suporte (nome, email, telefone, password_hash, cargo, especialidade, status) VALUES (?,?,?,?,?,?,?)`,
      [nome, email, telefone || '', hash, cargo || 'Suporte N1', especialidade || 'Remoto', status || 'disponivel'],
      function (err) {
        if (err) return res.json({ ok: false, erro: ('' + err.message).includes('UNIQUE') ? 'Já existe um membro com esse email.' : err.message });
        res.json({ ok: true, id: this.lastID });
      });
  } catch (e) { res.json({ ok: false, erro: e.message }); }
});

router.put('/api/super/equipe/:id', superAdminAuth, async (req, res) => {
  const { id } = req.params;
  const { nome, email, telefone, cargo, especialidade, status, senha } = req.body || {};
  if (!nome || !email) return res.json({ ok: false, erro: 'Nome e email são obrigatórios.' });
  let base = 'UPDATE equipe_suporte SET nome=?, email=?, telefone=?, cargo=?, especialidade=?, status=?';
  const vals = [nome, email, telefone || '', cargo || 'Suporte N1', especialidade || 'Remoto', status || 'disponivel'];
  if (senha) {
    try { const hash = await bcrypt.hash(String(senha), 10); base += ', password_hash=?'; vals.push(hash); }
    catch (e) { return res.json({ ok: false, erro: e.message }); }
  }
  vals.push(id);
  masterDb.run(base + ' WHERE id=?', vals, (err) => {
    if (err) return res.json({ ok: false, erro: err.message });
    res.json({ ok: true });
  });
});

router.delete('/api/super/equipe/:id', superAdminAuth, (req, res) => {
  const { id } = req.params;
  masterDb.run(`DELETE FROM equipe_suporte WHERE id=?`, [id], (err) => {
    if (err) return res.json({ ok: false, erro: err.message });
    try { masterDb.run(`DELETE FROM equipe_suporte_restaurantes WHERE equipe_id=?`, [id]); } catch (e) {}
    res.json({ ok: true });
  });
});

// Atribuição de restaurantes por membro da equipe
router.get('/api/super/equipe/:id/restaurantes', superAdminAuth, (req, res) => {
  const { id } = req.params;
  masterDb.all(`SELECT restaurante_id FROM equipe_suporte_restaurantes WHERE equipe_id=?`, [id], (err, rows) => {
    if (err) return res.json({ ok: false, erro: err.message });
    res.json({ ok: true, atribuicoes: rows || [] });
  });
});

router.post('/api/super/equipe/:id/restaurantes', superAdminAuth, (req, res) => {
  const { id } = req.params;
  const ids = Array.isArray(req.body && req.body.restaurante_ids) ? req.body.restaurante_ids.map(Number).filter(n => n > 0) : [];
  masterDb.serialize(() => {
    masterDb.run(`DELETE FROM equipe_suporte_restaurantes WHERE equipe_id=?`, [id], (err) => {
      if (err) { return res.json({ ok: false, erro: err.message }); }
      const stmt = masterDb.prepare(`INSERT OR IGNORE INTO equipe_suporte_restaurantes (equipe_id, restaurante_id) VALUES (?,?)`);
      (ids || []).forEach(r => stmt.run(id, r));
      stmt.finalize((e) => {
        if (e) return res.json({ ok: false, erro: e.message });
        res.json({ ok: true, count: ids.length });
      });
    });
  });
});

// Tasks (quadro de tarefas da equipe) e avisos
router.post('/api/super/equipe/tasks', superAdminAuth, (req, res) => {
  const { suporte_id, restaurante_id, tipo, descricao, pontos } = req.body || {};
  if (!tipo || !descricao) return res.json({ ok: false, erro: 'Digite um título ou tipo e a descrição da task.' });
  const resposta = pontos !== undefined ? JSON.stringify({ pontos: Number(pontos) || 0 }) : '';
  masterDb.run(`INSERT INTO super_tarefas (titulo, descricao, categoria, restaurante_id, atribuido_a, resposta) VALUES (?,?,?,?,?,?)`,
    [tipo || 'Task', descricao, tipo || 'Geral', restaurante_id ? Number(restaurante_id) : null,
      suporte_id ? String(suporte_id) : '', resposta],
    function (err) {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true, id: this.lastID });
    });
});

router.post('/api/super/equipe/avisos', superAdminAuth, (req, res) => {
  const { destino, suporte_ids, titulo, tipo, corpo } = req.body || {};
  if (!destino || !titulo || !corpo) return res.json({ ok: false, erro: 'Preencha destino, título e corpo do aviso.' });
  masterDb.run(`INSERT INTO equipe_avisos (titulo, tipo, corpo, destino, suporte_ids_json, enviado_por) VALUES (?,?,?,?,?,?)`,
    [titulo, tipo || 'info', corpo, destino, JSON.stringify(Array.isArray(suporte_ids) ? suporte_ids : []), 'super_admin'],
    function (err) {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true, id: this.lastID });
    });
});

// Status e controle do Vite Dev Server (badge do painel)
router.get('/api/super/vite/status', superAdminAuth, (req, res) => {
  masterDb.get(`SELECT valor FROM configuracoes_global WHERE chave='vite_dev_port'`, [], (err, row) => {
    const port = parseInt((row && row.valor) || '5173', 10) || 5173;
    const sock = require('net').connect(port, '127.0.0.1');
    let respondido = false;
    const done = (running) => {
      if (respondido) return;
      respondido = true;
      try { sock.destroy(); } catch (e) {}
      res.json({ ok: true, running, port, url: running ? `http://localhost:${port}` : null });
    };
    sock.setTimeout(1200);
    sock.once('connect', () => done(true));
    sock.once('timeout', () => done(false));
    sock.once('error', () => done(false));
  });
});

router.post('/api/super/vite/control', superAdminAuth, (req, res) => {
  const { action, port } = req.body || {};
  const p = parseInt(port, 10) || 5173;
  if (action === 'start') {
    try {
      const cp = require('child_process');
      const child = cp.spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['run', 'dev', '--', '--port', String(p)],
        { cwd: __dirname, detached: true, stdio: 'ignore', windowsHide: true });
      child.unref();
      masterDb.run(`INSERT INTO configuracoes_global (chave, valor) VALUES ('vite_dev_port', ?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor`, [String(p)], () => {});
      return res.json({ ok: true, message: 'Vite dev server iniciado na porta ' + p + '. Aguardando subir...' });
    } catch (e) {
      return res.json({ ok: false, erro: 'Falha ao iniciar Vite: ' + (e.message || e) });
    }
  }
  return res.json({ ok: false, erro: 'Para parar o Vite, encerre o processo no terminal (CTRL+C).' });
});

// Heatmap de cliques (BI) — dados zerados até o cliente começar a enviar cliques persistidos
router.get('/api/super/metricas/heatmap-clicks', superAdminAuth, (req, res) => {
  masterDb.all(`SELECT id, nome FROM restaurantes WHERE ativo=1 ORDER BY nome`, [], (err, rests) => {
    res.json({
      ok: true,
      stats: { total_cliques: 0, media_tempo_ms: 0, total_colaboradores: 0, total_restaurantes: (rests || []).length },
      restaurantes: (rests || []).map(r => ({ restaurante_id: r.id, restaurante_nome: r.nome })),
      colaboradores: [],
      heatmapPoints: []
    });
  });
});

// Manifesto de plugins instalados (categoria "Plugins Instalados" do painel)
router.get('/api/plugins/admin-manifest', superAdminAuth, (req, res) => {
  masterDb.all(`SELECT plugin_id, nome, descricao, ativo FROM super_plugins WHERE ativo=1 ORDER BY plugin_id`, [], (err, rows) => {
    if (err) return res.json({ ok: true, manifest: [] });
    res.json({ ok: true, manifest: (rows || []).map(p => ({ id: p.plugin_id, name: p.nome, displayName: p.nome, descricao: p.descricao, ativo: p.ativo })) });
  });
});

// Login do Afiliado para entrar no seu próprio Portal
router.post('/api/afiliado/login', async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.json({ ok: false, erro: 'Preencha email e senha.' });

  db.get(`SELECT * FROM afiliados WHERE LOWER(email) = LOWER(?)`, [email.trim()], async (err, afil) => {
    if (err || !afil) return res.json({ ok: false, erro: 'Afiliado não encontrado.' });
    if (afil.status !== 'ativo') return res.json({ ok: false, erro: 'Conta de afiliado inativa ou suspensa.' });

    const match = await bcrypt.compare(senha, afil.password_hash || '');
    if (!match) return res.json({ ok: false, erro: 'Senha incorreta.' });

    const token = jwt.sign({ id: afil.id, codigo_ref: afil.codigo_ref, role: 'afiliado' }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ ok: true, token, afiliado: { id: afil.id, nome: afil.nome, email: afil.email, codigo_ref: afil.codigo_ref } });
  });
});

// Dashboard do Afiliado (Autenticado pelo token do afiliado)
router.get('/api/afiliado/dashboard', (req, res) => {
  const tokenHeader = req.headers['authorization'] || req.headers['x-afiliado-token'];
  if (!tokenHeader) return res.json({ ok: false, erro: 'Token não fornecido.' });
  
  const token = tokenHeader.replace(/^Bearers+/, '');
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err || !decoded || decoded.role !== 'afiliado') {
      return res.json({ ok: false, erro: 'Sessão inválida ou expirada.' });
    }

    db.get(`SELECT id, nome, email, telefone, codigo_ref, comissao_percentual, chave_pix FROM afiliados WHERE id = ?`, [decoded.id], (errA, afil) => {
      if (errA || !afil) return res.json({ ok: false, erro: 'Afiliado não encontrado.' });

      db.all(`SELECT * FROM afiliado_vendas WHERE afiliado_id = ? ORDER BY id DESC`, [decoded.id], (errV, vendas) => {
        const listV = vendas || [];
        const totalFaturado = listV.reduce((acc, v) => acc + (v.valor_venda || 0), 0);
        const totalComissao = listV.reduce((acc, v) => acc + (v.comissao_valor || 0), 0);
        const comissoesPagas = listV.filter(v => v.status === 'pago').reduce((acc, v) => acc + (v.comissao_valor || 0), 0);
        const comissoesPendentes = listV.filter(v => v.status === 'pendente').reduce((acc, v) => acc + (v.comissao_valor || 0), 0);

        res.json({
          ok: true,
          afiliado: afil,
          stats: {
            totalVendas: listV.length,
            totalFaturado,
            totalComissao,
            comissoesPagas,
            comissoesPendentes
          },
          vendas: listV
        });
      });
    });
  });
});

// API /api/dono/dashboard & /api/dashboard/metrics — Métricas executivas em tempo real para o Painel do Dono
const handleDashboardMetrics = (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader ? authHeader.split(' ')[1] : req.query.token;

  const processMetrics = async (tenantId) => {
    const dbInst = db;
    if (!dbInst) return res.status(500).json({ success: false, error: 'Banco de dados indisponível.' });

    const pAll = (sql, params = []) => new Promise((resolve) => dbInst.all(sql, params, (err, rows) => resolve(err ? [] : rows)));
    const pGet = (sql, params = []) => new Promise((resolve) => dbInst.get(sql, params, (err, row) => resolve(err ? null : row)));

    try {
      const periodo = req.query.periodo || 'hoje';
      const dataInicio = req.query.data_inicio;
      const dataFim = req.query.data_fim;

      let dateWhere = "date(createdAt) = date('now', 'localtime')";
      let movWhere = "date(data) = date('now', 'localtime')";
      let dateWhereAnt = "date(createdAt) = date('now', '-7 days', 'localtime')";
      let rotulo = 'Hoje';
      let rotuloAnt = 'semana passada';

      if (periodo === 'ontem') {
        dateWhere = "date(createdAt) = date('now', '-1 day', 'localtime')";
        movWhere = "date(data) = date('now', '-1 day', 'localtime')";
        dateWhereAnt = "date(createdAt) = date('now', '-8 days', 'localtime')";
        rotulo = 'Ontem';
        rotuloAnt = 'mesmo dia da semana passada';
      } else if (periodo === 'semana') {
        dateWhere = "createdAt >= date('now', '-7 days', 'localtime')";
        movWhere = "data >= date('now', '-7 days', 'localtime')";
        dateWhereAnt = "createdAt >= date('now', '-14 days', 'localtime') AND createdAt < date('now', '-7 days', 'localtime')";
        rotulo = 'Últimos 7 dias';
        rotuloAnt = '7 dias anteriores';
      } else if (periodo === 'mes') {
        dateWhere = "strftime('%Y-%m', createdAt) = strftime('%Y-%m', 'now', 'localtime')";
        movWhere = "strftime('%Y-%m', data) = strftime('%Y-%m', 'now', 'localtime')";
        dateWhereAnt = "strftime('%Y-%m', createdAt) = strftime('%Y-%m', 'now', '-1 month', 'localtime')";
        rotulo = 'Este Mês';
        rotuloAnt = 'mês anterior';
      } else if (periodo === 'custom' && dataInicio && dataFim) {
        dateWhere = `date(createdAt) BETWEEN '${dataInicio}' AND '${dataFim}'`;
        movWhere = `date(data) BETWEEN '${dataInicio}' AND '${dataFim}'`;
        dateWhereAnt = `date(createdAt) < '${dataInicio}'`;
        rotulo = `${dataInicio} a ${dataFim}`;
        rotuloAnt = 'período anterior';
      }

      // Executa consultas em paralelo com tratamento de erro
      const [
        faturamentoRow,
        faturamentoAntRow,
        mesasRow,
        ticketRow,
        ativosRow,
        caixaRow,
        topProdutos,
        canaisRows,
        despesasRow,
        canceladosRow,
        equipeRows,
        gamificacaoConfig
      ] = await Promise.all([
        pGet(`SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as totalPedidos FROM pedidos WHERE status IN ('Finalizado', 'Entregue') AND ${dateWhere}`),
        pGet(`SELECT COALESCE(SUM(total), 0) as total FROM pedidos WHERE status IN ('Finalizado', 'Entregue') AND ${dateWhereAnt}`),
        pGet(`SELECT COUNT(DISTINCT localName) as ativas FROM pedidos WHERE status NOT IN ('Finalizado', 'Cancelado', 'Entregue')`),
        pGet(`SELECT COALESCE(AVG(total), 0) as avgTotal FROM pedidos WHERE status IN ('Finalizado', 'Entregue') AND ${dateWhere}`),
        pGet(`SELECT COUNT(*) as ativos FROM pontos WHERE saida IS NULL`),
        pGet(`SELECT id, status, fundo_troco, data_abertura, data_fechamento FROM turnos_caixa ORDER BY id DESC LIMIT 1`),
        pAll(`
          SELECT productName, productEmoji, SUM(quantity) as quantidade, SUM(total) as total
          FROM pedidos
          WHERE status IN ('Finalizado', 'Entregue') AND ${dateWhere}
          GROUP BY productName, productEmoji
          ORDER BY quantidade DESC
          LIMIT 5
        `),
        pAll(`
          SELECT 
            CASE 
              WHEN localName LIKE '%Mesa%' OR localName LIKE '%Comanda%' THEN 'salao'
              WHEN localName LIKE '%Delivery%' OR localName LIKE '%Entrega%' OR localName LIKE '%iFood%' OR paymentMethod = 'iFood' THEN 'delivery'
              ELSE 'balcao'
            END as canal,
            COUNT(*) as pedidos,
            COALESCE(SUM(total), 0) as totalValor
          FROM pedidos
          WHERE status IN ('Finalizado', 'Entregue') AND ${dateWhere}
          GROUP BY canal
        `),
        pGet(`SELECT COALESCE(SUM(valor), 0) as totalDespesas, COUNT(*) as qtdDespesas FROM movimentacoes WHERE LOWER(tipo) IN ('sangria', 'despesa') AND ${movWhere}`),
        pGet(`SELECT COUNT(*) as totalCancelados, COALESCE(SUM(total), 0) as valorCancelado FROM pedidos WHERE status = 'Cancelado' AND ${dateWhere}`),
        pAll(`
          SELECT 
            userName,
            COUNT(*) as atendimentos,
            COALESCE(SUM(total), 0) as totalVendido,
            COALESCE(AVG(total), 0) as ticketMedio,
            COALESCE(SUM(total * 0.10), 0) as comissao,
            COALESCE(SUM(total * 0.35), 0) as lucroGerado
          FROM pedidos
          WHERE status IN ('Finalizado', 'Entregue') 
            AND ${dateWhere}
            AND userName IS NOT NULL 
            AND TRIM(userName) != ''
          GROUP BY userName
          ORDER BY totalVendido DESC
          LIMIT 10
        `),
        new Promise((resolve) => {
          masterDb.all(`SELECT chave, valor FROM configuracoes_global WHERE chave IN ('gamificacao_meta', 'gamificacao_premio')`, [], (err, rows) => {
            const cfg = { meta: 3000, premio: 'R$ 150 de Bônus PIX + Folga Extra para o #1' };
            if (rows && rows.length > 0) {
              rows.forEach(r => {
                if (r.chave === 'gamificacao_meta') cfg.meta = parseFloat(r.valor) || 3000;
                if (r.chave === 'gamificacao_premio') cfg.premio = r.valor || cfg.premio;
              });
            }
            resolve(cfg);
          });
        })
      ]);

      const isCaixaAberto = Boolean(caixaRow && (caixaRow.status === 'Aberto' || (!caixaRow.data_fechamento && caixaRow.status !== 'Fechado')));
      const caixaStatus = isCaixaAberto ? 'Aberto' : 'Fechado';
      const caixaSaldo = caixaRow ? (caixaRow.fundo_troco || 0) : 0;

      const faturamentoHoje = Number(faturamentoRow?.total || 0);
      const totalPedidos = Number(faturamentoRow?.totalPedidos || 0);
      const faturamentoAnterior = Number(faturamentoAntRow?.total || 0);

      // Comparativo de variação
      let variacaoPercentual = 0;
      let variacaoTexto = 'Estável vs período anterior';
      if (faturamentoAnterior > 0) {
        variacaoPercentual = Number((((faturamentoHoje - faturamentoAnterior) / faturamentoAnterior) * 100).toFixed(1));
        const sinal = variacaoPercentual >= 0 ? '+' : '';
        variacaoTexto = `${sinal}${variacaoPercentual}% vs ${rotuloAnt}`;
      } else if (faturamentoHoje > 0) {
        variacaoPercentual = 100;
        variacaoTexto = '+100% vs período anterior';
      }

      // Canais de Venda
      let salaoValor = 0, salaoPedidos = 0;
      let deliveryValor = 0, deliveryPedidos = 0;
      let balcaoValor = 0, balcaoPedidos = 0;

      (canaisRows || []).forEach(c => {
        if (c.canal === 'salao') {
          salaoValor = Number(c.totalValor || 0);
          salaoPedidos = Number(c.pedidos || 0);
        } else if (c.canal === 'delivery') {
          deliveryValor = Number(c.totalValor || 0);
          deliveryPedidos = Number(c.pedidos || 0);
        } else {
          balcaoValor += Number(c.totalValor || 0);
          balcaoPedidos += Number(c.pedidos || 0);
        }
      });

      const canalTotal = salaoValor + deliveryValor + balcaoValor || 1;
      const canais = {
        salao: { valor: salaoValor, pedidos: salaoPedidos, percentual: Number(((salaoValor / canalTotal) * 100).toFixed(1)) },
        delivery: { valor: deliveryValor, pedidos: deliveryPedidos, percentual: Number(((deliveryValor / canalTotal) * 100).toFixed(1)) },
        balcao: { valor: balcaoValor, pedidos: balcaoPedidos, percentual: Number(((balcaoValor / canalTotal) * 100).toFixed(1)) },
        economiaMarketplace: Number((deliveryValor * 0.20).toFixed(2)) // 20% de economia estimada vendendo pelo canal próprio vs marketplace
      };

      // DRE & Lucro Líquido (Parâmetros da Abrasel / Gastronomia)
      const cmvEstimado = Number((faturamentoHoje * 0.32).toFixed(2)); // CMV estimado médio de 32%
      const taxasEstimadas = Number((faturamentoHoje * 0.025).toFixed(2)); // Taxa de intermediação e maquininha de 2.5%
      const despesasReais = Number(despesasRow?.totalDespesas || 0);
      const lucroLiquido = Number((faturamentoHoje - cmvEstimado - taxasEstimadas - despesasReais).toFixed(2));
      const margemLucro = faturamentoHoje > 0 ? Number(((lucroLiquido / faturamentoHoje) * 100).toFixed(1)) : 0;

      const dre = {
        faturamentoBruto: faturamentoHoje,
        cmvEstimado,
        taxasEstimadas,
        despesasReais,
        lucroLiquido,
        margemLucro
      };

      // Radar Antifraude
      const antifraude = {
        canceladosQtd: Number(canceladosRow?.totalCancelados || 0),
        canceladosValor: Number(canceladosRow?.valorCancelado || 0),
        sangriasQtd: Number(despesasRow?.qtdDespesas || 0),
        sangriasValor: despesasReais
      };

      // Destaques e Gamificação da Equipe
      let destaqueVendas = null;
      let destaqueAtendimentos = null;
      let destaqueLucro = null;
      const rankingEquipe = (equipeRows || []).map((colab, idx) => {
        const atend = Number(colab.atendimentos || 0);
        const vendido = Number(colab.totalVendido || 0);
        const lucro = Number(colab.lucroGerado || 0);
        const ticket = Number(colab.ticketMedio || 0);
        const comiss = Number(colab.comissao || 0);
        const xp = Math.round((vendido * 1) + (atend * 15));

        const item = {
          posicao: idx + 1,
          nome: colab.userName,
          atendimentos: atend,
          totalVendido: vendido,
          lucroGerado: lucro,
          ticketMedio: ticket,
          comissao: comiss,
          pontosXP: xp
        };

        if (!destaqueVendas || vendido > destaqueVendas.totalVendido) destaqueVendas = item;
        if (!destaqueAtendimentos || atend > destaqueAtendimentos.atendimentos) destaqueAtendimentos = item;
        if (!destaqueLucro || lucro > destaqueLucro.lucroGerado) destaqueLucro = item;

        return item;
      });

      // Progresso da Meta de Gamificação
      const metaGamificacao = Number(gamificacaoConfig?.meta || 3000);
      const premioGamificacao = gamificacaoConfig?.premio || 'R$ 150 de Bônus PIX';
      const progressoGamificacao = metaGamificacao > 0 ? Math.min(100, Math.round((faturamentoHoje / metaGamificacao) * 100)) : 0;

      // Copiloto Cheff IA Insight
      let iaInsight = '';
      if (faturamentoHoje === 0) {
        iaInsight = 'O expediente ainda está no início ou sem fechamentos no período. Dica do Cheff: Prepare sua equipe para o horário de pico e verifique se as promoções do dia estão ativas no cardápio.';
      } else if (variacaoPercentual > 10) {
        iaInsight = `Desempenho excelente! Suas vendas estão ${variacaoTexto}. O canal de maior tração é ${salaoValor >= deliveryValor ? 'Salão & Mesas' : 'Delivery'}, gerando margem estimada de ${margemLucro}%. Mantenha o ritmo de atendimento!`;
      } else if (variacaoPercentual < -10) {
        iaInsight = `Atenção: O faturamento está ${variacaoTexto}. Dica do Cheff: Acione o envio de cupons QR no WhatsApp ou lance uma promoção relâmpago de sobremesa para alavancar o ticket médio.`;
      } else {
        iaInsight = `Operação estável hoje. Lucro líquido projetado em R$ ${lucroLiquido.toLocaleString('pt-BR', {minimumFractionDigits: 2})} (margem estimada de ${margemLucro}%). Você economizou cerca de R$ ${canais.economiaMarketplace.toLocaleString('pt-BR', {minimumFractionDigits: 2})} em comissões vendendo por canais próprios.`;
      }

      res.json({
        success: true,
        data: {
          rotuloPeriodo: rotulo,
          totalPedidos: totalPedidos,
          faturamentoHoje: faturamentoHoje,
          mesasAtivas: mesasRow?.ativas || 0,
          ticketMedio: ticketRow?.avgTotal || 0,
          colaboradoresAtivos: ativosRow?.ativos || 0,
          caixaStatus: caixaStatus,
          caixaSaldo: caixaSaldo,
          topProdutos: topProdutos || [],
          // Novos recursos de alta performance:
          variacao: {
            percentual: variacaoPercentual,
            texto: variacaoTexto,
            faturamentoAnterior: faturamentoAnterior,
            rotuloAnterior: rotuloAnt
          },
          dre: dre,
          canais: canais,
          antifraude: antifraude,
          iaInsight: iaInsight,
          equipePerformance: {
            destaqueVendas,
            destaqueAtendimentos,
            destaqueLucro,
            ranking: rankingEquipe,
            colaboradores: rankingEquipe,
            gamificacao: {
              meta: metaGamificacao,
              premio: premioGamificacao,
              totalVendido: faturamentoHoje,
              percentual: progressoGamificacao,
              progresso: progressoGamificacao,
              atingida: faturamentoHoje >= metaGamificacao,
              alcancado: faturamentoHoje >= metaGamificacao,
              restante: Math.max(0, metaGamificacao - faturamentoHoje)
            }
          }
        }
      });
    } catch (errMetrics) {
      console.error('Erro em handleDashboardMetrics:', errMetrics);
      res.status(500).json({ success: false, error: errMetrics.message });
    }
  };

  if (!token) return processMetrics(1);

  jwt.verify(token, JWT_SECRET, (errToken, decoded) => {
    if (errToken || !decoded) return processMetrics(1);
    processMetrics(decoded.restaurante_id || 1);
  });
};

router.get('/api/dono/dashboard', handleDashboardMetrics);
router.get('/api/dashboard/metrics', handleDashboardMetrics);

// Endpoints de Gamificação do Painel do Dono
router.get('/api/dono/gamificacao-config', (req, res) => {
  masterDb.all(`SELECT chave, valor FROM configuracoes_global WHERE chave IN ('gamificacao_meta', 'gamificacao_premio')`, [], (err, rows) => {
    let meta = 25000;
    let premio = 'Rodízio liberado + R$ 500 em dinheiro para a equipe';
    if (!err && Array.isArray(rows)) {
      rows.forEach(r => {
        if (r.chave === 'gamificacao_meta') meta = parseFloat(r.valor) || 25000;
        if (r.chave === 'gamificacao_premio') premio = r.valor || premio;
      });
    }
    res.json({ success: true, meta, premio });
  });
});

router.post('/api/dono/gamificacao-config', (req, res) => {
  const { meta, premio } = req.body || {};
  const metaNum = parseFloat(meta) || 25000;
  const premioStr = String(premio || 'Premiação Especial').trim();

  masterDb.serialize(() => {
    masterDb.run(`INSERT OR REPLACE INTO configuracoes_global (chave, valor) VALUES ('gamificacao_meta', ?)`, [metaNum]);
    masterDb.run(`INSERT OR REPLACE INTO configuracoes_global (chave, valor) VALUES ('gamificacao_premio', ?)`, [premioStr], (err) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, meta: metaNum, premio: premioStr });
    });
  });
});

// API /api/auth/notificar-impostor — Alerta em tempo real de tentativa não autorizada no Painel do Dono
router.post('/api/auth/notificar-impostor', (req, res) => {
  const { email, cargo, restaurante_id } = req.body || {};
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'IP desconhecido';
  const restId = parseInt(restaurante_id) || 1;

  masterDb.get(`SELECT nome FROM restaurantes WHERE id = ?`, [restId], (errRest, restRow) => {
    const nomeRestaurante = restRow ? restRow.nome : `Restaurante #${restId}`;
    const detalhes = `⚠️ TENTATIVA DE IMPOSTOR: Usuário '${email}' (Cargo: ${cargo}) tentou acessar o Painel do Dono sem permissão! IP: ${ip}`;

    // 1. Registra no Log de Auditoria
    masterDb.run(
      `INSERT INTO suporte_logs_audit (suporte_id, suporte_nome, acao, detalhes, ip) VALUES (?, ?, ?, ?, ?)`,
      [0, email || 'Desconhecido', 'TENTATIVA_IMPOSTOR_PAINEL_DONO', detalhes, ip]
    );

    // 2. Notifica o Super Admin em tempo real via Socket.IO
    if (io) {
      io.emit('alerta_impostor_super_admin', {
        email,
        cargo,
        restaurante_id: restId,
        restaurante_nome: nomeRestaurante,
        ip,
        data_tentativa: new Date().toISOString(),
        mensagem: `🚨 ATENÇÃO SUPER-ADMIN: Tentativa de Impostor no ${nomeRestaurante}! O funcionário '${email}' (${cargo}) tentou acessar o Painel do Dono.`
      });

      // 3. Notifica o Gerente/Dono do Restaurante via Socket.IO
      io.to(`restaurante_${restId}`).emit('alerta_seguranca_gerente', {
        titulo: '⚠️ Alerta de Segurança',
        mensagem: `O colaborador '${email}' (${cargo}) tentou acessar o Painel do Dono sem autorização.`,
        ip,
        data: new Date().toLocaleTimeString('pt-BR')
      });
    }

    res.json({ ok: true, registrado: true });
  });
});

// ══════ PLUGINS & MÓDULOS ══════
// CREATE TABLE IF NOT EXISTS super_plugins (plugin_id TEXT PRIMARY KEY, nome TEXT, descricao TEXT, ativo INTEGER DEFAULT 1, atualizado_em DATETIME DEFAULT (datetime('now','localtime')));
masterDb.serialize(() => {
  masterDb.run(`CREATE TABLE IF NOT EXISTS super_plugins (
    plugin_id TEXT PRIMARY KEY,
    nome TEXT,
    descricao TEXT,
    ativo INTEGER DEFAULT 1,
    atualizado_em DATETIME DEFAULT (datetime('now','localtime'))
  )`);
  const defaultPlugins = [
    ['ifood', 'iFood Integrado Direct', 'Integração nativa de pedidos, cardápio e cancelamento automático com o iFood.'],
    ['whatsapp', 'WhatsApp Bot Atendimento', 'Disparo de notificação de pedido pronto e robô de pedidos automáticos.'],
    ['balanca', 'Balança Self-Service / Kilo', 'Conexão direta com balanças Toledo, Filizola e Urano via Serial/USB.'],
    ['kds', 'KDS Inteligente (Cozinha)', 'Painel de TV para gerenciamento de pedidos na cozinha com tempos de preparo.'],
    ['pix_automatico', 'Pagamentos PIX Automáticos', 'Geração automática de QR Code PIX e conciliação de pagamentos.']
  ];
  defaultPlugins.forEach(p => {
    masterDb.run(`INSERT OR IGNORE INTO super_plugins (plugin_id, nome, descricao, ativo) VALUES (?, ?, ?, 1)`, p);
  });
});

// ═══ TABELA: Temas por Tenant ═══
masterDb.run(`CREATE TABLE IF NOT EXISTS tenant_temas (
  restaurante_id INTEGER PRIMARY KEY,
  tema_json TEXT NOT NULL,
  atualizado_em DATETIME DEFAULT (datetime('now','localtime'))
)`);

// ═══ TABELA: Tarefas Super Admin ═══
masterDb.run(`CREATE TABLE IF NOT EXISTS super_tarefas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  descricao TEXT DEFAULT '',
  prioridade TEXT DEFAULT 'normal',
  status TEXT DEFAULT 'pendente',
  criado_por TEXT DEFAULT 'super_admin',
  atribuido_a TEXT DEFAULT '',
  restaurante_id INTEGER,
  categoria TEXT DEFAULT 'geral',
  resposta TEXT DEFAULT '',
  criado_em DATETIME DEFAULT (datetime('now','localtime')),
  atualizado_em DATETIME DEFAULT (datetime('now','localtime')),
  atribuido_em DATETIME,
  concluido_em DATETIME
)`);

router.get('/api/super/plugins', superAdminAuth, (req, res) => {
  masterDb.all(`SELECT * FROM super_plugins ORDER BY plugin_id`, [], (err, rows) => {
    if (err) return res.json({ ok: false, erro: err.message });
    res.json({ ok: true, plugins: rows || [] });
  });
});

router.post('/api/super/plugins', superAdminAuth, (req, res) => {
  const { plugin_id, ativo } = req.body || {};
  if (!plugin_id) return res.json({ ok: false, erro: 'plugin_id é obrigatório.' });
  masterDb.run(`UPDATE super_plugins SET ativo = ?, atualizado_em = datetime('now','localtime') WHERE plugin_id = ?`,
    [ativo ? 1 : 0, plugin_id], function(err) {
      if (err) return res.json({ ok: false, erro: err.message });
      if (io) {
        io.emit('plugin_atualizado', { plugin_id, ativo: !!ativo });
      }
      res.json({ ok: true, mensagem: `Plugin ${plugin_id} ${ativo ? 'ativado' : 'desativado'}.` });
    });
});

// GET /api/super/commits — Lista os últimos 15 commits do repositório Git
// Cada commit vem anotado com status (estavel/quebrado) e nota rápida salvas pelo super admin.
router.get('/api/super/commits', superAdminAuth, (req, res) => {
  const { exec } = require('child_process');
  exec('git log -n 15 --pretty=format:"%h|%s|%an|%ar"', (err, stdout) => {
    if (err) return res.json({ ok: false, erro: 'Falha ao obter histórico Git: ' + err.message });
    const lines = stdout.split('\n').filter(Boolean);
    const commits = lines.map(line => {
      const parts = line.split('|');
      return {
        hash: parts[0],
        mensagem: parts[1] || 'Sem mensagem',
        autor: parts[2] || 'Anônimo',
        data: parts[3] || 'Recente'
      };
    });
    masterDb.get(`SELECT valor FROM configuracoes_global WHERE chave = 'commit_meta'`, [], (errM, rowM) => {
      let meta = {};
      if (!errM && rowM && rowM.valor) { try { meta = JSON.parse(rowM.valor); } catch (e) { } }
      commits.forEach(c => {
        const m = meta[c.hash];
        if (m) { c.status = m.status || null; c.nota = m.nota || ''; }
      });
      res.json({ ok: true, commits });
    });
  });
});

// POST /api/super/commits/meta — Marca commit como estável/quebrado e salva nota rápida
router.post('/api/super/commits/meta', superAdminAuth, (req, res) => {
  const { hash } = req.body || {};
  const status = req.body && req.body.status !== undefined ? req.body.status : null;
  const nota = req.body && req.body.nota !== undefined ? String(req.body.nota).slice(0, 500) : null;
  const safeHash = String(hash || '').replace(/[^a-f0-9]/gi, '');
  if (!safeHash) return res.json({ ok: false, erro: 'Hash do commit é obrigatório.' });
  if (status !== null && !['estavel', 'quebrado', ''].includes(status)) {
    return res.json({ ok: false, erro: 'Status inválido. Use "estavel", "quebrado" ou "".' });
  }
  masterDb.get(`SELECT valor FROM configuracoes_global WHERE chave = 'commit_meta'`, [], (err, row) => {
    let meta = {};
    if (!err && row && row.valor) { try { meta = JSON.parse(row.valor); } catch (e) { } }
    const atual = meta[safeHash] || {};
    if (status !== null) atual.status = status || null;
    if (nota !== null) atual.nota = nota;
    atual.ts = Date.now();
    meta[safeHash] = atual;
    const valor = JSON.stringify(meta);
    masterDb.run(`INSERT INTO configuracoes_global (chave, valor) VALUES ('commit_meta', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [valor], (errS) => {
      if (errS) return res.json({ ok: false, erro: errS.message });
      res.json({ ok: true, mensagem: 'Commit atualizado.', meta: meta[safeHash] });
    });
  });
});

// ── SUPER ADMIN: ALTERAR SENHA ──────────────────────────────────────
// Salva hash dedicado em configuracoes_global; a partir daí só a nova senha abre o painel.
router.post('/api/super/alterar-senha', superAdminAuth, async (req, res) => {
  try {
    const { senha_atual, nova_senha } = req.body || {};
    if (!senha_atual || !nova_senha) return res.json({ ok: false, erro: 'Informe a senha atual e a nova senha.' });
    if (String(nova_senha).length < 8) return res.json({ ok: false, erro: 'A nova senha deve ter pelo menos 8 caracteres.' });
    if (String(nova_senha).length > 72) return res.json({ ok: false, erro: 'A nova senha deve ter no máximo 72 caracteres.' });
    const okAtual = await verificarSenhaAdmin(String(senha_atual));
    if (!okAtual) return res.json({ ok: false, erro: 'Senha atual incorreta.' });
    const hash = await bcrypt.hash(String(nova_senha), 10);
    masterDb.run(`INSERT INTO configuracoes_global (chave, valor) VALUES ('super_admin_senha_hash', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [hash], function(err) {
      if (err) return res.json({ ok: false, erro: err.message });
      try { if (typeof registrarAuditLog === 'function') registrarAuditLog(null, 'super_admin', 'ALTERAR_SENHA_ADMIN', 'Senha do super admin alterada via painel', req); } catch (e) { }
      res.json({ ok: true, mensagem: 'Senha alterada com sucesso! Use a nova senha no próximo login.' });
    });
  } catch (e) {
    res.json({ ok: false, erro: e.message });
  }
});

// ── RESTAURANTE: REPORTAR PROBLEMA → vira tarefa para a equipe de suporte ──
// Middleware local de autenticação de suporte (autossuficiente para o bundle prod)
const relatoSuporteAuth = (req, res, next) => {
  const token = req.headers['x-suporte-token'];
  if (!token) return res.json({ ok: false, erro: 'Token de suporte não fornecido.' });
  try {
    const decoded = jwt.verify(token, SUPORTE_JWT_SECRET);
    req.suporteId = decoded.id;
    req.suporteData = decoded;
    next();
  } catch (e) { res.json({ ok: false, erro: 'Sessão de suporte inválida ou expirada.' }); }
};

router.post('/api/dono/reportar-problema', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader ? authHeader.split(' ')[1] : (req.body && req.body.token);

  const processarRelato = (tenantId, autor) => {
    const { titulo, descricao, categoria, prioridade } = req.body || {};
    if (!titulo || String(titulo).trim().length < 3 || String(titulo).trim().length > 120) {
      return res.json({ ok: false, erro: 'Informe um título de 3 a 120 caracteres.' });
    }
    if (!descricao || String(descricao).trim().length < 5 || String(descricao).trim().length > 1500) {
      return res.json({ ok: false, erro: 'Descreva o problema em até 1500 caracteres.' });
    }
    const cat = ['bug', 'duvida', 'sugestao', 'outro'].includes(categoria) ? categoria : 'outro';
    const pri = ['baixa', 'media', 'alta'].includes(prioridade) ? prioridade : 'media';
    const restId = parseInt(tenantId) || 1;

    masterDb.get(`SELECT nome FROM restaurantes WHERE id = ?`, [restId], (errR, rowR) => {
      const nomeRestaurante = (errR || !rowR) ? ('Restaurante #' + restId) : rowR.nome;
      const descFinal = `[RELATO ${cat.toUpperCase()} • prioridade ${pri.toUpperCase()}] ${String(titulo).trim()}\nRestaurante: ${nomeRestaurante}\nAutor: ${autor || 'Dono/Administrador'}\n\n${String(descricao).trim()}`;
      masterDb.run(
        `INSERT INTO tarefas_suporte (suporte_id, tipo, descricao, restaurante_id, pontos, status, criada_em) VALUES (NULL, 'relato_restaurante', ?, ?, 15, 'pendente', datetime('now','localtime'))`,
        [descFinal, restId],
        function(err) {
          if (err) return res.json({ ok: false, erro: err.message });
          try {
            io.emit('nova_tarefa_suporte', { id: this.lastID, restaurante_id: restId, restaurante_nome: nomeRestaurante, titulo: String(titulo).trim(), categoria: cat, prioridade: pri });
          } catch (e) {}
          res.json({ ok: true, id: this.lastID, mensagem: 'Relato enviado! Nossa equipe de suporte já foi notificada.' });
        }
      );
    });
  };

  if (!token) {
    return processarRelato(1, 'Dono (Painel Local)');
  }

  jwt.verify(token, JWT_SECRET, (errToken, decoded) => {
    if (errToken || !decoded) {
      return processarRelato(1, 'Dono (Painel do Dono)');
    }
    const rolesAutorizadas = ['admin', 'gerente', 'dono', 'super_admin', 'super_admin_local'];
    if (!rolesAutorizadas.includes(decoded.role)) {
      return res.status(403).json({ ok: false, erro: 'Acesso não autorizado para o perfil ' + decoded.role });
    }
    processarRelato(decoded.restaurante_id || 1, decoded.nome || decoded.username || decoded.role);
  });
});

// GET /api/suporte/tarefas-relatadas - Fila de relatos enviados pelos restaurantes (não assumidos)
router.get('/api/suporte/tarefas-relatadas', relatoSuporteAuth, (req, res) => {
  masterDb.all(`SELECT t.*, r.nome as restaurante_nome FROM tarefas_suporte t LEFT JOIN restaurantes r ON t.restaurante_id = r.id WHERE t.tipo = 'relato_restaurante' AND t.status = 'pendente' AND t.suporte_id IS NULL ORDER BY t.criada_em DESC LIMIT 50`,
    [], (err, rows) => {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true, relatos: rows || [] });
    }
  );
});

// POST /api/suporte/assumir-relato - Atendente assume um relato da fila
router.post('/api/suporte/assumir-relato', relatoSuporteAuth, (req, res) => {
  const { id } = req.body || {};
  if (!id) return res.json({ ok: false, erro: 'ID do relato obrigatório.' });
  masterDb.run(`UPDATE tarefas_suporte SET suporte_id = ? WHERE id = ? AND tipo = 'relato_restaurante' AND status = 'pendente' AND suporte_id IS NULL`,
    [req.suporteId, parseInt(id)], function(err) {
      if (err) return res.json({ ok: false, erro: err.message });
      if (this.changes === 0) return res.json({ ok: false, erro: 'Relato não disponível (já assumido por outro atendente).' });
      res.json({ ok: true, mensagem: 'Relato assumido! Ele agora está nas suas tarefas.' });
    }
  );
});

// POST /api/suporte/concluir-tarefa - Atendente conclui uma das suas tarefas
router.post('/api/suporte/concluir-tarefa', relatoSuporteAuth, (req, res) => {
  const { id } = req.body || {};
  if (!id) return res.json({ ok: false, erro: 'ID da tarefa obrigatório.' });
  masterDb.run(`UPDATE tarefas_suporte SET status = 'concluida', concluida_em = datetime('now','localtime') WHERE id = ? AND suporte_id = ? AND status IN ('pendente','aviso')`,
    [parseInt(id), req.suporteId], function(err) {
      if (err) return res.json({ ok: false, erro: err.message });
      if (this.changes === 0) return res.json({ ok: false, erro: 'Tarefa não encontrada ou já concluída.' });
      masterDb.run(`UPDATE equipe_suporte SET xp = xp + 10 WHERE id = ?`, [req.suporteId]);
      res.json({ ok: true, mensagem: 'Tarefa concluída! +10 XP' });
    }
  );
});

// ── SUPORTE: implementações de módulos delegadas ao atendente, em nome do super admin ──
const nomeFuncaoPorChave = (chave) => {
  if (chave === 'nova_solicitacao') return 'Função personalizada';
  const def = (typeof FUNCOES_MODULOS !== 'undefined' && FUNCOES_MODULOS) ? FUNCOES_MODULOS.find(f => f.chave === chave) : null;
  return def ? def.nome : chave;
};

// GET — fila de implementações delegadas a este atendente de suporte
router.get('/api/suporte/implementacoes', relatoSuporteAuth, (req, res) => {
  masterDb.all(
    `SELECT s.*, r.nome AS restaurante_nome FROM solicitacoes_features s
       LEFT JOIN restaurantes r ON r.id = s.restaurante_id
      WHERE s.responsavel_id = ? AND s.status IN ('em_implementacao','pendente') AND s.feature != 'nova_solicitacao'
      ORDER BY s.criado_em ASC LIMIT 200`,
    [req.suporteId || 0],
    (err, rows) => {
      if (err) return res.json({ ok: false, erro: err.message });
      const itens = (rows || []).map(s => ({ id: s.id, restaurante_id: s.restaurante_id, restaurante_nome: s.restaurante_nome, feature: s.feature, feature_nome: nomeFuncaoPorChave(s.feature), mensagem: s.mensagem, status: s.status, criado_em: s.criado_em }));
      res.json({ ok: true, implementacoes: itens });
    }
  );
});

// POST — atendente conclui a implementação do módulo (em nome do super admin)
router.post('/api/suporte/implementacoes/:id/concluir', relatoSuporteAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.json({ ok: false, erro: 'ID obrigatório.' });
  masterDb.get(`SELECT nome FROM equipe_suporte WHERE id = ?`, [req.suporteId || 0], (errSup, sup) => {
    const nomeSuporte = (errSup || !sup) ? ('Suporte #' + (req.suporteId || '')) : sup.nome;
    masterDb.run(
      `UPDATE solicitacoes_features SET status = 'implementada', responsavel_nome = ?, responsavel_tipo = 'suporte' WHERE id = ? AND responsavel_id = ? AND status = 'em_implementacao'`,
      [nomeSuporte, id, req.suporteId || 0],
      function(err) {
        if (err) return res.json({ ok: false, erro: err.message });
        if (this.changes === 0) return res.json({ ok: false, erro: 'Implementação não encontrada ou não delegada a você.' });
        masterDb.run(`UPDATE equipe_suporte SET xp = xp + 15 WHERE id = ?`, [req.suporteId || 0]);
        masterDb.get(`SELECT restaurante_id, feature FROM solicitacoes_features WHERE id = ?`, [id], (e2, sol) => {
          if (sol) { try { io.to('restaurante_' + sol.restaurante_id).emit('funcao_implementada', { feature: sol.feature, responsavel: nomeSuporte }); } catch (e3) {} }
        });
        res.json({ ok: true, mensagem: 'Implementação concluída! O super admin aprovará a liberação.' });
      }
    );
  });
});

// POST /api/super/deploy-commit — Executa deploy zero-downtime para um commit específico
router.post('/api/super/deploy-commit', superAdminAuth, (req, res) => {
  const { hash } = req.body || {};
  if (!hash) return res.json({ ok: false, erro: 'Hash do commit é obrigatório.' });

  const { exec: execCb } = require('child_process');
  const safeHash = String(hash).replace(/[^a-f0-9]/gi, '');

  execCb(`git fetch origin && git checkout ${safeHash}`, (err, stdout, stderr) => {
    if (err) return res.json({ ok: false, erro: 'Erro ao alternar para o commit: ' + (stderr || err.message) });

    const reloadResult = [];
    const modulesToReload = [
      './controllers/super-admin.js',
      './controllers/socket-financeiro.js',
      './controllers/sync-server.js',
      './deployment-config.js',
      './sync-agent.js',
      './feature-plans.js'
    ];
    modulesToReload.forEach(mod => {
      try {
        delete require.cache[require.resolve(mod)];
        reloadResult.push({ modulo: mod, status: 'recarregado' });
      } catch (e) {
        reloadResult.push({ modulo: mod, status: 'ignorado: ' + e.message });
      }
    });

    if (io) {
      io.emit('sistema_hot_swapped', {
        hash: safeHash,
        data: new Date().toISOString(),
        reload_result: reloadResult,
        mensagem: 'Servidor atualizado para commit ' + safeHash + '. Recarregue a página para ver mudanças.'
      });
    }

    res.json({
      ok: true,
      mensagem: `Deploy Zero-Downtime efetuado para o commit ${safeHash}. ${reloadResult.length} módulo(s) recarregado(s).`,
      reload_result: reloadResult
    });
  });
});

  return router;
};
