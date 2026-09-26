/**
 * Plugin: logs
 * Auditoria + API logs (routes + sockets)
 */
module.exports = function({ app, db, io, options, log }) {
  const { verificarToken } = options;

  log('Registering routes...');

  app.get('/api/auditoria', verificarToken, (req, res) => {
    db.all(`SELECT * FROM auditoria ORDER BY id DESC LIMIT 300`, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    });
  });

  app.get('/api/logs-api', verificarToken, (req, res) => {
    db.all(`SELECT * FROM api_logs ORDER BY id DESC LIMIT 300`, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    });
  });

  log('Registering sockets...');

  io.on('connection', (socket) => {
    socket.on('get_api_logs', () => {
      db.all(`SELECT * FROM api_logs ORDER BY id DESC LIMIT 300`, (err, rows) => {
        socket.emit('api_logs_recebidos', rows || []);
      });
    });

    socket.on('get_auditoria_logs', () => {
      db.all(`SELECT * FROM auditoria ORDER BY id DESC LIMIT 200`, (err, rows) => {
        socket.emit('auditoria_logs_recebidos', rows || []);
      });
    });

    socket.on('novo_log_auditoria', (logObj) => {
      if (!logObj || !logObj.tipo) return;
      const operador = (logObj.usuario || '').slice(0, 120);
      const acao = (logObj.tipo || '').slice(0, 120);
      const detalhes = (logObj.detalhe || '').slice(0, 500);
      const motivo = (logObj.motivo || '').slice(0, 300);
      const risco = (logObj.risco || 'MEDIO').slice(0, 20);
      db.run(`INSERT INTO auditoria (operador, acao, detalhes, motivo, risco, data_hora)
              VALUES (?, ?, ?, ?, ?, datetime('now','localtime'))`,
        [operador, acao, detalhes, motivo, risco], function(err) {
          if (err) { log('Erro ao inserir auditoria: ' + err.message); return; }
          db.all(`SELECT * FROM auditoria ORDER BY id DESC LIMIT 200`, (e2, rows) => {
            if (io) io.emit('auditoria_logs_recebidos', rows || []);
          });
        });
    });
  });

  log('Routes + sockets registered.');
};
