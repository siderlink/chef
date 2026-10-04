// --- IA Notification Queue (prevents overlap & stacking) ---
window._iaNotifQueue = [];
window._iaNotifActive = false;

function processIaNotifQueue() {
  if (window._iaNotifActive || window._iaNotifQueue.length === 0) return;
  window._iaNotifActive = true;
  var item = window._iaNotifQueue.shift();
  item.createFn();
  setTimeout(function() {
    window._iaNotifActive = false;
    processIaNotifQueue();
  }, item.duration);
}

function queueIaNotif(createFn, duration) {
  window._iaNotifQueue.push({ createFn: createFn, duration: duration || 8000 });
  processIaNotifQueue();
}

function createIaOverlay(msg, bg, buttonsHtml, duration) {
  var wrapper = document.createElement("div");
  wrapper.className = "ia-notificacao";
  wrapper.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;display:flex;align-items:flex-start;justify-content:center;padding-top:60px;pointer-events:auto;zoom:1;-webkit-zoom:1;";
  wrapper.innerHTML = '<div style="background:' + bg + ';color:white;padding:14px 20px;border-radius:12px;max-width:90%;width:360px;box-shadow:0 4px 16px rgba(0,0,0,0.3);animation:slideToast 0.3s ease-out;pointer-events:auto;zoom:1;-webkit-zoom:1;">' + msg + (buttonsHtml ? '<div style="display:flex;gap:8px;margin-top:10px;">' + buttonsHtml + '</div>' : '') + '</div>';
  document.body.appendChild(wrapper);
  var removeFn = function() { if (wrapper.parentElement) wrapper.remove(); };
  wrapper.addEventListener("click", function(e) { if (e.target === wrapper) removeFn(); });
  setTimeout(removeFn, duration);
  return wrapper;
}

// --- IA: Sugestao de refill de bebida ---
socket.on("ia_sugestao_garcom", (data) => {
  var tipo = data.tipo, mesa = data.mesa, produto = data.produto, minutos = data.minutos, mensagem = data.mensagem;
  if (tipo === "refill_bebida") {
    showToast(mensagem, "#3b82f6");
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("🍺 Refill sugerido", { body: mensagem, icon: "/favicon.ico" });
    }
    queueIaNotif(function() {
      createIaOverlay(
        '<div style="font-weight:700;font-size:14px;margin-bottom:6px;">🍺 Oferecer nova bebida?</div>' +
        '<div style="font-size:13px;">' + escHtml(mensagem) + '</div>',
        "#3b82f6",
        '<button data-action="refill-sim" data-mesa="' + escHtml(mesa) + '" data-produto="' + escHtml(produto) + '" style="flex:1;padding:10px;background:#22c55e;color:white;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:14px;">Sim, vou oferecer</button>' +
        '<button data-action="dismiss" style="flex:1;padding:10px;background:#64748b;color:white;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:14px;">Agora não</button>',
        30000
      );
    });
  }
});

socket.on("ia_sugestao_garcom_aceita", (data) => {
  showToast(data.mensagem, "#22c55e");
});

// --- IA: Manobra - Solicitacao de entrada cortesia ---
socket.on("ia_manobra_aceita", (data) => {
  var pedidoId = data.pedidoId, mesa = data.mesa, produto = data.produto, minutos = data.minutos, mensagem = data.mensagem;
  showToast(mensagem, "#ff6b35");
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("🔥 Manobra - Entrada cortesia", { body: mensagem, icon: "/favicon.ico", requireInteraction: true });
  }
  queueIaNotif(function() {
    createIaOverlay(
      '<div style="font-weight:700;font-size:14px;margin-bottom:6px;">🔥 Oferecer entrada cortesia</div>' +
      '<div style="font-size:13px;">' + escHtml(mensagem) + '</div>',
      "#ff6b35",
      '<button data-action="manobra-sim" data-pedido-id="' + escHtml(pedidoId) + '" data-mesa="' + escHtml(mesa) + '" data-produto="' + escHtml(produto) + '" style="flex:1;padding:10px;background:#22c55e;color:white;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:14px;">Vou oferecer entrada</button>' +
      '<button data-action="manobra-nao" data-pedido-id="' + escHtml(pedidoId) + '" data-mesa="' + escHtml(mesa) + '" data-produto="' + escHtml(produto) + '" style="flex:1;padding:10px;background:#64748b;color:white;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:14px;">Cliente recusou</button>',
      30000
    );
  });
});

socket.on("ia_manobra_executada", (data) => {
  showToast(data.mensagem, "#22c55e");
});

