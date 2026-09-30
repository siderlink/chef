import os
import re

with open('src/css/fila.css', 'r', encoding='utf-8') as f:
    css = f.read()

# Remover todos os patches mobile anteriores
css = re.sub(r'/\* =+ \*/\n/\* KDS MOBILE COMPACT.*?\n/\* =+ \*/\n@media \(max-width: 900px\).*?\n}\n}\n', '', css, flags=re.DOTALL)
css = re.sub(r'/\* ==+\n   KDS MOBILE COMPACT[\s\S]*?}\n}\n', '', css)

new_patch = """
/* =====================================================================
   KDS MOBILE COMPACT (NOVO LAYOUT GRADE E LINHAS PARA CELULAR E TABLET)
   ===================================================================== */
@media (max-width: 900px) {
  /* Arrumar navbar no mobile para nao dar overflow */
  .kds-header-titles, .kds-brand-texts {
    display: none !important;
  }
  
  .kds-navbar {
    padding: 0 8px !important;
  }

  /* Grid compacto para os cartoes */
  #queue-list:not(.modo-kanban) .queue-item,
  .queue-list:not(.modo-kanban) .queue-item {
    display: grid !important;
    grid-template-columns: auto 1fr !important;
    grid-template-rows: auto auto auto !important;
    grid-template-areas: 
      "cabecalho cabecalho"
      "quantidade produto"
      "acao acao" !important;
    gap: 8px !important;
    padding: 10px 12px !important;
    min-height: auto !important;
    height: auto !important;
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
  }
  
  #queue-list:not(.modo-kanban) .queue-item > [data-field-key="cabecalho"] {
    grid-area: cabecalho;
    width: 100% !important;
    min-width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    justify-self: stretch !important;
  }
  
  #queue-list:not(.modo-kanban) .queue-item > [data-field-key="quantidade"] {
    grid-area: quantidade;
    height: auto !important;
    min-height: 44px !important;
    width: auto !important;
    padding: 0 16px !important;
    margin: 0 !important;
    align-self: stretch !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
  }
  
  #queue-list:not(.modo-kanban) .queue-item > [data-field-key="produto"] {
    grid-area: produto;
    padding: 0 4px !important;
    margin: 0 !important;
    align-self: center !important;
  }
  
  #queue-list:not(.modo-kanban) .queue-item > [data-field-key="acao"] {
    grid-area: acao;
    width: 100% !important;
    margin: 4px 0 0 0 !important;
    display: flex !important;
    flex-direction: row !important;
    flex-wrap: wrap !important;
    gap: 8px !important;
    justify-content: space-between !important;
    justify-self: stretch !important;
  }
  
  #queue-list:not(.modo-kanban) .queue-item > [data-field-key="acao"] > * {
    flex: 1 1 auto !important;
    min-width: 100px !important;
  }
}
"""

with open('src/css/fila.css', 'w', encoding='utf-8') as f:
    f.write(css + "\n" + new_patch)

print("CSS atualizado!")
