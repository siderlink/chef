import sys

with open('suporte.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

with open('insert_auditoria.txt', 'r', encoding='utf-8') as f:
    insert_str = f.read()

# We want to insert after the end of sec-implementacoes
# Let's find: <div class="content-section" id="sec-implementacoes">
# and the matching closing div.
# Or just insert at line 2275 (0-indexed 2274).

lines.insert(2275, insert_str + '\n')

with open('suporte.html', 'w', encoding='utf-8') as f:
    f.writelines(lines)
