import * as THREE from './assets/vendor/three/three.module.js';

// Decorative only: accounting and saved event data do not depend on WebGL.
// The scene is one composed snowy diorama that lives inside the party hero,
// so it scrolls with the page and never floats over accounting controls.
function startWhenReady() {
  try {
    startChristmasScene();
  } catch (error) {
    console.warn('Christmas decorations are unavailable.', error);
    document.querySelector('.hero-scene-canvas')?.remove();
    document.querySelector('.party-hero')?.classList.remove('has-3d-scene');
    document.querySelector('.christmas-motion-toggle')?.remove();
  }
}
const splash = document.getElementById('splashScreen');
if (splash) {
  // Do not create the 3D scene until the welcome screen has closed.
  const observer = new MutationObserver(() => {
    if (!splash.isConnected) { observer.disconnect(); startWhenReady(); }
  });
  observer.observe(document.body, { childList: true });
} else {
  startWhenReady();
}

function startChristmasScene() {
  const hero = document.querySelector('.party-hero');
  const slot = hero?.querySelector('.hero-diorama');
  if (!hero || !slot) return;

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.02;
  const canvas = renderer.domElement;
  canvas.className = 'hero-scene-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  hero.prepend(canvas);
  hero.classList.add('has-3d-scene');

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'sidebar-action christmas-motion-toggle';
  document.querySelector('.sidebar-footer')?.append(toggle);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000);
  camera.position.z = 2000;
  scene.add(new THREE.HemisphereLight(0xfff3df, 0x4f7469, 2.1));
  const key = new THREE.DirectionalLight(0xffe2bd, 2.7);
  key.position.set(-4, 6, 7);
  const fill = new THREE.DirectionalLight(0xc4dcff, 1.0);
  fill.position.set(6, 1.5, 4);
  const rim = new THREE.DirectionalLight(0xfff1cf, 1.7);
  rim.position.set(2, 5, -6);
  scene.add(key, fill, rim);

  // ---------- Shared building blocks ----------
  const C = {
    pine: 0x1d6a48, pineDeep: 0x14533a, snow: 0xfbfdff,
    trunk: 0x6f4227, red: 0xc92f3f, berry: 0x8f2238, gold: 0xe9b64f, cream: 0xfff2da,
    green: 0x2b7a50, fur: 0x9a5e33, furLight: 0xe3bb8c, hoof: 0x4a2d1c, coal: 0x26262b,
    carrot: 0xf07b2b, pink: 0xf3a3a0, twig: 0x5d3b25, silver: 0xdfe4ea, plum: 0x8a2c4c,
  };
  const materialCache = new Map();
  function mat(color, { rough = 0.55, metal = 0, emissive = color === C.snow ? 0xcfe0f2 : 0x000000, glow = color === C.snow ? 0.16 : 0 } = {}) {
    const key = [color, rough, metal, emissive, glow].join();
    if (!materialCache.has(key)) {
      materialCache.set(key, new THREE.MeshStandardMaterial({
        color, roughness: rough, metalness: metal, emissive, emissiveIntensity: glow,
      }));
    }
    return materialCache.get(key);
  }
  const extraMaterials = [];
  const own = material => { extraMaterials.push(material); return material; };

  const geo = {
    sphere: new THREE.SphereGeometry(1, 32, 20),
    bead: new THREE.SphereGeometry(1, 12, 8),
    rounded: new THREE.RoundedBoxGeometry(1, 1, 1, 3, 0.07),
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 28),
    torus: new THREE.TorusGeometry(1, 0.26, 12, 28),
    plane: new THREE.PlaneGeometry(1, 1),
  };
  function add(parent, geometry, material, pos = [0, 0, 0], scale = 1, rot) {
    const item = new THREE.Mesh(geometry, material);
    item.position.set(...pos);
    if (Array.isArray(scale)) item.scale.set(...scale); else item.scale.setScalar(scale);
    if (rot) item.rotation.set(...rot);
    parent.add(item);
    return item;
  }
  const ball = (parent, material, pos, scale) => add(parent, geo.sphere, material, pos, scale);
  function limb(parent, material, a, b, r1, r2 = r1, cap = true) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const dir = end.clone().sub(start);
    const item = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, dir.length(), 12), material);
    item.position.addVectors(start, end).multiplyScalar(0.5);
    item.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    parent.add(item);
    if (cap) ball(parent, material, b, r2);
    return item;
  }
  function tube(parent, material, points, radius, closed = false, segments = 48) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), closed);
    return add(parent, new THREE.TubeGeometry(curve, segments, radius, 8, closed), material);
  }
  function radialTexture(stops, size = 128) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
    g.fillStyle = gradient;
    g.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  const shadowMaterial = own(new THREE.MeshBasicMaterial({
    map: radialTexture([[0, 'rgba(12,38,44,0.42)'], [0.5, 'rgba(12,38,44,0.18)'], [1, 'rgba(12,38,44,0)']]),
    transparent: true, depthWrite: false,
  }));
  const glowMaterial = own(new THREE.SpriteMaterial({
    map: radialTexture([[0, 'rgba(255,244,210,1)'], [0.2, 'rgba(255,214,140,0.6)'], [1, 'rgba(255,190,110,0)']]),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  // A seeded random keeps the composition identical on every visit.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  // ---------- The snowy island ----------
  const island = new THREE.Group();
  const REST_TILT = 0.3, REST_YAW = -0.18;
  island.rotation.set(REST_TILT, REST_YAW, 0);
  scene.add(island);
  const R = 2.6, ZS = 0.6, H = 0.3;
  const groundY = (x, z) => {
    const q = (x * x + (z / ZS) ** 2) / (R * R);
    return q >= 1 ? 0 : H * Math.sqrt(1 - q) + bump(x, z) * (1 - q);
  };
  const bump = (x, z) => 0.03 * Math.sin(x * 2.3 + 0.7) * Math.cos(z * 3.1 - 0.4);

  const profile = [new THREE.Vector2(0.001, -0.18), new THREE.Vector2(R * 0.93, -0.18), new THREE.Vector2(R * 0.985, -0.11)];
  for (let i = 0; i <= 28; i++) {
    const a = (i / 28) * Math.PI / 2;
    profile.push(new THREE.Vector2(Math.max(0.001, R * Math.cos(a)), H * Math.sin(a) - (i === 0 ? 0.03 : 0)));
  }
  const moundGeometry = new THREE.LatheGeometry(profile, 72);
  const moundPos = moundGeometry.attributes.position;
  for (let i = 0; i < moundPos.count; i++) {
    const y = moundPos.getY(i);
    if (y <= 0) continue;
    // The mesh is turned 180° below, so sample the ground at the turned position.
    const x = -moundPos.getX(i), z = -moundPos.getZ(i) * ZS;
    const q = Math.min(1, (x * x + (z / ZS) ** 2) / (R * R));
    moundPos.setY(i, y + bump(x, z) * (1 - q));
  }
  moundGeometry.computeVertexNormals();
  // Turn the lathe seam to the back, out of sight.
  add(island, moundGeometry, mat(C.snow, { rough: 0.92 }), [0, 0, 0], [1, 1, ZS], [0, Math.PI, 0]);
  add(island, geo.plane, shadowMaterial, [0.15, -0.2, 0.12], [R * 2.5, R * 2 * ZS * 1.5, 1], [-Math.PI / 2, 0, 0]).renderOrder = -1;
  // Soft drifts break the perfect oval silhouette.
  for (const [x, z, sx, sy] of [[-2.05, 0.62, 0.55, 0.13], [1.7, 0.86, 0.62, 0.12], [-0.6, 1.2, 0.5, 0.1], [2.25, -0.15, 0.45, 0.13], [-2.3, -0.55, 0.4, 0.12], [0.75, 1.24, 0.38, 0.09]]) {
    const zz = z * ZS;
    ball(island, mat(C.snow, { rough: 0.92 }), [x, groundY(x, zz) - 0.05, zz], [sx, sy, sx * 0.62]);
  }
  // A little pile of snowballs at the front.
  for (const [x, z, r] of [[0.62, 1.22, 0.1], [0.78, 1.18, 0.085], [0.7, 1.21, 0.075]]) {
    const y = groundY(x, z) + r * 0.75 + (r < 0.08 ? 0.12 : 0);
    ball(island, mat(C.snow, { rough: 0.9 }), [x, y, z], r);
  }
  function contactShadow(parent, x, z, rx, rz = rx * 0.75) {
    const item = add(parent, geo.plane, shadowMaterial, [x, groundY(x, z) + 0.035, z], [rx * 2, rz * 2, 1], [-Math.PI / 2, 0, 0]);
    item.renderOrder = 1;
    return item;
  }

  // ---------- Fir trees ----------
  function scallopedCone(radius, height, wave, droop, phase) {
    const cone = new THREE.ConeGeometry(radius, height, 64, 6);
    const pos = cone.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (Math.hypot(x, z) < 1e-4) continue;
      const t = (height / 2 - y) / height;
      const w = Math.sin(Math.atan2(z, x) * 12 + phase);
      const f = 1 + wave * w * t * t;
      pos.setXYZ(i, x * f, y - droop * t * t * t * Math.max(0, w), z * f);
    }
    cone.computeVertexNormals();
    return cone;
  }
  const TIERS = [[1.0, 0.86, 0.6], [0.82, 0.78, 1.0], [0.62, 0.7, 1.36], [0.42, 0.58, 1.68]];
  const surfacePoint = (tier, t, angle, lift = 0.02) => {
    const [r, h, y] = TIERS[tier];
    const rr = r * t + lift;
    return [Math.cos(angle) * rr, y + h / 2 - h * t, Math.sin(angle) * rr];
  };

  function fir(x, z, scale, snowy) {
    const group = new THREE.Group();
    group.position.set(x, groundY(x, z) - 0.03, z);
    group.scale.setScalar(scale);
    group.rotation.y = rand() * Math.PI;
    island.add(group);
    add(group, geo.cyl, mat(C.trunk, { rough: 0.85 }), [0, 0.15, 0], [0.11, 0.32, 0.11]);
    TIERS.forEach(([r, h, y], i) => {
      add(group, scallopedCone(r, h, 0.08, 0.08, i * 1.3), mat(i % 2 ? C.pine : C.pineDeep, { rough: 0.78 }), [0, y, 0]);
      if (!snowy) return;
      // Snow lying on each layer, dripping over the scalloped branch tips.
      const snowCap = scallopedCone(r * 0.62, h * 0.6, 0.14, 0.1, i * 1.3 + 0.6);
      add(group, snowCap, mat(C.snow, { rough: 0.9 }), [0, y + h / 2 - h * 0.3 + 0.02, 0], [1.04, 1, 1.04]);
    });
    contactShadow(island, x, z, 0.85 * scale);
    return group;
  }

  // Background pines give the diorama depth.
  fir(-1.15, -0.62, 0.5, true);
  fir(-1.95, -0.32, 0.36, true);
  fir(1.25, -0.6, 0.44, true);
  fir(2.0, -0.28, 0.3, true);

  // The decorated centre tree.
  const TREE_X = 0.1, TREE_Z = -0.42;
  const tree = fir(TREE_X, TREE_Z, 1, false);
  tree.rotation.y = 0;
  const lightSpots = [];
  TIERS.forEach((_, tier) => {
    // Bead garland swags around each layer.
    const swag = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const [px, py, pz] = surfacePoint(tier, 0.74 + 0.1 * Math.abs(Math.sin(a * 3)), a, 0.03);
      swag.push([px, py, pz]);
    }
    tube(tree, mat(tier % 2 ? C.silver : C.gold, { rough: 0.25, metal: 0.7 }), swag, 0.016, true, 96);
    const count = [9, 8, 6, 4][tier];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + tier * 0.6;
      const color = [C.red, C.gold, C.silver, C.plum][(i + tier) % 4];
      const material = mat(color, { rough: 0.18, metal: color === C.red || color === C.plum ? 0.35 : 0.75 });
      const pos = surfacePoint(tier, 0.93, a, 0.05);
      const size = tier === 3 ? 0.06 : 0.075;
      ball(tree, material, [pos[0], pos[1] - 0.03, pos[2]], size);
      ball(tree, mat(C.gold, { rough: 0.3, metal: 0.8 }), [pos[0], pos[1] + size * 0.95, pos[2]], [size * 0.32, size * 0.25, size * 0.32]);
    }
    const lightsHere = [12, 10, 8, 5][tier];
    for (let i = 0; i < lightsHere; i++) {
      const a = (i / lightsHere) * Math.PI * 2 + tier * 0.9 + 0.2;
      lightSpots.push(surfacePoint(tier, 0.55 + 0.3 * ((i * 7) % 3) / 2, a, 0.035));
    }
  });
  const LIGHT_COLORS = [0xffe2a0, 0xffe2a0, 0xff8f7e, 0xffd36b, 0xa8ecd6];
  const lightBulbs = new THREE.InstancedMesh(geo.bead, own(new THREE.MeshBasicMaterial({ toneMapped: false })), lightSpots.length);
  const dummy = new THREE.Object3D();
  const lightBase = lightSpots.map((spot, i) => {
    dummy.position.set(...spot);
    dummy.scale.setScalar(0.042);
    dummy.updateMatrix();
    lightBulbs.setMatrixAt(i, dummy.matrix);
    return { color: new THREE.Color(LIGHT_COLORS[i % LIGHT_COLORS.length]), phase: rand() * Math.PI * 2, speed: 1.4 + rand() * 1.8 };
  });
  lightBase.forEach((light, i) => lightBulbs.setColorAt(i, light.color));
  tree.add(lightBulbs);

  // Gold star on top.
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + i * Math.PI / 5;
    const r = i % 2 ? 0.11 : 0.25;
    if (i === 0) starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  starShape.closePath();
  const starGeometry = new THREE.ExtrudeGeometry(starShape, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.025, bevelSegments: 3 });
  starGeometry.center();
  const star = add(tree, starGeometry, mat(0xf3c457, { rough: 0.22, metal: 0.65, emissive: 0xffb93a, glow: 0.55 }), [0, 2.17, 0]);

  // Tree skirt.
  add(tree, geo.cyl, mat(C.red, { rough: 0.8 }), [0, 0.03, 0], [0.62, 0.04, 0.62]);
  add(tree, geo.torus, mat(C.cream, { rough: 0.95 }), [0, 0.05, 0], [0.62, 0.62, 0.16], [Math.PI / 2, 0, 0]);

  // ---------- Presents ----------
  function gift({ x, z, w, h, d, box, ribbon, rot = 0, y, dots }) {
    const group = new THREE.Group();
    group.position.set(x, y ?? groundY(x, z), z);
    group.rotation.y = rot;
    island.add(group);
    const lidH = Math.min(0.08, h * 0.2);
    add(group, geo.rounded, mat(box, { rough: 0.5 }), [0, (h - lidH) / 2, 0], [w, h - lidH, d]);
    add(group, geo.rounded, mat(box, { rough: 0.45 }), [0, h - lidH / 2, 0], [w * 1.07, lidH, d * 1.07]);
    const band = mat(ribbon, { rough: 0.3, metal: ribbon === C.gold ? 0.55 : 0.05 });
    add(group, geo.box, band, [0, h / 2, 0], [Math.min(w, d) * 0.17, h + 0.012, d * 1.085]);
    add(group, geo.box, band, [0, h / 2, 0], [w * 1.085, h + 0.012, Math.min(w, d) * 0.17]);
    if (dots) {
      for (const [fx, fy] of [[-0.28, 0.25], [0.3, 0.4], [-0.05, 0.62], [0.3, 0.1], [-0.32, 0.6]]) {
        ball(group, mat(dots, { rough: 0.6 }), [fx * w, fy * (h - lidH), d / 2 + 0.004], [0.034, 0.034, 0.008]);
        ball(group, mat(dots, { rough: 0.6 }), [w / 2 + 0.004, fy * (h - lidH), -fx * d], [0.008, 0.034, 0.034]);
      }
    }
    const s = Math.min(w, d) * 0.5;
    for (const side of [-1, 1]) {
      const loop = add(group, geo.torus, band, [side * s * 0.36, h + s * 0.26, 0], [s * 0.42, s * 0.3, s * 0.5]);
      loop.rotation.set(0, side * 0.35, side * 0.5);
      const tail = add(group, geo.box, band, [side * s * 0.28, h + 0.01, s * 0.3], [s * 0.16, 0.012, s * 0.55]);
      tail.rotation.set(0, side * 0.6, 0);
    }
    ball(group, band, [0, h + s * 0.12, 0], [s * 0.15, s * 0.13, s * 0.15]);
    if (y === undefined) contactShadow(island, x, z, Math.max(w, d) * 0.75);
    return group;
  }
  // Presents sit in front of the lowest branches so every one stays visible.
  const RED_X = -0.5, RED_Z = 0.72;
  gift({ x: RED_X, z: RED_Z, w: 0.5, h: 0.42, d: 0.46, box: C.red, ribbon: C.gold, rot: 0.35 });
  gift({ x: RED_X + 0.02, z: RED_Z + 0.01, y: groundY(RED_X, RED_Z) + 0.42, w: 0.28, h: 0.25, d: 0.28, box: C.cream, ribbon: C.red, rot: -0.35 });
  gift({ x: 0.66, z: 0.66, w: 0.42, h: 0.36, d: 0.4, box: C.green, ribbon: C.red, rot: -0.5, dots: C.cream });
  gift({ x: 0.08, z: 0.98, w: 0.38, h: 0.22, d: 0.3, box: 0xf1cf8a, ribbon: C.berry, rot: 0.12 });
  gift({ x: -0.98, z: 0.52, w: 0.26, h: 0.22, d: 0.26, box: C.plum, ribbon: C.gold, rot: 0.7, dots: C.gold });
  // A round hat box.
  {
    const x = 1.08, z = 0.92, group = new THREE.Group();
    group.position.set(x, groundY(x, z), z);
    island.add(group);
    add(group, geo.cyl, mat(C.cream, { rough: 0.55 }), [0, 0.1, 0], [0.16, 0.2, 0.16]);
    add(group, geo.cyl, mat(C.red, { rough: 0.5 }), [0, 0.215, 0], [0.175, 0.05, 0.175]);
    add(group, geo.box, mat(C.green, { rough: 0.35 }), [0, 0.12, 0], [0.035, 0.22, 0.34]);
    ball(group, mat(C.green, { rough: 0.35 }), [0, 0.26, 0], [0.045, 0.035, 0.045]);
    contactShadow(island, x, z, 0.22);
  }

  // ---------- Candy cane ----------
  {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 8;
    const g = c.getContext('2d');
    g.fillStyle = '#fff6ec'; g.fillRect(0, 0, 64, 8);
    g.fillStyle = '#d23446';
    for (let i = 0; i < 64; i += 16) g.fillRect(i, 0, 8, 8);
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.repeat.set(5, 1);
    const caneMaterial = own(new THREE.MeshStandardMaterial({ map: texture, roughness: 0.32 }));
    const x = -1.28, z = 0.98, base = groundY(x, z) - 0.06;
    const points = [[0, 0, 0], [0, 0.3, 0], [0.02, 0.43, 0], [0.09, 0.5, 0], [0.16, 0.47, 0], [0.19, 0.4, 0]];
    tube(island, caneMaterial, points.map(([px, py, pz]) => [x + px, base + py, z + pz]), 0.028, false, 40).rotation.y = 0;
  }

  // ---------- Reindeer ----------
  const reindeerParts = {};
  {
    const x = -1.62, z = 0.1;
    const root = new THREE.Group();
    root.position.set(x, groundY(x, z) - 0.02, z);
    root.rotation.y = -0.95;
    root.scale.setScalar(0.95);
    island.add(root);
    const fur = mat(C.fur, { rough: 0.72 }), light = mat(C.furLight, { rough: 0.8 });
    const hoof = mat(C.hoof, { rough: 0.55 }), antler = mat(0xc89a6a, { rough: 0.6 });
    for (const [lx, lz] of [[0.25, 0.12], [0.25, -0.12], [-0.23, 0.12], [-0.23, -0.12]]) {
      limb(root, fur, [lx, 0.58, lz], [lx * 1.04, 0.12, lz * 1.1], 0.07, 0.055, false);
      ball(root, hoof, [lx * 1.04, 0.07, lz * 1.1], [0.07, 0.06, 0.075]);
    }
    ball(root, fur, [0, 0.66, 0], [0.42, 0.28, 0.26]);
    ball(root, light, [0.02, 0.57, 0], [0.32, 0.18, 0.21]);
    ball(root, mat(C.cream, { rough: 0.9 }), [0.33, 0.72, 0], [0.13, 0.16, 0.17]);
    const tail = new THREE.Group();
    tail.position.set(-0.4, 0.76, 0);
    root.add(tail);
    ball(tail, mat(C.cream, { rough: 0.9 }), [-0.04, 0.03, 0], [0.07, 0.09, 0.06]);
    reindeerParts.tail = tail;

    const head = new THREE.Group();
    head.position.set(0.32, 0.8, 0);
    root.add(head);
    reindeerParts.head = head;
    limb(head, fur, [0, -0.04, 0], [0.07, 0.22, 0], 0.11, 0.1, false);
    // Red collar with a golden bell.
    add(head, geo.torus, mat(C.red, { rough: 0.5 }), [0.03, 0.04, 0], [0.12, 0.12, 0.17], [Math.PI / 2, 0.25, 0]);
    ball(head, mat(C.gold, { rough: 0.2, metal: 0.85 }), [0.14, -0.03, 0], 0.045);
    ball(head, fur, [0.12, 0.33, 0], [0.22, 0.2, 0.19]);
    ball(head, light, [0.29, 0.27, 0], [0.12, 0.1, 0.11]);
    reindeerParts.nose = ball(head, mat(0xe3283b, { rough: 0.25, emissive: 0xff2b3d, glow: 0.8 }), [0.4, 0.29, 0], 0.055);
    const eyes = new THREE.Group();
    eyes.position.set(0.24, 0.39, 0);
    head.add(eyes);
    for (const side of [-1, 1]) {
      ball(eyes, mat(C.coal, { rough: 0.25 }), [0, 0, side * 0.1], [0.032, 0.04, 0.026]);
      ball(eyes, mat(0xffffff, { rough: 0.2 }), [0.016, 0.014, side * 0.105], 0.009);
      ball(head, mat(C.pink, { rough: 0.8 }), [0.24, 0.28, side * 0.13], [0.045, 0.025, 0.02]);
      const ear = ball(head, fur, [0.03, 0.47, side * 0.16], [0.05, 0.11, 0.035]);
      ear.rotation.set(side * 1.05, 0, 0.25);
      const inner = ball(head, light, [0.04, 0.47, side * 0.165], [0.025, 0.07, 0.02]);
      inner.rotation.set(side * 1.05, 0, 0.25);
      // Branching antlers.
      tube(head, antler, [[0.04, 0.48, side * 0.08], [0.02, 0.62, side * 0.12], [-0.05, 0.76, side * 0.18], [-0.08, 0.86, side * 0.22]], 0.022, false, 24);
      limb(head, antler, [0.0, 0.67, side * 0.14], [0.09, 0.8, side * 0.17], 0.018, 0.016);
      limb(head, antler, [-0.05, 0.77, side * 0.18], [0.03, 0.9, side * 0.24], 0.016, 0.014);
      ball(head, antler, [-0.08, 0.86, side * 0.22], 0.022);
    }
    reindeerParts.eyes = eyes;
    contactShadow(island, x, z, 0.42, 0.26);
  }

  // ---------- Snowman ----------
  const snowmanParts = {};
  {
    const x = 1.66, z = 0.14;
    const root = new THREE.Group();
    root.position.set(x, groundY(x, z) - 0.05, z);
    root.rotation.y = 0.35;
    root.scale.setScalar(0.86);
    island.add(root);
    const snow = mat(C.snow, { rough: 0.85 }), coal = mat(C.coal, { rough: 0.35 });
    ball(root, snow, [0, 0.36, 0], [0.4, 0.38, 0.4]);
    const upper = new THREE.Group();
    upper.position.set(0, 0.64, 0);
    root.add(upper);
    snowmanParts.upper = upper;
    ball(upper, snow, [0, 0.26, 0], 0.29);
    ball(upper, snow, [0, 0.67, 0], 0.22);
    for (const dy of [0.36, 0.22, 0.08]) ball(upper, coal, [0, dy, Math.sqrt(0.29 ** 2 - (dy - 0.26) ** 2) + 0.01], 0.032);
    for (const side of [-1, 1]) {
      ball(upper, coal, [side * 0.075, 0.72, 0.2], [0.028, 0.034, 0.02]);
      ball(upper, mat(C.pink, { rough: 0.8 }), [side * 0.13, 0.63, 0.165], [0.04, 0.024, 0.02]);
    }
    for (let i = 0; i < 5; i++) {
      // Smile: the middle dot is lowest, the corners curl up.
      const a = -0.5 + i * 0.25;
      const mx = Math.sin(a) * 0.105, my = 0.585 + 0.12 * a * a;
      ball(upper, coal, [mx, my, Math.sqrt(0.22 ** 2 - mx * mx - (my - 0.67) ** 2) + 0.004], 0.016);
    }
    const nose = add(upper, new THREE.ConeGeometry(0.035, 0.2, 16), mat(C.carrot, { rough: 0.6 }), [0, 0.67, 0.3]);
    nose.rotation.x = Math.PI / 2;
    // Striped knit scarf.
    add(upper, geo.torus, mat(C.red, { rough: 0.85 }), [0, 0.47, 0], [0.2, 0.2, 0.22], [Math.PI / 2, 0, 0]);
    const scarfTail = new THREE.Group();
    scarfTail.position.set(0.11, 0.44, 0.16);
    scarfTail.rotation.set(0.15, 0, 0.18);
    upper.add(scarfTail);
    add(scarfTail, geo.rounded, mat(C.red, { rough: 0.85 }), [0, -0.14, 0], [0.1, 0.28, 0.035]);
    for (const dy of [-0.08, -0.18]) add(scarfTail, geo.box, mat(C.green, { rough: 0.85 }), [0, dy, 0], [0.104, 0.03, 0.04]);
    for (let i = 0; i < 4; i++) add(scarfTail, geo.box, mat(C.cream, { rough: 0.9 }), [-0.036 + i * 0.024, -0.3, 0], [0.012, 0.04, 0.012]);
    // Knit beanie with pom-pom.
    const hat = new THREE.Group();
    hat.position.set(0, 0.8, 0);
    hat.rotation.z = -0.18;
    upper.add(hat);
    ball(hat, mat(C.green, { rough: 0.85 }), [0, 0.03, 0], [0.2, 0.19, 0.2]);
    add(hat, geo.torus, mat(C.cream, { rough: 0.9 }), [0, -0.02, 0], [0.19, 0.19, 0.25], [Math.PI / 2, 0, 0]);
    ball(hat, mat(C.cream, { rough: 0.95 }), [0, 0.24, 0], 0.07);
    const twig = mat(C.twig, { rough: 0.8 }), mitten = mat(C.red, { rough: 0.8 });
    limb(upper, twig, [-0.25, 0.3, 0], [-0.56, 0.44, 0.04], 0.018, 0.014);
    limb(upper, twig, [-0.46, 0.39, 0.03], [-0.52, 0.55, 0.04], 0.012, 0.01);
    ball(upper, mitten, [-0.58, 0.45, 0.04], [0.05, 0.06, 0.045]);
    const arm = new THREE.Group();
    arm.position.set(0.25, 0.32, 0);
    upper.add(arm);
    snowmanParts.arm = arm;
    limb(arm, twig, [0, 0, 0], [0.24, 0.26, 0.04], 0.018, 0.014);
    limb(arm, twig, [0.17, 0.18, 0.03], [0.3, 0.2, 0.03], 0.012, 0.01);
    ball(arm, mitten, [0.26, 0.28, 0.04], [0.05, 0.06, 0.045]);
    contactShadow(island, x, z, 0.42, 0.3);
  }

  // Measure the composition before adding glow sprites so layout uses the solid shapes.
  scene.updateMatrixWorld(true);
  // Soft shadows are wider than the solid shapes, so they do not count.
  const restBounds = new THREE.Box3();
  island.traverse(object => {
    if (object.isMesh && object.material !== shadowMaterial) restBounds.expandByObject(object, false);
  });
  const boundsCenter = restBounds.getCenter(new THREE.Vector3());
  const boundsSize = restBounds.getSize(new THREE.Vector3());

  const starGlow = new THREE.Sprite(glowMaterial);
  starGlow.position.set(0, 2.17, 0.05);
  starGlow.scale.setScalar(0.95);
  tree.add(starGlow);
  const noseGlow = new THREE.Sprite(glowMaterial);
  noseGlow.position.set(0.42, 0.29, 0);
  noseGlow.scale.setScalar(0.22);
  reindeerParts.head.add(noseGlow);

  // Snow glints that twinkle on the ground.
  const glints = new THREE.InstancedMesh(geo.bead, own(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })), 22);
  const glintData = [];
  for (let i = 0; i < glints.count; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(0.15 + rand() * 0.8) * R * 0.95;
    const gx = Math.cos(a) * r, gz = Math.sin(a) * r * ZS;
    glintData.push({ pos: [gx, groundY(gx, gz) + 0.012, gz], phase: rand() * Math.PI * 2, speed: 0.8 + rand() * 1.2 });
  }
  island.add(glints);

  // ---------- Falling snow across the whole hero (pixel space) ----------
  const flakeTexture = radialTexture([[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.75)'], [1, 'rgba(255,255,255,0)']], 32);
  const snowLayers = [
    { count: 46, size: 2.6, speed: [12, 22], opacity: 0.6 },
    { count: 18, size: 4.6, speed: [22, 36], opacity: 0.85 },
  ].map(layer => {
    const positions = new Float32Array(layer.count * 3);
    const geometry = new THREE.BufferGeometry();
    const attribute = new THREE.BufferAttribute(positions, 3);
    attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', attribute);
    const material = own(new THREE.PointsMaterial({
      size: layer.size, map: flakeTexture, transparent: true, opacity: layer.opacity,
      depthWrite: false, sizeAttenuation: false, toneMapped: false,
    }));
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    scene.add(points);
    const flakes = Array.from({ length: layer.count }, () => ({
      u: rand(), v: rand(), speed: layer.speed[0] + rand() * (layer.speed[1] - layer.speed[0]),
      sway: 6 + rand() * 12, phase: rand() * Math.PI * 2,
    }));
    return { ...layer, attribute, flakes };
  });

  // ---------- Motion, visibility and layout ----------
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const printMedia = matchMedia('print');
  const preferenceKey = 'nomikai_christmas_motion';
  let preference;
  try { preference = localStorage.getItem(preferenceKey); } catch { /* Storage is optional. */ }
  let paused = preference ? preference === 'paused' : reducedMotion.matches;
  let elapsed = 0, lastFrame = 0, width = 0, height = 0;
  let onScreen = true, lost = false, disposed = false, layoutRequest = 0;

  function updateToggle() {
    toggle.textContent = paused ? '▶ 飾りを動かす' : 'Ⅱ 飾りの動きを止める';
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.setAttribute('aria-label', 'クリスマスの飾りの動きを停止');
  }

  function animate(t, dt) {
    island.rotation.y = REST_YAW + Math.sin(t * 0.16) * 0.09;
    star.rotation.y = Math.sin(t * 0.8) * 0.55;
    starGlow.scale.setScalar(0.9 + Math.sin(t * 2.1) * 0.08);
    lightBase.forEach((light, i) => {
      const k = 0.5 + 0.5 * Math.sin(t * light.speed + light.phase);
      lightBulbs.setColorAt(i, dummyColor.copy(light.color).multiplyScalar(0.55 + 0.85 * k * k));
    });
    lightBulbs.instanceColor.needsUpdate = true;
    glintData.forEach((glint, i) => {
      const k = Math.max(0, Math.sin(t * glint.speed + glint.phase));
      dummy.position.set(...glint.pos);
      dummy.scale.setScalar(0.004 + 0.022 * k ** 6);
      dummy.updateMatrix();
      glints.setMatrixAt(i, dummy.matrix);
    });
    glints.instanceMatrix.needsUpdate = true;
    const { head, tail, eyes } = reindeerParts;
    head.rotation.z = Math.sin(t * 1.1) * 0.07 - 0.02;
    head.rotation.x = Math.sin(t * 0.55) * 0.06;
    tail.rotation.y = Math.sin(t * 6) * 0.35;
    eyes.scale.y = (t % 4.3) < 0.13 ? 0.15 : 1;
    noseGlow.scale.setScalar(0.2 + Math.sin(t * 2.6) * 0.04);
    snowmanParts.upper.rotation.z = Math.sin(t * 0.9) * 0.025;
    snowmanParts.arm.rotation.z = 0.15 + Math.sin(t * 2.4) * 0.22;
    for (const layer of snowLayers) {
      const array = layer.attribute.array;
      layer.flakes.forEach((flake, i) => {
        flake.v += (flake.speed * dt) / Math.max(height, 1);
        if (flake.v > 1.05) { flake.v -= 1.1; flake.u = rand(); }
        array[i * 3] = (flake.u - 0.5) * width + Math.sin(t * 0.7 + flake.phase) * flake.sway;
        array[i * 3 + 1] = (0.5 - flake.v) * height;
        array[i * 3 + 2] = 600;
      });
      layer.attribute.needsUpdate = true;
    }
  }
  const dummyColor = new THREE.Color();

  function draw(dt = 0) {
    if (lost || !width || !height) return;
    animate(elapsed, dt);
    renderer.render(scene, camera);
  }
  function frame(now) {
    if (lastFrame && now - lastFrame < 1000 / 32) return;
    const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.1) : 0;
    elapsed += dt;
    lastFrame = now;
    draw(dt);
  }
  function syncAnimation() {
    if (disposed) return;
    lastFrame = 0;
    const running = !paused && onScreen && width > 0 && !document.hidden && !lost && !printMedia.matches;
    if (!running) draw();
    renderer.setAnimationLoop(running ? frame : null);
  }

  function layout() {
    if (disposed) return;
    const heroRect = hero.getBoundingClientRect();
    width = Math.round(heroRect.width);
    height = Math.round(heroRect.height);
    if (!width || !height) { syncAnimation(); return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    camera.left = -width / 2; camera.right = width / 2;
    camera.top = height / 2; camera.bottom = -height / 2;
    camera.updateProjectionMatrix();
    const slotRect = slot.getBoundingClientRect();
    const sx = slotRect.left - heroRect.left, sy = slotRect.top - heroRect.top;
    // Contain the whole diorama inside the slot that CSS reserves for it,
    // standing on the slot's bottom edge. 0.92 leaves room for the idle sway.
    const scale = Math.max(1, Math.min(slotRect.width / boundsSize.x, slotRect.height / boundsSize.y) * 0.92);
    island.scale.setScalar(scale);
    island.position.set(
      sx + slotRect.width / 2 - width / 2 - boundsCenter.x * scale,
      height / 2 - (sy + slotRect.height) - restBounds.min.y * scale,
      0,
    );
    syncAnimation();
  }
  function scheduleLayout() {
    if (disposed || layoutRequest) return;
    layoutRequest = requestAnimationFrame(() => { layoutRequest = 0; layout(); });
  }
  const resizeObserver = new ResizeObserver(scheduleLayout);
  resizeObserver.observe(hero);
  resizeObserver.observe(slot);
  const intersectionObserver = new IntersectionObserver(entries => {
    onScreen = entries.some(entry => entry.isIntersecting);
    syncAnimation();
  });
  intersectionObserver.observe(hero);
  document.fonts?.ready.then(scheduleLayout);

  toggle.addEventListener('click', event => {
    event.stopPropagation();
    paused = !paused;
    preference = paused ? 'paused' : 'playing';
    try { localStorage.setItem(preferenceKey, preference); } catch { /* Storage is optional. */ }
    updateToggle();
    syncAnimation();
  });
  const onMotionChange = () => {
    if (!preference) { paused = reducedMotion.matches; updateToggle(); syncAnimation(); }
  };
  const onContextLost = event => { event.preventDefault(); lost = true; syncAnimation(); };
  const onContextRestored = () => { lost = false; layout(); };
  reducedMotion.addEventListener('change', onMotionChange);
  printMedia.addEventListener('change', syncAnimation);
  document.addEventListener('visibilitychange', syncAnimation);
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);

  // Release GPU resources on navigation, while allowing back/forward-cache restoration.
  window.addEventListener('pagehide', event => {
    renderer.setAnimationLoop(null);
    if (event.persisted) return;
    disposed = true;
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    cancelAnimationFrame(layoutRequest);
    reducedMotion.removeEventListener('change', onMotionChange);
    printMedia.removeEventListener('change', syncAnimation);
    document.removeEventListener('visibilitychange', syncAnimation);
    const geometries = new Set(), textures = new Set();
    scene.traverse(object => { if (object.geometry) geometries.add(object.geometry); });
    geometries.forEach(geometry => geometry.dispose());
    [...materialCache.values(), ...extraMaterials].forEach(material => {
      if (material.map) textures.add(material.map);
      material.dispose();
    });
    textures.forEach(texture => texture.dispose());
    renderer.dispose();
  });
  window.addEventListener('pageshow', syncAnimation);
  updateToggle();
  layout();
}
