const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, '..', 'database_1.sqlite'));

db.exec(`
  -- Trigger to update comanda status automatically based on its items
  CREATE TRIGGER IF NOT EXISTS trg_comandas_itens_update_status
  AFTER UPDATE OF status ON comandas_itens
  FOR EACH ROW
  BEGIN
    -- If there are no more active items, close the comanda
    UPDATE comandas
    SET 
      status = CASE 
        WHEN NOT EXISTS (SELECT 1 FROM comandas_itens WHERE comanda_id = NEW.comanda_id AND status NOT IN ('Pago', 'Finalizado', 'Cancelado')) THEN 'Fechada'
        ELSE 'Aberta'
      END,
      fechado_em = CASE 
        WHEN NOT EXISTS (SELECT 1 FROM comandas_itens WHERE comanda_id = NEW.comanda_id AND status NOT IN ('Pago', 'Finalizado', 'Cancelado')) THEN datetime('now', 'localtime')
        ELSE NULL
      END
    WHERE id = NEW.comanda_id;
  END;

  CREATE TRIGGER IF NOT EXISTS trg_comandas_itens_delete_status
  AFTER DELETE ON comandas_itens
  FOR EACH ROW
  BEGIN
    UPDATE comandas
    SET 
      status = CASE 
        WHEN NOT EXISTS (SELECT 1 FROM comandas_itens WHERE comanda_id = OLD.comanda_id AND status NOT IN ('Pago', 'Finalizado', 'Cancelado')) THEN 'Fechada'
        ELSE 'Aberta'
      END
    WHERE id = OLD.comanda_id;
  END;
`);

console.log("Triggers para auto-fechamento de comandas criadas!");
