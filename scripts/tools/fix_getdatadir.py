with open('src/routes/superadmin.routes.js', 'r', encoding='utf-8') as f:
    c = f.read()

injection = "function getDataDir() { return path.join(__dirname, '..', '..', 'data'); }\n\nmodule.exports"
c = c.replace('module.exports', injection)

with open('src/routes/superadmin.routes.js', 'w', encoding='utf-8') as f:
    f.write(c)
print('Injected getDataDir')
