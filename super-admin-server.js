/* ═════════════════════════════════════════════════════════════════════
   SUPER ADMIN — SERVIDOR EM PROCESSO NODE ISOLADO
   Roda o painel super admin em um processo separado do servidor principal.
   Se este processo cair ou sofrer pico, os restaurantes continuam operando
   (e vice-versa). Compartilha apenas o master.sqlite (WAL).

   Uso:
     SUPER_ADMIN_ISOLADO=1 node server.js            (servidor principal, sem montar as rotas)
     SUPER_ADMIN_PORT=3457 node super-admin-server.js (este processo)

   Painel: http://SEU_IP:3457/super-admin.html
   ═════════════════════════════════════════════════════════════════════ */
'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const sqlite3 = require('./sqlite3-wrapper').verbose();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const os = require('os');

const ROOT = __dirname;
const PORT = parseInt(process.env.SUPER_ADMIN_PORT, 10) || 3457;
const MAIN_URL = process.env.MAIN_SERVER_URL || 'http://127.0.0.1:' + (parseInt(process.env.PORT, 10) || 3000);

function getDataDir() {
  if (process.env.CHEF_DATA_DIR) return process.env.CHEF_DATA_DIR;
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'ChefCozinha');
  }
  if (process.platform === 'linux' || process.platform === 'darwin') {
    const xdg = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
    return path.join(xdg, 'ChefCozinha');
  }
  return path.join(os.homedir(), '.chefcozinha');
}

function loadOrCreateSecret(name) {
  const dir = getDataDir();
  const file = path.join(dir, `.secret-${name}`);
  try {
    if (fs.existsSync(file)) {
      const val = fs.readFileSync(file, 'utf8').trim();
      if (val) return val;
    }
    fs.mkdirSync(dir, { recursive: true });
    const val = require('crypto').randomBytes(32).toString('hex');
    fs.writeFileSync(file, val, { mode: 0o600, encoding: 'utf8' });
    return val;
  } catch (e) {
    return require('crypto').randomBytes(32).toString('hex');
  }
}

const JWT_SECRET = process.env.JWT_SECRET || loadOrCreateSecret('jwt');
const INTERNAL_TOKEN = process.env.SUPER_ADMIN_INTERNAL_TOKEN ||
  require('crypto').createHash('sha256').update('internal::' + JWT_SECRET).digest('hex');

/* ── Banco master (WAL permite multi-processo) ── */
const dbPath = path.join(ROOT, 'master.sqlite');
if (!fs.existsSync(dbPath)) {
  console.error('[super-admin-isolado] master.sqlite não encontrado em ' + ROOT + '. Rode o servidor principal primeiro.');
  process.exit(1);
}
const masterDb = new sqlite3.Database(dbPath);
masterDb.run(`PRAGMA journal_mode = WAL`);
masterDb.run(`PRAGMA synchronous = NORMAL`);
masterDb.run(`PRAGMA busy_timeout = 5000`);

const app = express();
app.use(express.json({ limit: '2mb' }));

/* Parser de cookies simples (mesma estratégia do servidor principal) */
app.use((req, res, next) => {
  req.cookies = {};
  const raw = req.headers.cookie;
  if (raw) {
    raw.split(';').forEach(c => {
      const parts = c.split('=');
      if (parts.length >= 2) req.cookies[parts[0].trim()] = decodeURIComponent(parts.slice(1).join('=').trim());
    });
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

/* ── Autenticação (JWT idêntico ao principal) ── */
function superAdminAuth(req, res, next) {
  const tokenHeader = (req.cookies && req.cookies.super_admin_token) || req.headers['x-super-admin-token'] || req.query.adminToken;
  if (tokenHeader) {
    try {
      const decoded = jwt.verify(tokenHeader, JWT_SECRET);
      if (decoded && decoded.role === 'super_admin_local') {
        req.superAdmin = decoded;
        return next();
      }
    } catch (e) { }
  }
  return res.status(401).json({ ok: false, erro: 'Acesso não autorizado. Autentique-se novamente.' });
}

/* Anti-brute-force local */
const loginAttempts = new Map();
function loginBloqueado(ip) {
  const rec = loginAttempts.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.inicio > 15 * 60 * 1000) { loginAttempts.delete(ip); return false; }
  return rec.falhas >= 5;
}
function registrarFalhaLogin(ip) {
  const rec = loginAttempts.get(ip);
  if (!rec || Date.now() - rec.inicio > 15 * 60 * 1000) loginAttempts.set(ip, { inicio: Date.now(), falhas: 1 });
  else rec.falhas++;
}

function verificarSenhaAdmin(senha) {
  return new Promise((resolve) => {
    if (!senha) return resolve(false);
    masterDb.get(`SELECT valor FROM configuracoes_global WHERE chave = 'super_admin_senha_hash'`, [], async (errC, rowC) => {
      if (!errC && rowC && rowC.valor) {
        try { if (await bcrypt.compare(String(senha), rowC.valor)) return resolve(true); } catch (e) { }
        return resolve(false);
      }
      masterDb.all(`SELECT password_hash FROM usuarios WHERE role = 'admin' AND ativo = 1`, [], async (err, users) => {
        if (err || !users || !users.length) return resolve(false);
        for (const u of users) {
          try { if (await bcrypt.compare(senha, u.password_hash)) return resolve(true); } catch (e) { }
        }
        resolve(false);
      });
    });
  });
}

app.post('/api/super/login-local', async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1').replace('::ffff:', '');
  if (loginBloqueado(ip)) return res.status(429).json({ ok: false, erro: 'Muitas tentativas. Aguarde 15 minutos.' });
  const ok = await verificarSenhaAdmin(req.body && req.body.senha);
  if (!ok) { registrarFalhaLogin(ip); return res.json({ ok: false, erro: 'Senha de administrador inválida.' }); }
  loginAttempts.delete(ip);
  const token = jwt.sign({ role: 'super_admin_local', restaurante_id: 1 }, JWT_SECRET, { expiresIn: '90d' });
  res.setHeader('Set-Cookie', `super_admin_token=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${90 * 24 * 60 * 60}`);
  res.json({ ok: true, token });
});

app.post('/api/super/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'super_admin_token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  res.json({ ok: true, mensagem: 'Sessão encerrada com sucesso.' });
});

