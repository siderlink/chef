/**
 * terminal-pairing-service.js
 * 
 * Central de Liberação Remota de Terminais e Pareamento (Zero Senha para Colaborador).
 * 
 * Permite que garçons, caixas e cozinheiros tenham acesso liberado em seus aparelhos
 * (PCs, tablets, smartphones, KDS, totens) remotamente pelo Dono via Painel-Dono,
 * sem que nenhum colaborador veja, saiba ou digite o e-mail ou a senha master do restaurante.
 */

'use strict';

const jwt = require('jsonwebtoken');

class TerminalPairingService {
  constructor() {
    // Código de 6 dígitos -> Objeto com dados do terminal aguardando
    this.pendingPairings = new Map();
    // socketId -> Código de 6 dígitos
    this.socketToCode = new Map();

    // Limpeza automática de códigos expirados (TTL de 15 minutos)
    setInterval(() => {
      this._cleanupExpired();
    }, 60 * 1000);
  }

  initDatabase(masterDb) {
    if (!masterDb) return;
    masterDb.run(`
      CREATE TABLE IF NOT EXISTS dispositivos_autorizados (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        restaurante_id INTEGER NOT NULL,
        serial TEXT,
        codigo_pareamento TEXT,
        apelido TEXT NOT NULL,
        cargo TEXT NOT NULL,
        estacao TEXT NOT NULL,
        ip_autorizado TEXT,
        dispositivo_info TEXT,
        token_sessao TEXT,
        autorizado_por TEXT,
        autorizado_em DATETIME DEFAULT (datetime('now', 'localtime')),
        expira_em DATETIME,
        ultimo_acesso DATETIME DEFAULT (datetime('now', 'localtime')),
        ativo INTEGER DEFAULT 1
      )
    `, (err) => {
      if (err) console.error('[TerminalAuth] Erro ao criar tabela dispositivos_autorizados:', err.message);
    });

    // Migração segura para colunas adicionais se tabela já existia
    masterDb.run(`ALTER TABLE dispositivos_autorizados ADD COLUMN estacao TEXT DEFAULT 'garcom'`, () => {});
    masterDb.run(`ALTER TABLE dispositivos_autorizados ADD COLUMN codigo_pareamento TEXT`, () => {});
    masterDb.run(`ALTER TABLE dispositivos_autorizados ADD COLUMN autorizado_por TEXT`, () => {});
  }

  _cleanupExpired() {
    const now = Date.now();
    for (const [code, item] of this.pendingPairings.entries()) {
      if (item.expiresAt && item.expiresAt < now) {
        if (item.socketId) this.socketToCode.delete(item.socketId);
        this.pendingPairings.delete(code);
      }
    }
  }

  _generateUniqueCode() {
    let attempts = 0;
    while (attempts < 100) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      if (!this.pendingPairings.has(code)) {
        return code;
      }
      attempts++;
    }
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  getStationConfig(estacao) {
    const estacoes = {
      caixa: { url: '/index.html', cargo: 'Caixa', nome: 'Terminal de Caixa (PDV)', icone: 'ph-desktop', cor: '#3b82f6' },
      caixa_mobile: { url: '/pdv-mobile.html', cargo: 'Caixa', nome: 'Caixa Mobile (Touch)', icone: 'ph-device-mobile', cor: '#fc4b15' },
      garcom: { url: '/garcom.html', cargo: 'Garçom', nome: 'Salão & Garçons', icone: 'ph-fork-knife', cor: '#fc4b15' },
      cozinha: { url: '/fila-pedidos.html', cargo: 'Cozinha', nome: 'KDS Cozinha & Bar', icone: 'ph-fire', cor: '#10b981' },
      totem: { url: '/totem.html', cargo: 'Totem', nome: 'Totem Autoatendimento', icone: 'ph-monitor-play', cor: '#0ea5e9' },
      gestao: { url: '/painel-dono.html', cargo: 'Gerente', nome: 'Painel de Gestão', icone: 'ph-crown', cor: '#a855f7' }
    };
    return estacoes[estacao] || estacoes.garcom;
  }

