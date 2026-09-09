/*
 * obfuscate.js — Ofusca todo o código JS antes do empacotamento.
 *
 * Fluxo de uso (pipeline de empacotamento):
 *   npm run build          -> gera dist/ (frontend)
 *   node sync-prod.js      -> gera server-prod.js (servidor concatenado)
 *   node obfuscate.js      -> ofusca dist (JS + script inline dos HTML) e server-prod.js (in place)
 *   npx pkg server-prod.js -> empacota o servidor já ofuscado
 *
 * A pasta dist/ é recriada a cada `npm run build` e o server-prod.js a cada
 * `node sync-prod.js`, então a ofuscação sempre parte do código-fonte limpo.
 * Ainda assim, cada arquivo/bloco recebe um marcador e é pulado se já estiver
 * ofuscado (idempotente para execuções manuais repetidas).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const SERVER = path.join(ROOT, 'server-prod.js');
const MARK = '/*chef-obf-1*/';

function hb(kb) {
  return (kb / 1024).toFixed(1) + ' KB';
}

// Configuração do frontend (rodado no navegador). renameGlobals=false é
// obrigatório: os scripts usam handlers HTML tipo onclick="window.foo()".
const CLIENT_OPTIONS = {
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  selfDefending: true,             // Blindagem ativa contra crackers: trava/quebra se o código for formatado ou alterado
  debugProtection: true,           // Trava DevTools quando breakpoints são acionados
  debugProtectionInterval: 2500,   // Loop anti-debugger contínuo a cada 2.5s
  simplify: true,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayThreshold: 0.75,      // 75% das strings são ofuscadas em base64
  numbersToExpressions: false,
  splitStrings: false,
  transformObjectKeys: false,
  unicodeEscapeSequence: true,  // prevents emoji/non-ASCII corruption (surrogate pairs)
  log: false
};

// Configuração do servidor. O pkg precisa resolver os require() estaticamente,
// então stringArray fica DESLIGADO: os argumentos de require() permanecem como
// literais e o pkg consegue embutir os módulos (express, sqlite3, socket.io...).
// A ofuscação do servidor é feita por renomeação de identificadores + compactação.
const SERVER_OPTIONS = {
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  selfDefending: false,
  simplify: true,
  stringArray: false,
  numbersToExpressions: false,
  splitStrings: false,
  transformObjectKeys: false,
  unicodeEscapeSequence: true,  // prevents emoji/non-ASCII corruption (surrogate pairs)
  log: false
};

function walkJs(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'vendor' || ent.name === 'legacy-deps') continue; // libs de terceiros já minificadas (não ofuscar)
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkJs(full, out);
    else if (ent.isFile() && ent.name.endsWith('.js')) out.push(full);
  }
  return out;
}

function obfuscate(file, options) {
  const rel = path.relative(ROOT, file);
  const src = fs.readFileSync(file, 'utf8');
  if (src.startsWith(MARK)) {
    console.log('  [skip] ' + rel);
    return;
  }
  const started = Date.now();
  const code = JavaScriptObfuscator.obfuscate(src, options).getObfuscatedCode();
  fs.writeFileSync(file, MARK + '\n' + code);
  console.log('  [ok] ' + rel + ' (' + hb(Buffer.byteLength(src)) + ' -> ' + hb(Buffer.byteLength(code)) + ') em ' + (Date.now() - started) + 'ms');
}

// Variação usada no modo --hub: ofusca o server.js COMPLETO (com Super Admin) e
// grava em outro arquivo (hub-server/server-hub.js), sem tocar no original.
function obfuscateTo(file, outFile, options) {
  const rel = path.relative(ROOT, file);
  const src = fs.readFileSync(file, 'utf8');
  const started = Date.now();
  const code = JavaScriptObfuscator.obfuscate(src, options).getObfuscatedCode();
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, MARK + '\n' + code);
  console.log('  [ok] ' + rel + ' -> ' + path.relative(ROOT, outFile) + ' (' + hb(Buffer.byteLength(src)) + ' -> ' + hb(Buffer.byteLength(code)) + ') em ' + (Date.now() - started) + 'ms');
}

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

function inlineScriptType(attrs) {
  const tm = attrs.match(/type\s*=\s*["']([^"']*)["']/i);
  const type = tm ? tm[1].trim().toLowerCase() : 'text/javascript';
  if (!type || type === 'text/javascript' || type === 'application/javascript') return 'js';
  return type; // ex: 'module', 'application/json', 'text/template' -> não ofuscar
}

