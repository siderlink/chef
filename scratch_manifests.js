const fs = require('fs');

const apps = {
  garcom: { name: "App do Garçom", short_name: "Garçom", color: "#f59e0b" },
  cozinha: { name: "KDS Cozinha", short_name: "Cozinha", color: "#ef4444" },
  motoboy: { name: "App do Motoboy", short_name: "Motoboy", color: "#22c55e" },
  pdv: { name: "PDV Mobile", short_name: "Caixa", color: "#3b82f6" },
  gerente: { name: "Painel Gerencial", short_name: "Painel Dono", color: "#8b5cf6" }
};

for (const [id, data] of Object.entries(apps)) {
  const manifest = {
    name: data.name,
    short_name: data.short_name,
    start_url: `/pwa-loader.html?app=${id}`,
    display: "standalone",
    background_color: "#0f172a",
    theme_color: data.color,
    orientation: "portrait",
    icons: [
      {
        src: "/icon.ico",
        sizes: "192x192 512x512",
        type: "image/x-icon"
      }
    ]
  };
  fs.writeFileSync(`manifest-${id}.json`, JSON.stringify(manifest, null, 2));
}

console.log('Manifests created!');
