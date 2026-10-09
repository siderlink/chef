/**
 * routes/fidelidade.routes.js
 * Módulo de Clube de Fidelidade, Pontos e Cashback
 * Extraído do server.js com reforço de segurança:
 * - withTenant (isolamento por restaurante)
 * - Sanitização de identificador (telefones e CPFs contra caracteres maliciosos)
 * - Validação matemática estrita contra resgates negativos ou superiores ao saldo disponível
 * - Rastreamento e auditoria de transações
 */

'use strict';

const { Router } = require('express');
const { getContext } = require('./shared/context');

function createFidelidadeRouter() {
  const router = Router();
  const { withTenant, getTenantDb, io } = getContext();
  const getDb = () => getTenantDb();

  // GET /api/fidelidade/saldo/:identificador - Consulta saldo por CPF, Telefone ou ID
  router.get('/saldo/:identificador', (req, res) => {
    const rawId = req.params.identificador || '';
    const idOrCpf = rawId.replace(/\D/g, '');

    withTenant(req, () => {
      const db = getDb();
      db.get(
        `SELECT * FROM clientes 
         WHERE (REPLACE(REPLACE(telefone, '-', ''), ' ', '') LIKE '%' || ? || '%' AND length(?) >= 8)
            OR (REPLACE(REPLACE(REPLACE(COALESCE(cpf, ''), '.', ''), '-', ''), '/', '') = ? AND length(?) >= 11)
            OR id = ?
         LIMIT 1`,
        [idOrCpf, idOrCpf, idOrCpf, parseInt(rawId, 10) || 0],
        (err, cliente) => {
          if (err) return res.status(500).json({ success: false, error: err.message });
          if (!cliente) {
            return res.status(404).json({ success: false, error: 'Cliente não encontrado no programa de fidelidade.' });
          }

          const saldoCashback = parseFloat(cliente.saldo_cashback || 0);
          const pontos = parseInt(cliente.pontos || 0, 10);
          const nivel = cliente.nivel || 'Bronze';

          res.json({
            success: true,
            ok: true,
            cliente: {
              id: cliente.id,
              nome: cliente.nome,
              telefone: cliente.telefone,
              cpf: cliente.cpf || '',
              pontos,
              saldo_cashback: saldoCashback,
              nivel,
              total_gasto: parseFloat(cliente.total_gasto || 0)
            }
          });
        }
      );
    });
  });

  // POST /api/fidelidade/resgatar-cashback - Resgate e abatimento de saldo no checkout
  router.post('/resgatar-cashback', (req, res) => {
    const { clienteId, valor_resgate, mesa, operador = 'Caixa' } = req.body || {};
    const valor = parseFloat(valor_resgate) || 0;
    const cid = parseInt(clienteId, 10);

    if (!cid || cid <= 0 || valor <= 0) {
      return res.status(400).json({ success: false, error: 'Cliente e valor positivo de resgate são obrigatórios.' });
    }

    withTenant(req, () => {
      const db = getDb();
      db.get('SELECT * FROM clientes WHERE id = ?', [cid], (err, cliente) => {
        if (err || !cliente) return res.status(404).json({ success: false, error: 'Cliente não localizado.' });

        const saldoAtual = parseFloat(cliente.saldo_cashback || 0);
        if (valor > saldoAtual) {
          return res.status(400).json({
            success: false,
            error: `Saldo insuficiente de cashback. Saldo disponível: R$ ${saldoAtual.toFixed(2)}, tentou resgatar: R$ ${valor.toFixed(2)}.`
          });
        }

        const novoSaldo = parseFloat((saldoAtual - valor).toFixed(2));
        db.run('UPDATE clientes SET saldo_cashback = ? WHERE id = ?', [novoSaldo, cid], function (errUp) {
          if (errUp) return res.status(500).json({ success: false, error: errUp.message });

          if (typeof global.registrarAuditoria === 'function') {
            global.registrarAuditoria(
              operador,
              'Resgate Cashback',
              `Cliente #${cid} resgatou R$ ${valor.toFixed(2)} na mesa ${mesa || 'Balcão'}`
            );
          }

          if (io) {
            io.emit('fidelidade_atualizada', { clienteId: cid, novoSaldo });
          }

          res.json({
            success: true,
            novoSaldo,
            valorResgatado: valor,
            clienteNome: cliente.nome
          });
        });
      });
    });
  });

  return router;
}

module.exports = { createFidelidadeRouter };
