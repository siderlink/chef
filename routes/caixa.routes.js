/**
 * routes/caixa.routes.js
 * Módulo de Caixa extraído do server.js (linhas 13100–13517)
 *
 * Rotas:
 *   GET  /api/mesas
 *   GET  /api/caixa/estado
 *   POST /api/caixa/abrir
 *   POST /api/caixa/fechar
 *   GET  /api/caixa/leitura-x
 *   GET  /api/caixa/extrato-fechamento/:id
 *   POST /api/caixa/sangria
 *   POST /api/caixa/suprimento
 *   GET  /api/caixa/turnos
 */

'use strict';

const { Router } = require('express');
const { getContext } = require('./shared/context');

// ── Funções de negócio puras (sem dependência de app/io) ─────────────────

/**
 * Calcula os totais de um turno de caixa.
 * @param {Object} targetDb - instância do banco (tenant)
 * @param {Object} turno    - linha do turno_caixa
 * @param {Function} callback - (err, totais)
 */
function calcularTotaisTurno(targetDb, turno, callback) {
  if (!turno) return callback(new Error('Turno não fornecido'));
  const dataAbertura = turno.data_abertura || '1970-01-01 00:00:00';
  const dataFechamento = turno.data_fechamento || null;

  const queryPedidos = dataFechamento
    ? `SELECT LOWER(COALESCE(paymentMethod,'outros')) as forma, COUNT(id) as qtd, SUM(COALESCE(total,0)) as total
       FROM pedidos WHERE (turno_id = ? OR (createdAt >= ? AND createdAt <= ?)) GROUP BY forma`
    : `SELECT LOWER(COALESCE(paymentMethod,'outros')) as forma, COUNT(id) as qtd, SUM(COALESCE(total,0)) as total
       FROM pedidos WHERE (turno_id = ? OR createdAt >= ?) GROUP BY forma`;

  const paramsPedidos = dataFechamento
    ? [turno.id, dataAbertura, dataFechamento]
    : [turno.id, dataAbertura];

  targetDb.all(queryPedidos, paramsPedidos, (errPed, rowsPed) => {
    let totalDinheiro = 0, totalCredito = 0, totalDebito = 0, totalPix = 0, totalOutros = 0, totalVendas = 0, totalItensPedidos = 0;
    (rowsPed || []).forEach(r => {
      const f = (r.forma || '').toLowerCase();
      const val = parseFloat(r.total) || 0;
      totalVendas += val;
      totalItensPedidos += r.qtd;
      if (f.includes('dinheiro'))                                totalDinheiro += val;
      else if (f.includes('credito') || f.includes('crédito'))  totalCredito  += val;
      else if (f.includes('debito')  || f.includes('débito'))   totalDebito   += val;
      else if (f.includes('pix'))                                totalPix      += val;
      else                                                       totalOutros   += val;
    });

    const queryMov = dataFechamento
      ? `SELECT tipo, SUM(valor) as total, COUNT(id) as qtd FROM movimentacoes WHERE (turno_id = ? OR (data >= ? AND data <= ?)) GROUP BY tipo`
      : `SELECT tipo, SUM(valor) as total, COUNT(id) as qtd FROM movimentacoes WHERE (turno_id = ? OR data >= ?) GROUP BY tipo`;

    const paramsMov = dataFechamento ? [turno.id, dataAbertura, dataFechamento] : [turno.id, dataAbertura];

    targetDb.all(queryMov, paramsMov, (errMov, rowsMov) => {
      let totalSangrias = 0, totalSuprimentos = 0;
      (rowsMov || []).forEach(m => {
        const t = (m.tipo || '').toLowerCase();
        const v = parseFloat(m.total) || 0;
        if (t === 'sangria'  || t === 'saida')                          totalSangrias    += v;
        if (t === 'suprimento' || t === 'aporte' || t === 'reforco')    totalSuprimentos += v;
      });

      const fundoTroco = parseFloat(turno.fundo_troco) || 0;
      callback(null, {
        turno_id: turno.id,
        fundo_troco: fundoTroco,
        total_vendas:                parseFloat(totalVendas.toFixed(2)),
        total_dinheiro:              parseFloat(totalDinheiro.toFixed(2)),
        total_credito:               parseFloat(totalCredito.toFixed(2)),
        total_debito:                parseFloat(totalDebito.toFixed(2)),
        total_pix:                   parseFloat(totalPix.toFixed(2)),
        total_outros:                parseFloat(totalOutros.toFixed(2)),
        total_sangrias:              parseFloat(totalSangrias.toFixed(2)),
        total_suprimentos:           parseFloat(totalSuprimentos.toFixed(2)),
        saldo_esperado_dinheiro:     parseFloat((fundoTroco + totalDinheiro + totalSuprimentos - totalSangrias).toFixed(2)),
        pedidos_atendidos:           totalItensPedidos
      });
    });
  });
}

