// scripts/patch-checkout-ux.js
const fs = require('fs');
const path = require('path');

const targetFiles = [
  path.join(__dirname, '..', 'index.html'),
  path.join(__dirname, '..', 'src', 'views', 'caixa', 'index.html')
];

const newPixAndStandardHtml = `            <!-- Painel PIX: QR dinâmico + copia e cola + confirmação rápida -->
            <div id="checkout-modal-pix-panel" style="display: none; background: #f0f9ff; border: 2px solid #0284c7; border-radius: 14px; padding: 14px; margin-bottom: 12px; text-align: center; box-shadow: 0 4px 12px rgba(2,132,199,0.12);">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                <h4 style="margin: 0; font-size: 13px; font-weight: 800; color: #0369a1; display: flex; align-items: center; gap: 6px;">
                  <i class="ph ph-qr-code" style="font-size: 18px;"></i> PIX INSTANTÂNEO
                </h4>
                <span style="background: #e0f2fe; color: #0284c7; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 12px;">SEM TAXA</span>
              </div>
              <div style="background: white; border-radius: 10px; padding: 8px; display: inline-block; border: 1px solid #bae6fd; box-shadow: 0 2px 6px rgba(0,0,0,0.06);">
                <img id="pix-qr-img" alt="QR Code Pix" style="width: 160px; height: 160px; border-radius: 6px; display: block; background: #f8fafc;">
              </div>
              <div id="pix-valor-label" style="font-size: 20px; font-weight: 900; color: #059669; margin-top: 6px;">R$ 0,00</div>
              <textarea id="pix-copia-texto" readonly
                style="width: 100%; height: 46px; margin-top: 6px; font-size: 10px; font-family: monospace; border: 1px solid #bae6fd; border-radius: 8px; padding: 6px; resize: none; color: #475569; background: #ffffff;"></textarea>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px;">
                <button type="button" id="btn-pix-copiar" onclick="window.checkoutPixCopiar()"
                  style="background: #0284c7; color: white; border: none; border-radius: 8px; padding: 9px 8px; font-weight: 700; font-size: 11.5px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px; transition: all 0.15s;">
                  <i class="ph ph-copy"></i> <span>Copiar Chave</span>
                </button>
                <button type="button" id="btn-pix-confirmar-rapido" onclick="window.checkoutModalConfirmarPixRapido()"
                  style="background: #10b981; color: white; border: none; border-radius: 8px; padding: 9px 8px; font-weight: 800; font-size: 11.5px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px; transition: all 0.15s; box-shadow: 0 2px 8px rgba(16,185,129,0.3);">
                  <i class="ph ph-check-circle"></i> <span>Recebido! Lançar</span>
                </button>
              </div>
              <p style="font-size: 10.5px; color: #64748b; margin: 6px 0 0;">O cliente aponta a câmera ou usa copia e cola. Clique em <b>"Recebido! Lançar"</b> para registrar com 1 clique.</p>
            </div>

            <!-- Modo Padrão (Mouse e Teclado Físico) -->
            <div id="checkout-modal-standard-container" style="display: block; flex-grow: 1;">
              <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 4px;">
                
                <!-- Grade de Botões Rápidos de Método de Pagamento -->
                <div style="display: flex; flex-direction: column; gap: 4px;">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <label style="font-size: 11px; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px;">Forma de Pagamento:</label>
                    <span style="font-size: 10px; color: var(--text-muted);">Teclas [1-6]</span>
                  </div>
                  <!-- Select nativo mantido sincronizado para máxima compatibilidade -->
                  <select id="checkout-modal-metodo" style="display: none;" onchange="window.checkoutModalSyncMetodoUI(this.value)">
                    <option value="Dinheiro">Dinheiro</option>
                    <option value="Pix">Pix</option>
                    <option value="Cartão de Crédito">Cartão de Crédito</option>
                    <option value="Cartão de Débito">Cartão de Débito</option>
                    <option value="Vale Refeição">Vale Refeição</option>
                    <option value="Fiado">Fiado</option>
                  </select>
                  <!-- Pills de Método 1-Clique -->
                  <div id="checkout-modal-metodos-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">
                    <button type="button" class="checkout-method-pill active" data-method="Dinheiro" onclick="window.checkoutModalSelectMethod('Dinheiro')">
                      <i class="ph ph-money" style="font-size: 16px; color: #16a34a;"></i> Dinheiro <span class="shortcut-badge" style="font-size: 9px; opacity: 0.7; background: rgba(0,0,0,0.06); padding: 1px 4px; border-radius: 4px;">1</span>
                    </button>
                    <button type="button" class="checkout-method-pill" data-method="Pix" onclick="window.checkoutModalSelectMethod('Pix')">
                      <i class="ph ph-qr-code" style="font-size: 16px; color: #0284c7;"></i> Pix <span class="shortcut-badge" style="font-size: 9px; opacity: 0.7; background: rgba(0,0,0,0.06); padding: 1px 4px; border-radius: 4px;">2</span>
                    </button>
                    <button type="button" class="checkout-method-pill" data-method="Cartão de Crédito" onclick="window.checkoutModalSelectMethod('Cartão de Crédito')">
                      <i class="ph ph-credit-card" style="font-size: 16px; color: #7c3aed;"></i> Crédito <span class="shortcut-badge" style="font-size: 9px; opacity: 0.7; background: rgba(0,0,0,0.06); padding: 1px 4px; border-radius: 4px;">3</span>
                    </button>
                    <button type="button" class="checkout-method-pill" data-method="Cartão de Débito" onclick="window.checkoutModalSelectMethod('Cartão de Débito')">
                      <i class="ph ph-credit-card" style="font-size: 16px; color: #2563eb;"></i> Débito <span class="shortcut-badge" style="font-size: 9px; opacity: 0.7; background: rgba(0,0,0,0.06); padding: 1px 4px; border-radius: 4px;">4</span>
                    </button>
                    <button type="button" class="checkout-method-pill" data-method="Vale Refeição" onclick="window.checkoutModalSelectMethod('Vale Refeição')">
                      <i class="ph ph-ticket" style="font-size: 16px; color: #ea580c;"></i> VR / VA <span class="shortcut-badge" style="font-size: 9px; opacity: 0.7; background: rgba(0,0,0,0.06); padding: 1px 4px; border-radius: 4px;">5</span>
                    </button>
                    <button type="button" class="checkout-method-pill" data-method="Fiado" onclick="window.checkoutModalSelectMethod('Fiado')">
                      <i class="ph ph-notebook" style="font-size: 16px; color: #d97706;"></i> Fiado <span class="shortcut-badge" style="font-size: 9px; opacity: 0.7; background: rgba(0,0,0,0.06); padding: 1px 4px; border-radius: 4px;">6</span>
                    </button>
                  </div>
                </div>

                <!-- Campo de Valor Recebido -->
                <div style="display: flex; flex-direction: column; gap: 4px;">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <label style="font-size: 11px; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Valor Recebido:</label>
                    <span id="checkout-modal-valor-helper" style="font-size: 11px; color: #16a34a; font-weight: 700;"></span>
                  </div>
                  <div style="position: relative;">
                    <input type="text" inputmode="decimal" id="checkout-modal-valor" placeholder="R$ 0,00"
                      style="padding: 10px 12px; border: 2px solid var(--border-color); border-radius: 10px; font-size: 16px; font-weight: 800; outline: none; width: 100%; transition: all 0.15s; background: var(--bg-input);">
                  </div>

                  <!-- 💰 Cédulas Brasileiras Rápidas (Rush Mode) -->
                  <div id="checkout-modal-quick-cash-row" style="margin-top: 4px;">
                    <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px;">
                      <button type="button" onclick="window.checkoutModalSetQuickCash('exato')" title="Valor exato restante"
                        style="padding: 6px 2px; background: #0f172a; color: #38bdf8; border: 1.5px solid #334155; border-radius: 7px; font-size: 10.5px; font-weight: 900; cursor: pointer; transition: all 0.15s; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.1;">
                        <span>EXATO</span>
                        <span style="font-size: 8px; opacity: 0.7;">Restante</span>
                      </button>
                      <button type="button" onclick="window.checkoutModalSetQuickCash(10)" title="Cédula de R$ 10"
                        style="padding: 6px 2px; background: #fef2f2; border: 1.5px solid #f87171; border-radius: 7px; font-size: 11px; font-weight: 800; cursor: pointer; transition: all 0.15s; color: #dc2626; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.1;">
                        <span>R$ 10</span>
                        <span style="font-size: 8px; opacity: 0.75;">Arara</span>
                      </button>
                      <button type="button" onclick="window.checkoutModalSetQuickCash(20)" title="Cédula de R$ 20"
                        style="padding: 6px 2px; background: #fffbeb; border: 1.5px solid #fbbf24; border-radius: 7px; font-size: 11px; font-weight: 800; cursor: pointer; transition: all 0.15s; color: #d97706; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.1;">
                        <span>R$ 20</span>
                        <span style="font-size: 8px; opacity: 0.75;">Mico</span>
                      </button>
                      <button type="button" onclick="window.checkoutModalSetQuickCash(50)" title="Cédula de R$ 50"
                        style="padding: 6px 2px; background: #fff7ed; border: 1.5px solid #fb923c; border-radius: 7px; font-size: 11px; font-weight: 800; cursor: pointer; transition: all 0.15s; color: #ea580c; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.1;">
                        <span>R$ 50</span>
                        <span style="font-size: 8px; opacity: 0.75;">Onça</span>
                      </button>
                      <button type="button" onclick="window.checkoutModalSetQuickCash(100)" title="Cédula de R$ 100"
                        style="padding: 6px 2px; background: #f0f9ff; border: 1.5px solid #38bdf8; border-radius: 7px; font-size: 11px; font-weight: 800; cursor: pointer; transition: all 0.15s; color: #0284c7; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.1;">
                        <span>R$ 100</span>
                        <span style="font-size: 8px; opacity: 0.75;">Garoupa</span>
                      </button>
                      <button type="button" onclick="window.checkoutModalSetQuickCash(200)" title="Cédula de R$ 200"
                        style="padding: 6px 2px; background: #f8fafc; border: 1.5px solid #94a3b8; border-radius: 7px; font-size: 11px; font-weight: 800; cursor: pointer; transition: all 0.15s; color: #475569; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.1;">
                        <span>R$ 200</span>
                        <span style="font-size: 8px; opacity: 0.75;">Lobo</span>
                      </button>
                    </div>
                  </div>

                  <!-- 🟢 Painel de Troco Instantâneo (Live Troco Card) -->
                  <div id="checkout-modal-troco-live-card"
                    style="display: none; background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 2px solid #22c55e; border-radius: 12px; padding: 10px 14px; margin-top: 6px; box-shadow: 0 4px 12px rgba(34,197,94,0.15);">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                      <div style="display: flex; align-items: center; gap: 6px; color: #15803d; font-size: 12px; font-weight: 800; text-transform: uppercase;">
                        <i class="ph ph-hand-coins" style="font-size: 20px;"></i> Troco a Devolver:
                      </div>
                      <div id="checkout-modal-troco-live-val" style="font-size: 22px; font-weight: 900; color: #166534; font-family: 'Outfit', monospace;">
                        R$ 0,00
                      </div>
                    </div>
                  </div>

                  <!-- Notificação Inline de Pagamento / Troco Registrado (sem popup bloqueante) -->
                  <div id="checkout-modal-toast-inline"
                    style="display: none; background: #ecfdf5; border: 1.5px solid #34d399; border-radius: 10px; padding: 8px 12px; margin-top: 6px; font-size: 12px; font-weight: 700; color: #065f46; align-items: center; gap: 8px;">
                    <i class="ph ph-check-circle" style="font-size: 18px; color: #10b981;"></i>
                    <span id="checkout-modal-toast-inline-msg" style="flex: 1;"></span>
                  </div>

                </div>

                <!-- Botão Registrar Pagamento -->
                <button type="button" id="btn-checkout-modal-registrar" onclick="window.checkoutModalAddPagamento()"
                  style="background: #16a34a; color: white; border: none; border-radius: 10px; padding: 12px; font-weight: 800; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s; box-shadow: 0 4px 10px rgba(22, 163, 74, 0.25); width: 100%; margin-top: 4px;"
                  onmouseover="this.style.background='#15803d'" onmouseout="this.style.background='#16a34a'">
                  <i class="ph ph-plus-circle" style="font-size: 18px;"></i> Registrar Pagamento (Enter)
                </button>

                <button id="btn-checkout-pagar-maquininha" onclick="window.checkoutModalPagarMaquininha()"
                  style="display: none; background: #fc4b15; color: white; border: none; border-radius: 10px; padding: 12px; font-weight: bold; cursor: pointer; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s; box-shadow: 0 4px 6px rgba(252, 75, 21, 0.2); width: 100%; margin-top: 2px;"
                  onmouseover="this.style.background='#e03e0b'" onmouseout="this.style.background='#fc4b15'">
                  <i class="ph ph-credit-card"></i> Pagar na Maquininha
                </button>
              </div>

            </div>`;

