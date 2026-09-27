
// ─── MODAL DE ESCOLHA DE ESTAÇÃO DE TRABALHO (QUANDO HÁ MÚLTIPLAS PERMISSÕES / PROPRIETÁRIO) ───
window.abrirModalEscolhaEstacao = function(data) {
  let modal = document.getElementById('modal-escolha-estacao');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-escolha-estacao';
    modal.style.cssText = 'position:fixed; inset:0; z-index:10000; background:rgba(15,23,42,0.7); backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; padding:16px;';
    document.body.appendChild(modal);
  }

  const estacoes = data.estacoes || ['gestao', 'caixa', 'garcom', 'cozinha', 'configuracoes', 'delivery'];
  const nomeColab = data.nome || 'Proprietário';
  const isDono = data.is_dono || data.role === 'dono' || data.role === 'admin';

  const caixaUrl = localStorage.getItem('chef_caixa_versao') === 'v1' ? '/caixa-classico.html' : '/index.html';
  const estacoesConfig = {
    gestao: { titulo: 'Painel do Dono & Gestão', sub: 'Relatórios, Faturamento e Métricas DRE', icone: 'ph-crown', cor: '#a855f7', url: '/painel-dono.html' },
    caixa: { titulo: 'Terminal de Caixa (PDV)', sub: 'Operação de Caixa, Fechamento e Pagamentos', icone: 'ph-desktop', cor: '#3b82f6', url: caixaUrl },
    caixa_mobile: { titulo: 'Caixa Mobile (Touch Celular)', sub: 'Operação de Caixa rápida para smartphone', icone: 'ph-device-mobile', cor: '#fc4b15', url: '/pdv-mobile.html' },
    garcom: { titulo: 'Salão de Mesas & App Garçom', sub: 'Atendimento, Comandas e Pedidos no Salão', icone: 'ph-fork-knife', cor: '#fc4b15', url: '/garcom.html' },
    cozinha: { titulo: 'KDS Cozinha & Bar', sub: 'Fila de Pedidos e Controle de Produção', icone: 'ph-fire', cor: '#10b981', url: '/fila-pedidos.html' },
    configuracoes: { titulo: 'Configurações & Cardápio', sub: 'Cadastros, Módulos, Impressoras e RH', icone: 'ph-gear', cor: '#0284c7', url: '/configuracoes.html' },
    delivery: { titulo: 'Hub de Entregas & Delivery', sub: 'Rastreio de Motoboys e Expedição', icone: 'ph-moped', cor: '#f59e0b', url: '/hub-delivery.html' }
  };

  let cardsHtml = '';
  estacoes.forEach(est => {
    const cfg = estacoesConfig[est];
    if (cfg) {
      cardsHtml += `
        <button type="button" onclick="window.selecionarEstacaoTrabalho('${cfg.url}', '${est}')" style="display:flex; align-items:center; gap:16px; width:100%; padding:14px 16px; background:#ffffff; border:1.5px solid #e2e8f0; border-radius:16px; cursor:pointer; text-align:left; transition:all 0.15s; margin-bottom:8px; box-shadow:0 2px 6px rgba(0,0,0,0.03);">
          <div style="width:46px; height:46px; border-radius:14px; background:${cfg.cor}18; color:${cfg.cor}; display:flex; align-items:center; justify-content:center; font-size:24px; flex-shrink:0;">
            <i class="ph-bold ${cfg.icone}"></i>
          </div>
          <div style="flex:1; min-width:0;">
            <strong style="display:block; font-size:15px; color:#0f172a; margin-bottom:2px;">${cfg.titulo}</strong>
            <span style="font-size:12px; color:#64748b;">${cfg.sub}</span>
          </div>
          <i class="ph-bold ph-arrow-right" style="color:#94a3b8; font-size:18px;"></i>
        </button>
      `;
    }
  });

  const headerBadge = isDono 
    ? `<div style="width:56px; height:56px; border-radius:18px; background:rgba(168,85,247,0.12); color:#a855f7; display:flex; align-items:center; justify-content:center; font-size:30px; margin:0 auto 14px;"><i class="ph-bold ph-crown"></i></div>`
    : `<div style="width:56px; height:56px; border-radius:18px; background:rgba(37,99,235,0.12); color:#2563eb; display:flex; align-items:center; justify-content:center; font-size:30px; margin:0 auto 14px;"><i class="ph-bold ph-identification-badge"></i></div>`;

  const subTexto = isDono 
    ? 'Acesso Master Validado. Escolha qual setor deseja operar agora:' 
    : 'Selecione a estação de trabalho autorizada para seu turno:';

  modal.innerHTML = `
    <div style="background:#ffffff; border-radius:24px; padding:26px 22px; width:100%; max-width:480px; box-shadow:0 24px 60px rgba(0,0,0,0.3); text-align:center; box-sizing:border-box;">
      ${headerBadge}
      <h2 style="font-size:21px; font-weight:800; color:#0f172a; margin-bottom:4px;">Olá, ${nomeColab}!</h2>
      <p style="color:#64748b; font-size:13px; margin-bottom:18px;">${subTexto}</p>
      
      <div style="display:flex; flex-direction:column; gap:2px; max-height:58vh; overflow-y:auto; padding-right:2px;">
        ${cardsHtml}
      </div>

      <button onclick="document.getElementById('modal-escolha-estacao').style.display='none'" style="margin-top:14px; background:transparent; border:none; color:#94a3b8; font-weight:700; font-size:13px; cursor:pointer;">
        Voltar ao Login
      </button>
    </div>
  `;
  modal.style.display = 'flex';
};

