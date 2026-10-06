window.CaixaVersionManager = {
  getContractedVersions: function() {
    try {
      const stored = localStorage.getItem('chef_contracted_caixa_versions');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch(e) {}
    return ['v1.1.1', 'v1', 'ultra', 'clean'];
  },

  setContractedVersions: function(versionsArray) {
    localStorage.setItem('chef_contracted_caixa_versions', JSON.stringify(versionsArray));
  },

  getAllAvailableVersions: function() {
    return {
      'v1.1.1': {
        id: 'v1.1.1',
        name: 'Caixa v1.1.1',
        desc: 'Interface Moderna & Fluida',
        badge: 'Recomendado',
        icon: 'ph-bold ph-sparkle',
        iconColor: '#fc4b15',
        url: '/index.html',
        versaoTag: 'v1.1.1'
      },
      'v1': {
        id: 'v1',
        name: 'Caixa v1 (Clássico)',
        desc: 'Layout Tradicional Estável',
        badge: 'Clássico',
        icon: 'ph ph-clock-counter-clockwise',
        iconColor: '#2563eb',
        url: '/caixa-classico.html',
        versaoTag: 'v1'
      },
      'clean': {
        id: 'clean',
        name: 'Caixa Clean',
        desc: 'Foco, Leveza e Rapidez',
        badge: 'Leve',
        icon: 'ph-bold ph-leaf',
        iconColor: '#8b5cf6',
        url: '/caixa-clean.html',
        versaoTag: 'clean'
      },
      'ultra': {
        id: 'ultra',
        name: 'Caixa Ultra 3D',
        desc: 'Visual Avançado (>6GB RAM)',
        badge: 'Studio',
        icon: 'ph-bold ph-lightning',
        iconColor: '#06b6d4',
        url: '/caixa-ultra.html',
        versaoTag: 'ultra'
      }
    };
  },

  toggleDropdown: function(e, containerId, currentVersionId) {
    if (e) {
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
      if (typeof e.preventDefault === 'function') e.preventDefault();
    }
    const targetId = containerId || 'drop-caixa-version';
    const menu = document.getElementById(targetId);
    if (!menu) return;
    const wrapper = menu.closest('.dropdown-wrapper') || menu.parentElement;
    const isCurrentlyOpen = menu.classList.contains('show');

    // Fecha todos os outros dropdowns
    document.querySelectorAll('.dropdown-menu').forEach(m => {
      if (m !== menu) m.classList.remove('show');
    });
    document.querySelectorAll('.dropdown-wrapper').forEach(w => {
      if (w !== wrapper) w.classList.remove('open');
    });

    if (!isCurrentlyOpen) {
      this.renderDropdown(targetId, currentVersionId || 'v1.1.1');
      menu.classList.add('show');
      if (wrapper) wrapper.classList.add('open');
    } else {
      menu.classList.remove('show');
      if (wrapper) wrapper.classList.remove('open');
    }
  },

  renderDropdown: function(containerId, currentVersionId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const contracted = this.getContractedVersions();
    const all = this.getAllAvailableVersions();

    let html = `
      <div style="padding: 6px 10px 8px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-secondary, #64748b); border-bottom: 1px solid var(--border-color, rgba(0,0,0,0.08)); margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center;">
        <span>Alternar Layout do Caixa</span>
        <span style="font-size: 10px; opacity: 0.8; font-weight: 600;">1-Clique</span>
      </div>
    `;

    contracted.forEach(verId => {
      const ver = all[verId];
      if (!ver) return;

      const isActive = currentVersionId === verId;
      const activeClass = isActive ? 'active' : '';
      const activeBorder = isActive ? `border-left: 3px solid ${ver.iconColor}; background: ${ver.iconColor}14; font-weight: 700;` : 'border-left: 3px solid transparent;';
      const checkMark = isActive ? `<i class="ph-bold ph-check" style="color: ${ver.iconColor}; margin-left: 6px; font-size: 13px;"></i>` : '';

      html += `
        <div class="dropdown-item ${activeClass}" onclick="CaixaVersionManager.switchVersion('${verId}')" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; padding: 7px 10px; border-radius: 6px; margin: 2px 0; ${activeBorder} transition: all 0.15s ease;">
          <div style="display:flex; align-items:center; gap:8px;">
            <div style="width: 26px; height: 26px; border-radius: 6px; background: ${ver.iconColor}18; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              <i class="${ver.icon}" style="color:${ver.iconColor}; font-size: 15px;"></i>
            </div>
            <div style="text-align: left;">
              <div style="font-size: 12.5px; color: var(--text-primary, #1e293b);">${ver.name} ${checkMark}</div>
              <div style="font-size: 10.5px; color: var(--text-secondary, #64748b);">${ver.desc}</div>
            </div>
          </div>
          <span style="font-size: 10px; color: ${ver.iconColor}; font-weight: 800; background: ${ver.iconColor}18; padding: 2px 6px; border-radius: 4px; margin-left: 8px;">${ver.badge}</span>
        </div>
      `;
    });

    container.innerHTML = html;
  },

  switchVersion: function(versionId) {
    const ver = this.getAllAvailableVersions()[versionId];
    if (ver) {
      localStorage.setItem('chef_caixa_versao', ver.versaoTag);
      if (versionId === 'v1') {
        localStorage.setItem('chef_caixa_tema', 'classico');
      }
      location.href = ver.url;
    }
  }
};
