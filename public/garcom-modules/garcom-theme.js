// --- Dark Mode Logic ---
document.addEventListener('DOMContentLoaded', () => {
  const themeToggleBtn = document.getElementById('btn-theme-toggle');
  if (!themeToggleBtn) return;

  function updateGarcomThemeUI(theme) {
    const isDark = (theme === 'dark');
    document.body.classList.toggle('dark-mode', isDark);
    themeToggleBtn.innerHTML = isDark
      ? '<i class="ph ph-sun"></i>'
      : '<i class="ph ph-moon"></i>';
  }

  if (window.ChefTheme && typeof window.ChefTheme.get === 'function') {
    updateGarcomThemeUI(window.ChefTheme.get());
    window.addEventListener('chef_theme_changed', (e) => {
      if (e && e.detail && e.detail.theme) updateGarcomThemeUI(e.detail.theme);
    });
    themeToggleBtn.addEventListener('click', () => {
      window.ChefTheme.toggle();
    });
  } else {
    const savedTheme = localStorage.getItem('chef_theme') || localStorage.getItem('chef_garcom_theme');
    updateGarcomThemeUI(savedTheme === 'dark' ? 'dark' : 'light');
    themeToggleBtn.addEventListener('click', () => {
      const isDark = !document.body.classList.contains('dark-mode');
      const next = isDark ? 'dark' : 'light';
      updateGarcomThemeUI(next);
      try { localStorage.setItem('chef_theme', next); } catch (e) {}
      try { localStorage.setItem('chef_garcom_theme', next); } catch (e) {}
    });
  }
});

// ═════════════════════════════════════════════════════════════════════
// ⚡ CONTROLADOR DE ATALHOS RÁPIDOS DO APP GARÇOM (MOBILE)
// ═════════════════════════════════════════════════════════════════════

let cachedFilaEspera = [];
let cachedPedidosPreparo = [];
let filtroPreparoAtual = 'todos';
let buscaPreparoQuery = '';

// 1. Aplicação das Configurações de Atalhos Ativos
window.applyAtalhosConfig = function() {
  let atalhosCfg = {
    fila_espera: true,
    fila_preparo: true,
    consulta_preco: true,
    nova_comanda: true,
    chamar_gerente: true,
    minhas_vendas: true,
    transferir_mesa: true,
    juntar_mesas: true,
    pedir_preconta: true,
    dividir_conta: true,
    limpar_mesa: true,
    alergenos: true,
    ler_qr_mesa: true,
    ranking_garcom: true,
    alternar_tema: true,
    pizza_meio_a_meio: true,
    rodizio_carnes: true,
    marchar_prato: true,
    sommelier_ia: true
  };

  try {
    if (CONFIGS && CONFIGS.garcom_atalhos) {
      const parsed = typeof CONFIGS.garcom_atalhos === 'string' ? JSON.parse(CONFIGS.garcom_atalhos) : CONFIGS.garcom_atalhos;
      atalhosCfg = Object.assign(atalhosCfg, parsed);
    } else {
      const local = localStorage.getItem('chef_garcom_atalhos_cfg');
      if (local) atalhosCfg = Object.assign(atalhosCfg, JSON.parse(local));
    }
  } catch (e) {}

  const mapCards = {
    'fila_espera': 'card-atalho-fila-espera',
    'fila_preparo': 'card-atalho-fila-preparo',
    'consulta_preco': 'card-atalho-consulta-preco',
    'nova_comanda': 'card-atalho-nova-comanda',
    'chamar_gerente': 'card-atalho-chamar-gerente',
    'minhas_vendas': 'card-atalho-minhas-vendas',
    'transferir_mesa': 'card-atalho-transferir-mesa',
    'juntar_mesas': 'card-atalho-juntar-mesas',
    'pedir_preconta': 'card-atalho-pedir-preconta',
    'dividir_conta': 'card-atalho-dividir-conta',
    'limpar_mesa': 'card-atalho-limpar-mesa',
    'alergenos': 'card-atalho-alergenos',
    'ler_qr_mesa': 'card-atalho-ler-qr-mesa',
    'ranking_garcom': 'card-atalho-ranking-garcom',
    'alternar_tema': 'card-atalho-alternar-tema',
    'pizza_meio_a_meio': 'card-atalho-pizza-meio-a-meio',
    'rodizio_carnes': 'card-atalho-rodizio-carnes',
    'marchar_prato': 'card-atalho-marchar-prato',
    'sommelier_ia': 'card-atalho-sommelier-ia'
  };

  Object.keys(mapCards).forEach(key => {
    const el = document.getElementById(mapCards[key]);
    if (el) {
      el.style.display = atalhosCfg[key] === false ? 'none' : 'flex';
    }
  });
};

window.carregarAtalhosGarcom = function() {
  window.applyAtalhosConfig();
  if (typeof socket !== 'undefined' && socket) {
    socket.emit('get_fila_espera');
    socket.emit('get_pedidos');
  }
};

// ── 🪑 2. FILA DE ESPERA POR MESAS ──
window.abrirFilaEsperaGarcom = function() {
  const modal = document.getElementById('modal-fila-espera-garcom');
  if (!modal) return;
  modal.style.display = 'flex';
  if (typeof socket !== 'undefined' && socket) socket.emit('get_fila_espera');
};

window.fecharFilaEsperaGarcom = function() {
  const modal = document.getElementById('modal-fila-espera-garcom');
  if (modal) modal.style.display = 'none';
};

window.abrirModalAddFila = function() {
  const modal = document.getElementById('modal-add-fila-garcom');
  if (modal) {
    document.getElementById('add-fila-nome').value = '';
    document.getElementById('add-fila-pessoas').value = '2';
    document.getElementById('add-fila-telefone').value = '';
    document.getElementById('add-fila-obs').value = '';
    modal.style.display = 'flex';
    setTimeout(() => {
      const inp = document.getElementById('add-fila-nome');
      if (inp) inp.focus();
    }, 150);
  }
};

window.fecharModalAddFila = function() {
  const modal = document.getElementById('modal-add-fila-garcom');
  if (modal) modal.style.display = 'none';
};

window.salvarNovoFilaEspera = function() {
  const nome = (document.getElementById('add-fila-nome').value || '').trim();
  const pessoas = parseInt(document.getElementById('add-fila-pessoas').value || '2', 10);
  const telefone = (document.getElementById('add-fila-telefone').value || '').trim();
  const obs = (document.getElementById('add-fila-obs').value || '').trim();

  if (!nome) {
    showToast('Informe o nome do cliente', '#fc4b15');
    return;
  }

  if (typeof socket !== 'undefined' && socket) {
    socket.emit('adicionar_fila_espera', {
      cliente_nome: nome,
      cliente_telefone: telefone,
      pessoas: pessoas,
      mesa_preferida: obs,
      observacao: obs
    });
  }

  window.fecharModalAddFila();
  showToast(`✨ ${nome} adicionado à fila!`, '#3ab55b');
};

