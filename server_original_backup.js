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
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const nfceService = require('./nfce-service');

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
app.use(cors());
app.use(express.json());
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
function broadcastPedidos() {
  if (pedidosDebounceTimeout) clearTimeout(pedidosDebounceTimeout);
  pedidosDebounceTimeout = setTimeout(() => {
    db.all(`SELECT * FROM pedidos WHERE status != 'Finalizado'`, (e, r) => {
      if(!e) io.emit('pedidos_atualizados', r || []);
    });
  }, 300);
}

// Configurações e Produtos com cache
let lastProdutos = null;
let lastConfig = null;


// Configure SQLite Database
const dbPath = path.join(__dirname, 'database.sqlite');
let db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('Erro ao abrir o banco de dados:', err);
  else console.log('Conectado ao banco de dados SQLite.');
});

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
  db.run(`ALTER TABLE pedidos ADD COLUMN turno_id INTEGER`, (err) => {});
  db.run(`ALTER TABLE pedidos ADD COLUMN cliente_id INTEGER`, (err) => {});
  db.run(`ALTER TABLE pedidos ADD COLUMN entregador_id INTEGER`, (err) => {});
  db.run(`ALTER TABLE pedidos ADD COLUMN promocao_id INTEGER`, (err) => {});
  db.run(`ALTER TABLE pedidos ADD COLUMN mesa_grupo TEXT`, (err) => {});
  db.run(`ALTER TABLE pedidos ADD COLUMN mesa_comanda TEXT`, (err) => {});
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
      status_inicial TEXT DEFAULT 'Em espera'
    )
  `);

  db.run(`ALTER TABLE produtos ADD COLUMN setor TEXT DEFAULT 'Cozinha 1'`, (err) => {
    // Ignora o erro se a coluna já existir
  });

  db.run(`ALTER TABLE produtos ADD COLUMN status_inicial TEXT DEFAULT 'Em espera'`, (err) => {
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

  db.run(`
    CREATE TABLE IF NOT EXISTS funcionarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT,
      usuario TEXT UNIQUE,
      senha TEXT,
      cargo TEXT
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

  global.registrarAuditoria = (operador, acao, detalhes, motivo, risco) => {
    db.run(
      `INSERT INTO auditoria (operador, acao, detalhes, motivo, risco) VALUES (?, ?, ?, ?, ?)`,
      [operador, acao, detalhes, motivo, risco],
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

// Helper to get local IP
function getLocalIP() {
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
  db.all(`SELECT * FROM pedidos WHERE status != 'Finalizado'`, [], (err, rows) => {
    if (!err) {
      io.emit('initial_data', rows || []);
    }
  });
}

io.on('connection', (socket) => {
  const ua = socket.handshake.headers['user-agent'] || '';
  const isMobile = /mobile|android|iphone|ipad/i.test(ua);
  let deviceType = isMobile ? 'Móvel' : 'Desktop';
  const clientIp = socket.handshake.address ? socket.handshake.address.replace('::ffff:', '') : '127.0.0.1';

  activeSockets.set(socket.id, {
    id: socket.id,
    ip: clientIp,
    deviceType: deviceType,
    device: deviceType,
    user: 'Visitante'
  });

  let mpPollInterval = null;
  let mpCurrentIntentId = null;
  let mpCurrentDeviceId = null;

  socket.on('get_connected_devices', () => {
    socket.emit('connected_devices', Array.from(activeSockets.values()));
  });

  socket.on('disconnect', () => {
    activeSockets.delete(socket.id);
    if (mpPollInterval) {
      clearInterval(mpPollInterval);
      mpPollInterval = null;
    }
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
  socket.emit('server_ip', getLocalIP());
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

  socket.on('transferir_item', ({ itemId, novaMesa, operador }) => {
    db.run(`UPDATE pedidos SET localName = ?, mesa_grupo = NULL WHERE id = ?`, [novaMesa, itemId], (err) => {
      if (!err) {
        global.registrarAuditoria(operador || 'Sistema', 'TRANSFERENCIA_ITEM', `Item ${itemId} transferido para ${novaMesa}`, 'Operação de Salão', 'MEDIO');
        broadcastPedidos();
      }
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

  // Fetch all active orders and send to the new client
  db.all(`SELECT * FROM pedidos WHERE status != 'Finalizado'`, [], (err, rows) => {
    if (err) {
      console.error(err);
      return;
    }
    socket.emit('initial_data', rows);
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
              [item.nome + ' (Resgate)', item.emoji || '🎁', item.quantity || 1, '0,00', 'Em espera', mesaName, userName || 'Garçom', timeStr, item.sector || 'Bar']
            );
            hasInserted = true;
          });

          // Inserir lógica financeira
          if (cupom.valor_tipo === 'desconto_fixo' && cupom.valor > 0) {
              db.run(
                `INSERT INTO pedidos (productName, productEmoji, quantity, total, status, localName, userName, time, sector, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
                ['Desconto Promocional', '🏷️', 1, '-' + cupom.valor.toFixed(2).replace('.',','), 'Pronto', mesaName, userName || 'Garçom', timeStr, 'Caixa']
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
      socket.emit('pedido_erro', { msg: '⚠️ Sistema em modo restrito. Ative a licença para adicionar pedidos.' });
      return;
    }
    const clientName = pedido.mesa_comanda ? pedido.mesa_comanda.trim() : null;
    const clientPhone = pedido.cliente_telefone ? pedido.cliente_telefone.trim() : null;

    function proceedWithOrder(clienteId) {
      pedido.cliente_id = clienteId || pedido.cliente_id || null;
      let status = pedido.status_inicial || 'Em espera';
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
                  const bonusEmoji = bonusProd ? bonusProd.emoji : '🎁';
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
        
        if (status === 'Pronto') {
          io.emit('pedido_pronto', row);
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

  socket.on('get_esteira', (userName) => {
    db.all(`SELECT * FROM pedidos WHERE userName = ? AND status = 'Pronto'`, [userName], (err, rows) => {
      socket.emit('esteira_atualizada', rows || []);
    });
  });

  socket.on('marcar_entregue', ({ id, userName }) => {
    db.run(`UPDATE pedidos SET status = 'Entregue' WHERE id = ?`, [id], () => {
      db.all(`SELECT * FROM pedidos WHERE userName = ? AND status = 'Pronto'`, [userName], (err, rows) => {
        socket.emit('esteira_atualizada', rows || []);
      });
    });
  });

  socket.on('remover_pedido_item', (data) => {
    const itemId = (typeof data === 'object' && data !== null) ? (data.orderId || data.id) : data;
    const userName = (typeof data === 'object' && data !== null && data.userName) ? data.userName : 'Caixa / Desconhecido';
    if (itemId === undefined || itemId === null || itemId === '') return;
    
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
        if (mesaName) {
          db.all(`SELECT * FROM pedidos WHERE (localName = ? OR mesa_grupo = ?) AND status != 'Finalizado'`, [mesaName, mesaName], (e, r) => {
            io.emit('itens_mesa_recebidos', { mesaName, items: r || [] });
          });
        }
      });
    });
  });

  socket.on('remover_item_pedido', (data) => {
    const itemId = (typeof data === 'object' && data !== null) ? (data.orderId || data.id) : data;
    const userName = (typeof data === 'object' && data !== null && data.userName) ? data.userName : 'Caixa / Desconhecido';
    if (itemId === undefined || itemId === null || itemId === '') return;
    
    db.get(`SELECT * FROM pedidos WHERE id = ?`, [itemId], (err, row) => {
      const mesaName = row ? row.localName : null;
      db.run(`DELETE FROM pedidos WHERE id = ?`, [itemId], () => {
        if(row) {
          global.registrarAuditoria(
            userName, 
            'Exclusão de Produto', 
            `Removido (App/Caixa): ${row.quantity}x ${row.productName} - Mesa: ${row.localName} - Preço: R$${row.total}`, 
            'Ação manual', 
            'Alto'
          );
        }
        broadcastPedidos();
        if (mesaName) {
          db.all(`SELECT * FROM pedidos WHERE (localName = ? OR mesa_grupo = ?) AND status != 'Finalizado'`, [mesaName, mesaName], (e, r) => {
            io.emit('itens_mesa_recebidos', { mesaName, items: r || [] });
          });
        }
      });
    });
  });

  
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
          socket.emit('aprovar_pedido_qr_resposta', { success: false, error: '⚠️ O caixa está fechado! Abra o caixa antes de aprovar pedidos.' });
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
            let status = 'Em espera';
            if (item.sector === 'Bar') {
              status = 'Em preparo';
            }
            
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

  socket.on('add_produto', (p) => db.run(`INSERT INTO produtos (categoria, nome, preco, emoji, hasAddons, setor, status_inicial, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 
    [p.categoria, p.nome, p.preco, p.emoji, p.hasAddons, p.setor || 'Cozinha 1', p.status_inicial || 'Em espera', p.status || 'ativo'], (err) => {
      if (err) {
        console.error(err);
        socket.emit('erro_servidor', 'Falha ao adicionar o produto.');
        return;
      }
      broadcastProdutos();
  }));

  socket.on('edit_produto', (p) => {
    db.run(`UPDATE produtos SET categoria=?, nome=?, preco=?, emoji=?, setor=?, status_inicial=?, status=? WHERE id=?`, 
      [p.categoria, p.nome, p.preco, p.emoji, p.setor || 'Cozinha 1', p.status_inicial || 'Em espera', p.status || 'ativo', p.id], () => {
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
    
    db.run(`UPDATE funcionarios SET status = 'Ativo', cargo = ?, valor_hora = ? WHERE id = ?`, [cargo, valor_hora, id], () => {
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
  
  socket.on('buscar_cliente_telefone', (telefone) => {
    db.get(`SELECT * FROM clientes WHERE telefone = ?`, [telefone], (err, row) => {
      socket.emit('resultado_cliente_telefone', row || null);
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
      
      // Deduzir pontos
      db.run(`UPDATE clientes SET pontos = pontos - ? WHERE id = ?`, [custo, cliente.id], (err2) => {
         if (err2) return socket.emit('resgate_erro', 'Erro ao deduzir pontos.');
         
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
                    productEmoji: '🎁',
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
    if (!q) return socket.emit('resultado_cliente_telefone', null);
    db.get(
      `SELECT * FROM clientes WHERE telefone LIKE ? OR nome LIKE ? LIMIT 1`,
      [`%${q}%`, `%${q}%`],
      (err, row) => {
        socket.emit('resultado_cliente_telefone', row || null);
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

      db.run(`UPDATE clientes SET pontos = pontos - ? WHERE id = ?`, [custo, cliente_id], (err2) => {
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
        
        const novoSaldo = cliente.pontos - beneficio.pontos;
        const codigo = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        db.run(`UPDATE clientes SET pontos = ? WHERE id = ?`, [novoSaldo, cliente_id], (err) => {
          if (!err) {
            db.run(`INSERT INTO resgates (cliente_id, beneficio_id, codigo, data) VALUES (?, ?, ?, datetime('now', 'localtime'))`, 
              [cliente_id, beneficio_id, codigo], () => {
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
    db.all(`SELECT * FROM pedidos WHERE localName = ? AND status != 'Finalizado'`, [mesaName], (err, rows) => {
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
      const token = config.mp_access_token;
      const deviceId = config.mp_device_id;

      if (provider !== 'mercadopago' || !token || !deviceId) {
        socket.emit('mp_status_pagamento', { status: 'failed', msg: 'Integração Mercado Pago não configurada.' });
        return;
      }

      if (mpPollInterval) {
        clearInterval(mpPollInterval);
        mpPollInterval = null;
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
          console.error('[Mercado Pago] Erro ao criar intenção:', data);
          socket.emit('mp_status_pagamento', { status: 'failed', msg: data.message || 'Falha ao criar cobrança na maquininha.' });
          return;
        }

        mpCurrentIntentId = data.id;
        mpCurrentDeviceId = deviceId;
        
        socket.emit('mp_status_pagamento', { status: 'processando', intentId: data.id, msg: 'Cobrança enviada! Aguardando cartão...' });

        let elapsedSeconds = 0;
        mpPollInterval = setInterval(async () => {
          elapsedSeconds += 2;
          if (elapsedSeconds > 180) {
            clearInterval(mpPollInterval);
            mpPollInterval = null;
            socket.emit('mp_status_pagamento', { status: 'failed', msg: 'Tempo limite esgotado. Transação cancelada.' });
            return;
          }

          try {
            const statusResponse = await fetch(`https://api.mercadopago.com/point/integration-api/payment-intents/${mpCurrentIntentId}`, {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });

            if (statusResponse.ok) {
              const statusData = await statusResponse.json();
              if (statusData.status === 'finished') {
                clearInterval(mpPollInterval);
                mpPollInterval = null;
                socket.emit('mp_status_pagamento', { status: 'aprovado', payment: statusData, msg: 'Pagamento aprovado com sucesso!' });
              } else if (statusData.status === 'canceled' || statusData.status === 'expired') {
                clearInterval(mpPollInterval);
                mpPollInterval = null;
                socket.emit('mp_status_pagamento', { status: 'failed', msg: `Pagamento ${statusData.status === 'canceled' ? 'cancelado' : 'expirado'} na maquininha.` });
              }
            }
          } catch (pollErr) {
            console.error('[Mercado Pago] Erro no polling:', pollErr);
          }
        }, 2000);

      } catch (apiErr) {
        console.error('[Mercado Pago] Erro na API:', apiErr);
        socket.emit('mp_status_pagamento', { status: 'failed', msg: 'Erro de conexão com o Mercado Pago.' });
      }
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
          socket.emit('login_error', 'Nenhuma entrada em aberto encontrada para registrar a saída.');
        }
      });
    }
  });

  socket.on('get_metricas_funcionario', (funcionario_id) => {
    db.all(`SELECT * FROM pontos WHERE funcionario_id = ? ORDER BY id DESC`, [funcionario_id], (err, pontos) => {
      if (err) {
        console.error('Error fetching pontos:', err);
        socket.emit('metricas_funcionario_response', { pontos: [], vales: [] });
        return;
      }
      db.all(`SELECT * FROM vales WHERE funcionario_id = ? ORDER BY id DESC`, [funcionario_id], (err2, vales) => {
        if (err2) {
          console.error('Error fetching vales:', err2);
          socket.emit('metricas_funcionario_response', { pontos: pontos || [], vales: [] });
          return;
        }
        socket.emit('metricas_funcionario_response', { pontos: pontos || [], vales: vales || [] });
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

    socket.on('get_nfce_notas', () => {
      db.all(`SELECT id, pedido_id, localName, cliente_nome, cpf_cnpj, valor_total, chave_acesso, numero_nota, serie, ambiente, status, protocolo, created_at FROM nfce_notas ORDER BY id DESC`, (err, rows) => {
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


  socket.on('disconnect', () => {
    console.log(`[Socket] Dispositivo desconectado: ${socket.id}`);
  });
});


// --- RETRO API PARA ANDROID 3.2 ---
app.get('/api/retro/mesas', (req, res) => {
  db.all("SELECT * FROM mesas", (err, mesas) => {
    if (err) return res.status(500).json({ error: 'Erro no banco' });
    db.all("SELECT * FROM pedidos WHERE status != 'Finalizado'", (err, pedidos) => {
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
  
  let status = pedido.status_inicial || 'Em espera';
  if (pedido.sector === 'Bar' && status === 'Em espera') {
    status = 'Em preparo';
  }
  
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

app.get('/api/config', (req, res) => {
  db.all(`SELECT * FROM configuracoes`, (err, rows) => {
    if (err) return res.status(500).send(err);
    const configs = {};
    if (rows) rows.forEach(r => configs[r.chave] = r.valor);
    res.json(configs);
  });
});

app.post('/api/config', (req, res) => {
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

// --- BACKUP & RESTORE API ---
app.get('/api/backup', (req, res) => {
  res.download(dbPath, 'backup.sqlite', (err) => {
    if (err) {
      console.error("Erro no download do backup:", err);
      if (!res.headersSent) {
        res.status(500).send("Erro ao gerar backup: " + err.message);
      }
    }
  });
});

app.post('/api/restore', upload.single('backup'), (req, res) => {
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

app.get('/api/rh/extrato/:id', (req, res) => {
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

app.post('/api/rh/pagamentos', (req, res) => {
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
      res.json({ success: true, pagamento_id: pagId });
    }
  );
});

// ── PERFIL DE MESA ────────────
app.get('/api/mesa-perfil/:mesa_nome', (req, res) => {
  const mesa_nome = req.params.mesa_nome;
  
  db.all("SELECT cliente_nome, itens_json, total FROM pedidos WHERE mesa = ? ORDER BY data_pedido DESC LIMIT 50", [mesa_nome], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    let clientes_recentes = [];
    let itemCounts = {};
    let soma = 0;
    
    rows.forEach(r => {
      // Clientes recentes únicos, ignorando vazios ou "Padrão" se houver nome real (vamos simplificar e apenas coletar não nulos)
      if (r.cliente_nome && r.cliente_nome.trim() !== '' && r.cliente_nome.toLowerCase() !== 'cliente padrão') {
        if (!clientes_recentes.includes(r.cliente_nome)) clientes_recentes.push(r.cliente_nome);
      }
      
      soma += parseFloat(r.total) || 0;
      
      let itens = [];
      try { itens = JSON.parse(r.itens_json); } catch(e) {}
      
      itens.forEach(item => {
        let name = item.nome;
        itemCounts[name] = (itemCounts[name] || 0) + (item.quantidade || 1);
      });
    });
    
    // Pegar top 3 itens mais pedidos
    let mais_pedidos = Object.keys(itemCounts).map(nome => ({ nome, qty: itemCounts[nome] }));
    mais_pedidos.sort((a, b) => b.qty - a.qty);
    mais_pedidos = mais_pedidos.slice(0, 3);
    
    const media = rows.length > 0 ? soma / rows.length : 0;
    
    res.json({
      mesa: mesa_nome,
      clientes_recentes: clientes_recentes.slice(0, 5), // top 5
      mais_pedidos,
      media_valor: media,
      total_pedidos: rows.length
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

// ── Inicializar licença e depois subir o servidor ────────────
licenseManager.initLicense().then((licState) => {
  server.listen(PORT, HOST, () => {
    const ip = getLocalIP();
    console.log('=========================================');
    console.log(`🚀 Servidor Backend Rodando com SQLite!`);
    console.log(`📡 Escutando na porta ${PORT}`);
    console.log(`📱 Para conectar outros dispositivos, use o IP: https://${ip}:5173`);
    console.log(`🔑 Licença: ${licState.status} | ${licState.restaurante || '(não configurado)'}`);
    console.log('=========================================');
  });
});
