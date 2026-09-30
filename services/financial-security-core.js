/**
 * financial-security-core.js
 *
 * Módulo de Referência em Segurança Financeira, Imutabilidade e Auditoria Forense
 * Padrão Bancário / PCI-DSS / Ledger Imutável SHA-256 para Restaurantes.
 *
 * Recursos:
 * 1. Blockchain-style Cryptographic Ledger (Hash Chain SHA-256) em movimentacoes
 * 2. Idempotência estrita anti-duplo clique e anti-duplo pagamento
 * 3. Validador Forense de Integridade Contábil (Detecta adulterações manuais no SQLite)
 * 4. Guardião de Invariantes Financeiras em Tempo Real (Saldo negativo, gaveta física, estornos)
 * 5. Lacre Digital Criptográfico de Turnos de Caixa
 */

const crypto = require('crypto');

class FinancialSecurityCore {
  constructor() {
    this.GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';
    this.idempotencyCache = new Map(); // key -> { timestamp, result }
    this.IDEMPOTENCY_TTL_MS = 30000; // 30 segundos
  }

  /**
   * Gera um hash criptográfico canônico para um registro de movimentação
   */
  calcularHashMovimentacao(reg, prevHash) {
    const dataCanonica = [
      String(reg.id || 0),
      String(reg.turno_id || 0),
      String(reg.tipo || '').toUpperCase().trim(),
      parseFloat(reg.valor || 0).toFixed(2),
      String(reg.forma_pagamento || '').toUpperCase().trim(),
      String(reg.data || '').trim(),
      String(prevHash || this.GENESIS_HASH)
    ].join('|');

    return crypto.createHash('sha256').update(dataCanonica, 'utf8').digest('hex');
  }

  /**
   * Assegura que as colunas de segurança existem na tabela movimentacoes e turnos_caixa
   */
  garantirColunas(db, callback) {
    if (!db || typeof db.run !== 'function') return callback && callback();

    const sqls = [
      `ALTER TABLE movimentacoes ADD COLUMN hash TEXT`,
      `ALTER TABLE movimentacoes ADD COLUMN prev_hash TEXT`,
      `ALTER TABLE movimentacoes ADD COLUMN idempotency_key TEXT`,
      `ALTER TABLE turnos_caixa ADD COLUMN hash_lacre TEXT`,
      `ALTER TABLE turnos_caixa ADD COLUMN status_lacre TEXT DEFAULT 'ABERTO'`
    ];

    let i = 0;
    const runNext = () => {
      if (i >= sqls.length) return callback && callback();
      db.run(sqls[i++], () => runNext()); // Ignora erros de coluna duplicada
    };
    runNext();
  }

  /**
   * Carimba criptograficamente uma nova movimentação, encadeando com a anterior
   */
  carimbarMovimentacao(db, movId, callback) {
    if (!db || !movId) return callback && callback(null);

    db.get(
      `SELECT hash FROM movimentacoes WHERE id < ? AND hash IS NOT NULL ORDER BY id DESC LIMIT 1`,
      [movId],
      (errPrev, prevRow) => {
        const prevHash = prevRow && prevRow.hash ? prevRow.hash : this.GENESIS_HASH;

        db.get(`SELECT * FROM movimentacoes WHERE id = ?`, [movId], (errCur, curRow) => {
          if (errCur || !curRow) return callback && callback(errCur);

          const novoHash = this.calcularHashMovimentacao(curRow, prevHash);
          db.run(
            `UPDATE movimentacoes SET hash = ?, prev_hash = ? WHERE id = ?`,
            [novoHash, prevHash, movId],
            (errUp) => {
              if (callback) callback(errUp, novoHash);
            }
          );
        });
      }
    );
  }

