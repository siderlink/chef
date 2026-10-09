/**
 * routes/produtos.routes.js
 * Módulo de Gestão, Catálogo e Importação de Produtos
 * Extraído e modularizado do server.js com reforço de segurança multi-tenant.
 *
 * Rotas:
 *   GET  /api/produtos               — Lista produtos para PDV, comanda e web
 *   GET  /api/template-produtos      — Download do template XLSX de importação
 *   POST /api/importar-produtos      — Importação em lote de produtos via XLSX
 */
'use strict';

const express = require('express');
const { Router } = express;
const fs = require('fs');
const XLSX = require('xlsx');
const { getContext } = require('./shared/context');

function createProdutosRouter() {
  const router = Router();
  const { verificarToken, withTenant, upload, io } = getContext();
  const getDb = () => getContext().getTenantDb();

  /**
   * Dispara atualização de produtos para clientes conectados na room do restaurante
   */
  function emitProdutosAtualizados(req) {
    if (!io) return;
    const restId = req.restaurante_id || (req.user && req.user.restaurante_id) || 1;
    io.to('restaurante_' + restId).emit('produtos_atualizados');
  }

  // ── GET / — Lista produtos cadastrados no tenant ativo ──────────────────────
  router.get('/', (req, res) => {
    withTenant(req, () => {
      const db = getDb();
      db.all(
        'SELECT id, nome as name, preco as price, categoria as category, emoji, setor, status, visibilidade FROM produtos WHERE status != "inativo" ORDER BY categoria ASC, nome ASC',
        [],
        (err, rows) => {
          if (err) {
            // Fallback resiliente para schemas simplificados
            db.all('SELECT id, nome as name, preco as price, categoria as category, emoji FROM produtos ORDER BY id DESC', [], (errFallback, fallbackRows) => {
              if (errFallback) return res.status(500).json({ success: false, error: 'Erro ao consultar produtos' });
              return res.json(fallbackRows || []);
            });
            return;
          }
          res.json(rows || []);
        }
      );
    });
  });

  // ── GET /template — Download da planilha modelo para importação ─────────────
  router.get('/template', (req, res) => {
    try {
      const headers = ['Categoria', 'Nome', 'Preço', 'Emoji', 'Setor', 'Status Inicial', 'Categoria Fiscal', 'Código de Barras', 'Descrição', 'Preço Custo', 'Unidade', 'Fornecedor', 'Visibilidade'];
      const exemplos = [
        ['Lanches', 'X-Burger', '28.90', '🍔', 'Cozinha 1', 'Em preparo', 'Alimentacao', '', 'Hamburger artesanal', '12.50', 'UN', '', 'todos'],
        ['Bebidas', 'Coca-Cola Lata', '8.00', '🥤', 'Bar', 'Em espera', 'Bebida_Nao_Alcoolica', '7891234567890', 'Refrigerante 350ml', '3.20', 'UN', 'Coca-Cola', 'todos'],
        ['Sobremesas', 'Pudim', '12.00', '🍮', 'Cozinha 1', 'Em preparo', 'Alimentacao', '', 'Pudim de leite', '4.00', 'UN', '', 'todos'],
      ];
      const sheetData = [headers, ...exemplos];
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      ws['!cols'] = headers.map(() => ({ wch: 20 }));
      XLSX.utils.book_append_sheet(wb, ws, 'Produtos');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Disposition', 'attachment; filename=template-produtos.xlsx');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(Buffer.from(buf));
    } catch (err) {
      res.status(500).json({ success: false, error: 'Erro ao gerar modelo de planilha' });
    }
  });

  // ── POST /importar — Importa produtos a partir de arquivo XLSX enviado ───────
  const uploadMiddleware = upload && typeof upload.single === 'function' ? upload.single('file') : (req, res, next) => next();

  router.post('/importar', verificarToken, uploadMiddleware, (req, res) => {
    if (!req.file) {
      return res.status(400).json({ ok: false, erro: 'Nenhum arquivo enviado.' });
    }

    const filePath = req.file.path;

    const cleanupFile = () => {
      try {
        if (filePath && fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (e) {
        console.warn('[produtos] Não foi possível remover arquivo temporário:', e.message);
      }
    };

    try {
      const wb = XLSX.readFile(filePath);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (!rows.length) {
        cleanupFile();
        return res.json({ ok: false, erro: 'Planilha vazia ou formato inválido.' });
      }

      const COL_MAP = {
        'categoria': 'categoria', 'nome': 'nome', 'preço': 'preco', 'preco': 'preco',
        'emoji': 'emoji', 'setor': 'setor', 'status inicial': 'status_inicial', 'status_inicial': 'status_inicial',
        'categoria fiscal': 'categoria_fiscal', 'categoria_fiscal': 'categoria_fiscal',
        'código de barras': 'codigo_barras', 'codigo_barras': 'codigo_barras',
        'descrição': 'descricao', 'descricao': 'descricao',
        'preço custo': 'preco_custo', 'preco_custo': 'preco_custo',
        'unidade': 'unidade', 'fornecedor': 'fornecedor', 'visibilidade': 'visibilidade'
      };

      const mapped = rows.map(r => {
        const out = {};
        Object.keys(r).forEach(k => {
          const key = COL_MAP[k.toLowerCase().trim()];
          if (key) out[key] = r[k];
        });
        return out;
      }).filter(r => r.nome && String(r.nome).trim());

      if (!mapped.length) {
        cleanupFile();
        return res.json({ ok: false, erro: 'Nenhum produto com nome encontrado na planilha.' });
      }

      withTenant(req, () => {
        const db = getDb();
        let inseridos = 0;
        let erros = 0;

        const insertNext = (i) => {
          if (i >= mapped.length) {
            cleanupFile();
            emitProdutosAtualizados(req);
            return res.json({ ok: true, inseridos, erros, total: mapped.length });
          }

          const p = mapped[i];
          const nome = String(p.nome || '').trim().slice(0, 150);
          const categoria = String(p.categoria || 'Sem Categoria').trim().slice(0, 80);
          const preco = Math.max(0, parseFloat(String(p.preco || '0').replace(',', '.')) || 0);
          const emoji = String(p.emoji || '').trim().slice(0, 10);
          const setor = String(p.setor || 'Cozinha 1').trim().slice(0, 50);
          const status_inicial = String(p.status_inicial || 'Em espera').trim().slice(0, 50);
          const categoria_fiscal = String(p.categoria_fiscal || 'Alimentacao').trim().slice(0, 50);
          const codigo_barras = String(p.codigo_barras || '').trim().slice(0, 60) || null;
          const descricao = String(p.descricao || '').trim().slice(0, 500);
          const preco_custo = Math.max(0, parseFloat(String(p.preco_custo || '0').replace(',', '.')) || 0);
          const unidade = String(p.unidade || 'UN').trim().slice(0, 10);
          const fornecedor = String(p.fornecedor || '').trim().slice(0, 100) || null;
          const visibilidade = String(p.visibilidade || 'todos').trim().slice(0, 30);

          db.run(
            `INSERT INTO produtos (categoria, nome, preco, emoji, hasAddons, setor, status_inicial, status, categoria_fiscal, descricao, codigo_barras, preco_custo, unidade, fornecedor, visibilidade) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [categoria, nome, preco, emoji, 0, setor, status_inicial, 'ativo', categoria_fiscal, descricao, codigo_barras, preco_custo, unidade, fornecedor, visibilidade],
            (err) => {
              if (err) {
                erros++;
              } else {
                inseridos++;
              }
              insertNext(i + 1);
            }
          );
        };

        insertNext(0);
      });
    } catch (e) {
      cleanupFile();
      return res.status(500).json({ ok: false, erro: 'Erro ao processar arquivo: ' + e.message });
    }
  });

  return router;
}

module.exports = { createProdutosRouter };
