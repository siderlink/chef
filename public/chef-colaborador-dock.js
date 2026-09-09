/**
 * Chef Cozinha - Dock Global da Área do Colaborador & Troca Rápida de Estação
 */
(function() {
  function renderDock() {
    // Não renderizar botão flutuante no app Garçom ou telas mobile compactas para não cobrir a barra inferior
    const isGarcomPage = window.location.pathname.includes('garcom') || window.location.pathname.includes('garcom-lite');
    if (isGarcomPage || window.innerWidth <= 768) {
      return;
    }

    const credsRaw = localStorage.getItem('chef_credentials');
    let creds = {};
    try { creds = JSON.parse(credsRaw || '{}'); } catch(e) {}
    const nome = creds.nome || creds.usuario || localStorage.getItem('usuario_logado') || 'Colaborador';
    const cargo = creds.cargo || creds.role || localStorage.getItem('colaborador_cargo') || 'Operador';

    if (document.getElementById('chef-colab-global-dock-btn')) return;

    const dockBtn = document.createElement('button');
    dockBtn.id = 'chef-colab-global-dock-btn';
    const isLight = document.documentElement.getAttribute('data-theme') === 'light' || document.body.classList.contains('theme-light') || (!document.body.classList.contains('dark-mode') && !document.body.classList.contains('theme-dark'));
    dockBtn.style.cssText = 'position:fixed; bottom:18px; right:18px; z-index:9999; display:flex; align-items:center; gap:8px; padding:8px 14px; border-radius:30px; font-size:12.5px; font-weight:700; cursor:pointer; backdrop-filter:blur(8px); transition:transform 0.15s, background 0.15s;' + (isLight ? 'background:#ffffff; color:#0f172a; border:1.5px solid #cbd5e1; box-shadow:0 8px 24px rgba(0,0,0,0.12);' : 'background:#0f172a; color:#ffffff; border:1.5px solid rgba(255,255,255,0.15); box-shadow:0 8px 24px rgba(0,0,0,0.3);');
    dockBtn.innerHTML = '<span style="width:24px; height:24px; border-radius:50%; background:#fc4b15; color:#fff; display:flex; align-items:center; justify-content:center; font-size:13px;"><i class="ph-bold ph-user"></i></span> <span style="' + (isLight ? 'color:#0f172a;' : 'color:#ffffff;') + '">' + nome.split(' ')[0] + ' (' + cargo + ')</span>';

    dockBtn.onclick = window.abrirAreaColaboradorModal;
    document.body.appendChild(dockBtn);
  }

  window.abrirAreaColaboradorModal = function() {
    let modal = document.getElementById('modal-area-colaborador-global');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-area-colaborador-global';
      modal.style.cssText = 'position:fixed; inset:0; z-index:10001; background:rgba(15,23,42,0.65); backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; padding:16px;';
      document.body.appendChild(modal);
    }

    const credsRaw = localStorage.getItem('chef_credentials');
    let creds = {};
    try { creds = JSON.parse(credsRaw || '{}'); } catch(e) {}
    const nome = creds.nome || creds.usuario || localStorage.getItem('usuario_logado') || 'Colaborador';
    const cargo = creds.cargo || creds.role || localStorage.getItem('colaborador_cargo') || 'Operador';
    let estacoes = creds.estacoes || [];
    try {
      const rawEst = localStorage.getItem('chef_permissoes_estacoes');
      if (rawEst) estacoes = Array.from(new Set([...estacoes, ...JSON.parse(rawEst)]));
    } catch(e){}

    const estacoesLinks = [
      { id: 'garcom', nome: 'Salão de Mesas & Comandas', url: '/garcom.html', icone: 'ph-fork-knife', cor: '#fc4b15' },
      { id: 'caixa', nome: 'Terminal de Caixa (PDV)', url: '/index.html', icone: 'ph-desktop', cor: '#3b82f6' },
      { id: 'cozinha', nome: 'KDS Cozinha & Preparo', url: '/fila-pedidos.html', icone: 'ph-fire', cor: '#10b981' }
    ];

    let estacoesHtml = '';
    estacoesLinks.forEach(e => {
      const temPermissao = estacoes.includes(e.id) || ['gerente', 'admin', 'dono'].includes(cargo.toLowerCase());
      if (temPermissao) {
        estacoesHtml += '<button onclick="window.location.href=\'' + e.url + '\'" style="display:flex; align-items:center; gap:12px; width:100%; padding:12px 14px; background:#f8fafc; border:1.5px solid #e2e8f0; border-radius:12px; cursor:pointer; font-weight:700; font-size:13.5px; color:#0f172a; margin-bottom:8px;">' +
          '<i class="ph-bold ' + e.icone + '" style="color:' + e.cor + '; font-size:20px;"></i> <span>' + e.nome + '</span> <i class="ph-bold ph-arrow-right" style="margin-left:auto; color:#94a3b8;"></i>' +
          '</button>';
      }
    });

    modal.innerHTML = `
      <div style="background:#ffffff; border-radius:24px; padding:24px; width:100%; max-width:440px; box-shadow:0 20px 50px rgba(0,0,0,0.25); text-align:center;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <div style="text-align:left;">
            <h3 style="margin:0; font-size:18px; font-weight:800; color:#0f172a;">Área do Colaborador</h3>
            <span style="font-size:12.5px; color:#64748b;">${nome} • Cargo: <strong>${cargo}</strong></span>
          </div>
          <button onclick="document.getElementById('modal-area-colaborador-global').style.display='none'" style="background:#f1f5f9; border:none; width:32px; height:32px; border-radius:50%; cursor:pointer; font-size:16px;">&times;</button>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:16px;">
          <a href="/painel-funcionario.html" style="padding:12px; background:rgba(252,75,21,0.08); border:1.5px solid rgba(252,75,21,0.2); border-radius:14px; color:#fc4b15; text-decoration:none; font-weight:800; font-size:12.5px; display:flex; flex-direction:column; align-items:center; gap:6px;">
            <i class="ph-bold ph-clock-user" style="font-size:24px;"></i>
            <span>Bater Ponto</span>
          </a>
          <a href="/painel-funcionario.html#vendas" style="padding:12px; background:rgba(37,99,235,0.08); border:1.5px solid rgba(37,99,235,0.2); border-radius:14px; color:#2563eb; text-decoration:none; font-weight:800; font-size:12.5px; display:flex; flex-direction:column; align-items:center; gap:6px;">
            <i class="ph-bold ph-receipt" style="font-size:24px;"></i>
            <span>Minhas Vendas</span>
          </a>
        </div>

        <div style="text-align:left; border-top:1px solid #e2e8f0; padding-top:14px; margin-top:10px;">
          <label style="font-size:12px; font-weight:800; color:#64748b; text-transform:uppercase; margin-bottom:8px; display:block;">Estações Autorizadas para você</label>
          ${estacoesHtml || '<p style="font-size:13px; color:#94a3b8;">Apenas sua estação atual está autorizada pelo gerente.</p>'}
        </div>

        <button onclick="localStorage.clear(); window.location.href='/login.html';" style="margin-top:14px; width:100%; padding:12px; background:#fef2f2; color:#dc2626; border:1px solid #fecaca; border-radius:12px; font-weight:800; font-size:13px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
          <i class="ph-bold ph-sign-out"></i> Encerrar Sessão no Terminal
        </button>
      </div>
    `;
    modal.style.display = 'flex';
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderDock);
  } else {
    renderDock();
  }
})();