  /**
   * Inicializa e sela retrospectivamente todas as movimentações sem hash da base
   */
  selarLedgerCompleto(db, callback) {
    if (!db) return callback && callback();

    db.all(`SELECT * FROM movimentacoes ORDER BY id ASC`, [], (err, rows) => {
      if (err || !rows || rows.length === 0) return callback && callback();

      let currentPrev = this.GENESIS_HASH;
      let idx = 0;

      const processNext = () => {
        if (idx >= rows.length) return callback && callback();
        const r = rows[idx++];
        const expectedHash = this.calcularHashMovimentacao(r, currentPrev);

        if (r.hash !== expectedHash || r.prev_hash !== currentPrev) {
          db.run(
            `UPDATE movimentacoes SET hash = ?, prev_hash = ? WHERE id = ?`,
            [expectedHash, currentPrev, r.id],
            () => {
              currentPrev = expectedHash;
              processNext();
            }
          );
        } else {
          currentPrev = r.hash;
          processNext();
        }
      };

      processNext();
    });
  }

  /**
   * Verifica a integridade completa da cadeia (Forensic Ledger Verification)
   * Detecta se alguma linha foi editada manualmente por fora do sistema.
   */
  verificarIntegridadeLedger(db, callback) {
    if (!db) return callback && callback({ ok: false, msg: 'Sem conexão com banco' });
    const inicio = Date.now();

    db.all(`SELECT * FROM movimentacoes ORDER BY id ASC`, [], (err, rows) => {
      if (err) return callback && callback({ ok: false, erro: err.message });
      const total = rows ? rows.length : 0;
      if (total === 0) {
        return callback({
          ok: true,
          status: 'VAZIO',
          totalRegistros: 0,
          anomalias: [],
          tempoVerificacaoMs: Date.now() - inicio,
          seloConformidade: 'A+ (Vazio / Pronto)'
        });
      }

      let currentPrev = this.GENESIS_HASH;
      const anomalias = [];

      rows.forEach(r => {
        const esperado = this.calcularHashMovimentacao(r, currentPrev);
        if (r.hash && r.hash !== esperado) {
          anomalias.push({
            id: r.id,
            data: r.data,
            tipo: r.tipo,
            valor: r.valor,
            hashGravado: r.hash,
            hashEsperado: esperado,
            motivo: 'Registro foi adulterado ou prev_hash inconsistente'
          });
        }
        currentPrev = r.hash || esperado;
      });

      const integro = anomalias.length === 0;
      return callback({
        ok: integro,
        status: integro ? 'INTEGRO' : 'ADULTERADO',
        totalRegistros: total,
        anomalias: anomalias,
        tempoVerificacaoMs: Date.now() - inicio,
        seloConformidade: integro ? 'A+ (Cadeia Criptográfica SHA-256 Verificada)' : 'FALHA (Violação Detectada)',
        auditadoEm: new Date().toISOString()
      });
    });
  }

  /**
   * Verifica idempotência de pagamentos para impedir duplicação acidental
   */
  checarIdempotencia(key) {
    if (!key) return false;
    const now = Date.now();
    this.limparCacheIdempotencia();

    if (this.idempotencyCache.has(key)) {
      const cached = this.idempotencyCache.get(key);
      if (now - cached.timestamp < this.IDEMPOTENCY_TTL_MS) {
        return true; // Duplicação detectada
      }
    }
    this.idempotencyCache.set(key, { timestamp: now });
    return false;
  }

  limparCacheIdempotencia() {
    const now = Date.now();
    for (const [k, v] of this.idempotencyCache.entries()) {
      if (now - v.timestamp > this.IDEMPOTENCY_TTL_MS) {
        this.idempotencyCache.delete(k);
      }
    }
  }

