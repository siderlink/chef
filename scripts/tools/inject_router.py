import os

server_file = "server.js"

with open(server_file, "r", encoding="utf-8") as f:
    lines = f.readlines()

s = -1
for i, line in enumerate(lines):
    if "const publicRoutes = require('./src/routes/public.routes');" in line:
        s = i
        break

if s != -1:
    # Find the end of the publicRoutes registration
    e = s
    brace_count = 0
    found_open = False
    for i in range(s, len(lines)):
        brace_count += lines[i].count('{')
        if '{' in lines[i]: found_open = True
        brace_count -= lines[i].count('}')
        if found_open and brace_count == 0:
            if '});' in lines[i]:
                e = i
                break

    inject_idx = e + 1
    
    inject_content = """
const superAdminRoutes = require('./src/routes/superadmin.routes.js');
app.use('/', superAdminRoutes(db, superAdminAuth, upload, () => io));
"""
    
    new_lines = lines[:inject_idx] + [inject_content] + lines[inject_idx:]
    with open(server_file, "w", encoding="utf-8") as f:
        f.writelines(new_lines)
    print("Injected superAdminRoutes successfully.")
else:
    print("Could not find publicRoutes in server.js")
