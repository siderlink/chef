import os
import re

with open('src/routes/superadmin.routes.js', 'r', encoding='utf-8') as f:
    c = f.read()

# Replace any app.get, app.post, app.use with router.get, router.post, router.use
c = re.sub(r'app\.(get|post|put|delete|use)\(', r'router.\1(', c)

with open('src/routes/superadmin.routes.js', 'w', encoding='utf-8') as f:
    f.write(c)

with open('server.js', 'r', encoding='utf-8') as f:
    c2 = f.read()

c2 = c2.replace("app.use('/api/super', superAdminRoutes", "app.use('/', superAdminRoutes")

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(c2)

print('Fixed router mount and app. routes')