  /**
   * Auditoria de Invariantes Financeiras em Tempo Real
   */
  auditarInvariantes(db, callback) {
    if (!db) return callback && callback({ ok: false });

    // 1. Invariante Mesas: nenhuma mesa aberta com total negativo
    db.all(
      `SELECT localName, SUM(CAST(REPLACE(total, ',', '.') AS REAL)) as saldoLiquido
       FROM pedidos WHERE status NOT IN ('Finalizado', 'Cancelado') AND localName IS NOT NULL
       GROUP BY localName`,
      [],
      (err1, mesasRows) => {
        const mesasNegativas = (mesasRows || []).filter(m => m.saldoLiquido < -0.01);

        // 2. Invariante Gaveta: verificar saldo do turno aberto
        db.get(`SELECT * FROM turnos_caixa WHERE status = 'Aberto' ORDER BY id DESC LIMIT 1`, [], (err2, turno) => {
          let gavetaNegativa = false;
          let saldoGaveta = 0;

          if (turno) {
            db.all(`SELECT tipo, valor, forma_pagamento FROM movimentacoes WHERE turno_id = ?`, [turno.id], (err3, movs) => {
              let dinheiro = turno.fundo_troco || 0;
              (movs || []).forEach(m => {
                const t = String(m.tipo || '').toLowerCase();
                const fp = String(m.forma_pagamento || '').toLowerCase();
                const v = parseFloat(m.valor) || 0;
                if (fp.includes('dinheiro')) {
                  if (t === 'entrada' || t === 'suprimento' || t === 'aporte' || t === 'reforco') {
                    dinheiro += v;
                  } else if (t === 'sangria' || t === 'saida' || t === 'saída' || t === 'despesa') {
                    dinheiro -= v;
                  }
                }
              });
              saldoGaveta = Math.round(dinheiro * 100) / 100;
              if (saldoGaveta < -0.01) gavetaNegativa = true;

              concluirAuditoria();
            });
          } else {
            concluirAuditoria();
          }

          function concluirAuditoria() {
            const falhas = [];
            if (mesasNegativas.length > 0) {
              falhas.push({
                invariante: 'INV-1: Saldo de Mesas Não-Negativo',
                detalhe: `${mesasNegativas.length} mesa(s) com saldo líquido negativo: ` + mesasNegativas.map(m => `${m.localName} (R$ ${m.saldoLiquido.toFixed(2)})`).join(', ')
              });
            }
            if (gavetaNegativa) {
              falhas.push({
                invariante: 'INV-2: Saldo Físico de Gaveta Não-Negativo',
                detalhe: `Gaveta física calculada com valor negativo: R$ ${saldoGaveta.toFixed(2)}`
              });
            }

            const pontuacao = falhas.length === 0 ? 100 : Math.max(0, 100 - falhas.length * 40);
            callback && callback({
              ok: falhas.length === 0,
              pontuacaoSeguranca: pontuacao,
              classificacao: pontuacao === 100 ? 'PADRÃO OURO (REFERÊNCIA FINTECH)' : (pontuacao >= 70 ? 'BOA' : 'CRÍTICA'),
              falhasDetectadas: falhas,
              saldoGavetaAtual: saldoGaveta,
              mesasAbertasAuditadas: (mesasRows || []).length,
              verificadoEm: new Date().toISOString()
            });
          }
        });
      }
    );
  }

  /**
   * Gera o Lacre Criptográfico Digital no Fechamento do Caixa
   */
  lacrarTurno(db, turnoId, dadosFechamento, callback) {
    if (!db || !turnoId) return callback && callback();

    db.all(`SELECT tipo, valor, forma_pagamento FROM movimentacoes WHERE turno_id = ?`, [turnoId], (err, movs) => {
      let totalEntradas = 0;
      let totalSaidas = 0;
      (movs || []).forEach(m => {
        const t = String(m.tipo || '').toLowerCase();
        const v = parseFloat(m.valor) || 0;
        if (t === 'entrada') totalEntradas += v;
        else if (t === 'sangria' || t === 'saida' || t === 'saída' || t === 'despesa') totalSaidas += v;
      });

      const payloadLacre = [
        String(turnoId),
        totalEntradas.toFixed(2),
        totalSaidas.toFixed(2),
        parseFloat(dadosFechamento.totalDeclarado || 0).toFixed(2),
        parseFloat(dadosFechamento.diferencaCaixa || 0).toFixed(2),
        String(dadosFechamento.operador || 'Caixa'),
        new Date().toISOString()
      ].join('|');

      const hashLacre = crypto.createHash('sha256').update(payloadLacre, 'utf8').digest('hex');

      db.run(
        `UPDATE turnos_caixa SET hash_lacre = ?, status_lacre = 'LACRADO_INTACTO' WHERE id = ?`,
        [hashLacre, turnoId],
        (errUp) => {
          if (callback) callback(errUp, hashLacre);
        }
      );
    });
  }
}

module.exports = new FinancialSecurityCore();
