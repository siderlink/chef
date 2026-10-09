/**
 * routes/rh.routes.js
 * Módulo de Recursos Humanos, Folha de Pagamento, Vales e Colaboradores
 * Extraído do server.js com reforço crítico de segurança:
 * - verificarToken (JWT autenticado obrigatório)
 * - withTenant (isolamento estrito multi-tenant: cada restaurante vê APENAS seus funcionários e vales)
 * - Sanitização e validação de valores monetários e limites
 * - Notificações em tempo real via Socket.io
 */

'use strict';

const { Router } = require('express');
const { getContext } = require('./shared/context');

function createRhRouter() {
  const router = Router();
  const { verificarToken, withTenant, getTenantDb, io } = getContext();
  const getDb = () => getTenantDb();

  // ─── ROTAS DE RH / EXTRATO & PAGAMENTO DE FOLHA ──────────────────────────

  // GET /api/rh/extrato/:id - Extrato de vales, consumo e dias atípicos para fechamento
  router.get('/extrato/:id', verificarToken, (req, res) => {
    const funcId = parseInt(req.params.id, 10);
    if (!funcId || funcId <= 0) return res.status(400).json({ success: false, error: 'ID de funcionário inválido' });

    withTenant(req, () => {
      const db = getDb();
      db.get("SELECT nome FROM funcionarios WHERE id = ?", [funcId], (errF, func) => {
        if (errF || !func) return res.status(404).json({ success: false, error: "Funcionário não encontrado" });

        const funcName = func.nome;
        db.all("SELECT id, valor, data_pedido, observacao FROM vales WHERE funcionario_id = ? AND status = 'Aprovado' AND pagamento_id IS NULL", [funcId], (errV, vales) => {
          db.all("SELECT id, total, productName, quantity, createdAt FROM pedidos WHERE status = 'Finalizado' AND paymentMethod = 'Fiado' AND pagamento_id IS NULL AND funcionario_id = ?", [funcId], (errP, fiados) => {
            const buscarFiados = (fiados && fiados.length > 0) ? Promise.resolve(fiados) : new Promise((resolve) => {
              db.all("SELECT id, total, productName, quantity, createdAt FROM pedidos WHERE status = 'Finalizado' AND paymentMethod = 'Fiado' AND pagamento_id IS NULL AND userName = ?", [funcName], (e, rows) => {
                resolve(rows || []);
              });
            });

            buscarFiados.then(fiadosLista => {
              db.all("SELECT id, data, valor, justificativa, forma_pagamento FROM dias_atipicos WHERE funcionario_id = ? AND status = 'aprovado' AND pagamento_id IS NULL", [funcId], (errD, atipicos) => {
                let totalVales = 0;
                (vales || []).forEach(v => totalVales += parseFloat(v.valor || 0));

                let totalConsumo = 0;
                (fiadosLista || []).forEach(f => {
                  let rawTotal = String(f.total || '0').replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
                  let val = parseFloat(rawTotal || 0);
                  if (!isNaN(val) && val > 0 && val < 100000) {
                    totalConsumo += val;
                  }
                });

                let totalAtipicos = 0;
                (atipicos || []).forEach(a => totalAtipicos += parseFloat(a.valor || 0));

                res.json({
                  success: true,
                  vales: vales || [],
                  fiados: fiadosLista || [],
                  atipicos: atipicos || [],
                  total_vales: totalVales,
                  total_consumo: totalConsumo,
                  total_dias_extras: totalAtipicos,
                  suggested_bruto: totalAtipicos
                });
              });
            });
          });
        });
      });
    });
  });

  // POST /api/rh/pagamentos - Registra pagamento de folha com baixa de vales e fiados
  router.post('/pagamentos', verificarToken, (req, res) => {
    const { funcionario_id, valor_bruto, total_vales_abatidos, total_consumo_abatido, valor_liquido, observacao, vales_ids, pedidos_ids } = req.body || {};
    const fId = parseInt(funcionario_id, 10);
    if (!fId || fId <= 0) return res.status(400).json({ success: false, error: 'Funcionário obrigatório' });

    const dataPagamento = new Date().toISOString();

    withTenant(req, () => {
      const db = getDb();
      db.run(
        `INSERT INTO funcionarios_pagamentos (funcionario_id, data_pagamento, valor_bruto, total_vales_abatidos, total_consumo_abatido, valor_liquido, observacao) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [fId, dataPagamento, parseFloat(valor_bruto) || 0, parseFloat(total_vales_abatidos) || 0, parseFloat(total_consumo_abatido) || 0, parseFloat(valor_liquido) || 0, String(observacao || '').slice(0, 500)],
        function (err) {
          if (err) return res.status(500).json({ success: false, error: "Erro ao registrar pagamento: " + err.message });

          const pagId = this.lastID;

          // Atualiza vales quitados
          if (Array.isArray(vales_ids) && vales_ids.length > 0) {
            const cleanVales = vales_ids.map(v => parseInt(v, 10)).filter(Boolean);
            if (cleanVales.length > 0) {
              db.run(`UPDATE vales SET pagamento_id = ? WHERE id IN (${cleanVales.map(() => '?').join(',')})`, [pagId, ...cleanVales]);
            }
          }

          // Atualiza pedidos fiados quitados
          if (Array.isArray(pedidos_ids) && pedidos_ids.length > 0) {
            const cleanPedidos = pedidos_ids.map(p => parseInt(p, 10)).filter(Boolean);
            if (cleanPedidos.length > 0) {
              db.run(`UPDATE pedidos SET pagamento_id = ? WHERE id IN (${cleanPedidos.map(() => '?').join(',')})`, [pagId, ...cleanPedidos]);
            }
          }

          if (io) {
            const room = 'restaurante_' + req.restaurante_id;
            io.to(room).emit('rh_update');
            db.get("SELECT nome FROM funcionarios WHERE id = ?", [fId], (errF, func) => {
              const nome = func ? func.nome : 'Colaborador';
              io.to(room).emit('pagamento_colaborador_celebracao', {
                funcionario_id: fId,
                funcionario_nome: nome,
                valor: valor_liquido || valor_bruto,
                data_pagamento: dataPagamento,
                observacao: observacao || '',
                pagamento_id: pagId
              });
            });
          }

          res.json({ success: true, pagamento_id: pagId });
        }
      );
    });
  });

  // ─── ROTAS DE COLABORADORES & ATALHOS ──────────────────────────────────

  // GET /api/funcionarios - Lista os colaboradores da loja (requer autenticação)
  router.get('/funcionarios', verificarToken, (req, res) => {
    withTenant(req, () => {
      const db = getDb();
      db.all(
        'SELECT id, nome, usuario, cargo, status, valor_hora, tipo_remuneracao, valor_dia, valor_semana, valor_mes, chave_pix, cpf, telefone, observacao_rh, data_cadastro, atalhos_config FROM funcionarios ORDER BY id DESC',
        [],
        (err, rows) => {
          if (err) return res.status(500).json({ success: false, error: err.message });
          res.json(rows || []);
        }
      );
    });
  });

  // POST /api/funcionarios - Cadastra novo colaborador
  router.post('/funcionarios', verificarToken, (req, res) => {
    const { nome, usuario, senha, cargo, valor_hora, tipo_remuneracao, valor_dia, valor_semana, valor_mes, chave_pix, cpf, telefone, observacao_rh } = req.body || {};
    if (!nome || !String(nome).trim()) return res.status(400).json({ success: false, error: 'Nome é obrigatório.' });

    withTenant(req, () => {
      const db = getDb();
      db.run(
        `INSERT INTO funcionarios (nome, usuario, senha, cargo, valor_hora, tipo_remuneracao, valor_dia, valor_semana, valor_mes, chave_pix, cpf, telefone, observacao_rh, data_cadastro)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
        [
          String(nome).trim().slice(0, 100),
          String(usuario || '').trim().slice(0, 50),
          senha || '1234',
          String(cargo || 'Atendente').slice(0, 50),
          Math.max(0, parseFloat(valor_hora) || 0),
          String(tipo_remuneracao || 'hora').slice(0, 20),
          Math.max(0, parseFloat(valor_dia) || 0),
          Math.max(0, parseFloat(valor_semana) || 0),
          Math.max(0, parseFloat(valor_mes) || 0),
          String(chave_pix || '').slice(0, 100),
          String(cpf || '').slice(0, 20),
          String(telefone || '').slice(0, 30),
          String(observacao_rh || '').slice(0, 500)
        ],
        function (err) {
          if (err) return res.status(500).json({ success: false, error: err.message });
          res.json({ success: true, id: this.lastID });
        }
      );
    });
  });

  // DELETE /api/funcionarios/:id - Exclui colaborador
  router.delete('/funcionarios/:id', verificarToken, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id || id <= 0) return res.status(400).json({ success: false, error: 'ID inválido' });

    withTenant(req, () => {
      const db = getDb();
      db.run('DELETE FROM funcionarios WHERE id = ?', [id], function (err) {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true });
      });
    });
  });

  // GET /api/funcionarios/:id/atalhos - Configuração de atalhos da comanda móvel
  router.get('/funcionarios/:id/atalhos', verificarToken, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id || id <= 0) return res.status(400).json({ success: false, error: 'ID inválido' });

    withTenant(req, () => {
      const db = getDb();
      db.get('SELECT id, nome, usuario, cargo, atalhos_config FROM funcionarios WHERE id = ?', [id], (err, row) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (!row) return res.status(404).json({ success: false, error: 'Funcionário não encontrado.' });

        db.get('SELECT valor FROM configuracoes WHERE chave = "garcom_atalhos"', [], (errCfg, cfgRow) => {
          let globalCfg = null;
          if (cfgRow && cfgRow.valor) {
            try { globalCfg = typeof cfgRow.valor === 'string' ? JSON.parse(cfgRow.valor) : cfgRow.valor; } catch (e) {}
          }
          let funcCfg = null;
          if (row.atalhos_config) {
            try { funcCfg = typeof row.atalhos_config === 'string' ? JSON.parse(row.atalhos_config) : row.atalhos_config; } catch (e) {}
          }
          res.json({
            id: row.id,
            nome: row.nome,
            cargo: row.cargo,
            config: funcCfg,
            global: globalCfg
          });
        });
      });
    });
  });

  // POST /api/funcionarios/:id/atalhos - Salva atalhos da comanda móvel
  router.post('/funcionarios/:id/atalhos', verificarToken, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id || id <= 0) return res.status(400).json({ success: false, error: 'ID inválido' });
    const { config } = req.body || {};
    const configVal = (config && typeof config === 'object') ? JSON.stringify(config) : null;

    withTenant(req, () => {
      const db = getDb();
      db.run('UPDATE funcionarios SET atalhos_config = ? WHERE id = ?', [configVal, id], function (err) {
        if (err) return res.status(500).json({ success: false, error: err.message });

        if (io) {
          io.to('restaurante_' + req.restaurante_id).emit('atalhos_config_atualizada', {
            funcionario_id: id,
            config: config
          });
        }

        res.json({ success: true, funcionario_id: id, config: config });
      });
    });
  });

  return router;
}

module.exports = { createRhRouter };