const newSplitHtml = `            <!-- ✂️ Divisão Inteligente da Conta por N Pessoas -->
            <div style="padding: 10px; background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 12px; font-size: 12px; margin-bottom: 8px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <span style="font-weight: 800; color: #166534; display: flex; align-items: center; gap: 5px;">
                  <i class="ph ph-users" style="font-size: 16px;"></i> Divisão da Conta:
                </span>
                <span id="checkout-modal-split-tracker" style="font-size: 11px; font-weight: 800; color: #15803d; display: none;"></span>
              </div>
              <div style="display: flex; gap: 4px; align-items: center; flex-wrap: wrap;">
                <button type="button" class="btn-split-chip" onclick="window.checkoutModalCalcularDivisaoExpressa(2)"
                  style="padding: 4px 9px; background: white; border: 1.5px solid #86efac; border-radius: 16px; font-size: 11.5px; font-weight: 800; color: #166534; cursor: pointer; transition: all 0.15s;"
                  onmouseover="this.style.background='#dcfce7'" onmouseout="if(!this.classList.contains('active')) this.style.background='white'">÷ 2</button>
                <button type="button" class="btn-split-chip" onclick="window.checkoutModalCalcularDivisaoExpressa(3)"
                  style="padding: 4px 9px; background: white; border: 1.5px solid #86efac; border-radius: 16px; font-size: 11.5px; font-weight: 800; color: #166534; cursor: pointer; transition: all 0.15s;"
                  onmouseover="this.style.background='#dcfce7'" onmouseout="if(!this.classList.contains('active')) this.style.background='white'">÷ 3</button>
                <button type="button" class="btn-split-chip" onclick="window.checkoutModalCalcularDivisaoExpressa(4)"
                  style="padding: 4px 9px; background: white; border: 1.5px solid #86efac; border-radius: 16px; font-size: 11.5px; font-weight: 800; color: #166534; cursor: pointer; transition: all 0.15s;"
                  onmouseover="this.style.background='#dcfce7'" onmouseout="if(!this.classList.contains('active')) this.style.background='white'">÷ 4</button>
                <button type="button" class="btn-split-chip" onclick="window.checkoutModalCalcularDivisaoExpressa(5)"
                  style="padding: 4px 9px; background: white; border: 1.5px solid #86efac; border-radius: 16px; font-size: 11.5px; font-weight: 800; color: #166534; cursor: pointer; transition: all 0.15s;"
                  onmouseover="this.style.background='#dcfce7'" onmouseout="if(!this.classList.contains('active')) this.style.background='white'">÷ 5</button>
                
                <!-- Stepper para N pessoas flexível -->
                <div style="display: inline-flex; align-items: center; background: white; border: 1.5px solid #86efac; border-radius: 16px; padding: 1px 4px; gap: 2px; margin-left: 2px;">
                  <button type="button" onclick="window.checkoutModalSplitStep(-1)" title="Diminuir pessoas"
                    style="background: none; border: none; font-size: 13px; font-weight: 900; color: #166534; cursor: pointer; padding: 2px 5px; line-height: 1;">-</button>
                  <span id="checkout-modal-split-counter-label" style="font-size: 11px; font-weight: 800; color: #166534; min-width: 22px; text-align: center;">÷ N</span>
                  <button type="button" onclick="window.checkoutModalSplitStep(1)" title="Aumentar pessoas"
                    style="background: none; border: none; font-size: 13px; font-weight: 900; color: #166534; cursor: pointer; padding: 2px 5px; line-height: 1;">+</button>
                </div>
                <!-- input oculto mantido para compatibilidade com checkoutModalCalcularDivisao -->
                <input type="number" id="checkout-modal-split-parts" min="2" max="50" style="display:none;" value="2">
              </div>

              <!-- Status com cota calculada e botão de lançar cota -->
              <div id="checkout-modal-split-status"
                style="display: none; align-items: center; justify-content: space-between; margin-top: 8px; padding-top: 6px; border-top: 1px dashed #86efac; font-size: 12px; color: #166534; font-weight: 700;">
                <span id="checkout-modal-split-status-txt"></span>
                <div style="display: flex; gap: 6px; align-items: center;">
                  <button type="button" onclick="window.checkoutModalPreencherCota()" title="Preencher valor da cota no campo de pagamento"
                    style="background: #16a34a; color: white; border: none; border-radius: 6px; font-size: 10.5px; font-weight: 800; padding: 3px 8px; cursor: pointer; transition: all 0.15s;">
                    Lançar Cota
                  </button>
                  <button type="button" onclick="window.checkoutModalCancelarDivisao()"
                    style="background: none; border: none; color: #dc2626; cursor: pointer; font-weight: bold; font-size: 11px; padding: 2px 4px;">Cancelar</button>
                </div>
              </div>
            </div>`;