window.selecionarEstacaoTrabalho = function(url, estacaoNome) {
  localStorage.setItem('chef_estacao_atual', estacaoNome);
  window.location.href = url;
};


let _tipoPerfil = 'owner'; // 'owner' ou 'colaborador'
let _modoColaborador = 'pin'; // 'pin' ou 'user'
let _loginResAtual = null;

// ─── MODAL DE ESCOLHA DE ESTAÇÃO DE TRABALHO (QUANDO HÁ MÚLTIPLAS PERMISSÕES) ───
window.abrirModalEscolhaEstacao = function(data) {
  let modal = document.getElementById('modal-escolha-estacao');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-escolha-estacao';
    modal.style.cssText = 'position:fixed; inset:0; z-index:10000; background:rgba(15,23,42,0.6); backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; padding:16px;';
    document.body.appendChild(modal);
  }

  const estacoes = data.estacoes || ['garcom'];
  const nomeColab = data.nome || 'Colaborador';

  const caixaUrl = localStorage.getItem('chef_caixa_versao') === 'v1' ? '/caixa-classico.html' : '/index.html';
  const estacoesConfig = {
    garcom: { titulo: 'Salão de Mesas & Comandas', sub: 'Atendimento e Lançamento de Pedidos', icone: 'ph-fork-knife', cor: '#fc4b15', url: '/garcom.html' },
    caixa: { titulo: 'Terminal de Caixa (PDV)', sub: 'Operação de Caixa, Fechamento e Pagamentos', icone: 'ph-desktop', cor: '#3b82f6', url: caixaUrl },
    caixa_mobile: { titulo: 'Caixa Mobile (Touch Celular)', sub: 'Operação de Caixa rápida para smartphone', icone: 'ph-device-mobile', cor: '#fc4b15', url: '/pdv-mobile.html' },
    cozinha: { titulo: 'KDS Cozinha & Preparo', sub: 'Fila de Pedidos e Controle de Produção', icone: 'ph-fire', cor: '#10b981', url: '/fila-pedidos.html' },
    gestao: { titulo: 'Painel do Dono & Gestão', sub: 'Relatórios, Faturamento e Configurações', icone: 'ph-crown', cor: '#a855f7', url: '/painel-dono.html' }
  };

  let cardsHtml = '';
  estacoes.forEach(est => {
    const cfg = estacoesConfig[est];
    if (cfg) {
      cardsHtml += `
        <button type="button" onclick="window.selecionarEstacaoTrabalho('${cfg.url}', '${est}')" style="display:flex; align-items:center; gap:16px; width:100%; padding:16px; background:#f8fafc; border:2px solid #e2e8f0; border-radius:16px; cursor:pointer; text-align:left; transition:all 0.15s; margin-bottom:10px;">
          <div style="width:50px; height:50px; border-radius:14px; background:${cfg.cor}18; color:${cfg.cor}; display:flex; align-items:center; justify-content:center; font-size:26px; flex-shrink:0;">
            <i class="ph-bold ${cfg.icone}"></i>
          </div>
          <div style="flex:1; min-width:0;">
            <strong style="display:block; font-size:16px; color:#0f172a; margin-bottom:2px;">${cfg.titulo}</strong>
            <span style="font-size:12.5px; color:#64748b;">${cfg.sub}</span>
          </div>
          <i class="ph-bold ph-arrow-right" style="color:#94a3b8; font-size:20px;"></i>
        </button>
      `;
    }
  });

  modal.innerHTML = `
    <div style="background:#ffffff; border-radius:24px; padding:28px; width:100%; max-width:480px; box-shadow:0 20px 50px rgba(0,0,0,0.25); text-align:center;">
      <div style="width:56px; height:56px; border-radius:18px; background:rgba(37,99,235,0.1); color:#2563eb; display:flex; align-items:center; justify-content:center; font-size:30px; margin:0 auto 16px;">
        <i class="ph-bold ph-identification-badge"></i>
      </div>
      <h2 style="font-size:22px; font-weight:800; color:#0f172a; margin-bottom:6px;">Olá, ${nomeColab}!</h2>
      <p style="color:#64748b; font-size:13.5px; margin-bottom:20px;">Selecione a estação de trabalho autorizada para seu turno:</p>
      
      <div style="display:flex; flex-direction:column; gap:4px; max-height:55vh; overflow-y:auto;">
        ${cardsHtml}
      </div>

      <button onclick="document.getElementById('modal-escolha-estacao').style.display='none'" style="margin-top:14px; background:transparent; border:none; color:#94a3b8; font-weight:700; font-size:13px; cursor:pointer;">
        Cancelar
      </button>
    </div>
  `;
  modal.style.display = 'flex';
};

