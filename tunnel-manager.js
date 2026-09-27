/**
 * Tunnel Manager — Chef Cozinha SaaS
 *
 * Gerencia 4 serviços de túnel como fallback de acesso:
 * 1. Cloudflare Tunnel (cloudflared)
 * 2. ngrok
 * 3. Localtunnel (lt)
 * 4. localhost.run (ssh)
 *
 * Cada túnel é um child process com monitoramento de stdout
 * para extrair a URL pública automaticamente.
 */

const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

// ── Mapeamento de comandos por plataforma ─────────────────────────────
const IS_WIN = process.platform === 'win32';

const TUNNEL_COMMANDS = {
  cloudflare: {
    // cloudflared tunnel --url http://localhost:PORT
    bin: IS_WIN ? 'cloudflared.exe' : 'cloudflared',
    args: (port, config) => {
      const a = ['tunnel', '--url', `http://localhost:${port}`];
      if (config.token) a.push('--token', config.token);
      if (config.subdomain) a.push('--hostname', config.subdomain + '.trycloudflare.com');
      return a;
    },
    urlRegex: /https:\/\/[a-zA-Z0-9\-]+\.trycloudflare\.com[^\s]*/g,
    installed: function() {
      try {
        const { execSync } = require('child_process');
        const p = IS_WIN ? 'cloudflared.exe' : 'cloudflared';
        execSync(`"${p}" --version`, { timeout: 5000, stdio: 'pipe', windowsHide: true });
        return true;
      } catch (e) { return false; }
    }
  },
  ngrok: {
    bin: IS_WIN ? 'ngrok.exe' : 'ngrok',
    args: (port, config) => {
      const a = ['http', String(port), '--log=stdout', '--log-format=json'];
      if (config.token) a.push('--authtoken', config.token);
      if (config.domain) a.push('--domain', config.domain);
      return a;
    },
    urlRegex: /https:\/\/[a-zA-Z0-9\.\-]+\.ngrok(?:-free)?\.app[^\s]*/g,
    // ngrok log JSON also has: "Url":"https://..."
    jsonUrlPath: 'Url',
    installed: function() {
      try {
        const { execSync } = require('child_process');
        const p = IS_WIN ? 'ngrok.exe' : 'ngrok';
        execSync(`"${p}" version`, { timeout: 5000, stdio: 'pipe', windowsHide: true });
        return true;
      } catch (e) { return false; }
    }
  },
  localtunnel: {
    bin: IS_WIN ? 'npx.cmd' : 'npx',
    args: (port, config) => {
      const a = ['--yes', 'localtunnel', '--port', String(port)];
      if (config.subdomain) a.push('--subdomain', config.subdomain);
      return a;
    },
    urlRegex: /https?:\/\/[a-zA-Z0-9\.\-]+\.loca\.lt[^\s]*/g,
    installed: function() {
      try { require('child_process').execSync('npx --yes localtunnel --help', { timeout: 15000, stdio: 'pipe', windowsHide: true }); return true; }
      catch (e) { return false; }
    }
  },
  'localhost.run': {
    bin: IS_WIN ? 'ssh.exe' : 'ssh',
    args: (port, config) => {
      const a = ['-R', `80:localhost:${port}`, 'nokey@localhost.run', '-o', 'StrictHostKeyChecking=no'];
      if (config.sshkey) a[1] = `-i ${config.sshkey} -R 80:localhost:${port}`;
      return a;
    },
    urlRegex: /https?:\/\/[a-zA-Z0-9\.\-]+\.lhr\.life[^\s]*/g,
    installed: function() {
      try { require('child_process').execSync(IS_WIN ? 'ssh.exe -V' : 'ssh -V', { timeout: 5000, stdio: 'pipe', windowsHide: true }); return true; }
      catch (e) { return false; }
    }
  }
};

