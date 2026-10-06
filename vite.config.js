import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';
import basicSsl from '@vitejs/plugin-basic-ssl';
import legacy from '@vitejs/plugin-legacy';

// Plugin: copia arquivos CSS/JS estáticos da raiz para dist/ após o build
const copyRootStatics = () => ({
  name: 'copy-root-statics',
  closeBundle() {
    const files = [
      'style.css', 'fila.css', 'dark-mode.css', 'broadcast.js',
      'main.js', 'auth.js', 'fuzzy-search.js',
      'device-adapters.css', 'device-adapters.js'
    ];
    for (const f of files) {
      let src = resolve(__dirname, f);
      if (!fs.existsSync(src)) {
        if (f.endsWith('.css') && fs.existsSync(resolve(__dirname, 'src', 'css', f))) {
          src = resolve(__dirname, 'src', 'css', f);
        } else if (fs.existsSync(resolve(__dirname, 'src', 'js', 'pages', f))) {
          src = resolve(__dirname, 'src', 'js', 'pages', f);
        } else if (fs.existsSync(resolve(__dirname, 'src', 'js', 'modules', f))) {
          src = resolve(__dirname, 'src', 'js', 'modules', f);
        }
      }
      const dest = resolve(__dirname, 'dist', f);
      if (fs.existsSync(src)) fs.copyFileSync(src, dest);
    }
  }
});

const BACKEND_PORT = (() => {
  try {
    const p = fs.readFileSync(resolve(__dirname, 'port.txt'), 'utf8').trim();
    const n = parseInt(p, 10);
    if (!Number.isNaN(n)) return n;
  } catch (e) {}
  return 8080;
})();

const injectPolyfills = () => {
  return {
    name: 'inject-polyfills',
    transformIndexHtml(html) {
      return html.replace(
        '</head>',
        `  <script src="/legacy-deps/fetch.umd.min.js?v=2"></script>
</head>`
      );
    }
  }
}

const isCodespaces = process.env.CODESPACES === 'true';

const extensionlessHtml = () => {
  return {
    name: 'extensionless-html',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url.startsWith('/api') || req.url.startsWith('/socket.io')) return next();
        const urlObj = new URL(req.url, 'http://localhost');
        let pathname = urlObj.pathname;
        if (!pathname.includes('.') && pathname.length > 1) {
          const htmlName = pathname.substring(1) + '.html';
          if (fs.existsSync(resolve(__dirname, htmlName)) || fs.existsSync(resolve(__dirname, 'public', htmlName))) {
            req.url = pathname + '.html' + urlObj.search;
          }
        }
        next();
      });
    }
  };
};


