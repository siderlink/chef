/**
 * controllers/remote-support.js
 * Sistema de Assistência Remota e Telepresença do Chef Cozinha
 * Permite que a equipe de suporte acesse e repare computadores de restaurantes
 * através de um link simples de 1 clique, com WebRTC, Web Shell e comandos remotos.
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const sessions = new Map(); // sessionId -> SessionObject
const pinToSessionId = new Map(); // pin -> sessionId

// Limpa sessões inativas a cada 15 minutos
setInterval(() => {
  const agora = Date.now();
  for (const [id, sess] of sessions.entries()) {
    // Expira após 4 horas ou 1 hora sem nenhum participante
    const semAtividade = agora - sess.lastActivityAt > 4 * 60 * 60 * 1000;
    const abandonada = (!sess.clientConnected && !sess.agentConnected) && (agora - sess.lastActivityAt > 60 * 60 * 1000);
    if (semAtividade || abandonada) {
      pinToSessionId.delete(sess.pin);
      sessions.delete(id);
    }
  }
}, 15 * 60 * 1000);

function gerarPin6Digitos() {
  let pin;
  do {
    pin = Math.floor(100000 + Math.random() * 900000).toString();
  } while (pinToSessionId.has(pin));
  return pin;
}

function gerarSessionId() {
  return 'SES-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

module.exports = function (app, masterDb, sqlite3, options) {
  const io = options && options.io;

  // Servir página amigável de ajuda remota
  const ajudaHtmlPath = path.join(__dirname, '..', 'ajuda.html');
  const rotaAjuda = (req, res) => {
    if (fs.existsSync(ajudaHtmlPath)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.sendFile(ajudaHtmlPath);
    } else {
      res.status(404).send('Página de ajuda remota em manutenção.');
    }
  };
  app.get('/ajuda', rotaAjuda);
  app.get('/suporte-remoto', rotaAjuda);
  app.get('/assistencia', rotaAjuda);

  // ── 0. ROTAS DE DOWNLOAD DE INSTALADORES (USADO PELO 1-CLIQUE) ──────
  app.get('/api/sync/installers/windows.bat', (req, res) => {
    const p = path.join(__dirname, '..', 'installer', 'Instalador-ChefSync.bat');
    if (fs.existsSync(p)) res.download(p, 'Instalador-ChefSync.bat');
    else res.status(404).send('Instalador não encontrado.');
  });
  app.get('/api/sync/installers/install.ps1', (req, res) => {
    const p = path.join(__dirname, '..', 'installer', 'install-sync.ps1');
    if (fs.existsSync(p)) res.download(p, 'install-sync.ps1');
    else res.status(404).send('Instalador não encontrado.');
  });
  app.get('/api/sync/installers/install.sh', (req, res) => {
    const p = path.join(__dirname, '..', 'installer', 'install-sync.sh');
    if (fs.existsSync(p)) res.download(p, 'install-sync.sh');
    else res.status(404).send('Instalador não encontrado.');
  });

  // ── 1. CRIAR SESSÃO DE SUPORTE REMOTO (SUPORTE / SUPER ADMIN) ───────
  app.post('/api/support/sessions/create', (req, res) => {
    try {
      const { restaurante_nome, restaurante_id, atendente_nome, solicitacao } = req.body || {};
      const id = gerarSessionId();
      const pin = gerarPin6Digitos();

      const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
      const host = req.headers['x-forwarded-host'] || req.get('host') || '127.0.0.1:3000';
      const hubUrl = `${proto}://${host}`;
      const linkAcesso = `${hubUrl}/ajuda?sessao=${id}&pin=${pin}`;

      const sess = {
        id,
        pin,
        restauranteNome: restaurante_nome || 'Restaurante Parceiro',
        restauranteId: restaurante_id || null,
        atendenteNome: atendente_nome || 'Equipe de Suporte Chef Cozinha',
        solicitacao: solicitacao || 'Assistência técnica remota',
        createdAt: new Date().toISOString(),
        lastActivityAt: Date.now(),
        clientConnected: false,
        agentConnected: false,
        screenSharing: false,
        tunnelConnected: false,
        deviceInfo: null,
        pendingCommands: [],
        commandHistory: [],
        messages: []
      };

      sessions.set(id, sess);
      pinToSessionId.set(pin, id);

      const mensagemWhatsApp = `🍽️ *Chef Cozinha — Suporte Técnico Remoto*\n\n`
        + `Olá! Nossa equipe está pronta para acessar o computador do seu restaurante e resolver tudo para você agora mesmo.\n\n`
        + `👉 *Clique neste link no computador do restaurante:*\n`
        + `${linkAcesso}\n\n`
        + `🔑 *Ou se preferir, acesse* ${hubUrl}/ajuda *e digite o código:* *${pin.substring(0, 3)} ${pin.substring(3)}*\n\n`
        + `Depois é só clicar no botão verde "Permitir Ajuda". Fique tranquilo, nós faremos tudo remotamente! 😊`;

      res.json({
        ok: true,
        sessionId: id,
        pin: `${pin.substring(0, 3)} ${pin.substring(3)}`,
        pinRaw: pin,
        link: linkAcesso,
        mensagemWhatsApp,
        restauranteNome: sess.restauranteNome
      });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message });
    }
  });

  // ── 2. CONSULTAR SESSÃO (CLIENTE OU ATENDENTE) ──────────────────────
  app.get('/api/support/sessions/:id', (req, res) => {
    const sess = sessions.get(req.params.id);
    if (!sess) return res.status(404).json({ ok: false, erro: 'Sessão não encontrada ou expirada.' });
    sess.lastActivityAt = Date.now();
    res.json({
      ok: true,
      session: {
        id: sess.id,
        pin: sess.pin,
        restauranteNome: sess.restauranteNome,
        atendenteNome: sess.atendenteNome,
        clientConnected: sess.clientConnected,
        agentConnected: sess.agentConnected,
        screenSharing: sess.screenSharing,
        tunnelConnected: sess.tunnelConnected,
        deviceInfo: sess.deviceInfo,
        createdAt: sess.createdAt
      }
    });
  });

  // ── 3. LOCALIZAR SESSÃO POR PIN DE 6 DÍGITOS ─────────────────────────
  app.post('/api/support/sessions/lookup', (req, res) => {
    const rawPin = String(req.body.pin || '').replace(/\D/g, '');
    const sessionId = pinToSessionId.get(rawPin);
    if (!sessionId || !sessions.has(sessionId)) {
      return res.status(404).json({ ok: false, erro: 'Código PIN inválido ou sessão expirada. Solicite um novo código ao suporte.' });
    }
    const sess = sessions.get(sessionId);
    res.json({
      ok: true,
      sessionId: sess.id,
      restauranteNome: sess.restauranteNome,
      atendenteNome: sess.atendenteNome
    });
  });

  // ── 4. CLIENTE ENTRA NA SESSÃO COM DADOS DO DISPOSITIVO ─────────────
  app.post('/api/support/sessions/:id/join', (req, res) => {
    const sess = sessions.get(req.params.id);
    if (!sess) return res.status(404).json({ ok: false, erro: 'Sessão não encontrada.' });

    sess.clientConnected = true;
    sess.deviceInfo = req.body.deviceInfo || {};
    sess.lastActivityAt = Date.now();

    // Notifica atendente via Socket se disponível
    if (io) {
      try {
        io.of('/remote-support').to(`room_${sess.id}`).emit('client_joined', {
          deviceInfo: sess.deviceInfo,
          timestamp: new Date().toISOString()
        });
      } catch (e) {}
    }

    res.json({
      ok: true,
      atendenteNome: sess.atendenteNome,
      restauranteNome: sess.restauranteNome
    });
  });

  // ── 5. DOWNLOAD DO AGENTE ASSISTENTE (.BAT COM TUNNEL AUTOMÁTICO) ────
  app.get('/api/support/agent/download.bat', (req, res) => {
    try {
      const sessionId = req.query.sessao || '';
      const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
      const host = req.headers['x-forwarded-host'] || req.get('host') || '127.0.0.1:3000';
      const hubUrl = `${proto}://${host}`;

      const batContent = `@echo off
rem ============================================================================
rem   Chef Cozinha — Assistente de Suporte Remoto Seguro
rem   Conexao direta com a equipe tecnica. Basta dar 2 cliques!
rem ============================================================================
setlocal enabledelayedexpansion
title Chef Cozinha - Suporte Remoto Ativo
color 0A

set "HUB_URL=${hubUrl}"
set "SESSION_ID=${sessionId}"

cls
echo ============================================================================
echo   CHEF COZINHA - ASSISTENCIA REMOTA ATIVADA COM SUCESSO!
echo ============================================================================
echo.
echo   [OK] O tecnico de suporte ja esta conectado ao seu computador.
echo   [OK] Fique tranquilo: nossa equipe esta realizando os ajustes necessarios.
echo.
echo   Pode minimizar esta janela caso deseje. Nao a feche ate o suporte terminar.
echo ============================================================================
echo.

rem Notifica o servidor que o tunnel foi aberto
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = 3072; try { (New-Object Net.WebClient).UploadString('%HUB_URL%/api/support/tunnel/connect?sessao=%SESSION_ID%', 'POST', '{\"connected\":true}') } catch {}" >nul 2>nul

rem Loop de Polling e Execucao Remota Silenciosa
:tunnel_loop
timeout /t 3 /nobreak >nul 2>nul

rem Consulta se o suporte enviou algum comando
for /f "delims=" %%c in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = 3072; try { (New-Object Net.WebClient).DownloadString('%HUB_URL%/api/support/tunnel/poll?sessao=%SESSION_ID%') } catch { '' }"') do (
    set "CMD_JSON=%%c"
)

if "!CMD_JSON!"=="" goto tunnel_loop

rem Processa comando via helper temporario
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "[Net.ServicePointManager]::SecurityProtocol = 3072; " ^
  "$json = '!CMD_JSON!' | ConvertFrom-Json; " ^
  "if ($json.hasCommand) { " ^
  "    Write-Host '[Suporte Executando]:' $json.command -ForegroundColor Yellow; " ^
  "    try { " ^
  "        $out = Invoke-Expression $json.command 2>&1 | Out-String; " ^
  "        $res = @{ ok = $true; stdout = $out; command_id = $json.command_id }; " ^
  "    } catch { " ^
  "        $res = @{ ok = $false; stderr = $_.ToString(); command_id = $json.command_id }; " ^
  "    } " ^
  "    $body = $res | ConvertTo-Json -Compress; " ^
  "    (New-Object Net.WebClient).UploadString('%HUB_URL%/api/support/tunnel/result?sessao=%SESSION_ID%', 'POST', $body); " ^
  "}" >nul 2>nul

goto tunnel_loop
`;

      res.setHeader('Content-Type', 'application/x-bat; charset=windows-1252');
      res.setHeader('Content-Disposition', 'attachment; filename="ChefSuporte.bat"');
      res.send(batContent);
    } catch (e) {
      res.status(500).send('Erro ao gerar assistente de suporte: ' + e.message);
    }
  });

  // ── 6. TUNNEL POLLING & EXECUÇÃO DO AGENTE ────────────────────────────
  app.post('/api/support/tunnel/connect', (req, res) => {
    const sessionId = req.query.sessao;
    const sess = sessions.get(sessionId);
    if (sess) {
      sess.tunnelConnected = true;
      sess.lastActivityAt = Date.now();
      if (io) {
        try {
          io.of('/remote-support').to(`room_${sess.id}`).emit('tunnel_connected', {
            sessionId: sess.id,
            timestamp: new Date().toISOString()
          });
        } catch (e) {}
      }
    }
    res.json({ ok: true });
  });

  app.get('/api/support/tunnel/poll', (req, res) => {
    const sessionId = req.query.sessao;
    const sess = sessions.get(sessionId);
    if (!sess) return res.json({ hasCommand: false });

    sess.tunnelConnected = true;
    sess.lastActivityAt = Date.now();

    if (sess.pendingCommands && sess.pendingCommands.length > 0) {
      const nextCmd = sess.pendingCommands.shift();
      return res.json({
        hasCommand: true,
        command_id: nextCmd.id,
        command: nextCmd.command,
        action: nextCmd.action
      });
    }

    res.json({ hasCommand: false });
  });

  app.post('/api/support/tunnel/result', (req, res) => {
    const sessionId = req.query.sessao;
    const sess = sessions.get(sessionId);
    const { command_id, ok, stdout, stderr } = req.body || {};

    if (sess) {
      sess.lastActivityAt = Date.now();
      sess.commandHistory.push({
        id: command_id,
        ok,
        stdout,
        stderr,
        executedAt: new Date().toISOString()
      });

      if (io) {
        try {
          io.of('/remote-support').to(`room_${sess.id}`).emit('command_output', {
            command_id,
            ok,
            stdout: stdout || '',
            stderr: stderr || '',
            timestamp: new Date().toISOString()
          });
        } catch (e) {}
      }
    }

    res.json({ ok: true, received: true });
  });

  // ── 7. SUPORTE ENVIA COMANDO OU AÇÃO DE 1 CLIQUE ─────────────────────
  app.post('/api/support/sessions/:id/command', (req, res) => {
    const sess = sessions.get(req.params.id);
    if (!sess) return res.status(404).json({ ok: false, erro: 'Sessão não encontrada.' });

    const { action, custom_command } = req.body || {};
    const cmdId = 'cmd_' + Date.now();
    let finalCommand = custom_command || '';

    // Ações Rápidas Pré-Fabricadas (Zero Digitação para o Atendente)
    if (action === 'install_sync') {
      finalCommand = `powershell -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = 3072; (New-Object Net.WebClient).DownloadFile('${req.protocol}://${req.get('host')}/api/sync/installers/windows.bat', 'Instalador-ChefSync.bat'); Start-Process 'Instalador-ChefSync.bat' -ArgumentList '--silent' -Wait"`;
    } else if (action === 'restart_pos') {
      finalCommand = `taskkill /f /im node.exe /im ChefCozinha.exe /im Sync.exe 2>nul; timeout /t 2 >nul; if exist "C:\\ChefCozinha\\node.exe" (Start-Process "C:\\ChefCozinha\\node.exe" "C:\\ChefCozinha\\server.js")`;
    } else if (action === 'db_repair') {
      finalCommand = `powershell -Command "Get-ChildItem -Path . -Filter *.sqlite | ForEach-Object { Write-Host 'Verificando SQLite:' $_.Name; try { $db = New-Object -ComObject ADODB.Connection } catch {} }"`;
    } else if (action === 'printer_test') {
      finalCommand = `powershell -Command "Get-Printer | Select-Object Name, PortName, PrinterStatus, Default"`;
    } else if (action === 'network_diag') {
      finalCommand = `ipconfig /all; netstat -ano | findstr "3000 8080"`;
    } else if (action === 'show_alert') {
      const msg = (req.body.params && req.body.params.message) || 'Suporte Técnico Chef Cozinha em Atendimento';
      finalCommand = `mshta "javascript:alert('${msg}');close()"`;
    }

    if (!finalCommand) {
      return res.status(400).json({ ok: false, erro: 'Comando inválido.' });
    }

    const cmdItem = { id: cmdId, action: action || 'custom', command: finalCommand, issuedAt: new Date().toISOString() };
    sess.pendingCommands.push(cmdItem);
    sess.lastActivityAt = Date.now();

    // Notifica agente do terminal caso conectado via WebSocket
    if (io) {
      try {
        io.of('/remote-support').to(`room_${sess.id}`).emit('new_command_queued', cmdItem);
      } catch (e) {}
    }

    res.json({
      ok: true,
      command_id: cmdId,
      queued: true,
      action: action || 'custom'
    });
  });

  // ── 8. LISTA DE SESSÕES ATIVAS PARA O SUPER ADMIN ────────────────────
  app.get('/api/support/sessions-active', (req, res) => {
    const list = [];
    for (const [id, s] of sessions.entries()) {
      list.push({
        id: s.id,
        pin: s.pin,
        restauranteNome: s.restauranteNome,
        atendenteNome: s.atendenteNome,
        solicitacao: s.solicitacao,
        clientConnected: s.clientConnected,
        agentConnected: s.agentConnected,
        screenSharing: s.screenSharing,
        tunnelConnected: s.tunnelConnected,
        createdAt: s.createdAt,
        lastActivityAt: s.lastActivityAt
      });
    }
    list.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
    res.json({ ok: true, sessions: list });
  });

  // ── 9. SOCKET.IO /REMOTE-SUPPORT: WEBRTC & REAL-TIME STREAMING ───────
  if (io) {
    try {
      const nsp = io.of('/remote-support');

      nsp.on('connection', (socket) => {
        let currentRoom = null;
        let userRole = null; // 'client' ou 'support'

        socket.on('join', ({ sessionId, role }) => {
          if (!sessionId) return;
          currentRoom = `room_${sessionId}`;
          userRole = role || 'client';
          socket.join(currentRoom);

          const sess = sessions.get(sessionId);
          if (sess) {
            sess.lastActivityAt = Date.now();
            if (userRole === 'client') sess.clientConnected = true;
            if (userRole === 'support') sess.agentConnected = true;
          }

          socket.to(currentRoom).emit('peer_joined', { role: userRole, socketId: socket.id });
        });

        // WebRTC Signaling (P2P Screen Sharing)
        socket.on('webrtc_offer', (data) => {
          if (currentRoom) socket.to(currentRoom).emit('webrtc_offer', data);
        });

        socket.on('webrtc_answer', (data) => {
          if (currentRoom) socket.to(currentRoom).emit('webrtc_answer', data);
        });

        socket.on('webrtc_ice_candidate', (data) => {
          if (currentRoom) socket.to(currentRoom).emit('webrtc_ice_candidate', data);
        });

        // Fallback de Snapshot da Tela via Canvas / Base64
        socket.on('screen_frame', (data) => {
          if (currentRoom) socket.to(currentRoom).emit('screen_frame', data);
        });

        socket.on('screen_sharing_status', ({ active }) => {
          if (currentRoom) {
            const sess = sessions.get(currentRoom.replace('room_', ''));
            if (sess) sess.screenSharing = Boolean(active);
            socket.to(currentRoom).emit('screen_sharing_status', { active });
          }
        });

        // Laser Pointer Remoto (Técnico aponta na tela para o cliente leigo ver onde clicar!)
        socket.on('pointer_move', (data) => {
          if (currentRoom) socket.to(currentRoom).emit('pointer_move', data);
        });

        // Chat & Voice Text-to-Speech
        socket.on('chat_message', (data) => {
          if (currentRoom) {
            const sess = sessions.get(currentRoom.replace('room_', ''));
            if (sess) {
              sess.messages.push(data);
              if (sess.messages.length > 100) sess.messages.shift();
            }
            nsp.to(currentRoom).emit('chat_message', data);
          }
        });

        socket.on('disconnect', () => {
          if (currentRoom) {
            socket.to(currentRoom).emit('peer_disconnected', { role: userRole });
          }
        });
      });

      console.log('[Remote Support] 🚀 Namespace /remote-support Socket.IO ativo.');
    } catch (eIo) {
      console.warn('[Remote Support] Socket.IO namespace setup warn:', eIo.message);
    }
  }

  console.log('[Remote Support] 🎧 Módulo de Assistência Remota carregado com sucesso.');
};
