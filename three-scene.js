/**
 * かわいい Three.js 背景（global THREE を利用）
 * スプラッシュ時は賑やか、本体では控えめなパステル浮遊オブジェクト
 */
(function () {
  'use strict';

  if (typeof THREE === 'undefined') {
    console.warn('[CuteThree] THREE が読み込まれていません');
    return;
  }

  const PASTEL = [
    0xffb3c6, // pink
    0xffc9a8, // peach
    0xffe08a, // butter
    0xb8f2e6, // mint
    0xc9b8ff, // lavender
    0xffd6e8, // soft rose
    0xa8e6ff, // sky
    0xff9ecd, // hot pink soft
  ];

  const state = {
    renderer: null,
    scene: null,
    camera: null,
    objects: [],
    sparkles: null,
    mode: 'splash', // 'splash' | 'ambient'
    reducedMotion: false,
    raf: 0,
    clock: null,
    started: false,
  };

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function makeSoftMaterial(color, opts) {
    opts = opts || {};
    return new THREE.MeshStandardMaterial({
      color: color,
      roughness: opts.roughness != null ? opts.roughness : 0.42,
      metalness: opts.metalness != null ? opts.metalness : 0.08,
      transparent: true,
      opacity: opts.opacity != null ? opts.opacity : 0.98,
      emissive: new THREE.Color(color).multiplyScalar(0.14),
      flatShading: !!opts.flat,
    });
  }

  function makeHeart(color, scale) {
    scale = scale == null ? 1 : scale;
    const g = new THREE.Group();
    const mat = makeSoftMaterial(color, { roughness: 0.35 });
    const sphere = new THREE.SphereGeometry(0.32, 18, 18);
    const left = new THREE.Mesh(sphere, mat);
    left.position.set(-0.22, 0.18, 0);
    const right = new THREE.Mesh(sphere, mat);
    right.position.set(0.22, 0.18, 0);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.72, 18), mat);
    tip.rotation.z = Math.PI;
    tip.position.y = -0.22;
    g.add(left, right, tip);
    g.scale.setScalar(scale);
    return g;
  }

  function makeBeerMug(scale) {
    scale = scale == null ? 1 : scale;
    const g = new THREE.Group();
    const glass = makeSoftMaterial(0xffe8a8, { opacity: 0.88, roughness: 0.3 });
    const foam = makeSoftMaterial(0xfff8ef, { opacity: 0.95, roughness: 0.55 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, 0.7, 20), glass);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.16, 20), foam);
    head.position.y = 0.4;
    const handle = new THREE.Mesh(
      new THREE.TorusGeometry(0.18, 0.05, 10, 18, Math.PI),
      glass
    );
    handle.rotation.y = Math.PI / 2;
    handle.position.set(0.38, 0.05, 0);
    g.add(body, head, handle);
    g.scale.setScalar(scale);
    return g;
  }

  function makeStar(color, scale) {
    scale = scale == null ? 1 : scale;
    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.45, 0),
      makeSoftMaterial(color, { flat: true, roughness: 0.4 })
    );
    mesh.scale.setScalar(scale);
    return mesh;
  }

  function makeDonut(color, scale) {
    scale = scale == null ? 1 : scale;
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.38, 0.16, 14, 28),
      makeSoftMaterial(color, { roughness: 0.5 })
    );
    mesh.scale.setScalar(scale);
    return mesh;
  }

  function makeBubble(color, scale) {
    scale = scale == null ? 1 : scale;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 24, 24),
      makeSoftMaterial(color, { opacity: 0.72, roughness: 0.25, metalness: 0.12 })
    );
    mesh.scale.setScalar(scale);
    return mesh;
  }

  function makeSkewer(scale) {
    scale = scale == null ? 1 : scale;
    const g = new THREE.Group();
    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 1.1, 8),
      makeSoftMaterial(0xe8d4b8, { roughness: 0.8 })
    );
    const colors = [0xff8fab, 0xffc857, 0x7ed9c0];
    for (let i = 0; i < colors.length; i++) {
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 14, 14),
        makeSoftMaterial(colors[i])
      );
      ball.position.y = -0.25 + i * 0.28;
      g.add(ball);
    }
    g.add(stick);
    g.rotation.z = 0.4;
    g.scale.setScalar(scale);
    return g;
  }

  /** 端寄りに配置（中央の UI を塞がない） */
  function edgePosition() {
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = side * (3.2 + Math.random() * 4.5);
    const y = (Math.random() - 0.5) * 7;
    const z = -1.5 - Math.random() * 3;
    return { x: x, y: y, z: z };
  }

  function spawnObject(factory) {
    const obj = factory();
    const p = edgePosition();
    obj.position.set(p.x, p.y, p.z);
    obj.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    obj.userData = {
      base: obj.position.clone(),
      amp: 0.12 + Math.random() * 0.28,
      speed: 0.25 + Math.random() * 0.45,
      phase: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.25,
      spinY: (Math.random() - 0.5) * 0.35,
      kind: 'float',
      splashOnly: false,
    };
    state.scene.add(obj);
    state.objects.push(obj);
    return obj;
  }

  function buildSceneContent() {
    const amb = new THREE.AmbientLight(0xfff0f8, 1.0);
    const key = new THREE.DirectionalLight(0xffe4f0, 0.55);
    key.position.set(4, 8, 6);
    const fill = new THREE.DirectionalLight(0xd4f5ff, 0.3);
    fill.position.set(-5, 2, -3);
    state.scene.add(amb, key, fill);

    // 控えめな数だけ（本編でも表示）
    let i;
    for (i = 0; i < 6; i++) {
      (function (c) {
        spawnObject(function () { return makeBubble(c, 0.28 + Math.random() * 0.28); });
      })(PASTEL[i % PASTEL.length]);
    }
    for (i = 0; i < 3; i++) {
      (function (c) {
        spawnObject(function () { return makeHeart(c, 0.32 + Math.random() * 0.18); });
      })(PASTEL[i % PASTEL.length]);
    }
    for (i = 0; i < 2; i++) {
      (function (c) {
        spawnObject(function () { return makeDonut(c, 0.35 + Math.random() * 0.15); });
      })(PASTEL[(i + 2) % PASTEL.length]);
    }
    for (i = 0; i < 2; i++) {
      (function (c) {
        spawnObject(function () { return makeStar(c, 0.3 + Math.random() * 0.15); });
      })(PASTEL[(i + 4) % PASTEL.length]);
    }
    spawnObject(function () { return makeBeerMug(0.42); });

    // スプラッシュ時だけ足す装飾（本編では非表示）
    for (i = 0; i < 4; i++) {
      (function (c) {
        const o = spawnObject(function () { return makeBubble(c, 0.4 + Math.random() * 0.25); });
        o.userData.splashOnly = true;
      })(PASTEL[(i + 3) % PASTEL.length]);
    }
    for (i = 0; i < 2; i++) {
      (function (c) {
        const o = spawnObject(function () { return makeHeart(c, 0.4); });
        o.userData.splashOnly = true;
      })(PASTEL[i % PASTEL.length]);
    }

    // きらきらは少なめ・スプラッシュ専用
    const count = 24;
    const positions = new Float32Array(count * 3);
    for (i = 0; i < count; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      positions[i * 3] = side * (3 + Math.random() * 5);
      positions[i * 3 + 1] = (Math.random() - 0.5) * 8;
      positions[i * 3 + 2] = -1 - Math.random() * 4;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.06,
      transparent: true,
      opacity: 0.45,
      sizeAttenuation: true,
      depthWrite: false,
    });
    state.sparkles = new THREE.Points(geo, mat);
    state.sparkles.userData = { phase: 0, splashOnly: true };
    state.scene.add(state.sparkles);
  }

  function setMode(mode) {
    state.mode = mode === 'ambient' ? 'ambient' : 'splash';
    const canvas = state.renderer && state.renderer.domElement;
    if (!canvas) return;

    const isSplash = state.mode === 'splash';
    if (isSplash) {
      canvas.classList.remove('is-ambient');
      canvas.classList.add('is-splash');
      state.camera.position.z = 8.2;
    } else {
      canvas.classList.remove('is-splash');
      canvas.classList.add('is-ambient');
      state.camera.position.z = 9.2;
    }

    // 本編では splashOnly を隠す
    for (let i = 0; i < state.objects.length; i++) {
      const o = state.objects[i];
      o.visible = isSplash || !o.userData.splashOnly;
    }
    if (state.sparkles) {
      state.sparkles.visible = isSplash;
    }
  }

  function resize() {
    if (!state.renderer || !state.camera) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    state.renderer.setSize(w, h, false);
    state.camera.aspect = w / h;
    state.camera.updateProjectionMatrix();
  }

  function animate() {
    state.raf = requestAnimationFrame(animate);
    if (state.reducedMotion) {
      state.renderer.render(state.scene, state.camera);
      return;
    }

    const t = state.clock.getElapsedTime();
    const intensity = state.mode === 'splash' ? 0.7 : 0.35;

    for (let i = 0; i < state.objects.length; i++) {
      const obj = state.objects[i];
      const u = obj.userData;
      obj.position.y = u.base.y + Math.sin(t * u.speed + u.phase) * u.amp * intensity;
      obj.position.x = u.base.x + Math.cos(t * u.speed * 0.7 + u.phase) * u.amp * 0.45 * intensity;
      obj.rotation.x += u.spin * 0.012 * intensity;
      obj.rotation.y += u.spinY * 0.014 * intensity;
    }

    if (state.sparkles) {
      state.sparkles.rotation.y = t * 0.04 * intensity;
      state.sparkles.material.opacity = 0.45 + Math.sin(t * 1.2) * 0.25 * intensity;
    }

    state.camera.position.x = Math.sin(t * 0.18) * 0.35 * intensity;
    state.camera.position.y = Math.cos(t * 0.14) * 0.2 * intensity;
    state.camera.lookAt(0, 0, 0);

    state.renderer.render(state.scene, state.camera);
  }

  function init() {
    if (state.started) return;
    const canvas = document.getElementById('bgThree');
    if (!canvas) return;

    state.reducedMotion = prefersReducedMotion();
    state.started = true;

    try {
      state.clock = new THREE.Clock();

      state.renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'low-power',
      });
      state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      state.renderer.setClearColor(0x000000, 0);
      if (THREE.SRGBColorSpace) {
        state.renderer.outputColorSpace = THREE.SRGBColorSpace;
      }

      state.scene = new THREE.Scene();
      state.scene.fog = new THREE.FogExp2(0xfff0f6, 0.035);

      state.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
      state.camera.position.set(0, 0.4, 7.2);

      buildSceneContent();
      setMode('splash');
      resize();
      window.addEventListener('resize', resize, { passive: true });

      if (window.matchMedia) {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        const onChange = function () {
          state.reducedMotion = mq.matches;
        };
        if (mq.addEventListener) mq.addEventListener('change', onChange);
        else if (mq.addListener) mq.addListener(onChange);
      }

      animate();
    } catch (err) {
      console.warn('[CuteThree] init skipped:', err);
      canvas.style.display = 'none';
    }
  }

  function goAmbient() {
    setMode('ambient');
  }

  window.CuteThree = {
    init: init,
    goAmbient: goAmbient,
    setMode: setMode,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
