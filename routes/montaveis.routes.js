/**
 * routes/montaveis.routes.js
 * Módulo de Itens Montáveis / Customizáveis (Hambúrgueres, Pizzas, Combos)
 * Extraído do server.js com preservação de todas as camadas de segurança:
 * - verificarToken (JWT válido)
 * - withTenant (isolamento estrito por restaurante)
 * - Validação e sanitização de parâmetros de entrada (IDs numéricos, pricing_model)
 * - Cascata segura de deleção e atualização relacional
 */

'use strict';

const { Router } = require('express');
const { getContext } = require('./shared/context');

function createMontaveisRouter() {
  const router = Router();
  const { verificarToken, withTenant, getTenantDb } = getContext();
  const getDb = () => getTenantDb();

  // Helper interno para inserção recursiva/segura de categorias e opções
  function insertCategorias(targetDb, montavelId, cats, done) {
    if (!cats || !cats.length) return done();
    let pending = cats.length;
    cats.forEach((cat, ci) => {
      targetDb.run(
        `INSERT INTO montavel_categorias (montavel_id, nome, obrigatoria, min_escolhas, max_escolhas, ordem) VALUES (?, ?, ?, ?, ?, ?)`,
        [montavelId, String(cat.nome || '').slice(0, 100), cat.obrigatoria ? 1 : 0, Math.max(0, parseInt(cat.min_escolhas, 10) || 0), Math.max(1, parseInt(cat.max_escolhas, 10) || 1), ci],
        function (err) {
          if (err || !cat.opcoes || !cat.opcoes.length) {
            if (--pending === 0) done();
            return;
          }
          const catId = this.lastID;
          let optPending = cat.opcoes.length;
          cat.opcoes.forEach((opt, oi) => {
            targetDb.run(
              `INSERT INTO montavel_opcoes (categoria_id, nome, preco, ativo, ordem, produto_id) VALUES (?, ?, ?, ?, ?, ?)`,
              [catId, String(opt.nome || '').slice(0, 100), Number(opt.preco) || 0, opt.ativo !== undefined ? (opt.ativo ? 1 : 0) : 1, oi, opt.produto_id ? parseInt(opt.produto_id, 10) : null],
              () => {
                if (--optPending === 0 && --pending === 0) done();
              }
            );
          });
        }
      );
    });
  }

  // Helper para resolver opções vinculadas a produtos reais no estoque
  function resolverOpcoesVinculadas(targetDb, opts, done) {
    const lista = opts || [];
    const comVinculo = lista.filter(o => o.produto_id);
    if (!comVinculo.length) return done(lista);
    targetDb.all(`SELECT id, nome, preco, emoji, visibilidade FROM produtos`, [], (eP, prods) => {
      if (eP) return done(lista);
      const mapa = {};
      (prods || []).forEach(p => { mapa[p.id] = p; });
      lista.forEach(o => {
        if (o.produto_id && mapa[o.produto_id]) {
          o.nome = mapa[o.produto_id].nome;
          o.preco = Number(mapa[o.produto_id].preco) || 0;
          o.emoji_vinculado = mapa[o.produto_id].emoji || null;
          o.vinculado = true;
        } else if (o.produto_id) {
          o.vinculo_quebrado = true;
        }
      });
      done(lista);
    });
  }

  // GET /api/montaveis - Lista todos os itens montáveis configurados
  router.get('/', verificarToken, (req, res) => {
    withTenant(req, () => {
      const db = getDb();
      db.all(
        `SELECT m.*, p.nome AS produto_nome, p.emoji AS produto_emoji
         FROM itens_montaveis m LEFT JOIN produtos p ON m.produto_id = p.id
         WHERE m.ativo = 1 ORDER BY m.id DESC`,
        [],
        (err, rows) => {
          if (err) return res.status(500).json({ success: false, error: err.message });
          res.json(rows || []);
        }
      );
    });
  });

  // GET /api/montaveis/produto/:produtoId - Busca montável vinculado a um produto específico
  router.get('/produto/:produtoId', verificarToken, (req, res) => {
    const pid = parseInt(req.params.produtoId, 10);
    if (!pid || pid <= 0) return res.status(400).json({ success: false, error: 'ID do produto inválido' });

    withTenant(req, () => {
      const db = getDb();
      db.get(`SELECT * FROM itens_montaveis WHERE produto_id = ? AND ativo = 1`, [pid], (eM, mRow) => {
        if (eM || !mRow) return res.json(null);
        const mid = mRow.id;
        db.all(`SELECT * FROM montavel_categorias WHERE montavel_id = ? ORDER BY ordem, id`, [mid], (eC, cats) => {
          const catList = cats || [];
          if (catList.length === 0) return res.json({ ...mRow, categorias: [] });
          const catIds = catList.map(c => c.id);
          const ph = catIds.map(() => '?').join(',');
          db.all(`SELECT * FROM montavel_opcoes WHERE categoria_id IN (${ph}) AND ativo = 1 ORDER BY ordem, id`, catIds, (eO, opts) => {
            resolverOpcoesVinculadas(db, opts || [], (allOpts) => {
              catList.forEach(cat => {
                cat.opcoes = allOpts.filter(o => o.categoria_id === cat.id);
              });
              res.json({ ...mRow, categorias: catList });
            });
          });
        });
      });
    });
  });

  // GET /api/montaveis/:id - Detalhes de um montável específico por ID
  router.get('/:id', verificarToken, (req, res) => {
    const mid = parseInt(req.params.id, 10);
    if (!mid || mid <= 0) return res.status(400).json({ success: false, error: 'ID inválido' });

    withTenant(req, () => {
      const db = getDb();
      db.get(`SELECT m.*, p.nome AS produto_nome FROM itens_montaveis m LEFT JOIN produtos p ON m.produto_id = p.id WHERE m.id = ?`, [mid], (eM, mRow) => {
        if (eM || !mRow) return res.status(404).json({ success: false, error: 'Item não encontrado' });
        db.all(`SELECT * FROM montavel_categorias WHERE montavel_id = ? ORDER BY ordem, id`, [mid], (eC, cats) => {
          const catList = cats || [];
          if (catList.length === 0) return res.json({ ...mRow, categorias: [] });
          const catIds = catList.map(c => c.id);
          const ph = catIds.map(() => '?').join(',');
          db.all(`SELECT * FROM montavel_opcoes WHERE categoria_id IN (${ph}) ORDER BY ordem, id`, catIds, (eO, opts) => {
            const allOpts = opts || [];
            catList.forEach(cat => {
              cat.opcoes = allOpts.filter(o => o.categoria_id === cat.id);
            });
            res.json({ ...mRow, categorias: catList });
          });
        });
      });
    });
  });

  // POST /api/montaveis - Criar nova configuração de montável
  router.post('/', verificarToken, (req, res) => {
    const { produto_id, pricing_model, preco_fixo, categorias } = req.body || {};
    const pid = parseInt(produto_id, 10);
    if (!pid || pid <= 0) return res.status(400).json({ success: false, error: 'produto_id obrigatório e válido' });

    withTenant(req, () => {
      const db = getDb();
      db.run(
        `INSERT INTO itens_montaveis (produto_id, pricing_model, preco_fixo) VALUES (?, ?, ?)`,
        [pid, String(pricing_model || 'soma').slice(0, 30), Math.max(0, parseFloat(preco_fixo) || 0)],
        function (err) {
          if (err) return res.status(500).json({ success: false, error: err.message });
          const mid = this.lastID;
          insertCategorias(db, mid, categorias || [], () => {
            res.json({ success: true, id: mid });
          });
        }
      );
    });
  });

  // PUT /api/montaveis/:id - Atualizar configuração existente
  router.put('/:id', verificarToken, (req, res) => {
    const mid = parseInt(req.params.id, 10);
    if (!mid || mid <= 0) return res.status(400).json({ success: false, error: 'ID inválido' });
    const { produto_id, pricing_model, preco_fixo, categorias } = req.body || {};

    withTenant(req, () => {
      const db = getDb();
      db.run(
        `UPDATE itens_montaveis SET produto_id = ?, pricing_model = ?, preco_fixo = ? WHERE id = ?`,
        [parseInt(produto_id, 10) || null, String(pricing_model || 'soma').slice(0, 30), Math.max(0, parseFloat(preco_fixo) || 0), mid],
        (err) => {
          if (err) return res.status(500).json({ success: false, error: err.message });
          db.run(`DELETE FROM montavel_opcoes WHERE categoria_id IN (SELECT id FROM montavel_categorias WHERE montavel_id = ?)`, [mid], () => {
            db.run(`DELETE FROM montavel_categorias WHERE montavel_id = ?`, [mid], () => {
              insertCategorias(db, mid, categorias || [], () => {
                res.json({ success: true });
              });
            });
          });
        }
      );
    });
  });

  // DELETE /api/montaveis/:id - Remover configuração
  router.delete('/:id', verificarToken, (req, res) => {
    const mid = parseInt(req.params.id, 10);
    if (!mid || mid <= 0) return res.status(400).json({ success: false, error: 'ID inválido' });

    withTenant(req, () => {
      const db = getDb();
      db.run(`DELETE FROM montavel_opcoes WHERE categoria_id IN (SELECT id FROM montavel_categorias WHERE montavel_id = ?)`, [mid], () => {
        db.run(`DELETE FROM montavel_categorias WHERE montavel_id = ?`, [mid], () => {
          db.run(`DELETE FROM itens_montaveis WHERE id = ?`, [mid], (err) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true });
          });
        });
      });
    });
  });

  return router;
}

module.exports = { createMontaveisRouter };
