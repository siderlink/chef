const fs = require('fs');

function updateFile(filePath) {
  let s = fs.readFileSync(filePath, 'utf8');

  // 1. Add scrollLeft listener in initResizableSidebars
  const searchInit = 'if (!workspace || !leftPanel || !rightPanel) return;';
  const replaceInit = 'if (!workspace || !leftPanel || !rightPanel) return;\r\n\r\n    if (mainPanel) {\r\n      mainPanel.scrollLeft = 0;\r\n      mainPanel.addEventListener("scroll", function () {\r\n        if (mainPanel.scrollLeft !== 0) mainPanel.scrollLeft = 0;\r\n      }, { passive: false });\r\n    }';
  if (!s.includes('mainPanel.scrollLeft = 0')) {
    s = s.replace(searchInit, replaceInit);
  }

  // 2. Replace chefApplySidebarMode logic
  const startTarget = '    const desktop = window.innerWidth >= 768;';
  const endTarget = "    if (floatRestore) floatRestore.style.display = (desktop && mode === 'hidden') ? 'flex' : 'none';";

  const newLogic = `    if (mode === 'hidden') {
      panel.style.setProperty('display', 'none', 'important');
      panel.style.width = '0px';
      panel.style.minWidth = '0px';
      panel.style.maxWidth = '0px';
      if (floatRestore) floatRestore.style.display = 'flex';
    } else if (mode === 'mini') {
      panel.style.removeProperty('display');
      panel.style.display = 'flex';
      const w = right ? '190px' : '58px';
      panel.style.setProperty('width', w, 'important');
      panel.style.setProperty('min-width', right ? '170px' : '58px', 'important');
      panel.style.setProperty('max-width', right ? '240px' : '58px', 'important');
      panel.style.flexShrink = right ? '1' : '0';
      document.documentElement.style.setProperty('--' + side + '-sidebar-width', w);
      if (floatRestore) floatRestore.style.display = 'none';
    } else {
      panel.style.removeProperty('display');
      panel.style.display = 'flex';
      if (right) {
        const stored = localStorage.getItem('chef_sidebar_right_width');
        const num = parseInt(stored, 10);
        const w = (num && num >= 190) ? num + 'px' : '260px';
        panel.style.width = w;
        panel.style.minWidth = '190px';
        panel.style.maxWidth = '340px';
        panel.style.flexShrink = '1';
        document.documentElement.style.setProperty('--right-sidebar-width', w);
        document.documentElement.style.setProperty('--right-expanded-width', w);
      } else {
        const stored = localStorage.getItem('chef_sidebar_left_width');
        const num = parseInt(stored, 10);
        const w = (num && num >= 180) ? num + 'px' : '220px';
        panel.style.width = w;
        panel.style.minWidth = '180px';
        panel.style.maxWidth = '300px';
        panel.style.flexShrink = '0';
        document.documentElement.style.setProperty('--left-sidebar-width', w);
        document.documentElement.style.setProperty('--left-expanded-width', w);
      }
      if (floatRestore) floatRestore.style.display = 'none';
    }

    const mainPanel = document.querySelector('.main-workspace, #main-panel');
    if (mainPanel && mainPanel.scrollLeft !== 0) {
      mainPanel.scrollLeft = 0;
    }`;

  const idxStart = s.indexOf(startTarget);
  const idxEnd = s.indexOf(endTarget);
  if (idxStart !== -1 && idxEnd !== -1) {
    s = s.substring(0, idxStart) + newLogic + s.substring(idxEnd + endTarget.length);
    fs.writeFileSync(filePath, s, 'utf8');
    console.log('Successfully updated:', filePath);
  } else {
    console.log('Markers not found in:', filePath, idxStart, idxEnd);
  }
}

updateFile('chef-resizable-sidebars.js');
if (fs.existsSync('public/chef-resizable-sidebars.js')) {
  updateFile('public/chef-resizable-sidebars.js');
}
