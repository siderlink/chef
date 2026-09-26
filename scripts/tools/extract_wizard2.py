import os
import re

main_file = "main.js"
wizard_file = "src/js/modules/wizard.js"

with open(main_file, "r", encoding="utf-8") as f:
    lines = f.readlines()

block1 = lines[1:279]
block2 = lines[4121:4475]

wizard_content = "".join(block1) + "\n\n" + "".join(block2)

exports = []
for line in wizard_content.split('\n'):
    m = re.search(r'window\.([a-zA-Z0-9_]+)\s*=\s*function', line)
    if m:
        exports.append(m.group(1))

# Also match let or const at root level that start with _wizard so we can wrap them correctly? 
# Wait, they are at the top level of the file, so they will be scoped to the module anyway! That's the beauty of ES modules. They won't leak.

# Eliminate duplicates
exports = list(dict.fromkeys(exports))

export_statement = "\nexport { " + ", ".join(exports) + " };\n"

new_wizard = wizard_content
for exp in exports:
    new_wizard = re.sub(r'window\.' + exp + r'\s*=\s*function', f'const {exp} = function', new_wizard)

new_wizard += export_statement

os.makedirs("src/js/modules", exist_ok=True)
with open(wizard_file, "w", encoding="utf-8") as f:
    f.write(new_wizard)

# Replace in main.js
import_stmt = "import { " + ", ".join(exports) + " } from './src/js/modules/wizard.js';\n"
for exp in exports:
    import_stmt += f"window.{exp} = {exp};\n"

new_main = "".join(lines[:1]) + import_stmt + "".join(lines[279:4121]) + "".join(lines[4475:])

with open(main_file, "w", encoding="utf-8") as f:
    f.write(new_main)

print(f"Extracted {len(exports)} functions: {', '.join(exports)}")
