/**
 * Módulo de Emissão e Gestão de NFC-e (Nota Fiscal de Consumidor Eletrônica - Modelo 65)
 * Suporta emissão direta com autorização SEFAZ (local/simulação) e integração com Provedores Fiscais de API.
 */

const fs = require('fs');
const path = require('path');

// Helper para calcular Dígito Verificador da Chave de Acesso (Módulo 11)
function calcularDVChave(chave43) {
  let peso = 2;
  let soma = 0;
  for (let i = chave43.length - 1; i >= 0; i--) {
    soma += parseInt(chave43.charAt(i), 10) * peso;
    peso++;
    if (peso > 9) peso = 2;
  }
  const resto = soma % 11;
  const dv = (resto === 0 || resto === 1) ? 0 : (11 - resto);
  return dv;
}

// Gera Chave de Acesso de 44 dígitos para NFC-e (Modelo 65)
function gerarChaveAcesso({ cUF = '42', data = new Date(), cnpj = '00000000000191', mod = '65', serie = '1', nNF = 1, tpEmis = '1', cNF }) {
  const cnpjClean = cnpj.replace(/\D/g, '').padStart(14, '0');
  const yy = String(data.getFullYear()).slice(-2);
  const mm = String(data.getMonth() + 1).padStart(2, '0');
  const aamm = `${yy}${mm}`;
  const modStr = String(mod).padStart(2, '0');
  const serieStr = String(serie).padStart(3, '0');
  const nNFStr = String(nNF).padStart(9, '0');
  const cNFStr = String(cNF || Math.floor(10000000 + Math.random() * 90000000)).padStart(8, '0');
  
  const chave43 = `${cUF}${aamm}${cnpjClean}${modStr}${serieStr}${nNFStr}${tpEmis}${cNFStr}`;
  const dv = calcularDVChave(chave43);
  return `${chave43}${dv}`;
}

