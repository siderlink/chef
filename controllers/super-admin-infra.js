/**
 * controllers/super-admin-infra.js
 * Módulos de Infraestrutura do Super Admin:
 * - Git & Deploy Parcial / Automático
 * - Supabase Cloud Sync
 * - Multi-Servidores & Load Balancing
 * - Túneis Cloudflare / Ngrok / Localtunnel
 */
'use strict';

const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const { exec: _gitExecCb } = require('child_process');
const TunnelManager = require('../tunnel-manager');

module.exports = function(app, masterDb, sqlite3, options) {
  const { superAdminAuth, io } = options || {};
  const tunnelManager = new TunnelManager();
  tunnelManager.setDb(masterDb);
  tunnelManager.loadConfig().catch(() => {});
  if (io) {
    tunnelManager.setLogCallback((msg) => {
      try { io.emit('tunnel_log', msg); } catch (e) {}
    });
  }
  setTimeout(() => {
    tunnelManager.autoStart().catch(() => {});
  }, 4000);

  function gitExec(cmd, timeoutMs) {
    return new Promise((resolve) => {
      const opts = { cwd: path.join(__dirname, '..'), windowsHide: true, timeout: timeoutMs || 30000, maxBuffer: 4 * 1024 * 1024 };
      _gitExecCb(cmd, opts, (err, stdout, stderr) => {
        resolve({ ok: !err, stdout: String(stdout || '').trim(), stderr: String(stderr || stdout || '').trim(), err });
      });
    });
  }

  function salvarCfgGlobal(chave, valor) {
    masterDb.run(`INSERT INTO configuracoes_global (chave, valor) VALUES (?, ?)
      ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, typeof valor === 'string' ? valor : JSON.stringify(valor)], () => {});
  }

  function lerCfgGlobalObj(chave, padrao) {
    return new Promise((resolve) => {
      masterDb.get(`SELECT valor FROM configuracoes_global WHERE chave = ?`, [chave], (err, row) => {
        if (err || !row || !row.valor) return resolve(padrao);
        try { resolve(JSON.parse(row.valor)); } catch (e) { resolve(padrao); }
      });
    });
  }

  let gitDeployEmAndamento = false;

  // --- Rotas Git ---
app.get('/api/super/git/status', superAdminAuth, async (req, res) => {
  const branch = await gitExec('git rev-parse --abbrev-ref HEAD', 10000);
  const remote = await gitExec('git config --get remote.origin.url', 10000);
  const auto = await lerCfgGlobalObj('git_auto_deploy', { enabled: false, intervalo_min: 30 });
  const lastFetch = await lerCfgGlobalObj('git_last_fetch', null);
  let behind = null, ahead = null;
  if (remote.ok && branch.ok) {
    const cnt = await gitExec(`git rev-list --left-right --count HEAD...origin/${branch.stdout}`, 15000);
    if (cnt.ok && /\d+\s+\d+/.test(cnt.stdout)) {
      const parts = cnt.stdout.split(/\s+/);
      ahead = parseInt(parts[0], 10); behind = parseInt(parts[1], 10);
    }
  }
  res.json({
    ok: true,
    conectado: remote.ok && !!remote.stdout,
    remote_url: remote.stdout || '',
    branch: branch.stdout || '?',
    ahead, behind,
    auto_deploy: auto,
    last_fetch: lastFetch
  });
});

// POST — conectar/alterar o repositório remoto (https, ssh ou caminho de rede local \\servidor\repo)
app.post('/api/super/git/conectar', superAdminAuth, async (req, res) => {
  const url = String((req.body || {}).url || '').trim();
  if (!url) return res.json({ ok: false, erro: 'Informe a URL do repositório ou o caminho de rede.' });
  if (!/^(https?:\/\/|git@|ssh:\/\/|\\\\|\/|file:\/\/|[a-zA-Z]:\\)/.test(url)) {
    return res.json({ ok: false, erro: 'Formato inválido. Use https://, git@, ssh:// ou caminho de rede \\\\servidor\\pasta.' });
  }
  const temOrigin = await gitExec('git config --get remote.origin.url', 10000);
  const cmd = (temOrigin.ok && temOrigin.stdout) ? `git remote set-url origin "${url}"` : `git remote add origin "${url}"`;
  const set = await gitExec(cmd, 15000);
  if (!set.ok) return res.json({ ok: false, erro: 'Falha ao configurar remote: ' + set.stderr });

  // Valida conexão real
  const teste = await gitExec('git ls-remote origin HEAD', 20000);
  if (!teste.ok) {
    return res.json({ ok: false, erro: 'Remote salvo, mas sem acesso: ' + (teste.stderr || 'verifique credenciais/rede') });
  }
  salvarCfgGlobal('git_last_fetch', Date.now());
  res.json({ ok: true, mensagem: 'Repositório conectado com sucesso!' });
});

// POST — buscar (fetch) novidades sem aplicar
app.post('/api/super/git/fetch', superAdminAuth, async (req, res) => {
  const f = await gitExec('git fetch --all --prune', 60000);
  salvarCfgGlobal('git_last_fetch', Date.now());
  if (!f.ok) return res.json({ ok: false, erro: 'Falha no fetch: ' + (f.stderr || 'sem acesso ao remoto') });
  const branch = await gitExec('git rev-parse --abbrev-ref HEAD', 10000);
  const cnt = await gitExec(`git rev-list --left-right --count HEAD...origin/${branch.stdout}`, 15000);
  let behind = 0;
  if (cnt.ok && /\d+\s+\d+/.test(cnt.stdout)) behind = parseInt(cnt.stdout.split(/\s+/)[1], 10) || 0;
  res.json({ ok: true, mensagem: behind > 0 ? `${behind} commit(s) novo(s) disponível(is).` : 'Você já está em dia.', behind });
});

// POST — puxar (pull fast-forward) os commits novos
app.post('/api/super/git/pull', superAdminAuth, async (req, res) => {
  if (gitDeployEmAndamento) return res.json({ ok: false, erro: 'Outra operação de deploy está em andamento.' });
  gitDeployEmAndamento = true;
  try {
    const antes = await gitExec('git rev-parse HEAD', 10000);
    const stash = await gitExec('git stash', 15000); // protege alterações locais não commitadas
    const pull = await gitExec('git pull --ff-only origin ' + ((await gitExec('git rev-parse --abbrev-ref HEAD', 10000)).stdout || ''), 120000);
    if (!pull.ok) {
      if (stash.ok && /Created automatic/.test(stash.stdout + stash.stderr)) await gitExec('git stash pop', 15000);
      return res.json({ ok: false, erro: 'Falha no pull: ' + (pull.stderr || '') });
    }
    const depois = await gitExec('git rev-parse HEAD', 10000);
    let novos = [];
    if (antes.ok && depois.ok && antes.stdout !== depois.stdout) {
      const log = await gitExec(`git log --pretty=format:"%h|%s" ${antes.stdout}..${depois.stdout}`, 15000);
      novos = log.stdout.split('\n').filter(Boolean).map(l => { const p = l.split('|'); return { hash: p[0], mensagem: p[1] }; });
    }
    // Recarrega módulos backend que possam ter mudado (efeito parcial; restart completo aplica tudo)
    ['./feature-plans.js'].forEach(m => { try { delete require.cache[require.resolve(m)]; } catch (e) {} });
    io.emit('commits_atualizados', { novos });
    res.json({ ok: true, mensagem: novos.length ? `${novos.length} novo(s) commit(ns) puxado(s)! Use "Aplicar" para publicar.` : 'Nada novo para puxar.', novos });
  } finally {
    gitDeployEmAndamento = false;
  }
});

// POST — deploy PARCIAL: aplica somente os arquivos de um commit.
// Front-end (html/css/js públicos) entra no ar na hora, SEM reiniciar o servidor.
// Arquivos de backend exigem reinício — informado na resposta.
const BACKEND_PATTERNS = [/^server\.js$/i, /^controllers\//i, /^package(-lock)?\.json$/i];
app.post('/api/super/git/deploy-parcial', superAdminAuth, async (req, res) => {
  const hash = String((req.body || {}).hash || '').replace(/[^a-f0-9]/gi, '');
  const incluirBackend = !!((req.body || {}).incluir_backend);
  if (!hash) return res.json({ ok: false, erro: 'Hash do commit é obrigatório.' });
  if (gitDeployEmAndamento) return res.json({ ok: false, erro: 'Outra operação de deploy está em andamento.' });
  gitDeployEmAndamento = true;
  try {
    const show = await gitExec(`git show --name-only --pretty=format: ${hash}`, 20000);
    if (!show.ok) return res.json({ ok: false, erro: 'Commit não encontrado: ' + show.stderr });
    const arquivos = show.stdout.split('\n').map(s => s.trim()).filter(Boolean);
    if (!arquivos.length) return res.json({ ok: false, erro: 'Commit sem arquivos alterados.' });

    const front = arquivos.filter(a => !BACKEND_PATTERNS.some(rx => rx.test(a.replace(/\\/g, '/'))));
    const back = arquivos.filter(a => BACKEND_PATTERNS.some(rx => rx.test(a.replace(/\\/g, '/'))));

    const aplicar = incluirBackend ? arquivos : front;
    if (aplicar.length) {
      const checkout = await gitExec(`git checkout ${hash} -- ${aplicar.map(a => `"${a}"`).join(' ')}`, 60000);
      if (!checkout.ok) return res.json({ ok: false, erro: 'Falha ao aplicar arquivos: ' + checkout.stderr });
    }

    if (!incluirBackend && back.length) {
      io.emit('sistema_hot_swapped', { hash, parcial: true, aplicados: front.length, mensagem: 'Deploy parcial aplicado. Backend pendente de reinício.' });
      return res.json({
        ok: true,
        hot_swap: true,
        mensagem: `${front.length} arquivo(s) front-end aplicado(s) SEM reiniciar! ${back.length} arquivo(s) de backend precisam de reinício para valer.`,
        aplicados: front,
        backend_pendente: back,
        requerRestart: true
      });
    }
    io.emit('sistema_hot_swapped', { hash, parcial: true, aplicados: arquivos.length, mensagem: 'Deploy parcial aplicado.' });
    res.json({
      ok: true,
      hot_swap: true,
      mensagem: `Deploy aplicado (${arquivos.length} arquivo(s)).${back.length ? ' Reinicie o servidor para ativar mudanças de backend.' : ' Nenhuma reiniciação necessária.'}`,
      aplicados: aplicar,
      requerRestart: back.length > 0
    });
  } finally {
    gitDeployEmAndamento = false;
  }
});

// POST — configura auto-deploy (quando surgirem commits novos no remoto)
app.post('/api/super/git/auto-deploy', superAdminAuth, async (req, res) => {
  const enabled = !!((req.body || {}).enabled);
  const intervalo_min = Math.min(720, Math.max(5, parseInt((req.body || {}).intervalo_min, 10) || 30));
  const modo = (req.body || {}).modo === 'completo' ? 'completo' : 'parcial';
  salvarCfgGlobal('git_auto_deploy', { enabled, intervalo_min, modo });
  res.json({ ok: true, mensagem: `Auto-deploy ${enabled ? 'ativado' : 'desativado'} (checando a cada ${intervalo_min} min, modo ${modo}).` });
});

// Poller do auto-deploy: checa a cada 60s se é hora de buscar novidades
setInterval(async () => {
  try {
    const cfg = await lerCfgGlobalObj('git_auto_deploy', { enabled: false, intervalo_min: 30 });
    if (!cfg.enabled || gitDeployEmAndamento) return;
    const lastFetch = (await lerCfgGlobalObj('git_last_fetch', 0)) || 0;
    if (Date.now() - lastFetch < (cfg.intervalo_min * 60 * 1000)) return;
    salvarCfgGlobal('git_last_fetch', Date.now());

    const f = await gitExec('git fetch --all --prune', 60000);
    if (!f.ok) return;
    const branch = await gitExec('git rev-parse --abbrev-ref HEAD', 10000);
    const cnt = await gitExec(`git rev-list --right-only --count HEAD...origin/${branch.stdout}`, 15000);
    const behind = cnt.ok ? (parseInt(cnt.stdout, 10) || 0) : 0;
    if (!behind) return;

    console.log(`[auto-deploy] ${behind} novo(s) commit(s) detectado(s). Aplicando (modo ${cfg.modo})...`);
    if (cfg.modo === 'parcial') {
      // aplica os commits novos um a um como deploy parcial front-end
      const log = await gitExec(`git log --reverse --pretty=format:"%h" HEAD..origin/${branch.stdout}`, 15000);
      const hashes = log.stdout.split('\n').filter(Boolean);
      for (const h of hashes) {
        const show = await gitExec(`git show --name-only --pretty=format: ${h}`, 20000);
        const arquivos = show.stdout.split('\n').map(s => s.trim()).filter(Boolean);
        const front = arquivos.filter(a => !BACKEND_PATTERNS.some(rx => rx.test(a.replace(/\\/g, '/'))));
        const back = arquivos.filter(a => BACKEND_PATTERNS.some(rx => rx.test(a.replace(/\\/g, '/'))));
        if (front.length) await gitExec(`git checkout ${h} -- ${front.map(a => `"${a}"`).join(' ')}`, 60000);
        if (back.length) {
          // backend muda: avisa painéis; reinício automático apenas com GIT_AUTO_RESTART=1
          io.emit('atualizacao_backend_pendente', { hash: h, arquivos: back });
          if (process.env.GIT_AUTO_RESTART === '1') {
            salvarCfgGlobal('git_auto_restart_pendente', { hash: h, ts: Date.now() });
            setTimeout(() => process.exit(3), 5000);
            return;
          }
        }
      }
      io.emit('sistema_hot_swapped', { auto: true, commits: hashes.length, mensagem: `Auto-deploy: ${hashes.length} commit(s) aplicado(s) sem quedas.` });
    } else {
      // modo completo: pull inteiro e recarga de módulos
      const antes = await gitExec('git rev-parse HEAD', 10000);
      const pull = await gitExec(`git pull --ff-only origin ${branch.stdout}`, 120000);
      if (pull.ok) {
        ['./feature-plans.js'].forEach(m => { try { delete require.cache[require.resolve(m)]; } catch (e) {} });
        io.emit('sistema_hot_swapped', { auto: true, completo: true, mensagem: 'Auto-deploy completo realizado.' });
      }
    }
  } catch (e) {
    console.error('[auto-deploy] erro:', e.message);
  }
}, 60000);


// �?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?
// ── SUPER ADMIN: SUPABASE CONFIG ─────────────────────────────────────
// �?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?

// GET /api/super/commits — Lista os ultimos 15 commits do repositorio Git
app.get('/api/super/commits', superAdminAuth, async (req, res) => {
  const logRes = await gitExec('git log -n 15 --pretty=format:"%h|%s|%an|%ar"', 15000);
  if (!logRes.ok) return res.json({ ok: false, erro: 'Falha ao obter historico Git: ' + logRes.stderr });
  const lines = logRes.stdout.split('\n').filter(Boolean);
  const commits = lines.map(line => {
    const parts = line.split('|');
    return {
      hash: parts[0],
      mensagem: parts[1] || 'Sem mensagem',
      autor: parts[2] || 'Anonimo',
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

// POST /api/super/commits/meta — Marca commit como estavel/quebrado e salva nota rapida
app.post('/api/super/commits/meta', superAdminAuth, (req, res) => {
  const { hash } = req.body || {};
  const status = req.body && req.body.status !== undefined ? req.body.status : null;
  const nota = req.body && req.body.nota !== undefined ? String(req.body.nota).slice(0, 500) : null;
  const safeHash = String(hash || '').replace(/[^a-f0-9]/gi, '');
  if (!safeHash) return res.json({ ok: false, erro: 'Hash do commit e obrigatorio.' });
  if (status !== null && !['estavel', 'quebrado', ''].includes(status)) {
    return res.json({ ok: false, erro: 'Status invalido. Use "estavel", "quebrado" ou "".' });
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

// POST /api/super/deploy-commit — Executa deploy zero-downtime para um commit especifico
app.post('/api/super/deploy-commit', superAdminAuth, async (req, res) => {
  const { hash } = req.body || {};
  if (!hash) return res.json({ ok: false, erro: 'Hash do commit e obrigatorio.' });
  const safeHash = String(hash).replace(/[^a-f0-9]/gi, '');

  const checkoutRes = await gitExec(`git checkout ${safeHash}`, 30000);
  if (!checkoutRes.ok) return res.json({ ok: false, erro: 'Erro ao alternar para o commit: ' + (checkoutRes.stderr || (checkoutRes.err && checkoutRes.err.message)) });

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
      const resolved = require.resolve(path.join(__dirname, '..', mod));
      delete require.cache[resolved];
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
      mensagem: 'Servidor atualizado para commit ' + safeHash + '. Recarregue a pagina para ver mudancas.'
    });
  }

  res.json({
    ok: true,
    mensagem: `Deploy Zero-Downtime efetuado para o commit ${safeHash}. ${reloadResult.length} modulo(s) recarregado(s).`,
    reload_result: reloadResult
  });
});


let supabaseSyncEmAndamento = false;
let supabaseUltimoLog = null;

// GET — carrega configuração completa do Supabase
app.get('/api/super/supabase-config', superAdminAuth, (req, res) => {
  masterDb.all(`SELECT key, value FROM super_config WHERE key LIKE 'supabase_%'`, [], (err, rows) => {
    const config = {};
    (rows || []).forEach(r => { config[r.key] = r.value; });
    res.json({
      ok: true,
      config: {
        url: config.supabase_url || '',
        anon_key: config.supabase_anon_key || '',
        service_role_key: config.supabase_service_role_key || '',
        enabled: config.supabase_enabled || 'false',
        sync_mode: config.supabase_sync_mode || 'hybrid',
        sync_frequency: config.supabase_sync_frequency || 'manual',
        sync_tenants: config.supabase_sync_tenants !== 'false',
        sync_backups: config.supabase_sync_backups !== 'false',
        sync_telemetry: config.supabase_sync_telemetry !== 'false',
        storage_bucket: config.supabase_storage_bucket || 'chef-backups',
        backup_retention: parseInt(config.supabase_backup_retention, 10) || 14,
        last_sync_time: config.supabase_last_sync_time || null,
        last_sync_status: config.supabase_last_sync_status || null,
        last_sync_log: config.supabase_last_sync_log ? JSON.parse(config.supabase_last_sync_log) : null
      }
    });
  });
});

// POST — salva configuração do Supabase com opções de execução
app.post('/api/super/supabase-config', superAdminAuth, (req, res) => {
  const b = req.body || {};
  const serviceKeyFornecida = typeof b.service_role_key === 'string' && b.service_role_key.trim() !== '';
  
  const campos = {
    supabase_url: (b.url || '').trim(),
    supabase_anon_key: (b.anon_key || '').trim(),
    supabase_service_role_key: serviceKeyFornecida ? b.service_role_key.trim() : null,
    supabase_enabled: b.enabled ? 'true' : 'false',
    supabase_sync_mode: ['hybrid', 'storage', 'relational'].includes(b.sync_mode) ? b.sync_mode : 'hybrid',
    supabase_sync_frequency: ['manual', '1h', '6h', 'daily'].includes(b.sync_frequency) ? b.sync_frequency : 'manual',
    supabase_sync_tenants: b.sync_tenants !== false ? 'true' : 'false',
    supabase_sync_backups: b.sync_backups !== false ? 'true' : 'false',
    supabase_sync_telemetry: b.sync_telemetry !== false ? 'true' : 'false',
    supabase_storage_bucket: (b.storage_bucket || 'chef-backups').trim(),
    supabase_backup_retention: String(Math.max(1, parseInt(b.backup_retention, 10) || 14))
  };

  masterDb.serialize(() => {
    Object.keys(campos).forEach(k => {
      if (campos[k] === null) return;
      masterDb.run(`INSERT OR REPLACE INTO super_config (key, value) VALUES (?, ?)`, [k, campos[k]]);
    });
  });
  res.json({ ok: true, mensagem: 'Configuração e regras de execução do Supabase salvas com sucesso!' });
});

// POST — testa conexão com Supabase
app.post('/api/super/supabase-test', superAdminAuth, async (req, res) => {
  const { url, anon_key, service_role_key } = req.body || {};
  if (!url) return res.json({ ok: false, erro: 'URL do projeto é obrigatória para testar.' });
  const keyToTest = (service_role_key || anon_key || '').trim();
  if (!keyToTest) return res.json({ ok: false, erro: 'Informe a Anon Key ou Service Role Key para testar.' });

  try {
    const testUrl = url.replace(/\/+$/, '') + '/rest/v1/';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'apikey': keyToTest,
        'Authorization': 'Bearer ' + keyToTest
      },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (response.ok || response.status === 200) {
      res.json({ ok: true, mensagem: 'Conexão com Supabase bem-sucedida!', status: response.status });
    } else {
      res.json({ ok: false, erro: `Supabase respondeu com status ${response.status}: ${response.statusText}` });
    }
  } catch (e) {
    res.json({ ok: false, erro: 'Falha ao conectar: ' + (e.message || 'Timeout ou URL inválida') });
  }
});

// Função central: executa a sincronização conforme as regras configuradas
async function executarSincronizacaoSupabase(origem = 'manual') {
  if (supabaseSyncEmAndamento) {
    return { ok: false, emAndamento: true, mensagem: 'Uma sincronização já está em andamento.' };
  }

  supabaseSyncEmAndamento = true;
  const logs = [];
  const addLog = (msg, tipo = 'info') => {
    logs.push({ ts: new Date().toISOString(), msg, tipo });
    console.log(`[SupabaseSync] ${msg}`);
  };

  try {
    addLog(`Iniciando sincronização com Supabase (origem: ${origem})...`);

    // Carregar configurações do masterDb
    const cfgRows = await new Promise((resolve) => {
      masterDb.all(`SELECT key, value FROM super_config WHERE key LIKE 'supabase_%'`, [], (err, rows) => resolve(rows || []));
    });
    const cfg = {};
    cfgRows.forEach(r => { cfg[r.key] = r.value; });

    if (cfg.supabase_enabled !== 'true') {
      addLog('Sincronização cancelada: integração desativada nas configurações.', 'aviso');
      return { ok: false, mensagem: 'Integração desativada.' };
    }

    const url = (cfg.supabase_url || '').replace(/\/+$/, '');
    const authKey = cfg.supabase_service_role_key || cfg.supabase_anon_key || '';
    if (!url || !authKey) {
      addLog('URL ou chave de API não configurada.', 'erro');
      return { ok: false, mensagem: 'Credenciais ausentes.' };
    }

    const mode = cfg.supabase_sync_mode || 'hybrid';
    const syncTenants = cfg.supabase_sync_tenants !== 'false';
    const syncBackups = cfg.supabase_sync_backups !== 'false';
    const syncTelemetry = cfg.supabase_sync_telemetry !== 'false';
    const bucket = cfg.supabase_storage_bucket || 'chef-backups';

    const restHeaders = {
      'apikey': authKey,
      'Authorization': 'Bearer ' + authKey,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates'
    };

    // ── 1. Sincronização Relacional: Estabelecimentos & Licenças ──
    if (mode !== 'storage' && syncTenants) {
      addLog('Consultando estabelecimentos e licenças para sincronização...');
      const restaurantes = await new Promise((res) => masterDb.all(`SELECT * FROM restaurantes`, [], (e, r) => res(r || [])));
      const licencas = await new Promise((res) => masterDb.all(`SELECT * FROM licencas`, [], (e, r) => res(r || [])));

      if (restaurantes.length > 0) {
        try {
          const resRest = await fetch(`${url}/rest/v1/restaurantes`, {
            method: 'POST',
            headers: restHeaders,
            body: JSON.stringify(restaurantes)
          });
          if (resRest.ok || resRest.status === 201) {
            addLog(`✔ ${restaurantes.length} estabelecimentos sincronizados no Supabase.`);
          } else {
            addLog(`Aviso ao enviar restaurantes (${resRest.status}): certifique-se que a tabela existe no Supabase.`, 'aviso');
          }
        } catch (e) {
          addLog(`Erro ao enviar restaurantes: ${e.message}`, 'aviso');
        }
      }

      if (licencas.length > 0) {
        try {
          const resLic = await fetch(`${url}/rest/v1/licencas`, {
            method: 'POST',
            headers: restHeaders,
            body: JSON.stringify(licencas)
          });
          if (resLic.ok || resLic.status === 201) {
            addLog(`✔ ${licencas.length} licenças sincronizadas no Supabase.`);
          } else {
            addLog(`Aviso ao enviar licenças (${resLic.status}).`, 'aviso');
          }
        } catch (e) {
          addLog(`Erro ao enviar licenças: ${e.message}`, 'aviso');
        }
      }
    }

    // ── 2. Sincronização de Telemetria & Métricas ──
    if (mode !== 'storage' && syncTelemetry) {
      addLog('Consultando telemetria recente...');
      const telemetria = await new Promise((res) => masterDb.all(`SELECT * FROM telemetria ORDER BY id DESC LIMIT 500`, [], (e, r) => res(r || [])));
      if (telemetria.length > 0) {
        try {
          const resTelem = await fetch(`${url}/rest/v1/telemetria`, {
            method: 'POST',
            headers: restHeaders,
            body: JSON.stringify(telemetria)
          });
          if (resTelem.ok || resTelem.status === 201) {
            addLog(`✔ ${telemetria.length} registros de telemetria sincronizados.`);
          }
        } catch (e) {
          addLog(`Aviso telemetria: ${e.message}`, 'aviso');
        }
      }
    }

    // ── 3. Backup de Bancos SQLite Comprimidos (.gz) para o Supabase Storage ──
    if (mode !== 'relational' && syncBackups) {
      addLog(`Preparando compactação de bancos de dados para o Storage (Bucket: ${bucket})...`);
      const rootDir = path.join(__dirname, '..');
      const dbFiles = ['master.sqlite'];
      try {
        const itens = fs.readdirSync(rootDir);
        itens.forEach(it => {
          if (/^database_\d+\.sqlite$/.test(it)) dbFiles.push(it);
        });
      } catch (e) {}

      let backupsEnviados = 0;
      const dataHoje = new Date().toISOString().slice(0, 10);

      for (const dbName of dbFiles) {
        const fullPath = path.join(rootDir, dbName);
        if (!fs.existsSync(fullPath)) continue;

        try {
          const rawBuffer = fs.readFileSync(fullPath);
          const gzBuffer = zlib.gzipSync(rawBuffer);
          const destName = `${dataHoje}/${dbName}.gz`;

          const storageUrl = `${url}/storage/v1/object/${bucket}/${destName}`;
          const resStorage = await fetch(storageUrl, {
            method: 'POST',
            headers: {
              'apikey': authKey,
              'Authorization': 'Bearer ' + authKey,
              'Content-Type': 'application/gzip',
              'x-upsert': 'true'
            },
            body: gzBuffer
          });

          if (resStorage.ok || resStorage.status === 200 || resStorage.status === 201) {
            backupsEnviados++;
            addLog(`✔ Backup ${dbName} (.gz: ${(gzBuffer.length / 1024).toFixed(1)} KB) enviado para ${bucket}/${destName}`);
          } else {
            const errTxt = await resStorage.text();
            addLog(`Aviso ao enviar ${dbName} para Storage (${resStorage.status}): ${errTxt.slice(0, 100)}`, 'aviso');
          }
        } catch (errDb) {
          addLog(`Erro ao compactar ${dbName}: ${errDb.message}`, 'erro');
        }
      }
      addLog(`Compactação e envio concluídos: ${backupsEnviados}/${dbFiles.length} bancos salvos no Cloud Storage.`);
    }

    const agora = new Date().toISOString();
    supabaseUltimoLog = logs;

    masterDb.serialize(() => {
      masterDb.run(`INSERT OR REPLACE INTO super_config (key, value) VALUES ('supabase_last_sync_time', ?)`, [agora]);
      masterDb.run(`INSERT OR REPLACE INTO super_config (key, value) VALUES ('supabase_last_sync_status', 'success')`);
      masterDb.run(`INSERT OR REPLACE INTO super_config (key, value) VALUES ('supabase_last_sync_log', ?)`, [JSON.stringify(logs)]);
    });

    if (io && io.emit) {
      io.emit('supabase_sync_completed', { ts: agora, status: 'success', logs });
    }

    addLog('✔ Sincronização finalizada com êxito!');
    return { ok: true, timestamp: agora, logs };
  } catch (errGlobal) {
    addLog(`Falha crítica na sincronização: ${errGlobal.message}`, 'erro');
    masterDb.run(`INSERT OR REPLACE INTO super_config (key, value) VALUES ('supabase_last_sync_status', 'error')`);
    return { ok: false, erro: errGlobal.message, logs };
  } finally {
    supabaseSyncEmAndamento = false;
  }
}

// POST — Disparo manual "Sincronizar Agora"
app.post('/api/super/supabase-sync-now', superAdminAuth, async (req, res) => {
  const result = await executarSincronizacaoSupabase('manual');
  res.json(result);
});

// GET — Status detalhado da última sincronização
app.get('/api/super/supabase-sync-status', superAdminAuth, (req, res) => {
  masterDb.all(`SELECT key, value FROM super_config WHERE key IN ('supabase_last_sync_time', 'supabase_last_sync_status', 'supabase_last_sync_log', 'supabase_enabled', 'supabase_sync_frequency')`, [], (err, rows) => {
    const data = {};
    (rows || []).forEach(r => { data[r.key] = r.value; });
    res.json({
      ok: true,
      is_syncing: supabaseSyncEmAndamento,
      last_sync_time: data.supabase_last_sync_time || null,
      last_sync_status: data.supabase_last_sync_status || null,
      last_sync_log: data.supabase_last_sync_log ? JSON.parse(data.supabase_last_sync_log) : (supabaseUltimoLog || null),
      enabled: data.supabase_enabled === 'true',
      frequency: data.supabase_sync_frequency || 'manual'
    });
  });
});

// Agendador em segundo plano de acordo com a frequência configurada (1h, 6h, daily)
setInterval(async () => {
  try {
    if (supabaseSyncEmAndamento) return;
    const rows = await new Promise(r => masterDb.all(`SELECT key, value FROM super_config WHERE key IN ('supabase_enabled', 'supabase_sync_frequency', 'supabase_last_sync_time')`, [], (e, d) => r(d || [])));
    const cfg = {};
    rows.forEach(x => { cfg[x.key] = x.value; });

    if (cfg.supabase_enabled !== 'true') return;
    const freq = cfg.supabase_sync_frequency || 'manual';
    if (freq === 'manual') return;

    const last = cfg.supabase_last_sync_time ? new Date(cfg.supabase_last_sync_time).getTime() : 0;
    const diffHours = (Date.now() - last) / (1000 * 60 * 60);

    let shouldRun = false;
    if (freq === '1h' && diffHours >= 1) shouldRun = true;
    else if (freq === '6h' && diffHours >= 6) shouldRun = true;
    else if (freq === 'daily' && diffHours >= 24) shouldRun = true;

    if (shouldRun) {
      console.log(`[SupabaseSync] Disparando sincronização agendada (frequência: ${freq})...`);
      await executarSincronizacaoSupabase(`agendada_${freq}`);
    }
  } catch (e) {
    console.error('[SupabaseScheduler] erro:', e.message);
  }
}, 60000);

// �?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?
// ── SUPER ADMIN: MULTI-SERVER / BALANCEAMENTO DE CARGA ───────────────
// �?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?

// GET — lista servidores configurados
app.get('/api/super/servers', superAdminAuth, (req, res) => {
  masterDb.get(`SELECT value FROM super_config WHERE key = 'multi_servers'`, [], (err, row) => {
    let servers = [];
    try { servers = JSON.parse((row || {}).value || '[]'); } catch(e) {}
    masterDb.get(`SELECT value FROM super_config WHERE key = 'lb_strategy'`, [], (err2, row2) => {
      const strategy = (row2 || {}).value || 'round_robin';
      res.json({ ok: true, servers, strategy });
    });
  });
});

// POST — adiciona/atualiza servidor
app.post('/api/super/servers', superAdminAuth, (req, res) => {
  const { nome, url, porta, peso, id } = req.body || {};
  if (!nome || !url) return res.json({ ok: false, erro: 'Nome e URL são obrigatórios.' });

  masterDb.get(`SELECT value FROM super_config WHERE key = 'multi_servers'`, [], (err, row) => {
    let servers = [];
    try { servers = JSON.parse((row || {}).value || '[]'); } catch(e) {}

    if (id) {
      servers = servers.map(s => s.id === id ? { ...s, nome, url: url.replace(/\/+$/, ''), porta: porta || '', peso: parseInt(peso) || 1 } : s);
    } else {
      servers.push({
        id: 'srv_' + Date.now(),
        nome,
        url: url.replace(/\/+$/, ''),
        porta: porta || '',
        peso: parseInt(peso) || 1,
        criado_em: new Date().toISOString()
      });
    }

    masterDb.run(`INSERT OR REPLACE INTO super_config (key, value) VALUES ('multi_servers', ?)`, [JSON.stringify(servers)], () => {
      res.json({ ok: true, mensagem: id ? 'Servidor atualizado!' : 'Servidor adicionado!', servers });
    });
  });
});

// DELETE — remove servidor
app.delete('/api/super/servers', superAdminAuth, (req, res) => {
  const { id } = req.body || {};
  if (!id) return res.json({ ok: false, erro: 'ID do servidor é obrigatório.' });

  masterDb.get(`SELECT value FROM super_config WHERE key = 'multi_servers'`, [], (err, row) => {
    let servers = [];
    try { servers = JSON.parse((row || {}).value || '[]'); } catch(e) {}
    servers = servers.filter(s => s.id !== id);
    masterDb.run(`INSERT OR REPLACE INTO super_config (key, value) VALUES ('multi_servers', ?)`, [JSON.stringify(servers)], () => {
      res.json({ ok: true, mensagem: 'Servidor removido!', servers });
    });
  });
});

// POST — salva estratégia de balanceamento
app.post('/api/super/servers/strategy', superAdminAuth, (req, res) => {
  const { strategy } = req.body || {};
  if (!strategy) return res.json({ ok: false, erro: 'Estratégia é obrigatória.' });
  masterDb.run(`INSERT OR REPLACE INTO super_config (key, value) VALUES ('lb_strategy', ?)`, [strategy], () => {
    res.json({ ok: true, mensagem: 'Estratégia de balanceamento salva!' });
  });
});

// POST — testa conectividade de um servidor
app.post('/api/super/servers/test', superAdminAuth, async (req, res) => {
  const { url, porta } = req.body || {};
  if (!url) return res.json({ ok: false, erro: 'URL é obrigatória.' });

  try {
    const testUrl = porta ? `${url.replace(/\/+$/, '')}:${porta}/` : `${url.replace(/\/+$/, '')}/`;
    const inicio = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(testUrl, { method: 'GET', signal: controller.signal });
    clearTimeout(timeout);
    const latencia = Date.now() - inicio;

    res.json({ ok: true, status: response.status, latencia: latencia + 'ms', mensagem: `Servidor respondeu em ${latencia}ms (HTTP ${response.status})` });
  } catch (e) {
    res.json({ ok: false, erro: 'Falha ao conectar: ' + (e.message || 'Timeout ou URL inválida') });
  }
});

// POST /api/super/servers/ping-all — testa o nó local e todos os servidores adicionais em paralelo
app.post('/api/super/servers/ping-all', superAdminAuth, async (req, res) => {
  try {
    const mem = process.memoryUsage();
    const local = {
      id: 'local',
      nome: 'Nó Local (Host Atual)',
      status: 'online',
      latencia: '0ms',
      uptime: Math.floor(process.uptime()),
      memoria: (mem.heapUsed / (1024 * 1024)).toFixed(1) + ' MB',
      node: process.version,
      pid: process.pid
    };

    masterDb.get(`SELECT value FROM super_config WHERE key = 'multi_servers'`, [], async (err, row) => {
      let servers = [];
      try { servers = JSON.parse((row || {}).value || '[]'); } catch(e) {}

      const resultados = await Promise.all(servers.map(async (s) => {
        const testUrl = s.porta ? `${s.url.replace(/\/+$/, '')}:${s.porta}/` : `${s.url.replace(/\/+$/, '')}/`;
        const inicio = Date.now();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        try {
          const resp = await fetch(testUrl, { method: 'GET', signal: controller.signal });
          clearTimeout(timeout);
          const lat = Date.now() - inicio;
          return {
            id: s.id,
            nome: s.nome,
            url: s.url,
            porta: s.porta,
            status: resp.ok || resp.status < 500 ? 'online' : 'erro',
            statusCode: resp.status,
            latencia: lat + 'ms'
          };
        } catch (errPing) {
          clearTimeout(timeout);
          return {
            id: s.id,
            nome: s.nome,
            url: s.url,
            porta: s.porta,
            status: 'offline',
            erro: errPing.message || 'Timeout',
            latencia: '--'
          };
        }
      }));

      res.json({
        ok: true,
        local,
        servers: resultados,
        totalOnline: 1 + resultados.filter(r => r.status === 'online').length,
        totalServidores: 1 + resultados.length
      });
    });
  } catch (err) {
    res.json({ ok: false, erro: err.message });
  }
});

// �?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?
// TÚNEIS & FALLBACK — endpoints para gerenciamento de túneis
// �?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?

// GET /api/super/tuneis/status — status de todos os túneis
app.get('/api/super/tuneis/status', superAdminAuth, async (req, res) => {
  await tunnelManager.loadConfig();
  res.json({ ok: true, ...tunnelManager.getStatus() });
});

// POST /api/super/tuneis/config-global — salvar config global (porta, modo, prioridade)
app.post('/api/super/tuneis/config-global', superAdminAuth, async (req, res) => {
  const { port, mode, priority } = req.body || {};
  try {
    await tunnelManager.saveGlobalConfig(port, mode, priority);
    res.json({ ok: true, mensagem: 'Configuração global de túneis salva!' });
  } catch (e) {
    res.json({ ok: false, erro: e.message });
  }
});

// POST /api/super/tuneis/config/:name — salvar config de um túnel específico
app.post('/api/super/tuneis/config/:name', superAdminAuth, async (req, res) => {
  const name = req.params.name;
  try {
    await tunnelManager.saveConfig(name, req.body || {});
    res.json({ ok: true, mensagem: `Configuração de ${name} salva!` });
  } catch (e) {
    res.json({ ok: false, erro: e.message });
  }
});

// POST /api/super/tuneis/start/:name — iniciar um túnel
app.post('/api/super/tuneis/start/:name', superAdminAuth, (req, res) => {
  const result = tunnelManager.start(req.params.name);
  res.json(result);
});

// POST /api/super/tuneis/stop/:name — parar um túnel
app.post('/api/super/tuneis/stop/:name', superAdminAuth, (req, res) => {
  const result = tunnelManager.stop(req.params.name);
  res.json(result);
});

// POST /api/super/tuneis/stop-all — parar todos os túneis
app.post('/api/super/tuneis/stop-all', superAdminAuth, (req, res) => {
  const results = tunnelManager.stopAll();
  res.json({ ok: true, resultados: results });
});

// GET /api/super/tuneis/logs — logs de atividade dos túneis
app.get('/api/super/tuneis/logs', superAdminAuth, (req, res) => {
  const name = req.query.tunnel || null;
  res.json({ ok: true, logs: tunnelManager.getLogs(name) });
});



// GET /api/super/tuneis/active-url — retorna a URL pública ativa do túnel
app.get('/api/super/tuneis/active-url', superAdminAuth, (req, res) => {
  const status = tunnelManager.getStatus();
  const activeTunnel = status.tunnels.find(t => t.status === 'running' && t.url);
  if (activeTunnel) {
    res.json({
      ok: true,
      active: true,
      url: activeTunnel.url,
      superAdminUrl: `${activeTunnel.url}/super-admin.html`,
      name: activeTunnel.name,
      uptime: activeTunnel.uptime
    });
  } else {
    res.json({
      ok: true,
      active: false,
      url: null,
      superAdminUrl: null
    });
  }
});

// POST /api/super/tuneis/quick-connect — inicia túnel Cloudflare rapidamente ou retorna existente
app.post('/api/super/tuneis/quick-connect', superAdminAuth, async (req, res) => {
  try {
    const status = tunnelManager.getStatus();
    const existing = status.tunnels.find(t => t.status === 'running' && t.url);
    if (existing) {
      return res.json({
        ok: true,
        active: true,
        url: existing.url,
        superAdminUrl: `${existing.url}/super-admin.html`,
        name: existing.name
      });
    }

    let target = 'cloudflare';
    if (!status.tunnels.find(t => t.name === 'cloudflare' && t.installed)) {
      if (status.tunnels.find(t => t.name === 'localtunnel' && t.installed)) target = 'localtunnel';
      else if (status.tunnels.find(t => t.name === 'localhost.run' && t.installed)) target = 'localhost.run';
    }

    const startRes = tunnelManager.start(target);
    if (!startRes.ok) {
      return res.json({ ok: false, erro: startRes.erro || 'Falha ao iniciar túnel.' });
    }

    for (let i = 0; i < 16; i++) {
      await new Promise(r => setTimeout(r, 500));
      const cur = tunnelManager.getStatus(target);
      if (cur && cur.url) {
        return res.json({
          ok: true,
          active: true,
          url: cur.url,
          superAdminUrl: `${cur.url}/super-admin.html`,
          name: target
        });
      }
    }

    const cur = tunnelManager.getStatus(target);
    res.json({
      ok: true,
      active: cur ? cur.status === 'running' : false,
      url: cur ? cur.url : null,
      superAdminUrl: cur && cur.url ? `${cur.url}/super-admin.html` : null,
      name: target,
      aguardando: true
    });
  } catch (err) {
    res.json({ ok: false, erro: err.message });
  }
});

// POST /api/super/tuneis/toggle-auto-start — alterna inicialização automática no boot
app.post('/api/super/tuneis/toggle-auto-start', superAdminAuth, async (req, res) => {
  try {
    const { enabled } = req.body || {};
    const mode = enabled ? 'auto' : 'manual';
    await tunnelManager.saveGlobalConfig(tunnelManager.globalConfig.port, mode, tunnelManager.globalConfig.priority);
    // Também habilita o cloudflare especificamente se auto
    if (enabled) {
      await tunnelManager.saveConfig('cloudflare', { enabled: true });
    }
    res.json({ ok: true, mode, mensagem: `Modo de túnel configurado para: ${mode}` });
  } catch (e) {
    res.json({ ok: false, erro: e.message });
  }
});

  function getTenantDbInstance(tenantId) {
    const tid = parseInt(tenantId, 10) || 1;
    const estPath = path.join(__dirname, '..', 'estabelecimentos', String(tid), 'database.sqlite');
    const dbPath = fs.existsSync(estPath) ? estPath : path.join(__dirname, '..', `database_${tid}.sqlite`);
    return new sqlite3.Database(dbPath);
  }

// POST /api/super/emergency/resolver-solicitacao — Centro de Comando Rápido Mobile S23
app.post('/api/super/emergency/resolver-solicitacao', superAdminAuth, async (req, res) => {
  const { acao, restaurante_id, params } = req.body || {};
  if (!acao) return res.status(400).json({ ok: false, erro: 'Ação não informada.' });

  try {
    switch (acao) {
      case 'liberar_terminais': {
        const rid = parseInt(restaurante_id, 10);
        if (!rid) return res.json({ ok: false, erro: 'ID do restaurante inválido.' });

        masterDb.run(`UPDATE restaurantes SET ativo = 1 WHERE id = ?`, [rid], () => {});
        masterDb.run(`UPDATE terminais_pareamento SET status = 'autorizado' WHERE restaurante_id = ? AND status = 'pendente'`, [rid], (err) => {
          if (io) io.emit('terminais_atualizados', { restaurante_id: rid });
          res.json({
            ok: true,
            mensagem: `Todos os terminais e acessos do restaurante #${rid} foram liberados!`
          });
        });
        break;
      }

      case 'renovar_licenca': {
        const rid = parseInt(restaurante_id, 10);
        if (!rid) return res.json({ ok: false, erro: 'ID do restaurante inválido.' });
        const dias = (params && parseInt(params.dias, 10)) || 30;

        const d = new Date();
        d.setDate(d.getDate() + dias);
        const novaValidade = d.toISOString().split('T')[0];

        masterDb.run(
          `UPDATE restaurantes SET licenca = 'premium', ativo = 1, validade_licenca = ? WHERE id = ?`,
          [novaValidade, rid],
          function(err) {
            if (err) return res.json({ ok: false, erro: err.message });
            if (io) io.emit('licenca_atualizada', { restaurante_id: rid, validade: novaValidade });
            res.json({
              ok: true,
              mensagem: `Licença do restaurante #${rid} renovada até ${novaValidade} (+${dias} dias)!`
            });
          }
        );
        break;
      }

      case 'otimizar_bancos': {
        const files = fs.readdirSync(path.join(__dirname, '..'))
          .filter(f => /^database_\d+\.sqlite$/.test(f) || f === 'master.sqlite');

        let count = 0;
        files.forEach(f => {
          try {
            const dbp = path.join(__dirname, '..', f);
            const tdb = new sqlite3.Database(dbp);
            tdb.run('PRAGMA optimize;', () => {});
            tdb.run('PRAGMA wal_checkpoint(TRUNCATE);', () => {});
            count++;
          } catch (_) {}
        });

        res.json({
          ok: true,
          mensagem: `${count} bancos de dados SQLite (Master + Tenants) foram otimizados e desfragmentados!`
        });
        break;
      }

      case 'reiniciar_servidor': {
        res.json({ ok: true, mensagem: 'Reiniciando servidor de forma segura... Watchdog reconectará em 3s.' });
        setTimeout(() => {
          process.exit(0);
        }, 800);
        break;
      }

      case 'impersonate': {
        const rid = parseInt(restaurante_id, 10);
        if (!rid) return res.json({ ok: false, erro: 'ID do restaurante inválido.' });

        const jwt = require('jsonwebtoken');
        const token = jwt.sign(
          { userId: 999999, restauranteId: rid, perfil: 'admin', impersonated: true },
          options.JWT_SECRET || 'chef_secret',
          { expiresIn: '4h' }
        );

        res.json({
          ok: true,
          urlDono: `/painel-dono.html?impersonate_token=${token}`,
          urlPdv: `/index.html?impersonate_token=${token}`,
          mensagem: `Token de acesso direto gerado para o restaurante #${rid}.`
        });
        break;
      }

      case 'limpar_trava_caixa': {
        const rid = parseInt(restaurante_id, 10);
        if (!rid) return res.json({ ok: false, erro: 'ID do restaurante inválido.' });
        const tdb = getTenantDbInstance(rid);

        tdb.serialize(() => {
          tdb.run(`UPDATE mesas SET status = 'livre', total = 0, atendente = NULL WHERE status IN ('fechando', 'bloqueada', 'em_pagamento', 'bloqueado')`, () => {});
          tdb.run(`UPDATE pedidos SET status = 'Finalizado' WHERE status IN ('fechando', 'aguardando_fechamento')`, () => {});
        });

        setTimeout(() => {
          try { tdb.close(); } catch (_) {}
          if (io) {
            io.emit('mesas_atualizadas', { restaurante_id: rid });
            io.emit('caixa_atualizado', { restaurante_id: rid });
          }
          res.json({
            ok: true,
            mensagem: `Travas de caixas e comandas do restaurante #${rid} foram liberadas com sucesso!`
          });
        }, 120);
        break;
      }

      case 'limpar_fila_impressao': {
        const rid = parseInt(restaurante_id, 10);
        if (!rid) return res.json({ ok: false, erro: 'ID do restaurante inválido.' });
        const tdb = getTenantDbInstance(rid);

        tdb.run(
          `UPDATE pedidos_spool SET status = 'cancelado', erro_msg = 'Cancelado via SOS S23 Super Admin' WHERE status IN ('pendente', 'erro')`,
          function(err) {
            const alterados = this ? this.changes : 0;
            try { tdb.close(); } catch (_) {}
            if (io) io.emit('spool_atualizado', { restaurante_id: rid });
            res.json({
              ok: true,
              alterados: alterados,
              mensagem: alterados > 0
                ? `${alterados} impressões travadas foram canceladas e a fila do restaurante #${rid} foi desobstruída!`
                : `A fila de impressão do restaurante #${rid} já estava limpa.`
            });
          }
        );
        break;
      }

      case 'reabrir_caixa': {
        const rid = parseInt(restaurante_id, 10);
        if (!rid) return res.json({ ok: false, erro: 'ID do restaurante inválido.' });
        const tdb = getTenantDbInstance(rid);

        tdb.get(`SELECT id, data_abertura, data_fechamento FROM turnos_caixa WHERE status = 'Fechado' ORDER BY id DESC LIMIT 1`, [], (err, row) => {
          if (err || !row) {
            try { tdb.close(); } catch (_) {}
            return res.json({ ok: false, erro: 'Nenhum turno fechado encontrado para reabrir.' });
          }

          tdb.run(`UPDATE turnos_caixa SET status = 'Aberto', data_fechamento = NULL WHERE id = ?`, [row.id], function(err2) {
            try { tdb.close(); } catch (_) {}
            if (err2) return res.json({ ok: false, erro: err2.message });
            if (io) io.emit('caixa_atualizado', { restaurante_id: rid });
            res.json({
              ok: true,
              turnoId: row.id,
              mensagem: `Turno de caixa #${row.id} do restaurante #${rid} foi reaberto com sucesso!`
            });
          });
        });
        break;
      }

      case 'reset_senha_dono': {
        const rid = parseInt(restaurante_id, 10);
        if (!rid) return res.json({ ok: false, erro: 'ID do restaurante inválido.' });
        const bcrypt = require('bcrypt');
        const novaSenha = (params && params.nova_senha) || ('chef' + Math.floor(1000 + Math.random() * 9000));
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(novaSenha, salt);

        masterDb.run(
          `UPDATE usuarios SET password_hash = ? WHERE restaurante_id = ? AND (role = 'admin' OR role = 'dono')`,
          [hash, rid],
          function(err) {
            if (err) return res.json({ ok: false, erro: err.message });
            masterDb.get(`SELECT nome, dono_telefone, dono_nome FROM restaurantes WHERE id = ?`, [rid], (_, rest) => {
              const nomeLoja = (rest && rest.nome) || `#${rid}`;
              const telDono = (rest && rest.dono_telefone) || '';
              const msgWhats = `Olá! A senha de administrador do Chef Cozinha para o restaurante ${nomeLoja} foi redefinida provisoriamente para: ${novaSenha}`;
              res.json({
                ok: true,
                novaSenha: novaSenha,
                telefone: telDono,
                mensagem: `Senha de admin de ${nomeLoja} redefinida para '${novaSenha}'!`,
                whatsappMsg: msgWhats
              });
            });
          }
        );
        break;
      }

      case 'diagnostico_restaurante': {
        const rid = parseInt(restaurante_id, 10);
        if (!rid) return res.json({ ok: false, erro: 'ID do restaurante inválido.' });
        const tdb = getTenantDbInstance(rid);

        masterDb.get(`SELECT * FROM restaurantes WHERE id = ?`, [rid], (errRest, rest) => {
          if (errRest || !rest) {
            try { tdb.close(); } catch (_) {}
            return res.json({ ok: false, erro: 'Restaurante não encontrado.' });
          }

          tdb.get(`SELECT COUNT(*) as abertos FROM pedidos WHERE status NOT IN ('Finalizado', 'Cancelado')`, [], (e1, rPed) => {
            tdb.get(`SELECT COUNT(*) as ocupadas FROM mesas WHERE status = 'ocupada'`, [], (e2, rMes) => {
              tdb.get(`SELECT COALESCE(SUM(total), 0) as totalHoje, COUNT(*) as qtdHoje FROM pedidos WHERE status = 'Finalizado' AND date(created_at) = date('now')`, [], (e3, rFin) => {
                try { tdb.close(); } catch (_) {}
                const nomeLoja = rest.nome || `Restaurante #${rid}`;
                res.json({
                  ok: true,
                  diagnostico: {
                    restaurante: nomeLoja,
                    status: rest.ativo ? '🟢 Online / Ativo' : '🔴 Inativo / Bloqueado',
                    licenca: rest.licenca || 'padrão',
                    validade: rest.validade_licenca || 'Indeterminada',
                    pedidosAbertos: (rPed && rPed.abertos) || 0,
                    mesasOcupadas: (rMes && rMes.ocupadas) || 0,
                    faturamentoHoje: Number((rFin && rFin.totalHoje) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                    pedidosFinalizadosHoje: (rFin && rFin.qtdHoje) || 0
                  },
                  mensagem: `Diagnóstico em tempo real concluído para ${nomeLoja}.`
                });
              });
            });
          });
        });
        break;
      }

      case 'backup_restaurante': {
        const rid = parseInt(restaurante_id, 10);
        if (!rid) return res.json({ ok: false, erro: 'ID do restaurante inválido.' });
        const estPath = path.join(__dirname, '..', 'estabelecimentos', String(rid), 'database.sqlite');
        const dbPath = fs.existsSync(estPath) ? estPath : path.join(__dirname, '..', `database_${rid}.sqlite`);
        if (!fs.existsSync(dbPath)) return res.json({ ok: false, erro: 'Arquivo do banco de dados não encontrado.' });

        const bkpDir = path.join(__dirname, '..', 'backups');
        if (!fs.existsSync(bkpDir)) fs.mkdirSync(bkpDir, { recursive: true });
        const bkpName = `backup_loja_${rid}_${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`;
        const destPath = path.join(bkpDir, bkpName);

        fs.copyFileSync(dbPath, destPath);
        const stat = fs.statSync(destPath);
        const mb = (stat.size / (1024 * 1024)).toFixed(2);

        res.json({
          ok: true,
          arquivo: bkpName,
          tamanho: `${mb} MB`,
          mensagem: `Backup do restaurante #${rid} gerado com sucesso (${mb} MB)!`
        });
        break;
      }

      default:
        res.json({ ok: false, erro: `Ação '${acao}' não reconhecida.` });
    }
  } catch (e) {
    res.json({ ok: false, erro: e.message });
  }
});

