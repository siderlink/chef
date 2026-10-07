const fs = require('fs');

const manifests = {
  garcom: {
    id: "br.com.chefsync.pwa.garcom",
    name: "Chef Sync — App do Garçom",
    short_name: "Garçom",
    description: "Atendimento de salão, lançamento ágil de pedidos, mesas e comandas digitais.",
    start_url: "/pwa-garcom.html",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui", "window-controls-overlay"],
    background_color: "#0b0f19",
    theme_color: "#f59e0b",
    orientation: "portrait",
    lang: "pt-BR",
    categories: ["business", "food", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: "/icons/icon-256.png", sizes: "256x256", type: "image/png", purpose: "any maskable" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      { src: "/icon.ico", sizes: "64x64 32x32 24x24 16x16", type: "image/x-icon" }
    ],
    shortcuts: [
      { name: "Salão & Mesas", url: "/pwa-garcom.html#mesas", description: "Ver mapa de mesas" },
      { name: "Comandas Digitais", url: "/pwa-garcom.html#comandas", description: "Gerenciar comandas ativas" }
    ]
  },
  cozinha: {
    id: "br.com.chefsync.pwa.cozinha",
    name: "Chef Sync — KDS Cozinha",
    short_name: "KDS Cozinha",
    description: "Sistema KDS de fila de produção, preparo em esteira e expedição para cozinha.",
    start_url: "/pwa-cozinha.html",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui", "window-controls-overlay"],
    background_color: "#0b0f19",
    theme_color: "#ef4444",
    orientation: "any",
    lang: "pt-BR",
    categories: ["business", "food", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: "/icons/icon-256.png", sizes: "256x256", type: "image/png", purpose: "any maskable" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      { src: "/icon.ico", sizes: "64x64 32x32 24x24 16x16", type: "image/x-icon" }
    ],
    shortcuts: [
      { name: "Fila de Preparo", url: "/pwa-cozinha.html#fila", description: "Acompanhar pedidos pendentes" }
    ]
  },
  motoboy: {
    id: "br.com.chefsync.pwa.motoboy",
    name: "Chef Sync — App do Motoboy",
    short_name: "Motoboy",
    description: "Gestão de rotas, despacho de entregas e comprovantes com GPS para entregadores.",
    start_url: "/pwa-motoboy.html",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui", "window-controls-overlay"],
    background_color: "#0b0f19",
    theme_color: "#22c55e",
    orientation: "portrait",
    lang: "pt-BR",
    categories: ["business", "food", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: "/icons/icon-256.png", sizes: "256x256", type: "image/png", purpose: "any maskable" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      { src: "/icon.ico", sizes: "64x64 32x32 24x24 16x16", type: "image/x-icon" }
    ],
    shortcuts: [
      { name: "Minhas Entregas", url: "/pwa-motoboy.html#entregas", description: "Ver lista de entregas" }
    ]
  },
  pdv: {
    id: "br.com.chefsync.pwa.pdv",
    name: "Chef Sync — PDV Mobile",
    short_name: "PDV Mobile",
    description: "Frente de caixa móvel, fechamento ágil de contas, pagamentos e emissão fiscal.",
    start_url: "/pwa-pdv.html",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui", "window-controls-overlay"],
    background_color: "#0b0f19",
    theme_color: "#fc4b15",
    orientation: "portrait",
    lang: "pt-BR",
    categories: ["business", "food", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: "/icons/icon-256.png", sizes: "256x256", type: "image/png", purpose: "any maskable" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      { src: "/icon.ico", sizes: "64x64 32x32 24x24 16x16", type: "image/x-icon" }
    ],
    shortcuts: [
      { name: "Novo Pedido Rápido", url: "/pwa-pdv.html#rapido", description: "Abrir venda no balcão" }
    ]
  },
  gerente: {
    id: "br.com.chefsync.pwa.gerente",
    name: "Chef Sync — Painel Gerencial",
    short_name: "Painel Dono",
    description: "Cockpit executivo, KPIs em tempo real, faturamento, DRE e controle da operação.",
    start_url: "/pwa-gerente.html",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui", "window-controls-overlay"],
    background_color: "#0b0f19",
    theme_color: "#8b5cf6",
    orientation: "any",
    lang: "pt-BR",
    categories: ["business", "food", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: "/icons/icon-256.png", sizes: "256x256", type: "image/png", purpose: "any maskable" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      { src: "/icon.ico", sizes: "64x64 32x32 24x24 16x16", type: "image/x-icon" }
    ],
    shortcuts: [
      { name: "Faturamento Hoje", url: "/pwa-gerente.html#faturamento", description: "Ver métricas financeiras" }
    ]
  },
  central: {
    id: "br.com.chefsync.pwa.central",
    name: "Chef Sync — Central de Apps PWA",
    short_name: "Chef Apps",
    description: "Portal central de instalação e inicialização dos aplicativos móveis Chef Cozinha.",
    start_url: "/central-pwa.html",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui", "window-controls-overlay"],
    background_color: "#0b0f19",
    theme_color: "#3b82f6",
    orientation: "portrait",
    lang: "pt-BR",
    categories: ["business", "food", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: "/icons/icon-256.png", sizes: "256x256", type: "image/png", purpose: "any maskable" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      { src: "/icon.ico", sizes: "64x64 32x32 24x24 16x16", type: "image/x-icon" }
    ]
  }
};

for (const [key, config] of Object.entries(manifests)) {
  const filename = key === 'central' ? 'manifest-central.json' : `manifest-${key}.json`;
  fs.writeFileSync(filename, JSON.stringify(config, null, 2), 'utf8');
  console.log(`Generated: ${filename}`);
}

// Fallback manifest.json (pointing to central or garcom)
fs.writeFileSync('manifest.json', JSON.stringify(manifests.central, null, 2), 'utf8');
console.log('Generated: manifest.json');
