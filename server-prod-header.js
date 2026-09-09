/**
 * server-prod.js - Versao de producao do servidor Chef Cozinha
 * Serve os arquivos estaticos da pasta /dist e abre o browser automaticamente.
 * Nao usa Vite - roda diretamente com Node.js ou como executavel pkg.
 */
const logLines = [];
const activeSockets = new Map();
const originalLog = console.log;
const originalError = console.error;

console.log = function(...args) {
  const line = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
  logLines.push(`[LOG] ${new Date().toLocaleTimeString()} - ${line}`);
  if (logLines.length > 100) logLines.shift();
  originalLog.apply(console, args);
};

console.error = function(...args) {
  const line = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
  logLines.push(`[ERR] ${new Date().toLocaleTimeString()} - ${line}`);
  if (logLines.length > 100) logLines.shift();
  originalError.apply(console, args);
};

function getLocalTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function getLocalDateOnly() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const mesasFechando = new Set();
let pedidosDebounceTimeout = null;
let mpCurrentIntentId = null;
let mpCurrentDeviceId = null;
function broadcastPedidos() {
  if (pedidosDebounceTimeout) clearTimeout(pedidosDebounceTimeout);
  pedidosDebounceTimeout = setTimeout(() => {
    db.all(`SELECT * FROM pedidos WHERE status != 'Finalizado'`, (e, r) => {
      if(!e) io.emit('pedidos_atualizados', r || []);
    });
  }, 300);
}

function broadcastFormasPagamento(targetSocket = null) {
  db.all(`SELECT * FROM formas_pagamento ORDER BY ordem ASC, id ASC`, [], (err, rows) => {
    if (!err) {
      if (targetSocket) {
        targetSocket.emit('formas_pagamento_atualizadas', rows || []);
      } else {
        io.emit('formas_pagamento_atualizadas', rows || []);
      }
    }
  });
}

function parseUserAgent(ua) {
  if (!ua) return { os: 'Desconhecido', browser: 'Navegador Web', model: 'Dispositivo Web', isMobile: false, icon: 'ph-desktop', fullDeviceStr: 'Computador (Navegador)' };

  let os = 'Windows PC';
  if (/windows nt 10/i.test(ua)) os = 'Windows 10/11';
  else if (/windows/i.test(ua)) os = 'Windows PC';
  else if (/android/i.test(ua)) os = 'Android OS';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS (Apple)';
  else if (/mac os/i.test(ua)) os = 'macOS (Apple)';
  else if (/linux/i.test(ua)) os = 'Linux';

  let browser = 'Chrome';
  if (/edg/i.test(ua)) browser = 'Microsoft Edge';
  else if (/chrome|crios/i.test(ua)) browser = 'Google Chrome';
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Apple Safari';
  else if (/firefox|fxios/i.test(ua)) browser = 'Mozilla Firefox';

  let model = 'Computador / Terminal Desktop';
  let isMobile = false;
  let icon = 'ph-desktop';

  if (/mobile|android|iphone|ipad/i.test(ua)) {
    isMobile = true;
    icon = 'ph-device-mobile';
    if (/iphone/i.test(ua)) { model = 'iPhone (Apple)'; icon = 'ph-device-mobile'; }
    else if (/ipad/i.test(ua)) { model = 'iPad (Apple Tablet)'; icon = 'ph-device-tablet'; }
    else if (/samsung/i.test(ua)) { model = 'Samsung Galaxy'; icon = 'ph-device-mobile'; }
    else if (/xiaomi|mi /i.test(ua)) { model = 'Xiaomi Redmi'; icon = 'ph-device-mobile'; }
    else if (/motorola|moto/i.test(ua)) { model = 'Motorola Moto'; icon = 'ph-device-mobile'; }
    else { model = 'Smartphone Android'; icon = 'ph-device-mobile'; }
  }

  return { os, browser, model, isMobile, icon, fullDeviceStr: `${model} (${os} / ${browser})` };
}