function obfuscateHtml(file) {
  const rel = path.relative(ROOT, file);
  const html = fs.readFileSync(file, 'utf8');
  const blocks = [];
  let m;
  const re = new RegExp(SCRIPT_RE.source, 'gi');
  while ((m = re.exec(html)) !== null) {
    blocks.push({
      start: m.index,
      raw: m[0],
      attrs: m[1],
      innerStart: m.index + m[0].indexOf('>') + 1,
      body: m[2]
    });
  }
  const originals = blocks.length;
  const errors = [];
  const pending = [];
  blocks.forEach(function (b) {
    if (/\bsrc\s*=/i.test(b.attrs)) return;                     // script externo (arquivo)
    const kind = inlineScriptType(b.attrs);
    if (kind !== 'js') return;                                  // json/template/module
    if (!b.body.trim()) return;                                 // vazio
    if (b.body.replace(/^\s*/, '').startsWith(MARK)) return;    // já ofuscado
    pending.push(b);
  });
  pending.forEach(function (b) {
    const started = Date.now();
    try {
      const babel = require('@babel/core');
      let babelCode = babel.transformSync(b.body, {
        presets: [['@babel/preset-env', { targets: 'iOS >= 9' }]],
        compact: false
      }).code;

      let code = JavaScriptObfuscator.obfuscate(babelCode, CLIENT_OPTIONS).getObfuscatedCode();
      // Nunca permitir que o HTML feche o <script> no meio do código ofuscado.
      code = code.replace(/<\/script/gi, '<\\/script');
      const chunk = MARK + '\n' + code;
      b.replacement = chunk;
      console.log('  [ok] ' + rel + ' <script> (' + hb(b.body.length) + ' -> ' + hb(chunk.length) + ') em ' + (Date.now() - started) + 'ms');
    } catch (e) {
      errors.push('  [ERRO] ' + rel + ' <script>: ' + e.message);
    }
  });
  if (pending.length) {
    let out = html;
    for (let i = pending.length - 1; i >= 0; i--) {
      const b = pending[i];
      if (typeof b.replacement === 'string') {
        out = out.slice(0, b.innerStart) + b.replacement + out.slice(b.innerStart + b.body.length);
      }
    }
    fs.writeFileSync(file, out);
    const after = (out.match(/<script\b/gi) || []).length;
    if (after !== originals) {
      errors.push('  [ERRO] ' + rel + ': contagem de <script> mudou de ' + originals + ' para ' + after + ' — arquivo pode estar corrompido.');
    }
  }
  errors.forEach(function (e) { console.log(e); });
  if (errors.length) throw new Error('Falha ao ofuscar scripts inline de ' + rel);
}

function main() {
  const HUB_MODE = process.argv.includes('--hub');
  const SERVER_SRC = HUB_MODE ? path.join(ROOT, 'server.js') : SERVER;
  const SERVER_OUT = HUB_MODE ? path.join(ROOT, 'hub-server', 'server-hub.js') : SERVER;

  console.log('=== Ofuscando código (javascript-obfuscator) ===' + (HUB_MODE ? ' [HUB]' : ''));

  if (!fs.existsSync(DIST)) throw new Error('Pasta dist/ não encontrada. Rode "npm run build" primeiro.');
  if (!fs.existsSync(SERVER_SRC)) throw new Error((HUB_MODE ? 'server.js' : 'server-prod.js') + ' não encontrado. Rode "node sync-prod.js" primeiro.');

  console.log('\n[1/3] Scripts inline dos HTML (dist/*.html)...');
  fs.readdirSync(DIST).filter(function (f) { return f.endsWith('.html'); }).forEach(function (f) {
    obfuscateHtml(path.join(DIST, f));
  });

  console.log('\n[2/3] Arquivos .js do frontend (dist/...)...');
  walkJs(DIST, []).forEach(function (f) { obfuscate(f, CLIENT_OPTIONS); });

  if (HUB_MODE) {
    console.log('\n[3/3] Servidor completo (server.js -> hub-server/server-hub.js)...');
    obfuscateTo(SERVER_SRC, SERVER_OUT, SERVER_OPTIONS);
  } else {
    console.log('\n[3/3] Servidor (server-prod.js)...');
    obfuscate(SERVER, SERVER_OPTIONS);
  }

  console.log('\nOfuscação concluída.');
}

try {
  main();
} catch (e) {
  console.error('\n' + e.message);
  process.exit(1);
}
