const fs = require('fs');

const files = ['caixa-classico.html', 'src/views/caixa/caixa-classico.html'];

files.forEach(f => {
  if (!fs.existsSync(f)) return;
  let s = fs.readFileSync(f, 'utf8');
  
  // Replace button inside caixa-version-switcher-wrapper
  const regex = /<div class="dropdown-wrapper" id="caixa-version-switcher-wrapper"[^>]*>[\s\S]*?<\/div>\s*<\/div>/;
  const newSnippet = `<div class="dropdown-wrapper" id="caixa-version-switcher-wrapper" style="position:relative;">
        <button type="button" class="menu-trigger caixa-version-badge" id="btn-toggle-caixa-version" data-dropdown="drop-caixa-version" data-current-version="v1" onclick="window.CaixaVersionManager && window.CaixaVersionManager.toggleDropdown(event, 'drop-caixa-version', 'v1')" title="Alternar versão do Caixa" style="display:inline-flex; align-items:center; gap:5px; background:rgba(37,99,235,0.12); border:1px solid rgba(37,99,235,0.3); color:#2563eb; padding:3px 8px; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer;">
          <i class="ph-bold ph-tag"></i> Caixa v1 (Clássico) <i class="ph ph-caret-down" style="font-size:10px;"></i>
        </button>
        <div class="dropdown-menu" id="drop-caixa-version" style="min-width: 260px; right:0; left:auto; z-index:9000;">
          <!-- Content dynamically rendered by CaixaVersionManager -->
        </div>
      </div>`;

  s = s.replace(regex, newSnippet);
  fs.writeFileSync(f, s, 'utf8');
  console.log('Successfully updated ' + f);
});