function getTempoConectadoStr(startTime) {
  if (!startTime) return 'Há pouco';
  const diffSec = Math.floor((Date.now() - startTime) / 1000);
  if (diffSec < 60) return `${diffSec} seg.`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min.`;
  const diffHours = Math.floor(diffMin / 60);
  const remMin = diffMin % 60;
  return `${diffHours}h ${remMin}m`;
}

let lastProdutos = null;
let lastConfig = null;

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const os = require('os');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const nfceService = require('./nfce-service');

// Carrega variáveis do arquivo .env (sem dependência externa)
try {
  const envFile = path.join(__dirname, '.env');
  if (fs.existsSync(envFile)) {
    fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach(line => {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    });
  }
} catch (e) {
  console.error('[Startup] Erro ao carregar .env:', e.message);
}

// Carregar configuracao da licenca e URL do Apps Script antes de importar o license-manager

// Diretório de dados da instalação, por plataforma:
//   - Windows: %APPDATA%\ChefCozinha  (C:\Users\<user>\AppData\Roaming\ChefCozinha)
//   - Linux:   $XDG_DATA_HOME/ChefCozinha ou ~/.local/share/ChefCozinha
//   - Override: CHEF_DATA_DIR força qualquer caminho (testes/instalação custom)
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

const LICENSE_CONFIG_FILE = path.join(getDataDir(), 'license-config.json');
try {
  if (fs.existsSync(LICENSE_CONFIG_FILE)) {
    const cfg = JSON.parse(fs.readFileSync(LICENSE_CONFIG_FILE, 'utf8'));
    if (cfg.scriptUrl) process.env.LICENSE_URL = cfg.scriptUrl;
    if (cfg.hubUrl) process.env.CHEF_HUB_URL = cfg.hubUrl;
  }
} catch (e) {
  console.error('[Startup] Erro ao carregar URL da licenca:', e.message);
}

const licenseManager = require('./license-manager');

// ---------- PATHS ----------
// pkg: __dirname é a pasta do .exe
const BASE_DIR = process.pkg ? path.dirname(process.execPath) : __dirname;
const DIST_DIR = path.join(BASE_DIR, 'dist');

// Em producao (pkg), usar o diretório de dados por plataforma (AppData no
// Windows, XDG no Linux). Fora do pkg: no Windows mantém a pasta do projeto
// (fluxo de desenvolvimento); no Linux sempre usa o diretório XDG padrão.
const isPkg = typeof process.pkg !== 'undefined';
const APP_DATA_DIR = (isPkg || process.platform !== 'win32') ? getDataDir() : BASE_DIR;

const DB_PATH  = path.join(APP_DATA_DIR, 'database.sqlite');
const UPLOAD_DIR = path.join(APP_DATA_DIR, 'uploads');

if (!fs.existsSync(APP_DATA_DIR)) fs.mkdirSync(APP_DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({ dest: UPLOAD_DIR });

const app  = express();
app.disable('x-powered-by');

app.use(cors());
app.use(express.json());

// Middleware global para registrar acessos à API (Quem, O Que, Pra Onde)
app.use('/api', (req, res, next) => {
  const start = Date.now();
  const operador = req.headers['x-user'] || req.headers['x-operador'] || req.query.user || (req.body && req.body.operador) || 'Sistema / API';
  const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1';
  const ip = rawIp.replace('::ffff:', '');

  res.on('finish', () => {
    let payload = '';
    if (req.method !== 'GET') {
      try {
        const bodyCopy = { ...req.body };
        if (bodyCopy.senha) bodyCopy.senha = '***';
        if (bodyCopy.cert_senha) bodyCopy.cert_senha = '***';
        payload = JSON.stringify(bodyCopy).substring(0, 300);
      } catch(e){}
    } else {
      try { payload = JSON.stringify(req.query || {}).substring(0, 300); } catch(e){}
    }

    db.run(
      `INSERT INTO api_logs (operador, ip, metodo, endpoint, detalhes, status_code) VALUES (?, ?, ?, ?, ?, ?)`,
      [operador, ip, req.method, req.originalUrl || req.url, payload, res.statusCode]
    );
  });
  next();
});

app.use((req, res, next) => {
  const origSetHeader = res.setHeader.bind(res);
  res.setHeader = (name, val) => {
    if (name && name.toLowerCase() === 'content-type' && typeof val === 'string' && !val.includes('charset')) {
      const textTypes = ['text/', 'application/javascript', 'application/json', 'application/xml'];
      if (textTypes.some(t => val.startsWith(t))) val += '; charset=utf-8';
    }
    return origSetHeader(name, val);
  };
  next();
});

// ── Hardening de Segurança: Headers HTTP e Proteção Anti-Sniffing/Clickjacking ──
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.removeHeader('X-Powered-By');
  next();
});

// ── Firewall Estático: Bloqueia acesso direto a arquivos de servidor, bancos, chaves e git ──
const PROD_BLOCKED_DIRECTORIES = [
  '/controllers', '/scratch', '/node_modules', '/installer', '/migrations',
  '/src', '/hub-server', '/iniciodoprojetorestaura', '/bin', '/.git', '/.vscode', '/.idea'
];

const PROD_BLOCKED_EXACT_FILES = new Set([
  'server.js', 'server-prod.js', 'server_test.js', 'watchdog.js', 'boot.js',
  'obfuscate.js', 'sync-prod.js', 'setup-quiz.js', 'copy-super-admin.js',
  'package.json', 'package-lock.json', 'chef-modules.json', 'tsconfig.json',
  'ecosystem.config.js', 'vite.config.js', 'build-hub.ps1', 'build-pkg.ps1',
  'server-prod-header.js'
]);

const PROD_BLOCKED_STATIC_EXTS = [
  '.sqlite', '.sqlite-wal', '.sqlite-shm', '.sqlite3', '.db', '.db-wal', '.db-shm',
  '.sql', '.bak', '.backup', '.dump',
  '.pfx', '.p12', '.pem', '.crt', '.key', '.cer', '.jks', '.keystore',
  '.env', '.log', '.ini', '.conf', '.cfg',
  '.bat', '.cmd', '.ps1', '.sh',
  '.zip', '.rar', '.7z', '.gz', '.tgz', '.tar',
  '.exe', '.msi', '.jar', '.apk', '.dll', '.so', '.dylib', '.deb', '.pkg',
  '.dmg', '.iso', '.war', '.ear',
  '.map'
];

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  let raw = (req.url || '/').split('?')[0];
  let decoded = '';
  try { decoded = decodeURIComponent(raw); } catch (e) { decoded = raw; }
  decoded = decoded.replace(/\\/g, '/');

  // 1. Path traversal
  const segments = decoded.split('/').filter(Boolean);
  if (segments.includes('..')) return res.status(403).send('Acesso negado.');

  // 2. Arquivos ou pastas ocultas (ex: /.git, /.env, /.vscode)
  if (segments.some(s => s.startsWith('.') && s !== '.')) return res.status(403).send('Acesso negado.');

  const lower = decoded.toLowerCase();

  // 3. Diretórios backend protegidos
  if (PROD_BLOCKED_DIRECTORIES.some(d => lower.startsWith(d.toLowerCase()))) {
    return res.status(403).send('Acesso negado.');
  }

  // 4. Arquivos de servidor restritos na raiz
  const filename = segments.length ? segments[segments.length - 1].toLowerCase() : '';
  if (PROD_BLOCKED_EXACT_FILES.has(filename)) {
    return res.status(403).send('Acesso negado.');
  }

  // 5. Extensões restritas
  if (PROD_BLOCKED_STATIC_EXTS.some(b => lower.endsWith(b))) {
    return res.status(403).send('Acesso negado.');
  }

  // 6. Arquivos .json que não sejam manifest.json ou plugins autorizados
  if (lower.endsWith('.json') && filename !== 'manifest.json' && !lower.startsWith('/plugins/')) {
    return res.status(403).send('Acesso negado.');
  }

  next();
});

app.use(express.static(DIST_DIR));

// SPA fallback - qualquer rota nǜo encontrada vai para index.html (exceto /api)
app.get(/^(?!\/api).*/, (req, res) => {
  const resolved = path.resolve(DIST_DIR, '.' + (req.path || '/'));
  if (resolved.startsWith(path.resolve(DIST_DIR))) {
    const file = path.join(DIST_DIR, req.path);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.sendFile(file);
    } else {
      res.sendFile(path.join(DIST_DIR, 'index.html'));
    }
  } else {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  }
});

const https = require('https');
const tls = require('tls');
let server;
let serverHttp = null; // HTTP secundário (compatibilidade: clientes antigos / QR http)
let isHttps = false;
let activeCertInfo = null;

// Gerenciamento de certificados (.pfx). A pasta de certificados fica no
// diretório de dados da instalação (AppData no Windows, XDG no Linux), onde é
// gravável. O cert.pfx "legado" na pasta do app (gerado pelo instalador) segue
// como fallback quando não há nenhum ativo configurado.
const CERTS_DIR = path.join(APP_DATA_DIR, 'certs');
const CERTS_CFG = path.join(CERTS_DIR, 'ativo.txt');
const CERT_PASSPHRASE = 'chefcozinha';

function ensureCertsDir() {
  try { if (!fs.existsSync(CERTS_DIR)) fs.mkdirSync(CERTS_DIR, { recursive: true }); } catch (e) { }
}

function getActiveCertConfig() {
  try {
    if (fs.existsSync(CERTS_CFG)) {
      const raw = fs.readFileSync(CERTS_CFG, 'utf8').trim();
      if (raw) {
        const parts = raw.split('|');
        const f = String(parts[0] || '').trim();
        if (f && !f.includes('/') && !f.includes('\\') && !f.includes('..') && fs.existsSync(path.join(CERTS_DIR, f))) {
          return { file: f, passphrase: (parts[1] || CERT_PASSPHRASE).trim() };
        }
      }
    }
  } catch (e) { }
  const legacy = path.join(BASE_DIR, 'cert.pfx');
  if (fs.existsSync(legacy)) {
    return { file: 'cert.pfx', passphrase: CERT_PASSPHRASE, legacy: true };
  }
  return null;
}

function loadCertInfo(cfg) {
  if (!cfg) return null;
  const p = cfg.legacy ? path.join(BASE_DIR, 'cert.pfx') : path.join(CERTS_DIR, cfg.file);
  if (!fs.existsSync(p)) return null;
  try {
    return { pfx: fs.readFileSync(p), passphrase: cfg.passphrase };
  } catch (e) { return null; }
}

function saveActiveCertConfig(file, passphrase) {
  ensureCertsDir();
  fs.writeFileSync(CERTS_CFG, `${file}|${passphrase || CERT_PASSPHRASE}`, 'utf8');
}

// Aplica um certificado. Se o servidor já estiver HTTPS, troca AO VIVO
// (server.setSecureContext) sem derrubar conexões. Se estiver HTTP, salva a
// configuração e exige reinício.
function aplicarCert(cfg) {
  const info = loadCertInfo(cfg);
  if (!info) return { ok: false, erro: 'Arquivo de certificado não encontrado ou inválido.' };
  try {
    const contextOpts = { pfx: info.pfx, passphrase: info.passphrase };
    tls.createSecureContext(contextOpts);
    if (server && isHttps && typeof server.setSecureContext === 'function') {
      server.setSecureContext(contextOpts);
      activeCertInfo = { file: cfg.file, passphrase: cfg.passphrase, applied: true };
      saveActiveCertConfig(cfg.file, cfg.passphrase);
      return { ok: true, applied: true };
    }
    saveActiveCertConfig(cfg.file, cfg.passphrase);
    activeCertInfo = { file: cfg.file, passphrase: cfg.passphrase, applied: false };
    return { ok: true, applied: false, reiniciar: true };
  } catch (e) {
    return { ok: false, erro: 'Falha ao ler o certificado: ' + (e.message || e) };
  }
}

// Pergunta no início do servidor qual certificado usar. Só pergunta se houver
// terminal (stdin TTY). Caso contrário (systemd, serviço) usa o cert ativo
// persistido em certs/ativo.txt, ou o primeiro da pasta certs/.
function promptCertAtStartup() {
  ensureCertsDir();
  let candidates = [];
  try { candidates = fs.readdirSync(CERTS_DIR).filter(f => /\.(pfx|p12)$/i.test(f)); } catch (e) { }
  candidates.sort();
  const legacyPfx = path.join(BASE_DIR, 'cert.pfx');
  if (fs.existsSync(legacyPfx) && !candidates.includes('cert.pfx')) candidates.unshift('cert.pfx');
  if (candidates.length === 0) return null;

  let active = getActiveCertConfig();
  if (active && !candidates.includes(active.file)) active = null;
  let chosenFile = active ? active.file : candidates[0];

  if (process.stdin.isTTY === true) {
    console.log('');
    console.log('==========================================');
    console.log(' Escolha o certificado SSL desta sessão:');
    candidates.forEach((f, i) => {
      const mark = active && active.file === f ? ' [ATIVO]' : '';
      console.log('   ' + (i + 1) + ') ' + f + mark);
    });
    const def = active ? candidates.indexOf(active.file) + 1 : 1;
    console.log(' (Enter para manter: ' + def + ')');
    process.stdout.write('> ');
    let input = '';
    try {
      const buf = Buffer.alloc(256);
      let bytes;
      while ((bytes = fs.readSync(0, buf, 0, buf.length, null)) > 0) {
        const s = buf.toString('utf8', 0, bytes);
        input += s;
        if (s.indexOf('\n') !== -1 || s.indexOf('\r') !== -1) break;
      }
    } catch (e) { input = ''; }
    input = input.trim();
    let idx = parseInt(input, 10);
    if (input === '' || isNaN(idx)) idx = def;
    if (idx < 1 || idx > candidates.length) idx = def;
    chosenFile = candidates[idx - 1];
  }

  let passphrase = CERT_PASSPHRASE;
  if (active && active.file === chosenFile) passphrase = active.passphrase;
  return { file: chosenFile, passphrase };
}

const activeCertConfig = promptCertAtStartup();
const activeCertLoaded = activeCertConfig ? loadCertInfo(activeCertConfig) : null;
if (activeCertLoaded) {
  try {
    server = https.createServer({ pfx: activeCertLoaded.pfx, passphrase: activeCertLoaded.passphrase }, app);
    serverHttp = http.createServer(app);
    isHttps = true;
    activeCertInfo = { file: activeCertConfig.file, passphrase: activeCertConfig.passphrase, applied: true };
    saveActiveCertConfig(activeCertConfig.file, activeCertConfig.passphrase);
  } catch (e) {
    console.error("Erro ao carregar SSL, caindo para HTTP", e);
    server = http.createServer(app);
  }
} else {
  server = http.createServer(app);
}
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });
if (serverHttp) io.attach(serverHttp);

// Protocolo efetivo da instalação (HTTPS quando há cert ativo).
// O sync-prod.js corta a seção do server.js onde PROTOCOL é definido, então o
// executável empacotado precisa deste símbolo aqui no header.
const PROTOCOL = isHttps ? 'https' : 'http';

// ---------- DATABASE ----------
let db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error('Erro ao abrir BD:', err);
  else console.log('BD SQLite conectado:', DB_PATH);
});

// ── NOTIFICAÇÕES PUSH (Web Push API) ──
const webpush = require('web-push');
const VAPID_PUBLIC_KEY = 'BCaA01Z--nSI2tJaXLNEf_mlW959ex1fW7x-jAH1tYSEqVYemjVApDllzr1jpwQqB_nlyjX3GIRb9uEyP_IUuRI';
const VAPID_PRIVATE_KEY = '3Jo6x74iIdc7-YUIFTpbxflkElTMTn-OpKTBvvyCVNQ';
try {
  webpush.setVapidDetails(
    'mailto:notificacoes@chefcozinha.local',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
} catch (e) {
  console.error('Erro ao configurar web-push:', e);
}

// Envia push para todos os dispositivos cadastrados de um papel (garcom/cozinha)
async function sendPush(role, title, body, tag, url) {
  const subscricoes = await new Promise((resolve) => {
    db.all(`SELECT endpoint, auth, p256dh FROM push_subscriptions WHERE role = ?`, [role], (err, rows) => {
      if (err) return resolve([]);
      resolve(rows || []);
    });
  });
  if (!subscricoes.length) return;
  const payload = JSON.stringify({ title, body, tag: tag || 'comanda', url: url || '/garcom.html' });
  await Promise.all(subscricoes.map(async (sub) => {
    if (!sub.endpoint || !sub.auth || !sub.p256dh) return;
    try {
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: { auth: sub.auth, p256dh: sub.p256dh }
      }, payload);
    } catch (e) {
      if (e && (e.statusCode === 404 || e.statusCode === 410)) {
        db.run(`DELETE FROM push_subscriptions WHERE endpoint = ?`, [sub.endpoint], () => { });
      } else {
        console.error('Erro ao enviar push:', e.statusCode || e.message);
      }
    }
  }));
}

// ══════════════════════════════════════════════════════════════════════════
// BLOCO REMOTO (compilado junto com o tail do server.js):
// Suprimento dos símbolos que o refactor multi-tenant moveu para o head do
// server.js (antes do db.serialize) e que o executável empacotado também
// precisa — autenticação local, seed do instalador e fila de sincronização
// offline → hub do super admin.
// ══════════════════════════════════════════════════════════════════════════
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
let bcrypt;
try {
  bcrypt = require('bcrypt');
} catch (e) {
  // pkg: o prebuild do bcrypt não fica no snapshot; carregar bcrypt.node que
  // é copiado para junto do .exe (build-installer.ps1 + setup.iss).
  const bcryptNativePath = path.join(BASE_DIR, 'bcrypt.node');
  if (!fs.existsSync(bcryptNativePath)) throw e;
  const bindings = require(bcryptNativePath);
  bcrypt = {
    genSaltSync(rounds, minor) {
      if (!rounds) rounds = 10;
      return bindings.gen_salt_sync(minor || 'b', rounds, crypto.randomBytes(16));
    },
    genSalt(rounds, minor, cb) {
      if (typeof rounds === 'function') { cb = rounds; rounds = 10; minor = 'b'; }
      else if (typeof minor === 'function') { cb = minor; minor = 'b'; }
      if (!cb) return Promise.resolve(bcrypt.genSaltSync(rounds || 10));
      process.nextTick(() => { try { cb(null, bcrypt.genSaltSync(rounds || 10)); } catch (err) { cb(err); } });
    },
    hashSync(data, salt) {
      if (data == null || salt == null) throw new Error('data and salt arguments required');
      if (typeof salt === 'number') salt = bcrypt.genSaltSync(salt);
      return bindings.encrypt_sync(String(data), salt);
    },
    hash(data, salt, cb) {
      if (typeof salt === 'function') { cb = salt; salt = 10; }
      if (!cb) return Promise.resolve(bcrypt.hashSync(data, salt));
      process.nextTick(() => { try { cb(null, bcrypt.hashSync(data, salt)); } catch (err) { cb(err); } });
    },
    compareSync(data, hash) {
      if (data == null || hash == null) throw new Error('data and hash arguments required');
      return !!bindings.compare_sync(String(data), hash);
    },
    compare(data, hash, cb) {
      if (typeof hash === 'function') { cb = hash; hash = undefined; }
      if (!cb) return Promise.resolve(bcrypt.compareSync(data, hash));
      process.nextTick(() => { try { cb(null, bcrypt.compareSync(data, hash)); } catch (err) { cb(err); } });
    },
    getRounds(hash) { return bindings.get_rounds(hash); }
  };
}
const tenantContext = new (require('async_hooks').AsyncLocalStorage)();
const fsSync = fs;

function isBcryptHash(v) { return typeof v === 'string' && /^\$2[aby]\$/.test(v); }

function funcionarioPublico(row) {
  if (!row) return row;
  const { senha, ...rest } = row;
  return rest;
}

function verificarSenhaFuncionario(row, senha) {
  const s = String(senha || '').trim();
  const dbSenha = String(row ? row.senha : '').trim();
  if (isBcryptHash(row.senha)) {
    return bcrypt.compare(s, row.senha);
  }
  if (s && s === dbSenha) {
    bcrypt.hash(s, 10).then(h => {
      db.run(`UPDATE funcionarios SET senha = ? WHERE id = ?`, [h, row.id]);
    }).catch(() => { });
    return Promise.resolve(true);
  }
  return Promise.resolve(false);
}

function parseNfceHtml(html) {
  const itens = [];
  if (!html || typeof html !== 'string') return itens;

  const rows = html.split(/<tr[^>]*>/i);
  rows.forEach((rowHtml) => {
    if (!rowHtml) return;
    const cells = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let m;
    while ((m = tdRe.exec(rowHtml)) !== null) {
      cells.push(m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    }
    if (cells.length < 3) return;

    let desc = '';
    let quantidade = 0;
    let valorUnit = 0;
    const numericos = [];
    cells.forEach((c, idx) => {
      const clean = String(c).replace(/\./g, '').replace(',', '.');
      if (/^[\d.,]+$/.test(c) && /^\d/.test(c) && !isNaN(parseFloat(clean))) {
        numericos.push({ idx, val: parseFloat(clean) });
      }
    });

    let unitIdx = -1;
    cells.forEach((c, idx) => {
      if (/^(UN|UNID|UNIDADE|KG|G|GR|L|ML|LT|CX|CXA|PCT|PC|DZ|CAIXA|PESO)$/i.test(c.trim())) unitIdx = idx;
    });

    cells.forEach((c, idx) => {
      const t = String(c).trim();
      if (!t || t.length < 3) return;
      if (/^(item|código|codigo|descri|ncm|cfop|un|qtd|quantidade|valor|total|subtotal|tributos|bebida|informa)/i.test(t.replace('ç', 'c'))) return;
      if (/[a-zà-ú]/i.test(t) && t.length > desc.length && !/R\$\s*[\d.,]+$/i.test(t)) desc = t;
    });

    if (!desc || desc.length > 140 || !/[a-zà-ú]/i.test(desc)) return;

    if (unitIdx > -1 && numericos.length) {
      const q = numericos.find(n => n.idx < unitIdx);
      const v = numericos.find(n => n.idx > unitIdx);
      if (q) quantidade = q.val;
      if (v) valorUnit = v.val;
    }
    if (quantidade === 0 && numericos.length === 2) {
      quantidade = numericos[0].val;
      valorUnit = numericos[1].val;
    }
    if (quantidade === 0 && numericos.length > 2) {
      quantidade = numericos[0].val;
      valorUnit = numericos[1].val;
    }

    if (quantidade > 0) {
      const nome = desc.replace(/^\d{1,4}\s+/, '').trim();
      if (nome) itens.push({ nome, quantidade, valor_unitario: valorUnit });
    }
  });

  // Remove duplicados óbvios (mesmo nome + quantidade + valor)
  const vistos = new Set();
  const unicos = [];
  itens.forEach(it => {
    const k = `${it.nome}|${it.quantidade}|${it.valor_unitario}`;
    if (!vistos.has(k)) { vistos.add(k); unicos.push(it); }
  });
  return unicos;
}

const ifoodApi = require('./ifood-integration');

function getTenantDb() { return db; }

// (Segurança) Chaves JWT: nunca fixas no código-fonte. Usam env vars quando
// definidas; caso contrário, uma chave aleatória é gerada e persistida uma única
// vez em %APPDATA%\ChefCozinha\.secret-<nome>.
function loadOrCreateSecret(name) {
  const dir = getDataDir();
  const file = path.join(dir, `.secret-${name}`);
  try {
    if (fsSync.existsSync(file)) {
      const val = fsSync.readFileSync(file, 'utf8').trim();
      if (val) return val;
    }
    fsSync.mkdirSync(dir, { recursive: true });
    const val = crypto.randomBytes(32).toString('hex');
    fsSync.writeFileSync(file, val, { mode: 0o600, encoding: 'utf8' });
    return val;
  } catch (e) {
    return crypto.randomBytes(32).toString('hex');
  }
}

const JWT_SECRET = process.env.JWT_SECRET || loadOrCreateSecret('jwt');

const restRateLimit = new Map();
// (Segurança) IP real da conexão. O header 'x-forwarded-for' só é confiado a um
// proxy (express trust proxy) — nunca direto do cliente, senão o rate limit é
// contornável forjando o header. Sem proxy, usa o endereço do socket.
function getClientIp(req) {
  if (app.get('trust proxy')) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return String(forwarded).split(',')[0].trim().replace('::ffff:', '');
  }
  const raw = (req.socket && req.socket.remoteAddress) || req.ip || '127.0.0.1';
  return String(raw).split(',')[0].trim().replace('::ffff:', '');
}
function checkRestRateLimit(ip, max = 10, windowMs = 600000) {
  const now = Date.now();
  const key = ip || 'unknown';
  const recent = (restRateLimit.get(key) || []).filter(t => now - t < windowMs);
  if (recent.length >= max) return false;
  recent.push(now);
  restRateLimit.set(key, recent);
  // (Segurança) Evita crescimento sem limite do Map com IPs forjados/volumosos.
  if (restRateLimit.size > 5000) {
    for (const [k, arr] of restRateLimit) {
      const alive = (arr || []).filter(t => now - t < windowMs);
      if (!alive.length) restRateLimit.delete(k);
    }
  }
  return true;
}

function trimStr(v, maxLen = 500) { return typeof v === 'string' ? v.trim().substring(0, maxLen) : ''; }
function safeFloat(v, min = -Infinity, max = Infinity) { const n = parseFloat(v); return isNaN(n) ? 0 : Math.max(min, Math.min(max, n)); }
function safeInt(v, min = 0, max = 2147483647) { const n = parseInt(v, 10); return isNaN(n) ? min : Math.max(min, Math.min(max, n)); }
function isValidId(v) { const n = Number(v); return Number.isInteger(n) && n > 0; }

// Banco local de autenticação/licença da instalação: usuários, licenças,
// telemetria e fila de sincronização com o hub do super admin.
const MASTER_DB_PATH = path.join(APP_DATA_DIR, 'master.sqlite');
const masterDb = new sqlite3.Database(MASTER_DB_PATH);
masterDb.serialize(() => {
  masterDb.run(`CREATE TABLE IF NOT EXISTS configuracoes_global (chave TEXT PRIMARY KEY, valor TEXT)`);
  masterDb.run(`CREATE TABLE IF NOT EXISTS ifood_app_config (chave TEXT PRIMARY KEY, valor TEXT)`);
  masterDb.run(`CREATE TABLE IF NOT EXISTS restaurantes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT,
    licenca TEXT,
    ativo BOOLEAN DEFAULT true,
    data_cadastro DATETIME DEFAULT (datetime('now', 'localtime'))
  )`);
  masterDb.run(`ALTER TABLE restaurantes ADD COLUMN login_mode TEXT DEFAULT 'multi'`, err => { if (err) {} });
  masterDb.run(`ALTER TABLE restaurantes ADD COLUMN chave_ativacao TEXT`, err => { if (err) {} });
  masterDb.run(`ALTER TABLE restaurantes ADD COLUMN validade_licenca TEXT`, err => { if (err) {} });
  masterDb.run(`ALTER TABLE restaurantes ADD COLUMN max_dispositivos INTEGER DEFAULT 0`, err => { if (err) {} });
  masterDb.run(`CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurante_id INTEGER,
    username TEXT UNIQUE,
    password_hash TEXT,
    role TEXT,
    ativo BOOLEAN DEFAULT true,
    data_cadastro DATETIME DEFAULT (datetime('now', 'localtime'))
  )`);
  masterDb.run(`INSERT OR IGNORE INTO restaurantes (id, nome, licenca, ativo) VALUES (1, 'Estabelecimento', 'ativo', 1)`);
  masterDb.run(`UPDATE restaurantes SET licenca = 'ativo', ativo = 1 WHERE id = 1`);
  masterDb.run(`CREATE TABLE IF NOT EXISTS licencas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chave TEXT UNIQUE,
    restaurante_nome TEXT,
    plano TEXT DEFAULT 'premium',
    dias INTEGER DEFAULT 365,
    validade TEXT,
    max_dispositivos INTEGER DEFAULT 0,
    obs TEXT,
    status TEXT DEFAULT 'disponivel',
    criada_em DATETIME DEFAULT (datetime('now', 'localtime')),
    usada_em DATETIME,
    usada_por TEXT,
    install_id TEXT
  )`);
  masterDb.run(`CREATE TABLE IF NOT EXISTS telemetria (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurante_id INTEGER,
    install_id TEXT,
    nome_restaurante TEXT,
    versao TEXT,
    ip TEXT,
    plataforma TEXT,
    online INTEGER DEFAULT 0,
    ultima_atividade DATETIME,
    tempo_uso_min INTEGER DEFAULT 0,
    pedidos_total INTEGER DEFAULT 0,
    vendas_total REAL DEFAULT 0,
    vendas_hoje REAL DEFAULT 0,
    comandas_abertas INTEGER DEFAULT 0,
    funcionarios_ativos INTEGER DEFAULT 0,
    garcons_online INTEGER DEFAULT 0,
    produtos_total INTEGER DEFAULT 0,
    setores_json TEXT,
    mesas_total INTEGER DEFAULT 0,
    dispositivos INTEGER DEFAULT 0,
    funcoes_json TEXT,
    erros_json TEXT,
    custo_total REAL DEFAULT 0,
    folha_mes REAL DEFAULT 0,
    despesas_mes REAL DEFAULT 0,
    lucro REAL DEFAULT 0,
    disco_mb REAL DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now', 'localtime')),
    updated_at DATETIME
  )`);
  masterDb.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_telemetria_install ON telemetria (install_id)`);
  masterDb.run(`ALTER TABLE telemetria ADD COLUMN admin_login TEXT`, err => { if (err) {} });
  masterDb.run(`ALTER TABLE telemetria ADD COLUMN chave_ativacao TEXT`, err => { if (err) {} });
  masterDb.run(`CREATE TABLE IF NOT EXISTS sync_fila (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,
    install_id TEXT,
    payload TEXT NOT NULL,
    tentativas INTEGER DEFAULT 0,
    proxima_tentativa DATETIME DEFAULT (datetime('now', 'localtime')),
    criado_em DATETIME DEFAULT (datetime('now', 'localtime')),
    sincronizado_em DATETIME
  )`);
});

