/**
 * caixa-overlay.js — Lógica de abertura/estado do caixa
 * Gerencia o overlay de caixa aberto/fechado via socket
 */
window.abrirCaixaClick = function () {
  var valInput = document.getElementById('fundo-troco');
  var val = valInput ? valInput.value : '100.00';
  var t = parseFloat(String(val).replace(',', '.'));
  if (isNaN(t)) t = 0;
  
  var operador = (window.crmPerfil && window.crmPerfil.nome) || localStorage.getItem('usuario_logado') || 'Caixa';
  var sock = (typeof window.socket !== 'undefined' && window.socket) ? window.socket : (typeof socket !== 'undefined' ? socket : null);
  
  var overlay = document.getElementById('caixa-overlay');
  var statusName = document.getElementById('status-caixa-name');
  if (overlay) overlay.style.display = 'none';
  if (statusName) statusName.innerText = 'Caixa Aberto';

  if (sock) {
    sock.emit('abrir_caixa', { fundo_troco: t, operador: operador });
  }

  fetch('/api/caixa/abrir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fundo_troco: t, operador: operador })
  }).catch(function(){});
};

document.addEventListener('DOMContentLoaded', function () {
  // Verificação HTTP imediata para não depender apenas de handshake de websocket
  fetch('/api/caixa/estado')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data && data.aberto) {
        var overlay = document.getElementById('caixa-overlay');
        var statusName = document.getElementById('status-caixa-name');
        if (overlay) overlay.style.display = 'none';
        if (statusName) statusName.innerText = 'Caixa Aberto';
        var sock = (typeof window.socket !== 'undefined' && window.socket) ? window.socket : (typeof socket !== 'undefined' ? socket : null);
        if (sock) sock.emit('get_mesas');
      }
    }).catch(function(){});

  function initSocketCaixa() {
    var sock = (typeof window.socket !== 'undefined' && window.socket) ? window.socket : (typeof socket !== 'undefined' ? socket : null);
    if (sock) {
      sock.on('estado_caixa', function (turno) {
        var overlay = document.getElementById('caixa-overlay');
        var statusName = document.getElementById('status-caixa-name');
        if (turno && (turno.status === 'Aberto' || turno.id || !turno.data_fechamento)) {
          if (overlay) overlay.style.display = 'none';
          if (statusName) statusName.innerText = 'Caixa Aberto';
          sock.emit('get_mesas');
        } else {
          if (overlay) overlay.style.display = 'flex';
          if (statusName) statusName.innerText = 'Caixa Fechado';
        }
      });
      sock.on('caixa_aberto_sucesso', function () {
        var overlay = document.getElementById('caixa-overlay');
        var statusName = document.getElementById('status-caixa-name');
        if (overlay) overlay.style.display = 'none';
        if (statusName) statusName.innerText = 'Caixa Aberto';
        sock.emit('get_mesas');
      });
      sock.emit('get_estado_caixa');
      sock.emit('get_mesas');
    } else {
      setTimeout(initSocketCaixa, 500);
    }
  }
  initSocketCaixa();
});

// ─── MODAL SANGRIA & SUPRIMENTO DE CAIXA ───
window.abrirModalSangria = function () {
  _abrirModalMovimentacaoCaixa('Sangria');
};

window.abrirModalSuprimento = function () {
  _abrirModalMovimentacaoCaixa('Suprimento');
};

