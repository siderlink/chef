/**
 * salvar-estado-emergencia.js — Child process (isolated) serializer.
 *
 * Executado em um processo separado pelo server.js quando um uncaughtException
 * ou unhandledRejection ocorre. O objetivo é registrar o último estado das mesas
 * abertas ANTES de o servidor reiniciar, SEM tocar no objeto `db` compartilhado do
 * processo principal — pois uma falha nativa do sqlite3 (napi_throw) em um processo
 * separado não derruba o servidor, apenas este filho.
 *
 * Uso: node salvar-estado-emergencia.js [path1.sqlite] [path2.sqlite] ... [out.json]
 * O último argumento é o caminho do arquivo de saída; os anteriores são os bancos a varrer.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const sqlite3 = require('./sqlite3-wrapper').verbose();

const args = process.argv.slice(2);
if (args.length < 2) {
  process.exit(0);
}
const DB_PATHS = args.slice(0, -1);
const OUT_PATH = args[args.length - 1];

const QUERY = `
  SELECT m.nome, m.status, COUNT(p.id) as pedidos_abertos, SUM(CAST(p.total AS REAL)) as valor_total
  FROM mesas m LEFT JOIN pedidos p ON (p.localName = m.nome OR p.mesa_grupo = m.nome)
    AND p.status NOT IN ('Finalizado','Pago','Cancelado','Fracionado')
  WHERE m.status != 'Disponível'
  GROUP BY m.nome HAVING pedidos_abertos > 0
`;

function queryDb(dbPath) {
  return new Promise((resolve) => {
    let db;
    try {
      if (!fs.existsSync(dbPath)) return resolve([]);
      db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (openErr) => {
        if (openErr) return resolve([]);
        db.all(QUERY, [], (err, rows) => {
          try { db.close(); } catch (e) {}
          if (err || !rows) return resolve([]);
          const mesas = rows.map((r) => ({
            nome: r.nome,
            status: r.status,
            pedidos_abertos: r.pedidos_abertos,
            valor_total: Math.round((r.valor_total || 0) * 100) / 100
          }));
          return resolve(mesas);
        });
        // Timeout de segurança caso o callback nunca dispare
        setTimeout(() => { try { db.close(); } catch (e) {} resolve([]); }, 4000);
      });
    } catch (e) {
      try { if (db) db.close(); } catch (e2) {}
      resolve([]);
    }
  });
}

(async () => {
  const resultados = [];
  for (const p of DB_PATHS) {
    const mesas = await queryDb(p);
    if (mesas.length) {
      resultados.push({ banco: path.basename(p), mesas });
    }
  }
  const totalMesas = resultados.reduce((acc, r) => acc + r.mesas.length, 0);
  if (totalMesas === 0) return process.exit(0);
  const state = {
    salvo_em: new Date().toISOString(),
    por_tenant: resultados,
    mesas: resultados.flatMap((r) => r.mesas)
  };
  try {
    fs.writeFileSync(OUT_PATH, JSON.stringify(state, null, 2));
  } catch (e) {}
  process.exit(0);
})();
