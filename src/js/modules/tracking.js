let _trackingFuncId = null;
let _trackingInterval = null;
const _trackingQueue = { click: 0, insert: 0 };
let _trackingEnabled = false;

function initTracking(funcionarioId) {
  if (!funcionarioId) return;
  _trackingFuncId = funcionarioId;
  _trackingEnabled = true;

  if (_trackingInterval) clearInterval(_trackingInterval);
  _trackingInterval = setInterval(flushTracking, 30000);

  document.addEventListener('click', handleTrackingClick, true);
}

function stopTracking() {
  _trackingEnabled = false;
  _trackingFuncId = null;
  if (_trackingInterval) { clearInterval(_trackingInterval); _trackingInterval = null; }
  document.removeEventListener('click', handleTrackingClick, true);
}

function handleTrackingClick(e) {
  if (!_trackingEnabled || !_trackingFuncId) return;
  const target = e.target.closest('button, a, [role="button"], .clickable');
  if (!target) return;
  _trackingQueue.click++;
}

function trackInsertion() {
  if (!_trackingEnabled || !_trackingFuncId) return;
  _trackingQueue.insert++;
}

function flushTracking() {
  if (!_trackingEnabled || !_trackingFuncId) return;
  const totalClick = _trackingQueue.click;
  const totalInsert = _trackingQueue.insert;
  if (totalClick === 0 && totalInsert === 0) return;
  _trackingQueue.click = 0;
  _trackingQueue.insert = 0;
  if (typeof socket !== 'undefined' && socket) {
    if (totalClick > 0) socket.emit('log_atividade_funcionario', { funcionario_id: _trackingFuncId, tipo: 'click', pagina: window.location.pathname, acao: 'click' });
    if (totalInsert > 0) socket.emit('log_atividade_funcionario', { funcionario_id: _trackingFuncId, tipo: 'insert', pagina: window.location.pathname, acao: 'insert' });
  }
}
