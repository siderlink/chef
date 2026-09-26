import os

server_file = "server.js"
routes_file = "src/routes/superadmin.routes.js"

with open(server_file, "r", encoding="utf-8") as f:
    lines = f.readlines()

s1 = -1
e1 = -1
s2 = -1
e2 = -1

for i, line in enumerate(lines):
    if "app.post('/api/super/login-local'" in line and s1 == -1:
        s1 = i
    if "app.post('/api/super/exec'" in line and s1 != -1 and e1 == -1:
        e1 = i + 30  # Roughly
    if "app.get('/api/super/afiliados'" in line and s2 == -1:
        s2 = i
    if "app.post('/api/super/deploy-commit'" in line and s2 != -1 and e2 == -1:
        e2 = i + 30 # Roughly

print(s1, e1, s2, e2)

# Verify the end of blocks carefully:
def find_end_brace(start_idx):
    brace_count = 0
    found_open = False
    for i in range(start_idx, len(lines)):
        brace_count += lines[i].count('{')
        if '{' in lines[i]: found_open = True
        brace_count -= lines[i].count('}')
        if found_open and brace_count == 0:
            # Check if line ends with }); or something similar
            return i
    return start_idx

if e1 != -1:
    e1 = find_end_brace(e1 - 30)
if e2 != -1:
    e2 = find_end_brace(e2 - 30)

print("Exact boundaries:", s1, e1, s2, e2)

block1 = lines[s1:e1+1]
block2 = lines[s2:e2+1]

# Now, we create the router file
router_content = """const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

module.exports = function(db, superAdminAuth, upload, getIo) {
"""

for line in block1 + block2:
    router_content += line.replace("app.get('/api/super", "router.get('").replace("app.post('/api/super", "router.post('").replace("app.put('/api/super", "router.put('").replace("app.delete('/api/super", "router.delete('")

router_content += """
  return router;
};
"""

os.makedirs("src/routes", exist_ok=True)
with open(routes_file, "w", encoding="utf-8") as f:
    f.write(router_content)

# Update server.js
new_server_content = "".join(lines[:s1]) + "".join(lines[e1+1:s2]) + "".join(lines[e2+1:])

with open(server_file, "w", encoding="utf-8") as f:
    f.write(new_server_content)
    
print("Super Admin routes extracted successfully.")
