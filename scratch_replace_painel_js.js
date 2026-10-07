const fs = require('fs');
let c = fs.readFileSync('painel-dono.js', 'utf8');

const t = `window.comandarCaixaAcao = function(acao, payload) {
  socket.emit('comando_caixa_acao', {
    acao: acao,
    payload: payload || {},
    solicitadoPor: loggedUser || 'Dono'
  });
  const labels = {
    'recarregar': '🔄 Recarregando terminal do Caixa (F5)...',
    'bloquear_tela': '🔒 Bloqueio de segurança enviado ao Caixa!',
    'tocar_alerta': '🔔 Alerta sonoro tocando no Caixa!',
    'alternar_tema': '🌓 Tema do Caixa alternado!',
    'abrir_gaveta': '🖨️ Gaveta de dinheiro acionada!',
    'abrir_fila': '🪑 Fila de espera aberta no Caixa!'
  };
  showToast(labels[acao] || \`Comando \${acao} enviado ao Caixa!\`, 'ph-lightning');
  adicionarAoFeed('aviso', \`Comando executado no Caixa: \${labels[acao] || acao}\`);
};`;

const r = `window.comandarCaixaAcao = function(acao, payload) {
  if (acao === 'enviar_aviso') {
    const msg = prompt('Digite a mensagem a ser enviada para a tela do caixa:');
    if (!msg) return;
    payload = { mensagem: msg };
  }
  socket.emit('comando_caixa_acao', {
    acao: acao,
    payload: payload || {},
    solicitadoPor: loggedUser || 'Dono'
  });
  const labels = {
    'recarregar': '🔄 Recarregando terminal do Caixa (F5)...',
    'bloquear_tela': '🔒 Bloqueio de segurança enviado ao Caixa!',
    'tocar_alerta': '🔔 Alerta sonoro tocando no Caixa!',
    'alternar_tema': '🌓 Tema do Caixa alternado!',
    'abrir_gaveta': '🖨️ Gaveta de dinheiro acionada!',
    'abrir_fila': '🪑 Fila de espera aberta no Caixa!',
    'apagar_tela': '🔌 Comando de Standby (Apagar Tela) enviado!',
    'enviar_aviso': '💬 Aviso importante enviado para a tela do Caixa!'
  };
  showToast(labels[acao] || \`Comando \${acao} enviado ao Caixa!\`, 'ph-lightning');
  adicionarAoFeed('aviso', \`Comando executado no Caixa: \${labels[acao] || acao}\`);
};

window.abrirModalAuditoria = function(tipo) {
  alert('Funcionalidade "Auditoria de ' + tipo + '" será detalhada aqui (Heatmap, Histórico de Descontos, Cancelamentos).');
};`;

c = c.replace(t, r);
fs.writeFileSync('painel-dono.js', c);
console.log('JS Replace OK!');
