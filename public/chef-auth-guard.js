/**
 * chef-auth-guard.js
 * Gerenciador Central de Sessão de Operador, Verificação de Permissões e Autorização de Gerente.
 */
(function () {
  window.operadorAtivo = null;
  window.politicaAcesso = {
    exigir_operador_acoes: true,
    modo_identificacao: 'pin', // 'pin' | 'senha'
    bloqueio_inatividade_min: 0,
    acoes_exigem_gerente: ['desconto', 'cancelamento_item', 'cancelamento_mesa', 'sangria', 'reabertura'],
    permissoes_cargos: {
      garcom: { lancar_itens: true, pedir_conta: true, desconto: false, cancelamento: false, receber_pagamento: false },
      caixa: { lancar_itens: true, pedir_conta: true, desconto: false, cancelamento: false, receber_pagamento: true, fechar_caixa: true },
      gerente: { lancar_itens: true, pedir_conta: true, desconto: true, cancelamento: true, receber_pagamento: true, fechar_caixa: true, autorizar_outros: true }
    }
  };

  let _timerInatividade = null;

  // Carregar dados salvos da sessão do operador
  function restaurarOperadorSalvo() {
    try {
      const salvo = localStorage.getItem('chef_operador_atual');
      if (salvo) {
        window.operadorAtivo = JSON.parse(salvo);
      } else {
        const creds = localStorage.getItem('chef_credentials');
        if (creds) {
          const parsed = JSON.parse(creds);
          if (parsed && (parsed.nome || parsed.usuario)) {
            window.operadorAtivo = {
              id: parsed.id,
              nome: parsed.nome || parsed.usuario || 'Operador',
              usuario: parsed.usuario || '',
              cargo: parsed.cargo || parsed.role || 'Caixa',
              is_dono: !!parsed.is_dono
            };
            localStorage.setItem('chef_operador_atual', JSON.stringify(window.operadorAtivo));
          }
        }
      }
    } catch (e) {
      window.operadorAtivo = null;
    }

    try {
      const polSalva = localStorage.getItem('chef_politica_acesso');
      if (polSalva) {
        window.politicaAcesso = Object.assign(window.politicaAcesso, JSON.parse(polSalva));
      }
    } catch(e) {}

    atualizarIndicadorOperadorUI();
    reiniciarTimerInatividade();
  }

  // Atualizar visualmente o operador na barra de status
  function atualizarIndicadorOperadorUI() {
    const elUser = document.getElementById('status-user-name');
    const elBadge = document.getElementById('status-user-box');
    const elMobUser = document.getElementById('mobile-menu-user-name');

    if (window.operadorAtivo && window.operadorAtivo.nome) {
      const label = `${window.operadorAtivo.nome}${window.operadorAtivo.cargo ? ' (' + window.operadorAtivo.cargo + ')' : ''}`;
      if (elUser) {
        elUser.innerHTML = label;
        elUser.style.color = '';
        elUser.style.fontWeight = '';
      }
      if (elMobUser) elMobUser.textContent = label;
      if (elBadge) elBadge.title = 'Operador ativo: ' + label + '. Clique para alternar ou sair.';
    } else {
      if (elUser) {
        elUser.innerHTML = '<span style="color:#ef4444; font-weight:800;">⚠️ Identificar Operador</span>';
      }
      if (elMobUser) elMobUser.innerHTML = '<span style="color:#ef4444;">⚠️ Não identificado</span>';
      if (elBadge) elBadge.title = 'Nenhum operador identificado no momento. Clique para entrar com seu PIN ou senha.';
    }
  }
  window.atualizarIndicadorOperadorUI = atualizarIndicadorOperadorUI;

  // Inatividade
  function reiniciarTimerInatividade() {
    if (_timerInatividade) clearTimeout(_timerInatividade);
    const mins = parseInt(window.politicaAcesso.bloqueio_inatividade_min, 10) || 0;
    if (mins > 0 && window.operadorAtivo) {
      _timerInatividade = setTimeout(() => {
        bloquearPorInatividade();
      }, mins * 60 * 1000);
    }
  }

  function bloquearPorInatividade() {
    if (!window.operadorAtivo) return;
    console.warn('[Chef Auth Guard] Bloqueado por inatividade de ' + window.politicaAcesso.bloqueio_inatividade_min + ' minutos.');
    window.operadorAtivo = null;
    localStorage.removeItem('chef_operador_atual');
    atualizarIndicadorOperadorUI();
    
    // Tocar som ou alertar
    const aviso = document.createElement('div');
    aviso.style.cssText = 'position:fixed; top:20px; right:20px; z-index:99999; background:#ef4444; color:#fff; padding:14px 20px; border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,0.3); font-weight:700; font-size:14px;';
    aviso.innerHTML = '⏱️ Sessão do operador bloqueada por inatividade. Identifique-se para continuar.';
    document.body.appendChild(aviso);
    setTimeout(() => aviso.remove(), 4000);
  }

  ['mousemove', 'keydown', 'mousedown', 'touchstart'].forEach(evt => {
    window.addEventListener(evt, () => reiniciarTimerInatividade(), { passive: true });
  });

  // ─── MODAL DE IDENTIFICAÇÃO DE OPERADOR ───
  let _callbackPendenteIdentificacao = null;

  window.abrirModalIdentificacaoOperador = function (callback, mensagemCustom) {
    _callbackPendenteIdentificacao = callback || null;

    let modal = document.getElementById('modal-identificar-operador-global');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-identificar-operador-global';
      modal.style.cssText = 'position:fixed; inset:0; z-index:100000; background:rgba(15,23,42,0.75); backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; padding:16px;';
      document.body.appendChild(modal);
    }

    const restNome = localStorage.getItem('restaurante_nome') || 'Chef Cozinha';
    const subMsg = mensagemCustom || 'Digite seu PIN de 4 a 6 dígitos ou credenciais para operar o sistema:';

    modal.innerHTML = `
      <div style="background:#ffffff; border-radius:24px; padding:26px; width:100%; max-width:400px; box-shadow:0 25px 60px rgba(0,0,0,0.3); text-align:center; font-family:'Inter', sans-serif; box-sizing:border-box;">
        <div style="width:52px; height:52px; border-radius:16px; background:rgba(252,75,21,0.12); color:#fc4b15; display:flex; align-items:center; justify-content:center; font-size:28px; margin:0 auto 12px;">
          <i class="ph-bold ph-identification-badge"></i>
        </div>
        <h3 style="font-size:19px; font-weight:800; color:#0f172a; margin:0 0 4px 0;">Identificação do Operador</h3>
        <div style="font-size:12px; color:#10b981; font-weight:700; margin-bottom:10px;">${restNome}</div>
        <p style="font-size:12.5px; color:#64748b; margin:0 0 16px 0;">${subMsg}</p>

        <!-- ABAS: PIN vs SENHA -->
        <div style="display:flex; background:#f1f5f9; padding:3px; border-radius:12px; margin-bottom:16px;">
          <button type="button" id="tab-op-pin" onclick="window._setTabIdentificacao('pin')" style="flex:1; padding:8px; border:none; background:#ffffff; color:#0f172a; font-weight:800; border-radius:10px; cursor:pointer; font-size:13px; box-shadow:0 2px 6px rgba(0,0,0,0.05);">PIN Rápido</button>
          <button type="button" id="tab-op-user" onclick="window._setTabIdentificacao('user')" style="flex:1; padding:8px; border:none; background:transparent; color:#64748b; font-weight:700; border-radius:10px; cursor:pointer; font-size:13px;">Usuário & Senha</button>
        </div>

        <!-- FORM PIN -->
        <div id="view-ident-pin">
          <input type="password" id="input-op-pin" maxlength="6" placeholder="••••" style="width:100%; padding:14px; font-size:26px; text-align:center; letter-spacing:8px; border:2px solid #e2e8f0; border-radius:14px; outline:none; background:#f8fafc; font-weight:900; margin-bottom:14px; box-sizing:border-box;">
          
          <!-- TECLADO NUMÉRICO EM TELA -->
          <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; margin-bottom:14px;">
            ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" onclick="window._digitarPinOperador('${n}')" style="padding:14px; font-size:20px; font-weight:800; border:1px solid #e2e8f0; border-radius:12px; background:#ffffff; color:#0f172a; cursor:pointer;">${n}</button>`).join('')}
            <button type="button" onclick="window._limparPinOperador()" style="padding:14px; font-size:15px; font-weight:800; border:1px solid #fee2e2; border-radius:12px; background:#fef2f2; color:#dc2626; cursor:pointer;">LIMPAR</button>
            <button type="button" onclick="window._digitarPinOperador('0')" style="padding:14px; font-size:20px; font-weight:800; border:1px solid #e2e8f0; border-radius:12px; background:#ffffff; color:#0f172a; cursor:pointer;">0</button>
            <button type="button" onclick="window._confirmarPinOperador()" style="padding:14px; font-size:15px; font-weight:800; border:none; border-radius:12px; background:#10b981; color:#ffffff; cursor:pointer;">ENTRAR</button>
          </div>
        </div>

        <!-- FORM USUÁRIO & SENHA -->
        <div id="view-ident-user" style="display:none; text-align:left;">
          <label style="display:block; font-size:12px; font-weight:700; color:#64748b; margin-bottom:4px;">Usuário</label>
          <input type="text" id="input-op-user" placeholder="Ex: carlos" style="width:100%; padding:12px; border:1.5px solid #e2e8f0; border-radius:12px; font-size:14px; margin-bottom:12px; box-sizing:border-box;">
          
          <label style="display:block; font-size:12px; font-weight:700; color:#64748b; margin-bottom:4px;">Senha</label>
          <input type="password" id="input-op-pass" placeholder="••••••" style="width:100%; padding:12px; border:1.5px solid #e2e8f0; border-radius:12px; font-size:14px; margin-bottom:16px; box-sizing:border-box;">
          
          <button type="button" onclick="window._confirmarUserOperador()" style="width:100%; padding:14px; background:#2563eb; color:#ffffff; border:none; border-radius:12px; font-weight:800; font-size:15px; cursor:pointer;">Entrar como Operador</button>
        </div>

        <div id="op-ident-feedback" style="display:none; margin-top:10px; padding:10px; border-radius:10px; font-size:13px; font-weight:700;"></div>

        <button type="button" onclick="window.fecharModalIdentificacaoOperador()" style="margin-top:14px; background:transparent; border:none; color:#94a3b8; font-weight:700; font-size:13px; cursor:pointer;">Cancelar</button>
      </div>
    `;

    modal.style.display = 'flex';
    setTimeout(() => {
      const pinInput = document.getElementById('input-op-pin');
      if (pinInput) {
        pinInput.value = '';
        pinInput.focus();
        pinInput.onkeydown = (e) => {
          if (e.key === 'Enter') window._confirmarPinOperador();
        };
      }
    }, 150);
  };

  window.fecharModalIdentificacaoOperador = function () {
    const modal = document.getElementById('modal-identificar-operador-global');
    if (modal) modal.style.display = 'none';
    _callbackPendenteIdentificacao = null;
  };

  window._setTabIdentificacao = function (tab) {
    const tabPin = document.getElementById('tab-op-pin');
    const tabUser = document.getElementById('tab-op-user');
    const viewPin = document.getElementById('view-ident-pin');
    const viewUser = document.getElementById('view-ident-user');
    const fb = document.getElementById('op-ident-feedback');
    if (fb) fb.style.display = 'none';

    if (tab === 'pin') {
      tabPin.style.background = '#ffffff';
      tabPin.style.color = '#0f172a';
      tabUser.style.background = 'transparent';
      tabUser.style.color = '#64748b';
      viewPin.style.display = 'block';
      viewUser.style.display = 'none';
      document.getElementById('input-op-pin')?.focus();
    } else {
      tabUser.style.background = '#ffffff';
      tabUser.style.color = '#0f172a';
      tabPin.style.background = 'transparent';
      tabPin.style.color = '#64748b';
      viewUser.style.display = 'block';
      viewPin.style.display = 'none';
      document.getElementById('input-op-user')?.focus();
    }
  };

  window._digitarPinOperador = function (digito) {
    const input = document.getElementById('input-op-pin');
    if (input && input.value.length < 6) {
      input.value += digito;
      if (input.value.length >= 4 && input.value.length <= 6) {
        // Auto-submete se atingir 4 a 6 dígitos quando aplicável ou aguarda
      }
    }
  };

  window._limparPinOperador = function () {
    const input = document.getElementById('input-op-pin');
    if (input) input.value = '';
  };

  window._confirmarPinOperador = function () {
    const input = document.getElementById('input-op-pin');
    const pin = input ? input.value.trim() : '';
    const fb = document.getElementById('op-ident-feedback');

    if (!pin || pin.length < 4) {
      if (fb) {
        fb.style.display = 'block';
        fb.style.background = '#fee2e2';
        fb.style.color = '#dc2626';
        fb.innerText = 'Digite um PIN válido de 4 a 6 dígitos.';
      }
      return;
    }

    if (fb) {
      fb.style.display = 'block';
      fb.style.background = '#eff6ff';
      fb.style.color = '#2563eb';
      fb.innerText = 'Autenticando...';
    }

    const s = window.socket || (typeof io !== 'undefined' ? io() : null);
    if (!s) {
      alert('Erro de conexão com o servidor.');
      return;
    }

    const onSuccess = (data) => {
      s.off('login_success', onSuccess);
      s.off('login_error', onError);
      finalizarLoginSucesso(data);
    };

    const onError = (msg) => {
      s.off('login_success', onSuccess);
      s.off('login_error', onError);
      if (fb) {
        fb.style.display = 'block';
        fb.style.background = '#fee2e2';
        fb.style.color = '#dc2626';
        fb.innerText = '❌ ' + (msg || 'PIN incorreto.');
      }
      if (input) input.value = '';
    };

    s.once('login_success', onSuccess);
    s.once('login_error', onError);
    s.emit('login_por_pin', { pin });
  };

  window._confirmarUserOperador = function () {
    const u = document.getElementById('input-op-user')?.value.trim();
    const p = document.getElementById('input-op-pass')?.value.trim();
    const fb = document.getElementById('op-ident-feedback');

    if (!u || !p) {
      if (fb) {
        fb.style.display = 'block';
        fb.style.background = '#fee2e2';
        fb.style.color = '#dc2626';
        fb.innerText = 'Preencha usuário e senha.';
      }
      return;
    }

    const s = window.socket || (typeof io !== 'undefined' ? io() : null);
    if (!s) return;

    const onSuccess = (data) => {
      s.off('login_success', onSuccess);
      s.off('login_error', onError);
      finalizarLoginSucesso(data);
    };

    const onError = (msg) => {
      s.off('login_success', onSuccess);
      s.off('login_error', onError);
      if (fb) {
        fb.style.display = 'block';
        fb.style.background = '#fee2e2';
        fb.style.color = '#dc2626';
        fb.innerText = '❌ ' + (msg || 'Usuário ou senha incorretos.');
      }
    };

    s.once('login_success', onSuccess);
    s.once('login_error', onError);
    s.emit('login_funcionario', { usuario: u, senha: p });
  };

  function finalizarLoginSucesso(data) {
    window.operadorAtivo = {
      id: data.id,
      nome: data.nome,
      usuario: data.usuario || '',
      cargo: data.cargo || 'Operador',
      is_dono: !!data.is_dono
    };

    localStorage.setItem('chef_operador_atual', JSON.stringify(window.operadorAtivo));
    localStorage.setItem('logged_user', data.nome);
    atualizarIndicadorOperadorUI();
    reiniciarTimerInatividade();

    const fb = document.getElementById('op-ident-feedback');
    if (fb) {
      fb.style.display = 'block';
      fb.style.background = '#ecfdf5';
      fb.style.color = '#047857';
      fb.innerText = `✅ Bem-vindo(a), ${data.nome}!`;
    }

    setTimeout(() => {
      window.fecharModalIdentificacaoOperador();
      if (typeof _callbackPendenteIdentificacao === 'function') {
        const cb = _callbackPendenteIdentificacao;
        _callbackPendenteIdentificacao = null;
        cb(window.operadorAtivo);
      }
    }, 400);
  }

  // ─── MODAL DE AUTORIZAÇÃO DE SUPERVISOR / GERENTE ───
  window.solicitarAutorizacaoSupervisor = function (acaoNome, callbackSucesso) {
    let modal = document.getElementById('modal-autorizacao-supervisor');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-autorizacao-supervisor';
      modal.style.cssText = 'position:fixed; inset:0; z-index:110000; background:rgba(15,23,42,0.8); backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; padding:16px;';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div style="background:#ffffff; border-radius:24px; padding:26px; width:100%; max-width:380px; box-shadow:0 25px 60px rgba(0,0,0,0.35); text-align:center; font-family:'Inter', sans-serif; box-sizing:border-box;">
        <div style="width:54px; height:54px; border-radius:18px; background:rgba(239,68,68,0.12); color:#ef4444; display:flex; align-items:center; justify-content:center; font-size:30px; margin:0 auto 12px;">
          <i class="ph-bold ph-shield-warning"></i>
        </div>
        <h3 style="font-size:18px; font-weight:800; color:#0f172a; margin:0 0 4px 0;">Autorização do Gerente</h3>
        <p style="font-size:13px; color:#64748b; margin:0 0 16px 0;">A operação <strong>"${acaoNome}"</strong> requer autorização de um supervisor.</p>

        <input type="password" id="input-supervisor-pin" maxlength="6" placeholder="PIN do Gerente" style="width:100%; padding:14px; font-size:24px; text-align:center; letter-spacing:6px; border:2px solid #cbd5e1; border-radius:14px; outline:none; background:#f8fafc; font-weight:900; margin-bottom:12px; box-sizing:border-box;">

        <div id="supervisor-feedback" style="display:none; margin-bottom:12px; padding:8px; border-radius:10px; font-size:12.5px; font-weight:700;"></div>

        <div style="display:flex; gap:10px;">
          <button type="button" onclick="document.getElementById('modal-autorizacao-supervisor').style.display='none'" style="flex:1; padding:13px; background:#f1f5f9; color:#64748b; border:none; border-radius:12px; font-weight:700; font-size:14px; cursor:pointer;">Cancelar</button>
          <button type="button" id="btn-autorizar-supervisor-ok" style="flex:1; padding:13px; background:#ef4444; color:#ffffff; border:none; border-radius:12px; font-weight:800; font-size:14px; cursor:pointer;">Autorizar</button>
        </div>
      </div>
    `;

    modal.style.display = 'flex';
    const input = document.getElementById('input-supervisor-pin');
    const btn = document.getElementById('btn-autorizar-supervisor-ok');
    const fb = document.getElementById('supervisor-feedback');

    setTimeout(() => input?.focus(), 150);

    const executarVerificacao = () => {
      const pin = input.value.trim();
      if (!pin) {
        fb.style.display = 'block';
        fb.style.background = '#fee2e2';
        fb.style.color = '#dc2626';
        fb.innerText = 'Digite o PIN do gerente.';
        return;
      }

      fb.style.display = 'block';
      fb.style.background = '#eff6ff';
      fb.style.color = '#2563eb';
      fb.innerText = 'Validando autorização...';
      btn.disabled = true;

      const s = window.socket || (typeof io !== 'undefined' ? io() : null);
      if (s) {
        s.emit('verificar_pin_supervisor', { pin }, (res) => {
          btn.disabled = false;
          if (res && res.sucesso) {
            fb.style.background = '#ecfdf5';
            fb.style.color = '#047857';
            fb.innerText = `✅ Autorizado por ${res.autorizador}!`;
            setTimeout(() => {
              modal.style.display = 'none';
              callbackSucesso(res);
            }, 350);
          } else {
            fb.style.background = '#fee2e2';
            fb.style.color = '#dc2626';
            fb.innerText = (res && res.erro) || 'PIN de gerente incorreto.';
            input.value = '';
            input.focus();
          }
        });
      }
    };

    btn.onclick = executarVerificacao;
    input.onkeydown = (e) => {
      if (e.key === 'Enter') executarVerificacao();
    };
  };

  // ─── GUARDA PRINCIPAL: EXECUTAR AÇÃO COM OPERADOR ───
  window.exigirOperadorParaAcao = function (acaoNome, callback, opcoes = {}) {
    // 1. Se o restaurante desativou a exigência de operador nas políticas:
    if (window.politicaAcesso && window.politicaAcesso.exigir_operador_acoes === false) {
      return callback(window.operadorAtivo || { nome: 'Operador Padrão', cargo: 'Caixa' });
    }

    // 2. Se NÃO há operador logado:
    if (!window.operadorAtivo) {
      window.abrirModalIdentificacaoOperador((op) => {
        window.exigirOperadorParaAcao(acaoNome, callback, opcoes);
      }, `Identifique-se para ${opcoes.descricaoAcao || acaoNome}:`);
      return;
    }

    // 3. Verifica se a ação exige PIN do gerente:
    const cargo = (window.operadorAtivo.cargo || '').toLowerCase();
    const isGerenteOuDono = cargo.includes('gerente') || cargo.includes('admin') || cargo.includes('supervisor') || cargo.includes('dono') || window.operadorAtivo.is_dono;
    const acoesRestritas = (window.politicaAcesso && window.politicaAcesso.acoes_exigem_gerente) || ['desconto', 'cancelamento_item', 'cancelamento_mesa', 'sangria', 'reabertura'];

    const precisaGerente = acoesRestritas.includes(acaoNome) && !isGerenteOuDono;

    if (precisaGerente) {
      window.solicitarAutorizacaoSupervisor(opcoes.descricaoAcao || acaoNome, (supervisorInfo) => {
        callback(window.operadorAtivo, supervisorInfo);
      });
      return;
    }

    // 4. Autorizado diretamente
    callback(window.operadorAtivo);
  };

  // Carregar dados na inicialização
  document.addEventListener('DOMContentLoaded', () => {
    restaurarOperadorSalvo();

    // Buscar política de acesso atualizada do servidor
    const s = window.socket || (typeof io !== 'undefined' ? io() : null);
    if (s) {
      s.emit('obter_politica_acesso', (pol) => {
        if (pol) {
          window.politicaAcesso = Object.assign(window.politicaAcesso, pol);
          localStorage.setItem('chef_politica_acesso', JSON.stringify(window.politicaAcesso));
          reiniciarTimerInatividade();
        }
      });

      s.on('politica_acesso_atualizada', (novaPol) => {
        if (novaPol) {
          window.politicaAcesso = Object.assign(window.politicaAcesso, novaPol);
          localStorage.setItem('chef_politica_acesso', JSON.stringify(window.politicaAcesso));
          reiniciarTimerInatividade();
        }
      });
    }

    // Interceptar clique na badge do operador no topo
    const badge = document.getElementById('status-user-box');
    if (badge) {
      badge.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.abrirModalIdentificacaoOperador(() => {});
      };
    }
  });
})();
