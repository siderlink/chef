const fs = require('fs');
let c = fs.readFileSync('painel-dono.html', 'utf8');

const target = `<button class="colab-action-btn" onclick="comandarCaixaAcao('bloquear_tela')" style="padding: 14px 10px;">
          <i class="ph-bold ph-lock-key" style="font-size: 22px; color: #ef4444;"></i>
          <span style="font-weight: 800; font-size: 16px;">Bloquear Tela</span>
        </button>`;

const replacement = `<button class="colab-action-btn" onclick="comandarCaixaAcao('bloquear_tela')" style="padding: 14px 10px;">
          <i class="ph-bold ph-lock-key" style="font-size: 22px; color: #ef4444;"></i>
          <span style="font-weight: 800; font-size: 16px;">Bloquear Tela</span>
        </button>

        <button class="colab-action-btn" onclick="comandarCaixaAcao('apagar_tela')" style="padding: 14px 10px;">
          <i class="ph-bold ph-power" style="font-size: 22px; color: #f97316;"></i>
          <span style="font-weight: 800; font-size: 16px;">Apagar Tela (Standby)</span>
        </button>

        <button class="colab-action-btn" onclick="comandarCaixaAcao('enviar_aviso')" style="padding: 14px 10px;">
          <i class="ph-bold ph-chat-centered-text" style="font-size: 22px; color: #3b82f6;"></i>
          <span style="font-weight: 800; font-size: 16px;">Enviar Aviso</span>
        </button>`;

c = c.replace(target, replacement);
fs.writeFileSync('painel-dono.html', c);
console.log('Script ran successfully!');