window.selecionarEstacaoTrabalho = function(url, estacaoNome) {
  localStorage.setItem('chef_estacao_atual', estacaoNome);
  window.location.href = url;
};

window.setTipoPerfil = function(tipo) {
  _tipoPerfil = tipo;
  const btnOwner = document.getElementById('tab-login-owner');
  const btnParear = document.getElementById('tab-login-parear');
  const btnColab = document.getElementById('tab-login-colaborador');
  const formOwner = document.getElementById('form-owner-side');
  const formParear = document.getElementById('form-pareamento-side');
  const formColab = document.getElementById('form-colaborador-side');
  const title = document.getElementById('login-title');
  const subtitle = document.getElementById('login-subtitle');

  // Reset visual das abas
  [btnOwner, btnParear, btnColab].forEach(btn => {
    if (btn) { btn.style.background = 'transparent'; btn.style.color = 'var(--text-muted)'; btn.style.fontWeight = '700'; }
  });
  if (formOwner) formOwner.style.display = 'none';
  if (formParear) formParear.style.display = 'none';
  if (formColab) formColab.style.display = 'none';

  if (tipo === 'owner') {
    if (btnOwner) { btnOwner.style.background = 'var(--primary)'; btnOwner.style.color = 'white'; btnOwner.style.fontWeight = '800'; }
    if (formOwner) formOwner.style.display = 'block';
    if (title) title.innerText = 'Painel do Proprietário';
    if (subtitle) subtitle.innerText = 'Acesse a gestão, relatórios e controle financeiro.';
  } else if (tipo === 'pareamento') {
    if (btnParear) { btnParear.style.background = '#2563eb'; btnParear.style.color = 'white'; btnParear.style.fontWeight = '800'; }
    if (formParear) formParear.style.display = 'block';
    if (title) title.innerText = 'Liberar Aparelho (Zero Senha)';
    if (subtitle) subtitle.innerText = 'O Dono autoriza este aparelho pelo celular dele sem você precisar de senha.';
    ensureLoginSocket();
    iniciarPareamentoTerminal();
  } else {
    if (btnColab) { btnColab.style.background = '#2563eb'; btnColab.style.color = 'white'; btnColab.style.fontWeight = '800'; }
    if (formColab) formColab.style.display = 'block';
    if (title) title.innerText = 'Acesso do Colaborador';
    if (subtitle) subtitle.innerText = 'Digite seu PIN ou usuário para abrir suas rotas operacionais.';
    ensureLoginSocket();
  }
};