class TunnelManager {
  constructor() {
    this.tunnels = {};    // { cloudflare: { process, config, status, url, startedAt, log }, ... }
    this.globalConfig = { port: 8080, mode: 'manual', priority: '1' };
    this.db = null;       // referência ao masterDb (setada pelo server.js)
    this.logCallback = null; // callback para enviar logs ao painel via socket

    // Inicializa estado de cada túnel
    Object.keys(TUNNEL_COMMANDS).forEach(name => {
      this.tunnels[name] = { process: null, config: {}, status: 'stopped', url: null, startedAt: null, log: [] };
    });
  }

  setDb(db) { this.db = db; }
  setLogCallback(cb) { this.logCallback = cb; }

  _log(tunnel, msg) {
    const ts = new Date().toLocaleTimeString('pt-BR');
    const line = `[${ts}] [${tunnel}] ${msg}`;
    if (this.tunnels[tunnel]) {
      this.tunnels[tunnel].log.push(line);
      if (this.tunnels[tunnel].log.length > 200) this.tunnels[tunnel].log.shift();
    }
    if (this.logCallback) this.logCallback(line);
  }

  async loadConfig() {
    if (!this.db) return;
    return new Promise((resolve) => {
      this.db.all(
        "SELECT chave, valor FROM configuracoes_global WHERE chave LIKE 'tunnel_%'",
        [], (err, rows) => {
          const cfgs = {};
          (rows || []).forEach(r => { cfgs[r.chave] = r.valor; });
          this.globalConfig.port = parseInt(cfgs.tunnel_port, 10) || 8080;
          this.globalConfig.mode = cfgs.tunnel_mode || 'manual';
          this.globalConfig.priority = cfgs.tunnel_priority || '1';

          // Config de cada túnel
          ['cloudflare', 'ngrok', 'localtunnel', 'localhost.run'].forEach(name => {
            const prefix = 'tunnel_' + name.replace(/\./g, '_') + '_';
            this.tunnels[name].config = {
              enabled: cfgs[prefix + 'enabled'] === '1',
              token: cfgs[prefix + 'token'] || '',
              subdomain: cfgs[prefix + 'subdomain'] || '',
              domain: cfgs[prefix + 'domain'] || '',
              sshkey: cfgs[prefix + 'sshkey'] || '',
              ssl: cfgs[prefix + 'ssl'] || '443',
              auth: cfgs[prefix + 'auth'] || '0'
            };
          });
          resolve();
        }
      );
    });
  }

  async saveConfig(tunnelName, config) {
    if (!this.db) throw new Error('DB não disponível');
    const prefix = 'tunnel_' + tunnelName.replace(/\./g, '_') + '_';
    const entries = Object.entries(config).map(([k, v]) => [prefix + k, String(v)]);

    // Global config
    entries.push(['tunnel_port', String(this.globalConfig.port)]);
    entries.push(['tunnel_mode', this.globalConfig.mode]);
    entries.push(['tunnel_priority', this.globalConfig.priority]);

    for (const [chave, valor] of entries) {
      await new Promise((resolve, reject) => {
        this.db.run(
          "INSERT INTO configuracoes_global (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor",
          [chave, valor], (err) => err ? reject(err) : resolve()
        );
      });
    }
    if (this.tunnels[tunnelName]) {
      this.tunnels[tunnelName].config = { ...this.tunnels[tunnelName].config, ...config };
    }
  }

  async saveGlobalConfig(port, mode, priority) {
    this.globalConfig.port = parseInt(port, 10) || 8080;
    this.globalConfig.mode = mode || 'manual';
    this.globalConfig.priority = priority || '1';
    if (!this.db) return;
    for (const [k, v] of [['tunnel_port', this.globalConfig.port], ['tunnel_mode', this.globalConfig.mode], ['tunnel_priority', this.globalConfig.priority]]) {
      await new Promise((resolve) => {
        this.db.run("INSERT INTO configuracoes_global (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor", [k, String(v)], () => resolve());
      });
    }
  }

