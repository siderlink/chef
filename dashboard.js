
function parseMoneyDash(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  let s = String(val).replace(/R\$\s*/gi, '').trim();
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
const socket = io({ query: { token: localStorage.getItem('chef_token'), restaurante_id: localStorage.getItem('restaurante_id') || '1' } });

socket.on('tenant_atualizado', (data) => {
  if (data && data.restaurante_id) localStorage.setItem('restaurante_id', data.restaurante_id);
  if (data && data.token) localStorage.setItem('chef_token', data.token);
  socket.disconnect();
  socket.io.opts.query = { token: data.token, restaurante_id: String(data.restaurante_id) };
  socket.connect();
});

// --- SIDEBAR TOGGLE (hambúrguer) ---
const menuIcon = document.querySelector('.menu-icon');
const sidebar = document.querySelector('.sidebar');
if (menuIcon && sidebar) {
  menuIcon.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
  });
}

const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

socket.on('connect', () => {
  socket.emit('get_dashboard_stats');
});

socket.on('dashboard_stats_result', (stats) => {
  if (!stats) return;
  // KPIs
  document.getElementById('dash-fat-hoje').innerText = formatCurrency(parseMoneyDash(stats.faturamentoHoje));
  document.getElementById('dash-fat-mensal').innerText = formatCurrency(parseMoneyDash(stats.faturamentoMensal));
  document.getElementById('dash-pedidos-hoje').innerText = stats.pedidosHoje || 0;
  document.getElementById('dash-ticket-medio').innerText = formatCurrency(parseMoneyDash(stats.ticketMedio));

  // Top Clientes
  const topClientesTbody = document.getElementById('lista-top-clientes');
  if (topClientesTbody) {
    if (!stats.topClientes || stats.topClientes.length === 0) {
      topClientesTbody.innerHTML = '<tr><td colspan="3" style="padding:16px;text-align:center;color:#94a3b8;">Nenhum cliente encontrado.</td></tr>';
    } else {
      topClientesTbody.innerHTML = stats.topClientes.map(c => `
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 10px;">${c.nome || 'N/I'}</td>
          <td style="padding: 10px;">${c.pedidos || 0}</td>
          <td style="padding: 10px;">${formatCurrency(c.gasto)}</td>
        </tr>
      `).join('');
    }
  }

  // Common chart options
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, boxWidth: 8 } },
      tooltip: { backgroundColor: 'rgba(15,23,42,0.9)', padding: 10, cornerRadius: 8, displayColors: false }
    },
    animation: { duration: 800, easing: 'easeOutQuart' }
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '70%',
    plugins: {
      legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, boxWidth: 8 } },
      tooltip: { backgroundColor: 'rgba(15,23,42,0.9)', padding: 10, cornerRadius: 8, displayColors: false }
    },
    animation: { duration: 800, easing: 'easeOutQuart' }
  };

  const emptyMsg = (canvasId, msg) => {
    const el = document.getElementById(canvasId);
    if (el) {
      const parent = el.parentElement;
      if (parent && !parent.querySelector('.empty-chart-msg')) {
        const p = document.createElement('p');
        p.className = 'empty-chart-msg';
        p.style.cssText = 'text-align:center;color:#94a3b8;font-size:13px;padding:40px 0 0;';
        p.textContent = msg;
        parent.appendChild(p);
      }
    }
  };

  // Se o Chart.js não carregou (ex.: offline antes da atualização local),
  // não quebra a página: apenas mostra mensagem nos gráficos.
  if (typeof Chart === 'undefined') {
    ['chart-vendas-dias', 'chart-receitas-despesas', 'chart-produtos', 'chart-categorias', 'chart-pagamentos', 'chart-entregadores'].forEach(id => {
      emptyMsg(id, 'Gráficos indisponíveis (biblioteca não carregada).');
    });
    return;
  }

  // Vendas por dia (Bar Chart)
  const ctxVendasDias = document.getElementById('chart-vendas-dias');
  if (ctxVendasDias && stats.vendasDias && stats.vendasDias.length > 0) {
    new Chart(ctxVendasDias, {
      type: 'bar',
      data: {
        labels: stats.vendasDias.map(d => d.d.split('-').reverse().join('/')),
        datasets: [{
          label: 'Faturamento (R$)',
          data: stats.vendasDias.map(d => d.total),
          backgroundColor: (context) => {
            const ctx = context.chart.ctx;
            const gradient = ctx.createLinearGradient(0, 0, 0, 400);
            gradient.addColorStop(0, 'rgba(56, 189, 248, 0.8)');
            gradient.addColorStop(1, 'rgba(56, 189, 248, 0.1)');
            return gradient;
          },
          borderRadius: 6
        }]
      },
      options: { ...commonOptions, plugins: { ...commonOptions.plugins, title: { display: true, text: 'Vendas por Dia (Últimos 7 Dias)', font: { size: 15, weight: 'bold' }, color: '#f8fafc' }, legend: { display: false } } }
    });
  } else { emptyMsg('chart-vendas-dias', 'Sem dados de vendas no período.'); }

  // Receitas vs Despesas (Doughnut Chart)
  const ctxRecDesp = document.getElementById('chart-receitas-despesas');
  if (ctxRecDesp && stats.receitasDespesas && stats.receitasDespesas.length > 0) {
    new Chart(ctxRecDesp, {
      type: 'doughnut',
      data: {
        labels: stats.receitasDespesas.map(d => d.tipo === 'Entrada' ? 'Receitas' : 'Despesas'),
        datasets: [{
          data: stats.receitasDespesas.map(d => d.total),
          backgroundColor: ['#10b981', '#f43f5e'],
          borderWidth: 0
        }]
      },
      options: doughnutOptions
    });
  } else { emptyMsg('chart-receitas-despesas', 'Sem dados financeiros no período.'); }

  // Produtos mais vendidos (Horizontal Bar Chart)
  const ctxProd = document.getElementById('chart-produtos');
  if (ctxProd && stats.produtosPopulares && stats.produtosPopulares.length > 0) {
    new Chart(ctxProd, {
      type: 'bar',
      data: {
        labels: stats.produtosPopulares.map(p => p.productName),
        datasets: [{
          label: 'Qtd. Vendida',
          data: stats.produtosPopulares.map(p => p.qty),
          backgroundColor: ['#6c5ce7', '#0984e3', '#00b894', '#fdcb6e', '#e84393'],
          borderRadius: 6
        }]
      },
      options: { ...commonOptions, indexAxis: 'y', plugins: { ...commonOptions.plugins, title: { display: true, text: 'Produtos Mais Vendidos', font: { size: 15, weight: 'bold' }, color: '#f8fafc' }, legend: { display: false } } }
    });
  } else { emptyMsg('chart-produtos', 'Nenhum produto vendido no período.'); }

  // Categorias (Pie Chart)
  const ctxCat = document.getElementById('chart-categorias');
  if (ctxCat && stats.categoriasPopulares && stats.categoriasPopulares.length > 0) {
    new Chart(ctxCat, {
      type: 'pie',
      data: {
        labels: stats.categoriasPopulares.map(c => c.categoria),
        datasets: [{
          data: stats.categoriasPopulares.map(c => c.qty),
          backgroundColor: ['#fdcb6e', '#00b894', '#0984e3', '#d63031', '#e84393'],
          borderWidth: 0
        }]
      },
      options: { ...doughnutOptions, cutout: 0, plugins: { ...doughnutOptions.plugins, title: { display: true, text: 'Categorias Mais Vendidas', font: { size: 15, weight: 'bold' }, color: '#f8fafc' } } }
    });
  } else { emptyMsg('chart-categorias', 'Sem dados de categorias.'); }

  // Formas de Pagamento (Doughnut Chart)
  const ctxPag = document.getElementById('chart-pagamentos');
  if (ctxPag && stats.formasPagamento && stats.formasPagamento.length > 0) {
    new Chart(ctxPag, {
      type: 'doughnut',
      data: {
        labels: stats.formasPagamento.map(f => f.forma_pagamento || 'Desconhecido'),
        datasets: [{
          data: stats.formasPagamento.map(f => f.qty),
          backgroundColor: ['#00cec9', '#ffeaa7', '#ff7675', '#a29bfe', '#dfe6e9'],
          borderWidth: 0
        }]
      },
      options: { ...doughnutOptions, plugins: { ...doughnutOptions.plugins, title: { display: true, text: 'Formas de Pagamento', font: { size: 15, weight: 'bold' }, color: '#f8fafc' } } }
    });
  } else { emptyMsg('chart-pagamentos', 'Sem dados de pagamentos.'); }

  // Entregadores (Bar Chart)
  const ctxEnt = document.getElementById('chart-entregadores');
  if (ctxEnt && stats.entregadores && stats.entregadores.length > 0) {
    new Chart(ctxEnt, {
      type: 'bar',
      data: {
        labels: stats.entregadores.map(e => e.entregador),
        datasets: [{
          label: 'Qtd. Entregas',
          data: stats.entregadores.map(e => e.entregas),
          backgroundColor: (context) => {
            const ctx = context.chart.ctx;
            const gradient = ctx.createLinearGradient(0, 0, 0, 400);
            gradient.addColorStop(0, 'rgba(252, 75, 21, 0.8)');
            gradient.addColorStop(1, 'rgba(252, 75, 21, 0.1)');
            return gradient;
          },
          borderRadius: 6
        }]
      },
      options: { ...commonOptions, plugins: { ...commonOptions.plugins, title: { display: true, text: 'Entregas por Entregador', font: { size: 15, weight: 'bold' }, color: '#f8fafc' }, legend: { display: false } } }
    });
  } else { emptyMsg('chart-entregadores', 'Sem dados de entregadores.'); }
});