window.setModoColaborador = function(modo) {
  _modoColaborador = modo;
  const btnPin = document.getElementById('btn-colab-mode-pin');
  const btnUser = document.getElementById('btn-colab-mode-user');
  const pinBox = document.getElementById('colab-pin-box');
  const userBox = document.getElementById('colab-user-box');

  if (modo === 'pin') {
    if (btnPin) { btnPin.style.background = 'rgba(37,99,235,0.12)'; btnPin.style.color = '#2563eb'; btnPin.style.borderColor = 'rgba(37,99,235,0.3)'; }
    if (btnUser) { btnUser.style.background = '#f1f5f9'; btnUser.style.color = '#64748b'; btnUser.style.borderColor = '#e2e8f0'; }
    if (pinBox) pinBox.style.display = 'block';
    if (userBox) userBox.style.display = 'none';
    document.getElementById('colab-pin-input')?.focus();
  } else {
    if (btnPin) { btnPin.style.background = '#f1f5f9'; btnPin.style.color = '#64748b'; btnPin.style.borderColor = '#e2e8f0'; }
    if (btnUser) { btnUser.style.background = 'rgba(37,99,235,0.12)'; btnUser.style.color = '#2563eb'; btnUser.style.borderColor = 'rgba(37,99,235,0.3)'; }
    if (pinBox) pinBox.style.display = 'none';
    if (userBox) userBox.style.display = 'block';
    document.getElementById('colab-user-input')?.focus();
  }
};

function vibrar(ms) {
  try { if (navigator.vibrate) navigator.vibrate(ms || 10); } catch (e) {}
}

// ─── LOGIN DO OWNER / PROPRIETÁRIO ───
window.attemptOwnerLogin = async function() {
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const errorMsg = document.getElementById('error-msg');
  const btnSubmit = document.getElementById('btn-submit');

  const email = usernameInput.value.trim();
  const senha = passwordInput.value.trim();
  if (!email || !senha) {
    errorMsg.innerText = 'Preencha usuário/e-mail e senha!';
    errorMsg.style.display = 'block';
    return;
  }

  errorMsg.style.display = 'none';
  btnSubmit.innerText = 'Autenticando...';
  btnSubmit.disabled = true;

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha })
    });
    const res = await response.json();

    if (res.success) {
      const estacoesDono = res.estacoes || ['gestao', 'caixa', 'garcom', 'cozinha', 'configuracoes', 'delivery'];
      
      localStorage.setItem('chef_token', res.token);
      localStorage.setItem('restaurante_id', String(res.restaurante_id || 1));
      localStorage.setItem('usuario_role', res.role || 'dono');
      localStorage.setItem('colaborador_cargo', res.role || 'dono');
      localStorage.setItem('usuario_logado', res.nome || 'Proprietário Master');
      localStorage.setItem('chef_operador_nome', res.nome || 'Proprietário Master');
      localStorage.setItem('chef_operador_cargo', res.role || 'dono');
      localStorage.setItem('chef_is_dono', 'true');
      localStorage.setItem('chef_permissoes_estacoes', JSON.stringify(estacoesDono));
      const credsObj = {
        id: res.id || null,
        cargo: res.role || 'dono',
        role: res.role || 'dono',
        nome: res.nome || 'Proprietário Master',
        usuario: res.usuario || email,
        is_dono: true,
        estacoes: estacoesDono
      };
      localStorage.setItem('chef_credentials', JSON.stringify(credsObj));
      localStorage.setItem('chef_operador_atual', JSON.stringify(credsObj));

      vibrar([10, 40, 10]);

      // Proprietário tem acesso a todas as estações: abre direto o seletor de setor
      btnSubmit.innerText = 'Acesso Liberado!';
      window.abrirModalEscolhaEstacao({
        nome: res.nome || 'Proprietário',
        is_dono: true,
        role: res.role || 'dono',
        estacoes: estacoesDono
      });
      return;
    } else {
      errorMsg.innerText = res.error || 'PIN ou credencial inválida.';
      errorMsg.style.display = 'block';
      btnSubmit.innerText = 'Validar e Entrar';
      btnSubmit.disabled = false;
    }
  } catch (err) {
    errorMsg.innerText = 'Erro ao conectar no servidor.';
    errorMsg.style.display = 'block';
    btnSubmit.innerText = 'Validar e Entrar';
    btnSubmit.disabled = false;
  }
};

let loginSocket = null;

