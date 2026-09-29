/**
 * chef-modal.js — Confirm/Prompt customizados substituindo alert/confirm/prompt nativos
 *
 * Uso:
 *   const ok = await window.chefConfirm('Titulo', 'Mensagem', { danger: true });
 *   const val = await window.chefPrompt('Titulo', 'Mensagem', 'default', { inputType: 'number' });
 */
(function() {
  var overlay = document.getElementById('chef-modal');
  var titleEl = document.getElementById('chef-modal-title');
  var msgEl = document.getElementById('chef-modal-msg');
  var inputEl = document.getElementById('chef-modal-input');
  var cancelBtn = document.getElementById('chef-modal-cancel');
  var okBtn = document.getElementById('chef-modal-ok');

  window._chefModalResolve = window._chefModalResolve || function(val) {
    if (overlay) {
      overlay.style.display = 'none';
      overlay.classList.remove('show');
    }
  };

  function showModal(title, msg, opts) {

    return new Promise(function(resolve) {
      window._chefModalResolve = function(val) {
        overlay.style.display = 'none';
        overlay.classList.remove('show');
        resolve(val);
      };
      titleEl.textContent = title || '';
      msgEl.textContent = msg || '';
      msgEl.style.display = msg ? 'block' : 'none';

      if (opts && opts.input) {
        inputEl.style.display = 'block';
        inputEl.value = opts.inputDefault || '';
        inputEl.type = opts.inputType || 'text';
        inputEl.placeholder = opts.inputPlaceholder || '';
        setTimeout(function() { inputEl.focus(); }, 100);
      } else {
        inputEl.style.display = 'none';
      }

      if (opts && opts.danger) {
        okBtn.className = 'chef-modal-btn chef-modal-btn-danger';
        okBtn.textContent = opts.okText || 'Confirmar';
      } else {
        okBtn.className = 'chef-modal-btn chef-modal-btn-ok';
        okBtn.textContent = opts && opts.okText ? opts.okText : 'Confirmar';
      }
      if (opts && opts.cancelText) cancelBtn.textContent = opts.cancelText;
      else cancelBtn.textContent = 'Cancelar';
      if (opts && opts.hideCancel) cancelBtn.style.display = 'none';
      else cancelBtn.style.display = '';

      overlay.style.display = 'flex';
      requestAnimationFrame(function() { overlay.classList.add('show'); });

      if (opts && opts.input) {
        inputEl.onkeydown = function(e) {
          if (e.key === 'Enter') window._chefModalResolve(inputEl.value);
          if (e.key === 'Escape') window._chefModalResolve(null);
        };
      } else {
        overlay.onkeydown = function(e) {
          if (e.key === 'Escape') window._chefModalResolve(false);
        };
      }
    });
  }

  window.chefConfirm = function(title, msg, opts) { return showModal(title, msg, opts); };
  window.chefPrompt = function(title, msg, defaultVal, opts) {
    return showModal(title, msg, Object.assign({ input: true, inputDefault: defaultVal || '' }, opts || {})).then(function(val) { return val === null ? null : val; });
  };
})();
