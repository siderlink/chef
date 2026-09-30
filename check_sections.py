import re

with open('views/super-admin-panel.html', 'r', encoding='utf-8') as f:
    html = f.read()

sections_to_check = [
    'sec-licencas', 'sec-features-restaurante', 'sec-dominios', 'sec-terminal',
    'sec-instancias', 'sec-suporte-remoto', 'sec-plugins-modulos', 'sec-tema-custom',
    'sec-funcoes', 'sec-deploy-updates'
]

for sec in sections_to_check:
    match = re.search(f'<div[^>]*id="{sec}"[^>]*>(.*?)</div>\s*<!--', html, re.DOTALL | re.IGNORECASE)
    if match:
        content = match.group(1).strip()
        print(f"--- {sec} ---")
        if len(content) < 300:
             print(content)
        else:
             print(content[:300] + "... (truncated)")
    else:
        # try without trailing comment assumption
        match = re.search(f'<div[^>]*id="{sec}"[^>]*>(.*?)<div class="content-section"', html, re.DOTALL | re.IGNORECASE)
        if match:
             content = match.group(1).strip()
             print(f"--- {sec} ---")
             if len(content) < 300:
                  print(content)
             else:
                  print(content[:300] + "... (truncated)")
        else:
             print(f"--- {sec} --- NOT FOUND")
