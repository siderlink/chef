import re

with open('fila.css', 'r', encoding='utf-8') as f:
    css = f.read()

# Replace literal \n with actual newlines
css = css.replace('\\n', '\n')

# Append the required rules properly
rules = """
@media (max-width: 900px) {
  .kds-navbar-left .kds-btn-caixa span { display: none !important; }
  #btn-topbar-setor span { display: none !important; }
  .kds-navbar { overflow-x: auto !important; flex-wrap: nowrap !important; }
  .kds-navbar::-webkit-scrollbar { display: none; }
  .kds-navbar-right .kds-nav-btn span, .kds-navbar-right button span { display: none !important; }
  .kds-navbar-right { gap: 4px !important; }
  .kds-navbar-right .kds-nav-btn, .kds-navbar-right button { padding: 6px !important; }
  .kds-navbar-center { display: flex; flex-shrink: 0; }
}
"""

if "overflow-x: auto !important;" not in css:
    css += rules

with open('fila.css', 'w', encoding='utf-8') as f:
    f.write(css)

print("Fixed fila.css")
