/**
 * ═════════════════════════════════════════════════════════════════════════
 * CHEF COZINHA ULTRA 3D STUDIO CONTROLLER (High Performance > 6GB RAM)
 * Full Real-Time Sync • Touch POS • 3D Integration • Cashier Engine
 * ═════════════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  window.ChefUltraApp = {
    socket: null,
    ordersData: [],
    allMesas: [],
    produtosData: [],
    categoriasData: [],
    formasPagamento: [],
    turnoAtual: null,

    mesaAtual: null,
    filtroAtivo: 'todas',
    termoBusca: '',
    taxaServicoAtiva: true,
    descontoAtual: 0,
    metodoPagamentoAtivo: 'Dinheiro',
    valorDigitado: '',

    coresPessoas: ['#10b981', '#06b6d4', '#fc4b15', '#8b5cf6', '#ec4899', '#f59e0b', '#3b82f6', '#14b8a6'],
    rachaModo: 'valores',
    rachaQtdPessoas: 2,
    rachaAlocacoesItens: {},
    flowBannerTimer: null,

    audioCtx: null,

    init: function () {
      this.initSocket();
      this.initShortcuts();
      this.initAudio();
      this.initClock();
      this.fetchInitialCatalog();

      if (window.ChefUltra3D) {
        window.ChefUltra3D.init();
      }

      console.log('⚡ [ChefUltraApp] Caixa Ultra 3D Studio Inicializado com Sucesso!');
    },

    initAudio: function () {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) this.audioCtx = new AudioContext();
      } catch (e) { }
    },

    playTone: function (freq, type, duration, gainLevel = 0.25) {
      if (!this.audioCtx) return;
      try {
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
        gain.gain.setValueAtTime(gainLevel, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start();
        osc.stop(this.audioCtx.currentTime + duration);
      } catch (e) { }
    },

    soundClick: function () { this.playTone(850, 'triangle', 0.08, 0.15); },
    soundSuccess: function () {
      this.playTone(587.33, 'sine', 0.15, 0.25);
      setTimeout(() => this.playTone(880, 'sine', 0.25, 0.25), 90);
    },
    soundAlert: function () {
      this.playTone(440, 'sawtooth', 0.2, 0.2);
      setTimeout(() => this.playTone(330, 'sawtooth', 0.3, 0.2), 120);
    },

    initClock: function () {
      const clockEl = document.getElementById('ultra-clock');
      const update = () => {
        if (clockEl) {
          const now = new Date();
          clockEl.innerText = now.toLocaleTimeString('pt-BR');
        }
      };
      setInterval(update, 1000);
      update();
    },

    /**
     * ─── WEBSOCKET REAL-TIME SYNC (SOCKET.IO) ───
     */
    initSocket: function () {
      if (typeof io === 'undefined') {
        console.warn('[ChefUltraApp] Socket.io não encontrado.');
        return;
      }

      this.socket = io({
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 20,
        reconnectionDelay: 1000
      });

      this.socket.on('connect', () => {
        console.log('✅ [ChefUltraApp] Conectado ao servidor WebSocket via Porta 8080');
        const badge = document.getElementById('ultra-conn-badge');
        if (badge) {
          badge.innerHTML = '<span class="ultra-dot-live"></span> Conectado';
          badge.style.color = 'var(--ultra-emerald)';
        }
        this.socket.emit('solicitar_pedidos_caixa_completos');
        this.socket.emit('get_mesas');
        this.socket.emit('get_estado_caixa');
      });

      this.socket.on('disconnect', () => {
        console.warn('⚠️ [ChefUltraApp] Desconectado do servidor.');
        const badge = document.getElementById('ultra-conn-badge');
        if (badge) {
          badge.innerHTML = '<span style="width:7px; height:7px; border-radius:50%; background:var(--ultra-rose);"></span> Reconectando…';
          badge.style.color = 'var(--ultra-rose)';
        }
      });

      this.socket.on('pedidos_caixa_completos', (rows) => {
        this.ordersData = Array.isArray(rows) ? rows : [];
        window.ordersData = this.ordersData;
        this.renderAll();
      });

      this.socket.on('pedidos_pdv_atualizados', (rows) => {
        if (Array.isArray(rows)) {
          this.ordersData = rows;
          window.ordersData = this.ordersData;
          this.renderAll();
        }
      });

      this.socket.on('mesas_atualizadas', (mesas) => {
        this.allMesas = Array.isArray(mesas) ? mesas : [];
        this.renderAll();
      });

      const onNovoPedido = (novoPedido) => {
        if (!novoPedido) return;
        const items = Array.isArray(novoPedido) ? novoPedido : [novoPedido];
        items.forEach(item => {
          if (!item) return;
          const idx = this.ordersData.findIndex(o => o.id === item.id);
          if (idx !== -1) {
            this.ordersData[idx] = { ...this.ordersData[idx], ...item };
          } else {
            this.ordersData.push(item);
          }

          const mesaNome = item.localName || item.mesa_grupo;
          if (mesaNome && window.ChefUltra3D) {
            window.ChefUltra3D.triggerOrderFlow(mesaNome, item.sector || 'Cozinha 1', item);
          }
          this.exibirBannerFluxoPedido(item);
        });

        this.soundSuccess();
        this.renderAll();
      };

      this.socket.on('pedido_adicionado', onNovoPedido);
      this.socket.on('novo_pedido', onNovoPedido);
      this.socket.on('novo_pedido_sync', onNovoPedido);

      this.socket.on('status_atualizado', (pedidoAtualizado) => {
        if (!pedidoAtualizado || pedidoAtualizado.id === undefined) return;
        if (pedidoAtualizado.status === 'Cancelado' || pedidoAtualizado.status === 'Finalizado') {
          this.ordersData = this.ordersData.filter(o => o.id !== pedidoAtualizado.id);
        } else {
          const idx = this.ordersData.findIndex(o => o.id === pedidoAtualizado.id);
          if (idx !== -1) {
            this.ordersData[idx] = { ...this.ordersData[idx], ...pedidoAtualizado };
          } else {
            this.ordersData.push(pedidoAtualizado);
          }
        }
        this.renderAll();
      });

      this.socket.on('mesa_finalizada', ({ mesaName }) => {
        this.ordersData = this.ordersData.filter(o => o.localName !== mesaName && o.mesa_grupo !== mesaName);
        if (this.mesaAtual && (this.mesaAtual.nome === mesaName || this.mesaAtual.mesaName === mesaName)) {
          this.mesaAtual = null;
        }
        this.soundSuccess();
        this.renderAll();
      });

      this.socket.on('estado_caixa', (turno) => {
        this.turnoAtual = turno;
        this.renderEstadoCaixa();
      });

      this.socket.on('formas_pagamento_atualizadas', (formas) => {
        this.formasPagamento = Array.isArray(formas) ? formas : [];
      });

      this.socket.on('nfce_emitida_sucesso', (data) => {
        if (window.Swal) {
          Swal.fire({
            icon: 'success',
            title: 'NFC-e Autorizada pela SEFAZ!',
            html: `<div style="font-size:13px; text-align:left; background:rgba(16,185,129,0.1); border:1px solid #10b981; padding:10px; border-radius:8px; margin-top:8px;">
                    <div><strong>Chave de Acesso:</strong></div>
                    <code style="font-size:11px; color:#10b981; word-break:break-all;">${data.chave}</code>
                   </div>
                   <div style="margin-top:14px; display:flex; gap:8px; justify-content:center;">
                     <button onclick="window.open('/api/fiscal/danfe/${data.chave}', '_blank')" style="background:#10b981; color:#fff; border:none; padding:8px 16px; border-radius:6px; font-weight:700; cursor:pointer;">
                       <i class='ph ph-printer'></i> Imprimir DANFE NFC-e
                     </button>
                   </div>`,
            background: '#0f172a',
            color: '#f8fafc'
          });
        }
      });

      this.socket.on('nfce_emitida_erro', (data) => {
        if (window.Swal) {
          Swal.fire({
            icon: 'warning',
            title: 'Aviso Fiscal (NFC-e)',
            text: data.erro || 'Falha na emissão fiscal ou servidor em modo homologação offline.',
            background: '#0f172a',
            color: '#f8fafc'
          });
        }
      });
    },

    fetchInitialCatalog: function () {
      const defaultCatalog = [
        { id: 101, nome: 'Pizza Margherita', emoji: '🍕', categoria: 'Pizzas', preco: 68.00 },
        { id: 102, nome: 'Pizza Calabresa Especial', emoji: '🍕', categoria: 'Pizzas', preco: 72.00 },
        { id: 103, nome: 'Hambúrguer Gourmet Angus', emoji: '🍔', categoria: 'Lanches', preco: 42.00 },
        { id: 104, nome: 'Cheeseburger Smash Duplo', emoji: '🍔', categoria: 'Lanches', preco: 36.00 },
        { id: 105, nome: 'Batata Rústica Trufada', emoji: '🍟', categoria: 'Porções', preco: 32.00 },
        { id: 106, nome: 'Isca de Peixe Crocante', emoji: '🍤', categoria: 'Porções', preco: 48.00 },
        { id: 107, nome: 'Chopp Pilsen 500ml', emoji: '🍺', categoria: 'Bebidas', preco: 14.00 },
        { id: 108, nome: 'Chopp IPA Artesanal 500ml', emoji: '🍺', categoria: 'Bebidas', preco: 18.00 },
        { id: 109, nome: 'Drink Gin Tropical', emoji: '🍹', categoria: 'Bebidas', preco: 28.00 },
        { id: 110, nome: 'Refrigerante Lata 350ml', emoji: '🥤', categoria: 'Bebidas', preco: 8.50 },
        { id: 111, nome: 'Suco Natural Laranja 400ml', emoji: '🧃', categoria: 'Bebidas', preco: 12.00 },
        { id: 112, nome: 'Petit Gâteau c/ Sorvete', emoji: '🍨', categoria: 'Sobremesas', preco: 26.00 }
      ];

      this.produtosData = defaultCatalog;
      this.categoriasData = ['Todas', ...new Set(defaultCatalog.map(p => p.categoria || 'Geral'))];
      this.renderCatalogModal();

      fetch('/api/produtos')
        .then(r => r.json())
        .then(res => {
          const prods = Array.isArray(res) ? res : (res && Array.isArray(res.produtos) ? res.produtos : null);
          if (prods && prods.length > 0) {
            this.produtosData = prods;
            this.categoriasData = ['Todas', ...new Set(prods.map(p => p.categoria || 'Geral').filter(Boolean))];
            this.renderCatalogModal();
          }
        })
        .catch(() => {});
    },

    renderAll: function () {
      this.renderMesasGrid();
      this.renderPainelMesa();
      this.renderSummary();

      if (window.ChefUltra3D) {
        window.ChefUltra3D.updateMesas(this.allMesas, this.ordersData);
      }
    },

    getMesasProcessadas: function () {
      const grouped = {};

      (this.ordersData || []).forEach(o => {
        const key = (o.mesa_grupo || o.localName || `Avulso #${o.id}`).trim();
        if (!grouped[key]) {
          grouped[key] = {
            nome: key,
            mesaName: key,
            items: [],
            total: 0,
            totalBruto: 0,
            status: o.status,
            userName: o.userName || 'Garçom',
            time: o.time || '--:--',
            createdAt: o.createdAt
          };
        }
        const val = parseFloat(String(o.total || '0').replace(',', '.')) || 0;
        grouped[key].items.push(o);
        grouped[key].totalBruto += val;
        if (o.status !== 'Pago') {
          grouped[key].total += val;
        }
      });

      const resultado = [];
      const mesasVistas = new Set();

      Object.keys(grouped).forEach(k => {
        resultado.push({
          ...grouped[k],
          isOcupada: true,
          statusClass: 'ocupada'
        });
        mesasVistas.add(k.toLowerCase());
      });

      (this.allMesas || []).forEach(m => {
        if (!mesasVistas.has(m.nome.toLowerCase())) {
          resultado.push({
            nome: m.nome,
            mesaName: m.nome,
            items: [],
            total: 0,
            totalBruto: 0,
            status: m.status || 'Disponível',
            userName: '-',
            time: '--:--',
            isOcupada: false,
            statusClass: m.status === 'Reservada' ? 'reservada' : 'livre'
          });
        }
      });

      return resultado;
    },

    renderMesasGrid: function () {
      const grid = document.getElementById('ultra-grid-container');
      if (!grid) return;

      const mesas = this.getMesasProcessadas();

      let countTodas = mesas.length;
      let countOcupadas = mesas.filter(m => m.isOcupada).length;
      let countLivres = mesas.filter(m => !m.isOcupada && m.statusClass === 'livre').length;
      let countReservadas = mesas.filter(m => m.statusClass === 'reservada').length;

      this.updateBadge('count-todas', countTodas);
      this.updateBadge('count-ocupadas', countOcupadas);
      this.updateBadge('count-livres', countLivres);
      this.updateBadge('count-reservadas', countReservadas);

      const filtradas = mesas.filter(m => {
        if (this.filtroAtivo === 'ocupadas' && !m.isOcupada) return false;
        if (this.filtroAtivo === 'livres' && (m.isOcupada || m.statusClass !== 'livre')) return false;
        if (this.filtroAtivo === 'reservadas' && m.statusClass !== 'reservada') return false;

        if (this.termoBusca) {
          const termo = this.termoBusca.toLowerCase();
          const matchNome = m.nome.toLowerCase().includes(termo);
          const matchGarcom = (m.userName || '').toLowerCase().includes(termo);
          if (!matchNome && !matchGarcom) return false;
        }
        return true;
      });

      grid.innerHTML = filtradas.map(m => {
        const isSelected = this.mesaAtual && (this.mesaAtual.nome === m.nome || this.mesaAtual.mesaName === m.nome);
        const iconClass = m.isOcupada ? 'ph-bold ph-users' : (m.statusClass === 'reservada' ? 'ph-bold ph-bookmark-simple' : 'ph-bold ph-chair');

        return `
          <div class="ultra-mesa-card status-${m.statusClass} ${isSelected ? 'selected' : ''}" onclick="ChefUltraApp.selecionarMesa('${m.nome}')">
            <div class="ultra-mesa-header">
              <span class="ultra-mesa-id">${m.nome}</span>
              <div class="ultra-mesa-badge-icon"><i class="${iconClass}"></i></div>
            </div>
            <div class="ultra-mesa-details">
              <div class="ultra-mesa-waiter"><i class="ph ph-user"></i> ${m.userName}</div>
              <div class="ultra-mesa-client"><i class="ph ph-clock"></i> ${m.time}</div>
            </div>
            <div class="ultra-mesa-footer">
              <span class="ultra-mesa-items-count">${m.items.length} item(s)</span>
              <span class="ultra-mesa-value">R$ ${m.total.toFixed(2).replace('.', ',')}</span>
            </div>
          </div>
        `;
      }).join('');
    },

    updateBadge: function (id, count) {
      const el = document.getElementById(id);
      if (el) el.innerText = count;
    },

    selecionarMesa: function (nome) {
      const mesas = this.getMesasProcessadas();
      const mesa = mesas.find(m => m.nome === nome);
      if (!mesa) return;

      this.mesaAtual = mesa;
      window.mesaAtual = mesa;
      window.ordersData = this.ordersData;
      this.soundClick();
      if (window.ChefUltraGame && window.ChefUltraGame.sfx) {
        window.ChefUltraGame.sfx.playTableSelect();
      }
      this.renderAll();

      if (mesa.isOcupada) {
        let totalCalculado = mesa.total;
        if (this.taxaServicoAtiva) totalCalculado *= 1.1;
        totalCalculado = Math.max(0, totalCalculado - this.descontoAtual);
        this.valorDigitado = totalCalculado.toFixed(2);
      } else {
        this.valorDigitado = '0.00';
      }
      this.updateVisor();
    },

    renderPainelMesa: function () {
      const mesa = this.mesaAtual;
      const titleEl = document.getElementById('ultra-mesa-titulo');
      const metaEl = document.getElementById('ultra-mesa-meta');
      const tbody = document.getElementById('ultra-tbody-itens');
      const btnFinalizar = document.getElementById('ultra-btn-concluir-venda');

      if (!mesa) {
        if (titleEl) titleEl.innerHTML = '<i class="ph ph-hand-pointing"></i> Nenhuma mesa selecionada';
        if (metaEl) metaEl.innerHTML = 'Clique em uma mesa no salão ou no Salão 3D para gerenciar';
        if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--ultra-text-muted);">Selecione uma mesa no Salão para ver seus itens</td></tr>`;
        if (btnFinalizar) btnFinalizar.disabled = true;
        return;
      }

      if (titleEl) titleEl.innerHTML = `<i class="ph-bold ph-armchair"></i> ${mesa.nome}`;
      if (metaEl) {
        metaEl.innerHTML = `
          <span>Atendente: <strong>${mesa.userName}</strong></span>
          <span class="ultra-stay-timer"><i class="ph ph-timer"></i> Entrada: ${mesa.time}</span>
        `;
      }

      if (!mesa.isOcupada || mesa.items.length === 0) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--ultra-text-muted);">Mesa Livre sem pedidos ativos. Use o botão <strong>+ Lançar Item</strong> para iniciar a conta.</td></tr>`;
        if (btnFinalizar) btnFinalizar.disabled = true;
        return;
      }

      if (btnFinalizar) btnFinalizar.disabled = false;

      if (tbody) {
        tbody.innerHTML = mesa.items.map((it, idx) => {
          const valTotal = parseFloat(String(it.total || '0').replace(',', '.')).toFixed(2).replace('.', ',');
          const isPago = it.status === 'Pago';
          let statusCls = 'status-preparo';
          if (it.status === 'Pronto') statusCls = 'status-pronto';
          if (it.status === 'Entregue') statusCls = 'status-entregue';
          if (isPago) statusCls = 'status-pago';

          return `
            <tr style="${isPago ? 'opacity:0.5;' : ''}">
              <td style="color:var(--ultra-text-muted); font-family:var(--ultra-font-mono);">${String(idx + 1).padStart(2, '0')}</td>
              <td>
                <div class="ultra-item-title">
                  <span>${it.productEmoji || '🍽️'}</span>
                  <span>${it.productName || 'Item'}</span>
                </div>
              </td>
              <td style="font-family:var(--ultra-font-mono);">${it.quantity || 1}x</td>
              <td style="font-family:var(--ultra-font-mono); font-weight:700; color:var(--ultra-emerald);">R$ ${valTotal}</td>
              <td><span class="ultra-status-pill ${statusCls}">${it.status || 'Pendente'}</span></td>
            </tr>
          `;
        }).join('');
      }
    },

    renderSummary: function () {
      const mesa = this.mesaAtual;
      const elSubtotal = document.getElementById('ultra-val-subtotal');
      const elTaxa = document.getElementById('ultra-val-taxa');
      const elDesconto = document.getElementById('ultra-val-desconto');
      const elTotal = document.getElementById('ultra-val-total');

      if (!mesa || !mesa.isOcupada) {
        if (elSubtotal) elSubtotal.innerText = 'R$ 0,00';
        if (elTaxa) elTaxa.innerText = 'R$ 0,00';
        if (elDesconto) elDesconto.innerText = 'R$ 0,00';
        if (elTotal) elTotal.innerText = 'R$ 0,00';
        return;
      }

      const subtotal = mesa.total;
      const taxa = this.taxaServicoAtiva ? subtotal * 0.1 : 0;
      const desc = this.descontoAtual || 0;
      const totalGeral = Math.max(0, subtotal + taxa - desc);

      if (elSubtotal) elSubtotal.innerText = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;
      if (elTaxa) elTaxa.innerText = `R$ ${taxa.toFixed(2).replace('.', ',')}`;
      if (elDesconto) elDesconto.innerText = `R$ ${desc.toFixed(2).replace('.', ',')}`;
      if (elTotal) elTotal.innerText = `R$ ${totalGeral.toFixed(2).replace('.', ',')}`;
    },

    toggleTaxaServico: function () {
      this.taxaServicoAtiva = !this.taxaServicoAtiva;
      const btn = document.getElementById('ultra-btn-taxa');
      if (btn) btn.classList.toggle('primary', this.taxaServicoAtiva);
      this.soundClick();
      this.renderSummary();
      if (this.mesaAtual && this.mesaAtual.isOcupada) {
        let totalCalculado = this.mesaAtual.total;
        if (this.taxaServicoAtiva) totalCalculado *= 1.1;
        totalCalculado = Math.max(0, totalCalculado - this.descontoAtual);
        this.valorDigitado = totalCalculado.toFixed(2);
        this.updateVisor();
      }
    },

    /**
     * ─── TECLADO NUMÉRICO TÁTIL & CHECKOUT EXPRESS ───
     */
    teclarNumero: function (digito) {
      this.soundClick();
      if (window.ChefUltraGame && window.ChefUltraGame.sfx) {
        window.ChefUltraGame.sfx.playBlip(920);
      }
      if (digito === 'C') {
        this.valorDigitado = '';
      } else if (digito === 'BS') {
        this.valorDigitado = this.valorDigitado.slice(0, -1);
      } else {
        if (this.valorDigitado.length < 8) {
          this.valorDigitado += digito;
        }
      }
      this.updateVisor();
    },

    definirValorRapido: function (valor) {
      this.soundClick();
      this.valorDigitado = Number(valor).toFixed(2);
      this.updateVisor();
    },

    sugerirValor: function (tipo) {
      this.soundClick();
      if (!this.mesaAtual || !this.mesaAtual.isOcupada) return;
      let total = this.mesaAtual.total;
      if (this.taxaServicoAtiva) total *= 1.1;
      total = Math.max(0, total - this.descontoAtual);

      if (tipo === 'exato') {
        this.valorDigitado = total.toFixed(2);
      } else if (tipo === '+10') {
        const atual = parseFloat(this.valorDigitado || total) || 0;
        this.valorDigitado = (atual + 10).toFixed(2);
      } else {
        this.valorDigitado = parseFloat(tipo).toFixed(2);
      }
      this.updateVisor();
    },

    selecionarMetodo: function (metodo) {
      this.soundClick();
      this.metodoPagamentoAtivo = metodo;
      document.querySelectorAll('.ultra-payment-btn').forEach(b => b.classList.remove('active'));
      const activeBtn = document.getElementById(`pay-btn-${metodo.toLowerCase()}`);
      if (activeBtn) activeBtn.classList.add('active');

      const formaNome = document.getElementById('ultra-forma-nome');
      if (formaNome) formaNome.innerText = metodo;

      this.updateVisor();
    },

    updateVisor: function () {
      const visor = document.getElementById('ultra-visor-amount');
      const val = parseFloat(this.valorDigitado || '0');
      if (visor) visor.innerText = `R$ ${val.toFixed(2).replace('.', ',')}`;

      // Cálculo de troco ao vivo ilustrado se for Dinheiro
      const mesa = this.mesaAtual;
      const trocoBox = document.getElementById('ultra-troco-info');
      if (mesa && mesa.isOcupada && this.metodoPagamentoAtivo === 'Dinheiro') {
        let total = mesa.total;
        if (this.taxaServicoAtiva) total *= 1.1;
        total = Math.max(0, total - this.descontoAtual);

        if (val > total && trocoBox) {
          const troco = val - total;
          trocoBox.style.display = 'block';
          const chipsHtml = this.calcularCedulasTroco(troco);

          trocoBox.innerHTML = `
            <div style="font-size:12px; margin-bottom:4px; display:flex; justify-content:space-between; align-items:center;">
              <span>Troco a Devolver:</span>
              <strong style="color:var(--ultra-cyan); font-size:15px; font-family:var(--ultra-font-mono);">R$ ${troco.toFixed(2).replace('.', ',')}</strong>
            </div>
            <div class="ultra-troco-diagram">
              <div class="ultra-troco-math-row">
                <span>Recebido: R$ ${val.toFixed(2).replace('.', ',')}</span>
                <span>Conta: R$ ${total.toFixed(2).replace('.', ',')}</span>
              </div>
              <div class="ultra-troco-notes-drawer">
                ${chipsHtml}
              </div>
            </div>
          `;
        } else if (trocoBox) {
          trocoBox.style.display = 'none';
        }
      } else if (trocoBox) {
        trocoBox.style.display = 'none';
      }
    },

    calcularCedulasTroco: function (valor) {
      let restante = Math.round(valor * 100);
      const denominacoes = [
        { tipo: 'nota', val: 10000, label: 'R$ 100', cls: 'ultra-banknote-100' },
        { tipo: 'nota', val: 5000, label: 'R$ 50', cls: 'ultra-banknote-50' },
        { tipo: 'nota', val: 2000, label: 'R$ 20', cls: 'ultra-banknote-20' },
        { tipo: 'nota', val: 1000, label: 'R$ 10', cls: 'ultra-banknote-10' },
        { tipo: 'nota', val: 500, label: 'R$ 5', cls: 'ultra-banknote-5' },
        { tipo: 'nota', val: 200, label: 'R$ 2', cls: 'ultra-banknote-2' },
        { tipo: 'moeda', val: 100, label: 'R$ 1', cls: 'ultra-coin-chip' },
        { tipo: 'moeda', val: 50, label: 'R$ 0,50', cls: 'ultra-coin-chip' }
      ];

      const resultado = [];
      denominacoes.forEach(d => {
        if (restante >= d.val) {
          const qtd = Math.floor(restante / d.val);
          restante = restante % d.val;
          const icon = (d.tipo === 'nota') ? '💵' : '🪙';
          resultado.push(`<span class="ultra-banknote-chip ${d.cls}" title="${qtd}x ${d.label}">${icon} ${qtd}x ${d.label}</span>`);
        }
      });

      return resultado.length > 0 ? resultado.join('') : '<span style="font-size:10px; color:var(--ultra-text-muted);">Sem troco necessário</span>';
    },

    concluirVenda: function () {
      if (!this.mesaAtual || !this.mesaAtual.isOcupada) {
        if (window.Swal) {
          Swal.fire({
            icon: 'warning',
            title: 'Mesa não selecionada',
            text: 'Selecione uma mesa ocupada para finalizar a venda.',
            background: '#0f172a',
            color: '#f8fafc',
            confirmButtonColor: '#fc4b15'
          });
        } else {
          alert('Selecione uma mesa ocupada para finalizar a venda.');
        }
        return;
      }

      const mesaNome = this.mesaAtual.nome;
      const metodo = this.metodoPagamentoAtivo;
      let totalPagar = this.mesaAtual.total;
      if (this.taxaServicoAtiva) totalPagar *= 1.1;
      totalPagar = Math.max(0, totalPagar - this.descontoAtual);

      const valor = parseFloat(this.valorDigitado || totalPagar);

      const emitFinalizar = (emitirNfce = false, cpfCnpj = '') => {
        this.soundSuccess();
        if (window.ChefUltraGame) {
          window.ChefUltraGame.onVendaConcluida(valor, metodo);
        }
        this.socket.emit('finalizar_mesa', {
          mesaName: mesaNome,
          metodoPagamento: metodo,
          valorFinal: valor.toFixed(2),
          operador: 'Operador Ultra'
        });

        if (emitirNfce) {
          const itens = (this.mesaAtual.itens || []).map(i => ({
            nome: i.nome || i.produto_nome || 'Consumo Restaurante',
            quantidade: i.quantidade || 1,
            preco: i.preco || i.preco_unitario || valor,
            ncm: i.ncm || '21069090',
            cfop: i.cfop || '5102'
          }));
          this.socket.emit('emitir_nfce_balcao', {
            mesaId: mesaNome,
            itens: itens.length > 0 ? itens : [{ nome: 'Consumo Salão ' + mesaNome, quantidade: 1, preco: valor }],
            totalValue: valor,
            formaPagamento: metodo,
            cpfCnpj: cpfCnpj || null
          });
        }

        if (window.Swal) {
          Swal.fire({
            icon: 'success',
            title: 'Venda Concluída!',
            text: `${mesaNome} finalizada com sucesso via ${metodo}!${emitirNfce ? ' Solicitando autorização SEFAZ...' : ''}`,
            timer: 2500,
            showConfirmButton: false,
            background: '#0f172a',
            color: '#f8fafc'
          });
        }
      };

      if (window.Swal) {
        Swal.fire({
          title: `Fechar ${mesaNome}?`,
          html: `<div style="font-size:14px; margin-top:8px;">Forma: <strong>${metodo}</strong><br>Total Final: <strong style="color:#10b981; font-size:22px; font-family:monospace;">R$ ${valor.toFixed(2).replace('.', ',')}</strong></div>
          <div style="margin-top:14px; padding:10px 12px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:8px; text-align:left;">
            <label style="display:flex; align-items:center; gap:8px; font-size:13px; cursor:pointer; color:#f8fafc;">
              <input type="checkbox" id="swal-nfce-emitir" checked style="accent-color:#10b981; width:16px; height:16px;">
              <span><strong>🧾 Emitir Cupom Fiscal (NFC-e)</strong></span>
            </label>
            <input type="text" id="swal-nfce-cpf" placeholder="CPF/CNPJ na Nota (Opcional)" style="width:100%; box-sizing:border-box; margin-top:8px; padding:6px 10px; background:#1e293b; border:1px solid #334155; border-radius:6px; color:#f8fafc; font-size:12px;">
          </div>`,
          icon: 'question',
          showCancelButton: true,
          confirmButtonColor: '#10b981',
          cancelButtonColor: '#64748b',
          confirmButtonText: 'Confirmar Fechamento',
          cancelButtonText: 'Cancelar',
          background: '#0f172a',
          color: '#f8fafc'
        }).then((result) => {
          if (result.isConfirmed) {
            const chkNfce = document.getElementById('swal-nfce-emitir');
            const txtCpf = document.getElementById('swal-nfce-cpf');
            const emitirNfce = chkNfce ? chkNfce.checked : false;
            const cpfCnpj = txtCpf ? txtCpf.value.trim() : '';
            emitFinalizar(emitirNfce, cpfCnpj);
          }
        });
      } else {
        if (confirm(`Confirmar fechamento da ${mesaNome} via ${metodo} no valor de R$ ${valor.toFixed(2)}?`)) {
          emitFinalizar(false, '');
        }
      }
    },

    emitirNfceAvulsa: function () {
      if (!this.mesaAtual || !this.mesaAtual.isOcupada) {
        if (window.Swal) {
          Swal.fire({
            icon: 'info',
            title: 'Módulo Fiscal NFC-e',
            text: 'Selecione uma mesa com consumo para emitir cupom fiscal avulso.',
            background: '#0f172a',
            color: '#f8fafc'
          });
        } else {
          alert('Selecione uma mesa com consumo para emitir cupom fiscal avulso.');
        }
        return;
      }

      const mesaNome = this.mesaAtual.nome;
      const valor = parseFloat(this.mesaAtual.total || 0);

      if (window.Swal) {
        Swal.fire({
          title: `Emitir NFC-e: ${mesaNome}`,
          html: `<div style="font-size:13px; text-align:left; color:#cbd5e1; margin-top:6px;">
                  <div>Valor dos Itens: <strong style="color:#10b981; font-family:monospace; font-size:16px;">R$ ${valor.toFixed(2).replace('.', ',')}</strong></div>
                  <div style="margin-top:10px;">
                    <label style="font-size:12px; font-weight:700;">CPF ou CNPJ do Cliente (Opcional):</label>
                    <input type="text" id="swal-nfce-avulsa-cpf" placeholder="000.000.000-00" style="width:100%; box-sizing:border-box; margin-top:4px; padding:6px 10px; background:#1e293b; border:1px solid #334155; border-radius:6px; color:#f8fafc; font-size:13px;">
                  </div>
                 </div>`,
          icon: 'question',
          showCancelButton: true,
          confirmButtonColor: '#f59e0b',
          confirmButtonText: 'Emitir NFC-e na SEFAZ',
          cancelButtonText: 'Cancelar',
          background: '#0f172a',
          color: '#f8fafc'
        }).then((res) => {
          if (res.isConfirmed) {
            const txtCpf = document.getElementById('swal-nfce-avulsa-cpf');
            const cpfCnpj = txtCpf ? txtCpf.value.trim() : '';
            const itens = (this.mesaAtual.itens || []).map(i => ({
              nome: i.nome || i.produto_nome || 'Consumo Restaurante',
              quantidade: i.quantidade || 1,
              preco: i.preco || i.preco_unitario || valor,
              ncm: i.ncm || '21069090',
              cfop: i.cfop || '5102'
            }));

            this.socket.emit('emitir_nfce_balcao', {
              mesaId: mesaNome,
              itens: itens.length > 0 ? itens : [{ nome: 'Consumo Salão ' + mesaNome, quantidade: 1, preco: valor }],
              totalValue: valor,
              formaPagamento: this.metodoPagamentoAtivo || 'DINHEIRO',
              cpfCnpj: cpfCnpj || null
            });

            Swal.fire({
              icon: 'info',
              title: 'Processando NFC-e...',
              text: 'Transmitindo dados fiscais para a SEFAZ.',
              timer: 1800,
              showConfirmButton: false,
              background: '#0f172a',
              color: '#f8fafc'
            });
          }
        });
      }
    },

    toggleSalonView: function (mode) {
      document.querySelectorAll('.ultra-view-btn').forEach(b => b.classList.remove('active'));
      const btn = document.getElementById(`btn-view-${mode}`);
      if (btn) btn.classList.add('active');

      if (window.ChefUltra3D) {
        window.ChefUltra3D.toggleSalonMode(mode === '3d');
      }
    },

    renderEstadoCaixa: function () {
      const pill = document.getElementById('ultra-caixa-status-pill');
      if (!pill) return;
      if (this.turnoAtual && this.turnoAtual.status === 'Aberto') {
        pill.className = 'ultra-caixa-status-pill aberto';
        pill.innerHTML = `<i class="ph ph-lock-key-open"></i> Caixa Aberto (Turno #${this.turnoAtual.id})`;
      } else {
        pill.className = 'ultra-caixa-status-pill fechado';
        pill.innerHTML = `<i class="ph ph-lock-key"></i> Caixa Fechado`;
      }
    },

    /**
     * ─── MODAIS DE OPERAÇÃO RÁPIDA ───
     */
    abrirModalProdutos: function () {
      if (!this.mesaAtual) {
        alert('Selecione uma mesa primeiro.');
        return;
      }
      this.soundClick();
      const modal = document.getElementById('ultra-modal-produtos');
      if (modal) modal.classList.add('active');
    },

    fecharModalProdutos: function () {
      const modal = document.getElementById('ultra-modal-produtos');
      if (modal) modal.classList.remove('active');
    },

    renderCatalogModal: function (categoriaFiltro = 'Todas', busca = '') {
      const catContainer = document.getElementById('ultra-modal-cat-chips');
      const prodGrid = document.getElementById('ultra-modal-prods-grid');
      if (!catContainer || !prodGrid) return;

      catContainer.innerHTML = this.categoriasData.map(c => `
        <button class="ultra-chip ${c === categoriaFiltro ? 'active' : ''}" onclick="ChefUltraApp.renderCatalogModal('${c}', '${busca}')">${c}</button>
      `).join('');

      const buscaNorm = String(busca || '').toLowerCase().trim();

      const filtrados = (this.produtosData || []).filter(p => {
        if (!p) return false;
        const cat = String(p.categoria || 'Geral');
        const nome = String(p.nome || p.productName || 'Produto');
        if (categoriaFiltro !== 'Todas' && cat !== categoriaFiltro) return false;
        if (buscaNorm && !nome.toLowerCase().includes(buscaNorm)) return false;
        return true;
      });

      prodGrid.innerHTML = filtrados.map(p => `
        <div class="ultra-prod-card" onclick="ChefUltraApp.lancarProdutoDireto(${p.id || 0}, '${(p.nome || p.productName || 'Item').replace(/'/g, "\\'")}', '${p.emoji || '🍽️'}', ${p.preco || 0})">
          <div class="ultra-prod-emoji">${p.emoji || '🍽️'}</div>
          <div class="ultra-prod-name">${p.nome || p.productName || 'Produto'}</div>
          <div class="ultra-prod-price">R$ ${Number(p.preco || 0).toFixed(2).replace('.', ',')}</div>
        </div>
      `).join('');
    },

    lancarProdutoDireto: function (id, nome, emoji, preco) {
      if (!this.mesaAtual) return;
      this.soundSuccess();
      if (window.ChefUltraGame) {
        window.ChefUltraGame.onItemLaunched(nome, preco);
      }

      const mesaNome = this.mesaAtual.nome;
      const novoItem = {
        productName: nome,
        productEmoji: emoji,
        quantity: 1,
        total: Number(preco).toFixed(2),
        localName: mesaNome,
        userName: 'Caixa Ultra',
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        status_inicial: 'Em preparo',
        sector: 'Cozinha 1'
      };

      this.socket.emit('novo_pedido', novoItem);
      this.fecharModalProdutos();
    },

    abrirModalRacha: function () {
      if (!this.mesaAtual || !this.mesaAtual.isOcupada) {
        if (window.Swal) {
          Swal.fire({
            icon: 'warning',
            title: 'Mesa sem consumo',
            text: 'Selecione uma mesa com consumo para rachar a conta.',
            background: '#0f172a',
            color: '#f8fafc',
            confirmButtonColor: '#fc4b15'
          });
        } else {
          alert('Selecione uma mesa com consumo para rachar a conta.');
        }
        return;
      }
      this.soundClick();
      const modal = document.getElementById('ultra-modal-racha');
      if (modal) {
        modal.classList.add('active');
        this.renderRachaStudio();
      }
    },

    fecharModalRacha: function () {
      const modal = document.getElementById('ultra-modal-racha');
      if (modal) modal.classList.remove('active');
    },

    alternarAbaRacha: function (modo) {
      this.soundClick();
      this.rachaModo = modo;
      document.querySelectorAll('.ultra-racha-tab').forEach(t => t.classList.remove('active'));
      const activeTab = document.getElementById(`tab-racha-${modo}`);
      if (activeTab) activeTab.classList.add('active');

      document.querySelectorAll('.ultra-racha-content-pane').forEach(p => p.classList.remove('active'));
      const activePane = document.getElementById(`pane-racha-${modo}`);
      if (activePane) activePane.classList.add('active');

      this.renderRachaStudio();
    },

    alterarQtdPessoasRacha: function (delta) {
      this.soundClick();
      const novaQtd = Math.max(1, Math.min(8, this.rachaQtdPessoas + delta));
      this.rachaQtdPessoas = novaQtd;
      const inp = document.getElementById('ultra-racha-pessoas-input');
      if (inp) inp.value = novaQtd;
      this.renderRachaStudio();
    },

    renderRachaStudio: function () {
      if (this.rachaModo === 'valores') {
        this.renderRachaValores();
      } else {
        this.renderRachaItens();
      }
    },

    renderRachaValores: function () {
      if (!this.mesaAtual) return;
      let total = this.mesaAtual.total;
      if (this.taxaServicoAtiva) total *= 1.1;
      total = Math.max(0, total - this.descontoAtual);

      const n = this.rachaQtdPessoas;
      const cota = total / n;
      const percentual = (100 / n).toFixed(1);

      const elCenterVal = document.getElementById('ultra-pie-center-val');
      if (elCenterVal) elCenterVal.innerText = `R$ ${total.toFixed(2).replace('.', ',')}`;

      // Renderiza fatias do Prato / Pizza em SVG
      const svg = document.getElementById('ultra-pie-svg');
      if (svg) {
        const cx = 110, cy = 110, r = 90;
        let startAngle = 0;
        const angleStep = (2 * Math.PI) / n;
        let pathsHtml = '';

        for (let i = 0; i < n; i++) {
          const color = this.coresPessoas[i % this.coresPessoas.length];
          const endAngle = startAngle + angleStep;

          let pathD;
          if (n === 1) {
            pathD = `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
          } else {
            const x1 = (cx + r * Math.cos(startAngle)).toFixed(2);
            const y1 = (cy + r * Math.sin(startAngle)).toFixed(2);
            const x2 = (cx + r * Math.cos(endAngle)).toFixed(2);
            const y2 = (cy + r * Math.sin(endAngle)).toFixed(2);
            const largeArc = angleStep > Math.PI ? 1 : 0;
            pathD = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
          }

          pathsHtml += `
            <path class="ultra-pie-slice" d="${pathD}" fill="${color}" opacity="0.88" stroke="#0f172a" stroke-width="3" onclick="ChefUltraApp.cobrarCotaEspecifica(${i}, ${cota})">
              <title>Pessoa ${i + 1}: R$ ${cota.toFixed(2).replace('.', ',')} (${percentual}%)</title>
            </path>
          `;
          startAngle = endAngle;
        }
        svg.innerHTML = pathsHtml;
      }

      // Renderiza lista explicativa de pessoas
      const containerPessoas = document.getElementById('ultra-pie-persons-container');
      if (containerPessoas) {
        let cardsHtml = '';
        for (let i = 0; i < n; i++) {
          const color = this.coresPessoas[i % this.coresPessoas.length];
          cardsHtml += `
            <div class="ultra-person-split-card" style="--person-color: ${color};">
              <div class="ultra-person-split-info">
                <div class="ultra-person-avatar">👤</div>
                <div>
                  <div class="ultra-person-name">Pessoa ${i + 1}</div>
                  <div class="ultra-person-share-sub">Cota ${i + 1} de ${n} • ${percentual}% da conta</div>
                </div>
              </div>
              <div class="ultra-person-amount-box">
                <div class="ultra-person-val">R$ ${cota.toFixed(2).replace('.', ',')}</div>
                <button class="ultra-btn-action primary" style="padding:6px 12px; font-size:11px;" onclick="ChefUltraApp.cobrarCotaEspecifica(${i}, ${cota})">
                  <i class="ph-bold ph-hand-coins"></i> Cobrar
                </button>
              </div>
            </div>
          `;
        }
        containerPessoas.innerHTML = cardsHtml;
      }
    },

    cobrarCotaEspecifica: function (pessoaIndex, valorCota) {
      this.soundSuccess();
      this.valorDigitado = Number(valorCota).toFixed(2);
      this.updateVisor();
      this.fecharModalRacha();

      if (window.Swal) {
        Swal.fire({
          icon: 'info',
          title: `Cota Pessoa ${pessoaIndex + 1} carregada!`,
          html: `Valor de <strong style="color:#10b981; font-size:22px; font-family:monospace;">R$ ${Number(valorCota).toFixed(2).replace('.', ',')}</strong> inserido no Visor de Pagamento.`,
          timer: 2200,
          showConfirmButton: false,
          background: '#0f172a',
          color: '#f8fafc'
        });
      }
    },

    renderRachaItens: function () {
      if (!this.mesaAtual) return;
      const items = this.mesaAtual.items || [];
      const n = this.rachaQtdPessoas;

      // 1. Painel Esquerdo: Itens consumidos
      const poolContainer = document.getElementById('ultra-pool-items-container');
      if (poolContainer) {
        if (items.length === 0) {
          poolContainer.innerHTML = '<div style="padding:20px; text-align:center; color:var(--ultra-text-muted);">Nenhum item consumido nesta mesa</div>';
        } else {
          poolContainer.innerHTML = items.map((item, idx) => {
            const itemKey = `item_${item.id || idx}`;
            const alocados = this.rachaAlocacoesItens[itemKey] || [];
            const isFully = alocados.length > 0;
            const val = parseFloat(String(item.total || 0).replace(',', '.')) || 0;

            const allocBadges = alocados.map(pIdx => {
              const cor = this.coresPessoas[pIdx % this.coresPessoas.length];
              return `<span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${cor}; margin-left:3px;" title="Pessoa ${pIdx + 1}"></span>`;
            }).join('');

            return `
              <div class="ultra-assignable-item ${isFully ? 'fully-allocated' : ''}" onclick="ChefUltraApp.cicloAtribuirItem('${itemKey}')">
                <div class="ultra-item-main-info">
                  <span class="ultra-item-emoji-badge">${item.productEmoji || '🍽️'}</span>
                  <div class="ultra-item-title-box">
                    <span class="ultra-item-title-text">${item.productName}</span>
                    <span class="ultra-item-alloc-status">
                      ${alocados.length === 0 ? 'Toque para atribuir' : `Atribuído: ${allocBadges}`}
                    </span>
                  </div>
                </div>
                <span class="ultra-item-val-text">R$ ${val.toFixed(2).replace('.', ',')}</span>
              </div>
            `;
          }).join('');
        }
      }

      // 2. Painel Direito: Bandejas individuais das pessoas
      const traysContainer = document.getElementById('ultra-trays-container');
      if (traysContainer) {
        let traysHtml = '';
        for (let pIdx = 0; pIdx < n; pIdx++) {
          const cor = this.coresPessoas[pIdx % this.coresPessoas.length];

          const itensDestaPessoa = [];
          let subtotalPessoa = 0;

          items.forEach((item, idx) => {
            const itemKey = `item_${item.id || idx}`;
            const alocados = this.rachaAlocacoesItens[itemKey] || [];
            if (alocados.includes(pIdx)) {
              const valTotal = parseFloat(String(item.total || 0).replace(',', '.')) || 0;
              const valParcela = valTotal / alocados.length;
              subtotalPessoa += valParcela;
              const fractionText = alocados.length > 1 ? `(1/${alocados.length})` : '';
              itensDestaPessoa.push({
                itemKey: itemKey,
                name: item.productName,
                emoji: item.productEmoji || '🍽️',
                valParcela: valParcela,
                fractionText: fractionText
              });
            }
          });

          const taxaServico = this.taxaServicoAtiva ? subtotalPessoa * 0.1 : 0;
          const totalPessoa = subtotalPessoa + taxaServico;

          const pillsHtml = itensDestaPessoa.length > 0 ? itensDestaPessoa.map(i => `
            <div class="ultra-tray-item-pill">
              <span>${i.emoji}</span>
              <span>${i.name} ${i.fractionText}</span>
              <strong style="color:var(--ultra-emerald); font-family:var(--ultra-font-mono);">R$ ${i.valParcela.toFixed(2).replace('.', ',')}</strong>
              <span class="remove-btn" onclick="event.stopPropagation(); ChefUltraApp.removerItemDePessoa('${i.itemKey}', ${pIdx})">&times;</span>
            </div>
          `).join('') : '<span style="font-size:11px; color:var(--ultra-text-muted);">Nenhum item atribuído ainda (clique nos itens ao lado)</span>';

          traysHtml += `
            <div class="ultra-person-tray" style="--tray-color: ${cor};">
              <div class="ultra-tray-header">
                <div class="ultra-tray-user-badge">
                  <span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:${cor};"></span>
                  <span>Pessoa ${pIdx + 1}</span>
                </div>
                <span style="font-size:11px; color:var(--ultra-text-secondary);">${itensDestaPessoa.length} itens atribuídos</span>
              </div>

              <div class="ultra-tray-items-allocated">
                ${pillsHtml}
              </div>

              <div class="ultra-tray-footer">
                <div class="ultra-tray-total-box">
                  <span style="font-size:10px; color:var(--ultra-text-muted);">Total com serviço (10%):</span>
                  <span class="ultra-tray-total-val">R$ ${totalPessoa.toFixed(2).replace('.', ',')}</span>
                </div>
                <button class="ultra-btn-action primary" style="padding:6px 14px; font-size:11.5px;" onclick="ChefUltraApp.cobrarCotaEspecifica(${pIdx}, ${totalPessoa})" ${totalPessoa <= 0 ? 'disabled' : ''}>
                  <i class="ph-bold ph-hand-coins"></i> Cobrar Esta Pessoa
                </button>
              </div>
            </div>
          `;
        }
        traysContainer.innerHTML = traysHtml;
      }
    },

    cicloAtribuirItem: function (itemKey) {
      this.soundClick();
      if (!this.rachaAlocacoesItens[itemKey]) {
        this.rachaAlocacoesItens[itemKey] = [0];
      } else {
        const cur = this.rachaAlocacoesItens[itemKey];
        if (cur.length === 1 && cur[0] < this.rachaQtdPessoas - 1) {
          this.rachaAlocacoesItens[itemKey] = [cur[0] + 1];
        } else if (cur.length === 1 && cur[0] === this.rachaQtdPessoas - 1 && this.rachaQtdPessoas > 1) {
          const todos = [];
          for (let i = 0; i < this.rachaQtdPessoas; i++) todos.push(i);
          this.rachaAlocacoesItens[itemKey] = todos;
        } else {
          delete this.rachaAlocacoesItens[itemKey];
        }
      }
      this.renderRachaStudio();
    },

    removerItemDePessoa: function (itemKey, pessoaIndex) {
      this.soundClick();
      if (this.rachaAlocacoesItens[itemKey]) {
        this.rachaAlocacoesItens[itemKey] = this.rachaAlocacoesItens[itemKey].filter(p => p !== pessoaIndex);
        if (this.rachaAlocacoesItens[itemKey].length === 0) {
          delete this.rachaAlocacoesItens[itemKey];
        }
      }
      this.renderRachaStudio();
    },

    exibirBannerFluxoPedido: function (item) {
      const banner = document.getElementById('ultra-order-flow-banner');
      if (!banner) return;

      const mesaNome = item.localName || item.mesa_grupo || 'Mesa';
      const sector = item.sector || 'Cozinha 1';
      const isBar = sector.toLowerCase().includes('bar') || sector.toLowerCase().includes('bebida');
      const sectorIcon = isBar ? '🍹' : '👨‍🍳';
      const sectorCor = isBar ? 'var(--ultra-cyan)' : 'var(--ultra-coral)';

      const prodEmoji = item.productEmoji || (isBar ? '🍸' : '🍕');
      const prodName = item.productName || 'Novo Item';
      const qtd = item.quantity || 1;
      const userName = item.userName || 'Garçom';

      banner.innerHTML = `
        <div class="ultra-flow-header">
          <div class="ultra-flow-title">
            <i class="ph-bold ph-lightning"></i> Fluxo de Pedido em Tempo Real
          </div>
          <span style="font-size:11px; font-family:var(--ultra-font-mono); color:var(--ultra-text-muted);">${new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', second:'2-digit' })}</span>
        </div>

        <div class="ultra-flow-diagram">
          <!-- Nó 1: Origem -->
          <div class="ultra-flow-node origin">
            <div class="ultra-flow-node-icon">📱</div>
            <div class="ultra-flow-node-label">${userName}</div>
            <div class="ultra-flow-node-sub">Comanda / App</div>
          </div>

          <!-- Conector Animado 1 -->
          <div class="ultra-flow-connector">
            <svg class="ultra-flow-svg-line" viewBox="0 0 100 24">
              <path class="ultra-flow-dashed-path" d="M 0 12 L 100 12" stroke="var(--ultra-blue)" stroke-width="3" fill="none" />
              <polygon points="98,12 88,8 88,16" fill="var(--ultra-blue)" />
            </svg>
            <span style="font-size:9.5px; color:var(--ultra-blue); font-weight:700;">Transmitido</span>
          </div>

          <!-- Nó 2: Setor de Preparo -->
          <div class="ultra-flow-node sector">
            <div class="ultra-flow-node-icon" style="border-color:${sectorCor}; color:${sectorCor};">${sectorIcon}</div>
            <div class="ultra-flow-node-label">${sector}</div>
            <div class="ultra-flow-badge-item">
              <span>${prodEmoji}</span>
              <span>${qtd}x ${prodName}</span>
            </div>
          </div>

          <!-- Conector Animado 2 -->
          <div class="ultra-flow-connector">
            <svg class="ultra-flow-svg-line" viewBox="0 0 100 24">
              <path class="ultra-flow-dashed-path" d="M 0 12 L 100 12" stroke="var(--ultra-emerald)" stroke-width="3" fill="none" />
              <polygon points="98,12 88,8 88,16" fill="var(--ultra-emerald)" />
            </svg>
            <span style="font-size:9.5px; color:var(--ultra-emerald); font-weight:700;">Computado</span>
          </div>

          <!-- Nó 3: Mesa Destino -->
          <div class="ultra-flow-node target">
            <div class="ultra-flow-node-icon">🪑</div>
            <div class="ultra-flow-node-label">${mesaNome}</div>
            <div class="ultra-flow-node-sub">Salão Principal</div>
          </div>
        </div>
      `;

      banner.classList.add('active');
      this.soundSuccess();

      if (this.flowBannerTimer) clearTimeout(this.flowBannerTimer);
      this.flowBannerTimer = setTimeout(() => {
        banner.classList.remove('active');
      }, 5000);
    },

    abrirPagamentoParcial: function () {
      if (!this.mesaAtual) {
        if (window.Swal) {
          Swal.fire({
            icon: 'info',
            title: 'Selecione uma Mesa ou Comanda',
            text: 'Selecione uma mesa com pedidos para realizar a divisão ou pagamento parcial desagrupado.',
            background: '#0f172a',
            color: '#f8fafc',
            confirmButtonColor: '#fc4b15'
          });
        } else {
          alert('Selecione uma mesa ocupada para realizar o pagamento parcial.');
        }
        return;
      }
      window.ordersData = this.ordersData;
      window.mesaAtual = this.mesaAtual;
      if (typeof window.abrirModalPagamentoParcialDesagrupado === 'function') {
        window.abrirModalPagamentoParcialDesagrupado(this.mesaAtual.nome || this.mesaAtual.mesaName);
      } else {
        this.abrirModalRacha();
      }
    },

    conectarBalancaSerial: async function () {
      if (!navigator.serial) {
        if (window.Swal) {
          Swal.fire({
            icon: 'info',
            title: 'Balança: Modo Manual',
            text: 'Web Serial indisponível neste navegador. Deseja informar o peso manualmente?',
            showCancelButton: true,
            confirmButtonText: 'Digitar Peso (kg)',
            cancelButtonText: 'Fechar',
            background: '#0f172a',
            color: '#f8fafc',
            confirmButtonColor: '#10b981'
          }).then((r) => {
            if (r.isConfirmed) this.fallbackInputPesoManual();
          });
        } else {
          this.fallbackInputPesoManual();
        }
        return;
      }
      try {
        const port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' });
        const textDecoder = new TextDecoderStream();
        port.readable.pipeTo(textDecoder.writable);
        const reader = textDecoder.readable.getReader();

        const btnBalanca = document.getElementById('ultra-btn-conectar-balanca');
        if (btnBalanca) {
          btnBalanca.style.background = 'rgba(16,185,129,0.35)';
          btnBalanca.innerHTML = '<i class="ph-bold ph-scales"></i> Balança Online';
        }

        this.soundSuccess();

        let serialBuffer = '';
        (async () => {
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              if (value) {
                serialBuffer += value;
                const match = serialBuffer.match(/([0-9]+\.[0-9]{3})/);
                if (match) {
                  const pesoKg = parseFloat(match[1]);
                  this.atualizarPesoBalanca(pesoKg);
                  serialBuffer = '';
                }
              }
            }
          } catch (eRead) {
            console.warn('[Caixa Ultra] Leitura da balança finalizada:', eRead);
          }
        })();
      } catch (err) {
        console.warn('[Caixa Ultra] Balança serial não conectada ou cancelada:', err.message);
        // Fallback imediato para digitação manual sem travar o operador
        if (err.name !== 'NotFoundError') {
          this.fallbackInputPesoManual();
        }
      }
    },

    fallbackInputPesoManual: function () {
      if (window.Swal) {
        Swal.fire({
          title: '⚖️ Peso da Balança (Manual)',
          text: 'Digite o peso aferido na balança (em kg):',
          input: 'text',
          inputPlaceholder: 'Ex: 0.450',
          showCancelButton: true,
          confirmButtonText: 'Confirmar Peso',
          confirmButtonColor: '#10b981',
          cancelButtonText: 'Cancelar',
          background: '#0f172a',
          color: '#f8fafc'
        }).then((res) => {
          if (res.isConfirmed && res.value) {
            const peso = parseFloat(res.value.replace(',', '.'));
            if (!isNaN(peso) && peso > 0) {
              this.atualizarPesoBalanca(peso);
            }
          }
        });
      } else {
        const val = prompt('Digite o peso em kg (Ex: 0.450):');
        if (val) {
          const peso = parseFloat(val.replace(',', '.'));
          if (!isNaN(peso) && peso > 0) this.atualizarPesoBalanca(peso);
        }
      }
    },

    imprimirCupomMesa: function (mesaNome) {
      const mesa = this.mesaAtual || (this.mesas || []).find(m => m.nome === mesaNome);
      if (!mesa) return;
      try {
        const win = window.open('', '_blank', 'width=380,height=600');
        if (win) {
          const itensHtml = (mesa.itens || []).map(i => `
            <tr>
              <td>${i.quantidade || 1}x ${i.nome || i.produto_nome || ''}</td>
              <td style="text-align:right;">R$ ${(Number(i.preco || i.preco_unitario || 0) * Number(i.quantidade || 1)).toFixed(2).replace('.', ',')}</td>
            </tr>
          `).join('');
          win.document.write(`
            <!DOCTYPE html><html><head><title>Cupom - ${mesa.nome}</title>
            <style>
              body { font-family: monospace; width: 75mm; margin: 0 auto; padding: 10px; font-size: 12px; }
              h3 { text-align: center; margin: 0 0 5px 0; }
              table { width: 100%; border-collapse: collapse; margin-top: 10px; }
              td { padding: 3px 0; }
              hr { border: none; border-top: 1px dashed #000; margin: 8px 0; }
            </style></head><body>
              <h3>CHEF COZINHA</h3>
              <p style="text-align:center; margin:0; font-size:11px;">EXTRATO DE CONFERÊNCIA — ${mesa.nome}</p>
              <hr>
              <table>${itensHtml}</table>
              <hr>
              <p style="font-weight:bold; font-size:14px; text-align:right; margin:4px 0;">TOTAL: R$ ${Number(mesa.total || 0).toFixed(2).replace('.', ',')}</p>
              <p style="text-align:center; font-size:10px; margin-top:14px;">Documento Não Fiscal</p>
              <script>window.print(); setTimeout(() => window.close(), 1200);<\/script>
            </body></html>
          `);
          win.document.close();
        } else {
          window.print();
        }
      } catch (_) {
        window.print();
      }
    },

    atualizarPesoBalanca: function (pesoKg) {
      if (isNaN(pesoKg) || pesoKg <= 0) return;
      this.soundClick();
      // Se houver produto por quilo selecionado ou mesa aberta, preenche o valor ou modal
      const btnBalanca = document.getElementById('ultra-btn-conectar-balanca');
      if (btnBalanca) {
        btnBalanca.innerHTML = `<i class="ph-bold ph-scales"></i> ${pesoKg.toFixed(3)} kg`;
      }
    },

    processarCodigoBarras: function (codigo) {
      const code = String(codigo || '').trim();
      if (!code) return;

      // 1. Verificar se é número de comanda ou mesa (ex: "05", "12", "MESA 3", "CMD 8")
      const mesas = this.getMesasProcessadas();
      const codeNum = parseInt(code.replace(/\D/g, ''), 10);

      const mesaEncontrada = mesas.find(m => {
        const mNome = m.nome.toLowerCase();
        return mNome === code.toLowerCase() ||
               mNome === `mesa ${codeNum}` ||
               mNome === `comanda ${codeNum}` ||
               mNome === String(codeNum);
      });

      if (mesaEncontrada) {
        this.soundSuccess();
        this.selecionarMesa(mesaEncontrada.nome);
        return;
      }

      // 2. Verificar se é código de barras de produto (EAN-13 / SKU)
      const produto = (this.produtosData || []).find(p => String(p.codigo_barras || p.id || '') === code);
      if (produto && this.mesaAtual) {
        this.lancarProdutoDireto(produto.id, produto.nome, produto.emoji, produto.preco);
      }
    },

    initShortcuts: function () {
      let barcodeBuffer = '';
      let lastKeyTime = 0;

      window.addEventListener('keydown', (e) => {
        const now = Date.now();
        const activeTag = document.activeElement ? document.activeElement.tagName : '';
        const isInput = activeTag === 'INPUT' || activeTag === 'TEXTAREA';

        // Detecção de leitor de código de barras (cadência rápida < 50ms entre caracteres)
        if (!isInput) {
          if (now - lastKeyTime > 65) {
            barcodeBuffer = '';
          }
          lastKeyTime = now;

          if (e.key === 'Enter') {
            if (barcodeBuffer.length >= 3) {
              e.preventDefault();
              this.processarCodigoBarras(barcodeBuffer);
              barcodeBuffer = '';
              return;
            }
          } else if (e.key.length === 1) {
            barcodeBuffer += e.key;
          }
        }

        if (e.key === 'F1') {
          e.preventDefault();
          this.abrirModalProdutos();
        } else if (e.key === 'F2') {
          e.preventDefault();
          this.abrirPagamentoParcial();
        } else if (e.key === 'F3') {
          e.preventDefault();
          this.concluirVenda();
        } else if (e.key === 'F4') {
          e.preventDefault();
          const inp = document.getElementById('ultra-search-input');
          if (inp) inp.focus();
        } else if (e.key === 'F7') {
          e.preventDefault();
          this.toggleTaxaServico();
        } else if (e.key === 'F11') {
          e.preventDefault();
          const is3dActive = window.ChefUltra3D && window.ChefUltra3D.isSalonActive;
          this.toggleSalonView(is3dActive ? 'grid' : '3d');
        } else if (e.key === 'F12') {
          e.preventDefault();
          window.location.href = '/fila-pedidos.html';
        } else if (e.key === 'Escape') {
          this.fecharModalProdutos();
          this.fecharModalRacha();
          const modalPgto = document.getElementById('modal-pagamento-parcial-desagrupado');
          if (modalPgto) modalPgto.style.display = 'none';
        }
      });
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    window.ChefUltraApp.init();
  });

})();