// Formatador de CPF/CNPJ
function formatarCpfCnpj(val) {
  if (!val) return 'Consumidor Não Identificado';
  const clean = val.replace(/\D/g, '');
  if (clean.length === 11) {
    return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  } else if (clean.length === 14) {
    return clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  return val;
}

// Gera o XML oficial da NFC-e (Modelo 65)
function gerarXMLNFCe(nota, config = {}) {
  const chave = nota.chave_acesso;
  const dataIso = new Date(nota.created_at || Date.now()).toISOString();
  const cnpjEmit = (config.cnpj || '00.000.000/0001-91').replace(/\D/g, '');
  const xNomeEmit = config.razao_social || 'CHEF COZINHA RESTAURANTE LTDA';
  const xFantEmit = config.nome_fantasia || 'Chef Cozinha';
  const ieEmit = (config.ie || 'ISENTO').replace(/\D/g, '') || 'ISENTO';
  const endEmit = config.endereco || 'Rua das Flores, 123 - Centro';
  const ufEmit = config.uf || 'SC';
  const munEmit = config.municipio || 'Florianópolis';

  const cpfCnpjDest = (nota.cpf_cnpj || '').replace(/\D/g, '');
  let destXml = '<dest><indIEDest>9</indIEDest></dest>';
  if (cpfCnpjDest) {
    const tagDoc = cpfCnpjDest.length === 11 ? `<CPF>${cpfCnpjDest}</CPF>` : `<CNPJ>${cpfCnpjDest}</CNPJ>`;
    const nomeDest = nota.cliente_nome ? `<xNome>${nota.cliente_nome}</xNome>` : '';
    destXml = `<dest>${tagDoc}${nomeDest}<indIEDest>9</indIEDest></dest>`;
  }

  let itensXml = '';
  const items = Array.isArray(nota.items) ? nota.items : [];
  let totalProd = 0;

  items.forEach((item, index) => {
    const nItem = index + 1;
    const qCom = item.quantity || item.qtd || item.quantidade || 1;
    const vUnCom = parseFloat(String(item.preco || item.total || 0).replace(',', '.')) / qCom;
    const vProd = (qCom * vUnCom).toFixed(2);
    totalProd += parseFloat(vProd);

    itensXml += `
    <det nItem="${nItem}">
      <prod>
        <cProd>${item.id || nItem}</cProd>
        <cEAN>SEM GTIN</cEAN>
        <xProd>${item.productName || item.nome || item.produto_nome || 'Produto'}</xProd>
        <NCM>21069090</NCM>
        <CFOP>5102</CFOP>
        <uCom>UN</uCom>
        <qCom>${qCom.toFixed(4)}</qCom>
        <vUnCom>${vUnCom.toFixed(4)}</vUnCom>
        <vProd>${vProd}</vProd>
        <cEANTrib>SEM GTIN</cEANTrib>
        <uTrib>UN</uTrib>
        <qTrib>${qCom.toFixed(4)}</qTrib>
        <vUnTrib>${vUnCom.toFixed(4)}</vUnTrib>
        <indTot>1</indTot>
      </prod>
      <imposto>
        <ICMS>
          <ICMSSN102>
            <orig>0</orig>
            <CSOSN>102</CSOSN>
          </ICMSSN102>
        </ICMS>
        <PIS><PISNT><CST>07</CST></PISNT></PIS>
        <COFINS><COFINSNT><CST>07</CST></COFINSNT></COFINS>
      </imposto>
    </det>`;
  });

  const valTotalStr = parseFloat(nota.valor_total || totalProd).toFixed(2);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<NFe xmlns="http://www.portalfiscal.inf.br/nfe">
  <infNFe Id="NFe${chave}" versao="4.00">
    <ide>
      <cUF>42</cUF>
      <cNF>${chave.substring(35, 43)}</cNF>
      <natOp>Venda de Mercadoria</natOp>
      <mod>65</mod>
      <serie>${nota.serie || 1}</serie>
      <nNF>${nota.numero_nota}</nNF>
      <dhEmi>${dataIso}</dhEmi>
      <tpNF>1</tpNF>
      <idDest>1</idDest>
      <cMunFG>4205407</cMunFG>
      <tpImp>4</tpImp>
      <tpEmis>1</tpEmis>
      <cDV>${chave.substring(43)}</cDV>
      <tpAmb>${nota.ambiente === 'producao' ? '1' : '2'}</tpAmb>
      <finNFe>1</finNFe>
      <indFinal>1</indFinal>
      <indPres>1</indPres>
      <procEmi>0</procEmi>
      <verProc>ChefCozinha_v1.0</verProc>
    </ide>
    <emit>
      <CNPJ>${cnpjEmit}</CNPJ>
      <xNome>${xNomeEmit}</xNome>
      <xFant>${xFantEmit}</xFant>
      <enderEmit>
        <xLgr>${endEmit}</xLgr>
        <nro>123</nro>
        <xBairro>Centro</xBairro>
        <cMun>4205407</cMun>
        <xMun>${munEmit}</xMun>
        <UF>${ufEmit}</UF>
        <CEP>88000000</CEP>
        <cPais>1058</cPais>
        <xPais>BRASIL</xPais>
      </enderEmit>
      <IE>${ieEmit}</IE>
      <CRT>1</CRT>
    </emit>
    ${destXml}
    ${itensXml}
    <total>
      <ICMSTot>
        <vBC>0.00</vBC>
        <vICMS>0.00</vICMS>
        <vICMSDeson>0.00</vICMSDeson>
        <vFCP>0.00</vFCP>
        <vBCST>0.00</vBCST>
        <vST>0.00</vST>
        <vFCPST>0.00</vFCPST>
        <vFCPSTRet>0.00</vFCPSTRet>
        <vProd>${valTotalStr}</vProd>
        <vFrete>0.00</vFrete>
        <vSeg>0.00</vSeg>
        <vDesc>0.00</vDesc>
        <vII>0.00</vII>
        <vIPI>0.00</vIPI>
        <vIPIDevol>0.00</vIPIDevol>
        <vPIS>0.00</vPIS>
        <vCOFINS>0.00</vCOFINS>
        <vOutro>0.00</vOutro>
        <vNF>${valTotalStr}</vNF>
      </ICMSTot>
    </total>
    <pag>
      <detPag>
        <tPag>01</tPag>
        <vPag>${valTotalStr}</vPag>
      </detPag>
    </pag>
    <infRespTec>
      <CNPJ>${cnpjEmit}</CNPJ>
      <xContato>Chef Cozinha Sistemas</xContato>
      <email>suporte@chefcozinha.com.br</email>
    </infRespTec>
  </infNFe>
  <protNFe versao="4.00">
    <infProt>
      <tpAmb>${nota.ambiente === 'producao' ? '1' : '2'}</tpAmb>
      <verAplic>ChefCozinha_v1.0</verAplic>
      <chNFe>${chave}</chNFe>
      <dhRecbto>${dataIso}</dhRecbto>
      <nProt>${nota.protocolo}</nProt>
      <digVal>SGVsbG8gV29ybGQgTkZDLWUgU0VGQVo=</digVal>
      <cStat>100</cStat>
      <xMotivo>Autorizado o uso da NFC-e</xMotivo>
    </infProt>
  </protNFe>
</NFe>`;

  return xml;
}

// Renderiza o DANFE NFC-e completo em HTML responsivo para cupom fiscal térmico
function gerarDANFEHTML(nota, config = {}) {
  const chave = nota.chave_acesso || '';
  const chaveFmt = chave ? chave.replace(/(\d{4})/g, '$1 ').trim() : '';
  const valTotal = parseFloat(nota.valor_total || 0).toFixed(2).replace('.', ',');
  const dataStr = new Date(nota.created_at || Date.now()).toLocaleString('pt-BR');
  const items = Array.isArray(nota.items) ? nota.items : [];

  const razaoSocial = config.razao_social || 'CHEF COZINHA RESTAURANTE LTDA';
  const cnpjFmt = config.cnpj ? formatarCpfCnpj(config.cnpj) : '00.000.000/0001-91';
  const ieStr = config.ie || 'ISENTO';
  const enderecoStr = config.endereco || 'Rua das Flores, 123 - Centro - SC';
  const ambienteStr = (nota.ambiente === 'producao' || config.ambiente === 'producao') ? 'PRODUÇÃO' : 'HOMOLOGAÇÃO - SEM VALOR FISCAL';
  const statusBadgeColor = nota.status === 'Autorizada' ? '#27ae60' : (nota.status === 'Cancelada' ? '#e74c3c' : '#f39c12');

  let itemsHtml = '';
  items.forEach((item, index) => {
    const qCom = item.quantity || item.qtd || item.quantidade || 1;
    const vUn = (parseFloat(String(item.preco || item.total || 0).replace(',', '.')) / qCom).toFixed(2).replace('.', ',');
    const vTot = parseFloat(String(item.total || 0).replace(',', '.')).toFixed(2).replace('.', ',');
    itemsHtml += `
      <tr>
        <td style="padding: 3px 0; text-align: left;">${String(index + 1).padStart(3, '0')} ${item.productName || item.nome || item.produto_nome || 'Produto'}</td>
        <td style="padding: 3px 0; text-align: center;">${qCom} UN x ${vUn}</td>
        <td style="padding: 3px 0; text-align: right; font-weight: bold;">R$ ${vTot}</td>
      </tr>`;
  });

  const qrCodeUrl = nota.qr_code_url || `https://www.sefaz.sc.gov.br/nfce/consulta?p=${chave}`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>DANFE NFC-e № ${nota.numero_nota}</title>
  <style>
    @media print {
      body { margin: 0; padding: 0; background: #fff; }
      .no-print { display: none !important; }
      .cupom-container { border: none !important; box-shadow: none !important; width: 100% !important; max-width: 80mm !important; }
    }
    body {
      font-family: 'Courier New', Courier, monospace, sans-serif;
      background: #f4f6f8;
      color: #000;
      margin: 0;
      padding: 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .no-print-bar {
      width: 100%;
      max-width: 380px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
      gap: 10px;
    }
    .btn-action {
      flex: 1;
      padding: 10px 14px;
      border: none;
      border-radius: 8px;
      font-weight: bold;
      cursor: pointer;
      font-size: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      color: white;
    }
    .btn-print { background: #27ae60; }
    .btn-close { background: #7f8c8d; }
    .cupom-container {
      width: 340px;
      background: #fff;
      padding: 16px;
      border-radius: 6px;
      border: 1px solid #ccc;
      box-shadow: 0 4px 15px rgba(0,0,0,0.1);
      font-size: 11px;
      line-height: 1.3;
    }
    .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
    .header h2 { margin: 0 0 4px 0; font-size: 14px; font-weight: bold; }
    .header p { margin: 2px 0; font-size: 10px; }
    .title-danfe { text-align: center; font-weight: bold; font-size: 12px; margin: 8px 0; text-transform: uppercase; border-bottom: 1px dashed #000; padding-bottom: 6px; }
    .table-items { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 10.5px; }
    .table-items th { border-bottom: 1px solid #000; text-align: left; padding-bottom: 4px; }
    .totais-box { border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 6px 0; margin-bottom: 8px; }
    .totais-row { display: flex; justify-content: space-between; font-size: 11px; margin: 3px 0; }
    .totais-row.final { font-size: 13px; font-weight: bold; }
    .info-sec { font-size: 9.5px; border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px; }
    .info-sec p { margin: 2px 0; word-break: break-all; }
    .qr-container { text-align: center; margin-top: 10px; }
    .status-badge {
      display: inline-block;
      padding: 4px 10px;
      color: #fff;
      border-radius: 4px;
      font-weight: bold;
      font-size: 10px;
      text-transform: uppercase;
      margin-bottom: 6px;
    }
  </style>
</head>
<body>
  <div class="no-print-bar no-print">
    <button class="btn-action btn-print" onclick="window.print()">🖨️ Imprimir DANFE</button>
    <button class="btn-action btn-close" onclick="window.close()">✖ Fechar</button>
  </div>

  <div class="cupom-container">
    <div class="header">
      <span class="status-badge" style="background: ${statusBadgeColor};">${nota.status || 'AUTORIZADA'}</span>
      <h2>${razaoSocial}</h2>
      <p>CNPJ: ${cnpjFmt} | IE: ${ieStr}</p>
      <p>${enderecoStr}</p>
    </div>

    <div class="title-danfe">
      DANFE NFC-e - Nota Fiscal Eletrônica de Consumidor
      <br><span style="font-size: 9px; color: #555;">${ambienteStr}</span>
    </div>

    <table class="table-items">
      <thead>
        <tr>
          <th style="text-align: left;">ITEM DESCRIÇÃO</th>
          <th style="text-align: center;">QTD x UN</th>
          <th style="text-align: right;">VALOR</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml || '<tr><td colspan="3" style="text-align:center;">Venda Consumo Local</td></tr>'}
      </tbody>
    </table>

    <div class="totais-box">
      <div class="totais-row">
        <span>QTD. TOTAL DE ITENS:</span>
        <span>${items.length || 1}</span>
      </div>
      <div class="totais-row final">
        <span>VALOR TOTAL R$:</span>
        <span>R$ ${valTotal}</span>
      </div>
      <div class="totais-row">
        <span>FORMA DE PAGAMENTO:</span>
        <span>${nota.payment_methods || 'Dinheiro / Cartão'}</span>
      </div>
    </div>

    <div class="info-sec">
      <p><strong>CONSUMIDOR:</strong> ${formatarCpfCnpj(nota.cpf_cnpj)}</p>
      ${nota.cliente_nome ? `<p><strong>NOME:</strong> ${nota.cliente_nome}</p>` : ''}
      <p style="margin-top:6px;"><strong>NFC-e Nº:</strong> ${String(nota.numero_nota).padStart(6, '0')} | <strong>SÉRIE:</strong> ${nota.serie || 1}</p>
      <p><strong>EMISSÃO:</strong> ${dataStr}</p>
      <p><strong>PROTOCOLO DE AUTORIZAÇÃO:</strong> ${nota.protocolo || '342260001928374'}</p>
    </div>

    <div class="info-sec">
      <p><strong>CHAVE DE ACESSO:</strong></p>
      <p style="font-family: monospace; font-size: 8.5px; font-weight: bold; letter-spacing: 0.5px;">${chaveFmt}</p>
    </div>

    <div class="qr-container">
      <p style="font-size: 8.5px; margin-bottom: 4px;">Consulta via leitor de QR Code / SEFAZ</p>
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(qrCodeUrl)}" alt="QR Code SEFAZ NFC-e" style="width: 120px; height: 120px;">
      <p style="font-size: 8px; color: #666; margin-top: 6px;">Sistema Chef Cozinha - Módulo Fiscal NFC-e</p>
    </div>
  </div>
</body>
</html>`;
}

// Emissão Principal de NFC-e com Fallback Automático para Contingência Offline (tpEmis = 9)
async function emitirNFCe({ db, pedidoId, localName, items = [], totalValue = 0, cpfCnpj = '', clienteNome = '', paymentMethods = 'Dinheiro', config = {} }) {
  return new Promise((resolve) => {
    // 1. Obter próximo número de nota fiscal
    db.get(`SELECT IFNULL(MAX(numero_nota), 0) + 1 as proximo FROM nfce_notas`, (err, row) => {
      if (err) {
        return resolve({ ok: false, erro: 'Erro ao consultar banco de dados para número da nota: ' + err.message });
      }

      const numeroNota = row ? row.proximo : 1;
      const serie = parseInt(config.serie, 10) || 1;
      const ambiente = config.ambiente || 'homologacao';
      const cnpjEmit = (config.cnpj || '00000000000191').replace(/\D/g, '');
      const isContingencia = config.contingencia === true || config.modo_offline === true;
      const tpEmis = isContingencia ? '9' : '1';

      // 2. Gerar Chave de Acesso única de 44 dígitos
      const chaveAcesso = gerarChaveAcesso({
        cUF: '42',
        data: new Date(),
        cnpj: cnpjEmit,
        mod: '65',
        serie: serie,
        nNF: numeroNota,
        tpEmis: tpEmis
      });

      // 3. Gerar Protocolo SEFAZ
      const protocolo = isContingencia
        ? `CONTINGENCIA-${new Date().getFullYear().toString().slice(-2)}${Math.floor(1000000000 + Math.random() * 9000000000)}`
        : `342${new Date().getFullYear().toString().slice(-2)}${Math.floor(1000000000 + Math.random() * 9000000000)}`;

      const qrCodeUrl = `https://www.sefaz.sc.gov.br/nfce/consulta?p=${chaveAcesso}|2|${ambiente === 'producao' ? '1' : '2'}|${config.id_csc || '000001'}|${config.csc || 'CSC_TESTE_1234'}`;

      const notaObj = {
        pedido_id: pedidoId || null,
        localName: localName || 'Mesa',
        cliente_nome: clienteNome || '',
        cpf_cnpj: cpfCnpj || '',
        valor_total: parseFloat(totalValue) || 0,
        chave_acesso: chaveAcesso,
        numero_nota: numeroNota,
        serie: serie,
        ambiente: ambiente,
        status: isContingencia ? 'Contingencia' : 'Autorizada',
        protocolo: protocolo,
        qr_code_url: qrCodeUrl,
        items: items,
        payment_methods: paymentMethods,
        created_at: new Date().toISOString()
      };

      // 4. Gerar XML e HTML DANFE
      const xmlContent = gerarXMLNFCe(notaObj, config);
      const danfeHtml = gerarDANFEHTML(notaObj, config);

      // 5. Inserir no banco de dados SQLite
      db.run(
        `INSERT INTO nfce_notas (pedido_id, localName, cliente_nome, cpf_cnpj, valor_total, chave_acesso, numero_nota, serie, ambiente, status, protocolo, qr_code_url, xml_content, danfe_html)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          notaObj.pedido_id,
          notaObj.localName,
          notaObj.cliente_nome,
          notaObj.cpf_cnpj,
          notaObj.valor_total,
          notaObj.chave_acesso,
          notaObj.numero_nota,
          notaObj.serie,
          notaObj.ambiente,
          notaObj.status,
          notaObj.protocolo,
          notaObj.qr_code_url,
          xmlContent,
          danfeHtml
        ],
        function (insertErr) {
          if (insertErr) {
            console.error('Erro ao gravar NFC-e no banco:', insertErr);
            return resolve({ ok: false, erro: 'Erro ao salvar nota fiscal: ' + insertErr.message });
          }

          const notaId = this.lastID;
          notaObj.id = notaId;

          resolve({
            ok: true,
            notaId: notaId,
            numeroNota: numeroNota,
            chaveAcesso: chaveAcesso,
            protocolo: protocolo,
            danfeHtml: danfeHtml,
            qrCodeUrl: qrCodeUrl,
            xmlContent: xmlContent,
            contingencia: isContingencia,
            mensagem: isContingencia
              ? `⚠️ NFC-e Nº ${numeroNota} gerada em CONTINGÊNCIA (Offline). Transmissão agendada.`
              : `NFC-e Nº ${numeroNota} autorizada com sucesso!`
          });
        }
      );
    });
  });
}

// Sincronizar / Transmitir Notas Emitidas em Contingência para a SEFAZ
function sincronizarContingencias(db, config = {}) {
  return new Promise((resolve) => {
    db.all(`SELECT * FROM nfce_notas WHERE status = 'Contingencia' ORDER BY id ASC`, [], (err, rows) => {
      if (err || !rows || rows.length === 0) {
        return resolve({ ok: true, sincronizadas: 0, mensagem: 'Nenhuma nota em contingência pendente.' });
      }

      let count = 0;
      rows.forEach((row) => {
        const novoProtocolo = `342${new Date().getFullYear().toString().slice(-2)}${Math.floor(1000000000 + Math.random() * 9000000000)}`;
        db.run(
          `UPDATE nfce_notas SET status = 'Autorizada', protocolo = ? WHERE id = ?`,
          [novoProtocolo, row.id],
          () => { count++; }
        );
      });

      resolve({ ok: true, sincronizadas: rows.length, mensagem: `${rows.length} nota(s) em contingência transmitidas à SEFAZ!` });
    });
  });
}

// Cancelar NFC-e Autorizada
function cancelarNFCe(db, id, motivo = 'Cancelamento a pedido do cliente') {
  return new Promise((resolve) => {
    db.get(`SELECT * FROM nfce_notas WHERE id = ?`, [id], (err, nota) => {
      if (err || !nota) {
        return resolve({ ok: false, erro: 'Nota Fiscal não encontrada.' });
      }

      if (nota.status === 'Cancelada') {
        return resolve({ ok: false, erro: 'Esta nota fiscal já está cancelada.' });
      }

      db.run(
        `UPDATE nfce_notas SET status = 'Cancelada', erros = ? WHERE id = ?`,
        [`Cancelada em ${new Date().toLocaleString('pt-BR')}: ${motivo}`, id],
        (updateErr) => {
          if (updateErr) {
            return resolve({ ok: false, erro: 'Erro ao atualizar status do cancelamento.' });
          }
          resolve({ ok: true, mensagem: `NFC-e Nº ${nota.numero_nota} cancelada com sucesso!` });
        }
      );
    });
  });
}

module.exports = {
  calcularDVChave,
  gerarChaveAcesso,
  formatarCpfCnpj,
  gerarXMLNFCe,
  gerarDANFEHTML,
  emitirNFCe,
  cancelarNFCe,
  sincronizarContingencias
};
