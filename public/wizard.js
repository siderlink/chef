  // ─── HELPER DE NOTIFICAÇÃO TOAST NÃO-BLOQUEANTE ───
  function _showWizardToast(msg, type = 'info') {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, type);
      return;
    }
    try {
      let container = document.getElementById('wizard-toast-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'wizard-toast-container';
        container.style.cssText = 'position:fixed; bottom:24px; right:24px; z-index:9999999; display:flex; flex-direction:column; gap:8px; pointer-events:none;';
        document.body.appendChild(container);
      }
      const toast = document.createElement('div');
      const bg = type === 'error' || type === 'danger' ? '#ef4444' : type === 'warning' ? '#f59e0b' : type === 'success' ? '#10b981' : '#3b82f6';
      toast.style.cssText = `background:${bg}; color:#fff; padding:10px 16px; border-radius:10px; font-size:13px; font-weight:600; box-shadow:0 10px 25px rgba(0,0,0,0.5); pointer-events:auto; display:flex; align-items:center; gap:8px; opacity:0; transform:translateY(10px); transition:all 0.3s cubic-bezier(0.16, 1, 0.3, 1);`;
      toast.innerHTML = `<span>${msg}</span>`;
      container.appendChild(toast);
      requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
      });
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 350);
      }, 4000);
    } catch(e) {
      console.log('[Toast]', msg);
    }
  }
  if (typeof window.showToast !== 'function') {
    window.showToast = _showWizardToast;
  }

  // Garante que campos ocultos de coordenadas sempre existam com fallback válido
  function _garantirInputsGeo() {
    let latInp = document.getElementById('wiz-geo-lat');
    let lngInp = document.getElementById('wiz-geo-lng');
    let precInp = document.getElementById('wiz-geo-precisao');
    const container = document.getElementById('onboarding-wizard') || document.body;

    if (!latInp) {
      latInp = document.createElement('input');
      latInp.type = 'hidden';
      latInp.id = 'wiz-geo-lat';
      latInp.value = '-23.5505';
      container.appendChild(latInp);
    } else if (!latInp.value) {
      latInp.value = '-23.5505';
    }

    if (!lngInp) {
      lngInp = document.createElement('input');
      lngInp.type = 'hidden';
      lngInp.id = 'wiz-geo-lng';
      lngInp.value = '-46.6333';
      container.appendChild(lngInp);
    } else if (!lngInp.value) {
      lngInp.value = '-46.6333';
    }

    if (!precInp) {
      precInp = document.createElement('input');
      precInp.type = 'hidden';
      precInp.id = 'wiz-geo-precisao';
      precInp.value = '500';
      container.appendChild(precInp);
    } else if (!precInp.value) {
      precInp.value = '500';
    }
  }

  // ─── TERMOS DE USO & ONBOARDING INTELIGENTE COM DEEP RESEARCH ───
  const wizardToggleTerms = function() {
    const chk = document.getElementById('wiz-terms-check');
    const btn = document.getElementById('wiz-btn-start');
    if (!chk || !btn) return;
    if (chk.checked) {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
    } else {
      btn.disabled = true;
      btn.style.opacity = '0.45';
      btn.style.cursor = 'not-allowed';
    }
  };

  const wizardStartFromTerms = function() {
    const chk = document.getElementById('wiz-terms-check');
    if (!chk || !chk.checked) {
      _showWizardToast('Por favor, leia e aceite os Termos de Uso para continuar.', 'warning');
      return;
    }

    _garantirInputsGeo();

    // Imediatamente avança para o Passo 1 (Dados do Restaurante & Dono) de forma fluida
    _avancarParaPasso1();

    // Restaura o botão de início para seu estado padrão
    const btn = document.getElementById('wiz-btn-start');
    if (btn) {
      btn.innerHTML = '<span>Iniciar Configuração Inteligente</span> <i class="ph-bold ph-arrow-right"></i>';
    }

    // Dispara a busca por GPS em segundo plano de forma 100% não-bloqueante
    if (navigator.geolocation) {
      try {
        navigator.geolocation.getCurrentPosition(
          function(pos) {
            const lat = parseFloat(pos.coords.latitude.toFixed(6));
            const lng = parseFloat(pos.coords.longitude.toFixed(6));
            const prec = Math.round(pos.coords.accuracy);

            const latInp = document.getElementById('wiz-geo-lat');
            const lngInp = document.getElementById('wiz-geo-lng');
            const precInp = document.getElementById('wiz-geo-precisao');
            if (latInp) latInp.value = lat;
            if (lngInp) lngInp.value = lng;
            if (precInp) precInp.value = prec;

            if (typeof socket !== 'undefined' && socket && socket.emit) {
              socket.emit('novo_cadastro_saas', {
                restauranteNome: 'Cadastro Iniciado (Localização GPS Detectada)',
                nome: 'Novo Cliente',
                etapa: '1-dados-estabelecimento',
                lat: lat,
                lng: lng,
                precisao: prec
              });
            }

            // Dispara Deep Research em background para pré-preencher campos se encontrados
            _executarDeepResearchPorLocalizacao(lat, lng);
          },
          function(err) {
            console.warn('[Geo Permission Ignored/Failed - Fallback gracioso]', err);
            if (typeof socket !== 'undefined' && socket && socket.emit) {
              socket.emit('novo_cadastro_saas', {
                restauranteNome: 'Novo Cadastro Iniciado (Modo Manual / Sem GPS)',
                nome: 'Novo Cliente',
                etapa: '1-dados-estabelecimento',
                lat: -23.5505,
                lng: -46.6333,
                precisao: 500
              });
            }
          },
          { enableHighAccuracy: false, timeout: 3500, maximumAge: 300000 }
        );
      } catch(e) {
        console.warn('[Geolocation Exception]', e);
      }
    } else {
      if (typeof socket !== 'undefined' && socket && socket.emit) {
        socket.emit('novo_cadastro_saas', {
          restauranteNome: 'Novo Cadastro Iniciado (Navegador sem GPS)',
          nome: 'Novo Cliente',
          etapa: '1-dados-estabelecimento',
          lat: -23.5505,
          lng: -46.6333,
          precisao: 500
        });
      }
    }
  };

  function _avancarParaPasso1() {
    _wizardStep = 1;
    _renderWizardStep();
  }

  function _executarDeepResearchPorLocalizacao(lat, lng) {
    fetch('/api/ia/pesquisar-estabelecimento-geo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: lat, lng: lng })
    })
    .then(r => r.json())
    .then(res => {
      if (res && res.ok && res.dados) {
        const d = res.dados;
        const nomeEl = document.getElementById('wiz-rest-nome');
        const endEl = document.getElementById('wiz-rest-endereco');
        const telEl = document.getElementById('wiz-rest-tel');
        const donoEl = document.getElementById('wiz-dono-nome');

        // Preenche dados do restaurante caso o usuário ainda não tenha digitado
        if (nomeEl && (!nomeEl.value || nomeEl.value.length < 3) && d.nome && d.nome !== 'Meu Restaurante') {
          nomeEl.value = d.nome;
          nomeEl.style.borderColor = '#10b981';
          setTimeout(() => { nomeEl.style.borderColor = 'rgba(255,255,255,0.08)'; }, 4000);
        }
        if (endEl && (!endEl.value || endEl.value.length < 4) && d.endereco) {
          endEl.value = d.endereco;
          endEl.style.borderColor = '#10b981';
          setTimeout(() => { endEl.style.borderColor = 'rgba(255,255,255,0.08)'; }, 4000);
        }
        if (telEl && (!telEl.value || telEl.value.length < 10) && d.telefone) {
          telEl.value = d.telefone;
        }
        if (donoEl && (!donoEl.value || donoEl.value.length < 3) && d.socios) {
          donoEl.value = d.socios;
        }

        // Pré-carrega o cardápio e produtos identificados
        if (Array.isArray(d.produtos) && d.produtos.length > 0) {
          _wizardProdutos = d.produtos;
          window._wizardProdutos = _wizardProdutos;
          if (typeof _renderWizProdutos === 'function') {
            _renderWizProdutos();
          }
        }

        const msg = d.avaliacao ? '✨ Google Meu Negócio identificado (' + d.avaliacao + ')! Dados pré-preenchidos.' : '✨ Estabelecimento identificado! Dados pré-preenchidos.';
        _showWizardToast(msg, 'success');
      }
    })
    .catch(err => {
      console.warn('[DeepResearch Error]', err);
    });
  }

  // ─── VERIFICAÇÃO DE LOCALIZAÇÃO & TELEMETRIA DO SETUP INICIAL ───
  let _wizGeoLoading = false;
  const wizardDetectLocation = function(userInitiated) {
    if (_wizGeoLoading) return;
    _garantirInputsGeo();
    const card = document.getElementById('wiz-geo-card');
    const icon = document.getElementById('wiz-geo-icon');
    const statusText = document.getElementById('wiz-geo-status-text');
    const btn = document.getElementById('wiz-btn-detect-geo');
    const latInp = document.getElementById('wiz-geo-lat');
    const lngInp = document.getElementById('wiz-geo-lng');
    const precInp = document.getElementById('wiz-geo-precisao');

    if (!navigator.geolocation) {
      if (statusText) statusText.innerHTML = '<span style="color:#f59e0b;">GPS não suportado neste navegador. Preenchimento manual ativado.</span>';
      if (latInp) latInp.value = '-23.5505';
      if (lngInp) lngInp.value = '-46.6333';
      return;
    }

    _wizGeoLoading = true;
    if (btn) btn.innerHTML = '<i class="ph-bold ph-spinner ph-spin"></i> <span>Obtendo GPS...</span>';
    if (statusText) statusText.textContent = 'Solicitando permissão de localização ao navegador...';

    navigator.geolocation.getCurrentPosition(
      function(pos) {
        _wizGeoLoading = false;
        const lat = parseFloat(pos.coords.latitude.toFixed(6));
        const lng = parseFloat(pos.coords.longitude.toFixed(6));
        const prec = Math.round(pos.coords.accuracy);

        if (latInp) latInp.value = lat;
        if (lngInp) lngInp.value = lng;
        if (precInp) precInp.value = prec;

        if (card) {
          card.style.background = 'rgba(16, 185, 129, 0.08)';
          card.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        }
        if (icon) {
          icon.style.background = '#10b981';
          icon.innerHTML = '<i class="ph-bold ph-check"></i>';
        }
        if (statusText) {
          statusText.innerHTML = '<strong style="color:#10b981;">✓ Localização Verificada:</strong> Lat ' + lat + ', Lng ' + lng + ' (Precisão: ' + prec + 'm)';
        }
        if (btn) {
          btn.style.background = '#10b981';
          btn.innerHTML = '<i class="ph-bold ph-check-circle"></i> <span>Verificada</span>';
        }

        _enviarTelemetriaSetup();
      },
      function(err) {
        _wizGeoLoading = false;
        console.warn('[Wizard Geo Error]', err);
        if (btn) {
          btn.innerHTML = '<i class="ph-bold ph-crosshair"></i> <span>Tentar Novamente</span>';
        }
        if (err.code === 1) { // PERMISSION_DENIED
          if (statusText) statusText.innerHTML = '<span style="color:#f59e0b;">Permissão de localização não ativa. Preenchimento manual disponível normalmente.</span>';
          if (userInitiated) {
            _showWizardToast('Acesso à localização não ativo. Você pode preencher os dados manualmente.', 'info');
          }
        } else {
          if (statusText) statusText.innerHTML = '<span style="color:#f59e0b;">Não foi possível obter GPS com precisão. Você pode preencher manualmente.</span>';
        }
      },
      { enableHighAccuracy: false, timeout: 4000, maximumAge: 300000 }
    );
  };

  // Telemetria contínua do setup
  let _setupSessaoId = (function() {
    try {
      let s = sessionStorage.getItem('chef_setup_sessao');
      if (!s) {
        s = 'setup-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
        sessionStorage.setItem('chef_setup_sessao', s);
      }
      return s;
    } catch(e) { return 'setup-' + Date.now(); }
  })();

  function _enviarTelemetriaSetup() {
    try {
      const lat = document.getElementById('wiz-geo-lat')?.value;
      const lng = document.getElementById('wiz-geo-lng')?.value;
      const prec = document.getElementById('wiz-geo-precisao')?.value;
      const loc = (lat && lng) ? { lat: parseFloat(lat), lng: parseFloat(lng), precisao: parseInt(prec) || 0 } : null;

      const ua = navigator.userAgent || '';
      let disp = 'Computador';
      if (/iphone/i.test(ua)) disp = 'iPhone';
      else if (/android/i.test(ua)) disp = 'Android';

      const payload = {
        sessao_id: _setupSessaoId,
        etapa: 'setup-passo-' + (_wizardStep || 1),
        campos: {
          restaurante: document.getElementById('wiz-rest-nome')?.value.trim(),
          telefone: document.getElementById('wiz-rest-tel')?.value.trim(),
          dono_nome: document.getElementById('wiz-dono-nome')?.value.trim(),
          dono_user: document.getElementById('wiz-dono-usuario')?.value.trim()
        },
        dispositivo: disp,
        localizacao: loc
      };

      fetch('/api/monitor/cadastro-progresso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(() => {});
    } catch(e) {}
  }

  /* ═══════════════════════════════════════════════════════════════ */
  /* ONBOARDING WIZARD — 3 passos (Dados, Mesas, Produtos)         */
  /* ═══════════════════════════════════════════════════════════════ */
  let _wizardStep = 1;
  const _wizardTotal = 3;
  let _wizardProdutos = []; /* [{categoria, nome, preco}] */
  let _wizardModoMesas = 'exemplos'; /* 'exemplos' | 'zero' */
  let _wizardActive = false; /* evita re-exibição pelo fetchPdvConfigs */

  const showWizard = function() {
    if (_wizardActive) return; /* já aberto, ignora */
    const el = document.getElementById('onboarding-wizard');
    if (!el) return;
    _wizardActive = true;
    _garantirInputsGeo();
    el.classList.remove('hidden');
    _wizardStep = 0;
    _wizardProdutos = [];
    _renderWizardStep();
    _renderWizProdutos();
  };

  function _renderWizardStep() {
    _attachWizardInputMasks();
    for (let i = 0; i <= 4; i++) {
      const panel = document.getElementById('wizard-panel-' + i);
      if (panel) panel.style.display = i === _wizardStep ? 'block' : 'none';
    }
    const nav = document.getElementById('wizard-nav');
    const header = document.getElementById('wizard-header');
    const progWrap = document.getElementById('wizard-progress-wrap');

    if (_wizardStep === 0) {
      if (nav) nav.style.display = 'none';
      if (header) header.style.display = 'none';
      if (progWrap) progWrap.style.display = 'none';
      return;
    } else {
      if (header) header.style.display = 'flex';
      if (progWrap) progWrap.style.display = 'flex';
    }
    const bar = document.getElementById('wizard-progress-bar');
    const num = document.getElementById('wizard-step-num');
    const title = document.getElementById('wizard-step-title');
    const btnBack = document.getElementById('wizard-btn-back');
    const btnNext = document.getElementById('wizard-btn-next');

    if (bar) bar.style.width = (_wizardStep <= 3 ? (_wizardStep / _wizardTotal * 100) : 100) + '%';
    if (num) num.textContent = _wizardStep <= 3 ? _wizardStep : 3;
    if (nav) nav.style.display = _wizardStep === 4 ? 'none' : 'flex';
    if (btnBack) btnBack.style.display = _wizardStep > 1 ? 'inline-flex' : 'none';

    const titles = { 1: 'Dados do Restaurante & Conta do Dono', 2: 'Configurar Mesas', 3: 'Primeiros Produtos', 4: 'Tudo Pronto!' };
    if (title) title.textContent = titles[_wizardStep] || '';
    if (btnNext) {
      if (_wizardStep === 3) {
        btnNext.innerHTML = 'Finalizar <i class="ph-bold ph-check"></i>';
      } else {
        btnNext.innerHTML = 'Próximo <i class="ph-bold ph-arrow-right"></i>';
      }
    }

    /* Pré-visualiza mesas no passo 2 */
    if (_wizardStep === 2) {
      window.wizardSetModoMesas(_wizardModoMesas || 'exemplos');
      _updateMesasPreview();
    }
    /* Passo 3: opção de limpar exemplos (pré-marcada se escolheu "do zero") */
    if (_wizardStep === 3) {
      const wrap = document.getElementById('wiz-sem-exemplos-wrap');
      const chk = document.getElementById('wiz-sem-exemplos');
      if (wrap) wrap.style.display = 'flex';
      if (chk && _wizardModoMesas === 'zero' && !chk.dataset.touched) chk.checked = true;
    }
  }

  function _updateMesasPreview() {
    const preview = document.getElementById('wiz-mesas-preview');
    const qtd = parseInt(document.getElementById('wiz-qtd-mesas')?.value) || 0;
    const addDelivery = document.getElementById('wiz-add-delivery')?.checked;
    const addBalcao = document.getElementById('wiz-add-balcao')?.checked;
    if (!preview) return;
    let items = [];
    for (let i = 1; i <= qtd; i++) items.push('Mesa ' + i);
    if (addDelivery) items.push('Delivery');
    if (addBalcao) items.push('Balcão');
    preview.innerHTML = items.map(n =>
      '<span style="background:rgba(252,75,21,0.1); border:1px solid rgba(252,75,21,0.2); color:#f8fafc; padding:4px 10px; border-radius:8px; font-size:12px; white-space:nowrap;">' + n + '</span>'
    ).join('');
  }
  window._updateMesasPreview = _updateMesasPreview;

  function _renderWizProdutos() {
    const list = document.getElementById('wiz-produtos-list');
    if (!list) return;
    if (_wizardProdutos.length === 0) {
      /* Produtos sugeridos por modalidade */
      const mod = window.pdvConfigs?.rest_modalidade || 'a_la_carte';
      const sugestoes = {
        'a_la_carte': [
          { categoria: 'Pratos', nome: 'Filé com Fritas', preco: 42.90, emoji: '🍽️' },
          { categoria: 'Bebidas', nome: 'Suco Natural', preco: 8.90, emoji: '🧃' },
          { categoria: 'Sobremesas', nome: 'Pudim', preco: 12.90, emoji: '🍮' }
        ],
        'pizzaria': [
          { categoria: 'Pizzas', nome: 'Margherita', preco: 49.90, emoji: '🍕' },
          { categoria: 'Pizzas', nome: 'Calabresa', preco: 44.90, emoji: '🍕' },
          { categoria: 'Bebidas', nome: 'Guaraná', preco: 7.90, emoji: '🥤' }
        ],
        'lanchonete': [
          { categoria: 'Lanches', nome: 'X-Burger', preco: 24.90, emoji: '🍔' },
          { categoria: 'Lanches', nome: 'Hot Dog', preco: 18.90, emoji: '🌭' },
          { categoria: 'Bebidas', nome: 'Coca-Cola Lata', preco: 8.90, emoji: '🥤' }
        ],
        'bar': [
          { categoria: 'Drinks', nome: 'Caipirinha', preco: 19.90, emoji: '🍹' },
          { categoria: 'Petiscos', nome: 'Bolinho de Bacalhau', preco: 28.90, emoji: '🧆' },
          { categoria: 'Bebidas', nome: 'Chopp 500ml', preco: 14.90, emoji: '🍺' }
        ],
        'a_kilo': [
          { categoria: 'Pratos', nome: 'Arroz com Feijão (100g)', preco: 8.90, emoji: '🍚' },
          { categoria: 'Saladas', nome: 'Salada Caesar (100g)', preco: 12.90, emoji: '🥗' },
          { categoria: 'Carnes', nome: 'Picanha (100g)', preco: 22.90, emoji: '🥩' }
        ],
        'buffet': [
          { categoria: 'Rodízio', nome: 'Rodízio Almoço', preco: 59.90, emoji: '🍽️' },
          { categoria: 'Bebidas', nome: 'Suco ilimitado', preco: 15.90, emoji: '🧃' }
        ],
        'balada': [
          { categoria: 'Drinks', nome: 'Long Island', preco: 28.90, emoji: '🍹' },
          { categoria: 'Bebidas', nome: 'Chopp Duplo', preco: 22.90, emoji: '🍺' },
          { categoria: 'Porções', nome: 'Porção de Fritas', preco: 34.90, emoji: '🍟' }
        ],
        'quiosque': [
          { categoria: 'Lanches', nome: 'Sanduíche Natural', preco: 14.90, emoji: '🥪' },
          { categoria: 'Bebidas', nome: 'Água Mineral', preco: 5.90, emoji: '💧' },
          { categoria: 'Doces', nome: 'Açaí 500ml', preco: 18.90, emoji: '🫐' }
        ],
        'eventos': [
          { categoria: 'Fichas', nome: 'Ficha de Consumo', preco: 10.00, emoji: '🎟️' },
          { categoria: 'Pratos', nome: 'Prato Executivo', preco: 39.90, emoji: '🍽️' },
          { categoria: 'Bebidas', nome: 'Refrigerante Lata', preco: 8.90, emoji: '🥤' }
        ]
      };
      _wizardProdutos = (sugestoes[mod] || sugestoes['a_la_carte']).map(p => ({ ...p }));
    }
    window._wizardProdutos = _wizardProdutos;
    _refreshProdutosList();
  }

  window._wizardUpdateProduto = function(index, field, value) {
    if (_wizardProdutos && _wizardProdutos[index]) {
      _wizardProdutos[index][field] = field === 'preco' ? (parseFloat(value) || 0) : value;
    }
  };
  window._wizardRemoveProduto = function(index) {
    if (_wizardProdutos) {
      _wizardProdutos.splice(index, 1);
      _refreshProdutosList();
    }
  };

  function _refreshProdutosList() {
    const list = document.getElementById('wiz-produtos-list');
    if (!list) return;
    list.innerHTML = _wizardProdutos.map((p, i) => `
      <div style="display:flex; gap:8px; align-items:center; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:8px 10px;">
        <span style="font-size:20px; flex-shrink:0;">${p.emoji || '🍽️'}</span>
        <input type="text" value="${p.categoria || ''}" placeholder="Categoria" onchange="window._wizardUpdateProduto(${i}, 'categoria', this.value)" style="flex:1; min-width:0; padding:8px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.04); color:#f8fafc; font-size:13px; outline:none; box-sizing:border-box;">
        <input type="text" value="${p.nome || ''}" placeholder="Nome" onchange="window._wizardUpdateProduto(${i}, 'nome', this.value)" style="flex:2; min-width:0; padding:8px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.04); color:#f8fafc; font-size:13px; outline:none; box-sizing:border-box;">
        <input type="number" value="${p.preco || 0}" placeholder="R$" step="0.01" min="0" onchange="window._wizardUpdateProduto(${i}, 'preco', this.value)" style="width:80px; padding:8px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.04); color:#f8fafc; font-size:13px; outline:none; box-sizing:border-box;">
        <button type="button" onclick="window._wizardRemoveProduto(${i})" style="background:none; border:none; color:#ef4444; cursor:pointer; padding:4px; flex-shrink:0;" title="Remover"><i class="ph ph-x-circle" style="font-size:18px;"></i></button>
      </div>
    `).join('');
  }

  const wizardAddProdutoRow = function() {
    _wizardProdutos.push({ categoria: '', nome: '', preco: 0, emoji: '🍽️' });
    window._wizardProdutos = _wizardProdutos;
    _refreshProdutosList();
    const list = document.getElementById('wiz-produtos-list');
    if (list) {
      const lastInputs = list.querySelectorAll('div:last-child input[type="text"]');
      if (lastInputs[0]) lastInputs[0].focus();
    }
  };

  /* Modo do passo 2: usar exemplos prontos vs configurar do zero */
  const wizardSetModoMesas = function(modo) {
    _wizardModoMesas = (modo === 'zero') ? 'zero' : 'exemplos';
    const cardEx = document.getElementById('wiz-modo-exemplos-card');
    const cardZero = document.getElementById('wiz-modo-zero-card');
    const detZero = document.getElementById('wiz-zero-detalhes');
    const resumoEx = document.getElementById('wiz-exemplos-resumo');
    if (cardEx) {
      cardEx.style.borderColor = _wizardModoMesas === 'exemplos' ? '#fc4b15' : 'rgba(255,255,255,0.08)';
      cardEx.style.background = _wizardModoMesas === 'exemplos' ? 'rgba(252,75,21,0.08)' : 'rgba(255,255,255,0.03)';
      const r = cardEx.querySelector('input[type="radio"]'); if (r) r.checked = _wizardModoMesas === 'exemplos';
    }
    if (cardZero) {
      cardZero.style.borderColor = _wizardModoMesas === 'zero' ? '#fc4b15' : 'rgba(255,255,255,0.08)';
      cardZero.style.background = _wizardModoMesas === 'zero' ? 'rgba(252,75,21,0.08)' : 'rgba(255,255,255,0.03)';
      const r = cardZero.querySelector('input[type="radio"]'); if (r) r.checked = _wizardModoMesas === 'zero';
    }
    if (detZero) detZero.style.display = _wizardModoMesas === 'zero' ? 'block' : 'none';
    if (resumoEx) resumoEx.style.display = _wizardModoMesas === 'exemplos' ? 'block' : 'none';
    if (_wizardModoMesas === 'zero') _updateMesasPreview();
  };

  const wizardGetModoMesas = function() { return _wizardModoMesas || 'exemplos'; };

  /* ═══════════════════════════════════════════════════════════════ */
  /* PERSISTÊNCIA DAS ETAPAS DO ONBOARDING WIZARD                    */
  /* ═══════════════════════════════════════════════════════════════ */

  function _saveWizDonoData() {
    _garantirInputsGeo();
    const restNome = (document.getElementById('wiz-rest-nome')?.value || '').trim();
    const restTel = (document.getElementById('wiz-rest-tel')?.value || '').trim();
    const restEnd = (document.getElementById('wiz-rest-endereco')?.value || '').trim();
    const donoNome = (document.getElementById('wiz-dono-nome')?.value || '').trim();
    const donoUser = (document.getElementById('wiz-dono-usuario')?.value || '').trim().toLowerCase();
    const donoSenha = document.getElementById('wiz-dono-senha')?.value || '';
    const donoPin = (document.getElementById('wiz-dono-pin')?.value || '').replace(/\D/g, '') || '0000';

    const lat = document.getElementById('wiz-geo-lat')?.value || '-23.5505';
    const lng = document.getElementById('wiz-geo-lng')?.value || '-46.6333';
    const prec = document.getElementById('wiz-geo-precisao')?.value || '500';

    const payload = {
      nome_restaurante: restNome,
      telefone_restaurante: restTel,
      endereco_restaurante: restEnd,
      dono_nome: donoNome,
      dono_usuario: donoUser,
      dono_senha: donoSenha,
      dono_pin: donoPin,
      restaurante_lat: lat,
      restaurante_lng: lng,
      restaurante_precisao: prec
    };

    fetch('/api/setup-dono', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(r => r.json())
      .then(data => {
        if (data && data.ok) {
          if (data.token) localStorage.setItem('chef_token', data.token);
          if (data.user) localStorage.setItem('currentUser', JSON.stringify(data.user));
          localStorage.setItem('userRole', 'admin');
          localStorage.setItem('is_dono', 'true');
          _showWizardToast('Conta Master e restaurante configurados!', 'success');
        }
      })
      .catch(err => console.warn('[Setup Dono Error]', err));

    if (typeof socket !== 'undefined' && socket && socket.emit) {
      socket.emit('save_restaurante_config', {
        nome_restaurante: restNome,
        telefone_restaurante: restTel,
        endereco_restaurante: restEnd,
        dono_nome: donoNome,
        dono_usuario: donoUser
      });
      socket.emit('novo_cadastro_saas', {
        restauranteNome: restNome,
        nome: donoNome,
        usuario: donoUser,
        telefone: restTel,
        etapa: '2-configurar-mesas',
        lat: parseFloat(lat) || -23.5505,
        lng: parseFloat(lng) || -46.6333
      });
    }

    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome_restaurante: restNome,
        telefone_restaurante: restTel,
        endereco_restaurante: restEnd,
        dono_nome: donoNome,
        dono_usuario: donoUser
      })
    }).catch(() => {});
  }

  function _saveWizMesas() {
    if (typeof window._saveWizMesas === 'function') {
      try { window._saveWizMesas(); return; } catch(e) { console.warn(e); }
    }
    const modo = (typeof wizardGetModoMesas === 'function' ? wizardGetModoMesas() : _wizardModoMesas) || 'exemplos';
    if (modo === 'exemplos') return;
    const qtd = parseInt(document.getElementById('wiz-qtd-mesas')?.value) || 0;
    const addDelivery = document.getElementById('wiz-add-delivery')?.checked;
    const addBalcao = document.getElementById('wiz-add-balcao')?.checked;
    const nomes = [];
    for (let i = 1; i <= qtd; i++) nomes.push('Mesa ' + i);
    if (addDelivery) nomes.push('Delivery');
    if (addBalcao) nomes.push('Balcão');
    if (nomes.length && typeof socket !== 'undefined' && socket && socket.emit) {
      socket.emit('setup_redefinir_mesas', nomes);
    }
  }

  function _saveWizProdutos() {
    if (typeof window._saveWizProdutos === 'function') {
      try { window._saveWizProdutos(); return; } catch(e) { console.warn(e); }
    }
    const semExemplos = document.getElementById('wiz-sem-exemplos')?.checked;
    if (semExemplos && typeof socket !== 'undefined' && socket && socket.emit) {
      socket.emit('setup_limpar_produtos_exemplo');
    }
    if (Array.isArray(_wizardProdutos) && typeof socket !== 'undefined' && socket && socket.emit) {
      _wizardProdutos.forEach(p => {
        if (p.nome && p.nome.trim()) {
          socket.emit('add_produto', {
            categoria: p.categoria || 'Geral',
            nome: p.nome.trim(),
            preco: p.preco || 0,
            emoji: p.emoji || '🍽️',
            hasAddons: false,
            setor: 'Cozinha 1',
            status_inicial: 'Em espera',
            status: 'ativo',
            categoria_fiscal: 'Alimentacao',
            descricao: '',
            codigo_barras: null,
            visibilidade: 'todos'
          });
        }
      });
    }
  }

  const wizardFinish = function() {
    if (typeof window.wizardFinish === 'function' && window.wizardFinish !== wizardFinish) {
      try { window.wizardFinish(); return; } catch(e) { console.warn(e); }
    }
    _wizardActive = false;
    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onboarding_completo: 'true' })
    }).catch(() => {});
    if (typeof socket !== 'undefined' && socket && socket.emit) {
      socket.emit('save_restaurante_config', { onboarding_completo: 'true' });
    }
    const el = document.getElementById('onboarding-wizard');
    if (el) el.classList.add('hidden');
    _showWizardToast('Configuração inicial concluída! 🎉', 'success');
  };

  const wizardSkip = function() {
    if (typeof window.wizardSkip === 'function' && window.wizardSkip !== wizardSkip) {
      try { window.wizardSkip(); return; } catch(e) { console.warn(e); }
    }
    const el = document.getElementById('onboarding-wizard');
    if (el) el.classList.add('hidden');
  };

  const wizardNext = function() {
    if (_wizardStep === 1) {
      const restNomeEl = document.getElementById('wiz-rest-nome');
      const restTelEl = document.getElementById('wiz-rest-tel');
      const restEndEl = document.getElementById('wiz-rest-endereco');
      const donoNomeEl = document.getElementById('wiz-dono-nome');
      const donoUserEl = document.getElementById('wiz-dono-usuario');
      const donoSenhaEl = document.getElementById('wiz-dono-senha');
      const donoPinEl = document.getElementById('wiz-dono-pin');

      const restNome = (restNomeEl?.value || '').trim();
      const restTel = (restTelEl?.value || '').replace(/\D/g, '');
      const restEnd = (restEndEl?.value || '').trim();
      const donoNome = (donoNomeEl?.value || '').trim();
      const donoUser = (donoUserEl?.value || '').trim().toLowerCase();
      const donoSenha = donoSenhaEl?.value || '';
      const donoPin = (donoPinEl?.value || '').replace(/\D/g, '');

      // Helper para erro visual
      const marcarErro = (el, msg) => {
        if (el) {
          el.style.borderColor = '#ef4444';
          el.focus();
        }
        _showWizardToast(msg, 'warning');
      };

      // 1. Validação do Nome do Restaurante
      if (!restNome || restNome.length < 3) {
        return marcarErro(restNomeEl, 'O nome do restaurante deve ter no mínimo 3 caracteres válidos.');
      }
      if (/^([a-zA-Z0-9])\1+$/.test(restNome) && restNome.length <= 4) {
        return marcarErro(restNomeEl, 'Por favor, digite um nome de restaurante válido (ex: Restaurante Sabor & Arte).');
      }

      // 2. Validação do Telefone (se informado, deve ter DDD + número válido)
      if (restTel && restTel.length < 10) {
        return marcarErro(restTelEl, 'Informe um telefone/WhatsApp válido com DDD (mínimo 10 dígitos, ex: (11) 99999-0000).');
      }

      // 3. Validação do Endereço (se informado, pelo menos 4 caracteres)
      if (restEnd && restEnd.length < 4) {
        return marcarErro(restEndEl, 'Informe um endereço válido (mínimo 4 caracteres).');
      }

      // 4. Validação do Nome do Dono
      if (!donoNome || donoNome.length < 3) {
        return marcarErro(donoNomeEl, 'Informe o nome do Dono / Responsável (mínimo 3 caracteres).');
      }

      // 5. Validação do Usuário do Dono
      if (!donoUser || donoUser.length < 3) {
        return marcarErro(donoUserEl, 'O usuário de login do Dono deve ter pelo menos 3 caracteres (ex: admin).');
      }
      if (!/^[a-z0-9._-]+$/.test(donoUser)) {
        return marcarErro(donoUserEl, 'O usuário do Dono deve conter apenas letras minúsculas, números, ponto (.) ou traço (-).');
      }

      // 6. Validação da Senha do Dono
      if (!donoSenha || donoSenha.length < 4) {
        return marcarErro(donoSenhaEl, 'A senha do Dono deve ter no mínimo 4 caracteres para sua segurança.');
      }

      // 7. Validação do PIN Master
      if (donoPin && donoPin.length < 4) {
        return marcarErro(donoPinEl, 'O PIN master deve conter exatamente 4 ou 6 números.');
      }

      /* Salva dados do restaurante e conta do dono */
      _saveWizDonoData();
      _wizardStep = 2;
      _renderWizardStep();
    } else if (_wizardStep === 2) {
      /* Salva mesas */
      _saveWizMesas();
      _wizardStep = 3;
      _renderWizardStep();
    } else if (_wizardStep === 3) {
      /* Salva produtos e mostra tela de conclusão */
      _saveWizProdutos();
      _wizardStep = 4;
      _renderWizardStep();
    }
  };

  function _attachWizardInputMasks() {
    const telInp = document.getElementById('wiz-rest-tel');
    if (telInp && !telInp.dataset.masked) {
      telInp.dataset.masked = 'true';
      telInp.addEventListener('input', function(e) {
        let v = e.target.value.replace(/\D/g, '').slice(0, 11);
        if (v.length > 10) {
          v = v.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
        } else if (v.length > 6) {
          v = v.replace(/^(\d{2})(\d{4})(\d{0,4})$/, '($1) $2-$3');
        } else if (v.length > 2) {
          v = v.replace(/^(\d{2})(\d{0,5})$/, '($1) $2');
        } else if (v.length > 0) {
          v = '(' + v;
        }
        e.target.value = v;
        e.target.style.borderColor = 'rgba(255,255,255,0.08)';
      });
    }

    const pinInp = document.getElementById('wiz-dono-pin');
    if (pinInp && !pinInp.dataset.masked) {
      pinInp.dataset.masked = 'true';
      pinInp.addEventListener('input', function(e) {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
        e.target.style.borderColor = 'rgba(255,255,255,0.1)';
      });
    }

    const userInp = document.getElementById('wiz-dono-usuario');
    if (userInp && !userInp.dataset.masked) {
      userInp.dataset.masked = 'true';
      userInp.addEventListener('input', function(e) {
        e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 30);
        e.target.style.borderColor = 'rgba(255,255,255,0.1)';
      });
    }

    const nomeInp = document.getElementById('wiz-rest-nome');
    if (nomeInp && !nomeInp.dataset.masked) {
      nomeInp.dataset.masked = 'true';
      nomeInp.addEventListener('input', function(e) {
        e.target.style.borderColor = 'rgba(255,255,255,0.08)';
      });
    }

    const donoNomeInp = document.getElementById('wiz-dono-nome');
    if (donoNomeInp && !donoNomeInp.dataset.masked) {
      donoNomeInp.dataset.masked = 'true';
      donoNomeInp.addEventListener('input', function(e) {
        e.target.style.borderColor = 'rgba(255,255,255,0.1)';
      });
    }

    const donoSenhaInp = document.getElementById('wiz-dono-senha');
    if (donoSenhaInp && !donoSenhaInp.dataset.masked) {
      donoSenhaInp.dataset.masked = 'true';
      donoSenhaInp.addEventListener('input', function(e) {
        e.target.style.borderColor = 'rgba(255,255,255,0.1)';
      });
    }
  }

  const wizardPrev = function() {
    if (_wizardStep > 1) {
      _wizardStep--;
      _renderWizardStep();
    }
  };

  // Garante disponibilidade global no objeto window
  window.wizardToggleTerms = wizardToggleTerms;
  window.wizardStartFromTerms = wizardStartFromTerms;
  window.wizardDetectLocation = wizardDetectLocation;
  window.showWizard = showWizard;
  window.wizardAddProdutoRow = wizardAddProdutoRow;
  window.wizardSetModoMesas = wizardSetModoMesas;
  window.wizardGetModoMesas = wizardGetModoMesas;
  window.wizardNext = wizardNext;
  window.wizardPrev = wizardPrev;
  window.wizardSkip = wizardSkip;
  window.wizardFinish = wizardFinish;
  window._updateMesasPreview = _updateMesasPreview;

  export {
    wizardToggleTerms,
    wizardStartFromTerms,
    wizardDetectLocation,
    showWizard,
    wizardAddProdutoRow,
    wizardSetModoMesas,
    wizardGetModoMesas,
    wizardNext,
    wizardPrev,
    wizardSkip,
    wizardFinish,
    _updateMesasPreview
  };