// POST /api/super/sql/executar — Console SQL Remoto Seguro para o Super Admin
app.post('/api/super/sql/executar', superAdminAuth, (req, res) => {
  const { sql, database } = req.body || {};
  if (!sql || typeof sql !== 'string' || !sql.trim()) {
    return res.json({ ok: false, erro: 'Instrução SQL é obrigatória.' });
  }

  const queryLimpa = sql.trim();
  const lower = queryLimpa.toLowerCase();
  if (lower.includes('load_extension') || lower.includes('attach ') || lower.includes('detach ')) {
    return res.json({ ok: false, erro: 'Comando SQL não permitido por motivos de segurança.' });
  }

  let dbTarget;
  let fecharNoFinal = false;

  if (database === 'master' || database === 'global') {
    dbTarget = masterDb;
  } else {
    const rid = parseInt(database, 10) || 1;
    dbTarget = getTenantDbInstance(rid);
    fecharNoFinal = true;
  }

  const inicio = Date.now();
  const isSelect = /^\s*(SELECT|PRAGMA|EXPLAIN)\b/i.test(queryLimpa);

  if (isSelect) {
    dbTarget.all(queryLimpa, [], (err, rows) => {
      const tempoMs = Date.now() - inicio;
      if (fecharNoFinal) { try { dbTarget.close(); } catch (_) {} }
      if (err) return res.json({ ok: false, erro: err.message, tempoMs });

      const colunas = (rows && rows.length > 0) ? Object.keys(rows[0]) : [];
      res.json({
        ok: true,
        tipo: 'SELECT',
        colunas,
        linhas: rows || [],
        count: (rows || []).length,
        tempoMs
      });
    });
  } else {
    dbTarget.run(queryLimpa, [], function(err) {
      const tempoMs = Date.now() - inicio;
      const alterados = this ? this.changes : 0;
      const lastId = this ? this.lastID : null;
      if (fecharNoFinal) { try { dbTarget.close(); } catch (_) {} }
      if (err) return res.json({ ok: false, erro: err.message, tempoMs });

      res.json({
        ok: true,
        tipo: 'MUTATION',
        alterados,
        lastInsertRowid: lastId,
        mensagem: `Comando executado com sucesso! Linhas alteradas: ${alterados}`,
        tempoMs
      });
    });
  }
});

};

