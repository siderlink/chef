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
    'Cliente' AS userName,
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
    ci.prontoEm AS prontoEm,
    0 AS sync_version,
    ci.composicoes AS composicoes,
    NULL AS uuid_offline
  FROM comandas_itens ci
  JOIN comandas c ON c.id = ci.comanda_id;
`);

db.exec(`
  DROP TRIGGER IF EXISTS trg_pedidos_update;
  CREATE TRIGGER trg_pedidos_update
  INSTEAD OF UPDATE ON pedidos
  FOR EACH ROW
  BEGIN
    UPDATE comandas_itens 
    SET status = NEW.status, 
        setor = NEW.sector,
        nome = NEW.productName,
        quantidade = NEW.quantity,
        total = NEW.total,
        observacoes = NEW.observations,
        opcionais = NEW.options,
        prontoEm = NEW.prontoEm
    WHERE id = OLD.id;

    UPDATE comandas
    SET 
        status = CASE 
                    WHEN NEW.status IN ('Finalizado', 'Pago', 'Cancelado') 
                         AND (SELECT COUNT(*) FROM comandas_itens WHERE comanda_id = comandas.id AND status NOT IN ('Finalizado', 'Pago', 'Cancelado')) = 0
                    THEN 'Fechada'
                    ELSE status
                 END,
        fechado_em = CASE 
                        WHEN NEW.status IN ('Finalizado', 'Pago', 'Cancelado') 
                        THEN datetime('now', 'localtime') 
                        ELSE fechado_em 
                     END
    WHERE id = (SELECT comanda_id FROM comandas_itens WHERE id = OLD.id) AND OLD.id < 1000000;
  END;
`);

console.log("Bridge updated for prontoEm!");