// (Segurança) Verifica a senha do usuário admin local (tabela usuarios do
// masterDb). Mantida aqui porque o sync-prod.js corta a seção do server.js
// anterior ao db.serialize, onde a função original fica definida.
function verificarSenhaAdmin(senha) {
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
}

// ════════════ SUPER ADMIN LOCAL (login + gerenciamento de certificados) ════════════
async function superAdminAuth(req, res, next) {
  const tokenHeader = req.headers['x-super-admin-token'] || req.query.adminToken;
  if (tokenHeader) {
    try {
      const decoded = jwt.verify(tokenHeader, JWT_SECRET);
      if (decoded && decoded.role === 'super_admin_local') {
        req.superAdmin = decoded;
        return next();
      }
    } catch (e) { }
  }
  return res.json({ ok: false, erro: 'Acesso não autorizado. Autentique-se novamente.' });
}

// Anti-brute-force: max 5 senhas erradas por IP a cada 15 min
const loginAttempts = new Map();
function loginBloqueado(ip) {
  const rec = loginAttempts.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.inicio > 15 * 60 * 1000) { loginAttempts.delete(ip); return false; }
  return rec.falhas >= 5;
}
function registrarFalhaLogin(ip) {
  const rec = loginAttempts.get(ip);
  if (!rec || Date.now() - rec.inicio > 15 * 60 * 1000) {
    loginAttempts.set(ip, { inicio: Date.now(), falhas: 1 });
  } else {
    rec.falhas++;
  }
}