  /**
   * Registra uma solicitação de pareamento de um terminal que abriu o login.html
   */
  requestPairing({ socket, code, deviceInfo, restaurante_id, requestedStation, clientIp, io }) {
    const finalCode = (code && String(code).replace(/\D/g, '').length === 6)
      ? String(code).replace(/\D/g, '')
      : this._generateUniqueCode();

    const socketId = socket ? socket.id : null;
    const now = Date.now();
    const expiresAt = now + 15 * 60 * 1000; // 15 minutos de validade

    const parsedRestId = parseInt(restaurante_id, 10);
    const validRestId = Number.isFinite(parsedRestId) && parsedRestId > 0 ? parsedRestId : null;

    const pairingData = {
      code: finalCode,
      socketId,
      clientIp: clientIp || '127.0.0.1',
      deviceInfo: deviceInfo || {},
      restaurante_id: validRestId,
      requestedStation: requestedStation || 'garcom',
      requestedAt: now,
      expiresAt,
      status: 'aguardando', // 'aguardando' | 'autorizado' | 'recusado'
      authPayload: null
    };

    this.pendingPairings.set(finalCode, pairingData);
    if (socketId) this.socketToCode.set(socketId, finalCode);

    // Notifica os donos conectados para este restaurante (ou todos os donos conectados se restaurante_id for nulo)
    if (io) {
      const pendingNotification = {
        code: finalCode,
        deviceInfo: pairingData.deviceInfo,
        clientIp: pairingData.clientIp,
        restaurante_id: validRestId,
        requestedStation: pairingData.requestedStation,
        requestedAt: pairingData.requestedAt,
        expiresAt: pairingData.expiresAt
      };

      if (validRestId) {
        io.to(`restaurante_${validRestId}`).emit('novo_terminal_pendente', pendingNotification);
      } else {
        io.emit('novo_terminal_pendente', pendingNotification);
      }
    }

    return {
      success: true,
      code: finalCode,
      expiresAt,
      ttlSeconds: Math.round((expiresAt - now) / 1000),
      restaurante_id: validRestId
    };
  }

