const fs = require('fs');
let c = fs.readFileSync('painel-dono.html', 'utf8');

const kpiStyles = `
  <style>
    /* ── WOW FACTOR: AIRPLANE DASHBOARD & DYNAMIC KPIS ── */
    @keyframes pulse-glow {
      0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
      70% { box-shadow: 0 0 0 10px rgba(34, 197, 94, 0); }
      100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
    }
    @keyframes sweep {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(200%); }
    }
    .kpi-card {
      position: relative;
      overflow: hidden;
      transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.3s;
      border: 1px solid rgba(255, 255, 255, 0.05);
      background: linear-gradient(145deg, var(--card) 0%, rgba(18, 25, 39, 0.8) 100%);
    }
    .kpi-card::after {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.03), transparent);
      transform: translateX(-100%);
      animation: sweep 6s infinite;
      pointer-events: none;
    }
    .kpi-card:hover {
      transform: translateY(-4px) scale(1.02);
      box-shadow: 0 12px 30px rgba(0,0,0,0.4);
      border-color: rgba(255, 255, 255, 0.15);
      z-index: 10;
    }
    .kpi-card.full .kpi-value {
      font-size: 54px !important;
      text-shadow: 0 0 20px currentColor;
    }
    .kpi-card .kpi-value {
      font-size: 38px;
      letter-spacing: -1px;
    }
    .progress-fill {
      position: relative;
      overflow: hidden;
    }
    .progress-fill::after {
      content: "";
      position: absolute;
      top: 0; left: 0; bottom: 0; right: 0;
      background: linear-gradient(90deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.5) 50%, rgba(255,255,255,0.1) 100%);
      animation: sweep 2s infinite linear;
    }
    .kpi-icon {
      animation: pulse-dot 3s infinite;
    }
    /* Chart BG effect for Lucro Líquido */
    #kpi-lucro-liquido {
      position: relative;
      z-index: 2;
    }
    .kpi-card.full[style*="rgba(59,130,246,0.3)"]::before {
      content: "";
      position: absolute;
      bottom: 0; left: 0; right: 0; height: 60px;
      background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 20" preserveAspectRatio="none"><path d="M0,20 L0,10 Q20,15 40,5 T80,8 T100,2 L100,20 Z" fill="rgba(59,130,246,0.1)"/></svg>') no-repeat bottom;
      background-size: 100% 100%;
      z-index: 1;
      opacity: 0.6;
    }
  </style>
</head>`;

c = c.replace('</head>', kpiStyles);
fs.writeFileSync('painel-dono.html', c);
console.log('CSS injected successfully!');
