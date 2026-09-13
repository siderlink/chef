const bytenode = require('bytenode');
const fs = require('fs');

const fileToCompile = 'server-prod.js';
const outputFile = 'server-prod.jsc';

try {
  if (fs.existsSync(outputFile)) {
    fs.unlinkSync(outputFile);
  }

  bytenode.compileFile({
    filename: fileToCompile,
    output: outputFile,
    compileAsModule: true
  });

  console.log(`[Bytenode] Concluído: ${fileToCompile} compilado para V8 Bytecode (${outputFile})`);
} catch (e) {
  console.error('[Bytenode] Erro na compilação:', e);
  process.exit(1);
}
