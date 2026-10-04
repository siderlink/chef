'use strict';

const express = require('express');
const { getContext } = require('./shared/context');

/**
 * Cria o roteador para a API de Comandas (V2)
 */
function createComandasRouter() {
  const router = express.Router();
  const getDb = () => {
    const ctx = getContext();
    return typeof ctx.getTenantDb === 'function' ? ctx.getTenantDb() : ctx.db;
  };

  // Buscar todas as comandas ativas com seus itens e pagamentos aninhados
  router.get('/', (req, res) => {
    const db = getDb();
    
    let query = `SELECT * FROM comandas WHERE status NOT IN ('Fechada', 'Cancelada')`;
    let params = [];
    
    if (req.query.mesa) {
      query += ` AND mesa = ?`;
      params.push(req.query.mesa);
    }
    query += ` ORDER BY criado_em ASC`;

    db.all(query, params, (err, comandas) => {
      if (err) return res.status(500).json({ error: 'Erro ao buscar comandas' });
      if (!comandas || comandas.length === 0) return res.json([]);

      const comandasIds = comandas.map(c => c.id);
      const placeholders = comandasIds.map(() => '?').join(',');

      db.all(`SELECT * FROM comandas_itens WHERE comanda_id IN (${placeholders}) ORDER BY criado_em ASC`, comandasIds, (errItens, itens) => {
        if (errItens) return res.status(500).json({ error: 'Erro ao buscar itens' });

        db.all(`SELECT * FROM comandas_pagamentos WHERE comanda_id IN (${placeholders}) ORDER BY data_pagamento ASC`, comandasIds, (errPagtos, pagamentos) => {
          if (errPagtos) return res.status(500).json({ error: 'Erro ao buscar pagamentos' });

          const result = comandas.map(comanda => ({
            ...comanda,
            itens: (itens || []).filter(i => i.comanda_id === comanda.id),
            pagamentos: (pagamentos || []).filter(p => p.comanda_id === comanda.id)
          }));

          res.json(result);
        });
      });
    });
  });

  // Obter detalhes de uma comanda específica
  router.get('/:id', (req, res) => {
    const db = getDb();
    const id = req.params.id;

    db.get(`SELECT * FROM comandas WHERE id = ?`, [id], (err, comanda) => {
      if (err) return res.status(500).json({ error: 'Erro ao buscar comanda' });
      if (!comanda) return res.status(404).json({ error: 'Comanda não encontrada' });

      db.all(`SELECT * FROM comandas_itens WHERE comanda_id = ? ORDER BY criado_em ASC`, [id], (errItens, itens) => {
        db.all(`SELECT * FROM comandas_pagamentos WHERE comanda_id = ? ORDER BY data_pagamento ASC`, [id], (errPagtos, pagamentos) => {
          res.json({
            ...comanda,
            itens: itens || [],
            pagamentos: pagamentos || []
          });
        });
      });
    });
  });

  return router;
}

module.exports = { createComandasRouter };
