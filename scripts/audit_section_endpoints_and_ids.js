const fs = require('fs');

const html = fs.readFileSync('views/super-admin-panel.html', 'utf8');
const js = fs.readFileSync('super-admin.js', 'utf8');

// List of all sections in switchTab
const switchTabRegex = /else if \(targetId === '([^']+)'\)/g;
const switchTabSections = ['sec-dash'];
let m;
while ((m = switchTabRegex.exec(js)) !== null) {
  switchTabSections.push(m[1]);
}

console.log('Total sections handled in switchTab:', switchTabSections.length);

// Extract all content-sections in HTML
const secInHtml = Array.from(html.matchAll(/<div\s+class="content-section[^"]*"\s+id="([^"]+)"/g)).map(x => x[1]);
console.log('Total content-section elements in HTML:', secInHtml.length);

const missingFromHtml = switchTabSections.filter(s => !secInHtml.includes(s));
console.log('Sections handled in switchTab but MISSING in HTML:', missingFromHtml);

const missingFromSwitchTab = secInHtml.filter(s => !switchTabSections.includes(s));
console.log('Sections in HTML but MISSING in switchTab handler:', missingFromSwitchTab);

// Now for each section in HTML, inspect its contents
const sections = {};
const sectionRegex = /<div\s+class="content-section[^"]*"\s+id="([^"]+)"([\s\S]*?)(?=(?:<div\s+class="content-section|\s*<\/main>))/g;
while ((m = sectionRegex.exec(html)) !== null) {
  sections[m[1]] = m[2];
}

console.log('\n--- Checking sections for placeholder or empty elements ---');
for (const [id, content] of Object.entries(sections)) {
  const trMatches = Array.from(content.matchAll(/<tbody\s+id="([^"]+)"/g)).map(x => x[1]);
  const cardMatches = Array.from(content.matchAll(/class="[^"]*card[^"]*"/g));
  const text = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  
  // Look for "Em breve", "Construção", "TODO", "Placeholder", empty divs
  const hasEmBreve = /em breve|em desenvolvimento|construção|work in progress/i.test(text);
  const isEmpty = text.length < 50;
  
  if (hasEmBreve || isEmpty) {
    console.log(`⚠️ POTENTIAL PLACEHOLDER/EMPTY: [${id}] - textLen: ${text.length}, hasEmBreve: ${hasEmBreve}`);
  }
}
