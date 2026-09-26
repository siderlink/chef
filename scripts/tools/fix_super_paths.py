import re

with open('src/routes/superadmin.routes.js', 'r', encoding='utf-8') as f:
    c = f.read()

def replacer(match):
    path = match.group(2)
    # If path already starts with /api/, we don't prepend /api/super
    if path.startswith('/api/'):
        return f"router.{match.group(1)}('{path}'"
    # Otherwise, it was originally a /api/super route, so we prepend it
    # ensure no double slash if path is /
    if path == '/':
        return f"router.{match.group(1)}('/api/super'"
    return f"router.{match.group(1)}('/api/super{path}'"

c = re.sub(r"router\.(get|post|put|delete|use)\(\s*['\"]([^'\"]+)['\"]", replacer, c)

with open('src/routes/superadmin.routes.js', 'w', encoding='utf-8') as f:
    f.write(c)

print('Restored /api/super prefix')
