const fs = require('fs');
const files = [
  'pwa-motoboy.html', 'painel-crm.html', 'expedicao.html', 'esteira-kanban.html', 
  'cfo-virtual.html', 'tablet-mesa.html', 'compras-b2b.html', 'roleta-premiada.html', 
  'mapa-mesas-3d.html', 'painel-senhas-tv.html', 'radar-antifraude.html', 'pwa-colaborador.html'
];

let totalIssues = 0;

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const content = fs.readFileSync(file, 'utf8');
  console.log(\n--- Analisando:  ---);
  
  // Extrai blocos de script
  const scriptRegex = /<script>([\s\S]*?)<\/script>/gi;
  let scripts = '';
  let match;
  while ((match = scriptRegex.exec(content)) !== null) {
    scripts += match[1] + '\n';
  }

  // 1. Verifica onclicks
  const onclickRegex = /onclick="([^"]+)"/g;
  while ((match = onclickRegex.exec(content)) !== null) {
    let fnCall = match[1];
    if (fnCall.includes('window.') || fnCall.includes('localStorage.') || fnCall.includes('document.') || fnCall.includes('history.')) continue;
    let fnName = fnCall.split('(')[0].trim();
    if (fnName && !scripts.includes(unction ) && !scripts.includes(const ) && !scripts.includes(let )) {
      console.log([ALERTA] Função '' referenciada no onclick não encontrada no script!);
      totalIssues++;
    }
  }

  // 2. Verifica getElementById
  const idRegex = /document\.getElementById\(['"]([^'"]+)['"]\)/g;
  while ((match = idRegex.exec(content)) !== null) {
    let idName = match[1];
    // idName pode ser concatenado, entao vamos ignorar se contiver variaveis (ex: 'colab_' + id)
    if (idName.includes('+') || idName.includes('$')) continue;
    
    const htmlIdRegex = new RegExp(id=["']["']);
    if (!htmlIdRegex.test(content)) {
      console.log([ALERTA] ID HTML '' buscado no JS não existe na DOM!);
      totalIssues++;
    }
  }
}
console.log(\nTotal de problemas encontrados: );