function ensureLoginSocket() {
  if (!loginSocket && typeof io !== 'undefined') {
    loginSocket = io();
    
    loginSocket.on('login_success', (res) => {
      const cargo = (res.cargo || '').toLowerCase();
      let estacoes = [];
      if (cargo === 'garçom' || cargo === 'garcom' || cargo === 'atendente') {
        estacoes = ['garcom'];
      } else if (['cozinha', 'copa', 'bar', 'kds'].includes(cargo)) {
        estacoes = ['cozinha'];
      } else if (cargo === 'caixa') {
        estacoes = ['caixa', 'garcom'];
      } else if (['admin', 'administrador', 'gerente', 'supervisor'].includes(cargo)) {
        estacoes = ['caixa', 'garcom', 'cozinha', 'configuracoes', 'delivery'];
      } else {
        estacoes = ['garcom', 'cozinha'];
      }

      const tempToken = localStorage.getItem('temp_login_token') || '';
      localStorage.setItem('chef_token', tempToken);
      localStorage.setItem('restaurante_id', String(res.restaurante_id || 1));
      localStorage.setItem('usuario_role', res.cargo || 'garcom');
      localStorage.setItem('colaborador_cargo', res.cargo || 'garcom');
      localStorage.setItem('usuario_logado', res.nome || 'Colaborador');
      localStorage.setItem('chef_is_dono', 'false');
      
      const payload = {
        id: res.id || null,
        nome: res.nome || 'Colaborador',
        cargo: res.cargo || 'Garçom',
        is_dono: false,
        estacoes: estacoes,
        token: tempToken
      };
      
      localStorage.setItem('chef_credentials', JSON.stringify(payload));
      localStorage.setItem('chef_session', JSON.stringify({
        token: tempToken,
        usuario: res.usuario || '',
        cargo: res.cargo || '',
        nome: res.nome || '',
        id: res.id || ''
      }));
      
      const btnSubmit = document.getElementById('btn-submit-colaborador');
      if (btnSubmit) {
        btnSubmit.innerText = 'Validar e Entrar';
        btnSubmit.disabled = false;
      }
      
      if (estacoes.length === 1) {
        const caixaTarget = localStorage.getItem('chef_caixa_versao') === 'v1' ? '/caixa-classico.html' : '/index.html';
        const estacoesConfig = {
          garcom: '/garcom.html',
          cozinha: '/fila-pedidos.html',
          caixa: caixaTarget,
          caixa_mobile: '/pdv-mobile.html',
          configuracoes: '/configuracoes.html',
          delivery: '/hub-delivery.html'
        };
        const targetUrl = estacoesConfig[estacoes[0]] || '/painel-funcionario.html';
        window.selecionarEstacaoTrabalho(targetUrl, estacoes[0]);
      } else {
        abrirModalEscolhaEstacao(payload);
      }
    });

    loginSocket.on('login_token', (token) => {
      localStorage.setItem('temp_login_token', token);
    });

    loginSocket.on('login_error', (msg) => {
      const errorMsg = document.getElementById('error-msg-colaborador');
      if (errorMsg) {
        errorMsg.innerText = msg;
        errorMsg.style.display = 'block';
      }
      const btnSubmit = document.getElementById('btn-submit-colaborador');
      if (btnSubmit) {
        btnSubmit.innerText = 'Validar e Entrar';
        btnSubmit.disabled = false;
      }
    });

    // ─── LIBERAÇÃO REMOTA DE TERMINAL (ZERO SENHA) ───
    loginSocket.on('aparelho_autorizado_remotamente', (payload) => {
      console.log('[Login] 🚀 Aparelho autorizado remotamente pelo dono:', payload);
      window.aplicarCredenciaisAutorizadas(payload);
    });

    loginSocket.on('pareamento_iniciado', (data) => {
      if (data && data.code) {
        _codigoPareamentoAtual = data.code;
        window.atualizarDisplayCodigoPareamento(data.code);
      }
    });
  }
}

window.attemptColaboradorLogin = function() {
  ensureLoginSocket();
  const errorMsg = document.getElementById('error-msg-colaborador');
  if (errorMsg) errorMsg.style.display = 'none';
  
  const btnSubmit = document.getElementById('btn-submit-colaborador');
  
  if (_modoColaborador === 'pin') {
    const pin = document.getElementById('colab-pin-input').value.trim();
    if (!pin) {
      if (errorMsg) { errorMsg.innerText = 'Digite seu PIN!'; errorMsg.style.display = 'block'; }
      return;
    }
    if (btnSubmit) { btnSubmit.innerText = 'Validando...'; btnSubmit.disabled = true; }
    loginSocket.emit('login_por_pin', { pin });
  } else {
    const usuario = document.getElementById('colab-user-input').value.trim();
    const senha = document.getElementById('colab-pass-input').value.trim();
    if (!usuario || !senha) {
      if (errorMsg) { errorMsg.innerText = 'Preencha usuário e senha!'; errorMsg.style.display = 'block'; }
      return;
    }
    if (btnSubmit) { btnSubmit.innerText = 'Validando...'; btnSubmit.disabled = true; }
    loginSocket.emit('login_funcionario', { usuario, senha });
  }
};

