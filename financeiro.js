
function parseMoneyFin(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  let s = String(val).replace(/R\$\s*/gi, '').trim();
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
const HOST = window.location.hostname;
const socket = io({ query: { token: localStorage.getItem('chef_token'), restaurante_id: localStorage.getItem('restaurante_id') || '1' } });

socket.on('tenant_atualizado', (data) => {
  if (data && data.restaurante_id) localStorage.setItem('restaurante_id', data.restaurante_id);
  if (data && data.token) localStorage.setItem('chef_token', data.token);
  socket.disconnect();
  socket.io.opts.query = { token: data.token, restaurante_id: String(data.restaurante_id) };
  socket.connect();
});

// (Segurança) Escapa valor para conteúdo HTML.
function escHtml(v) {
  return (v === null || v === undefined) ? '' : String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// (Segurança) Identifica o cargo do funcionário logado no socket.
try {
  const sessStr = localStorage.getItem('chef_session') || localStorage.getItem('chef_credentials');
  if (sessStr) {
    const sess = JSON.parse(sessStr);
    if (sess && sess.token) socket.emit('identificar_funcionario_token', sess.token);
  }
} catch (e) { /* sem sessão */ }

// Cargo do usuário logado (para as regras de senha de fechamento de caixa).
window.obterCargoLogado = window.obterCargoLogado || function () {
  try {
    const credsStr = localStorage.getItem('chef_session') || localStorage.getItem('chef_credentials') || localStorage.getItem('chef_app_creds');
    if (!credsStr) return '';
    const creds = JSON.parse(credsStr);
    return String(creds.cargo || creds.funcao || creds.role || '').trim();
  } catch (e) {
    return '';
  }
};

window.ehAdminOuGerenteLogado = window.ehAdminOuGerenteLogado || function () {
  const c = String(window.obterCargoLogado() || '').toLowerCase();
  return ['admin', 'administrador', 'gerente', 'adm', 'gerente geral'].includes(c);
};

window.promptSenhaFechamentoCaixa = window.promptSenhaFechamentoCaixa || function () {
  const c = String(window.obterCargoLogado() || '').toLowerCase();
  const ehCaixa = c === 'caixa' || c.includes('operador de caixa') || c.includes('caixa / pdv') || c.includes('caixa/pdv');
  return ehCaixa ? 'Digite a SENHA DO CAIXA para autorizar o fechamento:' : 'Digite a senha de um CAIXA, ADMINISTRADOR ou GERENTE para autorizar o fechamento:';
};

document.addEventListener('DOMContentLoaded', () => {
  // --- SIDEBAR TOGGLE ---
  const menuIcon = document.querySelector('.menu-icon');
  const sidebar = document.querySelector('.sidebar');
  if (menuIcon && sidebar) {
    menuIcon.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
    });
  }

  // --- CASHIER SHIFT SYSTEM LOGIC ---
  socket.emit('get_relatorio_caixa');

  socket.on('atualizacao_caixa', () => {
    socket.emit('get_relatorio_caixa');
  });
  
  socket.on('mesa_finalizada', () => {
    socket.emit('get_relatorio_caixa');
  });

  socket.on('erro_fechar_caixa', (data) => {
    alert(`⚠️ ATENÇÃO: NÃO É POSSÍVEL FECHAR O CAIXA!\n\n${data.msg}`);
  });

  socket.on('caixa_fechado_sucesso', () => {
    alert("Turno encerrado com sucesso!");
    window.location.href = 'index.html';
  });

  socket.on('relatorio_caixa', (stats) => {
    if (!stats) {
      alert("Nenhum turno aberto no momento.");
      window.location.href = 'index.html';
      return;
    }

    window.currentCaixaStats = stats;

    const fmt = (v) => `R$ ${(v || 0).toFixed(2).replace('.', ',')}`;
    
    document.getElementById('card-troco').innerText = fmt(stats.fundo_troco);
    
    const gaveta = stats.fundo_troco + stats.total_dinheiro + stats.total_suprimento - stats.total_sangria;
    document.getElementById('card-gaveta').innerText = fmt(gaveta);
    
    const pixEl = document.getElementById('card-pix');
    if (pixEl) pixEl.innerText = fmt(stats.total_pix);

    const debitoEl = document.getElementById('card-debito');
    if (debitoEl) debitoEl.innerText = fmt(stats.total_debito);

    const creditoEl = document.getElementById('card-credito');
    if (creditoEl) creditoEl.innerText = fmt(stats.total_credito);

    const fiadoEl = document.getElementById('card-fiado');
    if (fiadoEl) fiadoEl.innerText = fmt(stats.total_fiado);
  
    const cardDesc = document.getElementById('card-descontos');
    if (cardDesc) cardDesc.innerText = fmt(stats.total_desconto || 0);

    const faturado = stats.total_dinheiro + stats.total_pix + stats.total_credito + stats.total_debito + stats.total_fiado;
    document.getElementById('card-faturado').innerText = `R$ ${faturado.toFixed(2).replace('.', ',')}`;

    // Render DRE Waterfall & Metrics
    if (stats.dre) {
      const dre = stats.dre;
      const setTxt = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = fmt(val);
      };

      setTxt('dre-faturamento-bruto', dre.faturamento_bruto);
      setTxt('dre-descontos', dre.descontos);
      setTxt('dre-receita-liquida', dre.receita_liquida);
      setTxt('dre-cmv', dre.cmv);
      setTxt('dre-taxas', dre.taxas_maquininha);
      setTxt('dre-sangrias', dre.sangrias_despesas);
      setTxt('dre-lucro-liquido', dre.lucro_liquido);

      setTxt('dre-card-lucro', dre.lucro_liquido);
      setTxt('dre-card-cmv', dre.cmv);
      setTxt('dre-card-taxas', dre.taxas_maquininha);

      const mPct = (dre.margem_lucro_pct || 0).toFixed(1);
      const margemStr = `${mPct}%`;

      const elMargem = document.getElementById('dre-card-margem');
      if (elMargem) elMargem.innerText = margemStr;

      const badgeMargem = document.getElementById('dre-margem-badge');
      if (badgeMargem) {
        badgeMargem.innerText = `Margem: ${margemStr}`;
        if (dre.margem_lucro_pct >= 25) {
          badgeMargem.style.background = '#dcfce7';
          badgeMargem.style.color = '#15803d';
          badgeMargem.style.borderColor = '#86efac';
        } else if (dre.margem_lucro_pct >= 10) {
          badgeMargem.style.background = '#fef9c3';
          badgeMargem.style.color = '#a16207';
          badgeMargem.style.borderColor = '#fde047';
        } else {
          badgeMargem.style.background = '#fee2e2';
          badgeMargem.style.color = '#b91c1c';
          badgeMargem.style.borderColor = '#fca5a5';
        }
      }
    }

    // Update Modal (Fechamento)
    const dataAberturaFmt = stats.data_abertura ? new Date(stats.data_abertura).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR');
    const infoTurno = document.getElementById('fechamento-turno-info');
    if (infoTurno) infoTurno.innerText = `Turno #${stats.turno_id || 1} | Aberto em: ${dataAberturaFmt}`;

    const totalPedEl = document.getElementById('fechamento-total-pedidos');
    if (totalPedEl) totalPedEl.innerText = stats.total_pedidos || 0;

    const totalItensEl = document.getElementById('fechamento-total-itens');
    if (totalItensEl) totalItensEl.innerText = `${stats.total_itens_vendidos || 0}x`;

    const totalFatEl = document.getElementById('fechamento-total-faturado');
    if (totalFatEl) totalFatEl.innerText = fmt(faturado);

    document.getElementById('fechamento-fundo').innerText = fmt(stats.fundo_troco);
    document.getElementById('fechamento-dinheiro').innerText = fmt(stats.total_dinheiro);
    document.getElementById('fechamento-pix').innerText = fmt(stats.total_pix);
    document.getElementById('fechamento-credito').innerText = fmt(stats.total_credito);
    document.getElementById('fechamento-debito').innerText = fmt(stats.total_debito);
    document.getElementById('fechamento-fiado').innerText = fmt(stats.total_fiado);

    // Renderizar Vendas por Produto
    const prodTbody = document.getElementById('fechamento-produtos');
    if (stats.produtos_vendidos && stats.produtos_vendidos.length > 0) {
      prodTbody.innerHTML = stats.produtos_vendidos.map(p => `
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 8px;">${p.productName}</td>
          <td style="padding: 8px; text-align: center; font-weight: bold;">${p.qty}x</td>
          <td style="padding: 8px; text-align: right; color: #3ab55b; font-weight: bold;">R$ ${parseMoneyFin(p.valTotal).toFixed(2).replace('.', ',')}</td>
        </tr>
      `).join('');
    } else {
      prodTbody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 16px; color: gray;">Nenhum produto vendido neste turno.</td></tr>`;
    }

    const tbody = document.getElementById('tabela-movimentacoes');
    if (stats.historico.length === 0) {
       tbody.innerHTML = '<tr><td colspan="6" style="padding: 20px; text-align: center; color: gray;">Nenhuma movimentação neste turno.</td></tr>';
       return;
    }

    tbody.innerHTML = stats.historico.map(h => {
      let color = 'var(--fin-text, #e2e8f0)';
      let tipoTag = h.tipo;
      if (h.tipo === 'Entrada' || h.tipo === 'Suprimento') color = '#3ab55b';
      if (h.tipo === 'Sangria') color = '#eb5757';
      if (h.tipo === 'Desconto') {
        color = '#dc2626';
        tipoTag = `<span style="background: rgba(239,68,68,0.15); color: #f87171; padding: 3px 8px; border-radius: 6px; font-size: 11.5px; font-weight: bold;"><i class="ph ph-percent"></i> Desconto</span>`;
      }
      
      const dataFormatada = new Date(h.data).toLocaleString('pt-BR');

      return `<tr style="border-bottom: 1px solid var(--fin-border, rgba(255,255,255,0.06));">
        <td style="padding: 12px; color: var(--fin-text-muted, #94a3b8);">#${h.id}</td>
        <td style="padding: 12px; font-weight: bold; color: ${color};">${tipoTag}</td>
        <td style="padding: 12px; color: var(--fin-text, #f1f5f9);">${h.descricao || '-'}</td>
        <td style="padding: 12px; color: var(--fin-text-muted, #94a3b8);">${h.forma_pagamento || '-'}</td>
        <td style="padding: 12px; color: var(--fin-text-muted, #94a3b8);">${dataFormatada}</td>
        <td style="padding: 12px; color: ${color}; font-weight: bold;">R$ ${h.valor.toFixed(2).replace('.', ',')}</td>
      </tr>`;
    }).join('');
  });

  socket.on('alerta_desconto_financeiro', (data) => {
    if (!data) return;
    socket.emit('get_relatorio_caixa');
    console.log('[FINANCEIRO] Alerta de desconto recebido:', data);
  });

  document.getElementById('btn-sangria').onclick = () => {
    const val = prompt('Qual o valor da SANGRIA (Retirada de Dinheiro)?\nUse ponto para centavos (Ex: 50.50)');
    if (!val) return;
    const desc = prompt('Motivo da retirada:');
    if (val && !isNaN(parseFloat(val))) {
      socket.emit('movimentacao_caixa', {
        tipo: 'Sangria',
        valor: parseFloat(val),
        forma_pagamento: 'Dinheiro',
        descricao: desc || 'Retirada Avulsa',
        operador: window.crmPerfil ? window.crmPerfil.nome : 'Desconhecido'
      });
    }
  };

  document.getElementById('btn-suprimento').onclick = () => {
    const val = prompt('Qual o valor do SUPRIMENTO (Entrada de Dinheiro)?\nUse ponto para centavos (Ex: 100.00)');
    if (!val) return;
    const desc = prompt('Motivo da entrada:');
    if (val && !isNaN(parseFloat(val))) {
      socket.emit('movimentacao_caixa', {
        tipo: 'Suprimento',
        valor: parseFloat(val),
        forma_pagamento: 'Dinheiro',
        descricao: desc || 'Entrada Avulsa',
        operador: window.crmPerfil ? window.crmPerfil.nome : 'Desconhecido'
      });
    }
  };

// ══════════════════════════════════════════════════════════════════
  // FECHAMENTO DE CAIXA AVANÇADO & AUDITADO (CONFERÊNCIA CEGA / ABERTA)
  // ══════════════════════════════════════════════════════════════════

  let configFinanceiroGlobal = { fechamento_modo: 'cego', cmv_padrao_pct: 32, taxa_cartao_debito_pct: 1.5, taxa_cartao_credito_pct: 3.0, taxa_pix_pct: 0 };
  let apuracaoFechamentoAtual = null;

  async function obterConfigFinanceiro() {
    try {
      const res = await fetch('/api/financeiro/config');
      const data = await res.json();
      if (data && data.ok && data.config) {
        configFinanceiroGlobal = data.config;
      }
    } catch(e) {
      console.warn('Usando configs padrão de fechamento');
    }
    return configFinanceiroGlobal;
  }

  function calcularQuebraCaixaTempoReal() {
    const stats = window.currentCaixaStats || {};
    const fmt = (v) => 'R$ ' + (parseFloat(v) || 0).toFixed(2).replace('.', ',');

    const getVal = (id) => {
      const el = document.getElementById(id);
      return (el && !isNaN(parseFloat(el.value))) ? parseFloat(el.value) : 0;
    };

    const cedulas = getVal('contagem-cedulas');
    const moedas = getVal('contagem-moedas');
    const debito = getVal('contagem-debito');
    const credito = getVal('contagem-credito');
    const pix = getVal('contagem-pix');
    const outros = getVal('contagem-outros');

    const totalDinheiroDeclarado = cedulas + moedas;
    const totalGeralDeclarado = totalDinheiroDeclarado + debito + credito + pix + outros;

    const elTotalDec = document.getElementById('contagem-total-declarado');
    if (elTotalDec) elTotalDec.innerText = fmt(totalGeralDeclarado);

    const fundoTroco = parseFloat(stats.fundo_troco) || 0;
    const totalDinheiroSistema = parseFloat(stats.total_dinheiro) || 0;
    const totalSuprimento = parseFloat(stats.total_suprimento) || 0;
    const totalSangria = parseFloat(stats.total_sangria) || 0;
    const gavetaEsperada = fundoTroco + totalDinheiroSistema + totalSuprimento - totalSangria;

    const totalFaturadoSistema = (stats.total_dinheiro || 0) + (stats.total_pix || 0) + (stats.total_credito || 0) + (stats.total_debito || 0) + (stats.total_fiado || 0);

    const diferencaGaveta = totalDinheiroDeclarado - gavetaEsperada;
    const diferencaGeral = totalGeralDeclarado - totalFaturadoSistema;

    const elGavetaEsp = document.getElementById('fechamento-gaveta-esperada');
    if (elGavetaEsp) elGavetaEsp.innerText = fmt(gavetaEsperada);

    const elDinheiroDec = document.getElementById('fechamento-dinheiro-declarado');
    if (elDinheiroDec) elDinheiroDec.innerText = fmt(totalDinheiroDeclarado);

    const elDifGaveta = document.getElementById('fechamento-diferenca-gaveta');
    if (elDifGaveta) {
      elDifGaveta.innerText = (diferencaGaveta >= 0 ? '+ ' : '') + fmt(diferencaGaveta);
      elDifGaveta.style.color = Math.abs(diferencaGaveta) < 0.01 ? '#16a34a' : (diferencaGaveta > 0 ? '#0284c7' : '#dc2626');
    }

    const elDifGeral = document.getElementById('fechamento-diferenca-geral');
    if (elDifGeral) {
      elDifGeral.innerText = (diferencaGeral >= 0 ? '+ ' : '') + fmt(diferencaGeral);
      elDifGeral.style.color = Math.abs(diferencaGeral) < 0.01 ? '#16a34a' : (diferencaGeral > 0 ? '#0284c7' : '#dc2626');
    }

    const badgeStatus = document.getElementById('quebra-status-badge');
    if (badgeStatus) {
      if (totalGeralDeclarado === 0 && (!cedulas && !moedas && !debito && !credito && !pix)) {
        badgeStatus.innerText = 'Aguardando contagem física';
        badgeStatus.style.background = '#e2e8f0';
        badgeStatus.style.color = '#475569';
      } else if (Math.abs(diferencaGeral) < 0.01) {
        badgeStatus.innerText = '✓ Caixa Exato (Sem Divergência)';
        badgeStatus.style.background = '#dcfce7';
        badgeStatus.style.color = '#15803d';
      } else if (diferencaGeral > 0) {
        badgeStatus.innerText = '▲ Sobra de Caixa (+' + fmt(diferencaGeral) + ')';
        badgeStatus.style.background = '#e0f2fe';
        badgeStatus.style.color = '#0369a1';
      } else {
        badgeStatus.innerText = '▼ Falta de Caixa / Quebra (-' + fmt(Math.abs(diferencaGeral)) + ')';
        badgeStatus.style.background = '#fee2e2';
        badgeStatus.style.color = '#b91c1c';
      }
    }

    apuracaoFechamentoAtual = {
      cedulas, moedas, debito, credito, pix, outros,
      totalDinheiroDeclarado,
      totalGeralDeclarado,
      gavetaEsperada,
      totalFaturadoSistema,
      diferencaGaveta,
      diferencaGeral
    };
  }

  // Eventos nos inputs de contagem física
  document.querySelectorAll('.contagem-input').forEach(input => {
    input.addEventListener('input', calcularQuebraCaixaTempoReal);
  });

  const btnFecharCaixaOficial = document.getElementById('btn-fechar-caixa-oficial');
  if (btnFecharCaixaOficial) {
    btnFecharCaixaOficial.onclick = async () => {
      await obterConfigFinanceiro();
      const modo = configFinanceiroGlobal.fechamento_modo || 'cego';
      const badgeModo = document.getElementById('fechamento-modo-badge');

      if (badgeModo) {
        badgeModo.innerText = modo === 'cego' ? 'Modo: Conferência Cega (Auditada)' : 'Modo: Conferência Aberta';
        badgeModo.style.background = modo === 'cego' ? '#e0e7ff' : '#dcfce7';
        badgeModo.style.color = modo === 'cego' ? '#4338ca' : '#15803d';
      }

      // No modo cego, orienta o operador
      const instrucoesBox = document.getElementById('fechamento-instrucoes-box');
      if (instrucoesBox) {
        if (modo === 'cego') {
          instrucoesBox.innerHTML = '<i class="ph ph-shield-check" style="color: #6366f1; font-size: 16px; margin-right: 4px;"></i>' +
          '<strong>Conferência Cega Ativa:</strong> Digite os valores reais conferidos na gaveta física e comprovantes das maquininhas. A apuração de diferenças será calculada em tempo real.';
        } else {
          instrucoesBox.innerHTML = '<i class="ph ph-check-circle" style="color: #10b981; font-size: 16px; margin-right: 4px;"></i>' +
          '<strong>Conferência Aberta:</strong> Compare os valores contados diretamente com os valores registrados no sistema.';
        }
      }

      // Limpar campos de contagem para nova conferência
      ['contagem-cedulas', 'contagem-moedas', 'contagem-debito', 'contagem-credito', 'contagem-pix', 'contagem-outros'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      const justifEl = document.getElementById('fechamento-justificativa');
      if (justifEl) justifEl.value = '';

      calcularQuebraCaixaTempoReal();

      const printArea = document.getElementById('fechamento-print-area');
      if (printArea) printArea.classList.add('print-active');
      const relPrintArea = document.getElementById('relatorio-print-area');
      if (relPrintArea) relPrintArea.classList.remove('print-active');
      
      const modal = document.getElementById('fechamento-modal');
      if (modal) modal.style.display = 'flex';
    };
  }

  // Confirmação auditada do fechamento
  const btnConfirmarFechamento = document.getElementById('btn-confirmar-fechamento-auditado');
  if (btnConfirmarFechamento) {
    btnConfirmarFechamento.onclick = async () => {
      calcularQuebraCaixaTempoReal();
      const ap = apuracaoFechamentoAtual || {};
      const diferencaGeral = ap.diferencaGeral || 0;
      const justif = (document.getElementById('fechamento-justificativa')?.value || '').trim();

      // Regra aprovada: Exigir justificativa obrigatória caso haja qualquer divergência (sobra ou falta)
      if (Math.abs(diferencaGeral) >= 0.01 && !justif) {
        alert('⚠️ ATENÇÃO: Foi detectada divergência no caixa (' + (diferencaGeral > 0 ? 'Sobra' : 'Falta') + ' de R$ ' + Math.abs(diferencaGeral).toFixed(2).replace('.', ',') + ').\n\nÉ OBRIGATÓRIO preencher o campo "Justificativa da Divergência" antes de confirmar o encerramento!');
        document.getElementById('fechamento-justificativa')?.focus();
        return;
      }

      // Validação de senha por cargo
      let senha = null;
      if (!window.ehAdminOuGerenteLogado()) {
        senha = prompt(window.promptSenhaFechamentoCaixa());
        if (!senha) return alert('Fechamento cancelado.');
      }

      btnConfirmarFechamento.disabled = true;
      btnConfirmarFechamento.innerText = 'Processando Fechamento...';

      try {
        const payload = {
          contagem: {
            cedulas: ap.cedulas || 0,
            moedas: ap.moedas || 0,
            debito: ap.debito || 0,
            credito: ap.credito || 0,
            pix: ap.pix || 0,
            outros: ap.outros || 0,
            total_declarado: ap.totalGeralDeclarado || 0
          },
          justificativa: justif,
          operador: window.crmPerfil ? window.crmPerfil.nome : 'Operador Caixa',
          senha: senha
        };

        const res = await fetch('/api/caixa/fechamento-conferencia', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        btnConfirmarFechamento.disabled = false;
        btnConfirmarFechamento.innerHTML = '<i class="ph ph-lock-key"></i> Confirmar Fechamento &amp; Encerrar Turno';

        if (!data.ok) {
          alert('Erro ao fechar caixa: ' + (data.erro || 'Falha desconhecida'));
          return;
        }

        // Sucesso! Apresenta diálogo pós-fechamento com botões imediatos de impressão térmica e compartilhamento
        exibirPosFechamentoAuditado(data.resumo || {});
      } catch(e) {
        btnConfirmarFechamento.disabled = false;
        btnConfirmarFechamento.innerHTML = '<i class="ph ph-lock-key"></i> Confirmar Fechamento &amp; Encerrar Turno';
        alert('Erro de comunicação com o servidor: ' + e.message);
      }
    };
  }

  function exibirPosFechamentoAuditado(resumo) {
    const modal = document.getElementById('fechamento-modal');
    if (modal) modal.style.display = 'none';

    const fmt = (v) => 'R$ ' + (parseFloat(v) || 0).toFixed(2).replace('.', ',');
    const dif = resumo.diferenca_geral || 0;
    const difFmt = (dif >= 0 ? '+ ' : '') + fmt(dif);
    const difCor = Math.abs(dif) < 0.01 ? '#16a34a' : (dif > 0 ? '#0284c7' : '#dc2626');

    const overlay = document.createElement('div');
    overlay.id = 'pos-fechamento-overlay';
    overlay.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 16px;';

    overlay.innerHTML = 
      '<div style="background: var(--fin-card, #fff); border-radius: 18px; padding: 28px; max-width: 520px; width: 100%; box-shadow: 0 20px 50px rgba(0,0,0,0.4); text-align: center; border: 1px solid var(--fin-border, #e2e8f0);">' +
        '<div style="width: 64px; height: 64px; border-radius: 50%; background: #dcfce7; color: #16a34a; display: flex; align-items: center; justify-content: center; font-size: 32px; margin: 0 auto 16px;">' +
          '<i class="ph ph-check-bold"></i>' +
        '</div>' +
        '<h2 style="margin: 0 0 6px 0; font-size: 22px; color: var(--fin-text, #0f172a);">Turno #' + (resumo.turno_id || '') + ' Encerrado!</h2>' +
        '<p style="margin: 0 0 20px 0; font-size: 13.5px; color: var(--fin-text-muted, #64748b);">Fechamento auditado e registrado no histórico.</p>' +
        '<div style="background: rgba(0,0,0,0.03); border: 1px solid var(--fin-border, #e2e8f0); border-radius: 12px; padding: 14px; margin-bottom: 20px; text-align: left; font-size: 13px;">' +
          '<div style="display: flex; justify-content: space-between; margin-bottom: 6px;">' +
            '<span style="color: var(--fin-text-muted, #64748b);">Total Registrado no Sistema:</span>' +
            '<strong style="color: var(--fin-text, #0f172a);">' + fmt(resumo.faturado_sistema) + '</strong>' +
          '</div>' +
          '<div style="display: flex; justify-content: space-between; margin-bottom: 6px;">' +
            '<span style="color: var(--fin-text-muted, #64748b);">Total Físico Declarado:</span>' +
            '<strong style="color: #fc4b15;">' + fmt(resumo.total_declarado) + '</strong>' +
          '</div>' +
          '<div style="display: flex; justify-content: space-between; border-top: 1px dashed var(--fin-border, #e2e8f0); padding-top: 6px;">' +
            '<span style="font-weight: 700; color: var(--fin-text, #0f172a);">Apuração / Quebra:</span>' +
            '<strong style="color: ' + difCor + '; font-size: 14px;">' + difFmt + ' (' + (resumo.situacao || 'OK') + ')</strong>' +
          '</div>' +
        '</div>' +
        '<p style="margin: 0 0 12px 0; font-size: 12px; font-weight: 700; color: var(--fin-text-muted, #64748b); text-transform: uppercase;">Ações Imediatas de Comprovante:</p>' +
        '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px;">' +
          '<button id="btn-pos-imprimir-termica" style="padding: 12px; border-radius: 10px; background: #fc4b15; color: white; border: none; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 13px;">' +
            '<i class="ph ph-printer" style="font-size: 18px;"></i> Imprimir Térmica' +
          '</button>' +
          '<button id="btn-pos-whatsapp" style="padding: 12px; border-radius: 10px; background: #25d366; color: white; border: none; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 13px;">' +
            '<i class="ph ph-whatsapp-logo" style="font-size: 18px;"></i> Enviar WhatsApp' +
          '</button>' +
          '<button id="btn-pos-txt" style="padding: 10px; border-radius: 10px; background: #4f46e5; color: white; border: none; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 12.5px;">' +
            '<i class="ph ph-file-text"></i> Baixar TXT' +
          '</button>' +
          '<button id="btn-pos-csv" style="padding: 10px; border-radius: 10px; background: #10b981; color: white; border: none; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 12.5px;">' +
            '<i class="ph ph-microsoft-excel"></i> Baixar CSV' +
          '</button>' +
        '</div>' +
        '<button id="btn-pos-concluir-tudo" style="width: 100%; padding: 12px; border-radius: 10px; background: transparent; border: 1px solid var(--fin-border, #e2e8f0); color: var(--fin-text, #0f172a); font-weight: 700; cursor: pointer; font-size: 13.5px;">' +
          'Concluir e Voltar ao Início' +
        '</button>' +
      '</div>';

    document.body.appendChild(overlay);

    const txtContent = gerarTextoRelatorioFechamentoAuditado(resumo);

    document.getElementById('btn-pos-imprimir-termica').onclick = () => {
      imprimirCupomTermicoFechamento(resumo);
    };

    document.getElementById('btn-pos-whatsapp').onclick = () => {
      window.open('https://wa.me/?text=' + encodeURIComponent(txtContent), '_blank');
    };

    document.getElementById('btn-pos-txt').onclick = () => {
      const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'comprovante_fechamento_turno_' + (resumo.turno_id || Date.now()) + '.txt';
      a.click();
      URL.revokeObjectURL(url);
    };

    document.getElementById('btn-pos-csv').onclick = () => {
      const btnCsv = document.getElementById('btn-fechamento-sheets');
      if (btnCsv) btnCsv.click();
    };

    document.getElementById('btn-pos-concluir-tudo').onclick = () => {
      window.location.href = 'index.html';
    };
  }

  function gerarTextoRelatorioFechamentoAuditado(resumo) {
    const stats = window.currentCaixaStats || {};
    const fmt = (v) => 'R$ ' + (parseFloat(v) || 0).toFixed(2).replace('.', ',');
    const dataFmt = new Date().toLocaleString('pt-BR');
    const dif = resumo.diferenca_geral || 0;
    const difStr = (dif >= 0 ? '+ ' : '') + fmt(dif);

    let prods = (stats.produtos_vendidos || []).map(p => '• ' + p.productName + ' — ' + p.qty + 'x — ' + fmt(parseMoneyFin(p.valTotal))).join('\n');
    if (!prods) prods = 'Nenhum produto vendido no turno.';

    return '=========================================\n' +
           '   CHEF COZINHA — FECHAMENTO AUDITADO    \n' +
           '=========================================\n' +
           'Turno ID: #' + (resumo.turno_id || stats.turno_id || 1) + '\n' +
           'Data / Hora: ' + dataFmt + '\n' +
           '-----------------------------------------\n' +
           '📊 TOTAIS APURADOS PELO SISTEMA:\n' +
           '• Total Faturado: ' + fmt(resumo.faturado_sistema) + '\n' +
           '• Fundo Troco:    ' + fmt(stats.fundo_troco) + '\n' +
           '• Dinheiro:       ' + fmt(stats.total_dinheiro) + '\n' +
           '• PIX:            ' + fmt(stats.total_pix) + '\n' +
           '• Débito:         ' + fmt(stats.total_debito) + '\n' +
           '• Crédito:        ' + fmt(stats.total_credito) + '\n' +
           '-----------------------------------------\n' +
           '💵 CONTAGEM FÍSICA DECLARADA:\n' +
           '• Total Declarado: ' + fmt(resumo.total_declarado) + '\n' +
           '• Situação:        ' + (resumo.situacao || 'Conferido') + '\n' +
           '• Quebra de Caixa: ' + difStr + '\n' +
           (resumo.justificativa ? '• Justificativa:  ' + resumo.justificativa + '\n' : '') +
           '-----------------------------------------\n' +
           '🍕 PRODUTOS VENDIDOS:\n' + prods + '\n' +
           '=========================================\n';
  }

  function imprimirCupomTermicoFechamento(resumo) {
    const printArea = document.getElementById('fechamento-print-area');
    if (printArea) {
      printArea.classList.add('print-active');
      window.print();
    } else {
      window.print();
    }
  }

  // Funções de Exportação do Fechamento
  function gerarTextoRelatorioFechamento() {
    const stats = window.currentCaixaStats || {};
    const fmt = (v) => `R$ ${(v || 0).toFixed(2).replace('.', ',')}`;
    const faturado = (stats.total_dinheiro || 0) + (stats.total_pix || 0) + (stats.total_credito || 0) + (stats.total_debito || 0) + (stats.total_fiado || 0);
    const gaveta = (stats.fundo_troco || 0) + (stats.total_dinheiro || 0) + (stats.total_suprimento || 0) - (stats.total_sangria || 0);
    const dataFmt = new Date().toLocaleString('pt-BR');

    let prods = (stats.produtos_vendidos || []).map(p => `• ${p.productName} — ${p.qty}x — ${fmt(parseMoneyFin(p.valTotal))}`).join('\n');
    if (!prods) prods = 'Nenhum produto vendido.';

    return `=========================================\n` +
           `    CHEF COZINHA — FECHAMENTO DE TURNO   \n` +
           `=========================================\n` +
           `Turno ID: #${stats.turno_id || 1}\n` +
           `Data Encerramento: ${dataFmt}\n` +
           `-----------------------------------------\n` +
           `📊 MÉTRICAS DE VENDAS:\n` +
           `• Total de Pedidos: ${stats.total_pedidos || 0}\n` +
           `• Total Itens Vendidos: ${stats.total_itens_vendidos || 0}x\n` +
           `• Total Faturado: ${fmt(faturado)}\n\n` +
           `💵 ARRECADAÇÃO POR FORMA DE PAGAMENTO:\n` +
           `• Fundo de Troco: ${fmt(stats.fundo_troco)}\n` +
           `• Dinheiro:       ${fmt(stats.total_dinheiro)}\n` +
           `• PIX:            ${fmt(stats.total_pix)}\n` +
           `• Crédito:        ${fmt(stats.total_credito)}\n` +
           `• Débito:         ${fmt(stats.total_debito)}\n` +
           `• Fiado:          ${fmt(stats.total_fiado)}\n` +
           `• Sangrias:       ${fmt(stats.total_sangria)}\n` +
           `• Suprimentos:    ${fmt(stats.total_suprimento)}\n` +
           `👉 Dinheiro em Gaveta: ${fmt(gaveta)}\n` +
           `-----------------------------------------\n` +
           `🍕 TOP PRODUTOS VENDIDOS:\n${prods}\n` +
           `=========================================\n`;
  }

  // Salvar TXT Local
  const btnTxt = document.getElementById('btn-fechamento-salvar-txt');
  if (btnTxt) {
    btnTxt.onclick = () => {
      const text = gerarTextoRelatorioFechamento();
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fechamento-turno-${Date.now()}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    };
  }

  // Enviar WhatsApp
  const btnWa = document.getElementById('btn-fechamento-wa');
  if (btnWa) {
    btnWa.onclick = () => {
      const text = gerarTextoRelatorioFechamento();
      const encoded = encodeURIComponent(text);
      window.open(`https://wa.me/?text=${encoded}`, '_blank');
    };
  }

  // Enviar Google Sheets — exporta CSV local (sem integração de nuvem configurada)
  const btnSheets = document.getElementById('btn-fechamento-sheets');
  if (btnSheets) {
    btnSheets.onclick = () => {
      const stats = window.currentCaixaStats || {};
      const dataLinha = new Date().toISOString();
      const linhas = [
        ['Campo', 'Valor'],
        ['turno_id', stats.turno_id || ''],
        ['Total Faturado', ((stats.total_dinheiro || 0) + (stats.total_pix || 0) + (stats.total_credito || 0) + (stats.total_debito || 0) + (stats.total_fiado || 0)).toFixed(2)],
        ['Dinheiro', (stats.total_dinheiro || 0).toFixed(2)],
        ['Pix', (stats.total_pix || 0).toFixed(2)],
        ['Crédito', (stats.total_credito || 0).toFixed(2)],
        ['Débito', (stats.total_debito || 0).toFixed(2)],
        ['Fiado', (stats.total_fiado || 0).toFixed(2)],
        ['Total Pedidos', stats.total_pedidos || 0],
        ['Total Itens', stats.total_itens_vendidos || 0],
        ['Data', dataLinha]
      ];
      const csv = linhas.map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fechamento_caixa_${(stats.turno_id || '')}.csv`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      a.remove();
    };
  }


// --- ADVANCED REPORT & BI NAVIGATION SYSTEM ---
  const tabResumo = document.getElementById('tab-btn-resumo');
  const tabRelatorio = document.getElementById('tab-btn-relatorio');
  const tabDre = document.getElementById('tab-btn-dre');
  const tabAbc = document.getElementById('tab-btn-abc');
  const tabDespesas = document.getElementById('tab-btn-despesas');
  const tabTurnos = document.getElementById('tab-btn-turnos');
  const tabContador = document.getElementById('tab-btn-contador');

  const secResumo = document.getElementById('section-resumo-caixa');
  const secRelatorio = document.getElementById('section-relatorio-avancado');
  const secDre = document.getElementById('section-dre');
  const secAbc = document.getElementById('section-curva-abc');
  const secDespesas = document.getElementById('section-despesas');
  const secTurnos = document.getElementById('section-turnos');
  const secContador = document.getElementById('section-contador');

  const allTabs = [tabResumo, tabRelatorio, tabDre, tabAbc, tabDespesas, tabTurnos, tabContador].filter(Boolean);
  const allSecs = [secResumo, secRelatorio, secDre, secAbc, secDespesas, secTurnos, secContador].filter(Boolean);

  // Unified tab switching
  function switchTab(activeTab) {
    allTabs.forEach(t => { 
      if (t) {
        t.style.color = 'var(--fin-text-muted, #777)'; 
        t.style.borderBottom = '3px solid transparent'; 
      }
    });
    allSecs.forEach(s => { if (s) s.style.display = 'none'; });
    
    if (activeTab) {
      activeTab.style.color = '#fc4b15';
      activeTab.style.borderBottom = '3px solid #fc4b15';
      const idx = allTabs.indexOf(activeTab);
      const sec = allSecs[idx];
      if (sec) sec.style.display = 'block';
    }
  }

  // Switch Tabs
  if (tabResumo) tabResumo.addEventListener('click', () => switchTab(tabResumo));

  if (tabRelatorio) {
    tabRelatorio.addEventListener('click', () => {
      switchTab(tabRelatorio);
      socket.emit('get_report_filters');
      loadReportData();
    });
  }

  if (tabDre) {
    tabDre.addEventListener('click', () => {
      switchTab(tabDre);
      carregarDRE();
    });
  }

  if (tabAbc) {
    tabAbc.addEventListener('click', () => {
      switchTab(tabAbc);
      carregarCurvaABC();
    });
  }

  if (tabDespesas) {
    tabDespesas.addEventListener('click', () => {
      switchTab(tabDespesas);
      carregarDespesas();
    });
  }

  if (tabTurnos) {
    tabTurnos.addEventListener('click', () => {
      switchTab(tabTurnos);
      carregarHistoricoTurnos();
    });
  }

  if (tabContador) {
    tabContador.addEventListener('click', () => {
      switchTab(tabContador);
      renderCntPreview();
    });
  }

  // Set default dates (start of month to today)
  const dateInit = document.getElementById('relatorio-data-inicial');
  const dateEnd = document.getElementById('relatorio-data-final');
  const now = new Date();
  
  // Format dates to YYYY-MM-DD
  const formatISODate = (d) => d.toISOString().split('T')[0];
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  dateInit.value = formatISODate(firstDay);
  dateEnd.value = formatISODate(now);

  // Handle report filters populate
  socket.on('report_filters_data', (filters) => {
    // Populate Garçons
    const garcomSelect = document.getElementById('relatorio-garcom');
    garcomSelect.innerHTML = `<option value="">Todos os Garçons</option>` + 
      filters.garcons.map(g => `<option value="${escHtml(g)}">${escHtml(g)}</option>`).join('');

    // Populate Clientes
    const clienteSelect = document.getElementById('relatorio-cliente');
    clienteSelect.innerHTML = `<option value="">Todos os Clientes</option>` + 
      filters.clientes.map(c => `<option value="${escHtml(c.id)}">${escHtml(c.nome)}</option>`).join('');

    // Populate Locais (Mesa / Comanda) Datalist
    const locaisList = document.getElementById('relatorio-mesa-comanda-list');
    if (locaisList && filters.locais) {
      locaisList.innerHTML = filters.locais.map(l => `<option value="${escHtml(l)}"></option>`).join('');
    }
  });

  // Load report data trigger
  function loadReportData() {
    const filter = {
      startDate: dateInit.value,
      endDate: dateEnd.value,
      groupBy: document.getElementById('relatorio-agrupamento').value,
      clientFilter: document.getElementById('relatorio-cliente').value,
      waiterFilter: document.getElementById('relatorio-garcom').value,
      localFilter: document.getElementById('relatorio-mesa-comanda').value
    };
    socket.emit('get_advanced_relatorio', filter);
  }

  document.getElementById('btn-atualizar-relatorio').addEventListener('click', loadReportData);

  // Render report details
  
  // ─── SDK / HOOKS PARA CRIAÇÃO DE MÓDULOS DE SUPORTE ─────────────────────
  window.ChefFinanceiroSDK = window.ChefFinanceiroSDK || {};
  window.ChefFinanceiroSDK.origEmit = socket.emit.bind(socket);
  window.ChefFinanceiroSDK.origOn = socket.on.bind(socket);

  socket.on('advanced_relatorio_data', (report) => {
    window.lastReportData = report;

    // Render KPIs safely
    const fmt = (v) => `R$ ${(Math.max(0, v || 0)).toFixed(2).replace('.', ',')}`;
    const totalSalesVal = Math.max(0, report.kpi.totalSales || 0);
    const totalItemsVal = Math.max(0, report.kpi.totalItems || 0);
    const totalOrdersVal = Math.max(0, report.kpi.totalOrders || 0);
    const ticketMedioVal = totalOrdersVal > 0 ? (totalSalesVal / totalOrdersVal) : 0;

    document.getElementById('rep-kpi-faturamento').innerText = fmt(totalSalesVal);
    document.getElementById('rep-kpi-itens').innerText = `${totalItemsVal}x`;
    document.getElementById('rep-kpi-pedidos').innerText = totalOrdersVal;
    document.getElementById('rep-kpi-ticket').innerText = fmt(ticketMedioVal);

    // Render payment methods progress bars safely
    const validPayments = (report.paymentMethodsFiltered || []).filter(p => p.total > 0);
    const totalPayments = validPayments.reduce((acc, curr) => acc + curr.total, 0);
    const payContainer = document.getElementById('rep-pagamentos-container');
    if (validPayments.length === 0) {
      payContainer.innerHTML = `<div style="text-align: center; color: var(--fin-text-muted); padding: 20px;">Nenhum faturamento registrado no período.</div>`;
    } else {
      const colors = {
        'Dinheiro': '#3ab55b',
        'Pix': '#fc4b15',
        'Crédito': '#2d9cdb',
        'Cartão': '#2d9cdb',
        'Débito': '#00c49f',
        'Na Conta': '#a855f7',
        'Fiado': '#a855f7',
        'Múltiplo': '#f2994a',
        'Não Definido': '#94a3b8'
      };
      payContainer.innerHTML = validPayments.map(p => {
        const pVal = Math.max(0, p.total);
        const pctNum = totalPayments > 0 ? (pVal / totalPayments) * 100 : 0;
        const pct = pctNum.toFixed(1);
        const widthPct = Math.min(100, Math.max(0, pctNum));
        const color = colors[p.metodo] || '#fc4b15';
        return `
          <div class="rep-pay-item">
            <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 500; margin-bottom: 6px; color: var(--fin-text);">
              <span style="display: flex; align-items: center; gap: 6px;"><span style="width: 10px; height: 10px; border-radius: 50%; background: ${color}; display: inline-block;"></span>${p.metodo}</span>
              <span style="font-weight: 600; color: var(--fin-text);">${fmt(pVal)} <span style="font-weight: 400; color: var(--fin-text-muted);">(${pct}%)</span></span>
            </div>
            <div class="rep-progress-track" style="width: 100%; height: 8px; background: var(--rep-track-bg, #f0f0f0); border-radius: 4px; overflow: hidden;">
              <div style="width: ${widthPct}%; height: 100%; background: ${color}; border-radius: 4px; transition: width 0.5s;"></div>
            </div>
          </div>
        `;
      }).join('');
    }

    // Render sales trend chart (CSS vertical bars)
    const maxVal = report.periodSales.reduce((acc, curr) => Math.max(acc, curr.val_total), 0) || 1;
    const chartContainer = document.getElementById('rep-grafico-container');
    if (report.periodSales.length === 0) {
      chartContainer.innerHTML = `<div style="width: 100%; text-align: center; color: var(--fin-text-muted); margin-bottom: 20px; font-size: 13px;">Sem dados de vendas.</div>`;
    } else {
      chartContainer.innerHTML = report.periodSales.map(p => {
        const percent = (p.val_total / maxVal) * 80; // max 80% height
        const heightStyle = `height: ${Math.max(percent, 6)}%;`;
        let cleanPeriod = p.period;
        if (p.period.length === 10) {
          const parts = p.period.split('-');
          cleanPeriod = `${parts[2]}/${parts[1]}`;
        } else if (p.period.length === 16) {
          const parts = p.period.split(' ');
          cleanPeriod = `${parts[1].split(':')[0]}h`;
        } else if (p.period.includes('-W')) {
          cleanPeriod = `S.${p.period.split('-W')[1]}`;
        } else if (p.period.length === 7) {
          const parts = p.period.split('-');
          cleanPeriod = `${parts[1]}/${parts[0].slice(2)}`;
        }
        
        return `
          <div style="flex: 1; min-width: 45px; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; position: relative;" title="${p.period}: ${fmt(p.val_total)} (${p.qty_total} itens)">
            <div style="color: var(--fin-text); font-size: 10px; font-weight: 700; margin-bottom: 6px;">R$ ${Math.round(p.val_total)}</div>
            <div style="${heightStyle} width: 60%; background: linear-gradient(180deg, #fc4b15 0%, #ff8e53 100%); border-radius: 6px 6px 0 0; box-shadow: 0 4px 6px -1px rgba(252, 75, 21, 0.15); transition: all 0.2s; cursor: pointer;" 
                 onmouseover="this.style.transform='scaleX(1.05)'; this.style.filter='brightness(1.1)';" onmouseout="this.style.transform='none'; this.style.filter='none';"></div>
            <div style="font-size: 10px; color: var(--fin-text-muted); font-weight: 500; margin-top: 8px; text-align: center; white-space: nowrap;">${cleanPeriod}</div>
          </div>
        `;
      }).join('');
    }

    // Render Products Table
    const prodTbody = document.getElementById('rep-tabela-produtos');
    if (report.soldItems.length === 0) {
      prodTbody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 20px; color: var(--fin-text-muted);">Nenhum produto vendido no período.</td></tr>`;
    } else {
      prodTbody.innerHTML = report.soldItems.map(p => `
        <tr style="border-bottom: 1px solid var(--fin-border);">
          <td style="padding: 12px; font-weight: 500; color: var(--fin-text);">${p.productName}</td>
          <td style="padding: 12px; text-align: center; font-weight: bold; color: var(--fin-text);">${p.qty}x</td>
          <td style="padding: 12px; text-align: right; color: #10b981; font-weight: bold;">${fmt(p.valTotal)}</td>
        </tr>
      `).join('');
    }

    // Render Detailed Orders Table
    const ordersTbody = document.getElementById('rep-tabela-pedidos');
    if (report.orders.length === 0) {
      ordersTbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 20px; color: var(--fin-text-muted);">Nenhum pedido correspondente.</td></tr>`;
    } else {
      ordersTbody.innerHTML = report.orders.map(o => {
        const dateFormatted = new Date(o.createdAt).toLocaleString('pt-BR');
        return `
          <tr style="border-bottom: 1px solid var(--fin-border);">
            <td style="padding: 12px; font-weight: bold; color: var(--fin-text);">#${o.id}</td>
            <td style="padding: 12px; color: var(--fin-text);">${o.productName}</td>
            <td style="padding: 12px; text-align: center; font-weight: bold; color: var(--fin-text);">${o.quantity}x</td>
            <td style="padding: 12px; color: var(--fin-text-muted);">${o.localName}</td>
            <td style="padding: 12px; color: var(--fin-text);">${o.clientName || '-'}</td>
            <td style="padding: 12px; color: var(--fin-text-muted);">${o.userName}</td>
            <td style="padding: 12px; color: var(--fin-text-muted);">${dateFormatted}</td>
            <td style="padding: 12px; color: var(--fin-text);">${o.paymentMethod || 'N/A'}</td>
            <td style="padding: 12px; text-align: right; font-weight: bold; color: #10b981;">${fmt(parseFloat(o.total))}</td>
            <td style="padding: 12px;"><span class="rep-status-badge ${o.status === 'Finalizado' ? 'status-ok' : 'status-cancel'}">${o.status}</span></td>
          </tr>
        `;
      }).join('');
    }

    // --- 1. RENDER CATEGORIES ---
    const catContainer = document.getElementById('rep-categorias-container');
    if (catContainer) {
      if (!report.categorySales || report.categorySales.length === 0) {
        catContainer.innerHTML = `<div style="color: var(--fin-text-muted); font-size:12px; font-style:italic;">Nenhuma venda registrada.</div>`;
      } else {
        const totalCat = report.categorySales.reduce((acc, curr) => acc + curr.valTotal, 0) || 1;
        catContainer.innerHTML = report.categorySales.map(c => {
          const pct = ((c.valTotal / totalCat) * 100).toFixed(1);
          return `
            <div>
              <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px; color: var(--fin-text);">
                <span>${c.categoria} <span style="color: var(--fin-text-muted); font-size:10px;">(${c.qty}x)</span></span>
                <span style="font-weight:600; color: var(--fin-text);">${fmt(c.valTotal)} <span style="font-weight:400; color: var(--fin-text-muted);">(${pct}%)</span></span>
              </div>
              <div class="rep-progress-track" style="width:100%; height:6px; background: var(--rep-track-bg, #f0f0f0); border-radius:3px; overflow:hidden;">
                <div style="width:${pct}%; height:100%; background:#fc4b15; border-radius:3px;"></div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // --- 2. RENDER SECTORS ---
    const secContainer = document.getElementById('rep-setores-container');
    if (secContainer) {
      if (!report.sectorSales || report.sectorSales.length === 0) {
        secContainer.innerHTML = `<div style="color: var(--fin-text-muted); font-size:12px; font-style:italic;">Nenhuma venda registrada.</div>`;
      } else {
        const totalSec = report.sectorSales.reduce((acc, curr) => acc + curr.valTotal, 0) || 1;
        secContainer.innerHTML = report.sectorSales.map(s => {
          const pct = ((s.valTotal / totalSec) * 100).toFixed(1);
          const color = s.setor === 'Bar' ? '#2d9cdb' : '#e67e22';
          return `
            <div>
              <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px; color: var(--fin-text);">
                <span>${s.setor} <span style="color: var(--fin-text-muted); font-size:10px;">(${s.qty}x)</span></span>
                <span style="font-weight:600; color: var(--fin-text);">${fmt(s.valTotal)} <span style="font-weight:400; color: var(--fin-text-muted);">(${pct}%)</span></span>
              </div>
              <div class="rep-progress-track" style="width:100%; height:6px; background: var(--rep-track-bg, #f0f0f0); border-radius:3px; overflow:hidden;">
                <div style="width:${pct}%; height:100%; background:${color}; border-radius:3px;"></div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // --- 3. RENDER WAITERS RANKING ---
    const garconsContainer = document.getElementById('rep-garcons-container');
    if (garconsContainer) {
      if (!report.waiterRanking || report.waiterRanking.length === 0) {
        garconsContainer.innerHTML = `<div style="color: var(--fin-text-muted); font-size:12px; font-style:italic;">Nenhum dado de garçom disponível.</div>`;
      } else {
        const maxSales = report.waiterRanking.reduce((acc, curr) => Math.max(acc, curr.totalSales), 0) || 1;
        garconsContainer.innerHTML = report.waiterRanking.map((g, idx) => {
          const pct = ((g.totalSales / maxSales) * 100).toFixed(1);
          const icon = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}º`;
          return `
            <div>
              <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px; color: var(--fin-text);">
                <span style="font-weight:500;">${icon} ${g.garcom} <span style="color: var(--fin-text-muted); font-size:10px; font-weight:normal;">(${g.totalOrders} pedidos)</span></span>
                <span style="font-weight:700; color: #a855f7;">${fmt(g.totalSales)}</span>
              </div>
              <div class="rep-progress-track" style="width:100%; height:6px; background: var(--rep-track-bg, #f0f0f0); border-radius:3px; overflow:hidden;">
                <div style="width:${pct}%; height:100%; background:#a855f7; border-radius:3px;"></div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // --- 4. RENDER VIP CLIENTS ---
    const vipsContainer = document.getElementById('rep-clientes-vip-container');
    if (vipsContainer) {
      if (!report.clientRanking || report.clientRanking.length === 0) {
        vipsContainer.innerHTML = `<div style="color: var(--fin-text-muted); font-size:12px; font-style:italic;">Nenhum cliente registrado.</div>`;
      } else {
        const maxSales = report.clientRanking.reduce((acc, curr) => Math.max(acc, curr.totalSales), 0) || 1;
        vipsContainer.innerHTML = report.clientRanking.slice(0, 5).map((c, idx) => {
          const pct = ((c.totalSales / maxSales) * 100).toFixed(1);
          return `
            <div>
              <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px; color: var(--fin-text);">
                <span>${idx + 1}º ${c.cliente} <span style="color: var(--fin-text-muted); font-size:10px;">(${c.totalOrders} pedidos)</span></span>
                <span style="font-weight:600; color:#f2994a;">${fmt(c.totalSales)}</span>
              </div>
              <div class="rep-progress-track" style="width:100%; height:4px; background: var(--rep-track-bg, #f0f0f0); border-radius:2px; overflow:hidden;">
                <div style="width:${pct}%; height:100%; background:#f2994a; border-radius:2px;"></div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // --- 5. RENDER LOSSES (CANCELLATIONS) ---
    const lossesPedidos = document.getElementById('rep-perdas-pedidos');
    const lossesValor = document.getElementById('rep-perdas-valor');
    if (lossesPedidos && lossesValor && report.cancellationStats) {
      lossesPedidos.innerText = `${report.cancellationStats.totalOrders} pedido(s) (${report.cancellationStats.totalItems} item(ns))`;
      lossesValor.innerText = fmt(report.cancellationStats.totalLosses || 0);
    }
  });

  // Report Sub-tabs inside advanced reports
  const btnSubProd = document.getElementById('rep-subtab-btn-produtos');
  const btnSubPed = document.getElementById('rep-subtab-btn-pedidos');
  const containerProd = document.getElementById('rep-container-produtos');
  const containerPed = document.getElementById('rep-container-pedidos');

  btnSubProd.addEventListener('click', () => {
    containerProd.style.display = 'block';
    containerPed.style.display = 'none';
    btnSubProd.classList.add('active');
    btnSubPed.classList.remove('active');
    btnSubProd.style.color = '#fc4b15';
    btnSubProd.style.borderBottom = '2px solid #fc4b15';
    btnSubPed.style.color = 'var(--fin-text-muted, #94a3b8)';
    btnSubPed.style.borderBottom = '2px solid transparent';
  });

  btnSubPed.addEventListener('click', () => {
    containerProd.style.display = 'none';
    containerPed.style.display = 'block';
    btnSubPed.classList.add('active');
    btnSubProd.classList.remove('active');
    btnSubPed.style.color = '#fc4b15';
    btnSubPed.style.borderBottom = '2px solid #fc4b15';
    btnSubProd.style.color = 'var(--fin-text-muted, #94a3b8)';
    btnSubProd.style.borderBottom = '2px solid transparent';
  });

  // Export Modal trigger
  document.getElementById('btn-exportar-relatorio').addEventListener('click', () => {
    document.getElementById('export-modal').style.display = 'flex';
  });

  // Export format clicks
  document.getElementById('btn-export-txt').addEventListener('click', () => exportData('txt'));
  document.getElementById('btn-export-pdf').addEventListener('click', () => exportData('pdf'));
  document.getElementById('btn-export-wa').addEventListener('click', () => exportData('wa'));
  document.getElementById('btn-export-sheets').addEventListener('click', () => exportData('sheets'));

  function exportData(format) {
    const data = window.lastReportData;
    if (!data) return alert('Por favor, filtre o relatório antes de exportar!');

    document.getElementById('export-modal').style.display = 'none';

    const startDate = dateInit.value;
    const endDate = dateEnd.value;
    const clientSelect = document.getElementById('relatorio-cliente');
    const clientName = clientSelect.options[clientSelect.selectedIndex]?.text || 'Todos';
    const waiterSelect = document.getElementById('relatorio-garcom');
    const waiterName = waiterSelect.options[waiterSelect.selectedIndex]?.text || 'Todos';
    const localFilter = document.getElementById('relatorio-mesa-comanda').value || 'Todas';

    if (format === 'txt') {
      let txt = `==================================================\n`;
      txt += `           RELATÓRIO FINANCEIRO AVANÇADO          \n`;
      txt += `==================================================\n\n`;
      txt += `Período: ${startDate || 'Início'} até ${endDate || 'Fim'}\n`;
      txt += `Filtro Cliente: ${clientName}\n`;
      txt += `Filtro Garçom: ${waiterName}\n`;
      txt += `Filtro Mesa/Comanda: ${localFilter}\n\n`;
      txt += `--------------------------------------------------\n`;
      txt += `INDICADORES PRINCIPAIS:\n`;
      txt += `--------------------------------------------------\n`;
      txt += `Faturamento Total: R$ ${data.kpi.totalSales.toFixed(2).replace('.', ',')}\n`;
      txt += `Itens Vendidos: ${data.kpi.totalItems}\n`;
      txt += `Total de Pedidos: ${data.kpi.totalOrders}\n`;
      txt += `Ticket Médio: R$ ${data.kpi.ticketMedio.toFixed(2).replace('.', ',')}\n\n`;
      
      txt += `--------------------------------------------------\n`;
      txt += `MEIOS DE PAGAMENTO:\n`;
      txt += `--------------------------------------------------\n`;
      data.paymentMethodsFiltered.forEach(p => {
        txt += `${p.metodo}: R$ ${p.total.toFixed(2).replace('.', ',')}\n`;
      });
      txt += `\n`;

      txt += `--------------------------------------------------\n`;
      txt += `PRODUTOS MAIS VENDIDOS:\n`;
      txt += `--------------------------------------------------\n`;
      data.soldItems.forEach(p => {
        txt += `${p.productName} - Qtd: ${p.qty}x - Total: R$ ${p.valTotal.toFixed(2).replace('.', ',')}\n`;
      });
      txt += `\n`;

      txt += `--------------------------------------------------\n`;
      txt += `DETALHAMENTO DE PEDIDOS:\n`;
      txt += `--------------------------------------------------\n`;
      data.orders.forEach(o => {
        const dateFormatted = new Date(o.createdAt).toLocaleString('pt-BR');
        txt += `#${o.id} - ${dateFormatted} - ${o.productName} (x${o.quantity}) - Total: R$ ${parseFloat(o.total).toFixed(2).replace('.', ',')} - Pagt: ${o.paymentMethod || 'N/A'} - Local: ${o.localName} - Garçom: ${o.userName} - Status: ${o.status}\n`;
      });

      const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio_avancado_${startDate || 'geral'}_a_${endDate || 'geral'}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    } else if (format === 'sheets') {
      let csv = `ID;Data;Produto;Quantidade;Valor Unitario;Valor Total;Mesa/Local;Cliente;Garcom;Forma Pagamento;Status\n`;
      let tsv = `ID\tData\tProduto\tQuantidade\tValor Unitario\tValor Total\tMesa/Local\tCliente\tGarcom\tForma Pagamento\tStatus\n`;
      
      data.orders.forEach(o => {
        const dateFormatted = new Date(o.createdAt).toLocaleString('pt-BR');
        const totalVal = parseFloat(o.total);
        const unitVal = o.quantity > 0 ? (totalVal / o.quantity) : 0;
        const localClean = o.localName || 'N/A';
        const clientClean = o.clientName || 'N/A';
        const userClean = o.userName || 'N/A';
        const payClean = o.paymentMethod || 'N/A';
        
        csv += `${o.id};"${dateFormatted}";"${o.productName.replace(/"/g, '""')}";${o.quantity};${unitVal.toFixed(2).replace('.', ',')};${totalVal.toFixed(2).replace('.', ',')};"${localClean}";"${clientClean.replace(/"/g, '""')}";"${userClean.replace(/"/g, '""')}";"${payClean}";"${o.status}"\n`;
        tsv += `${o.id}\t${dateFormatted}\t${o.productName}\t${o.quantity}\t${unitVal.toFixed(2).replace('.', ',')}\t${totalVal.toFixed(2).replace('.', ',')}\t${localClean}\t${clientClean}\t${userClean}\t${payClean}\t${o.status}\n`;
      });

      // 1. Download CSV File
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio_avancado_${startDate || 'geral'}_a_${endDate || 'geral'}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // 2. Copy TSV to Clipboard for direct paste in Excel/Google Sheets
      navigator.clipboard.writeText(tsv).then(() => {
        alert('Planilha exportada com sucesso!\n\n1. O arquivo CSV foi baixado para o seu dispositivo.\n2. Os dados também foram copiados para a área de transferência! Você pode simplesmente abrir o Google Sheets (ou Excel) e pressionar CTRL+V para colar as colunas organizadas.');
      }).catch(err => {
        alert('Planilha exportada com sucesso!\nO arquivo CSV foi baixado. (Nota: Não foi possível copiar para a área de transferência automaticamente).');
      });

    } else if (format === 'wa') {
      let msg = `📊 *RELATÓRIO FINANCEIRO AVANÇADO*\n`;
      msg += `📅 *Período:* ${startDate || 'Início'} a ${endDate || 'Fim'}\n`;
      msg += `👤 *Cliente:* ${clientName} | 🤵 *Garçom:* ${waiterName}\n`;
      msg += `📍 *Mesa/Comanda:* ${localFilter}\n\n`;
      
      msg += `📈 *Indicadores Principais:*\n`;
      msg += `• Faturamento Total: *R$ ${data.kpi.totalSales.toFixed(2).replace('.', ',')}*\n`;
      msg += `• Itens Vendidos: *${data.kpi.totalItems}*\n`;
      msg += `• Total de Pedidos: *${data.kpi.totalOrders}*\n`;
      msg += `• Ticket Médio: *R$ ${data.kpi.ticketMedio.toFixed(2).replace('.', ',')}*\n\n`;

      msg += `💳 *Meios de Pagamento:*\n`;
      data.paymentMethodsFiltered.forEach(p => {
        msg += `• ${p.metodo}: *R$ ${p.total.toFixed(2).replace('.', ',')}*\n`;
      });
      msg += `\n`;

      msg += `🍕 *Produtos Mais Vendidos:*\n`;
      data.soldItems.slice(0, 5).forEach((p, idx) => {
        msg += `${idx + 1}. ${p.productName} (${p.qty}x) - *R$ ${p.valTotal.toFixed(2).replace('.', ',')}*\n`;
      });

      const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
      window.open(url, '_blank');

    } else if (format === 'pdf') {
      const printArea = document.getElementById('relatorio-print-area');
      const fmt = (v) => `R$ ${v.toFixed(2).replace('.', ',')}`;
      
      let html = `
        <div style="text-align: center; margin-bottom: 30px; font-family: sans-serif;">
          <h1 style="margin: 0; font-size: 24px; color: #333;">CHEF COZINHA - RELATÓRIO FINANCEIRO</h1>
          <p style="margin: 5px 0; color: #666; font-size: 14px;">Gerado em: ${new Date().toLocaleString('pt-BR')}</p>
          <hr style="border: 0; border-top: 1px solid #ddd; margin-top: 15px;">
        </div>
        
        <div style="margin-bottom: 25px; font-family: sans-serif; font-size: 13px; line-height: 1.6;">
          <strong>Filtros Selecionados:</strong><br>
          • Período: ${startDate || 'Início'} a ${endDate || 'Fim'}<br>
          • Cliente: ${clientName} | • Garçom: ${waiterName}<br>
          • Mesa/Comanda: ${localFilter}
        </div>

        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 30px; font-family: sans-serif;">
          <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; border: 1px solid #eee; text-align: center;">
            <span style="color: gray; font-size: 12px;">Total Faturado</span>
            <div style="font-size: 20px; font-weight: bold; margin-top: 5px; color: #3ab55b;">${fmt(data.kpi.totalSales)}</div>
          </div>
          <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; border: 1px solid #eee; text-align: center;">
            <span style="color: gray; font-size: 12px;">Itens Vendidos</span>
            <div style="font-size: 20px; font-weight: bold; margin-top: 5px; color: #333;">${data.kpi.totalItems}</div>
          </div>
          <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; border: 1px solid #eee; text-align: center;">
            <span style="color: gray; font-size: 12px;">Total Pedidos</span>
            <div style="font-size: 20px; font-weight: bold; margin-top: 5px; color: #fc4b15;">${data.kpi.totalOrders}</div>
          </div>
          <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; border: 1px solid #eee; text-align: center;">
            <span style="color: gray; font-size: 12px;">Ticket Médio</span>
            <div style="font-size: 20px; font-weight: bold; margin-top: 5px; color: #8e44ad;">${fmt(data.kpi.ticketMedio)}</div>
          </div>
        </div>

        <div style="margin-bottom: 30px; font-family: sans-serif;">
          <h3 style="margin-top: 0; border-bottom: 2px solid #333; padding-bottom: 5px;">MEIOS DE PAGAMENTO (FILTRADO)</h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
              <tr style="background: #f0f0f0; border-bottom: 1px solid #ccc;">
                <th style="padding: 8px; text-align: left;">Método</th>
                <th style="padding: 8px; text-align: right;">Total Recebido</th>
              </tr>
            </thead>
            <tbody>
      `;

      data.paymentMethodsFiltered.forEach(p => {
        html += `
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 8px;">${p.metodo}</td>
            <td style="padding: 8px; text-align: right; font-weight: bold;">${fmt(p.total)}</td>
          </tr>
        `;
      });

      html += `
            </tbody>
          </table>
        </div>

        <div style="margin-bottom: 30px; font-family: sans-serif;">
          <h3 style="border-bottom: 2px solid #333; padding-bottom: 5px;">ITENS MAIS VENDIDOS</h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
              <tr style="background: #f0f0f0; border-bottom: 1px solid #ccc;">
                <th style="padding: 8px; text-align: left;">Produto</th>
                <th style="padding: 8px; text-align: center;">Qtd</th>
                <th style="padding: 8px; text-align: right;">Valor Total</th>
              </tr>
            </thead>
            <tbody>
      `;

      data.soldItems.forEach(p => {
        html += `
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 8px;">${p.productName}</td>
            <td style="padding: 8px; text-align: center;">${p.qty}x</td>
            <td style="padding: 8px; text-align: right;">${fmt(p.valTotal)}</td>
          </tr>
        `;
      });

      html += `
            </tbody>
          </table>
        </div>

        <div style="font-family: sans-serif; page-break-before: always;">
          <h3 style="border-bottom: 2px solid #333; padding-bottom: 5px;">LISTA DETALHADA DE PEDIDOS</h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <thead>
              <tr style="background: #f0f0f0; border-bottom: 1px solid #ccc;">
                <th style="padding: 6px; text-align: left;">ID</th>
                <th style="padding: 6px; text-align: left;">Data</th>
                <th style="padding: 6px; text-align: left;">Produto</th>
                <th style="padding: 6px; text-align: center;">Qtd</th>
                <th style="padding: 6px; text-align: right;">Total</th>
                <th style="padding: 6px; text-align: left;">Mesa</th>
                <th style="padding: 6px; text-align: left;">Cliente</th>
                <th style="padding: 6px; text-align: left;">Pagt.</th>
                <th style="padding: 6px; text-align: left;">Status</th>
              </tr>
            </thead>
            <tbody>
      `;

      data.orders.forEach(o => {
        const dateFormatted = new Date(o.createdAt).toLocaleString('pt-BR');
        html += `
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 6px;">#${o.id}</td>
            <td style="padding: 6px; white-space: nowrap;">${dateFormatted}</td>
            <td style="padding: 6px;">${o.productName}</td>
            <td style="padding: 6px; text-align: center;">${o.quantity}</td>
            <td style="padding: 6px; text-align: right;">${fmt(parseFloat(o.total))}</td>
            <td style="padding: 6px;">${o.localName}</td>
            <td style="padding: 6px;">${o.clientName || '-'}</td>
            <td style="padding: 6px;">${o.paymentMethod || '-'}</td>
            <td style="padding: 6px;">${o.status}</td>
          </tr>
        `;
      });

      html += `
            </tbody>
          </table>
        </div>
      `;

      printArea.innerHTML = html;
      document.getElementById('fechamento-print-area').classList.remove('print-active');
      printArea.classList.add('print-active');
      
      window.print();
      
      printArea.classList.remove('print-active');
    }
  }

  // Auto-switch to Relatório Avançado tab if query param or hash is set
  if (window.location.search.includes('tab=relatorio') || window.location.hash === '#relatorio') {
    if (typeof tabRelatorio !== 'undefined') {
      tabRelatorio.click();
    }
  }

  // ========================================
  // ENVIAR AO CONTADOR - Tab 3
  // ========================================

  // Load saved contact info from localStorage
  const cntNome = document.getElementById('cnt-nome');
  const cntWhatsapp = document.getElementById('cnt-whatsapp');
  const cntEmail = document.getElementById('cnt-email');
  const cntDataInicio = document.getElementById('cnt-data-inicio');
  const cntDataFim = document.getElementById('cnt-data-fim');

  try {
    const saved = JSON.parse(localStorage.getItem('chef_contador_info') || '{}');
    if (saved.nome) cntNome.value = saved.nome;
    if (saved.whatsapp) cntWhatsapp.value = saved.whatsapp;
    if (saved.email) cntEmail.value = saved.email;
  } catch (e) {}

  function saveCntContact() {
    localStorage.setItem('chef_contador_info', JSON.stringify({
      nome: cntNome.value,
      whatsapp: cntWhatsapp.value,
      email: cntEmail.value
    }));
  }
  [cntNome, cntWhatsapp, cntEmail].forEach(el => el.addEventListener('change', saveCntContact));

  // Set default dates
  const cntFirstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  cntDataInicio.value = formatISODate(cntFirstDay);
  cntDataFim.value = formatISODate(now);

  // Current data stores
  let cntCaixaStats = null;
  let cntReportData = null;

  // Carregar Dados button
  document.getElementById('cnt-btn-carregar').addEventListener('click', () => {
    saveCntContact();
    const statusEl = document.getElementById('cnt-status');
    statusEl.innerText = 'Carregando dados...';
    statusEl.style.color = '#fc4b15';

    // Always have caixa stats
    cntCaixaStats = window.currentCaixaStats || null;

    // Request advanced report for the period
    const filter = {
      startDate: cntDataInicio.value,
      endDate: cntDataFim.value,
      groupBy: 'day',
      clientFilter: '',
      waiterFilter: '',
      localFilter: ''
    };
    socket.emit('get_advanced_relatorio', filter);
  });

  // Receive advanced report for contador — piggyback on existing handler
  // The existing advanced_relatorio_data handler already stores data in window.lastReportData
  // We just need to also capture it for the contador section

  // Store contador report data whenever advanced report is loaded
  socket.on('advanced_relatorio_data', (report) => {
    cntReportData = report;
    renderCntPagamentosFiltros();
    if (secContador && secContador.style.display === 'block') {
      document.getElementById('cnt-status').innerText = `Dados atualizados — ${new Date().toLocaleTimeString('pt-BR')}`;
      document.getElementById('cnt-status').style.color = '#10b981';
      renderCntPreview();
    }
  });

  // Populate payment method sub-checkboxes when data arrives
  function renderCntPagamentosFiltros() {
    const container = document.getElementById('cnt-pagamentos-filtros');
    const mainCb = document.getElementById('cnt-ck-pagamentos');
    if (!container || !cntReportData) return;

    const pays = (cntReportData.paymentMethodsFiltered || []).filter(p => p.total > 0);
    if (pays.length === 0) {
      container.style.display = 'none';
      return;
    }

    container.style.display = mainCb.checked ? 'flex' : 'none';
    container.innerHTML = '';

    // Select all / none toggle
    const toggleRow = document.createElement('label');
    toggleRow.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;color:#64748b;cursor:pointer;padding:2px 4px;border-radius:4px;';
    toggleRow.innerHTML = `<a id="cnt-pag-toggle" style="color:#fc4b15;text-decoration:underline;cursor:pointer;font-size:11px;">Marcar Todas</a>`;
    container.appendChild(toggleRow);

    pays.forEach(p => {
      const lbl = document.createElement('label');
      lbl.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;color:#475569;cursor:pointer;padding:3px 6px;border-radius:4px;transition:background 0.15s;';
      lbl.onmouseover = () => lbl.style.background = '#f1f5f9';
      lbl.onmouseout = () => lbl.style.background = 'transparent';
      const pct = ((p.total / pays.reduce((a, c) => a + c.total, 0)) * 100).toFixed(1);
      lbl.innerHTML = `<input type="checkbox" class="cnt-ck-pgmt-method" value="${escHtml(p.metodo)}" checked style="accent-color:#10b981;width:14px;height:14px;"> ${escHtml(p.metodo)} <span style="color:#94a3b8;font-size:11px;">(${pct}%)</span>`;
      container.appendChild(lbl);
    });

    // Toggle handler
    const toggleBtn = document.getElementById('cnt-pag-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const boxes = container.querySelectorAll('.cnt-ck-pgmt-method');
        const allChecked = [...boxes].every(b => b.checked);
        boxes.forEach(b => b.checked = !allChecked);
        toggleBtn.textContent = allChecked ? 'Marcar Todas' : 'Nenhuma';
        renderCntPreview();
      });
    }

    // Each sub-checkbox triggers preview update
    container.querySelectorAll('.cnt-ck-pgmt-method').forEach(cb => {
      cb.addEventListener('change', () => renderCntPreview());
    });
  }

  // Show/hide sub-checkboxes when main payment checkbox toggles
  const mainPagCb = document.getElementById('cnt-ck-pagamentos');
  if (mainPagCb) {
    mainPagCb.addEventListener('change', () => {
      const container = document.getElementById('cnt-pagamentos-filtros');
      if (container) container.style.display = mainPagCb.checked ? 'flex' : 'none';
      renderCntPreview();
    });
  }

  function renderCntPreview() {
    const preview = document.getElementById('cnt-preview');
    const text = gerarTextoContador();
    preview.textContent = text;
  }

  function gerarTextoContador() {
    const fmt = (v) => `R$ ${(v || 0).toFixed(2).replace('.', ',')}`;
    const nomeContador = cntNome.value || 'Contador(a)';
    const dataIni = cntDataInicio.value || 'N/I';
    const dataFim = cntDataFim.value || 'N/I';
    const gerente = window.loggedInUser || window.crmPerfil?.nome || 'Não informado';
    const dataAtual = new Date().toLocaleString('pt-BR');

    let sections = [];

    // Header
    sections.push(`=========================================================`);
    sections.push(`  RELATÓRIO FINANCEIRO — ENVIO AO CONTADOR`);
    sections.push(`=========================================================`);
    sections.push(`Restaurante: ${localStorage.getItem('restaurantName') || 'Chef Cozinha'}`);
    sections.push(`Contador(a): ${nomeContador}`);
    sections.push(`Gerente Responsável: ${gerente}`);
    sections.push(`Período: ${dataIni} até ${dataFim}`);
    sections.push(`Data de Geração: ${dataAtual}`);
    sections.push(`=========================================================\n`);

    // 1. Resumo do Turno
    if (document.getElementById('cnt-ck-resumo').checked && cntCaixaStats) {
      const s = cntCaixaStats;
      const faturado = (s.total_dinheiro || 0) + (s.total_pix || 0) + (s.total_credito || 0) + (s.total_debito || 0) + (s.total_fiado || 0);
      const gaveta = (s.fundo_troco || 0) + (s.total_dinheiro || 0) + (s.total_suprimento || 0) - (s.total_sangria || 0);

      sections.push(`---------------------------------------------------------`);
      sections.push(`1. RESUMO DO TURNO ATUAL`);
      sections.push(`---------------------------------------------------------`);
      sections.push(`  Turno ID:            #${s.turno_id || 'N/I'}`);
      sections.push(`  Fundo de Troco:      ${fmt(s.fundo_troco)}`);
      sections.push(`  Dinheiro em Gaveta:  ${fmt(gaveta)}`);
      sections.push(`  Total Faturado:      ${fmt(faturado)}`);
      sections.push(`  Sangrias (Saídas):   ${fmt(s.total_sangria)}`);
      sections.push(`  Suprimentos (Entr.): ${fmt(s.total_suprimento)}`);
      sections.push(`  Total Pedidos:       ${s.total_pedidos || 0}`);
      sections.push(`  Itens Vendidos:      ${s.total_itens_vendidos || 0}\n`);
    }

    // 2. KPIs
    if (document.getElementById('cnt-ck-kpis').checked && cntReportData) {
      const k = cntReportData.kpi;
      const ticket = k.totalOrders > 0 ? (k.totalSales / k.totalOrders) : 0;
      sections.push(`---------------------------------------------------------`);
      sections.push(`2. INDICADORES DE DESEMPENHO (KPIs)`);
      sections.push(`---------------------------------------------------------`);
      sections.push(`  Total Faturado:   ${fmt(k.totalSales)}`);
      sections.push(`  Itens Vendidos:   ${k.totalItems || 0}`);
      sections.push(`  Pedidos Realiz.:  ${k.totalOrders || 0}`);
      sections.push(`  Ticket Médio:     ${fmt(ticket)}\n`);
    }

    // 3. Meios de Pagamento
    if (document.getElementById('cnt-ck-pagamentos').checked && cntReportData) {
      const allPays = (cntReportData.paymentMethodsFiltered || []).filter(p => p.total > 0);
      const selectedMethods = [...document.querySelectorAll('.cnt-ck-pgmt-method:checked')].map(cb => cb.value);
      const pays = selectedMethods.length > 0 ? allPays.filter(p => selectedMethods.includes(p.metodo)) : allPays;
      const totalPays = pays.reduce((a, c) => a + c.total, 0) || 1;
      sections.push(`---------------------------------------------------------`);
      sections.push(`3. MEIOS DE PAGAMENTO (DETALHADO)`);
      sections.push(`---------------------------------------------------------`);
      pays.forEach(p => {
        const pct = ((p.total / totalPays) * 100).toFixed(1);
        sections.push(`  ${p.metodo.padEnd(14)} ${fmt(p.total).padStart(14)}  (${pct}%)`);
      });
      sections.push(`  ${'TOTAL'.padEnd(14)} ${fmt(totalPays).padStart(14)}  (100.0%)\n`);
    }

    // 4. Produtos Mais Vendidos
    if (document.getElementById('cnt-ck-produtos').checked && cntReportData) {
      sections.push(`---------------------------------------------------------`);
      sections.push(`4. PRODUTOS MAIS VENDIDOS`);
      sections.push(`---------------------------------------------------------`);
      sections.push(`  ${'Produto'.padEnd(30)} ${'Qtd'.padStart(5)} ${'Total'.padStart(14)}`);
      sections.push(`  ${'-'.repeat(30)} ${'-'.repeat(5)} ${'-'.repeat(14)}`);
      (cntReportData.soldItems || []).slice(0, 30).forEach(p => {
        sections.push(`  ${p.productName.substring(0, 30).padEnd(30)} ${(p.qty + 'x').padStart(5)} ${fmt(p.valTotal).padStart(14)}`);
      });
      sections.push('');
    }

    // 5. Lista de Pedidos
    if (document.getElementById('cnt-ck-pedidos').checked && cntReportData) {
      sections.push(`---------------------------------------------------------`);
      sections.push(`5. LISTA DE PEDIDOS`);
      sections.push(`---------------------------------------------------------`);
      sections.push(`  ${'#ID'.padEnd(6)} ${'Data'.padEnd(18)} ${'Produto'.padEnd(22)} ${'Qtd'.padStart(3)} ${'Mesa'.padEnd(12)} ${'Pagt.'.padEnd(10)} ${'Valor'.padStart(12)} ${'Status'}`);
      sections.push(`  ${'-'.repeat(6)} ${'-'.repeat(18)} ${'-'.repeat(22)} ${'-'.repeat(3)} ${'-'.repeat(12)} ${'-'.repeat(10)} ${'-'.repeat(12)} ${'-'.repeat(10)}`);
      (cntReportData.orders || []).forEach(o => {
        const d = new Date(o.createdAt).toLocaleString('pt-BR');
        sections.push(`  ${('#' + o.id).padEnd(6)} ${d.substring(0, 18).padEnd(18)} ${(o.productName || '').substring(0, 22).padEnd(22)} ${(o.quantity + '').padStart(3)} ${(o.localName || '').substring(0, 12).padEnd(12)} ${(o.paymentMethod || 'N/A').substring(0, 10).padEnd(10)} ${fmt(parseFloat(o.total)).padStart(12)} ${(o.status || '').substring(0, 10)}`);
      });
      sections.push('');
    }

    // 6. Categorias e Setores
    if (document.getElementById('cnt-ck-categorias').checked && cntReportData) {
      sections.push(`---------------------------------------------------------`);
      sections.push(`6. VENDAS POR CATEGORIA E SETOR`);
      sections.push(`---------------------------------------------------------`);
      if (cntReportData.categorySales && cntReportData.categorySales.length > 0) {
        sections.push(`  Categorias:`);
        cntReportData.categorySales.forEach(c => {
          sections.push(`    ${c.categoria.padEnd(20)} ${fmt(c.valTotal).padStart(14)}  (${c.qty}x)`);
        });
      }
      if (cntReportData.sectorSales && cntReportData.sectorSales.length > 0) {
        sections.push(`  Setores de Preparo:`);
        cntReportData.sectorSales.forEach(s => {
          sections.push(`    ${s.setor.padEnd(20)} ${fmt(s.valTotal).padStart(14)}  (${s.qty}x)`);
        });
      }
      sections.push('');
    }

    // 7. Garçons
    if (document.getElementById('cnt-ck-garcons').checked && cntReportData) {
      sections.push(`---------------------------------------------------------`);
      sections.push(`7. DESEMPENHO DA EQUIPE (GARÇONS)`);
      sections.push(`---------------------------------------------------------`);
      if (cntReportData.waiterRanking && cntReportData.waiterRanking.length > 0) {
        (cntReportData.waiterRanking || []).forEach((g, idx) => {
          sections.push(`  ${idx + 1}º ${g.garcom.padEnd(20)} ${fmt(g.totalSales).padStart(14)}  (${g.totalOrders} pedidos)`);
        });
      } else {
        sections.push(`  Nenhum dado disponível.`);
      }
      sections.push('');
    }

    // 8. Movimentações do Caixa
    if (document.getElementById('cnt-ck-movimentacoes').checked && cntCaixaStats) {
      sections.push(`---------------------------------------------------------`);
      sections.push(`8. MOVIMENTAÇÕES DO CAIXA (SANGRIAS / SUPRIMENTOS)`);
      sections.push(`---------------------------------------------------------`);
      const hist = cntCaixaStats.historico || [];
      if (hist.length > 0) {
        sections.push(`  ${'#ID'.padEnd(6)} ${'Tipo'.padEnd(12)} ${'Descrição'.padEnd(30)} ${'Forma'.padEnd(12)} ${'Data/Hora'.padEnd(20)} ${'Valor'.padStart(12)}`);
        sections.push(`  ${'-'.repeat(6)} ${'-'.repeat(12)} ${'-'.repeat(30)} ${'-'.repeat(12)} ${'-'.repeat(20)} ${'-'.repeat(12)}`);
        hist.forEach(h => {
          const d = new Date(h.data).toLocaleString('pt-BR');
          sections.push(`  ${('#' + h.id).padEnd(6)} ${(h.tipo || '').padEnd(12)} ${(h.descricao || '-').substring(0, 30).padEnd(30)} ${(h.forma_pagamento || '-').padEnd(12)} ${d.substring(0, 20).padEnd(20)} ${fmt(h.valor).padStart(12)}`);
        });
      } else {
        sections.push(`  Nenhuma movimentação registrada.`);
      }
      sections.push('');
    }

    // 9. Cancelamentos
    if (document.getElementById('cnt-ck-cancelamentos').checked && cntReportData && cntReportData.cancellationStats) {
      const c = cntReportData.cancellationStats;
      sections.push(`---------------------------------------------------------`);
      sections.push(`9. CANCELAMENTOS E PERDAS`);
      sections.push(`---------------------------------------------------------`);
      sections.push(`  Pedidos Cancelados:  ${c.totalOrders || 0}`);
      sections.push(`  Itens Cancelados:    ${c.totalItems || 0}`);
      sections.push(`  Valor Total Perdido: ${fmt(c.totalLosses || 0)}\n`);
    }

    sections.push(`=========================================================`);
    sections.push(`FIM DO RELATÓRIO`);
    sections.push(`=========================================================`);

    return sections.join('\n');
  }

  // Send via WhatsApp
  document.getElementById('btn-contador-whatsapp').addEventListener('click', () => {
    saveCntContact();
    const phone = cntWhatsapp.value.replace(/\D/g, '');
    if (!phone) return alert('Informe o WhatsApp do contador nos dados acima.');
    const text = gerarTextoContador();
    window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(text)}`, '_blank');
  });

  // Send via Email
  document.getElementById('btn-contador-email').addEventListener('click', () => {
    saveCntContact();
    const email = cntEmail.value.trim();
    if (!email) return alert('Informe o e-mail do contador nos dados acima.');
    const text = gerarTextoContador();
    const subject = encodeURIComponent(`Relatório Financeiro — Chef Cozinha — ${cntDataInicio.value || ''} a ${cntDataFim.value || ''}`);
    const body = encodeURIComponent(text);
    window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');
  });

  // Copy to Clipboard
  document.getElementById('btn-contador-copiar').addEventListener('click', () => {
    saveCntContact();
    const text = gerarTextoContador();
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('btn-contador-copiar');
      const orig = btn.innerHTML;
      btn.innerHTML = '<i class="ph ph-check"></i> Copiado!';
      btn.style.background = '#10b981';
      setTimeout(() => { btn.innerHTML = orig; btn.style.background = '#8b5cf6'; }, 2000);
    }).catch(() => {
      alert('Não foi possível copiar. Tente selecionar manualmente o texto na pré-visualização.');
    });
  });

  // Download TXT
  document.getElementById('btn-contador-download').addEventListener('click', () => {
    saveCntContact();
    const text = gerarTextoContador();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-contador_${cntDataInicio.value || 'geral'}_a_${cntDataFim.value || 'geral'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  });

// ══════════════════════════════════════════════════════════════════
  // FUNÇÕES DE DRE GERENCIAL & RESULTADO DO EXERCÍCIO
  // ══════════════════════════════════════════════════════════════════

  async function carregarDRE(periodo) {
    const sel = document.getElementById('dre-filtro-periodo');
    const p = periodo || (sel ? sel.value : 'mes');
    const label = document.getElementById('dre-periodo-label');
    if (label) label.innerText = 'Carregando DRE...';

    const fmt = (v) => 'R$ ' + (parseFloat(v) || 0).toFixed(2).replace('.', ',');

    try {
      const res = await fetch('/api/financeiro/dre?periodo=' + encodeURIComponent(p));
      const data = await res.json();
      if (!data.ok) throw new Error(data.erro || 'Falha ao buscar DRE');

      if (label) label.innerText = 'Período: ' + data.periodo.inicio + ' até ' + data.periodo.fim;

      const kpis = data.kpis || {};
      const setEl = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
      };

      setEl('dre-kpi-bruta', fmt(kpis.receita_bruta));
      setEl('dre-kpi-deducoes', fmt(kpis.deducoes_taxas));
      setEl('dre-kpi-cmv', fmt(kpis.cmv_total));
      setEl('dre-kpi-cmv-pct', (kpis.cmv_pct_receita || 0).toFixed(1) + '% da receita bruta');
      setEl('dre-kpi-margem', fmt(kpis.margem_contribuicao));
      setEl('dre-kpi-margem-pct', (kpis.margem_contribuicao_pct || 0).toFixed(1) + '% margem líquida');
      setEl('dre-kpi-despesas', fmt(kpis.despesas_operacionais_fixas));
      setEl('dre-kpi-lucro', fmt(kpis.lucro_liquido_real));

      // ── Termômetro do Ponto de Equilíbrio (Break-Even) ──
      const recLiq = parseFloat(kpis.receita_liquida) || 0;
      const ptEquilibrio = parseFloat(kpis.ponto_equilibrio_estimado) || 0;
      const pctCob = ptEquilibrio > 0 ? (recLiq / ptEquilibrio) * 100 : 0;

      setEl('dre-pe-receita-atual', fmt(recLiq));
      setEl('dre-pe-valor-meta', fmt(ptEquilibrio));
      setEl('dre-pe-pct-cobertura', Math.round(pctCob) + '% coberto');

      const peBar = document.getElementById('dre-pe-progresso-bar');
      if (peBar) {
        peBar.style.width = Math.min(100, Math.max(0, pctCob)) + '%';
        peBar.style.background = pctCob >= 100 ? 'linear-gradient(90deg, #10b981, #059669)' : 'linear-gradient(90deg, #f59e0b, #10b981)';
      }

      const peBadge = document.getElementById('dre-pe-badge-status');
      const peDesc = document.getElementById('dre-pe-descricao-status');
      if (peBadge && peDesc) {
        if (pctCob >= 100) {
          const sobra = recLiq - ptEquilibrio;
          peBadge.innerText = '🟢 Ponto de Equilíbrio Superado (+ ' + fmt(sobra) + ')';
          peBadge.style.background = '#dcfce7';
          peBadge.style.color = '#15803d';
          peDesc.innerText = 'Excelente! Sua operação já superou os custos fixos deste período e está gerando lucro líquido real de forma consolidada.';
        } else {
          const falta = ptEquilibrio - recLiq;
          peBadge.innerText = '🟡 Em Cobertura (' + pctCob.toFixed(1) + '% atingido)';
          peBadge.style.background = '#fef3c7';
          peBadge.style.color = '#b45309';
          peDesc.innerText = 'Faltam ' + fmt(falta) + ' em receita líquida para alcançar o Ponto de Equilíbrio e cobrir todos os custos operacionais.';
        }
      }

      const lucroEl = document.getElementById('dre-kpi-lucro');
      if (lucroEl) lucroEl.style.color = kpis.lucro_liquido_real >= 0 ? '#16a34a' : '#dc2626';

      const lucroPctEl = document.getElementById('dre-kpi-lucro-pct');
      if (lucroPctEl) {
        lucroPctEl.innerText = 'Margem Líquida: ' + (kpis.margem_liquida_pct || 0).toFixed(1) + '%';
        lucroPctEl.style.color = kpis.lucro_liquido_real >= 0 ? '#16a34a' : '#dc2626';
      }

      // Preencher Tabela Contábil Detalhada
      const tbody = document.getElementById('dre-tabela-corpo');
      if (tbody) {
        const linhas = [
          { nome: '(+) RECEITA BRUTA DE VENDAS', valor: kpis.receita_bruta, pct: 100, cor: '#0f172a', bold: true, bg: 'rgba(0,0,0,0.02)' },
          { nome: '  • Vendas Dinheiro', valor: data.formas_pagamento.dinheiro, pct: kpis.receita_bruta > 0 ? (data.formas_pagamento.dinheiro / kpis.receita_bruta)*100 : 0 },
          { nome: '  • Vendas PIX', valor: data.formas_pagamento.pix, pct: kpis.receita_bruta > 0 ? (data.formas_pagamento.pix / kpis.receita_bruta)*100 : 0 },
          { nome: '  • Vendas Cartão Crédito', valor: data.formas_pagamento.credito, pct: kpis.receita_bruta > 0 ? (data.formas_pagamento.credito / kpis.receita_bruta)*100 : 0 },
          { nome: '  • Vendas Cartão Débito', valor: data.formas_pagamento.debito, pct: kpis.receita_bruta > 0 ? (data.formas_pagamento.debito / kpis.receita_bruta)*100 : 0 },
          { nome: '  • Vendas Fiado / Outros', valor: data.formas_pagamento.fiado, pct: kpis.receita_bruta > 0 ? (data.formas_pagamento.fiado / kpis.receita_bruta)*100 : 0 },
          { nome: '(-) DEDUÇÕES DA RECEITA & TAXAS', valor: -kpis.deducoes_taxas, pct: kpis.receita_liquida > 0 ? (kpis.deducoes_taxas / kpis.receita_liquida)*100 : 0, cor: '#dc2626', bold: true },
          { nome: '(=) RECEITA OPERACIONAL LÍQUIDA', valor: kpis.receita_liquida, pct: 100, cor: '#0284c7', bold: true, bg: 'rgba(2, 132, 199, 0.06)' },
          { nome: '(-) CUSTO DAS MERCADORIAS VENDIDAS (CMV)', valor: -kpis.cmv_total, pct: kpis.receita_liquida > 0 ? (kpis.cmv_total / kpis.receita_liquida)*100 : 0, cor: '#d97706', bold: true },
          { nome: '(=) MARGEM DE CONTRIBUIÇÃO', valor: kpis.margem_contribuicao, pct: kpis.receita_liquida > 0 ? (kpis.margem_contribuicao / kpis.receita_liquida)*100 : 0, cor: '#3b82f6', bold: true, bg: 'rgba(59, 130, 246, 0.06)' },
          { nome: '(-) DESPESAS FIXAS & OPERACIONAIS', valor: -kpis.despesas_operacionais_fixas, pct: kpis.receita_liquida > 0 ? (kpis.despesas_operacionais_fixas / kpis.receita_liquida)*100 : 0, cor: '#8b5cf6', bold: true }
        ];

        // Linhas de despesas detalhadas por categoria
        (data.detalhes_despesas || []).forEach(d => {
          linhas.push({
            nome: '  • ' + d.categoria,
            valor: -d.total,
            pct: kpis.receita_liquida > 0 ? (d.total / kpis.receita_liquida)*100 : 0,
            cor: '#64748b'
          });
        });

        linhas.push({
          nome: '(=) LUCRO LÍQUIDO DO EXERCÍCIO (RESULTADO REAL)',
          valor: kpis.lucro_liquido_real,
          pct: kpis.receita_liquida > 0 ? (kpis.lucro_liquido_real / kpis.receita_liquida)*100 : 0,
          cor: kpis.lucro_liquido_real >= 0 ? '#15803d' : '#b91c1c',
          bold: true,
          bg: kpis.lucro_liquido_real >= 0 ? 'rgba(22, 163, 74, 0.12)' : 'rgba(220, 38, 38, 0.12)',
          destaque: true
        });

        linhas.push({
          nome: '⭐ PONTO DE EQUILÍBRIO ESTIMADO (BREAK-EVEN)',
          valor: kpis.ponto_equilibrio_estimado,
          pct: null,
          cor: '#f59e0b',
          bold: true,
          bg: 'rgba(245, 158, 11, 0.06)'
        });

        tbody.innerHTML = linhas.map(l => {
          const valStr = l.valor < 0 ? '- ' + fmt(Math.abs(l.valor)) : fmt(l.valor);
          const pctStr = l.pct !== null ? l.pct.toFixed(1) + '%' : '-';
          const barWidth = Math.min(100, Math.max(0, l.pct || 0));
          return '<tr style="border-bottom: 1px solid var(--fin-border); background: ' + (l.bg || 'transparent') + '; font-weight: ' + (l.bold ? '700' : 'normal') + ';">' +
              '<td style="padding: 10px 14px; color: ' + (l.cor || 'var(--fin-text)') + '; font-size: ' + (l.destaque ? '14.5px' : '13.5px') + ';">' + l.nome + '</td>' +
              '<td style="padding: 10px 14px; text-align: right; color: ' + (l.cor || 'var(--fin-text)') + '; font-size: ' + (l.destaque ? '15px' : '13.5px') + ';">' + valStr + '</td>' +
              '<td style="padding: 10px 14px; text-align: right; color: var(--fin-text-muted);">' + pctStr + '</td>' +
              '<td style="padding: 10px 14px;">' +
                (l.pct !== null ? '<div style="width: 100%; background: rgba(0,0,0,0.06); height: 7px; border-radius: 4px; overflow: hidden;"><div style="width: ' + barWidth + '%; background: ' + (l.cor || '#fc4b15') + '; height: 100%;"></div></div>' : '') +
              '</td>' +
            '</tr>';
        }).join('');
      }
    } catch(e) {
      if (label) label.innerText = 'Erro ao carregar DRE';
      console.error(e);
    }
  }

  const btnDreRecarregar = document.getElementById('btn-dre-recarregar');
  if (btnDreRecarregar) btnDreRecarregar.onclick = () => carregarDRE();

  const selDrePeriodo = document.getElementById('dre-filtro-periodo');
  if (selDrePeriodo) selDrePeriodo.onchange = () => carregarDRE();

  // Exportar DRE CSV
  const btnDreExportar = document.getElementById('btn-dre-exportar');
  if (btnDreExportar) {
    btnDreExportar.onclick = () => {
      const rows = [];
      document.querySelectorAll('#dre-tabela-corpo tr').forEach(tr => {
        const cols = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
        if (cols.length >= 3) {
          rows.push([cols[0], cols[1], cols[2]]);
        }
      });
      const csv = 'Linha;Valor;Percentual\n' + rows.map(r => r.map(c => '"' + c.replace(/"/g, '""') + '"').join(';')).join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'DRE_ChefCozinha_' + Date.now() + '.csv';
      a.click();
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // FUNÇÕES DE CURVA ABC & ENGENHARIA DE CARDÁPIO
  // ══════════════════════════════════════════════════════════════════

  let _curvaAbcItensCache = [];
  let _quadranteAtivoFiltro = null;

  async function carregarCurvaABC(periodo, categoria) {
    const sel = document.getElementById('abc-filtro-periodo');
    const selCat = document.getElementById('abc-filtro-categoria');
    const p = periodo || (sel ? sel.value : 'mes');
    const c = categoria || (selCat ? selCat.value : 'todas');
    const fmt = (v) => 'R$ ' + (parseFloat(v) || 0).toFixed(2).replace('.', ',');

    try {
      const res = await fetch('/api/financeiro/curva-abc?periodo=' + encodeURIComponent(p) + '&categoria=' + encodeURIComponent(c === 'todas' ? '' : c));
      const data = await res.json();
      if (!data.ok) throw new Error(data.erro || 'Falha ao buscar Curva ABC');

      // Badges dos 4 Quadrantes
      const q = data.engenharia_cardapio || {};
      const setBadge = (id, count) => {
        const el = document.getElementById(id);
        if (el) el.innerText = (count || 0) + ' itens';
      };
      setBadge('abc-badge-estrelas', q.estrelas);
      setBadge('abc-badge-cavalos', q.cavalos_de_carga);
      setBadge('abc-badge-puzzles', q.quebra_cabecas);
      setBadge('abc-badge-caes', q.caes);

      _curvaAbcItensCache = data.curva_abc || [];

      // Popular categorias únicas no filtro
      if (selCat) {
        const valAtual = selCat.value;
        const categorias = Array.from(new Set(_curvaAbcItensCache.map(i => i.categoria).filter(Boolean)));
        selCat.innerHTML = '<option value="todas">Todas as Categorias</option>' +
          categorias.map(cat => '<option value="' + escHtml(cat) + '">' + escHtml(cat) + '</option>').join('');
        if (categorias.includes(valAtual)) selCat.value = valAtual;
      }

      // Tabela Pareto
      const tbody = document.getElementById('abc-tabela-corpo');
      if (tbody) {
        if (!data.curva_abc || data.curva_abc.length === 0) {
          tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 24px; color: var(--fin-text-muted);">Nenhum pedido finalizado no período selecionado.</td></tr>';
          return;
        }

        tbody.innerHTML = data.curva_abc.map(item => {
          let badgeClasseBg = '#fee2e2';
          let badgeClasseCor = '#dc2626';
          if (item.classe_faturamento === 'A') {
            badgeClasseBg = '#dcfce7';
            badgeClasseCor = '#16a34a';
          } else if (item.classe_faturamento === 'B') {
            badgeClasseBg = '#fef3c7';
            badgeClasseCor = '#d97706';
          }

          let quadIcon = item.icone_quadrante || '🍽️';
          let quadCor = '#475569';
          if (item.quadrante === 'Estrela') quadCor = '#16a34a';
          if (item.quadrante === 'Cavalo de Carga') quadCor = '#2563eb';
          if (item.quadrante === 'Quebra-Cabeça') quadCor = '#d97706';
          if (item.quadrante === 'Cão') quadCor = '#dc2626';

          return '<tr style="border-bottom: 1px solid var(--fin-border);">' +
              '<td style="padding: 10px 12px; font-weight: 600; color: var(--fin-text);">' +
                '<span style="margin-right: 6px;">' + (item.emoji || '🍽️') + '</span>' + escHtml(item.nome) +
              '</td>' +
              '<td style="padding: 10px 12px; text-align: center; font-weight: 700;">' + item.qtd + 'x</td>' +
              '<td style="padding: 10px 12px; text-align: right; color: var(--fin-text);">' + fmt(item.preco_medio) + '</td>' +
              '<td style="padding: 10px 12px; text-align: right;">' +
                '<div style="display: inline-flex; align-items: center; gap: 4px;">' +
                  '<span style="font-size: 11px; color: var(--fin-text-muted);">R$</span>' +
                  '<input type="number" step="0.10" min="0" value="' + (item.custo_unitario || 0).toFixed(2) + '" ' +
                         'title="Editar Preço de Custo (CMV)" ' +
                         'onchange="atualizarCustoProdutoInline(\'' + escHtml(item.nome).replace(/'/g, "\\'") + '\', this.value)" ' +
                         'style="width: 72px; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--fin-border); background: var(--fin-bg); color: var(--fin-text); font-size: 12.5px; font-weight: 700; text-align: right;">' +
                '</div>' +
              '</td>' +
              '<td style="padding: 10px 12px; text-align: right; color: #16a34a; font-weight: 700;">' + fmt(item.margem_unitaria) + '</td>' +
              '<td style="padding: 10px 12px; text-align: right; font-weight: 800; color: #fc4b15;">' + fmt(item.faturamento) + '</td>' +
              '<td style="padding: 10px 12px; text-align: right; color: var(--fin-text-muted); font-size: 12px;">' + (item.pct_faturamento_acumulado || 0).toFixed(1) + '%</td>' +
              '<td style="padding: 10px 12px; text-align: center;">' +
                '<span style="padding: 3px 8px; border-radius: 6px; font-weight: 800; font-size: 12px; background: ' + badgeClasseBg + '; color: ' + badgeClasseCor + ';">' +
                  'Classe ' + item.classe_faturamento +
                '</span>' +
              '</td>' +
              '<td style="padding: 10px 12px; text-align: center;" title="' + escHtml(item.acao_sugerida || '') + '">' +
                '<span style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 6px; font-weight: 700; font-size: 11.5px; background: rgba(0,0,0,0.04); color: ' + quadCor + '; cursor: help;">' +
                  quadIcon + ' ' + item.quadrante +
                '</span>' +
              '</td>' +
            '</tr>';
        }).join('');
      }
    } catch(e) {
      console.error(e);
    }
  }

  // Função inline para atualizar custo unitário de prato
  window.atualizarCustoProdutoInline = async function(nome, novoCusto) {
    if (isNaN(parseFloat(novoCusto))) return;
    try {
      const res = await fetch('/api/financeiro/produto-custo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, custo: parseFloat(novoCusto) })
      });
      const data = await res.json();
      if (data && data.ok) {
        // Recalcular Curva ABC
        carregarCurvaABC();
      }
    } catch(e) {
      console.error('Falha ao salvar custo:', e);
    }
  };

  const btnAbcRecarregar = document.getElementById('btn-abc-recarregar');
  if (btnAbcRecarregar) btnAbcRecarregar.onclick = () => carregarCurvaABC();


  window.filtrarPorQuadranteABC = function(quadrante) {
    if (_quadranteAtivoFiltro === quadrante) {
      _quadranteAtivoFiltro = null;
    } else {
      _quadranteAtivoFiltro = quadrante;
    }

    // Atualiza bordas dos cards de quadrante
    document.querySelectorAll('.quad-card-btn').forEach(btn => {
      btn.style.boxShadow = 'none';
      btn.style.transform = 'scale(1)';
    });

    if (_quadranteAtivoFiltro) {
      const qLower = _quadranteAtivoFiltro.toLowerCase();
      document.querySelectorAll('.quad-card-btn').forEach(btn => {
        if (btn.getAttribute('onclick').toLowerCase().includes(qLower)) {
          btn.style.boxShadow = '0 0 0 2px #fc4b15, 0 8px 20px rgba(252,75,21,0.2)';
          btn.style.transform = 'scale(1.02)';
        }
      });
    }

    // Filtra linhas da tabela
    const rows = document.querySelectorAll('#abc-tabela-corpo tr');
    rows.forEach(tr => {
      if (!_quadranteAtivoFiltro) {
        tr.style.display = '';
      } else {
        const quadTd = tr.querySelector('td:last-child');
        if (quadTd && quadTd.innerText.includes(_quadranteAtivoFiltro)) {
          tr.style.display = '';
        } else {
          tr.style.display = 'none';
        }
      }
    });
  };

  const selAbcCat = document.getElementById('abc-filtro-categoria');
  if (selAbcCat) selAbcCat.onchange = () => carregarCurvaABC();

  const selAbcPeriodo = document.getElementById('abc-filtro-periodo');
  if (selAbcPeriodo) selAbcPeriodo.onchange = () => carregarCurvaABC();

  // Exportar Curva ABC CSV
  const btnAbcExportar = document.getElementById('btn-abc-exportar');
  if (btnAbcExportar) {
    btnAbcExportar.onclick = () => {
      const rows = [];
      document.querySelectorAll('#abc-tabela-corpo tr').forEach(tr => {
        const cols = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
        if (cols.length >= 7) {
          rows.push([cols[0], cols[1], cols[2], cols[4], cols[5], cols[6], cols[7], cols[8]]);
        }
      });
      const csv = 'Produto;Qtd;PrecoMedio;MargemUnit;Faturamento;PctAcumulada;Classe;Quadrante\n' + rows.map(r => r.map(c => '"' + c.replace(/"/g, '""') + '"').join(';')).join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'Curva_ABC_Cardapio_' + Date.now() + '.csv';
      a.click();
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // MÓDULO ÁGIL DE DESPESAS OPERACIONAIS & CONTAS A PAGAR
  // ══════════════════════════════════════════════════════════════════

  async function carregarDespesas() {
    const cat = document.getElementById('despesas-filtro-categoria')?.value || 'todas';
    const status = document.getElementById('despesas-filtro-status')?.value || 'todos';
    const fmt = (v) => 'R$ ' + (parseFloat(v) || 0).toFixed(2).replace('.', ',');

    try {
      const res = await fetch('/api/financeiro/despesas?categoria=' + encodeURIComponent(cat) + '&status=' + encodeURIComponent(status));
      const data = await res.json();
      if (!data.ok) throw new Error(data.erro || 'Falha ao buscar despesas');

      const resumo = data.resumo || {};
      const setEl = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = fmt(val);
      };
      setEl('despesas-kpi-total', resumo.total);
      setEl('despesas-kpi-pagas', resumo.pagas);
      setEl('despesas-kpi-pendentes', resumo.pendentes);

      const tbody = document.getElementById('despesas-tabela-corpo');
      if (tbody) {
        if (!data.despesas || data.despesas.length === 0) {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--fin-text-muted);">Nenhuma despesa cadastrada com estes filtros.</td></tr>';
          return;
        }

        tbody.innerHTML = data.despesas.map(d => {
          const isPago = d.status === 'Pago';
          const statusBadge = isPago
            ? '<span style="padding: 3px 8px; border-radius: 6px; font-weight: 700; font-size: 11px; background: #dcfce7; color: #15803d;">Pago</span>'
            : '<span style="padding: 3px 8px; border-radius: 6px; font-weight: 700; font-size: 11px; background: #fee2e2; color: #b91c1c;">Pendente</span>';

          return '<tr style="border-bottom: 1px solid var(--fin-border);">' +
              '<td style="padding: 10px 12px; font-weight: 600; color: var(--fin-text);">' +
                escHtml(d.descricao) +
                (d.observacao ? '<br><small style="color: var(--fin-text-muted); font-size: 11px;">' + escHtml(d.observacao) + '</small>' : '') +
              '</td>' +
              '<td style="padding: 10px 12px; color: var(--fin-text-muted);">' + escHtml(d.categoria) + '</td>' +
              '<td style="padding: 10px 12px; color: var(--fin-text-muted);">' + (d.data_competencia || '-') + '</td>' +
              '<td style="padding: 10px 12px; color: var(--fin-text-muted);">' + (d.data_vencimento || '-') + '</td>' +
              '<td style="padding: 10px 12px; text-align: right; font-weight: 700; color: #dc2626;">' + fmt(d.valor) + '</td>' +
              '<td style="padding: 10px 12px; text-align: center;">' + statusBadge + '</td>' +
              '<td style="padding: 10px 12px; text-align: center;">' +
                '<div style="display: inline-flex; gap: 6px;">' +
                  (!isPago ? '<button onclick="marcarDespesaPaga(' + d.id + ')" style="padding: 4px 8px; border-radius: 6px; background: #10b981; color: white; border: none; font-size: 11px; font-weight: 700; cursor: pointer;">Pagar</button>' : '') +
                  '<button onclick="excluirDespesa(' + d.id + ')" style="padding: 4px 8px; border-radius: 6px; background: transparent; border: 1px solid var(--fin-border); color: #dc2626; font-size: 11px; cursor: pointer;"><i class="ph ph-trash"></i></button>' +
                '</div>' +
              '</td>' +
            '</tr>';
        }).join('');
      }
    } catch(e) {
      console.error(e);
    }
  }

  window.marcarDespesaPaga = async function(id) {
    if (!confirm('Confirmar pagamento desta despesa?')) return;
    try {
      const res = await fetch('/api/financeiro/despesas/' + id + '/pagar', { method: 'PUT' });
      const data = await res.json();
      if (data.ok) {
        carregarDespesas();
      } else {
        alert(data.erro || 'Falha ao atualizar despesa');
      }
    } catch(e) {
      alert('Erro: ' + e.message);
    }
  };

  window.excluirDespesa = async function(id) {
    if (!confirm('Tem certeza que deseja remover esta despesa?')) return;
    try {
      const res = await fetch('/api/financeiro/despesas/' + id, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) {
        carregarDespesas();
      } else {
        alert(data.erro || 'Falha ao excluir despesa');
      }
    } catch(e) {
      alert('Erro: ' + e.message);
    }
  };

  const btnNovaDespesa = document.getElementById('btn-nova-despesa');
  if (btnNovaDespesa) {
    btnNovaDespesa.onclick = () => {
      document.getElementById('despesa-input-descricao').value = '';
      document.getElementById('despesa-input-valor').value = '';
      document.getElementById('despesa-input-competencia').value = new Date().toISOString().slice(0, 10);
      document.getElementById('despesa-input-obs').value = '';
      const m = document.getElementById('modal-nova-despesa');
      if (m) m.style.display = 'flex';
    };
  }

  const btnSalvarDespesaModal = document.getElementById('btn-despesa-salvar-modal');
  if (btnSalvarDespesaModal) {
    btnSalvarDespesaModal.onclick = async () => {
      const descricao = document.getElementById('despesa-input-descricao').value.trim();
      const categoria = document.getElementById('despesa-input-categoria').value;
      const valor = parseFloat(document.getElementById('despesa-input-valor').value);
      const competencia = document.getElementById('despesa-input-competencia').value;
      const status = document.getElementById('despesa-input-status').value;
      const obs = document.getElementById('despesa-input-obs').value.trim();

      if (!descricao || isNaN(valor) || valor <= 0) {
        alert('Por favor, informe uma descrição válida e o valor numérico da despesa.');
        return;
      }

      btnSalvarDespesaModal.disabled = true;
      btnSalvarDespesaModal.innerText = 'Salvando...';

      try {
        const res = await fetch('/api/financeiro/despesas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            descricao,
            categoria,
            valor,
            data_competencia: competencia,
            status,
            observacao: obs
          })
        });
        const data = await res.json();
        btnSalvarDespesaModal.disabled = false;
        btnSalvarDespesaModal.innerText = 'Salvar Despesa';

        if (data.ok) {
          document.getElementById('modal-nova-despesa').style.display = 'none';
          carregarDespesas();
        } else {
          alert('Erro ao cadastrar despesa: ' + (data.erro || 'Falha'));
        }
      } catch(e) {
        btnSalvarDespesaModal.disabled = false;
        btnSalvarDespesaModal.innerText = 'Salvar Despesa';
        alert('Erro de conexão: ' + e.message);
      }
    };
  }


  const inputBuscaDespesas = document.getElementById('despesas-filtro-busca');
  if (inputBuscaDespesas) {
    inputBuscaDespesas.addEventListener('input', (e) => {
      const termo = (e.target.value || '').toLowerCase().trim();
      document.querySelectorAll('#despesas-tabela-corpo tr').forEach(tr => {
        const texto = tr.innerText.toLowerCase();
        tr.style.display = texto.includes(termo) ? '' : 'none';
      });
    });
  }

  const btnDespesasRecarregar = document.getElementById('btn-despesas-recarregar');
  if (btnDespesasRecarregar) btnDespesasRecarregar.onclick = () => carregarDespesas();

  // ══════════════════════════════════════════════════════════════════
  // HISTÓRICO DE AUDITORIA DE TURNOS & QUEBRA DE CAIXA
  // ══════════════════════════════════════════════════════════════════

  async function carregarHistoricoTurnos() {
    const fmt = (v) => 'R$ ' + (parseFloat(v) || 0).toFixed(2).replace('.', ',');

    try {
      const res = await fetch('/api/caixa/turnos-historico');
      const data = await res.json();
      if (!data.ok) throw new Error(data.erro || 'Falha ao buscar turnos');

      _turnosHistoricoCache = data.turnos || [];
      const tbody = document.getElementById('turnos-tabela-corpo');
      if (tbody) {
        if (!data.turnos || data.turnos.length === 0) {
          tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 24px; color: var(--fin-text-muted);">Nenhum histórico de turno encerrado ainda.</td></tr>';
          return;
        }

        tbody.innerHTML = data.turnos.map(t => {
          const dif = parseFloat(t.diferenca_caixa) || 0;
          let difBadge = '<span style="padding: 3px 8px; border-radius: 6px; font-weight: 700; font-size: 11px; background: #dcfce7; color: #16a34a;">Exato (R$ 0,00)</span>';
          if (dif > 0) {
            difBadge = '<span style="padding: 3px 8px; border-radius: 6px; font-weight: 700; font-size: 11px; background: #e0f2fe; color: #0284c7;">Sobra (+ ' + fmt(dif) + ')</span>';
          } else if (dif < 0) {
            difBadge = '<span style="padding: 3px 8px; border-radius: 6px; font-weight: 700; font-size: 11px; background: #fee2e2; color: #dc2626;">Falta (- ' + fmt(Math.abs(dif)) + ')</span>';
          }

          const dtAb = t.data_abertura ? new Date(t.data_abertura).toLocaleString('pt-BR') : '-';
          const dtFech = t.data_fechamento ? new Date(t.data_fechamento).toLocaleString('pt-BR') : 'Em Aberto';

          return '<tr style="border-bottom: 1px solid var(--fin-border);">' +
              '<td style="padding: 10px 12px; font-weight: 700; color: #fc4b15;">#' + t.id + '</td>' +
              '<td style="padding: 10px 12px; font-size: 12px; color: var(--fin-text-muted);">' +
                dtAb + '<br><small style="color: var(--fin-text);">até ' + dtFech + '</small>' +
              '</td>' +
              '<td style="padding: 10px 12px; font-weight: 600; color: var(--fin-text);">' + escHtml(t.operador_fechamento || 'Caixa') + '</td>' +
              '<td style="padding: 10px 12px; text-align: right; color: var(--fin-text-muted);">' + fmt(t.fundo_troco) + '</td>' +
              '<td style="padding: 10px 12px; text-align: right; font-weight: 700; color: var(--fin-text);">' + fmt(t.total_declarado) + '</td>' +
              '<td style="padding: 10px 12px; text-align: center;">' + difBadge + '</td>' +
              '<td style="padding: 10px 12px; font-size: 12px; color: var(--fin-text-muted); max-width: 200px;">' +
                escHtml(t.justificativa_diferenca || '-') +
              '</td>' +
              '<td style="padding: 10px 12px; text-align: center;">' +
                '<button onclick="visualizarComprovanteHistorico(' + t.id + ')" style="padding: 5px 10px; border-radius: 6px; background: rgba(0,0,0,0.04); border: 1px solid var(--fin-border); cursor: pointer; font-size: 12px; color: var(--fin-text);">' +
                  '<i class="ph ph-receipt"></i> Ver' +
                '</button>' +
              '</td>' +
            '</tr>';
        }).join('');
      }
    } catch(e) {
      console.error(e);
    }
  }

  let _turnosHistoricoCache = [];

  window.visualizarComprovanteHistorico = function(turnoId) {
    const t = _turnosHistoricoCache.find(x => String(x.id) === String(turnoId));
    if (!t) return alert('Turno não localizado no histórico.');

    const fmt = (v) => 'R$ ' + (parseFloat(v) || 0).toFixed(2).replace('.', ',');
    const m = document.getElementById('modal-detalhes-turno');
    if (!m) return;

    document.getElementById('mdt-titulo').innerHTML = '<i class="ph ph-receipt" style="color: #fc4b15;"></i> Auditoria do Turno #' + t.id;
    
    const dtAb = t.data_abertura ? new Date(t.data_abertura).toLocaleString('pt-BR') : '-';
    const dtFech = t.data_fechamento ? new Date(t.data_fechamento).toLocaleString('pt-BR') : 'Em Aberto';
    document.getElementById('mdt-datas').innerHTML = dtAb + '<br><small style="color:var(--fin-text-muted);">até ' + dtFech + '</small>';
    document.getElementById('mdt-operador').innerText = t.operador_fechamento || 'Operador Caixa';

    const dif = parseFloat(t.diferenca_caixa) || 0;
    const badge = document.getElementById('mdt-quebra-badge');
    if (Math.abs(dif) < 0.01) {
      badge.innerText = 'Exato (Sem Divergência)';
      badge.style.background = '#dcfce7';
      badge.style.color = '#15803d';
    } else if (dif > 0) {
      badge.innerText = 'Sobra de ' + fmt(dif);
      badge.style.background = '#e0f2fe';
      badge.style.color = '#0284c7';
    } else {
      badge.innerText = 'Quebra/Falta de ' + fmt(Math.abs(dif));
      badge.style.background = '#fee2e2';
      badge.style.color = '#dc2626';
    }

    const justifBox = document.getElementById('mdt-justificativa-box');
    const justifTxt = document.getElementById('mdt-justificativa-texto');
    if (t.justificativa_diferenca) {
      justifBox.style.display = 'block';
      justifTxt.innerText = t.justificativa_diferenca;
    } else {
      justifBox.style.display = 'none';
    }

    const det = t.detalhes_fechamento || {};
    const esp = det.esperado || {};
    const dec = det.declarado || {};

    const linhas = [
      { item: 'Dinheiro na Gaveta (com Fundo)', esp: esp.gaveta_esperada || (parseFloat(t.fundo_troco)||0), dec: dec.dinheiro !== undefined ? dec.dinheiro : (parseFloat(t.total_declarado)||0), dif: (dec.dinheiro || 0) - (esp.gaveta_esperada || 0) },
      { item: 'PIX Conferido', esp: esp.pix || 0, dec: dec.pix || 0, dif: (dec.pix || 0) - (esp.pix || 0) },
      { item: 'Cartão Débito', esp: esp.debito || 0, dec: dec.debito || 0, dif: (dec.debito || 0) - (esp.debito || 0) },
      { item: 'Cartão Crédito', esp: esp.credito || 0, dec: dec.credito || 0, dif: (dec.credito || 0) - (esp.credito || 0) },
      { item: 'TOTAL GERAL APURADO', esp: esp.total_faturado || 0, dec: t.total_declarado || 0, dif: dif, bold: true }
    ];

    const tbody = document.getElementById('mdt-tabela-conferencia');
    if (tbody) {
      tbody.innerHTML = linhas.map(l => {
        const difCor = Math.abs(l.dif) < 0.01 ? '#16a34a' : (l.dif > 0 ? '#0284c7' : '#dc2626');
        return '<tr style="border-bottom: 1px solid var(--fin-border); font-weight:' + (l.bold ? '700' : 'normal') + ';">' +
            '<td style="padding: 8px;">' + l.item + '</td>' +
            '<td style="padding: 8px; text-align: right; color: var(--fin-text-muted);">' + fmt(l.esp) + '</td>' +
            '<td style="padding: 8px; text-align: right; color: var(--fin-text); font-weight:700;">' + fmt(l.dec) + '</td>' +
            '<td style="padding: 8px; text-align: right; color: ' + difCor + '; font-weight:800;">' + (l.dif >= 0 ? '+' : '') + fmt(l.dif) + '</td>' +
          '</tr>';
      }).join('');
    }

    // Configurar botões de impressão e WhatsApp
    const txtComprovante = '=========================================\n' +
      '  CHEF COZINHA - COMPROVANTE DE TURNO #' + t.id + '\n' +
      '=========================================\n' +
      'Abertura: ' + dtAb + '\n' +
      'Fechamento: ' + dtFech + '\n' +
      'Operador: ' + (t.operador_fechamento || 'Caixa') + '\n' +
      '-----------------------------------------\n' +
      'Total Declarado: ' + fmt(t.total_declarado) + '\n' +
      'Quebra de Caixa: ' + fmt(dif) + '\n' +
      (t.justificativa_diferenca ? 'Justificativa: ' + t.justificativa_diferenca + '\n' : '') +
      '=========================================\n';

    document.getElementById('btn-mdt-reimprimir').onclick = () => {
      window.print();
    };

    document.getElementById('btn-mdt-whatsapp').onclick = () => {
      window.open('https://wa.me/?text=' + encodeURIComponent(txtComprovante), '_blank');
    };

    m.style.display = 'flex';
  };

  const btnTurnosRecarregar = document.getElementById('btn-turnos-recarregar');
  if (btnTurnosRecarregar) btnTurnosRecarregar.onclick = () => carregarHistoricoTurnos();

  // ══════════════════════════════════════════════════════════════════
  // CONFIGURAÇÕES FINANCEIRAS & PARÂMETROS DE EXECUÇÃO
  // ══════════════════════════════════════════════════════════════════

  const btnAbrirConfigFin = document.getElementById('btn-abrir-config-financeiro');
  if (btnAbrirConfigFin) {
    btnAbrirConfigFin.onclick = async () => {
      await obterConfigFinanceiro();
      const cfg = configFinanceiroGlobal;
      document.getElementById('cfg-fechamento-modo').value = cfg.fechamento_modo || 'cego';
      document.getElementById('cfg-cmv-padrao').value = cfg.cmv_padrao_pct || 32;
      document.getElementById('cfg-taxa-debito').value = cfg.taxa_cartao_debito_pct || 1.5;
      document.getElementById('cfg-taxa-credito').value = cfg.taxa_cartao_credito_pct || 3.0;
      document.getElementById('cfg-taxa-pix').value = cfg.taxa_pix_pct || 0;

      const m = document.getElementById('modal-config-financeiro');
      if (m) m.style.display = 'flex';
    };
  }

  const btnSalvarConfigFin = document.getElementById('btn-salvar-config-financeiro');
  if (btnSalvarConfigFin) {
    btnSalvarConfigFin.onclick = async () => {
      const modo = document.getElementById('cfg-fechamento-modo').value;
      const cmv = parseFloat(document.getElementById('cfg-cmv-padrao').value);
      const debito = parseFloat(document.getElementById('cfg-taxa-debito').value);
      const credito = parseFloat(document.getElementById('cfg-taxa-credito').value);
      const pix = parseFloat(document.getElementById('cfg-taxa-pix').value);

      btnSalvarConfigFin.disabled = true;
      btnSalvarConfigFin.innerText = 'Salvando...';

      try {
        const res = await fetch('/api/financeiro/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fechamento_modo: modo,
            cmv_padrao_pct: cmv,
            taxa_cartao_debito_pct: debito,
            taxa_cartao_credito_pct: credito,
            taxa_pix_pct: pix
          })
        });

        const data = await res.json();
        btnSalvarConfigFin.disabled = false;
        btnSalvarConfigFin.innerText = 'Salvar Parâmetros';

        if (data.ok) {
          configFinanceiroGlobal = data.config;
          document.getElementById('modal-config-financeiro').style.display = 'none';
          alert('Configurações financeiras salvas com sucesso!');
        } else {
          alert('Erro ao salvar: ' + (data.erro || 'Falha'));
        }
      } catch(e) {
        btnSalvarConfigFin.disabled = false;
        btnSalvarConfigFin.innerText = 'Salvar Parâmetros';
        alert('Erro: ' + e.message);
      }
    };
  }
});
