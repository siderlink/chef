// cadastro.js — Cadastro de Colaborador via QR Code de Convite
// O restaurante vem EXCLUSIVAMENTE do parâmetro na URL gerado pelo QR Code.
// O colaborador NÃO escolhe cargo nem restaurante; isso é definido pelo gerente ao aprovar.

(function () {
  'use strict';

  /* ── Variáveis de estado ── */
  let _restauranteId   = null;
  let _restauranteNome = '';

  /* ── Elementos DOM ── */
  const elBadge      = document.getElementById('badge-restaurante');
  const elBadgeErro  = document.getElementById('badge-erro-qr');
  const elLabelNome  = document.getElementById('label-restaurante-nome');
  const elCampos     = document.getElementById('campos-cadastro');
  const elBtnReg     = document.getElementById('btn-register');

  /* ── Socket.IO ── */
  const socket = io();

  /* ────────────────────────────────────────────
     INICIALIZAÇÃO: lê o QR-code param e valida
  ─────────────────────────────────────────────*/
  async function inicializar() {
    const params   = new URLSearchParams(window.location.search);
    // Parâmetros suportados no link de convite
    const ridRaw   = params.get('restaurante_id')
                  || params.get('rid')
                  || params.get('id')
                  || params.get('codigo')
                  || params.get('slug');

    if (!ridRaw) {
      // Sem parâmetro → exibe erro, esconde formulário
      mostrarErroQR();
      return;
    }

    try {
      const res  = await fetch('/api/restaurante/info-publica?id=' + encodeURIComponent(ridRaw));
      const data = await res.json();

      if (data && data.success && data.restaurante) {
        _restauranteId   = data.restaurante.id;
        _restauranteNome = data.restaurante.nome;
        localStorage.setItem('restaurante_id', String(_restauranteId));

        if (elLabelNome) elLabelNome.textContent = _restauranteNome;
        if (elBadge)     elBadge.style.display   = 'flex';
        if (elBadgeErro) elBadgeErro.style.display = 'none';
        if (elCampos)    elCampos.style.display   = 'block';
      } else {
        mostrarErroQR();
      }
    } catch (err) {
      console.warn('[Cadastro] Erro ao consultar restaurante:', err);
      mostrarErroQR();
    }
  }

  function mostrarErroQR() {
    if (elBadge)     elBadge.style.display    = 'none';
    if (elBadgeErro) elBadgeErro.style.display = 'flex';
    if (elCampos)    elCampos.style.display    = 'none';
  }

  /* ────────────────────────────────────────────
     ENVIO DO CADASTRO
  ─────────────────────────────────────────────*/
  if (elBtnReg) {
    elBtnReg.addEventListener('click', () => {
      const nome    = (document.getElementById('reg-nome')?.value  || '').trim();
      const usuario = (document.getElementById('reg-user')?.value  || '').trim();
      const senha   = (document.getElementById('reg-pass')?.value  || '').trim();

      if (!_restauranteId) {
        alert('Link de convite inválido. Use o QR Code do seu restaurante.');
        return;
      }

      if (!nome || !usuario || !senha) {
        alert('Preencha nome, usuário e senha antes de continuar.');
        return;
      }

      if (senha.length < 4) {
        alert('A senha deve ter pelo menos 4 caracteres.');
        return;
      }

      // Desabilita botão e mostra loading
      elBtnReg.disabled   = true;
      elBtnReg.innerHTML  = '<span class="spin" style="display:inline-block;animation:spin 0.8s infinite linear;"><i class="ph ph-spinner-gap"></i></span> Enviando...';

      // O cargo será definido pelo gerente na aprovação
      socket.emit('cadastro_funcionario', {
        nome,
        usuario,
        senha,
        cargo: 'Colaborador',   // placeholder; gerente define ao aprovar
        pin: null,
        restaurante_id: _restauranteId
      });
    });
  }

  /* ────────────────────────────────────────────
     RESPOSTAS DO SERVIDOR
  ─────────────────────────────────────────────*/
  socket.on('cadastro_sucesso', (data) => {
    const nomeRest = (data && data.restaurante_nome) || _restauranteNome || 'Restaurante #' + _restauranteId;

    // Atualiza view de sucesso
    const elSuccessNome = document.getElementById('success-rest-nome');
    const elSubtitle    = document.getElementById('success-subtitle');

    if (elSuccessNome) elSuccessNome.textContent = nomeRest;
    if (elSubtitle) {
      elSubtitle.innerHTML =
        `Sua solicitação foi enviada com sucesso para <strong>${nomeRest}</strong>.<br>
         Aguarde o gerente aprovar seu acesso para conseguir entrar.`;
    }

    // Troca de view
    const viewReg     = document.getElementById('register-view');
    const viewSuccess = document.getElementById('success-view');
    if (viewReg)     viewReg.style.display     = 'none';
    if (viewSuccess) viewSuccess.style.display = 'flex';
  });

  socket.on('cadastro_erro', (msg) => {
    alert('❌ ' + (msg || 'Ocorreu um erro. Tente novamente.'));
    if (elBtnReg) {
      elBtnReg.disabled  = false;
      elBtnReg.innerHTML = 'Enviar Cadastro';
    }
  });

  /* ── Inicializa ao carregar ── */
  document.addEventListener('DOMContentLoaded', inicializar);
})();
