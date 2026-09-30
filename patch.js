const fs = require('fs');
let html =         <button class="remote-btn green-btn" onclick="window.open('/host-fila-espera.html', '_blank')">
          <div class="rb-icon"><i class="ph-bold ph-users-three"></i></div>
          <div class="rb-label">Gestão de Hostess</div>
          <div class="rb-sub">Fila de Espera & Reservas</div>
        </button>
        <button class="remote-btn orange-btn" onclick="window.open('/totem-kiosk.html', '_blank')">
          <div class="rb-icon"><i class="ph-bold ph-monitor"></i></div>
          <div class="rb-label">Totem Físico</div>
          <div class="rb-sub">Autoatendimento Vertical</div>
        </button>;

['src/views/admin/painel-dono.html', 'dist/painel-dono.html'].forEach(p => {
  if (fs.existsSync(p)) {
    let c = fs.readFileSync(p, 'utf8');
    c = c.replace('<!-- Novos Pontos de Contato Injetados (PWA, Display, CRM) -->', '<!-- Novos Pontos de Contato Injetados (PWA, Display, CRM) -->\n' + html);
    fs.writeFileSync(p, c);
  }
});
