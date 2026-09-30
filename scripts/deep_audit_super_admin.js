const fs = require('fs');

const html = fs.readFileSync('views/super-admin-panel.html', 'utf8');
const js = fs.readFileSync('super-admin.js', 'utf8');

// Extract all menu items
const menuItems = Array.from(html.matchAll(/class="[^"]*menu-item[^"]*"[^>]*data-target="([^"]+)"/g)).map(m => m[1]);

// Extract all content sections
const sectionRegex = /<div\s+class="content-section[^"]*"\s+id="([^"]+)"([\s\S]*?)(?=(?:<div\s+class="content-section|\s*<\/main>))/g;
let match;
const sections = {};
while ((match = sectionRegex.exec(html)) !== null) {
  sections[match[1]] = match[2];
}

console.log(`Found ${menuItems.length} menu items, ${Object.keys(sections).length} content sections.`);

// For each section, find all onclick handlers and check if they exist in JS or HTML
const report = [];

for (const secId of Object.keys(sections)) {
  const content = sections[secId];
  const onclicks = Array.from(content.matchAll(/onclick="([^"(]+)\(/g)).map(m => m[1].trim());
  const elementIds = Array.from(content.matchAll(/id="([^"]+)"/g)).map(m => m[1]);
  
  // Check if functions exist in JS
  const missingFns = [];
  for (const fn of onclicks) {
    if (['window.open', 'event.stopPropagation', 'alert', 'confirm', 'history.back', 'location.reload', 'this.select'].includes(fn)) continue;
    // Check if defined in js (function fnName, window.fnName = , fnName =)
    const fnRegex = new RegExp(`(?:function\\s+${fn}\\b|window\\.${fn}\\s*=|\\b${fn}\\s*=\\s*function|\\b${fn}\\s*=\\s*\\()`);
    if (!fnRegex.test(js) && !fnRegex.test(html)) {
      missingFns.push(fn);
    }
  }

  // Check content substance
  const cleanText = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const hasTable = /<table/i.test(content);
  const hasCards = /class="[^"]*card/i.test(content);
  const hasInputs = /<input|<select|<textarea/i.test(content);
  const hasButtons = /<button/i.test(content);
  const hasIframe = /<iframe/i.test(content);

  report.push({
    secId,
    textLength: cleanText.length,
    missingFns,
    hasTable,
    hasCards,
    hasInputs,
    hasButtons,
    hasIframe,
    elementIdsCount: elementIds.length
  });
}

console.log('\n=== AUDIT REPORT PER SECTION ===');
for (const r of report) {
  let flags = [];
  if (r.missingFns.length > 0) flags.push(`MISSING_FNS: [${r.missingFns.join(', ')}]`);
  if (r.textLength < 120 && !r.hasIframe) flags.push('VERY_SHORT_TEXT');
  if (!r.hasTable && !r.hasCards && !r.hasInputs && !r.hasIframe) flags.push('NO_STRUCTURED_CONTENT');
  
  const status = flags.length > 0 ? `⚠️ ${flags.join(' | ')}` : '✅ OK';
  console.log(`${r.secId.padEnd(28)} | text: ${String(r.textLength).padStart(5)} | ${status}`);
}
