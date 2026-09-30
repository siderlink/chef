with open('super-admin.html', 'r', encoding='utf-8') as f:
    html = f.read()

idx = html.find('id="admin-panel"')
if idx != -1:
    print(html[idx:idx+2000])
else:
    print("Not found")
