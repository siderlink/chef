
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

  document.getElementById('btn-fechar-caixa-oficial').onclick = () => {
    document.getElementById('fechamento-print-area').classList.add('print-active');
    document.getElementById('relatorio-print-area').classList.remove('print-active');
    document.getElementById('fechamento-modal').style.display = 'flex';
  };
  
  document.getElementById('btn-print').onclick = () => {
    window.print();
    if(confirm('Impresso com sucesso. Deseja encerrar o turno e bloquear o sistema agora?')) {
      // (Segurança) Admin/Gerente fecham sem senha; caixa digita a própria
      // senha; garçom/demais informam a senha de um caixa/admin/gerente.
      const payload = { operador: window.crmPerfil ? window.crmPerfil.nome : 'Desconhecido' };
      if (!window.ehAdminOuGerenteLogado()) {
        const senha = prompt(window.promptSenhaFechamentoCaixa());
        if (!senha) return alert('Operação cancelada.');
        payload.senha = senha;
      }
      socket.emit('fechar_caixa', payload);
    }
  };

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


  // --- ADVANCED REPORT SYSTEM LOGIC ---
  const tabResumo = document.getElementById('tab-btn-resumo');
  const tabRelatorio = document.getElementById('tab-btn-relatorio');
  const secResumo = document.getElementById('section-resumo-caixa');
  const secRelatorio = document.getElementById('section-relatorio-avancado');
  const tabContador = document.getElementById('tab-btn-contador');
  const secContador = document.getElementById('section-contador');

  // Unified tab switching
  function switchTab(activeTab) {
    const allTabs = [tabResumo, tabRelatorio, tabContador];
    const allSecs = [secResumo, secRelatorio, secContador];
    
    allTabs.forEach(t => { t.style.color = '#777'; t.style.borderBottom = '3px solid transparent'; });
    allSecs.forEach(s => { if (s) s.style.display = 'none'; });
    
    activeTab.style.color = '#fc4b15';
    activeTab.style.borderBottom = '3px solid #fc4b15';
    const idx = allTabs.indexOf(activeTab);
    const sec = allSecs[idx];
    if (sec) sec.style.display = 'block';
  }

  // Switch Tabs
  tabResumo.addEventListener('click', () => switchTab(tabResumo));

  tabRelatorio.addEventListener('click', () => {
    switchTab(tabRelatorio);
    socket.emit('get_report_filters');
    loadReportData();
  });

  tabContador.addEventListener('click', () => {
    switchTab(tabContador);
    renderCntPreview();
  });

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
      payContainer.innerHTML = `<div style="text-align: center; color: gray; padding: 20px;">Nenhum faturamento registrado no período.</div>`;
    } else {
      const colors = {
        'Dinheiro': '#3ab55b',
        'Pix': '#fc4b15',
        'Crédito': '#2d9cdb',
        'Cartão': '#2d9cdb',
        'Débito': '#00c49f',
        'Na Conta': '#8e44ad',
        'Fiado': '#8e44ad',
        'Múltiplo': '#f2994a',
        'Não Definido': '#bdbdbd'
      };
      payContainer.innerHTML = validPayments.map(p => {
        const pVal = Math.max(0, p.total);
        const pctNum = totalPayments > 0 ? (pVal / totalPayments) * 100 : 0;
        const pct = pctNum.toFixed(1);
        const widthPct = Math.min(100, Math.max(0, pctNum));
        const color = colors[p.metodo] || '#666';
        return `
          <div>
            <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 500; margin-bottom: 6px; color: #333;">
              <span style="display: flex; align-items: center; gap: 6px;"><span style="width: 10px; height: 10px; border-radius: 50%; background: ${color}; display: inline-block;"></span>${p.metodo}</span>
              <span style="font-weight: 600;">${fmt(pVal)} (${pct}%)</span>
            </div>
            <div style="width: 100%; height: 8px; background: #f0f0f0; border-radius: 4px; overflow: hidden;">
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
      chartContainer.innerHTML = `<div style="width: 100%; text-align: center; color: gray; margin-bottom: 20px; font-size: 13px;">Sem dados de vendas.</div>`;
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
            <div style="color: #4a5568; font-size: 10px; font-weight: 700; margin-bottom: 6px;">R$ ${Math.round(p.val_total)}</div>
            <div style="${heightStyle} width: 60%; background: linear-gradient(180deg, #fc4b15 0%, #ff8e53 100%); border-radius: 6px 6px 0 0; box-shadow: 0 4px 6px -1px rgba(252, 75, 21, 0.15); transition: all 0.2s; cursor: pointer;" 
                 onmouseover="this.style.transform='scaleX(1.05)'; this.style.filter='brightness(1.1)';" onmouseout="this.style.transform='none'; this.style.filter='none';"></div>
            <div style="font-size: 10px; color: #718096; font-weight: 500; margin-top: 8px; text-align: center; white-space: nowrap;">${cleanPeriod}</div>
          </div>
        `;
      }).join('');
    }

    // Render Products Table
    const prodTbody = document.getElementById('rep-tabela-produtos');
    if (report.soldItems.length === 0) {
      prodTbody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 20px; color: gray;">Nenhum produto vendido no período.</td></tr>`;
    } else {
      prodTbody.innerHTML = report.soldItems.map(p => `
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 12px; font-weight: 500;">${p.productName}</td>
          <td style="padding: 12px; text-align: center; font-weight: bold;">${p.qty}x</td>
          <td style="padding: 12px; text-align: right; color: #3ab55b; font-weight: bold;">${fmt(p.valTotal)}</td>
        </tr>
      `).join('');
    }

    // Render Detailed Orders Table
    const ordersTbody = document.getElementById('rep-tabela-pedidos');
    if (report.orders.length === 0) {
      ordersTbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 20px; color: gray;">Nenhum pedido correspondente.</td></tr>`;
    } else {
      ordersTbody.innerHTML = report.orders.map(o => {
        const dateFormatted = new Date(o.createdAt).toLocaleString('pt-BR');
        return `
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 12px; font-weight: bold;">#${o.id}</td>
            <td style="padding: 12px;">${o.productName}</td>
            <td style="padding: 12px; text-align: center; font-weight: bold;">${o.quantity}x</td>
            <td style="padding: 12px; color: #555;">${o.localName}</td>
            <td style="padding: 12px;">${o.clientName || '-'}</td>
            <td style="padding: 12px; color: gray;">${o.userName}</td>
            <td style="padding: 12px; color: gray;">${dateFormatted}</td>
            <td style="padding: 12px;">${o.paymentMethod || 'N/A'}</td>
            <td style="padding: 12px; text-align: right; font-weight: bold; color: #3ab55b;">${fmt(parseFloat(o.total))}</td>
            <td style="padding: 12px;"><span style="background: ${o.status === 'Finalizado' ? '#e6f4ea' : '#fce8e6'}; color: ${o.status === 'Finalizado' ? '#137333' : '#c5221f'}; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">${o.status}</span></td>
          </tr>
        `;
      }).join('');
    }

    // --- 1. RENDER CATEGORIES ---
    const catContainer = document.getElementById('rep-categorias-container');
    if (catContainer) {
      if (!report.categorySales || report.categorySales.length === 0) {
        catContainer.innerHTML = `<div style="color:gray; font-size:12px; font-style:italic;">Nenhuma venda registrada.</div>`;
      } else {
        const totalCat = report.categorySales.reduce((acc, curr) => acc + curr.valTotal, 0) || 1;
        catContainer.innerHTML = report.categorySales.map(c => {
          const pct = ((c.valTotal / totalCat) * 100).toFixed(1);
          return `
            <div>
              <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
                <span>${c.categoria} <span style="color:gray; font-size:10px;">(${c.qty}x)</span></span>
                <span style="font-weight:600; color:#333;">${fmt(c.valTotal)} (${pct}%)</span>
              </div>
              <div style="width:100%; height:6px; background:#f0f0f0; border-radius:3px; overflow:hidden;">
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
        secContainer.innerHTML = `<div style="color:gray; font-size:12px; font-style:italic;">Nenhuma venda registrada.</div>`;
      } else {
        const totalSec = report.sectorSales.reduce((acc, curr) => acc + curr.valTotal, 0) || 1;
        secContainer.innerHTML = report.sectorSales.map(s => {
          const pct = ((s.valTotal / totalSec) * 100).toFixed(1);
          const color = s.setor === 'Bar' ? '#2d9cdb' : '#e67e22';
          return `
            <div>
              <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
                <span>${s.setor} <span style="color:gray; font-size:10px;">(${s.qty}x)</span></span>
                <span style="font-weight:600; color:#333;">${fmt(s.valTotal)} (${pct}%)</span>
              </div>
              <div style="width:100%; height:6px; background:#f0f0f0; border-radius:3px; overflow:hidden;">
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
        garconsContainer.innerHTML = `<div style="color:gray; font-size:12px; font-style:italic;">Nenhum dado de garçom disponível.</div>`;
      } else {
        const maxSales = report.waiterRanking.reduce((acc, curr) => Math.max(acc, curr.totalSales), 0) || 1;
        garconsContainer.innerHTML = report.waiterRanking.map((g, idx) => {
          const pct = ((g.totalSales / maxSales) * 100).toFixed(1);
          const icon = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}º`;
          return `
            <div>
              <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;">
                <span style="font-weight:500;">${icon} ${g.garcom} <span style="color:gray; font-size:10px; font-weight:normal;">(${g.totalOrders} pedidos)</span></span>
                <span style="font-weight:700; color:#8e44ad;">${fmt(g.totalSales)}</span>
              </div>
              <div style="width:100%; height:6px; background:#f0f0f0; border-radius:3px; overflow:hidden;">
                <div style="width:${pct}%; height:100%; background:#8e44ad; border-radius:3px;"></div>
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
        vipsContainer.innerHTML = `<div style="color:gray; font-size:12px; font-style:italic;">Nenhum cliente registrado.</div>`;
      } else {
        const maxSales = report.clientRanking.reduce((acc, curr) => Math.max(acc, curr.totalSales), 0) || 1;
        vipsContainer.innerHTML = report.clientRanking.slice(0, 5).map((c, idx) => {
          const pct = ((c.totalSales / maxSales) * 100).toFixed(1);
          return `
            <div>
              <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
                <span>${idx + 1}º ${c.cliente} <span style="color:gray; font-size:10px;">(${c.totalOrders} pedidos)</span></span>
                <span style="font-weight:600; color:#f2994a;">${fmt(c.totalSales)}</span>
              </div>
              <div style="width:100%; height:4px; background:#f0f0f0; border-radius:2px; overflow:hidden;">
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
    btnSubProd.style.color = '#fc4b15';
    btnSubProd.style.borderBottom = '2px solid #fc4b15';
    btnSubPed.style.color = '#777';
    btnSubPed.style.borderBottom = '2px solid transparent';
  });

  btnSubPed.addEventListener('click', () => {
    containerProd.style.display = 'none';
    containerPed.style.display = 'block';
    btnSubPed.style.color = '#fc4b15';
    btnSubPed.style.borderBottom = '2px solid #fc4b15';
    btnSubProd.style.color = '#777';
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
});
