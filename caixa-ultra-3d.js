/**
 * ═════════════════════════════════════════════════════════════════════════
 * CHEF COZINHA ULTRA 3D ENGINE (Three.js High Performance > 6GB RAM)
 * Ambient Flow Canvas • Interactive 3D Salon • Order Particle Flow Streams
 * ═════════════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  window.ChefUltra3D = {
    ambientRenderer: null,
    ambientScene: null,
    ambientCamera: null,
    ambientParticles: null,
    ambientAnimId: null,

    salonRenderer: null,
    salonScene: null,
    salonCamera: null,
    salonControls: null,
    salonAnimId: null,
    salonRaycaster: null,
    salonMouse: null,
    tableMeshes: new Map(),
    flowParticles: [],
    kitchenBeacon: null,
    barBeacon: null,
    kitchenSmokeParticles: [],
    kitchenFireLight: null,
    tableSpotlight: null,
    cameraTargetPos: null,
    cameraLookAtTarget: null,

    isSalonActive: false,
    hoveredTable: null,
    selectedTable: null,

    deviceMemory: navigator.deviceMemory || 8,
    isHighEnd: (navigator.deviceMemory || 8) >= 6,

    init: function () {
      if (typeof THREE === 'undefined') {
        console.warn('[ChefUltra3D] Three.js não disponível.');
        return;
      }

      this.initAmbientFlow();
      this.initSalon3D();
      console.log(`[ChefUltra3D] Engine 3D Inicializado! Aceleração GPU ativa (${this.deviceMemory}GB RAM)`);
    },

    /**
     * ─── 1. BACKGROUND AMBIENTE DE FLUXOS (AURA GPU FLUIDA) ───
     */
    initAmbientFlow: function () {
      const canvas = document.getElementById('threejs-ambient-canvas');
      if (!canvas) return;

      const width = window.innerWidth;
      const height = window.innerHeight;

      this.ambientScene = new THREE.Scene();
      this.ambientCamera = new THREE.PerspectiveCamera(60, width / height, 1, 1000);
      this.ambientCamera.position.z = 400;

      this.ambientRenderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance'
      });
      this.ambientRenderer.setSize(width, height);
      this.ambientRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      const particleCount = this.isHighEnd ? 1200 : 600;
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(particleCount * 3);
      const colors = new Float32Array(particleCount * 3);

      const colorCoral = new THREE.Color(0xfc4b15);
      const colorPurple = new THREE.Color(0x8b5cf6);
      const colorCyan = new THREE.Color(0x06b6d4);

      for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 1200;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 800;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 500;

        const mixed = colorCoral.clone().lerp(
          Math.random() > 0.5 ? colorPurple : colorCyan,
          Math.random()
        );
        colors[i * 3] = mixed.r;
        colors[i * 3 + 1] = mixed.g;
        colors[i * 3 + 2] = mixed.b;
      }

      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      const material = new THREE.PointsMaterial({
        size: 4.5,
        vertexColors: true,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending
      });

      this.ambientParticles = new THREE.Points(geometry, material);
      this.ambientScene.add(this.ambientParticles);

      let clock = new THREE.Clock();
      const animate = () => {
        this.ambientAnimId = requestAnimationFrame(animate);
        const elapsedTime = clock.getElapsedTime();

        if (this.ambientParticles) {
          this.ambientParticles.rotation.y = elapsedTime * 0.02;
          this.ambientParticles.rotation.x = Math.sin(elapsedTime * 0.015) * 0.04;

          const pos = this.ambientParticles.geometry.attributes.position.array;
          for (let i = 0; i < particleCount; i++) {
            const idx = i * 3 + 1;
            pos[idx] += Math.sin(elapsedTime + i) * 0.18;
          }
          this.ambientParticles.geometry.attributes.position.needsUpdate = true;
        }

        this.ambientRenderer.render(this.ambientScene, this.ambientCamera);
      };
      animate();

      window.addEventListener('resize', () => {
        if (!this.ambientCamera || !this.ambientRenderer) return;
        this.ambientCamera.aspect = window.innerWidth / window.innerHeight;
        this.ambientCamera.updateProjectionMatrix();
        this.ambientRenderer.setSize(window.innerWidth, window.innerHeight);
      });
    },

    /**
     * ─── 2. SALÃO 3D INTERATIVO (PLANTA DO RESTAURANTE COM THREE.JS) ───
     */
    initSalon3D: function () {
      const container = document.getElementById('threejs-salon-container');
      const canvas = document.getElementById('threejs-salon-canvas');
      if (!container || !canvas) return;

      const width = container.clientWidth || 800;
      const height = container.clientHeight || 600;

      this.salonScene = new THREE.Scene();
      this.salonScene.background = new THREE.Color(0x0a101f);
      this.salonScene.fog = new THREE.FogExp2(0x0a101f, 0.002);

      // Câmera isométrica com visão ampla e luminosa
      this.salonCamera = new THREE.PerspectiveCamera(48, width / height, 1, 3000);
      this.salonCamera.position.set(0, 360, 440);
      this.salonCamera.lookAt(0, 40, 0);

      this.salonRenderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
      });
      this.salonRenderer.setSize(width, height);
      this.salonRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.salonRenderer.shadowMap.enabled = true;
      this.salonRenderer.shadowMap.type = THREE.PCFSoftShadowMap;

      // Iluminação de Estúdio Vibrante
      const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
      this.salonScene.add(ambientLight);

      const dirLight = new THREE.DirectionalLight(0xfff7ed, 1.8);
      dirLight.position.set(200, 500, 300);
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.width = 1024;
      dirLight.shadow.mapSize.height = 1024;
      this.salonScene.add(dirLight);

      // Luz de preenchimento azul cyan
      const fillLight = new THREE.DirectionalLight(0x38bdf8, 1.0);
      fillLight.position.set(-300, 300, -200);
      this.salonScene.add(fillLight);

      // Chão do salão com grid reflexivo
      const floorGeo = new THREE.PlaneGeometry(1400, 1000);
      const floorMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.35,
        metalness: 0.4
      });
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      this.salonScene.add(floor);

      const gridHelper = new THREE.GridHelper(1400, 44, 0x334155, 0x1e293b);
      gridHelper.position.y = 0.6;
      this.salonScene.add(gridHelper);

      // Holofote de Foco Cinematográfico na Mesa Selecionada (Estilo Jogo de Estratégia / Tycoon)
      this.tableSpotlight = new THREE.SpotLight(0xfff176, 0, 480, Math.PI / 5, 0.45, 1.2);
      this.tableSpotlight.position.set(0, 320, 0);
      this.salonScene.add(this.tableSpotlight);
      this.salonScene.add(this.tableSpotlight.target);

      // Estações 3D Vivas: Cozinha com Fogão a Gás e Fumaça / Bar com Bebidas Iluminadas
      this.kitchenBeacon = this.createKitchenDiorama(-460, 0, -280);
      this.barBeacon = this.createBarDiorama(460, 0, -280);
      this.salonScene.add(this.kitchenBeacon);
      this.salonScene.add(this.barBeacon);

      this.salonRaycaster = new THREE.Raycaster();
      this.salonMouse = new THREE.Vector2();

      canvas.addEventListener('mousemove', (e) => this.onSalonMouseMove(e, canvas));
      canvas.addEventListener('click', (e) => this.onSalonMouseClick(e, canvas));

      if (typeof THREE.OrbitControls !== 'undefined') {
        this.salonControls = new THREE.OrbitControls(this.salonCamera, canvas);
        this.salonControls.enableDamping = true;
        this.salonControls.dampingFactor = 0.05;
        this.salonControls.maxPolarAngle = Math.PI / 2.2;
        this.salonControls.minDistance = 180;
        this.salonControls.maxDistance = 1000;
        this.salonControls.target.set(0, 40, 0);
      }

      const animateSalon = () => {
        this.salonAnimId = requestAnimationFrame(animateSalon);
        if (this.isSalonActive) {
          if (this.salonControls) this.salonControls.update();
          this.updateDioramaAnimations();
          this.updateFlowStreams();
          this.updateHoverAnimation();
          this.updateCameraLerp();
          this.salonRenderer.render(this.salonScene, this.salonCamera);
        }
      };
      animateSalon();
    },

    createBeacon: function (nome, x, y, z, colorHex) {
      const group = new THREE.Group();
      group.position.set(x, y, z);

      const baseGeo = new THREE.CylinderGeometry(30, 36, 14, 32);
      const baseMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3, metalness: 0.8 });
      const base = new THREE.Mesh(baseGeo, baseMat);
      base.position.y = 7;
      group.add(base);

      const ringGeo = new THREE.TorusGeometry(34, 3, 16, 64);
      const ringMat = new THREE.MeshBasicMaterial({ color: colorHex });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 14;
      group.add(ring);

      const beamGeo = new THREE.CylinderGeometry(16, 28, 220, 32, 1, true);
      const beamMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide
      });
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.y = 110;
      group.add(beam);

      return group;
    },

    updateMesas: function (mesas, ordersData) {
      if (!this.salonScene || !Array.isArray(mesas)) return;

      const groupedByMesa = {};
      (ordersData || []).forEach(o => {
        const mesa = (o.mesa_grupo || o.localName || '').trim();
        if (!mesa) return;
        if (!groupedByMesa[mesa]) groupedByMesa[mesa] = { count: 0, total: 0, status: o.status, items: [] };
        const val = parseFloat(String(o.total || '0').replace(',', '.')) || 0;
        groupedByMesa[mesa].count++;
        const prod = o.productName || o.nome || o.productEmoji || '🍽️';
        groupedByMesa[mesa].items.push(prod);
        if (o.status !== 'Pago') groupedByMesa[mesa].total += val;
      });

      const cols = 5;
      const spacingX = 150;
      const spacingZ = 140;
      const startX = -((cols - 1) * spacingX) / 2;
      const startZ = -160;

      mesas.forEach((m, idx) => {
        const row = Math.floor(idx / cols);
        const col = idx % cols;
        const posX = startX + col * spacingX;
        const posZ = startZ + row * spacingZ;

        const info = groupedByMesa[m.nome] || { count: 0, total: 0, status: m.status, items: [] };
        let mesaStatus = 'livre';
        if (info.count > 0 || m.status === 'Ocupada') {
          mesaStatus = (m.status === 'Conta Solicitada') ? 'solicitada' : 'ocupada';
        } else if (m.status === 'Reservada') {
          mesaStatus = 'reservada';
        }

        let mesh = this.tableMeshes.get(m.nome);
        if (!mesh) {
          mesh = this.createTableMesh(m.nome, posX, 0, posZ);
          this.salonScene.add(mesh);
          this.tableMeshes.set(m.nome, mesh);
        }

        this.applyTableStatus(mesh, mesaStatus, info.total, info.items);
      });
    },

    createTableMesh: function (nome, x, y, z) {
      const group = new THREE.Group();
      group.position.set(x, y, z);

      // Perna da mesa (aço escovado)
      const legGeo = new THREE.CylinderGeometry(4.5, 5.5, 44, 16);
      const legMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.25 });
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.y = 22;
      leg.castShadow = true;
      group.add(leg);

      // Base pesada circular
      const baseGeo = new THREE.CylinderGeometry(20, 22, 4.5, 24);
      const base = new THREE.Mesh(baseGeo, legMat);
      base.position.y = 2.2;
      group.add(base);

      // Tampo da mesa translúcido com brilho emissivo
      const topGeo = new THREE.CylinderGeometry(36, 36, 5.5, 32);
      const topMat = new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x10b981,
        emissiveIntensity: 0.45,
        transparent: true,
        opacity: 0.85,
        roughness: 0.15,
        metalness: 0.4
      });
      const top = new THREE.Mesh(topGeo, topMat);
      top.position.y = 46;
      top.castShadow = true;
      top.receiveShadow = true;
      group.add(top);

      // Anel de néon em volta do tampo
      const glowGeo = new THREE.TorusGeometry(35, 1.8, 16, 48);
      const glowMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.rotation.x = Math.PI / 2;
      glow.position.y = 44;
      group.add(glow);

      // 4 Cadeiras Realistas de Bistrô ao redor, viradas para a mesa
      const seatMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 });
      const chairLegMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8, roughness: 0.2 });
      const backrestMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 });
      const chairLegGeo = new THREE.CylinderGeometry(0.9, 1.1, 18, 8);

      [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].forEach(ang => {
        const chairGroup = new THREE.Group();
        chairGroup.position.set(Math.cos(ang) * 50, 0, Math.sin(ang) * 50);
        chairGroup.rotation.y = -ang - Math.PI / 2;

        const seat = new THREE.Mesh(new THREE.BoxGeometry(16, 2.8, 16), seatMat);
        seat.position.y = 18;
        seat.castShadow = true;
        chairGroup.add(seat);

        [[-6, -6], [6, -6], [-6, 6], [6, 6]].forEach(([lx, lz]) => {
          const cl = new THREE.Mesh(chairLegGeo, chairLegMat);
          cl.position.set(lx, 9, lz);
          cl.castShadow = true;
          chairGroup.add(cl);
        });

        const backrest = new THREE.Mesh(new THREE.BoxGeometry(16, 18, 2.5), backrestMat);
        backrest.position.set(0, 27, -7);
        backrest.castShadow = true;
        chairGroup.add(backrest);

        group.add(chairGroup);
      });

      // Grupo de Adereços 3D sobre a Mesa (Pratos, Bebidas e Enfeite)
      const propsGroup = new THREE.Group();
      propsGroup.position.y = 49;
      group.add(propsGroup);

      // Sprite flutuante de Status / Valor
      const sprite = this.createTableTextSprite(nome, 'R$ 0,00', 'Livre');
      sprite.position.y = 80;
      group.add(sprite);

      // Balão de Pensamento / Pedido do Jogo (Overcooked / The Sims style)
      const thoughtBubble = this.createThoughtBubbleSprite('🍽️', 'livre');
      thoughtBubble.position.y = 112;
      group.add(thoughtBubble);

      group.userData = {
        nome: nome,
        topMesh: top,
        glowMesh: glow,
        spriteMesh: sprite,
        thoughtBubble: thoughtBubble,
        propsGroup: propsGroup,
        origY: 0,
        status: 'livre',
        total: 0,
        bobOffset: Math.random() * Math.PI * 2
      };

      return group;
    },

    applyTableStatus: function (tableGroup, status, total, items = []) {
      const ud = tableGroup.userData;
      ud.status = status;
      ud.total = total;
      ud.items = items;

      let colorHex = 0x10b981; // Livre
      let statusLabel = 'Livre';

      if (status === 'ocupada') {
        colorHex = 0xfc4b15; // Ocupada
        statusLabel = `R$ ${total.toFixed(2).replace('.', ',')}`;
      } else if (status === 'solicitada') {
        colorHex = 0x3b82f6; // Pede conta
        statusLabel = 'Pede Conta';
      } else if (status === 'fechamento') {
        colorHex = 0x8b5cf6;
        statusLabel = 'Fechando';
      } else if (status === 'reservada') {
        colorHex = 0xf59e0b;
        statusLabel = 'Reservada';
      }

      if (ud.topMesh) {
        ud.topMesh.material.color.setHex(colorHex);
        ud.topMesh.material.emissive.setHex(colorHex);
      }
      if (ud.glowMesh) {
        ud.glowMesh.material.color.setHex(colorHex);
      }

      this.updateSpriteCanvas(ud.spriteMesh, ud.nome, statusLabel, colorHex);
      this.updateTableProps(tableGroup, status, items);
      this.updateThoughtBubble(ud.thoughtBubble, status, items);
    },

    updateTableProps: function (tableGroup, status, items = []) {
      const propsGroup = tableGroup.userData.propsGroup;
      if (!propsGroup) return;

      while (propsGroup.children.length > 0) {
        const c = propsGroup.children.pop();
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      }

      if (status === 'livre') {
        // Enfeite minimalista: vasinho de mesa
        const vaseGeo = new THREE.CylinderGeometry(2, 2.8, 7, 12);
        const vaseMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.3 });
        const vase = new THREE.Mesh(vaseGeo, vaseMat);
        vase.position.y = 3.5;
        propsGroup.add(vase);

        const flowerGeo = new THREE.SphereGeometry(3, 8, 8);
        const flowerMat = new THREE.MeshStandardMaterial({ color: 0xf43f5e, roughness: 0.6 });
        const flower = new THREE.Mesh(flowerGeo, flowerMat);
        flower.position.y = 8;
        propsGroup.add(flower);
      } else {
        // Mesa ocupada: Pratos com comida e copos
        const plateGeo = new THREE.CylinderGeometry(7, 6, 1.4, 16);
        const plateMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.2 });

        const foodColors = [0xd97706, 0xef4444, 0x10b981, 0x854d0e];
        const glassGeo = new THREE.CylinderGeometry(2.2, 2.5, 6.5, 12);
        const glassMat = new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.65,
          roughness: 0.1
        });

        [-15, 15].forEach((offset, idx) => {
          const plate = new THREE.Mesh(plateGeo, plateMat);
          plate.position.set(offset, 1, 0);
          propsGroup.add(plate);

          const foodGeo = new THREE.DodecahedronGeometry(3.5, 0);
          const foodMat = new THREE.MeshStandardMaterial({ color: foodColors[idx % foodColors.length], roughness: 0.7 });
          const food = new THREE.Mesh(foodGeo, foodMat);
          food.position.set(offset, 3.5, 0);
          propsGroup.add(food);

          const glass = new THREE.Mesh(glassGeo, glassMat);
          glass.position.set(offset, 3.5, offset > 0 ? 12 : -12);
          propsGroup.add(glass);
        });

        const napkin = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 3), new THREE.MeshStandardMaterial({ color: 0x94a3b8 }));
        napkin.position.set(0, 2, 0);
        propsGroup.add(napkin);
      }
    },

    createThoughtBubbleSprite: function (initialEmoji, status) {
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 110;
      const ctx = canvas.getContext('2d');

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(38, 26, 1);
      sprite.userData = { canvas, ctx, texture };

      this.renderThoughtBubbleCanvas(sprite, initialEmoji, status);
      return sprite;
    },

    renderThoughtBubbleCanvas: function (sprite, emoji, status) {
      if (!sprite || !sprite.userData || !sprite.userData.ctx) return;
      const { canvas, ctx, texture } = sprite.userData;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (status === 'livre') {
        texture.needsUpdate = true;
        sprite.visible = false;
        return;
      }
      sprite.visible = true;

      const w = canvas.width;
      const h = canvas.height - 18;

      ctx.save();
      ctx.shadowColor = (status === 'solicitada') ? 'rgba(59, 130, 246, 0.7)' : 'rgba(252, 75, 21, 0.6)';
      ctx.shadowBlur = 12;

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = (status === 'solicitada') ? '#3b82f6' : '#fc4b15';
      ctx.lineWidth = 4;

      ctx.beginPath();
      ctx.roundRect(8, 6, w - 16, h - 12, 22);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(w / 2 - 10, h - 6);
      ctx.lineTo(w / 2, canvas.height - 2);
      ctx.lineTo(w / 2 + 10, h - 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      ctx.font = '46px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const displayEmoji = (status === 'solicitada') ? '🧾' : (emoji || '🍕');
      ctx.fillText(displayEmoji, w / 2, h / 2);

      texture.needsUpdate = true;
    },

    updateThoughtBubble: function (sprite, status, items = []) {
      if (!sprite) return;
      let emoji = '🍕';
      if (items && items.length > 0) {
        const itemStr = items.join(' ').toLowerCase();
        if (itemStr.includes('burg') || itemStr.includes('smash')) emoji = '🍔';
        else if (itemStr.includes('picanha') || itemStr.includes('carne') || itemStr.includes('costela')) emoji = '🥩';
        else if (itemStr.includes('chopp') || itemStr.includes('cerveja')) emoji = '🍺';
        else if (itemStr.includes('gin') || itemStr.includes('drink')) emoji = '🍹';
        else if (itemStr.includes('peixe') || itemStr.includes('frutos')) emoji = '🍤';
        else if (itemStr.includes('sorvete') || itemStr.includes('gateau')) emoji = '🍨';
        else if (itemStr.includes('batata') || itemStr.includes('porção')) emoji = '🍟';
      }
      this.renderThoughtBubbleCanvas(sprite, emoji, status);
    },

    createKitchenDiorama: function (x, y, z) {
      const group = new THREE.Group();
      group.position.set(x, y, z);

      const baseGeo = new THREE.BoxGeometry(110, 36, 60);
      const steelMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.2,
        metalness: 0.85
      });
      const base = new THREE.Mesh(baseGeo, steelMat);
      base.position.y = 18;
      base.castShadow = true;
      group.add(base);

      const stoveMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.5,
        metalness: 0.9
      });
      const stove = new THREE.Mesh(new THREE.BoxGeometry(90, 4, 44), stoveMat);
      stove.position.y = 38;
      group.add(stove);

      const burnerMat = new THREE.MeshStandardMaterial({
        color: 0xff3d00,
        emissive: 0xff5722,
        emissiveIntensity: 1.8,
        roughness: 0.2
      });
      [[-24, -12], [24, -12], [-24, 12], [24, 12]].forEach(([bx, bz]) => {
        const burner = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 2, 16), burnerMat);
        burner.position.set(bx, 40, bz);
        group.add(burner);
      });

      this.kitchenFireLight = new THREE.PointLight(0xff7043, 1.8, 160);
      this.kitchenFireLight.position.set(0, 52, 0);
      group.add(this.kitchenFireLight);

      const hoodMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.9, roughness: 0.15 });
      const hood = new THREE.Mesh(new THREE.BoxGeometry(84, 18, 48), hoodMat);
      hood.position.y = 100;
      group.add(hood);

      const chimneyGeo = new THREE.CylinderGeometry(10, 10, 70, 16);
      const chimney = new THREE.Mesh(chimneyGeo, hoodMat);
      chimney.position.y = 145;
      group.add(chimney);

      this.kitchenSmokeParticles = [];
      const smokeGeo = new THREE.SphereGeometry(3.5, 8, 8);
      for (let s = 0; s < 12; s++) {
        const smokeMat = new THREE.MeshBasicMaterial({
          color: 0x94a3b8,
          transparent: true,
          opacity: 0.25 - s * 0.015
        });
        const sp = new THREE.Mesh(smokeGeo, smokeMat);
        const sy = 180 + s * 7;
        sp.position.set((Math.random() - 0.5) * 6, sy, (Math.random() - 0.5) * 6);
        sp.userData = {
          origX: 0,
          origY: 180,
          origZ: 0,
          speedY: 0.6 + Math.random() * 0.4,
          origOpacity: 0.28
        };
        group.add(sp);
        this.kitchenSmokeParticles.push(sp);
      }

      const signSprite = this.createLocationSignSprite('🔥 COZINHA 1', '#fc4b15');
      signSprite.position.set(0, 130, 32);
      group.add(signSprite);

      return group;
    },

    createBarDiorama: function (x, y, z) {
      const group = new THREE.Group();
      group.position.set(x, y, z);

      const counterMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.35,
        metalness: 0.3
      });
      const counter = new THREE.Mesh(new THREE.BoxGeometry(110, 42, 46), counterMat);
      counter.position.y = 21;
      counter.castShadow = true;
      group.add(counter);

      const topMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.1,
        metalness: 0.8
      });
      const top = new THREE.Mesh(new THREE.BoxGeometry(116, 5, 52), topMat);
      top.position.y = 44;
      group.add(top);

      const neonMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
      const neonStrip = new THREE.Mesh(new THREE.BoxGeometry(114, 2, 2), neonMat);
      neonStrip.position.set(0, 41, 24);
      group.add(neonStrip);

      const stoolSeatMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.4 });
      const stoolLegMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.2 });
      [-36, 0, 36].forEach(sx => {
        const stoolGroup = new THREE.Group();
        stoolGroup.position.set(sx, 0, 36);

        const seat = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 3, 16), stoolSeatMat);
        seat.position.y = 28;
        stoolGroup.add(seat);

        const pole = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2, 28, 8), stoolLegMat);
        pole.position.y = 14;
        stoolGroup.add(pole);

        const base = new THREE.Mesh(new THREE.CylinderGeometry(9, 10, 2, 16), stoolLegMat);
        base.position.y = 1;
        stoolGroup.add(base);

        group.add(stoolGroup);
      });

      const shelfMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4 });
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(90, 3, 16), shelfMat);
      shelf.position.set(0, 65, -20);
      group.add(shelf);

      const bottleColors = [0xf59e0b, 0x06b6d4, 0x10b981, 0xf43f5e, 0x8b5cf6, 0xeab308];
      [-35, -21, -7, 7, 21, 35].forEach((bx, idx) => {
        const bCol = bottleColors[idx % bottleColors.length];
        const bMat = new THREE.MeshStandardMaterial({
          color: bCol,
          emissive: bCol,
          emissiveIntensity: 0.6,
          roughness: 0.1,
          metalness: 0.2
        });
        const bottle = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.5, 14, 12), bMat);
        bottle.position.set(bx, 73, -20);
        group.add(bottle);
      });

      const barLight = new THREE.PointLight(0x06b6d4, 1.4, 180);
      barLight.position.set(0, 60, 10);
      group.add(barLight);

      const signSprite = this.createLocationSignSprite('🍸 BAR & DRINKS', '#06b6d4');
      signSprite.position.set(0, 95, -16);
      group.add(signSprite);

      return group;
    },

    createLocationSignSprite: function (texto, corHex) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 80;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.strokeStyle = corHex;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(6, 6, 244, 68, 14);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = corHex;
      ctx.font = 'bold 24px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(texto, 128, 40);

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(65, 22, 1);
      return sprite;
    },

    updateDioramaAnimations: function () {
      const time = Date.now() * 0.001;

      // 1. Bobbing dos balões de pensamento nas mesas ocupadas
      this.tableMeshes.forEach(group => {
        const ud = group.userData;
        if (ud && ud.thoughtBubble && ud.status !== 'livre') {
          const offset = ud.bobOffset || 0;
          ud.thoughtBubble.position.y = 112 + Math.sin(time * 3 + offset) * 4;
        }
      });

      // 2. Tremulação do fogo dos queimadores da cozinha
      if (this.kitchenFireLight) {
        this.kitchenFireLight.intensity = 1.4 + Math.sin(time * 18) * 0.5 + Math.cos(time * 26) * 0.3;
      }

      // 3. Fumaça saindo da chaminé
      if (this.kitchenSmokeParticles && this.kitchenSmokeParticles.length > 0) {
        this.kitchenSmokeParticles.forEach(p => {
          p.position.y += p.userData.speedY;
          p.position.x += Math.sin(time * 2 + p.position.y * 0.05) * 0.25;
          p.scale.multiplyScalar(1.008);
          p.material.opacity -= 0.0035;

          if (p.material.opacity <= 0 || p.position.y > 230) {
            p.position.set(p.userData.origX, p.userData.origY, p.userData.origZ);
            p.scale.set(1, 1, 1);
            p.material.opacity = p.userData.origOpacity;
          }
        });
      }
    },

    createTableTextSprite: function (nome, valor, status) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(60, 30, 1);
      sprite.userData = { canvas, ctx, texture };

      this.updateSpriteCanvas(sprite, nome, valor, 0x10b981);
      return sprite;
    },

    updateSpriteCanvas: function (sprite, nome, valorOuStatus, colorHex) {
      if (!sprite || !sprite.userData || !sprite.userData.ctx) return;
      const { canvas, ctx, texture } = sprite.userData;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = 'rgba(10, 16, 31, 0.92)';
      ctx.strokeStyle = `#${colorHex.toString(16).padStart(6, '0')}`;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.roundRect(8, 8, canvas.width - 16, canvas.height - 16, 18);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px Outfit, Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(nome, canvas.width / 2, 52);

      ctx.fillStyle = `#${colorHex.toString(16).padStart(6, '0')}`;
      ctx.font = 'bold 28px "JetBrains Mono", Inter, sans-serif';
      ctx.fillText(valorOuStatus, canvas.width / 2, 98);

      texture.needsUpdate = true;
    },

    /**
     * ─── 3. ANIMAÇÃO DE FLUXO DE PEDIDOS (THREE.JS PARTICLES & TICKET 3D) ───
     */
    createTicketSprite: function (emoji, nome, targetMesa, colorHex) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
      ctx.strokeStyle = (colorHex === 0x06b6d4) ? '#06b6d4' : '#fc4b15';
      ctx.lineWidth = 6;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(6, 6, 244, 116, 16);
      else ctx.rect(6, 6, 244, 116);
      ctx.fill();
      ctx.stroke();

      ctx.font = '40px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(emoji || '🍽️', 20, 64);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px Inter, sans-serif';
      ctx.fillText((nome || 'Novo Pedido').substring(0, 12), 75, 48);

      ctx.fillStyle = (colorHex === 0x06b6d4) ? '#06b6d4' : '#fc4b15';
      ctx.font = 'bold 18px Outfit, sans-serif';
      ctx.fillText(`➔ ${targetMesa}`, 75, 84);

      const texture = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(65, 32.5, 1);
      return sprite;
    },

    createTableRipple: function (targetTable, colorHex) {
      if (!targetTable || !this.salonScene) return;
      const ringGeo = new THREE.RingGeometry(8, 14, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(targetTable.position);
      ring.position.y = 48;
      this.salonScene.add(ring);

      let scale = 1;
      const animRipple = () => {
        scale += 0.14;
        ring.scale.set(scale, scale, 1);
        ringMat.opacity -= 0.045;
        if (ringMat.opacity > 0) {
          requestAnimationFrame(animRipple);
        } else {
          this.salonScene.remove(ring);
          ringGeo.dispose();
          ringMat.dispose();
        }
      };
      animRipple();
    },

    triggerOrderFlow: function (mesaNome, sector, itemInfo = {}) {
      if (!this.salonScene) return;
      const targetTable = this.tableMeshes.get(mesaNome);
      if (!targetTable) return;

      const origin = (sector === 'Bar') ? this.barBeacon.position : this.kitchenBeacon.position;
      const destination = targetTable.position.clone();
      destination.y = 46;

      const colorHex = (sector === 'Bar') ? 0x06b6d4 : 0xfc4b15;

      const midPoint = new THREE.Vector3().addVectors(origin, destination).multiplyScalar(0.5);
      midPoint.y += 190;

      const curve = new THREE.QuadraticBezierCurve3(origin.clone(), midPoint, destination);

      const count = 45;
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count * 3; i++) pos[i] = 0;
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

      const mat = new THREE.PointsMaterial({
        color: colorHex,
        size: 8,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending
      });

      const points = new THREE.Points(geo, mat);
      this.salonScene.add(points);

      // Ticket 3D Ilustrado voando junto com o fluxo
      const ticketSprite = this.createTicketSprite(itemInfo.productEmoji || '🍽️', itemInfo.productName || 'Item Pedido', mesaNome, colorHex);
      ticketSprite.position.copy(origin);
      this.salonScene.add(ticketSprite);

      const stream = {
        points: points,
        ticketSprite: ticketSprite,
        curve: curve,
        progress: 0,
        speed: 0.016,
        targetTable: targetTable,
        colorHex: colorHex
      };
      this.flowParticles.push(stream);
    },

    updateFlowStreams: function () {
      for (let i = this.flowParticles.length - 1; i >= 0; i--) {
        const stream = this.flowParticles[i];
        stream.progress += stream.speed;

        if (stream.progress >= 1.0) {
          this.salonScene.remove(stream.points);
          stream.points.geometry.dispose();
          stream.points.material.dispose();

          if (stream.ticketSprite) {
            this.salonScene.remove(stream.ticketSprite);
            if (stream.ticketSprite.material.map) stream.ticketSprite.material.map.dispose();
            stream.ticketSprite.material.dispose();
          }

          this.flowParticles.splice(i, 1);

          this.pulseTable(stream.targetTable, stream.colorHex);
          this.createTableRipple(stream.targetTable, stream.colorHex);
          continue;
        }

        const posAttr = stream.points.geometry.attributes.position;
        const count = posAttr.count;
        for (let j = 0; j < count; j++) {
          const t = Math.max(0, stream.progress - (j * 0.005));
          const p = stream.curve.getPoint(t);
          posAttr.setXYZ(j, p.x, p.y, p.z);
        }
        posAttr.needsUpdate = true;

        if (stream.ticketSprite) {
          const tp = stream.curve.getPoint(stream.progress);
          stream.ticketSprite.position.set(tp.x, tp.y + 12, tp.z);
        }
      }
    },

    pulseTable: function (tableGroup, colorHex) {
      if (!tableGroup) return;
      const origScale = tableGroup.scale.x;
      tableGroup.scale.set(origScale * 1.1, origScale * 1.1, origScale * 1.1);
      setTimeout(() => {
        tableGroup.scale.set(origScale, origScale, origScale);
      }, 300);
    },

    onSalonMouseMove: function (e, canvas) {
      const rect = canvas.getBoundingClientRect();
      this.salonMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.salonMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    },

    onSalonMouseClick: function (e, canvas) {
      if (!this.salonRaycaster || !this.salonCamera) return;
      this.salonRaycaster.setFromCamera(this.salonMouse, this.salonCamera);

      const interactables = [];
      this.tableMeshes.forEach(mesh => {
        if (mesh.userData.topMesh) interactables.push(mesh.userData.topMesh);
      });

      const intersects = this.salonRaycaster.intersectObjects(interactables);
      if (intersects.length > 0) {
        const topMesh = intersects[0].object;
        const tableGroup = topMesh.parent;
        const mesaNome = tableGroup.userData.nome;

        if (window.ChefUltraApp && typeof window.ChefUltraApp.selecionarMesa === 'function') {
          window.ChefUltraApp.selecionarMesa(mesaNome);
        }

        this.focusOnTable(tableGroup);
      }
    },

    focusOnTable: function (tableGroup) {
      if (!tableGroup) return;
      this.selectedTable = tableGroup;

      const tx = tableGroup.position.x;
      const tz = tableGroup.position.z;

      this.cameraTargetPos = new THREE.Vector3(tx, 220, tz + 220);
      this.cameraLookAtTarget = new THREE.Vector3(tx, 40, tz);

      if (this.tableSpotlight) {
        this.tableSpotlight.position.set(tx, 320, tz);
        this.tableSpotlight.target.position.set(tx, 40, tz);
        this.tableSpotlight.intensity = 2.8;
      }

      this.pulseTable(tableGroup, 0xfc4b15);
      if (window.ChefUltraGame && window.ChefUltraGame.sfx) {
        window.ChefUltraGame.sfx.playTableSelect();
      }
    },

    updateCameraLerp: function () {
      if (this.cameraTargetPos && this.salonCamera) {
        this.salonCamera.position.lerp(this.cameraTargetPos, 0.06);
        if (this.salonControls && this.cameraLookAtTarget) {
          this.salonControls.target.lerp(this.cameraLookAtTarget, 0.06);
        }
        if (this.salonCamera.position.distanceTo(this.cameraTargetPos) < 2) {
          this.cameraTargetPos = null;
        }
      }
    },

    updateHoverAnimation: function () {
      if (!this.salonRaycaster || !this.salonCamera) return;
      this.salonRaycaster.setFromCamera(this.salonMouse, this.salonCamera);

      const interactables = [];
      this.tableMeshes.forEach(mesh => {
        if (mesh.userData.topMesh) interactables.push(mesh.userData.topMesh);
      });

      const intersects = this.salonRaycaster.intersectObjects(interactables);
      if (intersects.length > 0) {
        const tableGroup = intersects[0].object.parent;
        if (this.hoveredTable !== tableGroup) {
          if (this.hoveredTable) this.hoveredTable.position.y = 0;
          this.hoveredTable = tableGroup;
          this.hoveredTable.position.y = 8;
          document.body.style.cursor = 'pointer';
        }
      } else {
        if (this.hoveredTable) {
          this.hoveredTable.position.y = 0;
          this.hoveredTable = null;
          document.body.style.cursor = 'default';
        }
      }
    },

    toggleSalonMode: function (enable) {
      this.isSalonActive = enable;
      const container = document.getElementById('threejs-salon-container');
      const grid = document.getElementById('ultra-grid-container');

      if (container) {
        container.classList.toggle('active', enable);
        if (enable && this.salonRenderer) {
          this.salonRenderer.setSize(container.clientWidth, container.clientHeight);
          if (this.salonCamera) {
            this.salonCamera.aspect = container.clientWidth / container.clientHeight;
            this.salonCamera.updateProjectionMatrix();
          }
        }
      }
      if (grid) {
        grid.style.display = enable ? 'none' : 'grid';
      }
    }
  };

})();
