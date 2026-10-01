import os
import re

js_file = 'super-admin.js'
html_file = 'super-admin.html'
with open(js_file, 'r', encoding='utf-8') as f:
    js = f.read()

with open(html_file, 'r', encoding='utf-8') as f:
    html = f.read()

# Fix Sortable
js = re.sub(
    r'(Sortable\.create\(\s*document\.getElementById\(([\'"]\w+[\'"])\)\s*,)', 
    r'if(document.getElementById(\2)) \1', 
    js
)

# Fix Duplicated R$ R$ globally using an observer
observer_code = """
// Auto-fix layout and duplicates
setInterval(() => {
  document.querySelectorAll('.stat-value, .bi-card-value, td').forEach(el => {
    if (el.innerHTML.includes('R$ R$')) {
      el.innerHTML = el.innerHTML.replace(/R\$\s*R\$/g, 'R$');
    }
    if (el.innerText && el.innerText.includes('R$ R$')) {
      el.innerText = el.innerText.replace(/R\$\s*R\$/g, 'R$');
    }
  });
  
  // Fix duplicated client name Restaurante PirRestaurante Pirao -> Restaurante Pirao
  document.querySelectorAll('td div, td span').forEach(el => {
    const text = el.innerText;
    if (text && text.length > 10) {
      const half = Math.floor(text.length / 2);
      if (text.substring(0, half) === text.substring(half)) {
        el.innerText = text.substring(0, half);
      } else {
        const match = text.match(/(.+?)\1/);
        if (match && match[1].length > 4) {
             el.innerText = text.replace(match[0], match[1]);
        }
      }
    }
  });
}, 500);
"""
if "Auto-fix layout and duplicates" not in js:
    js += "\n" + observer_code

fix_routing = """
document.addEventListener('DOMContentLoaded', () => {
    const links = document.querySelectorAll('.sidebar a[href^="#"]');
    links.forEach(link => {
        link.addEventListener('click', (e) => {
            setTimeout(() => {
               const hash = window.location.hash;
               if(typeof navigateToSection === 'function') navigateToSection(hash.substring(1));
               else if(typeof renderCurrentSection === 'function') renderCurrentSection();
            }, 50);
        });
    });
});
"""
if "fix_routing" not in js:
    js += "\n" + fix_routing

# Fix BI Detalhes button
js = re.sub(
    r'<button([^>]*)>Detalhes</button>',
    r'<button\1 onclick="alert(\'Detalhes da franquia/restaurante em desenvolvimento.\')">Detalhes</button>',
    js
)

with open(js_file, 'w', encoding='utf-8') as f:
    f.write(js)

# Add CSS fixes to HTML
css_fixes = """
<style>
/* FIXES FOR OVERLAPPING AND ALIGNMENT */
.header-actions button, .btn, .btn-primary, .btn-secondary {
    white-space: nowrap !important;
    text-overflow: ellipsis;
    overflow: hidden;
    max-width: 100%;
}
table th, table td {
    padding: 12px 15px !important;
    text-align: left;
    white-space: nowrap;
}
.user-action-btn, button i {
    display: inline-flex !important;
    align-items: center;
    gap: 6px;
}
.sidebar a {
    transition: all 0.1s ease;
}
</style>
"""
if "/* FIXES FOR OVERLAPPING AND ALIGNMENT */" not in html:
    html = html.replace('</head>', css_fixes + '\n</head>')

with open(html_file, 'w', encoding='utf-8') as f:
    f.write(html)

print("Fixes applied to super-admin.js and super-admin.html")
