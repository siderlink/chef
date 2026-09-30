const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const htmlFiles = fs.readdirSync(rootDir).filter(f => f.endsWith('.html'));
const jsFiles = fs.readdirSync(rootDir).filter(f => f.endsWith('.js'));
const publicJsFiles = fs.existsSync(path.join(rootDir, 'public')) 
  ? fs.readdirSync(path.join(rootDir, 'public')).filter(f => f.endsWith('.js')).map(f => 'public/' + f)
  : [];

const allJsFiles = [...jsFiles, ...publicJsFiles];
const allJsContent = allJsFiles.map(f => ({
  file: f,
  content: fs.readFileSync(path.join(rootDir, f), 'utf8')
}));

const missingFunctions = [];
const checkedFunctions = new Set();
const foundFunctions = new Set();
const nativeOrGlobal = new Set(['console.log', 'alert', 'window.location.reload', 'history.back', 'window.print', 'fecharModal', 'abrirModal', 'setTimeout']);

htmlFiles.forEach(htmlFile => {
  const html = fs.readFileSync(path.join(rootDir, htmlFile), 'utf8');
  const regex = /onclick=["']([a-zA-Z0-9_\.]+)\(/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const funcName = match[1];
    
    // Skip inline logic or complex statements
    if (funcName.includes('.') && !funcName.startsWith('window.') && !funcName.startsWith('superAdmin.')) continue;
    
    const cleanFuncName = funcName.replace('window.', '').replace('superAdmin.', '');
    if (nativeOrGlobal.has(cleanFuncName)) continue;
    
    if (checkedFunctions.has(cleanFuncName)) continue;
    checkedFunctions.add(cleanFuncName);
    
    // check if funcName exists in ANY js file
    let found = false;
    for (const js of allJsContent) {
      if (
        js.content.includes(`function ${cleanFuncName}(`) ||
        js.content.includes(`${cleanFuncName} = function`) ||
        js.content.includes(`${cleanFuncName} = (`) ||
        js.content.includes(`${cleanFuncName}(`) && js.content.includes(`class`) // method
      ) {
        found = true;
        foundFunctions.add(cleanFuncName);
        break;
      }
    }
    
    // Also check inside the HTML file itself (inline scripts)
    if (!found) {
       if (
        html.includes(`function ${cleanFuncName}(`) ||
        html.includes(`${cleanFuncName} = function`) ||
        html.includes(`${cleanFuncName} = (`)
       ) {
         found = true;
         foundFunctions.add(cleanFuncName);
       }
    }
    
    if (!found) {
      missingFunctions.push({ file: htmlFile, function: funcName });
    }
  }
});

fs.writeFileSync('diagnostic_missing_functions.json', JSON.stringify(missingFunctions, null, 2));
console.log(`Diagnostic complete. Found ${missingFunctions.length} missing functions.`);
