import os
import re

files = ['index.html', 'caixa-classico.html', 'src/views/caixa/index.html']

for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # Replace <script src="main.js..."></script> with <script type="module" src="main.js..."></script>
    content = re.sub(r'<script\s+src="(/)?main\.js[^"]*"></script>', r'<script type="module" src="\g<1>main.js"></script>', content)
    
    with open(f, 'w', encoding='utf-8') as file:
        file.write(content)

print("Fixed HTML files with regex.")
