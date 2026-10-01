import re

with open('painel-dono.html', 'r', encoding='utf-8') as f:
    html = f.read()

accessibility_css = """
    /* --- 60+ Accessibility & Space Optimization --- */
    .kpi-card { padding: 24px 20px !important; min-height: 120px !important; justify-content: center !important; }
    .kpi-value { font-size: clamp(28px, 8vw, 42px) !important; font-weight: 900 !important; margin: 8px 0 !important; }
    .kpi-label { font-size: 15px !important; font-weight: 700 !important; letter-spacing: 0.5px !important; }
    .kpi-sub { font-size: 14px !important; font-weight: 600 !important; opacity: 0.9 !important; }
    
    .remote-btn { padding: 18px 16px !important; min-height: 100px !important; gap: 8px !important; }
    .remote-btn .rb-label { font-size: 16px !important; font-weight: 800 !important; }
    .remote-btn .rb-sub { font-size: 14px !important; opacity: 0.8 !important; }
    
    .colab-action-btn { padding: 18px 14px !important; font-size: 15px !important; font-weight: 700 !important; }
    
    /* Make the grid auto-flow nicely to prevent squishing on any device */
    .kpi-grid { 
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)) !important; 
      gap: 16px !important; 
    }
    .remote-grid { 
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)) !important; 
      gap: 14px !important; 
    }
    
    @media (max-width: 600px) {
       /* Full width cards on mobile for maximum legibility */
       .kpi-grid { grid-template-columns: 1fr !important; }
       .remote-grid { grid-template-columns: 1fr 1fr !important; }
       .remote-btn { padding: 14px 12px !important; min-height: 90px !important; }
       .kpi-card { padding: 20px 16px !important; min-height: 110px !important; }
    }
    /* ---------------------------------------------- */
"""

# Inject before </style>
html = html.replace('</style>', accessibility_css + '\n</style>', 1)

with open('painel-dono.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("Accessibility CSS injected!")
