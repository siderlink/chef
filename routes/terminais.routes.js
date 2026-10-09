/**
 * routes/terminais.routes.js
 * Módulo de Gestão de Terminais e Pareamento Remoto (Zero Senha para Colaborador)
 * Extraído do server.js com preservação de todas as camadas de segurança:
 * - verificarToken (JWT autenticado para ações administrativas)
 * - Restrição por restaurante (req.restaurante_id)
 * - Validação e rastreamento de IP do cliente (anti-spoofing)
 * - Expiração criptográfica de magic links (JWT_SECRET)
 * - Revogação em tempo real de sockets e acessos
 */

'use strict';

const { Router } = require('express');
const { getContext } = require('./shared/context');

function createTerminaisRouter() {
  const router = Router();
  const {
    terminalPairingService,
    verificarToken,
    masterDb,
    JWT_SECRET,
    io,
    activeSockets
  } = getContext();

  // POST /api/terminais/solicitar-pareamento - Inicia pedido de pareamento por código
  router.post('/solicitar-pareamento', (req, res) => {
    if (!terminalPairingService) {
      return res.status(503).json({ success: false, error: 'Serviço de pareamento indisponível.' });
    }
    const { code, deviceInfo, restaurante_id, requestedStation } = req.body || {};
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const clientIp = String(rawIp).replace('::ffff:', '').split(',')[0].trim();

    const result = terminalPairingService.requestPairing({
      socket: null,
      code: String(code || '').slice(0, 20),
      deviceInfo,
      restaurante_id: parseInt(restaurante_id, 10) || null,
      requestedStation,
      clientIp,
      io
    });
    res.json(result);
  });

  // GET /api/terminais/verificar-status - Verifica se terminal foi aprovado pelo gestor
  router.get('/verificar-status', (req, res) => {
    if (!terminalPairingService) {
      return res.status(503).json({ success: false, error: 'Serviço de pareamento indisponível.' });
    }
    const { code } = req.query || {};
    const result = terminalPairingService.checkPairingStatus(String(code || '').slice(0, 20));
    res.json(result);
  });

  // POST /api/terminais/validar-magic-link - Valida link temporário de acesso
  router.post('/validar-magic-link', async (req, res) => {
    if (!terminalPairingService) {
      return res.status(503).json({ success: false, error: 'Serviço de pareamento indisponível.' });
    }
    const { token, deviceInfo } = req.body || {};
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const clientIp = String(rawIp).replace('::ffff:', '').split(',')[0].trim();

    try {
      const result = await terminalPairingService.validateMagicLink({
        token,
        clientIp,
        deviceInfo,
        masterDb,
        JWT_SECRET
      });
      if (!result.success) return res.status(400).json(result);
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/terminais/pendentes - Lista solicitações pendentes do restaurante atual
  router.get('/pendentes', verificarToken, (req, res) => {
    if (!terminalPairingService) return res.json({ success: true, pendentes: [], total: 0 });
    const list = terminalPairingService.listPending(req.restaurante_id);
    res.json({ success: true, sucesso: true, pendentes: list, total: list.length });
  });

  // POST /api/terminais/autorizar-codigo - Aprova e emite credencial de terminal
  router.post('/autorizar-codigo', verificarToken, async (req, res) => {
    if (!terminalPairingService) {
      return res.status(503).json({ success: false, error: 'Serviço de pareamento indisponível.' });
    }
    const { code, codigo, cargo, apelido, estacao, validadeDias } = req.body || {};
    try {
      const result = await terminalPairingService.authorizeByCode({
        code: String(code || codigo || '').slice(0, 20),
        restaurante_id: req.restaurante_id,
        cargo,
        apelido,
        estacao,
        validadeDias: parseInt(validadeDias, 10) || 30,
        donoNome: req.user_nome || 'Proprietário',
        masterDb,
        JWT_SECRET,
        io,
        activeSockets
      });
      if (!result.success) return res.status(400).json({ ...result, sucesso: false });
      res.json({ ...result, sucesso: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/terminais/gerar-link-whatsapp - Gera convite com link assinado
  router.post('/gerar-link-whatsapp', verificarToken, async (req, res) => {
    if (!terminalPairingService) {
      return res.status(503).json({ success: false, error: 'Serviço de pareamento indisponível.' });
    }
    const { cargo, estacao, nome, apelido, validadeDias, expiraEmHoras } = req.body || {};
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const diasCalculados = expiraEmHoras ? (parseFloat(expiraEmHoras) / 24) : (parseInt(validadeDias, 10) || 30);

    try {
      const result = await terminalPairingService.generateMagicWhatsAppLink({
        restaurante_id: req.restaurante_id,
        cargo,
        estacao,
        nome: nome || apelido,
        validadeDias: diasCalculados || 30,
        baseUrl,
        donoNome: req.user_nome || 'Proprietário',
        masterDb,
        JWT_SECRET
      });
      if (!result.success) return res.status(400).json({ ...result, sucesso: false });
      res.json({ ...result, sucesso: true, linkAcesso: result.url });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/terminais/autorizados - Lista todos os aparelhos ativos
  router.get('/autorizados', verificarToken, async (req, res) => {
    if (!terminalPairingService) return res.json({ success: true, autorizados: [], dispositivos: [] });
    try {
      const list = await terminalPairingService.listAuthorized(req.restaurante_id, masterDb);
      res.json({ success: true, sucesso: true, autorizados: list, dispositivos: list });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/terminais/revogar - Desconecta e revoga permissão de terminal
  router.post('/revogar', verificarToken, async (req, res) => {
    if (!terminalPairingService) {
      return res.status(503).json({ success: false, error: 'Serviço de pareamento indisponível.' });
    }
    const { id, terminalId } = req.body || {};
    try {
      const result = await terminalPairingService.revokeTerminal({
        id: id || terminalId,
        restaurante_id: req.restaurante_id,
        masterDb,
        io,
        activeSockets
      });
      if (!result.success) return res.status(400).json({ ...result, sucesso: false });
      res.json({ ...result, sucesso: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}

module.exports = { createTerminaisRouter };
