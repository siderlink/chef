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
      'main.js', 'auth.js', 'fuzzy-search.js'
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
    ...(!isCodespaces ? [basicSsl()] : []),
    legacy({
      targets: ['iOS >= 9']
    })
  ],
  server: {
    host: true,
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
    rollupOptions: {
      input: {
        main: fs.existsSync(resolve(__dirname, 'src/views/caixa/index.html')) ? resolve(__dirname, 'src/views/caixa/index.html') : resolve(__dirname, 'index.html'),
        garcom: fs.existsSync(resolve(__dirname, 'src/views/garcom/garcom.html')) ? resolve(__dirname, 'src/views/garcom/garcom.html') : resolve(__dirname, 'garcom.html'),
        fila: fs.existsSync(resolve(__dirname, 'src/views/cozinha/fila-pedidos.html')) ? resolve(__dirname, 'src/views/cozinha/fila-pedidos.html') : resolve(__dirname, 'fila-pedidos.html'),
        'fila-classica': fs.existsSync(resolve(__dirname, 'src/views/cozinha/fila-pedidos-classica.html')) ? resolve(__dirname, 'src/views/cozinha/fila-pedidos-classica.html') : resolve(__dirname, 'fila-pedidos-classica.html'),
        financeiro: resolve(__dirname, 'financeiro.html'),
        cadastro: resolve(__dirname, 'cadastro.html'),
        'super-admin': fs.existsSync(resolve(__dirname, 'src/views/admin/super-admin.html')) ? resolve(__dirname, 'src/views/admin/super-admin.html') : resolve(__dirname, 'super-admin.html'),
        ativacao: resolve(__dirname, 'ativacao.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
        configuracoes: fs.existsSync(resolve(__dirname, 'src/views/admin/configuracoes.html')) ? resolve(__dirname, 'src/views/admin/configuracoes.html') : resolve(__dirname, 'configuracoes.html'),
        'painel-funcionario': resolve(__dirname, 'painel-funcionario.html'),
        'site-vendas': resolve(__dirname, 'site-vendas.html'),
        cardapio: fs.existsSync(resolve(__dirname, 'src/views/autoatendimento/cardapio.html')) ? resolve(__dirname, 'src/views/autoatendimento/cardapio.html') : resolve(__dirname, 'cardapio.html'),
        login: resolve(__dirname, 'login.html'),
        'pdv-mobile': fs.existsSync(resolve(__dirname, 'src/views/autoatendimento/pdv-mobile.html')) ? resolve(__dirname, 'src/views/autoatendimento/pdv-mobile.html') : resolve(__dirname, 'pdv-mobile.html'),
        'area-cliente': resolve(__dirname, 'area-cliente.html'),
        'fila-lite': fs.existsSync(resolve(__dirname, 'src/views/cozinha/fila-lite.html')) ? resolve(__dirname, 'src/views/cozinha/fila-lite.html') : resolve(__dirname, 'fila-lite.html'),
        'garcom-lite': fs.existsSync(resolve(__dirname, 'src/views/garcom/garcom-lite.html')) ? resolve(__dirname, 'src/views/garcom/garcom-lite.html') : resolve(__dirname, 'garcom-lite.html'),
        'conta-cliente': resolve(__dirname, 'conta-cliente.html'),
        registro: resolve(__dirname, 'registro.html'),
        suporte: resolve(__dirname, 'suporte.html'),
        'painel-dono': fs.existsSync(resolve(__dirname, 'src/views/admin/painel-dono.html')) ? resolve(__dirname, 'src/views/admin/painel-dono.html') : resolve(__dirname, 'painel-dono.html'),
        totem: fs.existsSync(resolve(__dirname, 'src/views/autoatendimento/totem.html')) ? resolve(__dirname, 'src/views/autoatendimento/totem.html') : resolve(__dirname, 'totem.html'),
        'hub-delivery': resolve(__dirname, 'hub-delivery.html')
      }
    }
  }
});
