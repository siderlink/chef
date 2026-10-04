const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, '..', 'database_1.sqlite'));

db.exec(`
CREATE TRIGGER IF NOT EXISTS trg_pedidos_insert
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
`);

console.log("Trigger de INSERT criada com sucesso!");
