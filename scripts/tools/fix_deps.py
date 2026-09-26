with open('src/routes/superadmin.routes.js', 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace('module.exports = function(db, masterDb, superAdminAuth, upload, getIo) {', 'const licenseManager = require(\'../../license-manager\');\nconst fsSync = require(\'fs\');\n\nmodule.exports = function(db, masterDb, superAdminAuth, upload, getIo, getTenantDb) {')

with open('src/routes/superadmin.routes.js', 'w', encoding='utf-8') as f:
    f.write(c)

with open('server.js', 'r', encoding='utf-8') as f:
    c2 = f.read()

c2 = c2.replace('superAdminRoutes(db, masterDb, superAdminAuth, upload, () => io)', 'superAdminRoutes(db, masterDb, superAdminAuth, upload, () => io, getTenantDb)')

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(c2)

print('Injected getTenantDb, licenseManager and fsSync')
