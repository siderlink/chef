/**
 * Widget do Caixa v1.1: Balança Automática, Bip Antifraude & Totem de Pesagem
 */
(function () {
  if (!window.ChefModules) return;

  ChefModules.register({
    id: 'pesagem-selfservice',
    name: 'Pesagem Automática & Buffet',
    icon: 'ph-scales'
  }, ({ registerWidget, registerNavbarAction }) => {

    // 1. Botão na Barra Superior: Abrir Totem de Autoatendimento
    registerNavbarAction({
      id: 'btn_totem_balanca',
      label: 'Totem Balança',
      icon: 'ph-scales',
      onClick() {
        window.open('/plugins/pesagem-selfservice/totem', '_blank');
      }
    });

    // 2. Botão na Barra Superior: Relatórios de Buffet
    registerNavbarAction({
      id: 'btn_relatorios_buffet',
      label: 'Relatório Buffet',
      icon: 'ph-chart-bar',
      onClick() {
        window.open('/plugins/pesagem-selfservice/relatorio', '_blank');
      }
    });

    // 3. Widget no Grid do Caixa v1.1
    registerWidget({
      id: 'widget_pesagem_selfservice',
      title: 'Balança & Buffet Inteligente',
      icon: 'ph-scales',
      defaultSize: 'sz-m',
      render(container) {
        container.innerHTML = `
          <div style="padding: 14px; display: flex; flex-direction: column; justify-content: space-between; height: 100%; box-sizing: border-box; background: var(--v11-surface, #ffffff); border-radius: 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="display: flex; align-items: center; gap: 6px; color: #fc4b15; font-weight: 800; font-size: 13px;">
                <i class="ph-bold ph-scales" style="font-size: 20px;"></i>
                <span>Balança Caixa</span>
              </div>
              <div style="display: flex; gap: 4px;">
                <button id="v11-btn-conectar-serial-caixa" title="Conectar Balança Serial USB" style="font-size: 11px; background: rgba(59, 130, 246, 0.12); color: #2563eb; border: none; padding: 3px 8px; border-radius: 10px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                  <i class="ph-bold ph-plugs-connected"></i> Balança
                </button>
                <a href="/plugins/pesagem-selfservice/totem" target="_blank" style="font-size: 11px; background: rgba(252, 75, 21, 0.12); color: #fc4b15; padding: 3px 8px; border-radius: 10px; font-weight: 700; text-decoration: none; display: flex; align-items: center; gap: 4px;">
                  <i class="ph-bold ph-arrow-square-out"></i> Totem
                </a>
              </div>
            </div>

            <!-- Display Peso e Valor -->
            <div style="text-align: center; padding: 4px 0;">
              <span style="font-size: 11px; color: var(--v11-text-sub, #64748b); font-weight: 700; text-transform: uppercase;">Peso Líquido Atual</span>
              <div id="v11-peso-auto-display" style="font-size: 28px; font-weight: 900; color: var(--v11-text, #0f172a); font-family: monospace; letter-spacing: -1px; margin: 2px 0;">
                0.000 <small style="font-size: 15px; font-weight: 700; color: #64748b;">kg</small>
              </div>
              <div id="v11-valor-auto-display" style="font-size: 15px; font-weight: 800; color: #10b981;">
                R$ 0,00
              </div>
            </div>

            <!-- Bip Rápido de Ticket Antifraude -->
            <div style="margin: 4px 0;">
              <div style="display: flex; gap: 4px;">
                <input type="text" id="v11-input-bip-ticket" placeholder="Bipar Ticket (PESO-...)" style="flex: 1; padding: 7px 10px; border-radius: 8px; border: 1px solid var(--v11-border, #cbd5e1); font-size: 11.5px; font-weight: 700; background: var(--v11-surface, #f8fafc); color: var(--v11-text, #0f172a); outline: none;">
                <button id="v11-btn-resgatar-ticket" style="padding: 7px 10px; background: #2563eb; color: white; border: none; border-radius: 8px; font-weight: 800; font-size: 11px; cursor: pointer;">
                  Validar
                </button>
              </div>
            </div>

            <!-- Ações Rápidas de Lançamento -->
            <div style="display: flex; gap: 6px;">
              <button id="v11-btn-pesar-rapido" style="flex: 1; padding: 9px; border-radius: 9px; background: #fc4b15; color: white; border: none; font-weight: 800; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; box-shadow: 0 2px 8px rgba(252,75,21,0.25);">
                <i class="ph-bold ph-lightning"></i> Pesar & Lançar
              </button>
              <button id="v11-btn-buffet-fixo" style="padding: 9px 12px; border-radius: 9px; background: #10b981; color: white; border: none; font-weight: 800; font-size: 11.5px; cursor: pointer;">
                Livre
              </button>
            </div>
          </div>
        `;
      },
      onMount(container) {
        const btnPesar = container.querySelector('#v11-btn-pesar-rapido');
        const btnLivre = container.querySelector('#v11-btn-buffet-fixo');
        const btnSerial = container.querySelector('#v11-btn-conectar-serial-caixa');
        const btnResgatar = container.querySelector('#v11-btn-resgatar-ticket');
        const inputTicket = container.querySelector('#v11-input-bip-ticket');
        const displayPeso = container.querySelector('#v11-peso-auto-display');
        const displayValor = container.querySelector('#v11-valor-auto-display');

        let pesoSimulado = 0.520;
        let precoKg = 69.90;
        let tara = 0.450;
        let serialPortCaixa = null;

        // Carregar configurações do módulo
        fetch('/api/modulo/pesagem-selfservice/config')
          .then(r => r.json())
          .then(d => {
            if (d && d.sucesso && d.config) {
              precoKg = d.config.precoKg;
              tara = d.config.taraPratoKg;
            }
          });

        function atualizarDisplay(peso) {
          const liq = Math.max(0, peso - tara);
          const val = liq * precoKg;
          displayPeso.innerHTML = `${liq.toFixed(3)} <small style="font-size: 15px; font-weight: 700; color: #64748b;">kg</small>`;
          displayValor.innerText = `R$ ${val.toFixed(2).replace('.', ',')}`;
          return { liq, val };
        }

        // 1. Pesar & Lançar
        if (btnPesar) {
          btnPesar.onclick = () => {
            pesoSimulado = (0.350 + Math.random() * 0.400);
            const { liq, val } = atualizarDisplay(pesoSimulado);

            fetch('/api/modulo/pesagem-selfservice/pesar', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pesoBruto: pesoSimulado, modo: 'peso' })
            })
            .then(r => r.json())
            .then(res => {
              if (res && res.sucesso) {
                adicionarItemAoPedidoAtivo(res.registro);
              }
            });
          };
        }

        // 2. Buffet Livre
        if (btnLivre) {
          btnLivre.onclick = () => {
            fetch('/api/modulo/pesagem-selfservice/pesar', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ modo: 'livre' })
            })
            .then(r => r.json())
            .then(res => {
              if (res && res.sucesso) {
                adicionarItemAoPedidoAtivo(res.registro);
              }
            });
          };
        }

        // 3. Validação Antifraude de Ticket ou Baixa de Comanda via QR do Cliente
        function validarTicket() {
          const raw = (inputTicket.value || '').trim();
          if (!raw) return;

          // Se for QR Code gerado pelo celular do cliente para pagar no Caixa (PAGAR|COMANDA|15|...)
          if (raw.startsWith('PAGAR|') || raw.toLowerCase().startsWith('comanda')) {
            fetch('/api/modulo/pesagem-selfservice/comanda/baixa-caixa', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ codigoQr: raw, metodoPagamento: 'Caixa' })
            })
            .then(r => r.json().then(data => ({ status: r.status, data })))
            .then(({ status, data }) => {
              inputTicket.value = '';
              if (data && data.sucesso) {
                if (typeof Swal !== 'undefined') {
                  Swal.fire({
                    icon: 'success',
                    title: 'Comanda Baixada no Caixa!',
                    text: data.mensagem || 'A comanda foi quitada com sucesso e o cliente já recebeu o comprovante no celular.',
                    confirmButtonColor: '#10b981'
                  });
                } else {
                  alert(data.mensagem);
                }
              } else {
                alert(data.error || 'Erro ao dar baixa na comanda.');
              }
            })
            .catch(e => alert('Erro de rede: ' + e.message));
            return;
          }

          // Se for Ticket de Pesagem (PESO-...)
          fetch(`/api/modulo/pesagem-selfservice/ticket/${encodeURIComponent(raw)}/resgatar`, {
            method: 'POST'
          })
          .then(r => r.json().then(data => ({ status: r.status, data })))
          .then(({ status, data }) => {
            inputTicket.value = '';
            if (status === 409) {
              // Antifraude: Já utilizado
              if (typeof Swal !== 'undefined') {
                Swal.fire({
                  icon: 'warning',
                  title: 'Ticket Já Utilizado!',
                  text: data.error || 'Este ticket já foi resgatado e não pode ser reutilizado.',
                  confirmButtonColor: '#fc4b15'
                });
              } else {
                alert(data.error);
              }
              return;
            }

            if (data && data.sucesso && data.ticket) {
              adicionarItemAoPedidoAtivo(data.ticket);
              if (typeof Swal !== 'undefined') {
                Swal.fire({
                  toast: true,
                  position: 'top-end',
                  icon: 'success',
                  title: `Ticket ${data.ticket.id} Liberado: R$ ${data.ticket.valor_total.toFixed(2)}`,
                  showConfirmButton: false,
                  timer: 2500
                });
              }
            } else {
              alert(data.error || 'Ticket não encontrado ou inválido.');
            }
          })
          .catch(e => alert('Erro ao validar ticket: ' + e.message));
        }

        if (btnResgatar) btnResgatar.onclick = validarTicket;
        if (inputTicket) {
          inputTicket.onkeydown = (e) => {
            if (e.key === 'Enter') validarTicket();
          };
        }

        // 4. Conexão Serial no Caixa
        if (btnSerial) {
          btnSerial.onclick = async () => {
            if (!('serial' in navigator)) {
              alert('Web Serial API não suportada neste navegador. Use Google Chrome ou Edge.');
              return;
            }
            try {
              serialPortCaixa = await navigator.serial.requestPort();
              await serialPortCaixa.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' });
              btnSerial.style.background = 'rgba(16, 185, 129, 0.2)';
              btnSerial.style.color = '#10b981';
              btnSerial.innerHTML = '<i class="ph-bold ph-check"></i> Conectada';

              const reader = serialPortCaixa.readable.getReader();
              let buf = '';
              while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                if (value) {
                  buf += new TextDecoder().decode(value);
                  const m = buf.match(/(?:\x02|^)(?:[^\d\n\r]*?)(\d{1,2}[\.,]\d{3})/);
                  if (m) {
                    const p = parseFloat(m[1].replace(',', '.'));
                    if (!isNaN(p)) {
                      pesoSimulado = p;
                      atualizarDisplay(p);
                    }
                    buf = buf.slice(buf.indexOf(m[0]) + m[0].length);
                  }
                  if (buf.length > 200) buf = buf.slice(-64);
                }
              }
            } catch (err) {
              console.warn('Conexão serial cancelada ou erro:', err);
            }
          };
        }

        // Função auxiliar para injetar item no Caixa atual
        function adicionarItemAoPedidoAtivo(item) {
          // Se o sistema tiver função global de adicionar ao carrinho/pedido:
          if (typeof window.adicionarItemCarrinho === 'function') {
            window.adicionarItemCarrinho({
              nome: item.descricao || item.descricaoItem,
              preco: item.valor_total || item.valorTotal,
              quantidade: 1
            });
          } else if (typeof window.adicionarProdutoAoCaixa === 'function') {
            window.adicionarProdutoAoCaixa(item.descricao || item.descricaoItem, item.valor_total || item.valorTotal);
          } else {
            // Emite notificação visual
            if (typeof Swal !== 'undefined') {
              Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: `Item Buffet adicionado: R$ ${(item.valor_total || item.valorTotal).toFixed(2)}`,
                showConfirmButton: false,
                timer: 2500
              });
            }
          }
        }
      }
    });

  });
})();