// ─── FUNÇÕES DE PAREAMENTO REMOTO (ZERO SENHA) ───
let _codigoPareamentoAtual = null;
let _pareamentoPollTimer = null;

function getDeviceInfo() {
  const ua = navigator.userAgent || '';
  let os = 'Dispositivo';
  if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Windows/i.test(ua)) os = 'Windows PC';
  else if (/Macintosh|Mac OS/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Navegador';
  if (/Chrome|CriOS/i.test(ua)) browser = 'Chrome';
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
  else if (/Firefox/i.test(ua)) browser = 'Firefox';
  else if (/Edge/i.test(ua)) browser = 'Edge';

  const isTablet = /iPad|Android(?!.*Mobile)/i.test(ua) || (window.innerWidth >= 768 && window.innerWidth <= 1280);
  const isMobile = /Mobile|iPhone/i.test(ua);
  const tipo = isTablet ? 'Tablet' : (isMobile ? 'Celular' : 'Computador');

  return {
    model: `${tipo} ${os}`,
    os: os,
    browser: browser,
    resolution: `${window.innerWidth}x${window.innerHeight}`,
    userAgent: ua
  };
}

window.iniciarPareamentoTerminal = function() {
  ensureLoginSocket();
  if (!_codigoPareamentoAtual) {
    _codigoPareamentoAtual = Math.floor(100000 + Math.random() * 900000).toString();
  }
  window.atualizarDisplayCodigoPareamento(_codigoPareamentoAtual);

  const selEst = document.getElementById('pairing-requested-station');
  const requestedStation = selEst ? selEst.value : 'garcom';
  const restId = localStorage.getItem('restaurante_id') || null;

  if (loginSocket && loginSocket.emit) {
    loginSocket.emit('solicitar_pareamento_terminal', {
      code: _codigoPareamentoAtual,
      deviceInfo: getDeviceInfo(),
      restaurante_id: restId,
      requestedStation: requestedStation
    });
  }

  // Fallback via HTTP polling caso websocket oscile na rede do restaurante
  if (_pareamentoPollTimer) clearInterval(_pareamentoPollTimer);
  _pareamentoPollTimer = setInterval(async () => {
    if (!_codigoPareamentoAtual) return;
    try {
      const res = await fetch(`/api/terminais/verificar-status?code=${_codigoPareamentoAtual}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.status === 'autorizado' && data.data) {
          clearInterval(_pareamentoPollTimer);
          _pareamentoPollTimer = null;
          window.aplicarCredenciaisAutorizadas(data.data);
        }
      }
    } catch (e) { }
  }, 3000);
};

window.atualizarDisplayCodigoPareamento = function(code) {
  _codigoPareamentoAtual = code;
  const digitsEl = document.getElementById('pairing-code-digits');
  const btnCopyLabel = document.getElementById('btn-copy-code-label');
  const btnWa = document.getElementById('btn-whatsapp-dono-share');

  if (digitsEl) {
    const formatted = `${code.slice(0, 3)} ${code.slice(3)}`;
    digitsEl.innerText = formatted;
  }
  if (btnCopyLabel) {
    btnCopyLabel.innerText = `${code.slice(0, 3)} ${code.slice(3)}`;
  }
  if (btnWa) {
    const selEst = document.getElementById('pairing-requested-station');
    const nomeEst = selEst ? selEst.options[selEst.selectedIndex].text : 'Terminal';
    const txt = encodeURIComponent(`Olá Dono! Estou configurando este aparelho (${nomeEst}) no restaurante. O código de 6 dígitos para você liberar o acesso pelo seu celular é: *${code.slice(0, 3)} ${code.slice(3)}*`);
    btnWa.href = `https://wa.me/?text=${txt}`;
  }
};

window.copiarCodigoPareamentoTerminal = function() {
  if (!_codigoPareamentoAtual) return;
  const formatted = `${_codigoPareamentoAtual.slice(0, 3)} ${_codigoPareamentoAtual.slice(3)}`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(_codigoPareamentoAtual).then(() => {
      alert(`Código ${formatted} copiado! Envie para o Dono liberar no Painel.`);
    }).catch(() => {
      prompt('Copie o código abaixo:', _codigoPareamentoAtual);
    });
  } else {
    prompt('Copie o código abaixo:', _codigoPareamentoAtual);
  }
};

window.renovarCodigoPareamentoTerminal = function() {
  _codigoPareamentoAtual = Math.floor(100000 + Math.random() * 900000).toString();
  window.iniciarPareamentoTerminal();
};

window.atualizarEstacaoSolicitada = function(estacao) {
  window.iniciarPareamentoTerminal();
};

window.aplicarCredenciaisAutorizadas = function(payload) {
  if (!payload || !payload.token) return;
  if (_pareamentoPollTimer) {
    clearInterval(_pareamentoPollTimer);
    _pareamentoPollTimer = null;
  }

  vibrar([10, 50, 10, 50]);

  // Salvar no localStorage exatamente como login master/colaborador
  localStorage.setItem('chef_token', payload.token);
  localStorage.setItem('restaurante_id', String(payload.restaurante_id || 1));
  localStorage.setItem('usuario_role', payload.cargo || payload.usuario_role || 'garcom');
  localStorage.setItem('colaborador_cargo', payload.cargo || 'garcom');
  localStorage.setItem('usuario_logado', payload.nome || payload.apelido || 'Terminal Autorizado');
  localStorage.setItem('chef_operador_nome', payload.nome || payload.apelido || 'Terminal Autorizado');
  localStorage.setItem('chef_operador_cargo', payload.cargo || 'garcom');
  localStorage.setItem('chef_is_dono', 'false');
  localStorage.setItem('chef_estacao_atual', payload.estacao || 'garcom');
  localStorage.setItem('chef_permissoes_estacoes', JSON.stringify([payload.estacao || 'garcom']));

  const credsObj = {
    id: payload.id || ('term_' + Date.now()),
    cargo: payload.cargo || 'Garçom',
    role: payload.cargo || 'garcom',
    nome: payload.nome || payload.apelido || 'Terminal Autorizado',
    usuario: payload.usuario || 'terminal',
    is_dono: false,
    estacoes: [payload.estacao || 'garcom'],
    token: payload.token
  };
  localStorage.setItem('chef_credentials', JSON.stringify(credsObj));
  localStorage.setItem('chef_session', JSON.stringify(credsObj));
  localStorage.setItem('chef_operador_atual', JSON.stringify(credsObj));

  const banner = document.getElementById('pairing-success-banner');
  if (banner) {
    banner.style.display = 'block';
  }
  const statusTxt = document.getElementById('pairing-live-status-text');
  if (statusTxt) {
    statusTxt.innerText = '✅ Aparelho Liberado pelo Dono!';
    statusTxt.style.color = '#15803d';
  }

  // Redireciona para a estação de destino
  setTimeout(() => {
    window.location.href = payload.url_destino || '/index.html';
  }, 800);
};

window.verificarMagicLinkUrl = async function() {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token_pareamento') || urlParams.get('autorizacao_remota');
  if (!token) return;

  const overlay = document.getElementById('magic-link-overlay');
  const statusEl = document.getElementById('magic-link-status');
  if (overlay) overlay.style.display = 'flex';

  try {
    const res = await fetch('/api/terminais/validar-magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        deviceInfo: getDeviceInfo()
      })
    });
    const data = await res.json();
    if (data && data.success) {
      if (statusEl) statusEl.innerText = `Acesso validado para ${data.restaurante_nome || 'o restaurante'}! Abrindo tela...`;
      window.aplicarCredenciaisAutorizadas(data);
    } else {
      if (overlay) overlay.style.display = 'none';
      alert(data.error || 'Link de acesso expirado ou inválido.');
    }
  } catch (err) {
    if (overlay) overlay.style.display = 'none';
    console.error('Erro ao validar magic link:', err);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('password')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') attemptOwnerLogin();
  });
  document.getElementById('colab-pin-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') attemptColaboradorLogin();
  });
  document.getElementById('colab-pass-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') attemptColaboradorLogin();
  });

  // Verifica se o terminal foi aberto via Link Mágico do WhatsApp
  window.verificarMagicLinkUrl();

  // Se a URL tiver hash #parear ou se não houver credenciais prévias e for mobile, facilita o pareamento
  if (window.location.hash === '#parear') {
    window.setTipoPerfil('pareamento');
  }
});
