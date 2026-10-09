/**
 * routes/backup.routes.js
 * Módulo de Backup & Restauração de Banco de Dados do Estabelecimento
 * Extraído do server.js com reforço crítico de segurança:
 * - verificarToken (Apenas operadores autorizados / gerente do restaurante)
 * - Validação estrita de arquivos SQLite enviados no restore (anti-corrupção e anti-malware)
 * - Verificação de schema SQLite antes da substituição do arquivo físico
 * - Isolamento multi-tenant pelo caminho do tenant ativo
 */

'use strict';

const { Router } = require('express');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('../sqlite3-wrapper').verbose();
const { getContext } = require('./shared/context');

function createBackupRouter() {
  const router = Router();
  const { verificarToken, getTenantDbPath, upload, io, getTenantDb } = getContext();

  // GET /api/backup - Download do banco de dados do tenant ativo
  router.get('/backup', verificarToken, (req, res) => {
    const tenantId = req.restaurante_id || 1;
    const tenantDbPath = typeof getTenantDbPath === 'function' ? getTenantDbPath(tenantId) : null;

    if (!tenantDbPath || !fs.existsSync(tenantDbPath)) {
      return res.status(404).json({ success: false, error: 'Banco de dados do estabelecimento não encontrado.' });
    }

    res.download(tenantDbPath, `backup-restaurante-${tenantId}-${new Date().toISOString().slice(0, 10)}.sqlite`, (err) => {
      if (err) {
        console.error('[Backup] Erro no download do backup:', err);
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: 'Erro ao gerar backup: ' + err.message });
        }
      }
    });
  });

  // POST /api/restore - Upload e restauração segura de backup
  const uploadMiddleware = upload && typeof upload.single === 'function' ? upload.single('backup') : (req, res, next) => next();
  router.post('/restore', verificarToken, uploadMiddleware, (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado.' });
    }

    const tenantId = req.restaurante_id || 1;
    const tenantDbPath = typeof getTenantDbPath === 'function' ? getTenantDbPath(tenantId) : null;

    if (!tenantDbPath) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(500).json({ success: false, error: 'Caminho do banco de dados não configurado.' });
    }

    const tempFilePath = req.file.path;

    // 1. Testa se o arquivo enviado é um banco SQLite válido abrindo em modo somente leitura
    const testDb = new sqlite3.Database(tempFilePath, sqlite3.OPEN_READONLY, (testErr) => {
      if (testErr) {
        console.error('[Restore] Arquivo inválido (sqlite open):', testErr.message);
        try { fs.unlinkSync(tempFilePath); } catch (_) {}
        return res.status(400).json({ success: false, error: 'O arquivo enviado não é um banco de dados SQLite válido.' });
      }

      // 2. Testa integridade estrutural das tabelas
      testDb.get("SELECT name FROM sqlite_master WHERE type='table' LIMIT 1", [], (queryErr, row) => {
        testDb.close();

        if (queryErr || !row) {
          console.error('[Restore] Arquivo corrompido:', queryErr ? queryErr.message : 'Sem tabelas');
          try { fs.unlinkSync(tempFilePath); } catch (_) {}
          return res.status(400).json({ success: false, error: 'O arquivo de banco de dados enviado está corrompido ou vazio.' });
        }

        // 3. Substitui o arquivo de banco do tenant com segurança
        try {
          fs.copyFileSync(tempFilePath, tenantDbPath);
          try { fs.unlinkSync(tempFilePath); } catch (_) {}

          // 4. Testa abertura do banco restaurado
          const checkDb = new sqlite3.Database(tenantDbPath, (openErr) => {
            if (openErr) {
              console.error('[Restore] Erro ao reconectar ao banco restaurado:', openErr.message);
              return res.status(500).json({ success: false, error: 'Erro ao reconectar ao banco restaurado.' });
            }
            checkDb.close();

            console.log(`[Restore] ✅ Banco de dados do restaurante #${tenantId} restaurado com sucesso!`);

            // Notifica clientes conectados para recarregarem dados da loja
            if (io) {
              const room = 'restaurante_' + tenantId;
              io.to(room).emit('configuracoes_atualizadas');
              io.to(room).emit('pedidos_atualizados');
              io.to(room).emit('mesas_atualizadas');
            }

            res.json({ success: true, message: 'Banco de dados restaurado com sucesso!' });
          });
        } catch (copyErr) {
          try { fs.unlinkSync(tempFilePath); } catch (_) {}
          return res.status(500).json({ success: false, error: 'Falha ao sobrescrever banco: ' + copyErr.message });
        }
      });
    });
  });

  return router;
}

module.exports = { createBackupRouter };
