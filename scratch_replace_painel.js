const fs = require('fs');
let c = fs.readFileSync('painel-dono.html', 'utf8');

c = c.replace(/<div style="display: grid; grid-template-columns: repeat\(auto-fit, minmax\(200px, 1fr\)\); gap: 10px;">[\s\S]*?<!-- Sangrias e Retiradas -->[\s\S]*?0 saídas<\/span>\s*<\/div>\s*<\/div>/, `      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
        <!-- Cancelamentos -->
        <div style="background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 12px; transition: transform 0.2s;" class="has-long-press" onclick="abrirModalAuditoria('cancelamentos')">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-size: 16px; font-weight: 700; color: var(--text-sub);">Cancelados</span>
            <i class="ph-bold ph-x-circle" style="color: #ef4444; font-size: 16px;"></i>
          </div>
          <div id="antifraude-cancelados-val" style="font-size: 16px; font-weight: 900; color: #ef4444;">R$ 0,00</div>
          <span id="antifraude-cancelados-qtd" style="font-size: 15px; color: var(--text-sub);">0 pedidos</span>
        </div>

        <!-- Sangrias e Retiradas -->
        <div style="background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 12px; transition: transform 0.2s;" class="has-long-press" onclick="abrirModalAuditoria('sangrias')">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-size: 16px; font-weight: 700; color: var(--text-sub);">Sangrias</span>
            <i class="ph-bold ph-arrow-circle-up-right" style="color: #f59e0b; font-size: 16px;"></i>
          </div>
          <div id="antifraude-sangrias-val" style="font-size: 16px; font-weight: 900; color: #f59e0b;">R$ 0,00</div>
          <span id="antifraude-sangrias-qtd" style="font-size: 15px; color: var(--text-sub);">0 saídas</span>
        </div>

        <!-- Auditoria de Descontos -->
        <div style="background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 12px; transition: transform 0.2s;" class="has-long-press" onclick="abrirModalAuditoria('descontos')">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-size: 16px; font-weight: 700; color: var(--text-sub);">Descontos</span>
            <i class="ph-bold ph-tag" style="color: #8b5cf6; font-size: 16px;"></i>
          </div>
          <div id="antifraude-descontos-val" style="font-size: 16px; font-weight: 900; color: #8b5cf6;">R$ 0,00</div>
          <span id="antifraude-descontos-qtd" style="font-size: 15px; color: var(--text-sub);">0 manuais</span>
        </div>
      </div>`);

c = c.replace('<!-- RADAR ANTIFRAUDE & PREVENÇÃO DE PERDAS -->', `<!-- OPERAÇÃO EM TEMPO REAL: HEATMAP & RUPTURA DE ESTOQUE -->
    <div class="dono-section dono-sec-full" id="sec-operacao-realtime" data-secao="operacao-realtime" title="Operação em Tempo Real">
      <div class="sec-title" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <i class="ph-bold ph-activity" style="color: #ec4899;"></i>
          <span>Operação em Tempo Real (Heatmap & Ruptura)</span>
        </div>
        <span style="background: rgba(236,72,153,0.12); color: #ec4899; font-size: 15px; font-weight: 800; padding: 3px 10px; border-radius: 20px; border: 1px solid rgba(236,72,153,0.3); display: flex; align-items: center; gap: 6px;">
          <div style="width: 8px; height: 8px; background: #ec4899; border-radius: 50%; animation: pulse-dot 1.5s infinite;"></div>
          Ao Vivo
        </span>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; margin-top: 16px;">
        <!-- Heatmap de Mesas -->
        <div style="background: var(--card2); border: 1px solid var(--border); border-radius: 14px; padding: 16px; position: relative;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <i class="ph-bold ph-squares-four" style="color: #3b82f6; font-size: 20px;"></i>
              <span style="font-size: 16px; font-weight: 800; color: var(--text);">Heatmap de Ocupação</span>
            </div>
            <span style="font-size: 15px; font-weight: 700; color: var(--text-sub);">78% Ocupado</span>
          </div>
          
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
            <div style="background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.5); border-radius: 8px; height: 48px; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #ef4444; font-size: 15px;" title="Mesa 1 (1h 20m)">M1</div>
            <div style="background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.5); border-radius: 8px; height: 48px; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #ef4444; font-size: 15px;" title="Mesa 2 (55m)">M2</div>
            <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; height: 48px; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #10b981; font-size: 15px;" title="Mesa 3 (Livre)">M3</div>
            <div style="background: rgba(245, 158, 11, 0.2); border: 1px solid rgba(245, 158, 11, 0.5); border-radius: 8px; height: 48px; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #f59e0b; font-size: 15px;" title="Mesa 4 (Aguardando Conta)">M4</div>
            <div style="background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.5); border-radius: 8px; height: 48px; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #ef4444; font-size: 15px;" title="Mesa 5 (40m)">M5</div>
            <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; height: 48px; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #10b981; font-size: 15px;" title="Mesa 6 (Livre)">M6</div>
            <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; height: 48px; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #10b981; font-size: 15px;" title="Mesa 7 (Livre)">M7</div>
            <div style="background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.5); border-radius: 8px; height: 48px; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #ef4444; font-size: 15px;" title="Mesa 8 (2h 10m - Atenção)">M8 <i class="ph-fill ph-warning" style="margin-left:4px;"></i></div>
          </div>
          <div style="display: flex; gap: 12px; margin-top: 12px; font-size: 14px; color: var(--text-sub);">
            <div style="display: flex; align-items: center; gap: 4px;"><div style="width: 10px; height: 10px; border-radius: 50%; background: #ef4444;"></div> Ocupada</div>
            <div style="display: flex; align-items: center; gap: 4px;"><div style="width: 10px; height: 10px; border-radius: 50%; background: #f59e0b;"></div> Pagando</div>
            <div style="display: flex; align-items: center; gap: 4px;"><div style="width: 10px; height: 10px; border-radius: 50%; background: #10b981;"></div> Livre</div>
          </div>
        </div>

        <!-- Alertas de Ruptura de Estoque -->
        <div style="background: var(--card2); border: 1px solid var(--border); border-radius: 14px; padding: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <i class="ph-bold ph-package" style="color: #f97316; font-size: 20px;"></i>
              <span style="font-size: 16px; font-weight: 800; color: var(--text);">Alertas de Ruptura</span>
            </div>
            <button type="button" class="btn-refresh" style="background:none; border:none; color:var(--text-sub); cursor:pointer;"><i class="ph-bold ph-arrows-clockwise"></i></button>
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(249, 115, 22, 0.1); border: 1px solid rgba(249, 115, 22, 0.3); border-radius: 8px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <i class="ph-bold ph-warning-circle" style="color: #f97316;"></i>
                <div>
                  <div style="font-size: 15px; font-weight: 700; color: var(--text);">Heineken 600ml</div>
                  <div style="font-size: 14px; color: var(--text-sub);">Estoque Crítico</div>
                </div>
              </div>
              <div style="font-size: 15px; font-weight: 900; color: #f97316;">4 un.</div>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <i class="ph-bold ph-warning" style="color: #ef4444;"></i>
                <div>
                  <div style="font-size: 15px; font-weight: 700; color: var(--text);">Picanha (Porções)</div>
                  <div style="font-size: 14px; color: var(--text-sub);">Ruptura Iminente</div>
                </div>
              </div>
              <div style="font-size: 15px; font-weight: 900; color: #ef4444;">1 un.</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- RADAR ANTIFRAUDE & PREVENÇÃO DE PERDAS -->`);

fs.writeFileSync('painel-dono.html', c);
console.log('Script ran successfully!');
