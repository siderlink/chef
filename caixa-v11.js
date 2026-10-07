
  // ── MOTOR DE CUSTOMIZAÇÃO DE CORES, BOTÕES E TIPOGRAFIA POR BLOCO ──
  const STYLES_STORAGE_KEY = 'chef_v11_custom_widget_styles';

  function getCustomStyles() {
    try { return JSON.parse(localStorage.getItem(STYLES_STORAGE_KEY)) || {}; } catch(e) { return {}; }
  }

  function saveCustomStyles(styles) {
    try { localStorage.setItem(STYLES_STORAGE_KEY, JSON.stringify(styles)); } catch(e) {}
  }

  function aplicarEstilosCustomizados() {
    const styles = getCustomStyles();
    grid.querySelectorAll('.v11-widget').forEach(widget => {
      const id = widget.getAttribute('data-w');
      const st = styles[id];
      if (st) {
        if (st.bgColor) widget.style.backgroundColor = st.bgColor;
        if (st.headerBg) {
          const hdr = widget.querySelector('header');
          if (hdr) hdr.style.backgroundColor = st.headerBg;
        }
        if (st.textColor) widget.style.color = st.textColor;
        if (st.fontFamily) widget.style.fontFamily = st.fontFamily;
        if (st.fontSize) widget.style.fontSize = st.fontSize;
        if (st.btnBg) {
          widget.querySelectorAll('button:not(.w-size):not(.w-hide):not(.w-style), .v11-go, a.v11-go').forEach(btn => {
            btn.style.backgroundColor = st.btnBg;
            btn.style.borderColor = st.btnBg;
          });
        }
      }
    });
  }

  window.abrirModalPersonalizarEstilosWidget = function(widgetId, widgetTitle) {
    const existing = document.getElementById('modal-customizar-estilos-widget');
    if (existing) existing.remove();

    const styles = getCustomStyles();
    const st = styles[widgetId] || {
      bgColor: '#ffffff',
      headerBg: '#f8fafc',
      textColor: '#0f172a',
      btnBg: '#fc4b15',
      fontFamily: 'Outfit, sans-serif',
      fontSize: '14px',
      modalColor: '#fc4b15'
    };

    const modal = document.createElement('div');
    modal.id = 'modal-customizar-estilos-widget';
    modal.style.cssText = 'position:fixed; inset:0; z-index:1000000; background:rgba(15,23,42,0.65); backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; padding:16px; animation:v11Fade 0.2s ease;';
    
    modal.innerHTML = `
      <div style="background:#ffffff; border-radius:20px; width:100%; max-width:480px; box-shadow:0 25px 60px rgba(0,0,0,0.35); overflow:hidden; font-family:'Outfit',sans-serif; color:#0f172a;">
        <div style="padding:16px 20px; background:#f8fafc; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
          <h3 style="margin:0; font-size:16.5px; font-weight:800; display:flex; align-items:center; gap:8px;">
            <i class="ph-bold ph-palette" style="color:#fc4b15;"></i> Personalizar: ${widgetTitle || widgetId}
          </h3>
          <button onclick="document.getElementById('modal-customizar-estilos-widget').remove()" style="background:#e2e8f0; border:none; width:30px; height:30px; border-radius:50%; cursor:pointer; font-size:16px; display:flex; align-items:center; justify-content:center; color:#64748b;">&times;</button>
        </div>

        <div style="padding:20px; display:flex; flex-direction:column; gap:14px; max-height:75vh; overflow-y:auto;">
          <!-- 1. COR DO BLOCO / FUNDO -->
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <label style="font-size:13px; font-weight:700; color:#475569;">Cor de Fundo do Bloco:</label>
            <div style="display:flex; align-items:center; gap:8px;">
              <input type="color" id="v11-st-bg" value="${st.bgColor || '#ffffff'}" style="width:36px; height:36px; border:none; border-radius:8px; cursor:pointer;">
            </div>
          </div>

          <!-- 2. COR DO CABEÇALHO / MODAL -->
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <label style="font-size:13px; font-weight:700; color:#475569;">Cor do Cabeçalho & Modal:</label>
            <div style="display:flex; align-items:center; gap:8px;">
              <input type="color" id="v11-st-header" value="${st.headerBg || '#f8fafc'}" style="width:36px; height:36px; border:none; border-radius:8px; cursor:pointer;">
            </div>
          </div>

          <!-- 3. COR DOS BOTÕES DE AÇÃO -->
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <label style="font-size:13px; font-weight:700; color:#475569;">Cor dos Botões de Ação:</label>
            <div style="display:flex; align-items:center; gap:8px;">
              <input type="color" id="v11-st-btn" value="${st.btnBg || '#fc4b15'}" style="width:36px; height:36px; border:none; border-radius:8px; cursor:pointer;">
            </div>
          </div>

          <!-- 4. COR DA LETRA / TEXTO -->
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <label style="font-size:13px; font-weight:700; color:#475569;">Cor do Texto / Letras:</label>
            <div style="display:flex; align-items:center; gap:8px;">
              <input type="color" id="v11-st-text" value="${st.textColor || '#0f172a'}" style="width:36px; height:36px; border:none; border-radius:8px; cursor:pointer;">
            </div>
          </div>

          <!-- 5. TIPOGRAFIA / FONTE -->
          <div style="display:flex; flex-direction:column; gap:6px;">
            <label style="font-size:13px; font-weight:700; color:#475569;">Família da Fonte / Letra:</label>
            <select id="v11-st-font" style="padding:10px 12px; border-radius:10px; border:1.5px solid #e2e8f0; font-size:13.5px; font-weight:600; outline:none; background:#f8fafc;">
              <option value="'Outfit', sans-serif" ${st.fontFamily && st.fontFamily.includes('Outfit') ? 'selected' : ''}>Outfit (Padrão Moderno)</option>
              <option value="'Inter', sans-serif" ${st.fontFamily && st.fontFamily.includes('Inter') ? 'selected' : ''}>Inter (Legibilidade Alta)</option>
              <option value="'Roboto', sans-serif" ${st.fontFamily && st.fontFamily.includes('Roboto') ? 'selected' : ''}>Roboto (Clássico)</option>
              <option value="'Montserrat', sans-serif" ${st.fontFamily && st.fontFamily.includes('Montserrat') ? 'selected' : ''}>Montserrat (Elegante)</option>
              <option value="'Poppins', sans-serif" ${st.fontFamily && st.fontFamily.includes('Poppins') ? 'selected' : ''}>Poppins (Arredondado)</option>
              <option value="monospace" ${st.fontFamily && st.fontFamily.includes('monospace') ? 'selected' : ''}>Monoespaçado (Técnico)</option>
            </select>
          </div>

          <!-- 6. TAMANHO DA LETRA -->
          <div style="display:flex; flex-direction:column; gap:6px;">
            <label style="font-size:13px; font-weight:700; color:#475569;">Tamanho Geral da Letra:</label>
            <select id="v11-st-size" style="padding:10px 12px; border-radius:10px; border:1.5px solid #e2e8f0; font-size:13.5px; font-weight:600; outline:none; background:#f8fafc;">
              <option value="12.5px" ${st.fontSize === '12.5px' ? 'selected' : ''}>Pequeno (12.5px)</option>
              <option value="14px" ${st.fontSize === '14px' ? 'selected' : ''}>Padrão Médio (14px)</option>
              <option value="15.5px" ${st.fontSize === '15.5px' ? 'selected' : ''}>Grande (15.5px)</option>
              <option value="17px" ${st.fontSize === '17px' ? 'selected' : ''}>Extra Grande (17px)</option>
            </select>
          </div>
        </div>

        <div style="padding:14px 20px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
          <button type="button" onclick="window.restaurarEstilosWidget('${widgetId}')" style="background:transparent; border:none; color:#ef4444; font-size:12.5px; font-weight:700; cursor:pointer;">
            <i class="ph-bold ph-arrow-counter-clockwise"></i> Restaurar Padrão
          </button>
          <div style="display:flex; gap:8px;">
            <button type="button" onclick="document.getElementById('modal-customizar-estilos-widget').remove()" style="padding:9px 16px; border-radius:8px; background:#e2e8f0; border:none; font-size:13px; font-weight:700; cursor:pointer; color:#475569;">Cancelar</button>
            <button type="button" onclick="window.salvarEstilosWidget('${widgetId}')" style="padding:9px 18px; border-radius:8px; background:#fc4b15; border:none; font-size:13px; font-weight:800; cursor:pointer; color:#ffffff;">Salvar Estilo</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  };

  window.salvarEstilosWidget = function(widgetId) {
    const styles = getCustomStyles();
    styles[widgetId] = {
      bgColor: document.getElementById('v11-st-bg').value,
      headerBg: document.getElementById('v11-st-header').value,
      btnBg: document.getElementById('v11-st-btn').value,
      textColor: document.getElementById('v11-st-text').value,
      fontFamily: document.getElementById('v11-st-font').value,
      fontSize: document.getElementById('v11-st-size').value
    };

    saveCustomStyles(styles);
    aplicarEstilosCustomizados();
    const modal = document.getElementById('modal-customizar-estilos-widget');
    if (modal) modal.remove();
    if (typeof showToast === 'function') showToast('Estilo do bloco salvo com sucesso!', 'success');
  };

  window.restaurarEstilosWidget = function(widgetId) {
    const styles = getCustomStyles();
    delete styles[widgetId];
    saveCustomStyles(styles);
    const widget = grid.querySelector('[data-w="' + widgetId + '"]');
    if (widget) {
      widget.removeAttribute('style');
      const hdr = widget.querySelector('header');
      if (hdr) hdr.removeAttribute('style');
    }
    const modal = document.getElementById('modal-customizar-estilos-widget');
    if (modal) modal.remove();
    if (typeof showToast === 'function') showToast('Estilo padrão restaurado.', 'info');
  };

/* ═══════════════════════════════════════════════════════════════
   CHEF COZINHA — CAIXA v1.1
   Interface modular: blocos arrastáveis, redimensionáveis e
   responsivos por perfil (TV / Desktop / Tablet / Mobile).
   ═══════════════════════════════════════════════════════════════ */
(function () {

  // ─── AUTH HEADERS ────────────────────────────────────────────
  function authHeaders() {
    const token = localStorage.getItem('chef_token');
    return token ? { 'Authorization': 'Bearer ' + token } : {};
  }

  // ─── SOCKET ──────────────────────────────────────────────────
  const socket = io({ query: { token: localStorage.getItem('chef_token'), restaurante_id: localStorage.getItem('restaurante_id') || '1' } });

  // ─── ELEMENTOS ───────────────────────────────────────────────
  const grid = document.getElementById('v11-grid');
  const profilePill = document.getElementById('v11-profile-pill');

  const WIDGETS_DEFAULT_ORDER = ['resumo', 'mesas', 'chamados', 'fila', 'ponto', 'atalhos'];
  const WIDGET_SIZE_LABEL = { s: 'P', m: 'M', l: 'G' };
  const WIDGET_SIZE_CYCLE = { s: 'm', m: 'l', l: 's' };

  let editando = false;
  let dragEl = null;

  // ─── PERFIL DE RESOLUÇÃO ─────────────────────────────────────
  function detectarPerfil() {
    const w = window.innerWidth;
    if (w >= 1600) return 'tv';
    if (w >= 1024) return 'desktop';
    if (w >= 640) return 'tablet';
    return 'mobile';
  }

  // ─── LAYOUT PERSISTIDO POR PERFIL ────────────────────────────
  const LAYOUT_KEY = 'chef_v11_layout_v1';

  function getLayouts() {
    try { return JSON.parse(localStorage.getItem(LAYOUT_KEY)) || {}; } catch (e) { return {}; }
  }

  function salvarLayouts(l) {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(l)); } catch (e) { }
  }

  function layoutAtual() {
    const perf = document.body.getAttribute('data-profile');
    const all = getLayouts();
    if (!all[perf]) {
      all[perf] = { order: WIDGETS_DEFAULT_ORDER.slice(), hidden: [], sizes: {} };
      salvarLayouts(all);
    }
    return all[perf];
  }

  function aplicarLayout() {
    const lay = layoutAtual();
    // Reordena no DOM
    lay.order.forEach(id => {
      const el = grid.querySelector('[data-w="' + id + '"]');
      if (el) grid.appendChild(el);
    });
    // Ocultos
    grid.querySelectorAll('.v11-widget').forEach(el => {
      const id = el.getAttribute('data-w');
      el.classList.toggle('w-escondido', lay.hidden.indexOf(id) !== -1);
      const sz = lay.sizes[id] || el.dataset.defaultSize;
      el.classList.remove('sz-s', 'sz-m', 'sz-l');
      el.classList.add('sz-' + (WIDGET_SIZE_LABEL[sz] ? sz : el.dataset.defaultSize));
      const btn = el.querySelector('.w-size');
      if (btn) btn.textContent = WIDGET_SIZE_LABEL[sz] || WIDGET_SIZE_LABEL[el.dataset.defaultSize];
    });
  }

  function persistir() {
    const perf = document.body.getAttribute('data-profile');
    const all = getLayouts();
    all[perf] = {
      order: Array.from(grid.querySelectorAll('.v11-widget')).map(el => el.getAttribute('data-w')),
      hidden: (layoutAtual().hidden || []).slice(),
      sizes: Object.assign({}, layoutAtual().sizes)
    };
    salvarLayouts(all);
  }

  // Tamanhos padrão por bloco
  grid.querySelectorAll('.v11-widget').forEach(el => {
    const m = el.className.match(/sz-(s|m|l)/);
    el.dataset.defaultSize = m ? m[1] : 'm';
  });

  // ─── MODO EDIÇÃO (arrastar / tamanho / ocultar) ──────────────
  const btnEditar = document.getElementById('v11-btn-editar');
  const btnResetar = document.getElementById('v11-btn-resetar');

  btnEditar.addEventListener('click', () => {
    editando = !editando;
    document.body.classList.toggle('v11-editando', editando);
    btnEditar.classList.toggle('ativo', editando);
  });

  btnResetar.addEventListener('click', () => {
    const perf = document.body.getAttribute('data-profile');
    const all = getLayouts();
    delete all[perf];
    salvarLayouts(all);
    aplicarLayout(); aplicarEstilosCustomizados();
    window.showToast && window.showToast('Layout restaurado para o padrão.', 'success');
  });

  grid.addEventListener('click', (e) => {
    if (!editando) return;
    const widget = e.target.closest('.v11-widget');
    if (!widget) return;
    if (e.target.closest('.w-style')) {
      const id = widget.getAttribute('data-w');
      const title = widget.querySelector('h2') ? widget.querySelector('h2').innerText : id;
      window.abrirModalPersonalizarEstilosWidget(id, title);
    } else if (e.target.classList.contains('w-size')) {
      const lay = layoutAtual();
      const id = widget.getAttribute('data-w');
      const atual = lay.sizes[id] || widget.dataset.defaultSize;
      lay.sizes[id] = WIDGET_SIZE_CYCLE[atual] || 'm';
      const perf = document.body.getAttribute('data-profile');
      const all = getLayouts(); all[perf] = lay; salvarLayouts(all);
      aplicarLayout();
    } else if (e.target.classList.contains('w-hide')) {
      const lay = layoutAtual();
      const id = widget.getAttribute('data-w');
      if (lay.hidden.indexOf(id) === -1) lay.hidden.push(id);
      const perf = document.body.getAttribute('data-profile');
      const all = getLayouts(); all[perf] = lay; salvarLayouts(all);
      aplicarLayout();
      window.showToast && window.showToast('Bloco oculto neste perfil. Use "Restaurar" para trazer de volta.', 'info');
    }
  });

  // Drag & drop dos blocos
  grid.addEventListener('dragstart', (e) => {
    if (!editando) return;
    dragEl = e.target.closest('.v11-widget');
    if (!dragEl) return;
    dragEl.classList.add('dragging');
    try { e.dataTransfer.setData('text/plain', dragEl.getAttribute('data-w')); } catch (err) { }
    e.dataTransfer.effectAllowed = 'move';
  });

  grid.addEventListener('dragover', (e) => {
    if (!editando || !dragEl) return;
    e.preventDefault();
    const alvo = e.target.closest('.v11-widget');
    grid.querySelectorAll('.drop-alvo').forEach(el => el.classList.remove('drop-alvo'));
    if (alvo && alvo !== dragEl) alvo.classList.add('drop-alvo');
  });

  grid.addEventListener('dragend', () => {
    if (dragEl) dragEl.classList.remove('dragging');
    grid.querySelectorAll('.drop-alvo').forEach(el => el.classList.remove('drop-alvo'));
    dragEl = null;
    persistir();
  });

  grid.addEventListener('drop', (e) => {
    if (!editando || !dragEl) return;
    e.preventDefault();
    const alvo = e.target.closest('.v11-widget');
    if (!alvo || alvo === dragEl) return;
    grid.insertBefore(dragEl, alvo);
    persistir();
    window.showToast && window.showToast('Layout atualizado!', 'success');
  });

  // ─── PERFIL ATIVO ────────────────────────────────────────────
  function aplicarPerfil() {
    const p = detectarPerfil();
    document.body.setAttribute('data-profile', p);
    const icones = { tv: 'ph-television', desktop: 'ph-monitor', tablet: 'ph-tablet', mobile: 'ph-device-mobile' };
    const nomes = { tv: 'TV', desktop: 'Desktop', tablet: 'Tablet', mobile: 'Celular' };
    if (profilePill) {
      profilePill.innerHTML = '<i class="ph ' + icones[p] + '"></i> ' + nomes[p];
    }
    aplicarLayout();
  }
  window.addEventListener('resize', () => {
    clearTimeout(window._v11Rz);
    window._v11Rz = setTimeout(aplicarPerfil, 150);
  });
  aplicarPerfil();

  // ─── RELÓGIO ─────────────────────────────────────────────────
  const clockEl = document.getElementById('v11-clock');
  function tick() {
    const d = new Date();
    clockEl.textContent = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }) + ' · ' +
      d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  tick(); setInterval(tick, 20000);

  // ─── ESTADO DO CAIXA ─────────────────────────────────────────
  const caixaPill = document.getElementById('v11-caixa-status');
  socket.on('estado_caixa', (turno) => {
    if (!caixaPill) return;
    if (turno && turno.status === 'aberto') {
      caixaPill.className = 'v11-pill v11-pill-on';
      caixaPill.innerHTML = '<i class="ph ph-lock-key-open"></i> Caixa Aberto';
    } else {
      caixaPill.className = 'v11-pill v11-pill-off';
      caixaPill.innerHTML = '<i class="ph ph-lock-key"></i> Caixa Fechado';
    }
  });

  // ─── DADOS AO VIVO ───────────────────────────────────────────
  let mesasData = [];
  let ordersData = [];
  const chamadosSet = new Set();

  const fmt = (n) => 'R$ ' + (Number(n) || 0).toFixed(2).replace('.', ',');

  function totalMesa(items) {
    let t = 0;
    (items || []).forEach(o => {
      if (o.productName && (String(o.productName).indexOf('Pgto Parcial') !== -1 || String(o.productName).indexOf('Pagamento') !== -1)) return;
      if (o.status !== 'Pago') t += parseFloat(String(o.total).replace(',', '.')) || 0;
    });
    return t;
  }

  function renderTudo() {
    renderResumo();
    renderMesas();
    renderChamados();
    renderFila();
  }

  function renderResumo() {
    // Faturamento = pagamentos registrados hoje (linhas negativas)
    const hoje = new Date();
    const dia = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0') + '-' + String(hoje.getDate()).padStart(2, '0');
    let fat = 0;
    ordersData.forEach(o => {
      const v = parseFloat(String(o.total).replace(',', '.')) || 0;
      if (v < 0 && String(o.createdAt || '').slice(0, 10) === dia) fat += Math.abs(v);
    });
    const fatEl = document.getElementById('v11-fat-hoje');
    if (fatEl) fatEl.textContent = fmt(fat);

    const nomesComItens = new Set();
    ordersData.forEach(o => { nomesComItens.add(o.mesa_grupo || o.localName); });
    const ocupEl = document.getElementById('v11-mesas-ocupadas');
    if (ocupEl) ocupEl.textContent = mesasData.filter(m => m.status !== 'Disponível').length || nomesComItens.size;

    const cpEl = document.getElementById('v11-contas-pedidas');
    if (cpEl) cpEl.textContent = chamadosSet.size;

    const prep = ordersData.filter(o => o.status === 'Preparando').length;
    const prepEl = document.getElementById('v11-em-preparo');
    if (prepEl) prepEl.textContent = prep;
  }

  function renderMesas() {
    const wrap = document.getElementById('v11-mesas-grid');
    if (!wrap) return;

    const grupos = {};
    ordersData.forEach(o => {
      const nome = o.mesa_grupo || o.localName;
      if (!nome) return;
      if (!grupos[nome]) grupos[nome] = [];
      grupos[nome].push(o);
    });

    const nomes = new Set(Object.keys(grupos));
    mesasData.forEach(m => nomes.add(m.nome));

    let html = '';
    Array.from(nomes).sort().forEach(nome => {
      if (!nome) return;
      const itens = grupos[nome] || [];
      const pend = totalMesa(itens);
      const pedida = chamadosSet.has(nome);
      const mesaRow = mesasData.find(m => m.nome === nome);
      let cls = 'm-livre', st = 'Livre';
      if (pedida) { cls = 'm-pedida'; st = 'Conta pedida'; }
      else if (itens.length) { cls = 'm-ocupada'; st = 'Ocupada'; }
      else if (mesaRow && mesaRow.status === 'Reservada') { cls = 'm-reservada'; st = 'Reservada'; }
      html += '<div class="m-chip ' + cls + '" title="' + nome + ' — ' + st + '"><span>' + nome + '</span><small>' +
        st + (pend > 0 ? ' · ' + fmt(pend) : '') + '</small></div>';
    });
    wrap.innerHTML = html || '<span class="w-empty">Nenhuma mesa cadastrada.</span>';
  }

  function renderChamados() {
    const ul = document.getElementById('v11-chamados-list');
    if (!ul) return;
    if (chamadosSet.size === 0) {
      ul.innerHTML = '<li class="w-empty">Nenhuma conta solicitada.</li>';
      return;
    }
    ul.innerHTML = Array.from(chamadosSet).map(nome =>
      '<li class="chamado"><i class="ph-fill ph-hand-raising"></i> ' + nome + '<b>aguardando</b></li>').join('');
  }

  function renderFila() {
    const ul = document.getElementById('v11-fila-list');
    if (!ul) return;
    const prontos = ordersData.filter(o => o.status === 'Pronto').slice(-6).reverse();
    if (prontos.length === 0) {
      ul.innerHTML = '<li class="w-empty">Sem itens prontos aguardando entrega.</li>';
      return;
    }
    ul.innerHTML = prontos.map(o =>
      '<li class="pronto"><i class="ph-fill ph-check-circle"></i> ' + (o.productName || 'Item') +
      '<b>' + (o.localName || o.mesa_grupo || '') + '</b></li>').join('');
  }

  socket.on('connect', () => {
    socket.emit('get_estado_caixa');
    socket.emit('get_mesas');
  });

  socket.on('mesas_atualizadas', (rows) => { mesasData = rows || []; renderTudo(); });

  socket.on('pedidos_caixa_atualizados', (rows) => { ordersData = rows || []; renderTudo(); });
  socket.on('initial_data_caixa', (rows) => { ordersData = rows || []; renderTudo(); });

  socket.on('toque_pedir_conta', (nome) => { chamadosSet.add(nome); renderTudo(); });
  socket.on('mesa_finalizada', ({ mesaName }) => { chamadosSet.delete(mesaName); renderTudo(); });

  socket.on('atualizacao_caixa', () => { socket.emit('get_estado_caixa'); });

  socket.on('novo_dispositivo_pwa', (data) => {
    if (window.showToast) {
       window.showToast(`📱 Novo dispositivo conectado: ${data.appName}`, 'success');
    } else {
       alert(`📱 Novo dispositivo conectado: ${data.appName}`);
    }
  });

  window.abrirModalPwa = function() {
    document.getElementById('modal-gerenciar-pwa').style.display = 'flex';
    window.carregarDispositivosPwa();
  };

  window.carregarDispositivosPwa = async function() {
    const container = document.getElementById('lista-pwa-container');
    container.innerHTML = '<p style="color:#94a3b8; text-align:center; font-size:13px;"><i class="ph-bold ph-spinner ph-spin"></i> Carregando...</p>';
    try {
      const res = await fetch('/api/pwa-dispositivos', {
         headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
      });
      const data = await res.json();
      if (!data || data.length === 0) {
         container.innerHTML = '<p style="color:#94a3b8; text-align:center; font-size:13px;">Nenhum dispositivo conectado recentemente.</p>';
         return;
      }
      
      container.innerHTML = data.map(d => {
         const icon = d.app_id === 'garcom' ? 'ph-notebook' : (d.app_id === 'cozinha' ? 'ph-cooking-pot' : 'ph-device-mobile');
         const isOnline = (new Date() - new Date(d.last_seen)) < 5 * 60000; // < 5 minutos
         const statusDot = isOnline ? '<span style="display:inline-block; width:8px; height:8px; background:#22c55e; border-radius:50%; margin-right:6px;"></span>' : '<span style="display:inline-block; width:8px; height:8px; background:#ef4444; border-radius:50%; margin-right:6px;"></span>';
         
         return `
           <div style="background:#0f172a; border:1px solid #334155; border-radius:12px; padding:16px; margin-bottom:12px; display:flex; flex-direction:column; gap:12px;">
             <div style="display:flex; justify-content:space-between; align-items:center;">
               <div style="display:flex; align-items:center; gap:12px;">
                 <div style="width:40px; height:40px; border-radius:8px; background:rgba(59,130,246,0.1); color:#3b82f6; display:flex; align-items:center; justify-content:center; font-size:20px;">
                   <i class="ph-bold ${icon}"></i>
                 </div>
                 <div>
                   <strong style="color:#f8fafc; font-size:14px; display:block;">${d.app_name}</strong>
                   <span style="color:#94a3b8; font-size:12px; display:flex; align-items:center; margin-top:4px;">${statusDot} Visto: ${new Date(d.last_seen).toLocaleTimeString()}</span>
                 </div>
               </div>
               <button onclick="removerDispositivoPwa('${d.device_id}')" title="Desconectar" style="background:rgba(239,68,68,0.1); color:#ef4444; border:none; width:36px; height:36px; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:18px;">
                 <i class="ph-bold ph-trash"></i>
               </button>
             </div>
             <div style="display:flex; gap:8px; flex-wrap:wrap; font-size:12px;">
                <select id="pwa-tipo-${d.device_id}" style="background:#1e293b; color:white; border:1px solid #334155; border-radius:6px; padding:6px; outline:none;" onchange="salvarPermissoesPwa('${d.device_id}')">
                   <option value="padrao" ${d.perm_tipo === 'padrao'?'selected':''}>Tipo: Padrão</option>
                   <option value="garcom" ${d.perm_tipo === 'garcom'?'selected':''}>Garçom</option>
                   <option value="cozinha" ${d.perm_tipo === 'cozinha'?'selected':''}>Cozinha</option>
                   <option value="motoboy" ${d.perm_tipo === 'motoboy'?'selected':''}>Motoboy</option>
                </select>
                <select id="pwa-classe-${d.device_id}" style="background:#1e293b; color:white; border:1px solid #334155; border-radius:6px; padding:6px; outline:none;" onchange="salvarPermissoesPwa('${d.device_id}')">
                   <option value="operacional" ${d.perm_classe === 'operacional'?'selected':''}>Operacional</option>
                   <option value="supervisao" ${d.perm_classe === 'supervisao'?'selected':''}>Supervisão</option>
                   <option value="gerencial" ${d.perm_classe === 'gerencial'?'selected':''}>Gerencial</option>
                </select>
                <select id="pwa-genero-${d.device_id}" style="background:#1e293b; color:white; border:1px solid #334155; border-radius:6px; padding:6px; outline:none;" onchange="salvarPermissoesPwa('${d.device_id}')">
                   <option value="mobile" ${d.perm_genero === 'mobile'?'selected':''}>Mobile</option>
                   <option value="kds" ${d.perm_genero === 'kds'?'selected':''}>Passivo (KDS)</option>
                   <option value="terminal" ${d.perm_genero === 'terminal'?'selected':''}>Terminal</option>
                </select>
                <select id="pwa-grau-${d.device_id}" style="background:#1e293b; color:white; border:1px solid #334155; border-radius:6px; padding:6px; outline:none;" onchange="salvarPermissoesPwa('${d.device_id}')">
                   <option value="1" ${d.perm_grau == 1?'selected':''}>Grau 1 (Básico)</option>
                   <option value="2" ${d.perm_grau == 2?'selected':''}>Grau 2 (Edição)</option>
                   <option value="3" ${d.perm_grau == 3?'selected':''}>Grau 3 (Admin)</option>
                </select>
             </div>
           </div>
         `;
      }).join('');
    } catch(err) {
      container.innerHTML = '<p style="color:#ef4444; text-align:center; font-size:13px;">Erro ao carregar dispositivos.</p>';
    }
  };

  window.removerDispositivoPwa = async function(deviceId) {
    if (!confirm('Deseja realmente remover este dispositivo?')) return;
    try {
      await fetch('/api/pwa-dispositivos/' + deviceId + '/remover', {
         method: 'POST',
         headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
      });
      window.carregarDispositivosPwa();
    } catch(err) {
      alert('Erro ao remover dispositivo');
    }
  };

  window.salvarPermissoesPwa = async function(deviceId) {
    const tipo = document.getElementById('pwa-tipo-' + deviceId).value;
    const classe = document.getElementById('pwa-classe-' + deviceId).value;
    const genero = document.getElementById('pwa-genero-' + deviceId).value;
    const grau = document.getElementById('pwa-grau-' + deviceId).value;
    
    try {
      await fetch('/api/pwa-dispositivos/' + deviceId + '/permissoes', {
         method: 'POST',
         headers: { 
           'Authorization': 'Bearer ' + localStorage.getItem('token'),
           'Content-Type': 'application/json'
         },
         body: JSON.stringify({ tipo, classe, genero, grau })
      });
      if (window.showToast) window.showToast('Permissões salvas!', 'success');
    } catch(err) {
      alert('Erro ao salvar permissões');
    }
  };
  
  // ─── QR DO PONTO (com renderizador direto e robusto) ──────────
  let pontoUrl = '';
  const pontoImg = document.getElementById('v11-ponto-img');
  const pontoZoom = document.getElementById('qr-ponto-img-zoomed');

  function renderizarQrPonto(url) {
    if (!url) return;
    pontoUrl = url;
    if (typeof window.qrImg === 'function') {
      if (pontoImg) window.qrImg(pontoImg, url, 300);
      if (pontoZoom) window.qrImg(pontoZoom, url, 340);
    } else {
      const src = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(url);
      if (pontoImg) pontoImg.src = src;
      if (pontoZoom) pontoZoom.src = src;
    }
  }

  socket.on('update_ponto_token', (data) => {
    if (data && data.url) renderizarQrPonto(data.url);
  });

  socket.on('connect', () => {
    // Solicitar token inicial caso já conectado
    if (pontoUrl) renderizarQrPonto(pontoUrl);
    else {
      const fallbackUrl = window.location.origin + '/painel-funcionario.html';
      renderizarQrPonto(fallbackUrl);
    }
  });


  window.v11AbrirQrPonto = function () {
    const modal = document.getElementById('modal-zoom-qr-ponto');
    if (!modal || !pontoZoom) return;
    modal.style.display = 'flex';
    if (window.chefModoEsperaArmar) window.chefModoEsperaArmar('modal-zoom-qr-ponto', 450);
  };

  // ─── ATALHOS (todas as seções do sistema) ────────────────────
  const ATALHOS = [
    { i: 'ph-squares-four', l: 'PDV / Mesas', u: '/index.html' },
    { i: 'ph-device-mobile', l: 'Caixa Mobile', u: '/pdv-mobile.html' },
    { i: 'ph-motorcycle', l: 'Delivery', u: '/hub-delivery.html' },
    { i: 'ph-fork-knife', l: 'Garçom', u: '/garcom.html' },
    { i: 'ph-book-open-text', l: 'Cardápio', u: '/cardapio.html' },
    { i: 'ph-monitor-play', l: 'Totem', u: '/totem.html' },
    { i: 'ph-cooking-pot', l: 'Fila de Preparo', u: '/fila-pedidos.html' },
    { i: 'ph-chart-line-up', l: 'Dashboard', u: '/dashboard.html' },
    { i: 'ph-wallet', l: 'Financeiro', u: '/financeiro.html' },
    { i: 'ph-gear-six', l: 'Configurações', u: '/configuracoes.html' },
    { i: 'ph-crown-simple', l: 'Painel do Dono', u: '/painel-dono.html' },
    { i: 'ph-users-three', l: 'Equipe', u: '/painel-funcionario.html' }
  ];

  const navAtalhos = document.getElementById('v11-atalhos');
  if (navAtalhos) {
    navAtalhos.innerHTML = ATALHOS.map(a =>
      '<a class="a-btn" href="' + a.u + '"><i class="ph-fill ' + a.i + '"></i>' + a.l + '</a>').join('');
  }

  // ─── VOLTAR AO TEMA CLÁSSICO ─────────────────────────────────
  const btnClassico = document.getElementById('v11-btn-classico');
  if (btnClassico) {
    btnClassico.addEventListener('click', () => {
      try { localStorage.setItem('chef_caixa_tema', 'classico'); } catch (e) { }
      fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ caixa_tema: 'classico' })
      }).catch(() => { });
      window.location.href = '/index.html';
    });
  }

  // ─── PLUG-AND-PLAY MODULES (CHEFMODULES BUS) ─────────────────
  function renderModuleWidget(fullId, widget) {
    let existing = grid.querySelector('[data-w="' + fullId + '"]');
    if (existing) return;

    const el = document.createElement('article');
    const sizeClass = widget.defaultSize || 'sz-m';
    el.className = 'v11-widget ' + sizeClass;
    el.setAttribute('data-w', fullId);
    el.dataset.defaultSize = sizeClass.replace('sz-', '');

    el.innerHTML =
      '<header>' +
        '<i class="ph-fill ' + (widget.icon || 'ph-puzzle-piece') + '"></i>' +
        '<h2>' + (widget.title || 'Módulo') + '</h2>' +
        '<div class="w-ctl">' +
          '<button class="w-size" title="Tamanho">M</button>' +
          '<button class="w-hide" title="Ocultar">×</button>' +
        '</div>' +
      '</header>' +
      '<div class="w-body v11-module-widget-body" id="widget-body-' + fullId.replace(/[^a-zA-Z0-9_-]/g, '_') + '">' +
      '</div>';

    grid.appendChild(el);
    const bodyContainer = el.querySelector('.v11-module-widget-body');

    if (typeof widget.render === 'function') {
      try {
        widget.render(bodyContainer, { socket, authHeaders });
      } catch(err) {
        console.error('[ChefModules] Erro ao renderizar widget "' + fullId + '":', err);
      }
    } else if (typeof widget.template === 'string') {
      bodyContainer.innerHTML = widget.template;
    }

    if (typeof widget.onMount === 'function') {
      try { widget.onMount(bodyContainer, { socket, authHeaders }); } catch(e) {}
    }
  }

  if (window.ChefModules) {
    window.ChefModules.on('widget_registered', ({ fullId, widget }) => {
      renderModuleWidget(fullId, widget);
      aplicarLayout();
    });

    window.ChefModules.initAutoLoader('caixa_v11').then(() => {
      window.ChefModules.getWidgets().forEach(w => {
        renderModuleWidget(w.fullId, w);
      });
      aplicarLayout();
    });
  }

})();
