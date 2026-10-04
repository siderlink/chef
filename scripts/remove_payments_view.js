const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, '..', 'database_1.sqlite'));

db.exec(`
  DROP VIEW IF EXISTS pedidos;

  CREATE VIEW pedidos AS
  SELECT 
    ci.id AS id,
    ci.nome AS productName,
    ci.emoji AS productEmoji,
    ci.quantidade AS quantity,
    strftime('%H:%M', ci.criado_em) AS time,
    c.mesa AS localName,
    ci.garcom AS userName,
    ci.total AS total,
    ci.status AS status,
    ci.setor AS sector,
    NULL AS paymentMethod,
    c.turno_id AS turno_id,
    ci.criado_em AS createdAt,
    c.cliente_id AS cliente_id,
    c.entregador_id AS entregador_id,
    c.promocao_id AS promocao_id,
    NULL AS mesa_grupo,
    NULL AS mesa_comanda,
    NULL AS garcom_call,
    NULL AS funcionario_id,
    NULL AS pagamento_id,
    ci.observacoes AS observations,
    ci.opcionais AS options,
    NULL AS prontoEm,
    0 AS sync_version,
    ci.composicoes AS composicoes,
    NULL AS uuid_offline
  FROM comandas_itens ci
  JOIN comandas c ON ci.comanda_id = c.id;

  CREATE TRIGGER trg_pedidos_insert
  INSTEAD OF INSERT ON pedidos
  FOR EACH ROW
  BEGIN
    -- Insert into comandas if it doesn't exist
    INSERT INTO comandas (mesa, status, criado_em, turno_id, cliente_id, promocao_id)
    SELECT NEW.localName, 'Aberta', datetime('now', 'localtime'), NEW.turno_id, NEW.cliente_id, NEW.promocao_id
    WHERE NOT EXISTS (SELECT 1 FROM comandas WHERE mesa = NEW.localName AND status = 'Aberta');
    
    -- Insert payment if total is negative
    INSERT INTO comandas_pagamentos (comanda_id, valor, forma_pagamento, data_pagamento)
    SELECT 
      (SELECT id FROM comandas WHERE mesa = NEW.localName AND status = 'Aberta' ORDER BY id DESC LIMIT 1),
      -(CAST(REPLACE(IFNULL(NEW.total, '0'), ',', '.') AS REAL)), 
      COALESCE(NEW.paymentMethod, 'Caixa'), 
      datetime('now', 'localtime')
    WHERE CAST(REPLACE(IFNULL(NEW.total, '0'), ',', '.') AS REAL) < 0;

    -- Insert item if total is >= 0
    INSERT INTO comandas_itens (comanda_id, nome, emoji, quantidade, preco_unitario, total, status, setor, observacoes, composicoes, opcionais, garcom, criado_em)
    SELECT 
      (SELECT id FROM comandas WHERE mesa = NEW.localName AND status = 'Aberta' ORDER BY id DESC LIMIT 1),
      NEW.productName,
      NEW.productEmoji,
      IFNULL(NEW.quantity, 1),
      (CAST(REPLACE(IFNULL(NEW.total, '0'), ',', '.') AS REAL)) / IFNULL(NEW.quantity, 1),
      CAST(REPLACE(IFNULL(NEW.total, '0'), ',', '.') AS REAL),
      NEW.status,
      NEW.sector,
      NEW.observations,
      NEW.composicoes,
      NEW.options,
      NEW.userName,
      datetime('now', 'localtime')
    WHERE CAST(REPLACE(IFNULL(NEW.total, '0'), ',', '.') AS REAL) >= 0;

    -- Update comanda totals
    UPDATE comandas 
    SET valor_subtotal = (SELECT COALESCE(SUM(total), 0) FROM comandas_itens WHERE comanda_id = comandas.id), 
        valor_total = (SELECT COALESCE(SUM(total), 0) FROM comandas_itens WHERE comanda_id = comandas.id)
    WHERE id = (SELECT id FROM comandas WHERE mesa = NEW.localName AND status = 'Aberta' ORDER BY id DESC LIMIT 1);
  END;

  CREATE TRIGGER trg_pedidos_update
  INSTEAD OF UPDATE ON pedidos
  FOR EACH ROW
  BEGIN
    UPDATE comandas_itens
    SET 
      status = NEW.status,
      quantidade = NEW.quantity,
      total = NEW.total,
      observacoes = NEW.observations,
      opcionais = NEW.options
    WHERE id = OLD.id;
  END;

  CREATE TRIGGER trg_pedidos_delete
  INSTEAD OF DELETE ON pedidos
  FOR EACH ROW
  BEGIN
    DELETE FROM comandas_itens WHERE id = OLD.id;
  END;
`);

console.log("View pedidos recriada SEM os pagamentos!");