  /**
   * Dono autoriza o terminal pelo código de 6 dígitos
   */
  async authorizeByCode({ code, restaurante_id, cargo, apelido, estacao, validadeDias, donoNome, masterDb, JWT_SECRET, io, activeSockets }) {
    const cleanCode = String(code || '').replace(/\D/g, '');
    if (!cleanCode || cleanCode.length !== 6) {
      return { success: false, error: 'Código deve conter exatamente 6 dígitos numéricos.' };
    }

    const pairing = this.pendingPairings.get(cleanCode);
    if (!pairing) {
      return { success: false, error: 'Código de pareamento não encontrado ou já expirado. Atualize a tela do terminal para gerar um novo código.' };
    }

    if (pairing.expiresAt < Date.now()) {
      this.pendingPairings.delete(cleanCode);
      return { success: false, error: 'Este código expirou. Solicite que o colaborador recarregue a tela.' };
    }

    const targetRestId = parseInt(restaurante_id || pairing.restaurante_id || 1, 10);
    const rest = await new Promise((resolve) => {
      masterDb.get('SELECT id, nome, ativo FROM restaurantes WHERE id = ?', [targetRestId], (err, row) => {
        resolve(row || null);
      });
    });

    if (!rest || !rest.ativo) {
      return { success: false, error: 'Restaurante não encontrado ou inativo.' };
    }

    const stationCfg = this.getStationConfig(estacao || pairing.requestedStation || 'garcom');
    const finalCargo = cargo || stationCfg.cargo;
    const finalEstacao = estacao || pairing.requestedStation || 'garcom';
    const finalApelido = (apelido && apelido.trim()) 
      ? apelido.trim() 
      : `${stationCfg.nome} (${pairing.deviceInfo.model || 'Aparelho'})`;

    const dias = parseInt(validadeDias, 10) || 90;
    const expiraEmDate = new Date();
    expiraEmDate.setDate(expiraEmDate.getDate() + dias);

    // Assina JWT ultra seguro para o terminal
    const sessToken = jwt.sign({
      id: 'term_' + cleanCode + '_' + Date.now(),
      restaurante_id: rest.id,
      restaurante_nome: rest.nome,
      role: finalCargo.toLowerCase(),
      cargo: finalCargo,
      estacao: finalEstacao,
      nome: finalApelido,
      usuario: `terminal_${cleanCode}`,
      is_terminal: true,
      tipo: 'funcionario',
      pin: false
    }, JWT_SECRET, { expiresIn: `${dias}d` });

    const authPayload = {
      success: true,
      token: sessToken,
      restaurante_id: rest.id,
      restaurante_nome: rest.nome,
      cargo: finalCargo,
      usuario_role: finalCargo.toLowerCase(),
      apelido: finalApelido,
      nome: finalApelido,
      estacao: finalEstacao,
      url_destino: stationCfg.url,
      autorizado_por: donoNome || 'Proprietário',
      autorizado_em: new Date().toISOString(),
      expira_em: expiraEmDate.toISOString()
    };

    // Marca pairing como autorizado na memória
    pairing.status = 'autorizado';
    pairing.authPayload = authPayload;

    // Envia evento de autorização via Socket.io ao terminal esperando
    if (pairing.socketId && io) {
      const targetSocket = io.sockets.sockets.get(pairing.socketId);
      if (targetSocket) {
        targetSocket.emit('aparelho_autorizado_remotamente', authPayload);
        targetSocket.join(`restaurante_${rest.id}`);
        targetSocket.restaurante_id = rest.id;
      }
    }

    // Persiste no banco de dados de dispositivos autorizados
    const devInfoStr = JSON.stringify(pairing.deviceInfo || {});
    await new Promise((resolve) => {
      masterDb.run(`
        INSERT INTO dispositivos_autorizados (
          restaurante_id, serial, codigo_pareamento, apelido, cargo, estacao,
          ip_autorizado, dispositivo_info, token_sessao, autorizado_por,
          autorizado_em, expira_em, ativo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), ?, 1)
      `, [
        rest.id,
        pairing.deviceInfo.serial || ('serial_' + cleanCode),
        cleanCode,
        finalApelido,
        finalCargo,
        finalEstacao,
        pairing.clientIp,
        devInfoStr,
        sessToken,
        donoNome || 'Proprietário',
        expiraEmDate.toISOString()
      ], () => resolve());
    });

    // Notifica donos de que a lista de pendentes foi atualizada
    if (io) {
      io.to(`restaurante_${rest.id}`).emit('terminal_pareamento_concluido', {
        code: cleanCode,
        apelido: finalApelido,
        cargo: finalCargo,
        estacao: finalEstacao
      });
      io.emit('connected_devices_updated');
    }

    // Mantém o código por 60 segundos com o authPayload caso o cliente esteja em polling HTTP
    setTimeout(() => {
      if (pairing.socketId) this.socketToCode.delete(pairing.socketId);
      this.pendingPairings.delete(cleanCode);
    }, 60 * 1000);

    return {
      success: true,
      message: `Aparelho "${finalApelido}" liberado com sucesso para ${stationCfg.nome}!`,
      authPayload
    };
  }

  /**
   * Consulta status de pareamento (para terminais com polling ou verificação)
   */
  checkPairingStatus(code) {
    const cleanCode = String(code || '').replace(/\D/g, '');
    const pairing = this.pendingPairings.get(cleanCode);
    if (!pairing) {
      return { success: false, status: 'inexistente', error: 'Código não encontrado ou expirado.' };
    }
    if (pairing.status === 'autorizado' && pairing.authPayload) {
      return { success: true, status: 'autorizado', data: pairing.authPayload };
    }
    return {
      success: true,
      status: 'aguardando',
      code: cleanCode,
      expiresAt: pairing.expiresAt,
      ttlSeconds: Math.max(0, Math.round((pairing.expiresAt - Date.now()) / 1000))
    };
  }

