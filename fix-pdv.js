const fs = require('fs');

function applyFixes(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // 1. Add parseMoneyMobile
  if (!content.includes('function parseMoneyMobile')) {
    content = content.replace(
      '// --- HELPERS ---',
      `// --- HELPERS ---\nfunction parseMoneyMobile(val) {\n  if (typeof val === 'number') return val;\n  if (!val) return 0;\n  let s = String(val).replace(/R\\$\\s*/gi, '').trim();\n  if (s.includes(',')) {\n    s = s.replace(/\\./g, '').replace(',', '.');\n  }\n  const n = parseFloat(s);\n  return isNaN(n) ? 0 : n;\n}`
    );
  }

  // 2. Fix getMesaBruto
  content = content.replace(
    /function getMesaBruto\(mesaName\) \{[\s\S]*?reduce\(\(acc, p\) => acc \+ \(parseFloat\(String\(p\.total\)\.replace\(',', '\.'\)\) \|\| 0\), 0\);\n\}/,
    `function getMesaBruto(mesaName) {
  return getMesaOrders(mesaName)
    .filter(p => !String(p.productName || p.nome || '').toLowerCase().includes('pgto parcial'))
    .reduce((acc, p) => acc + parseMoneyMobile(p.total), 0);
}`
  );

  // 3. Fix getMesaPendente
  content = content.replace(
    /function getMesaPendente\(mesaName\) \{[\s\S]*?reduce\(\(acc, p\) => acc \+ \(parseFloat\(String\(p\.total\)\.replace\(',', '\.'\)\) \|\| 0\), 0\);\n\}/,
    `function getMesaPendente(mesaName) {
  return getMesaPendingOrders(mesaName)
    .filter(p => {
      const t = parseMoneyMobile(p.total);
      return t >= 0 && !String(p.productName || p.nome || '').toLowerCase().includes('pgto parcial');
    })
    .reduce((acc, p) => acc + parseMoneyMobile(p.total), 0);
}`
  );

  // 4. Fix getMesaPagamentos
  content = content.replace(
    /function getMesaPagamentos\(mesaName\) \{[\s\S]*?reduce\(\(acc, p\) => acc \+ Math\.abs\(parseFloat\(String\(p\.total\)\.replace\(',', '\.'\)\) \|\| 0\), 0\);\n\}/,
    `function getMesaPagamentos(mesaName) {
  return getMesaOrders(mesaName)
    .filter(p => {
      const t = parseMoneyMobile(p.total);
      const isPgto = String(p.productName || p.nome || '').toLowerCase().includes('pgto parcial');
      return t < 0 || isPgto;
    })
    .reduce((acc, p) => acc + Math.abs(parseMoneyMobile(p.total)), 0);
}`
  );

  // 5. Fix getMesaCliente
  content = content.replace(
    /function getMesaCliente\(mesaName\) \{\n  const orders = getMesaOrders\(mesaName\);\n  if \(orders\.length > 0 && orders\[0\]\.userName\) return orders\[0\]\.userName;\n  const mesa = mesasData\.find\(m => m\.nome === mesaName\);\n  if \(mesa && mesa\.observacao\) \{\n    try \{ const o = JSON\.parse\(mesa\.observacao\); if \(o\.cliente\) return o\.cliente; \} catch\(e\) \{\}\n  \}\n  return '-';\n\}/,
    `function getMesaCliente(mesaName) {
  const mesa = mesasData.find(m => m.nome === mesaName);
  if (mesa && mesa.observacao) {
    try { const o = JSON.parse(mesa.observacao); if (o.cliente) return o.cliente; } catch(e) {}
  }
  return '-';
}`
  );

  // 6. Fix abrirModalItensMesa innerHTML
  const modalTarget = `      <div style="background:#ffffff; border-radius:24px 24px 0 0; width:100%; max-width:500px; max-height:85vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 -10px 40px rgba(0,0,0,0.3); color:#0f172a;">
        <div style="padding:16px 20px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h3 style="margin:0; font-size:18px; font-weight:800; color:#fc4b15;">\${nomeMesa}</h3>
            <span style="font-size:12px; color:#64748b;">\${cliente ? 'Cliente: ' + cliente : 'Consumo da mesa'}</span>
          </div>
          <button type="button" onclick="document.getElementById('modal-detalhes-mesa-pdv-mobile').style.display='none'" style="background:#f1f5f9; border:none; width:34px; height:34px; border-radius:50%; color:#64748b; font-size:18px; cursor:pointer;">&times;</button>
        </div>

        <div style="padding:16px 20px; overflow-y:auto; flex:1;">
          \${orders.length === 0 ? \`
            <div style="text-align:center; padding:30px 10px; color:#94a3b8;">
              <i class="ph ph-shopping-bag" style="font-size:36px; display:block; margin-bottom:8px;"></i>
              Nenhum item lançado nesta mesa ainda.
            </div>
          \` : \`
            <div style="display:flex; flex-direction:column; gap:10px;">
              \${orders.map(o => \`
                <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:#f8fafc; border-radius:12px; border:1px solid #e2e8f0;">
                  <div style="display:flex; align-items:center; gap:10px;">
                    <span style="background:#fc4b15; color:white; font-weight:800; font-size:13px; padding:2px 8px; border-radius:8px;">\${o.quantity || 1}x</span>
                    <div>
                      <strong style="font-size:14px; color:#0f172a; display:block;">\${o.productName || o.nome}</strong>
                      <span style="font-size:11.5px; color:#64748b;">R$ \${(parseFloat(o.price || o.preco || 0)).toFixed(2).replace('.', ',')} un</span>
                    </div>
                  </div>
                  <span style="font-size:14px; font-weight:800; color:#10b981;">R$ \${((parseFloat(o.price || o.preco || 0)) * (o.quantity || 1)).toFixed(2).replace('.', ',')}</span>
                </div>
              \`).join('')}
            </div>
          \`}
        </div>

        <div style="padding:16px 20px; background:#f8fafc; border-top:1px solid #e2e8f0;">
          <button onclick="window.abrirModalQrSepararConta('\${nomeMesa}')" style="width:100%; padding:11px; margin-bottom:8px; background:#f3e8ff; color:#6d28d9; border:1px dashed #c4b5fd; border-radius:12px; font-weight:800; font-size:12.5px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:7px;">
            <i class="ph-bold ph-qr-code" style="font-size:16px;"></i> QR: Clientes separam a conta
          </button>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <span style="font-size:14px; font-weight:700; color:#64748b;">Total com Taxa:</span>
            <strong style="font-size:20px; font-weight:900; color:#10b981;">R$ \${total.toFixed(2).replace('.', ',')}</strong>
          </div>
          
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
            <button onclick="document.getElementById('modal-detalhes-mesa-pdv-mobile').style.display='none'; abrirCardapioComMesa('\${nomeMesa}')" style="padding:12px; background:#fc4b15; color:white; border:none; border-radius:12px; font-weight:800; font-size:13px; cursor:pointer;">
              <i class="ph-bold ph-plus-circle"></i> Lançar Itens
            </button>
            <button onclick="document.getElementById('modal-detalhes-mesa-pdv-mobile').style.display='none'; abrirCheckoutMesa('\${nomeMesa}')" style="padding:12px; background:#10b981; color:white; border:none; border-radius:12px; font-weight:800; font-size:13px; cursor:pointer;">
              <i class="ph-bold ph-check-circle"></i> Pagar / Fechar
            </button>
          </div>
        </div>
      </div>`;

  const modalReplacement = `      <div style="background:#ffffff; border-radius:24px 24px 0 0; width:100%; max-width:500px; max-height:85vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 -10px 40px rgba(0,0,0,0.3); color:#0f172a;">
        <div style="padding:16px 20px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h3 style="margin:0; font-size:18px; font-weight:800; color:#fc4b15;">\${nomeMesa}</h3>
            <span style="font-size:12px; color:#64748b;">\${cliente !== '-' ? 'Cliente: ' + cliente : 'Consumo da mesa'}</span>
          </div>
          <button type="button" onclick="document.getElementById('modal-detalhes-mesa-pdv-mobile').style.display='none'" style="background:#f1f5f9; border:none; width:34px; height:34px; border-radius:50%; color:#64748b; font-size:18px; cursor:pointer;">&times;</button>
        </div>

        <div style="padding:16px 20px; overflow-y:auto; flex:1;">
          \${orders.length === 0 ? \`
            <div style="text-align:center; padding:30px 10px; color:#94a3b8;">
              <i class="ph ph-shopping-bag" style="font-size:36px; display:block; margin-bottom:8px;"></i>
              Nenhum item lançado nesta mesa ainda.
            </div>
          \` : \`
            <div style="display:flex; flex-direction:column; gap:10px;">
              \${orders.map(o => {
                const isPgto = String(o.productName || o.nome || '').toLowerCase().includes('pgto parcial') || parseMoneyMobile(o.total) < 0;
                if (isPgto) {
                  return \\\`
                    <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:#f0fdf4; border-radius:12px; border:1px dashed #22c55e;">
                      <div style="display:flex; align-items:center; gap:10px;">
                        <i class="ph-fill ph-check-circle" style="color:#22c55e; font-size:20px;"></i>
                        <div>
                          <strong style="font-size:14px; color:#166534; display:block;">\${o.productName || o.nome}</strong>
                        </div>
                      </div>
                      <span style="font-size:14px; font-weight:800; color:#166534;">- R$ \${Math.abs(parseMoneyMobile(o.total)).toFixed(2).replace('.', ',')}</span>
                    </div>\\\`;
                }

                let unitPrice = parseMoneyMobile(o.price || o.preco);
                let itemTotal = parseMoneyMobile(o.total);
                let qty = o.quantity || 1;
                if (unitPrice === 0 && itemTotal > 0) unitPrice = itemTotal / qty;
                if (itemTotal === 0 && unitPrice > 0) itemTotal = unitPrice * qty;

                return \\\`
                <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:#f8fafc; border-radius:12px; border:1px solid #e2e8f0;">
                  <div style="display:flex; align-items:center; gap:10px;">
                    <span style="background:#fc4b15; color:white; font-weight:800; font-size:13px; padding:2px 8px; border-radius:8px;">\${qty}x</span>
                    <div>
                      <strong style="font-size:14px; color:#0f172a; display:block;">\${o.productName || o.nome}</strong>
                      <span style="font-size:11.5px; color:#64748b;">R$ \${unitPrice.toFixed(2).replace('.', ',')} un</span>
                    </div>
                  </div>
                  <span style="font-size:14px; font-weight:800; color:#10b981;">R$ \${itemTotal.toFixed(2).replace('.', ',')}</span>
                </div>\\\`;
              }).join('')}
            </div>
          \`}
        </div>

        <div style="padding:16px 20px; background:#f8fafc; border-top:1px solid #e2e8f0;">
          <button onclick="window.abrirModalQrSepararConta('\${nomeMesa}')" style="width:100%; padding:11px; margin-bottom:8px; background:#f3e8ff; color:#6d28d9; border:1px dashed #c4b5fd; border-radius:12px; font-weight:800; font-size:12.5px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:7px;">
            <i class="ph-bold ph-qr-code" style="font-size:16px;"></i> QR: Clientes separam a conta
          </button>
          
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="font-size:13px; color:#64748b;">Consumo da Mesa:</span>
            <span style="font-size:14px; font-weight:600; color:#0f172a;">R$ \${getMesaBruto(nomeMesa).toFixed(2).replace('.', ',')}</span>
          </div>
          \${getMesaPagamentos(nomeMesa) > 0 ? \`
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="font-size:13px; color:#64748b;">Pagamentos Realizados:</span>
            <span style="font-size:14px; font-weight:600; color:#ef4444;">- R$ \${getMesaPagamentos(nomeMesa).toFixed(2).replace('.', ',')}</span>
          </div>\` : ''}
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; padding-top:8px; border-top:1px solid #e2e8f0; margin-bottom:12px;">
            <span style="font-size:14px; font-weight:700; color:#0f172a;">A Pagar (c/ Taxa):</span>
            <strong style="font-size:20px; font-weight:900; color:#10b981;">R$ \${getMesaPendenteComTaxa(nomeMesa).toFixed(2).replace('.', ',')}</strong>
          </div>
          
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
            <button onclick="document.getElementById('modal-detalhes-mesa-pdv-mobile').style.display='none'; abrirCardapioComMesa('\${nomeMesa}')" style="padding:12px; background:#fc4b15; color:white; border:none; border-radius:12px; font-weight:800; font-size:13px; cursor:pointer;">
              <i class="ph-bold ph-plus-circle"></i> Lançar Itens
            </button>
            <button onclick="document.getElementById('modal-detalhes-mesa-pdv-mobile').style.display='none'; abrirCheckoutMesa('\${nomeMesa}')" style="padding:12px; background:#10b981; color:white; border:none; border-radius:12px; font-weight:800; font-size:13px; cursor:pointer;">
              <i class="ph-bold ph-check-circle"></i> Pagar / Fechar
            </button>
          </div>
        </div>
      </div>`;
  
  if (content.includes(modalTarget)) {
    content = content.replace(modalTarget, modalReplacement);
  } else {
    // try replacing with regex to ignore exact whitespace matching
    content = content.replace(
      /<div style="background:#ffffff; border-radius:24px 24px 0 0;[\s\S]*?Pagar \/ Fechar\n\s*<\/button>\n\s*<\/div>\n\s*<\/div>\n\s*<\/div>/,
      modalReplacement
    );
  }

  fs.writeFileSync(filePath, content);
}

['pdv-mobile.js', 'public/pdv-mobile.js', 'hub-server/public/pdv-mobile.js'].forEach(p => {
  try {
    applyFixes(p);
    console.log('Fixed ' + p);
  } catch(e) {
    console.log('Failed ' + p + ': ' + e.message);
  }
});
