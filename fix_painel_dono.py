import re

def process_html():
    with open('painel-dono.html', 'r', encoding='utf-8') as f:
        html = f.read()

    # 1. Update font-size in inline styles
    html = re.sub(r'font-size:\s*10px', 'font-size: 13px', html)
    html = re.sub(r'font-size:\s*11px', 'font-size: 13px', html)
    html = re.sub(r'font-size:\s*11\.5px', 'font-size: 14px', html)
    html = re.sub(r'font-size:\s*12px', 'font-size: 14px', html)
    html = re.sub(r'font-size:\s*12\.5px', 'font-size: 15px', html)
    html = re.sub(r'font-size:\s*13px', 'font-size: 15px', html)
    html = re.sub(r'font-size:\s*13\.5px', 'font-size: 15px', html)
    html = re.sub(r'font-size:\s*14px', 'font-size: 16px', html)

    # 2. Update CSS Variables (the ones in the extracted block)
    html = html.replace('--fs-xs: 13px;', '--fs-xs: 14px;')
    html = html.replace('--fs-sm: 15px;', '--fs-sm: 16px;')
    html = html.replace('--fs-md: 17px;', '--fs-md: 18px;')
    html = html.replace('--fs-lg: 21px;', '--fs-lg: 24px;')
    html = html.replace('--fs-xl: 26px;', '--fs-xl: 30px;')
    html = html.replace('--fs-kpi: 38px;', '--fs-kpi: 42px;')
    html = html.replace('--fs-kpi: 22px;', '--fs-kpi: 26px;')
    html = html.replace('--fs-kpi: 28px;', '--fs-kpi: 32px;')

    # 3. Update rigid grids to responsive auto-fit grids for mobile/tablet optimization
    # Replace simple "1fr 1fr" with minmax auto-fit so they stack on small screens
    html = re.sub(r'grid-template-columns:\s*1fr\s+1fr;', 'grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));', html)
    html = re.sub(r'grid-template-columns:\s*1fr\s+1fr\s+1fr;', 'grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));', html)
    html = re.sub(r'grid-template-columns:\s*1fr\s+1fr\s+1fr\s+1fr;', 'grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));', html)
    
    # 4. Make specific container adjustments
    # The sidebar / main-content layout in desktop might be absolute/fixed, let's check media queries
    # In painel-dono.html, the main sidebar is typically handled via media queries.
    
    with open('painel-dono.html', 'w', encoding='utf-8') as f:
        f.write(html)
        
    print("Done rewriting painel-dono.html")

process_html()