for (const filePath of targetFiles) {
  if (!fs.existsSync(filePath)) {
    console.log('Skipping missing file:', filePath);
    continue;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  const isCrlf = content.includes('\r\n');
  const lineEnding = isCrlf ? '\r\n' : '\n';

  // 1. Replace PIX panel & standard container
  // Find from id="checkout-modal-pix-panel" up to end of #checkout-modal-standard-container
  const regexPixAndStandard = /([ \t]*)<!--\s*Painel PIX[\s\S]*?id="checkout-modal-standard-container"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/;
  
  if (regexPixAndStandard.test(content)) {
    content = content.replace(regexPixAndStandard, newPixAndStandardHtml.replace(/\n/g, lineEnding));
    console.log('Successfully replaced PIX & standard container in', path.basename(filePath));
  } else {
    console.warn('Regex Pix & Standard did not match in', path.basename(filePath));
  }

  // 2. Replace Split Bill section
  const regexSplit = /([ \t]*)<!--\s*✂️ Divisão Expressa[\s\S]*?id="checkout-modal-split-status"[\s\S]*?<\/div>\s*<\/div>/;
  if (regexSplit.test(content)) {
    content = content.replace(regexSplit, newSplitHtml.replace(/\n/g, lineEnding));
    console.log('Successfully replaced Split Bill section in', path.basename(filePath));
  } else {
    console.warn('Regex Split Bill did not match in', path.basename(filePath));
  }

  fs.writeFileSync(filePath, content, 'utf8');
}
console.log('Patch complete.');
