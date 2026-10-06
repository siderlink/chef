module.exports = function(socket, io, db, helpers) {
  const { getLocalDateOnly, getLocalTimestamp, activePaymentLocks, tenantContext } = helpers || {};

  // --- RH / Controle de Ponto e Vales ---

  socket.on('bater_ponto', ({ funcionario_id, acao, token }) => {
    if (token !== pontoToken) { return socket.emit('bater_ponto_error', 'QR Code expirado ou inválido! Escaneie novamente no Caixa.'); }
    const hoje = getLocalDateOnly();
    const agora = getLocalTimestamp();

    if (acao === 'entrada') {
      db.run(`INSERT INTO pontos (funcionario_id, entrada, data) VALUES (?, ?, ?)`, [funcionario_id, agora, hoje], function (err) {
        if (!err) socket.emit('ponto_registrado', { id: this.lastID, acao });
      });
    } else if (acao === 'saida') {
      db.get(`SELECT p.*, f.valor_hora, f.tipo_remuneracao, f.valor_dia, f.valor_semana, f.valor_mes FROM pontos p JOIN funcionarios f ON p.funcionario_id = f.id WHERE p.funcionario_id = ? AND p.saida IS NULL ORDER BY p.id DESC LIMIT 1`, [funcionario_id], (err, row) => {
        if (err) {
          return socket.emit('bater_ponto_error', 'Erro ao buscar ponto em aberto: ' + err.message);
        }
        if (row) {
          const t1 = new Date(row.entrada).getTime();
          const t2 = new Date(agora).getTime();
          const horasTrabalhadas = (t2 - t1) / (1000 * 60 * 60);

          let valorPagar = 0;
          const tipoRem = row.tipo_remuneracao || 'hora';
          if (tipoRem === 'hora') {
            valorPagar = horasTrabalhadas * (row.valor_hora || 0);
          } else if (tipoRem === 'dia') {
            valorPagar = row.valor_dia || 0;
          } else if (tipoRem === 'semana') {
            valorPagar = (row.valor_semana || 0) / 6; // Standard proration (6 working days/week)
          } else if (tipoRem === 'mes') {
            valorPagar = (row.valor_mes || 0) / 26;   // Standard proration (26 working days/month)
          }

          db.run(`UPDATE pontos SET saida = ?, total_horas = ?, valor_pagar = ? WHERE id = ?`, [agora, horasTrabalhadas, valorPagar, row.id], (err2) => {
            if (!err2) {
              socket.emit('ponto_registrado', { id: row.id, acao, horasTrabalhadas, valorPagar });
            } else {
              socket.emit('bater_ponto_error', 'Erro ao registrar saída: ' + err2.message);
            }
          });
        } else {
          socket.emit('bater_ponto_error', 'Nenhuma entrada em aberto encontrada para registrar a saída.');
        }
      });
    }
  });

  socket.on('get_metricas_funcionario', (funcionario_id) => {
    db.all(`SELECT * FROM pontos WHERE funcionario_id = ? ORDER BY id DESC`, [funcionario_id], (err, pontos) => {
      if (err) {
        console.error('Error fetching pontos:', err);
        socket.emit('metricas_funcionario_response', { pontos: [], vales: [], pagamentos: [] });
        return;
      }
      db.all(`SELECT * FROM vales WHERE funcionario_id = ? ORDER BY id DESC`, [funcionario_id], (err2, vales) => {
        if (err2) {
          console.error('Error fetching vales:', err2);
          socket.emit('metricas_funcionario_response', { pontos: pontos || [], vales: [], pagamentos: [] });
          return;
        }
        db.all(`SELECT * FROM funcionarios_pagamentos WHERE funcionario_id = ? ORDER BY data_pagamento DESC`, [funcionario_id], (err3, pagamentos) => {
          socket.emit('metricas_funcionario_response', { pontos: pontos || [], vales: vales || [], pagamentos: pagamentos || [] });
        });
      });
    });
  });

  socket.on('solicitar_vale', ({ funcionario_id, valor, motivo }) => {
    const agora = getLocalTimestamp();
    const obs = motivo ? String(motivo).trim().substring(0, 30) : '';
    db.run(`INSERT INTO vales (funcionario_id, data_pedido, valor, status, observacao) VALUES (?, ?, ?, 'Pendente', ?)`,
      [funcionario_id, agora, valor, obs], function (err) {
      if (!err) {
        socket.emit('vale_solicitado_success');
      } else {
        console.error('Error requesting vale:', err);
        socket.emit('bater_ponto_error', 'Erro ao solicitar vale: ' + err.message);
      }
    });
  });

  socket.on('definir_meu_pin', ({ funcionario_id, pin }) => {
    if (!isValidId(funcionario_id) || !pin || pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
      return socket.emit('definir_pin_error', 'PIN inválido. Deve conter de 4 a 6 números.');
    }
    bcrypt.hash(pin, 10).then(hash => {
      db.run(`UPDATE funcionarios SET pin_hash = ? WHERE id = ?`, [hash, funcionario_id], (err) => {
        if (err) return socket.emit('definir_pin_error', 'Erro ao salvar PIN no servidor.');
        socket.emit('definir_pin_success', 'PIN salvo com sucesso! Você já pode usar seu PIN para entrar.');
      });
    }).catch(e => {
      socket.emit('definir_pin_error', 'Erro ao processar PIN.');
    });
  });

  socket.on('update_valor_hora', ({ funcionario_id, valor_hora }) => {
    db.run(`UPDATE funcionarios SET valor_hora = ? WHERE id = ?`, [valor_hora, funcionario_id], (err) => {
      if (!err) socket.emit('update_valor_hora_success');
    });
  });

  socket.on('get_cupons_list', () => {
    db.all(`SELECT * FROM cupons ORDER BY data_criacao DESC`, (err, rows) => {
      if (!err) socket.emit('cupons_list', rows || []);
    });
  });

  socket.on('get_cupom_detalhes', ({ codigo }, cb) => {
    if (!codigo) return cb && cb(null);
    db.get(`SELECT * FROM cupons WHERE codigo = ?`, [codigo], (err, cupom) => {
      if (err || !cupom) return cb && cb(null);
      db.all(`SELECT * FROM cupons_usos WHERE cupom_codigo = ? ORDER BY data_uso DESC`, [codigo], (errUsos, usos) => {
        cb && cb({ cupom, usos: usos || [] });
      });
    });
  });

  socket.on('delete_cupom', (data) => {
    if (!exigirAdminSocket(socket)) return;
    const codigo = typeof data === 'object' ? data.codigo : data;
    db.run(`DELETE FROM cupons_usos WHERE cupom_codigo = ?`, [codigo], () => {
      db.run(`DELETE FROM cupons WHERE codigo = ?`, [codigo], (err) => {
        if (!err) io.emit('cupons_atualizados');
      });
    });
  });

  
  socket.on('get_cupons_ativos', (cb) => {
    const agora = new Date();
    const hojeStr = agora.getFullYear() + '-' + String(agora.getMonth() + 1).padStart(2, '0') + '-' + String(agora.getDate()).padStart(2, '0');
    db.all(`SELECT codigo, titulo, descricao, valor_tipo, valor, validade, itens_json, valor_minimo, limite_usos, usado FROM cupons WHERE (validade IS NULL OR validade = '' OR validade >= ?) AND (usado < limite_usos OR limite_usos IS NULL OR limite_usos = 0) ORDER BY data_criacao DESC LIMIT 50`, [hojeStr], (err, rows) => {
      const lista = rows || [];
      if (typeof cb === 'function') cb(lista);
      socket.emit('cupons_ativos_lista', lista);
    });
  });

  socket.on('consultar_cupom', ({ codigo, valor_total, cliente_id }, cb) => {
    if (!codigo) return cb && cb({ valido: false, error: 'Código de cupom não informado.' });
    const cod = String(codigo).trim().toUpperCase();
    db.get(`SELECT * FROM cupons WHERE UPPER(codigo) = ?`, [cod], (err, cupom) => {
      if (err || !cupom) {
        return cb && cb({ valido: false, error: 'Cupom inválido ou não encontrado.' });
      }
      const limiteUsos = cupom.limite_usos || 1;
      const totalUsados = cupom.usado || 0;
      if (limiteUsos > 0 && totalUsados >= limiteUsos) {
        return cb && cb({ valido: false, error: 'Este cupom já atingiu o limite de usos.' });
      }
      const agora = new Date();
      if (cupom.validade) {
        const dataValidade = new Date(cupom.validade + 'T23:59:59');
        if (agora > dataValidade) {
          return cb && cb({ valido: false, error: 'Este cupom expirou em ' + cupom.validade + '.' });
        }
      }
      if (cupom.dias_horarios_json) {
        try {
          const dh = typeof cupom.dias_horarios_json === 'string' ? JSON.parse(cupom.dias_horarios_json) : cupom.dias_horarios_json;
          const diasSemana = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
          const hojeDia = diasSemana[agora.getDay()];
          if (dh && dh[hojeDia]) {
            const configHoje = dh[hojeDia];
            if (!configHoje.ativo) return cb && cb({ valido: false, error: 'Cupom não é válido para ' + hojeDia + '.' });
            const horaAtualStr = agora.getHours().toString().padStart(2, '0') + ':' + agora.getMinutes().toString().padStart(2, '0');
            if (configHoje.inicio && horaAtualStr < configHoje.inicio) return cb && cb({ valido: false, error: 'Cupom só é válido a partir de ' + configHoje.inicio });
            if (configHoje.fim && horaAtualStr > configHoje.fim) return cb && cb({ valido: false, error: 'Cupom era válido apenas até as ' + configHoje.fim });
          }
        } catch (e) {}
      }

      const totalPedido = parseFloat(valor_total) || 0;
      const minimo = parseFloat(cupom.valor_minimo) || 0;
      if (minimo > 0 && totalPedido < minimo) {
        return cb && cb({ valido: false, error: 'Pedido mínimo de R$ ' + minimo.toFixed(2).replace('.', ',') + ' para este cupom.' });
      }

      let desconto = 0;
      if (cupom.valor_tipo === 'desconto_fixo') {
        desconto = Math.min(totalPedido, parseFloat(cupom.valor) || 0);
      } else if (cupom.valor_tipo === 'desconto_porcentagem' || cupom.valor_tipo === 'porcentagem') {
        desconto = Math.round((totalPedido * ((parseFloat(cupom.valor) || 0) / 100)) * 100) / 100;
      }

      let itensBrinde = [];
      try {
        if (cupom.itens_json) itensBrinde = typeof cupom.itens_json === 'string' ? JSON.parse(cupom.itens_json) : cupom.itens_json;
      } catch (e) {}

      return cb && cb({
        valido: true,
        cupom: {
          codigo: cupom.codigo,
          titulo: cupom.titulo || cupom.codigo,
          descricao: cupom.descricao || '',
          valor_tipo: cupom.valor_tipo,
          valor: cupom.valor,
          desconto: desconto,
          itens: itensBrinde,
          validade: cupom.validade,
          valor_minimo: minimo
        }
      });
    });
  });

  registerAdminRhEvents(socket);

};