  /**
   * Gera um Link Mágico para WhatsApp com autorização pré-assinada
   */
  async generateMagicWhatsAppLink({ restaurante_id, cargo, estacao, nome, validadeDias, baseUrl, donoNome, masterDb, JWT_SECRET }) {
    const targetRestId = parseInt(restaurante_id || 1, 10);
    const rest = await new Promise((resolve) => {
      masterDb.get('SELECT id, nome, ativo FROM restaurantes WHERE id = ?', [targetRestId], (err, row) => resolve(row || null));
    });

    if (!rest || !rest.ativo) {
      return { success: false, error: 'Restaurante não encontrado ou inativo.' };
    }

    const stationCfg = this.getStationConfig(estacao || 'garcom');
    const finalCargo = cargo || stationCfg.cargo;
    const finalEstacao = estacao || 'garcom';
    const finalNome = nome || `Colaborador (${stationCfg.nome})`;
    const dias = parseInt(validadeDias, 10) || 30;

    const expiraEmDate = new Date();
    expiraEmDate.setDate(expiraEmDate.getDate() + dias);

    // Token especial assinado com tipo 'magic_link_terminal'
    const magicToken = jwt.sign({
      tipo: 'magic_link_terminal',
      restaurante_id: rest.id,
      restaurante_nome: rest.nome,
      cargo: finalCargo,
      estacao: finalEstacao,
      nome: finalNome,
      donoNome: donoNome || 'Proprietário'
    }, JWT_SECRET, { expiresIn: `${dias}d` });

    const hostUrl = (baseUrl || '').replace(/\/$/, '');
    const urlAcesso = `${hostUrl}/login.html?token_pareamento=${magicToken}&estacao=${finalEstacao}&restaurante_id=${rest.id}`;

    const textoWhatsApp = 
      `🍽️ *Acesso Liberado - ${rest.nome}*\n\n` +
      `Olá! O seu acesso ao sistema (${stationCfg.nome}) foi liberado pelo Dono.\n\n` +
      `👉 *Clique no link abaixo para entrar direto sem precisar de senha:*\n` +
      `${urlAcesso}\n\n` +
      `_(Válido por ${dias} dias no seu aparelho)_`;

    return {
      success: true,
      url: urlAcesso,
      token: magicToken,
      estacao: finalEstacao,
      cargo: finalCargo,
      restaurante_nome: rest.nome,
      textoWhatsApp,
      linkWhatsAppWeb: `https://wa.me/?text=${encodeURIComponent(textoWhatsApp)}`
    };
  }

  /**
   * Valida o token do Link Mágico quando o colaborador clica no WhatsApp
   */
  async validateMagicLink({ token, clientIp, deviceInfo, masterDb, JWT_SECRET }) {
    if (!token) return { success: false, error: 'Token não fornecido.' };

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.tipo !== 'magic_link_terminal' && decoded.tipo !== 'terminal_autorizado') {
        return { success: false, error: 'Tipo de token inválido para autorização remota.' };
      }

      const restId = parseInt(decoded.restaurante_id, 10);
      const rest = await new Promise((resolve) => {
        masterDb.get('SELECT id, nome, ativo FROM restaurantes WHERE id = ?', [restId], (err, row) => resolve(row || null));
      });

      if (!rest || !rest.ativo) {
        return { success: false, error: 'Restaurante não encontrado ou inativo.' };
      }

      const stationCfg = this.getStationConfig(decoded.estacao || 'garcom');
      const finalCargo = decoded.cargo || stationCfg.cargo;
      const finalEstacao = decoded.estacao || 'garcom';
      const finalNome = decoded.nome || 'Terminal Autorizado';

      // Gera um token de sessão permanente de 90 dias
      const sessToken = jwt.sign({
        id: 'term_magic_' + Date.now(),
        restaurante_id: rest.id,
        restaurante_nome: rest.nome,
        role: finalCargo.toLowerCase(),
        cargo: finalCargo,
        estacao: finalEstacao,
        nome: finalNome,
        is_terminal: true,
        tipo: 'funcionario',
        pin: false
      }, JWT_SECRET, { expiresIn: '90d' });

      // Salva no histórico de autorizações
      const devInfoStr = JSON.stringify(deviceInfo || {});
      masterDb.run(`
        INSERT INTO dispositivos_autorizados (
          restaurante_id, serial, apelido, cargo, estacao,
          ip_autorizado, dispositivo_info, token_sessao, autorizado_por,
          autorizado_em, expira_em, ativo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', '+90 days'), 1)
      `, [
        rest.id,
        'magic_' + Date.now(),
        finalNome,
        finalCargo,
        finalEstacao,
        clientIp || '127.0.0.1',
        devInfoStr,
        sessToken,
        decoded.donoNome || 'Proprietário (WhatsApp)'
      ], () => {});

