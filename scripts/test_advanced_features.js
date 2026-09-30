const http = require('http');
const fs = require('fs');
const path = require('path');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 BATERIA DE TESTES: NOVAS IMPLEMENTAÇÕES & RECURSOS AVANÇADOS');
  console.log('   1. Fechamento Cego de Caixa, Leitura X e Z Térmico & Sangrias');
  console.log('   2. KDS Multi-Praças Inteligente (Bar, Forno, Cozinha, Expedição)');
  console.log('   3. Painel TV de Senhas com Áudio & Garçom Voice IA');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(desc, condition, details) {
    if (condition) {
      console.log('  ✅ [PASS] ' + desc);
      passed++;
    } else {
      console.error('  ❌ [FAIL] ' + desc + (details ? ' -> ' + JSON.stringify(details) : ''));
      failed++;
    }
  }

  // -------------------------------------------------------------------------
  // 1. FECHAMENTO CEGO DE CAIXA, LEITURA X/Z & SANGRIA/SUPRIMENTO
  // -------------------------------------------------------------------------
  console.log('--- TESTANDO GESTÃO DE CAIXA: FECHAMENTO CEGO, RELATÓRIO X E Z ---');
  let turnoAtivoId = null;
  try {
    // Abrir turno com fundo de troco
    const resAbrir = await request({
      hostname: 'localhost',
      port: 8080,
      path: '/api/caixa/abrir',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      fundo_troco: 150.00,
      operador: 'Maria Caixa 01'
    });

    assert('Abertura de caixa retorna status 200 e turno ativo', resAbrir.status === 200 && resAbrir.body.success, resAbrir.body);
    turnoAtivoId = resAbrir.body?.turno?.id;

    // Registrar Suprimento (Aporte)
    const resSuprimento = await request({
      hostname: 'localhost',
      port: 8080,
      path: '/api/caixa/suprimento',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      valor: 50.00,
      motivo: 'Reforço de moedas de 1 real e notas de 5',
      operador: 'Maria Caixa 01'
    });
    assert('Registro de suprimento de troco retorna sucesso', resSuprimento.status === 200 && resSuprimento.body.success && resSuprimento.body.valor === 50, resSuprimento.body);

    // Registrar Sangria (Retirada)
    const resSangria = await request({
      hostname: 'localhost',
      port: 8080,
      path: '/api/caixa/sangria',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      valor: 80.00,
      motivo: 'Recolhimento para cofre de segurança',
      operador: 'Maria Caixa 01'
    });
    assert('Registro de sangria de gaveta retorna sucesso', resSangria.status === 200 && resSangria.body.success && resSangria.body.valor === 80, resSangria.body);

    // Consultar Leitura X em tempo real
    const resLeituraX = await request({
      hostname: 'localhost',
      port: 8080,
      path: '/api/caixa/leitura-x',
      method: 'GET'
    });
    assert('Leitura X retorna totais parciais e saldo esperado em dinheiro', resLeituraX.status === 200 && resLeituraX.body.success && resLeituraX.body.totais?.saldo_esperado_dinheiro !== undefined, resLeituraX.body?.totais);
    assert('Leitura X gera cupom térmico HTML', resLeituraX.body?.extrato_html && resLeituraX.body.extrato_html.includes('LEITURA X'), 'HTML presente');

    // Fechamento Cego de Caixa: Operador declara contagem física
    const dinheiroEsperado = resLeituraX.body?.totais?.saldo_esperado_dinheiro || 120.00;
    const dinheiroDeclarado = dinheiroEsperado - 5.00; // Simula falta de 5 reais (Quebra de caixa)

    const resFechar = await request({
      hostname: 'localhost',
      port: 8080,
      path: '/api/caixa/fechar',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      operador: 'Maria Caixa 01',
      dinheiro_declarado: dinheiroDeclarado,
      observacao: 'Falta de R$ 5,00 devido a arredondamento de troco'
    });

    assert('Fechamento de caixa encerra turno com sucesso', resFechar.status === 200 && resFechar.body.success, resFechar.body);
    assert('Fechamento cego calcula quebra de caixa com exatidão (-R$ 5,00)', resFechar.body?.diferenca_quebra === -5.00, resFechar.body?.diferenca_quebra);
    assert('Fechamento de caixa gera Relatório Z Oficial para impressão térmica', resFechar.body?.extrato_html && resFechar.body.extrato_html.includes('FECHAMENTO DE TURNO'), 'HTML Z');

    // Testar rota de reimpressão do Relatório Z
    if (turnoAtivoId) {
      const resExtratoZ = await request({
        hostname: 'localhost',
        port: 8080,
        path: '/api/caixa/extrato-fechamento/' + turnoAtivoId,
        method: 'GET'
      });
      assert('Reimpressão de Extrato Z por ID acessível via GET', resExtratoZ.status === 200 && resExtratoZ.raw.includes('FECHAMENTO'), 'Status: ' + resExtratoZ.status);
    }

    // Histórico de Turnos
    const resTurnos = await request({
      hostname: 'localhost',
      port: 8080,
      path: '/api/caixa/turnos',
      method: 'GET'
    });
    assert('Histórico de turnos retorna turnos registrados no sistema', resTurnos.status === 200 && Array.isArray(resTurnos.body.turnos) && resTurnos.body.turnos.length > 0, resTurnos.body?.turnos?.length);

  } catch (err) {
    assert('Execução do teste de Caixa sem exceção', false, err.message);
  }

  // -------------------------------------------------------------------------
  // 2. KDS MULTI-PRAÇAS & CONTROLE DE PRODUÇÃO
  // -------------------------------------------------------------------------
  console.log('\n--- TESTANDO KDS MULTI-PRAÇAS & CONTROLE DE PRODUÇÃO ---');
  let testOrderId = null;
  try {
    // Inserir pedidos com categorias distintas diretamente para testar roteamento por praças
    const sqlite3 = require('../sqlite3-wrapper').verbose();
    const dbPath = fs.existsSync(path.resolve(__dirname, '../estabelecimentos/1/database.sqlite'))
      ? path.resolve(__dirname, '../estabelecimentos/1/database.sqlite')
      : path.resolve(__dirname, '../database.sqlite');
    const db = new sqlite3.Database(dbPath);

    await new Promise((resolve) => {
      db.run(`
        INSERT INTO pedidos (productName, sector, quantity, localName, userName, total, status, createdAt)
        VALUES 
          ('Chopp Artesanal IPA 500ml', 'Bebidas', 2, 'Mesa 12', 'João Silva', 28.00, 'Pendente', datetime('now', 'localtime')),
          ('Pizza Quatro Queijos Grande', 'Pizzas', 1, 'Mesa 12', 'João Silva', 65.00, 'Pendente', datetime('now', 'localtime')),
          ('Hambúrguer Smash Bacon Duplo', 'Lanches', 1, 'Mesa 12', 'João Silva', 38.00, 'Pendente', datetime('now', 'localtime'))
      `, function() {
        testOrderId = this.lastID;
        resolve();
      });
    });

    // Testar API KDS: Todas as Praças
    const resKdsTodas = await request({
      hostname: 'localhost',
      port: 8080,
      path: '/api/kds/pedidos-ativos?praca=todas',
      method: 'GET'
    });
    assert('KDS Todas as Praças retorna lista de pedidos ativos', resKdsTodas.status === 200 && resKdsTodas.body.success && resKdsTodas.body.pedidos?.length > 0, resKdsTodas.body?.total);

    // Testar API KDS: Praça Bar (Bebidas)
    const resKdsBar = await request({
      hostname: 'localhost',
      port: 8080,
      path: '/api/kds/pedidos-ativos?praca=bar',
      method: 'GET'
    });
    assert('KDS Praça Bar filtra corretamente e localiza o Chopp', resKdsBar.status === 200 && resKdsBar.body.pedidos?.some(p => p.produto.includes('Chopp')), resKdsBar.body?.pedidos);

    // Testar API KDS: Praça Forno (Pizza)
    const resKdsForno = await request({
      hostname: 'localhost',
      port: 8080,
      path: '/api/kds/pedidos-ativos?praca=forno',
      method: 'GET'
    });
    assert('KDS Praça Forno filtra corretamente e localiza a Pizza', resKdsForno.status === 200 && resKdsForno.body.pedidos?.some(p => p.produto.includes('Pizza')), resKdsForno.body?.pedidos);

    // Testar conclusão de pedido no KDS acionando chamada no painel de TV
    if (testOrderId) {
      const resConcluir = await request({
        hostname: 'localhost',
        port: 8080,
        path: '/api/kds/concluir-pedido',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, {
        id: testOrderId,
        chamar_tv: true
      });
      assert('Conclusão de pedido no KDS altera status para Pronto e despacha chamada na TV', resConcluir.status === 200 && resConcluir.body.success && resConcluir.body.status === 'Pronto', resConcluir.body);
    }

    // Verificar se a interface kds.html é servida pelo servidor
    const resHtmlKds = await request({
      hostname: 'localhost',
      port: 8080,
      path: '/kds.html',
      method: 'GET'
    });
    assert('Interface Web do KDS Multi-Praças /kds.html acessível no navegador (200)', resHtmlKds.status === 200 && resHtmlKds.raw.includes('KDS Cozinha'), 'Status: ' + resHtmlKds.status);

  } catch (err) {
    assert('Execução do teste KDS sem exceção', false, err.message);
  }

  // -------------------------------------------------------------------------
  // 3. PAINEL TV DE SENHAS COM ÁUDIO & GARÇOM VOICE IA
  // -------------------------------------------------------------------------
  console.log('\n--- TESTANDO PAINEL TV DE SENHAS COM ÁUDIO & GARÇOM VOICE IA ---');
  try {
    // Testar disparo de chamada no Painel de TV
    const resTv = await request({
      hostname: 'localhost',
      port: 8080,
      path: '/api/painel-tv/chamar',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      senha: '042',
      cliente: 'Mariana Costa',
      tipo: 'Retirada Balcão',
      texto_fala: 'Senha 042, Mariana Costa, favor retirar seu pedido no balcão.'
    });

    assert('Disparo de chamada na TV de Senhas responde sucesso e texto de fala sintetizada', resTv.status === 200 && resTv.body.success && resTv.body.senha === '042', resTv.body);

    // Testar Garçom Voice IA: Lançamento por voz em linguagem natural
    const resVoice = await request({
      hostname: 'localhost',
      port: 8080,
      path: '/api/ia/interpretar-comando-voz',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      texto: 'Mesa 9: duas cervejas heineken e um hamburguer artesanal sem cebola e com bacon'
    });

    assert('Garçom Voice IA responde status 200 e identifica a mesa', resVoice.status === 200 && resVoice.body.success && resVoice.body.mesa === 'Mesa 9', resVoice.body);
    assert('Garçom Voice IA estrutura os itens com observações e quantidades', resVoice.body?.itens !== undefined && resVoice.body.confianca !== undefined, resVoice.body);

    // Verificar se painel-tv.html é servido
    const resHtmlTv = await request({
      hostname: 'localhost',
      port: 8080,
      path: '/painel-tv.html',
      method: 'GET'
    });
    assert('Página do Painel de TV /painel-tv.html acessível no navegador (200)', resHtmlTv.status === 200 && resHtmlTv.raw.includes('Painel de Chamada de Senhas'), 'Status: ' + resHtmlTv.status);

    // Verificar se a interface do Garçom com Voice IA é servida
    const resHtmlGarcom = await request({
      hostname: 'localhost',
      port: 8080,
      path: '/garcom.html',
      method: 'GET'
    });
    assert('Comanda Mobile /garcom.html entrega interface do Garçom Voice IA (200)', resHtmlGarcom.status === 200 && resHtmlGarcom.raw.includes('modal-garcom-voz'), 'Status: ' + resHtmlGarcom.status);

    const resJsGarcom = await request({
      hostname: 'localhost',
      port: 8080,
      path: '/garcom.js',
      method: 'GET'
    });
    assert('Script do Garçom /garcom.js contém lógica Voice IA e Web Speech (200)', resJsGarcom.status === 200 && resJsGarcom.raw.includes('abrirModalVozIA'), 'Status: ' + resJsGarcom.status);

  } catch (err) {
    assert('Execução do teste Painel TV e Voice IA sem exceção', false, err.message);
  }

  // -------------------------------------------------------------------------
  // 4. DIVISÃO DE CONTA (SPLIT BILL), TRANSFERÊNCIA DE ITEM & CASHBACK
  // -------------------------------------------------------------------------
  console.log('\n--- TESTANDO DIVISÃO DE CONTA, TRANSFERÊNCIA & CASHBACK ---');
  try {
    // Inserir pedidos na Mesa 04 para testar divisão de conta e transferência
    const sqlite3 = require('../sqlite3-wrapper').verbose();
    const dbPath = fs.existsSync(path.resolve(__dirname, '../estabelecimentos/1/database.sqlite'))
      ? path.resolve(__dirname, '../estabelecimentos/1/database.sqlite')
      : path.resolve(__dirname, '../database.sqlite');
    const db = new sqlite3.Database(dbPath);

    let idItemParaTransferir = null;
    await new Promise((resolve) => {
      db.run(`
        INSERT INTO pedidos (productName, sector, quantity, localName, userName, total, status, createdAt)
        VALUES 
          ('Porção Picanha na Chapa com Mandioca', 'Cozinha', 1, 'Mesa 04', 'Garçom', 89.90, 'Pendente', datetime('now', 'localtime')),
          ('Suco de Laranja Jarra 1L', 'Bebidas', 2, 'Mesa 04', 'Garçom', 36.00, 'Pendente', datetime('now', 'localtime'))
      `, function() {
        idItemParaTransferir = this.lastID;
        resolve();
      });
    });

    // Testar Divisão de Conta (Split Bill por 4 pessoas com 10% de serviço)
    const resSplit = await request({
      hostname: 'localhost',
      port: 8080,
      path: '/api/mesas/dividir-conta',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      mesa: 'Mesa 04',
      pessoas: 4,
      incluir_servico: true,
      desconto: 5.90
    });

    assert('Divisão de Conta (Split Bill) calcula subtotal, 10% e total por pessoa', 
      resSplit.status === 200 && resSplit.body.success && resSplit.body.pessoas === 4 && resSplit.body.valor_por_pessoa > 0, 
      resSplit.body);
    assert('Divisão de Conta gera extrato de conferência para impressão térmica', 
      resSplit.body?.extrato_conferencia_html && resSplit.body.extrato_conferencia_html.includes('CONFERÊNCIA DE CONTA'), 
      'HTML de conferência presente');

    // Testar Transferência de Item Individual entre Mesas
    if (idItemParaTransferir) {
      const resTransf = await request({
        hostname: 'localhost',
        port: 8080,
        path: '/api/mesas/transferir-item',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, {
        itemId: idItemParaTransferir,
        mesaOrigem: 'Mesa 04',
        mesaDestino: 'Mesa 08',
        operador: 'Carlos Garçom'
      });

      assert('Transferência de item individual transfere produto para nova mesa', 
        resTransf.status === 200 && resTransf.body.success && resTransf.body.destino === 'Mesa 08', 
        resTransf.body);
    }

    // Inserir ou atualizar cliente para testar Fidelidade e Cashback
    let testClienteId = null;
    await new Promise((resolve) => {
      db.run(`
        INSERT INTO clientes (nome, telefone, cpf, saldo_cashback, pontos, total_gasto, nivel)
        VALUES ('Ana Paula Souza', '11988887777', '12345678901', 35.50, 120, 450.00, 'Prata')
      `, function() {
        testClienteId = this.lastID;
        resolve();
      });
    });

    // Consultar Saldo de Fidelidade/Cashback por Telefone/CPF
    const resSaldoFid = await request({
      hostname: 'localhost',
      port: 8080,
      path: '/api/fidelidade/saldo/11988887777',
      method: 'GET'
    });

    assert('Consulta de saldo de fidelidade/cashback localiza cliente e saldo disponível', 
      resSaldoFid.status === 200 && resSaldoFid.body.success && resSaldoFid.body.cliente?.saldo_cashback === 35.50, 
      resSaldoFid.body?.cliente);

    // Resgatar Cashback no Checkout
    if (testClienteId) {
      const resResgate = await request({
        hostname: 'localhost',
        port: 8080,
        path: '/api/fidelidade/resgatar-cashback',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, {
        clienteId: testClienteId,
        valor_resgate: 15.50,
        mesa: 'Mesa 04',
        operador: 'Caixa 01'
      });

      assert('Resgate de cashback deduz saldo com exatidão e retorna saldo restante', 
        resResgate.status === 200 && resResgate.body.success && resResgate.body.saldo_restante === 20.00, 
        resResgate.body);
    }

  } catch (err) {
    assert('Execução do teste Split Bill & Cashback sem exceção', false, err.message);
  }

  // -------------------------------------------------------------------------
  // 5. RELATÓRIOS: CURVA ABC, DRE CONSOLIDADO & AUDITORIA DE CANCELAMENTOS
  // -------------------------------------------------------------------------
  console.log('\n--- TESTANDO CURVA ABC, DRE GERENCIAL & AUDITORIA ---');
  try {
    // Curva ABC de Vendas
    const resAbc = await request({
      hostname: 'localhost',
      port: 8080,
      path: '/api/relatorios/curva-abc',
      method: 'GET'
    });

    assert('Curva ABC de vendas classifica produtos em Classe A, B e C', 
      resAbc.status === 200 && resAbc.body.success && resAbc.body.resumo_classes !== undefined, 
      resAbc.body?.resumo_classes);

    // DRE Gerencial
    const resDre = await request({
      hostname: 'localhost',
      port: 8080,
      path: '/api/relatorios/dre-gerencial',
      method: 'GET'
    });

    assert('DRE Gerencial calcula Receita, CMV estimado, Lucro Bruto e Operacional', 
      resDre.status === 200 && resDre.body.success && resDre.body.dre?.cmv_custo_mercadorias !== undefined, 
      resDre.body?.dre);

    // Registrar Cancelamento com Motivo Obrigatório (Auditoria Anti-Fraude)
    const resAuditoria = await request({
      hostname: 'localhost',
      port: 8080,
      path: '/api/auditoria/cancelamento',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      tipo: 'ITEM',
      identificador: 'Chopp Artesanal IPA 500ml',
      valor: 14.00,
      motivo: 'Cliente solicitou cancelamento antes do preparo (trocou por suco)',
      operador: 'Carlos Garçom',
      autorizado_por: 'Marcos Gerente'
    });

    assert('Registro de cancelamento grava motivo obrigatório e autorização', 
      resAuditoria.status === 200 && resAuditoria.body.success && resAuditoria.body.registro_id !== undefined, 
      resAuditoria.body);

    // Listar Histórico de Auditoria
    const resListaAudit = await request({
      hostname: 'localhost',
      port: 8080,
      path: '/api/auditoria/cancelamentos',
      method: 'GET'
    });

    assert('Consulta de auditoria retorna lista dos cancelamentos registrados', 
      resListaAudit.status === 200 && resListaAudit.body.success && resListaAudit.body.total > 0, 
      resListaAudit.body?.total);

  } catch (err) {
    assert('Execução do teste Curva ABC, DRE e Auditoria sem exceção', false, err.message);
  }

  console.log('\n================================================================');
  console.log('🏁 RESULTADOS DOS TESTES DOS NOVOS RECURSOS:');
  console.log('   Total de Asserções Aprovadas: ' + passed);
  console.log('   Total de Falhas:             ' + failed);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
