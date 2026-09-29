/**
 * caixa-impressoes.js
 * Módulo especializado na Emissão e Impressão de Cupons Térmicos (ESC/POS), DANFE NFC-e e Vias de Produção
 * Integrado ao PDV Chef Cozinha
 */

'use strict';

/**
 * Envia comando de impressão silenciosa direta para impressora térmica (ESC/POS)
 * sem necessidade de abrir a caixa de diálogo nativa do navegador.
 * @param {object} dados
 * @param {string} dados.mesa
 * @param {Array} dados.items
 * @param {number} dados.total
 * @param {number} [dados.subtotal]
 * @param {string} [dados.conteudo]
 * @param {string} [dados.impressora]
 * @returns {Promise<{ ok: boolean, erro?: string }>}
 */
async function imprimirCupomSilencioso({ mesa, items, total, subtotal, conteudo, impressora } = {}) {
  try {
    const token = (typeof localStorage !== 'undefined' ? localStorage.getItem('authToken') : '') || (typeof window !== 'undefined' ? window.authToken : '') || '';
    const payload = { mesa, items, total, subtotal, conteudo, impressora };
    const resp = await fetch('/api/imprimir/cupom-raw', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    const r = await resp.json();
    if (r && r.ok === false) {
      console.warn('[Impressão Silenciosa] Erro retornado pela impressora:', r.erro || r);
    }
    return r;
  } catch (e) {
    console.warn('[Impressão Silenciosa] Falha na comunicação com o spooler:', e);
    return { ok: false, erro: String(e) };
  }
}

/**
 * Abre janela de impressão formatada do DANFE NFC-e
 * @param {number|string} id ID da nota fiscal
 */
function imprimirDanfeNfce(id) {
  if (!id || typeof window === 'undefined') return;
  const rid = encodeURIComponent((typeof localStorage !== 'undefined' ? localStorage.getItem('restaurante_id') : '') || '1');
  window.open('/api/nfce/danfe/' + id + '?restaurante_id=' + rid, '_blank', 'width=420,height=650,scrollbars=yes');
}

/**
 * Faz download do arquivo XML assinado da NFC-e
 * @param {number|string} id
 */
function baixarXmlNfce(id) {
  if (!id || typeof window === 'undefined') return;
  const rid = encodeURIComponent((typeof localStorage !== 'undefined' ? localStorage.getItem('restaurante_id') : '') || '1');
  window.open('/api/nfce/xml/' + id + '?restaurante_id=' + rid, '_blank');
}

/**
 * Solicita cancelamento formal de NFC-e emitida perante a SEFAZ
 * @param {number|string} id
 * @param {string} [numero_nota]
 */
function cancelarNotaNfce(id, numero_nota) {
  if (typeof window === 'undefined') return;
  const notaMsg = numero_nota ? `Nº ${numero_nota}` : `ID ${id}`;
  const motivo = prompt(`Informe o motivo do cancelamento da NFC-e (${notaMsg}) - mínimo 15 caracteres:`);
  if (!motivo || motivo.trim().length < 15) {
    alert('O motivo do cancelamento deve ter no mínimo 15 caracteres.');
    return;
  }

  if (typeof window.socket !== 'undefined' && window.socket) {
    window.socket.emit('cancelar_nfce', { id, motivo: motivo.trim() }, (res) => {
      if (res && res.ok) {
        alert('NFC-e cancelada com sucesso!');
        if (typeof window.carregarNotasNfce === 'function') window.carregarNotasNfce();
      } else {
        alert('Erro ao cancelar NFC-e: ' + (res && res.error ? res.error : 'Erro desconhecido.'));
      }
    });
  }
}

/**
 * Gera string de layout formatada em texto puro com largura fixa para impressoras 58mm / 80mm
 * @param {object} param0
 */
function formatarCupomTexto({ titulo = 'CHEF COZINHA', largura = 48, cabecalho = [], linhas = [], totais = [], rodape = [] }) {
  const padCenter = (str, len) => {
    str = String(str || '');
    if (str.length >= len) return str.slice(0, len);
    const left = Math.floor((len - str.length) / 2);
    const right = len - str.length - left;
    return ' '.repeat(left) + str + ' '.repeat(right);
  };

  const padBetween = (left, right, len) => {
    left = String(left || '');
    right = String(right || '');
    const spaces = Math.max(1, len - left.length - right.length);
    return left + ' '.repeat(spaces) + right;
  };

  const separator = '-'.repeat(largura);
  const out = [];

  out.push(padCenter(titulo, largura));
  cabecalho.forEach(c => out.push(padCenter(c, largura)));
  out.push(separator);

  linhas.forEach(item => {
    const desc = `${item.qtd || 1}x ${item.nome || 'Item'}`;
    const valor = item.valor ? `R$ ${parseFloat(item.valor).toFixed(2).replace('.', ',')}` : '';
    out.push(padBetween(desc, valor, largura));
    if (item.obs) out.push(`   * ${item.obs}`);
  });

  if (totais.length > 0) {
    out.push(separator);
    totais.forEach(t => {
      out.push(padBetween(t.rotulo || '', t.valor || '', largura));
    });
  }

  if (rodape.length > 0) {
    out.push(separator);
    rodape.forEach(r => out.push(padCenter(r, largura)));
  }

  return out.join('\n');
}

// ── Exposição no window global para compatibilidade com HTML legada ──
if (typeof window !== 'undefined') {
  window.imprimirCupomSilencioso = imprimirCupomSilencioso;
  window.imprimirDanfeNfce = imprimirDanfeNfce;
  window.baixarXmlNfce = baixarXmlNfce;
  window.cancelarNotaNfce = cancelarNotaNfce;
  window.formatarCupomTexto = formatarCupomTexto;
}

// Suporte para ES Modules
export {
  imprimirCupomSilencioso,
  imprimirDanfeNfce,
  baixarXmlNfce,
  cancelarNotaNfce,
  formatarCupomTexto
};
