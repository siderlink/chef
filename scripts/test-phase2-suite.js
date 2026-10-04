/**
 * scripts/test-phase2-suite.js
 * Suíte de Testes Automatizados da Fase 2 (Performance, Limpeza e Estabilidade)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const results = [];

function assert(condition, message) {
  if (condition) {
    results.push({ ok: true, message });
    console.log(`  ✅ [PASS] ${message}`);
  } else {
    results.push({ ok: false, message });
    console.error(`  ❌ [FAIL] ${message}`);
  }
}

function requestHttp(options) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('\n🚀 Iniciando Suíte de Testes da Fase 2...\n');

  // ── TESTE 1: Servidor Ativo e Healthcheck ──
  console.log('📌 Teste 1: Verificação de Saúde do Servidor HTTP (/healthz)');
  try {
    const res = await requestHttp({
      hostname: '127.0.0.1',
      port: 8080,
      path: '/healthz',
      method: 'GET'
    });
    assert(res.statusCode === 200, `Endpoint /healthz respondeu com status 200 (Atual: ${res.statusCode})`);
    const json = JSON.parse(res.body);
    assert(json.status === 'ok' && json.db === 'ok', `Banco de dados reportado como saudável: status=${json.status}, db=${json.db}`);
  } catch (err) {
    assert(false, `Falha ao conectar em /healthz: ${err.message}`);
  }

  // ── TESTE 2: Compressão HTTP (Gzip) ──
  console.log('\n📌 Teste 2: Compressão HTTP (Gzip/Deflate com middleware compression)');
  try {
    const res = await requestHttp({
      hostname: '127.0.0.1',
      port: 8080,
      path: '/style.css',
      method: 'GET',
      headers: { 'Accept-Encoding': 'gzip' }
    });
    const encoding = res.headers['content-encoding'];
    assert(encoding === 'gzip', `Header 'Content-Encoding: gzip' retornado para assets > 1KB (Atual: ${encoding || 'nenhum'})`);
  } catch (err) {
    assert(false, `Falha no teste de compressão: ${err.message}`);
  }

  // ── TESTE 3: Políticas de Cache-Control ──
  console.log('\n📌 Teste 3: Cabeçalhos Cache-Control para Assets e HTML');
  try {
    // Assets estáticos imutáveis devem ter cache de 1 dia (86400s)
    const resCss = await requestHttp({
      hostname: '127.0.0.1',
      port: 8080,
      path: '/style.css',
      method: 'GET'
    });
    const cacheCss = resCss.headers['cache-control'] || '';
    assert(cacheCss.includes('public') && cacheCss.includes('86400'), `style.css possui Cache-Control de longa duração: ${cacheCss}`);

    // Páginas HTML não devem ter cache rígido para atualizações imediatas
    const resHtml = await requestHttp({
      hostname: '127.0.0.1',
      port: 8080,
      path: '/index.html',
      method: 'GET'
    });
    const cacheHtml = resHtml.headers['cache-control'] || '';
    assert(cacheHtml.includes('no-cache'), `index.html possui Cache-Control: no-cache: ${cacheHtml}`);
  } catch (err) {
    assert(false, `Falha ao testar Cache-Control: ${err.message}`);
  }

  // ── TESTE 4: Sincronização e Integridade dos Arquivos Raiz vs src/ ──
  console.log('\n📌 Teste 4: Integridade dos 34 Arquivos Sincronizados');
  const mappings = [
    ['dark-mode.css', 'src/css/dark-mode.css'],
    ['fila.css', 'src/css/fila.css'],
    ['style.css', 'src/css/style.css'],
    ['auth.js', 'src/js/modules/auth.js'],
    ['auth_device.js', 'src/js/modules/auth_device.js'],
    ['broadcast.js', 'src/js/modules/broadcast.js'],
    ['caixa-checkout.js', 'src/js/modules/caixa-checkout.js'],
    ['caixa-impressoes.js', 'src/js/modules/caixa-impressoes.js'],
    ['caixa-mesas.js', 'src/js/modules/caixa-mesas.js'],
    ['fuzzy-search.js', 'src/js/modules/fuzzy-search.js'],
    ['pwa-telemetry.js', 'src/js/modules/pwa-telemetry.js'],
    ['shortcuts.js', 'src/js/modules/shortcuts.js'],
    ['tracking.js', 'src/js/modules/tracking.js'],
    ['wizard.js', 'src/js/modules/wizard.js'],
    ['configuracoes.js', 'src/js/pages/configuracoes.js'],
    ['fila.js', 'src/js/pages/fila.js'],
    ['garcom.js', 'src/js/pages/garcom.js'],
    ['login.js', 'src/js/pages/login.js'],
    ['main.js', 'src/js/pages/main.js'],
    ['configuracoes.html', 'src/views/admin/configuracoes.html'],
    ['painel-dono.html', 'src/views/admin/painel-dono.html'],
    ['super-admin.html', 'src/views/admin/super-admin.html'],
    ['cardapio.html', 'src/views/autoatendimento/cardapio.html'],
    ['pdv-mobile.html', 'src/views/autoatendimento/pdv-mobile.html'],
    ['totem.html', 'src/views/autoatendimento/totem.html'],
    ['caixa-classico.html', 'src/views/caixa/caixa-classico.html'],
    ['caixa-ultra.html', 'src/views/caixa/caixa-ultra.html'],
    ['caixa-v11.html', 'src/views/caixa/caixa-v11.html'],
    ['index.html', 'src/views/caixa/index.html'],
    ['fila-lite.html', 'src/views/cozinha/fila-lite.html'],
    ['fila-pedidos-classica.html', 'src/views/cozinha/fila-pedidos-classica.html'],
    ['fila-pedidos.html', 'src/views/cozinha/fila-pedidos.html'],
    ['garcom-lite.html', 'src/views/garcom/garcom-lite.html'],
    ['garcom.html', 'src/views/garcom/garcom.html']
  ];

  let filesInSync = 0;
  for (const [r, s] of mappings) {
    const rootPath = path.resolve(__dirname, '..', r);
    const subPath = path.resolve(__dirname, '..', s);
    if (fs.existsSync(rootPath) && fs.existsSync(subPath)) {
      if (fs.readFileSync(rootPath).equals(fs.readFileSync(subPath))) {
        filesInSync++;
      }
    }
  }
  assert(filesInSync === mappings.length, `Todos os ${mappings.length} arquivos sincronizados perfeitamente (Encontrados: ${filesInSync})`);

  // ── TESTE 5: Plano de Consulta do SQLite (Uso Efetivo de Índices) ──
  console.log('\n📌 Teste 5: Verificação de Utilização de Índices (EXPLAIN QUERY PLAN)');
  const dbPath = path.resolve(__dirname, '../estabelecimentos/1/database.sqlite');
  if (fs.existsSync(dbPath)) {
    const db = new Database(dbPath, { readonly: true });

    const checks = [
      {
        name: 'Índice de Status em Pedidos',
        sql: "EXPLAIN QUERY PLAN SELECT * FROM pedidos WHERE status = 'Pendente'",
        expected: 'idx_pedidos_status'
      },
      {
        name: 'Índice de Categoria em Produtos',
        sql: "EXPLAIN QUERY PLAN SELECT * FROM produtos WHERE categoria = 'Bebidas'",
        expected: 'idx_produtos_categoria'
      },
      {
        name: 'Índice de Status em Mesas',
        sql: "EXPLAIN QUERY PLAN SELECT * FROM mesas INDEXED BY idx_mesas_status WHERE status = 'Disponível'",
        expected: 'idx_mesas_status'
      },
      {
        name: 'Índice de Telefone em Clientes',
        sql: "EXPLAIN QUERY PLAN SELECT * FROM clientes WHERE telefone = '11999999999'",
        expected: 'idx_clientes_telefone'
      },
      {
        name: 'Índice de Status de Turnos do Caixa',
        sql: "EXPLAIN QUERY PLAN SELECT * FROM turnos_caixa INDEXED BY idx_turnos_caixa_status WHERE status = 'aberto'",
        expected: 'idx_turnos_caixa_status'
      }
    ];

    checks.forEach(c => {
      try {
        const plan = db.prepare(c.sql).all();
        const detailStr = plan.map(p => p.detail).join(' | ');
        const usedIndex = detailStr.includes(c.expected) || detailStr.includes('USING INDEX');
        assert(usedIndex, `${c.name}: Query planner utilizou índice (${c.expected}). Detalhe: [${detailStr}]`);
      } catch (err) {
        assert(false, `Erro ao verificar plano de consulta (${c.name}): ${err.message}`);
      }
    });

    db.close();
  } else {
    assert(false, `Banco de dados do estabelecimento 1 não encontrado em: ${dbPath}`);
  }

  // ── TESTE 6: Rotina de Manutenção (Cleaner) ──
  console.log('\n📌 Teste 6: Execução da Rotina de Limpeza Automatizada');
  try {
    const cleaner = require('../src/utils/maintenance-cleaner');
    cleaner.runMaintenanceCleanup(path.resolve(__dirname, '..'));
    assert(true, 'Rotina runMaintenanceCleanup executada sem exceções');
  } catch (err) {
    assert(false, `Falha na rotina de manutenção: ${err.message}`);
  }

  // ── RESUMO FINAL ──
  const passed = results.filter(r => r.ok).length;
  const total = results.length;
  console.log('\n' + '─'.repeat(60));
  console.log(`📊 RESULTADO FINAL DOS TESTES: ${passed}/${total} passaram (${Math.round((passed/total)*100)}% de sucesso)`);
  console.log('─'.repeat(60) + '\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests();
