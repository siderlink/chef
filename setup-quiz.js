const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

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
  bgBlue: "\x1b[44m\x1b[37m",
  bgMagenta: "\x1b[45m\x1b[37m",
  bgCyan: "\x1b[46m\x1b[30m",
  bgGreen: "\x1b[42m\x1b[30m"
};

const envPath = path.join(__dirname, '.env');
const portTxtPath = path.join(__dirname, 'port.txt');

function getEnvConfig() {
  const config = {
    PORT: '3114',
    DEPLOY_MODE: 'cloud',
    APP_URL: 'https://appchef.up.railway.app',
    CORS_ORIGIN: '',
    JWT_SECRET: '',
    AUTO_START_INTEGRATIONS: 'true'
  };
  try {
    if (fs.existsSync(portTxtPath)) {
      config.PORT = fs.readFileSync(portTxtPath, 'utf8').trim() || '3114';
    }
  } catch (e) {}

  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    lines.forEach(line => {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m) {
        config[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    });
  }
  return config;
}

function saveEnvConfig(newConfig) {
  try {
    if (newConfig.PORT) {
      fs.writeFileSync(portTxtPath, String(newConfig.PORT).trim(), 'utf8');
    }

    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : `# CHEF COZINHA - SERVIDOR CONFIGURADO VIA SETUP INTERATIVO\n`;

    Object.keys(newConfig).forEach(key => {
      if (key === 'PORT') return;
      const regex = new RegExp(`^\\s*${key}\\s*=.*$`, 'm');
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${newConfig[key]}`);
      } else {
        envContent += `\n${key}=${newConfig[key]}`;
      }
    });

    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log(`\n${ANSI.green}✅ Configurações salvas no arquivo .env e port.txt! Rotas configuradas para: ${newConfig.APP_URL || 'Local'}${ANSI.reset}\n`);
  } catch (e) {
    console.error(`${ANSI.red}❌ Erro ao salvar configurações: ${e.message}${ANSI.reset}`);
  }
}

function runInteractiveSetup(onFinishAction) {
  console.clear();
  console.log(`
${ANSI.cyan}${ANSI.bright}  ┌──────────────────────────────────────────────────────────────────┐
  │                                                                  │
  │     ⚙️   CHEF COZINHA SaaS - SETUP & QUIZ DE CONFIGURAÇÃO        │
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘${ANSI.reset}
  ${ANSI.dim}Responda às perguntas abaixo para personalizar a URL pública e rotas do seu servidor.${ANSI.reset}
`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const current = getEnvConfig();
  const questions = [
    {
      key: 'APP_URL',
      text: `1. Domínio/URL Pública da Aplicação (ex: https://appchef.up.railway.app ou https://pizzaria.com.br) [Atual: ${current.APP_URL || 'https://appchef.up.railway.app'}]: `,
      default: current.APP_URL || 'https://appchef.up.railway.app'
    },
    {
      key: 'PORT',
      text: `2. Qual porta HTTP o backend deve utilizar? [Atual: ${current.PORT}]: `,
      default: current.PORT
    },
    {
      key: 'DEPLOY_MODE',
      text: `3. Modo de Operação [cloud / on-premise] (cloud = SaaS Nuvem Multi-Tenant, on-premise = Local) [Atual: ${current.DEPLOY_MODE}]: `,
      default: current.DEPLOY_MODE
    },
    {
      key: 'CORS_ORIGIN',
      text: `4. Origem CORS Autorizada (Deixe em branco para aceitar a URL da aplicação e locais) [Atual: ${current.CORS_ORIGIN || '*'}] : `,
      default: current.CORS_ORIGIN || ''
    }
  ];

  const answers = {};
  let qIdx = 0;

  function askNext() {
    if (qIdx >= questions.length) {
      rl.close();
      saveEnvConfig(answers);
      if (typeof onFinishAction === 'function') onFinishAction();
      else startServices();
      return;
    }

    const q = questions[qIdx];
    rl.question(`${ANSI.yellow}${q.text}${ANSI.reset}`, (ans) => {
      let val = ans.trim() || q.default;
      if (q.key === 'APP_URL' && val && !/^https?:\/\//i.test(val)) {
        val = 'https://' + val;
      }
      answers[q.key] = val;
      qIdx++;
      askNext();
    });
  }

  askNext();
}

function startServices() {
  console.log(`${ANSI.bright}${ANSI.green}🚀 Iniciando Servidor Backend e Servidor Frontend Vite...${ANSI.reset}\n`);
  const child = spawn('npx', ['concurrently', '"node --max-old-space-size=4096 server.js"', '"node --max-old-space-size=4096 ./node_modules/vite/bin/vite.js --host"'], {
    stdio: 'inherit',
    shell: true
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}

/* ══════════════════════════════════════════════════════════════════════
   MODO MANUAL — seleção de servidores que conversam entre si
   ══════════════════════════════════════════════════════════════════════ */

const SERVICOS = [
  { key: 'backend',    label: 'Servidor Principal  (API + Socket.IO dos restaurantes)', padrao: true },
  { key: 'frontend',   label: 'Frontend           (Vite Dev Server com hot-reload)',   padrao: true },
  { key: 'superadmin', label: 'Super Admin        (painel isolado na porta 3457)' },
  { key: 'database',   label: 'Banco de Dados     (verificação de integridade + backup)' },
  { key: 'hub',        label: 'Balanceador/Hub   (central multi-instância, porta 4000)' },
  { key: 'sync',       label: 'Apoio/Sync Agent  (sincronização entre servidores)' },
  { key: 'watchdog',   label: 'Backup/Watchdog   (reinicia o principal se ele cair)' }
];

function perguntar(rl, texto) {
  return new Promise((resolve) => rl.question(texto, (a) => resolve(a.trim())));
}

async function runModoManual() {
  const current = getEnvConfig();

  // .env inexistente → oferece cadastro guiado de variáveis antes de continuar
  if (!fs.existsSync(envPath)) {
    console.log(`\n${ANSI.yellow}⚠  Nenhum arquivo .env encontrado neste diretório.${ANSI.reset}`);
    const rl0 = readline.createInterface({ input: process.stdin, output: process.stdout });
    const quer = await perguntar(rl0, `${ANSI.cyan}Deseja cadastrar as variáveis agora (PORT, APP_URL, JWT_SECRET...)? [S/n]: ${ANSI.reset}`);
    rl0.close();
    if (!quer || /^s/i.test(quer)) {
      // Quiz roda e volta para a seleção de servidores ao terminar
      return runInteractiveSetup(() => selecionarServicos());
    }
    console.log(`${ANSI.dim}Seguindo com valores padrão. Você pode rodar o quiz depois pela opção 3.${ANSI.reset}\n`);
  }

  selecionarServicos();
}

async function selecionarServicos() {
  const current = getEnvConfig();
  const selecionados = new Set(SERVICOS.filter(s => s.padrao).map(s => s.key));

  console.clear();
  console.log(`
${ANSI.cyan}${ANSI.bright}  ──────────────────────────────────────────────────────
   MODO MANUAL — QUAIS SERVIDORES VOCÊ QUER INICIAR?
  ──────────────────────────────────────────────────────${ANSI.reset}
${ANSI.dim}  Quando disponíveis, eles se conversam automaticamente:
  • Super Admin ↔ Principal .... via /api/internal (métricas, emits)
  • Hub/Balanceador ↔ Apoio .... via WebSocket de sincronização
  • Watchdog ↔ Principal ....... monitora a porta ${current.PORT} e reinicia se cair${ANSI.reset}

`);

  SERVICOS.forEach((s, i) => {
    const marca = selecionados.has(s.key) ? `${ANSI.green}[x]${ANSI.reset}` : '[ ]';
    console.log(`   ${marca} ${i + 1}. ${s.label}`);
  });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const resp = await perguntar(rl, `\n${ANSI.yellow}Números dos serviços para iniciar (ex: 1,2,4) — ENTER = padrão [1,2]: ${ANSI.reset}`);

  if (resp) {
    selecionados.clear();
    resp.split(/[,;\s]+/).forEach(tok => {
      const n = parseInt(tok, 10);
      if (n >= 1 && n <= SERVICOS.length) selecionados.add(SERVICOS[n - 1].key);
    });
  }
  rl.close();

  if (selecionados.size === 0) {
    console.log(`${ANSI.red}Nenhum serviço selecionado. Encerrando.${ANSI.reset}`);
    process.exit(0);
  }

  // Watchdog já sobe o servidor principal sozinho — evita conflito de porta
  if (selecionados.has('watchdog') && selecionados.has('backend')) {
    console.log(`${ANSI.yellow}⚠  Watchdog selecionado junto do Servidor Principal.`);
    console.log(`   O watchdog sobe o principal por conta própria — removendo a duplicata.${ANSI.reset}`);
    selecionados.delete('backend');
  }

  // Banco de dados: verificação rápida ANTES de subir os serviços
  if (selecionados.has('database')) {
    await verificarBancoDados();
  }

  iniciarServicosSelecionados(selecionados, current);
}

async function verificarBancoDados() {
  console.log(`\n${ANSI.bright}── Banco de Dados: verificação de integridade ──${ANSI.reset}`);
  let SQLite3;
  try { SQLite3 = require('./sqlite3-wrapper').verbose(); } catch (e) {
    console.log(`${ANSI.red}Módulo sqlite3 indisponível: ${e.message}${ANSI.reset}`);
    return;
  }
  const arquivos = ['master.sqlite']
    .concat(fs.readdirSync(__dirname).filter(f => /^database_.*\.sqlite$/i.test(f)))
    .filter(f => fs.existsSync(path.join(__dirname, f)));

  if (!arquivos.length) {
    console.log(`${ANSI.yellow}Nenhum banco encontrado ainda (será criado no primeiro boot).${ANSI.reset}`);
    return;
  }

  const dirBackup = path.join(__dirname, 'backups');
  try { if (!fs.existsSync(dirBackup)) fs.mkdirSync(dirBackup); } catch (e) {}

  for (const arquivo of arquivos) {
    const caminho = path.join(__dirname, arquivo);
    const kb = Math.round(fs.statSync(caminho).size / 1024);
    await new Promise((resolve) => {
      const db = new SQLite3.Database(caminho, SQLite3.OPEN_READONLY, (err) => {
        if (err) { console.log(`  ${ANSI.red}✕ ${arquivo}: não abriu (${err.message})${ANSI.reset}`); return resolve(); }
        db.get('PRAGMA quick_check', (e2, row) => {
          const ok = !e2 && row && row.quick_check === 'ok';
          console.log(`  ${ok ? ANSI.green + '✓ íntegro' : ANSI.red + '✕ CORROMPIDO'}${ANSI.reset}  ${arquivo} (${kb} KB)`);
          if (!ok && e2) console.log(`    ${ANSI.red}${e2.message}${ANSI.reset}`);
          db.close(() => resolve());
        });
      });
    });
    // Backup seguro online (VACUUM INTO não trava nem corrompe com WAL ativo)
    if (/^master\.sqlite$/i.test(arquivo)) {
      await new Promise((resolve) => {
        const dbw = new SQLite3.Database(caminho, (err) => {
          if (err) return resolve();
          const destino = path.join(dirBackup, `master-${new Date().toISOString().slice(0, 10)}.sqlite`);
          dbw.exec(`VACUUM INTO '${destino.replace(/\\/g, '/')}'`, (eV) => {
            if (eV) console.log(`  ${ANSI.yellow}Backup automático falhou: ${eV.message}${ANSI.reset}`);
            else console.log(`  ${ANSI.green}✓ Backup salvo em backups/${path.basename(destino)}${ANSI.reset}`);
            dbw.close(() => resolve());
          });
        });
      });
    }
  }
  console.log('');
}

function iniciarServicosSelecionados(selecionados, cfgEnv) {
  const PORT = cfgEnv.PORT || '3000';
  const filhos = [];
  const CORES = {
    backend: ANSI.green, frontend: ANSI.magenta, superadmin: ANSI.cyan,
    hub: ANSI.blue, sync: ANSI.yellow, watchdog: ANSI.red
  };
  const NOMES = {
    backend: 'PRINCIPAL ', frontend: 'FRONTEND  ', superadmin: 'SUPERADMIN',
    hub: 'HUB/LB    ', sync: 'SYNC/APOIO', watchdog: 'BACKUP/WDT'
  };

  const defs = [];

  if (selecionados.has('backend')) {
    defs.push({
      nome: 'backend',
      cmd: 'node',
      args: ['server.js'],
      env: selecionados.has('superadmin') ? { SUPER_ADMIN_ISOLADO: '1' } : {}
    });
  }
  if (selecionados.has('frontend')) {
    defs.push({ nome: 'frontend', cmd: 'npx', args: ['vite', '--host'], shell: true, env: {} });
  }
  if (selecionados.has('superadmin')) {
    defs.push({
      nome: 'superadmin',
      cmd: 'node',
      args: ['super-admin-server.js'],
      env: { SUPER_ADMIN_PORT: '3457', MAIN_URL: `http://localhost:${PORT}` }
    });
  }
  if (selecionados.has('hub')) {
    defs.push({
      nome: 'hub',
      cmd: 'node',
      args: ['server-hub.js'],
      cwd: path.join(__dirname, 'hub-server'),
      env: { PORT: '4000' }
    });
  }
  if (selecionados.has('sync')) {
    defs.push({
      nome: 'sync',
      cmd: 'node',
      args: ['sync-agent.js'],
      env: selecionados.has('hub') ? { HUB_URL: 'http://localhost:4000' } : {}
    });
  }
  if (selecionados.has('watchdog')) {
    defs.push({ nome: 'watchdog', cmd: 'node', args: ['watchdog.js'], env: {} });
  }

  console.log(`${ANSI.bright}${ANSI.green}▶ Subindo ${defs.length} serviço(s)... Ctrl+C encerra todos com segurança.${ANSI.reset}\n`);

  let encerrando = false;
  function derrubarTudo() {
    if (encerrando) return;
    encerrando = true;
    console.log(`\n${ANSI.yellow}Encerrando serviços...${ANSI.reset}`);
    filhos.forEach(f => { try { f.proc.kill(); } catch (e) {} });
    setTimeout(() => process.exit(0), 800);
  }
  process.on('SIGINT', derrubarTudo);
  process.on('SIGTERM', derrubarTudo);

  defs.forEach(def => {
    const cor = CORES[def.nome] || ANSI.dim;
    const tag = `${cor}[${NOMES[def.nome]}]${ANSI.reset} `;
    const proc = spawn(def.cmd, def.args, {
      cwd: def.cwd || __dirname,
      shell: !!def.shell,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: Object.assign({}, process.env, def.env)
    });
    filhos.push({ nome: def.nome, proc });

    const prefixar = (buf) => String(buf).split(/\r?\n/).filter(l => l.length).forEach(l => console.log(tag + l));
    proc.stdout.on('data', prefixar);
    proc.stderr.on('data', prefixar);
    proc.on('exit', (code) => {
      console.log(`${cor}[${NOMES[def.nome]}]${ANSI.reset} ${code === 0 ? 'finalizou.' : ANSI.red + 'CAIU (código ' + code + ')' + ANSI.reset}`);
      // Servidor principal caiu e não há watchdog → derruba o resto (evita sistema pela metade)
      if (def.nome === 'backend' && code !== 0 && !selecionados.has('watchdog')) derrubarTudo();
    });
  });

  console.log(`
${ANSI.cyan}──────────────────────────────────────────────────────${ANSI.reset}
  ${ANSI.bright}Sistema distribuído no ar:${ANSI.reset}
  • Principal ..... http://localhost:${PORT}
${selecionados.has('frontend') ? `  • Frontend ...... http://localhost:5173 (rede: IP da máquina)\n` : ''}${selecionados.has('superadmin') ? `  • Super Admin ... http://localhost:3457/super-admin\n` : ''}${selecionados.has('hub') ? `  • Hub/LB ........ http://localhost:4000\n` : ''}
${ANSI.dim}  Dica: os serviços trocam eventos entre si automaticamente.
  Painéis abertos recebem avisos em tempo real se algo cair.${ANSI.reset}
${ANSI.cyan}──────────────────────────────────────────────────────${ANSI.reset}
`);
}

function main() {
  const options = [
    { label: "🚀 Iniciar Servidor Diretamente (Modo Rápido)", action: startServices },
    { label: "🛠️  Modo Manual — Escolher Servidores (Frontend, Super Admin, Banco, Hub/LB, Backup)", action: runModoManual },
    { label: "🧭  Configurar Servidor & Domínio (Setup Guiado / Quiz Interativo)", action: () => runInteractiveSetup() },
    { label: "❌ Sair", action: () => { console.log("Encerrado pelo usuário."); process.exit(0); } }
  ];

  let selectedIndex = 0;
  let countdown = 5;
  let timer = null;

  function renderMenu() {
    console.clear();
    console.log(`
${ANSI.cyan}${ANSI.bright}  ╭─────────────────── Chef Cozinha SaaS ───────────────────╮${ANSI.reset}
${ANSI.cyan}  │${ANSI.reset}  ${ANSI.magenta}󰣇 System Bootloader:${ANSI.reset} High-Performance Stack v1.0
${ANSI.cyan}  ╰─────────────────────────────────────────────────────────╯${ANSI.reset}

  ${ANSI.bright}Escolha a ação desejada [↑ / ↓ / ENTER]:${ANSI.reset}\n`);

    options.forEach((opt, idx) => {
      if (idx === selectedIndex) {
        console.log(`  ${ANSI.bgCyan}${ANSI.bright} ➔ ${idx + 1}. ${opt.label} ${ANSI.reset}`);
      } else {
        console.log(`     ${ANSI.dim}${idx + 1}. ${opt.label}${ANSI.reset}`);
      }
    });

    console.log(`\n  ${ANSI.yellow}⏱️  Iniciando automaticamente o modo selecionado em ${countdown}s... (Pressione uma tecla para pausar)${ANSI.reset}\n`);
  }

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  renderMenu();

  timer = setInterval(() => {
    countdown--;
    if (countdown <= 0) {
      clearInterval(timer);
      cleanupAndRun(options[selectedIndex].action);
    } else {
      renderMenu();
    }
  }, 1000);

  function cleanupAndRun(action) {
    clearInterval(timer);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.removeAllListeners('keypress');
    action();
  }

  process.stdin.on('keypress', (str, key) => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }

    if (key.name === 'up') {
      selectedIndex = (selectedIndex - 1 + options.length) % options.length;
      renderMenu();
    } else if (key.name === 'down') {
      selectedIndex = (selectedIndex + 1) % options.length;
      renderMenu();
    } else if (key.name === 'return' || key.name === 'enter') {
      cleanupAndRun(options[selectedIndex].action);
    } else if (['1', '2', '3', '4'].includes(str)) {
      const idx = parseInt(str, 10) - 1;
      if (idx >= 0 && idx < options.length) {
        selectedIndex = idx;
        cleanupAndRun(options[selectedIndex].action);
      }
    } else if (key.ctrl && key.name === 'c') {
      process.exit(0);
    }
  });
}

main();
