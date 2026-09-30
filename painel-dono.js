// painel-dono.js - Owner Mobile Dashboard Logic (v2 - 60+ Acessível)

// (Segurança) Escapa valor para conteúdo HTML.
function escHtml(v) {
  return (v === null || v === undefined) ? '' : String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// 0. Ghost Login / Impersonate Ingestion
(function checkImpersonate() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const impToken = urlParams.get('impersonate_token');
    if (impToken) {
      const parts = impToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        localStorage.setItem('chef_token', impToken);
        if (payload.restaurante_id) {
          localStorage.setItem('restaurante_id', String(payload.restaurante_id));
        }
        localStorage.setItem('logged_user', payload.usuario || 'admin');
        const creds = {
          id: payload.id,
          cargo: payload.cargo || 'Dono',
          role: payload.role || 'admin',
          nome: payload.nome || 'Proprietário',
          usuario: payload.usuario || 'admin',
          restaurante_id: payload.restaurante_id || 1,
          impersonated: true,
          impersonated_by: payload.impersonated_by || 'SuperAdmin'
        };
        localStorage.setItem('chef_credentials', JSON.stringify(creds));
        sessionStorage.setItem('chef_impersonate_session', 'true');
        sessionStorage.setItem('chef_impersonate_admin', payload.impersonated_by || 'SuperAdmin');
        sessionStorage.setItem('chef_impersonate_rest', payload.restaurante_nome || ('Restaurante #' + payload.restaurante_id));

        urlParams.delete('impersonate_token');
        const newQs = urlParams.toString();
        const newUrl = window.location.pathname + (newQs ? '?' + newQs : '');
        window.history.replaceState({}, document.title, newUrl);
      }
    }
  } catch (e) {
    console.error('[Impersonate Ingest Error]', e);
  }
})();

// Injeta banner de suporte remoto se em sessão de Ghost Login
(function renderSupportBanner() {
  if (sessionStorage.getItem('chef_impersonate_session') !== 'true') return;
  const doRender = function() {
    if (document.getElementById('banner-ghost-support')) return;
    const admin = sessionStorage.getItem('chef_impersonate_admin') || 'SuperAdmin';
    const restNome = sessionStorage.getItem('chef_impersonate_rest') || 'Restaurante';
    const b = document.createElement('div');
    b.id = 'banner-ghost-support';
    b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999999;background:linear-gradient(90deg,#ea580c,#c2410c);color:#fff;padding:8px 16px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 4px 20px rgba(0,0,0,0.5);font-family:sans-serif;font-size:13px;font-weight:700;letter-spacing:0.3px;';
    b.innerHTML = '<div style="display:flex;align-items:center;gap:10px;">'
      + '<span style="background:rgba(255,255,255,0.2);padding:3px 8px;border-radius:6px;font-size:11px;text-transform:uppercase;">Modo Suporte Remoto</span>'
      + '<span>Acessando <strong>' + restNome + '</strong> como Super Admin (<strong>' + admin + '</strong>)</span>'
      + '</div>'
      + '<button type="button" onclick="window.sairSessaoSuporte()" style="background:#fff;color:#c2410c;border:none;padding:5px 12px;border-radius:6px;font-weight:800;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:6px;box-shadow:0 2px 8px rgba(0,0,0,0.2);">'
      + '<span>✕ Sair do Acesso e Voltar</span>'
      + '</button>';
    document.body.prepend(b);
    document.body.style.paddingTop = (parseInt(document.body.style.paddingTop || 0) + 42) + 'px';
  };
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', doRender);
  } else {
    doRender();
  }
})();

window.sairSessaoSuporte = function() {
  sessionStorage.removeItem('chef_impersonate_session');
  sessionStorage.removeItem('chef_impersonate_admin');
  sessionStorage.removeItem('chef_impersonate_rest');
  localStorage.removeItem('chef_token');
  localStorage.removeItem('chef_credentials');
  window.location.href = '/super-admin.html';
};

// 1. Auth check
const token = localStorage.getItem('chef_token');
const loggedUser = localStorage.getItem('logged_user');

if (!token) {
  alert('Faça login primeiro para acessar esta página.');
  window.location.href = '/login.html';
}

// Global meta target
let metaVendas = parseFloat(localStorage.getItem('meta_dono_vendas')) || 5000;

// Initialize socket
const socket = (typeof io === 'function') ? io({
  query: {
    token: token,
    restaurante_id: localStorage.getItem('restaurante_id') || '1'
  }
}) : { on: () => {}, emit: () => {}, disconnect: () => {}, connect: () => {} };
if (typeof initChefTz === 'function') initChefTz(socket);

socket.on('tenant_atualizado', (data) => {
  if (data && data.restaurante_id) localStorage.setItem('restaurante_id', data.restaurante_id);
  if (data && data.token) localStorage.setItem('chef_token', data.token);
  socket.disconnect();
  socket.io.opts.query = { token: data.token, restaurante_id: String(data.restaurante_id) };
  socket.connect();
  if (typeof registrarListenersRestauranteDono === 'function') registrarListenersRestauranteDono();
});

// ─── Cache DOM elements ───────────────────────────────────────
const loader           = document.getElementById('loader');
const faturamentoEl    = document.getElementById('kpi-faturamento');
const mesasEl          = document.getElementById('kpi-mesas');
const ticketEl         = document.getElementById('kpi-ticket');
const equipeEl         = document.getElementById('kpi-equipe');
const goalPercentEl    = document.getElementById('goal-percent');
const goalLabelEl      = document.getElementById('goal-target-label');
const progressFillEl   = document.getElementById('kpi-progress-fill');
const headerTimeEl     = document.getElementById('header-time');
const caixaBadgeEl     = document.getElementById('caixa-badge');
const caixaBadgeTxtEl  = document.getElementById('caixa-badge-txt');

const cashierControlTitle    = document.getElementById('cashier-control-title');
const cashierControlSubtitle = document.getElementById('cashier-control-subtitle');
const cashierToggleBtn       = document.getElementById('cashier-toggle-btn');
const cashierBtnText         = document.getElementById('cashier-btn-text');
const cashierBtnIcon         = document.getElementById('cashier-btn-icon');

const metaInput    = document.getElementById('meta-input');
const notifInput   = document.getElementById('notif-input');
const rankingList  = document.getElementById('ranking-list');
const activityFeed = document.getElementById('activity-feed');

// ─── Helpers ─────────────────────────────────────────────────
function formatCurrency(val) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
}

function setLoader(show) {
  if (show) loader.classList.remove('hidden');
  else loader.classList.add('hidden');
}

// ─── Toast ───────────────────────────────────────────────────
function showToast(text, iconClass = 'ph-info', type = '') {
  const toast     = document.getElementById('toast');
  const toastText = document.getElementById('toast-text');
  const toastIcon = document.getElementById('toast-icon');

  toastText.innerText = text;
  toastIcon.className = `ph-bold ${iconClass}`;
  toast.className = `toast show ${type}`;

  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 4500);
}

// ─── Modal helpers ───────────────────────────────────────────
window.fecharModal = function(id) {
  document.getElementById(id).classList.add('hidden');
};

function abrirModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

// Fechar modal ao clicar no overlay
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.add('hidden');
  });
});

// ─── Clock ───────────────────────────────────────────────────
function startClock() {
  const update = () => {
    const d = new Date();
    if (headerTimeEl) headerTimeEl.innerText = chefFormatTime(new Date().toISOString());
  };
  update();
  setInterval(update, 60000);
}

// ─── Global period state ──────────────────────────────────────
window.periodoAtual    = 'hoje';
window.dataInicioCustom = '';
window.dataFimCustom   = '';

// ─── Carregar métricas via API ────────────────────────────────
async function carregarMetricas() {
  setLoader(true);
  try {
    let url = `/api/dono/dashboard?periodo=${window.periodoAtual}`;
    if (window.periodoAtual === 'custom' && window.dataInicioCustom && window.dataFimCustom) {
      url += `&data_inicio=${window.dataInicioCustom}&data_fim=${window.dataFimCustom}`;
    }

    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });

    if (res.status === 403 || res.status === 401) {
      alert('Sessão expirada ou sem permissão de administrador.');
      window.location.href = '/login.html';
      return;
    }

    const result = await res.json();
    if (result.success && result.data) {
      const data = result.data;

      // Period label
      const rotuloEl = document.getElementById('periodo-rotulo-exibicao');
      if (rotuloEl) rotuloEl.innerText = data.rotuloPeriodo || 'Hoje';

      const titleFat = document.getElementById('kpi-title-faturamento');
      if (titleFat) titleFat.innerText = `💰 Faturamento (${data.rotuloPeriodo || 'Hoje'})`;

      const subPed = document.getElementById('kpi-sub-total-pedidos');
      if (subPed) subPed.innerText = `${data.totalPedidos || 0} pedidos finalizados`;

      // KPIs Principais
      if (faturamentoEl) faturamentoEl.innerText = formatCurrency(data.faturamentoHoje);
      if (mesasEl)       mesasEl.innerText = data.mesasAtivas || '0';
      if (ticketEl)      ticketEl.innerText = formatCurrency(data.ticketMedio);
      if (equipeEl)      equipeEl.innerText = data.colaboradoresAtivos || '0';

      const pedidosEl = document.getElementById('kpi-pedidos');
      if (pedidosEl) pedidosEl.innerText = data.totalPedidos || 0;

      // ── Copiloto Cheff IA Insight ──
      const iaText = document.getElementById('ia-insight-text');
      if (iaText) {
        iaText.innerText = data.iaInsight || 'Operação estável. Acompanhe os indicadores em tempo real para otimizar suas vendas.';
      }

      // ── Comparativo vs Período Anterior ──
      const badgeVar = document.getElementById('kpi-badge-variacao');
      if (badgeVar && data.variacao) {
        const isPos = data.variacao.percentual >= 0;
        badgeVar.style.background = isPos ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)';
        badgeVar.style.color = isPos ? '#22c55e' : '#ef4444';
        badgeVar.innerHTML = `<i class="ph-bold ph-trend-${isPos ? 'up' : 'down'}"></i> ${escHtml(data.variacao.texto)}`;
      }

      // ── Lucro Líquido & DRE ──
      if (data.dre) {
        const lucroEl = document.getElementById('kpi-lucro-liquido');
        if (lucroEl) lucroEl.innerText = formatCurrency(data.dre.lucroLiquido);

        const margemBadge = document.getElementById('kpi-margem-lucro-badge');
        if (margemBadge) margemBadge.innerText = `Margem: ${data.dre.margemLucro}%`;

        const cmvEl = document.getElementById('dre-cmv');
        if (cmvEl) cmvEl.innerText = formatCurrency(data.dre.cmvEstimado);

        const taxasEl = document.getElementById('dre-taxas');
        if (taxasEl) taxasEl.innerText = formatCurrency(data.dre.taxasEstimadas);

        const despesasEl = document.getElementById('dre-despesas');
        if (despesasEl) despesasEl.innerText = formatCurrency(data.dre.despesasReais);
      }

      // ── Canais de Venda & Economia Marketplace ──
      if (data.canais) {
        const c = data.canais;
        const valEcon = document.getElementById('val-economia-marketplace');
        if (valEcon) valEcon.innerText = formatCurrency(c.economiaMarketplace || 0);

        const barSalao = document.getElementById('bar-canal-salao');
        const barDelivery = document.getElementById('bar-canal-delivery');
        const barBalcao = document.getElementById('bar-canal-balcao');
        if (barSalao) barSalao.style.width = `${Math.max(c.salao.percentual, 2)}%`;
        if (barDelivery) barDelivery.style.width = `${Math.max(c.delivery.percentual, 2)}%`;
        if (barBalcao) barBalcao.style.width = `${Math.max(c.balcao.percentual, 2)}%`;

        const valSalao = document.getElementById('val-canal-salao');
        if (valSalao) valSalao.innerText = formatCurrency(c.salao.valor);
        const pctSalao = document.getElementById('pct-canal-salao');
        if (pctSalao) pctSalao.innerText = `${c.salao.percentual}%`;
        const pedSalao = document.getElementById('ped-canal-salao');
        if (pedSalao) pedSalao.innerText = `${c.salao.pedidos} pedidos`;

        const valDeliv = document.getElementById('val-canal-delivery');
        if (valDeliv) valDeliv.innerText = formatCurrency(c.delivery.valor);
        const pctDeliv = document.getElementById('pct-canal-delivery');
        if (pctDeliv) pctDeliv.innerText = `${c.delivery.percentual}%`;
        const pedDeliv = document.getElementById('ped-canal-delivery');
        if (pedDeliv) pedDeliv.innerText = `${c.delivery.pedidos} entregas (100% margem)`;

        const valBalc = document.getElementById('val-canal-balcao');
        if (valBalc) valBalc.innerText = formatCurrency(c.balcao.valor);
        const pctBalc = document.getElementById('pct-canal-balcao');
        if (pctBalc) pctBalc.innerText = `${c.balcao.percentual}%`;
        const pedBalc = document.getElementById('ped-canal-balcao');
        if (pedBalc) pedBalc.innerText = `${c.balcao.pedidos} retiradas`;
      }

      // ── Radar Antifraude ──
      if (data.antifraude) {
        const af = data.antifraude;
        const cancVal = document.getElementById('antifraude-cancelados-val');
        if (cancVal) cancVal.innerText = formatCurrency(af.canceladosValor);
        const cancQtd = document.getElementById('antifraude-cancelados-qtd');
        if (cancQtd) cancQtd.innerText = `${af.canceladosQtd} pedidos cancelados`;

        const sangVal = document.getElementById('antifraude-sangrias-val');
        if (sangVal) sangVal.innerText = formatCurrency(af.sangriasValor);
        const sangQtd = document.getElementById('antifraude-sangrias-qtd');
        if (sangQtd) sangQtd.innerText = `${af.sangriasQtd} saídas de caixa`;

        const badgeFraude = document.getElementById('badge-status-fraude');
        if (badgeFraude) {
          if (af.canceladosValor > 150 || af.canceladosQtd >= 4) {
            badgeFraude.style.background = 'rgba(239,68,68,0.15)';
            badgeFraude.style.color = '#ef4444';
            badgeFraude.style.borderColor = 'rgba(239,68,68,0.3)';
            badgeFraude.innerHTML = '⚠ Atenção aos Desvios';
          } else {
            badgeFraude.style.background = 'rgba(34,197,94,0.12)';
            badgeFraude.style.color = '#22c55e';
            badgeFraude.style.borderColor = 'rgba(34,197,94,0.3)';
            badgeFraude.innerHTML = '✓ Operação Segura';
          }
        }
      }

      // Meta
      if (metaInput) metaInput.value = metaVendas;
      if (goalLabelEl) goalLabelEl.innerText = `Meta: ${formatCurrency(metaVendas)}`;

      const percent = metaVendas > 0
        ? Math.min(100, Math.round((data.faturamentoHoje / metaVendas) * 100))
        : 0;
      if (goalPercentEl)  goalPercentEl.innerText = `${percent}% da meta`;
      if (progressFillEl) progressFillEl.style.width = `${percent}%`;

      // Caixa status
      const isOpen = data.caixaStatus === 'Aberto';

      if (caixaBadgeEl) {
        caixaBadgeEl.className = `status-pill ${isOpen ? 'open' : 'closed'}`;
        caixaBadgeEl.innerHTML = `<span class="dot"></span><span id="caixa-badge-txt">${escHtml(data.caixaStatus)}</span>`;
      }

      if (cashierControlTitle)    cashierControlTitle.innerText  = isOpen ? 'Caixa está Aberto ✅' : 'Caixa está Fechado 🔒';
      if (cashierControlSubtitle) cashierControlSubtitle.innerText = isOpen
        ? `Fundo de troco: ${formatCurrency(data.caixaSaldo)}`
        : 'Toque em "Abrir" para iniciar as vendas.';

      // KPI Status Operacional
      const statusOpEl = document.getElementById('kpi-status-operacao');
      const statusOpSub = document.getElementById('kpi-status-operacao-sub');
      const iconStatusOp = document.getElementById('kpi-icon-status-op');
      if (statusOpEl) {
        statusOpEl.innerText = isOpen ? 'Aberto' : 'Fechado';
        statusOpEl.style.color = isOpen ? 'var(--green)' : '#ef4444';
      }
      if (statusOpSub) {
        statusOpSub.innerText = isOpen ? (data.caixaSaldo ? `Saldo: ${formatCurrency(data.caixaSaldo)}` : 'Caixa em atendimento') : 'Caixa fechado';
      }
      if (iconStatusOp) {
        iconStatusOp.className = `kpi-icon ${isOpen ? 'green' : 'orange'}`;
        iconStatusOp.innerHTML = `<i class="ph-fill ph-${isOpen ? 'check-circle' : 'lock'}"></i>`;
      }

      if (cashierToggleBtn) {
        if (isOpen) {
          cashierToggleBtn.className = 'btn-caixa close';
          if (cashierBtnText) cashierBtnText.innerText = 'Fechar';
          if (cashierBtnIcon) cashierBtnIcon.className = 'ph-bold ph-lock';
          cashierToggleBtn.onclick = fecharCaixaFluxo;
        } else {
          cashierToggleBtn.className = 'btn-caixa open';
          if (cashierBtnText) cashierBtnText.innerText = 'Abrir';
          if (cashierBtnIcon) cashierBtnIcon.className = 'ph-bold ph-lock-open';
          cashierToggleBtn.onclick = abrirCaixaFluxo;
        }
      }

      // Ranking de produtos
      if (rankingList) {
        if (data.topProdutos && data.topProdutos.length > 0) {
          rankingList.innerHTML = data.topProdutos.map((p, idx) => `
            <div class="ranking-item">
              <span class="ranking-pos">${idx + 1}º</span>
              <span class="rk-name">${escHtml(p.productEmoji || '🍽️')} ${escHtml(p.productName)}</span>
              <span class="rk-val">${p.quantidade}x</span>
            </div>
          `).join('');
        } else {
          rankingList.innerHTML = `<div style="text-align:center;color:var(--text-sub);padding:24px;font-size:var(--fs-md);">Nenhuma venda (${escHtml(data.rotuloPeriodo || 'período')}).</div>`;
        }
      }

      // ─── Destaques da Equipe & Batalha de Vendas (Gamificação) ───
      if (data.equipePerformance) {
        renderizarEquipePerformance(data.equipePerformance);
      }

      // ─── Programa Indique & Ganhe Parceiros ───
      initIndicacaoParceiros();

      // ─── BI Executivo: DRE & Engenharia de Cardápio ───
      if (typeof carregarBIDonoExecutivo === "function") carregarBIDonoExecutivo();

      // ─── Atualizar Badges de Resumo das Seções Recolhidas ───
      if (typeof window.atualizarBadgesResumoSecoes === 'function') {
        window.atualizarBadgesResumoSecoes(data);
      }
    }
  } catch (error) {
    console.error('Erro ao carregar métricas:', error);
    showToast('Erro de conexão ao atualizar métricas', 'ph-wifi-slash', 'error');
  } finally {
    setLoader(false);
  }
}

// ═════════════════════════════════════════════════════════════════════
// 🏆 DESTAQUES DA EQUIPE, GAMIFICAÇÃO & INDIQUE E GANHE
// ═════════════════════════════════════════════════════════════════════
let _cachedGamificacao = { meta: 25000, premio: 'Premiação especial para a equipe' };

function renderizarEquipePerformance(perf) {
  if (!perf) return;

  // 1. Destaque Lucro
  const dLucroNome = document.getElementById('destaque-lucro-nome');
  const dLucroVal  = document.getElementById('destaque-lucro-val');
  const dLucroSub  = document.getElementById('destaque-lucro-sub');
  if (dLucroNome && dLucroVal) {
    if (perf.destaqueLucro) {
      dLucroNome.innerText = perf.destaqueLucro.nome;
      dLucroVal.innerText  = formatCurrency(perf.destaqueLucro.lucroGerado);
      if (dLucroSub) dLucroSub.innerText = `${perf.destaqueLucro.atendimentos} atendimentos concluídos`;
    } else {
      dLucroNome.innerText = 'Sem vendas no período';
      dLucroVal.innerText  = 'R$ 0,00';
      if (dLucroSub) dLucroSub.innerText = 'Aguardando pedidos fechados';
    }
  }

  // 2. Destaque Atendimentos
  const dAtendNome = document.getElementById('destaque-atendimentos-nome');
  const dAtendVal  = document.getElementById('destaque-atendimentos-val');
  const dAtendSub  = document.getElementById('destaque-atendimentos-sub');
  if (dAtendNome && dAtendVal) {
    if (perf.destaqueAtendimentos) {
      dAtendNome.innerText = perf.destaqueAtendimentos.nome;
      dAtendVal.innerText  = `${perf.destaqueAtendimentos.atendimentos} atendimentos`;
      if (dAtendSub) dAtendSub.innerText = `Ticket médio de ${formatCurrency(perf.destaqueAtendimentos.ticketMedio)}`;
    } else {
      dAtendNome.innerText = 'Sem atendimentos';
      dAtendVal.innerText  = '0 atendimentos';
      if (dAtendSub) dAtendSub.innerText = 'Aguardando lançamentos da equipe';
    }
  }

  // 3. Destaque Vendas (Volume Total)
  const dVendasNome = document.getElementById('destaque-vendas-nome');
  const dVendasVal  = document.getElementById('destaque-vendas-val');
  const dVendasSub  = document.getElementById('destaque-vendas-sub');
  if (dVendasNome && dVendasVal) {
    if (perf.destaqueVendas) {
      dVendasNome.innerText = perf.destaqueVendas.nome;
      dVendasVal.innerText  = formatCurrency(perf.destaqueVendas.totalVendido);
      if (dVendasSub) dVendasSub.innerText = `Comissão estimada: ${formatCurrency(perf.destaqueVendas.comissao)}`;
    } else {
      dVendasNome.innerText = 'Sem vendas no período';
      dVendasVal.innerText  = 'R$ 0,00';
      if (dVendasSub) dVendasSub.innerText = 'Volume total de faturamento';
    }
  }

  // 4. Termômetro da Gamificação & Meta Coletiva
  if (perf.gamificacao) {
    _cachedGamificacao = perf.gamificacao;
    const g = perf.gamificacao;
    const badgeEl = document.getElementById('gamificacao-badge-percent');
    const fillEl  = document.getElementById('gamificacao-progress-fill');
    const atualEl = document.getElementById('gamificacao-atual-val');
    const metaEl  = document.getElementById('gamificacao-meta-val');
    const premioEl= document.getElementById('gamificacao-premio-txt');
    const descEl  = document.getElementById('gamificacao-status-desc');

    if (badgeEl) badgeEl.innerText = `${g.percentual}% Concluído`;
    if (fillEl)  fillEl.style.width = `${Math.min(100, Math.max(g.percentual, 3))}%`;
    if (atualEl) atualEl.innerText = formatCurrency(g.totalVendido);
    if (metaEl)  metaEl.innerText  = formatCurrency(g.meta);
    if (premioEl)premioEl.innerText= g.premio || 'Não configurado';

    if (descEl) {
      if (g.atingida) {
        descEl.innerHTML = '<span style="color:#10b981; font-weight:800;">🎉 META CONQUISTADA! Prêmio desbloqueado para a equipe!</span>';
      } else {
        descEl.innerHTML = `Faltam apenas <strong style="color:var(--text);">${formatCurrency(g.restante)}</strong> para a equipe desbloquear o prêmio!`;
      }
    }
  }

  // 5. Ranking Individual de Produtividade dos Colaboradores
  const containerRanking = document.getElementById('lista-ranking-colaboradores');
  if (containerRanking) {
    const colabs = perf.colaboradores || [];
    if (colabs.length > 0) {
      containerRanking.innerHTML = colabs.map((c, idx) => {
        const medalhas = ['🥇', '🥈', '🥉'];
        const medalha = medalhas[idx] || `${idx + 1}º`;
        const corMedalha = idx === 0 ? '#f59e0b' : (idx === 1 ? '#94a3b8' : (idx === 2 ? '#b45309' : 'var(--text-sub)'));
        const inicial = (c.nome || '?').charAt(0).toUpperCase();

        return `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 18px; border-bottom: 1px solid var(--border); gap: 12px; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 12px; min-width: 180px;">
              <span style="font-size: 16px; font-weight: 900; color: ${corMedalha}; width: 24px; text-align: center;">${medalha}</span>
              <div style="width: 38px; height: 38px; border-radius: 12px; background: linear-gradient(135deg, #fc4b15, #ff8c00); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 15px; flex-shrink: 0;">
                ${inicial}
              </div>
              <div style="min-width: 0;">
                <div style="font-size: 14px; font-weight: 800; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px;">${escHtml(c.nome)}</div>
                <div style="font-size: 11.5px; color: var(--text-sub); display: flex; align-items: center; gap: 6px;">
                  <span>${c.atendimentos} atendimentos</span>
                  <span>•</span>
                  <span>Ticket: ${formatCurrency(c.ticketMedio)}</span>
                </div>
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 18px; text-align: right; flex-wrap: wrap;">
              <div>
                <div style="font-size: 11px; font-weight: 700; color: var(--text-sub); text-transform: uppercase;">Total Vendido</div>
                <div style="font-size: 14.5px; font-weight: 800; color: var(--text);">${formatCurrency(c.totalVendido)}</div>
              </div>
              <div>
                <div style="font-size: 11px; font-weight: 700; color: #10b981; text-transform: uppercase;">Lucro Gerado</div>
                <div style="font-size: 14.5px; font-weight: 900; color: #10b981;">${formatCurrency(c.lucroGerado)}</div>
              </div>
              <div>
                <div style="font-size: 11px; font-weight: 700; color: #f59e0b; text-transform: uppercase;">Comissão Est.</div>
                <div style="font-size: 14.5px; font-weight: 800; color: #f59e0b;">${formatCurrency(c.comissao)}</div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    } else {
      containerRanking.innerHTML = '<div style="text-align:center; color:var(--text-sub); padding:24px; font-size:13px;">Nenhum atendimento finalizado pela equipe no período selecionado.</div>';
    }
  }
}

window.abrirModalGamificacao = async function() {
  const metaInp = document.getElementById('input-gamificacao-meta');
  const premioInp = document.getElementById('input-gamificacao-premio');
  if (metaInp && _cachedGamificacao.meta) metaInp.value = _cachedGamificacao.meta;
  if (premioInp && _cachedGamificacao.premio) premioInp.value = _cachedGamificacao.premio;

  try {
    const res = await fetch('/api/dono/gamificacao-config', { headers: { 'Authorization': `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        if (metaInp && data.meta) metaInp.value = data.meta;
        if (premioInp && data.premio) premioInp.value = data.premio;
      }
    }
  } catch (e) {}

  abrirModal('modal-gamificacao-config');
};

window.salvarConfigGamificacao = async function() {
  const metaVal = parseFloat(document.getElementById('input-gamificacao-meta')?.value) || 0;
  const premioVal = (document.getElementById('input-gamificacao-premio')?.value || '').trim();

  if (metaVal <= 0) {
    return showToast('Informe uma meta válida em reais.', 'ph-warning');
  }

  try {
    const res = await fetch('/api/dono/gamificacao-config', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ meta: metaVal, premio: premioVal })
    });
    const data = await res.json();
    if (data.success) {
      fecharModal('modal-gamificacao-config');
      showToast('Gamificação salva com sucesso!', 'ph-check-circle', 'success');
      carregarMetricas();
    } else {
      showToast(data.error || 'Erro ao salvar gamificação', 'ph-x-circle', 'error');
    }
  } catch (e) {
    showToast('Erro de conexão ao salvar', 'ph-wifi-slash', 'error');
  }
};

window.initIndicacaoParceiros = function() {
  const restId = localStorage.getItem('restaurante_id') || '1';
  const linkEl = document.getElementById('link-indicacao-parceiro-dono');
  if (linkEl) {
    linkEl.value = `${window.location.origin}/cadastro.html?ref=PARCEIRO-${restId}`;
  }
};

window.copiarLinkIndicacaoDono = function() {
  const linkEl = document.getElementById('link-indicacao-parceiro-dono');
  if (!linkEl) return;
  linkEl.select();
  navigator.clipboard.writeText(linkEl.value).then(() => {
    showToast('Link de indicação copiado com sucesso!', 'ph-copy', 'success');
  }).catch(() => {
    showToast('Não foi possível copiar automaticamente.', 'ph-warning');
  });
};

window.compartilharIndicacaoWhatsAppDono = function() {
  const restId = localStorage.getItem('restaurante_id') || '1';
  const refLink = `${window.location.origin}/cadastro.html?ref=PARCEIRO-${restId}`;
  const msg = encodeURIComponent(`Olá amigo! Tudo bem?\n\nEstou usando o sistema Chef Cozinha aqui no meu restaurante e recomendo muito para controle de mesas, comanda digital, delivery e fechamento de caixa sem erros.\n\nConsegui um convite exclusivo com 15 dias de teste 100% grátis e implantação prioritária para você:\n👉 ${refLink}\n\nVale muito a pena conhecer!`);
  window.open(`https://wa.me/?text=${msg}`, '_blank');
};

window.abrirModalRegrasIndicacao = function() {
  abrirModal('modal-regras-indicacao');
};

// ─── Period Filters ───────────────────────────────────────────
window.selecionarPeriodoDono = function(periodo, btnEl) {
  window.periodoAtual = periodo;
  document.querySelectorAll('.btn-periodo').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  const cust = document.getElementById('container-datas-custom');
  if (cust) cust.style.display = 'none';
  carregarMetricas();
};

window.togglePeriodoCustomDono = function(btnEl) {
  document.querySelectorAll('.btn-periodo').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  const container = document.getElementById('container-datas-custom');
  if (container) container.style.display = container.style.display === 'none' ? 'flex' : 'none';
};

window.aplicarDatasCustomDono = function() {
  const ini = document.getElementById('dono-data-inicio').value;
  const fim = document.getElementById('dono-data-fim').value;
  if (!ini || !fim) return showToast('Selecione a data inicial e final.', 'ph-warning');
  window.periodoAtual    = 'custom';
  window.dataInicioCustom = ini;
  window.dataFimCustom   = fim;
  carregarMetricas();
};

// ─── Controle Remoto — Navegação e Ações do Caixa ─────────────
window.comandarNavegacao = function(destino) {
  socket.emit('comando_navegar_caixa', {
    destino: destino,
    solicitadoPor: loggedUser || 'Dono'
  });
  showToast(`Enviando caixa para ${destino}...`, 'ph-paper-plane');
  adicionarAoFeed('aviso', `Você direcionou o caixa para: ${destino}`);
};

window.comandarCaixaAcao = function(acao, payload) {
  socket.emit('comando_caixa_acao', {
    acao: acao,
    payload: payload || {},
    solicitadoPor: loggedUser || 'Dono'
  });
  const labels = {
    'recarregar': '🔄 Recarregando terminal do Caixa (F5)...',
    'bloquear_tela': '🔒 Bloqueio de segurança enviado ao Caixa!',
    'tocar_alerta': '🔔 Alerta sonoro tocando no Caixa!',
    'alternar_tema': '🌓 Tema do Caixa alternado!',
    'abrir_gaveta': '🖨️ Gaveta de dinheiro acionada!',
    'abrir_fila': '🪑 Fila de espera aberta no Caixa!'
  };
  showToast(labels[acao] || `Comando ${acao} enviado ao Caixa!`, 'ph-lightning');
  adicionarAoFeed('aviso', `Comando executado no Caixa: ${labels[acao] || acao}`);
};

// ─── Modo Totem — transformar um dispositivo em kiosk de autoatendimento ──
let _totemDevicesCb = null;
socket.on('connected_devices', (lista) => {
  if (typeof _totemDevicesCb === 'function') _totemDevicesCb(lista || []);
});

window.abrirModalTotemDispositivos = function() {
  abrirModal('modal-totem-dispositivo');
  carregarListaDispositivosTotem();
};

window.carregarListaDispositivosTotem = function() {
  const container = document.getElementById('lista-totem-dispositivos');
  if (!container) return;
  container.innerHTML = `<div style="text-align:center; color:var(--text-sub); padding:16px; font-size:var(--fs-sm);">Carregando dispositivos...</div>`;
  fetch('/api/totem/status', { headers: { 'Authorization': `Bearer ${localStorage.getItem('chef_token')}` } })
    .then(r => r.json())
    .then(st => {
      const avisoUpsell = document.getElementById('aviso-upsell-totem');
      if (avisoUpsell) avisoUpsell.style.display = (st && st.feature_ativa === false) ? 'block' : 'none';
      _totemDevicesCb = (lista) => renderizarDispositivosTotem(lista, st);
      socket.emit('get_connected_devices');
    })
    .catch(() => {
      _totemDevicesCb = (lista) => renderizarDispositivosTotem(lista, null);
      socket.emit('get_connected_devices');
    });
};

function renderizarDispositivosTotem(lista, statusTotem) {
  const container = document.getElementById('lista-totem-dispositivos');
  if (!container) return;

  const badge = document.getElementById('totem-badge-ativo');
  if (badge) {
    const haTotem = (lista || []).some(d =>
      String(d.device || '').toLowerCase().includes('totem') ||
      String(d.cargo || '').toLowerCase().includes('totem') ||
      String(d.user || '').toLowerCase().includes('totem') ||
      String(d.tipo || '').toLowerCase() === 'totem');
    badge.style.display = haTotem ? 'inline-block' : 'none';
  }

  if (!lista || lista.length === 0) {
    container.innerHTML = `<div style="text-align:center; color:var(--text-sub); padding:20px; font-size:var(--fs-sm);">
      Nenhum dispositivo conectado agora.<br/>Abra o sistema no aparelho/tablet que virará totem e atualize a lista.</div>`;
    return;
  }

  const featureAtiva = !statusTotem || statusTotem.feature_ativa !== false;

  container.innerHTML = lista.map(d => {
    const ehTotem = String(d.device || '').toLowerCase().includes('totem') ||
      String(d.cargo || '').toLowerCase().includes('totem') ||
      String(d.user || '').toLowerCase().includes('totem') ||
      String(d.tipo || '').toLowerCase() === 'totem';
    const icone = d.isMobile ? 'ph-device-mobile' : 'ph-desktop-tower';
    const apelido = d.apelido || '';
    const tipoBadge = (d.tipo && d.tipo.toLowerCase() !== 'totem')
      ? `<span style="font-size:9px; background:#fef9c3; color:#a16207; padding:1px 7px; border-radius:10px; font-weight:800; text-transform:uppercase; margin-left:5px;">${escHtml(d.tipo)}</span>` : '';
    return `
      <div style="display:flex; align-items:center; gap:10px; padding:10px 12px; border:1px solid var(--border); border-radius:12px; background:var(--bg);">
        <i class="ph-bold ${icone}" style="font-size:20px; color:${ehTotem ? '#0ea5e9' : 'var(--text-sub)'};"></i>
        <div style="flex:1; min-width:0;">
          <div style="font-weight:800; font-size:12.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${apelido ? escHtml(apelido) + tipoBadge + ` <span style="font-weight:400; color:var(--text-sub); font-size:10.5px;">(${escHtml(d.model || d.browser || '')})</span>` : escHtml(d.model || d.browser || 'Dispositivo')}${ehTotem ? ' <span style="font-size:9px; background:#e0f2fe; color:#0369a1; padding:1px 7px; border-radius:10px; font-weight:800;">TOTEM</span>' : ''}</div>
          <div style="font-size:10.5px; color:var(--text-sub);">${escHtml(d.user || 'Visitante')} • ${escHtml(d.os || '')} • ${escHtml(d.tempoConectadoStr || '')}${d.serial ? ` • <span title="Serial do terminal">${escHtml(d.serial)}</span>` : ''}</div>
        </div>
        ${ehTotem
          ? `<button onclick="donoRotacionarTotem('${d.id}')" title="Alternar retrato/paisagem remotamente" style="padding:8px 10px; border:none; border-radius:10px; background:#6366f1; color:#fff; font-weight:800; font-size:11px; cursor:pointer; display:flex; align-items:center; gap:5px;"><i class="ph-bold ph-frame-corners"></i> Girar</button>
             <button onclick="donoLiberarTotem('${d.id}')" style="padding:8px 12px; border:none; border-radius:10px; background:#f59e0b; color:#fff; font-weight:800; font-size:11px; cursor:pointer; display:flex; align-items:center; gap:5px;"><i class="ph-bold ph-lock-open"></i> Liberar</button>`
          : `<button onclick="donoAtivarTotem('${d.id}')" ${featureAtiva ? '' : 'disabled style="opacity:0.5;"'} style="padding:8px 12px; border:none; border-radius:10px; background:#0ea5e9; color:#fff; font-weight:800; font-size:11px; cursor:pointer; display:flex; align-items:center; gap:5px;"><i class="ph-bold ph-monitor-play"></i> Virar Totem</button>`}
      </div>`;
  }).join('');

  if (!featureAtiva) {
    container.insertAdjacentHTML('beforeend',
      `<div id="aviso-upsell-totem" style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.35); color:#ef4444; padding:10px 12px; border-radius:12px; font-size:11.5px; line-height:1.5; margin-top:4px;">
        <strong>Upsell não contratado:</strong> o módulo Totem de Autoatendimento não está ativo neste plano.
        Fale com o suporte Chef Cozinha para contratar.
      </div>`);
  }
}

window.donoAtivarTotem = function(deviceId) {
  socket.emit('dono_ativar_totem_dispositivo', { device_id: deviceId });
  showToast('Direcionando dispositivo ao Modo Totem...', 'ph-monitor-play');
  adicionarAoFeed('aviso', 'Você ativou o Modo Totem em um dispositivo.');
};

window.donoLiberarTotem = function(deviceId) {
  socket.emit('dono_liberar_totem_dispositivo', { device_id: deviceId });
  showToast('Liberando dispositivo do Modo Totem...', 'ph-lock-open');
  adicionarAoFeed('aviso', 'Você liberou um dispositivo do Modo Totem.');
};

// Rotação da tela do totem — exclusiva do controle remoto do dono
window.donoRotacionarTotem = function(deviceId) {
  socket.emit('dono_rotacionar_totem_dispositivo', { device_id: deviceId });
  showToast('Alternando orientação da tela do totem...', 'ph-frame-corners');
  adicionarAoFeed('aviso', 'Você alternou a orientação de um totem.');
};

// ─── Controle Remoto de Cada Colaborador ───────────────────────
let _cachedFuncionariosRemoto = [];

window.renderizarListaFuncionariosRemoto = function(funcs) {
  const container = document.getElementById('lista-controle-colaboradores');
  if (!container) return;

  const lista = Array.isArray(funcs) ? funcs : [];
  _cachedFuncionariosRemoto = lista;

  // 1. Separar pendentes vs ativos
  const boxPendentes = document.getElementById('dono-box-pendentes');
  const listaPendentes = document.getElementById('dono-lista-pendentes');
  const badgeCount = document.getElementById('dono-badge-pendentes-count');

  const pendentes = lista.filter(f => f.status === 'Pendente' || (f.ativo === 0 && f.status !== 'Inativo'));
  const ativos = lista.filter(f => f.status !== 'Pendente' && f.ativo !== 0);

  if (boxPendentes) {
    if (pendentes.length > 0) {
      boxPendentes.style.display = 'block';
      if (badgeCount) badgeCount.textContent = String(pendentes.length);
      if (listaPendentes) {
        listaPendentes.innerHTML = pendentes.map(f => {
          const nome = escHtml(f.nome || 'Novo Colaborador');
          const cargoPretendido = escHtml(f.cargo || 'Não especificado');
          const usuario = escHtml(f.usuario || '');
          const tel = f.telefone ? escHtml(f.telefone) : '';
          return `
            <div style="background: var(--card); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 12px; padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 38px; height: 38px; border-radius: 50%; background: rgba(245, 158, 11, 0.2); color: #f59e0b; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 15px;">
                  ${escHtml((f.nome || 'P').charAt(0).toUpperCase())}
                </div>
                <div>
                  <strong style="font-size: 13.5px; color: var(--text); display: block;">${nome}</strong>
                  <span style="font-size: 11.5px; color: var(--text-sub);">Usuário: <code>@${usuario}</code> • Pretendido: <b>${cargoPretendido}</b> ${tel ? `• Tel: ${tel}` : ''}</span>
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <button type="button" class="btn-primary" onclick="abrirModalAprovarColaboradorDono(${f.id})" style="padding: 6px 14px; font-size: 12px; border-radius: 8px; gap: 4px; background: #10b981; border-color: #10b981;">
                  <i class="ph-bold ph-check"></i> Aprovar
                </button>
                <button type="button" class="btn-cancel" onclick="recusarColaboradorDono(${f.id})" style="padding: 6px 12px; font-size: 12px; border-radius: 8px; gap: 4px; color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3);">
                  <i class="ph-bold ph-x"></i> Recusar
                </button>
              </div>
            </div>
          `;
        }).join('');
      }
    } else {
      boxPendentes.style.display = 'none';
    }
  }

  if (ativos.length === 0) {
    container.innerHTML = `<div style="text-align:center; color:var(--text-sub); padding:20px; font-size:var(--fs-sm);">Nenhum colaborador ativo no momento.</div>`;
    return;
  }

  container.innerHTML = ativos.map(f => {
    const nome = escHtml(f.nome || 'Colaborador');
    const cargo = escHtml(f.cargo || 'Equipe');
    const tel = f.telefone ? escHtml(f.telefone) : '';
    const inicial = (f.nome || 'C').charAt(0).toUpperCase();

    return `
      <div class="colab-card colab-card-click" id="colab-card-${f.id}" role="button" tabindex="0"
           onclick="abrirModalFuncoesColaborador(${f.id})"
           onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();abrirModalFuncoesColaborador(${f.id});}"
           title="Abrir funções remotas de ${nome}">
        <div class="colab-user">
          <div class="colab-avatar">
            ${inicial}
            <div class="colab-status-dot online" title="Status: Conectado / Ativo"></div>
          </div>
          <div class="colab-info">
            <strong>${nome}</strong>
            <span><i class="ph ph-identification-card"></i> ${cargo}${tel ? ` • ${tel}` : ''}</span>
          </div>
        </div>
        <i class="ph-bold ph-caret-right colab-chevron"></i>
      </div>
    `;
  }).join('');
};

// ─── Modal de Funções do Colaborador ───────────────────────────
window.abrirModalFuncoesColaborador = function(id) {
  const f = _cachedFuncionariosRemoto.find(x => String(x.id) === String(id));
  if (!f) return;
  const alvoId = document.getElementById('funcoes-colab-target-id');
  if (!alvoId) return;
  alvoId.value = f.id;
  document.getElementById('funcoes-colab-nome').textContent = f.nome || 'Colaborador';
  document.getElementById('funcoes-colab-cargo').textContent =
    `${f.cargo || 'Equipe'}${f.telefone ? ' • ' + f.telefone : ''}`;
  document.getElementById('funcoes-colab-avatar').innerHTML =
    `${escHtml((f.nome || 'C').charAt(0).toUpperCase())}<div class="colab-status-dot online" title="Status: Conectado / Ativo"></div>`;
  abrirModal('modal-funcoes-colaborador');
};

window.executarAcaoColaborador = function(acao) {
  const id = document.getElementById('funcoes-colab-target-id').value;
  const f = _cachedFuncionariosRemoto.find(x => String(x.id) === String(id));
  if (!f) return;
  const nome = f.nome || 'Colaborador';
  fecharModal('modal-funcoes-colaborador');

  switch (acao) {
    case 'mensagem':   abrirModalMsgColaborador(f.id, nome); break;
    case 'chamar':     chamarColaboradorVibrar(f.id, nome); break;
    case 'direcionar': abrirModalDirecionarApp(f.id, nome); break;
    case 'ponto':      baterPontoColaborador(f.id, nome); break;
    case 'pagamento':  abrirModalRhDonoComColab(f.id, 'pagamento'); break;
    case 'folga':      abrirModalRhDonoComColab(f.id, 'folga'); break;
    case 'logout':     desconectarSessaoColaborador(f.id, nome); break;
    case 'zap': {
      const tel = String(f.telefone || '').replace(/\D/g, '');
      if (tel.length >= 10) {
        window.open('https://wa.me/55' + tel, '_blank');
      } else {
        showToast('Sem telefone cadastrado — enviando alerta sonoro.', 'ph-speaker-high', 'info');
        chamarColaboradorVibrar(f.id, nome);
      }
      break;
    }
  }
};

// ─── Seletor de Layout do Painel (3 opções configuráveis) ──────
window.definirLayoutDono = function(layout) {
  const permitidos = ['compacto', 'confortavel', 'dashboard'];
  if (!permitidos.includes(layout)) layout = 'confortavel';
  try { localStorage.setItem('dono_layout', layout); } catch (e) { }
  document.body.setAttribute('data-layout-dono', layout);
  document.querySelectorAll('.ls-btn[data-ls-layout]').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-ls-layout') === layout);
  });
};

(function restaurarLayoutDono() {
  let salvo = 'confortavel';
  try { salvo = localStorage.getItem('dono_layout') || 'confortavel'; } catch (e) { }
  definirLayoutDono(salvo);
})();

window.carregarFuncionariosControleRemoto = async function() {
  const container = document.getElementById('lista-controle-colaboradores');
  if (!container) return;

  if (socket && typeof socket.emit === 'function') {
    socket.emit('get_funcionarios');
  }

  // Carrega políticas em paralelo
  if (typeof carregarPoliticasAcessoDono === 'function') {
    carregarPoliticasAcessoDono();
  }

  try {
    const res = await fetch('/api/funcionarios', { headers: { 'Authorization': `Bearer ${token}` } });
    if (res.ok) {
      const funcs = await res.json();
      if (Array.isArray(funcs)) {
        _cachedFuncionariosRemoto = funcs;
        renderizarListaFuncionariosRemoto(funcs);
        return;
      }
    }
  } catch (err) {
    console.warn('Erro ao buscar funcionarios via HTTP, aguardando socket...', err);
  }
};

// ─── Aprovações & Convite de Colaboradores (Dono) ──────────────
window.abrirModalAprovarColaboradorDono = function(id) {
  const f = _cachedFuncionariosRemoto.find(x => String(x.id) === String(id));
  if (!f) return;
  const inputId = document.getElementById('aprovar-colab-id');
  const inputNome = document.getElementById('aprovar-colab-nome');
  const inputUser = document.getElementById('aprovar-colab-usuario');
  const selCargo = document.getElementById('aprovar-colab-cargo');
  const inputPin = document.getElementById('aprovar-colab-pin');

  if (inputId) inputId.value = f.id;
  if (inputNome) inputNome.value = f.nome || '';
  if (inputUser) inputUser.value = f.usuario || '';
  if (selCargo) selCargo.value = f.cargo || 'Garçom';
  if (inputPin) inputPin.value = '';

  abrirModal('modal-aprovar-colaborador-dono');
};

window.confirmarAprovacaoColaboradorDono = function() {
  const id = document.getElementById('aprovar-colab-id')?.value;
  const cargo = document.getElementById('aprovar-colab-cargo')?.value || 'Garçom';
  const pin = document.getElementById('aprovar-colab-pin')?.value.trim();

  if (!id) return;

  if (socket && typeof socket.emit === 'function') {
    socket.emit('aprovar_funcionario', {
      id: id,
      cargo: cargo,
      pin: pin || null
    });
  }
  fecharModal('modal-aprovar-colaborador-dono');
  showToast('Aprovação enviada com sucesso!', 'ph-check-circle', 'success');
  setTimeout(carregarFuncionariosControleRemoto, 500);
};

window.recusarColaboradorDono = function(id) {
  if (!confirm('Deseja realmente recusar e remover este cadastro pendente?')) return;
  if (socket && typeof socket.emit === 'function') {
    socket.emit('recusar_funcionario', { id: id });
  }
  showToast('Cadastro recusado.', 'ph-x-circle', 'info');
  setTimeout(carregarFuncionariosControleRemoto, 500);
};

window.abrirModalConviteColaboradorDono = function() {
  const restId = localStorage.getItem('restaurante_id') || '1';
  const urlConvite = `${window.location.origin}/cadastro.html?restaurante_id=${restId}`;
  
  const inputLink = document.getElementById('convite-colab-link');
  if (inputLink) inputLink.value = urlConvite;

  const containerQr = document.getElementById('convite-colab-qrcode');
  if (containerQr) {
    containerQr.innerHTML = '';
    if (typeof qrcode === 'function') {
      const qr = qrcode(0, 'M');
      qr.addData(urlConvite);
      qr.make();
      containerQr.innerHTML = qr.createImgTag(5, 10);
    } else {
      containerQr.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(urlConvite)}" style="max-width:180px; border-radius:8px;" alt="QR Code Convite">`;
    }
  }

  abrirModal('modal-convite-colaborador-dono');
};

window.copiarLinkConviteDono = function() {
  const input = document.getElementById('convite-colab-link');
  if (!input) return;
  input.select();
  navigator.clipboard.writeText(input.value).then(() => {
    showToast('Link de convite copiado!', 'ph-copy', 'success');
  }).catch(() => {
    showToast('Não foi possível copiar automaticamente.', 'ph-warning');
  });
};

window.compartilharConviteWhatsAppDono = function() {
  const restId = localStorage.getItem('restaurante_id') || '1';
  const urlConvite = `${window.location.origin}/cadastro.html?restaurante_id=${restId}`;
  const txt = encodeURIComponent(`Olá! Faça seu cadastro na equipe pelo link:\n${urlConvite}`);
  window.open(`https://wa.me/?text=${txt}`, '_blank');
};

// ─── Gestão de Políticas de Acesso da Equipe (Dono) ────────────
window.carregarPoliticasAcessoDono = async function() {
  try {
    const res = await fetch('/api/equipe/politica-acesso', {
      headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('chef_token') || '') }
    });
    const data = await res.json();
    if (data && data.success && data.politica) {
      const p = data.politica;
      const chkOp = document.getElementById('dono-pol-exigir-op');
      const selModo = document.getElementById('dono-pol-modo-ident');
      const selInat = document.getElementById('dono-pol-inatividade');

      if (chkOp) chkOp.checked = p.exigir_operador_acoes !== false;
      if (selModo) selModo.value = p.modo_identificacao || 'pin';
      if (selInat) selInat.value = String(p.bloqueio_inatividade_min || 0);

      const acoes = p.acoes_exigem_gerente || ['desconto', 'cancelamento_item', 'cancelamento_mesa', 'sangria', 'reabertura'];
      const chkDesc = document.getElementById('dono-act-desconto');
      const chkItem = document.getElementById('dono-act-cancel-item');
      const chkMesa = document.getElementById('dono-act-cancel-mesa');
      const chkSang = document.getElementById('dono-act-sangria');
      const chkReab = document.getElementById('dono-act-reabertura');

      if (chkDesc) chkDesc.checked = acoes.includes('desconto');
      if (chkItem) chkItem.checked = acoes.includes('cancelamento_item');
      if (chkMesa) chkMesa.checked = acoes.includes('cancelamento_mesa');
      if (chkSang) chkSang.checked = acoes.includes('sangria');
      if (chkReab) chkReab.checked = acoes.includes('reabertura');
    }
  } catch(e) {
    console.warn('[Dono Políticas]', e);
  }
};

window.salvarPoliticasAcessoDono = async function() {
  const chkOp = document.getElementById('dono-pol-exigir-op');
  const selModo = document.getElementById('dono-pol-modo-ident');
  const selInat = document.getElementById('dono-pol-inatividade');

  const acoes = [];
  if (document.getElementById('dono-act-desconto')?.checked) acoes.push('desconto');
  if (document.getElementById('dono-act-cancel-item')?.checked) acoes.push('cancelamento_item');
  if (document.getElementById('dono-act-cancel-mesa')?.checked) acoes.push('cancelamento_mesa');
  if (document.getElementById('dono-act-sangria')?.checked) acoes.push('sangria');
  if (document.getElementById('dono-act-reabertura')?.checked) acoes.push('reabertura');

  const payload = {
    exigir_operador_acoes: chkOp ? chkOp.checked : true,
    modo_identificacao: selModo ? selModo.value : 'pin',
    bloqueio_inatividade_min: selInat ? parseInt(selInat.value, 10) || 0 : 0,
    acoes_exigem_gerente: acoes
  };

  try {
    const res = await fetch('/api/equipe/politica-acesso', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (localStorage.getItem('chef_token') || '')
      },
      body: JSON.stringify({ politica: payload })
    });
    const data = await res.json();
    if (data && data.success) {
      showToast('Políticas de acesso salvas com sucesso!', 'ph-shield-check', 'success');
      adicionarAoFeed('aviso', 'Você atualizou as políticas de acesso e segurança da equipe.');
    } else {
      showToast('Erro ao salvar políticas: ' + (data?.erro || 'desconhecido'), 'ph-warning', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Falha na comunicação com o servidor.', 'ph-warning', 'error');
  }
};

window.abrirModalMsgColaborador = function(id, nome) {
  document.getElementById('msg-colab-target-id').value = id;
  document.getElementById('msg-colab-target-nome').value = nome;
  document.getElementById('msg-colab-texto').value = '';
  abrirModal('modal-msg-colaborador');
};

window.confirmarEnviarMsgColaborador = function() {
  const id = document.getElementById('msg-colab-target-id').value;
  const nome = document.getElementById('msg-colab-target-nome').value;
  const texto = document.getElementById('msg-colab-texto').value.trim();

  if (!texto) {
    showToast('Digite a mensagem a ser enviada.', 'ph-warning', 'error');
    return;
  }

  socket.emit('comando_colaborador_acao', {
    funcionario_id: id,
    funcionario_nome: nome,
    acao: 'mensagem_direta',
    payload: { texto: texto },
    solicitadoPor: loggedUser || 'Dono'
  });

  fecharModal('modal-msg-colaborador');
  showToast(`Mensagem enviada para o celular de ${nome}!`, 'ph-paper-plane-tilt');
  adicionarAoFeed('aviso', `Você enviou uma mensagem para ${nome}: "${texto}"`);
};

window.chamarColaboradorVibrar = function(id, nome) {
  socket.emit('comando_colaborador_acao', {
    funcionario_id: id,
    funcionario_nome: nome,
    acao: 'chamar_vibrar',
    payload: { mensagem: 'Chamada prioritária do Dono!' },
    solicitadoPor: loggedUser || 'Dono'
  });

  showToast(`🚨 Alerta vibratório disparado para ${nome}!`, 'ph-bell-ringing');
  adicionarAoFeed('aviso', `Você chamou a atenção de ${nome} com alerta e vibração.`);
};

window.abrirModalDirecionarApp = function(id, nome) {
  document.getElementById('direcionar-colab-target-id').value = id;
  document.getElementById('direcionar-colab-target-nome').value = nome;
  abrirModal('modal-direcionar-colaborador');
};

window.confirmarDirecionarApp = function(view) {
  const id = document.getElementById('direcionar-colab-target-id').value;
  const nome = document.getElementById('direcionar-colab-target-nome').value;

  socket.emit('comando_colaborador_acao', {
    funcionario_id: id,
    funcionario_nome: nome,
    acao: 'redirecionar_view',
    payload: { view: view },
    solicitadoPor: loggedUser || 'Dono'
  });

  fecharModal('modal-direcionar-colaborador');
  showToast(`Tela do app de ${nome} direcionada para ${view}!`, 'ph-device-mobile');
  adicionarAoFeed('aviso', `Você direcionou o app de ${nome} para: ${view}`);
};

window.baterPontoColaborador = async function(id, nome) {
  if (!confirm(`Deseja registrar batida de ponto agora para ${nome}?`)) return;

  try {
    const res = await fetch('/api/ponto/bater', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ funcionario_id: id, tipo: 'MANUAL_DONO', operador: loggedUser || 'Dono' })
    });
    const d = await res.json();
    if (d.success || d.ok) {
      showToast(`Ponto registrado com sucesso para ${nome}!`, 'ph-clock');
      adicionarAoFeed('rh', `Ponto manual registrado para ${nome}.`);
    } else {
      showToast(`Ponto registrado para ${nome}!`, 'ph-clock');
    }
  } catch(e) {
    showToast(`Ponto registrado para ${nome}!`, 'ph-clock');
  }
};

window.desconectarSessaoColaborador = function(id, nome) {
  if (!confirm(`Tem certeza que deseja encerrar remotamente a sessão de ${nome}? O app será desconectado.`)) return;

  socket.emit('comando_colaborador_acao', {
    funcionario_id: id,
    funcionario_nome: nome,
    acao: 'desconectar_sessao',
    payload: {},
    solicitadoPor: loggedUser || 'Dono'
  });

  showToast(`Sessão de ${nome} desconectada com sucesso!`, 'ph-sign-out');
  adicionarAoFeed('aviso', `Você encerrou a sessão remota de ${nome}.`);
};

window.abrirModalRhDonoComColab = async function(id, aba) {
  await window.carregarFuncionariosRhDono();
  const select = document.getElementById('select-rh-funcionario');
  if (select) select.value = id;
  alternarAbaRhDono(aba || 'pagamento');
  abrirModal('modal-rh-dono');
};

// ─── Caixa Abrir / Fechar — com modais ───────────────────────
function abrirCaixaFluxo() {
  const input = document.getElementById('fundo-troco-input');
  if (input) input.value = '';
  abrirModal('modal-abrir-caixa');
}

function fecharCaixaFluxo() {
  const input = document.getElementById('saldo-final-input');
  if (input) input.value = '';
  abrirModal('modal-fechar-caixa');
}

window.confirmarAbrirCaixa = function() {
  const input = document.getElementById('fundo-troco-input');
  const fundo = parseFloat(input ? input.value : '');
  if (isNaN(fundo) || fundo < 0) {
    showToast('Digite um valor válido para o fundo de troco.', 'ph-warning', 'error');
    return;
  }
  fecharModal('modal-abrir-caixa');
  setLoader(true);
  socket.emit('abrir_caixa', {
    operador: loggedUser || 'Dono',
    fundo_troco: fundo
  });
};

window.confirmarFecharCaixa = function() {
  const input = document.getElementById('saldo-final-input');
  const saldo = parseFloat(input ? input.value : '');
  if (isNaN(saldo) || saldo < 0) {
    showToast('Digite o valor total encontrado no caixa.', 'ph-warning', 'error');
    return;
  }
  fecharModal('modal-fechar-caixa');
  setLoader(true);
  socket.emit('fechar_caixa', {
    operador: loggedUser || 'Dono',
    saldo_final: saldo
  });
};

// ─── RH: Gerenciar equipe ─────────────────────────────────────
window.carregarFuncionariosRhDono = async function() {
  const select = document.getElementById('select-rh-funcionario');
  if (!select) return;
  try {
    const res  = await fetch('/api/funcionarios', { headers: { 'Authorization': `Bearer ${token}` } });
    const funcs = await res.json();
    if (Array.isArray(funcs) && funcs.length > 0) {
      select.innerHTML = funcs.map(f =>
        `<option value="${f.id}">${escHtml(f.nome)} (${escHtml(f.cargo || 'Colaborador')})</option>`
      ).join('');
    } else {
      select.innerHTML = `<option value="">Nenhum funcionário encontrado</option>`;
    }
  } catch (e) {
    select.innerHTML = `<option value="">Erro ao carregar</option>`;
  }
};

window.abrirModalRhDono = function() {
  window.carregarFuncionariosRhDono();
  alternarAbaRhDono('pagamento');
  abrirModal('modal-rh-dono');
};

window.alternarAbaRhDono = function(aba) {
  ['pagamento', 'falta', 'folga'].forEach(a => {
    const btn = document.getElementById(`tab-rh-btn-${a}`);
    const panel = document.getElementById(`aba-rh-${a}`);
    if (btn) btn.className = `rh-tab ${a === aba ? 'active' : ''}`;
    if (panel) panel.style.display = a === aba ? 'block' : 'none';
  });
};

window.salvarPagamentoDono = function() {
  const funcId = document.getElementById('select-rh-funcionario').value;
  const val    = parseFloat(document.getElementById('rh-pagamento-valor').value);
  const forma  = document.getElementById('rh-pagamento-forma').value;
  const obs    = document.getElementById('rh-pagamento-obs').value;

  if (!funcId || isNaN(val) || val <= 0) {
    showToast('Selecione o colaborador e informe um valor válido.', 'ph-warning', 'error');
    return;
  }

  socket.emit('dono_registrar_pagamento', {
    funcionario_id: funcId, valor: val,
    forma_pagamento: forma, observacao: obs,
    operador: loggedUser || 'Dono'
  });

  fecharModal('modal-rh-dono');
  document.getElementById('rh-pagamento-valor').value = '';
  showToast('Pagamento enviado, aguarde confirmação...', 'ph-hourglass');
};

window.salvarAbonoFaltaDono = function() {
  const funcId    = document.getElementById('select-rh-funcionario').value;
  const dataFalta = document.getElementById('rh-falta-data').value;
  const justif    = document.getElementById('rh-falta-justificativa').value;
  const remun     = document.getElementById('rh-falta-remunerada').checked;

  if (!funcId || !dataFalta || !justif) {
    showToast('Preencha a data da falta e o motivo.', 'ph-warning', 'error');
    return;
  }

  socket.emit('dono_abonar_falta', {
    funcionario_id: funcId, data_falta: dataFalta,
    justificativa: justif, remunerado: remun,
    operador: loggedUser || 'Dono'
  });

  fecharModal('modal-rh-dono');
  document.getElementById('rh-falta-data').value = '';
  document.getElementById('rh-falta-justificativa').value = '';
  showToast('Falta enviada, aguarde confirmação...', 'ph-hourglass');
};

window.salvarFolgaDono = function() {
  const funcId = document.getElementById('select-rh-funcionario').value;
  const ini    = document.getElementById('rh-folga-inicio').value;
  const fim    = document.getElementById('rh-folga-fim').value;
  const tipo   = document.getElementById('rh-folga-tipo').value;
  const obs    = document.getElementById('rh-folga-obs').value;

  if (!funcId || !ini) {
    showToast('Selecione o colaborador e a data da folga.', 'ph-warning', 'error');
    return;
  }

  socket.emit('dono_conceder_folga', {
    funcionario_id: funcId, data_inicio: ini,
    data_fim: fim || ini, tipo_folga: tipo,
    observacao: obs, operador: loggedUser || 'Dono'
  });

  fecharModal('modal-rh-dono');
  document.getElementById('rh-folga-inicio').value = '';
  showToast('Folga enviada, aguarde confirmação...', 'ph-hourglass');
};

// ─── Meta de vendas ───────────────────────────────────────────
window.salvarMeta = function() {
  const val = parseFloat(metaInput.value);
  if (isNaN(val) || val <= 0) {
    showToast('Insira um valor de meta válido.', 'ph-warning', 'error');
    return;
  }
  metaVendas = val;
  localStorage.setItem('meta_dono_vendas', val);
  carregarMetricas();
  showToast('Meta diária salva com sucesso!', 'ph-check-circle', 'success');
};

// ─── Enviar aviso para equipe ─────────────────────────────────
window.notificarEquipe = function() {
  const text = notifInput.value.trim();
  if (!text) {
    showToast('Digite o aviso antes de enviar.', 'ph-warning', 'error');
    return;
  }
  socket.emit('enviar_notificacao_equipe', { texto: text });
  notifInput.value = '';
  showToast('Aviso enviado para a equipe!', 'ph-paper-plane', 'success');
  adicionarAoFeed('aviso', `Você enviou: "${text}"`);
};

// ─── Feed de Atividade ────────────────────────────────────────
function adicionarAoFeed(tipo, texto) {
  const now = chefFormatTime(new Date().toISOString());

  let icon = 'ph-info', colorClass = 'blue';
  if (tipo === 'venda')  { icon = 'ph-currency-dollar'; colorClass = 'green'; }
  else if (tipo === 'aviso') { icon = 'ph-megaphone';   colorClass = 'purple'; }
  else if (tipo === 'ponto') { icon = 'ph-user-check';  colorClass = 'blue'; }

  if (activityFeed && activityFeed.innerText.includes('Aguardando atividades')) {
    activityFeed.innerHTML = '';
  }

  const item = document.createElement('div');
  item.className = 'feed-item';
  item.innerHTML = `
    <div class="feed-icon ${colorClass}">
      <i class="ph-fill ${icon}"></i>
    </div>
    <div>
      <div class="feed-text">${texto}</div>
      <div class="feed-time">${now}</div>
    </div>
  `;

  if (activityFeed) activityFeed.prepend(item);
  while (activityFeed && activityFeed.children.length > 15) activityFeed.lastChild.remove();
}

// ─── Ranking accordion ───────────────────────────────────────
window.toggleRanking = function() {
  const body    = document.getElementById('ranking-body');
  const chevron = document.getElementById('ranking-chevron');
  if (!body) return;
  const isOpen = body.classList.toggle('open');
  if (chevron) chevron.classList.toggle('open', isOpen);
};

// ─── Logout ───────────────────────────────────────────────────
window.efetuarLogout = function() {
  if (confirm('Deseja sair do painel do dono?')) {
    localStorage.removeItem('chef_token');
    localStorage.removeItem('chef_credentials');
    window.location.href = '/login.html';
  }
};

// ─── Socket listeners ────────────────────────────────────────
socket.on('connect', () => {
  adicionarAoFeed('feed', 'Painel do Dono conectado ao servidor');
});

socket.on('estado_caixa', () => carregarMetricas());
socket.on('caixa_aberto_sucesso', () => {
  showToast('✅ Caixa aberto com sucesso!', 'ph-lock-open', 'success');
  carregarMetricas();
});
socket.on('erro_caixa', (msg) => {
  setLoader(false);
  showToast(`Erro ao abrir caixa: ${msg}`, 'ph-warning', 'error');
});
socket.on('erro_fechar_caixa', (data) => {
  setLoader(false);
  showToast(`Erro ao fechar caixa: ${data && data.msg || data}`, 'ph-warning', 'error');
});
socket.on('atualizacao_caixa', () => {
  if (window.periodoAtual === 'hoje') carregarMetricas();
});
socket.on('financeiro_atualizado', () => {
  if (window.periodoAtual === 'hoje') carregarMetricas();
});
socket.on('pedido_novo', (pedido) => {
  carregarMetricas();
  adicionarAoFeed('venda', `Novo pedido de ${pedido.userName} (${pedido.localName}): ${pedido.productName}`);
});
socket.on('pedido_adicionado', (pedido) => {
  carregarMetricas();
  adicionarAoFeed('venda', `${pedido.quantity}x ${pedido.productName} na ${pedido.localName}`);
});
socket.on('status_atualizado', (pedido) => {
  carregarMetricas();
  adicionarAoFeed('venda', `${pedido.productName} (${pedido.localName}) → ${pedido.status}`);
});
socket.on('alerta_vip_chegou', (data) => {
  const mesa = data.mesa || 'Salão';
  const nome = data.nome || 'Cliente VIP';
  const valor = Number(data.total_gasto) || 0;
  showToast(`👑 CLIENTE VIP: ${nome} chegou na Mesa ${mesa} (Gasto: R$ ${valor.toFixed(2)})`, 'ph-crown', 'warning');
  adicionarAoFeed('alerta', `👑 VIP Chegou: ${nome} sentou na Mesa ${mesa} — Histórico: R$ ${valor.toFixed(2)}`);
});

socket.on('rh_update', () => {
  carregarMetricas();
  carregarFuncionariosControleRemoto();
  adicionarAoFeed('ponto', 'Informações de colaboradores atualizadas!');
});
socket.on('funcionarios_atualizados', (funcs) => {
  if (Array.isArray(funcs)) {
    _cachedFuncionariosRemoto = funcs;
    renderizarListaFuncionariosRemoto(funcs);
  }
});
socket.on('novo_funcionario_pendente', (data) => {
  showToast(`🔔 Novo cadastro de ${data?.nome || 'colaborador'} aguardando sua aprovação!`, 'ph-user-plus', 'info');
  adicionarAoFeed('aviso', `Novo cadastro: ${data?.nome || ''} (${data?.cargo || 'Equipe'}). Aprove no painel.`);
  carregarFuncionariosControleRemoto();
});
socket.on('politica_acesso_atualizada', () => {
  if (typeof carregarPoliticasAcessoDono === 'function') carregarPoliticasAcessoDono();
});
socket.on('alerta_desconto_financeiro', (data) => {
  carregarMetricas();
  if (data && data.valor) {
    adicionarAoFeed('venda', `⚠️ Desconto R$${parseFloat(data.valor).toFixed(2)} por ${data.operador} em ${data.localName}`);
  }
});

// Confirmações de ações do dono
socket.on('dono_acao_concluida', (data) => {
  showToast(data.mensagem || 'Ação registrada com sucesso!', 'ph-check-circle', 'success');
  carregarMetricas();
  adicionarAoFeed('aviso', data.mensagem || 'Ação registrada com sucesso!');
});
socket.on('dono_acao_erro', (data) => {
  showToast(data.mensagem || 'Erro ao executar ação.', 'ph-warning', 'error');
});

// Listener dinâmico para alertas específicos do restaurante (fiscais, contador, RH)
function registrarListenersRestauranteDono() {
  const restId = localStorage.getItem('restaurante_id') || '1';
  socket.off(`alerta_restaurante_${restId}`);
  socket.on(`alerta_restaurante_${restId}`, (data) => {
    if (data && data.titulo) {
      showToast(`${data.titulo}: ${data.mensagem || ''}`, 'ph-briefcase', 'info');
      adicionarAoFeed('aviso', `[${data.tipo || 'RH'}] ${data.titulo}: ${data.mensagem || ''}`);
    }
    if (typeof window.carregarResumoContratacaoSecao === 'function') window.carregarResumoContratacaoSecao();
    if (typeof window.carregarEscalaFreelancers === 'function') window.carregarEscalaFreelancers();
  });
}
try { registrarListenersRestauranteDono(); } catch(e) {}

socket.on('alerta_contador_cheff', (data) => {
  if (data && data.mensagem) {
    showToast(`📊 Contador Cheff: ${data.mensagem}`, 'ph-chart-line-up', 'info');
  }
});

socket.on('contratacao_atualizada', (data) => {
  if (data && data.mensagem) {
    showToast(`🤝 Equipe: ${data.mensagem}`, 'ph-user-check', 'success');
    adicionarAoFeed('aviso', data.mensagem);
  }
  if (typeof window.carregarResumoContratacaoSecao === 'function') window.carregarResumoContratacaoSecao();
  if (typeof window.carregarEscalaFreelancers === 'function') window.carregarEscalaFreelancers();
  if (typeof window.carregarMinhasVagas === 'function') window.carregarMinhasVagas();
  carregarMetricas();
});

// ─── Alta Demanda: "Uau, seu negócio está bombando!" ─────────────
let _modalDemandaAberto = false;

function mostrarCelebracaoDemanda(data) {
  if (_modalDemandaAberto) return;
  _modalDemandaAberto = true;
  const ppm = (data && data.pedidos_por_minuto) || '';
  const overlay = document.createElement('div');
  overlay.id = 'modal-demanda-alta';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(10,10,20,0.75);backdrop-filter:blur(6px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:1rem;';
  overlay.innerHTML = `
    <div style="background:linear-gradient(160deg,#1e1b4b,#312e81);border:1px solid rgba(250,204,21,0.4);border-radius:24px;max-width:420px;width:100%;padding:2rem;text-align:center;color:#fff;font-family:inherit;box-shadow:0 25px 80px rgba(0,0,0,0.6);">
      <div style="font-size:3.5rem;line-height:1;margin-bottom:0.5rem;">🎉</div>
      <h2 style="font-size:1.5rem;font-weight:800;margin:0 0 0.35rem;background:linear-gradient(90deg,#facc15,#fb923c);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;">Uau, seu negócio está bombando!</h2>
      <p style="font-size:0.85rem;color:#c7d2fe;margin:0 0 1.25rem;">
        ${ppm ? `Detectamos <strong style="color:#fff;">${ppm} pedidos por minuto</strong> por aqui. ` : ''}Você está tendo algum evento específico hoje?
      </p>
      <div style="display:flex;flex-direction:column;gap:0.6rem;">
        <button id="btn-evento-sim" style="background:linear-gradient(90deg,#f59e0b,#f97316);border:none;border-radius:12px;padding:0.8rem;color:#fff;font-weight:700;font-size:0.9rem;cursor:pointer;">🎉 Sim, é um evento!</button>
        <input id="input-evento-desc" type="text" placeholder="Ex.: Festa, show, happy hour..." maxlength="200"
          style="display:none;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);border-radius:10px;padding:0.65rem 0.8rem;color:#fff;font-size:0.85rem;">
        <input id="input-evento-horas" type="number" min="1" max="72" value="4" placeholder="Duração (horas)"
          style="display:none;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);border-radius:10px;padding:0.65rem 0.8rem;color:#fff;font-size:0.85rem;">
        <button id="btn-evento-confirmar" style="display:none;background:var(--primary,#6366f1);border:none;border-radius:12px;padding:0.8rem;color:#fff;font-weight:700;font-size:0.9rem;cursor:pointer;">Confirmar evento</button>
        <button id="btn-evento-nao" style="background:transparent;border:1px solid rgba(255,255,255,0.25);border-radius:12px;padding:0.7rem;color:#c7d2fe;font-size:0.85rem;cursor:pointer;">Não, só movimento mesmo 😄</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const inputDesc = overlay.querySelector('#input-evento-desc');
  const inputHoras = overlay.querySelector('#input-evento-horas');
  const btnConfirmar = overlay.querySelector('#btn-evento-confirmar');
  const btnSim = overlay.querySelector('#btn-evento-sim');
  const btnNao = overlay.querySelector('#btn-evento-nao');

  btnSim.addEventListener('click', () => {
    btnSim.style.display = 'none';
    inputDesc.style.display = 'block';
    inputHoras.style.display = 'block';
    btnConfirmar.style.display = 'block';
    inputDesc.focus();
  });

  btnConfirmar.addEventListener('click', async () => {
    const descricao = inputDesc.value.trim();
    const duracao_horas = parseFloat(inputHoras.value) || 4;
    btnConfirmar.disabled = true;
    try {
      await fetch('/api/evento-pico', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (localStorage.getItem('chef_token') || '') },
        body: JSON.stringify({ descricao, duracao_horas })
      });
      adicionarAoFeed('aviso', '🎉 Evento declarado! Sistema otimizado para o pico.');
    } catch (e) { }
    fechar();
  });

  btnNao.addEventListener('click', () => fechar());
  overlay.addEventListener('click', (ev) => { if (ev.target === overlay) fechar(); });

  function fechar() {
    _modalDemandaAberto = false;
    overlay.remove();
  }
}

socket.on('demanda_alta', (data) => {
  mostrarCelebracaoDemanda(data);
});

// ─── Inicialização ────────────────────────────────────────────
window.onload = () => {
  startClock();
  carregarMetricas();
  carregarFuncionalidades();
  carregarFuncionariosControleRemoto();
  if (typeof carregarStatusContadorCheff === 'function') carregarStatusContadorCheff();
};
startClock();
carregarMetricas();
carregarFuncionariosControleRemoto();
if (typeof carregarStatusContadorCheff === 'function') carregarStatusContadorCheff();

// ─── Funcionalidades (Feature Toggles) ────────────────────────
const FEATURE_DEFS = [
  { key: 'feature_venda_sem_estoque',      label: 'Vender sem Estoque',       desc: 'Vender com estoque zerado',  emoji: '📦', icon: 'ph-bold ph-package',         color: '#ef4444' },
  { key: 'feature_toggle_produto_rapido',  label: 'Toggle Produto Rápido',   desc: 'Ativar/desativar na lista',  emoji: '⚡', icon: 'ph-bold ph-toggle-right',    color: '#3b82f6' },
  { key: 'feature_alterar_valores_pdv',    label: 'Alterar Valores PDV',     desc: 'Mudar preço no carrinho',    emoji: '💲', icon: 'ph-bold ph-currency-dollar', color: '#f59e0b' },
  { key: 'feature_clientes_ativos',        label: 'Clientes Ativos Hoje',    desc: 'Ranking de clientes',        emoji: '👥', icon: 'ph-bold ph-users-three',     color: '#8b5cf6' },
  { key: 'feature_produto_mais_vendido',   label: 'Mais Vendido',            desc: 'Produto campeão do dia',     emoji: '🏆', icon: 'ph-bold ph-trophy',          color: '#10b981' },
  { key: 'feature_maior_lucro',            label: 'Maior Lucro',             desc: 'Produto mais lucrativo',     emoji: '📈', icon: 'ph-bold ph-chart-line-up',   color: '#06b6d4' },
  { key: 'feature_impressao_digital',      label: 'Impressão Digital',       desc: 'Pedidos na fila digital',    emoji: '🖥️', icon: 'ph-bold ph-monitor',         color: '#22c55e' },
  { key: 'feature_impressao_termica',      label: 'Impressão Térmica',       desc: 'Imprimir na termica',        emoji: '🖨️', icon: 'ph-bold ph-printer',         color: '#ec4899' },
  { key: 'feature_produtos_lote',          label: 'Produtos em Lote',        desc: 'Gestão em massa',            emoji: '📚', icon: 'ph-bold ph-stack',           color: '#a855f7' }
];

async function carregarFuncionalidades() {
  try {
    const res = await fetch('/api/config', { headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) return;
    const cfgs = await res.json();
    const grid = document.getElementById('features-grid-dono');
    if (!grid) return;

    grid.innerHTML = FEATURE_DEFS.map(f => {
      const val = cfgs[f.key] === 'true' || cfgs[f.key] === true;
      return `
        <div class="feature-card ${val ? 'active' : ''}" id="fc-${f.key}">
          <div class="feature-icon" style="background:${f.color}18; display:flex; align-items:center; justify-content:center; font-size:22px; width:44px; height:44px; border-radius:12px; flex-shrink:0;">
            <span>${f.emoji || '✨'}</span>
          </div>
          <div class="feature-info">
            <div class="feature-name">${f.label}</div>
            <div class="feature-desc">${f.desc}</div>
          </div>
          <label class="feature-toggle">
            <input type="checkbox" ${val ? 'checked' : ''} onchange="window.toggleFeatureDono('${f.key}', this.checked)">
            <span class="track"></span>
            <span class="thumb"></span>
          </label>
        </div>`;
    }).join('');
  } catch (e) {
    console.error('Erro ao carregar funcionalidades:', e);
  }
}

window.toggleFeatureDono = async function(key, value) {
  try {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: String(value) })
    });
    const card = document.getElementById('fc-' + key);
    if (card) card.classList.toggle('active', value);
    showToast(`${value ? 'Funcionalidade ativada' : 'Funcionalidade desativada'}`, 'ph-check-circle', 'success');
  } catch (e) {
    showToast('Erro ao salvar funcionalidade', 'ph-warning', 'error');
  }
};


// ── Reportar Problema → Suporte ─────────────────────────────
let _relatoPrioridade = 'media';

window.abrirModalRelato = function() {
  var m = document.getElementById('modal-relato');
  if (!m) return;
  m.style.display = 'flex';
  var fb = document.getElementById('relato-feedback');
  if (fb) fb.style.display = 'none';
};

window.fecharModalRelato = function() {
  var m = document.getElementById('modal-relato');
  if (m) m.style.display = 'none';
};

window.selecionarPrioridade = function(pri, btn) {
  _relatoPrioridade = pri;
  document.querySelectorAll('.relato-pri').forEach(function(b) { b.classList.remove('ativa'); });
  if (btn) btn.classList.add('ativa');
};

window.enviarRelato = async function() {
  var titulo = document.getElementById('relato-titulo');
  var descricao = document.getElementById('relato-descricao');
  var categoria = document.getElementById('relato-categoria');
  var feedback = document.getElementById('relato-feedback');
  var botao = document.getElementById('btn-enviar-relato');
  if (!titulo || !descricao || !botao) return;

  var mostrarFeedback = function(msg, tipo) {
    if (!feedback) return;
    feedback.textContent = msg;
    feedback.className = 'relato-feedback ' + tipo;
    feedback.style.display = 'block';
  };

  if (!titulo.value.trim() || !descricao.value.trim()) {
    mostrarFeedback('Preencha o título e a descrição do problema.', 'erro');
    return;
  }

  botao.disabled = true;
  try {
    const res = await fetch('/api/dono/reportar-problema', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo: titulo.value.trim(), descricao: descricao.value.trim(), categoria: categoria ? categoria.value : 'outro', prioridade: _relatoPrioridade })
    });
    const data = await res.json();
    if (data && data.ok) {
      mostrarFeedback(data.mensagem || 'Relato enviado com sucesso!', 'sucesso');
      titulo.value = '';
      descricao.value = '';
      setTimeout(function() { fecharModalRelato(); }, 2200);
      showToast('Relato enviado ao suporte', 'ph-lifebuoy', 'success');
    } else {
      mostrarFeedback((data && data.erro) || 'Não foi possível enviar o relato.', 'erro');
    }
  } catch (e) {
    mostrarFeedback('Erro de conexão. Tente novamente.', 'erro');
  }
  botao.disabled = false;
};

// ═════════════════════════════════════════════════════════════════════
// 🎟️ GESTÃO DE CUPONS QR DE PROMOÇÃO & DESEMPENHO (PAINEL DO DONO)
// ═════════════════════════════════════════════════════════════════════
let _cuponsDonoCache = [];
let _cupomFlyerAtual = null;

// Helper: Gera HTML do QR Code (usando qrcode-generator ou SVG/Canvas)
function gerarQrCodeHtml(text, size = 160) {
  try {
    if (typeof window.qrcode === 'function') {
      const qr = window.qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      return qr.createImgTag(Math.max(3, Math.floor(size / 33)), 0);
    }
  } catch (e) {
    console.warn('[QR Helper] Fallback gerando QR:', e);
  }
  // Fallback seguro usando API de imagem rápida
  const encoded = encodeURIComponent(text);
  return `<img src="https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}&margin=2" alt="QR Code" style="width:${size}px; height:${size}px; border-radius:8px;" />`;
}

// 1. Carregar lista de cupons e métricas
window.carregarCuponsDono = async function() {
  const grid = document.getElementById('grid-cupons-dono');
  if (!grid) return;

  try {
    const res = await fetch('/api/cupons', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const list = await res.json();
    _cuponsDonoCache = Array.isArray(list) ? list : (list.list || []);

    // Atualizar KPIs rápidos
    let totalUsos = 0;
    let ativosCount = 0;

    _cuponsDonoCache.forEach(c => {
      const usos = parseInt(c.total_usos, 10) || 0;
      totalUsos += usos;
      const limite = parseInt(c.limite_usos, 10) || 0;
      const esgotado = (limite > 0 && usos >= limite);
      let expirado = false;
      if (c.validade) {
        const valDate = new Date(c.validade + 'T23:59:59');
        if (new Date() > valDate) expirado = true;
      }
      if (!esgotado && !expirado) ativosCount++;
    });

    const elAtivos = document.getElementById('kpi-cupons-ativos');
    const elUsos = document.getElementById('kpi-cupons-usos');
    const elVendas = document.getElementById('kpi-cupons-vendas');

    if (elAtivos) elAtivos.innerText = ativosCount;
    if (elUsos) elUsos.innerText = totalUsos;
    if (elVendas) elVendas.innerText = formatCurrency(totalUsos * 45); // Estimativa de giro médio

    if (_cuponsDonoCache.length === 0) {
      grid.innerHTML = `
        <div style="background:var(--card); border:1.5px dashed var(--border); border-radius:14px; padding:28px 16px; text-align:center;">
          <div style="font-size:32px; margin-bottom:8px;">🎟️</div>
          <strong style="display:block; font-size:var(--fs-md); margin-bottom:4px;">Nenhum cupom promocional ativo</strong>
          <span style="display:block; font-size:var(--fs-xs); color:var(--text-sub); margin-bottom:16px;">Crie seu primeiro cupom QR para atrair mais clientes e aumentar suas vendas!</span>
          <button class="btn-primary" onclick="abrirModalCriarCupom()" style="margin:0 auto; padding:10px 18px; font-size:var(--fs-sm);">
            <i class="ph-bold ph-plus"></i> Criar Primeiro Cupom
          </button>
        </div>`;
      return;
    }

    grid.innerHTML = _cuponsDonoCache.map(c => {
      const usos = parseInt(c.total_usos, 10) || 0;
      const limite = parseInt(c.limite_usos, 10) || 0;
      const esgotado = (limite > 0 && usos >= limite);
      let expirado = false;
      if (c.validade) {
        const valDate = new Date(c.validade + 'T23:59:59');
        if (new Date() > valDate) expirado = true;
      }

      let statusBadge = `<span style="background:rgba(16,185,129,0.15); color:var(--green); padding:4px 8px; border-radius:8px; font-size:11px; font-weight:800;">ATIVO</span>`;
      if (esgotado) statusBadge = `<span style="background:rgba(239,68,68,0.15); color:#ef4444; padding:4px 8px; border-radius:8px; font-size:11px; font-weight:800;">ESGOTADO</span>`;
      else if (expirado) statusBadge = `<span style="background:rgba(245,158,11,0.15); color:#f59e0b; padding:4px 8px; border-radius:8px; font-size:11px; font-weight:800;">EXPIRADO</span>`;

      const valorTxt = (c.valor_tipo === 'desconto_fixo')
        ? `R$ ${parseFloat(c.valor || 0).toFixed(2).replace('.', ',')} OFF`
        : `${c.valor || 0}% OFF`;

      const qrPayload = `RESGATE:${c.codigo}`;
      const qrThumb = gerarQrCodeHtml(qrPayload, 64);
      const limiteTxt = limite > 0 ? `${usos}/${limite} resgates` : `${usos} resgates (Ilimitado)`;
      const pctUso = limite > 0 ? Math.min(100, Math.round((usos / limite) * 100)) : (usos > 0 ? 100 : 0);

      return `
        <div class="colab-card" style="padding:16px; display:flex; flex-direction:column; gap:12px; border:1px solid var(--border); border-radius:14px; background:var(--card);">
          <div style="display:flex; gap:12px; align-items:center;">
            <!-- Miniatura QR -->
            <div onclick='window.abrirModalExportarQr(${JSON.stringify(c).replace(/'/g, "&apos;")})' style="cursor:pointer; background:#ffffff; padding:6px; border-radius:10px; border:1px solid #e2e8f0; display:flex; align-items:center; justify-content:center; flex-shrink:0;" title="Clique para ampliar/imprimir QR Code">
              ${qrThumb}
            </div>

            <!-- Dados do Cupom -->
            <div style="flex:1; min-width:0;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; gap:6px;">
                <span style="font-weight:900; font-size:var(--fs-md); color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escHtml(c.titulo || c.codigo)}</span>
                ${statusBadge}
              </div>

              <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                <span style="background:rgba(252,75,21,0.12); color:var(--primary); font-weight:900; font-size:12.5px; padding:2px 8px; border-radius:6px; letter-spacing:0.5px;">${escHtml(c.codigo)}</span>
                <span style="font-weight:800; font-size:12px; color:var(--green);">${valorTxt}</span>
              </div>

              <!-- Barra de Progresso de Usos -->
              <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-sub); margin-bottom:4px;">
                <span>${limiteTxt}</span>
                ${c.validade ? `<span>Val: ${c.validade.split('-').reverse().join('/')}</span>` : `<span>Sem validade</span>`}
              </div>
              <div style="width:100%; height:6px; background:var(--border); border-radius:10px; overflow:hidden;">
                <div style="width:${pctUso}%; height:100%; background:${esgotado ? '#ef4444' : 'var(--primary)'}; border-radius:10px; transition:width 0.3s ease;"></div>
              </div>
            </div>
          </div>

          <!-- Botões de Ação -->
          <div style="display:grid; grid-template-columns: 2fr 2fr 1fr; gap:8px; border-top:1px solid var(--border); padding-top:10px; margin-top:2px;">
            <button class="colab-action-btn" onclick='window.abrirModalExportarQr(${JSON.stringify(c).replace(/'/g, "&apos;")})' style="padding:10px 8px; flex-direction:row; gap:6px; justify-content:center;">
              <i class="ph-bold ph-printer" style="font-size:16px; color:var(--primary);"></i>
              <span style="font-weight:800; font-size:11.5px;">Plaquinha / QR</span>
            </button>
            <button class="colab-action-btn" onclick="window.abrirModalDesempenhoCupom('${escHtml(c.codigo)}')" style="padding:10px 8px; flex-direction:row; gap:6px; justify-content:center;">
              <i class="ph-bold ph-chart-line-up" style="font-size:16px; color:var(--blue);"></i>
              <span style="font-weight:800; font-size:11.5px;">Desempenho</span>
            </button>
            <button class="colab-action-btn" onclick="window.excluirCupomDono('${escHtml(c.codigo)}')" style="padding:10px 8px; flex-direction:row; gap:6px; justify-content:center; color:#ef4444;" title="Excluir cupom">
              <i class="ph-bold ph-trash" style="font-size:16px; color:#ef4444;"></i>
            </button>
          </div>
        </div>`;
    }).join('');

  } catch (e) {
    console.error('Erro ao carregar cupons:', e);
    grid.innerHTML = `<div style="text-align:center; color:#ef4444; padding:16px;">Erro ao carregar cupons.</div>`;
  }
};

// 2. Modal Criar Cupom
window.abrirModalCriarCupom = function() {
  document.getElementById('cupom-codigo').value = '';
  document.getElementById('cupom-titulo').value = '';
  document.getElementById('cupom-valor').value = '';
  document.getElementById('cupom-limite').value = '0';
  document.getElementById('cupom-validade').value = '';
  window.gerarCodigoCupomRandom();
  abrirModal('modal-criar-cupom');
};

window.gerarCodigoCupomRandom = function() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'PROMO';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  document.getElementById('cupom-codigo').value = code;
};

window.salvarNovoCupom = async function() {
  const codigo = document.getElementById('cupom-codigo').value.trim().toUpperCase();
  const titulo = document.getElementById('cupom-titulo').value.trim();
  const tipo = document.getElementById('cupom-tipo').value;
  const valor = parseFloat(document.getElementById('cupom-valor').value);
  const limite = parseInt(document.getElementById('cupom-limite').value, 10) || 0;
  const validade = document.getElementById('cupom-validade').value || null;

  if (!codigo) {
    showToast('Informe o código do cupom.', 'ph-warning', 'error');
    return;
  }
  if (isNaN(valor) || valor <= 0) {
    showToast('Informe o valor do desconto válido.', 'ph-warning', 'error');
    return;
  }

  try {
    const res = await fetch('/api/cupons', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        codigo,
        titulo: titulo || codigo,
        valor_tipo: tipo,
        valor: valor,
        limite_usos: limite,
        validade: validade
      })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      fecharModal('modal-criar-cupom');
      showToast(`🎟️ Cupom ${codigo} criado com sucesso!`, 'ph-check-circle', 'success');
      window.carregarCuponsDono();
    } else {
      showToast(data.error || 'Erro ao criar cupom.', 'ph-warning', 'error');
    }
  } catch (e) {
    showToast('Erro de conexão ao criar cupom.', 'ph-warning', 'error');
  }
};

// 3. Modal Exportar / Imprimir Plaquinha de Mesa QR
window.abrirModalExportarQr = function(cupom) {
  _cupomFlyerAtual = cupom;
  if (!cupom) return;

  const restNome = localStorage.getItem('restaurante_nome') || 'CHEF RESTAURANTE';
  const elRest = document.getElementById('qr-flyer-restaurante');
  const elTitulo = document.getElementById('qr-flyer-titulo');
  const elBadge = document.getElementById('qr-flyer-badge');
  const elRegras = document.getElementById('qr-flyer-regras');
  const elWrapper = document.getElementById('qr-flyer-canvas-wrapper');

  if (elRest) elRest.innerText = restNome.toUpperCase();
  if (elTitulo) elTitulo.innerText = (cupom.titulo || 'PROMOÇÃO ESPECIAL').toUpperCase();

  const valorTxt = (cupom.valor_tipo === 'desconto_fixo')
    ? `R$ ${parseFloat(cupom.valor || 0).toFixed(2).replace('.', ',')} OFF`
    : `${cupom.valor || 0}% OFF`;

  if (elBadge) elBadge.innerText = `${cupom.codigo} • ${valorTxt}`;
  if (elRegras) {
    const valTxt = cupom.validade ? `Válido até ${cupom.validade.split('-').reverse().join('/')}` : 'Por tempo limitado';
    elRegras.innerText = `Aponte a câmera do seu celular no QR Code • ${valTxt}`;
  }

  // Gerar QR grande de alta definição
  const qrPayload = `RESGATE:${cupom.codigo}`;
  if (elWrapper) {
    elWrapper.innerHTML = gerarQrCodeHtml(qrPayload, 200);
  }

  abrirModal('modal-exportar-qr');
};

// 4. Imprimir Plaquinha (Display de Mesa)
window.imprimirFlyerMesa = function() {
  const flyer = document.getElementById('flyer-impressao-mesa');
  if (!flyer) return;

  const printWindow = window.open('', '_blank', 'width=600,height=700');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Plaquinha QR - ${_cupomFlyerAtual ? _cupomFlyerAtual.codigo : 'Cupom'}</title>
      <style>
        body { margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 100vh; font-family: system-ui, -apple-system, sans-serif; background: #fff; }
        .flyer-box { border: 2.5px solid #0f172a; border-radius: 20px; padding: 32px 24px; text-align: center; max-width: 380px; width: 100%; box-sizing: border-box; }
        h1 { margin: 0 0 6px 0; font-size: 24px; font-weight: 900; }
        .sub { font-size: 14px; color: #475569; margin-bottom: 20px; }
        .qr-box { padding: 16px; background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 16px; display: inline-block; margin-bottom: 20px; }
        .code-badge { background: #0f172a; color: #fff; padding: 8px 24px; border-radius: 30px; font-size: 20px; font-weight: 900; letter-spacing: 2px; display: inline-block; margin-bottom: 12px; }
        .rules { font-size: 11px; color: #94a3b8; font-weight: 600; }
      </style>
    </head>
    <body>
      <div class="flyer-box">
        <div style="font-size:12px; font-weight:900; letter-spacing:2px; color:#fc4b15; margin-bottom:6px;">${(localStorage.getItem('restaurante_nome') || 'CHEF RESTAURANTE').toUpperCase()}</div>
        <h1>${(_cupomFlyerAtual ? _cupomFlyerAtual.titulo || _cupomFlyerAtual.codigo : 'PROMOÇÃO').toUpperCase()}</h1>
        <div class="sub">Aponte a câmera do seu celular para ganhar seu desconto exclusivo!</div>
        <div class="qr-box">
          ${document.getElementById('qr-flyer-canvas-wrapper').innerHTML}
        </div>
        <div>
          <div class="code-badge">${_cupomFlyerAtual ? _cupomFlyerAtual.codigo : 'PROMO'}</div>
        </div>
        <div class="rules">Apresente ao garçom ou use no cardápio digital • ${_cupomFlyerAtual && _cupomFlyerAtual.validade ? 'Válido até ' + _cupomFlyerAtual.validade.split('-').reverse().join('/') : 'Promoção por tempo limitado'}</div>
      </div>
      <script>
        window.onload = function() { window.print(); window.close(); };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
};

// 5. Baixar Imagem PNG do QR Code
window.baixarQrPng = function() {
  if (!_cupomFlyerAtual) return;
  const qrImg = document.querySelector('#qr-flyer-canvas-wrapper img');
  if (qrImg && qrImg.src) {
    const a = document.createElement('a');
    a.href = qrImg.src;
    a.download = `qr-cupom-${_cupomFlyerAtual.codigo}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('📥 Imagem do QR Code baixada com sucesso!', 'ph-check-circle', 'success');
  } else {
    showToast('Não foi possível gerar a imagem PNG.', 'ph-warning', 'error');
  }
};

// 6. Compartilhar no WhatsApp
window.compartilharQrWhatsApp = function() {
  if (!_cupomFlyerAtual) return;
  const restNome = localStorage.getItem('restaurante_nome') || 'nosso restaurante';
  const valorTxt = (_cupomFlyerAtual.valor_tipo === 'desconto_fixo')
    ? `R$ ${parseFloat(_cupomFlyerAtual.valor || 0).toFixed(2).replace('.', ',')} de desconto`
    : `${_cupomFlyerAtual.valor || 0}% de desconto`;

  const msg = `🎉 *PROMOÇÃO EXCLUSIVA - ${restNome.toUpperCase()}* 🎉\n\n` +
    `Olá! Preparamos um presente especial para você:\n` +
    `🎁 *${_cupomFlyerAtual.titulo || 'Super Desconto'}*\n` +
    `💰 Ganhe *${valorTxt}* no seu pedido!\n\n` +
    `🎟️ Use o código do cupom: *${_cupomFlyerAtual.codigo}*\n` +
    `👉 Ou escaneie o QR Code na nossa mesa quando nos visitar!\n\n` +
    `Te esperamos! 😋`;

  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
};

// 7. Modal Desempenho do Cupom
window.abrirModalDesempenhoCupom = async function(codigo) {
  const elTitulo = document.getElementById('desempenho-cupom-titulo');
  const elCodigo = document.getElementById('desempenho-cupom-codigo');
  const elBadge = document.getElementById('desempenho-cupom-badge');
  const elTotalUsos = document.getElementById('desempenho-total-usos');
  const elUltimo = document.getElementById('desempenho-ultimo-resgate');
  const listaHistorico = document.getElementById('lista-historico-usos-cupom');

  if (elTitulo) elTitulo.innerText = 'Carregando...';
  if (elCodigo) elCodigo.innerText = codigo;
  if (listaHistorico) listaHistorico.innerHTML = `<div style="text-align:center; padding:16px; color:var(--text-sub);">Buscando histórico...</div>`;

  abrirModal('modal-desempenho-cupom');

  try {
    const res = await fetch(`/api/cupons/${codigo}/desempenho`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    const cupom = data.cupom;
    const usos = data.usos || [];

    if (elTitulo) elTitulo.innerText = cupom.titulo || cupom.codigo;
    if (elCodigo) elCodigo.innerText = `CÓDIGO: ${cupom.codigo}`;

    const valorTxt = (cupom.valor_tipo === 'desconto_fixo')
      ? `R$ ${parseFloat(cupom.valor || 0).toFixed(2).replace('.', ',')} OFF`
      : `${cupom.valor || 0}% OFF`;
    if (elBadge) elBadge.innerText = valorTxt;

    if (elTotalUsos) elTotalUsos.innerText = data.total_usos || 0;
    if (elUltimo) {
      elUltimo.innerText = usos.length > 0 ? new Date(usos[0].data_uso).toLocaleString('pt-BR') : 'Nenhum uso';
    }

    if (usos.length === 0) {
      listaHistorico.innerHTML = `<div style="text-align:center; color:var(--text-sub); padding:16px; font-size:var(--fs-sm);">Nenhum cliente resgatou este cupom ainda.</div>`;
    } else {
      listaHistorico.innerHTML = usos.map(u => `
        <div style="background:var(--bg); padding:12px; border-radius:10px; display:flex; justify-content:space-between; align-items:center; font-size:12px;">
          <div>
            <strong style="color:var(--text); display:block;">${escHtml(u.cliente_nome || 'Cliente na Mesa')} (${escHtml(u.mesa || 'Mesa')})</strong>
            <span style="color:var(--text-sub); font-size:11px;">Atendido por: ${escHtml(u.garcom || 'Garçom')}</span>
          </div>
          <div style="text-align:right;">
            <span style="color:var(--green); font-weight:800; display:block;">Resgatado</span>
            <span style="color:var(--text-sub); font-size:10px;">${chefFormatDate(u.data_uso)}</span>
          </div>
        </div>
      `).join('');
    }

  } catch (e) {
    if (listaHistorico) listaHistorico.innerHTML = `<div style="text-align:center; color:#ef4444; padding:16px;">Erro ao carregar desempenho.</div>`;
  }
};

// 8. Excluir Cupom
window.excluirCupomDono = async function(codigo) {
  if (!confirm(`Tem certeza que deseja excluir o cupom ${codigo}?`)) return;

  try {
    const res = await fetch(`/api/cupons/${codigo}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.ok) {
      showToast(`🗑️ Cupom ${codigo} excluído.`, 'ph-trash', 'info');
      window.carregarCuponsDono();
    } else {
      showToast('Erro ao excluir cupom.', 'ph-warning', 'error');
    }
  } catch (e) {
    showToast('Erro de conexão ao excluir cupom.', 'ph-warning', 'error');
  }
};

// Ouvir atualizações de cupons em tempo real
if (socket && typeof socket.on === 'function') {
  socket.on('cupons_atualizados', () => {
    window.carregarCuponsDono();
  });
}

// Chamar carregamento de cupons na inicialização
window.carregarCuponsDono();



// ════════════════════════════════════════════════════════════════════
// TEMA CLARO / ESCURO NO PAINEL DO DONO
// ════════════════════════════════════════════════════════════════════
window.toggleTemaDono = function() {
  if (window.ChefTheme && typeof window.ChefTheme.toggle === 'function') {
    const next = window.ChefTheme.toggle();
    const icon = document.getElementById('theme-dono-icon');
    if (icon) {
      icon.className = next === 'dark' ? 'ph-bold ph-sun' : 'ph-bold ph-moon';
    }
    return next;
  }
  const current = localStorage.getItem('chef_theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  window.aplicarTemaDono(next);
  return next;
};

window.aplicarTemaDono = function(theme) {
  if (window.ChefTheme && typeof window.ChefTheme.set === 'function') {
    window.ChefTheme.set(theme);
  } else {
    localStorage.setItem('chef_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    document.body.classList.remove('theme-light', 'theme-dark');
    document.body.classList.add('theme-' + theme);
  }

  const icon = document.getElementById('theme-dono-icon');
  if (icon) {
    icon.className = theme === 'dark' ? 'ph-bold ph-sun' : 'ph-bold ph-moon';
  }
};

// Inicializa o tema salvo
(function initTemaDono() {
  const salvo = (window.ChefTheme && typeof window.ChefTheme.get === 'function')
    ? window.ChefTheme.get()
    : (localStorage.getItem('chef_theme') || 'light');
  window.aplicarTemaDono(salvo);
})();

window.addEventListener('chef_theme_changed', function(e) {
  var t = (e && e.detail && e.detail.theme) || (window.ChefTheme ? window.ChefTheme.get() : null);
  if (t) {
    var icon = document.getElementById('theme-dono-icon');
    if (icon) icon.className = t === 'dark' ? 'ph-bold ph-sun' : 'ph-bold ph-moon';
  }
});


// ════════════════════════════════════════════════════════════════════
// REORDENAÇÃO / PERSONALIZAÇÃO DE SEÇÕES
// Consolidada no "MOTOR MODULAR E DE ACESSIBILIDADE DO PAINEL DO DONO"
// (abaixo), que unifica perfil, escala de fonte, ordem, visibilidade e
// largura de cada seção, persistindo por restaurante via socket.
// Os handlers usados pelos botões do HTML são:
//   window.abrirModalPersonalizarDono()  → abre o modal de personalização
//   window.abrirModalReordenarSeccoes()   → alias do mesmo modal
// ════════════════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════════════════
// MOTOR DE LONG PRESS (MANTER PRESSIONADO) COM FEEDBACK TÁTIL
// ════════════════════════════════════════════════════════════════════
window.initLongPressDono = function() {
  const elements = [
    { selector: '#kpi-faturamento-card, .kpi-card.full', action: 'faturamento', label: 'Segure p/ Detalhes' },
    { selector: '#sec-caixa, .cashier-box', action: 'caixa', label: 'Segure p/ Ações' },
    { selector: '#kpi-mesas-card', action: 'mesas', label: 'Segure p/ Salão' },
    { selector: '#kpi-equipe-card', action: 'equipe', label: 'Segure p/ Ponto' }
  ];

  elements.forEach(({ selector, action, label }) => {
    document.querySelectorAll(selector).forEach(el => {
      if (el._hasLongPress) return;
      el._hasLongPress = true;
      el.classList.add('has-long-press');
      
      let timer = null;
      let startX = 0, startY = 0;

      const startPress = (e) => {
        if (e.touches && e.touches.length > 1) return;
        startX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
        startY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
        el.classList.add('long-press-active');
        
        timer = setTimeout(() => {
          el.classList.remove('long-press-active');
          if (navigator.vibrate) try { navigator.vibrate(45); } catch(e){}
          window.executarAcaoLongPress(action);
        }, 450);
      };

      const cancelPress = (e) => {
        if (e.type === 'touchmove') {
          const x = (e.touches && e.touches[0].clientX) || 0;
          const y = (e.touches && e.touches[0].clientY) || 0;
          if (Math.abs(x - startX) > 10 || Math.abs(y - startY) > 10) {
            clearTimeout(timer);
            el.classList.remove('long-press-active');
          }
          return;
        }
        clearTimeout(timer);
        el.classList.remove('long-press-active');
      };

      el.addEventListener('mousedown', startPress);
      el.addEventListener('touchstart', startPress, { passive: true });
      el.addEventListener('mouseup', cancelPress);
      el.addEventListener('mouseleave', cancelPress);
      el.addEventListener('touchend', cancelPress);
      el.addEventListener('touchcancel', cancelPress);
      el.addEventListener('touchmove', cancelPress, { passive: true });
    });
  });
};

window.executarAcaoLongPress = function(tipo) {
  if (tipo === 'faturamento') {
    window.abrirModalDetalhesFaturamento();
  } else if (tipo === 'caixa') {
    window.abrirModalAcoesCaixa();
  } else if (tipo === 'mesas') {
    window.location.href = '/garcom.html';
  } else if (tipo === 'equipe') {
    window.location.href = '/configuracoes.html#rh';
  }
};

window.abrirModalDetalhesFaturamento = function() {
  let modal = document.getElementById('modal-detalhe-faturamento');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-detalhe-faturamento';
    modal.style.cssText = 'position:fixed; inset:0; z-index:10000; background:rgba(15,23,42,0.7); backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; padding:16px;';
    document.body.appendChild(modal);
  }

  const faturamentoTxt = document.getElementById('kpi-faturamento')?.innerText || 'R$ 0,00';
  const ticketTxt = document.getElementById('kpi-ticket')?.innerText || 'R$ 0,00';

  modal.innerHTML = `
    <div style="background:var(--card); border-radius:24px; padding:26px; width:100%; max-width:480px; box-shadow:var(--shadow-md); border:1px solid var(--border);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px;">
        <h3 style="font-size:18px; font-weight:800; color:var(--text); margin:0; display:flex; align-items:center; gap:8px;">
          <i class="ph-bold ph-chart-line-up" style="color:var(--primary);"></i> Detalhamento do Faturamento
        </h3>
        <button onclick="document.getElementById('modal-detalhe-faturamento').style.display='none'" style="background:transparent; border:none; color:var(--text-sub); font-size:22px; cursor:pointer;">✕</button>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:18px;">
        <div style="padding:14px; background:var(--card2); border-radius:16px; border:1px solid var(--border);">
          <span style="font-size:12px; color:var(--text-sub); display:block; margin-bottom:4px;">Total Vendas</span>
          <strong style="font-size:20px; color:var(--text); font-weight:900;">${faturamentoTxt}</strong>
        </div>
        <div style="padding:14px; background:var(--card2); border-radius:16px; border:1px solid var(--border);">
          <span style="font-size:12px; color:var(--text-sub); display:block; margin-bottom:4px;">Ticket Médio</span>
          <strong style="font-size:20px; color:var(--text); font-weight:900;">${ticketTxt}</strong>
        </div>
      </div>

      <div style="display:flex; flex-direction:column; gap:8px;">
        <button onclick="window.location.href='/configuracoes.html#dre'" style="width:100%; padding:14px; background:var(--primary); color:white; border:none; border-radius:14px; font-weight:800; font-size:14px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
          <i class="ph-bold ph-file-text"></i> Abrir DRE & Demonstrativo Completo
        </button>
        <button onclick="window.location.href='/index.html'" style="width:100%; padding:14px; background:var(--card2); color:var(--text); border:1px solid var(--border); border-radius:14px; font-weight:800; font-size:14px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
          <i class="ph-bold ph-desktop"></i> Ir ao Terminal de Vendas (PDV)
        </button>
      </div>
    </div>
  `;
  modal.style.display = 'flex';
};

window.abrirModalAcoesCaixa = function() {
  let modal = document.getElementById('modal-acoes-caixa-rapidas');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-acoes-caixa-rapidas';
    modal.style.cssText = 'position:fixed; inset:0; z-index:10000; background:rgba(15,23,42,0.7); backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; padding:16px;';
    document.body.appendChild(modal);
  }

  const badgeTxt = document.getElementById('caixa-badge-txt')?.innerText || 'Caixa';

  modal.innerHTML = `
    <div style="background:var(--card); border-radius:24px; padding:26px; width:100%; max-width:480px; box-shadow:var(--shadow-md); border:1px solid var(--border);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px;">
        <h3 style="font-size:18px; font-weight:800; color:var(--text); margin:0; display:flex; align-items:center; gap:8px;">
          <i class="ph-bold ph-wallet" style="color:var(--primary);"></i> Gestão Rápida do Caixa
        </h3>
        <button onclick="document.getElementById('modal-acoes-caixa-rapidas').style.display='none'" style="background:transparent; border:none; color:var(--text-sub); font-size:22px; cursor:pointer;">✕</button>
      </div>

      <p style="font-size:13.5px; color:var(--text-sub); margin-bottom:18px;">Status atual: <strong style="color:var(--text);">${badgeTxt}</strong></p>

      <div style="display:flex; flex-direction:column; gap:10px;">
        <button onclick="window.location.href='/index.html'" style="padding:14px; background:var(--primary); color:white; border:none; border-radius:14px; font-weight:800; font-size:14.5px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
          <i class="ph-bold ph-desktop"></i> Abrir Terminal de Caixa (PDV)
        </button>
        <button onclick="window.location.href='/configuracoes.html#fechamentos'" style="padding:14px; background:var(--card2); border:1px solid var(--border); color:var(--text); border-radius:14px; font-weight:800; font-size:14.5px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
          <i class="ph-bold ph-receipt"></i> Histórico de Turnos & Fechamentos
        </button>
      </div>
    </div>
  `;
  modal.style.display = 'flex';
};

// Disparar o long press após carregar a página (ordenação/personalização
// é feita pelo MOTOR MODULAR via seu próprio DOMContentLoaded)
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (typeof window.initLongPressDono === 'function') window.initLongPressDono();
  }, 100);
});


// ════════════════════════════════════════════════════════════════════
// MOTOR DE RECOLHER / EXPANDIR SEÇÕES DO PAINEL COM PERSISTÊNCIA
// ════════════════════════════════════════════════════════════════════
window.toggleSecao = function(secaoId) {
  const el = document.getElementById(secaoId) || document.querySelector(`[data-section-id="${secaoId}"]`);
  if (!el) return;

  el.classList.toggle('is-collapsed');
  if (navigator.vibrate) try { navigator.vibrate(10); } catch(e){}

  // Salvar estado no localStorage
  let collapsed = [];
  try {
    collapsed = JSON.parse(localStorage.getItem('chef_dono_collapsed_sections') || '[]');
  } catch(e){}

  if (el.classList.contains('is-collapsed')) {
    if (!collapsed.includes(secaoId)) collapsed.push(secaoId);
  } else {
    collapsed = collapsed.filter(id => id !== secaoId);
  }

  localStorage.setItem('chef_dono_collapsed_sections', JSON.stringify(collapsed));
  window.atualizarBotaoToggleGlobal();
};

window.toggleTodasSecoes = function() {
  const sections = document.querySelectorAll('.dono-section, main > div');
  const allCollapsed = Array.from(sections).every(s => s.classList.contains('is-collapsed'));

  let collapsedList = [];
  sections.forEach((sec, idx) => {
    const secId = sec.id || ('sec-' + idx);
    if (allCollapsed) {
      sec.classList.remove('is-collapsed');
    } else {
      sec.classList.add('is-collapsed');
      collapsedList.push(secId);
    }
  });

  localStorage.setItem('chef_dono_collapsed_sections', JSON.stringify(collapsedList));
  window.atualizarBotaoToggleGlobal();
  if (navigator.vibrate) try { navigator.vibrate(15); } catch(e){}
};

window.atualizarBotaoToggleGlobal = function() {
  const sections = document.querySelectorAll('.dono-section, main > div');
  if (!sections.length) return;
  const allCollapsed = Array.from(sections).every(s => s.classList.contains('is-collapsed'));

  const icon = document.getElementById('icon-toggle-all');
  const txt = document.getElementById('txt-toggle-all');
  if (icon && txt) {
    if (allCollapsed) {
      icon.className = 'ph-bold ph-caret-double-down';
      txt.innerText = 'Expandir Tudo';
    } else {
      icon.className = 'ph-bold ph-caret-double-up';
      txt.innerText = 'Recolher Tudo';
    }
  }
};

window.restaurarEstadoSecoes = function() {
  let collapsed = [];
  try {
    collapsed = JSON.parse(localStorage.getItem('chef_dono_collapsed_sections') || '[]');
  } catch(e){}

  if (Array.isArray(collapsed)) {
    collapsed.forEach(id => {
      const el = document.getElementById(id) || document.querySelector(`[data-section-id="${id}"]`);
      if (el) el.classList.add('is-collapsed');
    });
  }
  window.atualizarBotaoToggleGlobal();
};

// Tornar os cabeçalhos de cada seção clicáveis dinamicamente
window.inicializarSecoesRecolhiveis = function() {
  document.querySelectorAll('main > div').forEach((sec, idx) => {
    try {
      sec.classList.add('dono-section');
      const secId = sec.id || ('sec-dono-' + idx);
      if (!sec.id) sec.id = secId;

      let headerRow = sec.querySelector('.sec-header-row');
      const titleEl = sec.querySelector('.sec-title');
      if ((titleEl || headerRow) && !sec.querySelector('.btn-sec-toggle')) {
        if (!headerRow && titleEl) {
          headerRow = document.createElement('div');
          headerRow.className = 'sec-header-row';
          const p = titleEl.parentNode;
          if (p && typeof p.contains === 'function' && p.contains(titleEl)) {
            p.insertBefore(headerRow, titleEl);
          } else {
            sec.prepend(headerRow);
          }
          headerRow.appendChild(titleEl);
        }

        if (headerRow) {
          headerRow.onclick = function(e) {
            if (e.target && e.target.closest('button, a, input, select, textarea, .btn-primary, .btn-secondary, label, .btn-chip-modal')) {
              return;
            }
            window.toggleSecao(secId);
          };
          headerRow.title = 'Clique para recolher ou expandir esta seção';

          // Badge de resumo quando recolhido
          let badge = headerRow.querySelector('.sec-collapsed-badge');
          if (!badge) {
            badge = document.createElement('span');
            badge.className = 'sec-collapsed-badge';
            badge.innerText = 'Oculto (Toque para Ver)';
            headerRow.appendChild(badge);
          }

          // Botão seta
          const toggleBtn = document.createElement('button');
          toggleBtn.type = 'button';
          toggleBtn.className = 'btn-sec-toggle';
          toggleBtn.innerHTML = '<i class="ph-bold ph-caret-down"></i>';
          headerRow.appendChild(toggleBtn);

          // Envolver conteúdo restante em .sec-content se ainda não estiver
          if (!sec.querySelector('.sec-content')) {
            const contentNodes = Array.from(sec.children).filter(c => c !== headerRow);
            const contentWrapper = document.createElement('div');
            contentWrapper.className = 'sec-content';
            contentNodes.forEach(node => contentWrapper.appendChild(node));
            sec.appendChild(contentWrapper);
          }
        }
      }
    } catch (err) {
      console.warn('Erro ao inicializar secao recolhivel:', err);
    }
  });

  try {
    window.restaurarEstadoSecoes();
  } catch (err) {
    console.warn('Erro ao restaurar estado secoes:', err);
  }
};

window.atualizarBadgesResumoSecoes = function(data) {
  if (!data) return;
  const isOpen = data.caixaStatus === 'Aberto';
  const metaVal = typeof metaVendas !== 'undefined' ? metaVendas : 0;
  const percent = metaVal > 0 ? Math.min(100, Math.round(((data.faturamentoHoje || 0) / metaVal) * 100)) : 0;

  const badges = {
    'sec-periodo': data.rotuloPeriodo || 'Hoje',
    'sec-ia-briefing': '✨ Briefing Ativo',
    'sec-kpis': `${formatCurrency(data.faturamentoHoje || 0)} • ${data.totalPedidos || 0} ped.`,
    'sec-bi-dre-abc': data.dre ? `💎 Lucro ${formatCurrency(data.dre.lucroLiquido)} (${data.dre.margemLucro}%)` : '💎 BI & DRE',
    'sec-canais-venda': data.canais ? `🏪 ${data.canais.salao?.percentual || 0}% Salão • 🛵 ${data.canais.delivery?.percentual || 0}% Deliv.` : '🏪 3 Canais',
    'sec-antifraude': data.antifraude ? ((data.antifraude.canceladosQtd || 0) > 0 ? `⚠️ ${data.antifraude.canceladosQtd} canc.` : '🛡️ 100% Seguro') : '🛡️ Radar Seguro',
    'sec-caixa': isOpen ? `🟢 Aberto (${formatCurrency(data.caixaSaldo || 0)})` : '🔒 Fechado',
    'sec-equipe': `👥 ${data.colaboradoresAtivos || 0} Ativos`,
    'sec-remoto-telas': '🖥️ Telas & Terminal',
    'sec-remoto-caixa': '🖥️ Telas & Terminal',
    'sec-remoto-equipe': '📱 Políticas & Acessos',
    'sec-remoto-colabs': '📱 Políticas & Acessos',
    'sec-marketing-vip': '📢 Disparo & Push',
    'sec-marketing': '📢 Disparo & Push',
    'sec-cupons': '🎟️ Cupons QR',
    'sec-gamificacao-equipe': '⚔️ Batalha de Vendas',
    'sec-indicacao-parceiros': '🎁 Indique & Ganhe',
    'sec-meta-aviso': `🎯 Meta: ${percent}%`,
    'sec-ranking': data.topProdutos && data.topProdutos.length > 0 ? `🏆 Top: ${data.topProdutos[0].productName}` : '🏆 Ranking',
    'sec-features': '🧩 Módulos Ativos',
    'sec-atividade': '⚡ Tempo Real'
  };

  Object.entries(badges).forEach(([id, html]) => {
    const sec = document.getElementById(id);
    if (!sec) return;
    const badge = sec.querySelector('.sec-collapsed-badge');
    if (badge) badge.innerHTML = html;
  });
};

// ════════════════════════════════════════════════════════════════════
// BARRA DE NAVEGAÇÃO INFERIOR MÓVEL (DOCK) & MENU RÁPIDO DO DONO
// ════════════════════════════════════════════════════════════════════
window.navMobilePara = function(targetId) {
  if (navigator.vibrate) try { navigator.vibrate(10); } catch(e){}
  
  let el = document.getElementById(targetId);
  if (!el && targetId === 'sec-kpis') el = document.querySelector('[data-secao="kpis"]');
  if (!el && targetId === 'sec-caixa') el = document.querySelector('[data-secao="caixa"]');
  if (!el && targetId === 'sec-remoto-telas') el = document.querySelector('[data-secao="remoto-caixa"]');
  if (!el && targetId === 'sec-remoto-equipe') el = document.querySelector('[data-secao="remoto-colabs"]') || document.querySelector('[data-secao="equipe"]');
  if (!el && targetId === 'sec-contratacao-talentos') el = document.querySelector('[data-secao="contratacao-talentos"]');
  if (!el && targetId === 'sec-cupons') el = document.querySelector('[data-secao="cupons"]');
  if (!el && targetId === 'sec-marketing-vip') el = document.querySelector('[data-secao="marketing"]');
  if (!el && targetId === 'sec-meta-aviso') el = document.querySelector('[data-secao="meta-aviso"]');
  if (!el && targetId === 'sec-ranking') el = document.querySelector('[data-secao="ranking"]');

  if (el) {
    if (el.classList.contains('is-collapsed')) {
      el.classList.remove('is-collapsed');
    }
    
    document.querySelectorAll('.mob-nav-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-target') === targetId);
    });
    
    const headerHeight = document.querySelector('header')?.offsetHeight || 64;
    const topPos = el.getBoundingClientRect().top + window.pageYOffset - headerHeight - 8;
    window.scrollTo({ top: Math.max(0, topPos), behavior: 'smooth' });
  }
};

window.abrirMenuMaisDono = function() {
  if (navigator.vibrate) try { navigator.vibrate(10); } catch(e){}
  const modal = document.getElementById('modal-menu-mais-dono');
  if (modal) modal.classList.remove('hidden');
};

window.fecharMenuMaisDono = function() {
  const modal = document.getElementById('modal-menu-mais-dono');
  if (modal) modal.classList.add('hidden');
};

window.initMobileNavScrollSpy = function() {
  const navBtns = document.querySelectorAll('.mob-nav-btn[data-target]');
  if (!navBtns.length) return;

  const sections = [
    { id: 'sec-kpis', getEl: () => document.getElementById('sec-kpis') || document.querySelector('[data-secao="kpis"]') },
    { id: 'sec-caixa', getEl: () => document.getElementById('sec-caixa') || document.querySelector('[data-secao="caixa"]') },
    { id: 'sec-remoto-telas', getEl: () => document.getElementById('sec-remoto-telas') || document.querySelector('[data-secao="remoto-caixa"]') },
    { id: 'sec-remoto-equipe', getEl: () => document.getElementById('sec-remoto-equipe') || document.querySelector('[data-secao="remoto-colabs"]') },
    { id: 'sec-contratacao-talentos', getEl: () => document.getElementById('sec-contratacao-talentos') || document.querySelector('[data-secao="contratacao-talentos"]') }
  ];

  window.addEventListener('scroll', () => {
    const scrollPos = window.scrollY + 160;
    let activeId = 'sec-kpis';

    for (const s of sections) {
      const el = s.getEl();
      if (el) {
        const top = el.offsetTop;
        const height = el.offsetHeight;
        if (scrollPos >= top && scrollPos < top + height) {
          activeId = s.id;
          break;
        }
      }
    }

    navBtns.forEach(btn => {
      const t = btn.getAttribute('data-target');
      if (t !== 'sec-mais') {
        btn.classList.toggle('active', t === activeId);
      }
    });
  }, { passive: true });
};

// Inicialização suave no carregamento
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (typeof window.inicializarSecoesRecolhiveis === 'function') window.inicializarSecoesRecolhiveis();
    if (typeof window.initMobileNavScrollSpy === 'function') window.initMobileNavScrollSpy();
    if (typeof window.carregarResumoContratacaoSecao === 'function') window.carregarResumoContratacaoSecao();
  }, 50);
});


// ════════════════════════════════════════════════════════════════════
// GESTÃO DE PRODUTOS PARA CUPONS E MARKETING
// ════════════════════════════════════════════════════════════════════
let _produtosDisponiveis = [];
let _produtosSelecionadosCupom = [];

window.carregarProdutosParaCupom = async function() {
  try {
    const res = await fetch('/api/produtos', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('chef_token') } });
    if (!res.ok) return;
    _produtosDisponiveis = await res.json();
    window.renderizarListaProdutosCupom();
  } catch(e){}
};

window.toggleEscopoProdutosCupom = function(escopo) {
  const container = document.getElementById('container-produtos-cupom');
  const txt = document.getElementById('cupom-produtos-selecionados-txt');
  if (escopo === 'especificos') {
    if (container) container.style.display = 'block';
    if (!_produtosDisponiveis.length) window.carregarProdutosParaCupom();
    if (txt) txt.innerText = `${_produtosSelecionadosCupom.length} itens selecionados`;
  } else {
    if (container) container.style.display = 'none';
    _produtosSelecionadosCupom = [];
    if (txt) txt.innerText = 'Todos os Produtos';
  }
};

window.renderizarListaProdutosCupom = function(filtro = '') {
  const lista = document.getElementById('lista-produtos-cupom');
  if (!lista) return;

  const f = filtro.toLowerCase().trim();
  const itens = _produtosDisponiveis.filter(p => !f || p.name.toLowerCase().includes(f));

  if (!itens.length) {
    lista.innerHTML = '<span style="font-size:12px; color:var(--text-sub); text-align:center; padding:8px;">Nenhum produto encontrado.</span>';
    return;
  }

  lista.innerHTML = itens.map(p => {
    const checked = _produtosSelecionadosCupom.some(x => x.id === p.id);
    return `
      <label style="display:flex; align-items:center; justify-content:space-between; padding:8px 10px; background:var(--card); border:1px solid var(--border); border-radius:8px; cursor:pointer;">
        <div style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" ${checked ? 'checked' : ''} onchange="window.toggleProdutoCupomItem(${p.id}, this.checked)">
          <span style="font-size:13px; font-weight:700; color:var(--text);">${p.name}</span>
        </div>
        <span style="font-size:12px; color:var(--primary); font-weight:800;">R$ ${parseFloat(p.price || 0).toFixed(2).replace('.', ',')}</span>
      </label>
    `;
  }).join('');
};

window.filtrarProdutosCupom = function(txt) {
  window.renderizarListaProdutosCupom(txt);
};

window.toggleProdutoCupomItem = function(id, checked) {
  const prod = _produtosDisponiveis.find(p => p.id === id);
  if (!prod) return;

  if (checked) {
    if (!_produtosSelecionadosCupom.some(p => p.id === id)) {
      _produtosSelecionadosCupom.push({ id: prod.id, name: prod.name, price: prod.price });
    }
  } else {
    _produtosSelecionadosCupom = _produtosSelecionadosCupom.filter(p => p.id !== id);
  }

  const txt = document.getElementById('cupom-produtos-selecionados-txt');
  if (txt) txt.innerText = `${_produtosSelecionadosCupom.length} itens selecionados`;
};

// ── Módulo de Marketing & Disparo Push / WhatsApp ──
window.checarStatusMarketing = async function() {
  try {
    const res = await fetch('/api/marketing/status');
    if (!res.ok) return;
    const data = await res.json();
    
    const card = document.getElementById('marketing-showcase-card');
    const panel = document.getElementById('marketing-active-panel');
    const totalEl = document.getElementById('marketing-total-clientes');

    if (totalEl) totalEl.innerText = `${data.total_clientes || 0} clientes cadastrados`;

    if (data.ativo) {
      if (card) card.style.display = 'none';
      if (panel) panel.style.display = 'flex';
    } else {
      if (card) card.style.display = 'block';
      if (panel) panel.style.display = 'none';
    }
  } catch(e){}
};

window.ativarTesteMarketing = async function() {
  try {
    await fetch('/api/marketing/ativar', { method: 'POST' });
    showToast('✨ Módulo de Mensagens & Notificações Ativado!', 'ph-check-circle', 'success');
    window.checarStatusMarketing();
  } catch(e){
    showToast('Erro ao ativar módulo.', 'ph-warning', 'error');
  }
};

window.abrirModalContratarMarketing = function() {
  let modal = document.getElementById('modal-contratar-marketing');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-contratar-marketing';
    modal.style.cssText = 'position:fixed; inset:0; z-index:10000; background:rgba(15,23,42,0.7); backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; padding:16px;';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div style="background:var(--card); border-radius:24px; padding:26px; width:100%; max-width:480px; box-shadow:var(--shadow-md); border:1px solid var(--border);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h3 style="font-size:18px; font-weight:800; color:var(--text); margin:0; display:flex; align-items:center; gap:8px;">
          <i class="ph-bold ph-crown" style="color:var(--primary);"></i> Módulo Premium de Mensagens & Push
        </h3>
        <button onclick="document.getElementById('modal-contratar-marketing').style.display='none'" style="background:transparent; border:none; color:var(--text-sub); font-size:22px; cursor:pointer;">✕</button>
      </div>

      <p style="font-size:13.5px; color:var(--text-sub); margin-bottom:16px; line-height:1.5;">
        Transforme seus clientes cadastrados em vendas recorrentes com avisos em tempo real e cupons instantâneos enviados diretamente no celular.
      </p>

      <div style="background:var(--card2); border:1px solid var(--border); border-radius:16px; padding:16px; margin-bottom:18px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <strong style="color:var(--text); font-size:15px;">Plano Ilimitado Push + WhatsApp</strong>
          <span style="color:var(--green); font-weight:900; font-size:18px;">R$ 49,90/mês</span>
        </div>
        <ul style="font-size:12.5px; color:var(--text-sub); padding-left:18px; line-height:1.6; margin:0;">
          <li>Disparos ilimitados de Notificações Web Push (PWA)</li>
          <li>Geração e envio automático de Cupons QR com 1 clique</li>
          <li>Segmentação de clientes VIP e inativos</li>
        </ul>
      </div>

      <div style="display:flex; gap:10px;">
        <button onclick="document.getElementById('modal-contratar-marketing').style.display='none'" class="btn-secondary" style="flex:1; padding:12px;">Fechar</button>
        <button onclick="window.ativarTesteMarketing(); document.getElementById('modal-contratar-marketing').style.display='none';" class="btn-primary" style="flex:2; padding:12px; justify-content:center; font-weight:800;">
          <i class="ph-bold ph-check"></i> Ativar Agora (Teste Grátis)
        </button>
      </div>
    </div>
  `;
  modal.style.display = 'flex';
};

window.abrirModalDisparoMassa = function() {
  let modal = document.getElementById('modal-disparo-massa');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-disparo-massa';
    modal.style.cssText = 'position:fixed; inset:0; z-index:10000; background:rgba(15,23,42,0.7); backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; padding:16px;';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div style="background:var(--card); border-radius:24px; padding:26px; width:100%; max-width:480px; box-shadow:var(--shadow-md); border:1px solid var(--border);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h3 style="font-size:18px; font-weight:800; color:var(--text); margin:0; display:flex; align-items:center; gap:8px;">
          <i class="ph-bold ph-paper-plane-tilt" style="color:var(--primary);"></i> Disparo de Mensagem & Cupom
        </h3>
        <button onclick="document.getElementById('modal-disparo-massa').style.display='none'" style="background:transparent; border:none; color:var(--text-sub); font-size:22px; cursor:pointer;">✕</button>
      </div>

      <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:16px;">
        <div>
          <label style="font-size:12px; font-weight:700; color:var(--text-sub); display:block; margin-bottom:4px;">Mensagem Promocional</label>
          <textarea id="marketing-msg-input" rows="3" class="form-input" placeholder="Ex: Olá! Hoje temos promoção especial no almoço com 15% de desconto para você!" style="width:100%; box-sizing:border-box;"></textarea>
        </div>

        <div>
          <label style="font-size:12px; font-weight:700; color:var(--text-sub); display:block; margin-bottom:4px;">Anexar Cupom QR (Opcional)</label>
          <input type="text" id="marketing-cupom-input" class="form-input" placeholder="Ex: PROMO15" style="width:100%; text-transform:uppercase; font-weight:800; box-sizing:border-box;">
        </div>
      </div>

      <div style="display:flex; gap:10px;">
        <button onclick="document.getElementById('modal-disparo-massa').style.display='none'" class="btn-secondary" style="flex:1; padding:12px;">Cancelar</button>
        <button onclick="window.executarDisparoMassa()" class="btn-primary" style="flex:2; padding:12px; justify-content:center; font-weight:800;">
          <i class="ph-bold ph-paper-plane-tilt"></i> Disparar para Todos
        </button>
      </div>
    </div>
  `;
  modal.style.display = 'flex';
};

window.executarDisparoMassa = async function() {
  const msg = document.getElementById('marketing-msg-input')?.value.trim();
  const cupom = document.getElementById('marketing-cupom-input')?.value.trim();

  if (!msg) {
    showToast('Escreva a mensagem para enviar.', 'ph-warning', 'error');
    return;
  }

  try {
    const res = await fetch('/api/marketing/disparo-massa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensagem: msg, cupom_codigo: cupom })
    });
    const d = await res.json();
    if (d.success) {
      document.getElementById('modal-disparo-massa').style.display = 'none';
      showToast(`📢 Notificação disparada para ${d.enviados || 0} clientes!`, 'ph-check-circle', 'success');
    }
  } catch(e){
    showToast('Erro ao realizar disparo.', 'ph-warning', 'error');
  }
};

/* ══════════════════════════════════════════════════════════════════
   MOTOR MODULAR E DE ACESSIBILIDADE DO PAINEL DO DONO (20 A 64+ ANOS)
   ══════════════════════════════════════════════════════════════════ */

const DONO_SECOES_DEF = [
  { id: 'sec-periodo', nome: '📅 Período & Preferências de Layout', icon: 'ph-calendar', larguraDef: 'large' },
  { id: 'sec-ia-briefing', nome: '✨ Copiloto Cheff IA — Briefing Executivo', icon: 'ph-sparkle', larguraDef: 'large' },
  { id: 'sec-kpis', nome: '📊 Resumo do Dia & Lucro Real (KPIs)', icon: 'ph-chart-bar', larguraDef: 'large' },
  { id: 'sec-bi-dre-abc', nome: '💎 DRE Gerencial & Inteligência de Cardápio (BI)', icon: 'ph-chart-polar', larguraDef: 'large' },
  { id: 'sec-canais-venda', nome: '🏪 Canais de Venda (Salão, Delivery, Balcão)', icon: 'ph-storefront', larguraDef: 'medium' },
  { id: 'sec-antifraude', nome: '🛡️ Radar Antifraude & Auditoria de Caixa', icon: 'ph-shield-warning', larguraDef: 'medium' },
  { id: 'sec-caixa', nome: '💵 Controle do Caixa (Abrir/Fechar)', icon: 'ph-cash-register', larguraDef: 'medium' },
  { id: 'sec-equipe', nome: '👥 Equipe & Colaboradores Ativos', icon: 'ph-users-three', larguraDef: 'medium' },
  { id: 'sec-remoto-telas', nome: '🖥️ Controle Remoto — Navegação e Terminal', icon: 'ph-desktop', larguraDef: 'medium' },
  { id: 'sec-remoto-equipe', nome: '📱 Gestão da Equipe & Políticas de Acesso', icon: 'ph-users', larguraDef: 'medium' },
  { id: 'sec-marketing-vip', nome: '📢 Mensagens em Massa & Push (Marketing VIP)', icon: 'ph-megaphone', larguraDef: 'medium' },
  { id: 'sec-cupons', nome: '🎟️ Cupons QR & Promoções', icon: 'ph-ticket', larguraDef: 'medium' },
  { id: 'sec-gamificacao-equipe', nome: '⚔️ Batalha de Vendas & Gamificação da Equipe', icon: 'ph-trophy', larguraDef: 'medium' },
  { id: 'sec-indicacao-parceiros', nome: '🎁 Programa Indique & Ganhe Parceiros', icon: 'ph-gift', larguraDef: 'medium' },
  { id: 'sec-meta-aviso', nome: '🎯 Meta Diária & Aviso à Equipe', icon: 'ph-target', larguraDef: 'medium' },
  { id: 'sec-ranking', nome: '🏆 Ranking de Produtos Mais Vendidos', icon: 'ph-chart-line-up', larguraDef: 'medium' },
  { id: 'sec-features', nome: '🧩 Central de Módulos & Extensões', icon: 'ph-puzzle-piece', larguraDef: 'large' },
  { id: 'sec-atividade', nome: '⚡ Feed de Atividade em Tempo Real', icon: 'ph-activity', larguraDef: 'large' }
];

// Config por dono/restaurante pode vir do servidor (segue entre dispositivos)
// ou, quando offline, do localStorage do navegador.
window.donoConfigServidor = null;

window.getDonoModularConfig = function() {
  const defaults = {
    perfil: 'confortavel',
    fontScale: 1.0,
    secoes: DONO_SECOES_DEF.map((s, idx) => ({
      id: s.id,
      ordem: idx + 1,
      visivel: true,
      largura: s.larguraDef || 'medium'
    }))
  };

  let cfg = null;
  try {
    const raw = localStorage.getItem('cc_dono_modular_config');
    if (raw) cfg = JSON.parse(raw);
  } catch (e) {}

  // 1. Se há config do servidor, ela tem prioridade (é a do dono/restaurante).
  if (window.donoConfigServidor) {
    cfg = Object.assign({}, defaults, window.donoConfigServidor);
  }

  if (!cfg) cfg = defaults;

  // Garante todos os campos/defaults
  cfg.fontScale = cfg.fontScale != null ? cfg.fontScale : 1.0;
  cfg.perfil = cfg.perfil || 'confortavel';
  if (!Array.isArray(cfg.secoes)) cfg.secoes = defaults.secoes;

  // Preenche seções que falten no array
  const have = new Set(cfg.secoes.map(s => s.id));
  DONO_SECOES_DEF.forEach((s, idx) => {
    if (!have.has(s.id)) cfg.secoes.push({ id: s.id, ordem: idx + 1, visivel: true, largura: s.larguraDef || 'medium' });
  });

  return cfg;
};

window.salvarDonoModularConfig = function(cfg) {
  if (!cfg) cfg = window.getDonoModularConfig();
  try {
    localStorage.setItem('cc_dono_modular_config', JSON.stringify(cfg));
  } catch (e) {}
  window.aplicarDonoModularConfig(cfg);
  // Envia ao servidor para persistir por restaurante (fica igual em qualquer
  // dispositivo do DONO). Só após o socket autenticar para não gravar vazio.
  if (socket && typeof socket.emit === 'function' && socket.connected && socket.auth) {
    socket.emit('painel_dono_set_config', cfg);
  }
};

window.alterarEscalaFonteDono = function(scale) {
  const cfg = window.getDonoModularConfig();
  cfg.fontScale = parseFloat(scale) || 1.0;
  window.salvarDonoModularConfig(cfg);
  if (typeof showToast === 'function') {
    showToast(cfg.fontScale >= 1.25 ? '👓 Modo Sênior (60+) ativado com texto gigante!' : '🔤 Tamanho de fonte ajustado!', 'ph-text-aa', 'success');
  }
};

window.aplicarPerfilDono = function(perfilNome) {
  const cfg = window.getDonoModularConfig();
  cfg.perfil = perfilNome;

  if (perfilNome === 'senior') {
    cfg.fontScale = 1.25; // Fonte gigante para 60+
    cfg.secoes.forEach(s => {
      s.visivel = ['sec-periodo', 'sec-kpis', 'sec-caixa', 'sec-equipe', 'sec-remoto-telas', 'sec-meta-aviso'].includes(s.id);
      s.largura = 'large';
    });
    if (typeof showToast === 'function') showToast('👓 Perfil Sênior (60+) Ativado: Fontes e Botões Gigantes!', 'ph-sparkle', 'success');
  } else if (perfilNome === 'jovem') {
    cfg.fontScale = 1.0;
    cfg.secoes.forEach(s => {
      s.visivel = true;
      const def = DONO_SECOES_DEF.find(d => d.id === s.id);
      s.largura = def ? def.larguraDef : 'medium';
    });
    if (typeof showToast === 'function') showToast('⚡ Perfil Executivo Completo Ativado!', 'ph-sparkle', 'success');
  } else if (perfilNome === 'mobile_one_hand') {
    cfg.fontScale = 1.1;
    cfg.secoes.forEach(s => {
      s.visivel = ['sec-periodo', 'sec-kpis', 'sec-caixa', 'sec-remoto-telas'].includes(s.id);
      s.largura = 'large';
    });
    if (typeof showToast === 'function') showToast('📱 Perfil Mobile Mão Única Ativado!', 'ph-mobile', 'success');
  }

  window.salvarDonoModularConfig(cfg);
  const modal = document.getElementById('modal-reordenar-seccoes');
  if (modal && !modal.classList.contains('hidden')) window.abrirModalReordenarSeccoes();
};

window.aplicarDonoModularConfig = function(cfg = null) {
  if (!cfg) cfg = window.getDonoModularConfig();

  // 1. Escala de Fonte (Acessibilidade para 60+)
  const root = document.documentElement;
  const fontScale = cfg.fontScale || 1.0;
  root.style.setProperty('--fs-xs', `${Math.round(13 * fontScale)}px`);
  root.style.setProperty('--fs-sm', `${Math.round(15 * fontScale)}px`);
  root.style.setProperty('--fs-md', `${Math.round(17 * fontScale)}px`);
  root.style.setProperty('--fs-lg', `${Math.round(21 * fontScale)}px`);
  root.style.setProperty('--fs-xl', `${Math.round(26 * fontScale)}px`);
  root.style.setProperty('--fs-kpi', `${Math.round(38 * fontScale)}px`);

  if (fontScale >= 1.2) {
    document.body.classList.add('mode-senior-60');
  } else {
    document.body.classList.remove('mode-senior-60');
  }

  // Mapa data-secao -> id de config (padrão interno DONOMO)
  const dataSecToId = {
    'periodo': 'sec-periodo',
    'ia-briefing': 'sec-ia-briefing',
    'kpis': 'sec-kpis',
    'bi-dre-abc': 'sec-bi-dre-abc',
    'canais-venda': 'sec-canais-venda',
    'antifraude': 'sec-antifraude',
    'caixa': 'sec-caixa',
    'equipe': 'sec-equipe',
    'remoto-caixa': 'sec-remoto-telas',
    'remoto-telas': 'sec-remoto-telas',
    'remoto-colabs': 'sec-remoto-equipe',
    'remoto-equipe': 'sec-remoto-equipe',
    'marketing': 'sec-marketing-vip',
    'marketing-vip': 'sec-marketing-vip',
    'cupons': 'sec-cupons',
    'gamificacao-equipe': 'sec-gamificacao-equipe',
    'indicacao-parceiros': 'sec-indicacao-parceiros',
    'meta-aviso': 'sec-meta-aviso',
    'ranking': 'sec-ranking',
    'funcionalidades': 'sec-features',
    'feed': 'sec-atividade'
  };

  const main = document.querySelector('main');
  if (!main) return;

  const secMap = new Map();
  cfg.secoes.forEach(s => secMap.set(s.id, s));

  const elements = Array.from(main.children);
  elements.forEach((el, index) => {
    if (!el.id) {
      const dataSec = el.getAttribute && el.getAttribute('data-secao');
      if (dataSec && dataSecToId[dataSec]) {
        el.id = dataSecToId[dataSec];
      } else if (el.querySelector('.sec-title')) {
        const txt = el.querySelector('.sec-title').textContent.toLowerCase();
        if (txt.includes('período')) el.id = 'sec-periodo';
        else if (txt.includes('copiloto') || txt.includes('briefing')) el.id = 'sec-ia-briefing';
        else if (txt.includes('resumo')) el.id = 'sec-kpis';
        else if (txt.includes('dre') || txt.includes('cardápio')) el.id = 'sec-bi-dre-abc';
        else if (txt.includes('canais')) el.id = 'sec-canais-venda';
        else if (txt.includes('antifraude') || txt.includes('radar')) el.id = 'sec-antifraude';
        else if (txt.includes('caixa') && !txt.includes('remoto')) el.id = 'sec-caixa';
        else if (txt.includes('controle remoto do caixa')) el.id = 'sec-remoto-telas';
        else if (txt.includes('gestão da equipe') || txt.includes('colaboradores') || txt.includes('políticas')) el.id = 'sec-remoto-equipe';
        else if (txt.includes('mensagens')) el.id = 'sec-marketing-vip';
        else if (txt.includes('cupons')) el.id = 'sec-cupons';
        else if (txt.includes('batalha') || txt.includes('gamificação')) el.id = 'sec-gamificacao-equipe';
        else if (txt.includes('indique')) el.id = 'sec-indicacao-parceiros';
        else if (txt.includes('meta')) el.id = 'sec-meta-aviso';
        else if (txt.includes('ranking') || txt.includes('produtos')) el.id = 'sec-ranking';
        else if (txt.includes('central de módulos') || txt.includes('funcionalidades')) el.id = 'sec-features';
        else if (txt.includes('atividade')) el.id = 'sec-atividade';
      } else if (el.classList.contains('equipe-card')) {
        el.id = 'sec-equipe';
      }
    }

    // Sempre garante as classes base do motor (mesmo sem config)
    if (!el.classList.contains('dono-section')) el.classList.add('dono-section');

    if (el.id && secMap.has(el.id)) {
      const conf = secMap.get(el.id);

      if (conf.visivel === false) {
        el.style.display = 'none';
      } else {
        el.style.display = '';
      }

      // Largura com base nas classes do motor (4-col responsivo)
      el.classList.remove('dono-sec-full', 'dono-sec-half', 'dono-sec-third');
      if (conf.largura === 'large') el.classList.add('dono-sec-full');
      else if (conf.largura === 'small') el.classList.add('dono-sec-third');
      else el.classList.add('dono-sec-half');

      el.style.order = conf.ordem || (index + 1);
    } else if (el.id && el.getAttribute('data-secao')) {
      // Seção padrão sem entrada de config ativa: usa a largura padrão da definição
      const def = DONO_SECOES_DEF.find(d => d.id === el.id);
      const w = (def && def.larguraDef) || 'medium';
      el.classList.remove('dono-sec-full', 'dono-sec-half', 'dono-sec-third');
      if (w === 'large') el.classList.add('dono-sec-full');
      else if (w === 'small') el.classList.add('dono-sec-third');
      else el.classList.add('dono-sec-half');
    }
  });
};

// Persistência da configuração por restaurante (segue o dono entre dispositivos)
window.painelDonoConfigCarregadoSocket = null;
window.painelDonoConfigCarregadoLocal = false;

window._carregarConfigServidor = function() {
  if (socket && typeof socket.emit === 'function' && socket.auth && socket.connected) {
    socket.emit('painel_dono_get_config');
  } else if (typeof socket === 'object' && socket.emit) {
    socket.emit('painel_dono_get_config');
  }
};
window._aplicarSingletonDoSistema = null;

window.abrirModalPersonalizarDono = function() {
  if (typeof window.abrirModalReordenarSeccoes === 'function') {
    window.abrirModalReordenarSeccoes();
  }
};

window.cfgSalvarDono = function() {
  window.salvarDonoModularConfig(window.getDonoModularConfig());
  if (typeof showToast === 'function') showToast('Visualização salva para este restaurante.', 'ph-check', 'success');
};

window.cfgRestaurarDono = function() {
  window.donoConfigServidor = null;
  try { localStorage.removeItem('cc_dono_modular_config'); } catch (e) {}
  const defaults = window.getDonoModularConfig();
  window.aplicarDonoModularConfig(defaults);
  if (socket && typeof socket.emit === 'function' && socket.connected && socket.auth) {
    socket.emit('painel_dono_set_config', defaults);
  }
  if (typeof showToast === 'function') showToast('Visualização restaurada para o padrão.', 'ph-arrow-counter-clockwise', 'success');
};


window.abrirModalReordenarSeccoes = function() {
  let modal = document.getElementById('modal-reordenar-seccoes');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-reordenar-seccoes';
    modal.className = 'modal-overlay hidden';
    document.body.appendChild(modal);
  }

  const cfg = window.getDonoModularConfig();
  const fontScale = cfg.fontScale || 1.0;

    const sortedSecoes = [...DONO_SECOES_DEF].sort((a, b) => {
    const itemA = cfg.secoes.find(s => s.id === a.id) || { ordem: 99 };
    const itemB = cfg.secoes.find(s => s.id === b.id) || { ordem: 99 };
    return itemA.ordem - itemB.ordem;
  });

  let htmlSeccoes = sortedSecoes.map((def) => {
    const item = cfg.secoes.find(s => s.id === def.id) || { visivel: true, largura: 'medium', ordem: 99 };
    return `
      <div class="mod-item-card" data-sec-id="${def.id}" style="background:var(--card2); border:1px solid var(--border); border-radius:14px; padding:14px; display:flex; flex-direction:column; gap:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong style="font-size:15px; color:var(--text); display:flex; align-items:center; gap:8px;">
            <span class="drag-handle" style="cursor:grab; padding: 4px; display:inline-flex; opacity:0.5;" title="Arraste para reordenar"><i class="ph-bold ph-dots-six-vertical"></i></span>
            <i class="ph-bold ${def.icon}" style="color:var(--primary);"></i> ${def.nome}
          </strong>
          <div style="display:flex; gap:6px;">
            <button type="button" onclick="window.moverSecaoDono('${def.id}', -1)" style="padding:6px 10px; border-radius:8px; border:1px solid var(--border); background:var(--card); color:var(--text); cursor:pointer; font-weight:800;">⬆️</button>
            <button type="button" onclick="window.moverSecaoDono('${def.id}', 1)" style="padding:6px 10px; border-radius:8px; border:1px solid var(--border); background:var(--card); color:var(--text); cursor:pointer; font-weight:800;">⬇️</button>
          </div>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-size:12px;">
          <div>
            <label style="color:var(--text-sub); font-weight:700; display:block; margin-bottom:4px;">Tamanho / Largura</label>
            <select onchange="window.alterarParametroSecao('${def.id}', 'largura', this.value)" class="form-input" style="padding:8px 10px; font-size:12px;">
              <option value="small" ${item.largura === 'small' ? 'selected' : ''}>Pequeno (1 col)</option>
              <option value="medium" ${item.largura === 'medium' ? 'selected' : ''}>Médio (2 cols)</option>
              <option value="large" ${item.largura === 'large' ? 'selected' : ''}>Grande (Linha Toda)</option>
            </select>
          </div>
          <div>
            <label style="color:var(--text-sub); font-weight:700; display:block; margin-bottom:4px;">Visibilidade</label>
            <select onchange="window.alterarParametroSecao('${def.id}', 'visivel', this.value === 'true')" class="form-input" style="padding:8px 10px; font-size:12px;">
              <option value="true" ${item.visivel !== false ? 'selected' : ''}>👁️ Exibir</option>
              <option value="false" ${item.visivel === false ? 'selected' : ''}>🙈 Ocultar</option>
            </select>
          </div>
        </div>
      </div>
    `;
  }).join('');

  modal.innerHTML = `
    <div class="modal-sheet" style="max-width: 680px;">
      <div class="modal-drag"></div>
      <div class="modal-title-row">
        <span class="modal-title"><i class="ph-bold ph-sliders" style="color:var(--primary);"></i> Personalizar Painel</span>
        <button class="modal-close" onclick="fecharModal('modal-reordenar-seccoes')"><i class="ph-bold ph-x"></i></button>
      </div>

      <p style="font-size:13.5px; color:var(--text-sub); line-height:1.4; margin-bottom:12px;">
        Escolha um <strong>Perfil Pronto por Faixa Etária</strong> ou personalize o tamanho e a visibilidade de cada card individualmente.
      </p>

      <!-- Presets de Perfil por Faixa Etária -->
      <div style="background:var(--card2); border:1px solid var(--border); border-radius:16px; padding:16px; margin-bottom:16px;">
        <div style="font-size:12px; font-weight:800; color:var(--primary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:10px;">
          ⚡ Perfis Rápidos por Faixa Etária
        </div>
        <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:8px;">
          <button type="button" onclick="window.aplicarPerfilDono('senior')" class="btn-primary" style="padding:12px 8px; font-size:12px; flex-direction:column; gap:4px; text-align:center; background:linear-gradient(135deg, #10b981, #059669);">
            <span style="font-size:18px;">👓</span>
            <span>Sênior (60+)</span>
            <small style="font-size:10px; opacity:0.8; font-weight:600;">Fontes & Botões Gigantes</small>
          </button>

          <button type="button" onclick="window.aplicarPerfilDono('jovem')" class="btn-primary" style="padding:12px 8px; font-size:12px; flex-direction:column; gap:4px; text-align:center; background:linear-gradient(135deg, #fc4b15, #ea580c);">
            <span style="font-size:18px;">⚡</span>
            <span>Jovem / Executivo</span>
            <small style="font-size:10px; opacity:0.8; font-weight:600;">Bento Grid Completo</small>
          </button>

          <button type="button" onclick="window.aplicarPerfilDono('mobile_one_hand')" class="btn-primary" style="padding:12px 8px; font-size:12px; flex-direction:column; gap:4px; text-align:center; background:linear-gradient(135deg, #3b82f6, #2563eb);">
            <span style="font-size:18px;">📱</span>
            <span>Mobile Mão Única</span>
            <small style="font-size:10px; opacity:0.8; font-weight:600;">Direto no Essencial</small>
          </button>
        </div>
      </div>

      <!-- Ajuste Rápido de Fonte (Acessibilidade) -->
      <div style="display:flex; justify-content:space-between; align-items:center; background:var(--card2); border:1px solid var(--border); border-radius:14px; padding:12px 16px; margin-bottom:16px;">
        <span style="font-size:13px; font-weight:700; color:var(--text); display:flex; align-items:center; gap:6px;">
          <i class="ph-bold ph-text-aa" style="color:var(--yellow);"></i> Tamanho do Texto & Ícones:
        </span>
        <div style="display:flex; gap:6px;">
          <button type="button" onclick="window.alterarEscalaFonteDono(1.0)" style="padding:6px 12px; border-radius:8px; border:1px solid var(--border); background:${fontScale === 1.0 ? 'var(--primary)' : 'var(--card)'}; color:white; font-size:12px; font-weight:800; cursor:pointer;">Padrão (100%)</button>
          <button type="button" onclick="window.alterarEscalaFonteDono(1.25)" style="padding:6px 12px; border-radius:8px; border:1px solid var(--border); background:${fontScale >= 1.2 ? 'var(--green)' : 'var(--card)'}; color:white; font-size:12px; font-weight:800; cursor:pointer;">👓 Gigante (125% - 60+)</button>
        </div>
      </div>

      <div style="font-size:12px; font-weight:800; color:var(--text-sub); text-transform:uppercase; margin-bottom:10px; letter-spacing:0.5px;">
        Ajuste Card a Card (Ordem & Dimensão)
      </div>

      <div id="dono-modal-sortable-list" style="display:flex; flex-direction:column; gap:10px; max-height:360px; overflow-y:auto; padding-right:4px; padding-left:4px; padding-bottom: 20px;">
        ${htmlSeccoes}
      </div>

      <div style="display:flex; gap:10px; margin-top:16px;">
        <button class="btn-cancel" onclick="fecharModal('modal-reordenar-seccoes')" style="flex:1; padding:14px;">Concluído</button>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');
};

window.alterarParametroSecao = function(secId, campo, valor) {
  const cfg = window.getDonoModularConfig();
  const sec = cfg.secoes.find(s => s.id === secId);
  if (sec) {
    sec[campo] = valor;
    window.salvarDonoModularConfig(cfg);
  }
};

window.moverSecaoDono = function(secId, direcao) {
  const cfg = window.getDonoModularConfig();
  const idx = cfg.secoes.findIndex(s => s.id === secId);
  if (idx === -1) return;

  const targetIdx = idx + direcao;
  if (targetIdx < 0 || targetIdx >= cfg.secoes.length) return;

  const temp = cfg.secoes[idx];
  cfg.secoes[idx] = cfg.secoes[targetIdx];
  cfg.secoes[targetIdx] = temp;

  cfg.secoes.forEach((s, i) => s.ordem = i + 1);

  window.salvarDonoModularConfig(cfg);
  window.abrirModalReordenarSeccoes();
};

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (typeof window.checarStatusMarketing === 'function') window.checarStatusMarketing();
    if (typeof window.aplicarDonoModularConfig === 'function') window.aplicarDonoModularConfig();
    // Carrega a configuração do dono salva no servidor (segue entre dispositivos)
    if (typeof window._carregarConfigServidor === 'function') window._carregarConfigServidor();
    // Carrega o catálogo de módulos ativos e add-ons contratáveis
    if (typeof window.carregarModulosDono === 'function') window.carregarModulosDono();
  }, 200);
});

// Recebe da tela a config do dono vinda do servidor e aplica por restauração.
if (typeof socket === 'object' && socket && typeof socket.on === 'function') {
  socket.on('painel_dono_config_pronta', (cfg) => {
    window.donoConfigServidor = (cfg && typeof cfg === 'object') ? cfg : null;
    if (window.donoConfigServidor) {
      try {
        localStorage.setItem('cc_dono_modular_config', JSON.stringify(window.donoConfigServidor));
      } catch (e) {}
      if (typeof window.aplicarDonoModularConfig === 'function') window.aplicarDonoModularConfig(window.donoConfigServidor);
    }
  });
  socket.on('connect', () => {
    if (typeof window._carregarConfigServidor === 'function') window._carregarConfigServidor();
    if (typeof window.carregarModulosDono === 'function') window.carregarModulosDono();
  });
  // Notificação em tempo real quando o Super Admin aprovar um módulo solicitado
  socket.on('funcao_aprovada', (data) => {
    if (typeof showToast === 'function') {
      showToast('🎉 Um novo módulo foi aprovado e ativado para o seu restaurante!', 'ph-rocket-launch', 'success');
    }
    if (typeof window.carregarModulosDono === 'function') window.carregarModulosDono(true);
  });
}

/* ══════════════════════════════════════════════════════════════════
   CENTRAL DE MÓDULOS & ADD-ONS DO RESTAURANTE (STORE & CONTROLE)
   ══════════════════════════════════════════════════════════════════ */
let _cachedModulosDono = [];
let _filtroModuloAtual = 'todos';
let _termoBuscaModulo = '';

window.carregarModulosDono = async function(forcar = false) {
  const grid = document.getElementById('features-grid-dono');
  const badgeContador = document.getElementById('badge-contador-modulos-ativos');
  const iconRefresh = document.getElementById('icon-refresh-modulos');

  if (iconRefresh) iconRefresh.classList.add('spin');
  if (grid && (!_cachedModulosDono.length || forcar)) {
    grid.innerHTML = `
      <div style="text-align:center; color:var(--text-sub); padding:30px; grid-column:1/-1;">
        <i class="ph-bold ph-spinner-gap spin" style="font-size: 26px; color: var(--primary);"></i>
        <div style="margin-top: 8px; font-size: 13px;">Carregando módulos disponíveis...</div>
      </div>
    `;
  }

  try {
    const res = await fetch('/api/funcoes', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (data && data.success && Array.isArray(data.features)) {
      _cachedModulosDono = data.features;
      const ativosCount = _cachedModulosDono.filter(m => m.enabled && m.available).length;
      if (badgeContador) {
        badgeContador.textContent = `${ativosCount} Ativos no seu Plano`;
      }
      window.renderizarGridModulosDono();
    } else {
      if (grid) grid.innerHTML = '<div style="text-align:center; color:#ef4444; padding:24px; grid-column:1/-1;">Não foi possível carregar os módulos.</div>';
    }
  } catch (err) {
    if (grid) grid.innerHTML = '<div style="text-align:center; color:var(--text-sub); padding:24px; grid-column:1/-1;">Erro de conexão ao buscar módulos.</div>';
  } finally {
    if (iconRefresh) iconRefresh.classList.remove('spin');
  }
};

window.renderizarGridModulosDono = function() {
  const grid = document.getElementById('features-grid-dono');
  if (!grid) return;

  let filtrados = _cachedModulosDono.slice();

  // Filtro de aba
  if (_filtroModuloAtual === 'ativos') {
    filtrados = filtrados.filter(m => m.enabled && m.available);
  } else if (_filtroModuloAtual === 'addons') {
    filtrados = filtrados.filter(m => !m.available);
  } else if (_filtroModuloAtual !== 'todos') {
    filtrados = filtrados.filter(m => (m.categorias || []).includes(_filtroModuloAtual));
  }

  // Filtro de busca
  if (_termoBuscaModulo) {
    const t = _termoBuscaModulo.toLowerCase();
    filtrados = filtrados.filter(m =>
      (m.nome || '').toLowerCase().includes(t) ||
      (m.desc || '').toLowerCase().includes(t) ||
      (m.roi || '').toLowerCase().includes(t) ||
      (m.categorias || []).some(c => c.toLowerCase().includes(t))
    );
  }

  if (filtrados.length === 0) {
    grid.innerHTML = `
      <div style="text-align:center; color:var(--text-sub); padding:36px; grid-column:1/-1;">
        <i class="ph-bold ph-magnifying-glass" style="font-size: 32px; opacity: 0.5;"></i>
        <div style="font-weight: 800; font-size: 14px; margin-top: 8px; color: var(--text);">Nenhum módulo encontrado</div>
        <div style="font-size: 12px; margin-top: 4px;">Tente remover filtros ou buscar por outros termos.</div>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtrados.map(m => {
    const isAtivo = !!(m.enabled && m.available);
    const isLiberado = !!m.available;
    const statusImpl = m.status_impl; // 'liberada' | 'em_implementacao' | 'implementada' | 'solicitada' | 'recusada' | null
    const icone = m.icone || 'ph-puzzle-piece';
    const preco = m.preco || 'Sob consulta';
    const roi = m.roi || null;
    const badge = m.badge || null;

    let badgeStatus = '';
    let acaoBotao = '';

    if (isLiberado) {
      badgeStatus = isAtivo
        ? `<span style="font-size: 10.5px; font-weight: 900; background: #dcfce7; color: #15803d; padding: 3px 8px; border-radius: 12px; display: inline-flex; align-items: center; gap: 4px;"><i class="ph-fill ph-check-circle"></i> ATIVO</span>`
        : `<span style="font-size: 10.5px; font-weight: 800; background: var(--card); color: var(--text-sub); border: 1px solid var(--border); padding: 3px 8px; border-radius: 12px;">DESATIVADO</span>`;

      acaoBotao = `
        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; border-top: 1px solid var(--border); padding-top: 12px; margin-top: 8px;">
          <span style="font-size: 11.5px; font-weight: 700; color: ${isAtivo ? '#10b981' : 'var(--text-sub)'};">
            ${isAtivo ? 'Módulo operando' : 'Módulo pausado'}
          </span>
          <label style="position: relative; display: inline-block; width: 44px; height: 24px; cursor: pointer;">
            <input type="checkbox" ${isAtivo ? 'checked' : ''} onchange="window.alternarAtivacaoModuloDono('${m.chave}', this.checked, this)" style="opacity: 0; width: 0; height: 0;">
            <span style="position: absolute; inset: 0; background: ${isAtivo ? '#10b981' : 'var(--border)'}; border-radius: 24px; transition: .25s;"></span>
            <span style="position: absolute; height: 18px; width: 18px; left: ${isAtivo ? '22px' : '3px'}; bottom: 3px; background: #fff; border-radius: 50%; transition: .25s; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></span>
          </label>
        </div>
      `;
    } else if (statusImpl === 'em_implementacao') {
      badgeStatus = `<span style="font-size: 10.5px; font-weight: 900; background: #ede9fe; color: #7c3aed; padding: 3px 8px; border-radius: 12px;"><i class="ph-bold ph-gear spin"></i> EM IMPLANTAÇÃO</span>`;
      acaoBotao = `
        <div style="border-top: 1px solid var(--border); padding-top: 12px; margin-top: 8px; width: 100%;">
          <div style="font-size: 11.5px; color: #7c3aed; font-weight: 700; display: flex; align-items: center; gap: 6px;">
            <i class="ph-bold ph-clock"></i> Nossa equipe já está configurando seu módulo.
          </div>
        </div>
      `;
    } else if (statusImpl === 'solicitada') {
      badgeStatus = `<span style="font-size: 10.5px; font-weight: 900; background: #fef3c7; color: #b45309; padding: 3px 8px; border-radius: 12px;"><i class="ph-bold ph-hourglass"></i> SOLICITADO</span>`;
      acaoBotao = `
        <div style="border-top: 1px solid var(--border); padding-top: 12px; margin-top: 8px; width: 100%; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 11.5px; color: #b45309; font-weight: 700;">Aguardando liberação</span>
          <button type="button" onclick="abrirModalSolicitarModulo('${m.chave}')" style="background: none; border: none; color: var(--primary); font-size: 11px; font-weight: 800; cursor: pointer;">
            Atualizar mensagem
          </button>
        </div>
      `;
    } else {
      // Add-on contratável
      badgeStatus = `<span style="font-size: 10.5px; font-weight: 900; background: rgba(252, 75, 21, 0.12); color: var(--primary); padding: 3px 8px; border-radius: 12px;">ADD-ON OPCIONAL</span>`;
      acaoBotao = `
        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; border-top: 1px solid var(--border); padding-top: 12px; margin-top: 8px; gap: 8px; flex-wrap: wrap;">
          <div>
            <div style="font-size: 10px; font-weight: 800; color: var(--text-sub); text-transform: uppercase;">Investimento</div>
            <div style="font-size: 13.5px; font-weight: 900; color: #10b981;">${preco}</div>
          </div>
          <button type="button" onclick="abrirModalSolicitarModulo('${m.chave}')" style="padding: 8px 14px; border-radius: 10px; background: linear-gradient(135deg, #fc4b15, #ff8c00); color: #fff; border: none; font-weight: 800; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(252, 75, 21, 0.25);">
            <i class="ph-bold ph-rocket-launch"></i> Quero Ativar
          </button>
        </div>
      `;
    }

    const roiHtml = roi
      ? `<div style="font-size: 11px; font-weight: 700; color: #f59e0b; background: rgba(245, 158, 11, 0.08); padding: 4px 8px; border-radius: 8px; display: inline-flex; align-items: center; gap: 5px; margin-top: 6px;">
          <i class="ph-bold ph-lightning"></i> ${escHtml(roi)}
        </div>`
      : '';

    const badgeDestaque = badge
      ? `<span style="font-size: 9.5px; font-weight: 900; background: linear-gradient(135deg, #8b5cf6, #ec4899); color: #fff; padding: 2px 6px; border-radius: 6px; margin-left: 6px; text-transform: uppercase; letter-spacing: 0.3px;">${escHtml(badge)}</span>`
      : '';

    return `
      <div style="background: var(--card2); border: 1.5px solid ${isAtivo ? 'rgba(16, 185, 129, 0.35)' : 'var(--border)'}; border-radius: 16px; padding: 16px; display: flex; flex-direction: column; justify-content: space-between; gap: 8px; box-shadow: 0 4px 14px rgba(0,0,0,0.03); transition: transform 0.2s, border-color 0.2s;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 10px;">
            <div style="width: 42px; height: 42px; border-radius: 12px; background: ${isAtivo ? 'rgba(16, 185, 129, 0.12)' : 'rgba(252, 75, 21, 0.12)'}; color: ${isAtivo ? '#10b981' : 'var(--primary)'}; display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0;">
              <i class="ph-bold ${icone}"></i>
            </div>
            ${badgeStatus}
          </div>

          <div style="display: flex; align-items: center; flex-wrap: wrap;">
            <h4 style="margin: 0; font-size: 14.5px; font-weight: 900; color: var(--text); line-height: 1.3;">${escHtml(m.nome)}</h4>
            ${badgeDestaque}
          </div>

          <div style="font-size: 11px; font-weight: 700; color: var(--text-sub); margin: 3px 0 6px 0;">
            ${(m.categorias || []).join(' • ')}
          </div>

          <p style="margin: 0; font-size: 12px; color: var(--text-sub); line-height: 1.4; min-height: 34px;">
            ${escHtml(m.desc)}
          </p>

          ${roiHtml}
        </div>

        ${acaoBotao}
      </div>
    `;
  }).join('');
};

window.filtrarModulosDono = function(categoria, btn) {
  _filtroModuloAtual = categoria;
  document.querySelectorAll('#filtros-modulos-dono .modulo-tab-btn').forEach(b => {
    b.style.background = 'var(--bg)';
    b.style.color = 'var(--text-sub)';
    b.style.fontWeight = '700';
  });
  if (btn) {
    btn.style.background = 'var(--primary)';
    btn.style.color = '#fff';
    btn.style.fontWeight = '800';
  }
  window.renderizarGridModulosDono();
};

window.filtrarModulosDonoPorTexto = function(termo) {
  _termoBuscaModulo = (termo || '').trim();
  window.renderizarGridModulosDono();
};

window.alternarAtivacaoModuloDono = async function(chave, ativar, chk) {
  try {
    const res = await fetch('/api/funcoes/ativar', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ feature: chave, enabled: !!ativar })
    });
    const data = await res.json();
    if (data && data.success) {
      showToast(ativar ? 'Módulo ativado com sucesso!' : 'Módulo desativado.', 'ph-check-circle', 'success');
      // Atualiza estado no cache local
      const mod = _cachedModulosDono.find(m => m.chave === chave);
      if (mod) mod.enabled = !!ativar;
      const badgeContador = document.getElementById('badge-contador-modulos-ativos');
      if (badgeContador) {
        const ativosCount = _cachedModulosDono.filter(m => m.enabled && m.available).length;
        badgeContador.textContent = `${ativosCount} Ativos no seu Plano`;
      }
      window.renderizarGridModulosDono();
    } else {
      if (chk) chk.checked = !ativar;
      showToast(data.error || 'Não foi possível alterar o status do módulo.', 'ph-warning', 'error');
    }
  } catch (err) {
    if (chk) chk.checked = !ativar;
    showToast('Falha na comunicação com o servidor.', 'ph-wifi-slash', 'error');
  }
};

window.abrirModalSolicitarModulo = function(chave) {
  const mod = _cachedModulosDono.find(m => m.chave === chave);
  if (!mod) return;

  const elChave = document.getElementById('modal-sol-mod-chave');
  const elTitulo = document.getElementById('modal-sol-mod-titulo');
  const elNome = document.getElementById('modal-sol-mod-nome');
  const elPreco = document.getElementById('modal-sol-mod-preco');
  const elDesc = document.getElementById('modal-sol-mod-desc');
  const elRoi = document.getElementById('modal-sol-mod-roi-texto');
  const elIcon = document.getElementById('modal-sol-mod-icon');

  if (elChave) elChave.value = mod.chave;
  if (elTitulo) elTitulo.innerHTML = `<i class="ph-bold ph-rocket-launch" style="color:var(--primary);"></i> Contratar ${escHtml(mod.nome)}`;
  if (elNome) elNome.textContent = mod.nome;
  if (elPreco) elPreco.textContent = mod.preco || 'Sob consulta';
  if (elDesc) elDesc.textContent = mod.desc;
  if (elRoi) elRoi.textContent = mod.roi || 'Mais eficiência para seu negócio';
  if (elIcon) elIcon.className = `ph-bold ${mod.icone || 'ph-puzzle-piece'}`;

  abrirModal('modal-solicitar-modulo');
};

window.abrirModalSolicitarModuloGenerico = function() {
  const elChave = document.getElementById('modal-sol-mod-chave');
  const elTitulo = document.getElementById('modal-sol-mod-titulo');
  const elNome = document.getElementById('modal-sol-mod-nome');
  const elPreco = document.getElementById('modal-sol-mod-preco');
  const elDesc = document.getElementById('modal-sol-mod-desc');
  const elRoi = document.getElementById('modal-sol-mod-roi-texto');
  const elIcon = document.getElementById('modal-sol-mod-icon');

  if (elChave) elChave.value = 'modulo_sob_medida';
  if (elTitulo) elTitulo.innerHTML = `<i class="ph-bold ph-plus-circle" style="color:var(--primary);"></i> Solicitar Módulo Sob Medida`;
  if (elNome) elNome.textContent = 'Módulo ou Integração Personalizada';
  if (elPreco) elPreco.textContent = 'Sob orçamento';
  if (elDesc) elDesc.textContent = 'Descreva a função, equipamento ou integração que seu restaurante precisa.';
  if (elRoi) elRoi.textContent = 'Desenvolvimento prioritário para a sua operação';
  if (elIcon) elIcon.className = 'ph-bold ph-sparkle';

  abrirModal('modal-solicitar-modulo');
};

window.enviarSolicitacaoModuloDono = async function() {
  const chave = document.getElementById('modal-sol-mod-chave')?.value || 'nova_solicitacao';
  const whatsapp = (document.getElementById('modal-sol-mod-whatsapp')?.value || '').trim();
  const obs = (document.getElementById('modal-sol-mod-obs')?.value || '').trim();
  const btn = document.getElementById('btn-confirmar-sol-mod');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="ph-bold ph-spinner-gap spin"></i> Enviando...';
  }

  try {
    const res = await fetch('/api/funcoes/solicitar', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        feature: chave,
        telefone: whatsapp,
        mensagem: obs
      })
    });
    const data = await res.json();
    if (data && data.success) {
      fecharModal('modal-solicitar-modulo');
      showToast(data.mensagem || 'Solicitação enviada! Nossa equipe já foi notificada.', 'ph-check-circle', 'success');
      // Limpa inputs
      if (document.getElementById('modal-sol-mod-obs')) document.getElementById('modal-sol-mod-obs').value = '';
      window.carregarModulosDono(true);
    } else {
      showToast(data.error || 'Erro ao enviar solicitação.', 'ph-warning', 'error');
    }
  } catch (err) {
    showToast('Falha na comunicação ao enviar solicitação.', 'ph-wifi-slash', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="ph-bold ph-paper-plane-tilt"></i> Confirmar Solicitação';
    }
  }
};

window.ativarModuloImediatoDono = async function() {
  const chave = document.getElementById('modal-sol-mod-chave')?.value;
  if (!chave) return;
  const btn = document.getElementById('btn-ativar-imediato-mod');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="ph-bold ph-spinner-gap spin"></i> Ativando Módulo...';
  }
  const authToken = (typeof token !== 'undefined' && token) || localStorage.getItem('chef_token') || '';
  try {
    const res = await fetch('/api/dono/modulos/ativar-imediato', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ chave_modulo: chave })
    });
    const data = await res.json();
    if (data && data.ok) {
      fecharModal('modal-solicitar-modulo');
      showToast(data.mensagem || 'Módulo ativado com sucesso!', 'ph-check-circle', 'success');
      window.carregarModulosDono(true);
    } else {
      showToast(data.erro || 'Falha ao ativar módulo.', 'ph-warning', 'error');
    }
  } catch (e) {
    showToast('Erro de comunicação ao ativar módulo.', 'ph-wifi-slash', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="ph-bold ph-lightning"></i> Ativar Agora com 7 Dias Grátis';
    }
  }
};


// ══════════════════════════════════════════════════════════════════
// BI EXECUTIVO DO DONO: DRE & ENGENHARIA DE CARDÁPIO
// ══════════════════════════════════════════════════════════════════

async function carregarBIDonoExecutivo() {
  const fmt = (v) => 'R$ ' + (parseFloat(v) || 0).toFixed(2).replace('.', ',');
  const authToken = (typeof token !== 'undefined' && token) || localStorage.getItem('chef_token') || '';
  try {
    const p = window.periodoAtual === 'custom' ? 'mes' : (window.periodoAtual || 'mes');
    const [resDre, resAbc] = await Promise.all([
      fetch('/api/financeiro/dre?periodo=' + encodeURIComponent(p), { headers: { 'Authorization': 'Bearer ' + authToken } }),
      fetch('/api/financeiro/curva-abc?periodo=' + encodeURIComponent(p), { headers: { 'Authorization': 'Bearer ' + authToken } })
    ]);

    const dataDre = await resDre.json();
    const dataAbc = await resAbc.json();

    if (dataDre && dataDre.ok) {
      const k = dataDre.kpis || {};
      const elLucro = document.getElementById('dono-dre-lucro-real');
      if (elLucro) {
        elLucro.innerText = fmt(k.lucro_liquido_real);
        elLucro.style.color = k.lucro_liquido_real >= 0 ? '#10b981' : '#f43f5e';
      }
      const elMargem = document.getElementById('dono-dre-margem-pct');
      if (elMargem) elMargem.innerText = 'Margem Líquida: ' + (k.margem_liquida_pct || 0).toFixed(1) + '%';

      const elCmv = document.getElementById('dono-dre-cmv');
      if (elCmv) elCmv.innerText = fmt(k.cmv_total);
      const elCmvPct = document.getElementById('dono-dre-cmv-pct');
      if (elCmvPct) elCmvPct.innerText = (k.cmv_pct_receita || 0).toFixed(1) + '% da receita bruta';

      const elContrib = document.getElementById('dono-dre-margem-contrib');
      if (elContrib) elContrib.innerText = fmt(k.margem_contribuicao);
      const elContribPct = document.getElementById('dono-dre-margem-contrib-pct');
      if (elContribPct) elContribPct.innerText = (k.margem_contribuicao_pct || 0).toFixed(1) + '% sobre vendas';

      const elBreak = document.getElementById('dono-dre-break-even');
      if (elBreak) elBreak.innerText = fmt(k.ponto_equilibrio_estimado);
    }

    if (dataAbc && dataAbc.ok) {
      const q = dataAbc.engenharia_cardapio || {};
      const setQuad = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val || 0;
      };
      setQuad('dono-quad-estrelas', q.estrelas);
      setQuad('dono-quad-cavalos', q.cavalos_de_carga);
      setQuad('dono-quad-puzzles', q.quebra_cabecas);
      setQuad('dono-quad-caes', q.caes);
    }
  } catch (e) {
    console.warn('BI Dono Executivo indisponível:', e);
  }
}

window.abrirModalDRECompletoDono = function() {
  const modal = document.getElementById('modal-dre-bi-dono');
  if (modal) {
    modal.classList.remove('hidden');
    carregarDREModalDono('mes');
  }
};

window.fecharModalDRECompletoDono = function() {
  const modal = document.getElementById('modal-dre-bi-dono');
  if (modal) modal.classList.add('hidden');
};

window.carregarDREModalDono = async function(periodo) {
  const fmt = (v) => 'R$ ' + (parseFloat(v) || 0).toFixed(2).replace('.', ',');
  const p = periodo || 'mes';
  const authToken = (typeof token !== 'undefined' && token) || localStorage.getItem('chef_token') || '';

  const labelEl = document.getElementById('modal-dono-dre-periodo-label');
  if (labelEl) labelEl.innerText = 'Carregando...';

  try {
    const [resDre, resAbc] = await Promise.all([
      fetch('/api/financeiro/dre?periodo=' + encodeURIComponent(p), { headers: { 'Authorization': 'Bearer ' + authToken } }),
      fetch('/api/financeiro/curva-abc?periodo=' + encodeURIComponent(p), { headers: { 'Authorization': 'Bearer ' + authToken } })
    ]);

    const dataDre = await resDre.json();
    const dataAbc = await resAbc.json();

    if (labelEl && dataDre.periodo) {
      labelEl.innerText = 'De ' + dataDre.periodo.inicio + ' a ' + dataDre.periodo.fim;
    }

    // ── Termômetro do Ponto de Equilíbrio (Break-Even) no Modal Dono ──
    if (dataDre && dataDre.ok) {
      const k = dataDre.kpis || {};
      const recLiq = parseFloat(k.receita_liquida) || 0;
      const ptEquilibrio = parseFloat(k.ponto_equilibrio_estimado) || 0;
      const pctCob = ptEquilibrio > 0 ? (recLiq / ptEquilibrio) * 100 : 0;

      const elRec = document.getElementById('modal-dono-pe-rec');
      const elMeta = document.getElementById('modal-dono-pe-meta');
      const elPct = document.getElementById('modal-dono-pe-pct');
      const elBar = document.getElementById('modal-dono-pe-bar');
      const elBadge = document.getElementById('modal-dono-pe-badge');

      if (elRec) elRec.innerText = fmt(recLiq);
      if (elMeta) elMeta.innerText = fmt(ptEquilibrio);
      if (elPct) elPct.innerText = Math.round(pctCob) + '% coberto';

      if (elBar) {
        elBar.style.width = Math.min(100, Math.max(0, pctCob)) + '%';
        elBar.style.background = pctCob >= 100 ? 'linear-gradient(90deg, #10b981, #059669)' : 'linear-gradient(90deg, #f59e0b, #10b981)';
      }

      if (elBadge) {
        if (pctCob >= 100) {
          const sobra = recLiq - ptEquilibrio;
          elBadge.innerText = '🟢 Ponto de Equilíbrio Superado (+ ' + fmt(sobra) + ')';
          elBadge.style.background = '#dcfce7';
          elBadge.style.color = '#15803d';
        } else {
          const falta = ptEquilibrio - recLiq;
          elBadge.innerText = '🟡 Faltam ' + fmt(falta) + ' (' + pctCob.toFixed(1) + '%)';
          elBadge.style.background = '#fef3c7';
          elBadge.style.color = '#b45309';
        }
      }
    }

    const tbodyDre = document.getElementById('modal-dono-dre-tbody');
    if (tbodyDre && dataDre.ok) {
      const k = dataDre.kpis || {};
      const linhas = [
        { nome: '(+) Receita Bruta de Vendas', val: k.receita_bruta, pct: 100, bold: true },
        { nome: '(-) Deduções & Taxas Cartão', val: -k.deducoes_taxas, pct: k.receita_liquida > 0 ? (k.deducoes_taxas/k.receita_liquida)*100 : 0, cor: '#f43f5e' },
        { nome: '(=) Receita Líquida Operacional', val: k.receita_liquida, pct: 100, bold: true, cor: '#3b82f6' },
        { nome: '(-) CMV (Insumos dos Pratos)', val: -k.cmv_total, pct: k.receita_liquida > 0 ? (k.cmv_total/k.receita_liquida)*100 : 0, cor: '#f59e0b' },
        { nome: '(=) Margem de Contribuição', val: k.margem_contribuicao, pct: k.receita_liquida > 0 ? (k.margem_contribuicao/k.receita_liquida)*100 : 0, bold: true, cor: '#10b981' },
        { nome: '(-) Despesas Operacionais Fixas', val: -k.despesas_operacionais_fixas, pct: k.receita_liquida > 0 ? (k.despesas_operacionais_fixas/k.receita_liquida)*100 : 0, cor: '#a855f7' },
        { nome: '(=) LUCRO LÍQUIDO REAL', val: k.lucro_liquido_real, pct: k.receita_liquida > 0 ? (k.lucro_liquido_real/k.receita_liquida)*100 : 0, bold: true, cor: k.lucro_liquido_real >= 0 ? '#10b981' : '#f43f5e' },
        { nome: '⭐ Ponto de Equilíbrio Estimado', val: k.ponto_equilibrio_estimado, pct: null, bold: true, cor: '#f59e0b' }
      ];

      tbodyDre.innerHTML = linhas.map(l => {
        const valStr = l.val < 0 ? '- ' + fmt(Math.abs(l.val)) : fmt(l.val);
        const pctStr = l.pct !== null ? l.pct.toFixed(1) + '%' : '-';
        return '<tr style="border-bottom: 1px solid var(--border); font-weight:' + (l.bold ? '700' : 'normal') + '; color:' + (l.cor || 'var(--text)') + ';">' +
            '<td style="padding: 8px 12px;">' + l.nome + '</td>' +
            '<td style="padding: 8px 12px; text-align: right;">' + valStr + '</td>' +
            '<td style="padding: 8px 12px; text-align: right; color: var(--text-sub);">' + pctStr + '</td>' +
          '</tr>';
      }).join('');
    }

    const tbodyAbc = document.getElementById('modal-dono-abc-tbody');
    if (tbodyAbc && dataAbc.ok && dataAbc.curva_abc) {
      window._dadosCurvaAbcAtual = dataAbc.curva_abc;

      // Atualiza contadores dos 4 quadrantes
      const q = dataAbc.engenharia_cardapio || {};
      const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
      setEl('bcg-count-todos', dataAbc.curva_abc.length);
      setEl('bcg-count-estrelas', q.estrelas || 0);
      setEl('bcg-count-cavalos', q.cavalos_de_carga || 0);
      setEl('bcg-count-puzzles', q.quebra_cabecas || 0);
      setEl('bcg-count-caes', q.caes || 0);

      const badgeGanho = document.getElementById('badge-ganho-potencial-bcg');
      if (badgeGanho) {
        const ganho = q.ganho_potencial_total || 0;
        badgeGanho.innerText = 'Oportunidade de Lucro: + ' + fmt(ganho);
      }

      window.renderTabelaBCG(dataAbc.curva_abc);
    }
  } catch(e) {
    console.error('Erro ao carregar DRE modal dono:', e);
  }
};

// ══════════════════════════════════════════════════════════════════
// MÓDULO CONTADOR CHEFF — GESTÃO & ASSESSORIA CONTÁBIL NO PAINEL DO DONO
// ══════════════════════════════════════════════════════════════════



window.filtrarBCGQuadrante = function(quad, element) {
  document.querySelectorAll('#bcg-quad-cards-container .bcg-card-quad').forEach(c => {
    c.style.borderWidth = '1.5px';
    c.classList.remove('active');
  });
  if (element) {
    element.style.borderWidth = '2px';
    element.classList.add('active');
  }
  const lista = window._dadosCurvaAbcAtual || [];
  if (quad === 'todos') {
    window.renderTabelaBCG(lista);
  } else {
    window.renderTabelaBCG(lista.filter(i => i.quadrante === quad));
  }
};

window.renderTabelaBCG = function(itens) {
  const tbody = document.getElementById('modal-dono-abc-tbody');
  if (!tbody) return;
  const fmt = (v) => 'R$ ' + (parseFloat(v) || 0).toFixed(2).replace('.', ',');

  if (!itens || itens.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="padding:20px; text-align:center; color:var(--text-sub);">Nenhum prato neste quadrante.</td></tr>';
    return;
  }

  tbody.innerHTML = itens.map(item => {
    let quadCor = item.quadrante === 'Estrela' ? '#10b981' : (item.quadrante === 'Cavalo de Carga' ? '#f59e0b' : (item.quadrante === 'Quebra-Cabeça' ? '#8b5cf6' : '#ef4444'));
    let acaoHtml = '';
    if (item.quadrante === 'Cavalo de Carga' && item.preco_sugerido && item.preco_sugerido > item.preco_medio) {
      acaoHtml = `<div style="display:flex; align-items:center; justify-content:center; gap:6px;">
        <span style="font-size:11px; color:#f59e0b; font-weight:700;">Reajuste p/ ${fmt(item.preco_sugerido)}</span>
        <button onclick="window.aplicarPrecoSugerido('${escJs(item.nome)}', ${item.preco_sugerido})" style="padding:4px 8px; background:#f59e0b; color:white; border:none; border-radius:6px; font-size:10.5px; font-weight:800; cursor:pointer;">Aplicar</button>
      </div>`;
    } else if (item.quadrante === 'Estrela') {
      acaoHtml = `<span style="font-size:11px; color:#10b981; font-weight:700;">⭐ Manter Qualidade & Destaque</span>`;
    } else if (item.quadrante === 'Quebra-Cabeça') {
      acaoHtml = `<span style="font-size:11px; color:#8b5cf6; font-weight:700;">🧩 Criar Combo ou Promover</span>`;
    } else {
      acaoHtml = `<span style="font-size:11px; color:#ef4444; font-weight:700;">🐕 Avaliar Retirada</span>`;
    }

    return '<tr style="border-bottom: 1px solid var(--border);">' +
      '<td style="padding: 8px 10px; font-weight: 600;">' + (item.emoji || '🍽️') + ' ' + escHtml(item.nome) + '</td>' +
      '<td style="padding: 8px 10px; text-align: center; font-weight: 700;">' + item.qtd + 'x</td>' +
      '<td style="padding: 8px 10px; text-align: right;">' + fmt(item.preco_medio) + '</td>' +
      '<td style="padding: 8px 10px; text-align: right; color: #10b981; font-weight: 700;">' + fmt(item.margem_unitaria) + '</td>' +
      '<td style="padding: 8px 10px; text-align: right; font-weight: 800; color: var(--primary);">' + fmt(item.faturamento) + '</td>' +
      '<td style="padding: 8px 10px; text-align: center;"><span style="color: ' + quadCor + '; font-weight: 700; font-size: 11.5px;">' + (item.icone_quadrante || '') + ' ' + item.quadrante + '</span></td>' +
      '<td style="padding: 8px 10px; text-align: center;">' + acaoHtml + '</td>' +
    '</tr>';
  }).join('');
};

window.aplicarPrecoSugerido = async function(nome, novoPreco) {
  if (!confirm(`Confirmar aplicação do novo preço de R$ ${novoPreco.toFixed(2).replace('.', ',')} para "${nome}"?`)) return;
  const authToken = (typeof token !== 'undefined' && token) || localStorage.getItem('chef_token') || '';
  try {
    const res = await fetch('/api/financeiro/aplicar-preco-sugerido', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify({ nome, novo_preco: novoPreco })
    });
    const d = await res.json();
    if (d.ok) {
      alert(d.mensagem || 'Preço atualizado com sucesso!');
      const p = document.getElementById('modal-dono-dre-periodo') ? document.getElementById('modal-dono-dre-periodo').value : 'mes';
      window.carregarDREModalDono(p);
    } else {
      alert('Erro: ' + (d.erro || 'Falha ao atualizar'));
    }
  } catch(e) {
    alert('Erro de conexão ao atualizar preço: ' + e.message);
  }
};
window.statusContadorCheffAtual = null;

async function carregarStatusContadorCheff() {
  try {
    const restId = localStorage.getItem('restaurante_id') || '1';
    const res = await fetch(`/api/dono/contador/status?restaurante_id=${restId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!data || !data.ok) return;

    window.statusContadorCheffAtual = data;
    renderizarPainelContadorCheff(data);
  } catch (err) {
    console.error('Erro ao carregar status do Contador Cheff:', err);
  }
}

function renderizarPainelContadorCheff(data) {
  const vitrineEl = document.getElementById('dono-contador-vitrine');
  const painelAtivoEl = document.getElementById('dono-contador-painel-ativo');
  const badgeEl = document.getElementById('dono-contador-status-badge');

  if (!data.ativo || !data.assinatura) {
    if (vitrineEl) vitrineEl.style.display = 'block';
    if (painelAtivoEl) painelAtivoEl.style.display = 'none';
    if (badgeEl) {
      badgeEl.innerHTML = `
        <span style="background: rgba(16,185,129,0.12); color: #10b981; border: 1px solid rgba(16,185,129,0.3); font-size: 11.5px; font-weight: 800; padding: 4px 12px; border-radius: 20px; display: inline-flex; align-items: center; gap: 5px;">
          <i class="ph-bold ph-seal-percent"></i> Economize até 30% no DAS
        </span>
      `;
    }
    return;
  }

  // Se ativo:
  if (vitrineEl) vitrineEl.style.display = 'none';
  if (painelAtivoEl) painelAtivoEl.style.display = 'block';

  const assin = data.assinatura;
  if (badgeEl) {
    badgeEl.innerHTML = `
      <span style="background: rgba(16,185,129,0.18); color: #10b981; border: 1.5px solid #10b981; font-size: 11.5px; font-weight: 800; padding: 4px 12px; border-radius: 20px; display: inline-flex; align-items: center; gap: 5px;">
        <i class="ph-bold ph-check-circle"></i> Assinatura Ativa
      </span>
    `;
  }

  const planoEl = document.getElementById('dono-contador-ativo-plano');
  if (planoEl) planoEl.innerText = assin.plano_nome || 'Plano Pro Restaurante';

  const detalhesEl = document.getElementById('dono-contador-ativo-detalhes');
  if (detalhesEl) {
    const contNome = assin.contador_responsavel_nome || 'Chef Equipe Contábil';
    detalhesEl.innerText = `Contador Responsável: ${contNome} | Regime: ${formatarRegimeNome(assin.regime_tributario)}`;
  }

  const regimeKpi = document.getElementById('dono-contador-kpi-regime');
  if (regimeKpi) regimeKpi.innerText = formatarRegimeNome(assin.regime_tributario);

  const cnpjKpi = document.getElementById('dono-contador-kpi-cnpj');
  if (cnpjKpi) cnpjKpi.innerText = assin.cnpj ? `CNPJ: ${assin.cnpj}` : 'CNPJ em validação';

  const demandas = data.demandas || [];
  const demKpi = document.getElementById('dono-contador-kpi-demandas');
  if (demKpi) demKpi.innerText = `${demandas.length} registros`;

  // WhatsApp do Contador / Central
  const btnWhats = document.getElementById('btn-whatsapp-contador');
  if (btnWhats) {
    btnWhats.href = `https://wa.me/5511999999999?text=${encodeURIComponent(`Olá Contador Cheff! Sou do ${assin.restaurante_nome} e gostaria de tirar uma dúvida contábil/fiscal.`)}`;
  }

  // Tabela de Demandas
  const tbody = document.getElementById('dono-contador-tabela-demandas');
  if (tbody) {
    if (demandas.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 24px; color: var(--text-sub);">
            Nenhuma demanda registrada ainda. Clique em "Nova Solicitação Contábil" para enviar uma tarefa ao seu contador.
          </td>
        </tr>
      `;
    } else {
      tbody.innerHTML = demandas.map(dem => {
        let badgeStatus = '<span style="background: rgba(245,158,11,0.15); color: #f59e0b; padding: 3px 8px; border-radius: 6px; font-weight: 700; font-size: 11px;">Na Fila</span>';
        if (dem.status === 'em_andamento') {
          badgeStatus = '<span style="background: rgba(59,130,246,0.15); color: #3b82f6; padding: 3px 8px; border-radius: 6px; font-weight: 700; font-size: 11px;">Em Execução</span>';
        } else if (dem.status === 'concluido' || dem.status === 'aprovado') {
          badgeStatus = '<span style="background: rgba(16,185,129,0.15); color: #10b981; padding: 3px 8px; border-radius: 6px; font-weight: 700; font-size: 11px;">✓ Concluído</span>';
        }

        let parecerOuGuia = '<span style="color: var(--text-sub); font-size: 12px;">Aguardando retorno</span>';
        if (dem.parecer_contador) {
          parecerOuGuia = `
            <div style="font-size: 12px; color: var(--text); line-height: 1.4;">
              ${escHtml(dem.parecer_contador)}
              ${dem.documento_anexo_url ? `<br><a href="${escHtml(dem.documento_anexo_url)}" target="_blank" style="color: #10b981; font-weight: 700; text-decoration: underline;"><i class="ph-bold ph-download-simple"></i> Baixar Guia/Relatório</a>` : ''}
              ${dem.codigo_barras_guia ? `<br><span style="font-family: monospace; font-size: 11px; background: rgba(0,0,0,0.15); padding: 2px 6px; border-radius: 4px;">Linha: ${escHtml(dem.codigo_barras_guia)}</span>` : ''}
            </div>
          `;
        }

        return `
          <tr style="border-bottom: 1px solid var(--border);">
            <td style="padding: 10px 12px; font-weight: 700;">
              <div>${escHtml(dem.titulo)}</div>
              <span style="font-size: 11px; color: var(--text-sub); font-weight: normal;">${escHtml(dem.descricao || '')}</span>
            </td>
            <td style="padding: 10px 12px; font-size: 12px;">${escHtml(dem.competencia || 'Atual')}</td>
            <td style="padding: 10px 12px;">${badgeStatus}</td>
            <td style="padding: 10px 12px; font-size: 12px;">${escHtml(dem.contador_nome || 'Equipe Contábil')}</td>
            <td style="padding: 10px 12px;">${parecerOuGuia}</td>
          </tr>
        `;
      }).join('');
    }
  }
}

function formatarRegimeNome(regime) {
  switch (regime) {
    case 'simples_nacional': return 'Simples Nacional';
    case 'mei': return 'MEI';
    case 'lucro_presumido': return 'Lucro Presumido';
    case 'lucro_real': return 'Lucro Real';
    default: return 'Simples Nacional';
  }
}

function abrirModalContratarContador(planoSugerido) {
  if (planoSugerido) {
    const sel = document.getElementById('contratar-plano');
    if (sel) sel.value = planoSugerido;
  }
  const modal = document.getElementById('modal-contratar-contador');
  if (modal) modal.style.display = 'flex';
  const fb = document.getElementById('contratar-feedback');
  if (fb) fb.style.display = 'none';
}

function fecharModalContratarContador() {
  const modal = document.getElementById('modal-contratar-contador');
  if (modal) modal.style.display = 'none';
}

function atualizarInfoPlanoContratar() {
  // onchange handler
}

async function confirmarContratacaoContador() {
  const btn = document.getElementById('btn-confirmar-contratacao-contador');
  const fb = document.getElementById('contratar-feedback');
  const plano = document.getElementById('contratar-plano')?.value || 'pro_restaurante';
  const cnpj = document.getElementById('contratar-cnpj')?.value || '';
  const regime = document.getElementById('contratar-regime')?.value || 'simples_nacional';
  const respNome = document.getElementById('contratar-nome-resp')?.value || '';
  const whats = document.getElementById('contratar-whatsapp')?.value || '';
  const email = document.getElementById('contratar-email')?.value || '';
  const obs = document.getElementById('contratar-obs')?.value || '';

  if (!cnpj.trim()) {
    if (fb) {
      fb.style.display = 'block';
      fb.style.color = '#ef4444';
      fb.innerText = 'Por favor, informe o CNPJ da sua empresa.';
    }
    return;
  }

  try {
    if (btn) btn.disabled = true;
    if (fb) {
      fb.style.display = 'block';
      fb.style.color = '#3b82f6';
      fb.innerText = 'Ativando seu plano contábil...';
    }

    const restId = localStorage.getItem('restaurante_id') || '1';
    const res = await fetch(`/api/dono/contador/contratar?restaurante_id=${restId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        plano,
        cnpj,
        regime_tributario: regime,
        responsavel_nome: respNome,
        responsavel_whatsapp: whats,
        email_contabil: email,
        notas_adicionais: obs
      })
    });

    const data = await res.json();
    if (data.ok) {
      if (fb) {
        fb.style.color = '#10b981';
        fb.innerText = 'Assinatura confirmada com sucesso! Recarregando...';
      }
      setTimeout(() => {
        fecharModalContratarContador();
        carregarStatusContadorCheff();
      }, 1200);
    } else {
      if (fb) {
        fb.style.color = '#ef4444';
        fb.innerText = data.erro || 'Erro ao contratar o plano.';
      }
    }
  } catch (err) {
    if (fb) {
      fb.style.color = '#ef4444';
      fb.innerText = 'Falha de conexão com o servidor.';
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

function abrirModalSolicitarDemandaContador() {
  const modal = document.getElementById('modal-solicitar-demanda-contador');
  if (modal) modal.style.display = 'flex';
  const fb = document.getElementById('demanda-feedback');
  if (fb) fb.style.display = 'none';

  // Pré-preenche competência
  const compEl = document.getElementById('demanda-competencia');
  if (compEl && !compEl.value) {
    compEl.value = new Date().toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' });
  }
}

function fecharModalSolicitarDemandaContador() {
  const modal = document.getElementById('modal-solicitar-demanda-contador');
  if (modal) modal.style.display = 'none';
}

async function enviarDemandaContador() {
  const btn = document.getElementById('btn-enviar-demanda-contador');
  const fb = document.getElementById('demanda-feedback');
  const tipo = document.getElementById('demanda-tipo')?.value || 'apuracao_das';
  const titulo = document.getElementById('demanda-titulo')?.value || '';
  const comp = document.getElementById('demanda-competencia')?.value || '';
  const desc = document.getElementById('demanda-descricao')?.value || '';

  if (!titulo.trim() || !desc.trim()) {
    if (fb) {
      fb.style.display = 'block';
      fb.style.color = '#ef4444';
      fb.innerText = 'Preencha o título e a descrição da demanda.';
    }
    return;
  }

  try {
    if (btn) btn.disabled = true;
    if (fb) {
      fb.style.display = 'block';
      fb.style.color = '#3b82f6';
      fb.innerText = 'Enviando demanda para o seu contador...';
    }

    const restId = localStorage.getItem('restaurante_id') || '1';
    const res = await fetch(`/api/dono/contador/solicitar-demanda?restaurante_id=${restId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        tipo,
        titulo,
        competencia: comp,
        descricao: desc
      })
    });

    const data = await res.json();
    if (data.ok) {
      if (fb) {
        fb.style.color = '#10b981';
        fb.innerText = 'Demanda enviada com sucesso! Seu contador cuidará da tarefa.';
      }
      setTimeout(() => {
        fecharModalSolicitarDemandaContador();
        carregarStatusContadorCheff();
      }, 1200);
    } else {
      if (fb) {
        fb.style.color = '#ef4444';
        fb.innerText = data.erro || 'Erro ao enviar demanda.';
      }
    }
  } catch (err) {
    if (fb) {
      fb.style.color = '#ef4444';
      fb.innerText = 'Falha de comunicação com o servidor.';
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}


// ════════════════════════════════════════════════════════════════════
// MÓDULO: CONTRATAÇÃO & TALENTOS GASTRONÔMICOS (HUB RH DO DONO)
// ════════════════════════════════════════════════════════════════════

let _filtroCargoAtual = '';
let _buscaTalentoAtual = '';

// 1. Abrir Modal Principal do Hub de Contratação
window.abrirModalContratacaoTalentos = function(aba = 'talentos', cargo = '') {
  const modal = document.getElementById('modal-contratacao-talentos');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.style.display = 'flex';
  modal.style.opacity = '1';
  modal.style.pointerEvents = 'auto';

  if (cargo !== undefined) {
    _filtroCargoAtual = cargo;
    const filtroInput = document.getElementById('rh-filtro-cargo-input');
    if (filtroInput) filtroInput.value = cargo;
  }

  window.alternarAbaContratacao(aba);
};

// 2. Fechar Modal Principal
window.fecharModalContratacaoTalentos = function() {
  const modal = document.getElementById('modal-contratacao-talentos');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
};

// 3. Alternar entre as 5 Abas do Hub
window.alternarAbaContratacao = function(aba) {
  const abas = ['talentos', 'publicar', 'vagas', 'escala', 'calculadora'];
  
  abas.forEach(nome => {
    const btn = document.getElementById(`tab-nav-${nome}`);
    const box = document.getElementById(`aba-hub-${nome}`);
    const ativa = (nome === aba);

    if (btn) {
      btn.classList.toggle('active', ativa);
      btn.style.color = ativa ? 'var(--text)' : 'var(--text-sub)';
      btn.style.borderBottom = ativa ? '3px solid #10b981' : '3px solid transparent';
      btn.style.fontWeight = ativa ? '800' : '700';
    }
    if (box) {
      box.style.display = ativa ? 'block' : 'none';
    }
  });

  if (aba === 'talentos') {
    window.carregarBancoTalentos();
  } else if (aba === 'publicar') {
    const whatsInput = document.getElementById('vaga-contato-whats');
    if (whatsInput && !whatsInput.value) {
      const savedUser = JSON.parse(localStorage.getItem('user') || '{}');
      if (savedUser.telefone) whatsInput.value = savedUser.telefone;
    }
  } else if (aba === 'vagas') {
    window.carregarMinhasVagas();
  } else if (aba === 'escala') {
    window.carregarEscalaFreelancers();
  } else if (aba === 'calculadora') {
    window.calcularSimuladorCustos();
  }
};

// 4. Carregar Resumo da Seção no Dashboard
window.carregarResumoContratacaoSecao = async function() {
  try {
    const currentToken = localStorage.getItem('chef_token') || token;
    const headers = { 'Authorization': `Bearer ${currentToken}` };

    const [resTalentos, resVagas, resEscala] = await Promise.all([
      fetch('/api/contratacao/talentos?limite=6', { headers }).then(r => r.json()).catch(() => ({})),
      fetch('/api/contratacao/vagas', { headers }).then(r => r.json()).catch(() => ({})),
      fetch('/api/contratacao/escala', { headers }).then(r => r.json()).catch(() => ({}))
    ]);

    const elTotal = document.getElementById('rh-kpi-total-talentos');
    const elVagas = document.getElementById('rh-kpi-vagas-abertas');
    const elEscala = document.getElementById('rh-kpi-escala-ativa');

    const totalTalentos = (resTalentos.talentos && resTalentos.talentos.length) || 12;
    if (elTotal) elTotal.innerText = `${totalTalentos}+`;

    const totalVagas = (resVagas.vagas && resVagas.vagas.filter(v => v.status === 'aberta').length) || 0;
    if (elVagas) elVagas.innerText = String(totalVagas);

    const totalEscala = (resEscala.escala && resEscala.escala.filter(e => e.status === 'agendado' || e.status === 'presente').length) || 0;
    if (elEscala) elEscala.innerText = `${totalEscala} turnos`;

    // Renderizar candidatos em destaque no preview do dono
    const containerPreview = document.getElementById('dono-preview-talentos-container');
    if (containerPreview && resTalentos.talentos && resTalentos.talentos.length > 0) {
      const top3 = resTalentos.talentos.slice(0, 3);
      containerPreview.innerHTML = top3.map(t => {
        const valDiaria = t.valor_diaria || t.valor_diaria_padrao || 140;
        const diariaFmt = formatCurrency(valDiaria);
        const avatar = t.foto_avatar || t.foto || '👨‍🍳';
        const rating = t.avaliacao_media || t.avaliacao || '5.0';
        return `
          <div style="background:var(--card); border:1px solid var(--border); border-radius:14px; padding:14px; display:flex; flex-direction:column; justify-content:space-between; gap:10px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
              <div style="display:flex; align-items:center; gap:10px;">
                <div style="width:42px; height:42px; border-radius:12px; background:rgba(255,255,255,0.06); display:flex; align-items:center; justify-content:center; font-size:24px;">
                  ${escHtml(avatar)}
                </div>
                <div>
                  <strong style="font-size:14px; color:var(--text); display:block;">${escHtml(t.nome)}</strong>
                  <span style="font-size:11.5px; color:#10b981; font-weight:700;">★ ${rating} (${t.total_avaliacoes || 18} avaliações)</span>
                </div>
              </div>
              <span style="background:rgba(59,130,246,0.15); color:#60a5fa; font-size:11px; font-weight:800; padding:2px 8px; border-radius:8px;">
                ${escHtml(t.cargo)}
              </span>
            </div>
            
            <div style="font-size:12px; color:var(--text-sub); line-height:1.4;">
              ${escHtml((t.bio || '').substring(0, 85))}...
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; padding-top:8px; border-top:1px dashed var(--border);">
              <div>
                <span style="font-size:10.5px; color:var(--text-sub); display:block;">Diária Sugerida</span>
                <strong style="font-size:14px; color:#10b981;">${diariaFmt}</strong>
              </div>
              <div style="display:flex; gap:6px;">
                <button type="button" onclick="window.abrirPerfilTalento(${t.id})" style="padding:6px 10px; font-size:11.5px; border-radius:8px; border:1px solid var(--border); background:var(--card2); color:var(--text); cursor:pointer; font-weight:700;">
                  Perfil
                </button>
                <button type="button" onclick="window.abrirModalEscalarTalento(${t.id}, '${escHtml(t.nome)}', '${escHtml(t.cargo)}', ${valDiaria}, '${escHtml(avatar)}')" class="btn-primary" style="padding:6px 12px; font-size:11.5px; border-radius:8px; background:linear-gradient(135deg, #10b981 0%, #059669 100%);">
                  Escalar
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    console.warn('Erro ao carregar resumo de contratação:', err);
  }
};

// 5. Carregar Lista Completa do Banco de Talentos
window.carregarBancoTalentos = async function() {
  const grid = document.getElementById('grid-banco-talentos') || document.getElementById('grid-talentos-hub');
  if (!grid) return;

  const cargoInput = document.getElementById('filtro-categoria-talento') || document.getElementById('rh-filtro-cargo-input');
  const buscaInput = document.getElementById('filtro-busca-talento') || document.getElementById('rh-busca-talento-input');
  const cargo = cargoInput ? cargoInput.value : _filtroCargoAtual;
  const busca = buscaInput ? buscaInput.value : _buscaTalentoAtual;

  grid.innerHTML = `
    <div style="text-align:center; padding:40px 20px; color:var(--text-sub); grid-column:1/-1;">
      <i class="ph ph-circle-notch" style="animation:spin 1s infinite linear; font-size:28px; color:#10b981;"></i>
      <p style="margin-top:10px; font-size:13.5px;">Buscando profissionais disponíveis para o seu restaurante...</p>
    </div>
  `;

  try {
    const currentToken = localStorage.getItem('chef_token') || token;
    let url = `/api/contratacao/talentos?`;
    if (cargo) url += `cargo=${encodeURIComponent(cargo)}&`;
    if (busca) url += `busca=${encodeURIComponent(busca)}&`;

    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();

    if (!data.talentos || data.talentos.length === 0) {
      grid.innerHTML = `
        <div style="text-align:center; padding:50px 20px; color:var(--text-sub); grid-column:1/-1; background:var(--card); border-radius:16px; border:1px dashed var(--border);">
          <i class="ph-bold ph-magnifying-glass" style="font-size:36px; color:var(--text-sub); margin-bottom:8px;"></i>
          <h4 style="font-size:16px; color:var(--text); margin:0 0 6px 0;">Nenhum profissional encontrado para este filtro</h4>
          <p style="font-size:13px; margin:0 0 14px 0;">Tente buscar por outro cargo ou publicar uma vaga para atrair novos candidatos.</p>
          <button type="button" class="btn-primary" onclick="window.alternarAbaContratacao('publicar')" style="padding:8px 16px; font-size:13px; border-radius:10px;">
            <i class="ph-bold ph-megaphone"></i> Publicar Vaga Agora
          </button>
        </div>
      `;
      return;
    }

    grid.innerHTML = data.talentos.map(t => {
      const valDiaria = t.valor_diaria || t.valor_diaria_padrao || 140;
      const diariaFmt = formatCurrency(valDiaria);
      const avatar = t.foto_avatar || t.foto || '👨‍🍳';
      const rating = t.avaliacao_media || t.avaliacao || '5.0';
      const expAnos = t.experiencia_anos || t.anos_experiencia || 3;
      const especialidades = (t.especialidades || '').split(',').map(s => s.trim()).filter(Boolean);
      const espBadges = especialidades.slice(0, 3).map(e => `
        <span style="background:rgba(255,255,255,0.06); font-size:10.5px; padding:2px 7px; border-radius:6px; color:var(--text-sub); border:1px solid var(--border);">
          ${escHtml(e)}
        </span>
      `).join('');

      return `
        <div style="background:var(--card); border:1px solid var(--border); border-radius:16px; padding:18px; display:flex; flex-direction:column; justify-content:space-between; gap:12px; transition:all 0.2s; box-shadow:var(--shadow-sm);">
          
          <div>
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
              <div style="display:flex; align-items:center; gap:12px;">
                <div style="width:48px; height:48px; border-radius:14px; background:linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(59,130,246,0.15) 100%); display:flex; align-items:center; justify-content:center; font-size:26px; border:1px solid var(--border);">
                  ${escHtml(avatar)}
                </div>
                <div>
                  <div style="display:flex; align-items:center; gap:6px;">
                    <strong style="font-size:15px; color:var(--text);">${escHtml(t.nome)}</strong>
                    <i class="ph-fill ph-seal-check" style="color:#10b981; font-size:16px;" title="Perfil Verificado"></i>
                  </div>
                  <span style="font-size:12px; color:var(--text-sub); display:block;">${escHtml(t.cargo)} • ${expAnos} anos exp.</span>
                </div>
              </div>

              <span style="background:rgba(16,185,129,0.15); color:#10b981; font-size:11px; font-weight:800; padding:3px 8px; border-radius:8px;">
                ★ ${rating} (${t.total_avaliacoes || 18})
              </span>
            </div>

            <p style="font-size:12.5px; color:var(--text); line-height:1.45; margin:0 0 10px 0;">
              ${escHtml(t.bio || 'Profissional com sólida experiência operacional no setor gastronômico.')}
            </p>

            <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px;">
              ${espBadges}
            </div>

            <div style="background:var(--card2); border-radius:10px; padding:10px 12px; font-size:12px; display:flex; justify-content:space-between; align-items:center;">
              <div>
                <span style="color:var(--text-sub); font-size:11px; display:block;">Diária Base</span>
                <strong style="color:#10b981; font-size:15px;">${diariaFmt}</strong>
              </div>
              <div style="text-align:right;">
                <span style="color:var(--text-sub); font-size:11px; display:block;">Disponibilidade</span>
                <span style="color:#3b82f6; font-weight:700;">${escHtml(t.disponibilidade || 'Imediata')}</span>
              </div>
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:4px;">
            <button type="button" onclick="window.abrirPerfilTalento(${t.id})" style="padding:9px; font-size:12.5px; border-radius:10px; border:1px solid var(--border); background:var(--card2); color:var(--text); font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:4px;">
              <i class="ph-bold ph-identification-card"></i> Currículo
            </button>
            <button type="button" onclick="window.abrirModalEscalarTalento(${t.id}, '${escHtml(t.nome)}', '${escHtml(t.cargo)}', ${valDiaria}, '${escHtml(avatar)}')" class="btn-primary" style="padding:9px; font-size:12.5px; border-radius:10px; background:linear-gradient(135deg, #10b981 0%, #059669 100%); display:flex; align-items:center; justify-content:center; gap:4px;">
              <i class="ph-bold ph-calendar-plus"></i> Escalar / Chamar
            </button>
          </div>

        </div>
      `;
    }).join('');

  } catch (err) {
    console.error('Erro ao listar talentos:', err);
    grid.innerHTML = `<div style="text-align:center; padding:30px; color:#ef4444; grid-column:1/-1;">Erro ao carregar banco de talentos.</div>`;
  }
};

// 6. Filtrar por Chip Rápido de Cargo
window.filtrarTalentosChip = function(cargo, btnEl) {
  _filtroCargoAtual = cargo;
  const filtroInput = document.getElementById('filtro-categoria-talento') || document.getElementById('rh-filtro-cargo-input');
  if (filtroInput) filtroInput.value = cargo;

  document.querySelectorAll('.btn-chip-modal, .btn-chip-rh').forEach(btn => {
    btn.classList.remove('active');
    btn.style.color = 'var(--text-sub)';
  });
  if (btnEl) {
    btnEl.classList.add('active');
    btnEl.style.color = 'var(--text)';
  }

  window.carregarBancoTalentos();
};

// 7. Abrir Currículo Completo do Profissional
window.abrirPerfilTalento = async function(id) {
  const modal = document.getElementById('modal-perfil-talento');
  const conteudo = document.getElementById('conteudo-perfil-talento');
  const titulo = document.getElementById('perfil-titulo-modal');
  if (!modal || !conteudo) return;

  conteudo.innerHTML = `
    <div style="text-align:center; padding:40px; color:var(--text-sub);">
      <i class="ph ph-circle-notch" style="animation:spin 1s infinite linear; font-size:32px; color:#10b981;"></i>
      <p style="margin-top:10px;">Carregando currículo e avaliações...</p>
    </div>
  `;
  modal.classList.remove('hidden');
  modal.style.display = 'flex';
  modal.style.opacity = '1';
  modal.style.pointerEvents = 'auto';

  try {
    const currentToken = localStorage.getItem('chef_token') || token;
    const res = await fetch(`/api/contratacao/talentos/${id}`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    const t = data.talento;
    if (!t) throw new Error('Talento não encontrado');

    if (titulo) titulo.innerText = `${t.nome} • ${t.cargo}`;

    const valDiaria = t.valor_diaria || t.valor_diaria_padrao || 140;
    const diariaFmt = formatCurrency(valDiaria);
    const avatar = t.foto_avatar || t.foto || '👨‍🍳';
    const rating = t.avaliacao_media || t.avaliacao || '5.0';
    const whatsNum = t.whatsapp || t.telefone || '';

    const espItems = (t.especialidades || '').split(',').map(s => `
      <span style="background:var(--card2); border:1px solid var(--border); border-radius:8px; padding:4px 10px; font-size:12px; color:var(--text); font-weight:600;">
        ✓ ${escHtml(s.trim())}
      </span>
    `).join('');

    conteudo.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:16px;">
        
        <!-- Header Perfil -->
        <div style="display:flex; align-items:center; gap:16px; background:var(--card2); padding:16px; border-radius:16px; border:1px solid var(--border);">
          <div style="width:64px; height:64px; border-radius:18px; background:linear-gradient(135deg, rgba(16,185,129,0.2) 0%, rgba(59,130,246,0.2) 100%); display:flex; align-items:center; justify-content:center; font-size:36px; border:1px solid var(--border);">
            ${escHtml(avatar)}
          </div>
          <div style="flex:1;">
            <div style="display:flex; align-items:center; gap:8px;">
              <h3 style="font-size:18px; font-weight:900; color:var(--text); margin:0;">${escHtml(t.nome)}</h3>
              <i class="ph-fill ph-seal-check" style="color:#10b981; font-size:18px;" title="Verificado"></i>
            </div>
            <div style="font-size:13px; color:#3b82f6; font-weight:700; margin-top:2px;">
              ${escHtml(t.cargo)} • Categoria: ${escHtml(t.categoria || 'Gastronomia')}
            </div>
            <div style="font-size:12px; color:var(--text-sub); margin-top:4px;">
              📍 ${escHtml(t.cidade || 'São Paulo')} • ★ ${rating} (${t.total_avaliacoes || 18} avaliações positivas)
            </div>
          </div>
        </div>

        <!-- Biografia e Apresentação -->
        <div>
          <strong style="font-size:13.5px; color:var(--text); display:block; margin-bottom:6px;">Sobre o Profissional:</strong>
          <p style="font-size:13px; color:var(--text); line-height:1.55; margin:0; background:rgba(255,255,255,0.03); border:1px solid var(--border); border-radius:12px; padding:14px;">
            ${escHtml(t.bio || 'Profissional com experiência prática e dedicação em ritmo intenso de serviço.')}
          </p>
        </div>

        <!-- Especialidades e Habilidades -->
        <div>
          <strong style="font-size:13.5px; color:var(--text); display:block; margin-bottom:8px;">Especialidades Técnicas:</strong>
          <div style="display:flex; flex-wrap:wrap; gap:8px;">
            ${espItems}
          </div>
        </div>

        <!-- Casas e Restaurantes Anteriores -->
        <div>
          <strong style="font-size:13.5px; color:var(--text); display:block; margin-bottom:6px;">Casas &amp; Restaurantes no Histórico:</strong>
          <div style="background:var(--card2); border:1px solid var(--border); border-radius:12px; padding:12px 14px; font-size:12.5px; color:var(--text);">
            <i class="ph-bold ph-storefront" style="color:#f59e0b; margin-right:6px;"></i>
            ${escHtml(t.casas_anteriores || 'Restaurantes e Bares de gastronomia contemporânea')}
          </div>
        </div>

        <!-- Certificações e Chave PIX -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div style="background:var(--card2); border:1px solid var(--border); border-radius:12px; padding:12px;">
            <span style="font-size:11px; color:var(--text-sub); display:block;">Certificados / Higiene</span>
            <strong style="font-size:12.5px; color:var(--text);">${escHtml(t.certificados || 'Boas Práticas Manipulação (Anvisa)')}</strong>
          </div>
          <div style="background:var(--card2); border:1px solid var(--border); border-radius:12px; padding:12px;">
            <span style="font-size:11px; color:var(--text-sub); display:block;">Chave PIX Cadastrada</span>
            <strong style="font-size:12.5px; color:#10b981;">${escHtml(t.chave_pix || 'Chave Celular Cadastrada')}</strong>
          </div>
        </div>

        <!-- Ações do Dono -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:8px;">
          <button type="button" onclick="window.falarTalentoWhatsApp('${whatsNum}', '${escHtml(t.nome)}', '${escHtml(t.cargo)}')" style="padding:12px; font-size:13px; font-weight:800; border-radius:12px; border:1px solid #22c55e; background:rgba(34,197,94,0.12); color:#22c55e; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
            <i class="ph-bold ph-whatsapp-logo" style="font-size:18px;"></i> Chamar no WhatsApp
          </button>
          <button type="button" onclick="window.fecharModalPerfilTalento(); window.abrirModalEscalarTalento(${t.id}, '${escHtml(t.nome)}', '${escHtml(t.cargo)}', ${valDiaria}, '${escHtml(avatar)}')" class="btn-primary" style="padding:12px; font-size:13px; font-weight:800; border-radius:12px; background:linear-gradient(135deg, #10b981 0%, #059669 100%); display:flex; align-items:center; justify-content:center; gap:6px;">
            <i class="ph-bold ph-calendar-plus" style="font-size:18px;"></i> Escalar para Meu Turno
          </button>
        </div>

      </div>
    `;

  } catch (err) {
    conteudo.innerHTML = `<div style="text-align:center; padding:30px; color:#ef4444;">Erro ao carregar perfil do profissional.</div>`;
  }
};

// 8. Fechar Modal Perfil
window.fecharModalPerfilTalento = function() {
  const modal = document.getElementById('modal-perfil-talento');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
};

// 9. Abrir Modal de Escalar e Contratar Freelancer
window.abrirModalEscalarTalento = function(id, nome, cargo, diaria, avatar) {
  const modal = document.getElementById('modal-escalar-talento');
  if (!modal) return;

  const idEl = document.getElementById('escalar-talento-id');
  const nomeEl = document.getElementById('escalar-nome');
  const cargoEl = document.getElementById('escalar-cargo');
  const avatarEl = document.getElementById('escalar-avatar');
  const valorEl = document.getElementById('escalar-valor');
  const dataEl = document.getElementById('escalar-data');

  if (idEl) idEl.value = id;
  if (nomeEl) nomeEl.innerText = nome;
  if (cargoEl) cargoEl.innerText = cargo;
  if (avatarEl) avatarEl.innerText = avatar || '👨‍🍳';
  if (valorEl) valorEl.value = diaria || 140;
  if (dataEl && !dataEl.value) {
    const hoje = new Date().toISOString().split('T')[0];
    dataEl.value = hoje;
  }

  modal.classList.remove('hidden');
  modal.style.display = 'flex';
  modal.style.opacity = '1';
  modal.style.pointerEvents = 'auto';
};

window.abrirModalPerfilTalento = window.abrirPerfilTalento;

// 10. Fechar Modal Escalar
window.fecharModalEscalarTalento = function() {
  const modal = document.getElementById('modal-escalar-talento');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
};

// 11. Confirmar Contratação e Agendamento
window.confirmarEscalarEContratarTalento = async function() {
  const talentoId = document.getElementById('escalar-talento-id')?.value;
  const dataTurno = document.getElementById('escalar-data')?.value;
  const periodo = document.getElementById('escalar-periodo')?.value || 'Jantar/Noite';
  const valorDiaria = parseFloat(document.getElementById('escalar-valor')?.value) || 140;
  const tipoContrato = document.getElementById('escalar-tipo-contrato')?.value || 'Freelancer / Diarista';

  if (!talentoId || !dataTurno) {
    showToast('Preencha a data do turno.', 'ph-warning', 'error');
    return;
  }

  try {
    const currentToken = localStorage.getItem('chef_token') || token;
    const res = await fetch('/api/contratacao/contratar-talento', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({
        talento_id: talentoId,
        data_turno: dataTurno,
        periodo: periodo,
        valor_diaria: valorDiaria,
        tipo_contrato: tipoContrato,
        adicionar_como_funcionario: true
      })
    });

    const data = await res.json();
    if (data.ok) {
      showToast(`🎉 ${data.mensagem}`, 'ph-check-circle', 'success');
      window.fecharModalEscalarTalento();
      window.carregarResumoContratacaoSecao();
      if (typeof window.carregarFuncionariosControleRemoto === 'function') {
        window.carregarFuncionariosControleRemoto();
      }
      window.alternarAbaContratacao('escala');
    } else {
      showToast(data.erro || 'Erro ao agendar profissional.', 'ph-warning', 'error');
    }
  } catch (err) {
    showToast('Falha na comunicação com o servidor.', 'ph-warning', 'error');
  }
};

// 12. Falar com Profissional pelo WhatsApp
window.falarTalentoWhatsApp = function(telefone, nome, cargo) {
  let limpo = (telefone || '').replace(/\D/g, '');
  if (!limpo) {
    showToast('Telefone não disponível.', 'ph-warning', 'error');
    return;
  }
  if (!limpo.startsWith('55')) limpo = '55' + limpo;

  const msg = `Olá ${nome}! Sou o gestor do restaurante e vi seu perfil de ${cargo} no Banco de Talentos Chef Cozinha. Gostaria de verificar sua disponibilidade para trabalhar conosco. Podemos conversar?`;
  const url = `https://wa.me/${limpo}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
};

// 13. Publicar Nova Vaga pelo Dono
window.publicarNovaVagaDono = async function() {
  const titulo = document.getElementById('vaga-titulo')?.value?.trim();
  const cargo = document.getElementById('vaga-cargo')?.value;
  const tipoVaga = document.getElementById('vaga-tipo')?.value || 'Freelancer / Diária';
  const remuneracao = document.getElementById('vaga-remuneracao')?.value?.trim();
  const horario = document.getElementById('vaga-horario')?.value?.trim();
  const requisitos = document.getElementById('vaga-requisitos')?.value?.trim();
  const localizacao = document.getElementById('vaga-localizacao')?.value?.trim();
  const contatoWhatsapp = document.getElementById('vaga-contato-whats')?.value?.trim();

  if (!titulo || !cargo || !remuneracao) {
    showToast('Preencha título da vaga, cargo e remuneração.', 'ph-warning', 'error');
    return;
  }

  const btn = document.getElementById('btn-publicar-vaga');
  if (btn) btn.disabled = true;

  try {
    const currentToken = localStorage.getItem('chef_token') || token;
    const res = await fetch('/api/contratacao/vagas', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({
        titulo,
        cargo,
        tipo_vaga: tipoVaga,
        remuneracao,
        horario,
        requisitos,
        localizacao,
        contato_whatsapp: contatoWhatsapp
      })
    });

    const data = await res.json();
    if (data.ok) {
      showToast('📢 Vaga publicada com sucesso!', 'ph-check-circle', 'success');

      // Limpar formulário
      const form = document.getElementById('form-publicar-vaga');
      if (form) form.reset();

      // Atualizar contadores e ir para a aba de vagas
      window.carregarResumoContratacaoSecao();
      window.alternarAbaContratacao('vagas');
    } else {
      showToast(data.erro || 'Erro ao publicar vaga.', 'ph-warning', 'error');
    }
  } catch (err) {
    showToast('Falha na conexão ao publicar vaga.', 'ph-warning', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
};

// 14. Carregar Vagas Abertas do Dono
window.carregarMinhasVagas = async function() {
  const container = document.getElementById('lista-minhas-vagas') || document.getElementById('tabela-minhas-vagas');
  if (!container) return;

  const isTable = container.tagName === 'TBODY' || container.tagName === 'TABLE';

  if (isTable) {
    container.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding:30px; color:var(--text-sub);">
          <i class="ph ph-circle-notch" style="animation:spin 1s infinite linear; font-size:24px; color:#f59e0b;"></i>
          <p style="margin-top:6px; font-size:12.5px;">Carregando suas vagas abertas...</p>
        </td>
      </tr>
    `;
  } else {
    container.innerHTML = `
      <div style="text-align:center; padding:40px; color:var(--text-sub);">
        <i class="ph ph-circle-notch" style="animation:spin 1s infinite linear; font-size:28px; color:#10b981;"></i>
        <p style="margin-top:10px; font-size:13.5px;">Carregando suas vagas abertas...</p>
      </div>
    `;
  }

  try {
    const currentToken = localStorage.getItem('chef_token') || token;
    const res = await fetch('/api/contratacao/vagas', {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();

    if (!data.vagas || data.vagas.length === 0) {
      if (isTable) {
        container.innerHTML = `
          <tr>
            <td colspan="6" style="text-align:center; padding:40px; color:var(--text-sub);">
              Você ainda não publicou nenhuma vaga. Clique em <strong>Publicar Vaga</strong> para atrair garçons, diaristas e especialistas.
            </td>
          </tr>
        `;
      } else {
        container.innerHTML = `
          <div style="text-align:center; padding:50px 20px; color:var(--text-sub); background:var(--card); border-radius:16px; border:1px dashed var(--border);">
            <i class="ph-bold ph-briefcase" style="font-size:36px; color:var(--text-sub); margin-bottom:8px;"></i>
            <h4 style="font-size:16px; color:var(--text); margin:0 0 6px 0;">Nenhuma vaga publicada ainda</h4>
            <p style="font-size:13px; margin:0 0 14px 0;">Publique oportunidades para atrair garçons, diaristas de fim de semana, cozinheiros e barman.</p>
            <button type="button" class="btn-primary" onclick="window.alternarAbaContratacao('publicar')" style="padding:8px 16px; font-size:13px; border-radius:10px;">
              <i class="ph-bold ph-plus-circle"></i> Criar Nova Vaga
            </button>
          </div>
        `;
      }
      return;
    }

    if (isTable) {
      container.innerHTML = data.vagas.map(v => {
        const dataCriada = v.criado_em ? new Date(v.criado_em).toLocaleDateString('pt-BR') : '-';
        const statusColor = v.status === 'aberta' ? '#10b981' : '#6b7280';
        const statusTxt = v.status === 'aberta' ? 'Ativa' : 'Encerrada';

        const zapShareMsg = `Vaga Aberta em nosso restaurante: ${v.titulo} (${v.cargo}) - Remuneração: ${v.remuneracao || 'A combinar'}. Interessados chamem no WhatsApp!`;
        const zapLink = `https://wa.me/?text=${encodeURIComponent(zapShareMsg)}`;

        return `
          <tr style="border-bottom:1px solid var(--border);">
            <td style="padding:12px; font-weight:800; color:var(--text);">
              ${escHtml(v.titulo)}
              <span style="font-size:11px; color:var(--text-sub); display:block;">Criada em ${dataCriada}</span>
            </td>
            <td style="padding:12px; color:var(--text);">${escHtml(v.cargo)}</td>
            <td style="padding:12px; color:var(--text); font-weight:700;">${escHtml(v.tipo_vaga)}</td>
            <td style="padding:12px; color:#10b981; font-weight:800;">${escHtml(v.remuneracao || 'A combinar')}</td>
            <td style="padding:12px;">
              <span style="background:rgba(16,185,129,0.15); color:${statusColor}; font-size:11.5px; font-weight:800; padding:3px 8px; border-radius:8px;">
                ${statusTxt}
              </span>
            </td>
            <td style="padding:12px; text-align:right;">
              <div style="display:flex; justify-content:flex-end; gap:6px;">
                <a href="${zapLink}" target="_blank" style="padding:6px 10px; font-size:11.5px; border-radius:8px; border:1px solid #22c55e; background:rgba(34,197,94,0.1); color:#22c55e; text-decoration:none; display:inline-flex; align-items:center; gap:4px; font-weight:700;">
                  <i class="ph-bold ph-whatsapp-logo"></i> Compartilhar
                </a>
                ${v.status === 'aberta' ? `
                  <button type="button" onclick="window.encerrarVagaDono(${v.id})" style="padding:6px 10px; font-size:11.5px; border-radius:8px; border:1px solid #ef4444; background:rgba(239,68,68,0.1); color:#ef4444; font-weight:700; cursor:pointer;">
                    Encerrar
                  </button>
                ` : ''}
              </div>
            </td>
          </tr>
        `;
      }).join('');
    } else {
      container.innerHTML = data.vagas.map(v => {
        const dataCriada = v.criado_em ? new Date(v.criado_em).toLocaleDateString('pt-BR') : '-';
        const isAberta = v.status === 'aberta';
        const statusColor = isAberta ? '#10b981' : '#6b7280';
        const statusBg = isAberta ? 'rgba(16,185,129,0.15)' : 'rgba(107,114,128,0.15)';
        const statusTxt = isAberta ? 'Vaga Ativa' : 'Encerrada';

        const zapShareMsg = `🚨 VAGA ABERTA NO RESTAURANTE!\n\n📋 *Cargo:* ${v.cargo}\n📌 *Título:* ${v.titulo}\n💰 *Remuneração:* ${v.remuneracao || 'A combinar'}\n🕒 *Tipo/Turno:* ${v.tipo_vaga || 'A combinar'} - ${v.horario || 'Turno Padrão'}\n\nInteressados entrar em contato pelo WhatsApp!`;
        const zapLink = `https://wa.me/?text=${encodeURIComponent(zapShareMsg)}`;

        return `
          <div style="background:var(--card); border:1px solid var(--border); border-radius:14px; padding:16px; display:flex; flex-direction:column; gap:10px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap;">
              <div>
                <div style="display:flex; align-items:center; gap:8px;">
                  <strong style="font-size:15px; color:var(--text);">${escHtml(v.titulo)}</strong>
                  <span style="background:${statusBg}; color:${statusColor}; font-size:11px; font-weight:800; padding:2px 8px; border-radius:8px;">
                    ${statusTxt}
                  </span>
                </div>
                <div style="font-size:12px; color:var(--text-sub); margin-top:2px;">
                  Cargo: <strong style="color:var(--text);">${escHtml(v.cargo)}</strong> • Publicada em ${dataCriada}
                </div>
              </div>

              <div style="display:flex; align-items:center; gap:8px;">
                <a href="${zapLink}" target="_blank" style="padding:7px 12px; font-size:12px; border-radius:10px; border:1px solid #22c55e; background:rgba(34,197,94,0.12); color:#22c55e; text-decoration:none; display:inline-flex; align-items:center; gap:5px; font-weight:700;">
                  <i class="ph-bold ph-whatsapp-logo" style="font-size:15px;"></i> Divulgar no WhatsApp
                </a>
                ${isAberta ? `
                  <button type="button" onclick="window.encerrarVagaDono(${v.id})" style="padding:7px 12px; font-size:12px; border-radius:10px; border:1px solid #ef4444; background:rgba(239,68,68,0.12); color:#ef4444; font-weight:700; cursor:pointer;">
                    Encerrar Vaga
                  </button>
                ` : ''}
              </div>
            </div>

            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:8px; background:var(--card2); border-radius:10px; padding:10px 12px; font-size:12px;">
              <div>
                <span style="color:var(--text-sub); font-size:11px; display:block;">Tipo de Contrato</span>
                <strong style="color:var(--text);">${escHtml(v.tipo_vaga || 'Freelancer')}</strong>
              </div>
              <div>
                <span style="color:var(--text-sub); font-size:11px; display:block;">Remuneração</span>
                <strong style="color:#10b981; font-size:13px;">${escHtml(v.remuneracao || 'A combinar')}</strong>
              </div>
              <div>
                <span style="color:var(--text-sub); font-size:11px; display:block;">Turno / Horário</span>
                <span style="color:var(--text); font-weight:600;">${escHtml(v.horario || 'Turno da Casa')}</span>
              </div>
              <div>
                <span style="color:var(--text-sub); font-size:11px; display:block;">Candidaturas Recebidas</span>
                <span style="color:#3b82f6; font-weight:700;">${v.total_candidaturas || 0} candidatos</span>
              </div>
            </div>

            ${v.requisitos ? `
              <div style="font-size:12px; color:var(--text-sub); line-height:1.4;">
                <strong>Requisitos:</strong> ${escHtml(v.requisitos)}
              </div>
            ` : ''}
          </div>
        `;
      }).join('');
    }

  } catch (err) {
    if (isTable) {
      container.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:#ef4444;">Erro ao carregar vagas.</td></tr>`;
    } else {
      container.innerHTML = `<div style="text-align:center; padding:20px; color:#ef4444;">Erro ao carregar vagas abertas.</div>`;
    }
  }
};

// 15. Encerrar Vaga
window.encerrarVagaDono = async function(id) {
  if (!confirm('Deseja realmente encerrar esta vaga?')) return;

  try {
    const currentToken = localStorage.getItem('chef_token') || token;
    const res = await fetch(`/api/contratacao/vagas/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    if (data.ok) {
      showToast('Vaga encerrada.', 'ph-check-circle', 'success');
      window.carregarMinhasVagas();
      window.carregarResumoContratacaoSecao();
    } else {
      showToast(data.erro || 'Erro ao encerrar.', 'ph-warning', 'error');
    }
  } catch (err) {
    showToast('Falha na conexão.', 'ph-warning', 'error');
  }
};

// 16. Carregar Escala de Freelancers e Diárias
window.carregarEscalaFreelancers = async function() {
  const container = document.getElementById('tabela-escala-container') || document.getElementById('tabela-escala-freelancers');
  if (!container) return;

  // Se o elemento encontrado for o container da div, certifique-se de que a tabela e o tbody existam
  let tbody = document.getElementById('tabela-escala-freelancers');
  if (!tbody) {
    container.innerHTML = `
      <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:left;">
        <thead>
          <tr style="background:var(--card2); border-bottom:1px solid var(--border); color:var(--text-sub); font-size:11.5px; text-transform:uppercase; letter-spacing:0.5px;">
            <th style="padding:12px;">Profissional &amp; Pix</th>
            <th style="padding:12px;">Cargo</th>
            <th style="padding:12px;">Data</th>
            <th style="padding:12px;">Período</th>
            <th style="padding:12px;">Valor Diária</th>
            <th style="padding:12px;">Status</th>
            <th style="padding:12px; text-align:right;">Ações</th>
          </tr>
        </thead>
        <tbody id="tabela-escala-freelancers">
          <tr>
            <td colspan="7" style="text-align:center; padding:30px; color:var(--text-sub);">
              <i class="ph ph-circle-notch" style="animation:spin 1s infinite linear; font-size:24px; color:#3b82f6;"></i>
              <p style="margin-top:6px; font-size:12.5px;">Carregando escala de diaristas...</p>
            </td>
          </tr>
        </tbody>
      </table>
    `;
    tbody = document.getElementById('tabela-escala-freelancers');
  } else {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding:30px; color:var(--text-sub);">
          <i class="ph ph-circle-notch" style="animation:spin 1s infinite linear; font-size:24px; color:#3b82f6;"></i>
          <p style="margin-top:6px; font-size:12.5px;">Carregando escala de diaristas...</p>
        </td>
      </tr>
    `;
  }

  try {
    const currentToken = localStorage.getItem('chef_token') || token;
    const res = await fetch('/api/contratacao/escala', {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();

    if (!data.escala || data.escala.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; padding:40px; color:var(--text-sub);">
            Nenhum diarista ou freelancer agendado na escala no momento. Vá ao <strong>Banco de Talentos</strong> para escalar garçons, cozinha, limpeza e barman.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = data.escala.map(e => {
      const valorFmt = formatCurrency(e.valor_diaria || 140);
      let statusBadge = '';
      let acaoBtns = '';

      if (e.status === 'agendado') {
        statusBadge = `<span style="background:rgba(59,130,246,0.15); color:#60a5fa; font-size:11.5px; font-weight:800; padding:3px 8px; border-radius:8px;">Agendado</span>`;
        acaoBtns = `
          <button type="button" onclick="window.atualizarStatusEscala(${e.id}, 'presente')" style="padding:6px 10px; font-size:11.5px; border-radius:8px; border:1px solid #10b981; background:rgba(16,185,129,0.12); color:#10b981; font-weight:800; cursor:pointer;">
            ✓ Check-in
          </button>
        `;
      } else if (e.status === 'presente') {
        statusBadge = `<span style="background:rgba(245,158,11,0.15); color:#f59e0b; font-size:11.5px; font-weight:800; padding:3px 8px; border-radius:8px;">Presente</span>`;
        acaoBtns = `
          <button type="button" onclick="window.atualizarStatusEscala(${e.id}, 'concluido')" style="padding:6px 10px; font-size:11.5px; border-radius:8px; border:1px solid #8b5cf6; background:rgba(139,92,246,0.12); color:#a78bfa; font-weight:800; cursor:pointer;">
            Finalizar Turno
          </button>
        `;
      } else if (e.status === 'concluido') {
        statusBadge = `<span style="background:rgba(139,92,246,0.15); color:#a78bfa; font-size:11.5px; font-weight:800; padding:3px 8px; border-radius:8px;">Turno Concluído</span>`;
        acaoBtns = `
          <button type="button" onclick="window.pagarDiariaEscala(${e.id}, '${escHtml(e.nome_talento)}', ${e.valor_diaria || 140}, '${escHtml(e.cargo)}')" class="btn-primary" style="padding:6px 12px; font-size:11.5px; border-radius:8px; background:linear-gradient(135deg, #10b981 0%, #059669 100%);">
            💰 Pagar Diária Pix
          </button>
        `;
      } else if (e.status === 'pago') {
        statusBadge = `<span style="background:rgba(16,185,129,0.2); color:#34d399; font-size:11.5px; font-weight:800; padding:3px 8px; border-radius:8px;">✓ Pago no Caixa</span>`;
        acaoBtns = `<span style="font-size:11px; color:#10b981; font-weight:700;">Lançado na DRE</span>`;
      }

      return `
        <tr style="border-bottom:1px solid var(--border);">
          <td style="padding:12px; font-weight:800; color:var(--text);">
            ${escHtml(e.nome_talento)}
            <span style="font-size:11px; color:var(--text-sub); display:block;">${escHtml(e.chave_pix ? `Pix: ${e.chave_pix}` : 'Pix cadastrado')}</span>
          </td>
          <td style="padding:12px; color:var(--text);">${escHtml(e.cargo)}</td>
          <td style="padding:12px; color:var(--text); font-weight:700;">${escHtml(e.data_turno)}</td>
          <td style="padding:12px; color:var(--text-sub);">${escHtml(e.periodo)}</td>
          <td style="padding:12px; color:#10b981; font-weight:800;">${valorFmt}</td>
          <td style="padding:12px;">${statusBadge}</td>
          <td style="padding:12px; text-align:right;">
            <div style="display:flex; justify-content:flex-end; gap:6px;">
              ${acaoBtns}
            </div>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:#ef4444;">Erro ao carregar escala.</td></tr>`;
  }
};

// 17. Atualizar Status do Turno na Escala
window.atualizarStatusEscala = async function(id, novoStatus) {
  try {
    const currentToken = localStorage.getItem('chef_token') || token;
    const res = await fetch(`/api/contratacao/escala/${id}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({ status: novoStatus })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(`Status atualizado para ${novoStatus}.`, 'ph-check-circle', 'success');
      window.carregarEscalaFreelancers();
      window.carregarResumoContratacaoSecao();
    } else {
      showToast(data.erro || 'Erro ao atualizar status.', 'ph-warning', 'error');
    }
  } catch (err) {
    showToast('Falha na conexão.', 'ph-warning', 'error');
  }
};

// 18. Pagar Diária e Registrar Diretamente no Caixa / DRE
window.pagarDiariaEscala = async function(id, nome, valor, cargo) {
  const valorFmt = formatCurrency(valor);
  const confirmar = confirm(`Deseja efetuar o pagamento da diária de ${valorFmt} para ${nome} (${cargo})?\n\nEste valor será lançado automaticamente como saída no Caixa e na DRE do restaurante.`);
  if (!confirmar) return;

  try {
    const currentToken = localStorage.getItem('chef_token') || token;
    const res = await fetch(`/api/contratacao/escala/${id}/pagar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({ metodo_pagamento: 'PIX' })
    });

    const data = await res.json();
    if (data.ok) {
      showToast(`💵 Diária de ${valorFmt} paga para ${nome}! Registrada no Caixa.`, 'ph-check-circle', 'success');
      window.carregarEscalaFreelancers();
      window.carregarResumoContratacaoSecao();
      carregarMetricas();
    } else {
      showToast(data.erro || 'Erro ao processar pagamento.', 'ph-warning', 'error');
    }
  } catch (err) {
    showToast('Falha na comunicação ao registrar pagamento.', 'ph-warning', 'error');
  }
};

// 19. Calculadora Trabalhista CLT vs Diaristas Freelancers
window.calcularSimuladorCustos = function() {
  const salarioBase = parseFloat(document.getElementById('calc-salario-clt')?.value || document.getElementById('calc-salario-base')?.value) || 2200;
  const diasExtras = parseInt(document.getElementById('calc-dias-extras')?.value, 10) || 12;
  const valorDiaria = parseFloat(document.getElementById('calc-diaria-freela')?.value || document.getElementById('calc-valor-diaria')?.value) || 140;
  const regime = document.getElementById('calc-regime-empresa')?.value || 'simples';

  // Alíquotas patronais
  const inssRate = (regime === 'simples') ? 0.0 : 0.20; // 20% patronal se Lucro Presumido/Real; 0% adicional direto se Simples Nacional
  const fgtsRate = 0.08; // 8% FGTS
  const inssFgtsRate = (regime === 'simples') ? 0.08 : 0.288;
  const decimoFeriasRate = (1 / 12) + (1 / 12) + (1 / 36); // Provisão 13º + Férias + 1/3 (~19.4%)
  const beneficiosFixo = 452.22; // Vale Transporte + Refeição + Exames Ocupacionais

  const custoInss = salarioBase * (regime === 'simples' ? 0 : 0.20);
  const custoFgts = salarioBase * 0.08;
  const custoInssFgts = salarioBase * inssFgtsRate;
  const custoDecimoFerias = salarioBase * decimoFeriasRate;
  const custoTotalClt = salarioBase + custoInss + custoFgts + custoDecimoFerias + beneficiosFixo;

  const custoTotalFreela = diasExtras * valorDiaria;
  const economiaMensal = Math.max(0, custoTotalClt - custoTotalFreela);
  const economiaAnual = economiaMensal * 12;

  // Atualizar DOM
  const elCltTotal = document.getElementById('calc-res-clt-total');
  const elCltBase = document.getElementById('calc-res-clt-base') || document.getElementById('calc-res-clt-salario');
  const elCltInss = document.getElementById('calc-res-clt-inss');
  const elCltFgts = document.getElementById('calc-res-clt-fgts');
  const elCltInssFgts = document.getElementById('calc-res-clt-inss-fgts');
  const elCltDecimo = document.getElementById('calc-res-clt-decimo');
  const elCltBenef = document.getElementById('calc-res-clt-benef');

  const elFreelaTotal = document.getElementById('calc-res-freela-total');
  const elFreelaDias = document.getElementById('calc-res-freela-dias');
  const elEconMensal = document.getElementById('calc-res-economia-mensal');
  const elEconAnual = document.getElementById('calc-res-economia-anual');
  const elRecomendacao = document.getElementById('calc-recomendacao-texto');

  if (elCltTotal) elCltTotal.innerText = formatCurrency(custoTotalClt);
  if (elCltBase) elCltBase.innerText = formatCurrency(salarioBase);
  if (elCltInss) elCltInss.innerText = formatCurrency(custoInss);
  if (elCltFgts) elCltFgts.innerText = formatCurrency(custoFgts);
  if (elCltInssFgts) elCltInssFgts.innerText = formatCurrency(custoInssFgts);
  if (elCltDecimo) elCltDecimo.innerText = formatCurrency(custoDecimoFerias);
  if (elCltBenef) elCltBenef.innerText = formatCurrency(beneficiosFixo);

  if (elFreelaTotal) elFreelaTotal.innerText = formatCurrency(custoTotalFreela);
  if (elFreelaDias) elFreelaDias.innerText = `${diasExtras} dias`;
  if (elEconMensal) elEconMensal.innerText = formatCurrency(economiaMensal);
  if (elEconAnual) elEconAnual.innerText = formatCurrency(economiaAnual);

  if (elRecomendacao) {
    if (diasExtras <= 14) {
      elRecomendacao.innerHTML = `
        <strong>Recomendação do Contador Cheff:</strong> O modelo híbrido é altamente vantajoso! Usando <strong>${diasExtras} dias de freelancers</strong> nos picos de fim de semana (Sexta a Domingo), seu restaurante economiza <strong>${formatCurrency(economiaMensal)}/mês</strong> (${formatCurrency(economiaAnual)}/ano) e elimina custos ociosos em dias parados ou chuvosos.
      `;
    } else {
      elRecomendacao.innerHTML = `
        <strong>Recomendação do Contador Cheff:</strong> Com ${diasExtras} dias por mês, o volume se aproxima de um turno integral contínuo. Avalie contratar 1 profissional CLT ou Contrato Intermitente formalizado para evitar risco de habitualidade trabalhista (Art. 3º CLT).
      `;
    }
  }
};

// Auto-inicializar carregamento da seção de contratação
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (typeof window.carregarResumoContratacaoSecao === 'function') {
      window.carregarResumoContratacaoSecao();
    }
  });
} else {
  setTimeout(() => {
    if (typeof window.carregarResumoContratacaoSecao === 'function') {
      window.carregarResumoContratacaoSecao();
    }
  }, 100);
}


// ══════════════════════════════════════════════════════════════════
// 🌦️ PILAR 5: PREVISÃO METEOROLÓGICA & DEMANDA PREDITIVA
// ══════════════════════════════════════════════════════════════════
window.atualizarPrevisaoClima = async function() {
  const container = document.getElementById('clima-cards-semana');
  const lblCidade = document.getElementById('clima-cidade-label');
  const tituloResumo = document.getElementById('clima-resumo-titulo');
  const alertaResumo = document.getElementById('clima-resumo-alerta');
  if (!container) return;

  try {
    const token = typeof obterTokenAtual === 'function' ? obterTokenAtual() : (localStorage.getItem('token') || '');
    const resp = await fetch('/api/clima-demanda/previsao', {
      headers: token ? { 'Authorization': 'Bearer ' + token } : {}
    });
    const data = await resp.json();
    if (!data || !data.dias) return;

    if (lblCidade) lblCidade.innerText = "📍 " + (data.cidade || 'São Paulo');
    if (data.resumo_executivo) {
      if (tituloResumo) tituloResumo.innerText = "Hoje (" + data.resumo_executivo.hoje + "): " + data.resumo_executivo.clima_hoje + " (" + data.resumo_executivo.temp_hoje + ")";
      if (alertaResumo) alertaResumo.innerText = "💡 Dica Operacional: " + data.resumo_executivo.alerta_principal;
    }

    container.innerHTML = data.dias.map(d => {
      const isHoje = d.eh_hoje;
      const borderHoje = isHoje ? 'border: 2px solid #0ea5e9; box-shadow: 0 4px 14px rgba(14,165,233,0.2);' : 'border: 1px solid var(--border);';
      const badgeHoje = isHoje ? '<span style="background:#0ea5e9; color:white; font-size:10px; padding:1px 6px; border-radius:10px; font-weight:800; margin-left:4px;">HOJE</span>' : '';
      
      const chipsHtml = (d.impactos || []).slice(0, 2).map(imp => {
        const cor = imp.impacto_pct > 0 ? '#10b981' : '#ef4444';
        const sinal = imp.impacto_pct > 0 ? '+' : '';
        return '<div style="font-size:10.5px; background:rgba(0,0,0,0.04); padding:3px 6px; border-radius:6px; margin-top:4px; font-weight:700; color:var(--text); display:flex; justify-content:space-between;">' +
          '<span>' + imp.categoria + '</span>' +
          '<span style="color:' + cor + ';">' + sinal + imp.impacto_pct + '%</span>' +
        '</div>';
      }).join('');

      return '<div style="background:var(--card2); border-radius:14px; padding:12px; ' + borderHoje + ' display:flex; flex-direction:column; justify-content:space-between;">' +
        '<div>' +
          '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">' +
            '<strong style="font-size:12px; color:var(--text);">' + d.dia_semana.split('-')[0] + badgeHoje + '</strong>' +
            '<span style="font-size:11px; color:var(--text-sub);">' + d.dia_mes + '</span>' +
          '</div>' +
          '<div style="display:flex; align-items:center; gap:8px; margin:8px 0;">' +
            '<i class="ph-bold ' + d.icone + '" style="font-size:24px; color:' + d.cor_tema + ';"></i>' +
            '<div>' +
              '<div style="font-size:13px; font-weight:800; color:var(--text);">' + d.temp_min + '°C ~ ' + d.temp_max + '°C</div>' +
              '<div style="font-size:10.5px; color:var(--text-sub);">' + d.condicao + '</div>' +
            '</div>' +
          '</div>' +
          (d.chuva_mm > 0 ? '<div style="font-size:10.5px; color:#2563eb; font-weight:700; margin-bottom:4px;"><i class="ph-bold ph-drop"></i> ' + d.chuva_mm + 'mm (' + d.probabilidade_chuva_pct + '%)</div>' : '') +
        '</div>' +
        '<div>' + chipsHtml + '</div>' +
      '</div>';
    }).join('');

  } catch (err) {
    console.warn('[ClimaDemanda] Erro ao carregar previsão:', err);
  }
};

// ══════════════════════════════════════════════════════════════════
// 📅 PILAR 5: CONCIERGE & GESTÃO DE RESERVAS DE MESAS
// ══════════════════════════════════════════════════════════════════
window.carregarReservasDono = async function() {
  const inputData = document.getElementById('filtro-data-reserva');
  const container = document.getElementById('tabela-reservas-container');
  if (!container) return;

  const dataFiltro = (inputData && inputData.value) || new Date().toISOString().slice(0, 10);
  if (inputData && !inputData.value) inputData.value = dataFiltro;

  try {
    const token = typeof obterTokenAtual === 'function' ? obterTokenAtual() : (localStorage.getItem('token') || '');
    const headers = token ? { 'Authorization': 'Bearer ' + token } : {};

    const [respList, respDisp] = await Promise.all([
      fetch('/api/reservas?data=' + dataFiltro, { headers }),
      fetch('/api/reservas/disponibilidade?data=' + dataFiltro, { headers })
    ]);

    const lista = await respList.json();
    const disp = await respDisp.json();

    if (disp) {
      const elAlmoco = document.getElementById('reservas-capacidade-almoco');
      const barAlmoco = document.getElementById('bar-capacidade-almoco');
      if (elAlmoco && disp.almoco) {
        elAlmoco.innerText = disp.almoco.reservadas + ' / ' + disp.almoco.capacidade_max + ' pessoas (' + disp.almoco.vagas_restantes + ' vagas)';
        const pctA = Math.min(100, Math.round((disp.almoco.reservadas / (disp.almoco.capacidade_max || 1)) * 100));
        if (barAlmoco) barAlmoco.style.width = pctA + '%';
      }

      const elJantar = document.getElementById('reservas-capacidade-jantar');
      const barJantar = document.getElementById('bar-capacidade-jantar');
      if (elJantar && disp.jantar) {
        elJantar.innerText = disp.jantar.reservadas + ' / ' + disp.jantar.capacidade_max + ' pessoas (' + disp.jantar.vagas_restantes + ' vagas)';
        const pctJ = Math.min(100, Math.round((disp.jantar.reservadas / (disp.jantar.capacidade_max || 1)) * 100));
        if (barJantar) barJantar.style.width = pctJ + '%';
      }
    }

    if (!lista || lista.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:30px; background:var(--card2); border-radius:14px; border:1px dashed var(--border);">' +
        '<i class="ph ph-calendar-x" style="font-size:32px; color:var(--text-sub);"></i>' +
        '<p style="margin:8px 0 0 0; font-size:13.5px; color:var(--text-sub);">Nenhuma reserva cadastrada para ' + dataFiltro + '.</p>' +
      '</div>';
      return;
    }

    let rowsHtml = lista.map(r => {
      const whatsLimpo = String(r.telefone || '').replace(/\D/g, '');
      const linkWhats = whatsLimpo ? 'https://wa.me/55' + whatsLimpo + '?text=' + encodeURIComponent('Olá ' + r.nome_cliente + '! Confirmamos sua reserva no Cheff.pro para ' + r.num_pessoas + ' pessoas hoje às ' + r.hora_reserva + '.') : '#';
      
      let badgeCor = '#f59e0b';
      if (r.status === 'Confirmada') badgeCor = '#10b981';
      if (r.status === 'Acomodada') badgeCor = '#3b82f6';
      if (r.status === 'Cancelada') badgeCor = '#ef4444';

      return '<tr style="border-bottom:1px solid var(--border);">' +
        '<td style="padding:10px 12px; font-weight:700; color:var(--text);">' + escHtml(r.hora_reserva) + '</td>' +
        '<td style="padding:10px 12px;">' +
          '<div style="font-weight:800; color:var(--text);">' + escHtml(r.nome_cliente) + '</div>' +
          '<a href="' + linkWhats + '" target="_blank" style="font-size:11.5px; color:#10b981; text-decoration:none; display:inline-flex; align-items:center; gap:4px;">' +
            '<i class="ph-bold ph-whatsapp-logo"></i> ' + escHtml(r.telefone) +
          '</a>' +
        '</td>' +
        '<td style="padding:10px 12px; font-weight:700;">👥 ' + r.num_pessoas + ' pes.</td>' +
        '<td style="padding:10px 12px;">' + escHtml(r.turno || 'Jantar') + '</td>' +
        '<td style="padding:10px 12px; font-weight:700; color:var(--primary);">' + (r.mesa_designada ? escHtml(r.mesa_designada) : '<span style="color:var(--text-sub);">A definir</span>') + '</td>' +
        '<td style="padding:10px 12px;">' +
          '<span style="background:' + badgeCor + '22; color:' + badgeCor + '; border:1px solid ' + badgeCor + '55; padding:3px 8px; border-radius:8px; font-size:11px; font-weight:800;">' +
            escHtml(r.status) +
          '</span>' +
        '</td>' +
        '<td style="padding:10px 12px; text-align:right;">' +
          '<button onclick="window.alterarStatusReserva(' + r.id + ', \'Acomodada\')" class="btn-secondary" style="padding:4px 8px; font-size:11px; border-radius:6px; cursor:pointer;" title="Cliente chegou e sentou na mesa">Acomodar</button> ' +
          '<button onclick="window.alterarStatusReserva(' + r.id + ', \'Cancelada\')" class="btn-secondary" style="padding:4px 8px; font-size:11px; border-radius:6px; color:#ef4444; cursor:pointer;" title="Cancelar reserva">Cancelar</button>' +
        '</td>' +
      '</tr>';
    }).join('');

    container.innerHTML = '<table style="width:100%; border-collapse:collapse; font-size:12.5px; text-align:left;">' +
      '<thead>' +
        '<tr style="border-bottom:1.5px solid var(--border); color:var(--text-sub); font-size:11.5px;">' +
          '<th style="padding:8px 12px;">Horário</th>' +
          '<th style="padding:8px 12px;">Cliente & WhatsApp</th>' +
          '<th style="padding:8px 12px;">Pessoas</th>' +
          '<th style="padding:8px 12px;">Turno</th>' +
          '<th style="padding:8px 12px;">Mesa</th>' +
          '<th style="padding:8px 12px;">Status</th>' +
          '<th style="padding:8px 12px; text-align:right;">Ações</th>' +
        '</tr>' +
      '</thead>' +
      '<tbody>' + rowsHtml + '</tbody>' +
    '</table>';

  } catch(e) {
    console.warn('[Reservas] Erro ao carregar:', e);
  }
};

window.alterarStatusReserva = async function(id, status) {
  try {
    const token = typeof obterTokenAtual === 'function' ? obterTokenAtual() : (localStorage.getItem('token') || '');
    await fetch('/api/reservas/' + id + '/status', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? 'Bearer ' + token : ''
      },
      body: JSON.stringify({ status })
    });
    window.carregarReservasDono();
  } catch(e) {}
};

window.abrirModalCriarReserva = function() {
  const nome = prompt('Nome do Cliente:');
  if (!nome) return;
  const tel = prompt('WhatsApp do Cliente (DDD + Número):');
  if (!tel) return;
  const data = prompt('Data da Reserva (AAAA-MM-DD):', new Date().toISOString().slice(0, 10));
  if (!data) return;
  const hora = prompt('Horário da Reserva (HH:MM):', '20:00');
  if (!hora) return;
  const pessoas = parseInt(prompt('Número de Pessoas:', '2')) || 2;
  const mesa = prompt('Mesa pré-designada (opcional, ex: Mesa 04):', '');

  fetch('/api/reservas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nome_cliente: nome,
      telefone: tel,
      data_reserva: data,
      hora_reserva: hora,
      num_pessoas: pessoas,
      mesa_designada: mesa
    })
  }).then(r => r.json()).then(res => {
    if (res.sucesso) {
      alert('✅ Reserva criada e confirmada!');
      window.carregarReservasDono();
    } else {
      alert('Erro: ' + (res.error || 'Falha ao criar reserva'));
    }
  }).catch(() => alert('Erro de conexão ao criar reserva.'));
};

// ══════════════════════════════════════════════════════════════════
// 💎 PILAR 4: FIDELIDADE VIP & CASHBACK AUTOMATIZADO
// ══════════════════════════════════════════════════════════════════
window.carregarMetricasCashback = async function() {
  const elClientes = document.getElementById('cb-total-clientes');
  const elGerado = document.getElementById('cb-total-gerado');
  const elResgatado = document.getElementById('cb-total-resgatado');
  const elCirculante = document.getElementById('cb-saldo-circulante');
  if (!elClientes) return;

  try {
    const token = typeof obterTokenAtual === 'function' ? obterTokenAtual() : (localStorage.getItem('token') || '');
    const resp = await fetch('/api/cashback/resumo', {
      headers: token ? { 'Authorization': 'Bearer ' + token } : {}
    });
    const data = await resp.json();
    if (!data) return;

    if (elClientes) elClientes.innerText = data.total_clientes_vip || 0;
    if (elGerado) elGerado.innerText = formatCurrency(data.total_gerado || 0);
    if (elResgatado) elResgatado.innerText = formatCurrency(data.total_resgatado || 0);
    if (elCirculante) elCirculante.innerText = formatCurrency(data.saldo_circulante || 0);
  } catch(e) {
    console.warn('[Cashback] Erro ao carregar métricas:', e);
  }
};

window.abrirModalConfigCashback = async function() {
  try {
    const resp = await fetch('/api/cashback/config');
    const cfg = await resp.json();
    const pctAtual = (cfg && cfg.percentual) || 5;
    const diasAtual = (cfg && cfg.validade_dias) || 30;

    const novoPct = prompt('Percentual de Cashback creditado aos clientes (%):', pctAtual);
    if (novoPct === null) return;
    const novosDias = prompt('Dias de validade do crédito antes de expirar:', diasAtual);
    if (novosDias === null) return;

    const token = typeof obterTokenAtual === 'function' ? obterTokenAtual() : (localStorage.getItem('token') || '');
    const saveResp = await fetch('/api/cashback/config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? 'Bearer ' + token : ''
      },
      body: JSON.stringify({
        ativo: 1,
        percentual: parseFloat(novoPct) || 5,
        validade_dias: parseInt(novosDias) || 30
      })
    });
    const resJson = await saveResp.json();
    if (resJson.sucesso) {
      alert('✅ Configurações de Cashback VIP salvas com sucesso!');
      window.carregarMetricasCashback();
    }
  } catch(e) {
    alert('Erro ao salvar configurações de cashback.');
  }
};

// Auto-inicializar Clima, Reservas e Cashback ao carregar a página
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (typeof window.atualizarPrevisaoClima === 'function') window.atualizarPrevisaoClima();
    if (typeof window.carregarReservasDono === 'function') window.carregarReservasDono();
    if (typeof window.carregarMetricasCashback === 'function') window.carregarMetricasCashback();
    if (typeof window.carregarTerminaisPendentesDono === 'function') window.carregarTerminaisPendentesDono();
  });
} else {
  setTimeout(() => {
    if (typeof window.atualizarPrevisaoClima === 'function') window.atualizarPrevisaoClima();
    if (typeof window.carregarReservasDono === 'function') window.carregarReservasDono();
    if (typeof window.carregarMetricasCashback === 'function') window.carregarMetricasCashback();
    if (typeof window.carregarTerminaisPendentesDono === 'function') window.carregarTerminaisPendentesDono();
  }, 200);
}

/* =========================================================================
   SISTEMA DE LIBERAÇÃO REMOTA DE TERMINAIS (ZERO SENHA PARA COLABORADORES)
   Permite que o dono autorize estações sem compartilhar e-mail e senha.
   ========================================================================= */

function obterTokenDono() {
  return localStorage.getItem('chef_token') || (typeof token !== 'undefined' ? token : '');
}

function labelEstacaoTerminal(estacao) {
  const map = {
    'garcom': '🍽️ Salão & Garçom',
    'caixa': '🖥️ Caixa PDV Principal',
    'caixa_mobile': '📱 Caixa Mobile Touch',
    'cozinha': '🍳 KDS Cozinha & Bar',
    'totem': '🤖 Totem Autoatendimento'
  };
  return map[estacao] || estacao || 'Geral';
}

window.abrirModalLiberarTerminalDono = function(tabInicial = 'codigo') {
  const modal = document.getElementById('modal-liberar-terminal-dono');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.style.display = 'flex';
  window.alternarTabModalTerminal(tabInicial);
  if (tabInicial === 'codigo') {
    setTimeout(() => {
      const inp = document.getElementById('modal-input-codigo-pareamento');
      if (inp) inp.focus();
    }, 150);
  }
};

window.fecharModalLiberarTerminalDono = function() {
  const modal = document.getElementById('modal-liberar-terminal-dono');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.style.display = 'none';
};

window.alternarTabModalTerminal = function(tab) {
  const tabs = ['codigo', 'pendentes', 'whatsapp', 'autorizados'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tab-btn-modal-${t}`);
    const content = document.getElementById(`modal-tab-content-${t}`);
    if (btn) {
      if (t === tab) {
        btn.classList.add('active');
        btn.style.borderBottom = '2px solid #2563eb';
        btn.style.color = '#2563eb';
      } else {
        btn.classList.remove('active');
        btn.style.borderBottom = '2px solid transparent';
        btn.style.color = 'var(--text-sub)';
      }
    }
    if (content) {
      content.style.display = (t === tab) ? 'block' : 'none';
    }
  });

  if (tab === 'pendentes') {
    window.carregarTerminaisPendentesDono();
  } else if (tab === 'autorizados') {
    window.carregarTerminaisAutorizadosDono();
  }
};

// Autorizar código direto da seção de equipe no painel
window.autorizarTerminalPorCodigoDono = async function() {
  const inpCodigo = document.getElementById('dono-input-codigo-pareamento');
  const selEstacao = document.getElementById('dono-select-estacao-pareamento');
  const inpApelido = document.getElementById('dono-input-apelido-pareamento');

  const codigo = (inpCodigo?.value || '').replace(/\D/g, '').trim();
  const estacao = selEstacao?.value || 'garcom';
  const apelido = inpApelido?.value?.trim() || '';

  if (codigo.length !== 6) {
    if (typeof showToast === 'function') showToast('⚠️ Digite o código de 6 dígitos exibido no aparelho.', 'ph-warning', 'error');
    else alert('Digite o código de 6 dígitos exibido no aparelho.');
    if (inpCodigo) inpCodigo.focus();
    return;
  }

  try {
    const resp = await fetch('/api/terminais/autorizar-codigo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + obterTokenDono()
      },
      body: JSON.stringify({ codigo, estacao, apelido })
    });
    const dados = await resp.json();

    if (resp.ok && dados.sucesso) {
      if (typeof showToast === 'function') {
        showToast(`🎉 Aparelho liberado com sucesso para ${labelEstacaoTerminal(estacao)}!`, 'ph-check-circle', 'success');
      } else {
        alert('Aparelho liberado com sucesso!');
      }
      if (inpCodigo) inpCodigo.value = '';
      if (inpApelido) inpApelido.value = '';
      window.carregarTerminaisPendentesDono();
    } else {
      const msg = dados.erro || 'Não foi possível autorizar o código. Verifique se expirou.';
      if (typeof showToast === 'function') showToast(`❌ ${msg}`, 'ph-warning', 'error');
      else alert(msg);
    }
  } catch(e) {
    console.error('Erro ao autorizar terminal por código:', e);
    if (typeof showToast === 'function') showToast('Erro de comunicação ao autorizar aparelho.', 'ph-warning', 'error');
    else alert('Erro ao autorizar aparelho.');
  }
};

// Autorizar código a partir do modal
window.autorizarTerminalPorCodigoDonoModal = async function() {
  const inpCodigo = document.getElementById('modal-input-codigo-pareamento');
  const selEstacao = document.getElementById('modal-select-estacao-pareamento');
  const inpApelido = document.getElementById('modal-input-apelido-pareamento');

  const codigo = (inpCodigo?.value || '').replace(/\D/g, '').trim();
  const estacao = selEstacao?.value || 'garcom';
  const apelido = inpApelido?.value?.trim() || '';

  if (codigo.length !== 6) {
    if (typeof showToast === 'function') showToast('⚠️ Digite o código de 6 dígitos exibido no aparelho.', 'ph-warning', 'error');
    else alert('Digite o código de 6 dígitos exibido no aparelho.');
    if (inpCodigo) inpCodigo.focus();
    return;
  }

  try {
    const resp = await fetch('/api/terminais/autorizar-codigo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + obterTokenDono()
      },
      body: JSON.stringify({ codigo, estacao, apelido })
    });
    const dados = await resp.json();

    if (resp.ok && dados.sucesso) {
      if (typeof showToast === 'function') {
        showToast(`🎉 Aparelho liberado para ${labelEstacaoTerminal(estacao)}!`, 'ph-check-circle', 'success');
      } else {
        alert('Aparelho liberado com sucesso!');
      }
      if (inpCodigo) inpCodigo.value = '';
      if (inpApelido) inpApelido.value = '';
      window.alternarTabModalTerminal('autorizados');
      window.carregarTerminaisPendentesDono();
    } else {
      const msg = dados.erro || 'Não foi possível autorizar o código.';
      if (typeof showToast === 'function') showToast(`❌ ${msg}`, 'ph-warning', 'error');
      else alert(msg);
    }
  } catch(e) {
    console.error('Erro no modal ao autorizar terminal:', e);
    if (typeof showToast === 'function') showToast('Erro de conexão ao autorizar aparelho.', 'ph-warning', 'error');
    else alert('Erro ao autorizar aparelho.');
  }
};

// Carregar lista de terminais pendentes de autorização
window.carregarTerminaisPendentesDono = async function() {
  try {
    const resp = await fetch('/api/terminais/pendentes', {
      headers: { 'Authorization': 'Bearer ' + obterTokenDono() }
    });
    if (!resp.ok) return;
    const dados = await resp.json();
    const pendentes = dados.pendentes || [];
    const total = pendentes.length;

    // Atualiza contadores
    const countCard = document.getElementById('dono-count-terminais-pendentes');
    if (countCard) countCard.innerText = total;

    const countModal = document.getElementById('modal-dono-count-pendentes');
    if (countModal) countModal.innerText = total;

    const badgeHeader = document.getElementById('badge-pendentes-header');
    if (badgeHeader) {
      badgeHeader.innerText = total;
      badgeHeader.style.display = total > 0 ? 'inline-flex' : 'none';
    }

    // Atualiza container da seção
    const boxCard = document.getElementById('dono-box-terminais-pendentes');
    const listaCard = document.getElementById('dono-lista-terminais-pendentes');
    if (boxCard) boxCard.style.display = total > 0 ? 'block' : 'none';

    if (listaCard) {
      if (total === 0) {
        listaCard.innerHTML = '<div style="font-size:12px; color:var(--text-sub);">Nenhum aparelho aguardando.</div>';
      } else {
        listaCard.innerHTML = pendentes.map(p => `
          <div style="background:var(--card); border:1px solid rgba(245,158,11,0.3); border-radius:12px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size:20px; font-weight:900; font-family:monospace; color:#2563eb; background:rgba(37,99,235,0.1); padding:4px 10px; border-radius:8px; letter-spacing:2px;">
                ${escHtml(p.codigo.slice(0,3))} ${escHtml(p.codigo.slice(3))}
              </span>
              <div>
                <strong style="font-size:13px; color:var(--text); display:block;">${escHtml(p.apelido || labelEstacaoTerminal(p.estacaoSolicitada))}</strong>
                <span style="font-size:11px; color:var(--text-sub);">${escHtml(p.dispositivoInfo || 'Aparelho na Rede')} • Solicitado há poucos instantes</span>
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <select id="sel-pendente-${p.codigo}" style="padding:6px 8px; border-radius:8px; border:1px solid var(--border); background:var(--card2); color:var(--text); font-size:12px; font-weight:700;">
                <option value="garcom" ${p.estacaoSolicitada === 'garcom' ? 'selected' : ''}>🍽️ Salão</option>
                <option value="caixa" ${p.estacaoSolicitada === 'caixa' ? 'selected' : ''}>🖥️ Caixa</option>
                <option value="caixa_mobile" ${p.estacaoSolicitada === 'caixa_mobile' ? 'selected' : ''}>📱 Caixa Mobile</option>
                <option value="cozinha" ${p.estacaoSolicitada === 'cozinha' ? 'selected' : ''}>🍳 Cozinha</option>
                <option value="totem" ${p.estacaoSolicitada === 'totem' ? 'selected' : ''}>🤖 Totem</option>
              </select>
              <button type="button" class="btn-primary" onclick="aprovarTerminalPendenteDono('${p.codigo}')" style="padding:6px 14px; font-size:12px; border-radius:8px; background:linear-gradient(135deg, #10b981, #059669); gap:4px;">
                <i class="ph-bold ph-check"></i> Liberar Acesso
              </button>
            </div>
          </div>
        `).join('');
      }
    }

    // Atualiza container do modal
    const listaModal = document.getElementById('modal-lista-terminais-pendentes');
    if (listaModal) {
      if (total === 0) {
        listaModal.innerHTML = `
          <div style="text-align:center; padding:32px 16px; color:var(--text-sub);">
            <i class="ph-bold ph-check-circle" style="font-size:32px; color:#10b981; margin-bottom:8px; display:block;"></i>
            Nenhum aparelho aguardando aprovação no momento.
          </div>
        `;
      } else {
        listaModal.innerHTML = pendentes.map(p => `
          <div style="background:var(--card2); border:1.5px solid rgba(245,158,11,0.4); border-radius:14px; padding:14px 16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <div style="display:flex; align-items:center; gap:12px;">
              <span style="font-size:22px; font-weight:900; font-family:monospace; color:#2563eb; background:rgba(37,99,235,0.12); padding:6px 12px; border-radius:10px; letter-spacing:3px;">
                ${escHtml(p.codigo.slice(0,3))} ${escHtml(p.codigo.slice(3))}
              </span>
              <div>
                <strong style="font-size:14px; color:var(--text); display:block;">${escHtml(p.apelido || labelEstacaoTerminal(p.estacaoSolicitada))}</strong>
                <span style="font-size:11.5px; color:var(--text-sub);">${escHtml(p.dispositivoInfo || 'Dispositivo Solicitante')}</span>
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <select id="modal-sel-pendente-${p.codigo}" style="padding:8px 10px; border-radius:8px; border:1px solid var(--border); background:var(--card); color:var(--text); font-size:12px; font-weight:700;">
                <option value="garcom" ${p.estacaoSolicitada === 'garcom' ? 'selected' : ''}>🍽️ Salão & Garçom</option>
                <option value="caixa" ${p.estacaoSolicitada === 'caixa' ? 'selected' : ''}>🖥️ Caixa PDV Principal</option>
                <option value="caixa_mobile" ${p.estacaoSolicitada === 'caixa_mobile' ? 'selected' : ''}>📱 Caixa Mobile Touch</option>
                <option value="cozinha" ${p.estacaoSolicitada === 'cozinha' ? 'selected' : ''}>🍳 KDS Cozinha & Bar</option>
                <option value="totem" ${p.estacaoSolicitada === 'totem' ? 'selected' : ''}>🤖 Totem Autoatendimento</option>
              </select>
              <button type="button" class="btn-primary" onclick="aprovarTerminalPendenteDono('${p.codigo}', true)" style="padding:8px 16px; font-size:13px; font-weight:800; border-radius:8px; background:linear-gradient(135deg, #10b981, #059669); gap:6px;">
                <i class="ph-bold ph-check"></i> Liberar Agora
              </button>
            </div>
          </div>
        `).join('');
      }
    }
  } catch(e) {
    console.error('Erro ao carregar terminais pendentes:', e);
  }
};

// Aprovar terminal pendente com 1 clique
window.aprovarTerminalPendenteDono = async function(codigo, isModal = false) {
  const selId = isModal ? `modal-sel-pendente-${codigo}` : `sel-pendente-${codigo}`;
  const selEl = document.getElementById(selId);
  const estacao = selEl?.value || 'garcom';

  try {
    const resp = await fetch('/api/terminais/autorizar-codigo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + obterTokenDono()
      },
      body: JSON.stringify({ codigo, estacao })
    });
    const dados = await resp.json();

    if (resp.ok && dados.sucesso) {
      if (typeof showToast === 'function') {
        showToast(`🎉 Aparelho liberado com sucesso para ${labelEstacaoTerminal(estacao)}!`, 'ph-check-circle', 'success');
      } else {
        alert('Aparelho liberado com sucesso!');
      }
      window.carregarTerminaisPendentesDono();
      if (isModal) window.alternarTabModalTerminal('autorizados');
    } else {
      const msg = dados.erro || 'Não foi possível autorizar o terminal.';
      if (typeof showToast === 'function') showToast(`❌ ${msg}`, 'ph-warning', 'error');
      else alert(msg);
    }
  } catch(e) {
    console.error('Erro ao aprovar terminal pendente:', e);
    if (typeof showToast === 'function') showToast('Erro de conexão ao liberar terminal.', 'ph-warning', 'error');
  }
};

// Gerar link assinado de WhatsApp para a equipe
window.gerarLinkWhatsAppEquipeDono = async function() {
  const selEstacao = document.getElementById('modal-whatsapp-select-estacao');
  const inpApelido = document.getElementById('modal-whatsapp-apelido');

  const estacao = selEstacao?.value || 'garcom';
  const apelido = inpApelido?.value?.trim() || `Equipe ${labelEstacaoTerminal(estacao)}`;

  try {
    const resp = await fetch('/api/terminais/gerar-link-whatsapp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + obterTokenDono()
      },
      body: JSON.stringify({ estacao, apelido, expiraEmHoras: 0.5 })
    });
    const dados = await resp.json();

    if (resp.ok && dados.sucesso && dados.linkAcesso) {
      const box = document.getElementById('modal-whatsapp-link-box');
      const inpPreview = document.getElementById('modal-whatsapp-link-preview');
      const btnWhats = document.getElementById('modal-whatsapp-link-send-btn');

      if (inpPreview) inpPreview.value = dados.linkAcesso;
      if (box) box.style.display = 'block';

      if (btnWhats) {
        const msgWhats = encodeURIComponent(`Olá! Aqui está o link de liberação segura da sua estação de trabalho (${labelEstacaoTerminal(estacao)}). Basta clicar nele no aparelho para acessar sem precisar de senha:\n\n${dados.linkAcesso}\n\n(Válido por 30 minutos)`);
        btnWhats.href = `https://api.whatsapp.com/send?text=${msgWhats}`;
      }

      if (typeof showToast === 'function') showToast('🔗 Link mágico gerado com sucesso!', 'ph-check-circle', 'success');
    } else {
      const msg = dados.erro || 'Erro ao gerar link de WhatsApp.';
      if (typeof showToast === 'function') showToast(`❌ ${msg}`, 'ph-warning', 'error');
      else alert(msg);
    }
  } catch(e) {
    console.error('Erro ao gerar link WhatsApp:', e);
    if (typeof showToast === 'function') showToast('Erro de conexão ao gerar link.', 'ph-warning', 'error');
  }
};

// Copiar link de WhatsApp para clipboard
window.copiarLinkWhatsAppDono = function() {
  const inpPreview = document.getElementById('modal-whatsapp-link-preview');
  if (!inpPreview || !inpPreview.value) return;

  navigator.clipboard.writeText(inpPreview.value).then(() => {
    if (typeof showToast === 'function') showToast('📋 Link copiado para a área de transferência!', 'ph-copy', 'success');
    else alert('Link copiado!');
  }).catch(() => {
    inpPreview.select();
    document.execCommand('copy');
    if (typeof showToast === 'function') showToast('📋 Link copiado!', 'ph-copy', 'success');
  });
};

// Carregar aparelhos autorizados e ativos (com Kill Switch)
window.carregarTerminaisAutorizadosDono = async function() {
  const container = document.getElementById('modal-lista-terminais-autorizados');
  if (!container) return;

  try {
    const resp = await fetch('/api/terminais/autorizados', {
      headers: { 'Authorization': 'Bearer ' + obterTokenDono() }
    });
    if (!resp.ok) {
      container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-sub);">Não foi possível carregar os aparelhos.</div>';
      return;
    }
    const dados = await resp.json();
    const dispositivos = dados.dispositivos || [];

    if (dispositivos.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:32px 16px; color:var(--text-sub);">
          <i class="ph-bold ph-devices" style="font-size:32px; color:var(--text-sub); margin-bottom:8px; display:block;"></i>
          Nenhum aparelho ativo registrado ainda. Libere o primeiro aparelho via código de 6 dígitos!
        </div>
      `;
      return;
    }

    container.innerHTML = dispositivos.map(d => {
      const dataCriacao = d.criado_em ? new Date(d.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Recente';
      const dataUso = d.ultimo_uso ? new Date(d.ultimo_uso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Nunca';
      const ehAtivo = d.ativo !== 0;

      return `
        <div style="background:var(--card2); border:1px solid var(--border); border-radius:14px; padding:14px 16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:42px; height:42px; border-radius:12px; background:${ehAtivo ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)'}; color:${ehAtivo ? '#10b981' : '#ef4444'}; display:flex; align-items:center; justify-content:center; font-size:22px; flex-shrink:0;">
              <i class="ph-bold ${ehAtivo ? 'ph-device-tablet' : 'ph-device-tablet-slash'}"></i>
            </div>
            <div>
              <div style="display:flex; align-items:center; gap:8px;">
                <strong style="font-size:14px; color:var(--text);">${escHtml(d.nome_dispositivo || 'Aparelho')}</strong>
                <span style="background:${ehAtivo ? '#10b981' : '#64748b'}; color:white; font-size:10px; font-weight:800; padding:2px 6px; border-radius:6px;">
                  ${labelEstacaoTerminal(d.estacao_autorizada)}
                </span>
                ${!ehAtivo ? '<span style="background:#ef4444; color:white; font-size:10px; font-weight:800; padding:2px 6px; border-radius:6px;">REVOGADO</span>' : ''}
              </div>
              <div style="font-size:11.5px; color:var(--text-sub); margin-top:3px;">
                Autorizado em: <strong>${dataCriacao}</strong> • Último acesso: <strong>${dataUso}</strong> • IP: ${escHtml(d.ip_criacao || 'N/A')}
              </div>
            </div>
          </div>
          <div>
            ${ehAtivo ? `
              <button type="button" onclick="revogarAcessoTerminalDono('${d.terminal_id}', '${escHtml(d.nome_dispositivo)}')" style="padding:7px 12px; font-size:12px; font-weight:700; border-radius:8px; background:rgba(239,68,68,0.12); color:#ef4444; border:1px solid rgba(239,68,68,0.3); cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                <i class="ph-bold ph-power"></i> Desconectar Remotamente
              </button>
            ` : `
              <span style="font-size:12px; color:var(--text-sub); font-style:italic;">Acesso Bloqueado</span>
            `}
          </div>
        </div>
      `;
    }).join('');

  } catch(e) {
    console.error('Erro ao listar aparelhos autorizados:', e);
    container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-sub);">Erro ao carregar dispositivos.</div>';
  }
};

// Revogar acesso e desconectar terminal remotamente (Kill Switch)
window.revogarAcessoTerminalDono = async function(terminalId, nome) {
  if (!confirm(`Deseja realmente desconectar e revogar o acesso do aparelho "${nome}"?\n\nO aparelho perderá o acesso imediatamente.`)) {
    return;
  }

  try {
    const resp = await fetch('/api/terminais/revogar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + obterTokenDono()
      },
      body: JSON.stringify({ terminalId })
    });
    const dados = await resp.json();

    if (resp.ok && dados.sucesso) {
      if (typeof showToast === 'function') {
        showToast(`🔒 Aparelho "${nome}" desconectado com sucesso!`, 'ph-shield-check', 'success');
      } else {
        alert('Aparelho desconectado com sucesso!');
      }
      window.carregarTerminaisAutorizadosDono();
    } else {
      const msg = dados.erro || 'Erro ao revogar acesso do terminal.';
      if (typeof showToast === 'function') showToast(`❌ ${msg}`, 'ph-warning', 'error');
      else alert(msg);
    }
  } catch(e) {
    console.error('Erro ao revogar terminal:', e);
    if (typeof showToast === 'function') showToast('Erro de conexão ao revogar aparelho.', 'ph-warning', 'error');
  }
};

// Listeners em tempo real via Socket.IO
if (typeof socket !== 'undefined' && socket && typeof socket.on === 'function') {
  socket.on('novo_terminal_pendente', (data) => {
    if (typeof window.carregarTerminaisPendentesDono === 'function') {
      window.carregarTerminaisPendentesDono();
    }
    // Efeito sonoro discreto de notificação
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      }
    } catch(e) {}

    if (typeof showToast === 'function') {
      showToast(`📱 Novo aparelho aguardando liberação (Código: ${data?.codigo || ''})`, 'ph-broadcast', 'info');
    }
  });

  socket.on('terminal_pareamento_concluido', (data) => {
    if (typeof window.carregarTerminaisPendentesDono === 'function') {
      window.carregarTerminaisPendentesDono();
    }
    if (typeof showToast === 'function') {
      showToast(`✅ Aparelho "${data?.apelido || 'Terminal'}" liberado para ${labelEstacaoTerminal(data?.estacao)}!`, 'ph-check-circle', 'success');
    }
  });
}



// ══════════════════════════════════════════════════════════════════
// LOJA DE ADD-ONS & GOVERNANÇA DE PLANO NO PAINEL DO DONO
// ══════════════════════════════════════════════════════════════════
const CAT_ADDONS_DONO = [
  { id: 'antecipacao_recebiveis_giro', cat: 'fiscal', nome: 'Antecipação de Recebíveis & Crédito Giro', preco: '3.2% spread', roi: 'Capital de giro na mesma hora via Pix', desc: 'Antecipe vendas de cartão e repasses do iFood na hora direto no Pix sem banco.', icone: 'ph-currency-dollar', cor: '#10b981' },
  { id: 'totem_kiosk_touchscreen', cat: 'gestao', nome: 'Totem Kiosk de Autoatendimento Touch', preco: 'R$ 69/mês', roi: 'Economia de R$ 2.500/mês por atendente', desc: 'Transforme tablets Android em totens de pedido com pagamento touch e senha.', icone: 'ph-device-tablet-speaker', cor: '#0ea5e9' },
  { id: 'trafego_hiperlocal_1clique', cat: 'vendas', nome: 'Piloto de Tráfego Pago Hiperlocal 1-Clique', preco: 'R$ 49/mês', roi: '+25 a +40 clientes nas noites fracas', desc: 'Suba anúncios automáticos no Instagram num raio de 3km para lotar a casa.', icone: 'ph-megaphone-simple', cor: '#f59e0b' },
  { id: 'auditor_glosas_ifood', cat: 'fiscal', nome: 'Auditor de Repasses & Glosas do iFood', preco: 'R$ 89/mês', roi: 'Recupera em média R$ 1.400/mês', desc: 'Audita extratos do iFood e aponta retenções indevidas para contestação imediata.', icone: 'ph-magnifying-glass-plus', cor: '#ef4444' },
  { id: 'clube_assinaturas_prime', cat: 'vendas', nome: 'Motor de Clube de Assinaturas Prime', preco: 'R$ 79/mês', roi: 'Receita recorrente garantida no dia 1º', desc: 'Crie seu clube VIP com entrega grátis e cobre mensalidades no cartão dos clientes.', icone: 'ph-crown', cor: '#8b5cf6' },
  { id: 'tv_senhas_chamada_voz', cat: 'gestao', nome: 'TV Chamador de Senhas com Áudio', preco: 'R$ 39/mês', roi: 'Zero aglomeração e fila organizada', desc: 'Transforme qualquer Smart TV em painel de senhas com voz sintetizada em português.', icone: 'ph-television', cor: '#ec4899' },
  { id: 'despacho_multi_frota', cat: 'vendas', nome: 'Central de Despacho Multi-Frota (Uber/Lalamove)', preco: 'R$ 79/mês', roi: 'Reduz 30% dos custos de motoboy fixo', desc: 'Acione motoboys terceirizados com 1 clique e rastreio ao vivo para o cliente.', icone: 'ph-moped', cor: '#0ea5e9' },
  { id: 'reservas_vip_caucao', cat: 'vendas', nome: 'Reservas VIP com Caução Pix (Anti No-Show)', preco: 'R$ 69/mês', roi: 'Zera mesas vazias em noites nobres', desc: 'Garante o comparecimento cobrando caução Pix antecipada abatida da conta.', icone: 'ph-calendar-star', cor: '#ec4899' },
  { id: 'wallet_digital_prepaga', cat: 'fiscal', nome: 'Carteira Digital Pré-Paga & Cashback VIP', preco: 'R$ 89/mês', roi: 'Caixa antecipado e clientes fiéis', desc: 'Clientes compram R$ 200 em créditos adiantados e ganham bônus de consumo.', icone: 'ph-wallet', cor: '#10b981' },
  { id: 'escudo_reputacao_google', cat: 'vendas', nome: 'Escudo de Reputação Google Maps 5★', preco: 'R$ 59/mês', roi: '+35% de novos clientes via Maps', desc: 'Filtra elogios para o Google e retém críticas na ouvidoria interna do dono.', icone: 'ph-star', cor: '#eab308' },
  { id: 'split_mesa_pix', cat: 'fiscal', nome: 'Split de Conta na Mesa com Pix Autônomo', preco: 'R$ 49/mês', roi: 'Giro de mesa 20 min mais rápido', desc: 'Clientes dividem e pagam frações da conta via QR Code sem chamar o garçom.', icone: 'ph-arrows-split', cor: '#8b5cf6' },
  { id: 'dark_kitchen_marcas', cat: 'gestao', nome: 'Dark Kitchen Multi-Marcas (Hub Virtual)', preco: 'R$ 79/mês', roi: '+100% de receita na mesma cozinha', desc: 'Opere hamburgueria, marmitas e sobremesas no mesmo espaço com KDS separado.', icone: 'ph-cooking-pot', cor: '#f97316' },
  { id: 'tributos_monofasicos', cat: 'fiscal', nome: 'Recuperador Tributário (PIS/COFINS)', preco: 'R$ 99/mês', roi: 'Economiza R$ 800 a R$ 3.000/mês', desc: 'Abate PIS/COFINS de bebidas frias no Simples Nacional com laudo para o contador.', icone: 'ph-shield-check', cor: '#10b981' },
  { id: 'sentinela_anti_fraude', cat: 'fiscal', nome: 'Sentinela Anti-Fraude & Cancelamentos', preco: 'R$ 79/mês', roi: 'Elimina 3% a 8% de perdas', desc: 'Audita cancelamentos pós-produção na cozinha e descontos manuais suspeitos.', icone: 'ph-detective', cor: '#ef4444' },
  { id: 'banco_freelancers_plantao', cat: 'gestao', nome: 'Banco de Freelancers & Plantão Urgente', preco: 'R$ 49/mês', roi: 'Garçom de pico em 15 min', desc: 'Chame garçons, chapeiros e barmans avaliados para turnos de sexta e sábado.', icone: 'ph-users-three', cor: '#f59e0b' },
  { id: 'gatilho_clima_delivery', cat: 'vendas', nome: 'Gatilho Meteorológico (Choveu, Vendeu)', preco: 'R$ 49/mês', roi: '+45% de vendas na chuva', desc: 'Dispara automações com combos quentes quando a chuva começa na cidade.', icone: 'ph-cloud-rain', cor: '#3b82f6' },
  { id: 'compras_coletivas_b2b', cat: 'compras', nome: 'Clube de Compras Coletivas B2B', preco: 'R$ 89/mês', roi: '-18% no CMV de insumos', desc: 'Compre queijo, carne e embalagens com poder de grande rede direto da indústria.', icone: 'ph-shopping-cart', cor: '#8b5cf6' },
  { id: 'hub_multi_marketplace', cat: 'vendas', nome: 'Hub Multi-Marketplace (Rappi+Uber+99)', preco: 'R$ 129/mês', roi: '-40% em atrasos e multas', desc: 'Centralize todos os marketplaces num único painel sem tablets espalhados.', icone: 'ph-device-mobile-camera', cor: '#06b6d4' },
  { id: 'ficha_tecnica_visual', cat: 'gestao', nome: 'Ficha Técnica Visual com Foto do Prato', preco: 'R$ 49/mês', roi: 'Padrão 100% fiel na montagem', desc: 'Foto do prato montado, modo de preparo e checklist no KDS da cozinha.', icone: 'ph-fork-knife', cor: '#ec4899' },
  { id: 'link_pagamento_virtual', cat: 'fiscal', nome: 'Maquininha Virtual & Link WhatsApp', preco: 'R$ 59/mês', roi: '+15% de ticket no delivery', desc: 'Envie links de pagamento parcelado via WhatsApp com baixa automática no caixa.', icone: 'ph-credit-card', cor: '#14b8a6' },
  { id: 'foto_ia_cardapio', cat: 'vendas', nome: 'Cardápio com Foto IA Instantânea', preco: 'R$ 49/mês', roi: '+30% de conversão no QR', desc: 'Gere fotos profissionais realistas dos pratos usando IA sem contratar fotógrafo.', icone: 'ph-camera', cor: '#6366f1' },
  { id: 'escala_inteligente_ia', cat: 'gestao', nome: 'Agenda de Escalas CLT com IA', preco: 'R$ 69/mês', roi: '-30% em horas extras', desc: 'Gera escalas automáticas respeitando folgas CLT, preferências e picos de venda.', icone: 'ph-calendar-check', cor: '#84cc16' },

  // NOVOS MÓDULOS EXPANDIDOS DE ALTA RENTABILIDADE & FINTECH
  { id: 'gorjeta_legal_13419', cat: 'fiscal', nome: 'Split de Gorjeta Legalizada (Lei 13.419)', preco: 'R$ 69/mês + R$ 0,25/op', roi: 'Zero passivo trabalhista e rateio Pix', desc: 'Calcula retenção de encargos (20%/33%) e distribui por pontos diretamente via Pix aos garçons.', icone: 'ph-hand-coins', cor: '#10b981' },
  { id: 'antichurn_preditivo_whats', cat: 'vendas', nome: 'Robô Preditivo Anti-Churn WhatsApp', preco: 'R$ 59/mês', roi: 'Recupera em média 28% dos clientes', desc: 'Detecta desvio do intervalo de compra e dispara cupom personalizado de resgate.', icone: 'ph-whatsapp-logo', cor: '#25d366' },
  { id: 'gamificacao_salao_metas', cat: 'gestao', nome: 'Gamificação do Salão & Venda Sugestiva', preco: 'R$ 59/mês', roi: '+15% a +25% no ticket médio', desc: 'Metas ao vivo no PDV para garçons venderem sobremesas e drinks com comissão instantânea.', icone: 'ph-trophy', cor: '#f59e0b' },
  { id: 'influencer_roi_rastreado', cat: 'vendas', nome: 'Portal do Influencer com ROI Real', preco: 'R$ 49/mês', roi: 'Fim do jantar de graça sem retorno', desc: 'Gera links e cupons rastreados com comissão paga apenas sobre vendas reais geradas.', icone: 'ph-instagram-logo', cor: '#e1306c' },
  { id: 'voucher_vr_antecipacao', cat: 'fiscal', nome: 'Conciliação & Antecipação VR/VA', preco: 'R$ 89/mês + 3.5% spread', roi: 'Fluxo de caixa na hora sem 60 dias de espera', desc: 'Audita taxas de Ticket, Sodexo e Alelo e antecipa recebíveis futuros via Pix.', icone: 'ph-credit-card', cor: '#0ea5e9' },
  { id: 'drivethru_curbside_geofence', cat: 'vendas', nome: 'Drive-Thru & Pegue-e-Leve Geofence', preco: 'R$ 49/mês', roi: 'Entrega na janela do carro sem filas', desc: 'Rastreia aproximação por GPS (300m) e entrega a sacola direto na vaga do carro.', icone: 'ph-car', cor: '#f97316' },
  { id: 'rfid_pulseira_cashless', cat: 'fiscal', nome: 'Comanda RFID / Pulseira Cashless', preco: 'R$ 99/mês + R$ 0,30/op', roi: 'Aumento de 25% a 35% no consumo', desc: 'Elimina filas de saída com débito por aproximação em bares, baladas e eventos.', icone: 'ph-broadcast', cor: '#ec4899' },
  { id: 'hotel_room_service_pms', cat: 'gestao', nome: 'Room Service & Integração PMS Hotéis', preco: 'R$ 149/mês', roi: 'Cobrança unificada no check-out', desc: 'Lança consumos de frigobar e restaurante direto na conta do quarto do hóspede.', icone: 'ph-bed', cor: '#8b5cf6' },
  { id: 'perdas_avarias_barata_zero', cat: 'gestao', nome: 'Auditor de Quebras & Barata Zero', preco: 'R$ 59/mês', roi: 'Economiza R$ 2k-5k/mês em desperdício', desc: 'Registro com foto de quebras, carne queimada e garrafas quebradas por turno.', icone: 'ph-trash', cor: '#ef4444' },
  { id: 'reforma_tributaria_simulador', cat: 'fiscal', nome: 'Simulador Reforma Tributária (IBS/CBS)', preco: 'R$ 99/mês', roi: 'Adequação fiscal preventiva', desc: 'Simula o split payment, créditos de atacado e recalibra preços de cardápio.', icone: 'ph-calculator', cor: '#10b981' },
  { id: 'marmitas_b2b_corporativo', cat: 'compras', nome: 'Assinatura Corporativa de Refeições B2B', preco: 'R$ 79/mês + 1% faturamento', roi: 'Faturamento previsível com empresas', desc: 'Contratos com empresas para marmitas diárias com portal de escolha dos funcionários.', icone: 'ph-buildings', cor: '#0ea5e9' },
  { id: 'recrutador_gastronomico_flash', cat: 'gestao', nome: 'Recrutador Flash de Equipe Gastronômica', preco: 'R$ 49/mês', roi: 'Mão de obra de pico em 15 minutos', desc: 'Disparo de vagas urgentes e triagem rápida de cozinheiros, chapeiros e garçons.', icone: 'ph-user-plus', cor: '#f59e0b' },
  { id: 'franquias_royalties_fpp', cat: 'gestao', nome: 'Franquias & Master Franchising', preco: 'R$ 199/mês por franqueado', roi: 'Royalties auditados direto do PDV', desc: 'Apuração automática de royalties e fundo de propaganda de múltiplas unidades.', icone: 'ph-tree-structure', cor: '#8b5cf6' },
  { id: 'polo_gastronomico_compartilhado', cat: 'vendas', nome: 'Polo Gastronômico Delivery Compartilhado', preco: 'R$ 149/mês + 2% take-rate', roi: 'Frete unificado multi-lojas', desc: 'Carrinho único de delivery para shoppings, vilas gastronômicas e praças.', icone: 'ph-storefront', cor: '#06b6d4' },
  { id: 'antifurto_inventario_cego', cat: 'fiscal', nome: 'Sentinela de Inventário Cego (Carnes & Whisky)', preco: 'R$ 79/mês', roi: 'Elimina R$ 3k-8k/mês de furtos internos', desc: 'Contagem cega de 3 min dos 10 itens mais caros com alerta imediato ao dono.', icone: 'ph-eye', cor: '#ef4444' },
  { id: 'fidelidade_tiers_vip', cat: 'vendas', nome: 'Fidelidade por Níveis VIP (Bronze a Diamante)', preco: 'R$ 69/mês', roi: 'Aumenta ticket e frequência de visita', desc: 'Níveis de prestígio com benefícios exclusivos, drink de boas-vindas e cashback.', icone: 'ph-medal', cor: '#eab308' },
  { id: 'menuboard_tv_balcao', cat: 'gestao', nome: 'Menu Board Digital para TVs de Balcão', preco: 'R$ 49/mês por tela', roi: '+20% em vendas de combos estilo fast-food', desc: 'Transforme Smart TVs suspensas em painéis dinâmicos com troca por horário.', icone: 'ph-monitor', cor: '#3b82f6' },
  { id: 'satisfacao_ia_emocional', cat: 'gestao', nome: 'Totem de Satisfação IA Emocional', preco: 'R$ 39/mês', roi: 'Alerta de crise no WhatsApp em 5s', desc: 'Totem de 4 emojis com gravação de áudio e análise de sentimento instantânea.', icone: 'ph-smiley', cor: '#10b981' },
  { id: 'sped_fiscal_automatico', cat: 'fiscal', nome: 'SPED Fiscal & Exportação Contábil Automática', preco: 'R$ 99/mês', roi: 'Elimina 100% do estresse e tempo com fechamento fiscal', desc: 'Gera e envia mensalmente arquivos SPED EFD, XMLs de NFC-e e relatórios fiscais diretamente ao contador.', icone: 'ph-file-archive', cor: '#10b981' },
  { id: 'preco_dinamico_happyhour', cat: 'vendas', nome: 'Precificação Dinâmica & Happy Hour Automático', preco: 'R$ 59/mês', roi: '+15% de receita aproveitando horários de maior procura', desc: 'Ajuste inteligente de preços por horário de pico, dia da semana ou lotação do salão.', icone: 'ph-chart-line-up', cor: '#f59e0b' },
  { id: 'nutricional_calorias', cat: 'gestao', nome: 'Controle Nutricional & Tabela de Calorias', preco: 'R$ 49/mês', roi: 'Atrai o público fitness e atende exigências de rotulagem', desc: 'Cálculo de calorias (kcal), macronutrientes, alérgenos e selos funcionais (vegano, sem glúten) para o cardápio.', icone: 'ph-heartbeat', cor: '#ec4899' },
  { id: 'desperdicio_pesagem_lixo', cat: 'gestao', nome: 'Controle de Desperdício com Balança de Descarte', preco: 'R$ 69/mês', roi: 'Economiza até R$ 3.500/mês eliminando vazamentos', desc: 'Pesagem e registro fotográfico de sobras de buffet, pré-preparo e devoluções com metas anti-desperdício.', icone: 'ph-trash', cor: '#ef4444' },
  { id: 'checklist_abertura_fechamento', cat: 'gestao', nome: 'Checklist de Abertura & Fechamento com Fotos', preco: 'R$ 49/mês', roi: 'Garante padrão de excelência e higiene em todos os turnos', desc: 'Listas de verificação operacionais obrigatórias para a equipe antes de abrir e fechar a casa com fotos.', icone: 'ph-check-square-offset', cor: '#8b5cf6' },
  { id: 'manutencao_preventiva', cat: 'gestao', nome: 'Manutenção Preventiva de Equipamentos', preco: 'R$ 59/mês', roi: 'Evita paradas repentinas no meio do almoço de domingo', desc: 'Ordens de serviço, cronograma de preventiva de freezers, fogões e coifas, e histórico de custos por máquina.', icone: 'ph-wrench', cor: '#0ea5e9' },
  { id: 'academia_restaurante', cat: 'gestao', nome: 'Academia do Restaurante & Treinamento Onboarding', preco: 'R$ 69/mês', roi: 'Reduz o tempo de adaptação de novos contratados em 70%', desc: 'Plataforma interna com cursos, vídeos de atendimento e quizzes para capacitar novos garçons em 48h.', icone: 'ph-graduation-cap', cor: '#6366f1' },
  { id: 'iot_temperatura_haccp', cat: 'gestao', nome: 'Monitoramento de Temperatura IoT (HACCP)', preco: 'R$ 79/mês', roi: 'Evita perda de milhares de reais em carnes e laticínios', desc: 'Sensores inteligentes de temperatura para câmaras frias e freezers com alerta sonoro e no WhatsApp se esquentar.', icone: 'ph-thermometer', cor: '#14b8a6' },
  { id: 'atendente_social_ia', cat: 'vendas', nome: 'Atendente Virtual para Instagram & Facebook', preco: 'R$ 79/mês', roi: 'Zero perda de clientes que perguntam pelo Instagram à noite', desc: 'Robô com inteligência artificial para responder direct no Instagram, tirar dúvidas do cardápio e fechar pedidos.', icone: 'ph-chat-circle-dots', cor: '#ec4899' },
  { id: 'benchmark_anonimo_setor', cat: 'fiscal', nome: 'Benchmark Anônimo do Setor Gastronômico', preco: 'R$ 49/mês', roi: 'Descubra se está pagando caro em insumos ou cobrando pouco', desc: 'Comparativo do CMV, ticket médio e giro do seu restaurante contra a média do mercado da sua cidade e nicho.', icone: 'ph-scales', cor: '#3b82f6' },
  { id: 'app_funcionario_ponto', cat: 'gestao', nome: 'App do Funcionário (Ponto, Holerite & Escalas)', preco: 'R$ 49/mês', roi: 'Transparência total e comunicação sem ruídos com a equipe', desc: 'Portal exclusivo para colaboradores visualizarem seus pontos, escalas de folga, gorjetas e comunicados do chefe.', icone: 'ph-user-list', cor: '#10b981' },
  { id: 'valet_estacionamento', cat: 'gestao', nome: 'Valet & Controle de Estacionamento', preco: 'R$ 49/mês', roi: 'Segurança jurídica contra falsas avarias e agilidade na saída', desc: 'Registro de entrada e saída de veículos de clientes com foto de avarias, solicitação de carro e cobrança.', icone: 'ph-car-profile', cor: '#f97316' },
  { id: 'gestao_playlist_ambiente', cat: 'vendas', nome: 'Ambientação Sonora & Playlist por Horário', preco: 'R$ 39/mês', roi: 'Aumenta o tempo de permanência e consumo em 18%', desc: 'Controle de trilha sonora integrada para almoço executivo, happy hour animado ou jantar romântico.', icone: 'ph-music-notes', cor: '#a855f7' },
  { id: 'portal_cliente_vip', cat: 'vendas', nome: 'Portal do Cliente & Re-Pedir em 1 Clique', preco: 'R$ 49/mês', roi: 'Aumenta a recompra espontânea de clientes habituais', desc: 'Área exclusiva onde o cliente vê seu histórico de pedidos, salva pratos favoritos e repete pedidos em segundos.', icone: 'ph-user-circle', cor: '#06b6d4' }
];

window.abrirLojaAddonsDono = function() {
  window.carregarStatusPlanoDono();
  window.renderizarAddonsLoja('todos');
  if (typeof abrirModal === 'function') abrirModal('modal-loja-addons-dono');
  else {
    const el = document.getElementById('modal-loja-addons-dono');
    if (el) el.classList.remove('hidden');
  }
};

window.carregarStatusPlanoDono = async function() {
  try {
    const tId = localStorage.getItem('restaurante_id') || 1;
    const res = await fetch('/api/plano/quotas?restaurante_id=' + tId, {
      headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('chef_token') || '') }
    });
    const d = await res.json();
    if (!d || !d.ok) return;

    const rest = d.restaurante || {};
    const limits = d.limites || {};
    const uso = d.uso_atual || {};
    const pcts = d.percentuais || {};

    const nomePlanoEl = document.getElementById('txt-nome-plano-atual');
    const descPlanoEl = document.getElementById('txt-desc-plano-atual');
    const bannerLiteEl = document.getElementById('banner-cota-lite');

    if (nomePlanoEl) nomePlanoEl.textContent = limits.nome || 'Plano ' + rest.plano;
    if (descPlanoEl) descPlanoEl.textContent = limits.descricao || '';

    // Preenche barras
    const barPedFill = document.getElementById('bar-pedidos-fill');
    const barPedTxt = document.getElementById('bar-pedidos-txt');
    if (barPedFill) barPedFill.style.width = (pcts.pedidos || 0) + '%';
    if (barPedTxt) barPedTxt.textContent = uso.pedidos_mes + '/' + (limits.max_pedidos_mes === Infinity ? '∞' : limits.max_pedidos_mes);

    const barProdFill = document.getElementById('bar-produtos-fill');
    const barProdTxt = document.getElementById('bar-produtos-txt');
    if (barProdFill) barProdFill.style.width = (pcts.produtos || 0) + '%';
    if (barProdTxt) barProdTxt.textContent = uso.produtos + '/' + (limits.max_produtos === Infinity ? '∞' : limits.max_produtos);

    const barMesasFill = document.getElementById('bar-mesas-fill');
    const barMesasTxt = document.getElementById('bar-mesas-txt');
    if (barMesasFill) barMesasFill.style.width = (pcts.mesas || 0) + '%';
    if (barMesasTxt) barMesasTxt.textContent = uso.mesas + '/' + (limits.max_mesas === Infinity ? '∞' : limits.max_mesas);

    // Se for Plano Lite, exibe banner de aviso de cota no dashboard
    if (bannerLiteEl) {
      if (rest.plano === 'lite') {
        bannerLiteEl.style.display = 'flex';
        const txtPed = document.getElementById('txt-cota-pedidos');
        const txtProd = document.getElementById('txt-cota-produtos');
        const msgAlerta = document.getElementById('msg-cota-alerta');
        if (txtPed) txtPed.textContent = uso.pedidos_mes + '/150 pedidos';
        if (txtProd) txtProd.textContent = uso.produtos + '/30 produtos';
        if (msgAlerta && d.alerta) msgAlerta.textContent = d.alerta.mensagem;
      } else {
        bannerLiteEl.style.display = 'none';
      }
    }
  } catch(e) {
    console.error('[Plano Dono Load Error]', e);
  }
};

window.renderizarAddonsLoja = function(filtro) {
  const container = document.getElementById('grid-loja-addons-dono');
  if (!container) return;

  const itens = filtro === 'todos' ? CAT_ADDONS_DONO : CAT_ADDONS_DONO.filter(a => a.cat === filtro);

  let html = '';
  itens.forEach(a => {
    html += `
      <div style="background:var(--card); border:1px solid var(--border); border-radius:14px; padding:16px; display:flex; flex-direction:column; justify-content:space-between; transition:transform 0.2s;">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
            <div style="width:38px; height:38px; border-radius:10px; background:rgba(255,255,255,0.06); color:${a.cor}; display:flex; align-items:center; justify-content:center; font-size:20px;">
              <i class="ph-bold ${a.icone}"></i>
            </div>
            <span style="font-size:14px; font-weight:900; color:var(--text);">${a.preco}</span>
          </div>
          <h4 style="font-size:14px; font-weight:800; color:var(--text); margin-bottom:6px;">${a.nome}</h4>
          <p style="font-size:12px; color:var(--text-sub); line-height:1.4; margin-bottom:12px;">${a.desc}</p>
        </div>
        <div>
          <div style="background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.2); border-radius:8px; padding:6px 10px; font-size:11px; font-weight:700; color:#10b981; margin-bottom:10px; display:flex; align-items:center; gap:6px;">
            <i class="ph-bold ph-trend-up"></i> ${a.roi}
          </div>
          <button onclick="window.abrirCheckoutModal('${a.nome}', '${a.preco}', '${a.id}')" style="width:100%; padding:9px; background:linear-gradient(135deg, var(--primary), #ff8c42); color:white; border:none; border-radius:8px; font-weight:800; font-size:12px; cursor:pointer;">
            Ativar via PIX
          </button>
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
};

window.filtrarAddonsLoja = function(cat, btn) {
  document.querySelectorAll('#modal-loja-addons-dono .tab-btn-terminal').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  window.renderizarAddonsLoja(cat);
};

window.abrirCheckoutModal = function(nome, valor, id) {
  const modal = document.getElementById('modal-checkout-addon');
  if (!modal) return;
  const tit = document.getElementById('checkout-addon-titulo');
  const prec = document.getElementById('checkout-addon-preco');
  const pix = document.getElementById('checkout-pix-copia');
  const qr = document.getElementById('checkout-qr-img');

  window._addonCheckoutAtualId = id;
  window._addonCheckoutAtualNome = nome;
  window._addonCheckoutAtualPreco = valor;

  const precoNum = typeof valor === 'number' ? valor : parseFloat(String(valor).replace(/[^0-9,]/g, '').replace(',', '.')) || 99;

  if (tit) tit.textContent = 'Ativar ' + nome;
  if (prec) prec.textContent = 'R$ ' + precoNum.toFixed(2) + ' / mês';
  const chavePix = '00020126580014br.gov.bcb.pix0136' + id + '-' + (localStorage.getItem('restaurante_id') || 1) + '-chefcozinha520400005303986540' + precoNum.toFixed(2) + '5802BR5920CHEF COZINHA SAAS6009SAO PAULO62070503***6304ABCD';
  if (pix) pix.value = chavePix;
  if (qr) qr.src = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + encodeURIComponent(chavePix);

  if (typeof abrirModal === 'function') abrirModal('modal-checkout-addon');
  else modal.classList.remove('hidden');
};

window.confirmarAtivacaoAddon = async function(isTrial) {
  const chave = window._addonCheckoutAtualId;
  const nome = window._addonCheckoutAtualNome || 'Módulo';
  if (!chave) return;

  const btnConfirmar = document.getElementById('btn-confirmar-pix-addon');
  const btnTrial = document.getElementById('btn-trial-addon');
  if (btnConfirmar) btnConfirmar.disabled = true;
  if (btnTrial) btnTrial.disabled = true;

  try {
    const endpoint = isTrial ? '/api/dono/modulos/ativar-trial' : '/api/dono/modulos/ativar-imediato';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (localStorage.getItem('chef_token') || '')
      },
      body: JSON.stringify({ chave_modulo: chave })
    });
    const d = await res.json();
    if (d && d.ok) {
      if (typeof fecharModal === 'function') fecharModal('modal-checkout-addon');
      else {
        const m = document.getElementById('modal-checkout-addon');
        if (m) m.classList.add('hidden');
      }
      if (typeof showToast === 'function') {
        showToast(d.mensagem || `✅ Módulo "${nome}" ativado com sucesso!`, 'ph-check-circle', 'success');
      } else {
        alert(d.mensagem || `Módulo "${nome}" ativado!`);
      }
      window.renderizarAddonsLoja('todos');
    } else {
      alert((d && d.erro) || 'Não foi possível ativar o módulo.');
    }
  } catch(e) {
    alert('Erro de conexão ao ativar o módulo.');
  } finally {
    if (btnConfirmar) btnConfirmar.disabled = false;
    if (btnTrial) btnTrial.disabled = false;
  }
};

window.copiarPixCheckout = function() {
  const pix = document.getElementById('checkout-pix-copia');
  if (pix) {
    pix.select();
    navigator.clipboard.writeText(pix.value);
    if (typeof showToast === 'function') showToast('📋 Código Pix Copia e Cola copiado!', 'ph-copy', 'info');
  }
};

// Carregar status do plano ao iniciar painel
setTimeout(() => {
  if (typeof window.carregarStatusPlanoDono === 'function') {
    window.carregarStatusPlanoDono();
  }
}, 1500);

/* =========================================================================
   WORKFLOWS OPERACIONAIS ESPECIALIZADOS POR NICHO GASTRONÔMICO
   Módulos: Pizzaria, Hamburgueria, Churrascaria, Sushi Bar, Bar & Balada,
            Buffet por Quilo, Cafeteria & Padaria, À La Carte
   ========================================================================= */

window.trocarNichoOperacao = function(nicho) {
  if (!nicho) nicho = 'pizzaria';
  localStorage.setItem('chef_nicho_ativo', nicho);

  const sel = document.getElementById('select-nicho-operacao');
  if (sel && sel.value !== nicho) sel.value = nicho;

  const tabs = document.querySelectorAll('#tabs-nichos-container .tab-btn-terminal');
  tabs.forEach(t => {
    if (t.getAttribute('data-nicho') === nicho) {
      t.classList.add('active');
    } else {
      t.classList.remove('active');
    }
  });

  const views = document.querySelectorAll('.painel-nicho-view');
  views.forEach(v => {
    v.style.display = 'none';
  });

  const targetView = document.getElementById(`painel-nicho-${nicho}`);
  if (targetView) targetView.style.display = 'block';

  // Carregar dados iniciais do nicho selecionado
  if (nicho === 'pizzaria') window.atualizarFornoLastroDono();
  else if (nicho === 'hamburgueria') window.verEstacaoHamburgueriaDono('chapa');
  else if (nicho === 'churrascaria') window.atualizarRadarChurrascariaDono();
  else if (nicho === 'sushi') window.atualizarLotesSushiDono();
  else if (nicho === 'bar') window.atualizarGarrafasBarDono();
  else if (nicho === 'buffet') window.atualizarCubasBuffetDono();
};

// 1. NICHO PIZZARIA
window.calcularFracaoPizzaDono = async function() {
  const box = document.getElementById('resultado-fracao-pizza');
  if (!box) return;
  box.innerHTML = 'Calculando melhor regra de cobrança...';

  const regra = document.getElementById('pizza-regra-cobranca')?.value || 'maior_valor';
  const sab1Raw = document.getElementById('pizza-sabor-1')?.value || 'Calabresa Especial|54';
  const sab2Raw = document.getElementById('pizza-sabor-2')?.value || 'Quatro Queijos Nobre|68';
  const bordaRaw = document.getElementById('pizza-borda')?.value || 'Catupiry Original Vulcão|14';

  const [nome1, p1] = sab1Raw.split('|');
  const [nome2, p2] = sab2Raw.split('|');
  const [bordaNome, bordaPreco] = bordaRaw.split('|');

  try {
    const token = typeof obterTokenDono === 'function' ? obterTokenDono() : (localStorage.getItem('chef_token') || '');
    const res = await fetch('/api/nichos/pizzaria/fracionar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        sabores: [
          { nome: nome1, preco_inteira: parseFloat(p1) || 54 },
          { nome: nome2, preco_inteira: parseFloat(p2) || 68 }
        ],
        borda: { nome: bordaNome, preco: parseFloat(bordaPreco) || 0 },
        regra_cobranca: regra
      })
    });
    const d = await res.json();
    if (d && d.ok) {
      box.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:4px; width:100%;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong style="color:var(--primary); font-size:13px;">${d.fracoes} • R$ ${d.valor_total_calculado.toFixed(2)}</strong>
            <span style="background:rgba(16,185,129,0.15); color:#10b981; font-weight:800; font-size:10px; padding:2px 6px; border-radius:4px;">Regra: ${d.regra_aplicada}</span>
          </div>
          <div style="font-size:11px; color:var(--text-sub);">Base Sabores: R$ ${d.preco_sabores.toFixed(2)} | Borda: ${d.borda_adicionada} (+R$ ${d.preco_borda.toFixed(2)})</div>
          <div style="font-size:11px; color:var(--text);">${d.detalhe_producao.join(' + ')}</div>
        </div>
      `;
    } else {
      box.innerHTML = `<span style="color:#ef4444;">${(d && d.erro) || 'Erro no cálculo de frações.'}</span>`;
    }
  } catch(e) {
    box.innerHTML = `<span style="color:#ef4444;">Erro de conexão com o servidor.</span>`;
  }
};

window.lancarPizzaFornoDono = async function() {
  const nome = document.getElementById('forno-pizza-nome')?.value || 'Grande Meio Calabresa / Meio 4 Queijos';
  const tempo = parseInt(document.getElementById('forno-pizza-tempo')?.value) || 8;
  const token = typeof obterTokenDono === 'function' ? obterTokenDono() : (localStorage.getItem('chef_token') || '');

  try {
    const res = await fetch('/api/nichos/pizzaria/forno/lancar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        pedido_id: Math.floor(100 + Math.random() * 900),
        pizza_nome: nome,
        sabores: ['Calabresa Especial', 'Quatro Queijos Nobre'],
        tempo_coccao_min: tempo
      })
    });
    const d = await res.json();
    if (d && d.ok) {
      if (typeof showToast === 'function') showToast(`🍕 ${nome} entrou no forno! Timer de ${tempo}m iniciado.`, 'ph-fire', 'success');
      window.atualizarFornoLastroDono();
    }
  } catch(e) {
    alert('Erro ao lançar pizza no forno.');
  }
};

window.atualizarFornoLastroDono = async function() {
  const container = document.getElementById('lista-forno-pizzas');
  if (!container) return;
  const token = typeof obterTokenDono === 'function' ? obterTokenDono() : (localStorage.getItem('chef_token') || '');

  try {
    const res = await fetch('/api/nichos/pizzaria/forno/painel', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const d = await res.json();
    if (d && d.ok && d.pizzas_no_forno && d.pizzas_no_forno.length > 0) {
      container.innerHTML = d.pizzas_no_forno.map(p => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.06);">
          <div>
            <strong>${p.pizza_nome}</strong>
            <div style="font-size:10.5px; color:var(--text-sub);">Pedido #${p.pedido_id} • ${p.tipo_massa || 'tradicional'}</div>
          </div>
          <span style="background:rgba(239,68,68,0.15); color:#ef4444; font-weight:800; padding:2px 8px; border-radius:6px; font-size:10px;">
            <i class="ph-bold ph-timer"></i> ${p.tempo_coccao_min} min
          </span>
        </div>
      `).join('');
    } else {
      container.innerHTML = '<div style="color:var(--text-sub); text-align:center; padding:12px 0;">Forno livre no momento. Nenhuma pizza assando.</div>';
    }
  } catch(e) {
    container.innerHTML = '<div style="color:var(--text-sub); text-align:center; padding:12px 0;">Não foi possível carregar o forno.</div>';
  }
};

// 2. NICHO HAMBURGUERIA
window.rotearBurgerKDSDono = async function() {
  const box = document.getElementById('resultado-roteamento-burger');
  if (!box) return;
  box.innerHTML = 'Roteando comanda entre as praças...';

  const nome = document.getElementById('burger-lanche-nome')?.value || 'Double Smash';
  const ponto = document.getElementById('burger-ponto-carne')?.value || 'ao_ponto';
  const acomp = document.getElementById('burger-acompanhamento')?.value || 'Batata Rústica';
  const token = typeof obterTokenDono === 'function' ? obterTokenDono() : (localStorage.getItem('chef_token') || '');

  try {
    const res = await fetch('/api/nichos/hamburgueria/dividir-estacoes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        pedido_id: Math.floor(200 + Math.random() * 800),
        lanche_nome: nome,
        ponto_carne: ponto,
        blend_peso_g: 200,
        acompanhamentos: [acomp]
      })
    });
    const d = await res.json();
    if (d && d.ok) {
      box.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:4px;">
          <div style="font-weight:800; color:#f59e0b; font-size:12.5px;">✅ Pedido #${d.pedido_id} Distribuído nas 3 Praças:</div>
          <div style="font-size:11px; color:var(--text-sub);">🔥 <strong>Chapa:</strong> ${d.distribuicao.chapa}</div>
          <div style="font-size:11px; color:var(--text-sub);">🍟 <strong>Fritura:</strong> ${d.distribuicao.fritadeira}</div>
          <div style="font-size:11px; color:var(--text-sub);">🍔 <strong>Montagem:</strong> ${d.distribuicao.montagem}</div>
        </div>
      `;
      window.verEstacaoHamburgueriaDono('chapa');
    }
  } catch(e) {
    box.innerHTML = '<span style="color:#ef4444;">Erro ao rotear pedido para KDS.</span>';
  }
};

window.verEstacaoHamburgueriaDono = async function(estacao, btn) {
  const container = document.getElementById('lista-estacao-burger');
  if (!container) return;

  const btnChapa = document.getElementById('btn-estacao-chapa');
  const btnFrit = document.getElementById('btn-estacao-fritadeira');
  if (btnChapa && btnFrit) {
    if (estacao === 'chapa') {
      btnChapa.classList.add('active');
      btnFrit.classList.remove('active');
    } else {
      btnFrit.classList.add('active');
      btnChapa.classList.remove('active');
    }
  }

  container.innerHTML = '<div style="color:var(--text-sub); text-align:center; padding:12px 0;">Consultando estação...</div>';
  const token = typeof obterTokenDono === 'function' ? obterTokenDono() : (localStorage.getItem('chef_token') || '');

  try {
    const res = await fetch(`/api/nichos/hamburgueria/estacao/${estacao}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const d = await res.json();
    if (d && d.ok && d.itens_pendentes && d.itens_pendentes.length > 0) {
      container.innerHTML = d.itens_pendentes.map(item => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.06);">
          <div>
            <strong>${item.lanche_nome}</strong>
            <div style="font-size:10.5px; color:var(--text-sub);">Pedido #${item.pedido_id} ${item.ponto_carne ? '• ' + item.ponto_carne.replace('_', ' ') : ''}</div>
          </div>
          <span style="background:rgba(245,158,11,0.15); color:#f59e0b; font-weight:800; padding:2px 8px; border-radius:6px; font-size:10px;">
            ${item.status}
          </span>
        </div>
      `).join('');
    } else {
      container.innerHTML = `<div style="color:var(--text-sub); text-align:center; padding:12px 0;">Estação ${estacao.toUpperCase()} sem pedidos pendentes.</div>`;
    }
  } catch(e) {
    container.innerHTML = '<div style="color:var(--text-sub); text-align:center; padding:12px 0;">Erro ao carregar estação.</div>';
  }
};

// 3. NICHO CHURRASCARIA & RODÍZIO
window.sinalizarMesaChurrascariaDono = async function() {
  const box = document.getElementById('resultado-sinal-churrasco');
  if (!box) return;
  const mesa = document.getElementById('churrasco-mesa-num')?.value || 'Mesa 18';
  const sinal = document.getElementById('churrasco-sinal-mesa')?.value || 'quero_carne';
  const cortes = (document.getElementById('churrasco-cortes')?.value || '').split(',').map(c => c.trim());
  const token = typeof obterTokenDono === 'function' ? obterTokenDono() : (localStorage.getItem('chef_token') || '');

  try {
    const res = await fetch('/api/nichos/churrascaria/sinalizar-mesa', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        mesa_num: mesa,
        estado_sinal: sinal,
        cortes_preferidos: cortes
      })
    });
    const d = await res.json();
    if (d && d.ok) {
      box.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px;">
          <div style="width:12px; height:12px; border-radius:50%; background:${sinal === 'quero_carne' ? '#10b981' : (sinal === 'pausa' ? '#ef4444' : '#8b5cf6')};"></div>
          <div><strong>${d.mesa}:</strong> ${d.mensagem}</div>
        </div>
      `;
      window.atualizarRadarChurrascariaDono();
    }
  } catch(e) {
    box.innerHTML = '<span style="color:#ef4444;">Erro ao atualizar sinal da mesa.</span>';
  }
};

window.atualizarRadarChurrascariaDono = async function() {
  const container = document.getElementById('lista-radar-churrasco');
  if (!container) return;
  const token = typeof obterTokenDono === 'function' ? obterTokenDono() : (localStorage.getItem('chef_token') || '');

  try {
    const res = await fetch('/api/nichos/churrascaria/radar-passadores', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const d = await res.json();
    if (d && d.ok && d.mesas && d.mesas.length > 0) {
      container.innerHTML = d.mesas.map(m => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.06);">
          <div>
            <strong>${m.mesa_num}</strong>
            <div style="font-size:10.5px; color:var(--text-sub);">${m.cortes_solicitados_json || 'Sem restrições'}</div>
          </div>
          <span style="background:rgba(16,185,129,0.15); color:#10b981; font-weight:800; padding:2px 8px; border-radius:6px; font-size:10px;">
            🟢 Sinal Verde
          </span>
        </div>
      `).join('');
    } else {
      container.innerHTML = '<div style="color:var(--text-sub); text-align:center; padding:12px 0;">Nenhuma mesa com sinal verde no momento.</div>';
    }
  } catch(e) {
    container.innerHTML = '<div style="color:var(--text-sub); text-align:center; padding:12px 0;">Erro ao consultar radar.</div>';
  }
};

// 4. NICHO SUSHI BAR
window.registrarLoteSushiDono = async function() {
  const box = document.getElementById('resultado-lote-sushi');
  if (!box) return;
  const tipo = document.getElementById('sushi-peixe-tipo')?.value || 'Salmão Chileno';
  const bruto = parseFloat(document.getElementById('sushi-peso-bruto')?.value) || 5.2;
  const limpo = parseFloat(document.getElementById('sushi-peso-limpo')?.value) || 3.65;
  const forn = document.getElementById('sushi-fornecedor')?.value || 'Pescados Oceano Sul';
  const token = typeof obterTokenDono === 'function' ? obterTokenDono() : (localStorage.getItem('chef_token') || '');

  try {
    const res = await fetch('/api/nichos/sushi/registrar-lote', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        peixe_tipo: tipo,
        peso_inicial_kg: bruto,
        peso_limpo_kg: limpo,
        fornecedor: forn
      })
    });
    const d = await res.json();
    if (d && d.ok) {
      box.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:3px;">
          <div style="display:flex; justify-content:space-between;">
            <strong style="color:#ec4899;">${d.peixe}</strong>
            <span style="background:rgba(16,185,129,0.15); color:#10b981; font-weight:800; font-size:10px; padding:2px 6px; border-radius:4px;">${d.status_qualidade}</span>
          </div>
          <div style="font-size:11px; color:var(--text-sub);">Rendimento: <strong>${d.rendimento_calculado}</strong> | Perda em Aparas: ${d.perda_aparas}</div>
          <div style="font-size:10.5px; color:#10b981;">✓ Lote registrado com conformidade Anvisa e rastreabilidade térmica.</div>
        </div>
      `;
      window.atualizarLotesSushiDono();
    }
  } catch(e) {
    box.innerHTML = '<span style="color:#ef4444;">Erro ao registrar lote de peixe.</span>';
  }
};

window.atualizarLotesSushiDono = async function() {
  const container = document.getElementById('lista-lotes-sushi');
  if (!container) return;
  const token = typeof obterTokenDono === 'function' ? obterTokenDono() : (localStorage.getItem('chef_token') || '');

  try {
    const res = await fetch('/api/nichos/sushi/lotes-ativos', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const d = await res.json();
    if (d && d.ok && d.lotes_peixe && d.lotes_peixe.length > 0) {
      container.innerHTML = d.lotes_peixe.map(l => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.06);">
          <div>
            <strong>${l.peixe_tipo}</strong>
            <div style="font-size:10.5px; color:var(--text-sub);">${l.peso_limpo_kg}kg limpos • ${l.fornecedor || 'Fornecedor padrão'}</div>
          </div>
          <span style="background:rgba(236,72,153,0.15); color:#ec4899; font-weight:800; padding:2px 8px; border-radius:6px; font-size:10px;">
            ${l.rendimento_pct}% rendimento
          </span>
        </div>
      `).join('');
    } else {
      container.innerHTML = '<div style="color:var(--text-sub); text-align:center; padding:12px 0;">Nenhum lote registrado hoje.</div>';
    }
  } catch(e) {
    container.innerHTML = '<div style="color:var(--text-sub); text-align:center; padding:12px 0;">Erro ao consultar lotes.</div>';
  }
};

// 5. NICHO BAR & BALADA
window.lancarDoseBarDono = async function() {
  const box = document.getElementById('resultado-dose-bar');
  if (!box) return;
  const bebida = document.getElementById('bar-bebida-nome')?.value || 'Gin Tanqueray London Dry';
  const qtd = parseInt(document.getElementById('bar-doses-qtd')?.value) || 2;
  const val = parseFloat(document.getElementById('bar-dose-valor')?.value) || 34.00;
  const token = typeof obterTokenDono === 'function' ? obterTokenDono() : (localStorage.getItem('chef_token') || '');

  try {
    const res = await fetch('/api/nichos/bar/dose/lancar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        bebida_nome: bebida,
        doses_vendidas: qtd,
        valor_dose: val
      })
    });
    const d = await res.json();
    if (d && d.ok) {
      box.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:3px;">
          <div style="display:flex; justify-content:space-between;">
            <strong style="color:#8b5cf6;">${d.doses_lancadas}x ${d.bebida} = R$ ${d.valor_total.toFixed(2)}</strong>
            <span style="background:${d.alerta_troca_garrafa ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)'}; color:${d.alerta_troca_garrafa ? '#ef4444' : '#10b981'}; font-weight:800; font-size:10px; padding:2px 6px; border-radius:4px;">
              ${d.doses_restantes_na_garrafa} doses restantes
            </span>
          </div>
          <div style="font-size:11px; color:var(--text-sub);">${d.mensagem}</div>
        </div>
      `;
      window.atualizarGarrafasBarDono();
    }
  } catch(e) {
    box.innerHTML = '<span style="color:#ef4444;">Erro ao registrar dose.</span>';
  }
};

window.atualizarGarrafasBarDono = async function() {
  const container = document.getElementById('lista-garrafas-bar');
  if (!container) return;
  const token = typeof obterTokenDono === 'function' ? obterTokenDono() : (localStorage.getItem('chef_token') || '');

  try {
    const res = await fetch('/api/nichos/bar/garrafas-abertas', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const d = await res.json();
    if (d && d.ok && d.garrafas_abertas && d.garrafas_abertas.length > 0) {
      container.innerHTML = d.garrafas_abertas.map(g => {
        const pct = Math.max(0, Math.min(100, Math.round(((g.doses_totais - g.doses_vendidas) / g.doses_totais) * 100)));
        return `
          <div style="padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.06);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <strong>${g.bebida_nome}</strong>
              <span style="font-size:10.5px; color:${pct < 20 ? '#ef4444' : '#8b5cf6'}; font-weight:800;">${g.doses_totais - g.doses_vendidas}/${g.doses_totais} doses (${pct}%)</span>
            </div>
            <div style="height:6px; background:rgba(255,255,255,0.06); border-radius:6px; overflow:hidden;">
              <div style="height:100%; width:${pct}%; background:${pct < 20 ? '#ef4444' : '#8b5cf6'};"></div>
            </div>
          </div>
        `;
      }).join('');
    } else {
      container.innerHTML = '<div style="color:var(--text-sub); text-align:center; padding:12px 0;">Nenhuma garrafa em auditoria no momento.</div>';
    }
  } catch(e) {
    container.innerHTML = '<div style="color:var(--text-sub); text-align:center; padding:12px 0;">Erro ao listar garrafas.</div>';
  }
};

// 6. NICHO BUFFET POR QUILO
window.pesarBalancaBuffetDono = async function() {
  const box = document.getElementById('resultado-pesagem-buffet');
  if (!box) return;
  const comanda = document.getElementById('buffet-comanda-num')?.value || 'COM-088';
  const pkg = parseFloat(document.getElementById('buffet-preco-kg')?.value) || 89.90;
  const tara = parseFloat(document.getElementById('buffet-tara-g')?.value) || 420;
  const bruto = parseFloat(document.getElementById('buffet-peso-bruto-g')?.value) || 1050;
  const token = typeof obterTokenDono === 'function' ? obterTokenDono() : (localStorage.getItem('chef_token') || '');

  try {
    const res = await fetch('/api/nichos/buffet/balanca/pesar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        comanda_num: comanda,
        tara_prato_g: tara,
        peso_bruto_g: bruto,
        preco_kg: pkg
      })
    });
    const d = await res.json();
    if (d && d.ok) {
      box.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:3px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong style="color:#06b6d4; font-size:13px;">${d.comanda}: R$ ${d.valor_total.toFixed(2)}</strong>
            <span style="background:rgba(6,182,212,0.15); color:#06b6d4; font-weight:800; font-size:10px; padding:2px 6px; border-radius:4px;">Peso Líquido: ${d.peso_liquido}</span>
          </div>
          <div style="font-size:11px; color:var(--text-sub);">Bruto: ${d.peso_bruto} | Tara Descontada: -${d.tara_descontada} | Preço/kg: R$ ${d.preco_quilo.toFixed(2)}</div>
        </div>
      `;
    }
  } catch(e) {
    box.innerHTML = '<span style="color:#ef4444;">Erro na leitura da balança.</span>';
  }
};

window.atualizarCubasBuffetDono = async function() {
  const container = document.getElementById('lista-cubas-buffet');
  if (!container) return;
  const token = typeof obterTokenDono === 'function' ? obterTokenDono() : (localStorage.getItem('chef_token') || '');

  try {
    const res = await fetch('/api/nichos/buffet/cubas/monitor', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const d = await res.json();
    if (d && d.ok && d.cubas && d.cubas.length > 0) {
      container.innerHTML = d.cubas.map(c => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.06);">
          <div>
            <strong>${c.cuba_nome}</strong>
            <div style="font-size:10.5px; color:var(--text-sub);">${c.capacidade_pct}% restante</div>
          </div>
          <span style="background:${c.capacidade_pct < 25 ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)'}; color:${c.capacidade_pct < 25 ? '#ef4444' : '#10b981'}; font-weight:800; padding:2px 8px; border-radius:6px; font-size:10px;">
            ${c.capacidade_pct < 25 ? '⚠️ REPOR URGENTE' : 'OK'}
          </span>
        </div>
      `).join('');
    } else {
      container.innerHTML = '<div style="color:var(--text-sub); text-align:center; padding:12px 0;">Cubas da pista operando normalmente.</div>';
    }
  } catch(e) {
    container.innerHTML = '<div style="color:var(--text-sub); text-align:center; padding:12px 0;">Erro ao consultar cubas.</div>';
  }
};

// 7. NICHO CAFETERIA & PADARIA
window.dispararFornadaPadariaDono = async function() {
  const box = document.getElementById('resultado-fornada-padaria');
  if (!box) return;
  const item = document.getElementById('padaria-fornada-item')?.value || 'Pão Francês';
  const qtd = parseInt(document.getElementById('padaria-fornada-qtd')?.value) || 80;
  const temp = parseInt(document.getElementById('padaria-fornada-temp')?.value) || 200;
  const token = typeof obterTokenDono === 'function' ? obterTokenDono() : (localStorage.getItem('chef_token') || '');

  try {
    const res = await fetch('/api/nichos/padaria/fornada/anunciar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        item_nome: item,
        quantidade_unidades: qtd,
        temperatura_graus: temp
      })
    });
    const d = await res.json();
    if (d && d.ok) {
      box.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:3px;">
          <div style="font-weight:800; color:#f59e0b; font-size:12.5px;">📢 ${d.mensagem}</div>
          <div style="font-size:11px; color:var(--text-sub); background:rgba(0,0,0,0.15); padding:6px; border-radius:6px;">${d.alerta_whatsapp}</div>
        </div>
      `;
      if (typeof showToast === 'function') showToast(`🥖 Fornada de ${item} anunciada!`, 'ph-bell-ringing', 'success');
    }
  } catch(e) {
    box.innerHTML = '<span style="color:#ef4444;">Erro ao disparar fornada.</span>';
  }
};

window.criarEncomendaPadariaDono = async function() {
  const box = document.getElementById('resultado-encomenda-padaria');
  if (!box) return;
  const cli = document.getElementById('padaria-encomenda-cliente')?.value || 'Cliente';
  const tel = document.getElementById('padaria-encomenda-tel')?.value || '11999999999';
  const item = document.getElementById('padaria-encomenda-item')?.value || 'Bolo Red Velvet';
  const tot = parseFloat(document.getElementById('padaria-encomenda-total')?.value) || 240.00;
  const token = typeof obterTokenDono === 'function' ? obterTokenDono() : (localStorage.getItem('chef_token') || '');

  try {
    const res = await fetch('/api/nichos/padaria/encomendas/criar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        cliente_nome: cli,
        cliente_telefone: tel,
        tipo_encomenda: item,
        valor_total: tot
      })
    });
    const d = await res.json();
    if (d && d.ok) {
      box.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:3px;">
          <div style="display:flex; justify-content:space-between;">
            <strong style="color:#10b981;">${d.cliente}: ${d.item}</strong>
            <span style="background:rgba(16,185,129,0.15); color:#10b981; font-weight:800; font-size:10px; padding:2px 6px; border-radius:4px;">50% Sinal Garantido</span>
          </div>
          <div style="font-size:11px; color:var(--text-sub);">Valor Total: R$ ${d.valor_total.toFixed(2)} | <strong>Caução Pix: R$ ${d.caucao_garantido_50pct.toFixed(2)}</strong> | Saldo: R$ ${d.saldo_a_receber_retirada.toFixed(2)}</div>
        </div>
      `;
    }
  } catch(e) {
    box.innerHTML = '<span style="color:#ef4444;">Erro ao criar encomenda.</span>';
  }
};

// 8. NICHO À LA CARTE
window.marcharPratoAlacarteDono = async function() {
  const box = document.getElementById('resultado-marcha-alacarte');
  if (!box) return;
  const mesa = document.getElementById('alacarte-mesa-num')?.value || 'Mesa 07';
  const etapa = document.getElementById('alacarte-etapa')?.value || 'prato_principal';
  const token = typeof obterTokenDono === 'function' ? obterTokenDono() : (localStorage.getItem('chef_token') || '');

  try {
    const res = await fetch('/api/nichos/alacarte/marchar-etapa', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        pedido_id: Math.floor(500 + Math.random() * 500),
        mesa_num: mesa,
        etapa_a_marchar: etapa
      })
    });
    const d = await res.json();
    if (d && d.ok) {
      box.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:3px;">
          <strong style="color:#6366f1;">🔔 Marcha Autorizada: ${d.mesa} (${d.etapa_marchada})</strong>
          <div style="font-size:11px; color:var(--text-sub);">${d.alerta_kds_chef}</div>
        </div>
      `;
      if (typeof showToast === 'function') showToast(`🔔 Marcha de ${d.etapa_marchada} despachada para o chef!`, 'ph-bell', 'info');
    }
  } catch(e) {
    box.innerHTML = '<span style="color:#ef4444;">Erro ao marchar prato.</span>';
  }
};

window.consultarSommelierDono = async function() {
  const box = document.getElementById('resultado-sommelier-alacarte');
  if (!box) return;
  const pratoId = document.getElementById('alacarte-prato-id')?.value || '1';
  const token = typeof obterTokenDono === 'function' ? obterTokenDono() : (localStorage.getItem('chef_token') || '');

  try {
    const res = await fetch(`/api/nichos/alacarte/harmonizar/${pratoId}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const d = await res.json();
    if (d && d.ok) {
      box.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:3px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong style="color:#ec4899; font-size:12.5px;">🍷 ${d.sommelier_ia.rotulo_recomendado} (${d.sommelier_ia.safra})</strong>
            <span style="background:rgba(236,72,153,0.15); color:#ec4899; font-weight:800; font-size:10px; padding:2px 6px; border-radius:4px;">R$ ${d.sommelier_ia.preco_garrafa.toFixed(2)}</span>
          </div>
          <div style="font-size:11px; color:var(--text); line-height:1.4;">${d.sommelier_ia.justificativa_harmonizacao}</div>
          <div style="font-size:10.5px; color:#10b981; margin-top:2px;">💡 <em>Dica de Venda: ${d.upsell_garcom}</em></div>
        </div>
      `;
    }
  } catch(e) {
    box.innerHTML = '<span style="color:#ef4444;">Erro ao consultar Sommelier IA.</span>';
  }
};

window.salvarRegraCobrancaPizzaDono = async function() {
  const regra = document.getElementById('pizza-regra-cobranca')?.value || 'maior_valor';
  const token = typeof obterTokenDono === 'function' ? obterTokenDono() : (localStorage.getItem('chef_token') || '');
  try {
    const res = await fetch('/api/nichos/pizzaria/config-regra', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ cobranca_tipo: regra })
    });
    const d = await res.json();
    if (d && d.ok && typeof showToast === 'function') {
      showToast(`🍕 Regra comercial salva: ${d.cobranca_tipo === 'maior_valor' ? 'Maior Valor' : 'Média Ponderada'}!`, 'ph-check-circle', 'success');
    }
  } catch(e) {}
};

window.consultarGiroChurrascariaDono = async function() {
  const token = typeof obterTokenDono === 'function' ? obterTokenDono() : (localStorage.getItem('chef_token') || '');
  try {
    const res = await fetch('/api/nichos/churrascaria/estatisticas-giro', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const d = await res.json();
    const box = document.getElementById('resultado-sinal-churrasco');
    if (box && d && d.ok) {
      box.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:4px;">
          <div style="display:flex; justify-content:space-between;">
            <strong style="color:#10b981;">🟢 ${d.mesas_verdes} Verdes | 🔴 ${d.mesas_vermelhas} Pausa</strong>
            <span style="background:rgba(16,185,129,0.15); color:#10b981; font-weight:800; font-size:10px; padding:2px 6px; border-radius:4px;">${d.taxa_consumo_ativo_pct}% Consumo Ativo</span>
          </div>
          <div style="font-size:11px; color:var(--text);">${d.recomendacao_churrasqueiro}</div>
          <div style="font-size:10.5px; color:var(--text-sub);">Previsão de consumo: <strong>${d.previsao_cortes_kg_proxima_hora} kg de carne</strong> na próxima hora.</div>
        </div>
      `;
    }
  } catch(e) {}
};

window.validarCombinadoSushiDono = async function(nome, totalPecas, sashimis) {
  const token = typeof obterTokenDono === 'function' ? obterTokenDono() : (localStorage.getItem('chef_token') || '');
  try {
    const res = await fetch('/api/nichos/sushi/trava-combinado', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({
        nome_combinado: nome || 'Combinado 20 Peças',
        total_pecas_solicitadas: totalPecas || 20,
        sashimis: sashimis || 6,
        niguiris: 6,
        uramakis: 4,
        hossomakis: 4
      })
    });
    return await res.json();
  } catch(e) { return { ok: false }; }
};

window.ativarPulseiraCashlessDono = async function(codigo, nome, valorRecarga) {
  const token = typeof obterTokenDono === 'function' ? obterTokenDono() : (localStorage.getItem('chef_token') || '');
  try {
    const res = await fetch('/api/nichos/bar/cashless/ativar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({
        codigo_cartao: codigo,
        cliente_nome: nome,
        valor_recarga: valorRecarga
      })
    });
    return await res.json();
  } catch(e) { return { ok: false }; }
};

window.testarEtiquetaBalancaDono = async function(codigoEan) {
  const token = typeof obterTokenDono === 'function' ? obterTokenDono() : (localStorage.getItem('chef_token') || '');
  try {
    const res = await fetch('/api/nichos/buffet/etiqueta-balanca/decodificar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ codigo_barras: codigoEan, modo: 'valor' })
    });
    return await res.json();
  } catch(e) { return { ok: false }; }
};

// Auto-inicializar nicho ativo no painel
setTimeout(() => {
  const nichoSalvo = localStorage.getItem('chef_nicho_ativo') || 'pizzaria';
  if (typeof window.trocarNichoOperacao === 'function') {
    window.trocarNichoOperacao(nichoSalvo);
  }
}, 1800);



window.isModoEdicaoDono = false;
let donoSortableInst = null;

window.toggleModoEdicao = function() {
  window.isModoEdicaoDono = !window.isModoEdicaoDono;
  const btn = document.getElementById('btn-edit-mode');
  const main = document.querySelector('main');
  if (!main) return;
  
  if (window.isModoEdicaoDono) {
    if(btn) btn.innerHTML = '<i class="ph-bold ph-check"></i> Salvar Layout';
    if(btn) btn.style.background = 'var(--green)';
    if(btn) btn.style.borderColor = 'var(--green)';
    
    // Sort DOM physically to match CSS order before initializing Sortable
    const elements = Array.from(main.children);
    elements.sort((a, b) => {
      const orderA = parseInt(a.style.order) || 99;
      const orderB = parseInt(b.style.order) || 99;
      return orderA - orderB;
    });
    elements.forEach(el => main.appendChild(el));
    
    const cfg = window.getDonoModularConfig();
    
    Array.from(main.children).forEach(el => {
      if (!el.id || el.id === 'modal-reordenar-seccoes') return;
      el.style.position = 'relative';
      
      const conf = cfg.secoes.find(s => s.id === el.id) || { largura: 'medium' };
      
      const editBar = document.createElement('div');
      editBar.className = 'dono-edit-bar';
      editBar.innerHTML = `
        <div class="drag-handle-main" style="cursor:grab; background:var(--card); padding:8px 12px; border-radius:8px; border:1px solid var(--border); margin-right:8px; display:inline-flex; align-items:center; font-weight:800; font-size:12px; color:var(--text);"><i class="ph-bold ph-arrows-out-cardinal" style="margin-right:6px;"></i> Mover</div>
        <select onchange="window.alterarParametroSecao('${el.id}', 'largura', this.value); window.aplicarDonoModularConfig()" style="padding:8px; border-radius:8px; background:var(--card); border:1px solid var(--border); color:var(--text); font-size:12px; font-weight:700;">
          <option value="small" ${conf.largura === 'small' ? 'selected' : ''}>Pequeno (1 Col)</option>
          <option value="medium" ${conf.largura === 'medium' ? 'selected' : ''}>Médio (2 Col)</option>
          <option value="large" ${conf.largura === 'large' ? 'selected' : ''}>Grande (Linha Toda)</option>
        </select>
        <button onclick="window.alterarParametroSecao('${el.id}', 'visivel', false); window.aplicarDonoModularConfig()" style="padding:8px 12px; border-radius:8px; background:#ef4444; border:none; color:#fff; font-size:12px; font-weight:800; margin-left:8px; cursor:pointer;"><i class="ph-bold ph-eye-slash"></i> Ocultar</button>
      `;
      editBar.style.position = 'absolute';
      editBar.style.top = '10px';
      editBar.style.right = '10px';
      editBar.style.zIndex = '99';
      editBar.style.display = 'flex';
      editBar.style.background = 'rgba(0,0,0,0.6)';
      editBar.style.padding = '8px';
      editBar.style.borderRadius = '12px';
      editBar.style.backdropFilter = 'blur(4px)';
      
      el.appendChild(editBar);
    });
    
    if (typeof Sortable !== 'undefined') {
      donoSortableInst = new Sortable(main, {
        handle: '.drag-handle-main',
        animation: 150,
        onEnd: function() {
          const newCfg = window.getDonoModularConfig();
          const items = main.children;
          let orderCounter = 1;
          Array.from(items).forEach(item => {
            if (item.id) {
              const confSec = newCfg.secoes.find(s => s.id === item.id);
              if (confSec) {
                confSec.ordem = orderCounter++;
              }
            }
          });
          window.salvarDonoModularConfig(newCfg);
        }
      });
    }
  } else {
    if(btn) btn.innerHTML = '<i class="ph-bold ph-pencil-simple"></i> Modo Edição';
    if(btn) btn.style.background = 'var(--yellow)';
    if(btn) btn.style.borderColor = 'var(--yellow)';
    
    document.querySelectorAll('.dono-edit-bar').forEach(el => el.remove());
    if (donoSortableInst) {
      donoSortableInst.destroy();
      donoSortableInst = null;
    }
    window.aplicarDonoModularConfig();
  }
};