window.renderFilaEsperaGarcom = function(rows) {
  cachedFilaEspera = rows || [];
  const badgeCard = document.getElementById('atalho-fila-espera-badge');
  if (badgeCard) {
    badgeCard.innerText = `${cachedFilaEspera.length} grupo${cachedFilaEspera.length === 1 ? '' : 's'} aguardando`;
  }
  const labelCount = document.getElementById('label-fila-espera-count');
  if (labelCount) {
    labelCount.innerText = `${cachedFilaEspera.length} grupo${cachedFilaEspera.length === 1 ? '' : 's'} aguardando`;
  }

  const container = document.getElementById('lista-fila-espera-garcom');
  if (!container) return;

  if (cachedFilaEspera.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: #94a3b8; padding: 40px 10px; font-size: 14px;"><i class="ph ph-armchair" style="font-size: 40px; display: block; margin-bottom: 8px;"></i>Nenhum cliente na fila de espera</div>';
    return;
  }

  container.innerHTML = cachedFilaEspera.map((item, idx) => {
    let diffMin = 0;
    if (item.criado_em) {
      const diffMs = Date.now() - new Date(item.criado_em).getTime();
      diffMin = Math.max(0, Math.floor(diffMs / 60000));
    }

    const obsText = item.mesa_preferida || item.observacao || '';
    const telClean = (item.cliente_telefone || '').replace(/\D/g, '');

    return `
      <div style="background: var(--g-app-bg, #f8fafc); border: 1.5px solid var(--g-border, #e2e8f0); border-radius: 16px; padding: 14px; display: flex; flex-direction: column; gap: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 30px; height: 30px; border-radius: 50%; background: #2563eb; color: white; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px;">
              ${idx + 1}º
            </div>
            <div>
              <strong style="font-size: 15px; color: var(--g-text, #0f172a); display: block;">${item.cliente_nome}</strong>
              <span style="font-size: 12px; color: var(--g-text-muted, #64748b);">
                <i class="ph ph-users"></i> ${item.pessoas || 2} pessoas ${obsText ? `• <em>${obsText}</em>` : ''}
              </span>
            </div>
          </div>
          <span style="font-size: 11.5px; font-weight: 700; background: ${diffMin >= 20 ? '#fee2e2' : '#f1f5f9'}; color: ${diffMin >= 20 ? '#dc2626' : '#475569'}; padding: 4px 8px; border-radius: 8px;">
            <i class="ph ph-clock"></i> Há ${diffMin} min
          </span>
        </div>

        <div style="display: flex; gap: 8px; border-top: 1px dashed var(--g-border, #cbd5e1); padding-top: 10px;">
          <button onclick="window.acomodarClienteFilaDirect(${item.id})" style="flex: 2; padding: 10px; border-radius: 10px; border: none; background: #16a34a; color: white; font-weight: 800; font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
            <i class="ph-bold ph-check"></i> Acomodar na Mesa
          </button>
          ${telClean ? `
            <button onclick="window.open('https://wa.me/55${telClean}?text=' + encodeURIComponent('Olá ${item.cliente_nome}, sua mesa no restaurante está pronta! Pode se dirigir à recepção.'), '_blank')" style="padding: 10px 14px; border-radius: 10px; border: 1.5px solid #bbf7d0; background: #f0fdf4; color: #166534; font-weight: 700; font-size: 13px; cursor: pointer;" title="Notificar WhatsApp">
              <i class="ph-bold ph-whatsapp-logo" style="font-size: 16px;"></i>
            </button>
          ` : ''}
          <button onclick="window.removerFilaEsperaDirect(${item.id}, '${item.cliente_nome}')" style="padding: 10px 14px; border-radius: 10px; border: 1.5px solid #fecaca; background: #fef2f2; color: #dc2626; font-weight: 700; font-size: 13px; cursor: pointer;" title="Remover da Fila">
            <i class="ph ph-trash" style="font-size: 16px;"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
};

window.acomodarClienteFilaDirect = function(filaId) {
  if (typeof window.openPickMesaModal === 'function') {
    window.openPickMesaModal((mesaNome) => {
      if (typeof socket !== 'undefined' && socket) {
        socket.emit('acomodar_cliente_fila', { id: filaId, mesa: mesaNome });
      }
      window.fecharFilaEsperaGarcom();
      showToast(`✨ Cliente acomodado na ${mesaNome}!`, '#3ab55b');
    });
  }
};

window.removerFilaEsperaDirect = function(id, nome) {
  if (confirm(`Deseja remover ${nome} da fila de espera?`)) {
    if (typeof socket !== 'undefined' && socket) {
      socket.emit('remover_fila_espera', id);
    }
    showToast(`${nome} removido da fila`, '#64748b');
  }
};

if (typeof socket !== 'undefined' && socket) {
  socket.on('fila_espera_atualizada', (rows) => {
    window.renderFilaEsperaGarcom(rows);
  });
}

// ── 🍳 3. FILA DE PREPARO / STATUS DA COZINHA (KDS) ──
window.abrirFilaPreparoGarcom = function() {
  const modal = document.getElementById('modal-fila-preparo-garcom');
  if (!modal) return;
  modal.style.display = 'flex';
  if (typeof socket !== 'undefined' && socket) socket.emit('get_pedidos');
};

window.fecharFilaPreparoGarcom = function() {
  const modal = document.getElementById('modal-fila-preparo-garcom');
  if (modal) modal.style.display = 'none';
};

window.setFiltroPreparo = function(tipo) {
  filtroPreparoAtual = tipo;
  document.querySelectorAll('.filtro-preparo-btn').forEach(btn => {
    btn.style.background = 'white';
    btn.style.color = '#64748b';
    btn.classList.remove('active');
  });
  const activeBtn = document.getElementById(`filtro-prep-${tipo}`);
  if (activeBtn) {
    activeBtn.style.background = '#fc4b15';
    activeBtn.style.color = 'white';
    activeBtn.classList.add('active');
  }
  window.renderFilaPreparoGarcom();
};

window.filtrarFilaPreparoGarcom = function(val) {
  buscaPreparoQuery = (val || '').toLowerCase().trim();
  window.renderFilaPreparoGarcom();
};

window.renderFilaPreparoGarcom = function(pedidos) {
  if (pedidos) cachedPedidosPreparo = pedidos;
  const container = document.getElementById('lista-fila-preparo-garcom');
  if (!container) return;

  const total = cachedPedidosPreparo.length;
  const pendentes = cachedPedidosPreparo.filter(p => !p.status || p.status.toLowerCase() === 'pendente' || p.status.toLowerCase() === 'aguardando' || p.status.toLowerCase() === 'na fila').length;
  const preparando = cachedPedidosPreparo.filter(p => p.status && p.status.toLowerCase().includes('prepar')).length;
  const prontos = cachedPedidosPreparo.filter(p => p.status && p.status.toLowerCase() === 'pronto').length;

  if (document.getElementById('count-prep-todos')) document.getElementById('count-prep-todos').innerText = total;
  if (document.getElementById('count-prep-pendente')) document.getElementById('count-prep-pendente').innerText = pendentes;
  if (document.getElementById('count-prep-preparando')) document.getElementById('count-prep-preparando').innerText = preparando;
  if (document.getElementById('count-prep-pronto')) document.getElementById('count-prep-pronto').innerText = prontos;

  const badgeCard = document.getElementById('atalho-fila-preparo-badge');
  if (badgeCard) {
    badgeCard.innerText = `${preparando} em preparo • ${prontos} prontos`;
  }

  let filtrados = cachedPedidosPreparo.filter(p => {
    const st = (p.status || 'pendente').toLowerCase();
    if (filtroPreparoAtual === 'pendente') return st === 'pendente' || st === 'aguardando' || st === 'na fila';
    if (filtroPreparoAtual === 'preparando') return st.includes('prepar');
    if (filtroPreparoAtual === 'pronto') return st === 'pronto';
    return true;
  });

  if (buscaPreparoQuery) {
    filtrados = filtrados.filter(p => {
      const mesa = String(p.mesa || '').toLowerCase();
      const item = String(p.productName || p.produto_nome || p.item || '').toLowerCase();
      const obs = String(p.observacao || p.obs || '').toLowerCase();
      return mesa.includes(buscaPreparoQuery) || item.includes(buscaPreparoQuery) || obs.includes(buscaPreparoQuery);
    });
  }

  if (filtrados.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: #94a3b8; padding: 40px 10px; font-size: 14px;"><i class="ph ph-check-circle" style="font-size: 40px; display: block; margin-bottom: 8px; color: #16a34a;"></i>Nenhum pedido neste filtro</div>';
    return;
  }

  container.innerHTML = filtrados.map(p => {
    let diffMin = 0;
    if (p.createdAt) {
      const diffMs = Date.now() - parseUtc(p.createdAt);
      diffMin = Math.max(0, Math.floor(diffMs / 60000));
    }

    const st = (p.status || 'Pendente');
    let stColor = '#eab308'; // amarelo
    let stBg = '#fefce8';
    let stBorder = '#fef08a';
    let stIcon = 'ph-clock';

    if (st.toLowerCase().includes('prepar')) {
      stColor = '#2563eb'; stBg = '#eff6ff'; stBorder = '#bfdbfe'; stIcon = 'ph-cooking-pot';
    } else if (st.toLowerCase() === 'pronto') {
      stColor = '#16a34a'; stBg = '#f0fdf4'; stBorder = '#bbf7d0'; stIcon = 'ph-check-circle';
    }

    const prodNome = p.productName || p.produto_nome || p.item || 'Item';
    const prodEmoji = p.productEmoji || p.emoji || '🍽️';
    const qtd = p.quantity || p.quantidade || 1;
    const obs = p.observacao || p.obs || '';

    return `
      <div style="background: var(--g-card-bg, #ffffff); border: 1.5px solid var(--g-border, #e2e8f0); border-radius: 16px; padding: 14px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.02);">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 13px; font-weight: 800; background: #0f172a; color: white; padding: 3px 8px; border-radius: 8px;">${p.localName || p.mesa_grupo || p.mesa || p.mesa_comanda || 'Mesa ?'}</span>
            ${p.garcom ? `<span style="font-size: 11.5px; color: var(--g-text-muted, #64748b);">por <strong>${p.garcom}</strong></span>` : ''}
          </div>
          <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 800; padding: 4px 10px; border-radius: 12px; background: ${stBg}; color: ${stColor}; border: 1px solid ${stBorder};">
            <i class="ph-bold ${stIcon}"></i> ${st}
          </span>
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 2px;">
          <div style="font-size: 15px; font-weight: 700; color: var(--g-text, #0f172a);">
            <span style="margin-right: 4px;">${prodEmoji}</span> ${qtd}x ${prodNome}
          </div>
          <span style="font-size: 12px; font-weight: 700; color: ${diffMin >= 20 ? '#dc2626' : '#64748b'};">
            <i class="ph ph-timer"></i> ${diffMin} min atrás
          </span>
        </div>

        ${obs ? `<div style="font-size: 12px; color: #ea580c; background: #fff7ed; padding: 6px 10px; border-radius: 8px; border-left: 3px solid #f97316;"><strong>Obs:</strong> ${obs}</div>` : ''}
      </div>
    `;
  }).join('');
};

if (typeof socket !== 'undefined' && socket) {
  socket.on('pedidos_atualizados', (pedidos) => {
    window.renderFilaPreparoGarcom(pedidos);
  });
}

// ── 🔍 4. CONSULTA RÁPIDA DE PREÇO E ESTOQUE ──
window.abrirConsultaPrecoGarcom = function() {
  const modal = document.getElementById('modal-consulta-preco-garcom');
  if (!modal) return;
  modal.style.display = 'flex';
  const inp = document.getElementById('input-busca-consulta-preco');
  if (inp) {
    inp.value = '';
    setTimeout(() => inp.focus(), 150);
  }
  window.filtrarConsultaPreco('');
};

window.fecharConsultaPrecoGarcom = function() {
  const modal = document.getElementById('modal-consulta-preco-garcom');
  if (modal) modal.style.display = 'none';
};

window.filtrarConsultaPreco = function(query) {
  const q = (query || '').toLowerCase().trim();
  const container = document.getElementById('lista-consulta-preco-garcom');
  if (!container) return;

  // MENU usa campos: name, category, emoji, price (mapeados do socket produtos_atualizados)
  const prods = (typeof MENU !== 'undefined' && Array.isArray(MENU)) ? MENU : [];

  if (prods.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: #94a3b8; padding: 30px; font-size: 14px;"><i class="ph ph-spinner" style="font-size:28px;display:block;margin-bottom:8px;"></i>Carregando cardápio...</div>';
    // Solicita produtos ao servidor se MENU estiver vazio
    if (typeof socket !== 'undefined' && socket) socket.emit('get_produtos');
    return;
  }

  let filtrados = prods;
  if (q) {
    filtrados = prods.filter(p => {
      // MENU usa 'name' e 'category' (não 'nome'/'categoria')
      const n = (p.name || p.nome || '').toLowerCase();
      const c = (p.category || p.categoria || '').toLowerCase();
      const d = (p.descricao || p.description || '').toLowerCase();
      return n.includes(q) || c.includes(q) || d.includes(q);
    });
  }

  if (filtrados.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: #94a3b8; padding: 30px; font-size: 14px;">Nenhum item encontrado</div>';
    return;
  }

  container.innerHTML = filtrados.slice(0, 60).map(p => {
    const nome = p.name || p.nome || 'Item';
    const categoria = p.category || p.categoria || 'Geral';
    const preco = parseFloat(p.price || p.preco || 0).toFixed(2).replace('.', ',');
    const emoji = p.emoji || '🍽️';
    const imgHtml = p.imagem
      ? `<img src="${p.imagem}" style="width: 44px; height: 44px; border-radius: 12px; object-fit: cover;">`
      : `<div style="width: 44px; height: 44px; border-radius: 12px; background: rgba(252,75,21,0.1); color: #fc4b15; display: flex; align-items: center; justify-content: center; font-size: 24px;">${emoji}</div>`;

    return `
      <div style="background: var(--g-app-bg, #f8fafc); border: 1px solid var(--g-border, #e2e8f0); border-radius: 14px; padding: 10px 12px; display: flex; align-items: center; gap: 12px;">
        ${imgHtml}
        <div style="flex: 1; min-width: 0;">
          <strong style="font-size: 14px; color: var(--g-text, #0f172a); display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${nome}</strong>
          <span style="font-size: 11.5px; color: var(--g-text-muted, #64748b);">${categoria}</span>
        </div>
        <div style="text-align: right;">
          <strong style="font-size: 15px; color: #fc4b15;">R$ ${preco}</strong>
        </div>
      </div>
    `;
  }).join('');
};

// ── 🛎️ 5. CHAMAR GERENTE / SUPORTE ──
window.chamarGerenteGarcom = function() {
  if (confirm('Deseja enviar um chamado urgente para o Gerente / Caixa?')) {
    const nomeGarcom = (typeof loggedUser !== 'undefined' && loggedUser && loggedUser.nome) ? loggedUser.nome : 'Garçom';
    if (typeof socket !== 'undefined' && socket) {
      socket.emit('chamar_garcom_salao', {
        tipo: 'gerente',
        origem: 'app_garcom',
        solicitante: nomeGarcom,
        mensagem: `🚨 O colaborador ${nomeGarcom} solicitou a presença do Gerente no salão!`
      });
    }
    showToast('🚨 Chamado enviado com sucesso ao Gerente!', '#3ab55b');
  }
};

// ── 📊 6. MINHAS VENDAS HOJE ──
window.abrirMinhasVendasGarcom = function() {
  const modal = document.getElementById('modal-minhas-vendas-garcom');
  if (!modal) return;
  modal.style.display = 'flex';

  const nomeGarcom = (typeof loggedUser !== 'undefined' && loggedUser && loggedUser.nome) ? loggedUser.nome.toLowerCase() : '';
  const labelTurno = document.getElementById('label-garcom-vendas-turno');
  if (labelTurno && loggedUser && loggedUser.nome) {
    labelTurno.innerText = `Turno de ${loggedUser.nome}`;
  }

  // Calcula pelas comandas/pedidos disponíveis
  let totalVendido = 0;
  let totalItens = 0;
  let totalPedidos = 0;

  if (Array.isArray(cachedPedidosPreparo)) {
    cachedPedidosPreparo.forEach(p => {
      if (p.garcom && p.garcom.toLowerCase() === nomeGarcom) {
        totalPedidos++;
        totalItens += (p.quantity || 1);
        totalVendido += parseFloat(p.total || (p.preco * (p.quantity || 1)) || 0);
      }
    });
  }

  const comissao = totalVendido * 0.10;

  if (document.getElementById('garcom-stat-total-vendido')) {
    document.getElementById('garcom-stat-total-vendido').innerText = `R$ ${Math.max(0, totalVendido).toFixed(2).replace('.', ',')}`;
  }
  if (document.getElementById('garcom-stat-comissao')) {
    document.getElementById('garcom-stat-comissao').innerText = `R$ ${comissao.toFixed(2).replace('.', ',')}`;
  }
  if (document.getElementById('garcom-stat-pedidos-count')) {
    document.getElementById('garcom-stat-pedidos-count').innerText = totalPedidos;
  }
  if (document.getElementById('garcom-stat-itens-count')) {
    document.getElementById('garcom-stat-itens-count').innerText = totalItens;
  }
};

window.fecharMinhasVendasGarcom = function() {
  const modal = document.getElementById('modal-minhas-vendas-garcom');
  if (modal) modal.style.display = 'none';
};

// ═════════════════════════════════════════════════════════════════════
// 📡 CONTROLE REMOTO DO COLABORADOR (RECEBE COMANDOS DO DONO)
// ═════════════════════════════════════════════════════════════════════
if (typeof socket !== 'undefined' && socket) {
  socket.on('comando_colaborador_acao', function(data) {
    if (!data) return;
    const { funcionario_id, funcionario_nome, acao, payload, solicitadoPor } = data;

    const currentId = (loggedUser && (loggedUser.id || loggedUser.funcionario_id));
    const currentNome = (loggedUser && (loggedUser.nome || loggedUser.name || '')).toLowerCase().trim();
    const targetNome = (funcionario_nome || '').toLowerCase().trim();

    const isMe = (funcionario_id && currentId && String(funcionario_id) === String(currentId)) ||
                 (targetNome && currentNome && (currentNome === targetNome || currentNome.includes(targetNome) || targetNome.includes(currentNome)));

    if (!isMe && funcionario_id !== 'todos') return;

    if (acao === 'mensagem_direta') {
      const texto = (payload && payload.texto) || 'Mensagem do Dono';
      try { if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]); } catch(e) {}
      alert(`📢 MENSAGEM DO DONO (${solicitadoPor || 'Administração'}):\n\n${texto}`);
    } else if (acao === 'chamar_vibrar') {
      try { if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 600]); } catch(e) {}
      if (typeof showToast === 'function') {
        showToast(`🚨 ${solicitadoPor || 'O Dono'} está chamando você imediatamente!`, '#e11d48');
      } else {
        alert(`🚨 ${solicitadoPor || 'O Dono'} está chamando você imediatamente!`);
      }
    } else if (acao === 'redirecionar_view') {
      const targetView = (payload && payload.view) || 'tables';
      if (typeof showView === 'function') {
        const titles = { 'tables': 'Comanda Mobile', 'esteira': 'Prontos para Entrega', 'atalhos': 'Atalhos Rápidos' };
        showView(targetView, titles[targetView] || 'Chef Garçom');
        if (typeof showToast === 'function') showToast(`📡 Tela direcionada para ${targetView} pelo Dono`, '#3b82f6');
      }
    } else if (acao === 'desconectar_sessao') {
      alert(`🔒 Sua sessão foi encerrada remotamente por ${solicitadoPor || 'Dono'}.`);
      try {
        localStorage.removeItem('chef_garcom_usuario');
        localStorage.removeItem('chef_garcom_pin');
        sessionStorage.clear();
      } catch(e) {}
      window.location.reload();
    }
  });
}





// ══════════════════════════════════════════════════════════════════
// QR CODE DA MESA (GARÇOM MOBILE)
// ══════════════════════════════════════════════════════════════════
window.exibirQrCodeMesaGarcom = function(nomeMesa) {
  if (!nomeMesa) nomeMesa = currentTable || 'Mesa';
  const modal = document.getElementById('modal-qr-mesa-garcom');
  const titulo = document.getElementById('qr-mesa-titulo');
  const container = document.getElementById('qr-mesa-container');
  if (!modal || !container) return;

  if (titulo) titulo.innerText = nomeMesa.startsWith('Mesa') ? nomeMesa : `Mesa ${nomeMesa}`;

  const proto = window.location.protocol;
  const host = window.location.host;
  const restauranteId = localStorage.getItem('restaurante_id') || '1';
  const urlCardapio = `${proto}//${host}/cardapio.html?mesa=${encodeURIComponent(nomeMesa)}&restaurante_id=${encodeURIComponent(restauranteId)}`;
  window._qrMesaAtualUrl = urlCardapio;

  container.innerHTML = '<div style="color:#64748b; font-size:13px; font-weight:600;"><i class="ph ph-spinner-gap" style="animation:spin 1s infinite;"></i> Gerando QR Code...</div>';
  modal.style.display = 'flex';

  setTimeout(() => {
    try {
      if (typeof window.qrcode === 'function') {
        const qr = window.qrcode(0, 'M');
        qr.addData(urlCardapio);
        qr.make();
        const dataUrl = qr.createDataURL(6, 0);
        container.innerHTML = `<img src="${dataUrl}" alt="QR Code Mesa" style="width:220px; height:220px; border-radius:8px; display:block;">`;
        return;
      }
    } catch(e) {
      console.warn('[QR Garçom] Falha ao usar qrcode lib:', e);
    }

    // Fallback via API rápida / canvas
    const imgApi = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(urlCardapio)}`;
    container.innerHTML = `<img src="${imgApi}" alt="QR Code Mesa" style="width:220px; height:220px; border-radius:8px; display:block;" onerror="this.onerror=null; this.parentElement.innerHTML='<div style=\'padding:20px; color:#ef4444; font-weight:bold;\'>Erro ao gerar QR Code offline</div>';">`;
  }, 50);
};

window.fecharQrCodeMesaGarcom = function() {
  const modal = document.getElementById('modal-qr-mesa-garcom');
  if (modal) modal.style.display = 'none';
};

window.copiarLinkCardapioMesa = function() {
  if (!window._qrMesaAtualUrl) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(window._qrMesaAtualUrl).then(() => {
      showToast('Link do cardápio copiado!', '#0284c7');
    }).catch(() => {
      prompt('Copie o link abaixo:', window._qrMesaAtualUrl);
    });
  } else {
    prompt('Copie o link abaixo:', window._qrMesaAtualUrl);
  }
};

window.abrirCardapioMesaDireto = function() {
  if (window._qrMesaAtualUrl) {
    window.open(window._qrMesaAtualUrl, '_blank');
  }
};

// ══════════════════════════════════════════════════════════════════
// ADICIONAR ITEM RÁPIDO NA CONTA DA MESA (GARÇOM MOBILE)
// ══════════════════════════════════════════════════════════════════
let _categoriaItemRapidoAtiva = 'Todos';

window.abrirAdicionarItemRapidoGarcom = function() {
  if (!currentTable) {
    showToast('Nenhuma mesa selecionada', '#ef4444');
    return;
  }
  const modal = document.getElementById('modal-add-item-rapido-garcom');
  const sub = document.getElementById('add-rapido-mesa-sub');
  const inputBusca = document.getElementById('input-busca-item-rapido');
  if (!modal) return;

  if (sub) sub.innerText = `Lançar item direto na ${currentTable.startsWith('Mesa') ? currentTable : 'Mesa ' + currentTable}`;
  if (inputBusca) inputBusca.value = '';

  _categoriaItemRapidoAtiva = 'Todos';
  renderizarCategoriasItensRapidos();
  renderizarListaItensRapidos();

  modal.style.display = 'flex';
  setTimeout(() => { if (inputBusca) inputBusca.focus(); }, 150);
};

window.fecharAdicionarItemRapidoGarcom = function() {
  const modal = document.getElementById('modal-add-item-rapido-garcom');
  if (modal) modal.style.display = 'none';
};

function renderizarCategoriasItensRapidos() {
  const container = document.getElementById('chips-categorias-item-rapido');
  if (!container) return;

  const categorias = ['Todos', ...new Set(MENU.map(m => m.category).filter(Boolean))];
  container.innerHTML = categorias.map(cat => `
    <button onclick="window.selecionarCategoriaItemRapido('${escJs(cat)}')" class="chip-cat-rapido ${cat === _categoriaItemRapidoAtiva ? 'active' : ''}" style="padding:6px 14px; border-radius:20px; border:1px solid ${cat === _categoriaItemRapidoAtiva ? '#2563eb' : '#cbd5e1'}; background:${cat === _categoriaItemRapidoAtiva ? '#2563eb' : '#f1f5f9'}; color:${cat === _categoriaItemRapidoAtiva ? '#ffffff' : '#475569'}; font-size:12.5px; font-weight:700; white-space:nowrap; cursor:pointer; flex-shrink:0;">
      ${escHtml(cat)}
    </button>
  `).join('');
}

window.selecionarCategoriaItemRapido = function(cat) {
  _categoriaItemRapidoAtiva = cat;
  renderizarCategoriasItensRapidos();
  renderizarListaItensRapidos();
};

window.filtrarItensRapidosGarcom = function() {
  renderizarListaItensRapidos();
};

function renderizarListaItensRapidos() {
  const container = document.getElementById('lista-produtos-item-rapido');
  const inputBusca = document.getElementById('input-busca-item-rapido');
  if (!container) return;

  const busca = inputBusca ? inputBusca.value.trim().toLowerCase() : '';
  let filtrados = MENU.filter(p => {
    if (_categoriaItemRapidoAtiva !== 'Todos' && p.category !== _categoriaItemRapidoAtiva) return false;
    if (busca && !p.name.toLowerCase().includes(busca) && !(p.category || '').toLowerCase().includes(busca)) return false;
    return true;
  });

  if (filtrados.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:30px 10px; color:#94a3b8; font-weight:600; font-size:13.5px;"><i class="ph ph-magnifying-glass" style="font-size:32px; display:block; margin-bottom:6px;"></i>Nenhum produto encontrado.</div>';
    return;
  }

  container.innerHTML = filtrados.map(p => `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px; background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; box-shadow:0 2px 5px rgba(0,0,0,0.02);">
      <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
        <span style="font-size:22px; flex-shrink:0;">${escHtml(p.emoji || '🍽️')}</span>
        <div style="min-width:0; flex:1;">
          <div style="font-weight:700; font-size:14px; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escHtml(p.name)}</div>
          <div style="font-size:12.5px; font-weight:800; color:#16a34a;">R$ ${p.price.toFixed(2).replace('.', ',')}</div>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
        <button onclick="window.lancarItemRapidoDireto(${p.id}, 1)" style="padding:8px 12px; border-radius:10px; background:#10b981; border:none; color:white; font-weight:800; font-size:13px; cursor:pointer; display:flex; align-items:center; gap:4px; box-shadow:0 2px 6px rgba(16,185,129,0.25);">
          <i class="ph-bold ph-plus"></i> 1x
        </button>
        <button onclick="window.lancarItemRapidoDireto(${p.id}, 2)" style="padding:8px 10px; border-radius:10px; background:#f1f5f9; border:1px solid #cbd5e1; color:#334155; font-weight:800; font-size:12.5px; cursor:pointer;">
          +2x
        </button>
      </div>
    </div>
  `).join('');
}

window.lancarItemRapidoDireto = function(prodId, qtd = 1) {
  const prod = MENU.find(p => p.id === prodId);
  if (!prod) return;
  if (!currentTable) {
    showToast('Nenhuma mesa ativa', '#ef4444');
    return;
  }

  const emitItem = {
    productName: prod.name,
    productEmoji: prod.emoji || '🍽️',
    sector: prod.sector || 'Cozinha 1',
    quantity: qtd,
    observations: 'Adicionado na conferência',
    composicoes: [],
    total: (prod.price * qtd).toFixed(2).replace('.', ','),
    mesa_comanda: '',
    localName: currentTable,
    userName: loggedUser ? loggedUser.nome : 'Garçom',
    status: 'Pendente',
    time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    createdAt: Date.now()
  };

  socket.emit('novo_pedido', emitItem);
  if (typeof trackInsertion === 'function') trackInsertion();

  showToast(`✓ ${qtd}x ${prod.name} adicionado à ${currentTable}!`, '#10b981');
  
  // Atualizar itens da mesa imediatamente
  setTimeout(() => {
    socket.emit('get_itens_mesa', currentTable);
  }, 200);
};


// ─── MODAL DE DIVISÃO / FRACIONAMENTO DE ITENS NA COMANDA MOBILE ───
window._itemEmFracionamento = null;

window.abrirModalFracionarItem = function (itemId) {
  const item = billItems.find(i => i.id === itemId);
  if (!item) return;

  window._itemEmFracionamento = item;

  let modal = document.getElementById('modal-fracionar-item-mobile');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-fracionar-item-mobile';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.85); backdrop-filter:blur(8px); z-index:999999; display:flex; align-items:flex-end; justify-content:center; padding:0;';
    document.body.appendChild(modal);
  }

  const multiplier = typeof getBillMultiplier === 'function' ? getBillMultiplier() : 1.0;
  const valorTotal = (parseFloat(String(item.total).replace(',', '.')) || 0) * multiplier;

  modal.innerHTML = `
    <div style="background:#ffffff; border-top-left-radius:24px; border-top-right-radius:24px; max-width:500px; width:100%; padding:20px; color:#1e293b; box-shadow:0 -10px 40px rgba(0,0,0,0.3); max-height:85vh; overflow-y:auto; animation:slideUp 0.3s ease;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom:1px solid #e2e8f0; padding-bottom:12px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <div style="width:36px; height:36px; border-radius:10px; background:#fff7ed; color:#fc4b15; display:flex; align-items:center; justify-content:center; font-size:18px;">
            <i class="ph-bold ph-scissors"></i>
          </div>
          <div>
            <h4 style="margin:0; font-size:16px; font-weight:800; color:#0f172a;">Dividir / Fracionar Item</h4>
            <span style="font-size:12px; color:#64748b;">${item.productEmoji || '🍽️'} ${item.productName} (R$ ${Math.max(0, valorTotal).toFixed(2).replace('.', ',')})</span>
          </div>
        </div>
        <button onclick="document.getElementById('modal-fracionar-item-mobile').style.display='none'" style="background:#f1f5f9; border:none; width:32px; height:32px; border-radius:50%; color:#64748b; font-size:16px; cursor:pointer; display:flex; align-items:center; justify-content:center;">&times;</button>
      </div>

      <div style="margin-bottom:16px;">
        <label style="font-size:12.5px; font-weight:700; color:#475569; display:block; margin-bottom:8px;">Escolha a quantidade de frações:</label>
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px;">
          <button type="button" onclick="window._gerarFracoesItem(2)" style="background:#fc4b15; color:white; border:none; padding:10px; border-radius:10px; font-weight:700; font-size:13px; cursor:pointer;">
            1/2 (2 Partes)
          </button>
          <button type="button" onclick="window._gerarFracoesItem(3)" style="background:#f8fafc; color:#334155; border:1px solid #cbd5e1; padding:10px; border-radius:10px; font-weight:700; font-size:13px; cursor:pointer;">
            1/3 (3 Partes)
          </button>
          <button type="button" onclick="window._gerarFracoesItem(4)" style="background:#f8fafc; color:#334155; border:1px solid #cbd5e1; padding:10px; border-radius:10px; font-weight:700; font-size:13px; cursor:pointer;">
            1/4 (4 Partes)
          </button>
        </div>
      </div>

      <div id="lista-fracoes-container" style="display:flex; flex-direction:column; gap:10px; margin-bottom:20px;">
        <!-- Injetado dinamicamente -->
      </div>

      <div style="display:flex; gap:10px;">
        <button type="button" onclick="window._confirmarFracionamentoItem()" style="flex:1; background:#10b981; color:white; border:none; padding:14px; border-radius:12px; font-weight:800; font-size:14px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
          <i class="ph-bold ph-check"></i> Salvar Divisão nas Comandas
        </button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';
  window._gerarFracoesItem(2);
};

window._gerarFracoesItem = function (qtd) {
  const item = window._itemEmFracionamento;
  if (!item) return;

  const multiplier = typeof getBillMultiplier === 'function' ? getBillMultiplier() : 1.0;
  const valorTotal = (parseFloat(String(item.total).replace(',', '.')) || 0) * multiplier;
  const valorPorParte = valorTotal / qtd;
  const comandasDisponiveis = window.activeComandas || [];

  let html = '';
  for (let i = 1; i <= qtd; i++) {
    const fracaoTxt = '1/' + qtd;
    html += `
      <div style="background:#f8fafc; border:1.5px solid #e2e8f0; border-radius:12px; padding:12px; display:flex; flex-direction:column; gap:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-weight:800; font-size:13px; color:#0f172a; display:flex; align-items:center; gap:6px;">
            <span style="background:#fc4b15; color:white; font-size:10px; padding:2px 6px; border-radius:6px;">${fracaoTxt}</span>
            Parte ${i}
          </span>
          <span style="font-weight:800; font-size:14px; color:#10b981;">R$ ${valorPorParte.toFixed(2).replace('.', ',')}</span>
        </div>

        <div style="display:flex; gap:6px; align-items:center;">
          <select class="select-comanda-fracao" data-fracao="${fracaoTxt}" data-valor="${valorPorParte}" style="flex:1; padding:8px 10px; border-radius:8px; border:1px solid #cbd5e1; font-size:12.5px; background:white; outline:none;">
            <option value="">👤 Consumo Geral da Mesa</option>
            ${comandasDisponiveis.map(c => `<option value="${c}">👤 Comanda: ${c}</option>`).join('')}
            <option value="__nova__">➕ Criar Nova Comanda...</option>
          </select>

          <button type="button" onclick="window._pagarFracaoDiretoMobile(${item.id}, ${valorPorParte}, '${fracaoTxt}')" style="background:#e0f2fe; border:1px solid #bae6fd; color:#0369a1; padding:8px 12px; border-radius:8px; font-weight:700; font-size:12px; cursor:pointer; display:flex; align-items:center; gap:4px; white-space:nowrap;">
            <i class="ph-bold ph-credit-card"></i> Pagar Fração
          </button>
        </div>
      </div>
    `;
  }

  const container = document.getElementById('lista-fracoes-container');
  if (container) container.innerHTML = html;
};

window._confirmarFracionamentoItem = function () {
  const item = window._itemEmFracionamento;
  if (!item) return;

  const selects = document.querySelectorAll('.select-comanda-fracao');
  const fracoes = [];

  selects.forEach((sel) => {
    let comanda = sel.value;
    if (comanda === '__nova__') {
      const nova = prompt('Digite o nome da nova comanda para esta fração:');
      comanda = nova && nova.trim() ? nova.trim() : null;
    }
    fracoes.push({
      fracao: sel.dataset.fracao,
      valor: parseFloat(sel.dataset.valor) || 0,
      comanda: comanda
    });
  });

  socket.emit('dividir_item_fracoes', {
    itemId: item.id,
    fracoes: fracoes,
    mesaName: currentTable,
    operador: typeof garcomOperador === 'function' ? garcomOperador() : 'Garçom'
  });

  const modal = document.getElementById('modal-fracionar-item-mobile');
  if (modal) modal.style.display = 'none';
  if (typeof showToast === 'function') showToast('✂️ Item fracionado com sucesso!', 'success');
};

window._pagarFracaoDiretoMobile = function (itemId, valor, fracaoTxt) {
  const metodo = prompt('Selecione o método de pagamento:\n1 - Dinheiro\n2 - Cartão de Crédito\n3 - Cartão de Débito\n4 - PIX', '1');
  if (!metodo) return;

  let metodoStr = 'Dinheiro';
  if (metodo === '2' || metodo.toLowerCase().includes('crédito') || metodo.toLowerCase().includes('credito')) metodoStr = 'Cartão de Crédito';
  else if (metodo === '3' || metodo.toLowerCase().includes('débito') || metodo.toLowerCase().includes('debito')) metodoStr = 'Cartão de Débito';
  else if (metodo === '4' || metodo.toLowerCase().includes('pix')) metodoStr = 'PIX';

  socket.emit('pagar_fracao_item_garcom', {
    itemId: itemId,
    valor: valor,
    metodo: metodoStr,
    mesaName: currentTable,
    operador: typeof garcomOperador === 'function' ? garcomOperador() : 'Garçom'
  });

  const modal = document.getElementById('modal-fracionar-item-mobile');
  if (modal) modal.style.display = 'none';
  if (typeof showToast === 'function') showToast(`💳 Pagamento de ${fracaoTxt} (${metodoStr}) registrado!`, 'success');
};


// ─── GERENCIAMENTO DE ORDENAÇÃO E LAYOUT DE MESAS (GARÇOM MOBILE) ───
window.mudarOrdenacaoMesas = function (tipo) {
  try { localStorage.setItem('garcom_mesa_sort', tipo); } catch(e){}
  renderTables();
};

window.mudarLayoutMesas = function (layout) {
  try { localStorage.setItem('garcom_mesa_layout', layout); } catch(e){}
  
  document.querySelectorAll('.btn-layout-mesa').forEach(b => {
    b.classList.remove('active');
    b.style.background = 'transparent';
    b.style.color = 'var(--text-secondary, #64748b)';
  });

  const btnAtivo = document.getElementById('btn-layout-' + layout);
  if (btnAtivo) {
    btnAtivo.classList.add('active');
    btnAtivo.style.background = '#fc4b15';
    btnAtivo.style.color = '#ffffff';
  }

  const grid = document.getElementById('tables-grid');
  if (grid) {
    grid.className = '';
    if (layout === 'grid-3') {
      grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
    } else if (layout === 'list') {
      grid.style.gridTemplateColumns = '1fr';
    } else {
      grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
    }
  }
};

window.mostrarQrMesaCliente = function () {
  const mesaNome = currentTable || 'Mesa';
  const modal = document.getElementById('modal-qr-mesa-cliente');
  const titleEl = document.getElementById('modal-qr-mesa-title');
  const containerEl = document.getElementById('modal-qr-mesa-code-container');

  if (titleEl) titleEl.innerText = mesaNome;
  
  const clienteUrl = window.location.origin + '/conta-cliente.html?mesa=' + encodeURIComponent(mesaNome);
  window._clienteUrlAtual = clienteUrl;

  if (containerEl) {
    containerEl.innerHTML = '';
    if (typeof qrcode !== 'undefined') {
      try {
        const qr = qrcode(0, 'M');
        qr.addData(clienteUrl);
        qr.make();
        containerEl.innerHTML = qr.createImgTag(5, 8);
      } catch(e) {
        containerEl.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(clienteUrl)}" style="width:180px;height:180px;" alt="QR Code">`;
      }
    } else {
      containerEl.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(clienteUrl)}" style="width:180px;height:180px;" alt="QR Code">`;
    }
  }

  if (modal) modal.style.display = 'flex';
};

window.abrirLinkClienteDireto = function () {
  if (window._clienteUrlAtual) {
    window.open(window._clienteUrlAtual, '_blank');
  }
};


window.selecionarEtapaPrato = function(btn, etapa) {
  document.querySelectorAll('#etapas-selector .btn-etapa').forEach(b => {
    b.classList.remove('active');
    b.style.borderColor = '#cbd5e1';
    b.style.background = 'white';
    b.style.color = '#334155';
    b.style.fontWeight = '700';
  });
  if (btn) {
    btn.classList.add('active');
    btn.style.borderColor = '#6366f1';
    btn.style.background = '#eef2ff';
    btn.style.color = '#4338ca';
    btn.style.fontWeight = '800';
  }
  const check = document.getElementById('check-aguardar-marcha');
  if (check) {
    check.checked = (etapa === 'Principal' || etapa === 'Sobremesa');
  }
};

/* =========================================================================
   MÓDULOS OPERACIONAIS POR NICHO NO SALÃO (GARÇOM MOBILE)
   ========================================================================= */

// 1. Pizza Meio a Meio no Salão
window.abrirModalPizzaGarcom = function() {
  const m = document.getElementById('modal-garcom-pizza');
  if (!m) return;
  m.style.display = 'flex';
  const inpMesa = document.getElementById('garcom-pizza-mesa');
  if (inpMesa && window.currentTableNumber) {
    inpMesa.value = 'Mesa ' + window.currentTableNumber;
  }
};

window.confirmarPizzaGarcom = async function() {
  const mesa = document.getElementById('garcom-pizza-mesa')?.value || 'Mesa Balcão';
  const sab1Raw = document.getElementById('garcom-pizza-sabor1')?.value || 'Calabresa Especial|54';
  const sab2Raw = document.getElementById('garcom-pizza-sabor2')?.value || 'Quatro Queijos Nobre|68';
  const bordaRaw = document.getElementById('garcom-pizza-borda')?.value || 'Sem borda|0';
  const obs = document.getElementById('garcom-pizza-obs')?.value || '';

  const [nome1, p1] = sab1Raw.split('|');
  const [nome2, p2] = sab2Raw.split('|');
  const [bordaNome, bordaPreco] = bordaRaw.split('|');

  try {
    const res = await fetch('/api/nichos/pizzaria/fracionar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sabores: [
          { nome: nome1, preco_inteira: parseFloat(p1) || 54 },
          { nome: nome2, preco_inteira: parseFloat(p2) || 68 }
        ],
        borda: { nome: bordaNome, preco: parseFloat(bordaPreco) || 0 },
        regra_cobranca: 'maior_valor'
      })
    });
    const d = await res.json();
    if (d && d.ok) {
      // Lança também no Forno KDS
      await fetch('/api/nichos/pizzaria/forno/lancar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pedido_id: Math.floor(100 + Math.random() * 900),
          pizza_nome: `Pizza Meio ${nome1} / Meio ${nome2}`,
          sabores: [nome1, nome2],
          borda: bordaNome,
          tempo_coccao_min: 8
        })
      });

      document.getElementById('modal-garcom-pizza').style.display = 'none';
      if (typeof showToast === 'function') {
        showToast(`🍕 Pizza Meio a Meio (R$ ${d.valor_total_calculado.toFixed(2)}) lançada para ${mesa}!`, 'ph-pizza', 'success');
      } else {
        alert(`Pizza Meio a Meio lançada com sucesso!\nValor: R$ ${d.valor_total_calculado.toFixed(2)}\nKDS Forneiro notificado.`);
      }
    }
  } catch(e) {
    alert('Erro ao lançar pizza meio a meio.');
  }
};

