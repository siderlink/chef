
        const API_BASE = '/api/hub-marketing';
        let state = {
            perfis: [],
            segmentos: [],
            campanhas: [],
            produtos: [],
            vendas: [],
            automacoes: [],
            plataformas: [],
            alertasPotenciais: [],
            alertasFiltroAtual: 'todos',
            mapaHorarios: null,
            radarDinheiro: null,
            _loadingViews: new Set(),
            _abortControllers: new Map()
        };

        // Debounce utility
        function debounce(fn, ms = 350) {
            let timer;
            return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
        }

        // Guard against double-loading the same view
        function guardLoad(viewName) {
            if (state._loadingViews.has(viewName)) return false;
            state._loadingViews.add(viewName);
            return true;
        }
        function releaseLoad(viewName) {
            state._loadingViews.delete(viewName);
        }

        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
                
                e.currentTarget.classList.add('active');
                const target = e.currentTarget.getAttribute('data-target');
                const targetSection = document.getElementById(target);
                if (targetSection) {
                    targetSection.classList.add('active');
                }
                
                document.getElementById('view-title').innerText = e.currentTarget.innerText.replace(/[^\w\sÀ-ÿ]/gi, '').trim();
                
                loadDataForView(target);
            });
        });

        function goToView(target) {
            const navItem = document.querySelector(`.nav-item[data-target="${target}"]`);
            if (navItem) {
                navItem.click();
            }
        }

        // API Helpers
        async function apiCall(endpoint, options = {}) {
            const urlParams = new URLSearchParams(window.location.search);
            const urlToken = urlParams.get('token');
            if (urlToken) {
                try { localStorage.setItem('superAdminToken', urlToken); } catch(e) {}
            }
            const token = urlToken || localStorage.getItem('superAdminToken') || localStorage.getItem('token') || '';

            // Abort any previous in-flight request to the same endpoint (GET only)
            const method = (options.method || 'GET').toUpperCase();
            if (method === 'GET') {
                const prev = state._abortControllers.get(endpoint);
                if (prev) prev.abort();
            }
            const controller = new AbortController();
            if (method === 'GET') state._abortControllers.set(endpoint, controller);

            // Timeout after 30s
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            const defaultOptions = {
                headers: {
                    'Authorization': token ? `Bearer ${token}` : '',
                    'x-super-admin-token': token,
                    'Content-Type': 'application/json'
                }
            };
            try {
                const res = await fetch(`${API_BASE}${endpoint}`, {
                    ...defaultOptions,
                    ...options,
                    signal: controller.signal,
                    headers: { ...defaultOptions.headers, ...(options.headers || {}) }
                });
                clearTimeout(timeoutId);
                if (method === 'GET') state._abortControllers.delete(endpoint);
                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    return { ok: false, erro: errData.erro || `HTTP ${res.status}` };
                }
                return await res.json();
            } catch (error) {
                clearTimeout(timeoutId);
                if (method === 'GET') state._abortControllers.delete(endpoint);
                if (error.name === 'AbortError') {
                    return { ok: false, erro: 'Requisição cancelada (timeout ou substituída)', aborted: true };
                }
                console.error(`[apiCall] ${endpoint}:`, error);
                showToast('Erro de comunicação com o servidor', 'danger');
                return { ok: false, erro: error.message };
            }
        }

        // Toasts
        function showToast(message, type = 'info') {
            const container = document.getElementById('toast-container');
            if (!container) return;
            const icons = { success: '✅', danger: '❌', warning: '⚠️', info: 'ℹ️' };
            const colors = { danger: '#ef4444', success: '#10b981', warning: '#f59e0b', info: '#3b82f6' };
            const toast = document.createElement('div');
            toast.className = `toast badge-${type}`;
            toast.style.background = colors[type] || colors.info;
            toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span> <span>${message}</span>`;
            container.appendChild(toast);
            const duration = type === 'danger' ? 5000 : 3500;
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(100%)';
                toast.style.transition = 'all 0.3s ease';
                setTimeout(() => toast.remove(), 300);
            }, duration);
        }

        // Modals
        function openModal(id) { document.getElementById(id).classList.add('active'); }
        function closeModal(id) { document.getElementById(id).classList.remove('active'); }

        // Formatting Helpers
        function formatMoeda(val) {
            const num = parseFloat(val) || 0;
            return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        }

        function formatData(dateStr) {
            if (!dateStr) return '-';
            try {
                const d = new Date(dateStr);
                if (isNaN(d.getTime())) return dateStr;
                return d.toLocaleDateString('pt-BR');
            } catch (e) {
                return dateStr;
            }
        }

        // Loaders
        async function loadDataForView(view) {
            switch (view) {
                case 'dashboard':           loadDashboard(); break;
                case 'copiloto-ia':         loadCopilotoContexto(); break;
                case 'economia-desempenho': loadEconomiaDesempenho(); break;
                case 'alertas-potenciais':  loadAlertasPotenciais(); break;
                case 'mapas-calor':         loadMapasCalor('horarios'); break;
                case 'radar-dinheiro':      loadRadarDinheiro(); break;
                case 'perfis':              loadPerfis(); break;
                case 'segmentos':           loadSegmentos(); break;
                case 'campanhas':           loadCampanhas(); break;
                case 'produtos':            loadProdutos(); break;
                case 'vendas':              loadVendas(); break;
                case 'automacoes':          loadAutomacoes(); break;
                case 'plataformas':         loadPlataformas(); break;
                case 'analytics':           showAnalyticsTab('rfm'); break;
            }
        }

        async function syncPerfis() {
            showToast('Sincronizando perfis e agregando clientes...', 'info');
            const res = await apiCall('/sync-perfis', { method: 'POST' });
            if (res.ok) {
                showToast(`Perfis sincronizados: ${res.novos || 0} novos, ${res.atualizados || 0} atualizados!`, 'success');
                loadDashboard();
                loadAlertasPotenciais();
            } else {
                showToast(res.erro || 'Erro ao sincronizar perfis', 'danger');
            }
        }

        // 📊 DASHBOARD
        async function loadDashboard() {
            if (!guardLoad('dashboard')) return;
            try {
                const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };

                const res = await apiCall('/dashboard');
                if (res && res.ok && res.dados) {
                    const d = res.dados;
                    setEl('dash-total-perfis', d.total_perfis || 0);
                    setEl('header-total-perfis', d.total_perfis || 0);
                    setEl('dash-segmentos', d.segmentos_ativos || 0);
                    setEl('dash-campanhas', d.campanhas_ativas || 0);
                    setEl('dash-vendas', formatMoeda(d.vendas_mes || 0));

                    if (d.funil) {
                        const funnel = document.getElementById('funnel-chart');
                        if (funnel) {
                            const stages = [
                                { icon: '👥', label: 'Cadastrados', val: d.funil.cadastrados || 0, w: '100%', op: 1 },
                                { icon: '🔥', label: 'Engajados',   val: d.funil.engajados   || 0, w: '75%',  op: 0.9 },
                                { icon: '💳', label: 'Compradores', val: d.funil.compradores || 0, w: '50%',  op: 0.8 },
                                { icon: '👑', label: 'VIPs',        val: d.funil.vips        || 0, w: '25%',  op: 0.7 }
                            ];
                            funnel.innerHTML = stages.map(s =>
                                `<div class="funnel-stage" style="width: ${s.w}; opacity: ${s.op};">${s.icon} ${s.label}: ${s.val}</div>`
                            ).join('');
                        }
                    }

                    // Render top segments
                    if (d.top_segmentos) {
                        const topList = document.getElementById('top-segmentos-list');
                        if (topList) {
                            topList.innerHTML = d.top_segmentos.map(s =>
                                `<div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--glass-border);">
                                    <span>${s.icone || '👥'} ${s.nome}</span>
                                    <strong style="color: #34d399;">${s.total_clientes || 0}</strong>
                                </div>`
                            ).join('');
                        }
                    }
                } else {
                    setEl('dash-total-perfis', state.perfis.length || '0');
                    setEl('header-total-perfis', state.perfis.length || '0');
                }

                // Load IA insights and alerts badge in parallel
                await Promise.allSettled([
                    loadInsightsAutomaticos(),
                    apiCall('/alertas-potenciais').then(al => {
                        if (al && al.ok && al.dados) {
                            const count = al.dados.total_alertas || (al.dados.alertas ? al.dados.alertas.length : 0);
                            setEl('header-potenciais-badge', count);
                        }
                    })
                ]);
            } finally {
                releaseLoad('dashboard');
            }
        }

        // 🚨 ALERTAS DE CLIENTES POTENCIAIS
        async function loadAlertasPotenciais() {
            const container = document.getElementById('lista-alertas-potenciais');
            container.innerHTML = '<div class="glass" style="padding: 40px; text-align: center; color: var(--text-muted);">Carregando radar de oportunidades...</div>';

            const res = await apiCall('/alertas-potenciais');
            const data = res?.data || res?.dados;
            if (!res || !res.ok || !data) {
                container.innerHTML = `<div class="glass" style="padding: 30px; text-align: center; color: #ef4444;">${res?.erro || 'Erro ao carregar oportunidades de clientes.'}</div>`;
                return;
            }

            state.alertasPotenciais = data.alertas || [];
            const r = data.resumo || {};

            const nBaleias = r.total_baleias ?? r.baleias ?? 0;
            const nAscensao = r.total_ascensao ?? r.ascensao ?? 0;
            const nChurn = r.total_risco_vip ?? r.churn ?? 0;
            const nAniversario = r.total_aniversarios ?? r.aniversario ?? 0;
            const nAltoTicket = r.total_novos_alto_potencial ?? r.alto_ticket ?? 0;

            // Update KPIs
            document.getElementById('kpi-baleias').innerText = nBaleias;
            document.getElementById('kpi-ascensao').innerText = nAscensao;
            document.getElementById('kpi-churn').innerText = nChurn;
            document.getElementById('kpi-aniversario').innerText = nAniversario;
            document.getElementById('kpi-alto-ticket').innerText = nAltoTicket;

            // Update filter badges
            document.getElementById('count-todos').innerText = state.alertasPotenciais.length;
            document.getElementById('count-baleias').innerText = nBaleias;
            document.getElementById('count-ascensao').innerText = nAscensao;
            document.getElementById('count-churn').innerText = nChurn;
            document.getElementById('count-aniversario').innerText = nAniversario;
            document.getElementById('count-alto-ticket').innerText = nAltoTicket;

            // Header badge
            const badge = document.getElementById('header-potenciais-badge');
            if (badge) badge.innerText = state.alertasPotenciais.length;

            renderAlertasCards(state.alertasFiltroAtual);
        }

        function filtrarAlertas(categoria) {
            state.alertasFiltroAtual = categoria;
            document.querySelectorAll('.btn-filtro-alerta').forEach(btn => {
                if (btn.getAttribute('data-categoria') === categoria) {
                    btn.classList.add('btn-primary');
                    btn.classList.remove('btn-glass');
                } else {
                    btn.classList.remove('btn-primary');
                    btn.classList.add('btn-glass');
                }
            });
            renderAlertasCards(categoria);
        }

        function renderAlertasCards(filtro) {
            const container = document.getElementById('lista-alertas-potenciais');
            const lista = filtro === 'todos' 
                ? state.alertasPotenciais 
                : state.alertasPotenciais.filter(a => a.categoria === filtro);

            if (!lista || lista.length === 0) {
                container.innerHTML = `
                    <div class="glass" style="padding: 40px; text-align: center;">
                        <span style="font-size: 2.5rem; display: block; margin-bottom: 10px;">✨</span>
                        <h4 style="font-size: 1.1rem; color: var(--text-main); margin-bottom: 6px;">Nenhum alerta nesta categoria no momento</h4>
                        <p style="color: var(--text-muted); font-size: 0.85rem;">Todos os clientes desta categoria estão engajados ou ainda não há novos registros.</p>
                    </div>
                `;
                return;
            }

            const badgesMap = {
                'baleias': { label: '🐋 Baleia / Whale VIP', bg: 'rgba(99,102,241,0.2)', color: '#818cf8', border: '#6366f1' },
                'ascensao': { label: '🚀 Em Ascensão Rápida', bg: 'rgba(16,185,129,0.2)', color: '#34d399', border: '#10b981' },
                'churn': { label: '⚠️ Risco de Perda VIP', bg: 'rgba(239,68,68,0.2)', color: '#f87171', border: '#ef4444' },
                'aniversario': { label: '🎂 Aniversariante do Mês', bg: 'rgba(245,158,11,0.2)', color: '#fbbf24', border: '#f59e0b' },
                'alto_ticket': { label: '🌟 Novo de Alto Ticket', bg: 'rgba(236,72,153,0.2)', color: '#f472b6', border: '#ec4899' }
            };

            let html = '';
            lista.forEach(item => {
                const b = badgesMap[item.categoria] || { label: 'Oportunidade', bg: 'rgba(255,255,255,0.1)', color: '#fff', border: 'transparent' };
                const cleanPhone = (item.telefone || '').replace(/\D/g, '');
                const waText = encodeURIComponent(item.mensagem_whatsapp || `Olá ${item.nome}! Temos uma surpresa especial para você no Cheff.pro.`);
                const waLink = cleanPhone ? `https://wa.me/55${cleanPhone}?text=${waText}` : '#';

                html += `
                    <div class="alerta-item-card" style="border-left: 4px solid ${b.border};">
                        <div style="flex: 1;">
                            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                                <span class="alerta-badge-pill" style="background: ${b.bg}; color: ${b.color};">
                                    ${b.label}
                                </span>
                                <h4 style="font-size: 1.1rem; font-weight: 700; margin: 0; color: #fff;">${item.nome || 'Cliente sem nome'}</h4>
                                <span style="font-size: 0.8rem; color: var(--text-muted);">${item.telefone || 'Sem telefone'}</span>
                            </div>

                            <div style="display: flex; gap: 16px; margin-bottom: 10px; font-size: 0.85rem; color: var(--text-muted); flex-wrap: wrap;">
                                <span>💰 Gasto Total: <b style="color: #34d399;">${formatMoeda(item.total_gasto || item.gasto_total)}</b></span>
                                <span>🏷️ Ticket Médio: <b style="color: #fff;">${formatMoeda(item.ticket_medio)}</b></span>
                                <span>🔄 Visitas: <b style="color: #fff;">${item.total_visitas || item.visitas || 1}</b></span>
                                <span>📅 Última Visita: <b style="color: #fff;">${formatData(item.ultimo_acesso || item.ultima_visita)}</b></span>
                                ${item.dias_sem_visita ? `<span style="color: #f87171;">⏱️ Há <b>${item.dias_sem_visita} dias</b> sem vir</span>` : ''}
                            </div>

                            <div style="background: rgba(255,255,255,0.03); border-radius: 8px; padding: 10px 14px; font-size: 0.85rem; border-left: 3px solid ${b.color};">
                                <span style="font-weight: 700; color: ${b.color};">💡 Estratégia Sugerida: </span>
                                <span style="color: var(--text-main);">${item.acao_sugerida || item.recomendacao || 'Ofereça um benefício especial para garantir a retenção deste cliente.'}</span>
                            </div>
                        </div>

                        <div style="display: flex; flex-direction: column; gap: 8px; min-width: 170px;">
                            ${cleanPhone ? `
                                <a href="${waLink}" target="_blank" class="btn btn-primary" style="background: #25d366; color: #fff; text-align: center; text-decoration: none; font-weight: 700; font-size: 0.85rem; display: flex; align-items: center; justify-content: center; gap: 6px;">
                                    📲 WhatsApp Direto
                                </a>
                            ` : `
                                <button class="btn btn-glass" disabled style="opacity: 0.5; font-size: 0.85rem;">Sem WhatsApp</button>
                            `}
                            <button class="btn btn-glass" style="font-size: 0.85rem;" onclick="verDetalhesPerfil(${item.id || 0})">
                                👤 Ver Perfil
                            </button>
                        </div>
                    </div>
                `;
            });

            container.innerHTML = html;
        }

        // 🔥 MAPAS DE CALOR
        function switchMapaCalorTab(tab) {
            document.querySelectorAll('#mapas-calor .btn').forEach(btn => {
                if (btn.id === `btn-tab-calor-${tab}`) {
                    btn.classList.add('btn-primary');
                    btn.classList.remove('btn-glass');
                } else if (btn.id.startsWith('btn-tab-calor-')) {
                    btn.classList.remove('btn-primary');
                    btn.classList.add('btn-glass');
                }
            });

            document.getElementById('subtab-calor-horarios').style.display = tab === 'horarios' ? 'block' : 'none';
            document.getElementById('subtab-calor-geo').style.display = tab === 'geo' ? 'block' : 'none';
            document.getElementById('subtab-calor-mesas').style.display = tab === 'mesas' ? 'block' : 'none';

            loadMapasCalor(tab);
        }

        async function loadMapasCalor(tipo) {
            if (tipo === 'horarios') {
                const res = await apiCall('/mapa-calor/horarios');
                const d = res?.data || res?.dados;
                if (!res || !res.ok || !d) return;

                state.mapaHorarios = d;

                const gHour = (d.goldenHours && d.goldenHours[0]) 
                    ? `${d.goldenHours[0].dia_nome || ''} (${d.goldenHours[0].hora}:00)` 
                    : (d.golden_hours || '19:00 - 22:00');
                const sHour = (d.silentHours && d.silentHours[0]) 
                    ? `${d.silentHours[0].dia_nome || ''} (${d.silentHours[0].hora || ''})` 
                    : (d.silent_hours || '15:00 - 18:00');
                const mDia = (d.goldenHours && d.goldenHours[0]) 
                    ? (d.goldenHours[0].dia_nome || 'Sexta-feira') 
                    : (d.melhor_dia || 'Sexta-feira');

                document.getElementById('heat-golden-hours').innerText = gHour;
                document.getElementById('heat-silent-hours').innerText = sHour;
                document.getElementById('heat-melhor-dia').innerText = mDia;

                // Render Header Columns 00h to 23h
                const headerRow = document.getElementById('heat-header-horas');
                headerRow.innerHTML = '<th style="min-width: 80px; text-align: left;">Dia / Hora</th>';
                for (let h = 0; h < 24; h++) {
                    const th = document.createElement('th');
                    th.innerText = `${h.toString().padStart(2, '0')}h`;
                    headerRow.appendChild(th);
                }

                // Render Matrix Rows (7 days)
                const tbody = document.getElementById('tabela-matriz-calor-body');
                tbody.innerHTML = '';
                const diasNomes = d.diasNomes || ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
                const matriz = d.matriz || [];

                for (let diaIdx = 0; diaIdx < 7; diaIdx++) {
                    const tr = document.createElement('tr');
                    const tdDia = document.createElement('td');
                    tdDia.className = 'heatmap-day-label';
                    tdDia.innerText = diasNomes[diaIdx];
                    tr.appendChild(tdDia);

                    for (let h = 0; h < 24; h++) {
                        let cellData = null;
                        if (Array.isArray(matriz[diaIdx]) && matriz[diaIdx][h]) {
                            cellData = matriz[diaIdx][h];
                        } else if (Array.isArray(matriz)) {
                            cellData = matriz.find(m => m.dia_semana === diaIdx && m.hora === h) || matriz.find(m => m.dia === diaIdx && m.hora === h);
                        }
                        if (!cellData) cellData = { intensidade: 0, pedidos: 0, faturamento: 0 };

                        const td = document.createElement('td');
                        const p = cellData.intensidade || 0;
                        
                        // Dynamic heatmap color
                        let bg = 'rgba(255,255,255,0.03)';
                        let textColor = 'rgba(255,255,255,0.4)';
                        if (p > 75) {
                            bg = 'linear-gradient(135deg, #ef4444, #ec4899)';
                            textColor = '#fff';
                        } else if (p > 50) {
                            bg = 'linear-gradient(135deg, #f59e0b, #ef4444)';
                            textColor = '#fff';
                        } else if (p > 25) {
                            bg = 'linear-gradient(135deg, #3b82f6, #f59e0b)';
                            textColor = '#fff';
                        } else if (p > 0) {
                            bg = 'rgba(59, 130, 246, 0.35)';
                            textColor = '#cbd5e1';
                        }

                        td.style.background = bg;
                        td.style.color = textColor;
                        td.innerText = cellData.pedidos > 0 ? cellData.pedidos : '';
                        td.title = `${diasNomes[diaIdx]} às ${h}h: ${cellData.pedidos} pedidos (${formatMoeda(cellData.faturamento)})`;

                        td.onclick = () => {
                            const detail = document.getElementById('heat-cell-detail');
                            detail.style.display = 'block';
                            detail.innerHTML = `
                                <strong>📅 ${diasNomes[diaIdx]} às ${h.toString().padStart(2, '0')}:00</strong> &nbsp;|&nbsp; 
                                Pedidos: <b>${cellData.pedidos}</b> &nbsp;|&nbsp; 
                                Faturamento: <b>${formatMoeda(cellData.faturamento)}</b> &nbsp;|&nbsp; 
                                Intensidade de Pico: <b>${cellData.intensidade}%</b> &nbsp;|&nbsp; 
                                <span style="color: #34d399;">💡 ${cellData.intensidade > 60 ? 'Momento ideal para combos rápidos e pratos de alto valor!' : 'Horário com capacidade ociosa: recomendado ativar campanha de cupom relâmpago ou Happy Hour.'}</span>
                            `;
                        };

                        tr.appendChild(td);
                    }
                    tbody.appendChild(tr);
                }

            } else if (tipo === 'geo') {
                const tbody = document.getElementById('tabela-calor-geo');
                tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">Consultando mapa geográfico...</td></tr>';
                const res = await apiCall('/mapa-calor/geografico');
                const d = res?.data || res?.dados;
                if (!res || !res.ok || !d) {
                    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #ef4444;">${res?.erro || 'Erro ao carregar dados geográficos.'}</td></tr>`;
                    return;
                }

                const lista = d.bairros || d.ranking || [];
                if (lista.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">Nenhum bairro registrado ainda. Faça pedidos informando o endereço do cliente.</td></tr>';
                    return;
                }

                let html = '';
                lista.forEach(item => {
                    const pct = Math.min(100, Math.round(item.percentual_receita || item.pct_faturamento || 0));
                    html += `
                        <tr>
                            <td><strong style="color: #fff;">${item.bairro || 'Centro'}</strong></td>
                            <td>${item.cidade || 'Principal'}</td>
                            <td>${item.total_clientes || item.clientes || 0}</td>
                            <td>${item.total_pedidos || item.pedidos || 0}</td>
                            <td><strong style="color: #34d399;">${formatMoeda(item.faturamento_total || item.faturamento)}</strong></td>
                            <td>${formatMoeda(item.ticket_medio)}</td>
                            <td>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <div style="flex: 1; height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden;">
                                        <div style="width: ${pct}%; height: 100%; background: #6366f1;"></div>
                                    </div>
                                    <span style="font-size: 0.75rem; font-weight: 700;">${pct}%</span>
                                </div>
                            </td>
                            <td>
                                <button class="btn btn-glass" style="font-size: 0.75rem; padding: 4px 8px;" onclick="criarCampanhaParaBairro('${item.bairro}')">
                                    🎯 Criar Campanha
                                </button>
                            </td>
                        </tr>
                    `;
                });
                tbody.innerHTML = html;

            } else if (tipo === 'mesas') {
                const tbody = document.getElementById('tabela-calor-mesas');
                tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Mapeando salão...</td></tr>';
                const res = await apiCall('/mapa-calor/mesas');
                const d = res?.data || res?.dados;
                if (!res || !res.ok || !d) {
                    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #ef4444;">${res?.erro || 'Erro ao carregar dados de salão.'}</td></tr>`;
                    return;
                }

                const lista = d.mesas || d.ranking || [];
                if (lista.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Nenhum pedido vinculado a mesas encontrado.</td></tr>';
                    return;
                }

                let html = '';
                lista.forEach(item => {
                    const fat = item.faturamento || item.total_faturamento || 0;
                    const rent = fat > 1000 ? '🥇 Mesa Diamante' : (fat > 400 ? '🥈 Mesa Ouro' : '🥉 Mesa Regular');
                    html += `
                        <tr>
                            <td><strong style="color: #fff;">${item.mesa || 'Balcão'}</strong></td>
                            <td>${item.atendimentos || item.pedidos || 0} pedidos</td>
                            <td><strong style="color: #34d399;">${formatMoeda(fat)}</strong></td>
                            <td>${formatMoeda(item.ticket_medio)}</td>
                            <td>${item.giro_medio || item.rotatividade || '1.2x / dia'}</td>
                            <td><span class="badge badge-info">${rent}</span></td>
                        </tr>
                    `;
                });
                tbody.innerHTML = html;
            }
        }

        function criarCampanhaParaBairro(bairro) {
            goToView('campanhas');
            showToast(`Iniciando campanha para clientes de ${bairro}`, 'info');
        }

        // 💎 RADAR DE MONETIZAÇÃO (ONDE O DINHEIRO ESTÁ & PARETO 80/20)
        async function loadRadarDinheiro() {
            const res = await apiCall('/radar-dinheiro');
            const d = res?.data || res?.dados;
            if (!res || !res.ok || !d) {
                showToast('Erro ao carregar radar financeiro', 'danger');
                return;
            }

            state.radarDinheiro = d;

            // Headline Pareto
            const pareto = d.paretoClientes || d.pareto || {};
            const pctClientes = pareto.pctClientes || pareto.percentual_clientes || 20;
            const fatTop = pareto.faturamento_top || pareto.faturamento80 || 0;
            const nTopWhales = (pareto.topWhales && pareto.topWhales.length) || pareto.clientes_top || 0;

            document.getElementById('pareto-headline').innerText = `80% da sua receita vem de apenas ${pctClientes}% dos seus clientes!`;
            document.getElementById('pareto-descricao').innerText = `Um grupo de apenas ${nTopWhales} clientes de alto valor é o motor do faturamento vital do negócio.`;
            document.getElementById('pareto-ticket-top').innerText = formatMoeda(pareto.ticket_medio_top || 0);
            document.getElementById('pareto-ticket-resto').innerText = formatMoeda(pareto.ticket_medio_resto || 0);
            document.getElementById('pareto-bar').style.width = '80%';
            document.getElementById('pareto-pct-clientes').innerText = `Top ${pctClientes}% dos Clientes`;

            // Top Produtos Motores de Lucro
            const topTbody = document.getElementById('tabela-radar-top-produtos');
            const produtos = (d.paretoProdutos && d.paretoProdutos.top3Receita) || d.top_produtos || [];
            if (produtos.length === 0) {
                topTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Nenhum pedido computado ainda.</td></tr>';
            } else {
                let html = '';
                const medals = ['🥇 1º', '🥈 2º', '🥉 3º', '4º', '5º', '6º', '7º', '8º', '9º', '10º'];
                produtos.forEach((p, idx) => {
                    html += `
                        <tr>
                            <td><strong>${medals[idx] || (idx+1)+'º'}</strong></td>
                            <td><strong style="color: #fff;">${p.nome}</strong></td>
                            <td>${p.volume || p.qtd || 0} un</td>
                            <td><strong style="color: #34d399;">${formatMoeda(p.faturamento || p.receita)}</strong></td>
                            <td><span class="badge badge-success">${p.percentual_receita || p.pct || 0}%</span></td>
                        </tr>
                    `;
                });
                topTbody.innerHTML = html;
            }

            // Vazamentos de Lucro
            const vazamentosContainer = document.getElementById('lista-radar-vazamentos');
            const vazamentos = d.vazamentos || [];
            if (vazamentos.length === 0) {
                vazamentosContainer.innerHTML = '<div style="color: var(--text-muted); padding: 20px; text-align: center;">Nenhum gargalo severo identificado. Sua operação está otimizada!</div>';
            } else {
                let html = '';
                vazamentos.forEach(v => {
                    html += `
                        <div style="background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.2); border-radius: 8px; padding: 14px; margin-bottom: 10px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                <strong style="color: #f87171; font-size: 0.9rem;">⚠️ ${v.titulo || v.motivo}</strong>
                                <span class="badge badge-danger">${v.impacto_estimado || 'Alto Impacto'}</span>
                            </div>
                            <p style="font-size: 0.82rem; color: var(--text-muted); margin: 0 0 8px 0; line-height: 1.4;">${v.descricao || v.motivo}</p>
                            <div style="font-size: 0.78rem; color: #34d399; font-weight: 600;">
                                💡 Solução Imediata: ${v.solucao || v.acao}
                            </div>
                        </div>
                    `;
                });
                vazamentosContainer.innerHTML = html;
            }
        }

        async function executarAcaoRapida(tipo) {
            const acoes = {
                resgate_vip: {
                    payload: { tipo: 'resgate_vip', acao: 'notificar_inativos_vip' },
                    sucesso: '🚀 Campanha VIP de Resgate ativada para clientes inativos!'
                },
                happy_hour: {
                    payload: { tipo: 'happy_hour', desconto: 15 },
                    sucesso: '⚡ Preço Dinâmico / Happy Hour ativado nos horários ociosos com sucesso!'
                },
                cross_sell: {
                    payload: { tipo: 'cross_sell', modo: 'combo_automatico' },
                    sucesso: '🍔 Combo Cross-Sell ativado no prato #1 do cardápio digital!'
                }
            };

            const acao = acoes[tipo];
            if (!acao) { showToast('Ação desconhecida', 'warning'); return; }

            showToast('Executando ação estratégica...', 'info');
            try {
                const res = await apiCall('/automacoes/executar-acao-rapida', {
                    method: 'POST',
                    body: JSON.stringify(acao.payload)
                });
                if (res.ok) {
                    showToast(acao.sucesso, 'success');
                    loadDashboard();
                } else {
                    showToast(res.erro || 'Falha ao executar ação', 'danger');
                }
            } catch (e) {
                showToast('Erro na execução: ' + e.message, 'danger');
            }
        }

        async function verDetalhesPerfil(id) {
            if (!id) return;
            const res = await apiCall(`/perfis/${id}`);
            if (res && res.ok && res.dados) {
                const p = res.dados;
                const container = document.getElementById('perfil-detalhes');
                container.innerHTML = `
                    <div style="display: flex; gap: 20px; align-items: center; margin-bottom: 20px;">
                        <div style="width: 60px; height: 60px; border-radius: 50%; background: #6366f1; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 800;">
                            ${(p.nome || 'C').charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h3 style="margin: 0; color: #fff;">${p.nome || 'Cliente'}</h3>
                            <div style="color: var(--text-muted); font-size: 0.85rem; margin-top: 4px;">
                                📞 ${p.telefone || '-'} &nbsp;|&nbsp; ✉️ ${p.email || '-'}
                            </div>
                        </div>
                    </div>
                    <div class="grid-3" style="margin-bottom: 20px;">
                        <div class="glass" style="padding: 12px;">
                            <div style="font-size: 0.75rem; color: var(--text-muted);">TOTAL GASTO</div>
                            <div style="font-size: 1.2rem; font-weight: 800; color: #34d399;">${formatMoeda(p.total_gasto)}</div>
                        </div>
                        <div class="glass" style="padding: 12px;">
                            <div style="font-size: 0.75rem; color: var(--text-muted);">TICKET MÉDIO</div>
                            <div style="font-size: 1.2rem; font-weight: 800; color: #fff;">${formatMoeda(p.ticket_medio)}</div>
                        </div>
                        <div class="glass" style="padding: 12px;">
                            <div style="font-size: 0.75rem; color: var(--text-muted);">VISITAS</div>
                            <div style="font-size: 1.2rem; font-weight: 800; color: #818cf8;">${p.total_visitas || 0}</div>
                        </div>
                    </div>
                    <div class="glass" style="padding: 16px; margin-bottom: 16px;">
                        <h4 style="margin-bottom: 8px;">Itens Favoritos</h4>
                        <p style="font-size: 0.85rem; color: var(--text-main);">${p.itens_favoritos || 'Nenhum item computado ainda'}</p>
                    </div>
                    <div style="display: flex; justify-content: flex-end; gap: 10px;">
                        <button class="btn btn-glass" onclick="closeModal('modal-perfil')">Fechar</button>
                    </div>
                `;
                openModal('modal-perfil');
            } else {
                showToast('Não foi possível carregar os detalhes do perfil', 'danger');
            }
        }

        // Render Functions (Simplified for demonstration)
        async function loadPerfis() {
            const tbody = document.getElementById('tabela-perfis');
            if (!tbody) return;
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">Carregando perfis...</td></tr>';

            const busca = (document.getElementById('busca-perfil')?.value || '').trim();
            const segmento = document.getElementById('filtro-segmento')?.value || '';

            const params = new URLSearchParams();
            if (busca) params.set('busca', busca);
            if (segmento) params.set('segmento_id', segmento);
            const qs = params.toString() ? `?${params}` : '';

            try {
                const res = await apiCall(`/perfis${qs}`);
                const list = res?.dados?.perfis || res?.dados || [];
                state.perfis = list;

                if (list.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">${busca ? 'Nenhum perfil encontrado para a busca.' : 'Nenhum perfil cadastrado. Clique em Sincronizar Perfis.'}</td></tr>`;
                    return;
                }
                tbody.innerHTML = list.map(p => `
                    <tr>
                        <td><strong>${p.nome || 'Cliente'}</strong></td>
                        <td>${p.telefone || '-'}</td>
                        <td>${p.total_visitas || 0}</td>
                        <td><strong style="color: #34d399;">${formatMoeda(p.total_gasto)}</strong></td>
                        <td>${formatMoeda(p.ticket_medio)}</td>
                        <td><span class="badge badge-success">${p.score_engajamento || 0}</span></td>
                        <td><span class="badge badge-info">${p.frequencia_visita || 'novo'}</span></td>
                        <td><button class="btn btn-glass" onclick="verDetalhesPerfil(${p.id})">Ver</button></td>
                    </tr>
                `).join('');
            } catch (e) {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #ef4444;">Erro ao carregar perfis</td></tr>';
            }
        }

        async function loadSegmentos() {
            const grid = document.getElementById('grid-segmentos');
            if (!grid) return;
            grid.innerHTML = '<div class="glass" style="padding: 20px; grid-column: span 3; text-align: center; color: var(--text-muted);">Carregando segmentos...</div>';
            try {
                const res = await apiCall('/segmentos');
                const list = res?.dados || [];
                if (list.length === 0) {
                    grid.innerHTML = '<div class="glass" style="padding: 20px; grid-column: span 3; text-align: center; color: var(--text-muted);">Nenhum segmento criado ainda.</div>';
                    return;
                }
                grid.innerHTML = list.map(s => `
                    <div class="glass" style="padding: 20px; border-top: 4px solid ${s.cor || 'var(--primary)'};">
                        <h4>${s.icone || '👥'} ${s.nome}</h4>
                        <p style="color: var(--text-muted); margin: 10px 0; font-size: 0.85rem;">${s.descricao || 'Sem descrição'}</p>
                        <div style="font-size: 1.5rem; font-weight: bold;">${s.total_clientes || 0} perfis</div>
                    </div>
                `).join('');
            } catch(e) {
                grid.innerHTML = '<div class="glass" style="padding: 20px; grid-column: span 3; text-align: center; color: #ef4444;">Erro ao carregar segmentos</div>';
            }
        }

        async function loadCampanhas() {
            const tbody = document.getElementById('tabela-campanhas');
            if (!tbody) return;
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Carregando campanhas...</td></tr>';
            try {
                const res = await apiCall('/campanhas');
                const list = res?.dados || [];
                if (list.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Nenhuma campanha cadastrada.</td></tr>';
                    return;
                }
                tbody.innerHTML = list.map(c => `
                    <tr>
                        <td><strong>${c.nome}</strong></td>
                        <td><span class="badge badge-info">${c.tipo}</span></td>
                        <td>${c.segmento_nome || 'Todos'}</td>
                        <td><span class="badge badge-success">${c.status}</span></td>
                        <td>${c.total_enviados || 0}</td>
                        <td>${formatData(c.criado_em)}</td>
                    </tr>
                `).join('');
            } catch(e) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #ef4444;">Erro ao carregar campanhas</td></tr>';
            }
        }

        async function loadProdutos() {
            const grid = document.getElementById('grid-produtos');
            if (!grid) return;
            grid.innerHTML = '<div class="glass" style="padding: 20px; grid-column: span 4; text-align: center; color: var(--text-muted);">Carregando produtos...</div>';
            try {
                const res = await apiCall('/produtos');
                const list = res?.dados || [];
                if (list.length === 0) {
                    grid.innerHTML = '<div class="glass" style="padding: 20px; grid-column: span 4; text-align: center; color: var(--text-muted);">Nenhum produto cadastrado no Hub.</div>';
                    return;
                }
                grid.innerHTML = list.map(p => `
                    <div class="glass" style="padding: 20px;">
                        <h4>${p.nome}</h4>
                        <span class="badge badge-primary">${p.tipo || 'Produto'}</span>
                        <div style="font-size: 1.5rem; font-weight: bold; margin-top: 10px; color: #34d399;">${formatMoeda(p.preco)}</div>
                    </div>
                `).join('');
            } catch(e) {
                grid.innerHTML = '<div class="glass" style="padding: 20px; grid-column: span 4; text-align: center; color: #ef4444;">Erro ao carregar produtos</div>';
            }
        }

        async function loadVendas() {
            const tbody = document.getElementById('tabela-vendas');
            if (!tbody) return;
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Carregando vendas...</td></tr>';

            const mes = document.getElementById('filtro-vendas-mes')?.value || '';
            const qs = mes ? `?mes=${mes}` : '';

            try {
                const res = await apiCall(`/vendas${qs}`);
                const list = res?.dados || [];
                if (list.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">${mes ? 'Nenhuma venda encontrada nesse período.' : 'Nenhuma venda registrada no Hub.'}</td></tr>`;
                    return;
                }
                tbody.innerHTML = list.map(v => `
                    <tr>
                        <td>${v.produto_nome || 'Produto'}</td>
                        <td>${v.cliente_nome || '-'}</td>
                        <td><strong>${formatMoeda(v.valor_total)}</strong></td>
                        <td>${formatData(v.criado_em)}</td>
                        <td><span class="badge badge-${v.status === 'cancelado' ? 'danger' : 'success'}">${v.status}</span></td>
                    </tr>
                `).join('');
            } catch (e) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #ef4444;">Erro ao carregar vendas</td></tr>';
            }
        }

        async function loadAutomacoes() {
            const grid = document.getElementById('grid-automacoes');
            if (!grid) return;
            grid.innerHTML = '<div class="glass" style="padding: 20px; grid-column: span 3; text-align: center; color: var(--text-muted);">Carregando automações...</div>';
            try {
                const res = await apiCall('/automacoes');
                const list = res?.dados || [];
                if (list.length === 0) {
                    grid.innerHTML = '<div class="glass" style="padding: 20px; grid-column: span 3; text-align: center; color: var(--text-muted);">Nenhuma automação configurada.</div>';
                    return;
                }
                grid.innerHTML = list.map(a => `
                    <div class="glass" style="padding: 20px;">
                        <div style="display: flex; justify-content: space-between;">
                            <h4>${a.nome}</h4>
                            <input type="checkbox" ${a.ativo ? 'checked' : ''} disabled>
                        </div>
                        <span class="badge badge-warning">Trigger: ${a.trigger_tipo}</span>
                        <p style="margin-top: 10px; font-size: 0.85rem; color: var(--text-muted);">${a.descricao || 'Automação ativa'}</p>
                    </div>
                `).join('');
            } catch(e) {
                grid.innerHTML = '<div class="glass" style="padding: 20px; grid-column: span 3; text-align: center; color: #ef4444;">Erro ao carregar automações</div>';
            }
        }

        async function loadPlataformas() {
            const grid = document.getElementById('grid-plataformas');
            if (!grid) return;
            grid.innerHTML = '<div class="glass" style="padding: 20px; grid-column: span 3; text-align: center; color: var(--text-muted);">Carregando plataformas...</div>';
            try {
                const res = await apiCall('/plataformas');
                const list = res?.data || res?.dados || [];
                if (list.length === 0) {
                    grid.innerHTML = '<div class="glass" style="padding: 20px; grid-column: span 3; text-align: center; color: var(--text-muted);">Nenhuma plataforma cadastrada. Clique em "+ Nova Plataforma" para criar!</div>';
                    return;
                }
                grid.innerHTML = list.map(p => {
                    const statusColor = p.status === 'ativa' ? 'var(--success)' : (p.status === 'rascunho' ? '#fbbf24' : '#ef4444');
                    return `
                        <div class="glass" style="padding: 20px; border-top: 3px solid #6366f1;">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                                <h4>${p.nome}</h4>
                                <span class="badge badge-primary">${p.tipo}</span>
                            </div>
                            <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 12px;">${p.descricao || 'Sem descrição'}</p>
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 0.8rem; font-weight: 700; color: ${statusColor};">● ${p.status ? p.status.toUpperCase() : 'ATIVA'}</span>
                                ${p.url ? `<a href="${p.url}" target="_blank" class="btn btn-glass" style="font-size: 0.75rem; padding: 4px 10px;">Abrir App ↗</a>` : ''}
                            </div>
                        </div>
                    `;
                }).join('');
            } catch(e) {
                grid.innerHTML = '<div class="glass" style="padding: 20px; grid-column: span 3; text-align: center; color: #ef4444;">Erro ao carregar plataformas</div>';
            }
        }

        // 📈 ANALYTICS RFM 5x5 INTERATIVA & COHORT
        async function showAnalyticsTab(tab) {
            const content = document.getElementById('analytics-content');
            if (tab === 'rfm') {
                content.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted);"><span style="display:inline-block; animation: pulseFogo 1.5s infinite; font-size: 1.5rem;">📊</span><br><br>Calculando Matriz RFM 5x5 em tempo real...</div>';
                try {
                    const res = await apiCall('/analytics/rfm');
                    if (!res || !res.ok || !res.data) {
                        content.innerHTML = '<div style="color: #ef4444; padding: 20px; text-align: center;">Erro ao carregar dados da matriz RFM.</div>';
                        return;
                    }
                    const { totalClientes, receitaGeral, segmentos, matriz5x5 } = res.data;

                    // 1. Cards de Macro-Segmentos Estratégicos
                    let segCardsHtml = '<div class="grid-3" style="margin-bottom: 24px;">';
                    Object.keys(segmentos).forEach(k => {
                        const s = segmentos[k];
                        segCardsHtml += `
                            <div class="glass" style="padding: 16px; border-left: 4px solid ${s.cor};">
                                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                    <strong style="color: #fff; font-size: 0.95rem;">${s.icone} ${s.nome}</strong>
                                    <span class="badge" style="background: ${s.cor}22; color: ${s.cor}; font-weight: 700; font-size: 0.8rem;">${s.total} (${s.pct}%)</span>
                                </div>
                                <div style="margin: 8px 0 4px 0; font-size: 1.25rem; font-weight: 800; color: ${s.cor};">${formatMoeda(s.receita)}</div>
                                <div style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.4;">${s.descricao}</div>
                                <button class="btn btn-glass" style="font-size: 0.75rem; padding: 6px 10px; margin-top: 10px; width: 100%; border-color: ${s.cor}44; color: #fff;" onclick="criarCampanhaParaSegmentoRFM('${s.nome.replace(/'/g, "\\'")}')">📢 Disparar Ação para este Grupo</button>
                            </div>
                        `;
                    });
                    segCardsHtml += '</div>';

                    // 2. Grade 5x5 Interativa
                    let gridHtml = `
                        <div style="margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 10px;">
                            <div>
                                <h4 style="margin: 0; font-size: 1.15rem; color: #fff;">Matriz Interativa 5x5: Recência (R) × Frequência (F)</h4>
                                <span style="font-size: 0.8rem; color: var(--text-muted);">Clique em qualquer um dos 25 quadrantes para inspecionar os clientes e disparar ações personalizadas</span>
                            </div>
                            <div style="font-size: 0.8rem; color: var(--text-muted); background: rgba(255,255,255,0.04); padding: 6px 12px; border-radius: 8px;">
                                ⬆️ Vertical: <strong>Recência</strong> (R5 recente a R1 inativo) &nbsp;|&nbsp; ➡️ Horizontal: <strong>Frequência</strong> (F1 único a F5 fã)
                            </div>
                        </div>
                        <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 24px;">
                    `;

                    (matriz5x5 || []).forEach(row => {
                        row.forEach(cell => {
                            const hasClientes = cell.totalClientes > 0;
                            const cellDataAttr = encodeURIComponent(JSON.stringify(cell));
                            gridHtml += `
                                <div class="glass" onclick="inspecionarQuadranteRFM(${cell.r}, ${cell.f}, decodeURIComponent('${cellDataAttr}'))" style="padding: 12px; border: 1px solid ${cell.cor}44; border-radius: 8px; cursor: pointer; transition: all 0.2s ease; background: ${hasClientes ? cell.cor + '18' : 'rgba(255,255,255,0.02)'};" onmouseover="this.style.transform='scale(1.03)'; this.style.borderColor='${cell.cor}';" onmouseout="this.style.transform='scale(1)'; this.style.borderColor='${cell.cor}44';">
                                    <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">
                                        <span>R${cell.r} • F${cell.f}</span>
                                        <span style="font-weight: 800; color: ${cell.cor}; font-size: 0.85rem;">${cell.totalClientes}</span>
                                    </div>
                                    <div style="font-size: 0.8rem; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${cell.quadranteNome.split(' ')[0]}</div>
                                    <div style="font-size: 0.75rem; color: ${cell.cor}; font-weight: 800; margin-top: 4px;">${formatMoeda(cell.receitaTotal)}</div>
                                </div>
                            `;
                        });
                    });
                    gridHtml += '</div>';

                    // 3. Painel de Inspecao do Quadrante
                    const painelDetalhes = `
                        <div id="rfm-quadrante-detalhes" class="glass" style="display: none; padding: 22px; border-left: 4px solid #6366f1; margin-top: 10px;">
                            <!-- Preenchido dinamicamente ao clicar no quadrante -->
                        </div>
                    `;

                    content.innerHTML = segCardsHtml + gridHtml + painelDetalhes;
                } catch (e) {
                    content.innerHTML = `<div style="color: #ef4444; padding: 20px;">Falha ao carregar análise RFM: ${e.message}</div>`;
                }
            } else {
                // Aba Cohort
                content.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted);"><span style="display:inline-block; animation: pulseFogo 1.5s infinite; font-size: 1.5rem;">📅</span><br><br>Calculando Safra de Clientes (Cohort)...</div>';
                try {
                    const res = await apiCall('/analytics/cohort');
                    const cohortData = res?.data || res?.dados || [];
                    
                    if (!res || !res.ok || cohortData.length === 0) {
                        content.innerHTML = '<div style="color: var(--text-muted); padding: 20px; text-align: center;">Não há dados suficientes para a análise de Cohort ainda.</div>';
                        return;
                    }

                    let tableHtml = `
                        <div style="margin-bottom: 20px;">
                            <h4 style="margin: 0 0 6px 0; color: #fff; font-size: 1.15rem;">Análise de Retenção de Clientes por Safra (Cohort Analysis)</h4>
                            <span style="font-size: 0.85rem; color: var(--text-muted);">Percentual de clientes cadastrados a cada mês que continuaram visitando o restaurante nos meses seguintes.</span>
                        </div>
                        <div class="glass" style="padding: 20px; overflow-x: auto;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                                <thead>
                                    <tr style="border-bottom: 1px solid var(--glass-border); color: var(--text-muted);">
                                        <th style="padding: 10px; text-align: left;">Mês de Entrada</th>
                                        <th style="padding: 10px; text-align: center;">Novos Clientes</th>
                                        <th style="padding: 10px; text-align: center;">Mês 0</th>
                                        <th style="padding: 10px; text-align: center;">Mês 1</th>
                                        <th style="padding: 10px; text-align: center;">Mês 2</th>
                                        <th style="padding: 10px; text-align: center;">Mês 3</th>
                                        <th style="padding: 10px; text-align: center;">Mês 4</th>
                                        <th style="padding: 10px; text-align: center;">Mês 5</th>
                                    </tr>
                                </thead>
                                <tbody>
                    `;

                    cohortData.forEach(row => {
                        tableHtml += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">`;
                        tableHtml += `<td style="padding: 12px; font-weight: 700; color: #fff;">${row.mes || 'Mês'}</td>`;
                        tableHtml += `<td style="padding: 12px; text-align: center;">${row.novos_clientes || 0}</td>`;
                        
                        for (let i = 0; i <= 5; i++) {
                            const val = row.retencao && row.retencao[i] !== undefined ? row.retencao[i] : null;
                            if (val === null) {
                                tableHtml += `<td style="padding: 12px; text-align: center; color: var(--text-muted);">-</td>`;
                            } else {
                                const opacity = Math.max(0.1, val / 100 * 0.5);
                                tableHtml += `<td style="padding: 12px; text-align: center; background: rgba(16,185,129,${opacity}); font-weight: 700;">${val}%</td>`;
                            }
                        }
                        tableHtml += `</tr>`;
                    });

                    tableHtml += `</tbody></table></div>`;
                    content.innerHTML = tableHtml;
                } catch(e) {
                    content.innerHTML = `<div style="color: #ef4444; padding: 20px;">Falha ao carregar análise Cohort: ${e.message}</div>`;
                }
            }
        }

        function inspecionarQuadranteRFM(r, f, cellDataStr) {
            let cell = {};
            try {
                cell = typeof cellDataStr === 'string' ? JSON.parse(cellDataStr) : cellDataStr;
            } catch(e) {
                cell = { r, f, quadranteNome: 'Quadrante R' + r + 'F' + f, totalClientes: 0, receitaTotal: 0, clientes: [] };
            }

            const det = document.getElementById('rfm-quadrante-detalhes');
            if (!det) return;

            det.style.display = 'block';
            det.style.borderLeftColor = cell.cor || '#6366f1';

            let clientesHtml = '';
            if (cell.clientes && cell.clientes.length > 0) {
                clientesHtml = `
                    <div style="margin-top: 14px; overflow-x: auto;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                            <thead>
                                <tr style="color: var(--text-muted); border-bottom: 1px solid var(--glass-border);">
                                    <th style="padding: 8px;">Nome</th>
                                    <th style="padding: 8px;">Telefone</th>
                                    <th style="padding: 8px;">Visitas</th>
                                    <th style="padding: 8px;">Total Gasto</th>
                                    <th style="padding: 8px;">Último Acesso</th>
                                    <th style="padding: 8px; text-align: right;">Ação</th>
                                </tr>
                            </thead>
                            <tbody>
                `;
                cell.clientes.forEach(c => {
                    const telClean = (c.telefone || '').replace(/\D/g, '');
                    clientesHtml += `
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                            <td style="padding: 10px; font-weight: 700; color: #fff;">${c.nome || 'Cliente'}</td>
                            <td style="padding: 10px; color: var(--text-muted);">${c.telefone || '-'}</td>
                            <td style="padding: 10px;">${c.total_visitas || 1}</td>
                            <td style="padding: 10px; color: #10b981; font-weight: 700;">${formatMoeda(c.total_gasto || 0)}</td>
                            <td style="padding: 10px; color: var(--text-muted);">${formatData(c.ultimo_acesso)}</td>
                            <td style="padding: 10px; text-align: right;">
                                ${telClean ? `<a href="https://wa.me/55${telClean}" target="_blank" class="btn btn-glass" style="font-size: 0.75rem; padding: 4px 8px; color: #22c55e;">📲 WhatsApp</a>` : ''}
                            </td>
                        </tr>
                    `;
                });
                clientesHtml += `</tbody></table></div>`;
            } else {
                clientesHtml = `<p style="color: var(--text-muted); margin-top: 10px; font-size: 0.85rem;">Nenhum cliente específico registrado neste quadrante no momento.</p>`;
            }

            det.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span class="badge" style="background: ${cell.cor}22; color: ${cell.cor}; font-weight: 800;">R${cell.r} • F${cell.f}</span>
                            <h3 style="margin: 0; color: #fff;">${cell.quadranteNome}</h3>
                        </div>
                        <p style="margin: 6px 0 0 0; font-size: 0.85rem; color: var(--text-muted);">
                            <strong>${cell.totalClientes}</strong> clientes compõem este quadrante, somando <strong>${formatMoeda(cell.receitaTotal)}</strong> em faturamento.
                        </p>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button class="btn btn-primary" onclick="criarCampanhaParaSegmentoRFM('${cell.quadranteNome.replace(/'/g, "\\'")}')" style="font-size: 0.8rem; padding: 8px 14px;">
                            📢 Criar Campanha p/ este Quadrante
                        </button>
                        <button class="btn btn-glass" onclick="document.getElementById('rfm-quadrante-detalhes').style.display='none'" style="font-size: 0.8rem; padding: 8px 12px;">
                            ✕ Fechar
                        </button>
                    </div>
                </div>
                ${clientesHtml}
            `;
            det.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        function criarCampanhaParaSegmentoRFM(segmentoNome) {
            goToView('campanhas');
            openModal('modal-campanha');
            const nomeInput = document.getElementById('camp-nome');
            const corpoInput = document.getElementById('camp-corpo');
            if (nomeInput) nomeInput.value = `Campanha Direcionada: ${segmentoNome}`;
            if (corpoInput) {
                if (segmentoNome.includes('Campe') || segmentoNome.includes('Champion')) {
                    corpoInput.value = 'Olá {nome}! O Chef reservou uma mesa especial para você neste final de semana com degustação exclusiva de sobremesa da casa. Podemos confirmar sua reserva?';
                } else if (segmentoNome.includes('Risco') || segmentoNome.includes('Perdido')) {
                    corpoInput.value = 'Oi {nome}! Sentimos sua falta. Preparamos uma cortesia especial para você neste retorno: entrada exclusiva por nossa conta até domingo!';
                } else {
                    corpoInput.value = 'Olá {nome}! Temos novidades gastronômicas irresistíveis esperando por você no Cheff.pro nesta semana.';
                }
            }
        }

        // 🧠 DIAGNÓSTICO DIÁRIO DA IA (INSIGHTS AUTOMÁTICOS)
        async function loadInsightsAutomaticos() {
            const container = document.getElementById('dash-ia-insights-container');
            if (!container) return;

            try {
                const res = await apiCall('/ia/insights-automaticos');
                const list = res?.data || [];
                if (list.length === 0) {
                    container.innerHTML = '<div style="color: var(--text-muted); padding: 15px; grid-column: span 2; text-align: center;">Nenhum alerta crítico no momento. Operação rodando com boa estabilidade!</div>';
                    return;
                }

                let html = '';
                list.forEach(item => {
                    const borderCor = item.severidade === 'alta' ? '#ef4444' : (item.severidade === 'media' ? '#f59e0b' : '#6366f1');
                    const payloadStr = encodeURIComponent(JSON.stringify(item.acao?.payload || {}));
                    html += `
                        <div class="glass" style="padding: 16px; border-left: 4px solid ${borderCor}; display: flex; flex-direction: column; justify-content: space-between;">
                            <div>
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <span style="font-size: 1.2rem;">${item.icone || '💡'}</span>
                                        <strong style="color: #fff; font-size: 0.95rem;">${item.titulo}</strong>
                                    </div>
                                    <span class="badge" style="background: ${borderCor}22; color: ${borderCor}; font-size: 0.75rem; font-weight: 700;">${item.categoria || 'IA'}</span>
                                </div>
                                <p style="font-size: 0.82rem; color: var(--text-muted); line-height: 1.4; margin: 6px 0;">${item.descricao}</p>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 8px;">
                                <span style="font-size: 0.8rem; font-weight: 700; color: #10b981;">⚡ ${item.impacto || 'Oportunidade'}</span>
                                <button class="btn btn-primary" style="font-size: 0.75rem; padding: 5px 12px;" onclick="executarAcaoCopiloto('${item.acao?.tipo || 'navegar_aba'}', decodeURIComponent('${payloadStr}'))">
                                    ${item.acao?.label || 'Executar'}
                                </button>
                            </div>
                        </div>
                    `;
                });
                container.innerHTML = html;
            } catch(e) {
                container.innerHTML = '<div style="color: var(--text-muted); padding: 15px; grid-column: span 2; text-align: center;">Diagnóstico algorítmico ativo.</div>';
            }
        }

        // 🤖 COPILOTO IA ESTRATÉGICO
        async function loadCopilotoContexto() {
            const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
            try {
                // Run all 3 API calls in parallel for faster loading
                const [alertasRes, perfisRes, rfmRes] = await Promise.allSettled([
                    apiCall('/alertas-potenciais'),
                    apiCall('/perfis?limite=1'),
                    apiCall('/analytics/rfm')
                ]);

                const al = alertasRes.status === 'fulfilled' ? alertasRes.value : null;
                if (al?.ok && al?.dados) {
                    const r = al.dados.resumo || {};
                    setEl('cop-kpi-whales', r.total_baleias ?? r.baleias ?? 0);
                    setEl('cop-kpi-churn', r.total_risco_vip ?? r.churn ?? 0);
                }

                const pf = perfisRes.status === 'fulfilled' ? perfisRes.value : null;
                if (pf?.ok) {
                    setEl('cop-kpi-perfis', pf.total || (pf.dados?.length ?? 0));
                }

                const rfm = rfmRes.status === 'fulfilled' ? rfmRes.value : null;
                const rfmData = rfm?.data || rfm?.dados;
                if (rfm?.ok && rfmData) {
                    const tot = rfmData.totalClientes || 1;
                    const fat = rfmData.receitaGeral || 0;
                    setEl('cop-kpi-ticket', formatMoeda(Math.round(fat / tot)));
                }
            } catch(e) {
                console.error('[Copiloto Contexto]', e);
            }
        }

        function enviarPerguntaCopiloto(texto) {
            const input = document.getElementById('copiloto-input');
            if (input) {
                input.value = texto;
                const form = document.getElementById('form-copiloto-chat');
                if (form) form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
            }
        }

        async function handleCopilotoSubmit(e) {
            e.preventDefault();
            const input = document.getElementById('copiloto-input');
            const pergunta = (input?.value || '').trim();
            if (!pergunta) return;

            input.value = '';
            const msgContainer = document.getElementById('copiloto-mensagens');
            if (!msgContainer) return;

            // Renderiza mensagem do usuário via DOM (preserves existing children/events)
            const userMsgEl = document.createElement('div');
            userMsgEl.style.cssText = 'display: flex; gap: 14px; justify-content: flex-end; align-items: flex-start;';
            userMsgEl.innerHTML = `
                <div class="glass" style="padding: 14px 18px; border-radius: 12px; max-width: 80%; background: rgba(99, 102, 241, 0.2); border: 1px solid rgba(99, 102, 241, 0.4);">
                    <div style="font-weight: 700; color: #818cf8; margin-bottom: 4px; font-size: 0.8rem;">Você (Gestor)</div>
                    <div style="color: #fff; line-height: 1.5; font-size: 0.95rem;">${pergunta}</div>
                </div>
                <div style="width: 38px; height: 38px; border-radius: 10px; background: #6366f1; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0;">👤</div>
            `;
            msgContainer.appendChild(userMsgEl);

            // Indicador de carregamento / digitando
            const loadingEl = document.createElement('div');
            loadingEl.style.cssText = 'display: flex; gap: 14px; align-items: flex-start;';
            loadingEl.innerHTML = `
                <div style="width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, #6366f1, #a855f7); display: flex; align-items: center; justify-content: center; font-size: 1.3rem; flex-shrink: 0;">🤖</div>
                <div class="glass" style="padding: 14px 20px; border-radius: 12px; border-left: 3px solid #a855f7;">
                    <span style="color: #c084fc; font-size: 0.9rem;">Consultando dados operacionais e calculando estratégia com IA...</span>
                </div>
            `;
            msgContainer.appendChild(loadingEl);
            msgContainer.scrollTop = msgContainer.scrollHeight;

            try {
                const res = await apiCall('/ia/copiloto', {
                    method: 'POST',
                    body: JSON.stringify({ pergunta })
                });

                if (loadingEl.parentNode) loadingEl.remove();

                const resposta = res?.resposta || 'Análise estratégica concluída.';
                const acoes = res?.acoesSugeridas || [];

                // Formata markdown simples para HTML
                let formattedHtml = resposta
                    .replace(/### (.*?)\n/g, '<h4 style="color:#c084fc; margin:12px 0 6px 0; font-size:1.05rem;">$1</h4>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#fff;">$1</strong>')
                    .replace(/\n\n/g, '<br><br>')
                    .replace(/\n- /g, '<br>• ');

                let acoesHtml = '';
                if (acoes.length > 0) {
                    acoesHtml = '<div style="margin-top: 14px; display: flex; gap: 8px; flex-wrap: wrap;">';
                    acoes.forEach(a => {
                        const payloadStr = encodeURIComponent(JSON.stringify(a.payload || {}));
                        acoesHtml += `
                            <button class="btn btn-primary" style="font-size: 0.8rem; padding: 6px 12px; background: linear-gradient(135deg, #6366f1, #a855f7); border: none;" onclick="executarAcaoCopiloto('${a.acaoTipo}', decodeURIComponent('${payloadStr}'))">
                                ${a.icone || '⚡'} ${a.titulo}
                            </button>
                        `;
                    });
                    acoesHtml += '</div>';
                }

                const aiMsgEl = document.createElement('div');
                aiMsgEl.style.cssText = 'display: flex; gap: 14px; align-items: flex-start;';
                aiMsgEl.innerHTML = `
                    <div style="width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, #6366f1, #a855f7); display: flex; align-items: center; justify-content: center; font-size: 1.3rem; flex-shrink: 0;">🤖</div>
                    <div class="glass" style="padding: 16px 20px; border-radius: 12px; max-width: 85%; border-left: 3px solid #6366f1;">
                        <div style="font-weight: 700; color: #a855f7; margin-bottom: 6px;">Cheff.pro Copilot</div>
                        <div style="line-height: 1.6; font-size: 0.92rem; color: #e2e8f0;">${formattedHtml}</div>
                        ${acoesHtml}
                    </div>
                `;
                msgContainer.appendChild(aiMsgEl);
                msgContainer.scrollTop = msgContainer.scrollHeight;
            } catch(e) {
                if (loadingEl.parentNode) loadingEl.remove();
                showToast('Erro ao consultar o Copiloto IA: ' + e.message, 'danger');
            }
        }

        function limparChatCopiloto() {
            const msgContainer = document.getElementById('copiloto-mensagens');
            if (msgContainer) {
                msgContainer.innerHTML = `
                    <div style="display: flex; gap: 14px; align-items: flex-start;">
                        <div style="width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, #6366f1, #a855f7); display: flex; align-items: center; justify-content: center; font-size: 1.3rem; flex-shrink: 0;">🤖</div>
                        <div class="glass" style="padding: 16px 20px; border-radius: 12px; max-width: 85%; border-left: 3px solid #6366f1;">
                            <div style="font-weight: 700; color: #a855f7; margin-bottom: 6px;">Cheff.pro Copilot • Consultor Estratégico IA</div>
                            <div style="line-height: 1.6; font-size: 0.95rem; color: #e2e8f0;">
                                Chat reiniciado. Como posso te apoiar estrategicamente agora?
                            </div>
                        </div>
                    </div>
                `;
            }
        }

        function executarAcaoCopiloto(acaoTipo, payload) {
            let data = {};
            try {
                data = typeof payload === 'string' ? JSON.parse(payload) : (payload || {});
            } catch(e) {}

            if (acaoTipo === 'abrir_campanha' || acaoTipo === 'preparar_campanha') {
                goToView('campanhas');
                openModal('modal-campanha');
                if (data.nome && document.getElementById('camp-nome')) document.getElementById('camp-nome').value = data.nome;
                if (data.tipo && document.getElementById('camp-tipo')) document.getElementById('camp-tipo').value = data.tipo;
                if (data.corpo && document.getElementById('camp-corpo')) document.getElementById('camp-corpo').value = data.corpo;
                showToast('Campanha pré-preenchida pela IA! Revise e confirme o disparo.', 'info');
            } else if (acaoTipo === 'navegar_aba') {
                if (data.aba) goToView(data.aba);
            }
        }

        // ✨ COPYWRITER GASTRONÔMICO IA
        function abrirGeradorCopyIA() {
            openModal('modal-ia-copywriter');
        }

        async function executarGeracaoCopyIA() {
            const btn = document.getElementById('btn-gerar-copy-ia');
            const resContainer = document.getElementById('ia-copy-resultados');
            if (btn) btn.innerText = '⏳ Gerando Variações com IA...';

            const objetivo = document.getElementById('ia-copy-objetivo')?.value || 'reativacao';
            const tom = document.getElementById('ia-copy-tom')?.value || 'urgencia_escassez';
            const prato = document.getElementById('ia-copy-prato')?.value || '';
            const desconto = document.getElementById('ia-copy-beneficio')?.value || '';
            const canal = document.getElementById('camp-tipo')?.value || 'whatsapp';

            try {
                const res = await apiCall('/ia/gerar-copy', {
                    method: 'POST',
                    body: JSON.stringify({ canal, objetivo, prato, desconto, tom })
                });

                if (btn) btn.innerText = '🤖 Gerar 3 Variações de Alta Conversão';

                const copies = res?.copies || [];
                if (copies.length === 0) {
                    resContainer.innerHTML = '<div style="color: #ef4444; padding: 20px; text-align: center;">Não foi possível gerar variações. Tente novamente.</div>';
                    return;
                }

                let html = '';
                copies.forEach((c, idx) => {
                    html += `
                        <div class="glass" style="padding: 16px; border-left: 4px solid #6366f1;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <strong style="color: #fff; font-size: 0.95rem;">${c.icone || '✨'} ${c.estilo || 'Variação ' + (idx + 1)}</strong>
                                <span class="badge" style="background: rgba(16,185,129,0.2); color: #10b981; font-weight: 700;">Conv. Est.: ${c.conversao_estimada || 'Alta'}</span>
                            </div>
                            <div style="font-size: 0.78rem; color: #a855f7; font-weight: 600; margin-bottom: 6px;">Gatilho: ${c.gatilho || 'Persuasão'}</div>
                            <div style="white-space: pre-wrap; font-size: 0.85rem; color: #e2e8f0; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 6px; line-height: 1.5; margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.05);">${c.texto}</div>
                            <button type="button" class="btn btn-primary" style="width: 100%; font-size: 0.8rem; padding: 8px;" onclick="aplicarCopyNaCampanha('${encodeURIComponent(c.texto)}')">
                                ⚡ Usar Esta Copy na Campanha
                            </button>
                        </div>
                    `;
                });
                resContainer.innerHTML = html;
            } catch(e) {
                if (btn) btn.innerText = '🤖 Gerar 3 Variações de Alta Conversão';
                resContainer.innerHTML = `<div style="color: #ef4444; padding: 20px; text-align: center;">Erro ao gerar copy: ${e.message}</div>`;
            }
        }

        function aplicarCopyNaCampanha(textoEncoded) {
            const texto = decodeURIComponent(textoEncoded);
            const textarea = document.getElementById('camp-corpo');
            if (textarea) {
                textarea.value = texto;
            }
            closeModal('modal-ia-copywriter');
            showToast('Copy aplicada à campanha com sucesso!', 'success');
        }

        function toggleRegras(val) {
            document.getElementById('regras-builder').style.display = val === 'auto' ? 'block' : 'none';
        }

        function addRegra() {
            const lista = document.getElementById('lista-regras');
            const div = document.createElement('div');
            div.style.display = 'flex';
            div.style.gap = '10px';
            div.style.marginTop = '10px';
            div.innerHTML = `
                <select><option>Gasto Mínimo</option><option>Visitas</option></select>
                <input type="text" placeholder="Valor">
                <button type="button" class="btn btn-danger" onclick="this.parentElement.remove()">X</button>
            `;
            lista.appendChild(div);
        }

        function salvarSegmento(e) {
            e.preventDefault();
            const nome = document.getElementById('seg-nome').value;
            const tipo = document.getElementById('seg-tipo').value;
            apiCall('/segmentos', {
                method: 'POST',
                body: JSON.stringify({ nome, tipo, regras_json: '[]' })
            }).then(res => {
                if (res.ok) {
                    showToast('Segmento salvo com sucesso!', 'success');
                    closeModal('modal-segmento');
                    document.getElementById('form-segmento')?.reset();
                    loadSegmentos();
                } else {
                    showToast(res.erro || 'Erro ao salvar segmento', 'danger');
                }
            }).catch(() => {
                showToast('Erro ao salvar segmento', 'danger');
            });
        }

        async function salvarCampanha(e) {
            e.preventDefault();
            const nome = document.getElementById('camp-nome').value;
            const tipo = document.getElementById('camp-tipo').value;
            const segmento_id = document.getElementById('camp-segmento').value || null;
            const corpo = document.getElementById('camp-corpo').value;
            const cta_link = document.getElementById('camp-cta-link').value;
            const cta_texto = document.getElementById('camp-cta-texto').value;

            const payload = {
                nome,
                tipo,
                segmento_id,
                conteudo_json: JSON.stringify({ corpo, cta_link, cta_texto }),
                status: 'agendada'
            };

            const res = await apiCall('/campanhas', { method: 'POST', body: JSON.stringify(payload) });
            if (res.ok) {
                showToast('Campanha criada e programada com sucesso!', 'success');
                closeModal('modal-campanha');
                document.getElementById('form-campanha')?.reset();
                loadCampanhas();
            } else {
                showToast(res.erro || 'Erro ao criar campanha', 'danger');
            }
        }

        async function salvarProduto(e) {
            e.preventDefault();
            const nome = document.getElementById('prod-nome').value;
            const tipo = document.getElementById('prod-tipo').value;
            const categoria = document.getElementById('prod-categoria').value;
            const preco = parseFloat(document.getElementById('prod-preco').value) || 0;
            const preco_promocional = parseFloat(document.getElementById('prod-preco-promo').value) || null;
            const link_venda = document.getElementById('prod-link').value;
            const publico_alvo = document.getElementById('prod-publico').value;
            const descricao = document.getElementById('prod-desc').value;

            const payload = {
                nome,
                tipo,
                categoria,
                preco,
                preco_promocional,
                link_venda,
                publico_alvo,
                descricao
            };

            const res = await apiCall('/produtos', { method: 'POST', body: JSON.stringify(payload) });
            if (res.ok) {
                showToast('Produto adicionado ao catálogo com sucesso!', 'success');
                closeModal('modal-produto');
                document.getElementById('form-produto')?.reset();
                loadProdutos();
            } else {
                showToast(res.erro || 'Erro ao salvar produto', 'danger');
            }
        }

        async function salvarAutomacao(e) {
            e.preventDefault();
            const nome = document.getElementById('auto-nome').value;
            const trigger_tipo = document.getElementById('auto-trigger').value;
            const canal = document.getElementById('auto-acao-tipo').value;
            const template = document.getElementById('auto-template').value;
            const delay = parseInt(document.getElementById('auto-delay').value, 10) || 1;

            const payload = {
                nome,
                trigger_tipo,
                trigger_valor: 'padrao',
                acoes_json: JSON.stringify([{ tipo: canal, template, delay_horas: delay }]),
                ativo: 1
            };

            const res = await apiCall('/automacoes', { method: 'POST', body: JSON.stringify(payload) });
            if (res.ok) {
                showToast('Automação ativada com sucesso!', 'success');
                closeModal('modal-automacao');
                document.getElementById('form-automacao')?.reset();
                loadAutomacoes();
            } else {
                showToast(res.erro || 'Erro ao ativar automação', 'danger');
            }
        }

        async function salvarPlataforma(e) {
            e.preventDefault();
            const nome = document.getElementById('plat-nome').value;
            const tipo = document.getElementById('plat-tipo').value;
            const url = document.getElementById('plat-url').value;
            const status = document.getElementById('plat-status').value;
            const descricao = document.getElementById('plat-desc').value;

            const payload = {
                nome,
                tipo,
                url,
                status,
                descricao,
                config_json: JSON.stringify({ tema: 'dark', responsive: true })
            };

            const res = await apiCall('/plataformas', { method: 'POST', body: JSON.stringify(payload) });
            if (res.ok) {
                showToast('Plataforma criada com sucesso!', 'success');
                closeModal('modal-plataforma');
                document.getElementById('form-plataforma')?.reset();
                loadPlataformas();
            } else {
                showToast(res.erro || 'Erro ao criar plataforma', 'danger');
            }
        }

        function recalcularSimulacao() {
            const sliderTicket = parseInt(document.getElementById('slider-sim-ticket')?.value || 10, 10);
            const sliderHoras = parseInt(document.getElementById('slider-sim-horas')?.value || 20, 10);
            const sliderChurn = parseInt(document.getElementById('slider-sim-churn')?.value || 15, 10);

            if (document.getElementById('label-slider-ticket')) document.getElementById('label-slider-ticket').innerText = `+${sliderTicket}%`;
            if (document.getElementById('label-slider-horas')) document.getElementById('label-slider-horas').innerText = `+${sliderHoras}%`;
            if (document.getElementById('label-slider-churn')) document.getElementById('label-slider-churn').innerText = `+${sliderChurn}%`;

            const fatBase = state.radarDinheiro?.paretoClientes?.faturamento_top || 24500;
            const ganhoTicket = (fatBase * (sliderTicket / 100));
            const ganhoHoras = (sliderHoras * 80);
            const ganhoChurn = (sliderChurn * 55);

            const totalMes = ganhoTicket + ganhoHoras + ganhoChurn;
            const totalAno = totalMes * 12;

            if (document.getElementById('sim-ticket-val')) document.getElementById('sim-ticket-val').innerText = `+ ${formatMoeda(ganhoTicket)}/mês`;
            if (document.getElementById('sim-horas-val')) document.getElementById('sim-horas-val').innerText = `+ ${formatMoeda(ganhoHoras)}/mês`;
            if (document.getElementById('sim-churn-val')) document.getElementById('sim-churn-val').innerText = `+ ${formatMoeda(ganhoChurn)}/mês`;

            if (document.getElementById('sim-ganho-total')) document.getElementById('sim-ganho-total').innerText = `+ ${formatMoeda(totalMes)} / mês`;
            if (document.getElementById('sim-ganho-anual')) document.getElementById('sim-ganho-anual').innerText = `+ ${formatMoeda(totalAno)} / ano projetado`;
        }

        // 🤖 COPILOTO IA - FUNÇÕES LOGICAS
        async function loadCopilotoContexto() {
            try {
                // Atualizar KPIs do Copiloto a partir do Radar ou Dashboard
                document.getElementById('cop-kpi-perfis').innerText = state.perfis.length || 0;
                document.getElementById('cop-kpi-whales').innerText = document.getElementById('kpi-baleias')?.innerText || 0;
                document.getElementById('cop-kpi-churn').innerText = document.getElementById('kpi-churn')?.innerText || 0;
                document.getElementById('cop-kpi-ticket').innerText = document.getElementById('pareto-ticket-top')?.innerText || 'R$ 0';
            } catch (e) {
                console.error("Erro ao carregar contexto copiloto", e);
            }
        }

        async function enviarPerguntaCopiloto(pergunta) {
            if (!pergunta) return;
            const container = document.getElementById('copiloto-mensagens');
            
            // Adicionar msg do usuário
            const userMsg = document.createElement('div');
            userMsg.style = "display: flex; gap: 14px; align-items: flex-start; justify-content: flex-end;";
            userMsg.innerHTML = `
                <div class="glass" style="padding: 14px 18px; border-radius: 12px; max-width: 80%; background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.3);">
                    <div style="font-size: 0.95rem; color: #fff;">${pergunta}</div>
                </div>
                <div style="width: 36px; height: 36px; border-radius: 50%; background: var(--glass-border); display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0;">👤</div>
            `;
            container.appendChild(userMsg);
            container.scrollTop = container.scrollHeight;

            // Loading state
            const loadingMsg = document.createElement('div');
            loadingMsg.id = "copiloto-loading";
            loadingMsg.style = "display: flex; gap: 14px; align-items: flex-start;";
            loadingMsg.innerHTML = `
                <div style="width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, #6366f1, #a855f7); display: flex; align-items: center; justify-content: center; font-size: 1.3rem; flex-shrink: 0; opacity: 0.7;">🤖</div>
                <div class="glass" style="padding: 14px 18px; border-radius: 12px; border-left: 3px solid #6366f1; color: var(--text-muted); font-size: 0.9rem;">
                    <span style="display:inline-block; animation: pulseFogo 1s infinite;">Processando contexto e formulando estratégia...</span>
                </div>
            `;
            container.appendChild(loadingMsg);
            container.scrollTop = container.scrollHeight;

            try {
                // Call IA API
                const payload = {
                    mensagem: pergunta,
                    contexto: {
                        total_perfis: state.perfis.length,
                        total_baleias: document.getElementById('kpi-baleias')?.innerText,
                        ticket_top: document.getElementById('pareto-ticket-top')?.innerText,
                        melhor_dia: document.getElementById('heat-melhor-dia')?.innerText
                    }
                };

                const res = await apiCall('/ia/copiloto', { method: 'POST', body: JSON.stringify(payload) });
                document.getElementById('copiloto-loading')?.remove();
                
                if (res && res.ok) {
                    const respostaFormatada = (res.resposta || res.dados?.resposta || res.dados || 'Estratégia formulada!').replace(/\n/g, '<br>');
                    
                    const iaMsg = document.createElement('div');
                    iaMsg.style = "display: flex; gap: 14px; align-items: flex-start;";
                    iaMsg.innerHTML = `
                        <div style="width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, #6366f1, #a855f7); display: flex; align-items: center; justify-content: center; font-size: 1.3rem; flex-shrink: 0;">🤖</div>
                        <div class="glass" style="padding: 16px 20px; border-radius: 12px; max-width: 85%; border-left: 3px solid #6366f1;">
                            <div style="line-height: 1.6; font-size: 0.95rem; color: #e2e8f0;">${respostaFormatada}</div>
                        </div>
                    `;
                    container.appendChild(iaMsg);
                    
                    if (res.tokens) {
                        showToast(`Resposta gerada. Foram utilizados ${res.tokens} tokens.`, 'info');
                    }
                } else {
                    throw new Error(res.erro || "Falha na resposta da IA.");
                }
            } catch (err) {
                document.getElementById('copiloto-loading')?.remove();
                showToast("Erro ao contatar Copiloto: " + err.message, "danger");
            }
            container.scrollTop = container.scrollHeight;
        }

        function handleCopilotoSubmit(e) {
            e.preventDefault();
            const input = document.getElementById('copiloto-input');
            const pergunta = input.value.trim();
            if (pergunta) {
                enviarPerguntaCopiloto(pergunta);
                input.value = '';
            }
        }

        function limparChatCopiloto() {
            const container = document.getElementById('copiloto-mensagens');
            if (container) {
                container.innerHTML = `
                    <div style="display: flex; gap: 14px; align-items: flex-start;">
                        <div style="width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, #6366f1, #a855f7); display: flex; align-items: center; justify-content: center; font-size: 1.3rem; flex-shrink: 0;">🤖</div>
                        <div class="glass" style="padding: 16px 20px; border-radius: 12px; max-width: 85%; border-left: 3px solid #6366f1;">
                            <div style="font-weight: 700; color: #a855f7; margin-bottom: 6px;">Cheff.pro Copilot • Consultor Estratégico IA</div>
                            <div style="line-height: 1.6; font-size: 0.95rem; color: #e2e8f0;">
                                O chat foi limpo. Como posso ajudar com sua próxima estratégia?
                            </div>
                        </div>
                    </div>
                `;
            }
        }

        // ⚡ CENTRO DE DESEMPENHO, ECONOMIA & REDUÇÃO DE CMV
        async function loadEconomiaDesempenho() {
            try {
                const res = await apiCall('/economia-desempenho');
                if (!res || !res.ok || !res.data) return;

                const { economiaIA, economiaCozinha, desempenhoBanco } = res.data;

                // 1. Métricas de IA
                if (economiaIA) {
                    const elTaxa = document.getElementById('eco-kpi-taxa-cache');
                    const elTokens = document.getElementById('eco-kpi-tokens');
                    const elRs = document.getElementById('eco-kpi-rs');
                    const elBadgeItens = document.getElementById('badge-eco-cache-itens');

                    if (elTaxa) elTaxa.innerText = `${economiaIA.taxaCachePct || 92}%`;
                    if (elTokens) elTokens.innerText = `${Math.round((economiaIA.tokensEconomizados || 184500) / 1000)}k`;
                    if (elRs) elRs.innerText = formatMoeda(economiaIA.economiaBrlEstimada || 310);
                    if (elBadgeItens) elBadgeItens.innerText = `${economiaIA.itensEmCache || 0} ITENS`;
                }

                // 2. Prevenção de Desperdício & Perecíveis
                if (economiaCozinha) {
                    const elPerda = document.getElementById('eco-kpi-perda');
                    const elItensRisco = document.getElementById('eco-kpi-itens-risco');
                    const elCmv = document.getElementById('eco-kpi-cmv');
                    const elCmvEcon = document.getElementById('eco-kpi-cmv-economia');

                    if (elPerda) elPerda.innerText = formatMoeda(economiaCozinha.valorTotalRisco || 0);
                    if (elItensRisco) elItensRisco.innerText = economiaCozinha.totalItensRisco || 0;
                    if (elCmv) elCmv.innerText = `${economiaCozinha.metaCMV?.cmvMetaProjetadoPct || 27}%`;
                    if (elCmvEcon) elCmvEcon.innerText = `+${formatMoeda(economiaCozinha.metaCMV?.economiaMensalEstimada || 4850)}/mês`;

                    const listaPereciveis = document.getElementById('lista-economia-pereciveis');
                    if (listaPereciveis) {
                        const itens = economiaCozinha.itensPereciveis || [];
                        if (itens.length === 0) {
                            listaPereciveis.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 25px;">Nenhum produto em risco de vencimento no momento. Estoque balanceado!</div>';
                        } else {
                            let html = '<div style="display: flex; flex-direction: column; gap: 12px;">';
                            itens.forEach(item => {
                                const nomeLimpo = (item.nome || 'Produto').replace(/'/g, "\\'");
                                const sugestaoLimpa = (item.acao_sugerida || '').replace(/'/g, "\\'");
                                html += `
                                    <div class="glass" style="padding: 14px 18px; border-left: 3px solid #ef4444; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                                        <div style="flex: 1; min-width: 200px;">
                                            <div style="display: flex; align-items: center; gap: 8px;">
                                                <strong style="color: #fff; font-size: 0.95rem;">${item.nome}</strong>
                                                <span class="badge" style="background: rgba(239,68,68,0.2); color: #f87171; font-weight: 700; font-size: 0.75rem;">
                                                    ⏳ ${item.validade || 'Urgente'}
                                                </span>
                                            </div>
                                            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">
                                                Estoque: <strong style="color: #fff;">${item.estoque} un</strong> &nbsp;|&nbsp; 
                                                Perda Potencial: <strong style="color: #f87171;">${formatMoeda(item.perda_estimada || 0)}</strong> &nbsp;|&nbsp;
                                                Unidade: ${item.restaurante_nome || 'Geral'}
                                            </div>
                                            <div style="font-size: 0.78rem; color: #a855f7; margin-top: 4px; font-weight: 500;">
                                                💡 ${item.acao_sugerida || 'Ativar prato promocional para queima'}
                                            </div>
                                        </div>
                                        <button class="btn btn-primary" style="font-size: 0.8rem; padding: 7px 14px; background: linear-gradient(135deg, #ef4444, #dc2626); border: none; white-space: nowrap;" onclick="criarCampanhaQueimaEstoque('${nomeLimpo}', ${item.perda_estimada || 0}, '${sugestaoLimpa}')">
                                            🔥 Criar Campanha de Queima
                                        </button>
                                    </div>
                                `;
                            });
                            html += '</div>';
                            listaPereciveis.innerHTML = html;
                        }
                    }
                }

                // 3. Status de Infraestrutura
                if (desempenhoBanco) {
                    const elLatencia = document.getElementById('eco-kpi-latencia');
                    if (elLatencia) elLatencia.innerText = `${desempenhoBanco.latenciaMediaMs || 8} ms`;
                }

            } catch (err) {
                console.error('Erro ao carregar dados de economia e desempenho:', err);
            }
        }

        async function otimizarBancoAgora() {
            showToast('Executando otimização do banco SQLite e checkpoints WAL...', 'info');
            try {
                const res = await apiCall('/otimizar-banco', { method: 'POST' });
                if (res && res.ok) {
                    showToast(res.mensagem || 'Banco otimizado e reindexado com sucesso!', 'success');
                    loadEconomiaDesempenho();
                } else {
                    showToast(res?.error || 'Erro ao otimizar banco', 'danger');
                }
            } catch (e) {
                showToast('Falha na requisição de otimização: ' + e.message, 'danger');
            }
        }

        async function limparCacheIA() {
            try {
                const res = await apiCall('/limpar-cache-ia', { method: 'POST' });
                if (res && res.ok) {
                    showToast(res.mensagem || 'Memória cache de IA limpa com sucesso!', 'success');
                    loadEconomiaDesempenho();
                } else {
                    showToast(res?.error || 'Erro ao limpar cache de IA', 'danger');
                }
            } catch (e) {
                showToast('Falha ao limpar cache: ' + e.message, 'danger');
            }
        }

        function criarCampanhaQueimaEstoque(itemNome, perdaRisco, sugestao) {
            goToView('campanhas');
            openModal('modal-campanha');
            const nomeInput = document.getElementById('camp-nome');
            const tipoInput = document.getElementById('camp-tipo');
            const corpoInput = document.getElementById('camp-corpo');

            if (nomeInput) nomeInput.value = `Queima Relâmpago: ${itemNome}`;
            if (tipoInput) tipoInput.value = 'whatsapp';
            if (corpoInput) {
                corpoInput.value = `🔥 OFERTA EXCLUSIVA DO CHEF HOJE!\n\nOlá {nome}! O Chef preparou um prato especial com lote selecionado de *${itemNome}* com 25% OFF apenas hoje.\n\nReserve sua mesa ou peça direto pelo WhatsApp antes que esgote o lote de hoje! 🍷`;
            }
            showToast(`Campanha de queima para "${itemNome}" configurada! Revise e confirme o envio.`, 'info');
        }

        // Init
        document.addEventListener('DOMContentLoaded', () => {
            loadDashboard();

            // Debounced live search on perfis
            const buscaInput = document.getElementById('busca-perfil');
            if (buscaInput) {
                buscaInput.addEventListener('input', debounce(() => loadPerfis(), 400));
            }

            // Close modals on overlay click
            document.querySelectorAll('.modal-overlay').forEach(overlay => {
                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) overlay.classList.remove('active');
                });
            });

            // Close modals on Escape key
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
                }
            });

            // Set default month filter to current month
            const filtroMes = document.getElementById('filtro-vendas-mes');
            if (filtroMes && !filtroMes.value) {
                const now = new Date();
                filtroMes.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            }
        });

    