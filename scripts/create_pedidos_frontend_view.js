const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, '..', 'database_1.sqlite'));

db.exec(`
  DROP VIEW IF EXISTS pedidos_frontend;
  CREATE VIEW pedidos_frontend AS
  SELECT * FROM pedidos
  UNION ALL
  SELECT 
    cp.id + 1000000 AS id, 
    'Pgto Parcial (' || cp.forma_pagamento || ')' AS productName,
    '💸' AS productEmoji,
    1 AS quantity,
    strftime('%H:%M', cp.data_pagamento) AS time,
    c.mesa AS localName,
    'Caixa' AS userName,
    -cp.valor AS total,
    'Entregue' AS status,
    'Caixa' AS sector,
    cp.forma_pagamento AS paymentMethod,
    c.turno_id AS turno_id,
    cp.data_pagamento AS createdAt,
    c.cliente_id AS cliente_id,
    c.entregador_id AS entregador_id,
    c.promocao_id AS promocao_id,
    NULL AS mesa_grupo,
    NULL AS mesa_comanda,
    NULL AS garcom_call,
    NULL AS funcionario_id,
    NULL AS pagamento_id,
    NULL AS observations,
    NULL AS options,
    NULL AS prontoEm,
    0 AS sync_version,
    NULL AS composicoes,
    NULL AS uuid_offline
  FROM comandas_pagamentos cp
  JOIN comandas c ON cp.comanda_id = c.id;
`);

console.log("View pedidos_frontend criada com sucesso!");