// 2. Rodízio & Passadores
window._sinalRodizioSelecionado = 'quero_carne';

window.abrirModalRodizioGarcom = function() {
  const m = document.getElementById('modal-garcom-rodizio');
  if (!m) return;
  m.style.display = 'flex';
  const inpMesa = document.getElementById('garcom-rodizio-mesa');
  if (inpMesa && window.currentTableNumber) {
    inpMesa.value = 'Mesa ' + window.currentTableNumber;
  }
};

window.setSinalRodizioGarcom = function(sinal) {
  window._sinalRodizioSelecionado = sinal;
  const btnVerde = document.getElementById('btn-sinal-verde');
  const btnVermelho = document.getElementById('btn-sinal-vermelho');
  if (btnVerde && btnVermelho) {
    if (sinal === 'quero_carne') {
      btnVerde.style.border = '2px solid #10b981';
      btnVerde.style.background = '#f0fdf4';
      btnVerde.style.color = '#15803d';
      btnVermelho.style.border = '1.5px solid #cbd5e1';
      btnVermelho.style.background = '#ffffff';
      btnVermelho.style.color = '#64748b';
    } else {
      btnVermelho.style.border = '2px solid #ef4444';
      btnVermelho.style.background = '#fef2f2';
      btnVermelho.style.color = '#b91c1c';
      btnVerde.style.border = '1.5px solid #cbd5e1';
      btnVerde.style.background = '#ffffff';
      btnVerde.style.color = '#64748b';
    }
  }
};

