# Auditoria do Sistema Financeiro e Arquitetura do Chef Cozinha

## 1. Integridade Financeira (Resolvido: Valores Negativos)
Analisamos a estrutura de fechamento e cálculos das mesas e identificamos o motivo pelo qual valores negativos eram exibidos nas comandas:
- **Causa Raiz**: O estado da conta na UI (`caixa-ultra.js`, `pdv-mobile.js`, `main.js`) realizava agrupamentos matemáticos brutos (`total += val`). Pagamentos parciais (salvos com valor negativo no banco) ou remoções podiam reduzir o saldo bruto abaixo de zero devido a manipulações assíncronas ou anomalias do pedido. O frontend formatava a variável diretamente, exibindo `R$ -10.00`.
- **Ação Tomada**: Aplicamos uma blindagem em todas as partes da camada de renderização, forçando um "piso matemático" (`Math.max(0, total)`).
- **Backend Robusto**: O servidor (`socket-financeiro.js`), que gerencia o balanço consolidado e os trocos no fechamento, **já** contava com amarras robustas de checagem. Agora as pontas coincidem perfeitamente; uma mesa jamais exibirá `R$ -X.XX`.

## 2. Vulnerabilidades Críticas de Segurança Identificadas
Durante a auditoria, identificamos rotas que **não exigem token de autenticação** (`verificarToken`) e permitem alterações graves na base de dados e no sistema fiscal:
- **`POST /api/nfce/emitir`**: Totalmente desprotegida. Qualquer pessoa que consiga fazer um POST para o IP da sua máquina pode emitir Notas Fiscais Eletrônicas em nome do restaurante.
- **`POST /api/formas-pagamento` e `POST /api/formas-pagamento/:id/toggle`**: Sem autenticação. É possível que indivíduos na mesma rede criem, editem ou desativem meios de pagamento, manipulando as taxas cobradas no caixa.
- **Recomendação Urgente**: Inserir o middleware `verificarToken` em todos os endpoints listados e aplicar sanitização reforçada nas entradas.

## 3. Gargalos Arquiteturais e Dificuldade de Manutenção
- **Monolito Intenso (`server.js`)**: O servidor principal detém mais de 12.000 linhas de código. Endpoints, websockets, acesso ao banco de dados e rotas HTTP estão todos aglutinados. Isso torna o sistema frágil (um erro em uma função paralisa todo o back-end).
- **Código Front-End Duplicado**: Encontramos lógica idêntica ou clonada (`main.js` vs `src/js/pages/main.js`, multiplos arquivos de Caixa). Cada alteração de regra de negócios exige modificações em 4 ou 5 arquivos, o que fomenta o surgimento de bugs em funcionalidades como pagamentos fracionados.
- **SQL Inline Extensivo (`db.run`, `db.all`)**: Quase todo o backend realiza queries em formato string bruta (SQL puro). Embora o uso de parâmetros previna injeções diretas em algumas instâncias, a ausência de uma camada ORM (Object-Relational Mapping) ou Query Builder centralizado dificulta o refatoramento e futuras manutenções do schema de dados.

## 4. Sugestão de Próximos Passos
1. **Blindar a API**: Adicionar `verificarToken` imediatamente nos endpoints listados no item 2.
2. **Desacoplar o `server.js`**: Separar os sockets (`/sockets`), rotas fiscais (`/routes/nfce.js`), integrações IA (`/routes/ia.js`) e lógicas do banco de dados em módulos isolados e importáveis.
3. **Consolidar os Scripts de Caixa**: Centralizar o algoritmo de fechamento de mesa e o cálculo de taxa para que o KDS (Fila), o Painel Mobile e o Caixa consumam o mesmo núcleo (core Javascript).