app.post('/api/super/login-local', async (req, res) => {
  const rawIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1').replace('::ffff:', '');
  if (loginBloqueado(rawIp)) {
    return res.status(429).json({ ok: false, erro: 'Muitas tentativas. Aguarde 15 minutos.' });
  }
  const senha = req.body && req.body.senha;
  const ok = await verificarSenhaAdmin(senha);
  if (!ok) {
    registrarFalhaLogin(rawIp);
    return res.json({ ok: false, erro: 'Senha de administrador inválida.' });
  }
  loginAttempts.delete(rawIp);
  const token = jwt.sign({ role: 'super_admin_local', restaurante_id: 1 }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ ok: true, token });
});

// Tema Global: salva config e propaga em tempo real
app.post('/api/super/theme-custom', superAdminAuth, (req, res) => {
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
app.get('/api/public/theme', (req, res) => {
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

app.get('/api/super/certs', superAdminAuth, (req, res) => {
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
  const ativo = activeCertInfo ? activeCertInfo.file : (isHttps ? 'cert.pfx (legado)' : null);
  res.json({ ok: true, certs, ativo, isHttps, reiniciarNecessario: activeCertInfo && activeCertInfo.applied === false });
});

app.post('/api/super/certs/upload', superAdminAuth, upload.single('cert'), (req, res) => {
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

app.post('/api/super/certs/ativar', superAdminAuth, (req, res) => {
  const file = String((req.body && req.body.file) || '').replace(/^.*[\\/]/, '').trim();
  if (!file || file.includes('..') || file.includes('/') || file.includes('\\')) {
    return res.json({ ok: false, erro: 'Nome de arquivo inválido.' });
  }
  if (!/\.(pfx|p12)$/i.test(file)) return res.json({ ok: false, erro: 'Extensão inválida.' });
  if (!fs.existsSync(path.join(CERTS_DIR, file))) return res.json({ ok: false, erro: 'Arquivo não encontrado na pasta certs.' });
  const passphrase = (req.body && req.body.passphrase) ? String(req.body.passphrase) : CERT_PASSPHRASE;
  res.json(aplicarCert({ file, passphrase }));
});

app.delete('/api/super/certs/:file', superAdminAuth, (req, res) => {
  const file = String(req.params.file || '').replace(/^.*[\\/]/, '').trim();
  if (!file || file.includes('..') || file.includes('/') || file.includes('\\')) return res.json({ ok: false, erro: 'Nome inválido.' });
  if (activeCertInfo && activeCertInfo.file === file) return res.json({ ok: false, erro: 'Não é possível remover o certificado em uso. Ative outro primeiro.' });
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

function getTenantDbPath(tenantId) {
  return path.join(APP_DATA_DIR, 'estabelecimentos', String(tenantId), 'database.sqlite');
}

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
// Endpoint exclusivo do super admin: operadores do shell (&, |, >, aspas,
// parenteses) sao necessarios para os comandos rapidos do terminal.
const CMD_DENY_CHARS = /[\r\n\0]/;

app.post('/api/super/exec', superAdminAuth, (req, res) => {
  const { command } = req.body;
  if (!command || typeof command !== 'string') return res.json({ ok: false, erro: 'Comando obrigatorio.' });
  if (command.length > 300) return res.json({ ok: false, erro: 'Comando muito longo (max 300 chars).' });
  if (CMD_DENY_CHARS.test(command)) return res.json({ ok: false, erro: 'Comando invalido.' });
  if (CMD_BLOCKLIST.some(rx => rx.test(command))) return res.json({ ok: false, erro: 'Comando bloqueado por seguranca.' });

  // Allowlist com comandos Windows e Linux usados na administracao do servidor
  const allowedCmds = /^(ls|cat|head|tail|wc|df|du|free|uptime|ps|top|netstat|ss|ip|ifconfig|ping|host|dig|nslookup|date|pwd|whoami|id|env|printenv|node|npm|npx|pm2|sqlite3|git|docker|dir|type|echo|tasklist|taskkill|systeminfo|wmic|ipconfig|hostname|ver|where|findstr|find|sc|net|cd|chdir|vol|driverquery|getmac|openfiles|quser|query|reg|wevtutil|powercfg|schtasks)\b/;
  if (!allowedCmds.test(command.trim())) {
    return res.json({ ok: false, erro: 'Comando nao esta na lista de permitidos. Permitidos: dir, type, tasklist, systeminfo, netstat, ipconfig, node, npm, pm2, sqlite3, git, docker...' });
  }

  console.log(`[SuperAdmin Exec] ${req.superAdmin?.role || 'admin'}: ${command.substring(0, 200)}`);
  exec(command, { cwd: __dirname, timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
    const out = (stdout || '').substring(0, 10000);
    const err = (stderr || '').substring(0, 5000);
    res.json({ ok: !error, stdout: out, stderr: err, exitCode: error ? (error.code || 1) : 0, command: command.substring(0, 300) });
  });
});
// ─── FEATURES POR TENANT + HELPERS DE BANCOS (portados do dev) ───
const featurePlans = require('./feature-plans');
const tenantFeatures = new Map();
const tenantSocketCounts = new Map();
const TENANT_FEATURES_REFRESH_MS = 30000;

function getTenantDbPath(tenantId) {
  return path.join(__dirname, `database_${tenantId}.sqlite`);
}

function listarBancosTenant() {
  try {
    return fsSync.readdirSync(__dirname)
      .filter(f => /^database_(\d+)\.sqlite$/.test(f))
      .map(f => path.join(__dirname, f))
      .filter(p => fsSync.existsSync(p));
  } catch (e) { return []; }
}

function safeInt(v, min = 0, max = 2147483647) { const n = parseInt(v, 10); return isNaN(n) ? min : Math.max(min, Math.min(max, n)); }

// Recarrega o snapshot de features de todos os tenants (sincrono depois disso)
function loadAllTenantFeatures() {
  return new Promise((resolve) => {
    masterDb.all(`SELECT id, licenca FROM restaurantes`, [], (err, rests) => {
      masterDb.all(`SELECT restaurante_id, overrides_json FROM tenant_features`, [], (err2, ovs) => {
        const ovMap = {};
        (ovs || []).forEach((o) => {
          try { ovMap[o.restaurante_id] = JSON.parse(o.overrides_json) || {}; } catch (e) { ovMap[o.restaurante_id] = {}; }
        });
        const map = new Map();
        (rests || []).forEach((r) => {
          map.set(r.id, featurePlans.resolveFeatures(r.licenca, ovMap[r.id]));
        });
        tenantFeatures.clear();
        map.forEach((f, tid) => tenantFeatures.set(tid, f));
        resolve();
      });
    });
  });
}

function getTenantFeaturesSync(tid) {
  return tenantFeatures.get(tid) || featurePlans.getPlanDefaults('premium');
}

function isTenantFeatureEnabled(tid, feature) {
  const f = tenantFeatures.get(tid);
  if (!f) return true;
  return !!f[feature];
}

// ─── BLOCO PORTADO DA REGIÃO PRÉ-CORTE DO DEV (sync-prod descarta essa parte) ───
function celebrarNovoRestaurante(nome, id, dono) {
  const frames = ['🎉', '🎊', '✨', '🏆', '🌟', '🎆', '🎇'];
  let f = 0;
  const spinner = setInterval(() => {
    process.stdout.write(`\r  ${frames[f % frames.length]}  Processando novo cliente... `);
    f++;
  }, 120);

  setTimeout(() => {
    clearInterval(spinner);
    process.stdout.write('\r\x1b[2K\r');

    const ts = new Date().toLocaleTimeString('pt-BR');
    const banner = [
      '',
      `${ANSI.yellow}${ANSI.bright}  ╔══════════════════════════════════════════════════╗${ANSI.reset}`,
      `${ANSI.yellow}${ANSI.bright}  ║   🏆  NOVO RESTAURANTE CADASTRADO  🏆            ║${ANSI.reset}`,
      `${ANSI.yellow}${ANSI.bright}  ╠══════════════════════════════════════════════════╣${ANSI.reset}`,
      `${ANSI.yellow}  ║${ANSI.reset}  ${ANSI.cyan}🏪 Nome:${ANSI.reset}   ${ANSI.bright}${nome}${ANSI.reset}`,
      `${ANSI.yellow}  ║${ANSI.reset}  ${ANSI.green}🆔 ID:${ANSI.reset}     #${id}`,
      dono ? `${ANSI.yellow}  ║${ANSI.reset}  ${ANSI.magenta}👤 Dono:${ANSI.reset}   ${dono}` : null,
      `${ANSI.yellow}  ║${ANSI.reset}  ${ANSI.dim}🕐 Hora:${ANSI.reset}   ${ts}`,
      `${ANSI.yellow}${ANSI.bright}  ╚══════════════════════════════════════════════════╝${ANSI.reset}`,
      `  ${ANSI.green}${ANSI.bright}🎊 Bem-vindo ao ecossistema Chef Cozinha SaaS! 🎊${ANSI.reset}`,
      '',
    ].filter(Boolean).join('\n');

    originalLog.apply(console, [banner]);

    // Confete ASCII
    const confete = '  ✦ ★ ✦ ★ ✦ ★ ✦ ★ ✦ ★ ✦ ★ ✦ ★ ✦ ★ ✦ ★ ✦ ★ ✦';
    let c = 0;
    const rain = setInterval(() => {
      c++;
      const colors = [ANSI.yellow, ANSI.cyan, ANSI.magenta, ANSI.green];
      const col = colors[c % colors.length];
      process.stdout.write(`\r${col}${confete}${ANSI.reset}`);
      if (c >= 10) {
        clearInterval(rain);
        process.stdout.write('\r\x1b[2K\r');
        originalLog.apply(console, [`${ANSI.dim}────────────────────────────────────────────────────────${ANSI.reset}`]);
      }
    }, 150);
  }, 800);
}


const ANSI = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  white: "\x1b[37m",
  bgBlue: "\x1b[44m\x1b[37m",
  bgCyan: "\x1b[46m\x1b[30m",
  bgMagenta: "\x1b[45m\x1b[37m",
  bgGreen: "\x1b[42m\x1b[30m"
};



const serverStartTime = Date.now();
function getEfficiencyStars() {
  const memRssMb = process.memoryUsage().rss / (1024 * 1024);
  if (memRssMb < 150) return "⭐⭐⭐⭐⭐ [100% EXCELENTE]";
  if (memRssMb < 300) return "⭐⭐⭐⭐ [95% ÓTIMO]";
  if (memRssMb < 500) return "⭐⭐⭐ [85% BOM]";
  return "⭐⭐ [ATENÇÃO RESTRIÇÃO]";
}

function localizarFuncionarioLogin(usuario, cb) {
  const q = `SELECT * FROM funcionarios WHERE LOWER(TRIM(usuario)) = LOWER(TRIM(?)) OR LOWER(TRIM(nome)) = LOWER(TRIM(?))`;
  db.get(q, [usuario, usuario], (err, row) => {
    if (!err && row) {
      if (!row.restaurante_id) row.restaurante_id = tenantContext.getStore() || 1;
      return cb(row);
    }
    masterDb.all(`SELECT id FROM restaurantes WHERE ativo = 1`, [], (e, rests) => {
      if (e || !rests || !rests.length) return cb(null);
      let i = 0;
      const atual = tenantContext.getStore() || 1;
      const next = () => {
        while (i < rests.length) {
          const tid = parseInt(rests[i++].id, 10);
          if (!Number.isFinite(tid) || tid <= 0 || tid === atual) continue;
          const dbPath = path.join(__dirname, `database_${tid}.sqlite`);
          if (!fsSync.existsSync(dbPath)) continue;
          const tdb = new sqlite3.Database(dbPath);
          tdb.get(q, [usuario, usuario], (e2, row2) => {
            tdb.close();
            if (!e2 && row2) {
              if (!row2.restaurante_id) row2.restaurante_id = tid;
              return cb(row2);
            }
            next();
          });
          return;
        }
        cb(null);
      };
      next();
    });
  });
}

let BASE_DOMAIN = (process.env.BASE_DOMAIN || 'chefcozinha.com.br').toLowerCase();
const domainMap = new Map(); // custom_domain → tenant_id
const slugMap = new Map();   // slug → tenant_id
let domainMapLoaded = false;

function loadDomainMaps() {
  return new Promise((resolve) => {
    masterDb.all(`SELECT id, slug, custom_domain FROM restaurantes WHERE ativo = 1`, [], (err, rows) => {
      if (err) return resolve();
      domainMap.clear();
      slugMap.clear();
      (rows || []).forEach(r => {
        if (r.custom_domain && r.custom_domain.trim()) {
          domainMap.set(r.custom_domain.trim().toLowerCase(), r.id);
        }
        if (r.slug && r.slug.trim()) {
          slugMap.set(r.slug.trim().toLowerCase(), r.id);
        }
      });
      domainMapLoaded = true;
      resolve();
    });
  });
}

function metricAddSocket(socket) {
  if (socket._metricCounted) return;
  socket._metricCounted = true;
  const tid = socket.restaurante_id || 1;
  tenantSocketCounts.set(tid, (tenantSocketCounts.get(tid) || 0) + 1);
}
function metricRemoveSocket(socket) {
  if (!socket._metricCounted) return;
  socket._metricCounted = false;
  const tid = socket.restaurante_id || 1;
  const c = (tenantSocketCounts.get(tid) || 1) - 1;
  if (c <= 0) tenantSocketCounts.delete(tid);
  else tenantSocketCounts.set(tid, c);
}
function metricSocketCount(tid) {
  return tenantSocketCounts.get(tid) || 0;
}

function getLocalDateStr(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Amostra o pico de sockets por tenant/hora e persiste no masterDb
function samplePicos() {
  const now = new Date();
  const dia = getLocalDateStr(now);
  const hora = now.getHours();
  tenantSocketCounts.forEach((count, tid) => {
    masterDb.run(
      `INSERT INTO metrica_picos (restaurante_id, dia, hora, sockets) VALUES (?, ?, ?, ?)
       ON CONFLICT(restaurante_id, dia, hora) DO UPDATE SET sockets = MAX(sockets, excluded.sockets)`,
      [tid, dia, hora, count]
    );
  });
}

function seedTenantDb(db, restauranteNome, done) {
  const onErr = (e) => { if (e) console.error('[Seed] Erro:', e.message); };
  db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS afiliados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      telefone TEXT,
      codigo_ref TEXT UNIQUE NOT NULL,
      comissao_percentual REAL DEFAULT 10,
      chave_pix TEXT,
      status TEXT DEFAULT 'ativo',
      password_hash TEXT,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS afiliado_vendas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      afiliado_id INTEGER NOT NULL,
      restaurante_id INTEGER,
      restaurante_nome TEXT,
      plano TEXT,
      valor_venda REAL DEFAULT 0,
      comissao_valor REAL DEFAULT 0,
      status TEXT DEFAULT 'pendente',
      created_at DATETIME DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (afiliado_id) REFERENCES afiliados(id)
    )
  `);

    for (let i = 1; i <= 6; i++) {
      db.run(`INSERT OR IGNORE INTO mesas (nome, status, observacao) VALUES (?, 'Disponível', NULL)`, ['Mesa ' + i], onErr);
    }
    if (restauranteNome) {
      db.run(`INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('nome_restaurante', ?)`, [restauranteNome], onErr);
    }
    const defaultMethods = [
      ['Dinheiro', 'dinheiro', 0.0, 0, 1, 'ph-currency-dollar', 1],
      ['Cartão de Crédito', 'credito', 2.5, 30, 1, 'ph-credit-card', 2],
      ['Cartão de Débito', 'debito', 1.2, 1, 1, 'ph-credit-card', 3],
      ['PIX', 'pix', 0.0, 0, 1, 'ph-qr-code', 4]
    ];
    db.get('SELECT COUNT(*) as c FROM formas_pagamento', [], (e, r) => {
      if (!e && r && r.c === 0) {
        const q = 'INSERT INTO formas_pagamento (nome, tipo, taxa, prazo_dias, ativo, icone, ordem) VALUES (?, ?, ?, ?, ?, ?, ?)';
        defaultMethods.forEach(m => db.run(q, m, onErr));
      }
    });
  }, done || (() => {}));
}

// Cria um banco de tenant novo com schema vazio + dados iniciais (sem copiar database_1.sqlite)
function createFreshTenantDb(dbPath, restauranteNome) {
  return new Promise((resolve) => {
    const newDb = new sqlite3.Database(dbPath, (err) => {
      if (err) { console.error('[Tenant] Erro ao criar banco:', err.message); return resolve(newDb); }
      newDb.run('PRAGMA journal_mode = WAL;');
      newDb.run('PRAGMA synchronous = NORMAL;');
      newDb.run('PRAGMA busy_timeout = 5000;');
      const refPath = path.join(__dirname, 'database_1.sqlite');
      if (fsSync.existsSync(refPath)) {
        syncTenantSchema(newDb, refPath, () => {
          seedTenantDb(newDb, restauranteNome, () => resolve(newDb));
        });
      } else {
        seedTenantDb(newDb, restauranteNome, () => resolve(newDb));
      }
    });
  });
}

function resolveTenantId(req) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.split(' ')[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const tid = parseInt(decoded && decoded.restaurante_id, 10);
      if (Number.isFinite(tid) && tid > 0) return tid;
    } catch (e) { }
  }
  const fromQuery = parseInt(req.query.restaurante_id, 10);
  if (Number.isFinite(fromQuery) && fromQuery > 0) return fromQuery;
  const fromBody = parseInt((req.body || {}).restaurante_id, 10);
  if (Number.isFinite(fromBody) && fromBody > 0) return fromBody;
  return null;
}

function withTenant(req, cb) {
  const tid = resolveTenantId(req);
  if (tid !== null) tenantContext.run(tid, cb);
  else cb();
}


let isMatrixAnimating = false;
let pendingLogs = [];
let tableGames = {};

const deploymentConfig = require('./deployment-config');
const instanceIdentity = require('./instance-identity');

async function verificarPinOuSenha(valor) {
  if (!valor) return false;
  if (await verificarSenhaAdmin(valor)) return true;
  const pinResult = await verificarPinTemporario(valor);
  return pinResult.ok;
}

function verificarPinTemporario(pin) {
  return new Promise((resolve) => {
    if (!pin || typeof pin !== 'string') return resolve({ ok: false });
    const pinUpper = pin.trim().toUpperCase();
    db.get(`SELECT * FROM pins_temporarios WHERE pin = ? AND ativo = 1`, [pinUpper], (err, row) => {
      if (err || !row) return resolve({ ok: false });
      if (row.tipo_expiracao !== 'sessao' && row.expira_em && row.expira_em !== 'SESSION') {
        if (new Date(row.expira_em) < new Date()) return resolve({ ok: false });
      }
      if (row.usos_atual >= row.max_usos) return resolve({ ok: false });
      db.run(`UPDATE pins_temporarios SET usos_atual = usos_atual + 1 WHERE id = ?`, [row.id], () => {});
      resolve({ ok: true, pin: row });
    });
  });
}

// Copiar todo o conteúdo do server.js original a partir da linha dos db.serialize
// (A lógica de tabelas e sockets é idêntica ao server.js de desenvolvimento)
