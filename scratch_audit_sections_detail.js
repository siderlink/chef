const fs = require('fs');
const html = fs.readFileSync('views/super-admin-panel.html', 'utf8');
const js = fs.readFileSync('super-admin.js', 'utf8');

// Find all data-targets
const targets = [...new Set([...html.matchAll(/data-target="([^"]+)"/g)].map(m => m[1]))];

console.log('Auditing', targets.length, 'sections for visual and functional completeness...\n');

const issues = [];

targets.forEach(target => {
  // Find section in html
  const idRegex = new RegExp('<(div|section)[^>]*id=["\']' + target + '["\'][^>]*>([\\s\\S]*?)(?=<div[^>]*class=["\'][^"\']*content-section|<section[^>]*class=["\'][^"\']*content-section|$)', 'i');
  const match = idRegex.exec(html);

  if (!match) {
    issues.push({ target, issue: 'CONTAINER_NOT_FOUND', severity: 'HIGH' });
    return;
  }

  const content = match[2];
  const text = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  // Check if content is trivial (just a heading or under 200 chars of text)
  if (text.length < 100) {
    issues.push({ target, issue: 'VERY_SHORT_CONTENT (' + text.length + ' chars)', textSample: text, severity: 'HIGH' });
  }

  // Check for placeholder phrases
  const placeholders = ['em breve', 'em desenvolvimento', 'construção', 'não implementad', 'funcionalidade futura', 'todo:'];
  for (const ph of placeholders) {
    if (content.toLowerCase().includes(ph)) {
      issues.push({ target, issue: 'CONTAINS_PLACEHOLDER: "' + ph + '"', severity: 'MEDIUM' });
    }
  }

  // Check for broken onclicks
  const onclickMatches = [...content.matchAll(/onclick=["']([^"']+)["']/g)];
  onclickMatches.forEach(om => {
    const fnCall = om[1].trim();
    const fnName = fnCall.split('(')[0].replace(/window\./, '').trim();
    if (fnName && !['alert', 'confirm', 'prompt', 'event.stopPropagation', 'location.href', 'window.open'].includes(fnName)) {
      // Check if function exists in super-admin.js or views/super-admin-panel.html
      const inJs = new RegExp('function\\s+' + fnName + '\\b|window\\.' + fnName + '\\s*=|var\\s+' + fnName + '\\s*=\\s*function', 'g').test(js) || content.includes('function ' + fnName);
      if (!inJs) {
        issues.push({ target, issue: 'MISSING_ONCLICK_FUNCTION: ' + fnName, severity: 'HIGH' });
      }
    }
  });
});

console.log(JSON.stringify(issues, null, 2));
