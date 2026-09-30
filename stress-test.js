const { io } = require("socket.io-client");

const TARGET_URL = "http://localhost:8080";
const args = process.argv.slice(2);
const RESTAURANTS_COUNT = parseInt(args[0]) || 10;
const CLIENTS_PER_REST = 3; // 1 Caixa, 1 KDS, 1 Garçom
const ORDERS_PER_REST = 10; // Qtd de pedidos por restaurante na simulação

let activeSockets = [];
let totalOrdersSent = 0;
let totalOrdersReceived = 0;
let errorsCount = 0;

console.log(`\n🚀 INICIANDO TESTE DE ESTRESSE: ${RESTAURANTS_COUNT} RESTAURANTES SIMULTÂNEOS`);
console.log(`📊 Conexões Totais: ${RESTAURANTS_COUNT * CLIENTS_PER_REST}`);
console.log(`📦 Pedidos Totais Previstos: ${RESTAURANTS_COUNT * ORDERS_PER_REST}`);
console.log('---------------------------------------------------\n');

let startTime = Date.now();
let connectedCount = 0;

async function start() {
  console.log(`⏳ Pre-aquecendo ${RESTAURANTS_COUNT} bancos de dados sequencialmente para evitar travamento do event loop...`);
  for (let r = 1; r <= RESTAURANTS_COUNT; r++) {
    try {
      await fetch(`${TARGET_URL}/api/config?restaurante_id=${r}`, { headers: { 'Authorization': 'Bearer admin_test' } });
    } catch(e) {}
  }
  console.log(`✅ Pre-aquecimento concluído.`);

  // Conectar todos os sockets primeiro
  for (let r = 1; r <= RESTAURANTS_COUNT; r++) {
    for (let c = 1; c <= CLIENTS_PER_REST; c++) {
      const socket = io(TARGET_URL, {
        query: { restaurante_id: r, token: 'admin_test' },
        reconnection: false
      });

      socket.on('connect', () => {
        connectedCount++;
        if(connectedCount === RESTAURANTS_COUNT * CLIENTS_PER_REST) {
          console.log(`✅ Todos os ${connectedCount} Sockets conectados com sucesso em ${Date.now() - startTime}ms.`);
          startFiring();
        }
      });

      socket.on('connect_error', (err) => {
        errorsCount++;
        // console.error('Connection error:', err.message);
      });

      // Apenas o cliente 1 de cada restaurante ouve os pedidos atualizados para validar o recebimento
      if(c === 1) {
        socket.on('pedidos_atualizados', (pedidos) => {
          // O servidor manda todos os pedidos do tenant toda vez que tem alteração
          // Mas vamos apenas contabilizar que recebemos o broadcast
          totalOrdersReceived++;
        });
      }

      activeSockets.push({ restId: r, type: c, socket });
    }
  }

  // Fallback caso algum socket falhe em conectar
  setTimeout(() => {
    if(connectedCount < RESTAURANTS_COUNT * CLIENTS_PER_REST) {
      console.log(`⚠️ Aviso: Apenas ${connectedCount} conectaram. Iniciando disparos...`);
      startFiring();
    }
  }, 5000);
}

let firing = false;
function startFiring() {
  if(firing) return;
  firing = true;
  console.log(`\n🔥 INICIANDO DISPARO MASSIVO DE PEDIDOS (SPAM)...`);
  let fireStartTime = Date.now();

  let delay = 0;
  for (let r = 1; r <= RESTAURANTS_COUNT; r++) {
    // Pegar o 'Garçom' (tipo 3) para enviar o pedido
    const waiter = activeSockets.find(s => s.restId === r && s.type === 3);
    if(!waiter) continue;

    for (let o = 1; o <= ORDERS_PER_REST; o++) {
      // Disparar pedidos de forma assíncrona mas muito rápida
      setTimeout(() => {
        const payload = {
          productName: `Carga Teste #${o} - Rest ${r}`,
          total: 50.00,
          userName: `Garçom Bot ${r}`,
          localName: `Mesa ${o}`,
          sector: 'Cozinha',
          status: 'Novo',
          produtos_envolvidos: JSON.stringify([{name: 'Teste Stress', qty: 2}])
        };
        waiter.socket.emit('novo_pedido', payload);
        totalOrdersSent++;
      }, delay);
      delay += 5; // 5ms de intervalo global = 200 req/sec
    }
  }

  // Esperar o fim da carga para relatar
  setTimeout(() => {
    const elapsed = Date.now() - fireStartTime;
    console.log('\n===================================================');
    console.log(`🏁 RESULTADOS DO TESTE (RESTS: ${RESTAURANTS_COUNT}):`);
    console.log(`⏱️ Tempo decorrido de disparo: ${elapsed}ms`);
    console.log(`📤 Pedidos Enviados: ${totalOrdersSent}`);
    console.log(`📥 Broadcasts Recebidos: ${totalOrdersReceived}`);
    console.log(`❌ Erros de Conexão: ${errorsCount}`);
    console.log('===================================================\n');
    process.exit(0);
  }, delay + 6000); // Espera o último disparo + 6s de folga para receber DB acks
}

start();
