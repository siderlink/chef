const http = require('http');

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
  console.log('🧪 INICIANDO BATERIA DE TESTES: PILARES 1, 2 E 3 NO CHEFF COZINHA');
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
  // PILLAR 1: SAT FISCAL SP (CF-e-SAT Modelo 59)
  // -------------------------------------------------------------------------
  console.log('--- TESTANDO PILAR 1: SAT FISCAL SP (CF-e-SAT MODELO 59) ---');
  let chaveSatEmitida = null;
  try {
    const resEmitir = await request({
      hostname: 'localhost',
      port: 8080,
      path: '/api/fiscal/sat/emitir',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      restaurante_id: 1,
      pedido_id: 101,
      cpf_destinatario: '12345678901',
      valor_total: 89.90,
      forma_pagamento: 'cartao_credito',
      itens: [
        { cProd: '001', xProd: 'Hambúrguer Gourmet Artesanal', ncm: '21069090', cfop: '5102', uCom: 'UN', qCom: 2, vUnCom: 35.00, vProd: 70.00 },
        { cProd: '002', xProd: 'Refrigerante Lata 350ml', ncm: '22021000', cfop: '5102', uCom: 'UN', qCom: 2, vUnCom: 9.95, vProd: 19.90 }
      ]
    });

    assert('Emissão CF-e-SAT retorna status 200 e success=true', resEmitir.status === 200 && resEmitir.body.success, resEmitir.body);
    assert('CF-e-SAT gerou Chave SP de 44 dígitos iniciando com 35 (UF SP)', resEmitir.body?.chave && resEmitir.body.chave.length === 44 && resEmitir.body.chave.startsWith('35'), resEmitir.body?.chave);
    assert('CF-e-SAT gerou XML Modelo 59 com layout 0.08', resEmitir.body?.xml && resEmitir.body.xml.includes('versaoDadosEnt="0.08"'), resEmitir.body?.xml?.substring(0, 100));
    assert('CF-e-SAT gerou Extrato Térmico HTML com QR Code SEFAZ', resEmitir.body?.extrato_html && resEmitir.body.extrato_html.includes('qrcode'), 'HTML presente');
    chaveSatEmitida = resEmitir.body?.chave;

    if (chaveSatEmitida) {
      const resExtrato = await request({
        hostname: 'localhost',
        port: 8080,
        path: '/api/fiscal/sat/extrato/' + chaveSatEmitida,
        method: 'GET'
      });
      assert('Extrato Térmico acessível via GET /api/fiscal/sat/extrato/:chave', resExtrato.status === 200 && resExtrato.raw.includes('Extrato No.'), 'Status: ' + resExtrato.status);

      const resListar = await request({
        hostname: 'localhost',
        port: 8080,
        path: '/api/fiscal/sat/cupons?restaurante_id=1',
        method: 'GET'
      });
      assert('Lista de CF-e-SAT emitida retorna cupom gravado no banco', resListar.status === 200 && Array.isArray(resListar.body.cupons) && resListar.body.cupons.some(c => c.chave === chaveSatEmitida), resListar.body?.cupons?.length);

      const resCanc = await request({
        hostname: 'localhost',
        port: 8080,
        path: '/api/fiscal/sat/cancelar',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, {
        chave: chaveSatEmitida,
        motivo: 'Cancelamento por desistência do cliente dentro de 30min'
      });
      assert('Cancelamento do CF-e-SAT realizado com sucesso', resCanc.status === 200 && resCanc.body.success && resCanc.body.status === 'CANCELADO', resCanc.body);
    }
  } catch (err) {
    assert('Execução do teste SAT Fiscal SP sem exceção', false, err.message);
  }

  // -------------------------------------------------------------------------
  // PILLAR 2: IMPORTADOR XML COMPRAS & DF-e SEFAZ
  // -------------------------------------------------------------------------
  console.log('\n--- TESTANDO PILAR 2: IMPORTADOR XML COMPRAS & DF-e SEFAZ ---');
  try {
    const randNF = Math.floor(100000 + Math.random() * 900000);
    const mockNFeXml = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe>
    <infNFe Id="NFe3526091234567800019955001000000${randNF}1234567890">
      <ide>
        <nNF>${randNF}</nNF>
        <serie>1</serie>
        <dhEmi>2026-09-29T10:00:00-03:00</dhEmi>
      </ide>
      <emit>
        <CNPJ>12345678000199</CNPJ>
        <xNome>DISTRIBUIDORA DE BEBIDAS E ALIMENTOS LTDA</xNome>
        <xFant>DISTRIBUIDORA MASTER</xFant>
      </emit>
      <det nItem="1">
        <prod>
          <cProd>BEB-001</cProd>
          <xProd>CERVEJA HEINEKEN LONG NECK 330ML CX 24UN</xProd>
          <NCM>22030000</NCM>
          <uCom>CX</uCom>
          <qCom>10.0000</qCom>
          <vUnCom>120.0000</vUnCom>
          <vProd>1200.00</vProd>
        </prod>
      </det>
      <det nItem="2">
        <prod>
          <cProd>ING-002</cProd>
          <xProd>QUEIJO MUSSARELA PECA RESFRIADA KG</xProd>
          <NCM>04061010</NCM>
          <uCom>KG</uCom>
          <qCom>25.5000</qCom>
          <vUnCom>38.9000</vUnCom>
          <vProd>991.95</vProd>
        </prod>
      </det>
      <total>
        <ICMSTot>
          <vNF>2191.95</vNF>
        </ICMSTot>
      </total>
      <cobr>
        <dup>
          <nDup>001</nDup>
          <dVenc>2026-10-15</dVenc>
          <vDup>1095.97</vDup>
        </dup>
        <dup>
          <nDup>002</nDup>
          <dVenc>2026-10-30</dVenc>
          <vDup>1095.98</vDup>
        </dup>
      </cobr>
    </infNFe>
  </NFe>
</nfeProc>`;

    const resPreView = await request({
      hostname: 'localhost',
      port: 8080,
      path: '/api/addons/compras/pre-visualizar-xml',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      xml: mockNFeXml
    });

    assert('Pré-visualização de XML retorna status 200 e dados do fornecedor', resPreView.status === 200 && resPreView.body.success && resPreView.body.fornecedor.cnpj === '12345678000199', resPreView.body);
    assert('Pré-visualização extraiu 2 itens da NF-e', resPreView.body?.itens?.length === 2, resPreView.body?.itens);
    assert('Extraiu 2 parcelas/duplicatas para agendamento de Contas a Pagar', resPreView.body?.duplicatas?.length === 2, resPreView.body?.duplicatas);

    // Importar XML com fator de conversão (Ex: Caixa com 24 un -> 240 unidades no estoque)
    const resImportar = await request({
      hostname: 'localhost',
      port: 8080,
      path: '/api/addons/compras/importar-xml',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      xml: mockNFeXml,
      atualizar_precos: true,
      gerar_contas_pagar: true,
      itensCustomizados: [
        {
          codigo_fornecedor: 'BEB-001',
          nome: 'Cerveja Heineken 330ml',
          fator_conversao: 24, // 10 caixas x 24 = 240 garrafas
          unidade_estoque: 'un',
          insumo_id: null
        },
        {
          codigo_fornecedor: 'ING-002',
          nome: 'Queijo Mussarela',
          fator_conversao: 1, // 25.5 kg
          unidade_estoque: 'kg',
          insumo_id: null
        }
      ]
    });

    assert('Importação do XML processada com sucesso no estoque e financeiro', resImportar.status === 200 && resImportar.body.success, resImportar.body);
    assert('Importador calculou estoque convertido e gerou lançamentos', resImportar.body?.itens_processados >= 2, resImportar.body);

    // Testar status DF-e SEFAZ
    const resDfe = await request({
      hostname: 'localhost',
      port: 8080,
      path: '/api/addons/compras/consultar-sefaz-dfe',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      cnpj: '12345678000199',
      uf: 'SP'
    });
    assert('Consulta DF-e SEFAZ responde status operacional', resDfe.status === 200 && resDfe.body.success && resDfe.body.status_sefaz === '100 - Autorizado o uso da NF-e', resDfe.body);

  } catch (err) {
    assert('Execução do teste Importador XML sem exceção', false, err.message);
  }

  // -------------------------------------------------------------------------
  // PILLAR 3: RASTREIO GPS DO MOTOBOY NO WHATSAPP & ENTREGAS
  // -------------------------------------------------------------------------
  console.log('\n--- TESTANDO PILAR 3: RASTREIO GPS NO WHATSAPP & ENTREGAS ---');
  try {
    const resRota = await request({
      hostname: 'localhost',
      port: 8080,
      path: '/api/modulo/cheff-entregas/despachar-rota',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      motoboy_id: 1,
      motoboy_nome: 'Carlos Silva (Honda CG 160)',
      pedidos_ids: [101]
    });

    assert('Despacho de rota gera sucesso e retorna link de rastreio', resRota.status === 200 && resRota.body.success, resRota.body);
    const itemDespachado = resRota.body?.pedidos_despachados?.[0];
    assert('Gerou token de rastreio único para o pedido', !!itemDespachado?.rastreio_token, itemDespachado);
    assert('Gerou mensagem pronta para envio via WhatsApp com link', itemDespachado?.whatsapp_msg && itemDespachado.whatsapp_msg.includes('/rastreio.html?t='), itemDespachado?.whatsapp_msg);

    if (itemDespachado?.rastreio_token) {
      const resPublicRastreio = await request({
        hostname: 'localhost',
        port: 8080,
        path: '/api/public/rastreio/' + itemDespachado.rastreio_token,
        method: 'GET'
      });

      assert('API pública de rastreio /api/public/rastreio/:token responde 200', resPublicRastreio.status === 200 && resPublicRastreio.body.success, resPublicRastreio.body);
      assert('API pública retorna dados do motoboy, entrega e coordenadas GPS', resPublicRastreio.body?.motoboy && resPublicRastreio.body?.pedido && resPublicRastreio.body?.motoboy?.posicao?.lat, resPublicRastreio.body);
    }

    // Verificar se páginas HTML são servidas
    const resPaginaRastreio = await request({
      hostname: 'localhost',
      port: 8080,
      path: '/rastreio.html',
      method: 'GET'
    });
    assert('Página de rastreio /rastreio.html acessível no navegador (200)', resPaginaRastreio.status === 200 && resPaginaRastreio.raw.includes('Leaflet'), 'Status: ' + resPaginaRastreio.status);

    const resPaginaXml = await request({
      hostname: 'localhost',
      port: 8080,
      path: '/importar-xml.html',
      method: 'GET'
    });
    assert('Página de importação /importar-xml.html acessível no navegador (200)', resPaginaXml.status === 200 && resPaginaXml.raw.includes('Importador'), 'Status: ' + resPaginaXml.status);

  } catch (err) {
    assert('Execução do teste Rastreio GPS sem exceção', false, err.message);
  }

  console.log('\n================================================================');
  console.log('🏁 RESULTADOS DOS TESTES DOS 3 PILARES:');
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