function _abrirModalMovimentacaoCaixa(tipo) {
  var isSangria = tipo === 'Sangria';
  var corTema = isSangria ? '#ef4444' : '#10b981';
  var icone = isSangria ? 'ph-bold ph-money' : 'ph-bold ph-hand-coins';
  var titulo = isSangria ? 'Sangria de Caixa (Retirada)' : 'Suprimento de Caixa (Entrada)';
  var subtitulo = isSangria
    ? 'Registre saídas de dinheiro da gaveta (ex: depósito, pagamento a fornecedor).'
    : 'Registre entradas de dinheiro na gaveta (ex: reforço de troco).';

  var modalId = 'modal-movimentacao-caixa-dialog';
  var modal = document.getElementById(modalId);
  if (!modal) {
    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.7); backdrop-filter:blur(6px); z-index:999999; display:flex; align-items:center; justify-content:center; padding:16px;';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div style="background:var(--bg-card, #ffffff); border-radius:20px; width:100%; max-width:420px; box-shadow:0 20px 50px rgba(0,0,0,0.3); overflow:hidden; border:1px solid var(--border-color, #e2e8f0); color:var(--text-primary, #0f172a); font-family:'Inter', sans-serif;">
      <div style="padding:18px 20px; border-bottom:1px solid var(--border-color, #e2e8f0); display:flex; justify-content:space-between; align-items:center;">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:40px; height:40px; border-radius:12px; background:${corTema}18; color:${corTema}; display:flex; align-items:center; justify-content:center; font-size:22px;">
            <i class="${icone}"></i>
          </div>
          <div>
            <h3 style="margin:0; font-size:16px; font-weight:800;">${titulo}</h3>
            <span style="font-size:11.5px; color:var(--text-secondary, #64748b);">${tipo}</span>
          </div>
        </div>
        <button type="button" onclick="document.getElementById('${modalId}').style.display='none'" style="background:none; border:none; width:32px; height:32px; border-radius:50%; font-size:18px; color:var(--text-secondary, #64748b); cursor:pointer;">&times;</button>
      </div>

      <div style="padding:20px; display:flex; flex-direction:column; gap:14px;">
        <p style="margin:0; font-size:12.5px; color:var(--text-secondary, #64748b); line-height:1.4;">${subtitulo}</p>

        <div>
          <label style="display:block; font-size:12px; font-weight:700; margin-bottom:6px; color:var(--text-secondary, #64748b);">Valor (R$):</label>
          <div style="position:relative;">
            <span style="position:absolute; left:12px; top:50%; transform:translateY(-50%); font-weight:800; font-size:14px; color:${corTema};">R$</span>
            <input type="text" id="mov-caixa-input-valor" inputmode="decimal" placeholder="0,00" autofocus
              style="width:100%; box-sizing:border-box; padding:12px 14px 12px 38px; border-radius:10px; border:2px solid var(--border-color, #cbd5e1); font-size:16px; font-weight:800; color:var(--text-primary, #0f172a); background:var(--bg-main, #f8fafc); outline:none;" />
          </div>
        </div>

        <div>
          <label style="display:block; font-size:12px; font-weight:700; margin-bottom:6px; color:var(--text-secondary, #64748b);">Motivo / Justificativa:</label>
          <input type="text" id="mov-caixa-input-motivo" placeholder="${isSangria ? 'Ex: Depósito para cofre, pagamento de gelo...' : 'Ex: Aporte inicial de troco, troca de notas...'}"
            style="width:100%; box-sizing:border-box; padding:11px 12px; border-radius:10px; border:1px solid var(--border-color, #cbd5e1); font-size:13px; font-weight:600; color:var(--text-primary, #0f172a); background:var(--bg-main, #f8fafc); outline:none;" />
        </div>
      </div>

      <div style="padding:14px 20px; background:var(--bg-main, #f8fafc); border-top:1px solid var(--border-color, #e2e8f0); display:flex; justify-content:flex-end; gap:8px;">
        <button type="button" onclick="document.getElementById('${modalId}').style.display='none'"
          style="padding:10px 16px; border-radius:10px; border:1px solid var(--border-color, #cbd5e1); background:var(--bg-card, #ffffff); font-size:13px; font-weight:700; color:var(--text-secondary, #64748b); cursor:pointer;">
          Cancelar
        </button>
        <button type="button" id="btn-confirmar-mov-caixa"
          style="padding:10px 18px; border-radius:10px; border:none; background:${corTema}; color:#ffffff; font-size:13px; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
          Confirmar ${tipo}
        </button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';

  var inputVal = document.getElementById('mov-caixa-input-valor');
  if (inputVal) {
    setTimeout(function () { inputVal.focus(); }, 100);
    inputVal.addEventListener('input', function (e) {
      var v = e.target.value.replace(/\D/g, '');
      if (!v) { e.target.value = ''; return; }
      e.target.value = (parseInt(v, 10) / 100).toFixed(2).replace('.', ',');
    });
  }

  var btnConfirm = document.getElementById('btn-confirmar-mov-caixa');
  if (btnConfirm) {
    btnConfirm.onclick = function () {
      var rawVal = inputVal ? inputVal.value.replace(/\./g, '').replace(',', '.') : '0';
      var valor = parseFloat(rawVal) || 0;
      if (valor <= 0) {
        alert('Informe um valor válido maior que zero.');
        if (inputVal) inputVal.focus();
        return;
      }

      var motivoInput = document.getElementById('mov-caixa-input-motivo');
      var motivo = (motivoInput && motivoInput.value.trim()) || (isSangria ? 'Sangria de Caixa' : 'Suprimento de Caixa');

      function executarEnvio(operadorInfo) {
        var opNome = (operadorInfo && operadorInfo.nome) || (window.operadorAtivo && window.operadorAtivo.nome) || (window.crmPerfil && window.crmPerfil.nome) || localStorage.getItem('usuario_logado') || 'Caixa';
        var sock = (typeof window.socket !== 'undefined' && window.socket) ? window.socket : (typeof socket !== 'undefined' ? socket : null);

        if (sock) {
          sock.emit('movimentacao_caixa', {
            tipo: tipo,
            valor: valor,
            descricao: motivo,
            forma_pagamento: 'Dinheiro',
            operador: opNome
          });
          sock.emit('get_financeiro');
        }

        modal.style.display = 'none';

        var msgToast = (isSangria ? '🔻 Sangria de R$ ' : '🔺 Suprimento de R$ ') + valor.toFixed(2).replace('.', ',') + ' registrada com sucesso!';
        if (typeof window.showToast === 'function') {
          window.showToast(msgToast, isSangria ? '#ef4444' : '#10b981');
        } else if (typeof showToast === 'function') {
          showToast(msgToast, isSangria ? '#ef4444' : '#10b981');
        } else {
          alert(msgToast);
        }
      }

      if (isSangria && typeof window.exigirOperadorParaAcao === 'function') {
        window.exigirOperadorParaAcao('sangria', executarEnvio, { descricaoAcao: 'realizar Sangria de Caixa' });
      } else {
        executarEnvio(window.operadorAtivo);
      }
    };
  }
}

