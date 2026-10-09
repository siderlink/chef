/**
 * services/pedido.service.js
 * Lógica pura de negócio para Pedidos, Comandas, Totais e Divisão de Mesas.
 *
 * Blindagens implementadas:
 * 1. Piso financeiro estrito: Math.max(0, valor) para prevenir anomalias de valores negativos (conforme system_audit.md).
 * 2. Arredondamento monetário preciso (2 casas decimais) evitando dízimas de ponto flutuante do JavaScript.
 * 3. Divisão de contas (split bill) segura: validação de divisor >= 1 e rateio de sobras em centavos.
 */

'use strict';

/**
 * Normaliza e formata valor monetário garantindo não-negatividade e 2 casas decimais.
 * @param {number|string} valor
 * @returns {number}
 */
function sanitizeMoney(valor) {
  if (typeof valor === 'string') {
    valor = valor.replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
  }
  const num = parseFloat(valor);
  if (isNaN(num)) return 0;
  return Math.max(0, Math.round(num * 100) / 100);
}

/**
 * Calcula os totais de uma lista de itens de pedido com proteção contra negativos.
 * @param {Array} itens - Lista de itens com total, preco, quantidade
 * @param {Object} [opcoes] - { taxaServicoPct: 10, incluirServico: true, desconto: 0, couvert: 0 }
 * @returns {Object} { subtotal, taxaServico, couvertTotal, desconto, totalGeral }
 */
function calcularTotaisPedido(itens = [], opcoes = {}) {
  const {
    taxaServicoPct = 10,
    incluirServico = true,
    desconto = 0,
    couvert = 0,
    pessoas = 1
  } = opcoes;

  let subtotal = 0;
  let totalItens = 0;

  (itens || []).forEach(item => {
    // Ignora lançamentos que sejam pagamentos parciais salvos como produto
    const nome = String(item.productName || item.nome || '').toLowerCase();
    if (nome.includes('pgto parcial') || nome.includes('pagamento parcial')) {
      return;
    }

    const preco = sanitizeMoney(item.total !== undefined ? item.total : (Number(item.preco || item.price || 0) * Number(item.quantity || item.quantidade || 1)));
    subtotal += preco;
    totalItens += parseInt(item.quantity || item.quantidade || 1, 10);
  });

  subtotal = Math.round(subtotal * 100) / 100;

  const numPessoas = Math.max(1, parseInt(pessoas, 10) || 1);
  const couvertTotal = sanitizeMoney(couvert * numPessoas);
  const taxaServico = incluirServico ? Math.round((subtotal * (taxaServicoPct / 100)) * 100) / 100 : 0;
  const descontoTotal = sanitizeMoney(desconto);

  const bruto = subtotal + taxaServico + couvertTotal;
  const totalGeral = Math.max(0, Math.round((bruto - descontoTotal) * 100) / 100);

  return {
    subtotal,
    totalItens,
    taxaServico,
    taxaServicoPct: incluirServico ? taxaServicoPct : 0,
    couvertTotal,
    desconto: descontoTotal,
    totalGeral
  };
}

/**
 * Realiza divisão de conta (split) em partes iguais entre N pessoas com distribuição de centavos.
 * @param {number} totalGeral - Valor total
 * @param {number} numPessoas - Número de pagantes
 * @returns {Array<number>} Array com o valor exato a ser pago por cada pessoa
 */
function dividirContaEmPartesIguais(totalGeral, numPessoas) {
  const totalCentavos = Math.round(sanitizeMoney(totalGeral) * 100);
  const n = Math.max(1, parseInt(numPessoas, 10) || 1);

  const baseCentavos = Math.floor(totalCentavos / n);
  const restoCentavos = totalCentavos % n;

  const parcelas = [];
  for (let i = 0; i < n; i++) {
    // Adiciona 1 centavo para os primeiros R pagantes caso haja resto na divisão
    const centavos = baseCentavos + (i < restoCentavos ? 1 : 0);
    parcelas.push(centavos / 100);
  }

  return parcelas;
}

module.exports = {
  sanitizeMoney,
  calcularTotaisPedido,
  dividirContaEmPartesIguais
};