window.confirmarRodizioGarcom = async function() {
  const mesa = document.getElementById('garcom-rodizio-mesa')?.value || 'Mesa 12';
  const cortes = (document.getElementById('garcom-rodizio-cortes')?.value || '').split(',').map(c => c.trim());
  const sinal = window._sinalRodizioSelecionado || 'quero_carne';

  try {
    const res = await fetch('/api/nichos/churrascaria/sinalizar-mesa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mesa_num: mesa,
        estado_sinal: sinal,
        cortes_preferidos: cortes
      })
    });
    const d = await res.json();
    if (d && d.ok) {
      document.getElementById('modal-garcom-rodizio').style.display = 'none';
      if (typeof showToast === 'function') {
        showToast(`🥩 ${mesa}: ${d.mensagem}`, 'ph-broadcast', 'success');
      } else {
        alert(d.mensagem);
      }
    }
  } catch(e) {
    alert('Erro ao atualizar sinal do rodízio.');
  }
};

// 3. Marchar Pratos (À La Carte)
window.abrirModalMarcharGarcom = function() {
  const m = document.getElementById('modal-garcom-marchar');
  if (!m) return;
  m.style.display = 'flex';
  const inpMesa = document.getElementById('garcom-marchar-mesa');
  if (inpMesa && window.currentTableNumber) {
    inpMesa.value = 'Mesa ' + window.currentTableNumber;
  }
};