      return {
        success: true,
        token: sessToken,
        restaurante_id: rest.id,
        restaurante_nome: rest.nome,
        cargo: finalCargo,
        usuario_role: finalCargo.toLowerCase(),
        apelido: finalNome,
        nome: finalNome,
        estacao: finalEstacao,
        url_destino: stationCfg.url,
        autorizado_por: decoded.donoNome || 'Proprietário (WhatsApp)',
        autorizado_em: new Date().toISOString()
      };
    } catch (e) {
      return { success: false, error: 'Link de acesso inválido ou expirado. Peça ao dono um novo link.' };
    }
  }

  /**
   * Lista terminais pendentes de liberação para um restaurante
   */
  listPending(restaurante_id) {
    this._cleanupExpired();
    const result = [];
    const targetRestId = restaurante_id ? parseInt(restaurante_id, 10) : null;

    for (const [code, item] of this.pendingPairings.entries()) {
      if (item.status === 'aguardando') {
        if (!targetRestId || !item.restaurante_id || item.restaurante_id === targetRestId) {
          result.push({
            code: item.code,
            socketId: item.socketId,
            clientIp: item.clientIp,
            deviceInfo: item.deviceInfo,
            requestedStation: item.requestedStation,
            restaurante_id: item.restaurante_id,
            requestedAt: item.requestedAt,
            expiresAt: item.expiresAt,
            tempoRestanteMin: Math.max(0, Math.round((item.expiresAt - Date.now()) / 60000))
          });
        }
      }
    }

    return result.sort((a, b) => b.requestedAt - a.requestedAt);
  }

  /**
   * Lista aparelhos autorizados e ativos para o dono gerenciar
   */
  async listAuthorized(restaurante_id, masterDb) {
    const targetRestId = parseInt(restaurante_id || 1, 10);
    return new Promise((resolve) => {
      masterDb.all(`
        SELECT id, restaurante_id, serial, codigo_pareamento, apelido, cargo, estacao,
               ip_autorizado, dispositivo_info, autorizado_por, autorizado_em,
               expira_em, ultimo_acesso, ativo
        FROM dispositivos_autorizados
        WHERE restaurante_id = ? AND ativo = 1
        ORDER BY id DESC
      `, [targetRestId], (err, rows) => {
        if (err || !rows) return resolve([]);
        const list = rows.map(r => {
          let info = {};
          try { if (r.dispositivo_info) info = JSON.parse(r.dispositivo_info); } catch (e) {}
          return {
            ...r,
            dispositivo_info_obj: info
          };
        });
        resolve(list);
      });
    });
  }

  /**
   * Revoga imediatamente o acesso de um terminal (Kill-Switch do Dono)
   */
  async revokeTerminal({ id, restaurante_id, masterDb, io, activeSockets }) {
    const termId = parseInt(id, 10);
    if (!termId) return { success: false, error: 'ID do dispositivo inválido.' };

    const targetRestId = parseInt(restaurante_id || 1, 10);

    return new Promise((resolve) => {
      masterDb.get(
        'SELECT * FROM dispositivos_autorizados WHERE id = ? AND restaurante_id = ?',
        [termId, targetRestId],
        (err, row) => {
          if (err || !row) return resolve({ success: false, error: 'Dispositivo não encontrado.' });

          masterDb.run(
            'UPDATE dispositivos_autorizados SET ativo = 0 WHERE id = ?',
            [termId],
            () => {
              // Se há sockets ativos do mesmo restaurante que combinem com o terminal ou token, derruba
              if (io) {
                io.to(`restaurante_${targetRestId}`).emit('terminal_revogado', {
                  terminalId: termId,
                  serial: row.serial,
                  apelido: row.apelido
                });

                // Se houver activeSockets, procura pelo serial ou socket e derruba
                if (activeSockets && typeof activeSockets.values === 'function') {
                  for (const conn of activeSockets.values()) {
                    if (conn.serial === row.serial || (conn.user && conn.user === row.apelido)) {
                      const s = io.sockets.sockets.get(conn.id);
                      if (s) {
                        s.emit('sessao_derrubada_remotamente', { motivo: 'Acesso revogado pelo proprietário.' });
                        s.emit('forcar_logout');
                        s.disconnect(true);
                      }
                    }
                  }
                }
              }

              resolve({ success: true, message: `Acesso do aparelho "${row.apelido}" revogado imediatamente.` });
            }
          );
        }
      );
    });
  }
}

const terminalPairingService = new TerminalPairingService();

module.exports = terminalPairingService;