export default defineConfig({
  resolve: {
    alias: {
      '@views': resolve(__dirname, 'src/views'),
      '@js': resolve(__dirname, 'src/js'),
      '@css': resolve(__dirname, 'src/css'),
      '@modules': resolve(__dirname, 'src/js/modules')
    }
  },
  plugins: [
    copyRootStatics(),
    injectPolyfills(),
    extensionlessHtml(),
    ...(process.env.VITE_SSL === 'true' ? [basicSsl()] : []),
    legacy({
      targets: ['chrome >= 49', 'firefox >= 52']
    })
  ],
  server: {
    host: true,
    watch: {
      ignored: [
        '**/*.TMP',
        '**/*.tmp',
        '**/*.exe',
        '**/*.sqlite*',
        '**/installer/**',
        '**/.git/**',
        '**/dist/**',
        '**/dist.full/**',
        '**/CSC*.TMP',
        '**/scratch/**',
        '**/.system_generated/**',
        '**/chrome-profile/**'
      ]
    },
    proxy: {
      '/socket.io': {
        target: `http://127.0.0.1:${BACKEND_PORT}`,
        ws: true,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            // Ignorar erros silenciosos de reconexão de socket / ECONNRESET quando o servidor reinicia
          });
          proxy.on('proxyReqWs', (proxyReq, req, socket) => {
            socket.on('error', (err) => {
              // Ignorar erros de socket ws isolados
            });
          });
        }
      },
      '/api': {
        target: `http://127.0.0.1:${BACKEND_PORT}`,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            if (res && !res.headersSent && typeof res.writeHead === 'function') {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Servidor backend indisponível ou reiniciando' }));
            }
          });
        }
      }
    }
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        garcom: resolve(__dirname, 'garcom.html'),
        fila: resolve(__dirname, 'fila-pedidos.html'),
        'fila-classica': resolve(__dirname, 'fila-pedidos-classica.html'),
        financeiro: resolve(__dirname, 'financeiro.html'),
        cadastro: resolve(__dirname, 'cadastro.html'),
        'super-admin': resolve(__dirname, 'super-admin.html'),
        ativacao: resolve(__dirname, 'ativacao.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
        configuracoes: resolve(__dirname, 'configuracoes.html'),
        'painel-funcionario': resolve(__dirname, 'painel-funcionario.html'),
        'site-vendas': resolve(__dirname, 'site-vendas.html'),
        cardapio: resolve(__dirname, 'cardapio.html'),
        login: resolve(__dirname, 'login.html'),
        'pdv-mobile': resolve(__dirname, 'pdv-mobile.html'),
        'area-cliente': resolve(__dirname, 'area-cliente.html'),
        'fila-lite': resolve(__dirname, 'fila-lite.html'),
        'garcom-lite': resolve(__dirname, 'garcom-lite.html'),
        'conta-cliente': resolve(__dirname, 'conta-cliente.html'),
        registro: resolve(__dirname, 'registro.html'),
        suporte: resolve(__dirname, 'suporte.html'),
        'painel-dono': resolve(__dirname, 'painel-dono.html'),
        totem: resolve(__dirname, 'totem.html'),
        'hub-delivery': resolve(__dirname, 'hub-delivery.html'),
        'caixa-ultra': resolve(__dirname, 'caixa-ultra.html'),
        'pagina-de-vendas-2': resolve(__dirname, 'pagina-de-vendas-2.html'),
        'pagina-vendas-2': resolve(__dirname, 'pagina-vendas-2.html'),
        'pagina-vendas-3': resolve(__dirname, 'pagina-vendas-3.html'),
        'pagina-vendas-3d': resolve(__dirname, 'pagina-vendas-3d.html'),
        'site-vendas-nichos': resolve(__dirname, 'site-vendas-nichos.html'),
        'vendas-nichos': resolve(__dirname, 'vendas-nichos.html'),
        'hub-marketing': resolve(__dirname, 'hub-marketing.html'),
        'universidade': resolve(__dirname, 'universidade.html'),
        'kds-v2': resolve(__dirname, 'kds-v2.html'),
        'kds-nano': resolve(__dirname, 'kds-nano.html'),
        'caixa-v11-lite': resolve(__dirname, 'caixa-v11-lite.html'),
        'pwa-colaborador': resolve(__dirname, 'pwa-colaborador.html'),
        'radar-antifraude': resolve(__dirname, 'radar-antifraude.html'),
        'painel-senhas-tv': resolve(__dirname, 'painel-senhas-tv.html'),
        'mapa-mesas-3d': resolve(__dirname, 'mapa-mesas-3d.html'),
        'compras-b2b': resolve(__dirname, 'compras-b2b.html'),
        'roleta-premiada': resolve(__dirname, 'roleta-premiada.html'),
        'pwa-motoboy': resolve(__dirname, 'pwa-motoboy.html'),
        'painel-crm': resolve(__dirname, 'painel-crm.html'),
        'expedicao': resolve(__dirname, 'expedicao.html'),
        'esteira-kanban': resolve(__dirname, 'esteira-kanban.html'),
        'cfo-virtual': resolve(__dirname, 'cfo-virtual.html'),
        'tablet-mesa': resolve(__dirname, 'tablet-mesa.html'),
        'host-fila-espera': resolve(__dirname, 'host-fila-espera.html'),
        'totem-kiosk': resolve(__dirname, 'totem-kiosk.html')
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('xlsx')) return 'vendor-xlsx';
            if (id.includes('socket.io-client')) return 'vendor-socket';
            return 'vendor-libs';
          }
        }
      }
    }
  }
});
