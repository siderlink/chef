import re

with open('src/js/pages/fila.js', 'r', encoding='utf-8') as f:
    js = f.read()

replacement = """queueList.style.setProperty('--kds-card-grid-min-height', gridMinH);
    queueList.style.setProperty('--kds-card-height', (sizes.height || 76) + 'px');
    queueList.style.setProperty('--kds-font-size', (sizes.fontSize || 15) + 'px');
    queueList.style.setProperty('--kds-col-header-width', (sizes.header || 260) + 'px');
    queueList.style.setProperty('--kds-col-qty-width', (sizes.qty || 54) + 'px');
    queueList.style.setProperty('--kds-col-action-width', (sizes.action || 230) + 'px');
"""

js = js.replace("queueList.style.setProperty('--kds-card-grid-min-height', gridMinH);", replacement)

with open('src/js/pages/fila.js', 'w', encoding='utf-8') as f:
    f.write(js)