/**
 * Gera o HTML do extrato de fechamento (Relatório X ou Z).
 */
function gerarExtratoFechamentoHTML(turno, totais, tipoRelatorio = 'Z') {
  const agora = new Date().toLocaleString('pt-BR');
  const quebra = parseFloat(turno.diferenca_quebra || 0);
  const statusQuebra = Math.abs(quebra) < 0.01
    ? '✅ EXATO (R$ 0,00)'
    : (quebra > 0 ? `🟢 SOBRA (+R$ ${quebra.toFixed(2)})` : `🔴 FALTA (-R$ ${Math.abs(quebra).toFixed(2)})`);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Relatório ${tipoRelatorio} - ${tipoRelatorio === 'Z' ? 'Fechamento de Caixa' : 'Leitura X'}</title>
  <style>
    body { font-family: 'Courier New', monospace; font-size: 12px; width: 310px; margin: 0 auto; padding: 12px; color: #000; }
    .center { text-align: center; } .right { text-align: right; } .bold { font-weight: bold; }
    .divider { border-bottom: 1px dashed #000; margin: 8px 0; }
    .double-divider { border-bottom: 2px solid #000; margin: 8px 0; }
    .flex { display: flex; justify-content: space-between; }
    @media print { body { width: 100%; margin: 0; padding: 0; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="center bold" style="font-size:15px;">CHEF COZINHA GOURMET</div>
  <div class="center">SISTEMA INTELIGENTE DE GESTÃO</div>
  <div class="divider"></div>
  <div class="center bold">RELATÓRIO ${tipoRelatorio} — ${tipoRelatorio === 'Z' ? 'FECHAMENTO DE TURNO' : 'LEITURA X (PARCIAL)'}</div>
  <div class="center">Turno #${turno.id} • Status: ${turno.status || 'Fechado'}</div>
  <div class="divider"></div>
  <div><strong>Abertura:</strong> ${turno.data_abertura || '--'}</div>
  <div><strong>Fechamento:</strong> ${turno.data_fechamento || agora}</div>
  <div><strong>Operador Abertura:</strong> ${turno.operador_abertura || 'Caixa'}</div>
  <div><strong>Operador Fechamento:</strong> ${turno.operador_fechamento || 'Caixa'}</div>
  <div class="double-divider"></div>
  <div class="bold" style="margin-bottom:4px;">RESUMO DE VENDAS NO TURNO:</div>
  <div class="flex"><span>Fundo de Troco (Abertura):</span> <span>R$ ${(totais.fundo_troco||0).toFixed(2)}</span></div>
  <div class="flex"><span>Vendas Dinheiro:</span>        <span>R$ ${(totais.total_dinheiro||0).toFixed(2)}</span></div>
  <div class="flex"><span>Vendas Cartão Crédito:</span>  <span>R$ ${(totais.total_credito||0).toFixed(2)}</span></div>
  <div class="flex"><span>Vendas Cartão Débito:</span>   <span>R$ ${(totais.total_debito||0).toFixed(2)}</span></div>
  <div class="flex"><span>Vendas PIX:</span>             <span>R$ ${(totais.total_pix||0).toFixed(2)}</span></div>
  <div class="flex"><span>Outros Meios:</span>           <span>R$ ${(totais.total_outros||0).toFixed(2)}</span></div>
  <div class="divider"></div>
  <div class="flex bold" style="font-size:13px;"><span>TOTAL VENDIDO:</span> <span>R$ ${(totais.total_vendas||0).toFixed(2)}</span></div>
  <div class="divider"></div>
  <div class="bold" style="margin-bottom:4px;">MOVIMENTAÇÕES DE GAVETA:</div>
  <div class="flex"><span>(+) Suprimentos:</span> <span>R$ ${(totais.total_suprimentos||0).toFixed(2)}</span></div>
  <div class="flex"><span>(-) Sangrias:</span>    <span>R$ ${(totais.total_sangrias||0).toFixed(2)}</span></div>
  <div class="double-divider"></div>
  <div class="flex bold"><span>SALDO ESPERADO EM DINHEIRO:</span> <span>R$ ${(totais.saldo_esperado_dinheiro||0).toFixed(2)}</span></div>
  ${tipoRelatorio === 'Z' ? `
  <div class="flex bold"><span>DINHEIRO DECLARADO (CONTAGEM):</span> <span>R$ ${(parseFloat(turno.dinheiro_declarado)||0).toFixed(2)}</span></div>
  <div class="divider"></div>
  <div class="flex bold" style="font-size:13px;"><span>DIFERENÇA / QUEBRA:</span> <span>${statusQuebra}</span></div>
  ${turno.observacao ? `<div><strong>Obs:</strong> ${turno.observacao}</div>` : ''}
  ` : ''}
  <div class="double-divider"></div>
  <div class="center" style="font-size:10px;margin-top:15px;">Emissão: ${agora}<br>Chef Cozinha SaaS Kernel v1.0.0</div>
  <br><br>
  <div style="border-top:1px solid #000;text-align:center;margin-top:25px;">Assinatura do Operador de Caixa</div>
  <br><br>
  <div style="border-top:1px solid #000;text-align:center;margin-top:15px;">Visto do Gerente / Responsável</div>
  <div class="no-print" style="margin-top:20px;text-align:center;">
    <button onclick="window.print()" style="padding:10px 20px;font-weight:bold;background:#10b981;color:#fff;border:none;border-radius:6px;cursor:pointer;">🖨️ Imprimir Cupom</button>
  </div>
</body>
</html>`;
}

// ── Router Factory ────────────────────────────────────────────────────────

function createCaixaRouter() {
  const router = Router();
  const { io, withTenant } = getContext();

  // helper para obter o db do tenant corrente dentro da rota
  const getDb = () => getContext().getTenantDb();

  // GET /api/mesas
  router.get('/mesas', (req, res) => {
    getDb().all('SELECT * FROM mesas ORDER BY id ASC', [], (err, rows) => {
      res.json(rows || []);
    });
  });

  // GET /api/caixa/estado
  router.get('/estado', (req, res) => {
    getDb().get("SELECT * FROM turnos_caixa WHERE status = 'Aberto' ORDER BY id DESC LIMIT 1", [], (err, row) => {
      res.json({ success: true, turno: row || null, aberto: Boolean(row) });
    });
  });

  // POST /api/caixa/abrir
  router.post('/abrir', (req, res) => {
    const fundo = parseFloat(req.body.fundo_troco) || 0;
    const db = getDb();
    db.get("SELECT * FROM turnos_caixa WHERE status = 'Aberto' ORDER BY id DESC LIMIT 1", [], (err, row) => {
      if (row) {
        io.emit('estado_caixa', row);
        io.emit('caixa_aberto_sucesso');
        return res.json({ success: true, turno: row, msg: 'Caixa já aberto' });
      }
      db.run(
        "INSERT INTO turnos_caixa (fundo_troco, status, data_abertura) VALUES (?, 'Aberto', datetime('now', 'localtime'))",
        [fundo],
        function (err2) {
          if (err2) return res.status(500).json({ success: false, error: err2.message });
          const newTurno = { id: this.lastID, status: 'Aberto', fundo_troco: fundo };
          io.emit('estado_caixa', newTurno);
          io.emit('caixa_aberto_sucesso');
          db.all('SELECT * FROM mesas', (e, r) => io.emit('mesas_atualizadas', r || []));
          res.json({ success: true, turno: newTurno });
        }
      );
    });
  });

  // POST /api/caixa/fechar
  router.post('/fechar', (req, res) => {
    withTenant(req, () => {
      const db = getDb();
      db.get("SELECT * FROM turnos_caixa WHERE status = 'Aberto' ORDER BY id DESC LIMIT 1", [], (err, turno) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (!turno) return res.status(400).json({ success: false, error: 'Não há turno de caixa aberto para fechar.' });

        calcularTotaisTurno(db, turno, (errCalc, totais) => {
          if (errCalc) return res.status(500).json({ success: false, error: errCalc.message });

          const operador           = req.body.operador || 'Caixa';
          const dinheiroDeclarado  = parseFloat(req.body.dinheiro_declarado) || 0;
          const diferencaQuebra    = parseFloat((dinheiroDeclarado - totais.saldo_esperado_dinheiro).toFixed(2));
          const observacao         = req.body.observacao || '';

          db.run(`
            UPDATE turnos_caixa SET
              status = 'Fechado', data_fechamento = datetime('now', 'localtime'),
              operador_fechamento = ?, total_vendas = ?, total_dinheiro = ?, total_credito = ?,
              total_debito = ?, total_pix = ?, total_outros = ?, total_sangrias = ?,
              total_suprimentos = ?, saldo_esperado_dinheiro = ?, dinheiro_declarado = ?,
              diferenca_quebra = ?, observacao = ?
            WHERE id = ?
          `, [
            operador, totais.total_vendas, totais.total_dinheiro, totais.total_credito,
            totais.total_debito, totais.total_pix, totais.total_outros, totais.total_sangrias,
            totais.total_suprimentos, totais.saldo_esperado_dinheiro, dinheiroDeclarado,
            diferencaQuebra, observacao, turno.id
          ], function (errUpdate) {
            if (errUpdate) return res.status(500).json({ success: false, error: errUpdate.message });

            const turnoFechado = { ...turno, status: 'Fechado', data_fechamento: new Date().toLocaleString('pt-BR'), operador_fechamento: operador, dinheiro_declarado: dinheiroDeclarado, diferenca_quebra: diferencaQuebra, observacao };
            io.emit('estado_caixa', { status: 'Fechado', turno_id: turno.id });
            io.emit('caixa_fechado_sucesso', turnoFechado);

            res.json({
              success: true, ok: true, turno_id: turno.id, totais,
              dinheiro_declarado: dinheiroDeclarado, diferenca_quebra: diferencaQuebra,
              quebra_status: Math.abs(diferencaQuebra) < 0.01 ? 'exato' : (diferencaQuebra > 0 ? 'sobra' : 'falta'),
              extrato_html: gerarExtratoFechamentoHTML(turnoFechado, totais, 'Z'),
              mensagem: `Turno de caixa #${turno.id} encerrado! Diferença: R$ ${diferencaQuebra.toFixed(2)}`
            });
          });
        });
      });
    });
  });

  // GET /api/caixa/leitura-x
  router.get('/leitura-x', (req, res) => {
    withTenant(req, () => {
      const db = getDb();
      db.get("SELECT * FROM turnos_caixa WHERE status = 'Aberto' ORDER BY id DESC LIMIT 1", [], (err, turno) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (!turno) return res.status(404).json({ success: false, error: 'Não há turno de caixa aberto no momento.' });
        calcularTotaisTurno(db, turno, (errCalc, totais) => {
          if (errCalc) return res.status(500).json({ success: false, error: errCalc.message });
          res.json({ success: true, ok: true, turno, totais, extrato_html: gerarExtratoFechamentoHTML(turno, totais, 'X') });
        });
      });
    });
  });

  // GET /api/caixa/extrato-fechamento/:id
  router.get('/extrato-fechamento/:id', (req, res) => {
    withTenant(req, () => {
      const db = getDb();
      db.get('SELECT * FROM turnos_caixa WHERE id = ?', [req.params.id], (err, turno) => {
        if (err || !turno) return res.status(404).send('Turno de caixa não localizado.');
        calcularTotaisTurno(db, turno, (errCalc, totais) => {
          const t = totais || { fundo_troco: turno.fundo_troco, total_vendas: turno.total_vendas, total_dinheiro: turno.total_dinheiro, total_credito: turno.total_credito, total_debito: turno.total_debito, total_pix: turno.total_pix, total_outros: turno.total_outros, total_sangrias: turno.total_sangrias, total_suprimentos: turno.total_suprimentos, saldo_esperado_dinheiro: turno.saldo_esperado_dinheiro };
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.send(gerarExtratoFechamentoHTML(turno, t, turno.status === 'Fechado' ? 'Z' : 'X'));
        });
      });
    });
  });

  // POST /api/caixa/sangria
  router.post('/sangria', (req, res) => {
    const valor    = parseFloat(req.body.valor) || 0;
    const motivo   = req.body.motivo || 'Sangria de Caixa / Recolhimento para cofre';
    const operador = req.body.operador || 'Caixa';
    if (valor <= 0) return res.status(400).json({ success: false, error: 'O valor da sangria deve ser maior que zero.' });

    withTenant(req, () => {
      const db = getDb();
      db.get("SELECT id FROM turnos_caixa WHERE status = 'Aberto' ORDER BY id DESC LIMIT 1", [], (err, turno) => {
        db.run(
          `INSERT INTO movimentacoes (turno_id, tipo, valor, forma_pagamento, descricao, data) VALUES (?, 'Sangria', ?, 'Dinheiro', ?, datetime('now', 'localtime'))`,
          [turno ? turno.id : null, valor, `Sangria (${operador}): ${motivo}`],
          function (errIns) {
            if (errIns) return res.status(500).json({ success: false, error: errIns.message });
            io.emit('movimentacoes_atualizadas');
            res.json({ success: true, ok: true, movimentacao_id: this.lastID, tipo: 'Sangria', valor, operador, mensagem: `Sangria de R$ ${valor.toFixed(2)} registrada com sucesso!` });
          }
        );
      });
    });
  });

  // POST /api/caixa/suprimento
  router.post('/suprimento', (req, res) => {
    const valor    = parseFloat(req.body.valor) || 0;
    const motivo   = req.body.motivo || 'Suprimento / Aporte de Troco';
    const operador = req.body.operador || 'Caixa';
    if (valor <= 0) return res.status(400).json({ success: false, error: 'O valor do suprimento deve ser maior que zero.' });

    withTenant(req, () => {
      const db = getDb();
      db.get("SELECT id FROM turnos_caixa WHERE status = 'Aberto' ORDER BY id DESC LIMIT 1", [], (err, turno) => {
        db.run(
          `INSERT INTO movimentacoes (turno_id, tipo, valor, forma_pagamento, descricao, data) VALUES (?, 'Suprimento', ?, 'Dinheiro', ?, datetime('now', 'localtime'))`,
          [turno ? turno.id : null, valor, `Suprimento (${operador}): ${motivo}`],
          function (errIns) {
            if (errIns) return res.status(500).json({ success: false, error: errIns.message });
            io.emit('movimentacoes_atualizadas');
            res.json({ success: true, ok: true, movimentacao_id: this.lastID, tipo: 'Suprimento', valor, operador, mensagem: `Suprimento de R$ ${valor.toFixed(2)} registrado com sucesso!` });
          }
        );
      });
    });
  });

  // GET /api/caixa/turnos
  router.get('/turnos', (req, res) => {
    withTenant(req, () => {
      getDb().all('SELECT * FROM turnos_caixa ORDER BY id DESC LIMIT 50', [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, ok: true, turnos: rows || [] });
      });
    });
  });

  return router;
}

module.exports = { createCaixaRouter, calcularTotaisTurno, gerarExtratoFechamentoHTML };