window.confirmarMarchaGarcom = async function() {
  const mesa = document.getElementById('garcom-marchar-mesa')?.value || 'Mesa 07';
  const etapa = document.getElementById('garcom-marchar-etapa')?.value || 'prato_principal';

  try {
    const res = await fetch('/api/nichos/alacarte/marchar-etapa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pedido_id: Math.floor(500 + Math.random() * 500),
        mesa_num: mesa,
        etapa_a_marchar: etapa
      })
    });
    const d = await res.json();
    if (d && d.ok) {
      document.getElementById('modal-garcom-marchar').style.display = 'none';
      if (typeof showToast === 'function') {
        showToast(`🔔 Marcha autorizada: ${d.mesa} (${d.etapa_marchada})!`, 'ph-bell', 'info');
      } else {
        alert(`Comando de marcha enviado para a cozinha!\n${d.alerta_kds_chef}`);
      }
    }
  } catch(e) {
    alert('Erro ao enviar marcha de prato.');
  }
};

// 4. Sommelier IA
window.abrirModalSommelierGarcom = function() {
  const m = document.getElementById('modal-garcom-sommelier');
  if (!m) return;
  m.style.display = 'flex';
};

window.consultarSommelierGarcom = async function() {
  const box = document.getElementById('garcom-sommelier-resultado');
  const pratoId = document.getElementById('garcom-sommelier-prato')?.value || '1';
  if (box) box.innerHTML = 'Consultando Sommelier IA...';

  try {
    const res = await fetch(`/api/nichos/alacarte/harmonizar/${pratoId}`);
    const d = await res.json();
    if (d && d.ok && box) {
      box.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:4px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong style="color:#9d174d; font-size:13px;">🍷 ${d.sommelier_ia.rotulo_recomendado} (${d.sommelier_ia.safra})</strong>
            <span style="background:#fbcfe8; color:#9d174d; font-weight:800; font-size:10px; padding:2px 6px; border-radius:4px;">R$ ${d.sommelier_ia.preco_garrafa.toFixed(2)}</span>
          </div>
          <div style="font-size:11.5px; color:#475569; line-height:1.4;">${d.sommelier_ia.justificativa_harmonizacao}</div>
          <div style="font-size:11px; color:#059669; font-weight:700; margin-top:2px;">💡 ${d.upsell_garcom}</div>
        </div>
      `;
    }
  } catch(e) {
    if (box) box.innerHTML = '<span style="color:#ef4444;">Erro ao consultar Sommelier IA.</span>';
  }
};

/* =========================================================================
   NOVOS ATALHOS OPERACIONAIS DO SALÃO (GARÇOM MOBILE)
   ========================================================================= */

// ── 1. TRANSFERIR MESA OU ITENS ──
window._modoTransferencia = 'total';

window.setModoTransferencia = function(modo) {
  window._modoTransferencia = modo;
  const btnTotal = document.getElementById('btn-modo-transf-total');
  const btnItens = document.getElementById('btn-modo-transf-itens');
  if (btnTotal && btnItens) {
    if (modo === 'total') {
      btnTotal.style.border = '2px solid #ea580c';
      btnTotal.style.background = '#fff7ed';
      btnTotal.style.color = '#c2410c';
      btnItens.style.border = '1.5px solid #cbd5e1';
      btnItens.style.background = '#ffffff';
      btnItens.style.color = '#64748b';
    } else {
      btnItens.style.border = '2px solid #ea580c';
      btnItens.style.background = '#fff7ed';
      btnItens.style.color = '#c2410c';
      btnTotal.style.border = '1.5px solid #cbd5e1';
      btnTotal.style.background = '#ffffff';
      btnTotal.style.color = '#64748b';
    }
  }
};

window.abrirModalTransferirMesaGarcom = function() {
  const modal = document.getElementById('modal-garcom-transferir');
  const selOrigem = document.getElementById('garcom-transferir-origem');
  const selDestino = document.getElementById('garcom-transferir-destino');
  if (!modal || !selOrigem || !selDestino) return;

  const mesas = Array.isArray(MESAS) ? MESAS : [];
  if (mesas.length === 0) {
    if (typeof showToast === 'function') showToast('Nenhuma mesa cadastrada.', '#ef4444');
    return;
  }

  // Preenche opções de origem (preferindo ocupadas)
  selOrigem.innerHTML = mesas.map(m => {
    const isCur = (currentTable && currentTable === m.nome);
    const statusTxt = m.status === 'Ocupada' ? ' (Ocupada)' : (m.status === 'Reservada' ? ' (Reservada)' : ' (Livre)');
    return `<option value="${escHtml(m.nome)}"${isCur ? ' selected' : ''}>${escHtml(m.nome)}${statusTxt}</option>`;
  }).join('');

  // Preenche opções de destino
  selDestino.innerHTML = mesas.map((m, idx) => {
    const isSecond = (!currentTable && idx === 1) || (currentTable && currentTable !== m.nome && idx === 1);
    const statusTxt = m.status === 'Ocupada' ? ' (Ocupada)' : (m.status === 'Reservada' ? ' (Reservada)' : ' (Livre)');
    return `<option value="${escHtml(m.nome)}"${isSecond ? ' selected' : ''}>${escHtml(m.nome)}${statusTxt}</option>`;
  }).join('');

  window.setModoTransferencia('total');
  modal.style.display = 'flex';
};

window.confirmarTransferirMesaGarcom = function() {
  const origem = document.getElementById('garcom-transferir-origem')?.value;
  const destino = document.getElementById('garcom-transferir-destino')?.value;

  if (!origem || !destino) {
    if (typeof showToast === 'function') showToast('Selecione as mesas de origem e destino.', '#ef4444');
    return;
  }
  if (origem === destino) {
    if (typeof showToast === 'function') showToast('A mesa de destino deve ser diferente da origem.', '#ef4444');
    return;
  }

  const operadorNome = (typeof loggedUser !== 'undefined' && loggedUser && loggedUser.nome) ? loggedUser.nome : 'Garçom';

  if (window._modoTransferencia === 'itens') {
    if (typeof socket !== 'undefined' && socket) {
      socket.emit('transferir_mesas_itens', {
        mesaA: origem,
        mesaB: destino,
        operador: operadorNome
      });
    }
    if (typeof showToast === 'function') showToast(`📦 Itens transferidos de ${origem} para ${destino}!`, '#ea580c');
  } else {
    if (typeof socket !== 'undefined' && socket) {
      socket.emit('transferir_mesa', {
        mesaAtual: origem,
        novaMesa: destino,
        operador: operadorNome
      });
    }
    if (typeof showToast === 'function') showToast(`🔄 Mesa ${origem} transferida para ${destino}!`, '#ea580c');
  }

  document.getElementById('modal-garcom-transferir').style.display = 'none';
  if (typeof socket !== 'undefined' && socket) {
    setTimeout(() => socket.emit('get_mesas'), 300);
  }
};

// ── 2. JUNTAR MESAS EM GRUPO ──
window.abrirModalJuntarMesasGarcom = function() {
  const modal = document.getElementById('modal-garcom-juntar');
  const selA = document.getElementById('garcom-juntar-mesa-a');
  const selB = document.getElementById('garcom-juntar-mesa-b');
  if (!modal || !selA || !selB) return;

  const mesas = Array.isArray(MESAS) ? MESAS : [];
  if (mesas.length < 2) {
    if (typeof showToast === 'function') showToast('É necessário ter ao menos 2 mesas cadastradas.', '#ef4444');
    return;
  }

  selA.innerHTML = mesas.map((m, idx) => {
    const isCur = (currentTable && currentTable === m.nome) || (!currentTable && idx === 0);
    return `<option value="${escHtml(m.nome)}"${isCur ? ' selected' : ''}>${escHtml(m.nome)} (${m.status || 'Livre'})</option>`;
  }).join('');

  selB.innerHTML = mesas.map((m, idx) => {
    const isSecond = (!currentTable && idx === 1) || (currentTable && currentTable !== m.nome && idx === 1);
    return `<option value="${escHtml(m.nome)}"${isSecond ? ' selected' : ''}>${escHtml(m.nome)} (${m.status || 'Livre'})</option>`;
  }).join('');

  modal.style.display = 'flex';
};

window.confirmarJuntarMesasGarcom = function() {
  const mesaA = document.getElementById('garcom-juntar-mesa-a')?.value;
  const mesaB = document.getElementById('garcom-juntar-mesa-b')?.value;

  if (!mesaA || !mesaB) {
    if (typeof showToast === 'function') showToast('Selecione as duas mesas para unir.', '#ef4444');
    return;
  }
  if (mesaA === mesaB) {
    if (typeof showToast === 'function') showToast('Selecione mesas diferentes para agrupar.', '#ef4444');
    return;
  }

  const operadorNome = (typeof loggedUser !== 'undefined' && loggedUser && loggedUser.nome) ? loggedUser.nome : 'Garçom';

  if (typeof socket !== 'undefined' && socket) {
    socket.emit('juntar_mesas', {
      mesaA: mesaA,
      mesaB: mesaB,
      operador: operadorNome
    });
  }

  document.getElementById('modal-garcom-juntar').style.display = 'none';
  if (typeof showToast === 'function') showToast(`🔗 Mesas ${mesaA} e ${mesaB} unidas em grupo!`, '#8b5cf6');
  if (typeof socket !== 'undefined' && socket) {
    setTimeout(() => socket.emit('get_mesas'), 300);
  }
};

// ── 3. PEDIR PRÉ-CONTA & IMPRIMIR PARCIAL ──
window.abrirModalPedirContaGarcom = function() {
  const modal = document.getElementById('modal-garcom-preconta');
  const selMesa = document.getElementById('garcom-preconta-mesa');
  if (!modal || !selMesa) return;

  const mesas = Array.isArray(MESAS) ? MESAS : [];
  if (mesas.length === 0) {
    if (typeof showToast === 'function') showToast('Nenhuma mesa cadastrada.', '#ef4444');
    return;
  }

  selMesa.innerHTML = mesas.map(m => {
    const isCur = (currentTable && currentTable === m.nome);
    const statusTxt = m.status === 'Ocupada' ? ' • R$ ' + ((m._total || 0).toFixed(2)) : ' • Livre';
    return `<option value="${escHtml(m.nome)}"${isCur ? ' selected' : ''}>${escHtml(m.nome)}${statusTxt}</option>`;
  }).join('');

  window.atualizarResumoPreContaGarcom();
  modal.style.display = 'flex';
};

window.atualizarResumoPreContaGarcom = function() {
  const selMesa = document.getElementById('garcom-preconta-mesa');
  const mesaNome = selMesa ? selMesa.value : (currentTable || '');
  const elSubtotal = document.getElementById('garcom-preconta-subtotal');
  const elTaxa = document.getElementById('garcom-preconta-taxa');
  const elTotal = document.getElementById('garcom-preconta-total');
  const elItens = document.getElementById('garcom-preconta-itens-count');

  let subtotal = 0;
  let countItens = 0;

  const mesaObj = (Array.isArray(MESAS) ? MESAS : []).find(m => m.nome === mesaNome);
  if (mesaObj && typeof mesaObj._total === 'number' && mesaObj._total > 0) {
    subtotal = mesaObj._total;
  } else if (mesaNome === currentTable && Array.isArray(billItems) && billItems.length > 0) {
    subtotal = billItems.reduce((acc, it) => acc + (parseFloat(String(it.total).replace(',', '.')) || 0), 0);
    countItens = billItems.reduce((acc, it) => acc + (it.quantity || 1), 0);
  }

  const taxa = subtotal * 0.10;
  const total = subtotal + taxa;

  if (elSubtotal) elSubtotal.innerText = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;
  if (elTaxa) elTaxa.innerText = `R$ ${taxa.toFixed(2).replace('.', ',')}`;
  if (elTotal) elTotal.innerText = `R$ ${total.toFixed(2).replace('.', ',')}`;
  if (elItens) {
    elItens.innerText = countItens > 0 ? `${countItens} itens registrados nesta mesa` : 'Consumo registrado no sistema';
  }
};

window.confirmarPedirContaGarcom = function() {
  const selMesa = document.getElementById('garcom-preconta-mesa');
  const mesaNome = selMesa ? selMesa.value : currentTable;

  if (!mesaNome) {
    if (typeof showToast === 'function') showToast('Selecione uma mesa.', '#ef4444');
    return;
  }

  if (typeof socket !== 'undefined' && socket) {
    socket.emit('alerta_pedir_conta', mesaNome);
  }

  document.getElementById('modal-garcom-preconta').style.display = 'none';
  if (typeof showToast === 'function') {
    showToast(`🔔 Chamado de conta enviado ao Caixa para ${mesaNome}!`, '#0284c7');
  } else {
    alert(`Chamado de conta enviado ao Caixa para ${mesaNome}!`);
  }
};

window.imprimirPreContaGarcom = async function() {
  const selMesa = document.getElementById('garcom-preconta-mesa');
  const mesaNome = selMesa ? selMesa.value : currentTable;
  if (!mesaNome) return;

  try {
    const res = await fetch('/api/pedidos/imprimir-preconta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mesaName: mesaNome, operador: (loggedUser && loggedUser.nome) || 'Garçom' })
    });
    const d = await res.json().catch(() => ({}));
    if (d && d.ok) {
      if (typeof showToast === 'function') showToast(`🖨️ Pré-conta enviada para a impressora!`, '#10b981');
    } else {
      window.open(`/api/imprimir-resumo-mesa?mesa=${encodeURIComponent(mesaNome)}`, '_blank');
    }
  } catch(e) {
    window.open(`/api/imprimir-resumo-mesa?mesa=${encodeURIComponent(mesaNome)}`, '_blank');
  }
};

// ── 4. CALCULADORA DE DIVISÃO DE CONTA ──
window._dividirPessoas = 2;
window._dividirComGorjeta = true;

window.abrirModalDividirContaGarcom = function() {
  const modal = document.getElementById('modal-garcom-dividir-conta');
  const selMesa = document.getElementById('garcom-dividir-mesa');
  const inpValor = document.getElementById('garcom-dividir-valor');
  if (!modal) return;

  const mesas = Array.isArray(MESAS) ? MESAS : [];
  if (selMesa) {
    selMesa.innerHTML = '<option value="">(Digitar valor manual)</option>' +
      mesas.map(m => {
        const isCur = (currentTable && currentTable === m.nome);
        const valTxt = typeof m._total === 'number' && m._total > 0 ? ` (R$ ${m._total.toFixed(2)})` : '';
        return `<option value="${escHtml(m.nome)}"${isCur ? ' selected' : ''}>${escHtml(m.nome)}${valTxt}</option>`;
      }).join('');
  }

  window.carregarValorMesaParaDivisao();
  modal.style.display = 'flex';
};

window.carregarValorMesaParaDivisao = function() {
  const selMesa = document.getElementById('garcom-dividir-mesa');
  const inpValor = document.getElementById('garcom-dividir-valor');
  const mesaNome = selMesa ? selMesa.value : '';

  if (mesaNome) {
    const mesaObj = (Array.isArray(MESAS) ? MESAS : []).find(m => m.nome === mesaNome);
    if (mesaObj && typeof mesaObj._total === 'number' && mesaObj._total > 0) {
      if (inpValor) inpValor.value = mesaObj._total.toFixed(2);
    } else if (mesaNome === currentTable && Array.isArray(billItems) && billItems.length > 0) {
      const sub = billItems.reduce((acc, it) => acc + (parseFloat(String(it.total).replace(',', '.')) || 0), 0);
      if (inpValor) inpValor.value = sub.toFixed(2);
    }
  }
  window.calcularDivisaoConta();
};

window.alterarPessoasDivisao = function(delta) {
  const inp = document.getElementById('garcom-dividir-pessoas');
  let val = parseInt(inp ? inp.value : '2', 10) || 2;
  val = Math.max(1, Math.min(99, val + delta));
  if (inp) inp.value = val;
  window.calcularDivisaoConta();
};

window.setPessoasDivisao = function(qtd) {
  const inp = document.getElementById('garcom-dividir-pessoas');
  if (inp) inp.value = qtd;
  window.calcularDivisaoConta();
};

window.toggleGorjetaDivisao = function(comGorjeta) {
  window._dividirComGorjeta = !!comGorjeta;
  const btnCom = document.getElementById('btn-dividir-com-10');
  const btnSem = document.getElementById('btn-dividir-sem-10');

  if (btnCom && btnSem) {
    if (window._dividirComGorjeta) {
      btnCom.style.border = '2px solid #10b981';
      btnCom.style.background = '#f0fdf4';
      btnCom.style.color = '#166534';
      btnSem.style.border = '1.5px solid #cbd5e1';
      btnSem.style.background = '#fff';
      btnSem.style.color = '#64748b';
    } else {
      btnSem.style.border = '2px solid #64748b';
      btnSem.style.background = '#f1f5f9';
      btnSem.style.color = '#1e293b';
      btnCom.style.border = '1.5px solid #cbd5e1';
      btnCom.style.background = '#fff';
      btnCom.style.color = '#64748b';
    }
  }
  window.calcularDivisaoConta();
};

window.calcularDivisaoConta = function() {
  const inpValor = document.getElementById('garcom-dividir-valor');
  const inpPessoas = document.getElementById('garcom-dividir-pessoas');
  const elRes = document.getElementById('garcom-dividir-resultado');
  const elDet = document.getElementById('garcom-dividir-detalhe');

  const valorBase = parseFloat(inpValor ? inpValor.value : '0') || 0;
  const pessoas = parseInt(inpPessoas ? inpPessoas.value : '2', 10) || 1;
  const total = window._dividirComGorjeta ? (valorBase * 1.10) : valorBase;
  const porPessoa = pessoas > 0 ? (total / pessoas) : 0;

  if (elRes) elRes.innerText = `R$ ${porPessoa.toFixed(2).replace('.', ',')}`;
  if (elDet) {
    const gorjTxt = window._dividirComGorjeta ? ' (com 10% serviço)' : ' (sem taxa)';
    elDet.innerText = `Total R$ ${total.toFixed(2).replace('.', ',')}${gorjTxt} ÷ ${pessoas} pessoa${pessoas === 1 ? '' : 's'}`;
  }
};

window.copiarResumoDivisao = function() {
  const inpValor = document.getElementById('garcom-dividir-valor');
  const inpPessoas = document.getElementById('garcom-dividir-pessoas');
  const selMesa = document.getElementById('garcom-dividir-mesa');
  const mesaNome = selMesa?.value || currentTable || 'Mesa';

  const valorBase = parseFloat(inpValor ? inpValor.value : '0') || 0;
  const pessoas = parseInt(inpPessoas ? inpPessoas.value : '2', 10) || 1;
  const total = window._dividirComGorjeta ? (valorBase * 1.10) : valorBase;
  const porPessoa = pessoas > 0 ? (total / pessoas) : 0;

  const msg = `🍽️ *Chef Cozinha - Divisão de Conta (${mesaNome})*\n` +
    `• Subtotal: R$ ${valorBase.toFixed(2).replace('.', ',')}\n` +
    (window._dividirComGorjeta ? `• Taxa de Serviço (10%): R$ ${(valorBase * 0.10).toFixed(2).replace('.', ',')}\n` : '') +
    `• *Total Geral:* R$ ${total.toFixed(2).replace('.', ',')}\n` +
    `👥 *Divisão:* ${pessoas} pessoas\n` +
    `👉 *Valor por Pessoa: R$ ${porPessoa.toFixed(2).replace('.', ',')}*\n` +
    `Obrigado pela preferência!`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(msg).then(() => {
      if (typeof showToast === 'function') showToast('📋 Resumo da divisão copiado!', '#10b981');
    }).catch(() => {
      prompt('Copie o resumo abaixo:', msg);
    });
  } else {
    prompt('Copie o resumo abaixo:', msg);
  }
};

window.compartilharWhatsappDivisao = function() {
  const inpValor = document.getElementById('garcom-dividir-valor');
  const inpPessoas = document.getElementById('garcom-dividir-pessoas');
  const selMesa = document.getElementById('garcom-dividir-mesa');
  const mesaNome = selMesa?.value || currentTable || 'Mesa';

  const valorBase = parseFloat(inpValor ? inpValor.value : '0') || 0;
  const pessoas = parseInt(inpPessoas ? inpPessoas.value : '2', 10) || 1;
  const total = window._dividirComGorjeta ? (valorBase * 1.10) : valorBase;
  const porPessoa = pessoas > 0 ? (total / pessoas) : 0;

  const msg = `🍽️ *Chef Cozinha - Divisão de Conta (${mesaNome})*\n` +
    `• Subtotal: R$ ${valorBase.toFixed(2).replace('.', ',')}\n` +
    (window._dividirComGorjeta ? `• Taxa de Serviço (10%): R$ ${(valorBase * 0.10).toFixed(2).replace('.', ',')}\n` : '') +
    `• *Total Geral:* R$ ${total.toFixed(2).replace('.', ',')}\n` +
    `👥 *Divisão:* ${pessoas} pessoas\n` +
    `👉 *Valor por Pessoa: R$ ${porPessoa.toFixed(2).replace('.', ',')}*`;

  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
};

// ── 5. AVISO DE LIMPEZA / HIGIENIZAÇÃO ──
window._estadoLimpeza = 'suja';

window.setEstadoLimpeza = function(estado) {
  window._estadoLimpeza = estado;
  const btnSuja = document.getElementById('btn-limpeza-suja');
  const btnUrgente = document.getElementById('btn-limpeza-urgente');
  const btnPronta = document.getElementById('btn-limpeza-pronta');

  const resets = [
    { el: btnSuja, border: '#cbd5e1', bg: '#fff', color: '#64748b' },
    { el: btnUrgente, border: '#cbd5e1', bg: '#fff', color: '#64748b' },
    { el: btnPronta, border: '#cbd5e1', bg: '#fff', color: '#64748b' }
  ];
  resets.forEach(r => {
    if (r.el) {
      r.el.style.border = '1.5px solid ' + r.border;
      r.el.style.background = r.bg;
      r.el.style.color = r.color;
      r.el.style.fontWeight = '700';
    }
  });

  if (estado === 'suja' && btnSuja) {
    btnSuja.style.border = '2px solid #0891b2';
    btnSuja.style.background = '#ecfeff';
    btnSuja.style.color = '#0e7490';
    btnSuja.style.fontWeight = '800';
  } else if (estado === 'urgente' && btnUrgente) {
    btnUrgente.style.border = '2px solid #ef4444';
    btnUrgente.style.background = '#fef2f2';
    btnUrgente.style.color = '#b91c1c';
    btnUrgente.style.fontWeight = '800';
  } else if (estado === 'pronta' && btnPronta) {
    btnPronta.style.border = '2px solid #10b981';
    btnPronta.style.background = '#f0fdf4';
    btnPronta.style.color = '#15803d';
    btnPronta.style.fontWeight = '800';
  }
};

window.abrirModalLimpezaMesaGarcom = function() {
  const modal = document.getElementById('modal-garcom-limpeza');
  const selMesa = document.getElementById('garcom-limpeza-mesa');
  if (!modal || !selMesa) return;

  const mesas = Array.isArray(MESAS) ? MESAS : [];
  selMesa.innerHTML = mesas.map(m => {
    const isCur = (currentTable && currentTable === m.nome);
    return `<option value="${escHtml(m.nome)}"${isCur ? ' selected' : ''}>${escHtml(m.nome)} (${m.status || 'Livre'})</option>`;
  }).join('');

  window.setEstadoLimpeza('suja');
  modal.style.display = 'flex';
};

window.confirmarLimpezaMesaGarcom = function() {
  const selMesa = document.getElementById('garcom-limpeza-mesa');
  const mesaNome = selMesa ? selMesa.value : currentTable;
  const obs = document.getElementById('garcom-limpeza-obs')?.value || '';
  const operadorNome = (typeof loggedUser !== 'undefined' && loggedUser && loggedUser.nome) ? loggedUser.nome : 'Garçom';

  if (!mesaNome) {
    if (typeof showToast === 'function') showToast('Selecione uma mesa.', '#ef4444');
    return;
  }

  const estadoTxt = window._estadoLimpeza === 'urgente' ? '🚨 LIMPEZA URGENTE' : (window._estadoLimpeza === 'pronta' ? '✨ MESA HIGIENIZADA E PRONTA' : '🧹 MESA AGUARDANDO LIMPEZA');

  if (typeof socket !== 'undefined' && socket) {
    socket.emit('chamar_garcom_salao', {
      tipo: 'limpeza',
      origem: 'app_garcom',
      mesa: mesaNome,
      solicitante: operadorNome,
      mensagem: `${estadoTxt} na ${mesaNome}${obs ? ' (' + obs + ')' : ''} solicitada por ${operadorNome}`
    });
  }

  document.getElementById('modal-garcom-limpeza').style.display = 'none';
  if (typeof showToast === 'function') {
    showToast(`🧹 Alerta de ${mesaNome} disparado para a equipe!`, '#0891b2');
  }
};

// ── 6. GUIA RÁPIDO DE ALÉRGENOS & RESTRIÇÕES ──
window._filtroAlergenoAtivo = 'todos';

window.setFiltroAlergeno = function(filtro, btn) {
  window._filtroAlergenoAtivo = filtro;
  document.querySelectorAll('.btn-filtro-alergeno').forEach(b => {
    b.classList.remove('active');
    b.style.background = '#fff';
    b.style.color = '#334155';
    b.style.borderColor = '#cbd5e1';
  });
  if (btn) {
    btn.classList.add('active');
    btn.style.background = '#e11d48';
    btn.style.color = '#fff';
    btn.style.borderColor = '#e11d48';
  }
  window.filtrarAlergenosGarcom();
};

window.abrirModalAlergenosGarcom = function() {
  const modal = document.getElementById('modal-garcom-alergenos');
  if (!modal) return;
  modal.style.display = 'flex';
  window.filtrarAlergenosGarcom();
};

window.filtrarAlergenosGarcom = function() {
  const container = document.getElementById('garcom-alergenos-lista');
  const inputBusca = document.getElementById('garcom-alergenos-busca');
  if (!container) return;

  const query = (inputBusca?.value || '').trim().toLowerCase();
  const filtro = window._filtroAlergenoAtivo || 'todos';

  const produtos = Array.isArray(MENU) ? MENU : [];

  const itensFiltrados = produtos.filter(p => {
    const nome = (p.name || '').toLowerCase();
    const cat = (p.category || '').toLowerCase();
    const desc = (p.description || p.descricao || '').toLowerCase();

    if (query && !nome.includes(query) && !cat.includes(query) && !desc.includes(query)) {
      return false;
    }

    if (filtro === 'gluten_free') {
      const temGluten = nome.includes('trigo') || nome.includes('pão') || nome.includes('pao') || nome.includes('massa') || nome.includes('pizza') || nome.includes('hambúrguer') || nome.includes('cerveja');
      return !temGluten;
    } else if (filtro === 'lactose_free') {
      const temLactose = nome.includes('queijo') || nome.includes('leite') || nome.includes('creme') || nome.includes('catupiry') || nome.includes('manteiga') || nome.includes('cheddar');
      return !temLactose;
    } else if (filtro === 'vegano') {
      const temOrigemAnimal = nome.includes('carne') || nome.includes('frango') || nome.includes('peixe') || nome.includes('camarão') || nome.includes('bacon') || nome.includes('queijo') || nome.includes('ovo') || cat.includes('carnes');
      return !temOrigemAnimal;
    } else if (filtro === 'vegetariano') {
      const temCarne = nome.includes('carne') || nome.includes('frango') || nome.includes('peixe') || nome.includes('camarão') || nome.includes('bacon') || nome.includes('costela') || cat.includes('carnes');
      return !temCarne;
    } else if (filtro === 'seafood_free') {
      const temFrutos = nome.includes('peixe') || nome.includes('camarão') || nome.includes('camarao') || nome.includes('lula') || nome.includes('polvo') || nome.includes('salmão') || nome.includes('atum') || cat.includes('peixes');
      return !temFrutos;
    }

    return true;
  });

  if (itensFiltrados.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: #94a3b8; padding: 30px 10px; font-size: 13.5px;"><i class="ph ph-magnifying-glass" style="font-size: 32px; display: block; margin-bottom: 6px;"></i>Nenhum prato compatível com os filtros.</div>';
    return;
  }

  container.innerHTML = itensFiltrados.map(p => {
    const nome = p.name || 'Produto';
    const cat = p.category || 'Geral';
    const preco = typeof p.price === 'number' ? p.price.toFixed(2).replace('.', ',') : '0,00';
    const emoji = p.emoji || '🍽️';

    // Gera badges de alérgenos baseados em ingredientes comuns
    const n = nome.toLowerCase();
    const badges = [];
    if (!n.includes('trigo') && !n.includes('massa') && !n.includes('pizza') && !n.includes('pão')) {
      badges.push('<span style="background:#dcfce7; color:#166534; font-size:10.5px; font-weight:800; padding:2px 6px; border-radius:6px;">🌾 Sem Glúten</span>');
    }
    if (!n.includes('queijo') && !n.includes('leite') && !n.includes('catupiry') && !n.includes('cheddar')) {
      badges.push('<span style="background:#e0f2fe; color:#0369a1; font-size:10.5px; font-weight:800; padding:2px 6px; border-radius:6px;">🥛 Sem Lactose</span>');
    }
    if (n.includes('camarão') || n.includes('peixe') || n.includes('lula') || n.includes('polvo')) {
      badges.push('<span style="background:#fee2e2; color:#b91c1c; font-size:10.5px; font-weight:800; padding:2px 6px; border-radius:6px;">🦐 Frutos do Mar</span>');
    }

    return `
      <div style="background: var(--g-app-bg, #f8fafc); border: 1px solid var(--g-border, #e2e8f0); border-radius: 14px; padding: 10px 12px; display: flex; align-items: center; justify-content: space-between; gap: 10px;">
        <div style="display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1;">
          <span style="font-size: 22px; flex-shrink: 0;">${emoji}</span>
          <div style="min-width: 0; flex: 1;">
            <strong style="font-size: 13.5px; color: var(--g-text, #0f172a); display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escHtml(nome)}</strong>
            <span style="font-size: 11px; color: var(--g-text-muted, #64748b);">${escHtml(cat)} • R$ ${preco}</span>
            <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px;">
              ${badges.join(' ')}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
};

// ── 7. BIPAR QR DA MESA & ABERTURA DIRETA ──
window._garcomCameraScanner = null;

window.escanearQrMesaGarcom = function() {
  const modal = document.getElementById('modal-garcom-escanear-qr');
  const viewport = document.getElementById('garcom-qr-camera-viewport');
  const loading = document.getElementById('garcom-qr-camera-loading');
  if (!modal) return;

  modal.style.display = 'flex';
  if (loading) loading.style.display = 'block';

  if (typeof Html5Qrcode === 'undefined') {
    if (loading) loading.innerHTML = '<span style="color:#ef4444;">Leitor de câmera indisponível no dispositivo. Digite o número da mesa abaixo.</span>';
    return;
  }

  if (window._garcomCameraScanner) {
    try { window._garcomCameraScanner.clear(); } catch(e){}
    window._garcomCameraScanner = null;
  }

  setTimeout(() => {
    try {
      window._garcomCameraScanner = new Html5Qrcode("garcom-qr-camera-viewport");
      window._garcomCameraScanner.start(
        { facingMode: "environment" },
        { fps: 15, qrbox: { width: 220, height: 220 }, aspectRatio: 1.0 },
        (decodedText) => {
          window.fecharModalEscanearQr();
          window.abrirMesaDiretaPorNumero(decodedText);
        },
        () => {}
      ).then(() => {
        if (loading) loading.style.display = 'none';
      }).catch(err => {
        if (loading) loading.innerHTML = '<span style="color:#f59e0b;">Permissão de câmera não concedida. Use a busca manual abaixo.</span>';
      });
    } catch(e) {
      if (loading) loading.innerHTML = '<span style="color:#ef4444;">Erro ao iniciar leitor.</span>';
    }
  }, 200);
};

window.fecharModalEscanearQr = function() {
  if (window._garcomCameraScanner) {
    try {
      window._garcomCameraScanner.stop().then(() => {
        try { window._garcomCameraScanner.clear(); } catch(e){}
        window._garcomCameraScanner = null;
      }).catch(() => {
        window._garcomCameraScanner = null;
      });
    } catch(e) {
      window._garcomCameraScanner = null;
    }
  }
  const modal = document.getElementById('modal-garcom-escanear-qr');
  if (modal) modal.style.display = 'none';
};

window.abrirMesaDiretaPorNumero = function(texto) {
  if (!texto) {
    if (typeof showToast === 'function') showToast('Digite o número da mesa.', '#ef4444');
    return;
  }

  let mesaAlvo = String(texto).trim();
  try {
    if (mesaAlvo.includes('mesa=')) {
      const match = mesaAlvo.match(/mesa=([^&]+)/);
      if (match && match[1]) mesaAlvo = decodeURIComponent(match[1]);
    }
  } catch(e){}

  const mesas = Array.isArray(MESAS) ? MESAS : [];
  const mesaEncontrada = mesas.find(m => {
    const nomeNormal = (m.nome || '').toLowerCase().trim();
    const buscaNormal = mesaAlvo.toLowerCase().trim();
    if (nomeNormal === buscaNormal) return true;
    const numMesa = nomeNormal.replace(/\D/g, '');
    const numBusca = buscaNormal.replace(/\D/g, '');
    return numMesa && numBusca && numMesa === numBusca;
  });

  if (mesaEncontrada) {
    window.fecharModalEscanearQr();
    if (typeof window.openTableOptions === 'function') {
      window.openTableOptions(mesaEncontrada);
    } else {
      currentTable = mesaEncontrada.nome;
      if (typeof showView === 'function') showView('tables', `Mesa ${mesaEncontrada.nome}`);
    }
    if (typeof showToast === 'function') showToast(`✓ ${mesaEncontrada.nome} selecionada!`, '#10b981');
  } else {
    if (typeof showToast === 'function') showToast(`Mesa "${mesaAlvo}" não encontrada.`, '#ef4444');
    else alert(`Mesa "${mesaAlvo}" não encontrada.`);
  }
};

// ── 8. ALTERNAR TEMA GARÇOM ──
window.alternarTemaGarcom = function() {
  if (window.ChefTheme && typeof window.ChefTheme.toggle === 'function') {
    window.ChefTheme.toggle();
    const atual = window.ChefTheme.get ? window.ChefTheme.get() : '';
    if (typeof showToast === 'function') {
      showToast(`🌓 Modo ${atual === 'dark' ? 'Escuro' : 'Claro'} ativado!`, '#6366f1');
    }
  } else {
    const btn = document.getElementById('btn-theme-toggle');
    if (btn) btn.click();
  }
};

// ── 9. QUANTIDADE RÁPIDA NO ITEM (VIEW-DETAILS) ──
window.setDetalheQtd = function(qtd) {
  selectedQty = parseInt(qtd, 10) || 1;
  const el = document.getElementById('detail-qty');
  if (el) el.innerText = selectedQty;
  if (typeof updateDetailPrice === 'function') updateDetailPrice();
  try { if (navigator.vibrate) navigator.vibrate(30); } catch(e){}
};

// ── 10. OBSERVAÇÕES RÁPIDAS EM PÍLULAS (1 TOQUE) ──
window.adicionarObsRapida = function(tag) {
  const textarea = document.getElementById('detail-obs');
  if (!textarea) return;
  let val = textarea.value.trim();
  if (val.includes(tag)) {
    val = val.replace(tag, '').replace(/,\s*,/g, ',').replace(/^,\s*|,\s*$/g, '').trim();
  } else {
    val = val ? `${val}, ${tag}` : tag;
  }
  textarea.value = val;
  try { if (navigator.vibrate) navigator.vibrate(30); } catch(e){}
};

// ── 11. REPETIR ITEM NA COMANDA (+1X RÁPIDO) ──
window.repetirItemComanda = function(itemId) {
  const item = Array.isArray(billItems) ? billItems.find(i => i.id === itemId) : null;
  if (!item) return;

  const nomeMesa = currentTable || item.localName;
  if (!nomeMesa) {
    if (typeof showToast === 'function') showToast('Mesa não definida.', '#ef4444');
    return;
  }

  const precoUnitario = (item.totalVal && item.quantity) ? (item.totalVal / item.quantity) : (parseFloat(String(item.total).replace(',', '.')) || 0);

  const emitItem = {
    productName: item.productName,
    productEmoji: item.productEmoji || '🍽️',
    sector: item.sector || 'Cozinha 1',
    quantity: 1,
    observations: item.observations ? `${item.observations} (Repetição)` : 'Pedido repetido',
    composicoes: item.composicoes || [],
    total: precoUnitario.toFixed(2).replace('.', ','),
    mesa_comanda: item.mesa_comanda || '',
    localName: nomeMesa,
    userName: (typeof loggedUser !== 'undefined' && loggedUser && loggedUser.nome) ? loggedUser.nome : 'Garçom',
    status: 'Pendente',
    time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    createdAt: Date.now()
  };

  if (typeof socket !== 'undefined' && socket) {
    socket.emit('novo_pedido', emitItem);
    try { if (navigator.vibrate) navigator.vibrate([60, 40, 60]); } catch(e){}
    if (typeof showToast === 'function') {
      showToast(`✓ +1x ${item.productName} lançado na ${nomeMesa}!`, '#10b981');
    }
    setTimeout(() => {
      socket.emit('get_itens_mesa', nomeMesa);
    }, 250);
  }
};

// ══════════════════════════════════════════════════════════════════════════
// 12. GARÇOM VOICE IA (RECONHECIMENTO DE VOZ & PARSER DE PEDIDOS NATURAL)
// ══════════════════════════════════════════════════════════════════════════
let speechRecognitionInstance = null;
let isVoiceListening = false;
let ultimoResultadoVozIA = null;

window.abrirModalVozIA = function() {
  const modal = document.getElementById('modal-garcom-voz');
  if (!modal) return;
  modal.style.display = 'flex';

  const transcricao = document.getElementById('input-voz-transcricao');
  if (transcricao && (!transcricao.value || transcricao.value.trim() === '')) {
    if (typeof currentTable !== 'undefined' && currentTable) {
      transcricao.value = `${currentTable}, `;
    }
  }

  // Se o navegador suportar, inicia automaticamente ao abrir para máxima agilidade
  if (window.webkitSpeechRecognition || window.SpeechRecognition) {
    window.iniciarReconhecimentoVoz();
  }
};

window.fecharModalVozIA = function() {
  window.pararReconhecimentoVoz();
  const modal = document.getElementById('modal-garcom-voz');
  if (modal) modal.style.display = 'none';
};

window.alternarReconhecimentoVoz = function() {
  if (isVoiceListening) {
    window.pararReconhecimentoVoz();
  } else {
    window.iniciarReconhecimentoVoz();
  }
};

window.iniciarReconhecimentoVoz = function() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    if (typeof showToast === 'function') {
      showToast('Navegador sem suporte ao microfone. Digite o pedido abaixo.', '#f59e0b');
    }
    const statusTxt = document.getElementById('txt-status-mic');
    if (statusTxt) statusTxt.innerText = 'Microfone não suportado. Digite o comando:';
    return;
  }

  try {
    if (speechRecognitionInstance) {
      try { speechRecognitionInstance.abort(); } catch (_) {}
    }

    speechRecognitionInstance = new SpeechRec();
    speechRecognitionInstance.lang = 'pt-BR';
    speechRecognitionInstance.continuous = true;
    speechRecognitionInstance.interimResults = true;

    const micBtn = document.getElementById('btn-garcom-mic-trigger');
    const micIcon = document.getElementById('icone-mic-status');
    const statusTxt = document.getElementById('txt-status-mic');
    const inputTranscricao = document.getElementById('input-voz-transcricao');

    speechRecognitionInstance.onstart = function() {
      isVoiceListening = true;
      if (micBtn) {
        micBtn.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
        micBtn.style.borderColor = 'rgba(239, 68, 68, 0.4)';
        micBtn.style.transform = 'scale(1.08)';
      }
      if (micIcon) micIcon.className = 'ph-bold ph-waveform';
      if (statusTxt) {
        statusTxt.innerText = '🔴 Ouvindo... Pode falar o pedido!';
        statusTxt.style.color = '#ef4444';
      }
      try { if (navigator.vibrate) navigator.vibrate(50); } catch (_) {}
    };

    speechRecognitionInstance.onresult = function(event) {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (inputTranscricao && finalTranscript) {
        inputTranscricao.value = finalTranscript.trim();
      }
    };

    speechRecognitionInstance.onerror = function(event) {
      console.warn('Erro SpeechRecognition:', event.error);
      window.pararReconhecimentoVoz();
      if (statusTxt) {
        statusTxt.innerText = 'Microfone pausado. Toque para falar novamente.';
        statusTxt.style.color = '#8b5cf6';
      }
    };

    speechRecognitionInstance.onend = function() {
      window.pararReconhecimentoVoz();
    };

    speechRecognitionInstance.start();
  } catch (err) {
    console.error('Falha ao iniciar SpeechRecognition:', err);
    window.pararReconhecimentoVoz();
  }
};

