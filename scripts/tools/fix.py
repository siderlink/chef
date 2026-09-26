import os

with open('server.js', 'r', encoding='utf-8') as f:
    c = f.read()
    
c = c.replace('\\u0027', "'")

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(c)

print('Fixed')
