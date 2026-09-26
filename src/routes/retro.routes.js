const express = require('express');
const router = express.Router();

module.exports = function (appContext) {
  const { db, masterDb, withTenant, resolveTenantId, io, licenseManager, verificarSenhaFuncionario, funcionarioPublico } = appContext;

  router.get('/api/retro/mesas', (req, res) => {
    withTenant(req, () => {
      db.all("SELECT * FROM mesas", (err, mesas) => {
        if (err) return res.status(500).json({ error: 'Erro no banco' });
        db.all("SELECT * FROM pedidos WHERE status != 'Finalizado' ORDER BY createdAt ASC", (err, pedidos) => {
          if (err) return res.status(500).json({ error: 'Erro no banco' });
          res.json({ mesas: mesas || [], pedidos: pedidos || [] });
        });
      });
    });
  });

  router.get('/api/retro/cardapio', (req, res) => {
    withTenant(req, () => {
      db.all("SELECT * FROM produtos WHERE LOWER(status) != 'inativo' OR status IS NULL", (err, produtos) => {
        if (err) return res.status(500).json({ error: 'Erro no banco' });
        res.json({ produtos: produtos || [] });
      });
    });
  });

  router.post('/api/retro/pedido', (req, res) => {
    if (licenseManager.isRestricted()) {
      return res.status(403).json({ error: 'Sistema em modo restrito. Ative a licença.' });
    }
    const pedido = req.body;
    if (!pedido || !pedido.mesa_comanda) return res.status(400).json({ error: 'Dados inválidos' });
    const tid = resolveTenantId(req);
    const roomId = (Number.isFinite(tid) && tid > 0) ? `restaurante_${tid}` : null;

    let status = pedido.status_inicial || 'Em preparo';

    withTenant(req, () => {
      db.get(`SELECT status FROM mesas WHERE nome = ?`, [pedido.mesa_comanda], (err, rowMesa) => {
        if (rowMesa && rowMesa.status !== 'Fechando') {
          db.run(`UPDATE mesas SET status = 'Ocupada' WHERE nome = ? AND status = 'Disponível'`, [pedido.mesa_comanda]);
        }
      });

      const query = `
        INSERT INTO pedidos (
          userName, localName, productName, quantity, options, observations, composicoes,
          status, mesa_comanda, mesa_grupo, isCommand,
          printer, sector, total,
          cliente_id, is_delivery
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const params = [
        pedido.userName || 'Garçom Retro',
        pedido.localName || pedido.mesa_comanda,
        pedido.productName,
        pedido.quantity || 1,
        pedido.options || '[]',
        pedido.observations || '',
        JSON.stringify(pedido.composicoes || []),
        status,
        pedido.mesa_comanda,
        pedido.mesa_grupo || pedido.mesa_comanda,
        pedido.isCommand || 0,
        pedido.printer || '',
        pedido.sector || '',
        pedido.total || 0,
        pedido.cliente_id || null,
        pedido.is_delivery || 0
      ];

      db.run(query, params, function (err) {
        if (err) {
          console.error('Erro /api/retro/pedido:', err);
          return res.status(500).json({ error: 'Erro ao inserir pedido' });
        }
        const novoId = this.lastID;
        const novoItem = { id: novoId, ...pedido, status, createdAt: new Date().toISOString() };

        if (roomId) io.to(roomId).emit('novo_pedido_sync', [novoItem]);
        else io.emit('novo_pedido_sync', [novoItem]);

        db.all("SELECT * FROM mesas", (e, m) => {
          if (!e) {
            if (roomId) io.to(roomId).emit('mesas_atualizadas', m || []);
            else io.emit('mesas_atualizadas', m || []);
          }
        });

        res.json({ success: true, id: novoId });
      });
    });
  });

  router.post('/api/retro/login', (req, res) => {
    const { usuario, senha } = req.body;
    const u = String(usuario || '').trim();
    withTenant(req, () => {
      db.get("SELECT * FROM funcionarios WHERE LOWER(TRIM(usuario)) = LOWER(TRIM(?)) OR LOWER(TRIM(nome)) = LOWER(TRIM(?))", [u, u], (err, row) => {
        if (err) return res.status(500).json({ error: 'Erro ao consultar banco.' });
        if (!row) return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
        verificarSenhaFuncionario(row, senha).then((ok) => {
          if (!ok) return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
          if (row.status !== 'Ativo') return res.status(403).json({ error: 'Funcionário pendente ou inativo.' });
          res.json({ ok: true, funcionario: funcionarioPublico(row) });
        });
      });
    });
  });

  router.put('/api/retro/pedido/:id/status', (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Status obrigatório.' });
    const validos = ['Recebido', 'Em preparo', 'Pronto', 'Entregue', 'Finalizado'];
    if (!validos.includes(status)) return res.status(400).json({ error: 'Status inválido.' });
    const tid = resolveTenantId(req);
    const roomId = (Number.isFinite(tid) && tid > 0) ? `restaurante_${tid}` : null;

    withTenant(req, () => {
      db.run(`UPDATE pedidos SET status = ?, garcom_call = NULL WHERE id = ?`, [status, id], function (err) {
        if (err) return res.status(500).json({ error: 'Erro ao atualizar pedido.' });
        if (this.changes === 0) return res.status(404).json({ error: 'Pedido não encontrado.' });

        if (roomId) io.to(roomId).emit('pedido_atualizado', { id: Number(id), status });
        else io.emit('pedido_atualizado', { id: Number(id), status });

        db.all("SELECT * FROM mesas", (e, m) => {
          if (!e) {
            if (roomId) io.to(roomId).emit('mesas_atualizadas', m || []);
            else io.emit('mesas_atualizadas', m || []);
          }
        });

        res.json({ success: true });
      });
    });
  });

  router.post('/api/retro/cobranca', (req, res) => {
    const { mesaNome, metodo, valor, gorjeta, garcom } = req.body;
    if (!mesaNome || !metodo || valor === undefined) {
      return res.status(400).json({ error: 'mesaNome, metodo e valor são obrigatórios.' });
    }
    const valorNumerico = parseFloat(String(valor).replace(',', '.'));
    if (isNaN(valorNumerico) || valorNumerico <= 0) {
      return res.status(400).json({ error: 'Valor inválido.' });
    }

    const tid = resolveTenantId(req);
    const roomId = (Number.isFinite(tid) && tid > 0) ? `restaurante_${tid}` : null;

    withTenant(req, () => {
      db.get(`SELECT * FROM turnos_caixa WHERE status = 'Aberto' ORDER BY id DESC LIMIT 1`, [], (errTurno, turno) => {
        if (errTurno || !turno) {
          return res.status(400).json({ error: 'O caixa está fechado! Abra o caixa antes de receber pagamentos.' });
        }

        db.all(`SELECT * FROM pedidos WHERE (localName = ? OR mesa_grupo = ? OR mesa_comanda = ?) AND status != 'Finalizado'`, [mesaNome, mesaNome, mesaNome], (errItems, rows) => {
          if (errItems) return res.status(500).json({ error: 'Erro ao buscar itens da mesa.' });
          const items = rows || [];

          let consumoBruto = 0;
          let jaPago = 0;
          items.forEach(r => {
            const v = parseFloat(String(r.total).replace(',', '.')) || 0;
            if (v >= 0) {
              consumoBruto += v;
            } else if (r.productName && (String(r.productName).indexOf('Pgto Parcial') !== -1 || String(r.productName).indexOf('Pagamento') !== -1)) {
              jaPago += Math.abs(v);
            }
          });

          db.get(`SELECT valor FROM configuracoes_global WHERE chave = 'taxa_servico'`, [], (errTaxa, taxaRow) => {
            const taxaPct = (errTaxa || !taxaRow) ? 10 : (parseFloat(taxaRow.valor) || 10);
            const totalComTaxa = Math.max(0, consumoBruto * (1 + taxaPct / 100) - jaPago);

            if (valorNumerico < totalComTaxa - 0.05 && totalComTaxa > 0.01) {
              return res.status(400).json({ error: `Valor insuficiente. Total a pagar: R$ ${totalComTaxa.toFixed(2)}` });
            }

            db.run(`UPDATE pedidos SET status = 'Finalizado', paymentMethod = ?, turno_id = ?, finalizadoEm = datetime('now') WHERE (localName = ? OR mesa_grupo = ? OR mesa_comanda = ?) AND status != 'Finalizado'`, [metodo, turno.id, mesaNome, mesaNome, mesaNome], function (err) {
              if (err) return res.status(500).json({ error: 'Erro ao finalizar pedidos.' });

              db.run(
                `INSERT INTO movimentacoes (turno_id, tipo, valor, forma_pagamento, descricao, data) VALUES (?, 'Entrada', ?, ?, ?, datetime('now', 'localtime'))`,
                [turno.id, valorNumerico, metodo, `Pgto Mesa: ${mesaNome}${garcom ? ' (Garçom: ' + garcom + ')' : ''}`]
              );

              const gorjetaNum = parseFloat(String(gorjeta || '0').replace(',', '.'));
              if (gorjetaNum > 0) {
                db.run(
                  `INSERT INTO movimentacoes (turno_id, tipo, valor, forma_pagamento, descricao, data) VALUES (?, 'Entrada', ?, ?, ?, datetime('now', 'localtime'))`,
                  [turno.id, gorjetaNum, metodo, `Gorjeta: ${mesaNome}`]
                );
              }

              db.run(`UPDATE mesas SET status = 'Disponível' WHERE nome = ?`, [mesaNome], function (err2) {
                if (err2) return res.status(500).json({ error: 'Erro ao atualizar mesa.' });

                if (roomId) io.to(roomId).emit('mesas_atualizadas');
                else io.emit('mesas_atualizadas');
                if (roomId) io.to(roomId).emit('mesa_finalizada', { mesaName: mesaNome });
                else io.emit('mesa_finalizada', { mesaName: mesaNome });

                setTimeout(() => io.emit('atualizacao_caixa'), 300);

                res.json({ success: true, message: 'Cobrança registrada com sucesso!' });
              });
            });
          });
        });
      });
    });
  });

  router.get('/api/retro/taxa-servico', (req, res) => {
    const lerTaxa = (cb) => {
      masterDb.get("SELECT valor FROM configuracoes_global WHERE chave = 'taxa_servico'", [], (err, row) => {
        if (err || !row) return cb(10);
        const taxa = parseFloat(row.valor);
        cb(isNaN(taxa) ? 10 : taxa);
      });
    };
    lerTaxa((taxa) => {
      res.json({ taxa_servico: taxa });
    });
  });

  return router;
};
