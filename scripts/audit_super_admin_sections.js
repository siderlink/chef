const fs = require('fs');

const html = fs.readFileSync('views/super-admin-panel.html', 'utf8');
const menuMatches = Array.from(html.matchAll(/data-target="([^"]+)"/g)).map(m => m[1]);
const sectionMatches = Array.from(html.matchAll(/id="(sec-[^"]+)"/g)).map(m => m[1]);

console.log('--- Menu Items count:', menuMatches.length);
console.log(menuMatches);
console.log('--- Section IDs count:', sectionMatches.length);
console.log(sectionMatches);

const missingInSections = menuMatches.filter(m => !sectionMatches.includes(m));
console.log('\n>>> MENU ITEMS MISSING A CORRESPONDING <div id="sec-...">:');
console.log(missingInSections);

const missingInMenu = sectionMatches.filter(s => !menuMatches.includes(s));
console.log('\n>>> SECTIONS WITHOUT A DIRECT MENU ITEM:');
console.log(missingInMenu);

// Now let's inspect the content of each section in HTML:
// Check byte length, number of buttons, tables, inputs, iframes, etc.
console.log('\n=== CONTENT AUDIT FOR EACH SECTION ===');
const sectionRegex = /<div\s+class="content-section[^"]*"\s+id="([^"]+)"([\s\S]*?)(?=(?:<div\s+class="content-section|\s*<\/main>))/g;
let match;
const foundSections = [];
while ((match = sectionRegex.exec(html)) !== null) {
  const secId = match[1];
  const content = match[2];
  foundSections.push(secId);
  const textOnly = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const buttons = (content.match(/<button/g) || []).length;
  const inputs = (content.match(/<input|<select|<textarea/g) || []).length;
  const tables = (content.match(/<table/g) || []).length;
  const iframes = (content.match(/<iframe/g) || []).length;
  const cards = (content.match(/class="[^"]*card[^"]*"/g) || []).length;

  const isSuspicious = textOnly.length < 80 || (buttons === 0 && inputs === 0 && tables === 0 && iframes === 0);
  console.log(`${secId.padEnd(28)} | textLen: ${String(textOnly.length).padStart(5)} | btns: ${buttons} | inps: ${inputs} | tbls: ${tables} | frames: ${iframes} | cards: ${cards} ${isSuspicious ? '⚠️ LOW/SUSPICIOUS' : '✅ OK'}`);
}
