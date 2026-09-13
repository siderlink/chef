const fs = require('fs');

function updateFinanceiroJS(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Fix calculations safely, parseMoneyMobile logic
  if (!content.includes('function parseMoneyFin')) {
    const parseFunction = `
function parseMoneyFin(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  let s = String(val).replace(/R\\$\\s*/gi, '').trim();
  if (s.includes(',')) s = s.replace(/\\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
`;
    content = parseFunction + content;
  }

  content = content.replace(
    /parseFloat\(p\.valTotal\)/g,
    `parseMoneyFin(p.valTotal)`
  );
  
  content = content.replace(
    /parseFloat\(m\.valor\)/g,
    `parseMoneyFin(m.valor)`
  );

  content = content.replace(
    /parseFloat\(mov\.valor\)/g,
    `parseMoneyFin(mov.valor)`
  );

  // Styling changes
  content = content.replace(
    /color: 'black'/g,
    `color: 'var(--fin-text)'`
  );
  content = content.replace(
    /color: 'red'/g,
    `color: '#f43f5e'`
  );
  content = content.replace(
    /color: 'green'/g,
    `color: '#10b981'`
  );
  content = content.replace(
    /color: '#333'/g,
    `color: 'var(--fin-text)'`
  );
  
  fs.writeFileSync(filePath, content);
}

['financeiro.js', 'public/financeiro.js', 'hub-server/public/financeiro.js'].forEach(p => {
  if (fs.existsSync(p)) {
    updateFinanceiroJS(p);
    console.log('Updated ' + p);
  }
});
