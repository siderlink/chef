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

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const os = require('os');
const sqlite3 = require('./sqlite3-wrapper').verbose();
const { AsyncLocalStorage } = require('async_hooks');
const tenantContext = new AsyncLocalStorage();
const fsSync = require('fs');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const nfceService = require('./nfce-service');

// SaaS Auth Setup
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const JWT_SECRET = process.env.JWT_SECRET || 'chef-cozinha-saas-super-secret-key';

function verificarSenhaAdmin(senha) {
  return new Promise((resolve) => {
    if (!senha) return resolve(false);
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
}

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


// Carregar configuração da licença e URL do Apps Script antes de importar o license-manager
const LICENSE_CONFIG_FILE = path.join(
  os.homedir(), 'AppData', 'Roaming', 'ChefCozinha', 'license-config.json'
);
try {
  if (fs.existsSync(LICENSE_CONFIG_FILE)) {
    const cfg = JSON.parse(fs.readFileSync(LICENSE_CONFIG_FILE, 'utf8'));
    if (cfg.scriptUrl) process.env.LICENSE_URL = cfg.scriptUrl;
  }
} catch (e) {
  console.error('[Startup] Erro ao carregar URL da licença:', e.message);
}

const licenseManager = require('./license-manager');

// Configure multer for file uploads
const upload = multer({ dest: path.join(__dirname, 'uploads/') });

const app = express();
app.use(cors({
  origin: process.env.CORS_ORIGIN || true,
  credentials: true
}));
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

// --- SAAS MULTI-TENANT SIMULATION ---
app.use((req, res, next) => {
  req.restaurante_id = 1; // Default tenant
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

app.use(express.static(path.join(__dirname, 'dist')));

// Rota do Super Admin
app.get('/super-admin', (req, res) => {
  const distPath = path.join(__dirname, 'dist', 'super-admin.html');
  if (fs.existsSync(distPath)) {
    res.sendFile(distPath);
  } else {
    res.sendFile(path.join(__dirname, 'super-admin.html'));
  }
});

app.get('/super-admin.js', (req, res) => {
  const distPath = path.join(__dirname, 'dist', 'super-admin.js');
  if (fs.existsSync(distPath)) {
    res.sendFile(distPath);
  } else {
    res.sendFile(path.join(__dirname, 'super-admin.js'));
  }
});

app.get('/ativacao', (req, res) => {
  const distPath = path.join(__dirname, 'dist', 'ativacao.html');
  if (fs.existsSync(distPath)) {
    res.sendFile(distPath);
  } else {
    res.sendFile(path.join(__dirname, 'ativacao.html'));
  }
});

app.get('/site', (req, res) => {
  const distPath = path.join(__dirname, 'dist', 'site-vendas.html');
  if (fs.existsSync(distPath)) {
    res.sendFile(distPath);
  } else {
    res.sendFile(path.join(__dirname, 'site-vendas.html'));
  }
});

app.get('/vendas', (req, res) => {
  const distPath = path.join(__dirname, 'dist', 'site-vendas.html');
  if (fs.existsSync(distPath)) {
    res.sendFile(distPath);
  } else {
    res.sendFile(path.join(__dirname, 'site-vendas.html'));
  }
});

app.get('/fidelidade', (req, res) => {
  const distPath = path.join(__dirname, 'dist', 'area-cliente.html');
  if (fs.existsSync(distPath)) {
    res.sendFile(distPath);
  } else {
    res.sendFile(path.join(__dirname, 'area-cliente.html'));
  }
});

app.get('/area-cliente', (req, res) => {
  const distPath = path.join(__dirname, 'dist', 'area-cliente.html');
  if (fs.existsSync(distPath)) {
    res.sendFile(distPath);
  } else {
    res.sendFile(path.join(__dirname, 'area-cliente.html'));
  }
});


const https = require('https');
let server;
let isHttps = false;
const certPath = path.join(__dirname, 'cert.pfx');
try {
  if (fs.existsSync(certPath)) {
    const pfx = fs.readFileSync(certPath);
    server = https.createServer({ pfx, passphrase: 'chefcozinha' }, app);
    isHttps = true;
  } else {
    server = http.createServer(app);
  }
} catch (e) {
  console.error("Erro ao carregar SSL, caindo para HTTP", e);
  server = http.createServer(app);
}
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const mesasFechando = new Set();

let pedidosDebounceTimeout = null;

// Mercado Pago payment tracking (per-connection state would be ideal, but currently global)
let mpCurrentIntentId = null;
let mpCurrentDeviceId = null;

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


// Configure SQLite Database

// --- MULTI-TENANT PROXY DB ---
const masterDb = new sqlite3.Database(path.join(__dirname, 'master.sqlite'));
const tenantDbs = new Map();

function getTenantDb() {
  const tenantId = tenantContext.getStore() || 1;
  if (!tenantDbs.has(tenantId)) {
    const dbPath = path.join(__dirname, `database_${tenantId}.sqlite`);
    
    // Se o banco no existir, copia do template vazio ou do banco 1
    if (!fsSync.existsSync(dbPath)) {
       if (fsSync.existsSync(path.join(__dirname, 'database_1.sqlite'))) {
           fsSync.copyFileSync(path.join(__dirname, 'database_1.sqlite'), dbPath);
       }
    }
    
    const newDb = new sqlite3.Database(dbPath, (err) => {
      if (err) console.error(`Erro ao abrir banco do tenant ${tenantId}:`, err);
    });
    
    // Configura o banco
    newDb.run('PRAGMA journal_mode = WAL;');
    tenantDbs.set(tenantId, newDb);
  }
  return tenantDbs.get(tenantId);
}

const db = {
  run: function(...args) { return getTenantDb().run(...args); },
  all: function(...args) { return getTenantDb().all(...args); },
  get: function(...args) { return getTenantDb().get(...args); },
  serialize: function(cb) { 
      // Executa o serialize no contexto atual
      return getTenantDb().serialize(cb);
  },
  close: function(...args) { return getTenantDb().close(...args); }
};
// ------------------------------


db.serialize(() => {
  db.run('PRAGMA journal_mode = WAL;');

  // Removed DROP TABLE to persist data
  db.run(`
    CREATE TABLE IF NOT EXISTS pedidos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      productName TEXT,
      productEmoji TEXT,
      quantity INTEGER,
      time TEXT,
      localName TEXT,
      userName TEXT,

      total TEXT,
      status TEXT,
      sector TEXT,
      paymentMethod TEXT,
      turno_id INTEGER,
      createdAt DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS qr_pedidos_pendentes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mesa TEXT,
      cliente_nome TEXT,
      itens_json TEXT,
      valor_total REAL,
      pago_pix INTEGER DEFAULT 0,
      chave_pix TEXT,
      status TEXT DEFAULT 'Pendente',
      createdAt DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);
  
  // Safe alter table
  db.run(`ALTER TABLE pedidos ADD COLUMN productEmoji TEXT`, (err) => {});
  db.run(`ALTER TABLE pedidos ADD COLUMN turno_id INTEGER`, (err) => {});
  db.run(`ALTER TABLE pedidos ADD COLUMN cliente_id INTEGER`, (err) => {});
  db.run(`ALTER TABLE pedidos ADD COLUMN entregador_id INTEGER`, (err) => {});
  db.run(`ALTER TABLE pedidos ADD COLUMN promocao_id INTEGER`, (err) => {});
  db.run(`ALTER TABLE pedidos ADD COLUMN mesa_grupo TEXT`, (err) => {});
  db.run(`ALTER TABLE pedidos ADD COLUMN mesa_comanda TEXT`, (err) => {});
  db.run(`ALTER TABLE pedidos ADD COLUMN garcom_call DATETIME`, (err) => {});
  db.run(`ALTER TABLE promocoes ADD COLUMN config TEXT`, (err) => {});

  db.run(`
    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT,
      telefone TEXT,
      observacao TEXT,
      endereco TEXT,
      data_nascimento TEXT,
      pontos INTEGER DEFAULT 0
    )
  `);

  db.run(`ALTER TABLE clientes ADD COLUMN endereco TEXT`, (err) => {});
  db.run(`ALTER TABLE clientes ADD COLUMN data_nascimento TEXT`, (err) => {});
  db.run(`ALTER TABLE clientes ADD COLUMN pontos INTEGER DEFAULT 0`, (err) => {});

  db.run(`
    CREATE TABLE IF NOT EXISTS promocoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT,
      regra TEXT,
      desconto REAL,
      ativo BOOLEAN DEFAULT true,
      config TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS turnos_caixa (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT DEFAULT 'Aberto',
      fundo_troco REAL,
      data_abertura DATETIME DEFAULT (datetime('now', 'localtime')),
      data_fechamento DATETIME
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS movimentacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      turno_id INTEGER,
      tipo TEXT, 
      valor REAL,
      forma_pagamento TEXT,
      descricao TEXT,
      data DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS nfce_notas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id INTEGER,
      localName TEXT,
      cliente_nome TEXT,
      cpf_cnpj TEXT,
      valor_total REAL,
      chave_acesso TEXT,
      numero_nota INTEGER,
      serie INTEGER DEFAULT 1,
      ambiente TEXT DEFAULT 'homologacao',
      status TEXT DEFAULT 'Autorizada',
      protocolo TEXT,
      qr_code_url TEXT,
      xml_content TEXT,
      danfe_html TEXT,
      erros TEXT,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS mesas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT,
      status TEXT DEFAULT 'Disponível',
      observacao TEXT
    )
  `);

  // Correção de codificação histórica para status das mesas
  db.run(`UPDATE mesas SET status = 'Disponível' WHERE status LIKE 'Dispon%' AND status != 'Disponível'`);

  db.run(`
    CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      categoria TEXT,
      nome TEXT,
      preco REAL,
      emoji TEXT,
      hasAddons BOOLEAN DEFAULT false,
      setor TEXT DEFAULT 'Cozinha 1',
      status_inicial TEXT DEFAULT 'Em preparo'
    )
  `);

  db.run(`ALTER TABLE produtos ADD COLUMN setor TEXT DEFAULT 'Cozinha 1'`, (err) => {
    // Ignora o erro se a coluna já existir
  });

  db.run(`ALTER TABLE produtos ADD COLUMN status_inicial TEXT DEFAULT 'Em preparo'`, (err) => {
    // Ignora o erro se a coluna já existir
  });

  db.run(`ALTER TABLE produtos ADD COLUMN status TEXT DEFAULT 'ativo'`, (err) => {
    // Ignora o erro
  });

  db.run(`ALTER TABLE produtos ADD COLUMN estoque REAL DEFAULT 0`, (err) => {
    // Ignora o erro se a coluna já existir
  });

  db.run(`ALTER TABLE produtos ADD COLUMN validade TEXT`, (err) => {
    // Ignora o erro se a coluna já existir
  });

  db.run(`ALTER TABLE produtos ADD COLUMN codigo_barras TEXT`, (err) => {
    // Ignora o erro se a coluna já existir
  });

  db.run(`ALTER TABLE produtos ADD COLUMN categoria_fiscal TEXT DEFAULT 'Alimentacao'`, (err) => {
    // Ignora o erro se a coluna já existir
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS funcionarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT,
      usuario TEXT UNIQUE,
      senha TEXT,
      cargo TEXT,
      login_expires_at TEXT
    )
  `);
  
  db.run(`ALTER TABLE funcionarios ADD COLUMN status TEXT DEFAULT 'Ativo'`, (err) => {});
  db.run(`ALTER TABLE funcionarios ADD COLUMN valor_hora REAL DEFAULT 0`, (err) => {});
  db.run(`ALTER TABLE funcionarios ADD COLUMN tipo_remuneracao TEXT DEFAULT 'hora'`, (err) => {});
  db.run(`ALTER TABLE funcionarios ADD COLUMN valor_dia REAL DEFAULT 0`, (err) => {});
  db.run(`ALTER TABLE funcionarios ADD COLUMN valor_semana REAL DEFAULT 0`, (err) => {});
  db.run(`ALTER TABLE funcionarios ADD COLUMN valor_mes REAL DEFAULT 0`, (err) => {});
  db.run(`ALTER TABLE funcionarios ADD COLUMN chave_pix TEXT`, (err) => {});
  db.run(`ALTER TABLE funcionarios ADD COLUMN cpf TEXT`, (err) => {});
  db.run(`ALTER TABLE funcionarios ADD COLUMN telefone TEXT`, (err) => {});
  db.run(`ALTER TABLE funcionarios ADD COLUMN observacao_rh TEXT`, (err) => {});
  db.run(`ALTER TABLE funcionarios ADD COLUMN login_expires_at TEXT`, (err) => {});

  db.run(`
    CREATE TABLE IF NOT EXISTS pontos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      funcionario_id INTEGER,
      entrada DATETIME,
      saida DATETIME,
      data DATE,
      total_horas REAL DEFAULT 0,
      valor_pagar REAL DEFAULT 0,
      pago BOOLEAN DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS vales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      funcionario_id INTEGER,
      data_pedido TEXT,
      valor REAL,
      status TEXT,
      data_aprovacao TEXT,
      pagamento_id INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS funcionarios_pagamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      funcionario_id INTEGER,
      data_pagamento TEXT,
      valor_bruto REAL,
      total_vales_abatidos REAL,
      total_consumo_abatido REAL,
      valor_liquido REAL,
      observacao TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS historico_logins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      funcionario_id INTEGER,
      funcionario_nome TEXT,
      data_hora DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);

  db.run("CREATE TABLE IF NOT EXISTS cupons (codigo TEXT PRIMARY KEY, itens_json TEXT, usado INTEGER DEFAULT 0, data_criacao DATETIME DEFAULT (datetime('now', 'localtime')))");
  db.run("ALTER TABLE cupons ADD COLUMN validade TEXT", () => {});
  db.run("ALTER TABLE cupons ADD COLUMN dias_horarios_json TEXT", () => {});
  db.run("ALTER TABLE cupons ADD COLUMN valor_tipo TEXT", () => {});
  db.run("ALTER TABLE cupons ADD COLUMN valor REAL", () => {});
  db.run("ALTER TABLE cupons ADD COLUMN limite_usos INTEGER DEFAULT 1", () => {});

  db.run(`
    CREATE TABLE IF NOT EXISTS configuracoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT,
      telefone TEXT,
      observacao TEXT,
      endereco TEXT,
      data_nascimento TEXT,
      pontos INTEGER DEFAULT 0
    )
  `);

  db.run(`ALTER TABLE clientes ADD COLUMN endereco TEXT`, (err) => {});
  db.run(`ALTER TABLE clientes ADD COLUMN data_nascimento TEXT`, (err) => {});
  db.run(`ALTER TABLE clientes ADD COLUMN pontos INTEGER DEFAULT 0`, (err) => {});

  db.run(`
    CREATE TABLE IF NOT EXISTS promocoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT,
      regra TEXT,
      desconto REAL,
      ativo BOOLEAN DEFAULT true,
      config TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS turnos_caixa (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT DEFAULT 'Aberto',
      fundo_troco REAL,
      data_abertura DATETIME DEFAULT (datetime('now', 'localtime')),
      data_fechamento DATETIME
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS movimentacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      turno_id INTEGER,
      tipo TEXT, 
      valor REAL,
      forma_pagamento TEXT,
      descricao TEXT,
      data DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS nfce_notas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id INTEGER,
      localName TEXT,
      cliente_nome TEXT,
      cpf_cnpj TEXT,
      valor_total REAL,
      chave_acesso TEXT,
      numero_nota INTEGER,
      serie INTEGER DEFAULT 1,
      ambiente TEXT DEFAULT 'homologacao',
      status TEXT DEFAULT 'Autorizada',
      protocolo TEXT,
      qr_code_url TEXT,
      xml_content TEXT,
      danfe_html TEXT,
      erros TEXT,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS mesas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT,
      status TEXT DEFAULT 'Disponível',
      observacao TEXT
    )
  `);

  // Correção de codificação histórica para status das mesas
  db.run(`UPDATE mesas SET status = 'Disponível' WHERE status LIKE 'Dispon%' AND status != 'Disponível'`);

  db.run(`
    CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      categoria TEXT,
      nome TEXT,
      preco REAL,
      emoji TEXT,
      hasAddons BOOLEAN DEFAULT false,
      setor TEXT DEFAULT 'Cozinha 1',
      status_inicial TEXT DEFAULT 'Em preparo'
    )
  `);

  db.run(`ALTER TABLE produtos ADD COLUMN setor TEXT DEFAULT 'Cozinha 1'`, (err) => {
    // Ignora o erro se a coluna já existir
  });

  db.run(`ALTER TABLE produtos ADD COLUMN status_inicial TEXT DEFAULT 'Em preparo'`, (err) => {
    // Ignora o erro se a coluna já existir
  });

  db.run(`ALTER TABLE produtos ADD COLUMN status TEXT DEFAULT 'ativo'`, (err) => {
    // Ignora o erro
  });

  db.run(`ALTER TABLE produtos ADD COLUMN estoque REAL DEFAULT 0`, (err) => {
    // Ignora o erro se a coluna já existir
  });

  db.run(`ALTER TABLE produtos ADD COLUMN validade TEXT`, (err) => {
    // Ignora o erro se a coluna já existir
  });

  db.run(`ALTER TABLE produtos ADD COLUMN codigo_barras TEXT`, (err) => {
    // Ignora o erro se a coluna já existir
  });

  db.run(`ALTER TABLE produtos ADD COLUMN categoria_fiscal TEXT DEFAULT 'Alimentacao'`, (err) => {
    // Ignora o erro se a coluna já existir
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS funcionarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT,
      usuario TEXT UNIQUE,
      senha TEXT,
      cargo TEXT,
      login_expires_at TEXT
    )
  `);
  
  db.run(`ALTER TABLE funcionarios ADD COLUMN status TEXT DEFAULT 'Ativo'`, (err) => {});
  db.run(`ALTER TABLE funcionarios ADD COLUMN valor_hora REAL DEFAULT 0`, (err) => {});
  db.run(`ALTER TABLE funcionarios ADD COLUMN tipo_remuneracao TEXT DEFAULT 'hora'`, (err) => {});
  db.run(`ALTER TABLE funcionarios ADD COLUMN valor_dia REAL DEFAULT 0`, (err) => {});
  db.run(`ALTER TABLE funcionarios ADD COLUMN valor_semana REAL DEFAULT 0`, (err) => {});
  db.run(`ALTER TABLE funcionarios ADD COLUMN valor_mes REAL DEFAULT 0`, (err) => {});
  db.run(`ALTER TABLE funcionarios ADD COLUMN chave_pix TEXT`, (err) => {});
  db.run(`ALTER TABLE funcionarios ADD COLUMN cpf TEXT`, (err) => {});
  db.run(`ALTER TABLE funcionarios ADD COLUMN telefone TEXT`, (err) => {});
  db.run(`ALTER TABLE funcionarios ADD COLUMN observacao_rh TEXT`, (err) => {});
  db.run(`ALTER TABLE funcionarios ADD COLUMN login_expires_at TEXT`, (err) => {});

  db.run(`
    CREATE TABLE IF NOT EXISTS pontos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      funcionario_id INTEGER,
      entrada DATETIME,
      saida DATETIME,
      data DATE,
      total_horas REAL DEFAULT 0,
      valor_pagar REAL DEFAULT 0,
      pago BOOLEAN DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS vales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      funcionario_id INTEGER,
      data_pedido TEXT,
      valor REAL,
      status TEXT,
      data_aprovacao TEXT,
      pagamento_id INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS funcionarios_pagamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      funcionario_id INTEGER,
      data_pagamento TEXT,
      valor_bruto REAL,
      total_vales_abatidos REAL,
      total_consumo_abatido REAL,
      valor_liquido REAL,
      observacao TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS historico_logins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      funcionario_id INTEGER,
      funcionario_nome TEXT,
      data_hora DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);

  db.run("CREATE TABLE IF NOT EXISTS cupons (codigo TEXT PRIMARY KEY, itens_json TEXT, usado INTEGER DEFAULT 0, data_criacao DATETIME DEFAULT (datetime('now', 'localtime')))");
  db.run("ALTER TABLE cupons ADD COLUMN validade TEXT", () => {});
  db.run("ALTER TABLE cupons ADD COLUMN dias_horarios_json TEXT", () => {});
  db.run("ALTER TABLE cupons ADD COLUMN valor_tipo TEXT", () => {});
  db.run("ALTER TABLE cupons ADD COLUMN valor REAL", () => {});
  db.run("ALTER TABLE cupons ADD COLUMN limite_usos INTEGER DEFAULT 1", () => {});

  db.run(`
    CREATE TABLE IF NOT EXISTS configuracoes (
      chave TEXT PRIMARY KEY,
      valor TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS api_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data_hora DATETIME DEFAULT (datetime('now', 'localtime')),
      operador TEXT,
      ip TEXT,
      metodo TEXT,
      endpoint TEXT,
      detalhes TEXT,
      status_code INTEGER
    )
  `);
  db.run("CREATE INDEX IF NOT EXISTS idx_api_logs_data ON api_logs(data_hora)");
  db.run("CREATE INDEX IF NOT EXISTS idx_api_logs_endpoint ON api_logs(endpoint)");

  // Popular a tabela de auditoria inicial se vazia para demonstração imediata
  db.get("SELECT COUNT(*) as count FROM auditoria", (err, row) => {
    if (!err && row && row.count === 0) {
      const sampleAudits = [
        ['Caixa 1', 'Desconto Aplicado', 'Desconto de 10% no Checkout (Mesa 04)', 'Cliente VIP Fidelidade', 'Médio'],
        ['Garçom João', 'Exclusão de Item', 'Removido item Porção de Peixe (Comanda #12)', 'Pedido duplicado pelo cliente', 'Alto'],
        ['Admin', 'Alteração de Preço', 'Produto Chopp 500ml alterado de R$ 12,00 para R$ 14,00', 'Atualização da tabela de preços', 'Médio'],
        ['Gerente Pedro', 'Cancelamento de Pedido', 'Pedido #108 cancelado integralmente (R$ 89,00)', 'Cliente desistiu do pedido', 'Alto'],
        ['Admin', 'Configuração Alterada', 'Certificado A1 e Parâmetros NFC-e atualizados', 'Manutenção fiscal periódica', 'Baixo'],
        ['Caixa 2', 'Estorno de Pagamento', 'Estornado pagamento PIX de R$ 45,00', 'Valor cobrado a maior', 'Alto']
      ];
      const stmt = db.prepare("INSERT INTO auditoria (operador, acao, detalhes, motivo, risco) VALUES (?, ?, ?, ?, ?)");
      sampleAudits.forEach(a => stmt.run(a));
      stmt.finalize();
    }
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS auditoria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data_hora DATETIME DEFAULT (datetime('now', 'localtime')),
      operador TEXT,
      acao TEXT,
      detalhes TEXT,
      motivo TEXT,
      risco TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS beneficios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT,
      pontos INTEGER,
      imagem_url TEXT,
      ativo BOOLEAN DEFAULT true
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS resgates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER,
      beneficio_id INTEGER,
      codigo TEXT,
      usado BOOLEAN DEFAULT false,
      data TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS formas_pagamento (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      tipo TEXT NOT NULL,
      taxa REAL DEFAULT 0.0,
      prazo_dias INTEGER DEFAULT 0,
      ativo INTEGER DEFAULT 1,
      icone TEXT DEFAULT 'ph-credit-card',
      ordem INTEGER DEFAULT 0
    )
  `, () => {
    db.get('SELECT COUNT(*) as count FROM formas_pagamento', (err, row) => {
      if (!err && row && row.count === 0) {
        const defaultMethods = [
          ['Dinheiro', 'dinheiro', 0.0, 0, 1, 'ph-currency-dollar', 1],
          ['Cartão de Crédito', 'credito', 2.5, 30, 1, 'ph-credit-card', 2],
          ['Cartão de Débito', 'debito', 1.2, 1, 1, 'ph-credit-card', 3],
          ['PIX', 'pix', 0.0, 0, 1, 'ph-qr-code', 4],
          ['Vale Refeição / Alimentação', 'ticket', 3.5, 30, 1, 'ph-ticket', 5],
          ['Fiado / Carteira', 'carteira', 0.0, 0, 1, 'ph-notebook', 6]
        ];
        const stmt = db.prepare('INSERT INTO formas_pagamento (nome, tipo, taxa, prazo_dias, ativo, icone, ordem) VALUES (?, ?, ?, ?, ?, ?, ?)');
        defaultMethods.forEach(m => stmt.run(m));
        stmt.finalize();

        // Migrar e descobrir automaticamente métodos de pagamento já existentes em vendas/pedidos anteriores (apenas na primeira execução)
        db.all("SELECT DISTINCT paymentMethod FROM pedidos WHERE paymentMethod IS NOT NULL AND paymentMethod != ''", [], (err2, rows) => {
          if (!err2 && rows) {
            rows.forEach(r => {
              const metodoNome = r.paymentMethod.trim();
              if (!metodoNome) return;
              db.get("SELECT id FROM formas_pagamento WHERE LOWER(nome) = LOWER(?)", [metodoNome], (e, fp) => {
                if (!e && !fp) {
                  let tipo = 'outros';
                  let icone = 'ph-wallet';
                  const lower = metodoNome.toLowerCase();
                  if (lower.includes('dinheiro') || lower.includes('espécie')) { tipo = 'dinheiro'; icone = 'ph-currency-dollar'; }
                  else if (lower.includes('crédito') || lower.includes('credito')) { tipo = 'credito'; icone = 'ph-credit-card'; }
                  else if (lower.includes('débito') || lower.includes('debito')) { tipo = 'debito'; icone = 'ph-credit-card'; }
                  else if (lower.includes('pix')) { tipo = 'pix'; icone = 'ph-qr-code'; }
                  else if (lower.includes('ticket') || lower.includes('refeição') || lower.includes('alelo') || lower.includes('sodexo') || lower.includes('vr')) { tipo = 'ticket'; icone = 'ph-ticket'; }
                  else if (lower.includes('fiado') || lower.includes('carteira') || lower.includes('conta')) { tipo = 'carteira'; icone = 'ph-notebook'; }

                  db.run("INSERT INTO formas_pagamento (nome, tipo, taxa, prazo_dias, ativo, icone) VALUES (?, ?, 0.0, 0, 1, ?)", [metodoNome, tipo, icone]);
                }
              });
            });
          }
        });
      }
    });

    // Criar Índices no SQLite para Desempenho e Eficiência Extrema
    db.run("CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos(status)");
    db.run("CREATE INDEX IF NOT EXISTS idx_pedidos_local ON pedidos(localName)");
    db.run("CREATE INDEX IF NOT EXISTS idx_pedidos_payment ON pedidos(paymentMethod)");
    db.run("CREATE INDEX IF NOT EXISTS idx_pedidos_created ON pedidos(createdAt)");
    db.run("CREATE INDEX IF NOT EXISTS idx_formas_pagamento_ativo ON formas_pagamento(ativo, ordem)");
    db.run("CREATE INDEX IF NOT EXISTS idx_clientes_telefone ON clientes(telefone)");
    db.run("CREATE INDEX IF NOT EXISTS idx_produtos_categoria ON produtos(categoria)");
    db.run("CREATE INDEX IF NOT EXISTS idx_mesas_nome ON mesas(nome)");
  });

  global.registrarAuditoria = (operador, acao, detalhes, motivo, risco, socketId = null) => {
    let opFinal = (operador || '').trim();

    // Se o operador veio nulo, vazio ou como 'Desconhecido', tentar recuperar o operador ativo na sessão do socket
    if (!opFinal || opFinal === 'Desconhecido' || opFinal === 'Caixa / Desconhecido' || opFinal.toLowerCase().includes('desconhecido') || opFinal === 'undefined') {
      if (socketId && typeof activeSockets !== 'undefined' && activeSockets.has(socketId)) {
        const conn = activeSockets.get(socketId);
        if (conn && conn.user && conn.user !== 'Visitante') {
          opFinal = conn.user;
        }
      }
    }

    // Se ainda assim não encontrar nome, atribuir ao Operador de Caixa / Administrador ativo
    if (!opFinal || opFinal.toLowerCase().includes('desconhecido') || opFinal === 'undefined') {
      opFinal = 'Operador do Caixa';
    }

    db.run(
      `INSERT INTO auditoria (operador, acao, detalhes, motivo, risco) VALUES (?, ?, ?, ?, ?)`,
      [opFinal, acao, detalhes || '-', motivo || 'Sem justificativa', risco || 'BAIXO'],
      (err) => {
        if (err) console.error("Erro ao registrar auditoria:", err);
      }
    );
  };

  db.run(`INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('qr_order_enabled', 'false')`);
  db.run(`INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('qr_order_flow', 'caixa')`);
  db.run(`INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('qr_pix_key', '')`);
  db.run(`INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('qr_pix_name', '')`);

  // Inserir um cupom de teste inicial
  const testItems = [
    { nome: "Cerveja Lata", emoji: "🍺", quantity: 1, sector: "Bar" },
    { nome: "Porção Extra - Arroz/Pirão/Salada", emoji: "🍚", quantity: 1, sector: "Cozinha 1" }
  ];
  db.run(`INSERT OR IGNORE INTO cupons (codigo, itens_json, usado) VALUES (?, ?, 0)`, ['CUPOM-TESTE-123', JSON.stringify(testItems)]);

  // Default mesas
  db.get('SELECT count(*) as count FROM mesas', (err, row) => {
    if (row && row.count === 0) {
      for (let i = 1; i <= 15; i++) {
        db.run(`INSERT INTO mesas (nome) VALUES (?)`, [`Mesa ${i}`]);
      }
      db.run(`INSERT INTO mesas (nome) VALUES (?)`, [`Delivery`]);
    }
  });

  // Default produtos
  db.get('SELECT count(*) as count FROM produtos', (err, row) => {
    if (row && row.count === 0) {
      const defaultProducts = [
        ['Cervejas', 'Heineken 600ml', 21.00, '🍺', false, 'Bar', 'Em espera'],
        ['Cervejas', 'Stella 600ml', 21.00, '🍺', false, 'Bar', 'Em espera'],
        ['Cervejas', 'Spaten 600ml', 18.00, '🍺', false, 'Bar', 'Em espera'],
        ['Cervejas', 'Budweiser 600ml', 18.00, '🍺', false, 'Bar', 'Em espera'],
        ['Cervejas', 'Amstel 600ml', 18.00, '🍺', false, 'Bar', 'Em espera'],
        ['Cervejas', 'Eisenbahn 600ml', 18.00, '🍺', false, 'Bar', 'Em espera'],
        ['Cervejas', 'Original 600ml', 18.00, '🍺', false, 'Bar', 'Em espera'],
        ['Cervejas', 'Brahma 600ml', 15.00, '🍺', false, 'Bar', 'Em espera'],
        ['Cervejas', 'Cerveja Lata', 10.00, '🍺', false, 'Bar', 'Em espera'],
        ['Cervejas', 'Cerveja Artesanal', 25.00, '🍺', false, 'Bar', 'Em espera'],
        ['Bebidas', 'Refrigerante Lata', 8.00, '🥤', false, 'Bar', 'Em espera'],
        ['Bebidas', 'Água sem gás', 4.00, '💧', false, 'Bar', 'Em espera'],
        ['Bebidas', 'Água com gás', 5.00, '💧', false, 'Bar', 'Em espera'],
        ['Bebidas', 'Tônica Lata', 8.80, '🥤', false, 'Bar', 'Em espera'],
        ['Bebidas', 'H2O Garrafa', 8.80, '💧', false, 'Bar', 'Em espera'],
        ['Bebidas', 'Citrus Lata', 8.80, '🥤', false, 'Bar', 'Em espera'],
        ['Bebidas', 'Suco copo/lata', 8.80, '🧃', false, 'Bar', 'Em espera'],
        ['Bebidas', 'Suco Jarra Laranja', 18.00, '🍊', false, 'Bar', 'Em espera'],
        ['Bebidas', 'Suco Jarra Limão', 23.00, '🍋', false, 'Bar', 'Em espera'],
        ['Bebidas', 'Energético Baly', 18.00, '⚡', false, 'Bar', 'Em espera'],
        ['Bebidas', 'Energético Redbull', 18.00, '⚡', false, 'Bar', 'Em espera'],
        ['Bebidas', 'Energético Monster', 18.00, '⚡', false, 'Bar', 'Em espera'],
        ['Bebidas', 'Heineken 0%', 15.00, '🍺', false, 'Bar', 'Em espera'],
        ['Bebidas', 'Brahma 0%', 10.00, '🍺', false, 'Bar', 'Em espera'],
        ['Caipirinhas', 'Caipirinha Smirnoff', 20.00, '🍹', false, 'Bar', 'Em espera'],
        ['Caipirinhas', 'Caipirinha Bacardi', 20.00, '🍹', false, 'Bar', 'Em espera'],
        ['Caipirinhas', 'Caipirinha Cachaça Branca', 20.00, '🍹', false, 'Bar', 'Em espera'],
        ['Caipirinhas', 'Caipirinha Cachaça Amarela', 20.00, '🍹', false, 'Bar', 'Em espera'],
        ['Caipirinhas', 'Caipirinha Vinho', 20.00, '🍷', false, 'Bar', 'Em espera'],
        ['Caipirinhas', 'Caipirinha Skyy', 20.00, '🍹', false, 'Bar', 'Em espera'],
        ['Caipirinhas', 'Caipirinha Absolut', 26.00, '🍹', false, 'Bar', 'Em espera'],
        ['Caipirinhas', 'Caipirinha Havana', 28.00, '🍹', false, 'Bar', 'Em espera'],
        ['Doses', 'Smirnoff', 12.00, '🥃', false, 'Bar', 'Em espera'],
        ['Doses', 'Bacardi', 12.00, '🥃', false, 'Bar', 'Em espera'],
        ['Doses', 'Steinhager', 11.00, '🥃', false, 'Bar', 'Em espera'],
        ['Doses', 'Red Label', 20.00, '🥃', false, 'Bar', 'Em espera'],
        ['Doses', 'White Horse', 20.00, '🥃', false, 'Bar', 'Em espera'],
        ['Doses', 'Passport', 13.00, '🥃', false, 'Bar', 'Em espera'],
        ['Doses', 'Licor 43', 28.00, '🥃', false, 'Bar', 'Em espera'],
        ['Doses', 'Conhaque', 28.00, '🥃', false, 'Bar', 'Em espera'],
        ['Doses', 'Gin', 13.00, '🍸', false, 'Bar', 'Em espera'],
        ['Doses', 'Campari', 15.00, '🥃', false, 'Bar', 'Em espera'],
        ['Porções (800g)', 'Combinado São José (800g)', 134.00, '🍤', false, 'Cozinha 1', 'Em espera'],
        ['Porções (800g)', 'Anchova Frita (6 postas) (800g)', 69.00, '🐟', false, 'Cozinha 1', 'Em espera'],
        ['Porções (800g)', 'Peixe Frito Misturinha (800g)', 59.00, '🐟', false, 'Cozinha 1', 'Em espera'],
        ['Porções (800g)', 'Isca de Peixe à dorê (800g)', 74.00, '🐟', false, 'Cozinha 1', 'Em espera'],
        ['Porções (800g)', 'Camarão ao Bafo (800g)', 99.00, '🍤', false, 'Cozinha 1', 'Em espera'],
        ['Porções (800g)', 'Camarão à milanesa (800g)', 169.00, '🍤', false, 'Cozinha 1', 'Em espera'],
        ['Porções (800g)', 'Camarão alho e óleo (800g)', 119.90, '🍤', false, 'Cozinha 1', 'Em espera'],
        ['Porções (800g)', 'Ostra ao Bafo (dúzia) (800g)', 34.00, '🦪', false, 'Cozinha 1', 'Em espera'],
        ['Porções (800g)', 'Ostra Gratinada (dúzia) (800g)', 69.00, '🦪', false, 'Cozinha 1', 'Em espera'],
        ['Porções (800g)', 'Bolinho de Siri (4 unidades) (800g)', 44.90, '🦀', false, 'Cozinha 1', 'Em espera'],
        ['Porções (800g)', 'Marisco ao Bafo (1 kg) (800g)', 45.00, '🦪', false, 'Cozinha 1', 'Em espera'],
        ['Porções (800g)', 'Lula em anéis a dorê (800g)', 89.90, '🦑', false, 'Cozinha 1', 'Em espera'],
        ['Porções (800g)', 'Frango à Passarinho (1 kg) (800g)', 59.00, '🍗', false, 'Cozinha 1', 'Em espera'],
        ['Porções (800g)', 'Fritas (800g)', 49.00, '🍟', false, 'Cozinha 1', 'Em espera'],
        ['Porções (800g)', 'Porção 4 Pastéis - Camarão', 28.00, '🥟', false, 'Cozinha 1', 'Em espera'],
        ['Porções (800g)', 'Porção 4 Pastéis - Berbigão', 28.00, '🥟', false, 'Cozinha 1', 'Em espera'],
        ['Porções (800g)', 'Porção 4 Pastéis - Queijo', 28.00, '🥟', false, 'Cozinha 1', 'Em espera'],
        ['Porções (500g)', '1/2 Peixe Frito Misturinha (500g)', 48.00, '🐟', false, 'Cozinha 1', 'Em espera'],
        ['Porções (500g)', '1/2 Isca de Peixe à dorê (500g)', 64.00, '🐟', false, 'Cozinha 1', 'Em espera'],
        ['Porções (500g)', '1/2 Camarão Maluquinho (500g)', 84.90, '🍤', false, 'Cozinha 1', 'Em espera'],
        ['Porções (500g)', '1/2 Camarão ao Bafo (500g)', 99.00, '🍤', false, 'Cozinha 1', 'Em espera'],
        ['Porções (500g)', '1/2 Camarão à milanesa (500g)', 135.00, '🍤', false, 'Cozinha 1', 'Em espera'],
        ['Porções (500g)', '1/2 Camarão alho e óleo (500g)', 99.90, '🍤', false, 'Cozinha 1', 'Em espera'],
        ['Porções (500g)', '1/2 Ostra ao Bafo (6 unidades)', 16.90, '🦪', false, 'Cozinha 1', 'Em espera'],
        ['Porções (500g)', '1/2 Ostra Gratinada (6 unidades)', 54.00, '🦪', false, 'Cozinha 1', 'Em espera'],
        ['Porções (500g)', 'Bolinho de Siri (1 unidade)', 12.00, '🦀', false, 'Cozinha 1', 'Em espera'],
        ['Porções (500g)', '1/2 Lula a dorê (500g)', 79.90, '🦑', false, 'Cozinha 1', 'Em espera'],
        ['Porções (500g)', 'Filé de Frango Individual', 19.90, '🍗', false, 'Cozinha 1', 'Em espera'],
        ['Porções (500g)', 'Filé de Peixe Individual', 19.90, '🐟', false, 'Cozinha 1', 'Em espera'],
        ['Porções (500g)', '1/2 Fritas (500g)', 39.00, '🍟', false, 'Cozinha 1', 'Em espera'],
        ['Porções (500g)', 'Pastel 1 unidade - Camarão', 8.00, '🥟', false, 'Cozinha 1', 'Em espera'],
        ['Porções (500g)', 'Pastel 1 unidade - Berbigão', 8.00, '🥟', false, 'Cozinha 1', 'Em espera'],
        ['Porções (500g)', 'Pastel 1 unidade - Queijo', 8.00, '🥟', false, 'Cozinha 1', 'Em espera'],
        ['A La Carte', 'Pirão São José (700g) (2 pessoas)', 164.90, '🍲', false, 'Cozinha 1', 'Em espera'],
        ['A La Carte', 'Salmão à Moda da Casa (500g)', 209.00, '🐟', false, 'Cozinha 1', 'Em espera'],
        ['A La Carte', 'Filé de Pescada à Milanesa (800g)', 154.00, '🐟', false, 'Cozinha 1', 'Em espera'],
        ['A La Carte', '1/2 Filé Pescada à Milanesa (500g)', 134.00, '🐟', false, 'Cozinha 1', 'Em espera'],
        ['A La Carte', 'Filé de Pescada à Milanesa ao Molho de Camarão (800g)', 209.00, '🐟', false, 'Cozinha 1', 'Em espera'],
        ['A La Carte', '1/2 Filé de Pescada ao Molho de Camarão (500g)', 178.00, '🐟', false, 'Cozinha 1', 'Em espera'],
        ['A La Carte', 'Peixe Grelhado Anchova (Chapa)', 118.00, '🐟', false, 'Cozinha 1', 'Em espera'],
        ['A La Carte', 'Peixe Frito em Postas (6 postas)', 115.00, '🐟', false, 'Cozinha 1', 'Em espera'],
        ['A La Carte', 'Camarão à Milanesa (800g)', 209.00, '🍤', false, 'Cozinha 1', 'Em espera'],
        ['A La Carte', '1/2 Camarão à Milanesa (500g)', 181.00, '🍤', false, 'Cozinha 1', 'Em espera'],
        ['A La Carte', 'Filé de Frango à Milanesa (800g)', 119.00, '🍗', false, 'Cozinha 1', 'Em espera'],
        ['A La Carte', '1/2 Filé de Frango à Milanesa (500g)', 99.00, '🍗', false, 'Cozinha 1', 'Em espera'],
        ['A La Carte', 'Porção Extra - Arroz/Pirão/Salada', 20.00, '🍚', false, 'Cozinha 1', 'Em espera']
      ];
      const stmt = db.prepare(`INSERT INTO produtos (categoria, nome, preco, emoji, hasAddons, setor, status_inicial) VALUES (?, ?, ?, ?, ?, ?, ?)`);
      defaultProducts.forEach(p => {
        stmt.run(p[0], p[1], p[2], p[3], p[4] ? 1 : 0, p[5], p[6]);
      });
      stmt.finalize();
    }
  });

  // Default funcionario
  db.get('SELECT count(*) as count FROM funcionarios', (err, row) => {
    if (row && row.count === 0) {
      db.run(`INSERT INTO funcionarios (nome, usuario, senha, cargo) VALUES (?, ?, ?, ?)`, ['Garçom Teste', 'garcom', '123', 'Garçom']);
    }
  });

  // Criar índices após garantir que as tabelas existem
  db.run('CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos(status);');
  db.run('CREATE INDEX IF NOT EXISTS idx_pedidos_localName ON pedidos(localName);');
  db.run('CREATE INDEX IF NOT EXISTS idx_produtos_categoria ON produtos(categoria);');
  db.run('CREATE INDEX IF NOT EXISTS idx_pedidos_turno_id ON pedidos(turno_id);');
  db.run('CREATE INDEX IF NOT EXISTS idx_pedidos_mesa_grupo ON pedidos(mesa_grupo);');
  db.run('CREATE INDEX IF NOT EXISTS idx_movimentacoes_turno_id ON movimentacoes(turno_id);');
});

