const fs = require('fs');
let c = fs.readFileSync('main.js', 'utf8');

const target = `  } else if (acao === 'abrir_relatorio') {
    if (typeof window.abrirRelatoriosModal === 'function') window.abrirRelatoriosModal();
  }
});`;

const replacement = `  } else if (acao === 'abrir_relatorio') {
    if (typeof window.abrirRelatoriosModal === 'function') window.abrirRelatoriosModal();
  } else if (acao === 'apagar_tela') {
    const overlay = document.createElement('div');
    overlay.id = 'standby-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#000;z-index:2147483647;display:flex;align-items:center;justify-content:center;cursor:pointer;';
    overlay.innerHTML = '<div style="color:#555;font-size:24px;font-weight:bold;text-align:center;">TELA EM STANDBY<br><span style="font-size:14px;opacity:0.5;margin-top:10px;display:block;">Toque em qualquer lugar para acordar</span></div>';
    overlay.onclick = () => overlay.remove();
    document.body.appendChild(overlay);
    if (typeof showToast === 'function') showToast('O terminal entrou em Standby!', '#f97316');
  } else if (acao === 'enviar_aviso') {
    const msg = data.payload && data.payload.mensagem ? data.payload.mensagem : 'Aviso Urgente da Gerência';
    if (typeof showToast === 'function') showToast(msg, '#3b82f6');
    const banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#3b82f6;color:#fff;padding:20px 24px;font-size:20px;font-weight:800;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,0.3);animation: sweep 2s;';
    banner.innerHTML = '🔔 <strong>Aviso da Gerência:</strong> ' + msg + ' <button style="margin-left:20px;padding:8px 16px;border:none;background:#fff;color:#3b82f6;border-radius:8px;font-weight:bold;cursor:pointer;" onclick="this.parentElement.remove()">OK</button>';
    document.body.appendChild(banner);
  }
});`;

c = c.replace(target, replacement);
fs.writeFileSync('main.js', c);
console.log('main.js updated with new remote commands!');