  start(tunnelName) {
    const tunnel = this.tunnels[tunnelName];
    if (!tunnel) return { ok: false, erro: 'Túnel desconhecido: ' + tunnelName };
    if (tunnel.process) return { ok: false, erro: 'Túnel já está rodando.' };

    const cmd = TUNNEL_COMMANDS[tunnelName];
    if (!cmd) return { ok: false, erro: 'Comando não encontrado para: ' + tunnelName };

    // Verifica se a ferramenta está instalada
    try {
      if (!cmd.installed()) {
        return { ok: false, erro: `${tunnelName} não está instalado. Instale manualmente primeiro.` };
      }
    } catch (e) {
      return { ok: false, erro: `Erro ao verificar ${tunnelName}: ` + e.message };
    }

    const args = cmd.args(this.globalConfig.port, tunnel.config || {});
    this._log(tunnelName, `Iniciando: ${cmd.bin} ${args.join(' ')}`);

    try {
      const child = spawn(cmd.bin, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: tunnelName === 'localtunnel' && IS_WIN,
        windowsHide: true,
        env: { ...process.env }
      });

      tunnel.process = child;
      tunnel.status = 'starting';
      tunnel.url = null;
      tunnel.startedAt = Date.now();

      // Monitor stdout para extrair URL pública
      let outputBuffer = '';
      child.stdout.on('data', (data) => {
        const text = data.toString();
        outputBuffer += text;

        // Tenta extrair URL por regex
        const urlMatch = text.match(cmd.urlRegex);
        if (urlMatch && urlMatch.length > 0) {
          tunnel.url = urlMatch[urlMatch.length - 1].replace(/[.,;)"']+$/, '').trim();
          tunnel.status = 'running';
          this._log(tunnelName, `✓ URL pública: ${tunnel.url}`);
          if (this.db) {
            this.db.run("INSERT INTO configuracoes_global (chave, valor) VALUES ('tunnel_active_url', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor", [tunnel.url], () => {});
          }
          if (this.logCallback) this.logCallback(JSON.stringify({ type: 'url', tunnel: tunnelName, url: tunnel.url }));
        }

        // Para ngrok, tenta extrair de JSON
        if (tunnelName === 'ngrok' && cmd.jsonUrlPath) {
          try {
            const lines = text.split('\n');
            for (const line of lines) {
              const json = JSON.parse(line);
              if (json.payload && json.payload.url) {
                tunnel.url = json.payload.url.replace(/[.,;)"']+$/, '').trim();
                tunnel.status = 'running';
                this._log(tunnelName, `✓ URL pública: ${tunnel.url}`);
                if (this.db) {
                  this.db.run("INSERT INTO configuracoes_global (chave, valor) VALUES ('tunnel_active_url', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor", [tunnel.url], () => {});
                }
                if (this.logCallback) this.logCallback(JSON.stringify({ type: 'url', tunnel: tunnelName, url: tunnel.url }));
              }
            }
          } catch (e) { }
        }
      });

      child.stderr.on('data', (data) => {
        const text = data.toString();
        // cloudflared escreve a URL no stderr também
        const urlMatch = text.match(cmd.urlRegex);
        if (urlMatch && urlMatch.length > 0) {
          tunnel.url = urlMatch[urlMatch.length - 1].replace(/[.,;)"']+$/, '').trim();
          tunnel.status = 'running';
          this._log(tunnelName, `✓ URL pública: ${tunnel.url}`);
          if (this.db) {
            this.db.run("INSERT INTO configuracoes_global (chave, valor) VALUES ('tunnel_active_url', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor", [tunnel.url], () => {});
          }
          if (this.logCallback) this.logCallback(JSON.stringify({ type: 'url', tunnel: tunnelName, url: tunnel.url }));
        }
      });

      child.on('exit', (code, signal) => {
        this._log(tunnelName, `Processo encerrou (code=${code}, signal=${signal})`);
        tunnel.process = null;
        tunnel.status = 'stopped';
        tunnel.url = null;
        if (this.logCallback) this.logCallback(JSON.stringify({ type: 'stopped', tunnel: tunnelName }));
      });

      child.on('error', (err) => {
        this._log(tunnelName, `Erro ao iniciar: ${err.message}`);
        tunnel.process = null;
        tunnel.status = 'error';
        tunnel.url = null;
        if (this.logCallback) this.logCallback(JSON.stringify({ type: 'error', tunnel: tunnelName, erro: err.message }));
      });

      // Timeout: se não encontrou URL em 15s, marca como running (pode ter conectado sem log)
      setTimeout(() => {
        if (tunnel.status === 'starting') {
          tunnel.status = 'running';
          this._log(tunnelName, 'Timeout de URL — marcando como ativo (verifique manualmente)');
        }
      }, 15000);

      return { ok: true, mensagem: `${tunnelName} iniciado.` };
    } catch (e) {
      return { ok: false, erro: `Falha ao iniciar ${tunnelName}: ` + e.message };
    }
  }

  stop(tunnelName) {
    const tunnel = this.tunnels[tunnelName];
    if (!tunnel) return { ok: false, erro: 'Túnel desconhecido.' };
    if (!tunnel.process) return { ok: false, erro: 'Túnel não está rodando.' };

    this._log(tunnelName, 'Parando túnel...');
    try {
      tunnel.process.kill('SIGTERM');
      // Force kill após 5s se não morrer
      setTimeout(() => {
        if (tunnel.process) {
          try { tunnel.process.kill('SIGKILL'); } catch (e) { }
        }
      }, 5000);
      return { ok: true, mensagem: `${tunnelName} sendo parado.` };
    } catch (e) {
      return { ok: false, erro: `Erro ao parar: ` + e.message };
    }
  }

  stopAll() {
    const results = {};
    Object.keys(this.tunnels).forEach(name => {
      results[name] = this.stop(name);
    });
    return results;
  }

  getStatus(tunnelName) {
    if (tunnelName) {
      const t = this.tunnels[tunnelName];
      if (!t) return null;
      return {
        name: tunnelName,
        status: t.status,
        url: t.url,
        startedAt: t.startedAt ? new Date(t.startedAt).toISOString() : null,
        uptime: t.startedAt ? Math.round((Date.now() - t.startedAt) / 1000) : 0,
        installed: TUNNEL_COMMANDS[tunnelName] ? TUNNEL_COMMANDS[tunnelName].installed() : false,
        config: t.config || {}
      };
    }
    // Todos os túneis
    return {
      global: this.globalConfig,
      tunnels: Object.keys(this.tunnels).map(name => ({
        name,
        status: this.tunnels[name].status,
        url: this.tunnels[name].url,
        startedAt: this.tunnels[name].startedAt ? new Date(this.tunnels[name].startedAt).toISOString() : null,
        uptime: this.tunnels[name].startedAt ? Math.round((Date.now() - this.tunnels[name].startedAt) / 1000) : 0,
        installed: TUNNEL_COMMANDS[name] ? TUNNEL_COMMANDS[name].installed() : false,
        config: this.tunnels[name].config || {}
      }))
    };
  }

  getLogs(tunnelName) {
    if (tunnelName && this.tunnels[tunnelName]) return this.tunnels[tunnelName].log.slice(-100);
    // Todos os logs
    const all = [];
    Object.keys(this.tunnels).forEach(name => {
      this.tunnels[name].log.forEach(l => all.push(l));
    });
    return all.sort().slice(-200);
  }

  // Auto-start: chamado no boot do server.js
  async autoStart() {
    await this.loadConfig();
    if (this.globalConfig.mode !== 'auto') return;
    this._log('system', 'Auto-start habilitado — iniciando túneis configurados...');
    let startedAny = false;
    for (const [name, tunnel] of Object.entries(this.tunnels)) {
      if (tunnel.config && tunnel.config.enabled) {
        this._log('system', `Auto-start: ${name}`);
        this.start(name);
        startedAny = true;
        // Delay entre startups para evitar conflito
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    if (!startedAny && TUNNEL_COMMANDS['cloudflare'] && TUNNEL_COMMANDS['cloudflare'].installed()) {
      this._log('system', 'Auto-start: iniciando Cloudflare como túnel padrão...');
      this.start('cloudflare');
    }
  }
}

module.exports = TunnelManager;