function broadcastProdutos(targetSocket = io) {
  db.all(`SELECT * FROM produtos`, (err, rows) => {
    if (err) return;
    const produtos = rows || [];
    
    db.all(`SELECT * FROM configuracoes WHERE chave IN ('destaques_ativos', 'destaques_itens')`, (e, configs) => {
      let destaquesAtivos = true; // default ativado
      let destaquesItens = null;
      
      if (configs) {
        configs.forEach(c => {
          if (c.chave === 'destaques_ativos') destaquesAtivos = (c.valor === 'true');
          if (c.chave === 'destaques_itens' && c.valor) {
            try { destaquesItens = JSON.parse(c.valor); } catch(ex){}
          }
        });
      }
      
      if (!destaquesAtivos) {
        targetSocket.emit('produtos_atualizados', produtos);
        return;
      }
      
      db.all(`SELECT productName, SUM(quantity) as qty FROM pedidos WHERE status='Finalizado' GROUP BY productName ORDER BY qty DESC LIMIT 15`, (errTop, topRows) => {
        let topNames = (topRows || []).map(r => r.productName);
        
        let finalDestaques = [];
        if (destaquesItens && Array.isArray(destaquesItens)) {
           finalDestaques = destaquesItens;
        } else {
           finalDestaques = topNames.slice(0, 8); // Top 8 por padrão
        }
        
        const produtosDestaque = [];
        finalDestaques.forEach((nomeDestaque, idx) => {
           const pOrig = produtos.find(p => p.nome === nomeDestaque);
           if (pOrig) {
              produtosDestaque.push({
                 ...pOrig,
                 id: pOrig.id + 90000 + idx, // ID virtual
                 categoria: 'Mais Pedidos',
                 originalId: pOrig.id
              });
           }
        });
        
        targetSocket.emit('produtos_atualizados', [...produtosDestaque, ...produtos]);
      });
    });
  });
}

function broadcastPedidos() {
  if (pedidosDebounceTimeout) clearTimeout(pedidosDebounceTimeout);
  pedidosDebounceTimeout = setTimeout(() => {
    db.all(`SELECT * FROM pedidos WHERE status NOT IN ('Finalizado','Cancelado') ORDER BY createdAt ASC`, [], (err, rows) => {
      if (!err) {
        const rowsAll = rows || [];
        const rowsAbertos = rowsAll.filter(r => r.status !== 'Pago' && r.status !== 'Fracionado');
        io.emit('pedidos_atualizados', rowsAbertos);
        io.emit('initial_data', rowsAbertos);
        io.emit('pedidos_pdv_atualizados', rowsAll);
        io.emit('initial_pdv_data', rowsAll);
      }
    });
  }, 300);
}

let pdvCalls = [];

