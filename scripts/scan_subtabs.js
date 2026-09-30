const fs = require('fs');
const panel = fs.readFileSync('views/super-admin-panel.html', 'utf8');

// Find tab buttons, data-tab, data-subtab, onclick="trocarSubtab...", etc.
const subtabMatches = panel.match(/<button[^>]*class=["'][^"']*(?:subtab|tab-btn|tab-button|pill)[^"']*["'][^>]*>/gi) || [];
console.log(`Found ${subtabMatches.length} subtab/tab buttons:`);
subtabMatches.slice(0, 30).forEach(b => console.log(b));

// Find data-* tabs
const dataTabs = panel.match(/data-(?:subtab|tab|sv-tab|sec)=["'][^"']+["']/gi) || [];
console.log(`\nFound ${dataTabs.length} data-tab attributes:`);
console.log([...new Set(dataTabs)]);

// Find all onclick containing tab/aba/subtab
const onClicks = panel.match(/onclick=["'][^"']*(?:tab|aba|subtab)[^"']*["']/gi) || [];
console.log(`\nFound ${onClicks.length} onclick handlers with tab/aba:`);
console.log([...new Set(onClicks)]);
