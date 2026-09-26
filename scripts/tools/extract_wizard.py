import os

main_file = "main.js"
wizard_file = "src/js/modules/wizard.js"

with open(main_file, "r", encoding="utf-8") as f:
    lines = f.readlines()

# Convert to 0-indexed
block1 = lines[1:279]
block2 = lines[4121:4475]

wizard_content = "".join(block1) + "\n\n" + "".join(block2)

# Find exports
import re
exports = []
for line in wizard_content.split('\n'):
    m = re.search(r'window\.([a-zA-Z0-9_]+)\s*=', line)
    if m:
        exports.append(m.group(1))

# Append exports to wizard.js
export_statement = "\nexport { " + ", ".join(exports) + " };\n"

# In wizard.js, replace window.funcName = with function funcName( or const funcName = 
# Wait, just exporting them is enough if we assign them to a local variable first, or we can just change window.X = function to export function X, but that might be harder.
# Let's just create local functions and export them.
# The simplest is: replace window.funcName = function with const funcName = function and export funcName.

new_wizard = wizard_content
for exp in exports:
    new_wizard = re.sub(r'window\.' + exp + r'\s*=\s*', f'const {exp} = ', new_wizard)

new_wizard += export_statement

os.makedirs("src/js/modules", exist_ok=True)
with open(wizard_file, "w", encoding="utf-8") as f:
    f.write(new_wizard)

# Now remove from main.js and inject import
import_stmt = "import { " + ", ".join(exports) + " } from './src/js/modules/wizard.js';\n"
for exp in exports:
    import_stmt += f"window.{exp} = {exp};\n"

new_main = "".join(lines[:1]) + import_stmt + "".join(lines[279:4121]) + "".join(lines[4475:])

with open(main_file, "w", encoding="utf-8") as f:
    f.write(new_main)

print(f"Extracted {len(exports)} functions: {', '.join(exports)}")