// --- IA & Hub Marketing: Sentinela VIP no Salão ---
socket.on("alerta_vip_chegou", (data) => {
  var mesa = data.mesa || "Mesa", nome = data.nome || "Cliente VIP", totalGasto = Number(data.total_gasto) || 0, obs = data.observacao || "";
  var msg = "👑 VIP na Mesa " + mesa + ": " + nome + " (Gasto: R$ " + totalGasto.toFixed(2) + ")";
  showToast(msg, "#f59e0b");
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("👑 Cliente VIP na Mesa " + mesa, { body: msg, icon: "/favicon.ico" });
  }
  if (typeof queueIaNotif === "function" && typeof createIaOverlay === "function") {
    queueIaNotif(function() {
      createIaOverlay(
        '<div style="font-weight:800;font-size:15px;margin-bottom:6px;color:#fbbf24;">👑 CLIENTE VIP DETECTADO!</div>' +
        '<div style="font-size:13px;margin-bottom:4px;"><strong>Mesa ' + escHtml(mesa) + ':</strong> ' + escHtml(nome) + '</div>' +
        '<div style="font-size:12px;color:#94a3b8;">Consumo Acumulado: <span style="color:#22c55e;font-weight:700;">R$ ' + totalGasto.toFixed(2) + '</span></div>' +
        (obs ? '<div style="font-size:12px;margin-top:4px;color:#cbd5e1;">💡 Preferência: <em>' + escHtml(obs) + '</em></div>' : ''),
        "#d97706",
        '<button data-action="dismiss" style="flex:1;padding:10px;background:#22c55e;color:white;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:14px;">Entendido, atendimento VIP</button>',
        25000
      );
    });
  }
});

// --- IA: Event delegation for popup buttons (fixes zoom/touch issues) ---
document.addEventListener("click", function(e) {
  var btn = e.target.closest("[data-action]");
  if (!btn) return;
  var action = btn.getAttribute("data-action");
  var wrapper = btn.closest(".ia-notificacao");

  if (action === "refill-sim") {
    window.socket.emit("ia_resposta_sugestao", {
      tipo: "refill_bebida",
      mesa: btn.getAttribute("data-mesa"),
      produto: btn.getAttribute("data-produto"),
      resposta: "sim"
    });
    if (wrapper) wrapper.remove();
  } else if (action === "manobra-sim") {
    window.socket.emit("ia_manobra_executar", {
      pedidoId: parseInt(btn.getAttribute("data-pedido-id")),
      mesa: btn.getAttribute("data-mesa"),
      produto: btn.getAttribute("data-produto"),
      resposta: "sim"
    });
    if (wrapper) wrapper.remove();
  } else if (action === "manobra-nao") {
    window.socket.emit("ia_manobra_executar", {
      pedidoId: parseInt(btn.getAttribute("data-pedido-id")),
      mesa: btn.getAttribute("data-mesa"),
      produto: btn.getAttribute("data-produto"),
      resposta: "nao"
    });
    if (wrapper) wrapper.remove();
  } else if (action === "dismiss") {
    var dismissData = {
      tipo: btn.getAttribute("data-action"),
      mesa: btn.getAttribute("data-mesa") || "",
      produto: btn.getAttribute("data-produto") || "",
      pedidoId: btn.getAttribute("data-pedido-id") || "",
      texto: "",
      criadoEm: Date.now()
    };
    var notifText = wrapper ? wrapper.textContent.trim() : "";
    dismissData.texto = notifText.substring(0, 120);
    try {
      var chave = "chef_pendentes_" + (loggedUser ? loggedUser.nome : "local");
      var lista = JSON.parse(localStorage.getItem(chave) || "[]");
      if (!Array.isArray(lista)) lista = [];
      lista.unshift(dismissData);
      if (lista.length > 20) lista = lista.slice(0, 20);
      localStorage.setItem(chave, JSON.stringify(lista));
    } catch(e) {}
    if (wrapper) wrapper.remove();
  }
});
// Auto Login (via token de sessão — nunca pela senha)
window.addEventListener('DOMContentLoaded', () => {
  localStorage.removeItem('chef_credentials');
  const savedSession = localStorage.getItem('chef_session');
  if (savedSession) {
    try {
      const sess = JSON.parse(savedSession);
      if (sess.token) {
        socket.emit('login_funcionario_token', sess.token);
        return;
      }
    } catch(e){}
  }
  
  // Se não tem sessão salva, vai pro painel do funcionário (novo portal de entrada)
  window.location.href = '/painel-funcionario.html';
});
