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

  let _avisoGeoExibido = false;
  let _timerAvisoGeo = null;
  function _avisarGeoIndisponivel() {
    if (_avisoGeoExibido) return;
    _avisoGeoExibido = true;
    const msg = 'Infelizmente não conseguimos localizar os dados do estabelecimento automaticamente. Sem problemas: você pode preencher tudo manualmente, digitando como antes.';
    if (typeof window.showToast === 'function') window.showToast(msg, 'warning');
    else alert(msg);
  }

  const wizardStartFromTerms = function() {
    const chk = document.getElementById('wiz-terms-check');
    if (!chk || !chk.checked) {
      alert('Por favor, leia e aceite os Termos de Uso para continuar.');
      return;
    }

    const btn = document.getElementById('wiz-btn-start');
    if (btn) {
      btn.innerHTML = '<i class="ph-bold ph-spinner ph-spin"></i> <span>Iniciando Inteligência de Cadastro...</span>';
    }

    _avisoGeoExibido = false;
    if (_timerAvisoGeo) { clearTimeout(_timerAvisoGeo); _timerAvisoGeo = null; }

    // 1. Pede a localização ao clicar em Continuar
    if (navigator.geolocation) {
      // Fallback informativo: se em ~3s não conseguir localizar, orienta a digitar manualmente
      _timerAvisoGeo = setTimeout(_avisarGeoIndisponivel, 3000);

      navigator.geolocation.getCurrentPosition(
        function(pos) {
          if (_timerAvisoGeo) { clearTimeout(_timerAvisoGeo); _timerAvisoGeo = null; }
          const lat = parseFloat(pos.coords.latitude.toFixed(6));
          const lng = parseFloat(pos.coords.longitude.toFixed(6));
          const prec = Math.round(pos.coords.accuracy);

          // Salva coordenadas nos campos ocultos
          const latInp = document.getElementById('wiz-geo-lat');
          const lngInp = document.getElementById('wiz-geo-lng');
          const precInp = document.getElementById('wiz-geo-precisao');
          if (latInp) latInp.value = lat;
          if (lngInp) lngInp.value = lng;
          if (precInp) precInp.value = prec;

          // Emite alerta em tempo real para o Super Admin
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

          // Dispara Deep Research em background para preencher os campos do restaurante
          _executarDeepResearchPorLocalizacao(lat, lng);

          // Avança para o Passo 1
          _avancarParaPasso1();
        },
        function(err) {
          if (_timerAvisoGeo) { clearTimeout(_timerAvisoGeo); _timerAvisoGeo = null; }
          _avisarGeoIndisponivel();
          console.warn('[Geo Permission Ignored/Failed]', err);
          // Emite alerta mesmo com fallback de IP
          if (typeof socket !== 'undefined' && socket && socket.emit) {
            socket.emit('novo_cadastro_saas', {
              restauranteNome: 'Novo Cadastro Iniciado',
              nome: 'Novo Cliente',
              etapa: '1-dados-estabelecimento'
            });
          }
          _avancarParaPasso1();
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    } else {
      _avisarGeoIndisponivel();
      _avancarParaPasso1();
    }
  };

  function _avancarParaPasso1() {
    _wizardStep = 0;
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

        // Preenche dados do restaurante
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
          if (typeof _renderWizProdutos === 'function') {
            _renderWizProdutos();
          }
        }

        if (typeof window.showToast === 'function') {
          const msg = d.avaliacao ? '✨ Google Meu Negócio identificado (' + d.avaliacao + ')! Dados e cardápio pré-cadastrados.' : '✨ Estabelecimento identificado! Dados e cardápio pré-cadastrados.';
          window.showToast(msg, 'success');
        }
      } else {
        _avisarGeoIndisponivel();
      }
    })
    .catch(err => { console.warn('[DeepResearch Error]', err); _avisarGeoIndisponivel(); });
  }



  // ─── VERIFICAÇÃO DE LOCALIZAÇÃO & TELEMETRIA DO SETUP INICIAL ───
  let _wizGeoLoading = false;
  const wizardDetectLocation = function(userInitiated) {
    if (_wizGeoLoading) return;
    const card = document.getElementById('wiz-geo-card');
    const icon = document.getElementById('wiz-geo-icon');
    const statusText = document.getElementById('wiz-geo-status-text');
    const btn = document.getElementById('wiz-btn-detect-geo');
    const latInp = document.getElementById('wiz-geo-lat');
    const lngInp = document.getElementById('wiz-geo-lng');
    const precInp = document.getElementById('wiz-geo-precisao');

    if (!navigator.geolocation) {
      if (statusText) statusText.innerHTML = '<span style="color:#f59e0b;">GPS não suportado neste navegador. Prosseguindo com localização por IP.</span>';
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

        // Dispara beacon de progresso
        _enviarTelemetriaSetup();
      },
      function(err) {
        _wizGeoLoading = false;
        console.warn('[Wizard Geo Error]', err);
        if (btn) {
          btn.innerHTML = '<i class="ph-bold ph-crosshair"></i> <span>Tentar Novamente</span>';
        }
        if (err.code === 1) { // PERMISSION_DENIED
          if (statusText) statusText.innerHTML = '<span style="color:#ef4444;">Permissão negada. Clique em "Tentar Novamente" e autorize o acesso à localização para concluir o setup.</span>';
          if (userInitiated) {
            if (typeof window.showToast === 'function') window.showToast('Por favor, autorize o acesso à localização no navegador para concluir o setup do restaurante.', 'warning');
            else alert('Por favor, autorize o acesso à localização no navegador para concluir o setup do restaurante.');
          }
        } else {
          if (statusText) statusText.innerHTML = '<span style="color:#f59e0b;">Não foi possível obter GPS com precisão. Clique em "Tentar Novamente".</span>';
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
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

    const titles = { 1: 'Dados do Restaurante', 2: 'Configurar Mesas', 3: 'Primeiros Produtos', 4: 'Tudo Pronto!' };
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
    _refreshProdutosList();
  }

  function _refreshProdutosList() {
    const list = document.getElementById('wiz-produtos-list');
    if (!list) return;
    list.innerHTML = _wizardProdutos.map((p, i) => `
      <div style="display:flex; gap:8px; align-items:center; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:8px 10px;">
        <span style="font-size:20px; flex-shrink:0;">${p.emoji}</span>
        <input type="text" value="${p.categoria}" placeholder="Categoria" onchange="_wizardProdutos[${i}].categoria=this.value" style="flex:1; min-width:0; padding:8px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.04); color:#f8fafc; font-size:13px; outline:none; box-sizing:border-box;">
        <input type="text" value="${p.nome}" placeholder="Nome" onchange="_wizardProdutos[${i}].nome=this.value" style="flex:2; min-width:0; padding:8px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.04); color:#f8fafc; font-size:13px; outline:none; box-sizing:border-box;">
        <input type="number" value="${p.preco}" placeholder="R$" step="0.01" min="0" onchange="_wizardProdutos[${i}].preco=parseFloat(this.value)||0" style="width:80px; padding:8px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.04); color:#f8fafc; font-size:13px; outline:none; box-sizing:border-box;">
        <button onclick="_wizardProdutos.splice(${i},1); _refreshProdutosList();" style="background:none; border:none; color:#ef4444; cursor:pointer; padding:4px; flex-shrink:0;" title="Remover"><i class="ph ph-x-circle" style="font-size:18px;"></i></button>
      </div>
    `).join('');
  }

  const wizardAddProdutoRow = function() {
    _wizardProdutos.push({ categoria: '', nome: '', preco: 0, emoji: '🍽️' });
    _refreshProdutosList();
    /* Foca no último input de categoria */
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
        if (typeof window.showToast === 'function') window.showToast(msg, 'warning');
        else alert(msg);
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


export { wizardToggleTerms, wizardStartFromTerms, wizardDetectLocation, showWizard, wizardAddProdutoRow, wizardSetModoMesas, wizardGetModoMesas, wizardNext, wizardPrev, _updateMesasPreview };