window.pararReconhecimentoVoz = function() {
  isVoiceListening = false;
  if (speechRecognitionInstance) {
    try { speechRecognitionInstance.stop(); } catch (_) {}
  }
  const micBtn = document.getElementById('btn-garcom-mic-trigger');
  const micIcon = document.getElementById('icone-mic-status');
  const statusTxt = document.getElementById('txt-status-mic');

  if (micBtn) {
    micBtn.style.background = 'linear-gradient(135deg, #8b5cf6, #6d28d9)';
    micBtn.style.borderColor = 'rgba(139,92,246,0.25)';
    micBtn.style.transform = 'scale(1)';
  }
  if (micIcon) micIcon.className = 'ph-bold ph-microphone';
  if (statusTxt) {
    statusTxt.innerText = 'Toque no microfone e fale o pedido';
    statusTxt.style.color = '#8b5cf6';
  }
};

window.processarComandoVozIA = async function() {
  window.pararReconhecimentoVoz();

  const inputTranscricao = document.getElementById('input-voz-transcricao');
  const texto = inputTranscricao ? inputTranscricao.value.trim() : '';

  if (!texto) {
    if (typeof showToast === 'function') showToast('Diga ou digite o comando do pedido primeiro!', '#f59e0b');
    return;
  }

  const btnProcessar = document.getElementById('btn-processar-voz-ia');
  if (btnProcessar) {
    btnProcessar.disabled = true;
    btnProcessar.innerHTML = '<i class="ph-bold ph-spinner ph-spin"></i> <span>Analisando com IA...</span>';
  }

  try {
    const res = await fetch('/api/ia/interpretar-comando-voz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto })
    });
    const data = await res.json();

    if (!data || !data.sucesso) {
      throw new Error(data?.erro || 'Não foi possível interpretar o áudio');
    }

    ultimoResultadoVozIA = data;
    renderizarResultadoVozIA(data);
  } catch (err) {
    console.error('Erro ao interpretar comando de voz:', err);
    if (typeof showToast === 'function') showToast('Erro na IA: ' + err.message, '#ef4444');
  } finally {
    if (btnProcessar) {
      btnProcessar.disabled = false;
      btnProcessar.innerHTML = '<i class="ph-bold ph-sparkle"></i> <span>Interpretar com IA</span>';
    }
  }
};

