/**
 * ══════════════════════════════════════════════════════════════════════════════
 * CHEF COZINHA 3D ULTRA ENGINE (Three.js High-Performance Experience)
 * Otimizado exclusivamente para dispositivos com 6GB RAM ou mais (6GB+ Pro Tier)
 *
 * Recursos:
 * 1. Aura Gastronômica 3D: Fundo ambiente fluido e reativo às categorias
 * 2. Prato 3D Interativo no Modal: Modelos gastronômicos PBR procedurais com
 *    rotação 360°, fumaça/vapor volumétrico, controle de luz e toque/mouse
 * 3. Partículas de Adição ao Carrinho: Vórtice 3D com arco parabólico até o carrinho
 * 4. Tilt 3D Holográfico nos Cards com reflexo especular dinâmico
 * 5. Gerenciamento estrito de memória e bateria (auto-pause em background e 60/120fps)
 * ══════════════════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  // Configuração e Estado Global do Motor 3D
  const ChefCardapio3D = {
    version: '2.5.0-ultra-6gb',
    isSupported: false,
    isEnabled: false,
    threeLoaded: false,
    deviceMemory: navigator.deviceMemory || 8,
    hardwareConcurrency: navigator.hardwareConcurrency || 4,

    // Módulos
    ambient: null,
    dishStage: null,
    flyEffect: null,

    // Categoria ativa para coloração ambiental
    activeCategory: 'Todos',
    activeAmbiance: 'gourmet',

    /**
     * Verificação de Hardware (>= 6GB RAM) e GPU
     */
    detectCapability: function () {
      // 1. Preferência salva pelo usuário
      const saved = localStorage.getItem('chef_3d_mode');
      if (saved === 'false') return false;
      if (saved === 'true') return true;

      // 2. Não ativar se usuário ativou economia de movimento
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return false;
      }

      // 3. Critério de 6GB RAM ou mais
      const mem = navigator.deviceMemory || 8;
      const cores = navigator.hardwareConcurrency || 4;

      // Suporte WebGL 1/2 obrigatório
      const hasWebGL = (function () {
        try {
          const canvas = document.createElement('canvas');
          return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
        } catch (e) {
          return false;
        }
      })();

      if (!hasWebGL) return false;

      // Se navigator.deviceMemory estiver disponível e for >= 6GB
      if (mem >= 6) return true;

      // Dispositivos onde deviceMemory reporta 4GB por privacidade do navegador (ex: Firefox/Safari),
      // mas possuem 8 ou mais núcleos de CPU e tela de alta densidade (flagships)
      if (mem >= 4 && cores >= 8 && window.devicePixelRatio >= 2) return true;

      return false;
    },

    /**
     * Inicialização Principal
     */
    init: function () {
      this.isSupported = this.detectCapability();
      console.log(`[ChefCardapio3D] Dispositivo detectado: ${this.deviceMemory}GB RAM, ${this.hardwareConcurrency} Cores. Elegível para 3D: ${this.isSupported}`);

      this.injectUiControls();

      if (this.isSupported) {
        this.enable();
      }
    },

    /**
     * Carrega Three.js dinamicamente sem onerar dispositivos básicos
     */
    loadThree: function (callback) {
      if (typeof THREE !== 'undefined') {
        this.threeLoaded = true;
        callback();
        return;
      }

      const script = document.createElement('script');
      script.src = '/vendor/three/three.min.js';
      script.async = true;

      script.onload = () => {
        this.threeLoaded = true;
        console.log('[ChefCardapio3D] Three.js r128 carregado localmente com sucesso!');
        callback();
      };

      script.onerror = () => {
        console.warn('[ChefCardapio3D] Falha ao carregar Three.js local, tentando CDN...');
        const cdnScript = document.createElement('script');
        cdnScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
        cdnScript.async = true;
        cdnScript.onload = () => {
          this.threeLoaded = true;
          callback();
        };
        cdnScript.onerror = () => {
          console.error('[ChefCardapio3D] Não foi possível carregar Three.js.');
        };
        document.head.appendChild(cdnScript);
      };

      document.head.appendChild(script);
    },

    /**
     * Ativa a Experiência 3D Completa
     */
    enable: function () {
      this.isEnabled = true;
      localStorage.setItem('chef_3d_mode', 'true');
      this.updateUiBadge();

      this.loadThree(() => {
        this.initAmbientAura();
        this.initDishStage();
        this.initFlyToCart();
        this.initCard3DTilt();
      });
    },

    /**
     * Desativa a Experiência 3D
     */
    disable: function () {
      this.isEnabled = false;
      localStorage.setItem('chef_3d_mode', 'false');
      this.updateUiBadge();

      if (this.ambient) this.ambient.destroy();
      if (this.dishStage) this.dishStage.destroy();
      const ambCanvas = document.getElementById('cardapio-ambient-canvas');
      if (ambCanvas) ambCanvas.style.opacity = '0';
    },

    toggleManual: function () {
      if (this.isEnabled) {
        this.disable();
        if (typeof showToast === 'function') showToast('Modo 3D desativado (Modo Leve)', 'info');
      } else {
        this.enable();
        if (typeof showToast === 'function') showToast('✨ Experiência 3D Ultra Ativada!', 'success');
      }
    },

    /**
     * Injeta Botão de Status 3D no Header
     */
    injectUiControls: function () {
      const headerRight = document.querySelector('.header-right') || document.querySelector('.header-info');
      if (!headerRight || document.getElementById('btn-toggle-3d-mode')) return;

      const btn = document.createElement('button');
      btn.id = 'btn-toggle-3d-mode';
      btn.type = 'button';
      btn.title = 'Alternar Experiência 3D Ultra (Otimizado para 6GB+ RAM)';
      btn.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: linear-gradient(135deg, rgba(252,75,21,0.12), rgba(245,158,11,0.16));
        border: 1px solid rgba(252,75,21,0.3);
        color: var(--primary, #fc4b15);
        font-size: 11px;
        font-weight: 800;
        padding: 5px 11px;
        border-radius: 20px;
        cursor: pointer;
        transition: all 0.25s ease;
        box-shadow: 0 2px 8px rgba(0,0,0,0.04);
        margin-left: 6px;
      `;
      btn.onclick = () => this.toggleManual();
      headerRight.appendChild(btn);
      this.updateUiBadge();
    },

    updateUiBadge: function () {
      const btn = document.getElementById('btn-toggle-3d-mode');
      if (!btn) return;
      if (this.isEnabled) {
        btn.innerHTML = `
          <span style="width:7px; height:7px; border-radius:50%; background:#10b981; box-shadow:0 0 8px #10b981; display:inline-block; animation:pulse3d 2s infinite;"></span>
          <span>✨ 3D Pro</span>
        `;
        btn.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        btn.style.color = '#10b981';
      } else {
        btn.innerHTML = `
          <span style="width:7px; height:7px; border-radius:50%; background:#94a3b8; display:inline-block;"></span>
          <span style="color:var(--text-muted, #64748b);">3D Off</span>
        `;
        btn.style.borderColor = 'var(--border, #e2e8f0)';
        btn.style.color = 'var(--text-muted, #64748b)';
      }
    },

    /**
     * ─── 1. AURA GASTRONÔMICA 3D (Fundo Ambiente Fluido) ───
     */
    initAmbientAura: function () {
      let canvas = document.getElementById('cardapio-ambient-canvas');
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'cardapio-ambient-canvas';
        canvas.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          pointer-events: none;
          z-index: 0;
          opacity: 0;
          transition: opacity 1.5s cubic-bezier(0.16, 1, 0.3, 1);
        `;
        document.body.prepend(canvas);
      }

      const self = this;
      const width = window.innerWidth;
      const height = window.innerHeight;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(65, width / height, 1, 1000);
      camera.position.z = 320;

      const renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance'
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      // Gerar textura de ponto circular suave via Canvas 2D procedural
      const pCanvas = document.createElement('canvas');
      pCanvas.width = 64;
      pCanvas.height = 64;
      const pCtx = pCanvas.getContext('2d');
      const grad = pCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
      grad.addColorStop(0.3, 'rgba(255, 220, 180, 0.85)');
      grad.addColorStop(0.7, 'rgba(252, 75, 21, 0.35)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      pCtx.fillStyle = grad;
      pCtx.fillRect(0, 0, 64, 64);
      const particleTexture = new THREE.CanvasTexture(pCanvas);

      // Partículas em nuvem fluida
      const count = 650;
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(count * 3);
      const scales = new Float32Array(count);
      const velocities = new Float32Array(count * 3);

      for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 550;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 450;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 200;

        scales[i] = Math.random() * 14 + 6;

        velocities[i * 3] = (Math.random() - 0.5) * 0.2;
        velocities[i * 3 + 1] = Math.random() * 0.4 + 0.15; // Flutua suavemente para cima
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.15;
      }

      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const material = new THREE.PointsMaterial({
        size: 16,
        map: particleTexture,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        color: new THREE.Color(0xfc4b15)
      });

      const particleSystem = new THREE.Points(geometry, material);
      scene.add(particleSystem);

      // Controle de Mouse/Touch para Parallax suave
      let mouseX = 0;
      let mouseY = 0;
      const onPointerMove = (e) => {
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        mouseX = (clientX / window.innerWidth - 0.5) * 40;
        mouseY = (clientY / window.innerHeight - 0.5) * 40;
      };
      window.addEventListener('mousemove', onPointerMove, { passive: true });
      window.addEventListener('touchmove', onPointerMove, { passive: true });

      // Animação e Render Loop
      let animId = null;
      let isVisible = true;
      let clock = new THREE.Clock();

      document.addEventListener('visibilitychange', () => {
        isVisible = !document.hidden;
      });

      function animate() {
        animId = requestAnimationFrame(animate);
        if (!isVisible || !self.isEnabled) return;

        const time = clock.getElapsedTime();
        const pos = geometry.attributes.position.array;

        for (let i = 0; i < count; i++) {
          pos[i * 3 + 1] += velocities[i * 3 + 1];
          pos[i * 3] += Math.sin(time * 0.6 + i) * 0.15;

          // Reposiciona na base se passar do topo
          if (pos[i * 3 + 1] > 230) {
            pos[i * 3 + 1] = -230;
            pos[i * 3] = (Math.random() - 0.5) * 550;
          }
        }
        geometry.attributes.position.needsUpdate = true;

        // Efeito de Parallax da Câmera
        camera.position.x += (mouseX - camera.position.x) * 0.04;
        camera.position.y += (-mouseY - camera.position.y) * 0.04;
        camera.lookAt(scene.position);

        renderer.render(scene, camera);
      }

      animate();
      canvas.style.opacity = '1';

      // Resize
      const onResize = () => {
        if (!renderer) return;
        const w = window.innerWidth;
        const h = window.innerHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener('resize', onResize);

      this.ambient = {
        scene,
        camera,
        renderer,
        material,
        destroy: () => {
          cancelAnimationFrame(animId);
          window.removeEventListener('resize', onResize);
          window.removeEventListener('mousemove', onPointerMove);
          window.removeEventListener('touchmove', onPointerMove);
          geometry.dispose();
          material.dispose();
          particleTexture.dispose();
          renderer.dispose();
        },
        updateCategoryColor: (cat) => {
          let targetHex = 0xfc4b15; // Laranja Gourmet Padrão
          const c = (cat || '').toLowerCase();
          if (c.includes('cerveja') || c.includes('chopp')) targetHex = 0xf59e0b; // Dourado malte
          else if (c.includes('bebida') || c.includes('drink')) targetHex = 0x06b6d4; // Ciano refrescante
          else if (c.includes('peixe') || c.includes('marisco') || c.includes('camar')) targetHex = 0x0ea5e9; // Azul marinho fresco
          else if (c.includes('sobremesa')) targetHex = 0xf43f5e; // Framboesa doce
          else if (c.includes('chapa') || c.includes('prato') || c.includes('carne')) targetHex = 0xea580c; // Terracota brasa

          material.color.setHex(targetHex);
        }
      };
    },

    /**
     * ─── 2. PALCO 3D INTERATIVO DO PRATO (Item Modal) ───
     */
    initDishStage: function () {
      // Injeta o container do palco 3D no modal de detalhes
      const modalContent = document.querySelector('#modal-item-details .modal-content');
      if (!modalContent || document.getElementById('modal-3d-stage')) return;

      const stageHtml = `
        <div id="modal-3d-stage" class="modal-3d-stage" style="display:none; position:relative; width:100%; height:210px; border-radius:18px; margin:10px 0 12px 0; overflow:hidden; background:radial-gradient(circle at 50% 50%, rgba(252,75,21,0.08) 0%, rgba(15,23,42,0.03) 80%); border:1.5px solid rgba(252,75,21,0.2); box-shadow:inset 0 2px 14px rgba(0,0,0,0.06);">
          <canvas id="dish-3d-canvas" style="width:100%; height:100%; display:block; outline:none; cursor:grab;"></canvas>
          
          <!-- Badges & Dicas de Interação -->
          <div style="position:absolute; top:8px; right:8px; display:flex; gap:6px; align-items:center; z-index:2;">
            <span style="background:linear-gradient(135deg, #fc4b15, #f59e0b); color:#fff; font-size:10px; font-weight:800; padding:3px 8px; border-radius:8px; box-shadow:0 2px 6px rgba(252,75,21,0.3); display:inline-flex; align-items:center; gap:3px;">
              <i class="ph-fill ph-sparkle"></i> 3D Ultra
            </span>
          </div>

          <div style="position:absolute; bottom:8px; left:8px; right:8px; display:flex; justify-content:space-between; align-items:center; z-index:2; pointer-events:none;">
            <span style="background:rgba(15,23,42,0.72); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); color:#fff; font-size:10.5px; font-weight:600; padding:3px 10px; border-radius:20px; display:inline-flex; align-items:center; gap:5px;">
              <i class="ph-bold ph-hand-pointing" style="color:#f59e0b;"></i> Toque e gire o prato
            </span>
            <button type="button" id="btn-toggle-steam-3d" onclick="window.ChefCardapio3D.toggleSteam()" style="pointer-events:auto; background:rgba(15,23,42,0.72); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,0.2); color:#fff; font-size:10px; font-weight:700; padding:4px 9px; border-radius:12px; cursor:pointer; display:inline-flex; align-items:center; gap:4px; transition:all 0.2s ease;">
              <i class="ph-bold ph-wind"></i> <span id="label-steam-status">Vapor On</span>
            </button>
          </div>
        </div>
      `;

      // Insere logo abaixo do emoji e título
      const titleWrapper = document.getElementById('modal-item-description');
      if (titleWrapper) {
        titleWrapper.insertAdjacentHTML('afterend', stageHtml);
      } else {
        const modalHeader = modalContent.querySelector('div[style*="display: flex"]');
        if (modalHeader) modalHeader.insertAdjacentHTML('afterend', stageHtml);
      }

      this.dishStage = new DishRenderer();
    },

    /**
     * Atualiza o prato 3D quando o usuário clica em um item
     */
    showDish3D: function (item) {
      if (!this.isEnabled || !this.dishStage) return;
      const stage = document.getElementById('modal-3d-stage');
      if (stage) stage.style.display = 'block';

      this.dishStage.loadItem(item);
    },

    hideDish3D: function () {
      const stage = document.getElementById('modal-3d-stage');
      if (stage) stage.style.display = 'none';
      if (this.dishStage) this.dishStage.pause();
    },

    toggleSteam: function () {
      if (this.dishStage) this.dishStage.toggleSteam();
    },

    /**
     * ─── 3. PARTÍCULAS DE ADIÇÃO AO CARRINHO (Fly-to-Cart 3D) ───
     */
    initFlyToCart: function () {
      this.flyEffect = new FlyToCartManager();
    },

    triggerAddToCartFly: function (startEl) {
      if (!this.isEnabled || !this.flyEffect) return;
      const cartFab = document.getElementById('fab-cart');
      if (!cartFab) return;
      this.flyEffect.spawn(startEl || document.querySelector('.btn-submit'), cartFab);
    },

    /**
     * ─── 4. PARALLAX & TILT 3D NOS CARDS DO CARDÁPIO ───
     */
    initCard3DTilt: function () {
      if (window.matchMedia('(hover: none)').matches) return; // Apenas desktop/trackpad

      document.addEventListener('mousemove', (e) => {
        if (!this.isEnabled) return;
        const card = e.target.closest('.menu-card');
        if (!card) return;

        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const rotateX = ((y - centerY) / centerY) * -7;
        const rotateY = ((x - centerX) / centerX) * 7;

        card.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-3px) scale(1.015)`;
        card.style.boxShadow = `0 12px 28px rgba(0, 0, 0, 0.12), 0 4px 10px rgba(252, 75, 21, 0.08)`;
      });

      document.addEventListener('mouseout', (e) => {
        const card = e.target.closest('.menu-card');
        if (card && (!e.relatedTarget || !card.contains(e.relatedTarget))) {
          card.style.transform = '';
          card.style.boxShadow = '';
        }
      });
    }
  };

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * CLASSE: DishRenderer (Palco 3D Procedural de Pratos Gourmet)
   * ══════════════════════════════════════════════════════════════════════════
   */
  function DishRenderer() {
    this.canvas = document.getElementById('dish-3d-canvas');
    if (!this.canvas) return;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, this.canvas.clientWidth / this.canvas.clientHeight, 0.1, 100);
    this.camera.position.set(0, 3.2, 5.2);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Iluminação de Estúdio de Gastronomia
    this.setupLighting();

    // Grupo Giratório Principal (Turntable)
    this.dishGroup = new THREE.Group();
    this.scene.add(this.dishGroup);

    // Vapor / Fumaça Culinária
    this.steamEnabled = true;
    this.steamParticles = [];
    this.initSteamSystem();

    // Controles de Toque / Arrastar
    this.isDragging = false;
    this.prevMouseX = 0;
    this.prevMouseY = 0;
    this.autoRotate = true;
    this.rotVelocityX = 0;
    this.rotVelocityY = 0;
    this.setupInteraction();

    // Render loop
    this.active = false;
    this.animId = null;
    this.clock = new THREE.Clock();
  }

  DishRenderer.prototype.setupLighting = function () {
    // Luz ambiente suave
    const amb = new THREE.AmbientLight(0xfff7ed, 0.9);
    this.scene.add(amb);

    // Key Light (Luz quente principal com sombras suaves)
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(4, 7, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    this.scene.add(keyLight);

    // Rim Light (Fresnel dourado gastronômico por trás)
    const rimLight = new THREE.DirectionalLight(0xf59e0b, 1.1);
    rimLight.position.set(-4, 3, -4);
    this.scene.add(rimLight);

    // Fill Light azulada suave para contraste
    const fillLight = new THREE.PointLight(0x38bdf8, 0.6, 10);
    fillLight.position.set(0, -1, 3);
    this.scene.add(fillLight);
  };

  DishRenderer.prototype.setupInteraction = function () {
    const el = this.canvas;
    const self = this;

    const onStart = (clientX, clientY) => {
      self.isDragging = true;
      self.autoRotate = false;
      self.prevMouseX = clientX;
      self.prevMouseY = clientY;
      el.style.cursor = 'grabbing';
    };

    const onMove = (clientX, clientY) => {
      if (!self.isDragging) return;
      const dx = clientX - self.prevMouseX;
      const dy = clientY - self.prevMouseY;

      self.dishGroup.rotation.y += dx * 0.009;
      self.dishGroup.rotation.x = Math.max(-0.25, Math.min(0.5, self.dishGroup.rotation.x + dy * 0.007));

      self.rotVelocityX = dx * 0.004;
      self.prevMouseX = clientX;
      self.prevMouseY = clientY;
    };

    const onEnd = () => {
      self.isDragging = false;
      el.style.cursor = 'grab';
    };

    el.addEventListener('mousedown', (e) => onStart(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', onEnd);

    el.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) onStart(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) onMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    window.addEventListener('touchend', onEnd);
  };

  DishRenderer.prototype.initSteamSystem = function () {
    const sCanvas = document.createElement('canvas');
    sCanvas.width = 32;
    sCanvas.height = 32;
    const ctx = sCanvas.getContext('2d');
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
    grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.15)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    const steamTex = new THREE.CanvasTexture(sCanvas);

    const count = 35;
    const geom = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    this.steamData = [];

    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 1.2;
      pos[i * 3 + 1] = 0.4 + Math.random() * 1.8;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 1.2;

      this.steamData.push({
        origY: pos[i * 3 + 1],
        speedY: 0.012 + Math.random() * 0.015,
        wobble: Math.random() * Math.PI * 2
      });
    }

    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.55,
      map: steamTex,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.steamMesh = new THREE.Points(geom, mat);
    this.dishGroup.add(this.steamMesh);
  };

  DishRenderer.prototype.toggleSteam = function () {
    this.steamEnabled = !this.steamEnabled;
    if (this.steamMesh) this.steamMesh.visible = this.steamEnabled;
    const lbl = document.getElementById('label-steam-status');
    if (lbl) lbl.innerText = this.steamEnabled ? 'Vapor On' : 'Vapor Off';
  };

  /**
   * Constrói o modelo 3D correspondente ao produto selecionado
   */
  DishRenderer.prototype.loadItem = function (item) {
    // Limpa malhas anteriores do prato
    while (this.dishGroup.children.length > 0) {
      const obj = this.dishGroup.children[0];
      this.dishGroup.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    }

    // Reinicia vapor
    this.initSteamSystem();

    const nome = (item.nome || '').toLowerCase();
    const cat = (item.categoria || '').toLowerCase();

    // 1. Frutos do Mar / Camarão / Peixes
    if (nome.includes('camar') || cat.includes('camar') || nome.includes('peixe') || nome.includes('ostra') || nome.includes('marisco') || nome.includes('siri')) {
      this.buildSeafoodPlate(item);
    }
    // 2. Cervejas / Chopp / Bebidas em Copo/Garrafa
    else if (cat.includes('cerveja') || cat.includes('bebida') || nome.includes('chopp') || nome.includes('heineken') || nome.includes('stella') || nome.includes('spaten') || nome.includes('refrigerante') || nome.includes('coca')) {
      this.buildDrinkModel(item);
    }
    // 3. Drinks / Caipirinhas / Doses
    else if (cat.includes('caipirinha') || cat.includes('drink') || cat.includes('dose') || nome.includes('caipir')) {
      this.buildCocktailModel(item);
    }
    // 4. Sobremesas / Pudim
    else if (cat.includes('sobremesa') || nome.includes('pudim') || nome.includes('doce')) {
      this.buildDessertModel(item);
    }
    // 5. Carnes / Pratos Quentes / Filé
    else if (nome.includes('filé') || nome.includes('file') || nome.includes('picanha') || nome.includes('frango') || cat.includes('prato') || cat.includes('chapa')) {
      this.buildMeatSkillet(item);
    }
    // 6. Porções e Petiscos / Fritas / Pastéis
    else {
      this.buildSnackBasket(item);
    }

    this.dishGroup.rotation.set(0.18, 0, 0);
    this.start();
  };

  /**
   * Construtor 3D: Prato de Frutos do Mar com Camarões e Limão
   */
  DishRenderer.prototype.buildSeafoodPlate = function () {
    // 1. Prato de Cerâmica Escura Vulcânica Gourmet
    const plateGeom = new THREE.CylinderGeometry(2.1, 1.6, 0.22, 48);
    const plateMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.35,
      metalness: 0.15
    });
    const plate = new THREE.Mesh(plateGeom, plateMat);
    plate.position.y = -0.11;
    plate.receiveShadow = true;
    this.dishGroup.add(plate);

    // 2. Base de Cama Culinária (Pirão / Salada nobre)
    const baseGeom = new THREE.CylinderGeometry(1.65, 1.7, 0.12, 32);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.8
    });
    const base = new THREE.Mesh(baseGeom, baseMat);
    base.position.y = 0.05;
    this.dishGroup.add(base);

    // 3. Camarões Suculentos em Curva (Torus Geometries com material coral brilhante)
    const shrimpMat = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      roughness: 0.25,
      metalness: 0.1
    });

    const shrimpAngles = [0, 1.25, 2.5, 3.75, 5.0];
    shrimpAngles.forEach((ang) => {
      const sGeom = new THREE.TorusGeometry(0.42, 0.15, 14, 28, Math.PI * 1.35);
      const shrimp = new THREE.Mesh(sGeom, shrimpMat);
      shrimp.rotation.x = Math.PI / 2.1;
      shrimp.rotation.z = ang;
      shrimp.position.set(Math.cos(ang) * 0.85, 0.22, Math.sin(ang) * 0.85);
      shrimp.castShadow = true;
      this.dishGroup.add(shrimp);
    });

    // 4. Rodelas / Fatias de Limão Siciliano
    const lemonGeom = new THREE.CylinderGeometry(0.35, 0.35, 0.06, 18);
    const lemonMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.4
    });
    const lemon = new THREE.Mesh(lemonGeom, lemonMat);
    lemon.position.set(0, 0.22, 0);
    lemon.rotation.x = 0.2;
    this.dishGroup.add(lemon);

    // 5. Ervas Finas Frescas (Salpicos verdes)
    const herbGeom = new THREE.DodecahedronGeometry(0.06);
    const herbMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.9 });
    for (let i = 0; i < 14; i++) {
      const herb = new THREE.Mesh(herbGeom, herbMat);
      herb.position.set((Math.random() - 0.5) * 1.4, 0.22, (Math.random() - 0.5) * 1.4);
      this.dishGroup.add(herb);
    }
  };

  /**
   * Construtor 3D: Caneco / Taça de Cerveja & Chopp com Espuma
   */
  DishRenderer.prototype.buildDrinkModel = function () {
    // 1. Caneca de Vidro Transparente com Efeito de Refração
    const glassGeom = new THREE.CylinderGeometry(0.95, 0.85, 2.3, 32, 1, true);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.38,
      roughness: 0.1,
      metalness: 0.05,
      transmission: 0.9,
      ior: 1.5
    });
    const glass = new THREE.Mesh(glassGeom, glassMat);
    glass.position.y = 1.15;
    this.dishGroup.add(glass);

    // 2. Fundo Grosso do Caneco
    const bottomGeom = new THREE.CylinderGeometry(0.85, 0.88, 0.2, 32);
    const bottom = new THREE.Mesh(bottomGeom, glassMat);
    bottom.position.y = 0.1;
    this.dishGroup.add(bottom);

    // 3. Líquido Dourado Puro Malte
    const beerGeom = new THREE.CylinderGeometry(0.9, 0.82, 1.9, 32);
    const beerMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.15,
      metalness: 0.2
    });
    const beer = new THREE.Mesh(beerGeom, beerMat);
    beer.position.y = 1.05;
    this.dishGroup.add(beer);

    // 4. Colarinho de Espuma Cremosa
    const foamGeom = new THREE.CylinderGeometry(0.97, 0.92, 0.42, 32);
    const foamMat = new THREE.MeshStandardMaterial({
      color: 0xfffbeb,
      roughness: 0.85
    });
    const foam = new THREE.Mesh(foamGeom, foamMat);
    foam.position.y = 2.18;
    this.dishGroup.add(foam);

    // 5. Alça do Caneco
    const handleGeom = new THREE.TorusGeometry(0.55, 0.12, 16, 32, Math.PI);
    const handle = new THREE.Mesh(handleGeom, glassMat);
    handle.position.set(0.98, 1.25, 0);
    handle.rotation.z = -Math.PI / 2;
    this.dishGroup.add(handle);

    // 6. Bolhas de efervescência subindo no chopp
    const bCount = 20;
    const bGeom = new THREE.SphereGeometry(0.04, 8, 8);
    const bMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (let i = 0; i < bCount; i++) {
      const bubble = new THREE.Mesh(bGeom, bMat);
      bubble.position.set((Math.random() - 0.5) * 1.3, 0.3 + Math.random() * 1.5, (Math.random() - 0.5) * 1.3);
      this.dishGroup.add(bubble);
    }
  };

  /**
   * Construtor 3D: Copo de Caipirinha & Drinks com Gelo e Limão
   */
  DishRenderer.prototype.buildCocktailModel = function () {
    // Copo Baixo (Old Fashioned)
    const glassGeom = new THREE.CylinderGeometry(1.05, 0.95, 1.8, 28);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.35,
      roughness: 0.1
    });
    const glass = new THREE.Mesh(glassGeom, glassMat);
    glass.position.y = 0.9;
    this.dishGroup.add(glass);

    // Líquido Cítrico
    const liquidGeom = new THREE.CylinderGeometry(0.98, 0.9, 1.45, 28);
    const liquidMat = new THREE.MeshStandardMaterial({
      color: 0x84cc16,
      transparent: true,
      opacity: 0.75,
      roughness: 0.2
    });
    const liquid = new THREE.Mesh(liquidGeom, liquidMat);
    liquid.position.y = 0.75;
    this.dishGroup.add(liquid);

    // Pedras de Gelo Cúbicas Translúcidas
    const iceMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.55,
      roughness: 0.05,
      metalness: 0.1
    });
    const iceGeom = new THREE.BoxGeometry(0.48, 0.48, 0.48);

    const ice1 = new THREE.Mesh(iceGeom, iceMat);
    ice1.position.set(0.2, 0.9, 0.1);
    ice1.rotation.set(0.3, 0.5, 0.2);
    this.dishGroup.add(ice1);

    const ice2 = new THREE.Mesh(iceGeom, iceMat);
    ice2.position.set(-0.25, 1.1, -0.15);
    ice2.rotation.set(0.6, -0.3, 0.4);
    this.dishGroup.add(ice2);

    // Fatias de Limão no topo
    const limeGeom = new THREE.CylinderGeometry(0.4, 0.4, 0.07, 16);
    const limeMat = new THREE.MeshStandardMaterial({ color: 0x65a30d, roughness: 0.35 });
    const lime = new THREE.Mesh(limeGeom, limeMat);
    lime.position.set(0, 1.4, 0.1);
    lime.rotation.set(0.7, 0.2, 0.5);
    this.dishGroup.add(lime);
  };

  /**
   * Construtor 3D: Pudim de Leite Artesanal com Calda de Caramelo Dourada
   */
  DishRenderer.prototype.buildDessertModel = function () {
    // Prato de Sobremesa em Porcelana Branca Nobre
    const plateGeom = new THREE.CylinderGeometry(2.0, 1.5, 0.18, 48);
    const plateMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.05 });
    const plate = new THREE.Mesh(plateGeom, plateMat);
    plate.position.y = -0.09;
    this.dishGroup.add(plate);

    // Pudim Cremoso com Furo Central
    const puddingGeom = new THREE.CylinderGeometry(1.0, 1.35, 0.8, 36);
    const puddingMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.4 });
    const pudding = new THREE.Mesh(puddingGeom, puddingMat);
    pudding.position.y = 0.4;
    this.dishGroup.add(pudding);

    // Calda Dourada Espelhada de Caramelo
    const caramelGeom = new THREE.CylinderGeometry(1.02, 1.05, 0.16, 36);
    const caramelMat = new THREE.MeshStandardMaterial({
      color: 0x9a3412,
      roughness: 0.15,
      metalness: 0.3
    });
    const caramel = new THREE.Mesh(caramelGeom, caramelMat);
    caramel.position.y = 0.82;
    this.dishGroup.add(caramel);

    // Calda escorrida na base do prato
    const syrupPoolGeom = new THREE.CylinderGeometry(1.7, 1.7, 0.04, 32);
    const pool = new THREE.Mesh(syrupPoolGeom, caramelMat);
    pool.position.y = 0.02;
    this.dishGroup.add(pool);

    // Folha de Hortelã Fresca decorativa no topo
    const mintGeom = new THREE.ConeGeometry(0.18, 0.35, 8);
    const mintMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.5 });
    const mint = new THREE.Mesh(mintGeom, mintMat);
    mint.position.set(0, 0.98, 0);
    mint.rotation.x = -0.3;
    this.dishGroup.add(mint);
  };

  /**
   * Construtor 3D: Frigideira de Ferro com Filé Grelhado
   */
  DishRenderer.prototype.buildMeatSkillet = function () {
    // Frigideira de Ferro Fundido
    const panGeom = new THREE.CylinderGeometry(1.9, 1.7, 0.35, 36);
    const panMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.6, metalness: 0.5 });
    const pan = new THREE.Mesh(panGeom, panMat);
    pan.position.y = 0.17;
    this.dishGroup.add(pan);

    // Cabo da frigideira
    const handleGeom = new THREE.BoxGeometry(0.28, 0.14, 1.6);
    const handle = new THREE.Mesh(handleGeom, panMat);
    handle.position.set(0, 0.22, 2.3);
    this.dishGroup.add(handle);

    // Bife Alto de Filé Grelhado
    const steakGeom = new THREE.CylinderGeometry(1.1, 1.15, 0.32, 24);
    const steakMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.7 });
    const steak = new THREE.Mesh(steakGeom, steakMat);
    steak.position.y = 0.42;
    this.dishGroup.add(steak);

    // Manteiga de Ervas derretendo por cima
    const butterGeom = new THREE.CylinderGeometry(0.3, 0.35, 0.12, 16);
    const butterMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.25 });
    const butter = new THREE.Mesh(butterGeom, butterMat);
    butter.position.set(0.1, 0.62, -0.05);
    this.dishGroup.add(butter);

    // Batatas Rústicas Douradas ao redor
    const fryMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.5 });
    const fryGeom = new THREE.BoxGeometry(0.18, 0.18, 0.7);
    for (let i = 0; i < 5; i++) {
      const fry = new THREE.Mesh(fryGeom, fryMat);
      const ang = (i / 5) * Math.PI * 2;
      fry.position.set(Math.cos(ang) * 1.35, 0.42, Math.sin(ang) * 1.35);
      fry.rotation.set(0.2, ang, 0.4);
      this.dishGroup.add(fry);
    }
  };

  /**
   * Construtor 3D: Cestinha de Pastéis Artesanais ou Porções
   */
  DishRenderer.prototype.buildSnackBasket = function () {
    // Tábua de Madeira Nobre
    const boardGeom = new THREE.CylinderGeometry(1.9, 1.9, 0.18, 36);
    const boardMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.75 });
    const board = new THREE.Mesh(boardGeom, boardMat);
    board.position.y = 0.09;
    this.dishGroup.add(board);

    // Pastéis Dourados e Crocantes em Leque
    const pastelMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4, metalness: 0.1 });
    const pastelGeom = new THREE.BoxGeometry(1.1, 0.14, 0.8);

    for (let i = 0; i < 3; i++) {
      const pastel = new THREE.Mesh(pastelGeom, pastelMat);
      pastel.position.set((i - 1) * 0.45, 0.35 + i * 0.08, 0.1);
      pastel.rotation.set(0.25, (i - 1) * 0.2, 0.1);
      pastel.castShadow = true;
      this.dishGroup.add(pastel);
    }

    // Molheira de Cerâmica Branca com Molho da Casa
    const ramekinGeom = new THREE.CylinderGeometry(0.45, 0.35, 0.32, 24);
    const ramekinMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
    const ramekin = new THREE.Mesh(ramekinGeom, ramekinMat);
    ramekin.position.set(0, 0.3, -1.05);
    this.dishGroup.add(ramekin);

    const sauceGeom = new THREE.CylinderGeometry(0.4, 0.4, 0.06, 24);
    const sauceMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.2 });
    const sauce = new THREE.Mesh(sauceGeom, sauceMat);
    sauce.position.set(0, 0.42, -1.05);
    this.dishGroup.add(sauce);
  };

  DishRenderer.prototype.start = function () {
    if (this.active) return;
    this.active = true;
    const self = this;

    function render() {
      if (!self.active) return;
      self.animId = requestAnimationFrame(render);

      // Rotação suave do prato
      if (self.autoRotate && !self.isDragging) {
        self.dishGroup.rotation.y += 0.007;
      } else if (!self.isDragging) {
        // Amortecimento inercial
        self.dishGroup.rotation.y += self.rotVelocityX;
        self.rotVelocityX *= 0.92;
        if (Math.abs(self.rotVelocityX) < 0.0005) self.autoRotate = true;
      }

      // Animação de vapor culinário
      if (self.steamEnabled && self.steamMesh && self.steamData) {
        const pos = self.steamMesh.geometry.attributes.position.array;
        for (let i = 0; i < self.steamData.length; i++) {
          const d = self.steamData[i];
          pos[i * 3 + 1] += d.speedY;
          pos[i * 3] += Math.sin(pos[i * 3 + 1] * 2.5 + d.wobble) * 0.004;

          if (pos[i * 3 + 1] > 2.3) {
            pos[i * 3 + 1] = 0.35;
            pos[i * 3] = (Math.random() - 0.5) * 0.9;
          }
        }
        self.steamMesh.geometry.attributes.position.needsUpdate = true;
      }

      self.renderer.render(self.scene, self.camera);
    }

    render();
  };

  DishRenderer.prototype.pause = function () {
    this.active = false;
    if (this.animId) cancelAnimationFrame(this.animId);
  };

  DishRenderer.prototype.destroy = function () {
    this.pause();
    this.renderer.dispose();
  };

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * CLASSE: FlyToCartManager (Arco 3D de Partículas ao Adicionar Item)
   * ══════════════════════════════════════════════════════════════════════════
   */
  function FlyToCartManager() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'cart-fly-canvas';
    this.canvas.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 9999;
    `;
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.animId = null;

    const onResize = () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);
    onResize();
  }

  FlyToCartManager.prototype.spawn = function (startEl, endEl) {
    if (!startEl || !endEl) return;
    const r1 = startEl.getBoundingClientRect();
    const r2 = endEl.getBoundingClientRect();

    const startX = r1.left + r1.width / 2;
    const startY = r1.top + r1.height / 2;
    const targetX = r2.left + r2.width / 2;
    const targetY = r2.top + r2.height / 2;

    const count = 28;
    for (let i = 0; i < count; i++) {
      const delay = Math.random() * 0.25;
      const controlX = (startX + targetX) / 2 + (Math.random() - 0.5) * 160;
      const controlY = Math.min(startY, targetY) - 120 - Math.random() * 100;

      this.particles.push({
        startX,
        startY,
        targetX,
        targetY,
        controlX,
        controlY,
        progress: -delay,
        speed: 0.024 + Math.random() * 0.015,
        size: Math.random() * 6 + 3,
        color: Math.random() > 0.4 ? '#fc4b15' : '#f59e0b',
        trail: []
      });
    }

    if (!this.animId) this.animate();
  };

  FlyToCartManager.prototype.animate = function () {
    const self = this;
    const ctx = this.ctx;

    function loop() {
      ctx.clearRect(0, 0, self.canvas.width, self.canvas.height);

      for (let i = self.particles.length - 1; i >= 0; i--) {
        const p = self.particles[i];
        p.progress += p.speed;

        if (p.progress >= 1) {
          self.particles.splice(i, 1);
          continue;
        }

        if (p.progress < 0) continue;

        // Curva Bezier Quadrática B(t) = (1-t)^2 P0 + 2(1-t)t P1 + t^2 P2
        const t = p.progress;
        const mt = 1 - t;
        const x = mt * mt * p.startX + 2 * mt * t * p.controlX + t * t * p.targetX;
        const y = mt * mt * p.startY + 2 * mt * t * p.controlY + t * t * p.targetY;

        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, p.size * (1 - t * 0.5), 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.restore();
      }

      if (self.particles.length > 0) {
        self.animId = requestAnimationFrame(loop);
      } else {
        self.animId = null;
        // Efeito de impacto no botão do carrinho
        const cartFab = document.getElementById('fab-cart');
        if (cartFab) {
          cartFab.style.transform = 'scale(1.22)';
          setTimeout(() => { cartFab.style.transform = ''; }, 260);
        }
      }
    }

    loop();
  };

  // ══════════════════════════════════════════════════════════════════════════
  // INICIALIZAÇÃO AUTOMÁTICA
  // ══════════════════════════════════════════════════════════════════════════
  window.ChefCardapio3D = ChefCardapio3D;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ChefCardapio3D.init());
  } else {
    ChefCardapio3D.init();
  }

})();