app.get('/api/super/check-auth', superAdminAuth, (req, res) => {
  res.json({ ok: true, authenticated: true, superAdmin: req.superAdmin });
});

app.get('/api/super/panel-template', superAdminAuth, (req, res) => {
  const panelPath = path.join(ROOT, 'views', 'super-admin-panel.html');
  if (fs.existsSync(panelPath)) return res.sendFile(panelPath);
  res.status(404).send('Painel não encontrado.');
});

/* ── Estado local de features (lê direto do master.sqlite) ── */
const featurePlans = require('./feature-plans');
function getTenantFeaturesSync(tid) {
  return featurePlans.getPlanDefaults('ativo');
}
function isTenantFeatureEnabled(tid, feature) {
  return true; // decisões de runtime pertencem ao processo principal
}

/* ── Métricas de sockets vindas do processo principal (cache 10s) ── */
const socketsCache = new Map();
async function atualizarMetricas() {
  try {
    const fetchFn = global.fetch;
    const r = await fetchFn(MAIN_URL + '/api/internal/metrics', { headers: { 'x-internal-token': INTERNAL_TOKEN } });
    const data = await r.json();
    if (data && data.ok && data.sockets) {
      Object.keys(data.sockets).forEach(k => socketsCache.set(Number(k), data.sockets[k]));
    }
  } catch (e) { /* principal offline: mantém último cache */ }
}
setInterval(atualizarMetricas, 10000);
setTimeout(atualizarMetricas, 1500);

function metricSocketCount(tid) { return socketsCache.get(tid) || 0; }

/* ── Proxy de io: repassa emits para o processo principal via HTTP ── */
async function postInternal(action, payload) {
  try {
    await fetch(MAIN_URL + '/api/internal/emit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-token': INTERNAL_TOKEN },
      body: JSON.stringify(Object.assign({ action }, payload))
    });
  } catch (e) { /* principal offline */ }
}
const ioProxy = {
  emit: (evento, ...args) => { postInternal('emit_global', { evento, args }); },
  to: (room) => ({ emit: (evento, ...args) => { postInternal('emit_room', { room, evento, args }); } })
};

/* Recarregar mapas de domínio no processo principal (no-op local) */
async function reloadDomainMaps() { await postInternal('reload_domain_maps', {}); }

/* Após mudanças de features, pede para o processo principal recarregar runtime */
async function loadAllTenantFeatures() { await postInternal('reload_features', {}); }

/* ── Monta o controller completo do super admin ── */
require('./controllers/super-admin')(app, masterDb, sqlite3, {
  JWT_SECRET,
  superAdminAuth,
  io: ioProxy,
  featurePlans,
  loadAllTenantFeatures,
  getTenantFeaturesSync,
  isTenantFeatureEnabled,
  metricSocketCount,
  ifoodApi: null,
  baseDomain: process.env.BASE_DOMAIN || 'localhost',
  reloadDomainMaps,
  createFreshTenantDb: null,
  ifoodDeps: null
});

/* ── Estáticos: serve o painel e assets a partir da raiz do projeto ── */
app.use(express.static(ROOT, { index: false, maxAge: '5m' }));
app.get('/', (req, res) => res.redirect('/super-admin.html'));

app.listen(PORT, () => {
  console.log('[super-admin-isolado] Painel Super Admin ISOLADO ativo na porta ' + PORT);
  console.log('[super-admin-isolado] Painel: http://localhost:' + PORT + '/super-admin.html');
  console.log('[super-admin-isolado] Processo principal esperado em: ' + MAIN_URL);
});

/* Encerramento limpo */
process.on('SIGINT', () => { try { masterDb.close(); } catch (e) {} process.exit(0); });
