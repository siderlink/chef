import os
import re

main_file = "main.js"
auth_device_file = "src/js/modules/auth_device.js"

with open(main_file, "r", encoding="utf-8") as f:
    lines = f.readlines()

start_idx = -1
end_idx = -1
for i, line in enumerate(lines):
    if "window.isDonoMaster = function" in line:
        start_idx = i - 1 
    if "window.enviarRegistroSessaoDetalhado = function" in line and start_idx != -1:
        # Include this function and the next ones
        pass
    if "window.abrirModalLoginFuncionarioMobile" in line and start_idx != -1:
        end_idx = i - 1 
        break

if start_idx != -1 and end_idx != -1:
    block = lines[start_idx:end_idx]
    
    content = "".join(block)
    exports = []
    for line in block:
        m = re.search(r'window\.([a-zA-Z0-9_]+)\s*=\s*function', line)
        if m:
            exports.append(m.group(1))
            
    exports = list(dict.fromkeys(exports))
    
    new_content = content
    for exp in exports:
        new_content = re.sub(r'window\.' + exp + r'\s*=\s*function', f'const {exp} = function', new_content)
        
    export_statement = "\nexport { " + ", ".join(exports) + " };\n"
    
    with open(auth_device_file, "w", encoding="utf-8") as f:
        f.write(new_content + export_statement)
        
    import_stmt = "import { " + ", ".join(exports) + " } from './src/js/modules/auth_device.js';\n"
    for exp in exports:
        import_stmt += f"window.{exp} = {exp};\n"
        
    new_main = "".join(lines[:start_idx]) + import_stmt + "".join(lines[end_idx:])
    
    with open(main_file, "w", encoding="utf-8") as f:
        f.write(new_main)
        
    print(f"Extracted auth_device! {len(exports)} functions: {', '.join(exports)}")
else:
    print("Could not find auth_device block")

