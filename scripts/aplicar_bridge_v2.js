const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '..', 'database_1.sqlite');
const db = new Database(dbPath);

console.log('Aplicando Arquitetura Bridge (View) no Banco...');

db.transaction(() => {
  // 1. Renomear tabela antiga para liberar o nome "pedidos"
  // (Caso já tenha sido renomeada em testes, ignoramos o erro de missing table)
  try {
    db.exec(`ALTER TABLE pedidos RENAME TO pedidos_legacy`);
    console.log('Tabela pedidos renomeada para pedidos_legacy.');
  } catch (e) {
    if (e.message.includes('no such table')) {
      console.log('Tabela pedidos já foi renomeada ou não existe.');
    } else {
      throw e;
    }
  }

  // 2. Apagar view antiga se existir
  db.exec(`DROP VIEW IF EXISTS pedidos`);

  // 3. Criar a View mágica
  db.exec(`
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
    JOIN comandas c ON c.id = ci.comanda_id

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
      cp.id AS pagamento_id,
      NULL AS observations,
      NULL AS options,
      NULL AS prontoEm,
      0 AS sync_version,
      NULL AS composicoes,
      NULL AS uuid_offline
    FROM comandas_pagamentos cp
    JOIN comandas c ON c.id = cp.comanda_id;
  `);

  console.log('View "pedidos" criada com sucesso.');

  // 4. Criar as Triggers (INSTEAD OF)
  db.exec(`
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
          composicoes = NEW.composicoes,
          garcom = NEW.userName
      WHERE id = OLD.id AND OLD.id < 1000000;
      
      UPDATE comandas
      SET status = CASE 
                      WHEN NEW.status IN ('Finalizado', 'Pago') THEN 'Fechada' 
                      WHEN NEW.status = 'Cancelado' THEN 'Cancelada' 
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

  db.exec(`
    CREATE TRIGGER trg_pedidos_delete
    INSTEAD OF DELETE ON pedidos
    FOR EACH ROW
    BEGIN
      DELETE FROM comandas_itens WHERE id = OLD.id AND OLD.id < 1000000;
      DELETE FROM comandas_pagamentos WHERE id = (OLD.id - 1000000) AND OLD.id >= 1000000;
    END;
  `);

  console.log('Triggers (Update/Delete) ativados.');
})();

console.log('Bridge instalada! Os SELECTs já estão transparentes para o sistema antigo.');
