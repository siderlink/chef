const fs = require('fs');

function updateFinanceiroHTML(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Fix hardcoded styles that break dark mode
  content = content.replace(/background:\s*white;/g, 'background: var(--fin-card);');
  content = content.replace(/border:\s*1px\s*solid\s*#eee;/g, 'border: 1px solid var(--fin-border);');
  content = content.replace(/border-bottom:\s*1px\s*solid\s*#eee;/g, 'border-bottom: 1px solid var(--fin-border);');
  content = content.replace(/color:\s*#333;/g, 'color: var(--fin-text);');
  content = content.replace(/color:\s*gray;/g, 'color: var(--fin-text-muted);');
  content = content.replace(/color:\s*#666;/g, 'color: var(--fin-text-muted);');
  content = content.replace(/color:\s*#777;/g, 'color: var(--fin-text-muted);');
  content = content.replace(/background:\s*#f1f5f9;/g, 'background: rgba(255, 255, 255, 0.05);');

  // Add the CSS required for the dark theme and glassmorphism if not already there
  if (!content.includes('backdrop-filter: blur(16px)')) {
    content = content.replace(/<style>/, `<style>
    :root, [data-theme="light"], [data-theme="dark"] {
      --fin-bg: #0f172a;
      --fin-card: rgba(30, 41, 59, 0.7);
      --fin-text: #f8fafc;
      --fin-text-muted: #94a3b8;
      --fin-border: rgba(255, 255, 255, 0.1);
    }
    
    body, html, .app-container {
      background: var(--fin-bg) !important;
      color: var(--fin-text) !important;
    }
    aside.sidebar {
      background: #1e293b !important;
      border-right: 1px solid var(--fin-border) !important;
    }
    .sidebar-header h2 { color: var(--fin-text) !important; }
    .nav-item { color: var(--fin-text-muted) !important; }
    .nav-item:hover { background: rgba(255,255,255,0.05) !important; color: var(--fin-text) !important; }
    .nav-item.active { background: rgba(252, 75, 21, 0.15) !important; color: #fc4b15 !important; }
    
    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    #section-resumo-caixa > div:nth-child(2) > div,
    #section-relatorio-avancado .dash-card {
      animation: fadeInUp 0.5s ease-out forwards;
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      box-shadow: 0 4px 20px rgba(0,0,0,0.3) !important;
      border-color: var(--fin-border) !important;
      background: var(--fin-card) !important;
      color: var(--fin-text) !important;
      transition: transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease;
    }
    #section-resumo-caixa > div:nth-child(2) > div:hover {
      transform: translateY(-5px);
      box-shadow: 0 10px 30px rgba(0,0,0,0.5) !important;
      border-color: rgba(252, 75, 21, 0.4) !important;
    }
    table { color: var(--fin-text) !important; }
    thead th { border-bottom: 2px solid var(--fin-border) !important; color: var(--fin-text-muted) !important; }
    tbody tr { border-bottom: 1px solid var(--fin-border) !important; }
    tbody tr:hover { background: rgba(255,255,255,0.05) !important; }
    
    /* Make text neon glow in KPI */
    #card-faturado {
      background: linear-gradient(90deg, #fc4b15, #f59e0b);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      font-weight: 900 !important;
    }
    `);
  }
  
  // Also adjust specific light color backgrounds used for the PIX/Debit cards
  content = content.replace(/background:\s*#f0fdf4;/g, 'background: rgba(34, 197, 94, 0.1) !important;'); // Pix
  content = content.replace(/border:\s*1px\s*solid\s*#bbf7d0;/g, 'border: 1px solid rgba(34, 197, 94, 0.3) !important;');
  
  content = content.replace(/background:\s*#eff6ff;/g, 'background: rgba(59, 130, 246, 0.1) !important;'); // Debit
  content = content.replace(/border:\s*1px\s*solid\s*#bfdbfe;/g, 'border: 1px solid rgba(59, 130, 246, 0.3) !important;');
  
  content = content.replace(/background:\s*#f5f3ff;/g, 'background: rgba(139, 92, 246, 0.1) !important;'); // Credit
  content = content.replace(/border:\s*1px\s*solid\s*#ddd6fe;/g, 'border: 1px solid rgba(139, 92, 246, 0.3) !important;');

  content = content.replace(/color:\s*#166534;/g, 'color: #4ade80;'); // Light green text for dark mode
  content = content.replace(/color:\s*#15803d;/g, 'color: #22c55e;');
  content = content.replace(/color:\s*#1e40af;/g, 'color: #60a5fa;'); // Light blue text
  content = content.replace(/color:\s*#1d4ed8;/g, 'color: #3b82f6;');
  content = content.replace(/color:\s*#5b21b6;/g, 'color: #a78bfa;'); // Light purple text
  content = content.replace(/color:\s*#6d28d9;/g, 'color: #8b5cf6;');

  fs.writeFileSync(filePath, content);
}

['financeiro.html', 'public/financeiro.html', 'hub-server/public/financeiro.html'].forEach(p => {
  if (fs.existsSync(p)) {
    updateFinanceiroHTML(p);
    console.log('Updated ' + p);
  }
});
