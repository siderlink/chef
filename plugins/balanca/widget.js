/**
 * Widget do Caixa v1.1: Balança Comercial & Buffet
 * Integrado com Web Serial API para balanças Toledo, Filizola, Elgin, Urano
 */
(function () {
  if (!window.ChefModules) return;

  ChefModules.register({
    id: 'balanca',
    name: 'Balança Comercial',
    icon: 'ph-scales'
  }, ({ registerWidget }) => {
    
    registerWidget({
      id: 'balanca_widget',
      title: 'Balança Comercial',
      icon: 'ph-scales',
      defaultSize: 'sz-m',
      render(container, { socket, authHeaders }) {
        container.innerHTML = `
          <div style="padding: 14px; display: flex; flex-direction: column; justify-content: space-between; height: 100%; box-sizing: border-box;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="display: flex; align-items: center; gap: 8px; color: #d97706; font-weight: 800; font-size: 13.5px;">
                <i class="ph-bold ph-scales" style="font-size: 22px;"></i>
                <span>Pesagem / Buffet</span>
              </div>
              <span id="v11-balanca-status-badge" style="font-size: 11px; background: rgba(239, 68, 68, 0.12); color: #ef4444; padding: 2px 8px; border-radius: 12px; font-weight: 700; cursor: pointer; transition: 0.2s;" title="Clique para conectar a balança (USB/Serial)">
                Desconectada
              </span>
            </div>

            <div style="text-align: center; padding: 10px 0;">
              <span style="font-size: 11.5px; color: var(--v11-text-sub, #64748b); font-weight: 600; text-transform: uppercase;">Peso Líquido</span>
              <div id="v11-widget-peso-display" style="font-size: 32px; font-weight: 900; color: var(--v11-text, #0f172a); font-family: monospace; letter-spacing: -1px; margin: 4px 0;">
                0.000 <small style="font-size: 16px; font-weight: 700; color: #64748b;">kg</small>
              </div>
              <span id="v11-balanca-status-texto" style="font-size: 11px; color: #94a3b8; font-weight: 700;">
                <i class="ph-fill ph-circle" style="font-size: 8px;"></i> Aguardando conexão...
              </span>
            </div>

            <div style="display: flex; gap: 8px;">
              <button id="v11-btn-ler-balanca" style="flex: 1; padding: 9px; border-radius: 9px; background: #d97706; color: white; border: none; font-weight: 800; font-size: 12.5px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 2px 8px rgba(217,119,6,0.25); transition: 0.2s;">
                <i class="ph-bold ph-arrows-clockwise"></i> Conectar & Ler
              </button>
              <button id="v11-btn-tara-balanca" style="padding: 9px 12px; border-radius: 9px; background: var(--v11-surface, #ffffff); border: 1px solid var(--v11-border, #cbd5e1); color: var(--v11-text, #0f172a); font-weight: 700; font-size: 12px; cursor: pointer; transition: 0.2s;">
                Tara (450g)
              </button>
            </div>
          </div>
        `;
      },
      onMount(container) {
        const btnLer = container.querySelector('#v11-btn-ler-balanca');
        const btnTara = container.querySelector('#v11-btn-tara-balanca');
        const display = container.querySelector('#v11-widget-peso-display');
        const badge = container.querySelector('#v11-balanca-status-badge');
        const statusTexto = container.querySelector('#v11-balanca-status-texto');

        let taraAtual = 0;
        let serialPort = null;
        let serialReader = null;
        let isConnected = false;
        let pesoBrutoAtual = 0;

        // Toggle Tara
        if (btnTara) {
          btnTara.onclick = () => {
            taraAtual = taraAtual === 0 ? 0.450 : 0;
            btnTara.style.background = taraAtual > 0 ? '#fef3c7' : '';
            btnTara.style.color = taraAtual > 0 ? '#b45309' : '';
            btnTara.style.borderColor = taraAtual > 0 ? '#fde68a' : '';
            btnTara.innerText = taraAtual > 0 ? 'Tara Ativa (450g)' : 'Tara (450g)';
            atualizarCalculo();
          };
        }

        function atualizarCalculo() {
          const liquido = Math.max(0, pesoBrutoAtual - taraAtual).toFixed(3);
          display.innerHTML = `${liquido} <small style="font-size: 16px; font-weight: 700; color: #64748b;">kg</small>`;
        }

        async function lerStreamSerial() {
          let buffer = '';
          while (serialPort && serialPort.readable) {
            serialReader = serialPort.readable.getReader();
            try {
              while (true) {
                const { value, done } = await serialReader.read();
                if (done) break;
                if (value) {
                  const texto = new TextDecoder().decode(value);
                  buffer += texto;

                  // Decodificador Universal de Peso (STX...ETX ou regex direto de balanças comuns do Brasil)
                  const match = buffer.match(/(?:\x02|^)(?:[^\d\n\r]*?)(\d{1,2}[\.,]\d{3})(?:[^\d\n\r]*?)(?:\x03|\r|\n|$)/);
                  if (match) {
                    const pesoFloat = parseFloat(match[1].replace(',', '.'));
                    if (!isNaN(pesoFloat)) {
                      pesoBrutoAtual = pesoFloat;
                      atualizarCalculo();
                    }
                    // Limpa do buffer a parte processada para não repassar a mesma string
                    buffer = buffer.slice(buffer.indexOf(match[0]) + match[0].length);
                  }
                  
                  // Previne vazamento de memória se o buffer ficar gigante sem regex match
                  if (buffer.length > 256) buffer = buffer.slice(-64);
                }
              }
            } catch (e) {
              console.warn('[Balança] Erro na leitura serial:', e);
            } finally {
              serialReader.releaseLock();
            }
          }
        }

        async function conectarBalanca() {
          if (!('serial' in navigator)) {
            alert('Seu navegador não suporta a Web Serial API (Requer Chrome/Edge).');
            return;
          }

          try {
            statusTexto.innerHTML = '<i class="ph-bold ph-spinner ph-spin"></i> Conectando...';
            // Abre o modal do navegador para o usuário escolher a porta COM
            serialPort = await navigator.serial.requestPort();
            
            // Toledo Prix 3 Fit e similares usam 9600 por padrão, as antigas 2400 ou 4800
            await serialPort.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' });

            isConnected = true;
            
            // Atualiza UI
            badge.innerText = 'Toledo/Prix Conectada';
            badge.style.background = 'rgba(16, 185, 129, 0.12)';
            badge.style.color = '#10b981';
            
            statusTexto.innerHTML = '<i class="ph-fill ph-circle" style="font-size: 8px;"></i> Lendo peso em tempo real...';
            statusTexto.style.color = '#10b981';
            
            btnLer.innerHTML = '<i class="ph-bold ph-arrows-clockwise"></i> Forçar Leitura';
            btnLer.style.background = '#10b981'; // Verde sucesso
            
            // Inicia o loop infinito de leitura em background
            lerStreamSerial();
            
          } catch (err) {
            console.error('[Balança] Falha ao abrir porta serial:', err);
            statusTexto.innerHTML = '<i class="ph-fill ph-circle" style="font-size: 8px;"></i> Falha de conexão';
            statusTexto.style.color = '#ef4444';
          }
        }

        // Lógica do Botão Principal
        if (btnLer) {
          btnLer.onclick = () => {
            if (!isConnected) {
              conectarBalanca();
            } else {
              // Se já está conectado e lendo o stream, o botão serve para simular uma "trava" de peso ou refazer cálculos
              atualizarCalculo();
            }
          };
        }

        // Clique no badge para reconectar
        if (badge) {
          badge.onclick = () => {
            if (!isConnected) conectarBalanca();
          };
        }
      }
    });

  });
})();
