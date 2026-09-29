
const isDonoMaster = function() {
  try {
    if (localStorage.getItem('is_dono') === 'true') return true;
    if (localStorage.getItem('userRole') === 'admin') return true;
    const u = JSON.parse(localStorage.getItem('currentUser') || '{}');
    if (u.is_dono === true || u.role === 'admin' || u.cargo === 'Dono' || (u.cargo && u.cargo.includes('Dono'))) return true;
  } catch (e) {}
  return false;
};

function formatarTempoFila(mins) {
  if (!mins || mins <= 0) return 'agora';
  if (mins < 60) return `${mins} min`;
  if (mins < 1440) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(mins / 1440);
  return `+${d}d`;
}


function escHtml(t){return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function escJs(t){try{return JSON.stringify(String(t==null?'':t)).replace(/</g,'\\x3C').replace(/>/g,'\\x3E').replace(/"/g,'&quot;').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');}catch(e){return '""';}}

// --- DETECÇÃO DETALHADA E ÚNICA DE DISPOSITIVOS ---
function authHeaders() {
  const t = localStorage.getItem('chef_token');
  const h = { 'Content-Type': 'application/json' };
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
}
window.authHeaders = authHeaders;
const obterInfoDetalhadaDispositivo = function () {
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const screenW = window.screen.width;
  const screenH = window.screen.height;
  const touchPoints = navigator.maxTouchPoints || 0;

  let os = 'Windows';
  let model = 'Computador PC';
  let icon = 'ph-desktop';

  if (/android/i.test(ua)) {
    os = 'Android';
    if (touchPoints > 0 && Math.min(screenW, screenH) >= 600) {
      model = 'Tablet Android';
      icon = 'ph-device-tablet';
    } else {
      model = 'Smartphone Android';
      icon = 'ph-device-mobile';
    }
    if (/samsung/i.test(ua)) model = 'Samsung Galaxy';
    else if (/xiaomi|redmi|mi /i.test(ua)) model = 'Xiaomi Redmi';
    else if (/motorola|moto/i.test(ua)) model = 'Motorola Moto';
  } else if (/iphone/i.test(ua) || (platform === 'MacIntel' && touchPoints > 1)) {
    os = 'iOS';
    model = (touchPoints > 1 && screenW >= 768) ? 'iPad (Apple Tablet)' : 'iPhone (Apple)';
    icon = (touchPoints > 1 && screenW >= 768) ? 'ph-device-tablet' : 'ph-device-mobile';
  } else if (/macintosh|mac os x/i.test(ua)) {
    os = 'macOS';
    model = 'MacBook / Mac Apple';
    icon = 'ph-desktop';
  } else if (/windows/i.test(ua)) {
    os = 'Windows';
    model = (touchPoints > 0 && Math.max(screenW, screenH) <= 1366) ? 'Notebook Touch' : 'Computador PC / Terminal';
    icon = 'ph-desktop';
  } else if (/linux/i.test(ua)) {
    os = 'Linux';
    model = 'Terminal Linux';
    icon = 'ph-desktop';
  }

  let browser = 'Chrome';
  if (/edg/i.test(ua)) browser = 'Edge';
  else if (/chrome|crios/i.test(ua)) browser = 'Chrome';
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
  else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';

  const apelidoCustom = localStorage.getItem('apelido_dispositivo') || '';
  if (apelidoCustom) {
    model = `${apelidoCustom} (${model})`;
  }

  return { os, browser, model, icon, resolution: `${screenW}x${screenH}`, userAgent: ua };
};

const enviarRegistroSessaoDetalhado = function () {
  if (typeof socket !== 'undefined' && socket.emit) {
    const dev = window.obterInfoDetalhadaDispositivo();
    const userLogado = localStorage.getItem('logged_user') || localStorage.getItem('usuarioLogado') || (document.getElementById('status-user-name') ? document.getElementById('status-user-name').innerText.trim() : 'Operador');
    const cargoLogado = localStorage.getItem('cargoLogado') || 'Caixa / PDV';

    socket.emit('registrar_sessao_detalhada', {
      nome: userLogado,
      cargo: cargoLogado,
      model: dev.model,
      os: dev.os,
      browser: dev.browser,
      icon: dev.icon,
      resolution: dev.resolution,
      userAgent: dev.userAgent,
      serial: window.obterSerialDispositivo()
    });
  }
};

/* ── Modo Totem remoto: se o dono configurou este terminal como quiosque,
   ele vira auto-atendimento (cardápio digital), com tela invertida opcional.
   Os listeners são registrados após a criação do socket (mais abaixo). ── */
const aplicarModoTotem = function (modo) {
  try {
    if (!modo || modo === 'normal') return;
    const rid = localStorage.getItem('restaurante_id') || '1';
    const rot = modo === 'totem_invertido' ? '&rot=180' : '';
    sessionStorage.setItem('cc_modo_totem', modo);
    window.location.href = `/cardapio.html?restaurante_id=${encodeURIComponent(rid)}&mesa=Totem&totem=1${rot}`;
  } catch (e) { }
};

// Serial estável do terminal: gerado uma vez e guardado no navegador da máquina.
// Permite o dono identificar "qual computador é qual" mesmo com 15+ terminais.
const obterSerialDispositivo = function () {
  try {
    let serial = localStorage.getItem('cc_serial_dispositivo');
    if (!serial) {
      const rnd = () => Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').padEnd(4, 'X').slice(0, 4);
      serial = 'CC-' + rnd() + '-' + rnd();
      // Persistência extra: guarda também em sessionStorage e como cookie
      localStorage.setItem('cc_serial_dispositivo', serial);
      try { document.cookie = 'cc_serial_dispositivo=' + serial + ';path=/;max-age=31536000;SameSite=Lax'; } catch (e) {}
    }
    return serial;
  } catch (e) { return 'CC-DESCONHECIDO'; }
};

// Rastreamento global de cliques em botões e navegação
document.addEventListener('click', (e) => {
  const btn = e.target.closest('button, a, input[type="button"], input[type="submit"], .btn, .btn-action, [onclick]');
  if (!btn) return;
  const label = (btn.innerText || btn.title || btn.ariaLabel || btn.value || btn.id || btn.className || 'Botao').trim().replace(/\s+/g, ' ').substring(0, 50);
  const pagina = window.location.pathname.split('/').pop() || 'index.html';
  if (typeof socket !== 'undefined' && socket.emit) {
    socket.emit('registrar_clique_botao', { botao: label, pagina });
  }
}, true);

const apelidarDispositivo = function () {
  const atual = localStorage.getItem('apelido_dispositivo') || '';
  const novoApelido = prompt('Digite um nome/identificador fácil para este aparelho (ex: Comanda Garçom 01, Tablet Cozinha, Notebook Caixa):', atual);
  if (novoApelido !== null) {
    const limpo = novoApelido.trim();
    if (limpo) {
      localStorage.setItem('apelido_dispositivo', limpo);
      alert(`✅ Este aparelho agora se chama "${limpo}"!`);
    } else {
      localStorage.removeItem('apelido_dispositivo');
      alert('Apelido removido. Usando identificação automática.');
    }
    window.enviarRegistroSessaoDetalhado();
  }
};

window.onDragStartTable = (e, mesa) => {
  if (!e || !e.dataTransfer) return;
  const card = e.target ? e.target.closest('.mesa-item') : null;
  const nomeMesa = mesa || (card ? (card.getAttribute('data-mesa') || card.getAttribute('data-nome')) : '');

  try { e.dataTransfer.setData('Text', nomeMesa); } catch(err) {}
  try { e.dataTransfer.setData('text/plain', nomeMesa); } catch(err) {}
  try { e.dataTransfer.setData('type', 'table'); } catch(err) {}
  try { e.dataTransfer.setData('mesa', nomeMesa); } catch(err) {}
  e.dataTransfer.effectAllowed = 'move';

  if (card) {
    card.classList.add('dragging-chef');
  }
};

window.onDragStartItem = (e, itemId, comandaName = '') => {
  e.dataTransfer.setData('type', 'item');
  e.dataTransfer.setData('itemId', String(itemId));
  e.dataTransfer.setData('comanda', String(comandaName || ''));
  e.dataTransfer.effectAllowed = 'move';
  if (e.target && e.target.classList) {
    e.target.classList.add('dragging-item-row');
  }
};

window.onDragOverComandaRow = (e) => {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  const target = e.currentTarget;
  if (target && !target.classList.contains('drag-over-comanda')) {
    target.classList.add('drag-over-comanda');
  }
};

window.onDragLeaveComandaRow = (e) => {
  const target = e.currentTarget;
  if (target) {
    target.classList.remove('drag-over-comanda');
  }
};

window.onDropItemOnComanda = (e, comandaName) => {
  e.preventDefault();
  e.stopPropagation();
  const target = e.currentTarget;
  if (target) target.classList.remove('drag-over-comanda');

  const type = e.dataTransfer.getData('type');
  if (type === 'item') {
    const itemId = e.dataTransfer.getData('itemId');
    if (!itemId) return;
    socket.emit('atribuir_comanda_item', { itemId: itemId, comandaName: comandaName || null, operador: window.crmPerfil ? window.crmPerfil.nome : 'Desconhecido' });
  }
};

window.onDropItemOnNovaComanda = (e) => {
  e.preventDefault();
  if (e.type === 'drop') {
    e.stopPropagation();
  }
  const target = e.currentTarget;
  if (target) target.classList.remove('drag-over-comanda');

  let itemId = null;
  if (e.dataTransfer) {
    const type = e.dataTransfer.getData('type');
    if (type === 'item') {
      itemId = e.dataTransfer.getData('itemId');
    }
  }

  const promptMsg = itemId
    ? 'Digite o nome do cliente / comanda para mover este produto (ex: Yo, Pedro, Maria):'
    : 'Digite o nome da nova comanda para esta mesa:';

  const nome = prompt(promptMsg);
  if (nome && nome.trim()) {
    if (itemId) {
      socket.emit('atribuir_comanda_item', { itemId: itemId, comandaName: nome.trim(), operador: window.crmPerfil ? window.crmPerfil.nome : 'Desconhecido' });
    } else {
      socket.emit('nova_comanda_crm', { nome: nome.trim(), telefone: '' });
    }
  }
};

window.alterarComandaItemDirect = (itemId, currentComanda) => {
  const msg = currentComanda
    ? `Este item está na comanda "${currentComanda}".\n\nDigite o nome de outra comanda para mover este produto, ou deixe EM BRANCO para remover da comanda e colocar nos Itens Compartilhados da Mesa:`
    : `Este item está nos Itens Compartilhados da Mesa.\n\nDigite o nome da comanda para a qual deseja mover este produto (ex: Yo, Pedro, Maria):`;
  const res = prompt(msg, currentComanda || '');
  if (res !== null) {
    socket.emit('atribuir_comanda_item', { itemId: itemId, comandaName: res.trim() || null, operador: window.crmPerfil ? window.crmPerfil.nome : 'Desconhecido' });
  }
};

// ═════════════════════════════════════════════════════════════════════
// ➗ DIVISÃO DE ITENS COMPARTILHADOS EM FRAÇÕES E ATRIBUIÇÃO A COMANDAS
// ═════════════════════════════════════════════════════════════════════
let currentItemFracao = null;
let currentPresetFracoes = 2;

window.abrirModalDividirItemFracao = (itemId, productName, productEmoji, totalVal, qty) => {
  const modal = document.getElementById('modal-dividir-item-fracao');
  if (!modal) return;

  currentItemFracao = {
    id: itemId,
    nome: productName,
    emoji: productEmoji || '🍽️',
    total: parseFloat(totalVal || 0),
    qty: parseFloat(qty || 1)
  };

  const emojiEl = document.getElementById('modal-fracao-emoji');
  if (emojiEl) emojiEl.innerText = currentItemFracao.emoji;
  const nomeEl = document.getElementById('modal-fracao-item-nome');
  if (nomeEl) nomeEl.innerText = currentItemFracao.nome;
  const qtdEl = document.getElementById('modal-fracao-qtd-original');
  if (qtdEl) qtdEl.innerText = `Qtd: ${currentItemFracao.qty} un`;
  const totalEl = document.getElementById('modal-fracao-item-total');
  if (totalEl) totalEl.innerText = `R$ ${currentItemFracao.total.toFixed(2).replace('.', ',')}`;

  window.selecionarPresetFracoes(2);
  modal.style.display = 'flex';
};

window.fecharModalDividirItemFracao = () => {
  const modal = document.getElementById('modal-dividir-item-fracao');
  if (modal) modal.style.display = 'none';
  currentItemFracao = null;
};

window.selecionarPresetFracoes = (qtd) => {
  const isCustom = qtd === 'custom';
  currentPresetFracoes = isCustom ? parseInt(document.getElementById('input-custom-num-fracoes').value || 5, 10) : qtd;

  document.querySelectorAll('#grid-preset-fracoes .btn-preset-fracao').forEach(btn => {
    btn.style.borderColor = 'var(--border-color, #cbd5e1)';
    btn.style.background = 'var(--bg-card, #ffffff)';
    btn.style.color = 'var(--text-primary, #0f172a)';
    btn.classList.remove('active');
  });

  const activeBtnId = isCustom ? 'btn-fracao-preset-custom' : `btn-fracao-preset-${qtd}`;
  const activeBtn = document.getElementById(activeBtnId);
  if (activeBtn) {
    activeBtn.style.borderColor = '#fc4b15';
    activeBtn.style.background = 'rgba(252,75,21,0.1)';
    activeBtn.style.color = '#fc4b15';
    activeBtn.classList.add('active');
  }

  const customBox = document.getElementById('container-custom-fracoes-qtd');
  if (customBox) customBox.style.display = isCustom ? 'block' : 'none';

  window.gerarCamposFracoes(currentPresetFracoes);
};

window.gerarCamposFracoes = (numPartes) => {
  const container = document.getElementById('container-lista-fracoes-items');
  if (!container || !currentItemFracao) return;

  const n = Math.max(2, Math.min(20, numPartes || 2));
  currentPresetFracoes = n;

  const valorPorParte = currentItemFracao.total / n;
  const qtdPorParte = currentItemFracao.qty / n;

  // Extrair comandas ativas na mesa atual
  const comandasAtivas = [];
  if (window.mesaAtual && Array.isArray(window.mesaAtual.items)) {
    window.mesaAtual.items.forEach(o => {
      const c = (o.mesa_comanda || '').trim();
      if (c && !comandasAtivas.includes(c)) comandasAtivas.push(c);
    });
  }

  let html = '';
  for (let i = 0; i < n; i++) {
    const fracaoStr = n === 2 ? '½' : (n === 3 ? '⅓' : (n === 4 ? '¼' : `${i + 1}/${n}`));
    const percent = ((1 / n) * 100).toFixed(0);

    const suggestedComanda = comandasAtivas[i] || '';

    html += `
      <div class="fracao-item-row" style="background: var(--bg-card, #ffffff); border: 1.5px solid var(--border-color, #e2e8f0); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: 800; font-size: 13.5px; color: var(--text-primary, #0f172a); display: flex; align-items: center; gap: 6px;">
            <span style="background: #2563eb; color: white; border-radius: 6px; padding: 2px 7px; font-size: 12px; font-weight: 800;">${fracaoStr}</span>
            Fração ${i + 1} (${percent}%)
          </span>
          <div style="display: flex; align-items: center; gap: 4px;">
            <span style="font-size: 12px; color: var(--text-secondary, #64748b);">Valor:</span>
            <strong style="color: #3ab55b; font-size: 14px;">R$ ${valorPorParte.toFixed(2).replace('.', ',')}</strong>
          </div>
        </div>

        <div style="display: flex; gap: 8px; align-items: center;">
          <div style="flex: 1;">
            <select class="select-fracao-comanda" data-index="${i}" data-fracao="${fracaoStr}" data-valor="${valorPorParte}" data-qtd="${qtdPorParte}" onchange="window.onFracaoComandaChange(this, ${i})" style="width: 100%; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border-color, #cbd5e1); font-size: 13px; font-weight: 600; background: var(--bg-secondary, #f8fafc); color: var(--text-primary, #0f172a);">
              <option value="" ${!suggestedComanda ? 'selected' : ''}>🪑 Manter Compartilhado na Mesa</option>
              ${comandasAtivas.map(c => `<option value="${c}" ${c === suggestedComanda ? 'selected' : ''}>👤 Comanda: ${c}</option>`).join('')}
              <option value="__NOVA__">➕ Criar Nova Comanda...</option>
            </select>
          </div>
          <input type="text" class="input-nova-comanda-fracao" id="input-nova-comanda-fracao-${i}" placeholder="Nome do cliente/comanda" style="display: none; flex: 1; padding: 8px 10px; border-radius: 8px; border: 1.5px solid #fc4b15; font-size: 13px; font-weight: 600; color: #fc4b15; background: #fff7ed;">
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
};

window.onFracaoComandaChange = (sel, idx) => {
  const inputNova = document.getElementById(`input-nova-comanda-fracao-${idx}`);
  if (!inputNova) return;
  if (sel.value === '__NOVA__') {
    inputNova.style.display = 'block';
    setTimeout(() => inputNova.focus(), 50);
  } else {
    inputNova.style.display = 'none';
  }
};

window.confirmarDivisaoItemFracao = () => {
  if (!currentItemFracao) return;

  const rows = document.querySelectorAll('#container-lista-fracoes-items .select-fracao-comanda');
  if (rows.length < 2) {
    alert('É necessário dividir em pelo menos 2 frações.');
    return;
  }

  const fracoes = [];
  for (let i = 0; i < rows.length; i++) {
    const sel = rows[i];
    const fracaoStr = sel.getAttribute('data-fracao') || `${i + 1}/${rows.length}`;
    const valor = parseFloat(sel.getAttribute('data-valor') || 0);
    const qtd = parseFloat(sel.getAttribute('data-qtd') || 1);

    let comanda = sel.value;
    if (comanda === '__NOVA__') {
      const inp = document.getElementById(`input-nova-comanda-fracao-${i}`);
      comanda = (inp && inp.value) ? inp.value.trim() : `Comanda ${i + 1}`;
    }

    fracoes.push({
      fracaoStr,
      valor,
      qtd,
      comandaName: comanda || null
    });
  }

  socket.emit('dividir_item_fracoes', {
    itemId: currentItemFracao.id,
    fracoes: fracoes,
    operador: window.crmPerfil ? window.crmPerfil.nome : 'Caixa'
  });

  window.fecharModalDividirItemFracao();
  if (typeof showToast === 'function') {
    showToast('✨ Item dividido em frações e atribuído com sucesso!', '#3ab55b');
  }
};

window.removerItemDividido = (itemId) => {
  if (typeof ordersData !== 'undefined' && Array.isArray(ordersData)) {
    const item = ordersData.find(o => o.id === itemId);
    if (item) item.status = 'Fracionado';
  }
  if (window.mesaAtual && Array.isArray(window.mesaAtual.items)) {
    const item = window.mesaAtual.items.find(i => i.id === itemId);
    if (item) item.status = 'Fracionado';
  }
  if (typeof renderOrders === 'function') renderOrders();
  if (typeof window.renderSection === 'function') window.renderSection();
};

window.switchMobileTab = (tabId) => {
  const ws = document.querySelector('.workspace');
  if (!ws) return;

  let cleanTab = (tabId || 'mesas').replace('tab-', '');
  if (!['mesas', 'pedido', 'acoes', 'resumo'].includes(cleanTab)) {
    cleanTab = 'mesas';
  }

  ws.classList.remove(
    'active-tab-mesas', 'active-tab-pedido', 'active-tab-acoes', 'active-tab-resumo',
    'active-mesas', 'active-pedido', 'active-acoes', 'active-resumo'
  );
  ws.classList.add(`active-tab-${cleanTab}`);

  // ── FIX: Remove mode-hidden/mode-mini dos painéis ao ativar no mobile ──
  // O setSidebarMode pode ter salvo mode-hidden no localStorage e aplicado ao painel.
  // No mobile, quando o usuário clica na aba, o painel deve ser forçado a aparecer.
  const isMobileLayout = window.innerWidth <= 767 || document.body.classList.contains('force-mobile');
  const lp = document.getElementById('left-panel') || document.querySelector('.left-actions');
  const rp = document.getElementById('right-panel') || document.querySelector('.right-info');
  const mp = document.getElementById('main-panel') || document.querySelector('.main-workspace');

  if (isMobileLayout) {
    if (cleanTab === 'resumo') {
      if (rp) {
        rp.classList.remove('mode-hidden', 'mode-mini', 'sidebar-hidden', 'sidebar-mini', 'mode-expanded');
        rp.classList.add('mode-mobile-fullscreen');
        rp.style.setProperty('display', 'flex', 'important');
        rp.style.setProperty('width', '100%', 'important');
        rp.style.setProperty('min-width', '100%', 'important');
        rp.style.setProperty('max-width', '100%', 'important');
      }
      if (lp) lp.style.setProperty('display', 'none', 'important');
      if (mp) mp.style.setProperty('display', 'none', 'important');
    } else if (cleanTab === 'acoes') {
      if (lp) {
        lp.classList.remove('mode-hidden', 'mode-mini', 'sidebar-hidden', 'sidebar-mini', 'mode-expanded');
        lp.classList.add('mode-mobile-fullscreen');
        lp.style.setProperty('display', 'flex', 'important');
        lp.style.setProperty('width', '100%', 'important');
        lp.style.setProperty('min-width', '100%', 'important');
        lp.style.setProperty('max-width', '100%', 'important');
      }
      if (rp) rp.style.setProperty('display', 'none', 'important');
      if (mp) mp.style.setProperty('display', 'none', 'important');
    } else {
      // cleanTab === 'mesas' ou 'pedido'
      if (rp) {
        rp.classList.remove('mode-mobile-fullscreen');
        rp.style.setProperty('display', 'none', 'important');
      }
      if (lp) {
        lp.classList.remove('mode-mobile-fullscreen');
        lp.style.setProperty('display', 'none', 'important');
      }
      if (mp) mp.style.setProperty('display', 'flex', 'important');
    }
  } else {
    // Modo Desktop: limpa estilos de exibição inline para restaurar flex natural
    if (lp && lp.style.display === 'none' && !lp.classList.contains('mode-hidden')) {
      lp.style.removeProperty('display');
    }
    if (rp && rp.style.display === 'none' && !rp.classList.contains('mode-hidden')) {
      rp.style.removeProperty('display');
    }
    if (mp) mp.style.removeProperty('display');
  }

  document.querySelectorAll('.mobile-tab-btn').forEach(btn => {
    const btnTab = (btn.getAttribute('data-tab') || '').replace('tab-', '');
    if (btnTab === cleanTab) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Ajustar rolagem ao trocar de aba no mobile
  if (cleanTab === 'mesas') {
    const mg = document.getElementById('orders-grid') || document.querySelector('.mesas-scroll');
    if (mg) mg.scrollTop = 0;
  } else if (cleanTab === 'pedido') {
    const pt = document.getElementById('products-section-container') || document.querySelector('.products-container');
    if (pt) pt.scrollTop = 0;
  }

  // ── Injetar botão "← Mesas" no topo do painel de Ações (só mobile) ──
  if (isMobileLayout && cleanTab === 'acoes') {
    const lp = document.getElementById('left-panel') || document.querySelector('.left-actions');
    if (lp && !lp.querySelector('#mobile-acoes-back-btn')) {
      const backBtn = document.createElement('button');
      backBtn.id = 'mobile-acoes-back-btn';
      backBtn.type = 'button';
      backBtn.innerHTML = '<i class="ph ph-arrow-left"></i> Voltar às Mesas';
      backBtn.style.cssText = [
        'display:flex', 'align-items:center', 'gap:8px',
        'background:rgba(255,255,255,0.1)', 'color:#f8fafc',
        'border:1px solid rgba(255,255,255,0.15)', 'border-radius:10px',
        'padding:10px 14px', 'font-size:13px', 'font-weight:700',
        'cursor:pointer', 'width:100%', 'margin-bottom:14px',
        'touch-action:manipulation', '-webkit-tap-highlight-color:transparent',
        'transition:background 0.15s ease', 'flex-shrink:0'
      ].join(';');
      backBtn.addEventListener('click', () => window.switchMobileTab('mesas'));
      lp.insertBefore(backBtn, lp.firstChild);
    }
  }

  // ── Injetar botão "← Mesas" no topo do painel de Resumo (só mobile) ──
  if (isMobileLayout && cleanTab === 'resumo') {
    const rp = document.getElementById('right-panel') || document.querySelector('.right-info');
    if (rp && !rp.querySelector('#mobile-resumo-back-btn')) {
      const backBtn = document.createElement('button');
      backBtn.id = 'mobile-resumo-back-btn';
      backBtn.type = 'button';
      backBtn.innerHTML = '<i class="ph ph-arrow-left"></i> Voltar às Mesas';
      backBtn.style.cssText = [
        'display:flex', 'align-items:center', 'gap:8px',
        'background:#f1f5f9', 'color:#475569',
        'border:1px solid #e2e8f0', 'border-radius:10px',
        'padding:10px 14px', 'font-size:13px', 'font-weight:700',
        'cursor:pointer', 'width:100%', 'margin-bottom:14px',
        'touch-action:manipulation', '-webkit-tap-highlight-color:transparent',
        'transition:background 0.15s ease', 'flex-shrink:0', 'box-sizing:border-box'
      ].join(';');
      backBtn.addEventListener('click', () => window.switchMobileTab('mesas'));
      const inner = rp.querySelector('#inner-right-panel') || rp.querySelector('.panel-content-inner') || rp;
      inner.insertBefore(backBtn, inner.firstChild);
    }
  }
};



// Ao clicar em uma mesa no mobile, abre a aba Pedido automaticamente
document.addEventListener('click', (e) => {
  const tabBtn = e.target.closest('.mobile-tab-btn');
  if (tabBtn) {
    e.preventDefault();
    const tab = tabBtn.getAttribute('data-tab');
    if (tab) window.switchMobileTab(tab);
    return;
  }

  const mesaCard = e.target.closest('.mesa-item');
  if (mesaCard && !mesaCard.classList.contains('nova-comanda-card')) {
    const isMobile = window.innerWidth <= 767 || document.body.classList.contains('force-mobile');
    if (isMobile && typeof window.switchMobileTab === 'function') {
      setTimeout(() => {
        window.switchMobileTab('pedido');
      }, 120);
    }
  }
});

setTimeout(() => {
  document.querySelectorAll('.mobile-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      window.switchMobileTab(btn.getAttribute('data-tab'));
    });
  });

  // ── NAVEGAÇÃO POR GESTOS (SWIPE) — mesma lógica do Garçom Mobile ──
  // Arrastar p/ ESQUERDA revela os botões de resumo (Ações, como à direita no desktop);
  // arrastar p/ DIREITA volta para Mesas & Pedido. Nada de barras de aba ocupando tela.
  let chefSwipeStartX = 0;
  let chefSwipeStartY = 0;
  document.addEventListener('touchstart', (e) => {
    if (!e.changedTouches || !e.changedTouches.length) return;
    chefSwipeStartX = e.changedTouches[0].screenX;
    chefSwipeStartY = e.changedTouches[0].screenY;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!e.changedTouches || !e.changedTouches.length) return;
    const diffX = chefSwipeStartX - e.changedTouches[0].screenX;
    const diffY = chefSwipeStartY - e.changedTouches[0].screenY;
    if (Math.abs(diffY) > Math.abs(diffX)) return;   // era scroll vertical
    if (Math.abs(diffX) < 50) return;                // toque comum
    const ws = document.querySelector('.workspace');
    if (!ws) return;
    // Ordem das abas: mesas → pedido → acoes → resumo
    const tabOrder = ['mesas', 'pedido', 'acoes', 'resumo'];
    let currentTab = 'mesas';
    for (const t of tabOrder) {
      if (ws.classList.contains(`active-tab-${t}`)) { currentTab = t; break; }
    }
    const idx = tabOrder.indexOf(currentTab);
    if (diffX > 0 && idx < tabOrder.length - 1) {
      window.switchMobileTab(tabOrder[idx + 1]);     // ← swipe esquerda: próxima aba
    } else if (diffX < 0 && idx > 0) {
      window.switchMobileTab(tabOrder[idx - 1]);     // → swipe direita: aba anterior
    }
  }, { passive: true });


  const floatLancar = document.getElementById('float-btn-lancar');
  const floatParcial = document.getElementById('float-btn-parcial');
  const floatFechar = document.getElementById('float-btn-fechar');
  if (floatLancar) floatLancar.addEventListener('click', () => {
    const btn = document.getElementById('btn-adicionar-produtos');
    if (btn) btn.click();
  });
  if (floatParcial) floatParcial.addEventListener('click', () => {
    const btn = document.getElementById('btn-movimento-parcial');
    if (btn) btn.click();
  });
  if (floatFechar) floatFechar.addEventListener('click', () => {
    const btn = document.getElementById('btn-movimento-concluir');
    if (btn) btn.click();
  });

  window.switchMobileTab('mesas');
}, 100);

// --- MENU HAMBURGER MOBILE ---
const openMobileMenu = function () {
  const overlay = document.getElementById('mobile-menu-overlay');
  if (overlay) overlay.classList.add('show');
};
window.openMobileMenu = openMobileMenu;

const closeMobileMenu = function () {
  const overlay = document.getElementById('mobile-menu-overlay');
  if (overlay) overlay.classList.remove('show');
};
window.closeMobileMenu = closeMobileMenu;

function initMobileMenu() {
  const hamburger = document.getElementById('mobile-hamburger-btn');
  const overlay = document.getElementById('mobile-menu-overlay');
  const closeBtn = document.getElementById('mobile-menu-close');

  if (hamburger && !hamburger._inited) {
    hamburger._inited = true;
    hamburger.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openMobileMenu();
    });
  }


  if (closeBtn && !closeBtn._inited) {
    closeBtn._inited = true;
    closeBtn.addEventListener('click', window.closeMobileMenu);
  }

  if (overlay && !overlay._inited) {
    overlay._inited = true;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) window.closeMobileMenu();
    });
  }

  const mobFinanceiro = document.getElementById('menu-mob-financeiro');
  const mobConfig = document.getElementById('menu-mob-config');
  if (mobFinanceiro) mobFinanceiro.style.display = '';
  if (mobConfig) mobConfig.style.display = '';

  const menuUserName = document.getElementById('mobile-menu-user-name');
  const statusUserName = document.getElementById('status-user-name');
  if (menuUserName && statusUserName) {
    const obs = new MutationObserver(() => { 
      const txt = statusUserName.textContent.trim();
      menuUserName.textContent = (txt && txt !== '-' && txt !== 'Desconhecido') ? txt : 'Não logado'; 
    });
    obs.observe(statusUserName, { childList: true, characterData: true, subtree: true });
    const txt = statusUserName.textContent.trim();
    menuUserName.textContent = (txt && txt !== '-' && txt !== 'Desconhecido') ? txt : 'Não logado';
  }

  const menuAbrir = document.getElementById('menu-mob-abrir-caixa');
  const menuFechar = document.getElementById('menu-mob-fechar-caixa');
  if (menuAbrir && !menuAbrir._inited) {
    menuAbrir._inited = true;
    menuAbrir.addEventListener('click', () => {
      const original = document.getElementById('menu-abrir-caixa');
      if (original) original.click();
      window.closeMobileMenu();
    });
  }
  if (menuFechar && !menuFechar._inited) {
    menuFechar._inited = true;
    menuFechar.addEventListener('click', () => {
      const original = document.getElementById('menu-fechar-caixa');
      if (original) original.click();
      window.closeMobileMenu();
    });
  }
}

window.addEventListener('resize', () => {
  const isMobile = window.innerWidth <= 767 || document.body.classList.contains('force-mobile');
  const lp = document.getElementById('left-panel') || document.querySelector('.left-actions');
  const rp = document.getElementById('right-panel') || document.querySelector('.right-info');
  const mp = document.getElementById('main-panel') || document.querySelector('.main-workspace');

  if (!isMobile) {
    if (lp && !lp.classList.contains('mode-hidden')) lp.style.removeProperty('display');
    if (rp && !rp.classList.contains('mode-hidden')) rp.style.removeProperty('display');
    if (mp) mp.style.removeProperty('display');
  } else {
    const ws = document.querySelector('.workspace');
    if (ws) {
      if (ws.classList.contains('active-tab-acoes')) window.switchMobileTab('acoes');
      else if (ws.classList.contains('active-tab-resumo')) window.switchMobileTab('resumo');
      else if (ws.classList.contains('active-tab-pedido')) window.switchMobileTab('pedido');
      else window.switchMobileTab('mesas');
    }
  }
});

export { isDonoMaster, obterInfoDetalhadaDispositivo, enviarRegistroSessaoDetalhado, aplicarModoTotem, obterSerialDispositivo, apelidarDispositivo, openMobileMenu, closeMobileMenu, initMobileMenu, authHeaders };
