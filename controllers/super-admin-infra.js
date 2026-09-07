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
const { exec: _gitExecCb } = require('child_process');
const TunnelManager = require('../tunnel-manager');

module.exports = function(app, masterDb, sqlite3, options) {
  const { superAdminAuth, io } = options || {};
  const tunnelManager = new TunnelManager();

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

// GET — carrega configuração do Supabase
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
        enabled: config.supabase_enabled || 'false'
      }
    });
  });
});

// POST — salva configuração do Supabase
app.post('/api/super/supabase-config', superAdminAuth, (req, res) => {
  const { url, anon_key, enabled } = req.body || {};
  const serviceKeyFornecida = typeof req.body.service_role_key === 'string' && req.body.service_role_key.trim() !== '';
  const campos = {
    supabase_url: (url || '').trim(),
    supabase_anon_key: (anon_key || '').trim(),
    supabase_service_role_key: serviceKeyFornecida ? req.body.service_role_key.trim() : null,
    supabase_enabled: enabled ? 'true' : 'false'
  };
  masterDb.serialize(() => {
    Object.keys(campos).forEach(k => {
      if (campos[k] === null) return; // preserva valor salvo anteriormente
      masterDb.run(`INSERT OR REPLACE INTO super_config (key, value) VALUES (?, ?)`, [k, campos[k]]);
    });
  });
  res.json({ ok: true, mensagem: 'Configuração do Supabase salva com sucesso!' });
});

// POST — testa conexão com Supabase
app.post('/api/super/supabase-test', superAdminAuth, async (req, res) => {
  const { url, anon_key } = req.body || {};
  if (!url || !anon_key) return res.json({ ok: false, erro: 'URL e Anon Key são obrigatórios para testar.' });

  try {
    const testUrl = url.replace(/\/+$/, '') + '/rest/v1/';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'apikey': anon_key,
        'Authorization': 'Bearer ' + anon_key
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



// ══════════════════════════════════════════════════════════════════

};
