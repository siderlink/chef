import re

def process_js():
    with open('painel-dono.js', 'r', encoding='utf-8') as f:
        js = f.read()

    js = re.sub(r'font-size:\s*10px', 'font-size: 13px', js)
    js = re.sub(r'font-size:\s*10\.5px', 'font-size: 13px', js)
    js = re.sub(r'font-size:\s*11px', 'font-size: 14px', js)
    js = re.sub(r'font-size:\s*11\.5px', 'font-size: 14px', js)
    js = re.sub(r'font-size:\s*12px', 'font-size: 15px', js)
    js = re.sub(r'font-size:\s*12\.5px', 'font-size: 15px', js)
    js = re.sub(r'font-size:\s*13px', 'font-size: 16px', js)

    with open('painel-dono.js', 'w', encoding='utf-8') as f:
        f.write(js)
        
    print("Done rewriting painel-dono.js")

process_js()
