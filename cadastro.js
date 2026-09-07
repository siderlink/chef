// cadastro.js - Cadastro de Colaborador com Vínculo Explícito ao Restaurante
let _targetRestauranteId = null;
let _targetRestauranteNome = '';

const urlParams = new URLSearchParams(window.location.search);
const ridFromUrl = urlParams.get('restaurante_id') || urlParams.get('id') || urlParams.get('codigo') || urlParams.get('slug');

const socket = io();

// Carregar e validar restaurante
async function inicializarRestaurante() {
  const badge = document.getElementById('badge-restaurante-alvo');
  const groupSelect = document.getElementById('group-selecao-restaurante');
  const labelNome = document.getElementById('label-restaurante-nome');
  const select = document.getElementById('reg-restaurante-select');

  if (ridFromUrl) {
    try {
      const res = await fetch('/api/restaurante/info-publica?id=' + encodeURIComponent(ridFromUrl));
      const data = await res.json();
      if (data && data.success && data.restaurante) {
        _targetRestauranteId = data.restaurante.id;
        _targetRestauranteNome = data.restaurante.nome;
        localStorage.setItem('restaurante_id', String(_targetRestauranteId));

        if (badge) badge.style.display = 'flex';
        if (groupSelect) groupSelect.style.display = 'none';
        if (labelNome) {
          labelNome.innerHTML = `${_targetRestauranteNome} <span style="font-size:11px; color:#10b981; font-weight:700; margin-left:6px;">(Unidade #${_targetRestauranteId})</span>`;
        }
        return;
      }
    } catch(e) {
      console.warn('[Cadastro] Erro ao buscar dados do restaurante da URL:', e);
    }
  }

  // Se não veio na URL ou falhou, exibe seletor de restaurantes
  try {
    const res = await fetch('/api/restaurante/info-publica?todos=1');
    const data = await res.json();
    if (select && data && data.restaurantes && data.restaurantes.length > 0) {
      select.innerHTML = '<option value="">-- Escolha o Restaurante / Empresa --</option>';
      data.restaurantes.forEach(r => {
        select.innerHTML += `<option value="${r.id}">${r.nome} (Código #${r.id})</option>`;
      });

      if (badge) badge.style.display = 'none';
      if (groupSelect) groupSelect.style.display = 'block';

      select.addEventListener('change', () => {
        const val = select.value;
        if (val) {
          _targetRestauranteId = parseInt(val, 10);
          _targetRestauranteNome = select.options[select.selectedIndex].text.split('(')[0].trim();
          localStorage.setItem('restaurante_id', String(_targetRestauranteId));
        } else {
          _targetRestauranteId = null;
          _targetRestauranteNome = '';
        }
      });

      // Se há apenas 1 restaurante no sistema, pré-seleciona
      if (data.restaurantes.length === 1) {
        select.value = data.restaurantes[0].id;
        _targetRestauranteId = data.restaurantes[0].id;
        _targetRestauranteNome = data.restaurantes[0].nome;
      }
    } else {
      if (groupSelect) groupSelect.style.display = 'block';
      if (select) select.innerHTML = '<option value="1">Restaurante Principal (Unidade #1)</option>';
      _targetRestauranteId = 1;
      _targetRestauranteNome = 'Restaurante Principal';
    }
  } catch (err) {
    if (groupSelect) groupSelect.style.display = 'block';
    if (select) select.innerHTML = '<option value="1">Restaurante Principal (Unidade #1)</option>';
    _targetRestauranteId = 1;
    _targetRestauranteNome = 'Restaurante Principal';
  }
}

document.addEventListener('DOMContentLoaded', inicializarRestaurante);

document.getElementById('btn-register').onclick = () => {
  const nome = document.getElementById('reg-nome').value.trim();
  const usuario = document.getElementById('reg-user').value.trim();
  const senha = document.getElementById('reg-pass').value.trim();
  const cargo = document.getElementById('reg-cargo') ? document.getElementById('reg-cargo').value : 'Garçom';
  const pin = document.getElementById('reg-pin') ? document.getElementById('reg-pin').value.trim() : '';

  if (!_targetRestauranteId) {
    alert('Por favor, selecione para qual restaurante você está se cadastrando!');
    document.getElementById('reg-restaurante-select')?.focus();
    return;
  }

  if (!nome || !usuario || !senha) {
    alert('Por favor, preencha nome, usuário e senha!');
    return;
  }

  if (pin && (pin.length < 4 || isNaN(pin))) {
    alert('O PIN deve conter entre 4 e 6 números!');
    return;
  }

  const btn = document.getElementById('btn-register');
  btn.innerHTML = '<i class="ph ph-spinner-gap" style="animation: spin 1s infinite linear;"></i> ENVIANDO...';
  btn.disabled = true;

  socket.emit('cadastro_funcionario', {
    nome,
    usuario,
    senha,
    cargo,
    pin: pin || null,
    restaurante_id: _targetRestauranteId
  });
};

socket.on('cadastro_sucesso', (data) => {
  document.getElementById('register-view').style.display = 'none';
  document.getElementById('success-view').style.display = 'flex';
  
  const restNome = (data && data.restaurante_nome) || _targetRestauranteNome || 'Restaurante #' + _targetRestauranteId;
  const elRestNome = document.getElementById('success-rest-nome');
  if (elRestNome) {
    elRestNome.textContent = restNome;
  }
  const sub = document.getElementById('success-subtitle');
  if (sub) {
    sub.innerHTML = `Sua solicitação de acesso foi enviada com sucesso para <strong>${restNome}</strong>.<br>Aguarde o gerente ou caixa aprovar o seu perfil para entrar.`;
  }
});

socket.on('cadastro_erro', (msg) => {
  alert('❌ ' + msg);
  const btn = document.getElementById('btn-register');
  btn.innerHTML = 'Enviar Cadastro';
  btn.disabled = false;
});
