module.exports = function(socket, io, db, helpers) {
  const { getLocalDateOnly, getLocalTimestamp, activePaymentLocks, tenantContext } = helpers || {};

  // --- GAMIFICACAO / JOGOS DE MESA ---
  
  function getHandValue(cards) {
    let value = 0;
    let aces = 0;
    for(let card of cards) {
      const v = card.slice(0, -1);
      if(v === 'A') { value += 11; aces++; }
      else if(['J','Q','K'].includes(v)) value += 10;
      else value += parseInt(v);
    }
    while(value > 21 && aces > 0) { value -= 10; aces--; }
    return value;
  }

  socket.on('game_create_lobby', (data) => {
    const roomId = socketTenantId + '_' + data.mesa;
    const cid = data.cliente_id || socket.id;
    
    let initialState = {};
    if (data.type === 'velha') initialState = { board: Array(9).fill(null), turn: cid };
    else if (data.type === 'blackjack') initialState = { deck: [], dealerCards: [], turnIndex: 0 };
    else if (data.type === 'batata_quente') initialState = { currentHolder: null, timer: null };

    tableGames[roomId] = {
      status: 'waiting', type: data.type, prize: data.prize, host: cid,
      players: { [cid]: { name: data.cliente_nome || 'Cliente 1', id: cid, ready: true, choice: null, actionTime: null, state: {} } },
      winner: null, loser: null, state: initialState
    };
    io.to('restaurante_' + socketTenantId).emit('game_lobby_updated', { mesa: data.mesa, game: tableGames[roomId] });
  });

  socket.on('game_join_lobby', (data) => {
    const roomId = socketTenantId + '_' + data.mesa;
    const game = tableGames[roomId];
    if(game && game.status === 'waiting') {
      const cid = data.cliente_id || socket.id;
      game.players[cid] = { name: data.cliente_nome || 'Cliente', id: cid, ready: true, choice: null, actionTime: null, state: {} };
      
      const pKeys = Object.keys(game.players);
      let startGame = false;
      
      if (['par_impar', 'reflexo', 'velha'].includes(game.type) && pKeys.length >= 2) startGame = true;
      
      if(startGame) game.status = 'playing';
      io.to('restaurante_' + socketTenantId).emit('game_lobby_updated', { mesa: data.mesa, game });
    }
  });

  socket.on('game_start', (data) => {
    const roomId = socketTenantId + '_' + data.mesa;
    const game = tableGames[roomId];
    if(game && game.status === 'waiting' && game.host === (data.cliente_id || socket.id)) {
      game.status = 'playing';
      
      if (game.type === 'batata_quente') {
        const pKeys = Object.keys(game.players);
        game.state.currentHolder = pKeys[Math.floor(Math.random() * pKeys.length)];
        const timeToExplode = 15000 + Math.random() * 25000;
        
        setTimeout(() => {
          if (tableGames[roomId] === game && game.status === 'playing') {
            game.status = 'finished';
            game.loser = game.state.currentHolder; // current holder loses
            io.to('restaurante_' + socketTenantId).emit('game_lobby_updated', { mesa: data.mesa, game });
            setTimeout(() => { if(tableGames[roomId] === game) delete tableGames[roomId]; }, 15000);
          }
        }, timeToExplode);
      } else if (game.type === 'roleta_russa' || game.type === 'roleta_consequencias') {
         setTimeout(() => {
           game.status = 'finished';
           const pKeys = Object.keys(game.players);
           game.loser = pKeys[Math.floor(Math.random() * pKeys.length)];
           if (game.type === 'roleta_consequencias') {
             const cons = ['Pagar a conta inteira!', 'Imitar um pinguim', 'Beber um copo de agua de uma vez', 'Pagar a proxima bebida', 'Ficar sem celular por 10 min'];
             game.prize = cons[Math.floor(Math.random() * cons.length)];
           }
           io.to('restaurante_' + socketTenantId).emit('game_lobby_updated', { mesa: data.mesa, game });
           setTimeout(() => { if(tableGames[roomId] === game) delete tableGames[roomId]; }, 15000);
         }, 3000);
      } else if (game.type === 'blackjack') {
         const suits = ['H', 'D', 'C', 'S'];
         const values = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
         let deck = [];
         suits.forEach(s => values.forEach(v => deck.push(v+s)));
         deck = deck.sort(() => Math.random() - 0.5);
         game.state.deck = deck;
         
         const pKeys = Object.keys(game.players);
         game.state.turnOrder = pKeys;
         game.state.turnIndex = 0;
         game.state.dealerCards = [deck.pop(), deck.pop()];
         
         pKeys.forEach(p => {
           game.players[p].state.cards = [deck.pop(), deck.pop()];
           game.players[p].state.status = 'playing'; // playing, stand, bust
         });
      }
      io.to('restaurante_' + socketTenantId).emit('game_lobby_updated', { mesa: data.mesa, game });
    }
  });

  socket.on('game_action', (data) => {
    const roomId = socketTenantId + '_' + data.mesa;
    const game = tableGames[roomId];
    if(!game || game.status !== 'playing') return;
    const cid = data.cliente_id || socket.id;
    if(!game.players[cid]) return;

    if (game.type === 'batata_quente') {
      if (game.state.currentHolder === cid) {
         const pKeys = Object.keys(game.players).filter(id => id !== cid);
         game.state.currentHolder = pKeys[Math.floor(Math.random() * pKeys.length)];
         io.to('restaurante_' + socketTenantId).emit('game_lobby_updated', { mesa: data.mesa, game });
      }
      return;
    }

    if (game.type === 'velha') {
      if (game.state.turn !== cid) return;
      if (game.state.board[data.choice] !== null) return;
      
      const pKeys = Object.keys(game.players);
      const isP1 = pKeys[0] === cid;
      game.state.board[data.choice] = isP1 ? 'X' : 'O';
      
      const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
      const b = game.state.board;
      let winner = null;
      for (let w of wins) {
         if (b[w[0]] && b[w[0]] === b[w[1]] && b[w[0]] === b[w[2]]) {
            winner = cid; break;
         }
      }
      
      if (winner) {
         game.status = 'finished'; game.winner = winner;
         setTimeout(() => { if(tableGames[roomId] === game) delete tableGames[roomId]; }, 15000);
      } else if (!b.includes(null)) {
         game.status = 'finished'; game.winner = 'draw';
         setTimeout(() => { if(tableGames[roomId] === game) delete tableGames[roomId]; }, 15000);
      } else {
         game.state.turn = isP1 ? pKeys[1] : pKeys[0];
      }
      io.to('restaurante_' + socketTenantId).emit('game_lobby_updated', { mesa: data.mesa, game });
      return;
    }
    
    if (game.type === 'blackjack') {
       if (game.state.turnOrder[game.state.turnIndex] !== cid) return;
       const pState = game.players[cid].state;
       
       if (data.choice === 'hit') {
         pState.cards.push(game.state.deck.pop());
         if (getHandValue(pState.cards) > 21) pState.status = 'bust';
       } else if (data.choice === 'stand') {
         pState.status = 'stand';
       }
       
       if (pState.status === 'bust' || pState.status === 'stand') {
         game.state.turnIndex++;
         
         if (game.state.turnIndex >= game.state.turnOrder.length) {
            // Dealer turn
            let dealerVal = getHandValue(game.state.dealerCards);
            while(dealerVal < 17) {
              game.state.dealerCards.push(game.state.deck.pop());
              dealerVal = getHandValue(game.state.dealerCards);
            }
            
            // Calc winners
            game.status = 'finished';
            const dealerBust = dealerVal > 21;
            
            const pKeys = Object.keys(game.players);
            let closest = -1; let bestPlayer = null;
            
            pKeys.forEach(p => {
               const val = getHandValue(game.players[p].state.cards);
               if (val <= 21) {
                  if (val > closest) { closest = val; bestPlayer = p; }
               }
            });
            
            if (bestPlayer && (dealerBust || closest > dealerVal)) game.winner = bestPlayer;
            else game.winner = 'dealer'; // no player beat dealer
            
            setTimeout(() => { if(tableGames[roomId] === game) delete tableGames[roomId]; }, 20000);
         }
       }
       io.to('restaurante_' + socketTenantId).emit('game_lobby_updated', { mesa: data.mesa, game });
       return;
    }

    // fallback for par_impar and reflexo
    game.players[cid].choice = data.choice;
    game.players[cid].actionTime = Date.now();
    const pKeys = Object.keys(game.players);
    const allPlayed = pKeys.every(k => game.players[k].choice !== null);
    if(allPlayed) {
      game.status = 'finished';
      if(game.type === 'par_impar') {
        const p1 = game.players[pKeys[0]]; const p2 = game.players[pKeys[1]];
        const isPar = ((p1.choice.fingers || 0) + (p2.choice.fingers || 0)) % 2 === 0;
        game.winner = (p1.choice.side === 'par' && isPar) || (p1.choice.side === 'impar' && !isPar) ? p1.id : p2.id;
      } else if (game.type === 'reflexo') {
        const p1 = game.players[pKeys[0]]; const p2 = game.players[pKeys[1]];
        game.winner = p1.actionTime < p2.actionTime ? p1.id : p2.id;
      }
      io.to('restaurante_' + socketTenantId).emit('game_lobby_updated', { mesa: data.mesa, game });
      setTimeout(() => {
        if(tableGames[roomId] === game) delete tableGames[roomId];
        io.to('restaurante_' + socketTenantId).emit('game_lobby_updated', { mesa: data.mesa, game: null });
      }, 15000);
    }
  });
  
  socket.on('game_cancel', (data) => {
    const roomId = socketTenantId + '_' + data.mesa;
    if(tableGames[roomId]) { delete tableGames[roomId]; io.to('restaurante_' + socketTenantId).emit('game_lobby_updated', { mesa: data.mesa, game: null }); }
  });

  socket.on('get_table_game', (data) => {
    const roomId = socketTenantId + '_' + data.mesa;
    socket.emit('game_lobby_updated', { mesa: data.mesa, game: tableGames[roomId] || null });
  });
};