io.on('connection', (socket) => {
  const token = socket.handshake.query.token;
  let socketTenantId = 1;
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socketTenantId = decoded.restaurante_id;
    } catch(e) {}
  }
  
  socket.restaurante_id = socketTenantId;
  socket.join(`restaurante_${socketTenantId}`);
  
  // Wrap all socket events in tenant context!
  const originalOn = socket.on.bind(socket);
  socket.on = function(eventName, callback) {
    originalOn(eventName, (...args) => {
      tenantContext.run(socketTenantId, () => {
        callback(...args);
      });
    });
  };

  // --- SAAS MULTI-TENANT SIMULATION ---
  socket.restaurante_id = 1;
  socket.join(`restaurante_${socket.restaurante_id}`);

  let mpPollInterval = null;

  // --- CAPTURA AUTOMÁTICA DE TODOS OS LOGS DE SOCKET.IO ---
  socket.onAny((event, ...args) => {
    if (['get_connected_devices', 'get_auditoria_logs', 'get_api_logs', 'ping', 'pong'].includes(event)) {
      return;
    }

    const conn = typeof activeSockets !== 'undefined' ? activeSockets.get(socket.id) : null;
    const operador = (conn && conn.user && conn.user !== 'Visitante') ? conn.user : 'Operador (Socket)';
    const ip = conn ? conn.ip : (socket.handshake && socket.handshake.address ? socket.handshake.address.replace('::ffff:', '') : '127.0.0.1');
    
    let payload = '';
    try {
      if (args && args.length > 0) {
        const cleanArgs = JSON.parse(JSON.stringify(args));
        cleanArgs.forEach(arg => {
          if (typeof arg === 'object' && arg !== null) {
            if (arg.senha) arg.senha = '***';
            if (arg.password) arg.password = '***';
            if (arg.token) arg.token = '***';
          }
        });
        payload = JSON.stringify(cleanArgs).substring(0, 400);
      }
    } catch(e) {}

    db.run(
      `INSERT INTO api_logs (operador, ip, metodo, endpoint, detalhes, status_code) VALUES (?, ?, 'SOCKET', ?, ?, 200)`,
      [operador, ip, `socket://${event}`, payload || '{}'],
      (err) => {
        if (err) console.error("Erro ao registrar log de socket:", err);
      }
    );
  });

  // --- AUDITORIA DE ACESSO E NAVEGAÇÃO DE PÁGINAS ---
  socket.on('registrar_acesso_pagina', (data) => {
    if (!data) return;
    const { pagina, titulo, autorizado, motivo } = data;
    const conn = typeof activeSockets !== 'undefined' ? activeSockets.get(socket.id) : null;
    const operador = (conn && conn.user && conn.user !== 'Visitante') ? conn.user : 'Operador do Sistema';
    
    const acao = (autorizado === false) ? 'TENTATIVA_ACESSO_NEGADO' : 'ACESSO_PAGINA';
    const detalhes = `Acessou/Navegou para a seção: ${titulo || pagina || 'Sistema'} (${pagina || ''})`;
    const risco = (autorizado === false) ? 'ALTO' : 'BAIXO';
    
    if (typeof global.registrarAuditoria === 'function') {
      global.registrarAuditoria(
        operador,
        acao,
        detalhes,
        motivo || (autorizado === false ? 'Bloqueio por permissão de usuário' : 'Navegação de rotina'),
        risco,
        socket.id
      );
    }
  });

  const ua = socket.handshake.headers['user-agent'] || '';
  const parsedUa = parseUserAgent(ua);
  const rawIp = socket.handshake.address ? socket.handshake.address.replace('::ffff:', '') : '127.0.0.1';
  const clientIp = (rawIp === '::1' || rawIp === '127.0.0.1') ? '127.0.0.1 (LocalHost)' : rawIp;

  activeSockets.set(socket.id, {
    id: socket.id,
    ip: clientIp,
    user: 'Visitante',
    cargo: 'Operador',
    os: parsedUa.os,
    browser: parsedUa.browser,
    model: parsedUa.model,
    icon: parsedUa.icon,
    isMobile: parsedUa.isMobile,
    device: parsedUa.fullDeviceStr,
    connectedAt: Date.now()
  });

  
  socket.on('registrar_sessao_detalhada', (data) => {
    const conn = activeSockets.get(socket.id);
    if (conn && data) {
      if (data.nome && data.nome.trim()) conn.user = data.nome.trim();
      if (data.cargo && data.cargo.trim()) conn.cargo = data.cargo.trim();
      if (data.model && data.model.trim()) conn.model = data.model.trim();
      if (data.os) conn.os = data.os;
      if (data.browser) conn.browser = data.browser;
      if (data.icon) conn.icon = data.icon;
      if (data.resolution) conn.resolution = data.resolution;
      
      conn.device = `${conn.model} (${conn.os} • ${conn.browser})`;
      io.emit('connected_devices_updated');

    }
  });

  
  socket.on('get_pedidos', () => {
    db.all("SELECT * FROM pedidos WHERE status NOT IN ('Finalizado','Pago','Cancelado') ORDER BY createdAt ASC", [], (err, rows) => {
      socket.emit('pedidos_atualizados', rows || []);
    });
  });

  socket.on('get_formas_pagamento', () => {
    broadcastFormasPagamento(socket);
  });

  socket.on('get_ia_config', () => {
    socket.emit('ia_config_atualizada', {
      minutosAtencao: IA_CONFIG.minutosAtencao,
      segundosPulseNovoPedido: IA_CONFIG.segundosPulseNovoPedido,
      minutosManobra: IA_CONFIG.minutosManobra,
      minutosCriticoEspera: IA_CONFIG.minutosCriticoEspera,
      minutosAlertaEspera: IA_CONFIG.minutosAlertaEspera,
      minutosRefillCerveja: IA_CONFIG.minutosRefillCerveja
    });
  });

  socket.on('add_forma_pagamento', (payload) => {
    const { nome, tipo, icone, taxa, prazo_dias, ativo } = payload || {};
    if (!nome) return;
    db.run(
      `INSERT INTO formas_pagamento (nome, tipo, taxa, prazo_dias, ativo, icone) VALUES (?, ?, ?, ?, ?, ?)`,
      [nome, tipo || 'credito', parseFloat(taxa) || 0, parseInt(prazo_dias) || 0, ativo !== undefined ? (ativo ? 1 : 0) : 1, icone || 'ph-credit-card'],
      function (err) {
        if (err) return;
        broadcastFormasPagamento();
      }
    );
  });

  socket.on('update_forma_pagamento', (payload) => {
    const { id, nome, tipo, icone, taxa, prazo_dias, ativo } = payload || {};
    if (!id || !nome) return;
    db.run(
      `UPDATE formas_pagamento SET nome = ?, tipo = ?, taxa = ?, prazo_dias = ?, ativo = ?, icone = ? WHERE id = ?`,
      [nome, tipo || 'credito', parseFloat(taxa) || 0, parseInt(prazo_dias) || 0, ativo ? 1 : 0, icone || 'ph-credit-card', id],
      function (err) {
        if (err) return;
        broadcastFormasPagamento();
      }
    );
  });

  socket.on('delete_forma_pagamento', (id) => {
    if (!id) return;
    db.get(`SELECT nome FROM formas_pagamento WHERE id = ?`, [id], (err, row) => {
      if (err || !row) return;
      db.get(`SELECT COUNT(*) as count FROM pedidos WHERE paymentMethod = ?`, [row.nome], (e, r) => {
        if (!e && r && r.count > 0) {
          return socket.emit('erro_caixa', `"${row.nome}" não pode ser excluído pois já foi utilizado em ${r.count} pedido(s). Apenas desative-o.`);
        }
        db.run(`DELETE FROM formas_pagamento WHERE id = ?`, [id], function (err2) {
          if (err2) return;
          broadcastFormasPagamento();
        });
      });
    });
  });

  socket.on('toggle_forma_pagamento', (payload) => {
    const { id, ativo } = payload || {};
    if (!id) return;
    db.run(`UPDATE formas_pagamento SET ativo = ? WHERE id = ?`, [ativo ? 1 : 0, id], function (err) {
      if (err) return;
      broadcastFormasPagamento();
    });
  });

  socket.on('get_connected_devices', () => {
    const deviceList = Array.from(activeSockets.values()).map(d => ({
      ...d,
      tempoConectadoStr: getTempoConectadoStr(d.connectedAt)
    }));
    socket.emit('connected_devices', deviceList);
  });

  socket.on('registrar_sessao', ({ nome, cargo }) => {
    const conn = activeSockets.get(socket.id);
    if (conn) {
      conn.user = nome || 'Visitante';
      conn.device = (cargo || 'Garçom') + ' (' + conn.deviceType + ')';
    }
  });

  socket.on('nova_comanda_crm', ({ nome, telefone }) => {
    let finalName = nome.trim();
    if (!finalName.toLowerCase().includes('comanda')) {
      finalName = `Comanda - ${finalName}`;
    }
    db.get(`SELECT * FROM mesas WHERE nome = ?`, [finalName], (err, row) => {
      if (!row) {
        db.run(`INSERT INTO mesas (nome, status, observacao) VALUES (?, 'Disponível', ?)`, [finalName, telefone || ''], (err) => {
          if (!err) {
            db.all(`SELECT * FROM mesas`, (err, rows) => {
              io.emit('mesas_atualizadas', rows || []);
              socket.emit('comanda_criada_sucesso', { nomeMesa: finalName });
            });
          }
        });
      } else {
        socket.emit('comanda_criada_sucesso', { nomeMesa: finalName });
      }
    });
  });
  
  // -- CRIAR CUPOM --
  socket.on('criar_cupom', (data) => {
    const itensStr = JSON.stringify(data.itens);
    const limiteUsos = parseInt(data.limite_usos) || 1;
    db.run(
      "INSERT INTO cupons (codigo, itens_json, usado, validade, dias_horarios_json, valor_tipo, valor, limite_usos) VALUES (?, ?, 0, ?, ?, ?, ?, ?)", 
      [data.codigo, itensStr, data.validade, JSON.stringify(data.dias_horarios), data.valor_tipo, data.valor, limiteUsos], 
      function(err) {
      if (err) {
         socket.emit('cupom_criado_error', 'Código já existe ou erro no banco.');
      } else {
         socket.emit('cupom_criado_sucesso', { codigo: data.codigo, titulo: data.titulo });
         io.emit('cupons_atualizados');
      }
    });
  });

  socket.emit('update_ponto_token', { url: `https://${getLocalIp()}:${PORT}/painel-funcionario.html?t=${pontoToken}` });
  socket.emit('server_ip', getLocalIp());
  console.log('Cliente conectado:', socket.id);

  // ── LICENÇA: ativação ──────────────────────────────────

  socket.on('activate_license', async ({ chave }) => {
    const result = await licenseManager.activateLicense(chave);
    socket.emit('license_activated', result);
    if (result.ok) {
      // Notificar todos os clientes do novo status
      io.emit('license_status', licenseManager.getState());
      io.emit('restaurant_name', licenseManager.getRestaurantName());
    }
  });

  // Enviar nome do restaurante ao conectar
  socket.emit('restaurant_name', licenseManager.getRestaurantName());
  socket.emit('license_status', licenseManager.getState());

  // ── Configuração do Apps Script ──────────────────────────
  const LICENSE_CONFIG_FILE = require('path').join(
    require('os').homedir(), 'AppData', 'Roaming', 'ChefCozinha', 'license-config.json'
  );

  socket.on('get_license_config', () => {
    try {
      if (fs.existsSync(LICENSE_CONFIG_FILE)) {
        const cfg = JSON.parse(fs.readFileSync(LICENSE_CONFIG_FILE, 'utf8'));
        socket.emit('license_config_loaded', cfg);
      } else {
        socket.emit('license_config_loaded', {});
      }
    } catch { socket.emit('license_config_loaded', {}); }
  });

  socket.on('save_license_config', ({ scriptUrl, sheetId, trialDias, modoOffline }) => {
    try {
      const cfg = { scriptUrl, sheetId, trialDias: trialDias || 14, modoOffline: !!modoOffline };
      fs.writeFileSync(LICENSE_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
      // Atualizar o license-manager com a nova URL
      if (scriptUrl) process.env.LICENSE_URL = scriptUrl;
      if (typeof licenseManager.recheckLicense === 'function') {
        licenseManager.recheckLicense();
      }
      socket.emit('license_config_saved', { ok: true });
      io.emit('license_status', licenseManager.getState());
      io.emit('restaurant_name', licenseManager.getRestaurantName());
    } catch (e) {
      socket.emit('license_config_saved', { ok: false, error: e.message });
    }
  });

  socket.on('test_license_connection', () => {
    try {
      let scriptUrl = '';
      if (fs.existsSync(LICENSE_CONFIG_FILE)) {
        scriptUrl = JSON.parse(fs.readFileSync(LICENSE_CONFIG_FILE, 'utf8')).scriptUrl || '';
      }
      if (!scriptUrl) {
        socket.emit('license_test_result', { ok: false, error: 'URL do Apps Script não configurada. Salve as configurações primeiro.' });
        return;
      }
      const url = scriptUrl + '?action=validate&installId=TEST-PING&v=test';
      const mod = url.startsWith('https') ? require('https') : require('http');
      const req = mod.get(url, { timeout: 8000 }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            socket.emit('license_test_result', { ok: true, data: parsed });
          } catch {
            socket.emit('license_test_result', { ok: false, error: 'Resposta inválida do Apps Script.' });
          }
        });
      });
      req.on('error', (e) => socket.emit('license_test_result', { ok: false, error: e.message }));
      req.on('timeout', () => { req.destroy(); socket.emit('license_test_result', { ok: false, error: 'Timeout — servidor demorou mais de 8s.' }); });
    } catch (e) {
      socket.emit('license_test_result', { ok: false, error: e.message });
    }
  });

  // Enviar installId junto com o status
  socket.on('get_license_status', () => {
    const state = licenseManager.getState();
    socket.emit('license_status', { ...state, installId: state.installId });
  });

  socket.on('transferir_mesa', ({ mesaAtual, novaMesa, operador }) => {
    db.run(`UPDATE pedidos SET localName = ? WHERE localName = ? AND status != 'Finalizado'`, [novaMesa, mesaAtual], (err) => {
      if (!err) {
        global.registrarAuditoria(operador || 'Sistema', 'TRANSFERENCIA_MESA', `Mesa ${mesaAtual} transferida para ${novaMesa}`, 'Operação de Salão', 'MEDIO');
        broadcastPedidos();
      }
    });
  });

  socket.on('juntar_mesas', ({ mesaA, mesaB, operador }) => {
    const grupo = `${mesaA} + ${mesaB}`;
    db.run(`UPDATE pedidos SET mesa_grupo = ? WHERE localName IN (?, ?) AND status != 'Finalizado'`, [grupo, mesaA, mesaB], (err) => {
      if (!err) {
        global.registrarAuditoria(operador || 'Sistema', 'JUNCAO_MESAS', `Mesa ${mesaA} e ${mesaB} unidas no grupo ${grupo}`, 'Operação de Salão', 'MEDIO');
        broadcastPedidos();
      }
    });
  });

  // Mover itens de uma mesa para outra (mesa origem fica livre)
  socket.on('transferir_mesas_itens', ({ mesaA, mesaB, operador }) => {
    db.run(`UPDATE pedidos SET localName = ?, mesa_grupo = NULL WHERE localName = ? AND status != 'Finalizado'`, [mesaB, mesaA], (err) => {
      if (!err) {
        db.run(`UPDATE mesas SET status = 'Disponível' WHERE nome = ?`, [mesaA], () => {
          db.all(`SELECT * FROM mesas`, (e, rows) => {
            io.emit('mesas_atualizadas', rows || []);
          });
        });
        global.registrarAuditoria(operador || 'Sistema', 'TRANSFERENCIA_MESAS_ITENS', `Itens de ${mesaA} movidos para ${mesaB}. Mesa ${mesaA} liberada.`, 'Operação de Salão', 'MEDIO');
        broadcastPedidos();
      }
    });
  });

  function liberarMesaSeVazia(mesaName) {
    if (!mesaName) return;
    db.get(`SELECT COUNT(*) as cnt FROM pedidos WHERE localName = ? AND status NOT IN ('Finalizado','Pago','Cancelado')`, [mesaName], (err, row) => {
      if (!err && row && row.cnt === 0) {
        db.run(`UPDATE mesas SET status = 'Disponível' WHERE nome = ? AND status != 'Disponível'`, [mesaName], () => {
          db.all(`SELECT * FROM mesas`, (e, rows) => {
            io.emit('mesas_atualizadas', rows || []);
          });
        });
      }
    });
  }

  socket.on('transferir_item', ({ itemId, novaMesa, operador }) => {
    db.get(`SELECT localName FROM pedidos WHERE id = ?`, [itemId], (errGet, rowGet) => {
      const mesaAntiga = rowGet ? rowGet.localName : null;
      db.run(`UPDATE pedidos SET localName = ?, mesa_grupo = NULL WHERE id = ?`, [novaMesa, itemId], (err) => {
        if (!err) {
          global.registrarAuditoria(operador || 'Sistema', 'TRANSFERENCIA_ITEM', `Item ${itemId} transferido para ${novaMesa}`, 'Operação de Salão', 'MEDIO');
          broadcastPedidos();
          liberarMesaSeVazia(mesaAntiga);
        }
      });
    });
  });

  socket.on('atribuir_comanda_item', ({ itemId, comandaName, operador }) => {
    const comandaVal = (comandaName && String(comandaName).trim()) ? String(comandaName).trim() : null;
    db.run(`UPDATE pedidos SET mesa_comanda = ? WHERE id = ?`, [comandaVal, itemId], (err) => {
      if (!err) {
        global.registrarAuditoria(operador || 'Sistema', 'ATRIBUICAO_COMANDA', `Item ${itemId} associado à comanda: ${comandaVal}`, 'Operação de Salão', 'BAIXO');
        broadcastPedidos();
      } else {
        console.error('Erro ao atribuir comanda ao item:', err);
      }
    });
  });

  // Fetch all active orders and send to the new client (always, regardless of IA config)
  db.all(`SELECT * FROM pedidos WHERE status NOT IN ('Finalizado','Cancelado') ORDER BY createdAt ASC`, [], (err, rows) => {
    if (err) {
      console.error(err);
      return;
    }
    const rowsAll = rows || [];
    socket.emit('initial_data', rowsAll.filter(r => r.status !== 'Pago'));
    socket.emit('initial_pdv_data', rowsAll);
  });

  
  socket.on('validar_cupom', ({ mesaName, codigo, userName }) => {
    db.get(`SELECT * FROM cupons WHERE codigo = ?`, [codigo], (err, cupom) => {
      if (err || !cupom) return socket.emit('cupom_invalido', { error: 'Cupom não encontrado ou código inválido.' });
      
      const limiteUsos = cupom.limite_usos || 1;
      const totalUsados = cupom.usado || 0;
      if (totalUsados >= limiteUsos) {
        return socket.emit('cupom_invalido', { error: 'Este cupom já atingiu o limite máximo de usos!' });
      }

      // Validar Data
      const agora = new Date();
      if (cupom.validade) {
         const dataValidade = new Date(cupom.validade + "T23:59:59");
         if (agora > dataValidade) return socket.emit('cupom_invalido', { error: 'Cupom expirado.' });
      }

      // Validar Dias/Horários
      if (cupom.dias_horarios_json) {
         try {
             const dh = JSON.parse(cupom.dias_horarios_json);
             const diasSemana = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
             const hojeDia = diasSemana[agora.getDay()];
             
             if (dh && dh[hojeDia]) {
                 const configHoje = dh[hojeDia];
                 if (!configHoje.ativo) return socket.emit('cupom_invalido', { error: 'Cupom não é válido para o dia de hoje (' + hojeDia + ').' });
                 
                 const horaAtualStr = agora.getHours().toString().padStart(2,'0') + ':' + agora.getMinutes().toString().padStart(2,'0');
                 if (configHoje.inicio && horaAtualStr < configHoje.inicio) return socket.emit('cupom_invalido', { error: 'Cupom só é válido a partir de ' + configHoje.inicio });
                 if (configHoje.fim && horaAtualStr > configHoje.fim) return socket.emit('cupom_invalido', { error: 'Cupom era válido apenas até as ' + configHoje.fim });
             }
         } catch(e) {}
      }

      // Cupom válido, marcar como usado (incrementar usos)
      db.run(`UPDATE cupons SET usado = usado + 1 WHERE codigo = ?`, [codigo], (err) => {
        if (err) return console.error(err);

        global.registrarAuditoria(userName || 'Garçom', 'USO_CUPOM', `Cupom ${codigo} aplicado na mesa ${mesaName}`, 'Promoção', 'MEDIO');

        try {
          const itens = JSON.parse(cupom.itens_json);
          const timeStr = agora.getHours().toString().padStart(2, '0') + ':' + agora.getMinutes().toString().padStart(2, '0');
          
          let hasInserted = false;
          
          // Inserir itens
          itens.forEach((item) => {
            db.run(
              `INSERT INTO pedidos (productName, productEmoji, quantity, total, status, localName, userName, time, sector, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
              [item.nome + ' (Resgate)', item.emoji || '🎁', item.quantity || 1, '0,00', 'Em espera', mesaName, userName || 'Garçom', timeStr, item.sector || 'Bar']
            );
            hasInserted = true;
          });

          // Inserir lógica financeira
          if (cupom.valor_tipo === 'desconto_fixo' && cupom.valor > 0) {
              db.run(
                `INSERT INTO pedidos (productName, productEmoji, quantity, total, status, localName, userName, time, sector, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
                ['Desconto Promocional', '🏏·️', 1, '-' + cupom.valor.toFixed(2).replace('.',','), 'Pronto', mesaName, userName || 'Garçom', timeStr, 'Caixa']
              );
              hasInserted = true;
          } else if (cupom.valor_tipo === 'preco_fixo' && cupom.valor > 0) {
              db.run(
                `INSERT INTO pedidos (productName, productEmoji, quantity, total, status, localName, userName, time, sector, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
                ['Cobrança de Combo/Cupom', '💲', 1, cupom.valor.toFixed(2).replace('.',','), 'Pronto', mesaName, userName || 'Garçom', timeStr, 'Caixa']
              );
              hasInserted = true;
          }

          if (hasInserted) {
              broadcastPedidos();
              db.all("SELECT * FROM mesas", (e, r) => io.emit('mesas_atualizadas', r || []));
          }
          
          socket.emit('cupom_sucesso', { mensagem: 'Cupom aplicado com sucesso!' });
        } catch (error) {
          socket.emit('cupom_invalido', { error: 'Erro ao ler os itens do cupom.' });
        }
      });
    });
  });


  // Garçom envia um novo pedido
    socket.on('buscar_cliente_telefone', (telefone) => {
    if (!telefone) return;
    const cleanPhone = telefone.replace(/\D/g, '');
    db.get(`SELECT nome FROM clientes WHERE telefone = ? OR telefone LIKE ? OR id IN (SELECT id FROM clientes WHERE REPLACE(REPLACE(REPLACE(REPLACE(telefone, ' ', ''), '-', ''), '(', ''), ')', '') = ?) LIMIT 1`, [telefone, `%${cleanPhone}`, cleanPhone], (err, row) => {
      if (row) {
        socket.emit('cliente_telefone_encontrado', { telefone, nome: row.nome });
      } else {
        socket.emit('cliente_telefone_encontrado', { telefone, nome: null });
      }
    });
  });

socket.on('novo_pedido', (pedido) => {
    // ── VERIFICAÇÃO DE LICENÇA ──
    if (licenseManager.isRestricted()) {
      socket.emit('pedido_erro', { msg: '⚠️ Sistema em modo restrito. Ative a licença para adicionar pedidos.' });
      return;
    }
    const clientName = pedido.mesa_comanda ? pedido.mesa_comanda.trim() : null;
    const clientPhone = pedido.cliente_telefone ? pedido.cliente_telefone.trim() : null;

    function proceedWithOrder(clienteId) {
      pedido.cliente_id = clienteId || pedido.cliente_id || null;
      let status = pedido.status_inicial || 'Em preparo';
    if (pedido.sector === 'Bar' && status === 'Em espera') {
      status = 'Em preparo';
    }
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0-6
    const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

    // 1. Fetch active promos
    db.all(`SELECT * FROM promocoes WHERE ativo = 1`, [], (err, promocoes) => {
      let comboBonus = null;

      const activePromos = (promocoes || []).map(p => {
        try { return { ...p, config: JSON.parse(p.config || '{}') }; } catch(e) { return { ...p, config: {} }; }
      }).filter(p => {
        const c = p.config;
        if (c.dias_semana && c.dias_semana.length > 0 && !c.dias_semana.includes(dayOfWeek)) return false;
        if (c.horario_inicio && currentTime < c.horario_inicio) return false;
        if (c.horario_fim && currentTime > c.horario_fim) return false;
        return true;
      });

      const livrePromos = activePromos.filter(p => p.config.tipo_promocao === 'livre');
      const comboPromos = activePromos.filter(p => p.config.tipo_promocao === 'combo');

      const matchingCombo = comboPromos.find(p => p.config.produto_alvo_nome === pedido.productName);
      if (matchingCombo) {
        comboBonus = matchingCombo.config.produto_brinde_nome;
      }

      if (livrePromos.length > 0) {
        db.all(`SELECT productName FROM pedidos WHERE localName = ? AND status != 'Finalizado'`, [pedido.localName], (err, itemsMesa) => {
          let tableIsLivre = false;
          let activeLivreCategories = [];
          
          for (const item of (itemsMesa || [])) {
             const lp = livrePromos.find(p => p.config.produto_alvo_nome === item.productName);
             if (lp) {
                tableIsLivre = true;
                if (lp.config.categorias_inclusas) {
                  activeLivreCategories = activeLivreCategories.concat(lp.config.categorias_inclusas);
                }
             }
          }

          if (tableIsLivre) {
             db.get(`SELECT categoria FROM produtos WHERE nome = ?`, [pedido.productName], (err, prodRow) => {
                if (prodRow && activeLivreCategories.includes(prodRow.categoria)) {
                   pedido.total = "0.00";
                }
                savePedidoAndBonus();
             });
          } else {
             savePedidoAndBonus();
          }
        });
      } else {
         savePedidoAndBonus();
      }

      function savePedidoAndBonus() {
          db.run(
           `INSERT INTO pedidos (productName, productEmoji, quantity, time, localName, userName, total, status, sector, cliente_id, promocao_id, entregador_id, mesa_comanda, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
           [pedido.productName, pedido.productEmoji, pedido.quantity, pedido.time, pedido.localName, pedido.userName, pedido.total, status, pedido.sector || 'Cozinha 1', pedido.cliente_id || null, pedido.promocao_id || null, pedido.entregador_id || null, pedido.mesa_comanda || null],
           function (err) {
             if (err) {
               console.error('Erro ao inserir pedido:', err);
               socket.emit('erro_servidor', 'Falha ao gravar o pedido. Tente novamente.');
               return;
             }
             const mainId = this.lastID;
             const finalSector = pedido.sector || 'Cozinha 1';
             const newOrder = { ...pedido, id: mainId, status: status, sector: finalSector, createdAt: new Date().toISOString() };
             io.emit('pedido_adicionado', newOrder);
             updateMesaStatus();
 
             if (comboBonus) {
                db.get(`SELECT emoji, categoria FROM produtos WHERE nome = ?`, [comboBonus], (err, bonusProd) => {
                  const bonusSector = (bonusProd && bonusProd.categoria === 'Bebidas') ? 'Bar' : 'Cozinha 1';
                  const bonusEmoji = bonusProd ? bonusProd.emoji : '🎁';
                  db.run(
                   `INSERT INTO pedidos (productName, productEmoji, quantity, time, localName, userName, total, status, sector, mesa_comanda, createdAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
                   [comboBonus + ' (Brinde)', bonusEmoji, pedido.quantity, pedido.time, pedido.localName, pedido.userName, "0.00", status, bonusSector, pedido.mesa_comanda || null],
                   function (err2) {
                      if (!err2) {
                        io.emit('pedido_adicionado', {
                          productName: comboBonus + ' (Brinde)', productEmoji: bonusEmoji, quantity: pedido.quantity, 
                          time: pedido.time, localName: pedido.localName, userName: pedido.userName, 
                          total: "0.00", status: status, sector: bonusSector, id: this.lastID, createdAt: new Date().toISOString()
                        });
                      }
                   }
                  );
                });
             }
           }
         );
       }

      function updateMesaStatus() {
        if (!pedido.localName.includes('Delivery') && !pedido.localName.includes('Balcão')) {
          db.run(`UPDATE mesas SET status = 'Ocupada' WHERE nome = ?`, [pedido.localName], () => {
            db.all(`SELECT * FROM mesas`, (err, rows) => {
              io.emit('mesas_atualizadas', rows || []);
            });
          });
        }
      }
    });
  }

  if (clientName) {
      if (clientPhone) {
        db.get(`SELECT id FROM clientes WHERE telefone = ?`, [clientPhone], (err, row) => {
          if (row) {
            db.run(`UPDATE clientes SET nome = ? WHERE id = ?`, [clientName, row.id], (err2) => {
              proceedWithOrder(row.id);
            });
          } else {
            db.run(`INSERT INTO clientes (nome, telefone) VALUES (?, ?)`, [clientName, clientPhone], function(err2) {
              proceedWithOrder(err2 ? null : this.lastID);
            });
          }
        });
      } else {
        db.get(`SELECT id FROM clientes WHERE nome = ? ORDER BY id DESC LIMIT 1`, [clientName], (err, row) => {
          proceedWithOrder(row ? row.id : null);
        });
      }
    } else {
      proceedWithOrder(null);
    }
  });

  // Atualiza Status (Cozinha/Bar)
  socket.on('atualizar_status', ({ id, status }) => {
    db.run(`UPDATE pedidos SET status = ? WHERE id = ?`, [status, id], function (err) {
      if (err) return console.error(err);
      
      db.get(`SELECT * FROM pedidos WHERE id = ?`, [id], (err, row) => {
        if (!row) return;
        
        io.emit('status_atualizado', row);
        // Notify customer about order status
        if (row.localName) {
          io.to(`mesa_${row.localName}`).emit('pedido_status_cliente', {
            pedidoId: row.id,
            status: row.status,
            productName: row.productName,
            localName: row.localName,
            quantity: row.quantity,
            createdAt: row.createdAt,
            prontoEm: row.prontoEm
          });
        }
        
        if (status === 'Pronto') {
          io.emit('pedido_pronto', row);
          // --- IA: Limpar alertas quando pedido fica Pronto ---
          if (iaState && iaState.alertasAtivos) {
            iaState.alertasAtivos.delete('pedido_' + id);
            iaState.alertasAtivos.delete('atencao_' + id);
          }
          if (iaState && iaState.manobrasAtivas) {
            iaState.manobrasAtivas.delete('manobra_' + id);
          }
          io.emit('ia_pedido_resolvido', { pedidoId: id, status: 'Pronto' });

          // Atualiza a esteira do garçom dono do pedido
          db.all(`SELECT * FROM pedidos WHERE userName = ? AND status = 'Pronto'`, [row.userName], (err, esteiraRows) => {
             if (esteiraRows) {
               io.emit('esteira_atualizada', esteiraRows); // Aqui o ideal seria emitir só pro garçom específico, mas broadcast tbm funciona pra este caso simples
             }
          });
        }
      });
    });
  });

  const chamarTimestamps = {};

  socket.on('get_esteira', (userName) => {
    db.all(`SELECT * FROM pedidos WHERE (userName = ? OR garcom_call IS NOT NULL) AND status = 'Pronto'`, [userName], (err, rows) => {
      var list = rows || [];
      var now = Date.now();
      pdvCalls = pdvCalls.filter(function(c) { return (now - c.criadoEm) < 300000; });
      list = list.concat(pdvCalls);
      socket.emit('esteira_atualizada', list);
    });
  });

  socket.on('marcar_entregue', ({ id, userName }) => {
    if (typeof id === 'string' && id.startsWith('pdv_')) {
      pdvCalls = pdvCalls.filter(function(c) { return c.id !== id; });
      socket.emit('esteira_atualizada', []);
      return;
    }
    db.get(`SELECT userName FROM pedidos WHERE id = ?`, [id], (err, row) => {
      const isChamada = row && row.userName === 'Chamada';
      const newStatus = isChamada ? 'Finalizado' : 'Entregue';
      db.run(`UPDATE pedidos SET status = ? WHERE id = ?`, [newStatus, id], () => {
        socket.emit('esteira_atualizada', []);
        broadcastPedidos();
      });
    });
  });

  socket.on('chamar_garcom', (data) => {
    const d = data || {};
    const id = d.id || null;
    const productName = d.productName || d.mensagem || 'Garçom chamado';
    const quantity = d.quantity || 1;
    const localName = d.localName || d.nome || 'PDV Mobile';
    const userName = d.userName || 'PDV Mobile';
    const now = Date.now();
    const lastCall = chamarTimestamps[id];
    const isReChamado = lastCall && (now - lastCall) < 10000;
    chamarTimestamps[id] = now;
    if (!id) {
      const entry = { id: 'pdv_' + now, localName, productName, quantity, userName, tipo: 'pdv', criadoEm: now, status: 'Pronto', targetGarcom: d.targetGarcom || null };
      if (!isReChamado) pdvCalls.push(entry);
      io.emit('notificacao_garcom', Object.assign({}, entry, { reChamado: isReChamado }));
      broadcastPedidos();
    } else {
      io.emit('notificacao_garcom', { id, productName, quantity, localName, userName, tipo: 'chamada', reChamado: isReChamado, targetGarcom: d.targetGarcom || null });
      if (!isReChamado) {
        db.run(`UPDATE pedidos SET garcom_call = datetime('now', 'localtime') WHERE id = ?`, [id]);
        broadcastPedidos();
      }
    }
  });

  socket.on('garcom_buscando', ({ pedidoId, garcomNome, localName, productName }) => {
    if (typeof pedidoId === 'number' || !isNaN(pedidoId)) {
      db.run(`UPDATE pedidos SET garcom_call = NULL WHERE id = ?`, [pedidoId], function() {
        io.emit('garcom_buscando', { pedidoId, garcomNome, localName, productName });
      });
    } else {
      io.emit('garcom_buscando', { pedidoId, garcomNome, localName, productName });
    }
  });

  socket.on('cliente_na_mesa', (localName) => {
    if (localName) {
      socket.join(`mesa_${localName}`);
    }
  });

  socket.on('garcom_aceitou_chamado', ({ localName, garcomNome }) => {
    io.to(`mesa_${localName}`).emit('garcom_chegando', { garcomNome, localName });
    io.emit('notificacao_garcom', { productName: `${garcomNome} aceitou`, localName, userName: 'Sistema', tipo: 'aceite' });
  });

  socket.on('movimentacao_caixa', (data) => {
    const d = data || {};
    const tipo = d.tipo || 'Sangria';
    const valor = parseFloat(d.valor) || 0;
    const descricao = d.descricao || tipo;
    const forma_pagamento = d.forma_pagamento || 'Dinheiro';
    const operador = d.operador || 'Caixa';
    if (valor <= 0) return;
    db.get(`SELECT id FROM turnos_caixa ORDER BY id DESC LIMIT 1`, [], (err, turno) => {
      const turnoId = turno ? turno.id : null;
      const tipoDb = tipo === 'Sangria' ? 'saida' : 'Entrada';
      db.run(
        `INSERT INTO movimentacoes (turno_id, tipo, valor, forma_pagamento, descricao, data) VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
        [turnoId, tipoDb, valor, forma_pagamento, `${tipo} (${operador}): ${descricao}`],
        function (err) {
          if (err) return;
          io.emit('movimentacoes_atualizadas');
        }
      );
    });
  });

  socket.on('remover_pedido_item', async (data) => {
    const itemId = (typeof data === 'object' && data !== null) ? (data.orderId || data.id) : data;
    const senha = (typeof data === 'object' && data !== null) ? data.senha : undefined;
    const userName = (typeof data === 'object' && data !== null && data.userName) ? data.userName : 'Caixa / Desconhecido';
    if (itemId === undefined || itemId === null || itemId === '') return;

    if (senha !== undefined) {
      if (!(await verificarSenhaAdmin(senha))) {
        socket.emit('erro_caixa', 'Senha de administrador incorreta!');
        return;
      }
    }
    
    db.get(`SELECT * FROM pedidos WHERE id = ?`, [itemId], (err, row) => {
      const mesaName = row ? row.localName : null;
      db.run(`DELETE FROM pedidos WHERE id = ?`, [itemId], () => {
        if(row) {
          global.registrarAuditoria(
            userName, 
            'Exclusão de Produto', 
            `Removido: ${row.quantity}x ${row.productName} - Mesa: ${row.localName} - Preço: R$${row.total}`, 
            'Ação manual (Lixeira)', 
            'Alto'
          );
        }
        broadcastPedidos();
        liberarMesaSeVazia(mesaName);
        if (mesaName) {
          db.all(`SELECT * FROM pedidos WHERE (localName = ? OR mesa_grupo = ? OR mesa_comanda = ?) AND status NOT IN ('Finalizado','Pago','Cancelado')`, [mesaName, mesaName, mesaName], (e, r) => {
            io.emit('itens_mesa_recebidos', { mesaName, items: r || [] });
          });
        }
      });
    });
  });

  // Shared handler for both event names (remover_pedido_item from main.js, remover_item_pedido from main.js)
  async function _handleRemoverItem(data) {
    const itemId = (typeof data === 'object' && data !== null) ? (data.orderId || data.id) : data;
    const senha = (typeof data === 'object' && data !== null) ? data.senha : undefined;
    const userName = (typeof data === 'object' && data !== null && data.userName) ? data.userName : 'Caixa / Desconhecido';
    if (itemId === undefined || itemId === null || itemId === '') return;

    if (senha !== undefined) {
      if (!(await verificarSenhaAdmin(senha))) {
        socket.emit('erro_caixa', 'Senha de administrador incorreta!');
        return;
      }
    }
    
    db.get(`SELECT * FROM pedidos WHERE id = ?`, [itemId], (err, row) => {
      const mesaName = row ? row.localName : null;
      db.run(`DELETE FROM pedidos WHERE id = ?`, [itemId], () => {
        if(row) {
          global.registrarAuditoria(userName, 'Exclusão de Produto', 
            `Removido: ${row.quantity}x ${row.productName} - Mesa: ${row.localName} - R$${row.total}`, 
            'Ação manual', 'Alto');
        }
        broadcastPedidos();
        liberarMesaSeVazia(mesaName);
        if (mesaName) {
          db.all(`SELECT * FROM pedidos WHERE (localName = ? OR mesa_grupo = ? OR mesa_comanda = ?) AND status NOT IN ('Finalizado','Pago','Cancelado')`, [mesaName, mesaName, mesaName], (e, r) => {
            io.emit('itens_mesa_recebidos', { mesaName, items: r || [] });
          });
        }
      });
    });
  }
  socket.on('remover_pedido_item', _handleRemoverItem);
  socket.on('remover_item_pedido', _handleRemoverItem);

  
  // --- MÓDULOS EXTERNOS (CONTROLLERS) ---
  const activePaymentLocks = new Set();
  require('./controllers/socket-financeiro')(socket, io, db, {
    checkCaixa,
    activePaymentLocks,
    broadcastPedidos,
    mesasFechando,
    licenseManager
  });

  // --- ADMIN & SETUP ROUTES ---
  socket.on('get_mesas', () => db.all(`SELECT * FROM mesas`, (err, rows) => {
    socket.emit('mesas_atualizadas', rows || []);
    socket.emit('sync_mesas_fechando', Array.from(mesasFechando));
  }));
  socket.on('get_qr_pedidos_pendentes', () => {
    db.all(`SELECT * FROM qr_pedidos_pendentes WHERE status = 'Pendente' ORDER BY createdAt DESC`, [], (err, rows) => {
      if (!err) {
        socket.emit('qr_pedidos_pendentes_list', rows || []);
      }
    });
  });

  socket.on('criar_pedido_qr', (data) => {
    // data: { mesa, cliente_nome, itens, valor_total, pago_pix, chave_pix }
    const { mesa, cliente_nome, itens, valor_total, pago_pix, chave_pix } = data;
    const itensStr = JSON.stringify(itens);
    const isPaid = pago_pix ? 1 : 0;
    
    db.run(
      `INSERT INTO qr_pedidos_pendentes (mesa, cliente_nome, itens_json, valor_total, pago_pix, chave_pix, status) VALUES (?, ?, ?, ?, ?, ?, 'Pendente')`,
      [mesa, cliente_nome, itensStr, parseFloat(valor_total) || 0, isPaid, chave_pix || ''],
      function(err) {
        if (err) {
          console.error('[QR Order] Erro ao criar pedido pendente:', err);
          socket.emit('criar_pedido_qr_resposta', { success: false, error: 'Erro ao registrar pedido pendente.' });
          return;
        }
        
        const pedidoId = this.lastID;
        socket.emit('criar_pedido_qr_resposta', { success: true, id: pedidoId });
        
        // Notify all cashiers
        db.all(`SELECT * FROM qr_pedidos_pendentes WHERE status = 'Pendente' ORDER BY createdAt DESC`, [], (errList, rows) => {
          if (!errList) {
            io.emit('qr_pedidos_pendentes_list', rows || []);
          }
        });
      }
    );
  });

  socket.on('aprovar_pedido_qr', ({ id }) => {
    db.get(`SELECT * FROM qr_pedidos_pendentes WHERE id = ?`, [id], (err, pendingOrder) => {
      if (err || !pendingOrder) {
        socket.emit('aprovar_pedido_qr_resposta', { success: false, error: 'Pedido pendente não encontrado.' });
        return;
      }
      
      checkCaixa(turno => {
        if (!turno) {
          socket.emit('aprovar_pedido_qr_resposta', { success: false, error: '⚠️ O caixa está fechado! Abra o caixa antes de aprovar pedidos.' });
          return;
        }
        
        let itens = [];
        try {
          itens = JSON.parse(pendingOrder.itens_json || '[]');
        } catch (e) {
          console.error('[QR Order] Erro ao fazer parse dos itens:', e);
        }
        
        const mesaName = pendingOrder.mesa;
        const now = new Date();
        const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
        
        db.serialize(() => {
          db.run('BEGIN TRANSACTION;');
          
          let insertedCount = 0;
          let hasError = false;
          
          itens.forEach(item => {
            let status = 'Em preparo';
            
            db.run(
              `INSERT INTO pedidos (productName, productEmoji, quantity, time, localName, userName, total, status, sector, turno_id, createdAt) 
               VALUES (?, ?, ?, ?, ?, 'QR Code', ?, ?, ?, ?, datetime('now', 'localtime'))`,
              [item.productName, item.productEmoji || '🍽️', item.quantity, timeStr, mesaName, String(item.total).replace('.', ','), status, item.sector || 'Cozinha 1', turno.id],
              function(errInsert) {
                if (errInsert) {
                  hasError = true;
                  console.error('[QR Order] Erro ao inserir item:', errInsert);
                } else {
                  const insertedId = this.lastID;
                  insertedCount++;
                  
                  io.emit('pedido_adicionado', {
                    id: insertedId,
                    productName: item.productName,
                    productEmoji: item.productEmoji || '🍽️',
                    quantity: item.quantity,
                    time: timeStr,
                    localName: mesaName,
                    userName: 'QR Code',
                    total: String(item.total).replace('.', ','),
                    status: status,
                    sector: item.sector || 'Cozinha 1',
                    createdAt: new Date().toISOString()
                  });
                }
              }
            );
          });
          
          if (pendingOrder.pago_pix) {
            const negativeTotal = (-Math.abs(pendingOrder.valor_total)).toFixed(2).replace('.', ',');
            db.run(
              `INSERT INTO pedidos (productName, productEmoji, quantity, total, status, localName, userName, time, sector, turno_id, createdAt) 
               VALUES (?, '💸', 1, ?, 'Entregue', ?, 'QR Code', ?, 'Caixa', ?, datetime('now', 'localtime'))`,
              [`Pgto QR Code (Pix) - Cliente ${pendingOrder.cliente_nome}`, negativeTotal, mesaName, timeStr, turno.id],
              function(errInsertPay) {
                if (errInsertPay) {
                  console.error('[QR Order] Erro ao registrar pagamento Pix:', errInsertPay);
                } else {
                  io.emit('pedido_adicionado', {
                    id: this.lastID,
                    productName: `Pgto QR Code (Pix) - Cliente ${pendingOrder.cliente_nome}`,
                    productEmoji: '💸',
                    quantity: 1,
                    time: timeStr,
                    localName: mesaName,
                    userName: 'QR Code',
                    total: negativeTotal,
                    status: 'Entregue',
                    sector: 'Caixa',
                    createdAt: new Date().toISOString()
                  });
                }
              }
            );
            
            db.run(
              `INSERT INTO movimentacoes (turno_id, tipo, valor, forma_pagamento, descricao, data) 
               VALUES (?, 'Entrada', ?, 'Pix', ?, datetime('now', 'localtime'))`,
              [turno.id, pendingOrder.valor_total, `Pedido QR Code - ${mesaName} (${pendingOrder.cliente_nome})`]
            );
          }
          
          if (!mesaName.includes('Delivery') && !mesaName.includes('Balcão')) {
            db.run(`UPDATE mesas SET status = 'Ocupada' WHERE nome = ?`, [mesaName]);
          }
          
          db.run(`UPDATE qr_pedidos_pendentes SET status = 'Aprovado' WHERE id = ?`, [id]);
          
          db.run('COMMIT;', (errCommit) => {
            if (errCommit) {
              console.error('[QR Order] Erro ao commitar transacao:', errCommit);
              socket.emit('aprovar_pedido_qr_resposta', { success: false, error: 'Erro ao salvar itens no banco.' });
              return;
            }
            
            socket.emit('aprovar_pedido_qr_resposta', { success: true });
            io.emit('pedido_qr_atualizado', { id: id, status: 'Aprovado' });
            // Notify customer about their orders
            db.all(`SELECT id, productName, productEmoji, quantity, status, sector, createdAt FROM pedidos WHERE localName = ? AND userName = 'QR Code' AND date(createdAt) = date('now') ORDER BY id`, [mesaName], (errOrders, orders) => {
              if (!errOrders && orders && orders.length > 0) {
                io.to(`mesa_${mesaName}`).emit('meus_pedidos', { orders, mesa: mesaName });
              }
            });
            
            db.all(`SELECT * FROM qr_pedidos_pendentes WHERE status = 'Pendente' ORDER BY createdAt DESC`, [], (errList, rows) => {
              if (!errList) io.emit('qr_pedidos_pendentes_list', rows || []);
            });
            
            broadcastPedidos();
            
            db.all(`SELECT * FROM mesas`, (errMesas, rows) => {
              io.emit('mesas_atualizadas', rows || []);
            });
          });
        });
      });
    });
  });

  socket.on('recusar_pedido_qr', ({ id }) => {
    db.run(`UPDATE qr_pedidos_pendentes SET status = 'Recusado' WHERE id = ?`, [id], (err) => {
      if (err) {
        socket.emit('recusar_pedido_qr_resposta', { success: false, error: 'Erro ao recusar pedido.' });
        return;
      }
      
      socket.emit('recusar_pedido_qr_resposta', { success: true });
      io.emit('pedido_qr_atualizado', { id: id, status: 'Recusado' });
      
      db.all(`SELECT * FROM qr_pedidos_pendentes WHERE status = 'Pendente' ORDER BY createdAt DESC`, [], (errList, rows) => {
        if (!errList) io.emit('qr_pedidos_pendentes_list', rows || []);
      });
    });
  });

  socket.on('identificar_cliente_qr', (dados, callback) => {
    const { nome, telefone, data_nascimento } = dados;
    db.get(`SELECT * FROM clientes WHERE telefone = ?`, [telefone], (err, existing) => {
      if (err) {
        return callback({ success: false, error: 'Erro ao buscar cliente.' });
      }
      
      if (existing) {
        db.run(`UPDATE clientes SET nome = ?, data_nascimento = ? WHERE id = ?`, [nome, data_nascimento, existing.id], (errUpdate) => {
          callback({
            success: true,
            cliente: {
              id: existing.id,
              nome: nome,
              telefone: telefone,
              data_nascimento: data_nascimento,
              pontos: existing.pontos
            }
          });
          db.all(`SELECT * FROM clientes`, (e, r) => io.emit('clientes_atualizados', r || []));
        });
      } else {
        db.run(
          `INSERT INTO clientes (nome, telefone, observacao, endereco, data_nascimento, pontos) VALUES (?, ?, '', '', ?, 0)`,
          [nome, telefone, data_nascimento],
          function(errInsert) {
            if (errInsert) {
              return callback({ success: false, error: 'Erro ao cadastrar cliente.' });
            }
            
            const newId = this.lastID;
            callback({
              success: true,
              cliente: {
                id: newId,
                nome: nome,
                telefone: telefone,
                data_nascimento: data_nascimento,
                pontos: 0
              }
            });
            db.all(`SELECT * FROM clientes`, (e, r) => io.emit('clientes_atualizados', r || []));
          }
        );
      }
    });
  });

  socket.on('get_produtos', () => broadcastProdutos(socket));
  socket.on('get_funcionarios', () => db.all(`SELECT * FROM funcionarios`, (err, rows) => socket.emit('funcionarios_atualizados', rows || [])));

  socket.on('add_mesa', (nome) => db.run(`INSERT INTO mesas (nome) VALUES (?)`, [nome], () => {
    db.all(`SELECT * FROM mesas`, (e, r) => io.emit('mesas_atualizadas', r || []));
  }));
  socket.on('delete_mesa', (id) => db.run(`DELETE FROM mesas WHERE id = ?`, [id], () => {
    db.all(`SELECT * FROM mesas`, (e, r) => io.emit('mesas_atualizadas', r || []));
  }));

  socket.on('add_produto', (p) => db.run(`INSERT INTO produtos (categoria, nome, preco, emoji, hasAddons, setor, status_inicial, status, categoria_fiscal) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
    [p.categoria, p.nome, p.preco, p.emoji, p.hasAddons, p.setor || 'Cozinha 1', p.status_inicial || 'Em espera', p.status || 'ativo', p.categoria_fiscal || 'Alimentacao'], (err) => {
      if (err) {
        console.error(err);
        socket.emit('erro_servidor', 'Falha ao adicionar o produto.');
        return;
      }
      broadcastProdutos();
  }));

  socket.on('edit_produto', (p) => {
    db.run(`UPDATE produtos SET categoria=?, nome=?, preco=?, emoji=?, setor=?, status_inicial=?, status=?, categoria_fiscal=? WHERE id=?`, 
      [p.categoria, p.nome, p.preco, p.emoji, p.setor || 'Cozinha 1', p.status_inicial || 'Em espera', p.status || 'ativo', p.categoria_fiscal || 'Alimentacao', p.id], () => {
        global.registrarAuditoria(p.operador || 'Admin', 'EDITAR_PRODUTO', `Produto editado: ${p.nome} (ID: ${p.id})`, 'Atualização de Cardápio', 'MEDIO');
        broadcastProdutos();
    });
  });

  socket.on('delete_produto', (data) => {
    const id = (typeof data === 'object') ? data.id : data;
    const op = (typeof data === 'object') ? data.operador : 'Admin';
    db.run(`DELETE FROM produtos WHERE id = ?`, [id], () => {
      global.registrarAuditoria(op || 'Admin', 'EXCLUSAO_PRODUTO', `Produto removido (ID: ${id})`, 'Atualização de Cardápio', 'ALTO');
      broadcastProdutos();
    });
  });

  socket.on('add_funcionario', (f) => {
    const valor_hora = f.valor_hora || 0;
    db.run(`INSERT INTO funcionarios (nome, usuario, senha, cargo, valor_hora) VALUES (?, ?, ?, ?, ?)`,
      [f.nome, f.usuario, f.senha, f.cargo, valor_hora], () => {
        db.all(`SELECT * FROM funcionarios`, (e, r) => io.emit('funcionarios_atualizados', r || []));
    });
  });

  socket.on('delete_funcionario', (id) => db.run(`DELETE FROM funcionarios WHERE id = ?`, [id], () => {
    db.all(`SELECT * FROM funcionarios`, (e, r) => io.emit('funcionarios_atualizados', r || []));
  }));

  socket.on('aprovar_funcionario', (data) => {
    const id = typeof data === 'object' ? data.id : data;
    const cargo = typeof data === 'object' && data.cargo ? data.cargo : 'Garçom';
    const valor_hora = typeof data === 'object' && data.valor_hora ? data.valor_hora : 0;
    
    let login_expires_at = null;
    const duration = typeof data === 'object' ? data.login_duration : undefined;
    if (duration && duration !== 'lifetime') {
      if (duration === 'session') {
        login_expires_at = 'SESSION';
      } else if (duration === '1day') {
        const d = new Date(); d.setDate(d.getDate() + 1);
        login_expires_at = d.toISOString();
      } else if (duration === '1week') {
        const d = new Date(); d.setDate(d.getDate() + 7);
        login_expires_at = d.toISOString();
      } else if (duration === '1month') {
        const d = new Date(); d.setMonth(d.getMonth() + 1);
        login_expires_at = d.toISOString();
      }
    }
    
    db.run(`UPDATE funcionarios SET status = 'Ativo', cargo = ?, valor_hora = ?, login_expires_at = ? WHERE id = ?`, [cargo, valor_hora, login_expires_at, id], () => {
      db.all(`SELECT * FROM funcionarios`, (e, r) => io.emit('funcionarios_atualizados', r || []));
    });
  });

  socket.on('update_funcionario', (data) => {
    const { id, nome, usuario, senha, cargo, tipo_remuneracao, valor_hora, valor_dia, valor_semana, valor_mes, chave_pix, cpf, telefone, observacao_rh } = data;
    const vHora = parseFloat(valor_hora) || 0;
    const vDia = parseFloat(valor_dia) || 0;
    const vSemana = parseFloat(valor_semana) || 0;
    const vMes = parseFloat(valor_mes) || 0;
    const tRem = tipo_remuneracao || 'hora';

    if (senha && senha.trim() !== '') {
      db.run(
        `UPDATE funcionarios SET nome = ?, usuario = ?, senha = ?, cargo = ?, tipo_remuneracao = ?, valor_hora = ?, valor_dia = ?, valor_semana = ?, valor_mes = ?, chave_pix = ?, cpf = ?, telefone = ?, observacao_rh = ? WHERE id = ?`,
        [nome, usuario, senha, cargo, tRem, vHora, vDia, vSemana, vMes, chave_pix || '', cpf || '', telefone || '', observacao_rh || '', id],
        (err) => {
          if (!err) db.all(`SELECT * FROM funcionarios`, (e, r) => io.emit('funcionarios_atualizados', r || []));
          else console.error("Erro update_funcionario:", err);
        }
      );
    } else {
      db.run(
        `UPDATE funcionarios SET nome = ?, usuario = ?, cargo = ?, tipo_remuneracao = ?, valor_hora = ?, valor_dia = ?, valor_semana = ?, valor_mes = ?, chave_pix = ?, cpf = ?, telefone = ?, observacao_rh = ? WHERE id = ?`,
        [nome, usuario, cargo, tRem, vHora, vDia, vSemana, vMes, chave_pix || '', cpf || '', telefone || '', observacao_rh || '', id],
        (err) => {
          if (!err) db.all(`SELECT * FROM funcionarios`, (e, r) => io.emit('funcionarios_atualizados', r || []));
          else console.error("Erro update_funcionario:", err);
        }
      );
    }
  });

  socket.on('login_funcionario', ({ usuario, senha }) => {
    db.get(`SELECT * FROM funcionarios WHERE usuario = ? AND senha = ?`, [usuario, senha], (err, row) => {
      if (row) {
        if (row.status === 'Pendente') {
          socket.emit('login_error', 'Seu cadastro está aguardando aprovação do caixa.');
        } else if (row.login_expires_at && row.login_expires_at !== 'SESSION' && new Date(row.login_expires_at) < new Date()) {
          socket.emit('login_error', 'Seu login expirou. Solicite uma nova aprovação ao gerente.');
        } else {
          socket.emit('login_success', row);
          db.run("INSERT INTO historico_logins (funcionario_id, funcionario_nome) VALUES (?, ?)", [row.id, row.nome]);
          const conn = activeSockets.get(socket.id);
          if (conn) {
            conn.user = row.nome;
            conn.device = row.cargo + ' (' + conn.deviceType + ')';
          }
        }
      } else {
        socket.emit('login_error', 'Usuário ou senha incorretos');
      }
    });
  });

  socket.on('cadastro_funcionario', (f) => {
    db.run(`INSERT INTO funcionarios (nome, usuario, senha, cargo, status) VALUES (?, ?, ?, 'Garçom', 'Pendente')`,
      [f.nome, f.usuario, f.senha], (err) => {
        if (err) {
           socket.emit('cadastro_erro', 'Erro ao cadastrar. Usuário pode já existir.');
        } else {
           socket.emit('cadastro_sucesso');
           db.all(`SELECT * FROM funcionarios`, (e, r) => io.emit('funcionarios_atualizados', r || []));
        }
    });
  });

  socket.on('recusar_funcionario', (id) => {
    db.run(`DELETE FROM funcionarios WHERE id = ?`, [id], () => {
      db.all(`SELECT * FROM funcionarios`, (e, r) => io.emit('funcionarios_atualizados', r || []));
    });
  });

  socket.on('atualizar_status_mesa', ({ nome, status, observacao }) => {
    if (status === 'Disponível') {
      mesasFechando.delete(nome);
      io.emit('sync_mesas_fechando', Array.from(mesasFechando));
    }
    let query = `UPDATE mesas SET status = ?`;
    let params = [status];
    if (observacao !== undefined) {
      query += `, observacao = ?`;
      params.push(observacao);
    }
    query += ` WHERE nome = ?`;
    params.push(nome);
    
    db.run(query, params, () => {
      db.all(`SELECT * FROM mesas`, (err, rows) => {
        io.emit('mesas_atualizadas', rows || []);
      });
    });
  });

  socket.on('alerta_pedir_conta', (mesaName) => {
    mesasFechando.add(mesaName);
    io.emit('toque_pedir_conta', mesaName);
    io.emit('sync_mesas_fechando', Array.from(mesasFechando));
  });

  // --- CLIENTES ---
  socket.on('get_clientes', () => {
    db.all(`SELECT * FROM clientes`, (err, rows) => socket.emit('clientes_atualizados', rows || []));
  });
  socket.on('add_cliente', (c) => {
    if (c.id) {
       // Update
       db.run(`UPDATE clientes SET nome=?, telefone=?, observacao=?, endereco=?, data_nascimento=? WHERE id=?`, 
         [c.nome, c.telefone, c.observacao, c.endereco, c.data_nascimento, c.id], () => {
           db.all(`SELECT * FROM clientes`, (e, r) => io.emit('clientes_atualizados', r || []));
       });
    } else {
       // Insert
       db.run(`INSERT INTO clientes (nome, telefone, observacao, endereco, data_nascimento, pontos) VALUES (?, ?, ?, ?, ?, 0)`, 
         [c.nome, c.telefone, c.observacao, c.endereco, c.data_nascimento], () => {
           db.all(`SELECT * FROM clientes`, (e, r) => io.emit('clientes_atualizados', r || []));
       });
    }
  });
  socket.on('delete_cliente', (id) => {
    db.run(`DELETE FROM clientes WHERE id = ?`, [id], () => {
      db.all(`SELECT * FROM clientes`, (e, r) => io.emit('clientes_atualizados', r || []));
    });
  });
  
  socket.on('buscar_historico_cliente', (data) => {
    const nome = data.nome || null;
    const telefone = data.telefone || null;
    if (!nome && !telefone) return socket.emit('historico_cliente', { nome: null, historico: [] });
    let query, params;
    if (telefone) {
      query = `SELECT p.localName, p.productName, p.productEmoji, p.quantity, p.total, p.createdAt 
               FROM pedidos p
               LEFT JOIN clientes c ON p.cliente_id = c.id
               WHERE (c.telefone = ? OR p.mesa_comanda = ?) AND p.status IN ('Finalizado','Pago','Entregue')
               ORDER BY p.createdAt DESC LIMIT 10`;
      params = [telefone, nome];
    } else {
      query = `SELECT p.localName, p.productName, p.productEmoji, p.quantity, p.total, p.createdAt 
               FROM pedidos p
               LEFT JOIN clientes c ON p.cliente_id = c.id
               WHERE (p.mesa_comanda = ? OR c.nome = ?) AND p.status IN ('Finalizado','Pago','Entregue')
               ORDER BY p.createdAt DESC LIMIT 10`;
      params = [nome, nome];
    }
    db.all(query, params, (err, rows) => {
      socket.emit('historico_cliente', { nome, historico: rows || [] });
    });
  });

  socket.on('resgatar_premio_qr', (data) => {
    // Pode receber apenas a string do QR Code ou um objeto { qrCodeStr, mesaName }
    const qrCodeStr = typeof data === 'string' ? data : data.qrCodeStr;
    const mesaName = typeof data === 'object' ? data.mesaName : null;

    if (!qrCodeStr || !qrCodeStr.startsWith('RESGATE:')) {
      return socket.emit('resgate_erro', 'QR Code inválido. Formato esperado: RESGATE:TELEFONE:CUSTO:PRODUTO');
    }
    
    const parts = qrCodeStr.split(':');
    if (parts.length < 4) return socket.emit('resgate_erro', 'QR Code mal formatado.');
    
    const telefone = parts[1];
    const custo = parseInt(parts[2], 10);
    const produto = parts.slice(3).join(':'); // Permite que o produto tenha dois pontos no nome
    
    db.get(`SELECT * FROM clientes WHERE telefone = ?`, [telefone], (err, cliente) => {
      if (!cliente) return socket.emit('resgate_erro', 'Cliente não encontrado com este telefone.');
      if (cliente.pontos < custo) return socket.emit('resgate_erro', `Saldo insuficiente. Cliente tem ${cliente.pontos} pts, e o prêmio custa ${custo} pts.`);
      
      // Deduzir pontos (atomic check + deduct to prevent race conditions)
      db.run(`UPDATE clientes SET pontos = pontos - ? WHERE id = ? AND pontos >= ?`, [custo, cliente.id, custo], (err2) => {
         if (err2) return socket.emit('resgate_erro', 'Erro ao deduzir pontos.');
         
         // Check if the update actually affected a row (balance was sufficient)
         db.get(`SELECT changes() as ch`, [], (errCh, rowCh) => {
           if (!errCh && rowCh && rowCh.ch === 0) {
             return socket.emit('resgate_erro', 'Saldo insuficiente (concorrência). Tente novamente.');
           }
         
         // Atualizar a interface dos clientes globalmente
         db.all(`SELECT * FROM clientes`, (e, r) => io.emit('clientes_atualizados', r || []));
         
         // Enviar sucesso e dados do produto
         socket.emit('resgate_sucesso', {
           cliente: cliente,
           produto: produto,
           custo: custo
         });

         // Se uma mesa foi fornecida (App do Garçom), lança automaticamente o prêmio na mesa
         if (mesaName) {
            db.get(`SELECT * FROM turnos_caixa WHERE status = 'Aberto' ORDER BY id DESC LIMIT 1`, (err3, turno) => {
               if (turno) {
                  const pedido = {
                    localName: mesaName,
                    userName: 'App Garçom',
                    productName: produto + ' (Prêmio Fidelidade)',
                    productEmoji: '🎁',
                    quantity: 1,
                    total: '0,00',
                    status: 'Recebido',
                    time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                    sector: 'Cozinha 1', // Ou tentar inferir o setor do produto
                    turno_id: turno.id,
                    cliente_id: cliente.id
                  };

                  db.run(
                    `INSERT INTO pedidos (localName, userName, productName, productEmoji, quantity, total, status, time, sector, turno_id, cliente_id, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
                    [pedido.localName, pedido.userName, pedido.productName, pedido.productEmoji, pedido.quantity, pedido.total, pedido.status, pedido.time, pedido.sector, pedido.turno_id, pedido.cliente_id],
                    function(err4) {
                      if (!err4) {
                        pedido.id = this.lastID;
                        io.emit('novo_pedido', pedido);
                        // Atualiza o status da mesa para ocupada se for nova
                        db.get(`SELECT status FROM mesas WHERE nome = ?`, [mesaName], (err, m) => {
                          if (m && m.status === 'Disponível') {
                            db.run(`UPDATE mesas SET status = 'Ocupada' WHERE nome = ?`, [mesaName], () => {
                              db.all(`SELECT * FROM mesas`, (e, r) => io.emit('mesas_atualizadas', r || []));
                            });
                          }
                        });
                      }
                    }
                  );
               }
            });
          }
       });
     });
   });

  // --- FIDELIDADE & PONTOS DO CLIENTE ---
  socket.on('buscar_cliente_telefone', (query) => {
    const q = (query || '').trim();
    if (!q) {
      socket.emit('resultado_cliente_telefone', null);
      socket.emit('cliente_telefone_encontrado', { telefone: q, nome: null });
      return;
    }
    db.get(
      `SELECT * FROM clientes WHERE telefone LIKE ? OR nome LIKE ? LIMIT 1`,
      [`%${q}%`, `%${q}%`],
      (err, row) => {
        socket.emit('resultado_cliente_telefone', row || null);
        // Also emit the event garcom.js listens for
        socket.emit('cliente_telefone_encontrado', { telefone: q, nome: row ? row.nome : null });
      }
    );
  });

  socket.on('ajustar_pontos_cliente', ({ id, pontos }) => {
    const novosPontos = Math.max(0, parseInt(pontos, 10) || 0);
    db.run(`UPDATE clientes SET pontos = ? WHERE id = ?`, [novosPontos, id], (err) => {
      if (!err) {
        db.all(`SELECT * FROM clientes`, (e, r) => io.emit('clientes_atualizados', r || []));
      }
    });
  });

  socket.on('resgatar_pontos_manual', ({ cliente_id, custo_pontos, produto_nome, mesaName }) => {
    const custo = parseInt(custo_pontos, 10) || 0;
    if (custo <= 0) return socket.emit('resgate_erro', 'Custo em pontos inválido.');

    db.get(`SELECT * FROM clientes WHERE id = ?`, [cliente_id], (err, cliente) => {
      if (!cliente) return socket.emit('resgate_erro', 'Cliente não encontrado.');
      if ((cliente.pontos || 0) < custo) {
        return socket.emit('resgate_erro', `Saldo insuficiente! O cliente possui ${cliente.pontos || 0} pts, mas o prêmio custa ${custo} pts.`);
      }

      db.run(`UPDATE clientes SET pontos = pontos - ? WHERE id = ? AND pontos >= ?`, [custo, cliente_id, custo], (err2) => {
        if (err2) return socket.emit('resgate_erro', 'Erro ao deduzir pontos.');

        db.all(`SELECT * FROM clientes`, (e, r) => io.emit('clientes_atualizados', r || []));

        socket.emit('resgate_sucesso', {
          cliente,
          produto: produto_nome,
          custo
        });
      });
    });
  });

  // --- PROMOCOES ---
  socket.on('get_promocoes', () => {
    db.all(`SELECT * FROM promocoes`, (err, rows) => socket.emit('promocoes_atualizadas', rows || []));
  });
  socket.on('add_promocao', (p) => db.run(`INSERT INTO promocoes (nome, regra, desconto, ativo, config) VALUES (?, ?, ?, ?, ?)`, [p.nome, p.regra, p.desconto, p.ativo !== undefined ? p.ativo : 1, p.config], () => {
    db.all(`SELECT * FROM promocoes`, (e, r) => io.emit('promocoes_atualizadas', r || []));
  }));
  socket.on('delete_promocao', (id) => db.run(`DELETE FROM promocoes WHERE id = ?`, [id], () => {
    db.all(`SELECT * FROM promocoes`, (e, r) => io.emit('promocoes_atualizadas', r || []));
  }));

  // --- AI COMBO GENERATOR - Redução de Carga Tributária ---
  // Tax rate estimates by fiscal category (approximate Brazilian averages)
  const TAX_RATES = {
    'Alimentacao': { icms: 7, pis_cofins: 9.25, total: 16.25 },
    'Bebida_Nao_Alcoolica': { icms: 12, pis_cofins: 9.25, total: 21.25 },
    'Bebida_Alcoolica': { icms: 18, pis_cofins: 11.33, total: 29.33 },
    'Servico': { icms: 5, pis_cofins: 9.25, total: 14.25 },
    'Outros': { icms: 12, pis_cofins: 9.25, total: 21.25 }
  };
  const TAX_LABELS = {
    'Alimentacao': 'Alimentação',
    'Bebida_Nao_Alcoolica': 'Bebida Não-Alc.',
    'Bebida_Alcoolica': 'Bebida Alcoólica',
    'Servico': 'Serviço',
    'Outros': 'Outros'
  };

  socket.on('get_ai_combo_suggestions', () => {
    // 1. Get all active products with their fiscal categories
    db.all(`SELECT * FROM produtos WHERE status = 'ativo' ORDER BY categoria, nome`, (err, products) => {
      if (err || !products || products.length === 0) {
        return socket.emit('ai_combo_suggestions', { suggestions: [], stats: {}, error: 'Nenhum produto ativo encontrado.' });
      }

      // 2. Get sales data for the last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      db.all(
        `SELECT productName, COUNT(*) as qty, SUM(CAST(REPLACE(REPLACE(total, ',', '.'), 'R$', '') AS REAL)) as revenue
         FROM pedidos 
         WHERE createdAt >= ? AND status IN ('Finalizado', 'Pago', 'Entregue')
         AND productName NOT LIKE 'Pgto Parcial%' AND productName NOT LIKE 'Pagamento%'
         GROUP BY productName ORDER BY revenue DESC`,
        [thirtyDaysAgo], (errSales, sales) => {
          
          const salesMap = {};
          (sales || []).forEach(s => {
            salesMap[s.productName] = { qty: s.qty, revenue: Math.abs(s.revenue || 0) };
          });

          // 3. Classify products by fiscal category
          const byCategory = {};
          products.forEach(p => {
            const cat = p.categoria_fiscal || 'Alimentacao';
            if (!byCategory[cat]) byCategory[cat] = [];
            byCategory[cat].push({
              id: p.id, nome: p.nome, preco: p.preco, categoria: p.categoria,
              emoji: p.emoji || '', categoria_fiscal: cat,
              sales: salesMap[p.nome] || { qty: 0, revenue: 0 }
            });
          });

          // 4. Calculate current tax burden by category
          let totalRevenue = 0;
          let weightedTax = 0;
          const catRevenue = {};
          Object.keys(byCategory).forEach(cat => {
            const catTotal = byCategory[cat].reduce((sum, p) => sum + (p.sales.revenue || 0), 0);
            catRevenue[cat] = catTotal;
            totalRevenue += catTotal;
            weightedTax += catTotal * (TAX_RATES[cat]?.total || 20);
          });
          const currentAvgTax = totalRevenue > 0 ? (weightedTax / totalRevenue) : 0;

          // 5. Generate combo suggestions
          const suggestions = [];
          const foods = byCategory['Alimentacao'] || [];
          const drinksNaoAlc = byCategory['Bebida_Nao_Alcoolica'] || [];
          const drinksAlc = byCategory['Bebida_Alcoolica'] || [];

          // Strategy A: Food + Food combos (lowest tax rate)
          if (foods.length >= 2) {
            const sortedFoods = [...foods].sort((a, b) => (b.sales.qty || 0) - (a.sales.qty || 0));
            for (let i = 0; i < Math.min(sortedFoods.length - 1, 5); i++) {
              for (let j = i + 1; j < Math.min(sortedFoods.length, i + 4); j++) {
                const a = sortedFoods[i], b = sortedFoods[j];
                if (a.id === b.id) continue;
                const soma = a.preco + b.preco;
                const comboPrice = +(soma * 0.88).toFixed(2); // 12% "desconto" visual
                const potentialTaxSaved = soma * ((currentAvgTax - TAX_RATES['Alimentacao'].total) / 100);
                
                suggestions.push({
                  tipo: 'food_food',
                  titulo: `${a.emoji || ''} ${a.nome} + ${b.emoji || ''} ${b.nome}`,
                  descricao: `Combo de Alimentação — Ambos na categoria de menor tributação`,
                  itens: [{ id: a.id, nome: a.nome, preco: a.preco }, { id: b.id, nome: b.preco ? b.nome : b.nome, preco: b.preco }],
                  precoOriginal: +soma.toFixed(2),
                  precoCombo: comboPrice,
                  descontoPct: 12,
                  categoriaFiscal: 'Alimentacao',
                  taxaAtual: +currentAvgTax.toFixed(2),
                  taxaCombo: TAX_RATES['Alimentacao'].total,
                  economiaEstimada: +Math.max(0, potentialTaxSaved).toFixed(2),
                  prioridade: (a.sales.qty || 0) + (b.sales.qty || 0),
                  icon: '🍽️'
                });
              }
            }
          }

          // Strategy B: Food + Non-Alcoholic Drink (moderate tax reduction)
          if (foods.length > 0 && drinksNaoAlc.length > 0) {
            const topFood = foods.sort((a, b) => (b.sales.qty || 0) - (a.sales.qty || 0))[0];
            const topDrink = drinksNaoAlc.sort((a, b) => (b.sales.qty || 0) - (a.sales.qty || 0))[0];
            if (topFood && topDrink && topFood.id !== topDrink.id) {
              const soma = topFood.preco + topDrink.preco;
              const comboPrice = +(soma * 0.90).toFixed(2);
              const potentialTaxSaved = soma * ((currentAvgTax - ((TAX_RATES['Alimentacao'].total + TAX_RATES['Bebida_Nao_Alcoolica'].total) / 2)) / 100);

              suggestions.push({
                tipo: 'food_bebida',
                titulo: `${topFood.emoji || ''} ${topFood.nome} + ${topDrink.emoji || ''} ${topDrink.nome}`,
                descricao: `Combo Alimentação + Bebida — Mix de categorias com desconto`,
                itens: [{ id: topFood.id, nome: topFood.nome, preco: topFood.preco }, { id: topDrink.id, nome: topDrink.nome, preco: topDrink.preco }],
                precoOriginal: +soma.toFixed(2),
                precoCombo: comboPrice,
                descontoPct: 10,
                categoriaFiscal: 'Misto',
                taxaAtual: +currentAvgTax.toFixed(2),
                taxaCombo: +((TAX_RATES['Alimentacao'].total + TAX_RATES['Bebida_Nao_Alcoolica'].total) / 2).toFixed(2),
                economiaEstimada: +Math.max(0, potentialTaxSaved).toFixed(2),
                prioridade: (topFood.sales.qty || 0) + (topDrink.sales.qty || 0) + 100,
                icon: '🥤'
              });
            }
          }

          // Strategy C: Encourage shifting away from alcoholic drinks
          if (drinksAlc.length > 0 && foods.length > 0) {
            const topAlc = drinksAlc.sort((a, b) => (b.sales.revenue || 0) - (a.sales.revenue || 0))[0];
            const topFood = foods.sort((a, b) => (b.sales.qty || 0) - (a.sales.qty || 0))[0];
            if (topAlc && topFood) {
              const soma = topAlc.preco + topFood.preco;
              const comboPrice = +(soma * 0.85).toFixed(2); // Bigger discount to incentivize
              const potentialTaxSaved = soma * ((currentAvgTax - ((TAX_RATES['Alimentacao'].total + TAX_RATES['Bebida_Alcoolica'].total) / 2)) / 100);

              suggestions.push({
                tipo: 'food_alcoolica',
                titulo: `${topFood.emoji || ''} ${topFood.nome} + ${topAlc.emoji || ''} ${topAlc.nome}`,
                descricao: `Combo Especial — Incentiva mix com menor carga tributária`,
                itens: [{ id: topFood.id, nome: topFood.nome, preco: topFood.preco }, { id: topAlc.id, nome: topAlc.nome, preco: topAlc.preco }],
                precoOriginal: +soma.toFixed(2),
                precoCombo: comboPrice,
                descontoPct: 15,
                categoriaFiscal: 'Misto',
                taxaAtual: +currentAvgTax.toFixed(2),
                taxaCombo: +((TAX_RATES['Alimentacao'].total + TAX_RATES['Bebida_Alcoolica'].total) / 2).toFixed(2),
                economiaEstimada: +Math.max(0, potentialTaxSaved).toFixed(2),
                prioridade: (topAlc.sales.revenue || 0) + 200,
                icon: '🍺'
              });
            }
          }

          // Strategy D: Triple food combo (highest tax savings)
          if (foods.length >= 3) {
            const sorted = [...foods].sort((a, b) => (b.sales.qty || 0) - (a.sales.qty || 0));
            const [a, b, c] = sorted;
            if (a && b && c) {
              const soma = a.preco + b.preco + c.preco;
              const comboPrice = +(soma * 0.80).toFixed(2); // 20% combo discount
              const potentialTaxSaved = soma * ((currentAvgTax - TAX_RATES['Alimentacao'].total) / 100);

              suggestions.push({
                tipo: 'food_trio',
                titulo: `${a.emoji || ''} ${a.nome} + ${b.emoji || ''} ${b.nome} + ${c.emoji || ''} ${c.nome}`,
                descricao: ` Trio Gastronômico — 3 itens 100% Alimentação, maior economia`,
                itens: [{ id: a.id, nome: a.nome, preco: a.preco }, { id: b.id, nome: b.nome, preco: b.preco }, { id: c.id, nome: c.nome, preco: c.preco }],
                precoOriginal: +soma.toFixed(2),
                precoCombo: comboPrice,
                descontoPct: 20,
                categoriaFiscal: 'Alimentacao',
                taxaAtual: +currentAvgTax.toFixed(2),
                taxaCombo: TAX_RATES['Alimentacao'].total,
                economiaEstimada: +Math.max(0, potentialTaxSaved).toFixed(2),
                prioridade: 300,
                icon: '🍕'
              });
            }
          }

          // Sort by potential savings (highest first)
          suggestions.sort((a, b) => b.economiaEstimada - a.economiaEstimada);

          // Limit to top 8
          const topSuggestions = suggestions.slice(0, 8);

          // Stats
          const stats = {
            totalProdutos: products.length,
            totalFaturado30d: +totalRevenue.toFixed(2),
            mediaTributariaAtual: +currentAvgTax.toFixed(2),
            distribuicao: Object.keys(catRevenue).map(cat => ({
              categoria: TAX_LABELS[cat] || cat,
              faturamento: +(catRevenue[cat] || 0).toFixed(2),
              percentual: totalRevenue > 0 ? +((catRevenue[cat] / totalRevenue) * 100).toFixed(1) : 0,
              taxaImposto: TAX_RATES[cat]?.total || 0
            })),
            produtosPorCategoria: Object.keys(byCategory).map(cat => ({
              categoria: TAX_LABELS[cat] || cat,
              qtd: byCategory[cat].length
            }))
          };

          socket.emit('ai_combo_suggestions', { suggestions: topSuggestions, stats });
        }
      );
    });
  });

  // --- FIDELIDADE / ÁREA DO CLIENTE ---
  socket.on('cliente_login', (telefone) => {
    db.get(`SELECT * FROM clientes WHERE telefone = ?`, [telefone], (err, cliente) => {
      if (err) return socket.emit('cliente_login_response', { error: 'Erro no servidor' });
      if (cliente) {
        socket.emit('cliente_login_response', { success: true, cliente });
      } else {
        socket.emit('cliente_login_response', { error: 'Cliente não encontrado. Solicite seu cadastro no caixa.' });
      }
    });
  });

  socket.on('get_beneficios', () => {
    db.all(`SELECT * FROM beneficios WHERE ativo = 1 ORDER BY pontos ASC`, (err, rows) => {
      socket.emit('beneficios_lista', rows || []);
    });
  });

  socket.on('resgatar_beneficio', ({ cliente_id, beneficio_id }) => {
    db.get(`SELECT pontos FROM clientes WHERE id = ?`, [cliente_id], (err, cliente) => {
      if (!cliente) return socket.emit('resgate_response', { error: 'Cliente inválido' });
      db.get(`SELECT pontos, nome FROM beneficios WHERE id = ? AND ativo = 1`, [beneficio_id], (err, beneficio) => {
        if (!beneficio) return socket.emit('resgate_response', { error: 'Benefício inválido' });
        
        if (cliente.pontos < beneficio.pontos) {
          return socket.emit('resgate_response', { error: 'Pontos insuficientes' });
        }
        
        const codigo = Math.random().toString(36).substring(2, 8).toUpperCase();
        const custo = beneficio.pontos;
        
        // Atomic deduct with balance check at DB level
        db.run(`UPDATE clientes SET pontos = pontos - ? WHERE id = ? AND pontos >= ?`, [custo, cliente_id, custo], (err) => {
          if (!err) {
            db.run(`INSERT INTO resgates (cliente_id, beneficio_id, codigo, data) VALUES (?, ?, ?, datetime('now', 'localtime'))`, 
              [cliente_id, beneficio_id, codigo], () => {
                const novoSaldo = cliente.pontos - custo;
                socket.emit('resgate_response', { success: true, codigo, novoSaldo });
                db.all(`SELECT * FROM clientes`, (e, r) => io.emit('clientes_lista', r || []));
            });
          }
        });
      });
    });
  });

  socket.on('get_resgates_cliente', (cliente_id) => {
    db.all(`
      SELECT r.*, b.nome as beneficio_nome 
      FROM resgates r 
      JOIN beneficios b ON r.beneficio_id = b.id 
      WHERE r.cliente_id = ? 
      ORDER BY r.id DESC`, 
      [cliente_id], (err, rows) => {
        socket.emit('resgates_cliente_lista', rows || []);
    });
  });

  socket.on('admin_get_beneficios', () => {
    db.all(`SELECT * FROM beneficios`, (err, rows) => socket.emit('admin_beneficios_lista', rows || []));
  });
  socket.on('add_beneficio', (b) => {
    db.run(`INSERT INTO beneficios (nome, pontos, imagem_url, ativo) VALUES (?, ?, ?, ?)`, [b.nome, b.pontos, b.imagem_url, b.ativo ? 1 : 0], () => {
      db.all(`SELECT * FROM beneficios`, (err, rows) => io.emit('admin_beneficios_lista', rows || []));
    });
  });
  socket.on('edit_beneficio', (b) => {
    db.run(`UPDATE beneficios SET nome=?, pontos=?, imagem_url=?, ativo=? WHERE id=?`, [b.nome, b.pontos, b.imagem_url, b.ativo ? 1 : 0, b.id], () => {
      db.all(`SELECT * FROM beneficios`, (err, rows) => io.emit('admin_beneficios_lista', rows || []));
    });
  });
  socket.on('delete_beneficio', (id) => {
    db.run(`DELETE FROM beneficios WHERE id=?`, [id], () => {
      db.all(`SELECT * FROM beneficios`, (err, rows) => io.emit('admin_beneficios_lista', rows || []));
    });
  });

  // --- DASHBOARD ESTATISTICAS ---
  socket.on('get_estatisticas_dashboard', () => {
    const stats = {};
    db.get(`SELECT COUNT(id) as total_pedidos, SUM(CAST(REPLACE(total, ',', '.') AS REAL)) as receita_total FROM pedidos WHERE status = 'Finalizado'`, (err, row) => {
      stats.pedidos = row.total_pedidos || 0;
      stats.receita_total = row.receita_total || 0;
      stats.ticket_medio = stats.pedidos > 0 ? (stats.receita_total / stats.pedidos) : 0;
      
      db.all(`SELECT strftime('%Y-%m-%d', createdAt) as dia, SUM(CAST(REPLACE(total, ',', '.') AS REAL)) as receita FROM pedidos WHERE status = 'Finalizado' GROUP BY dia ORDER BY dia DESC LIMIT 7`, (err, dias) => {
        stats.vendas_por_dia = dias ? dias.reverse() : [];
        
        db.all(`SELECT productName, SUM(quantity) as qty, SUM(CAST(REPLACE(total, ',', '.') AS REAL)) as receita FROM pedidos WHERE status = 'Finalizado' GROUP BY productName ORDER BY receita DESC LIMIT 5`, (err, prods) => {
          stats.top_produtos = prods || [];
          
          db.all(`SELECT paymentMethod, SUM(CAST(REPLACE(total, ',', '.') AS REAL)) as receita FROM pedidos WHERE status = 'Finalizado' GROUP BY paymentMethod ORDER BY receita DESC`, (err, pags) => {
            stats.pagamentos = pags || [];
            
            db.all(`SELECT sector, SUM(CAST(REPLACE(total, ',', '.') AS REAL)) as receita FROM pedidos WHERE status = 'Finalizado' GROUP BY sector`, (err, modulos) => {
              stats.modulos = modulos || [];
              
              db.all(`SELECT c.nome, SUM(CAST(REPLACE(p.total, ',', '.') AS REAL)) as receita FROM pedidos p JOIN clientes c ON p.cliente_id = c.id WHERE p.status = 'Finalizado' GROUP BY c.id ORDER BY receita DESC LIMIT 5`, (err, clientes) => {
                stats.top_clientes = clientes || [];
                
                db.all(`SELECT f.nome, COUNT(p.id) as entregas FROM pedidos p JOIN funcionarios f ON p.entregador_id = f.id WHERE p.status = 'Finalizado' GROUP BY f.id ORDER BY entregas DESC LIMIT 5`, (err, entregadores) => {
                   stats.top_entregadores = entregadores || [];
                   socket.emit('estatisticas_dashboard_recebidas', stats);
                });
              });
            });
          });
        });
      });
    });
  });

  socket.on('get_itens_mesa', (mesaName) => {
    db.all(`SELECT * FROM pedidos WHERE (localName = ? OR mesa_grupo = ? OR mesa_comanda = ?) AND status NOT IN ('Finalizado','Cancelado')`, [mesaName, mesaName, mesaName], (err, rows) => {
      socket.emit('itens_mesa_recebidos', { mesaName, items: rows || [] });
    });
  });

  // --- CAIXA LOGIC ---
  function checkCaixa(callback) {
    db.get(`SELECT * FROM turnos_caixa WHERE status = 'Aberto' ORDER BY id DESC LIMIT 1`, (err, row) => {
      callback(row);
    });
  }

  socket.on('mp_iniciar_pagamento', ({ valor, metodo }) => {
    db.all(`SELECT * FROM configuracoes`, async (err, rows) => {
      if (err) {
        socket.emit('mp_status_pagamento', { status: 'failed', msg: 'Erro ao carregar configurações.' });
        return;
      }
      const config = {};
      if (rows) rows.forEach(r => config[r.chave] = r.valor);

      const provider = config.mp_provider || 'none';
      if (provider === 'none') {
        socket.emit('mp_status_pagamento', { status: 'failed', msg: 'Nenhuma maquininha configurada. Acesse Configurações → Maquininhas.' });
        return;
      }

      if (mpPollInterval) {
        clearInterval(mpPollInterval);
        mpPollInterval = null;
      }

      // ===================================================
      // PROVEDOR: MERCADO PAGO POINT
      // ===================================================
      if (provider === 'mercadopago') {
        const token = config.mp_access_token;
        const deviceId = config.mp_device_id;
        if (!token || !deviceId) {
          socket.emit('mp_status_pagamento', { status: 'failed', msg: 'Mercado Pago não configurado. Verifique Access Token e Device ID.' });
          return;
        }
        try {
          const idempotencyKey = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
          const response = await fetch(`https://api.mercadopago.com/point/integration-api/devices/${deviceId}/payment-intents`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'X-Idempotency-Key': idempotencyKey
            },
            body: JSON.stringify({
              amount: parseFloat(valor),
              description: 'Pagamento PDV - Chef Cozinha',
              payment: {
                installments: 1,
                type: metodo === 'Cartão de Débito' ? 'debit_card' : 'credit_card'
              }
            })
          });
          const data = await response.json();
          if (!response.ok || !data.id) {
            socket.emit('mp_status_pagamento', { status: 'failed', msg: data.message || 'Falha ao criar cobrança na maquininha.' });
            return;
          }
          mpCurrentIntentId = data.id;
          mpCurrentDeviceId = deviceId;
          socket.emit('mp_status_pagamento', { status: 'processando', intentId: data.id, msg: '🔵 Cobrança enviada! Aguardando cartão na Maquininha Mercado Pago...' });
          let elapsedSeconds = 0;
          mpPollInterval = setInterval(async () => {
            elapsedSeconds += 2;
            if (elapsedSeconds > 180) {
              clearInterval(mpPollInterval); mpPollInterval = null;
              socket.emit('mp_status_pagamento', { status: 'failed', msg: 'Tempo limite esgotado. Transação cancelada.' });
              return;
            }
            try {
              const statusResponse = await fetch(`https://api.mercadopago.com/point/integration-api/payment-intents/${mpCurrentIntentId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
              });
              if (statusResponse.ok) {
                const statusData = await statusResponse.json();
                if (statusData.status === 'finished') {
                  clearInterval(mpPollInterval); mpPollInterval = null;
                  socket.emit('mp_status_pagamento', { status: 'aprovado', payment: statusData, msg: 'Pagamento aprovado com sucesso!' });
                } else if (statusData.status === 'canceled' || statusData.status === 'expired') {
                  clearInterval(mpPollInterval); mpPollInterval = null;
                  socket.emit('mp_status_pagamento', { status: 'failed', msg: `Pagamento ${statusData.status === 'canceled' ? 'cancelado' : 'expirado'} na maquininha.` });
                }
              }
            } catch (pollErr) { console.error('[MP] Polling error:', pollErr); }
          }, 2000);
        } catch (apiErr) {
          console.error('[Mercado Pago] Erro:', apiErr);
          socket.emit('mp_status_pagamento', { status: 'failed', msg: 'Erro de conexão com o Mercado Pago.' });
        }
        return;
      }

      // ===================================================
      // PROVEDOR: STONE / TON (TEF LOCAL)
      // ===================================================
      if (provider === 'stone') {
        const stoneCode = config.stone_stonecode;
        const stonePorta = config.stone_porta || '8080';
        if (!stoneCode) {
          socket.emit('mp_status_pagamento', { status: 'failed', msg: 'Stone não configurado. Verifique o Stone Code.' });
          return;
        }
        try {
          const modalidade = metodo === 'Cartão de Débito' ? 2 : 3;
          const response = await fetch(`http://localhost:${stonePorta}/charge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amount: Math.round(parseFloat(valor) * 100),
              payment_type: modalidade,
              installments: 1,
              stone_code: stoneCode,
              description: 'Chef Cozinha PDV'
            }),
            signal: AbortSignal.timeout(10000)
          });
          const data = await response.json();
          if (!response.ok || data.error) {
            socket.emit('mp_status_pagamento', { status: 'failed', msg: data.message || data.error || 'Falha ao enviar cobrança para Stone Client.' });
            return;
          }
          const transactionId = data.transaction_id || data.id;
          socket.emit('mp_status_pagamento', { status: 'processando', intentId: transactionId, msg: '🟢 Cobrança enviada! Aguardando cartão na maquininha Stone...' });
          let stoneElapsed = 0;
          mpPollInterval = setInterval(async () => {
            stoneElapsed += 3;
            if (stoneElapsed > 180) {
              clearInterval(mpPollInterval); mpPollInterval = null;
              socket.emit('mp_status_pagamento', { status: 'failed', msg: 'Tempo limite esgotado. Verifique a maquininha Stone.' });
              return;
            }
            try {
              const statusResp = await fetch(`http://localhost:${stonePorta}/charge/${transactionId}`, { signal: AbortSignal.timeout(5000) });
              if (statusResp.ok) {
                const sd = await statusResp.json();
                const st = (sd.status || '').toLowerCase();
                if (st === 'approved' || st === 'confirmed' || st === 'success') {
                  clearInterval(mpPollInterval); mpPollInterval = null;
                  socket.emit('mp_status_pagamento', { status: 'aprovado', payment: sd, msg: '✅ Pagamento Stone aprovado!' });
                } else if (st === 'failed' || st === 'denied' || st === 'canceled') {
                  clearInterval(mpPollInterval); mpPollInterval = null;
                  socket.emit('mp_status_pagamento', { status: 'failed', msg: `Pagamento ${st} na maquininha Stone.` });
                }
              }
            } catch (e) { console.error('[Stone] Polling error:', e); }
          }, 3000);
        } catch (stoneErr) {
          console.error('[Stone] Erro:', stoneErr);
          socket.emit('mp_status_pagamento', { status: 'failed', msg: `Erro ao conectar com Stone Client TEF na porta ${config.stone_porta || 8080}. Verifique se o Stone Client está rodando.` });
        }
        return;
      }

      // ===================================================
      // PROVEDOR: PAGBANK / PAGSEGURO
      // ===================================================
      if (provider === 'pagbank') {
        const pgToken = config.pagbank_token;
        const pgTerminal = config.pagbank_terminal;
        if (!pgToken || !pgTerminal) {
          socket.emit('mp_status_pagamento', { status: 'failed', msg: 'PagBank não configurado. Verifique Token e Terminal ID.' });
          return;
        }
        try {
          const paymentType = metodo === 'Cartão de Débito' ? 'DEBIT_CARD' : 'CREDIT_CARD';
          const response = await fetch('https://api.pagseguro.com/terminal/v1/payments', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${pgToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              terminal_id: pgTerminal,
              payment_method: { type: paymentType, installments: 1 },
              amount: { value: Math.round(parseFloat(valor) * 100), currency: 'BRL' },
              description: 'Chef Cozinha PDV'
            })
          });
          const data = await response.json();
          if (!response.ok || !data.id) {
            const errMsg = data.message || (data.error_messages && data.error_messages[0] && data.error_messages[0].description) || 'Falha ao criar cobrança no PagBank.';
            socket.emit('mp_status_pagamento', { status: 'failed', msg: errMsg });
            return;
          }
          const pgPaymentId = data.id;
          socket.emit('mp_status_pagamento', { status: 'processando', intentId: pgPaymentId, msg: '🟠 Cobrança enviada! Aguardando cartão na maquininha PagBank...' });
          let pgElapsed = 0;
          mpPollInterval = setInterval(async () => {
            pgElapsed += 3;
            if (pgElapsed > 180) {
              clearInterval(mpPollInterval); mpPollInterval = null;
              socket.emit('mp_status_pagamento', { status: 'failed', msg: 'Tempo limite esgotado. Verifique a maquininha PagBank.' });
              return;
            }
            try {
              const statusResp = await fetch(`https://api.pagseguro.com/terminal/v1/payments/${pgPaymentId}`, {
                headers: { 'Authorization': `Bearer ${pgToken}` }
              });
              if (statusResp.ok) {
                const sd = await statusResp.json();
                const st = (sd.status || '').toUpperCase();
                if (st === 'PAID' || st === 'AUTHORIZED' || st === 'COMPLETED') {
                  clearInterval(mpPollInterval); mpPollInterval = null;
                  socket.emit('mp_status_pagamento', { status: 'aprovado', payment: sd, msg: '✅ Pagamento PagBank aprovado!' });
                } else if (st === 'DECLINED' || st === 'CANCELED' || st === 'ERROR') {
                  clearInterval(mpPollInterval); mpPollInterval = null;
                  socket.emit('mp_status_pagamento', { status: 'failed', msg: `Pagamento ${st} na maquininha PagBank.` });
                }
              }
            } catch (e) { console.error('[PagBank] Polling error:', e); }
          }, 3000);
        } catch (pgErr) {
          console.error('[PagBank] Erro:', pgErr);
          socket.emit('mp_status_pagamento', { status: 'failed', msg: 'Erro de conexão com API do PagBank.' });
        }
        return;
      }

      // ===================================================
      // PROVEDOR: SiTef GENÉRICO (TCP/IP)
      // ===================================================
      if (provider === 'sitef') {
        const sitefIp = config.sitef_ip;
        const sitefPorta = parseInt(config.sitef_porta || '4096');
        const sitefTerminal = config.sitef_terminal;
        const sitefEstab = config.sitef_estabelecimento;
        if (!sitefIp || !sitefTerminal) {
          socket.emit('mp_status_pagamento', { status: 'failed', msg: 'SiTef não configurado. Verifique IP e Número do Terminal.' });
          return;
        }
        const net = require('net');
        const modalidade = metodo === 'Cartão de Débito' ? '02' : '03';
        const valorCentavos = String(Math.round(parseFloat(valor) * 100)).padStart(12, '0');
        const terminal = (sitefTerminal).padEnd(8, ' ').substring(0, 8);
        const estab = (sitefEstab || '00000000').padEnd(16, ' ').substring(0, 16);
        const msgPayload = `0001${String(42).padStart(4,'0')}${terminal}${estab}${modalidade}${valorCentavos}`;
        const msgLen = String(msgPayload.length).padStart(4, '0');
        const fullMsg = `${msgLen}${msgPayload}`;
        socket.emit('mp_status_pagamento', { status: 'processando', msg: '⚙️ Enviando cobrança para servidor SiTef...' });
        const client = new net.Socket();
        let sitefBuf = '';
        client.setTimeout(90000);
        client.connect(sitefPorta, sitefIp, () => { client.write(Buffer.from(fullMsg, 'utf8')); });
        client.on('data', (data) => {
          sitefBuf += data.toString('utf8');
          if (sitefBuf.length >= 4) {
            const respLen = parseInt(sitefBuf.substring(0, 4));
            if (sitefBuf.length >= 4 + respLen) {
              client.destroy();
              const response = sitefBuf.substring(4);
              const resultCode = response.substring(0, 4).trim();
              if (resultCode === '0000' || resultCode === '000') {
                socket.emit('mp_status_pagamento', { status: 'aprovado', payment: { raw: response }, msg: '✅ Pagamento SiTef aprovado!' });
              } else {
                socket.emit('mp_status_pagamento', { status: 'failed', msg: `Transação SiTef recusada. Código: ${resultCode}` });
              }
            }
          }
        });
        client.on('timeout', () => { client.destroy(); socket.emit('mp_status_pagamento', { status: 'failed', msg: 'Timeout SiTef. Servidor SiTef inacessível.' }); });
        client.on('error', (err) => { socket.emit('mp_status_pagamento', { status: 'failed', msg: `Erro SiTef: ${err.message}` }); });
        return;
      }

      socket.emit('mp_status_pagamento', { status: 'failed', msg: `Provedor desconhecido: ${provider}` });
    });
  });

  socket.on('mp_cancelar_pagamento', () => {
    if (mpPollInterval) {
      clearInterval(mpPollInterval);
      mpPollInterval = null;
    }

    if (!mpCurrentIntentId || !mpCurrentDeviceId) {
      socket.emit('mp_status_pagamento', { status: 'failed', msg: 'Nenhuma transação activa para cancelar.' });
      return;
    }

    db.all(`SELECT * FROM configuracoes`, async (err, rows) => {
      if (err) return;
      const config = {};
      if (rows) rows.forEach(r => config[r.chave] = r.valor);
      const token = config.mp_access_token;

      if (token) {
        try {
          await fetch(`https://api.mercadopago.com/point/integration-api/devices/${mpCurrentDeviceId}/payment-intents/${mpCurrentIntentId}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
        } catch (cancelErr) {
          console.error('[Mercado Pago] Erro ao cancelar intent:', cancelErr);
        }
      }
      
      socket.emit('mp_status_pagamento', { status: 'cancelado', msg: 'Cobrança cancelada pelo operador.' });
      mpCurrentIntentId = null;
      mpCurrentDeviceId = null;
    });
  });

  // Dashboard Stats
  socket.on('get_dashboard_stats', () => {
    const stats = {};
    const today = getLocalDateOnly();
    const firstDayOfMonth = getLocalDateOnly().slice(0, 8) + '01'; // YYYY-MM-01
    
    let queries = 0;
    const checkDone = () => {
      queries--;
      if (queries === 0) {
        if (stats.pedidosHoje > 0) {
          stats.ticketMedio = stats.faturamentoHoje / stats.pedidosHoje;
        } else {
          stats.ticketMedio = 0;
        }
        const dayOfMonth = parseInt(today.slice(8,10));
        const year = parseInt(today.slice(0,4));
        const month = parseInt(today.slice(5,7));
        const totalDaysInMonth = new Date(year, month, 0).getDate();
        stats.diasTranscorridos = dayOfMonth;
        stats.diasTotalMes = totalDaysInMonth;
        stats.projecaoMensal = dayOfMonth > 0 ? (stats.faturamentoMensal / dayOfMonth) * totalDaysInMonth : 0;
        socket.emit('dashboard_stats_result', stats);
      }
    };

    queries++;
    // Faturamento Hoje (from movimentacoes of type Entrada today)
    db.get(`SELECT SUM(valor) as fatHoje FROM movimentacoes WHERE tipo='Entrada' AND date(data) = ?`, [today], (err, row) => {
      stats.faturamentoHoje = row ? row.fatHoje || 0 : 0;
      checkDone();
    });

    queries++;
    // Faturamento Mensal (from movimentacoes of type Entrada this month)
    db.get(`SELECT SUM(valor) as fatMensal FROM movimentacoes WHERE tipo='Entrada' AND date(data) >= ?`, [firstDayOfMonth], (err, row) => {
      stats.faturamentoMensal = row ? row.fatMensal || 0 : 0;
      checkDone();
    });

    queries++;
    // Pedidos Hoje (count from pedidos where createdAt is today)
    db.get(`SELECT count(DISTINCT time || localName) as qtdPedidos FROM pedidos WHERE date(createdAt) = ? AND status='Finalizado'`, [today], (err, row) => {
      stats.pedidosHoje = row ? row.qtdPedidos || 0 : 0;
      checkDone();
    });

    queries++;
    // Vendas por dia (últimos 7 dias)
    db.all(`SELECT date(data) as d, SUM(valor) as total FROM movimentacoes WHERE tipo='Entrada' GROUP BY date(data) ORDER BY date(data) DESC LIMIT 7`, (err, rows) => {
      stats.vendasDias = rows ? rows.reverse() : [];
      checkDone();
    });

    queries++;
    // Receitas e Despesas (Mês Atual)
    db.all(`SELECT tipo, SUM(valor) as total FROM movimentacoes WHERE date(data) >= ? GROUP BY tipo`, [firstDayOfMonth], (err, rows) => {
      stats.receitasDespesas = rows || [];
      checkDone();
    });

    queries++;
    // Produtos Mais Vendidos (All time, top 5)
    db.all(`SELECT productName, SUM(quantity) as qty FROM pedidos WHERE status='Finalizado' GROUP BY productName ORDER BY qty DESC LIMIT 5`, (err, rows) => {
      stats.produtosPopulares = rows || [];
      checkDone();
    });

    queries++;
    // Categorias mais vendidas (All time, top 5)
    db.all(`SELECT p.categoria, SUM(pd.quantity) as qty FROM pedidos pd JOIN produtos p ON pd.productName = p.nome WHERE pd.status='Finalizado' AND p.categoria IS NOT NULL GROUP BY p.categoria ORDER BY qty DESC LIMIT 5`, (err, rows) => {
      stats.categoriasPopulares = rows || [];
      checkDone();
    });

    queries++;
    // Formas de pagamento
    db.all(`SELECT forma_pagamento, COUNT(*) as qty FROM movimentacoes WHERE tipo='Entrada' GROUP BY forma_pagamento`, (err, rows) => {
      stats.formasPagamento = rows || [];
      checkDone();
    });

    queries++;
    // Entregas por entregador
    db.all(`SELECT f.nome as entregador, COUNT(DISTINCT pd.time || pd.localName) as entregas FROM pedidos pd JOIN funcionarios f ON pd.entregador_id = f.id WHERE pd.status='Finalizado' GROUP BY pd.entregador_id ORDER BY entregas DESC LIMIT 5`, (err, rows) => {
      stats.entregadores = rows || [];
      checkDone();
    });

    queries++;
    // Clientes top
    db.all(`SELECT c.nome, COUNT(DISTINCT pd.time || pd.localName) as pedidos, SUM(CAST(pd.total AS REAL)) as gasto FROM pedidos pd JOIN clientes c ON pd.cliente_id = c.id WHERE pd.status='Finalizado' GROUP BY pd.cliente_id ORDER BY gasto DESC LIMIT 5`, (err, rows) => {
      stats.topClientes = rows || [];
      checkDone();
    });
  });

  socket.on('reservar_mesa', ({ mesaName, observacao }) => {
    db.run(`UPDATE mesas SET status = 'Reservada', observacao = ? WHERE nome = ?`, [observacao, mesaName], () => {
      db.all(`SELECT * FROM mesas`, (err, rows) => {
        io.emit('mesas_atualizadas', rows || []);
      });
    });
  });

  socket.on('cancelar_reserva', ({ mesaName }) => {
    db.run(`UPDATE mesas SET status = 'Disponível', observacao = '' WHERE nome = ?`, [mesaName], () => {
      db.all(`SELECT * FROM mesas`, (err, rows) => {
        io.emit('mesas_atualizadas', rows || []);
      });
    });
  });

  // --- RH / Controle de Ponto e Vales ---
  
  socket.on('bater_ponto', ({ funcionario_id, acao, token }) => {
    if (token !== pontoToken) { return socket.emit('bater_ponto_error', 'QR Code expirado ou inválido! Escaneie novamente no Caixa.'); }
    const hoje = getLocalDateOnly();
    const agora = getLocalTimestamp();

    if (acao === 'entrada') {
      db.run(`INSERT INTO pontos (funcionario_id, entrada, data) VALUES (?, ?, ?)`, [funcionario_id, agora, hoje], function(err) {
        if (!err) socket.emit('ponto_registrado', { id: this.lastID, acao });
      });
    } else if (acao === 'saida') {
      db.get(`SELECT p.*, f.valor_hora, f.tipo_remuneracao, f.valor_dia, f.valor_semana, f.valor_mes FROM pontos p JOIN funcionarios f ON p.funcionario_id = f.id WHERE p.funcionario_id = ? AND p.saida IS NULL ORDER BY p.id DESC LIMIT 1`, [funcionario_id], (err, row) => {
        if (err) {
          return socket.emit('bater_ponto_error', 'Erro ao buscar ponto em aberto: ' + err.message);
        }
        if (row) {
          const t1 = new Date(row.entrada).getTime();
          const t2 = new Date(agora).getTime();
          const horasTrabalhadas = (t2 - t1) / (1000 * 60 * 60);
          
          let valorPagar = 0;
          const tipoRem = row.tipo_remuneracao || 'hora';
          if (tipoRem === 'hora') {
            valorPagar = horasTrabalhadas * (row.valor_hora || 0);
          } else if (tipoRem === 'dia') {
            valorPagar = row.valor_dia || 0;
          } else if (tipoRem === 'semana') {
            valorPagar = (row.valor_semana || 0) / 6; // Standard proration (6 working days/week)
          } else if (tipoRem === 'mes') {
            valorPagar = (row.valor_mes || 0) / 26;   // Standard proration (26 working days/month)
          }

          db.run(`UPDATE pontos SET saida = ?, total_horas = ?, valor_pagar = ? WHERE id = ?`, [agora, horasTrabalhadas, valorPagar, row.id], (err2) => {
            if (!err2) {
              socket.emit('ponto_registrado', { id: row.id, acao, horasTrabalhadas, valorPagar });
            } else {
              socket.emit('bater_ponto_error', 'Erro ao registrar saída: ' + err2.message);
            }
          });
        } else {
          socket.emit('bater_ponto_error', 'Nenhuma entrada em aberto encontrada para registrar a saída.');
        }
      });
    }
  });

  socket.on('get_metricas_funcionario', (funcionario_id) => {
    db.all(`SELECT * FROM pontos WHERE funcionario_id = ? ORDER BY id DESC`, [funcionario_id], (err, pontos) => {
      if (err) {
        console.error('Error fetching pontos:', err);
        socket.emit('metricas_funcionario_response', { pontos: [], vales: [], pagamentos: [] });
        return;
      }
      db.all(`SELECT * FROM vales WHERE funcionario_id = ? ORDER BY id DESC`, [funcionario_id], (err2, vales) => {
        if (err2) {
          console.error('Error fetching vales:', err2);
          socket.emit('metricas_funcionario_response', { pontos: pontos || [], vales: [], pagamentos: [] });
          return;
        }
        db.all(`SELECT * FROM funcionarios_pagamentos WHERE funcionario_id = ? ORDER BY data_pagamento DESC`, [funcionario_id], (err3, pagamentos) => {
          socket.emit('metricas_funcionario_response', { pontos: pontos || [], vales: vales || [], pagamentos: pagamentos || [] });
        });
      });
    });
  });

  socket.on('solicitar_vale', ({ funcionario_id, valor }) => {
    const agora = getLocalTimestamp();
    db.run(`INSERT INTO vales (funcionario_id, data_pedido, valor, status) VALUES (?, ?, ?, 'Pendente')`, [funcionario_id, agora, valor], function(err) {
      if (!err) {
        socket.emit('vale_solicitado_success');
      } else {
        console.error('Error requesting vale:', err);
        socket.emit('bater_ponto_error', 'Erro ao solicitar vale: ' + err.message);
      }
    });
  });

  socket.on('update_valor_hora', ({ funcionario_id, valor_hora }) => {
    db.run(`UPDATE funcionarios SET valor_hora = ? WHERE id = ?`, [valor_hora, funcionario_id], (err) => {
      if (!err) socket.emit('update_valor_hora_success');
    });
  });

    socket.on('get_cupons_list', () => {
      db.all(`SELECT * FROM cupons ORDER BY data_criacao DESC`, (err, rows) => {
        if (!err) socket.emit('cupons_list', rows || []);
      });
    });

    socket.on('delete_cupom', (data) => {
        const codigo = typeof data === 'object' ? data.codigo : data;
        db.run(`DELETE FROM cupons WHERE codigo = ?`, [codigo], (err) => {
        if (!err) io.emit('cupons_atualizados');
      });
    });

    registerAdminRhEvents(socket);

    // --- MÓDULO FISCAL NFC-E SOCKETS ---
    socket.on('emitir_nfce', async (data, ack) => {
      try {
        db.all(`SELECT * FROM configuracoes`, async (errConfig, configRows) => {
          const config = {};
          if (configRows) configRows.forEach(r => config[r.chave] = r.valor);
          
          const res = await nfceService.emitirNFCe({
            db,
            pedidoId: data.pedidoId,
            localName: data.mesaName || data.localName || 'Mesa',
            items: data.items || [],
            totalValue: data.totalValue || data.total || 0,
            cpfCnpj: data.cpfCnpj || '',
            clienteNome: data.clienteNome || '',
            paymentMethods: data.paymentMethods || (data.payments ? data.payments.map(p => p.metodo).join(', ') : 'Dinheiro'),
            config
          });

          if (typeof ack === 'function') ack(res);
          socket.emit('nfce_emitida_sucesso', res);
          
          db.all(`SELECT id, pedido_id, localName, cliente_nome, cpf_cnpj, valor_total, chave_acesso, numero_nota, serie, ambiente, status, protocolo, created_at FROM nfce_notas ORDER BY id DESC`, (errNotas, rows) => {
            io.emit('nfce_lista_atualizada', rows || []);
          });
        });
      } catch (e) {
        console.error('Erro na emissão de NFC-e:', e);
        if (typeof ack === 'function') ack({ ok: false, erro: e.message });
        socket.emit('erro_nfce', 'Erro na emissão de NFC-e: ' + e.message);
      }
    });

    socket.on('get_nfce_notas', (options = {}) => {
      let limit = 50; // default for 'sessao'
      if (options.period === 'semana') {
        limit = 300;
      }
      
      db.all(`SELECT id, pedido_id, localName, cliente_nome, cpf_cnpj, valor_total, chave_acesso, numero_nota, serie, ambiente, status, protocolo, created_at FROM nfce_notas ORDER BY id DESC LIMIT ?`, [limit], (err, rows) => {
        socket.emit('nfce_lista_atualizada', rows || []);
      });
    });

    socket.on('cancelar_nfce', async ({ id, motivo }, ack) => {
      const res = await nfceService.cancelarNFCe(db, id, motivo);
      if (typeof ack === 'function') ack(res);
      db.all(`SELECT id, pedido_id, localName, cliente_nome, cpf_cnpj, valor_total, chave_acesso, numero_nota, serie, ambiente, status, protocolo, created_at FROM nfce_notas ORDER BY id DESC`, (err, rows) => {
        io.emit('nfce_lista_atualizada', rows || []);
      });
    });

    
          socket.on('get_nfce_notas_paginated', (opts, callback) => {
      let page = opts.page || 1;
      let limit = opts.limit || 15;
      let offset = (page - 1) * limit;
      let search = opts.search ? '%' + opts.search + '%' : '';
      let startDate = opts.startDate ? opts.startDate + ' 00:00:00' : '';
      let endDate = opts.endDate ? opts.endDate + ' 23:59:59' : '';

      let query = 'SELECT id, pedido_id, localName, cliente_nome, cpf_cnpj, valor_total, chave_acesso, numero_nota, serie, ambiente, status, protocolo, created_at FROM nfce_notas WHERE 1=1';
      let countQuery = 'SELECT COUNT(*) as total FROM nfce_notas WHERE 1=1';
      let params = [];

      if (startDate) { query += ' AND created_at >= ?'; countQuery += ' AND created_at >= ?'; params.push(startDate); }
      if (endDate) { query += ' AND created_at <= ?'; countQuery += ' AND created_at <= ?'; params.push(endDate); }
      if (search) { 
        let searchClause = ' AND (cliente_nome LIKE ? OR cpf_cnpj LIKE ? OR numero_nota LIKE ?)';
        query += searchClause; 
        countQuery += searchClause; 
        params.push(search, search, search); 
      }

      db.get(countQuery, params, (err, countRow) => {
        if (err) { if (typeof callback === 'function') callback({ error: err.message }); return; }
        
        query += ' ORDER BY id DESC LIMIT ? OFFSET ?';
        let pParams = [...params, limit, offset];
        
        db.all(query, pParams, (err, rows) => {
          if (err) { if (typeof callback === 'function') callback({ error: err.message }); return; }
          if (typeof callback === 'function') callback({ data: rows || [], total: countRow.total, page, limit });
        });
      });
    });

    socket.on('get_api_logs', () => {
    db.all(`SELECT * FROM api_logs ORDER BY id DESC LIMIT 300`, (err, rows) => {
      socket.emit('api_logs_recebidos', rows || []);
    });
  });

  socket.on('get_auditoria_logs', () => {
      db.all(`SELECT * FROM auditoria ORDER BY id DESC LIMIT 200`, (err, rows) => {
        socket.emit('auditoria_logs_recebidos', rows || []);
      });
    });

    // --- Módulo de Estoque (Mobile) ---
    socket.on('buscar_produto_por_codigo', (codigo) => {
      if (!codigo) return;
      // Tenta buscar por código de barras primeiro, senão por ID
      db.get(`SELECT * FROM produtos WHERE codigo_barras = ? OR id = ? LIMIT 1`, [codigo, codigo], (err, row) => {
        if (err || !row) {
          socket.emit('produto_estoque_resultado', { error: 'Produto não encontrado' });
        } else {
          socket.emit('produto_estoque_resultado', row);
        }
      });
    });

    socket.on('atualizar_estoque', (data) => {
      const { id, quantidade, validade, operador } = data;
      if (!id || !quantidade) return;
      
      const qtdAdd = parseFloat(quantidade) || 0;
      
      db.get(`SELECT nome, estoque FROM produtos WHERE id = ?`, [id], (err, row) => {
        if (err || !row) return;
        
        const novoEstoque = (row.estoque || 0) + qtdAdd;
        
        db.run(`UPDATE produtos SET estoque = ?, validade = ? WHERE id = ?`, [novoEstoque, validade || null, id], (updateErr) => {
          if (!updateErr) {
            // Registrar auditoria
            registrarAuditoria('Entrada de Estoque', `Adicionado ${qtdAdd}x de '${row.nome}'. Novo total: ${novoEstoque}. Validade: ${validade || 'N/A'}`, operador || 'App Mobile');
            socket.emit('estoque_atualizado_sucesso', { nome: row.nome, novoEstoque });
            
            // Broadcast para atualizar listas
            db.all("SELECT * FROM produtos WHERE status = 'ativo'", (err, produtos) => {
              io.emit('produtos_atualizados', produtos || []);
            });
          }
        });
      });
    });



  socket.on('cancelar_mesa', async ({ mesaName, motivo, senha }) => {
    if (!mesaName) return;
    if (!(await verificarSenhaAdmin(senha))) {
      socket.emit('erro_caixa', 'Senha de administrador incorreta!');
      return;
    }
    console.log(`[Admin] Mesa "${mesaName}" cancelada por admin. Motivo: ${motivo}`);
    db.run(
      `UPDATE pedidos SET status = 'Cancelado' WHERE (localName = ? OR mesa_grupo = ?) AND status NOT IN ('Finalizado','Entregue','Pago','Cancelado')`,
      [mesaName, mesaName],
      function(err) {
        if (err) { console.error(err); socket.emit('erro_caixa', 'Erro ao cancelar pedidos.'); return; }
        db.run(`UPDATE mesas SET status = 'Disponível', observacao = '' WHERE nome = ?`, [mesaName], () => {
          db.all(`SELECT * FROM mesas`, (e, r) => io.emit('mesas_atualizadas', r || []));
          io.emit('mesa_finalizada', { mesaName });
          io.emit('pedidos_atualizados', []);
        });
      }
    );
  });

  socket.on('zerar_todos_dados', async ({ senha }) => {
    if (!(await verificarSenhaAdmin(senha))) {
      socket.emit('erro_caixa', 'Senha de administrador incorreta!');
      return;
    }
    console.log('[Admin] ZERANDO TODOS OS DADOS DO SISTEMA');
    const allowedTables = ['pedidos', 'movimentacoes', 'turnos', 'clientes', 'promocoes', 'cupons', 'beneficios', 'nfce', 'ia_config', 'mesas', 'produtos'];
    const tables = allowedTables.filter(t => /^[a-z_]+$/.test(t));
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      tables.forEach(t => { db.run(`DELETE FROM ${t}`); });
      db.run('COMMIT', () => {
        db.all('SELECT * FROM mesas', (e, r) => io.emit('mesas_atualizadas', r || []));
        io.emit('pedidos_atualizados', []);
        io.emit('clientes_atualizados', []);
        socket.emit('zerar_concluido', { ok: true });
      });
    });
  });

  socket.on('disconnect', () => {
    activeSockets.delete(socket.id);
    if (mpPollInterval) {
      clearInterval(mpPollInterval);
      mpPollInterval = null;
    }
    console.log(`[Socket] Dispositivo desconectado: ${socket.id}`);
  });
});


// --- RETRO API PARA ANDROID 3.2 ---
app.get('/api/retro/mesas', (req, res) => {
  db.all("SELECT * FROM mesas", (err, mesas) => {
    if (err) return res.status(500).json({ error: 'Erro no banco' });
    db.all("SELECT * FROM pedidos WHERE status != 'Finalizado' ORDER BY createdAt ASC", (err, pedidos) => {
      if (err) return res.status(500).json({ error: 'Erro no banco' });
      res.json({ mesas: mesas || [], pedidos: pedidos || [] });
    });
  });
});

app.get('/api/retro/cardapio', (req, res) => {
  db.all("SELECT * FROM produtos WHERE LOWER(status) != 'inativo' OR status IS NULL", (err, produtos) => {
    if (err) return res.status(500).json({ error: 'Erro no banco' });
    res.json({ produtos: produtos || [] });
  });
});

app.post('/api/retro/pedido', (req, res) => {
  if (licenseManager.isRestricted()) {
    return res.status(403).json({ error: 'Sistema em modo restrito. Ative a licença.' });
  }
  const pedido = req.body;
  if (!pedido || !pedido.mesa_comanda) return res.status(400).json({ error: 'Dados inválidos' });
  
  let status = pedido.status_inicial || 'Em preparo';
  
  db.get(`SELECT status FROM mesas WHERE nome = ?`, [pedido.mesa_comanda], (err, rowMesa) => {
    if (rowMesa && rowMesa.status !== 'Fechando') {
      db.run(`UPDATE mesas SET status = 'Ocupada' WHERE nome = ? AND status = 'Disponível'`, [pedido.mesa_comanda]);
    }
  });

  const query = `
    INSERT INTO pedidos (
      userName, localName, productName, quantity, options, observations,
      status, mesa_comanda, mesa_grupo, isCommand,
      printer, sector, total,
      cliente_id, is_delivery
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [
    pedido.userName || 'Garçom Retro',
    pedido.localName || pedido.mesa_comanda,
    pedido.productName,
    pedido.quantity || 1,
    pedido.options || '[]',
    pedido.observations || '',
    status,
    pedido.mesa_comanda,
    pedido.mesa_grupo || pedido.mesa_comanda,
    pedido.isCommand || 0,
    pedido.printer || '',
    pedido.sector || '',
    pedido.total || 0,
    pedido.cliente_id || null,
    pedido.is_delivery || 0
  ];

  db.run(query, params, function (err) {
    if (err) {
      console.error('Erro /api/retro/pedido:', err);
      return res.status(500).json({ error: 'Erro ao inserir pedido' });
    }
    const novoId = this.lastID;
    const novoItem = { id: novoId, ...pedido, status, createdAt: new Date().toISOString() };
    
    io.emit('novo_pedido_sync', [novoItem]);
    
    db.all("SELECT * FROM mesas", (e, m) => {
      if(!e) io.emit('mesas_atualizadas', m || []);
    });
    
    res.json({ success: true, id: novoId });
  });
});
// ---------------------------------

// --- REST API NFC-E ---
app.get('/api/nfce/notas', (req, res) => {
  db.all(`SELECT id, pedido_id, localName, cliente_nome, cpf_cnpj, valor_total, chave_acesso, numero_nota, serie, ambiente, status, protocolo, created_at FROM nfce_notas ORDER BY id DESC`, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.get('/api/nfce/danfe/:id', (req, res) => {
  db.get(`SELECT * FROM nfce_notas WHERE id = ?`, [req.params.id], (err, nota) => {
    if (err || !nota) return res.status(404).send('Nota Fiscal não encontrada');
    db.all(`SELECT * FROM configuracoes`, (errCfg, rows) => {
      const config = {};
      if (rows) rows.forEach(r => config[r.chave] = r.valor);
      const danfeHtml = nota.danfe_html || nfceService.gerarDANFEHTML(nota, config);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(danfeHtml);
    });
  });
});

app.get('/api/nfce/xml/:id', (req, res) => {
  db.get(`SELECT * FROM nfce_notas WHERE id = ?`, [req.params.id], (err, nota) => {
    if (err || !nota) return res.status(404).send('Nota Fiscal não encontrada');
    db.all(`SELECT * FROM configuracoes`, (errCfg, rows) => {
      const config = {};
      if (rows) rows.forEach(r => config[r.chave] = r.valor);
      const xml = nota.xml_content || nfceService.gerarXMLNFCe(nota, config);
      res.setHeader('Content-Type', 'application/xml');
      res.setHeader('Content-Disposition', `attachment; filename=NFCe_${nota.chave_acesso}.xml`);
      res.send(xml);
    });
  });
});

app.post('/api/nfce/emitir', async (req, res) => {
  db.all(`SELECT * FROM configuracoes`, async (errConfig, configRows) => {
    const config = {};
    if (configRows) configRows.forEach(r => config[r.chave] = r.valor);
    const result = await nfceService.emitirNFCe({ db, ...req.body, config });
    res.json(result);
  });
});

// --- CONFIGS API ---
app.get('/api/server-status', (req, res) => {
  const remoteIp = req.socket.remoteAddress;
  // Allow localhost and local private network subnets (192.168.x.x, 10.x.x.x, 172.16-31.x.x, etc.)
  const isPrivate = remoteIp === '127.0.0.1' || remoteIp === '::1' || remoteIp === '::ffff:127.0.0.1' ||
                    remoteIp.startsWith('192.168.') || remoteIp.startsWith('::ffff:192.168.') ||
                    remoteIp.startsWith('10.') || remoteIp.startsWith('::ffff:10.') ||
                    remoteIp.startsWith('172.') || remoteIp.startsWith('::ffff:172.');
  if (!isPrivate) {
    return res.status(403).send('Acesso não autorizado.');
  }

  const connections = [];
  activeSockets.forEach(s => {
    connections.push({
      ip: s.ip,
      device: s.device,
      user: s.user
    });
  });

  const protocol = typeof PROTOCOL !== 'undefined' ? PROTOCOL : 'http';

  res.json({
    status: 'rodando',
    protocol: protocol,
    port: PORT,
    ip: getLocalIp(),
    connections: connections,
    logs: logLines
  });
});


// --- API FORMAS DE PAGAMENTO & CARTÕES ---
app.get('/api/formas-pagamento', (req, res) => {
  db.all(`SELECT * FROM formas_pagamento ORDER BY ordem ASC, id ASC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/api/formas-pagamento', (req, res) => {
  const { id, nome, tipo, taxa, prazo_dias, ativo, icone } = req.body || {};
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });

  if (id) {
    db.run(
      `UPDATE formas_pagamento SET nome = ?, tipo = ?, taxa = ?, prazo_dias = ?, ativo = ?, icone = ? WHERE id = ?`,
      [nome, tipo || 'credito', parseFloat(taxa) || 0, parseInt(prazo_dias) || 0, ativo ? 1 : 0, icone || 'ph-credit-card', id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        broadcastFormasPagamento();
        res.json({ success: true, id });
      }
    );
  } else {
    db.run(
      `INSERT INTO formas_pagamento (nome, tipo, taxa, prazo_dias, ativo, icone) VALUES (?, ?, ?, ?, ?, ?)`,
      [nome, tipo || 'credito', parseFloat(taxa) || 0, parseInt(prazo_dias) || 0, ativo !== undefined ? (ativo ? 1 : 0) : 1, icone || 'ph-credit-card'],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        const newId = this.lastID;
        broadcastFormasPagamento();
        res.json({ success: true, id: newId });
      }
    );
  }
});

app.post('/api/formas-pagamento/:id/toggle', (req, res) => {
  const { id } = req.params;
  const { ativo } = req.body || {};
  db.run(`UPDATE formas_pagamento SET ativo = ? WHERE id = ?`, [ativo ? 1 : 0, id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    broadcastFormasPagamento();
    res.json({ success: true });
  });
});

app.delete('/api/formas-pagamento/:id', (req, res) => {
  const { id } = req.params;
  db.get(`SELECT nome FROM formas_pagamento WHERE id = ?`, [id], (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'Forma de pagamento não encontrada.' });
    db.get(`SELECT COUNT(*) as count FROM pedidos WHERE paymentMethod = ?`, [row.nome], (e, r) => {
      if (!e && r && r.count > 0) {
        return res.status(400).json({ error: `"${row.nome}" não pode ser excluído pois já foi utilizado em ${r.count} pedido(s). Apenas desative-o.` });
      }
      db.run(`DELETE FROM formas_pagamento WHERE id = ?`, [id], function (err2) {
        if (err2) return res.status(500).json({ error: err2.message });
        broadcastFormasPagamento();
        res.json({ success: true });
      });
    });
  });
});


// --- API AUDITORIA & LOGS ---
app.get('/api/auditoria', verificarToken, (req, res) => {
  db.all(`SELECT * FROM auditoria ORDER BY id DESC LIMIT 300`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.get('/api/logs-api', (req, res) => {
  db.all(`SELECT * FROM api_logs ORDER BY id DESC LIMIT 300`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});


// --- API DE GERENCIAMENTO DE DISPOSITIVOS ---
app.get('/api/dispositivos', verificarToken, (req, res) => {
  const deviceList = Array.from(activeSockets.values()).map(d => ({
    ...d,
    tempoConectadoStr: getTempoConectadoStr(d.connectedAt)
  }));
  res.json(deviceList);
});

app.post('/api/dispositivos/:id/renomear', verificarToken, (req, res) => {
  const { id } = req.params;
  const { novoNome } = req.body || {};
  if (!novoNome) return res.status(400).json({ error: 'Nome é obrigatório' });

  const conn = activeSockets.get(id);
  if (conn) {
    conn.model = novoNome.trim();
    conn.device = `${conn.model} (${conn.os} • ${conn.browser})`;
    const targetSocket = io.sockets.sockets.get(id);
    if (targetSocket) {
      targetSocket.emit('apelido_atualizado_remoto', { apelido: novoNome.trim() });
    }
    io.emit('connected_devices_updated');
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Dispositivo não encontrado ou desconectado' });
  }
});

app.post('/api/dispositivos/:id/desconectar', verificarToken, (req, res) => {
  const { id } = req.params;
  const targetSocket = io.sockets.sockets.get(id);
  if (targetSocket) {
    targetSocket.emit('sessao_derrubada_remotamente');
    targetSocket.disconnect(true);
    activeSockets.delete(id);
    io.emit('connected_devices_updated');
    res.json({ success: true });
  } else {
    activeSockets.delete(id);
    res.json({ success: true });
  }
});


// --- ROTA DE PEDIDOS DA FILA ---
app.get('/api/pedidos', (req, res) => {
  db.all("SELECT * FROM pedidos WHERE status NOT IN ('Finalizado','Entregue','Pago','Cancelado') ORDER BY createdAt ASC", [], (err, rows) => {
    res.json(rows || []);
  });
});

app.get('/api/config', verificarToken, (req, res) => {
  db.all(`SELECT * FROM configuracoes`, (err, rows) => {
    if (err) return res.status(500).send(err);
    const cfgs = {};
    if (rows) rows.forEach(r => cfgs[r.chave] = r.valor);
    res.json(cfgs);
  });
});

app.post('/api/config', verificarToken, (req, res) => {
  const configs = req.body;
  if (!configs) return res.status(400).send('Dados inválidos');
  
  db.serialize(() => {
    db.run("BEGIN TRANSACTION;");
    Object.keys(configs).forEach(chave => {
      const valor = typeof configs[chave] === 'object' ? JSON.stringify(configs[chave]) : String(configs[chave]);
      db.run(`INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);
    });
    db.run("COMMIT;");
  });
  
  // Emite para todo mundo que as configurações mudaram (para recarregar menus)
  setTimeout(() => {
    io.emit('configuracoes_atualizadas');
    broadcastProdutos(); // Força envio atualizado com Destaques
    res.json({ success: true });
  }, 500);
});

// --- ENDPOINT TESTE DE CONEXÃO COM MAQUININHA ---
app.post('/api/maquininha/testar', async (req, res) => {
  const { provedor } = req.body || {};
  if (!provedor || provedor === 'none') {
    return res.json({ ok: false, msg: 'Nenhum provedor selecionado.' });
  }
  db.all(`SELECT * FROM configuracoes`, async (err, rows) => {
    if (err) return res.json({ ok: false, msg: 'Erro ao carregar configurações.' });
    const config = {};
    if (rows) rows.forEach(r => config[r.chave] = r.valor);
    try {
      if (provedor === 'mercadopago') {
        const token = config.mp_access_token;
        const deviceId = config.mp_device_id;
        if (!token || !deviceId) return res.json({ ok: false, msg: 'Access Token ou Device ID não configurados.' });
        const response = await fetch(`https://api.mercadopago.com/point/integration-api/devices/${deviceId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          return res.json({ ok: true, msg: `Mercado Pago OK — Device: ${data.id || deviceId} | Modo: ${data.operating_mode || 'online'}` });
        } else {
          const errData = await response.json().catch(() => ({}));
          return res.json({ ok: false, msg: `Mercado Pago: ${errData.message || 'HTTP ' + response.status}` });
        }
      }
      if (provedor === 'stone') {
        const stonePorta = config.stone_porta || '8080';
        const stoneCode = config.stone_stonecode;
        if (!stoneCode) return res.json({ ok: false, msg: 'Stone Code não configurado.' });
        const response = await fetch(`http://localhost:${stonePorta}/health`, { signal: AbortSignal.timeout(5000) });
        if (response.ok) {
          return res.json({ ok: true, msg: `Stone Client TEF respondeu na porta ${stonePorta}. Stone Code: ${stoneCode}` });
        } else {
          return res.json({ ok: false, msg: `Stone Client respondeu com HTTP ${response.status}` });
        }
      }
      if (provedor === 'pagbank') {
        const pgToken = config.pagbank_token;
        const pgTerminal = config.pagbank_terminal;
        if (!pgToken) return res.json({ ok: false, msg: 'Token PagBank não configurado.' });
        const response = await fetch(`https://api.pagseguro.com/terminal/v1/terminals/${pgTerminal || ''}`, {
          headers: { 'Authorization': `Bearer ${pgToken}` }
        });
        if (response.ok) {
          const data = await response.json();
          return res.json({ ok: true, msg: `PagBank OK — Terminal: ${data.id || pgTerminal} | Status: ${data.status || 'online'}` });
        } else {
          const errData = await response.json().catch(() => ({}));
          return res.json({ ok: false, msg: `PagBank: ${errData.message || errData.error || 'HTTP ' + response.status}` });
        }
      }
      if (provedor === 'sitef') {
        const sitefIp = config.sitef_ip;
        const sitefPorta = parseInt(config.sitef_porta || '4096');
        if (!sitefIp) return res.json({ ok: false, msg: 'IP do servidor SiTef não configurado.' });
        const net = require('net');
        await new Promise((resolve) => {
          const socket = new net.Socket();
          socket.setTimeout(5000);
          socket.connect(sitefPorta, sitefIp, () => {
            socket.destroy();
            res.json({ ok: true, msg: `SiTef: conexão TCP OK com ${sitefIp}:${sitefPorta}` });
            resolve();
          });
          socket.on('timeout', () => { socket.destroy(); res.json({ ok: false, msg: `SiTef: timeout ao conectar em ${sitefIp}:${sitefPorta}` }); resolve(); });
          socket.on('error', (err) => { res.json({ ok: false, msg: `SiTef: ${err.message}` }); resolve(); });
        });
        return;
      }
      return res.json({ ok: false, msg: `Provedor desconhecido: ${provedor}` });
    } catch (e) {
      return res.json({ ok: false, msg: `Erro ao testar: ${e.message}` });
    }
  });
});

// --- BACKUP & RESTORE API ---
app.get('/api/backup', verificarToken, (req, res) => {
  res.download(dbPath, 'backup.sqlite', (err) => {
    if (err) {
      console.error("Erro no download do backup:", err);
      if (!res.headersSent) {
        res.status(500).send("Erro ao gerar backup: " + err.message);
      }
    }
  });
});

app.post('/api/restore', verificarToken, upload.single('backup'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado.' });
  }

  const tempFilePath = req.file.path;
  const testDb = new sqlite3.Database(tempFilePath, sqlite3.OPEN_READONLY, (testErr) => {
    if (testErr) {
      console.error("Arquivo de backup inválido (sqlite open):", testErr);
      try { fs.unlinkSync(tempFilePath); } catch(e){}
      return res.json({ success: false, error: 'O arquivo enviado não é um banco de dados SQLite válido.' });
    }

    testDb.get("SELECT name FROM sqlite_master WHERE type='table' LIMIT 1", [], (queryErr, row) => {
      testDb.close();

      if (queryErr) {
        console.error("Arquivo de backup inválido (sqlite query):", queryErr);
        try { fs.unlinkSync(tempFilePath); } catch(e){}
        return res.json({ success: false, error: 'O arquivo de banco de dados enviado está corrompido ou é inválido.' });
      }

      // Proceder com a restauração
      db.close((closeErr) => {
        if (closeErr) {
          console.error("Erro ao fechar o banco de dados para restore:", closeErr);
          // Tentar reabrir o banco original
          db = new sqlite3.Database(dbPath, (err) => {
            if (err) console.error("Erro ao reabrir banco após falha de fechamento:", err);
          });
          try { fs.unlinkSync(tempFilePath); } catch(e){}
          return res.json({ success: false, error: 'Erro ao fechar banco de dados atual.' });
        }

        try {
          fs.copyFileSync(tempFilePath, dbPath);
          try { fs.unlinkSync(tempFilePath); } catch(e){}

          // Reabrir conexão com o banco restaurado
          db = new sqlite3.Database(dbPath, (openErr) => {
            if (openErr) {
              console.error("Erro ao reabrir banco restaurado:", openErr);
              return res.json({ success: false, error: 'Erro ao conectar ao banco restaurado.' });
            }

            console.log("Banco de dados restaurado com sucesso!");
            
            // Emitir notificações para atualizar os clientes
            io.emit('configuracoes_atualizadas');
            db.all(`SELECT * FROM produtos`, (errProd, pRows) => {
              if (!errProd) io.emit('produtos_atualizados', pRows || []);
            });
            db.all(`SELECT * FROM mesas`, (errMesa, mRows) => {
              if (!errMesa) io.emit('mesas_atualizadas', mRows || []);
            });

            res.json({ success: true });
          });
        } catch (copyErr) {
          console.error("Erro ao copiar arquivo restaurado:", copyErr);
          // Tentar reabrir o banco original
          db = new sqlite3.Database(dbPath);
          try { fs.unlinkSync(tempFilePath); } catch(e){}
          res.json({ success: false, error: 'Erro de E/S ao substituir o banco de dados.' });
        }
      });
    });
  });
});

let PORT = 3000;
try {
  const portFilePath = path.join(__dirname, 'port.txt');
  if (fs.existsSync(portFilePath)) {
    PORT = parseInt(fs.readFileSync(portFilePath, 'utf8').trim());
  }
} catch (e) {}
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}
let pontoToken = Math.random().toString(36).substring(2, 10);
setInterval(() => {
  pontoToken = Math.random().toString(36).substring(2, 10);
    io.emit('update_ponto_token', { url: `https://${getLocalIp()}:${PORT}/painel-funcionario.html?t=${pontoToken}` });
}, 30000);

const HOST = '0.0.0.0';


// --- ADMIN RH ENDPOINTS ---
function registerAdminRhEvents(socket) {
  socket.on('get_rh_data', () => {
    const valesQuery = "SELECT v.*, f.nome as funcionario_nome FROM vales v JOIN funcionarios f ON v.funcionario_id = f.id ORDER BY v.data_pedido DESC";
    const pontosQuery = "SELECT p.*, f.nome as funcionario_nome FROM pontos p JOIN funcionarios f ON p.funcionario_id = f.id ORDER BY p.entrada DESC";
    const loginsQuery = "SELECT * FROM historico_logins ORDER BY data_hora DESC LIMIT 100";
    const funcQuery = "SELECT id, nome, cargo FROM funcionarios WHERE status = 'Ativo'";
    const pedidosQuery = "SELECT userName, total, status FROM pedidos";
    const pagamentosQuery = "SELECT p.*, f.nome as funcionario_nome FROM funcionarios_pagamentos p JOIN funcionarios f ON p.funcionario_id = f.id ORDER BY p.data_pagamento DESC";

    db.all(valesQuery, (errV, vales) => {
      db.all(pontosQuery, (errP, pontos) => {
        db.all(loginsQuery, (errL, logins) => {
          db.all(funcQuery, (errF, funcs) => {
            db.all(pedidosQuery, (errPed, allPedidos) => {
              db.all(pagamentosQuery, (errPag, pagamentos) => {
                // Calculate metrics for each active employee
                const metrics = (funcs || []).map(f => {
                  const employeePontos = (pontos || []).filter(p => p.funcionario_id === f.id);
                  const totalHours = employeePontos.reduce((acc, p) => acc + (p.total_horas || 0), 0);
                  
                  const employeePedidos = (allPedidos || []).filter(p => p.userName === f.nome);
                  const totalOrders = employeePedidos.length;
                  const totalSales = employeePedidos
                    .filter(p => p.status !== 'Cancelado')
                  .reduce((acc, p) => acc + (parseFloat(String(p.total).replace(',', '.')) || 0), 0);

                return {
                  id: f.id,
                  nome: f.nome,
                  cargo: f.cargo,
                  horas_trabalhadas: totalHours,
                  total_pedidos: totalOrders,
                  total_vendas: totalSales,
                  produtividade: totalHours > 0 ? (totalOrders / totalHours) : 0
                };
              });

              socket.emit('rh_data', {
                vales: vales || [],
                pontos: pontos || [],
                logins: logins || [],
                pagamentos: pagamentos || [],
                metrics: metrics
              });
              }); // closes pagamentos
            }); // closes pedidos
          }); // closes func
        }); // closes logins
      }); // closes pontos
    }); // closes vales
  }); // closes socket.on

  socket.on('aprovar_vale', (data) => {
    const { valeId, lancarCaixa, operador } = data;
    db.get("SELECT * FROM vales WHERE id = ?", [valeId], (err, vale) => {
      if(vale && vale.status === 'Pendente') {
        db.run("UPDATE vales SET status = 'Aprovado', data_aprovacao = datetime('now', 'localtime') WHERE id = ?", [valeId], (errU) => {
          if(!errU) {
            if (lancarCaixa) {
              // Gerar saída no caixa
              db.get("SELECT id FROM turnos_caixa WHERE status = 'Aberto' ORDER BY id DESC LIMIT 1", (errC, turno) => {
                if (turno) {
                  db.run(
                    "INSERT INTO movimentacoes (turno_id, tipo, valor, descricao, data, forma_pagamento) VALUES (?, 'saida', ?, ?, datetime('now', 'localtime'), 'Dinheiro')",
                    [turno.id, vale.valor, "Adiantamento/Vale - Func. ID " + vale.funcionario_id]
                  );
                }
              });
            }
              global.registrarAuditoria(data.operador || 'Admin', 'APROVAR_VALE', `Vale ${valeId} aprovado (R$ ${vale.valor.toFixed(2)})`, 'RH e Pagamentos', 'ALTO');
            // Emit update to all
            io.emit('rh_update');
            io.emit('vale_solicitado_success'); // To trigger refresh on employee panel
          }
        });
      }
    });
  });

  socket.on('recusar_vale', (data) => {
    const valeId = (typeof data === 'object') ? data.id : data;
    const op = (typeof data === 'object') ? data.operador : 'Admin';
    db.run("UPDATE vales SET status = 'Recusado' WHERE id = ?", [valeId], (err) => {
      if(!err) {
        global.registrarAuditoria(op || 'Admin', 'RECUSAR_VALE', `Vale ${valeId} recusado`, 'RH e Pagamentos', 'MEDIO');
        io.emit('rh_update');
        io.emit('vale_solicitado_success');
      }
    });
  });

  socket.on('pagar_ponto', (data) => {
    const pontoId = (typeof data === 'object') ? data.id : data;
    const op = (typeof data === 'object') ? data.operador : 'Admin';
    db.run("UPDATE pontos SET pago = 1 WHERE id = ?", [pontoId], (err) => {
      if(!err) {
        global.registrarAuditoria(op || 'Admin', 'PAGAR_PONTO', `Ponto pago (ID: ${pontoId})`, 'RH e Pagamentos', 'MEDIO');
        io.emit('rh_update');
        io.emit('ponto_registrado', { acao: 'pagamento' }); // to trigger refresh if needed
      }
    });
  });

  // === REGISTRAR PAGAMENTO RÁPIDO COLABORADOR ===
  socket.on('registrar_pagamento_colaborador', (data) => {
    const { funcionario_id, funcionario_nome, valor_bruto, valor_liquido, observacao } = data;
    if (!funcionario_id || !valor_bruto) return;

    const dataPagamento = getLocalTimestamp();

    db.run(
      `INSERT INTO funcionarios_pagamentos (funcionario_id, data_pagamento, valor_bruto, total_vales_abatidos, total_consumo_abatido, valor_liquido, observacao) VALUES (?, ?, ?, 0, 0, ?, ?)`,
      [funcionario_id, dataPagamento, valor_bruto, valor_liquido || valor_bruto, observacao || ''],
      function(err) {
        if (err) {
          console.error('Erro ao registrar pagamento rápido:', err);
          return;
        }
        const pagId = this.lastID;

        global.registrarAuditoria('Admin', 'PAGAMENTO_COLABORADOR', `Pagamento de R$ ${(valor_liquido || valor_bruto).toFixed(2)} para ${funcionario_nome} (ID: ${funcionario_id})`, 'RH e Pagamentos', 'ALTO');

        io.emit('rh_update');

        // Broadcast celebration to ALL connected clients
        io.emit('pagamento_colaborador_celebracao', {
          funcionario_id,
          funcionario_nome,
          valor: valor_liquido || valor_bruto,
          data_pagamento: dataPagamento,
          observacao: observacao || '',
          pagamento_id: pagId
        });
      }
    );
  });

  socket.on('get_report_filters', () => {
    const filtersData = {
      garcons: [],
      clientes: [],
      locais: []
    };

    db.all(`SELECT DISTINCT userName FROM pedidos WHERE userName IS NOT NULL AND userName != '' ORDER BY userName`, [], (err, rowsG) => {
      if (!err && rowsG) filtersData.garcons = rowsG.map(r => r.userName);

      db.all(`SELECT id, nome FROM clientes ORDER BY nome`, [], (err, rowsC) => {
        if (!err && rowsC) filtersData.clientes = rowsC.map(r => ({ id: r.id, nome: r.nome }));

        db.all(`SELECT DISTINCT localName FROM pedidos WHERE localName IS NOT NULL AND localName != '' ORDER BY localName`, [], (err, rowsL) => {
          if (!err && rowsL) filtersData.locais = rowsL.map(r => r.localName);

          socket.emit('report_filters_data', filtersData);
        });
      });
    });
  });

  socket.on('get_advanced_relatorio', async ({ startDate, endDate, groupBy, clientFilter, waiterFilter, localFilter }) => {
    try {
      const startStr = startDate ? startDate + ' 00:00:00' : '1970-01-01 00:00:00';
      const endStr = endDate ? endDate + ' 23:59:59' : '2099-12-31 23:59:59';

      const clientVal = clientFilter ? clientFilter : null;
      const waiterVal = waiterFilter ? `%${waiterFilter}%` : null;
      const localVal = localFilter ? `%${localFilter}%` : null;

      const pAll = (sql, params) => new Promise((resolve) => db.all(sql, params, (err, rows) => resolve(err ? [] : rows)));
      const pGet = (sql, params) => new Promise((resolve) => db.get(sql, params, (err, row) => resolve(err ? null : row)));

      const stdParams = [
        startStr, endStr,
        clientVal, clientVal, clientVal ? `%${clientVal}%` : null,
        waiterVal, waiterVal,
        localVal, localVal
      ];

      // 1. Sold Items
      const soldItemsQuery = `
        SELECT
          p.productName,
          SUM(p.quantity) AS qty,
          SUM(CAST(p.total AS REAL)) AS valTotal
        FROM pedidos p
        LEFT JOIN clientes c ON p.cliente_id = c.id
        WHERE p.createdAt >= ? AND p.createdAt <= ?
          AND p.status != 'Cancelado'
          AND p.productName NOT LIKE 'Pgto Parcial%'
          AND CAST(p.total AS REAL) >= 0
          AND (? IS NULL OR p.cliente_id = ? OR c.nome LIKE ?)
          AND (? IS NULL OR p.userName LIKE ?)
          AND (? IS NULL OR p.localName LIKE ?)
        GROUP BY p.productName
        ORDER BY valTotal DESC
        LIMIT 150
      `;

      // 2. Orders Detail
      const ordersQuery = `
        SELECT
          p.id,
          p.productName,
          p.quantity,
          p.total,
          p.status,
          p.localName,
          p.userName,
          p.createdAt,
          p.paymentMethod,
          c.nome AS clientName
        FROM pedidos p
        LEFT JOIN clientes c ON p.cliente_id = c.id
        WHERE p.createdAt >= ? AND p.createdAt <= ?
          AND p.productName NOT LIKE 'Pgto Parcial%'
          AND (? IS NULL OR p.cliente_id = ? OR c.nome LIKE ?)
          AND (? IS NULL OR p.userName LIKE ?)
          AND (? IS NULL OR p.localName LIKE ?)
        ORDER BY p.id DESC
      `;

      // 3. Sales Period Trend (Chart)
      let groupFormat = '%Y-%m-%d';
      if (groupBy === 'hour') groupFormat = '%Y-%m-%d %H:00';
      else if (groupBy === 'week') groupFormat = '%Y-W%W';
      else if (groupBy === 'month') groupFormat = '%Y-%m';
      else if (groupBy === 'year') groupFormat = '%Y';

      const periodQuery = `
        SELECT
          strftime(?, p.createdAt) AS period,
          SUM(p.quantity) AS qty_total,
          SUM(CAST(p.total AS REAL)) AS val_total,
          COUNT(DISTINCT (p.createdAt || '-' || p.localName)) AS orders_count
        FROM pedidos p
        LEFT JOIN clientes c ON p.cliente_id = c.id
        WHERE p.createdAt >= ? AND p.createdAt <= ?
          AND p.status IN ('Finalizado', 'Pago')
          AND p.productName NOT LIKE 'Pgto Parcial%'
          AND CAST(p.total AS REAL) >= 0
          AND (? IS NULL OR p.cliente_id = ? OR c.nome LIKE ?)
          AND (? IS NULL OR p.userName LIKE ?)
          AND (? IS NULL OR p.localName LIKE ?)
        GROUP BY period
        ORDER BY period ASC
      `;

      // 4. Payment Methods Global (from transactions)
      const pmGlobalQuery = `
        SELECT forma_pagamento, SUM(valor) AS total
        FROM movimentacoes
        WHERE tipo = 'Entrada'
          AND data >= ? AND data <= ?
          AND (? IS NULL OR (descricao LIKE ? OR descricao LIKE ?))
        GROUP BY forma_pagamento
      `;
      const pmGlobalParams = [
        startStr, endStr,
        localFilter ? 1 : null, localVal, localVal
      ];

      // 5. Payment Methods Filtered (from orders)
      const pmFilteredQuery = `
        SELECT
          CASE
            WHEN p.paymentMethod IS NULL OR p.paymentMethod = '' THEN 'Não Definido'
            ELSE p.paymentMethod
          END AS metodo,
          SUM(CAST(p.total AS REAL)) AS total
        FROM pedidos p
        LEFT JOIN clientes c ON p.cliente_id = c.id
        WHERE p.createdAt >= ? AND p.createdAt <= ?
          AND p.status IN ('Finalizado', 'Pago')
          AND p.productName NOT LIKE 'Pgto Parcial%'
          AND CAST(p.total AS REAL) >= 0
          AND (? IS NULL OR p.cliente_id = ? OR c.nome LIKE ?)
          AND (? IS NULL OR p.userName LIKE ?)
          AND (? IS NULL OR p.localName LIKE ?)
        GROUP BY metodo
      `;

      // 6. KPIs
      const kpiQuery = `
        SELECT
          SUM(CAST(p.total AS REAL)) AS totalSales,
          SUM(p.quantity) AS totalItems,
          COUNT(DISTINCT (p.createdAt || '-' || p.localName)) AS totalOrders
        FROM pedidos p
        LEFT JOIN clientes c ON p.cliente_id = c.id
        WHERE p.createdAt >= ? AND p.createdAt <= ?
          AND p.status IN ('Finalizado', 'Pago')
          AND p.productName NOT LIKE 'Pgto Parcial%'
          AND CAST(p.total AS REAL) >= 0
          AND (? IS NULL OR p.cliente_id = ? OR c.nome LIKE ?)
          AND (? IS NULL OR p.userName LIKE ?)
          AND (? IS NULL OR p.localName LIKE ?)
      `;

      // 7. Category Sales
      const categorySalesQuery = `
        SELECT
          COALESCE(pr.categoria, 'Outros') AS categoria,
          SUM(p.quantity) AS qty,
          SUM(CAST(p.total AS REAL)) AS valTotal
        FROM pedidos p
        LEFT JOIN produtos pr ON p.productName = pr.nome
        LEFT JOIN clientes c ON p.cliente_id = c.id
        WHERE p.createdAt >= ? AND p.createdAt <= ?
          AND p.status IN ('Finalizado', 'Pago')
          AND (? IS NULL OR p.cliente_id = ? OR c.nome LIKE ?)
          AND (? IS NULL OR p.userName LIKE ?)
          AND (? IS NULL OR p.localName LIKE ?)
        GROUP BY categoria
        ORDER BY valTotal DESC
      `;

      // 8. Sector Sales
      const sectorSalesQuery = `
        SELECT
          COALESCE(p.sector, 'Outros') AS setor,
          SUM(p.quantity) AS qty,
          SUM(CAST(p.total AS REAL)) AS valTotal
        FROM pedidos p
        LEFT JOIN clientes c ON p.cliente_id = c.id
        WHERE p.createdAt >= ? AND p.createdAt <= ?
          AND p.status IN ('Finalizado', 'Pago')
          AND (? IS NULL OR p.cliente_id = ? OR c.nome LIKE ?)
          AND (? IS NULL OR p.userName LIKE ?)
          AND (? IS NULL OR p.localName LIKE ?)
        GROUP BY setor
        ORDER BY valTotal DESC
      `;

      // 9. Cancellation Stats
      const cancellationQuery = `
        SELECT
          COUNT(DISTINCT (p.createdAt || '-' || p.localName)) AS totalOrders,
          SUM(p.quantity) AS totalItems,
          SUM(CAST(p.total AS REAL)) AS totalLosses
        FROM pedidos p
        LEFT JOIN clientes c ON p.cliente_id = c.id
        WHERE p.createdAt >= ? AND p.createdAt <= ?
          AND p.status = 'Cancelado'
          AND (? IS NULL OR p.cliente_id = ? OR c.nome LIKE ?)
          AND (? IS NULL OR p.userName LIKE ?)
          AND (? IS NULL OR p.localName LIKE ?)
      `;

      // 10. Waiter Ranking
      const waiterRankingQuery = `
        SELECT
          p.userName AS garcom,
          COUNT(DISTINCT (p.createdAt || '-' || p.localName)) AS totalOrders,
          SUM(CAST(p.total AS REAL)) AS totalSales
        FROM pedidos p
        LEFT JOIN clientes c ON p.cliente_id = c.id
        WHERE p.createdAt >= ? AND p.createdAt <= ?
          AND p.status IN ('Finalizado', 'Pago')
          AND (? IS NULL OR p.cliente_id = ? OR c.nome LIKE ?)
          AND (? IS NULL OR p.userName LIKE ?)
          AND (? IS NULL OR p.localName LIKE ?)
        GROUP BY garcom
        ORDER BY totalSales DESC
      `;

      // 11. Client Ranking
      const clientRankingQuery = `
        SELECT
          COALESCE(c.nome, 'Cliente Avulso') AS cliente,
          COUNT(DISTINCT (p.createdAt || '-' || p.localName)) AS totalOrders,
          SUM(CAST(p.total AS REAL)) AS totalSales
        FROM pedidos p
        LEFT JOIN clientes c ON p.cliente_id = c.id
        WHERE p.createdAt >= ? AND p.createdAt <= ?
          AND p.status IN ('Finalizado', 'Pago')
          AND (? IS NULL OR p.cliente_id = ? OR c.nome LIKE ?)
          AND (? IS NULL OR p.userName LIKE ?)
          AND (? IS NULL OR p.localName LIKE ?)
        GROUP BY cliente
        ORDER BY totalSales DESC
        LIMIT 10
      `;

      // Execute all queries concurrently
      const [
        soldItems,
        orders,
        periodSales,
        paymentMethodsGlobal,
        paymentMethodsFiltered,
        rowKpi,
        categorySales,
        sectorSales,
        cancellationStats,
        waiterRanking,
        clientRanking
      ] = await Promise.all([
        pAll(soldItemsQuery, stdParams),
        pAll(ordersQuery, stdParams),
        pAll(periodQuery, [groupFormat, ...stdParams.slice(1)]),
        pAll(pmGlobalQuery, pmGlobalParams),
        pAll(pmFilteredQuery, stdParams),
        pGet(kpiQuery, stdParams),
        pAll(categorySalesQuery, stdParams),
        pAll(sectorSalesQuery, stdParams),
        pGet(cancellationQuery, stdParams),
        pAll(waiterRankingQuery, stdParams),
        pAll(clientRankingQuery, stdParams)
      ]);

      const response = {
        kpi: {
          totalSales: rowKpi ? (rowKpi.totalSales || 0) : 0,
          totalItems: rowKpi ? (rowKpi.totalItems || 0) : 0,
          totalOrders: rowKpi ? (rowKpi.totalOrders || 0) : 0,
          ticketMedio: (rowKpi && rowKpi.totalOrders > 0) ? (rowKpi.totalSales / rowKpi.totalOrders) : 0
        },
        periodSales,
        paymentMethodsGlobal,
        paymentMethodsFiltered,
        soldItems,
        orders,
        categorySales,
        sectorSales,
        cancellationStats: {
          totalOrders: cancellationStats ? (cancellationStats.totalOrders || 0) : 0,
          totalItems: cancellationStats ? (cancellationStats.totalItems || 0) : 0,
          totalLosses: cancellationStats ? (cancellationStats.totalLosses || 0) : 0
        },
        waiterRanking,
        clientRanking
      };

      socket.emit('advanced_relatorio_data', response);
    } catch (e) {
      console.error('Erro ao gerar relatório avançado:', e);
      socket.emit('advanced_relatorio_error', 'Ocorreu um erro ao processar o relatório.');
    }
  });
}

// =====================================
// ROTAS DE RH / PAGAMENTO DE FOLHA
// =====================================

app.get('/api/rh/extrato/:id', verificarToken, (req, res) => {
  const funcId = req.params.id;
  db.get("SELECT nome FROM funcionarios WHERE id = ?", [funcId], (errF, func) => {
    if (errF || !func) return res.status(404).send("Funcionário não encontrado");
    
    const funcName = func.nome;
    db.all("SELECT id, valor, data_pedido FROM vales WHERE funcionario_id = ? AND status = 'Aprovado' AND pagamento_id IS NULL", [funcId], (errV, vales) => {
      // Para abatimento de consumo (Fiado)
      // Procuramos pedidos finalizados como Fiado onde o cliente ou o próprio funcionário foi marcado com o nome dele
      db.all("SELECT id, total, createdAt FROM pedidos WHERE status = 'Finalizado' AND paymentMethod = 'Fiado' AND pagamento_id IS NULL AND (userName = ? OR localName = ?)", [funcName, funcName], (errP, fiados) => {
        let totalVales = 0;
        (vales || []).forEach(v => totalVales += parseFloat(v.valor || 0));
        
        let totalConsumo = 0;
        (fiados || []).forEach(f => {
          let v = String(f.total || '0').replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
          totalConsumo += parseFloat(v || 0);
        });

        res.json({
          vales: vales || [],
          fiados: fiados || [],
          total_vales: totalVales,
          total_consumo: totalConsumo
        });
      });
    });
  });
});

app.post('/api/rh/pagamentos', verificarToken, (req, res) => {
  const { funcionario_id, valor_bruto, total_vales_abatidos, total_consumo_abatido, valor_liquido, observacao, vales_ids, pedidos_ids } = req.body;
  const dataPagamento = new Date().toISOString();
  
  db.run(`INSERT INTO funcionarios_pagamentos (funcionario_id, data_pagamento, valor_bruto, total_vales_abatidos, total_consumo_abatido, valor_liquido, observacao) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [funcionario_id, dataPagamento, valor_bruto, total_vales_abatidos, total_consumo_abatido, valor_liquido, observacao || ''],
    function(err) {
      if (err) return res.status(500).send("Erro ao registrar pagamento");
      
      const pagId = this.lastID;
      
      // Update vales
      if (vales_ids && vales_ids.length > 0) {
        db.run(`UPDATE vales SET pagamento_id = ? WHERE id IN (${vales_ids.map(() => '?').join(',')})`, [pagId, ...vales_ids]);
      }
      // Update pedidos fiados
      if (pedidos_ids && pedidos_ids.length > 0) {
        db.run(`UPDATE pedidos SET pagamento_id = ? WHERE id IN (${pedidos_ids.map(() => '?').join(',')})`, [pagId, ...pedidos_ids]);
      }
      
      io.emit('rh_update');

      // Broadcast celebration
      db.get("SELECT nome FROM funcionarios WHERE id = ?", [funcionario_id], (errF, func) => {
        const nome = func ? func.nome : 'Colaborador';
        io.emit('pagamento_colaborador_celebracao', {
          funcionario_id,
          funcionario_nome: nome,
          valor: valor_liquido || valor_bruto,
          data_pagamento: dataPagamento,
          observacao: observacao || '',
          pagamento_id: pagId
        });
      });

      res.json({ success: true, pagamento_id: pagId });
    }
  );
});

// ── PERFIL DE MESA ────────────
app.get('/api/mesa-perfil/:mesa_nome', (req, res) => {
  const mesa_nome = req.params.mesa_nome;
  
  db.all("SELECT userName, productName, quantity, total FROM pedidos WHERE localName = ? ORDER BY id DESC LIMIT 100", [mesa_nome], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    let clientes_recentes = [];
    let itemCounts = {};
    let soma = 0;
    
    (rows || []).forEach(r => {
      if (r.userName && r.userName.trim() !== '' && r.userName.toLowerCase() !== 'cliente padrão') {
        if (!clientes_recentes.includes(r.userName)) clientes_recentes.push(r.userName);
      }
      
      soma += parseFloat(r.total) || 0;
      
      if (r.productName) {
        const qty = parseInt(r.quantity) || 1;
        itemCounts[r.productName] = (itemCounts[r.productName] || 0) + qty;
      }
    });
    
    let mais_pedidos = Object.keys(itemCounts).map(nome => ({ nome, qty: itemCounts[nome] }));
    mais_pedidos.sort((a, b) => b.qty - a.qty);
    mais_pedidos = mais_pedidos.slice(0, 5);
    
    const count = (rows && rows.length) ? rows.length : 0;
    const media = count > 0 ? soma / count : 0;
    
    res.json({
      mesa: mesa_nome,
      clientes_recentes: clientes_recentes.slice(0, 5),
      mais_pedidos,
      media_valor: media,
      total_pedidos: count
    });
  });
});

// ── SUGESTÕES DE PROMOÇÕES (INTELIGÊNCIA DE VENDAS) ────────────
app.get('/api/sugestoes-promocao', (req, res) => {
  // Pega os itens dos últimos 7 dias
  db.all("SELECT itens_json FROM pedidos WHERE data_pedido >= datetime('now', '-7 days')", (err, pedidos) => {
    if (err) return res.status(500).json({ error: err.message });
    
    let vended = {};
    pedidos.forEach(p => {
      let itens = [];
      try { itens = JSON.parse(p.itens_json); } catch(e) {}
      itens.forEach(item => {
        vended[item.nome] = (vended[item.nome] || 0) + (item.quantidade || 1);
      });
    });
    
    // Obter todos os produtos cadastrados para descobrir os obsoletos (não vendidos)
    db.all("SELECT nome, preco FROM produtos", (err2, produtos) => {
      if (err2) return res.status(500).json({ error: err2.message });
      
      let obsoletos = [];
      let vendidosArr = [];
      
      produtos.forEach(prod => {
        if (!vended[prod.nome]) {
          obsoletos.push(prod);
        } else {
          vendidosArr.push({ nome: prod.nome, qty: vended[prod.nome], preco: prod.preco });
        }
      });
      
      vendidosArr.sort((a, b) => b.qty - a.qty);
      let tendencias = vendidosArr.slice(0, 5); // top 5
      
      // Criar as sugestões descritivas
      let sugestoes = [];
      
      if (tendencias.length > 0 && obsoletos.length > 0) {
        let top = tendencias[0];
        let obs = obsoletos[0];
        sugestoes.push({
          tipo: 'combo',
          titulo: 'Combo de Alta Conversão',
          descricao: `Crie um combo oferecendo '${top.nome}' (tendência) junto com '${obs.nome}' (baixa saída) com um leve desconto. Isso ajudará a girar o estoque do item obsoleto!`
        });
      }
      
      if (obsoletos.length > 1) {
         sugestoes.push({
           tipo: 'obsoleto',
           titulo: 'Alerta de Baixa Saída',
           descricao: `Os itens '${obsoletos[0].nome}' e '${obsoletos[1].nome}' não tiveram saídas nos últimos 7 dias. Considere criar uma promoção de "Compre 1 e Leve 2" ou dar como brinde em pedidos acima de um valor X.`
         });
      }
      
      if (tendencias.length > 1) {
         sugestoes.push({
           tipo: 'tendencia',
           titulo: 'Tendência de Vendas',
           descricao: `Aproveite a alta demanda de '${tendencias[0].nome}' e '${tendencias[1].nome}'. Você pode aumentar sutilmente a margem de lucro ou criar variações Premium desses produtos.`
         });
      }
      
      if(sugestoes.length === 0) {
         sugestoes.push({
           tipo: 'info',
           titulo: 'Dados Insuficientes',
           descricao: 'Ainda não há dados suficientes nos últimos 7 dias para gerar sugestões precisas. Continue registrando as vendas!'
         });
      }
      
      res.json({
        obsoletos: obsoletos.slice(0, 5),
        tendencias,
        sugestoes
      });
    });
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// â•â• IA ASSISTENTE - SUGESTÕES INTELIGENTES POR PERFIL â•â•â•â•â•â•â•â•
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const IA_CONFIG = {
  iaEnabled: true,              // toggle global de alertas IA
  intervaloVerificacao: 60000,     // 60 segundos
  minutosRefillCerveja: 18,        // sugerir novo drink após 18min
  minutosAlertaEspera: 25,         // alertar caixa após 25min sem prato
  minutosCriticoEspera: 40,        // pedido crítico - entrada urgente
  minutosManobra: 30,              // sugerir manobra (entrada cortesia) após 30min
  minutosAtencao: 50,              // chamada de atenção na fila quando extrapolar este tempo
  segundosPulseNovoPedido: 8,      // duração do pulse ao mostrar novo pedido
  categoriasBebidas: ['cerveja', 'bebida', 'drink', 'caipirinha', 'chopp', 'long neck', 'lata', 'garrafa', 'suco', 'refrigerante', 'água', 'agua'],
  categoriasEntradas: ['entrada', 'petisco', 'bolinho', 'isca', 'croquete', 'coxinha', 'pastel', 'mandioca']
};

const iaState = {
  sugestoesEnviadas: new Map(),    // 'mesa+produto' -> timestamp da ultima sugestao
  alertasAtivos: new Map(),        // 'pedido_id' -> { nivel, timestamp }
  manobrasAtivas: new Map(),       // 'pedido_id' -> { timestamp, status }
  dicasGerenteCache: null,
  dicasGerenteExpiry: 0
};

// Bebidas conhecidas para sugerir refill
const BEBIDAS_POPULARES = [
  'Skol', 'Brahma', 'Heineken', 'Stella', 'Corona', 'Amstel',
  'Guaraná', 'Coca-Cola', 'Fanta', 'Sprite', 'Mineral',
  'Suco de Laranja', 'Caipirinha', 'Chopp'
];


// --- IA Tenant-Aware Emit Helper ---
function emitToTenant(event, data, restauranteId) {
  if (restauranteId) {
    io.to('restaurante_' + restauranteId).emit(event, data);
  } else {
    // Fallback: emit to all (for backward compat)
    io.emit(event, data);
  }
}

function runIAVerificacao() {
  db.all(`SELECT * FROM pedidos WHERE status NOT IN ('Finalizado','Pago','Cancelado','Entregue') AND sector != 'Chamada' AND productName NOT LIKE '%Pgto Parcial%' AND productName NOT LIKE '%Pagamento%' ORDER BY createdAt ASC`, [], (err, rows) => {
    if (err || !rows || rows.length === 0) return;

    const agora = Date.now();
    const porMesa = {};

    rows.forEach(p => {
      const nome = (p.productName || '').toLowerCase();
      if (nome.includes('pagamento') || nome.includes('pgto')) return;
      const mesa = p.localName;
      if (!porMesa[mesa]) porMesa[mesa] = [];
      porMesa[mesa].push(p);
    });

    // ── 1. IA GARÇOM: Detectar bebidas e sugerir refill ──
    Object.entries(porMesa).forEach(([mesa, pedidos]) => {
      const bebidas = pedidos.filter(p => {
        const nome = (p.productName || '').toLowerCase();
        return IA_CONFIG.categoriasBebidas.some(cat => nome.includes(cat)) ||
               BEBIDAS_POPULARES.some(b => nome.includes(b.toLowerCase()));
      });

      bebidas.forEach(bebida => {
        const criado = bebida.createdAt ? new Date(bebida.createdAt).getTime() : 0;
        if (!criado) return;
        const minsDesdePedido = (agora - criado) / 60000;
        const chave = `${mesa}:${bebida.productName}`;

        if (minsDesdePedido >= IA_CONFIG.minutosRefillCerveja &&
            minsDesdePedido <= IA_CONFIG.minutosRefillCerveja + 10 &&
            !iaState.sugestoesEnviadas.has(chave)) {

          const diff = Math.round(minsDesdePedido);
          io.emit('ia_sugestao_garcom', {
            tipo: 'refill_bebida',
            mesa,
            produto: bebida.productName,
            minutos: diff,
            mensagem: `${mesa} pediu ${bebida.productName} há ${diff} minutos. Oferecer nova bebida?`,
            opcoes: ['Sim, vou oferecer', 'Já ofereci', 'Agora não']
          });
          iaState.sugestoesEnviadas.set(chave, agora);
        }
      });
    });

    // ── 2. IA FILA COZINHA: Detectar espera longa ──
    rows.forEach(p => {
      const criado = p.createdAt ? new Date(p.createdAt).getTime() : 0;
      if (!criado) return;
      const minsEspera = (agora - criado) / 60000;
      if (minsEspera > 720) return; // Ignorar pedidos com mais de 12 horas
      const chaveAlerta = `pedido_${p.id}`;

      if (minsEspera >= IA_CONFIG.minutosCriticoEspera && p.status !== 'Pronto') {
        // Nível CRÍTICO - emitir alerta ao caixa e marcar pedido como urgente
        if (!iaState.alertasAtivos.has(chaveAlerta) ||
            (agora - iaState.alertasAtivos.get(chaveAlerta).timestamp) > 300000) {

          io.emit('ia_alerta_caixa', {
            tipo: 'espera_critica',
            nivel: 'critico',
            pedidoId: p.id,
            mesa: p.localName,
            produto: p.productName,
            minutos: Math.round(minsEspera),
            mensagem: `ALERTA: ${p.localName} aguardando "${p.productName}" há ${Math.round(minsEspera)} minutos! Risco de desistência.`,
            sugestoes: [
              'Solicitar entrada urgente ao garçom',
              'Informar cliente sobre o atraso',
              'Oferecer cortesia ( entrada / bebida )'
            ]
          });

          io.emit('ia_pedido_especial', {
            pedidoId: p.id,
            tipo: 'urgente',
            cor: '#ff4444',
            urgencia: 'alta',
            mensagem: `URGENTE - ${Math.round(minsEspera)}min de espera`
          });

          iaState.alertasAtivos.set(chaveAlerta, { nivel: 'critico', timestamp: agora });
        }

      } else if (minsEspera >= IA_CONFIG.minutosAlertaEspera && p.status !== 'Pronto') {
        // Nível ALERTA - sugestão preventiva
        if (!iaState.alertasAtivos.has(chaveAlerta) ||
            (agora - iaState.alertasAtivos.get(chaveAlerta).timestamp) > 300000) {

          io.emit('ia_alerta_caixa', {
            tipo: 'espera_alerta',
            nivel: 'alerta',
            pedidoId: p.id,
            mesa: p.localName,
            produto: p.productName,
            minutos: Math.round(minsEspera),
            mensagem: `${p.localName} aguardando "${p.productName}" há ${Math.round(minsEspera)} minutos. Considere oferecer uma entrada.`,
            sugestoes: [
              'Sugerir entrada ao cliente',
              'Verificar status na cozinha'
            ]
          });

          iaState.alertasAtivos.set(chaveAlerta, { nivel: 'alerta', timestamp: agora });
        }
      }
    });

    // ── 3. IA MANOBRA: Detectar mesas com risco de desistência ──
    Object.entries(porMesa).forEach(([mesa, pedidos]) => {
      const naoProntos = pedidos.filter(p => p.status !== 'Pronto' && p.status !== 'Finalizado' && p.status !== 'Cancelado' && p.status !== 'Entregue' && p.status !== 'Pago');
      const prontos = pedidos.filter(p => p.status === 'Pronto');

      if (naoProntos.length === 0) return;

      const maisAntigo = naoProntos.sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return ta - tb;
      })[0];

      const criado = maisAntigo.createdAt ? new Date(maisAntigo.createdAt).getTime() : 0;
      if (!criado) return;
      const minsEspera = (agora - criado) / 60000;
      const chaveManobra = `manobra_${maisAntigo.id}`;

      if (minsEspera >= IA_CONFIG.minutosManobra && maisAntigo.status !== 'Pronto') {
        if (!iaState.manobrasAtivas.has(chaveManobra) ||
            (agora - iaState.manobrasAtivas.get(chaveManobra).timestamp) > 600000) {

          const temParcial = prontos.length > 0;
          io.emit('ia_manobra_sugerida', {
            tipo: 'manobra_sugerida',
            pedidoId: maisAntigo.id,
            mesa,
            produto: maisAntigo.productName,
            setor: maisAntigo.sector || 'Cozinha 1',
            minutos: Math.round(minsEspera),
            itensProntos: prontos.length,
            itensPendentes: naoProntos.length,
            temParcial,
            mensagem: temParcial
              ? `${mesa} já recebeu ${prontos.length} item(ns) mas aguardando "${maisAntigo.productName}" há ${Math.round(minsEspera)}min. Risco de desistência!`
              : `${mesa} aguardando "${maisAntigo.productName}" há ${Math.round(minsEspera)}min. Cliente pode desistir.`,
            sugestoes: [
              'Solicitar entrada cortesia ao garçom',
              'Informar cliente sobre o atraso',
              'Oferecer bebida cortesia'
            ]
          });

          iaState.manobrasAtivas.set(chaveManobra, { timestamp: agora, status: 'sugerida' });
        }
      }
    });

    // ── 3.5. IA ATENÇÃO: Chamada de atenção quando pedido extrapola tempo ──
    rows.forEach(p => {
      const criado = p.createdAt ? new Date(p.createdAt).getTime() : 0;
      if (!criado) return;
      const minsEspera = (agora - criado) / 60000;
      const chaveAtencao = `atencao_${p.id}`;

      if (minsEspera >= IA_CONFIG.minutosAtencao && p.status !== 'Pronto' && p.status !== 'Finalizado' && p.status !== 'Cancelado') {
        if (!iaState.alertasAtivos.has(chaveAtencao) ||
            (agora - iaState.alertasAtivos.get(chaveAtencao).timestamp) > 300000) {

          io.emit('ia_pedido_atencao', {
            pedidoId: p.id,
            tipo: 'atencao',
            cor: '#dc2626',
            urgencia: 'atencao',
            minutos: Math.round(minsEspera),
            mesa: p.localName,
            produto: p.productName,
            setor: p.sector || 'Cozinha 1',
            mensagem: `ATENÇÃO - ${Math.round(minsEspera)}min de espera!`
          });

          iaState.alertasAtivos.set(chaveAtencao, { nivel: 'atencao', timestamp: agora });
        }
      }
    });

    // ── 4. IA GERENTE: Insights periódicos (cache 5min) ──
    if (agora > iaState.dicasGerenteExpiry) {
      gerarInsightsGerente(rows, agora);
    }
  });
}

function gerarInsightsGerente(pedidosAtivos, agora) {
  const dicas = [];
  const totalPedidos = pedidosAtivos.length;

  if (totalPedidos === 0) {
    dicas.push({ tipo: 'info', texto: 'Nenhum pedido ativo no momento. Bom momento para organizar o estoque ou preparar itens.' });
  }

  // Contar por status
  const porStatus = {};
  pedidosAtivos.forEach(p => {
    porStatus[p.status] = (porStatus[p.status] || 0) + 1;
  });

  if (porStatus['Em espera'] > 5 || porStatus['Pendente'] > 5) {
    dicas.push({ tipo: 'alerta', texto: `${porStatus['Em espera'] || 0} pedidos em espera. Considere aumentar eficiência na cozinha.` });
  }

  // Mesa mais ativa
  const porMesa = {};
  pedidosAtivos.forEach(p => {
    porMesa[p.localName] = (porMesa[p.localName] || 0) + 1;
  });
  const mesaMaisAtiva = Object.entries(porMesa).sort((a, b) => b[1] - a[1])[0];
  if (mesaMaisAtiva && mesaMaisAtiva[1] > 3) {
    dicas.push({ tipo: 'info', texto: `Mesa ${mesaMaisAtiva[0]} é a mais ativa com ${mesaMaisAtiva[1]} itens. Priorize atendimento.` });
  }

  // Pedidos prontos aguardando retirada
  if (porStatus['Pronto'] > 0) {
    dicas.push({ tipo: 'acao', texto: `${porStatus['Pronto']} pedido(s) pronto(s) aguardando retirada. Acelere a entrega!` });
  }

  // Horário - dicas contextuais
  const hora = new Date().getHours();
  if (hora >= 11 && hora <= 14) {
    dicas.push({ tipo: 'dica', texto: 'Horário de almoço. Reforçar equipe de garçons e verificar estoque de pratos do dia.' });
  } else if (hora >= 18 && hora <= 22) {
    dicas.push({ tipo: 'dica', texto: 'Horário de jantar. Promova entradas e combos para mesas recém-sentadas.' });
  } else if (hora >= 22) {
    dicas.push({ tipo: 'dica', texto: 'Noite avançada. Sugira sobremesas e café para encerrar contas.' });
  }

  if (dicas.length > 0) {
    io.emit('ia_dica_gerente', {
      dicas,
      timestamp: agora,
      resumo: {
        totalPedidos,
        emEspera: porStatus['Em espera'] || 0,
        emPreparo: porStatus['Em preparo'] || 0,
        prontos: porStatus['Pronto'] || 0,
        mesasAtivas: Object.keys(porMesa).length
      }
    });
  }

  iaState.dicasGerenteCache = dicas;
  iaState.dicasGerenteExpiry = agora + 300000; // 5 min cache
}

// Responder a ações do garçom nas sugestões da IA
io.on('connection', (socket) => {
  const token = socket.handshake.query.token;
  let socketTenantId = 1;
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socketTenantId = decoded.restaurante_id;
    } catch(e) {}
  }
  
  socket.restaurante_id = socketTenantId;
  socket.join(`restaurante_${socketTenantId}`);
  
  // Wrap all socket events in tenant context!
  const originalOn = socket.on.bind(socket);
  socket.on = function(eventName, callback) {
    originalOn(eventName, (...args) => {
      tenantContext.run(socketTenantId, () => {
        callback(...args);
      });
    });
  };

  socket.on('ia_resposta_sugestao', (data) => {
    const { tipo, mesa, produto, resposta, pedidoId } = data || {};

    if (tipo === 'refill_bebida' && resposta === 'sim') {
      // Garçom aceitou oferecer refill - buscar produto para adicionar
      db.get(`SELECT * FROM produtos WHERE nome LIKE ? LIMIT 1`, [`%${produto}%`], (err, prod) => {
        if (prod) {
          io.emit('ia_sugestao_garcom_aceita', {
            mesa,
            produto: prod.nome,
            preco: prod.preco,
            mensagem: `Adicione ${prod.nome} (R$ ${parseFloat(prod.preco).toFixed(2)}) na comanda da ${mesa}`
          });
        }
      });
    }

    if (tipo === 'espera_critica' || tipo === 'espera_alerta') {
      if (!resposta) return;
      if (resposta.includes('garçom') || resposta.includes('garcom') || resposta.includes('cortesia')) {
        // Enviar para o garçom oferecer cortesia
        io.emit('ia_manobra_aceita', {
          tipo: 'manobra_aceita',
          pedidoId,
          mesa,
          produto: 'Entrada',
          minutos: '...',
          mensagem: `Caixa solicitou oferecer entrada cortesia para ${mesa}.`,
          opcoes: ['Vou oferecer entrada', 'Cliente recusou']
        });
      } else if (resposta.includes('entrada')) {
        // Enviar direto para a cozinha
        if (pedidoId) {
          io.emit('ia_pedido_especial', {
            pedidoId,
            tipo: 'entrada_urgente',
            cor: '#ff6b35',
            urgencia: 'entrada_solicitada',
            mensagem: `ENTRADA URGENTE - preparar em paralelo`
          });
        }
      } else if (resposta.includes('informar') || resposta.includes('atraso')) {
        // Apenas marcar como cliente informado
        if (pedidoId) {
          io.emit('ia_pedido_especial', {
            pedidoId,
            tipo: 'informado',
            cor: '#3b82f6',
            urgencia: 'media',
            mensagem: `CLIENTE INFORMADO`
          });
        }
      }
    }
  });

  // ── MANOBRA: Caixa confirma solicitação de entrada ao garçom ──
  socket.on('ia_manobra_confirmar', (data) => {
    const { pedidoId, mesa, produto, minutos, acao } = data || {};
    const chaveManobra = `manobra_${pedidoId}`;

    if (acao === 'solicitar_entrada') {
      io.emit('ia_manobra_aceita', {
        tipo: 'manobra_aceita',
        pedidoId,
        mesa,
        produto,
        minutos,
        mensagem: `Oferecer entrada cortesia para ${mesa}. Cliente aguardando "${produto}" há ${minutos}min.`,
        opcoes: ['Vou oferecer entrada', 'Cliente recusou']
      });

      iaState.manobrasAtivas.set(chaveManobra, { timestamp: Date.now(), status: 'encaminhada' });
    }

    if (acao === 'informar_cliente') {
      io.emit('ia_pedido_especial', {
        pedidoId,
        tipo: 'informado',
        cor: '#3b82f6',
        urgencia: 'media',
        mensagem: `CLIENTE INFORMADO - ${minutos}min de espera`
      });
      iaState.manobrasAtivas.set(chaveManobra, { timestamp: Date.now(), status: 'informado' });
    }
  });

  // ── MANOBRA: Garçom confirma que vai oferecer entrada ──
  socket.on('ia_manobra_executar', (data) => {
    const { pedidoId, mesa, produto, resposta } = data || {};
    const chaveManobra = `manobra_${pedidoId}`;

    if (resposta === 'sim') {
      io.emit('ia_pedido_especial', {
        pedidoId,
        tipo: 'manobra',
        cor: '#ff6b35',
        urgencia: 'manobra_ativa',
        mensagem: `MANOBRA - preparar em paralelo`
      });

      iaState.manobrasAtivas.set(chaveManobra, { timestamp: Date.now(), status: 'executada' });

      io.emit('ia_manobra_executada', {
        pedidoId,
        mesa,
        produto,
        mensagem: `Garçom vai oferecer entrada para ${mesa}. Cozinha: preparar "${produto}" em paralelo!`
      });
    } else {
      iaState.manobrasAtivas.set(chaveManobra, { timestamp: Date.now(), status: 'recusada' });
    }
  });

  // --- IA: Toggle alertas on/off ---
  socket.on('toggle_ia_alertas', (data) => {
    const { enabled } = data || {};
    IA_CONFIG.iaEnabled = !!enabled;
    console.log('[IA] Alertas ' + (IA_CONFIG.iaEnabled ? 'ATIVADOS' : 'DESATIVADOS'));
    if (!IA_CONFIG.iaEnabled) {
      iaState.alertasAtivos.clear();
      iaState.manobrasAtivas.clear();
      iaState.sugestoesEnviadas.clear();
    }
    io.emit('ia_estado_atualizado', { enabled: IA_CONFIG.iaEnabled });
  });

  // --- IA: Atualizar configuracoes da IA ---
  socket.on('ia_atualizar_config', (data) => {
    if (data.minutosRefillCerveja !== undefined) IA_CONFIG.minutosRefillCerveja = parseInt(data.minutosRefillCerveja) || 18;
    if (data.minutosAlertaEspera !== undefined) IA_CONFIG.minutosAlertaEspera = parseInt(data.minutosAlertaEspera) || 25;
    if (data.minutosCriticoEspera !== undefined) IA_CONFIG.minutosCriticoEspera = parseInt(data.minutosCriticoEspera) || 40;
    if (data.minutosManobra !== undefined) IA_CONFIG.minutosManobra = parseInt(data.minutosManobra) || 30;
    if (data.minutosAtencao !== undefined) IA_CONFIG.minutosAtencao = parseInt(data.minutosAtencao) || 50;
    console.log('[IA] Config atualizada:', JSON.stringify({ enabled: IA_CONFIG.iaEnabled, minutosRefill: IA_CONFIG.minutosRefillCerveja, minutosAlerta: IA_CONFIG.minutosAlertaEspera, minutosCritico: IA_CONFIG.minutosCriticoEspera }));
    socket.emit('ia_config_atual', IA_CONFIG);
  });

  // --- IA: Solicitar configuracao atual ---
  socket.on('ia_get_config', () => {
    socket.emit('ia_config_atual', IA_CONFIG);
  });
});



// Iniciar verificação periódica da IA
setInterval(runIAVerificacao, IA_CONFIG.intervaloVerificacao);

// --- SAAS: ROTAS DE AUTENTICACAO ---
app.post('/api/auth/registro', async (req, res) => {
  const { restauranteNome, nome, email, senha } = req.body;
  if (!restauranteNome || !nome || !email || !senha) {
    return res.status(400).json({ success: false, error: 'Preencha todos os campos.' });
  }

  try {
    const hash = await bcrypt.hash(senha, 10);
    
    // Criar restaurante trial de 7 dias
    masterDb.run(`INSERT INTO restaurantes (nome, licenca, ativo) VALUES (?, 'trial', 1)`, [restauranteNome], function(err) {
      if (err) return res.status(500).json({ success: false, error: 'Erro ao criar restaurante.' });
      
      const restauranteId = this.lastID;
      
      // Criar usuário admin do restaurante
      masterDb.run(`INSERT INTO usuarios (restaurante_id, username, password_hash, role) VALUES (?, ?, ?, 'admin')`, 
      [restauranteId, email, hash], function(errUser) {
        if (errUser) {
          // Rollback simple se falhar
          masterDb.run(`DELETE FROM restaurantes WHERE id = ?`, [restauranteId]);
          return res.status(500).json({ success: false, error: 'E-mail já cadastrado.' });
        }
        
        // Gerar JWT inicial
        const token = jwt.sign({ id: this.lastID, restaurante_id: restauranteId, role: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
        res.json({ success: true, token, restaurante_id: restauranteId });
      });
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ success: false, error: 'Preencha e-mail e senha.' });

  masterDb.get(`SELECT u.*, r.ativo as r_ativo, r.licenca, r.data_cadastro FROM usuarios u JOIN restaurantes r ON u.restaurante_id = r.id WHERE u.username = ? AND u.ativo = 1`, [email], async (err, user) => {
    if (err || !user) return res.status(401).json({ success: false, error: 'Usuário não encontrado ou inativo.' });
    
    // Validar Trial
    if (user.licenca === 'trial') {
      const dataCad = new Date(user.data_cadastro);
      const agora = new Date();
      const diffDias = Math.floor((agora - dataCad) / (1000 * 60 * 60 * 24));
      if (diffDias > 7) {
         return res.status(403).json({ success: false, error: 'Período de teste (7 dias) expirou. Contate o suporte.' });
      }
    }
    
    if (!user.r_ativo) return res.status(403).json({ success: false, error: 'Restaurante inativo.' });

    const match = await bcrypt.compare(senha, user.password_hash);
    if (!match) return res.status(401).json({ success: false, error: 'Senha incorreta.' });

    const token = jwt.sign({ id: user.id, restaurante_id: user.restaurante_id, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ success: true, token, restaurante_id: user.restaurante_id, role: user.role });
  });
});

// Middleware JWT Universal para proteger Rotas de API
function verificarToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(403).json({ success: false, error: 'Nenhum token fornecido.' });
  
  const token = authHeader.split(' ')[1]; // Formato: Bearer TOKEN
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ success: false, error: 'Sessão expirada ou token inválido.' });
    
    // Substitui o middleware temporário da Fase 1
    req.restaurante_id = decoded.restaurante_id;
    req.user_role = decoded.role;
    tenantContext.run(decoded.restaurante_id, () => {
      next();
    });
  });
}

// Inicializar licença e depois subir o servidor ────────────
licenseManager.initLicense().then((licState) => {
  server.listen(PORT, HOST, () => {
    const ip = getLocalIp();
    console.log('=========================================');
    console.log(`🚀 Servidor Backend Rodando com SQLite!`);
    console.log(`📡 Escutando na porta ${PORT}`);
    console.log(`📱 Para conectar outros dispositivos, use o IP: https://${ip}:5173`);
    console.log(`🔑 Licença: ${licState.status} | ${licState.restaurante || '(não configurado)'}`);
    console.log('=========================================');
  });
});




});
