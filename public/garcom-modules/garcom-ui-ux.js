// --- ÁUDIO E VIBRAÇÃO ---
let audioCtx = null;

function initGarcomAudio() {
  try {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) {
    console.log("Audio init failed", e);
  }
}

// iOS/Safari só libera o áudio após um gesto do usuário — desbloquear no 1º toque
['click', 'touchstart', 'pointerdown', 'keydown'].forEach(evt => {
  window.addEventListener(evt, initGarcomAudio, { passive: true });
});

function playDing() {
  try {
    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200]);
    }

    const toneType = localStorage.getItem('sound-esteira-mobile') || (CONFIGS && CONFIGS['sound-esteira-mobile']) || 'pop';
    if (typeof window.playAudioTone === 'function') {
      window.playAudioTone(toneType);
      return;
    }

    initGarcomAudio();
    if (!audioCtx) return;

    createChime(880, 0);       // A5
    createChime(1108.73, 0.15); // C#6
  } catch (e) {
    console.log("Audio/Vibration not supported or blocked by browser.", e);
  }
}

function createChime(freq, delay) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  
  const now = audioCtx.currentTime + delay;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.5, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  
  osc.start(now);
  osc.stop(now + 1);
}

function playChamarGarcom() {
  try {
    if (navigator.vibrate) {
      navigator.vibrate([300, 150, 300, 150, 300]);
    }
    initGarcomAudio();
    if (!audioCtx) return;
    createChime(1046.5, 0);
    createChime(1318.5, 0.12);
    createChime(1568, 0.24);
    createChime(1318.5, 0.45);
    createChime(1046.5, 0.57);
  } catch (e) {
    console.log("Audio/Vibration not supported.", e);
  }
}

setInterval(() => {
  if (loggedUser && document.getElementById('view-esteira') && document.getElementById('view-esteira').classList.contains('active')) {
    socket.emit('get_esteira', loggedUser.nome);
  }
}, 30000);

// --- NAVEGAÇÃO POR GESTOS (SWIPE) ---
let touchStartX = 0;
let touchEndX = 0;
let touchStartY = 0;
let touchEndY = 0;

document.addEventListener('touchstart', e => {
  touchStartX = e.changedTouches[0].screenX;
  touchStartY = e.changedTouches[0].screenY;
}, { passive: true });

document.addEventListener('touchend', e => {
  touchEndX = e.changedTouches[0].screenX;
  touchEndY = e.changedTouches[0].screenY;
  handleSwipe();
}, { passive: true });

function handleSwipe() {
  const diffX = touchStartX - touchEndX;
  const diffY = touchStartY - touchEndY;
  
  // Ignora se for mais um scroll vertical do que um swipe horizontal
  if (Math.abs(diffY) > Math.abs(diffX)) return;
  // Limiar mínimo de swipe (50px)
  if (Math.abs(diffX) < 50) return;
  
  const activeView = document.querySelector('.view.active');
  if (!activeView) return;
  
  const currentViewId = activeView.id;
  
  // Navegação horizontal por swipe entre Atalhos (esquerda), Mesas (centro) e Esteira (direita)
  if (currentViewId === 'view-tables') {
    if (diffX > 0) {
      // Arrasto para a Esquerda -> Abre a Esteira
      showView('esteira', 'Prontos para Entrega');
    } else if (diffX < 0) {
      // Arrasto para a Direita -> Abre os Atalhos Rápidos
      showView('atalhos', 'Atalhos Rápidos');
    }
  } else if (currentViewId === 'view-atalhos' && diffX > 0) {
    // Arrasto para a Esquerda -> Volta para as Mesas
    showView('tables', 'Comanda Mobile');
  } else if (currentViewId === 'view-esteira' && diffX < 0) {
    // Arrasto para a Direita -> Volta para as Mesas
    showView('tables', 'Comanda Mobile');
  } else if (currentViewId === 'view-menu') {
    // Navegação pelas abas de categorias do Cardápio
    const currentIndex = TABS.indexOf(currentTab);
    if (currentIndex === -1) return;
    
    if (diffX > 0 && currentIndex < TABS.length - 1) {
      // Swipe Esquerda -> Próxima categoria
      window.selectTab(TABS[currentIndex + 1]);
    } else if (diffX < 0 && currentIndex > 0) {
      // Swipe Direita -> Categoria anterior
      window.selectTab(TABS[currentIndex - 1]);
    }
  }
}


