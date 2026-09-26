import os

files = ['index.html', 'caixa-classico.html', 'src/views/caixa/index.html']

for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    content = content.replace('<script src="/main.js"></script>', '<script type="module" src="/main.js"></script>')
    
    with open(f, 'w', encoding='utf-8') as file:
        file.write(content)

print("Fixed HTML files.")
