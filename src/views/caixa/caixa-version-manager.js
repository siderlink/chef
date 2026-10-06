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
      'ultra': {
        id: 'ultra',
        name: 'Caixa Ultra 3D',
        desc: '> 6GB RAM',
        badge: 'Studio',
        icon: 'ph-bold ph-lightning',
        iconColor: '#06b6d4',
        url: '/caixa-ultra.html',
        versaoTag: 'ultra'
      },
      'v1.1.1': {
        id: 'v1.1.1',
        name: 'Caixa v1.1.1',
        desc: 'Moderno',
        badge: 'Ativo',
        icon: 'ph-bold ph-check',
        iconColor: '#fc4b15',
        url: '/index.html',
        versaoTag: 'v1.1.1'
      },
      'v1': {
        id: 'v1',
        name: 'Caixa v1',
        desc: 'Clássico',
        badge: 'Estável',
        icon: 'ph ph-clock-counter-clockwise',
        iconColor: '#16a34a',
        url: '/caixa-classico.html',
        versaoTag: 'v1'
      },
      'clean': {
        id: 'clean',
        name: 'Caixa Clean',
        desc: 'Foco e Leveza',
        badge: 'Novo',
        icon: 'ph-bold ph-leaf',
        iconColor: '#8b5cf6',
        url: '/caixa-clean.html',
        versaoTag: 'clean'
      }
    };
  },

  renderDropdown: function(containerId, currentVersionId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const contracted = this.getContractedVersions();
    const all = this.getAllAvailableVersions();

    let html = '';
    contracted.forEach(verId => {
      const ver = all[verId];
      if (!ver) return;

      const isActive = currentVersionId === verId;
      const activeClass = isActive ? 'active' : '';
      const activeBg = isActive ? 'background:rgba(252,75,21,0.08);' : '';
      const fontWeight = isActive ? '700' : '400';

      html += `
        <div class="dropdown-item ${activeClass}" onclick="CaixaVersionManager.switchVersion('${verId}')" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; font-weight:${fontWeight}; ${activeBg}">
          <span><i class="${ver.icon}" style="color:${ver.iconColor}; margin-right:6px;"></i> <strong>${ver.name}</strong> (${ver.desc})</span>
          <span style="font-size:10px; color:${ver.iconColor}; font-weight:700;">${ver.badge}</span>
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