function renderizarResultadoVozIA(data) {
  const container = document.getElementById('resultado-voz-ia');
  const elMesa = document.getElementById('voz-resultado-mesa');
  const elTotalItens = document.getElementById('voz-resultado-total-itens');
  const listaItens = document.getElementById('voz-resultado-itens-lista');

  if (!container || !listaItens) return;

  const mesaIdentificada = data.mesa ? `Mesa ${data.mesa}` : (typeof currentTable !== 'undefined' && currentTable ? currentTable : 'Balcão');
  elMesa.innerText = mesaIdentificada;

  const itens = data.itens_identificados || [];
  elTotalItens.innerText = `${itens.length} item(ns)`;

  if (itens.length === 0) {
    listaItens.innerHTML = '<div style="color:#b91c1c; font-size:13px; font-weight:600; padding:8px;">Nenhum produto do cardápio reconhecido na fala. Verifique o texto.</div>';
    document.getElementById('btn-confirmar-lancamento-voz').style.display = 'none';
  } else {
    document.getElementById('btn-confirmar-lancamento-voz').style.display = 'flex';
    listaItens.innerHTML = itens.map(item => `
      <div style="display:flex; justify-content:space-between; align-items:center; background:#ffffff; border:1px solid #dcfce7; border-radius:12px; padding:10px 12px; box-shadow:0 1px 4px rgba(0,0,0,0.02);">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="background:#10b981; color:#fff; font-weight:800; font-size:12px; border-radius:8px; padding:2px 7px;">${item.quantidade}x</span>
          <div>
            <strong style="font-size:13.5px; color:#0f172a; display:block;">${item.nome}</strong>
            ${item.observacoes ? `<span style="font-size:11.5px; color:#b45309; background:#fffbeb; padding:1px 6px; border-radius:6px;">Obs: ${item.observacoes}</span>` : ''}
          </div>
        </div>
      </div>
    `).join('');
  }

  container.style.display = 'block';
  container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

window.confirmarLancamentoVozIA = function() {
  if (!ultimoResultadoVozIA || !Array.isArray(ultimoResultadoVozIA.itens_identificados) || ultimoResultadoVozIA.itens_identificados.length === 0) {
    return;
  }

  const mesaDestino = ultimoResultadoVozIA.mesa ? `Mesa ${ultimoResultadoVozIA.mesa}` : (typeof currentTable !== 'undefined' && currentTable ? currentTable : 'Balcão');
  const nomeUsuario = (typeof loggedUser !== 'undefined' && loggedUser && loggedUser.nome) ? loggedUser.nome : 'Garçom IA';

  ultimoResultadoVozIA.itens_identificados.forEach(item => {
    // Tenta casar produto com MENU carregado para pegar setor, emoji e preço oficial
    const prodMatch = (typeof MENU !== 'undefined' && Array.isArray(MENU))
      ? MENU.find(m => m.name.toLowerCase() === item.nome.toLowerCase() || m.name.toLowerCase().includes(item.nome.toLowerCase()))
      : null;

    const precoUnitario = prodMatch ? (prodMatch.price || 0) : 0;
    const setor = prodMatch ? (prodMatch.sector || 'Cozinha') : 'Cozinha';
    const emoji = prodMatch ? (prodMatch.emoji || '🍽️') : '🍽️';

    const emitItem = {
      productName: prodMatch ? prodMatch.name : item.nome,
      productEmoji: emoji,
      sector: setor,
      quantity: item.quantidade || 1,
      observations: item.observacoes || '',
      composicoes: [],
      total: (precoUnitario * (item.quantidade || 1)).toFixed(2).replace('.', ','),
      mesa_comanda: '',
      localName: mesaDestino,
      userName: nomeUsuario,
      status: 'Pendente',
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      createdAt: Date.now()
    };

    if (typeof socket !== 'undefined' && socket) {
      socket.emit('novo_pedido', emitItem);
    }
  });

  try { if (navigator.vibrate) navigator.vibrate([100, 50, 100]); } catch (_) {}
  if (typeof showToast === 'function') {
    showToast(`✓ ${ultimoResultadoVozIA.itens_identificados.length} itens lançados na ${mesaDestino}!`, '#10b981');
  }

  window.fecharModalVozIA();

  // Se o garçom estava na visão de mesas, atualiza e abre a mesa
  if (typeof socket !== 'undefined' && socket) {
    setTimeout(() => {
      socket.emit('get_itens_mesa', mesaDestino);
      socket.emit('get_mesas');
    }, 300);
  }
};



