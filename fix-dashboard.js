const fs = require('fs');

function updateDashboardHTML(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace background and colors in CSS for Glassmorphism & Dark Mode
  if (!content.includes('--dash-bg')) {
    content = content.replace(/<style>/, `<style>
    :root {
      --dash-bg: #0f172a;
      --dash-card: rgba(30, 41, 59, 0.7);
      --dash-text: #f8fafc;
      --dash-text-muted: #94a3b8;
      --dash-border: rgba(255, 255, 255, 0.1);
      --dash-accent: #fc4b15;
    }
    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .dash-card {
      animation: fadeInUp 0.5s ease-out forwards;
      opacity: 0;
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--dash-border);
      background: var(--dash-card) !important;
      color: var(--dash-text) !important;
      transition: transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease;
    }
    .dash-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      border-color: rgba(252, 75, 21, 0.4);
    }
    .dash-val {
      background: linear-gradient(90deg, #fc4b15, #f59e0b);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      font-weight: 900 !important;
    }
    .dash-card h3 {
      color: var(--dash-text-muted) !important;
    }
    body, html, .app-container {
      background: var(--dash-bg) !important;
      color: var(--dash-text) !important;
    }
    aside.sidebar {
      background: #1e293b !important;
      border-right: 1px solid var(--dash-border) !important;
    }
    .sidebar-header h2 { color: var(--dash-text) !important; }
    .nav-item { color: var(--dash-text-muted) !important; }
    .nav-item:hover { background: rgba(255,255,255,0.05) !important; color: var(--dash-text) !important; }
    .nav-item.active { background: rgba(252, 75, 21, 0.15) !important; color: var(--dash-accent) !important; }
    header.topbar { border-bottom: 1px solid var(--dash-border) !important; }
    table { color: var(--dash-text) !important; }
    thead tr { border-bottom: 2px solid var(--dash-border) !important; }
    tbody tr { border-bottom: 1px solid var(--dash-border) !important; }
    tbody tr:hover { background: rgba(255,255,255,0.05); }
    `);

    // Staggered animation delays
    content = content.replace(
      /<div class="dash-grid">/g, 
      (match, offset, str) => {
        // Just adding simple stagger logic via inline script later, or CSS nth-child
        return match;
      }
    );
    
    // add global styles for child stagger
    content = content.replace(/<\/style>/, `
    .dash-card:nth-child(1) { animation-delay: 0.1s; }
    .dash-card:nth-child(2) { animation-delay: 0.2s; }
    .dash-card:nth-child(3) { animation-delay: 0.3s; }
    .dash-card:nth-child(4) { animation-delay: 0.4s; }
    .dash-grid:nth-of-type(2) .dash-card:nth-child(1) { animation-delay: 0.5s; }
    .dash-grid:nth-of-type(2) .dash-card:nth-child(2) { animation-delay: 0.6s; }
    </style>`);
  }
  fs.writeFileSync(filePath, content);
}

function updateDashboardJS(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Fix calculations safely, parseMoneyMobile logic
  if (!content.includes('function parseMoneyDash')) {
    const parseFunction = `
function parseMoneyDash(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  let s = String(val).replace(/R\\$\\s*/gi, '').trim();
  if (s.includes(',')) s = s.replace(/\\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
`;
    content = parseFunction + content;
  }

  // Update chart configs for dark mode and gradients
  content = content.replace(
    /backgroundColor: '#3ab55b',/g,
    `backgroundColor: (context) => {
            const ctx = context.chart.ctx;
            const gradient = ctx.createLinearGradient(0, 0, 0, 400);
            gradient.addColorStop(0, 'rgba(56, 189, 248, 0.8)');
            gradient.addColorStop(1, 'rgba(56, 189, 248, 0.1)');
            return gradient;
          },`
  );
  
  content = content.replace(
    /backgroundColor: '#fd79a8',/g,
    `backgroundColor: (context) => {
            const ctx = context.chart.ctx;
            const gradient = ctx.createLinearGradient(0, 0, 0, 400);
            gradient.addColorStop(0, 'rgba(252, 75, 21, 0.8)');
            gradient.addColorStop(1, 'rgba(252, 75, 21, 0.1)');
            return gradient;
          },`
  );

  content = content.replace(
    /color: '#1e293b'/g,
    `color: '#f8fafc'`
  );
  
  content = content.replace(
    /backgroundColor: \['#3ab55b', '#ef4444'\]/g,
    `backgroundColor: ['#10b981', '#f43f5e']`
  );

  content = content.replace(
    /stats.faturamentoHoje/g,
    `parseMoneyDash(stats.faturamentoHoje)`
  );
  
  content = content.replace(
    /stats.faturamentoMensal/g,
    `parseMoneyDash(stats.faturamentoMensal)`
  );
  
  content = content.replace(
    /stats.ticketMedio/g,
    `parseMoneyDash(stats.ticketMedio)`
  );

  fs.writeFileSync(filePath, content);
}

['dashboard.html', 'public/dashboard.html', 'hub-server/public/dashboard.html'].forEach(p => {
  if (fs.existsSync(p)) {
    updateDashboardHTML(p);
    console.log('Updated ' + p);
  }
});

['dashboard.js', 'public/dashboard.js', 'hub-server/public/dashboard.js'].forEach(p => {
  if (fs.existsSync(p)) {
    updateDashboardJS(p);
    console.log('Updated ' + p);
  }
});
