import * as THREE from './assets/vendor/three/three.module.js';

// Decorative only: accounting and saved event data do not depend on WebGL.
function startWhenReady() {
  try {
    startChristmasScene();
  } catch (error) {
    console.warn('Christmas decorations are unavailable.', error);
    document.getElementById('christmasStage')?.remove();
    document.querySelector('.christmas-motion-toggle')?.remove();
  }
}
const splash = document.getElementById('splashScreen');
if (splash) {
  // Do not create or display a 3D scene until the welcome screen has closed.
  const observer = new MutationObserver(() => {
    if (!splash.isConnected) { observer.disconnect(); startWhenReady(); }
  });
  observer.observe(document.body, { childList: true });
} else {
  startWhenReady();
}

function startChristmasScene() {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;

  const stage = document.createElement('div');
  stage.id = 'christmasStage';
  stage.className = 'christmas-float-stage';
  stage.setAttribute('aria-hidden', 'true');
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'sidebar-action christmas-motion-toggle';
  stage.append(canvas);
  document.body.append(stage);
  document.querySelector('.sidebar-footer').append(toggle);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);
  camera.position.z = 1000;
  scene.add(new THREE.HemisphereLight(0xfff7e3, 0x749c91, 2.8));
  const key = new THREE.DirectionalLight(0xffedd2, 3.4);
  key.position.set(-3, 5, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xddefff, 2);
  rim.position.set(4, 2, -3);
  scene.add(rim);

  const materials = {};
  const palette = {
    red: 0xc83245, berry: 0x9c233b, green: 0x287756, pine: 0x15563f,
    gold: 0xe6b752, cream: 0xfff5df, skin: 0xffc9a0, brown: 0xa56b42,
    tan: 0xe7b87b, antler: 0x74462f, black: 0x252d2e, pink: 0xe9968c,
  };
  for (const [name, color] of Object.entries(palette)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color, roughness: name === 'gold' ? 0.27 : 0.48, metalness: name === 'gold' ? 0.5 : 0.04,
    });
  }
  const sphere = new THREE.SphereGeometry(1, 20, 14);
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const rounded = new THREE.RoundedBoxGeometry(1, 1, 1, 2, 0.12);

  function mesh(parent, geometry, color, position = [0, 0, 0], scale = [1, 1, 1]) {
    const item = new THREE.Mesh(geometry, materials[color]);
    item.position.set(...position);
    item.scale.set(...scale);
    parent.add(item);
    return item;
  }
  const ball = (parent, color, pos, size) => mesh(parent, sphere, color, pos, Array.isArray(size) ? size : [size, size, size]);
  const box = (parent, color, pos, size, soft = false) => mesh(parent, soft ? rounded : cube, color, pos, size);
  function ring(parent, color, pos, radius, tube, rotation = [0, 0, 0]) {
    const item = mesh(parent, new THREE.TorusGeometry(radius, tube, 8, 32), color, pos);
    item.rotation.set(...rotation);
    return item;
  }
  function limb(parent, color, start, end, radius) {
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
    const delta = b.clone().sub(a);
    const item = mesh(parent, new THREE.CylinderGeometry(radius, radius, delta.length(), 10), color);
    item.position.copy(a.add(b).multiplyScalar(0.5));
    item.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    ball(parent, color, end, radius);
    return item;
  }
  function eye(parent, x, y, z, size = 0.065) {
    ball(parent, 'black', [x, y, z], [size, size * 1.2, size * 0.6]);
    ball(parent, 'cream', [x - size * 0.25, y + size * 0.35, z + size * 0.5], size * 0.26);
  }
  function star(parent, pos, radius) {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const angle = Math.PI / 2 + i * Math.PI / 5;
      const r = radius * (i % 2 ? 0.45 : 1);
      const x = Math.cos(angle) * r, y = Math.sin(angle) * r;
      if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    shape.closePath();
    return mesh(parent, new THREE.ExtrudeGeometry(shape, {
      depth: 0.09, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2, steps: 1,
    }), 'gold', pos);
  }

  function gift() {
    const group = new THREE.Group();
    box(group, 'red', [0, -0.1, 0], [1.65, 1.45, 1.5], true);
    box(group, 'berry', [0, 0.66, 0], [1.77, 0.22, 1.62], true);
    box(group, 'gold', [0, -0.025, 0], [0.25, 1.6, 1.64]);
    box(group, 'gold', [0, -0.025, 0], [1.79, 1.6, 0.24]);
    for (const side of [-1, 1]) {
      const loop = ring(group, 'gold', [side * 0.3, 0.98, 0], 0.29, 0.075);
      loop.scale.set(1.2, 0.75, 1);
      loop.rotation.z = side * 0.5;
    }
    ball(group, 'gold', [0, 0.9, 0.04], 0.13);
    return group;
  }

  function reindeer() {
    const group = new THREE.Group();
    ball(group, 'brown', [0, -0.33, 0], [0.59, 0.7, 0.49]);
    ball(group, 'tan', [0, -0.34, 0.4], [0.36, 0.46, 0.13]);
    for (const side of [-1, 1]) {
      ball(group, 'brown', [side * 0.34, -0.9, 0.14], [0.19, 0.35, 0.2]);
      box(group, 'antler', [side * 0.34, -1.12, 0.2], [0.35, 0.23, 0.4], true);
      const arm = ball(group, 'brown', [side * 0.61, -0.25, 0], [0.18, 0.4, 0.19]);
      arm.rotation.z = side * 0.4;
      const ear = ball(group, 'brown', [side * 0.68, 1, 0], [0.27, 0.4, 0.16]);
      ear.rotation.z = -side * 0.9;
      const inner = ball(group, 'tan', [side * 0.7, 1.02, 0.12], [0.15, 0.25, 0.06]);
      inner.rotation.z = -side * 0.9;
      limb(group, 'antler', [side * 0.38, 1.12, -0.1], [side * 0.49, 1.85, -0.1], 0.065);
      limb(group, 'antler', [side * 0.46, 1.57, -0.1], [side * 0.75, 1.8, -0.1], 0.055);
      limb(group, 'antler', [side * 0.43, 1.41, -0.1], [side * 0.25, 1.65, -0.1], 0.055);
    }
    ball(group, 'brown', [0, 0.64, 0.07], [0.68, 0.62, 0.55]);
    ball(group, 'tan', [0, 0.42, 0.56], [0.4, 0.28, 0.2]);
    ball(group, 'red', [0, 0.56, 0.75], [0.2, 0.17, 0.16]);
    ball(group, 'cream', [-0.05, 0.62, 0.88], 0.034);
    eye(group, -0.28, 0.76, 0.56);
    eye(group, 0.28, 0.76, 0.56);
    ring(group, 'green', [0, 0.13, 0], 0.45, 0.13, [Math.PI / 2, 0, 0]);
    box(group, 'green', [-0.23, -0.15, 0.5], [0.22, 0.48, 0.1], true).rotation.z = -0.15;
    ball(group, 'gold', [0.12, 0.02, 0.55], 0.12);
    return group;
  }

  function tree() {
    const group = new THREE.Group();
    mesh(group, new THREE.CylinderGeometry(0.17, 0.2, 0.5, 12), 'antler', [0, -0.95, 0]);
    for (const [r, h, y, color] of [[0.91, 1.04, -0.4, 'pine'], [0.7, 1.02, 0.12, 'green'], [0.48, 0.94, 0.62, 'pine']]) {
      mesh(group, new THREE.ConeGeometry(r, h, 32), color, [0, y, 0]);
      ring(group, 'cream', [0, y - h / 2 + 0.05, 0], r * 0.94, 0.035, [Math.PI / 2, 0, 0]);
    }
    const points = [];
    for (let i = 0; i <= 70; i++) {
      const t = i / 70, angle = t * Math.PI * 5.4;
      const r = 0.77 * (1 - t) + 0.08;
      points.push(new THREE.Vector3(Math.cos(angle) * r, -0.78 + t * 1.8, Math.sin(angle) * r));
    }
    mesh(group, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 70, 0.025, 6, false), 'gold');
    for (let i = 0; i < 12; i++) {
      const level = Math.floor(i / 4), angle = (i % 4) * Math.PI / 2 + level * 0.5;
      const r = [0.73, 0.55, 0.31][level];
      ball(group, i % 2 ? 'gold' : 'red', [Math.sin(angle) * r, -0.62 + level * 0.55, Math.cos(angle) * r], 0.1);
    }
    star(group, [0, 1.34, -0.04], 0.27);
    return group;
  }

  function santa() {
    const group = new THREE.Group();
    ball(group, 'red', [0, -0.4, 0], [0.7, 0.76, 0.53]);
    for (const side of [-1, 1]) {
      box(group, 'black', [side * 0.3, -1.06, 0.2], [0.46, 0.33, 0.62], true);
      limb(group, 'red', [side * 0.48, -0.04, 0], [side * 0.91, -0.32, 0.06], 0.2);
      ball(group, 'cream', [side * 0.9, -0.31, 0.06], [0.13, 0.23, 0.22]);
      ball(group, 'skin', [side * 1.05, -0.3, 0.08], 0.18);
    }
    ring(group, 'black', [0, -0.42, 0], 0.58, 0.1, [Math.PI / 2, 0, 0]).scale.set(1.1, 0.82, 1);
    box(group, 'gold', [0, -0.42, 0.56], [0.3, 0.26, 0.08], true);
    box(group, 'black', [0, -0.42, 0.61], [0.15, 0.12, 0.03]);
    for (let i = 0; i < 3; i++) ball(group, 'cream', [0, -0.74 + i * 0.38, 0.49], 0.07);
    ball(group, 'skin', [0, 0.62, 0.04], [0.65, 0.6, 0.54]);
    ball(group, 'cream', [0, 0.25, 0.45], [0.58, 0.47, 0.22]);
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + i * Math.PI / 6;
      ball(group, 'cream', [Math.cos(a) * 0.47, 0.31 + Math.sin(a) * 0.32, 0.51], 0.15);
    }
    ball(group, 'skin', [0, 0.57, 0.64], [0.16, 0.13, 0.15]);
    for (const side of [-1, 1]) {
      ball(group, 'cream', [side * 0.16, 0.45, 0.65], [0.22, 0.09, 0.1]).rotation.z = side * 0.2;
      eye(group, side * 0.24, 0.76, 0.53, 0.055);
      ball(group, 'pink', [side * 0.4, 0.59, 0.49], [0.1, 0.06, 0.035]);
      ball(group, 'cream', [side * 0.24, 0.91, 0.5], [0.16, 0.05, 0.06]);
    }
    ring(group, 'cream', [0, 1.04, 0], 0.56, 0.14, [Math.PI / 2, 0, 0]);
    const hat = new THREE.ConeGeometry(0.6, 0.92, 28, 8);
    const positions = hat.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const t = (positions.getY(i) + 0.46) / 0.92;
      positions.setX(i, positions.getX(i) + t * t * 0.42);
    }
    hat.computeVertexNormals();
    mesh(group, hat, 'red', [0, 1.48, 0]);
    ball(group, 'cream', [0.42, 1.94, 0], 0.19);
    return group;
  }

  const ornaments = [gift(), reindeer(), tree(), santa()].map((model, index) => {
    // Normalize each toy to a unit height so responsive layout uses CSS pixels.
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    model.position.sub(bounds.getCenter(new THREE.Vector3()));
    const root = new THREE.Group();
    root.add(model);
    root.scale.setScalar(1 / size.y);
    const anchor = new THREE.Group();
    anchor.add(root);
    scene.add(anchor);
    return { anchor, root, phase: index * 1.7, documentY: 0, baseX: 0, size: 0, fixed: false, placed: false };
  });

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const printMedia = matchMedia('print');
  const preferenceKey = 'nomikai_christmas_motion';
  let preference;
  try { preference = localStorage.getItem(preferenceKey); } catch { /* Storage is optional. */ }
  let paused = preference ? preference === 'paused' : reducedMotion.matches;
  let elapsed = 0, lastFrame = 0, visible = true, lost = false, disposed = false;
  let width = 1, height = 1, headerHeight = 0, leftEdge = 0, layoutRequest = 0, scrollRequest = 0;

  function updateToggle() {
    toggle.textContent = paused ? '▶ 飾りを動かす' : 'Ⅱ 動きを止める';
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.setAttribute('aria-label', 'クリスマスの飾りの動きを停止');
    stage.dataset.motion = paused ? 'paused' : 'playing';
  }
  function draw() {
    visible = false;
    ornaments.forEach(({ anchor, root, phase, documentY, baseX, size, placed, fixed }) => {
      const viewportY = documentY - (fixed ? 0 : window.scrollY);
      anchor.visible = placed && (fixed ? viewportY + size > 0 : viewportY - size * 0.65 > headerHeight) && viewportY - size < height;
      visible ||= anchor.visible;
      anchor.position.x = baseX + Math.sin(elapsed * 0.3 + phase) * size * 0.015;
      anchor.position.y = height / 2 - viewportY + Math.sin(elapsed * 0.38 + phase) * size * 0.04;
      root.rotation.set(
        0.08 + Math.sin(elapsed * 0.3 + phase) * 0.025,
        -0.15 + Math.sin(elapsed * 0.25 + phase) * 0.12,
        Math.sin(elapsed * 0.3 + phase) * 0.035,
      );
    });
    // Header/sidebar ornaments occupy measured empty regions; the other toys
    // scroll with the page and disappear before reaching the sticky header.
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.setScissor(0, 0, width, height);
    renderer.setScissorTest(true);
    renderer.render(scene, camera);
  }
  function frame(now) {
    if (lastFrame && now - lastFrame < 1000 / 30) return;
    if (lastFrame) elapsed += Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;
    draw();
  }
  function syncAnimation() {
    if (disposed) return;
    lastFrame = 0;
    if (!lost && !document.hidden) draw();
    renderer.setAnimationLoop(!paused && !document.hidden && visible && !lost && !printMedia.matches ? frame : null);
  }

  function documentRect(element) {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top + scrollY, bottom: rect.bottom + scrollY, width: rect.width, height: rect.height };
  }
  const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

  function layout() {
    if (disposed) return;
    const rect = stage.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    const mobile = width <= 700;
    leftEdge = mobile ? 0 : document.getElementById('sidebar').getBoundingClientRect().right;
    const header = document.querySelector('.mobile-header');
    headerHeight = mobile ? header.getBoundingClientRect().height : 0;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.25 : 1.5));
    renderer.setSize(width, height);
    camera.left = -width / 2; camera.right = width / 2;
    camera.top = height / 2; camera.bottom = -height / 2;
    camera.updateProjectionMatrix();
    const content = document.getElementById('content');
    const contentRect = documentRect(content);
    const contentStyle = getComputedStyle(content);
    const innerLeft = contentRect.left + parseFloat(contentStyle.paddingLeft);
    const innerRight = contentRect.right - parseFloat(contentStyle.paddingRight);
    const zones = [];

    // Only deliberately decorative whitespace is eligible. Never search inside
    // accounting cards, tables, forms, or the gaps between their rows.
    const hero = document.querySelector('.party-hero');
    if (hero && hero.getBoundingClientRect().width >= 580) {
      const heroRect = documentRect(hero);
      const copy = hero.querySelector('.party-hero-copy');
      const walker = document.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      let textRight = heroRect.left, node;
      while ((node = walker.nextNode())) {
        if (!node.textContent.trim()) continue;
        range.selectNodeContents(node);
        for (const textRect of range.getClientRects()) textRight = Math.max(textRight, textRect.right);
      }
      const left = textRight + 14;
      const right = documentRect(hero.querySelector('.party-hero-art')).left - 12;
      const top = heroRect.top + 35, bottom = heroRect.bottom - 24;
      if (right - left >= 220) {
        const middle = (left + right) / 2;
        zones.push({ index: 1, size: 72, left, right: middle - 6, top, bottom, yBias: 0.38 });
        zones.push({ index: 2, size: 62, left: middle + 6, right, top, bottom, yBias: 0.7 });
      } else {
        zones.push({ index: 1, size: 64, left, right, top, bottom });
      }
    }

    // The unused part of the event list is decorative space, unlike a blank
    // cell in a budget card. Longer event lists automatically reclaim it.
    if (!mobile) {
      const list = document.getElementById('eventList');
      const listRect = documentRect(list);
      const lastBottom = Math.max(listRect.top, ...[...list.children].map(element => documentRect(element).bottom));
      const top = lastBottom + 8;
      const bottom = Math.min(listRect.bottom, documentRect(document.getElementById('btnNewEvent')).top) - 8;
      if (bottom - top >= 145) {
        const middle = (listRect.left + listRect.right) / 2;
        zones.push({ index: 0, size: 56, fixed: true, left: listRect.left + 10, right: middle - 3, top, bottom, yBias: 0.36 });
        zones.push({ index: 3, size: 62, fixed: true, left: middle + 3, right: listRect.right - 10, top, bottom, yBias: 0.68 });
      } else {
        zones.push({ index: 0, size: 52, fixed: true, left: listRect.left + 12, right: listRect.right - 12, top, bottom });
      }
    } else {
      const menu = documentRect(document.getElementById('btnMenu'));
      const title = documentRect(document.querySelector('.mobile-title'));
      const headerRect = documentRect(header);
      zones.push({ index: 0, size: 32, fixed: true, left: menu.right + 6, right: title.left - 6, top: headerRect.top + 5, bottom: headerRect.bottom - 5 });
    }

    // On shorter/narrower desktop windows the list may have no spare room.
    // The gap between the two page captions still provides a clear small spot.
    const eyebrow = content.querySelector('.page-eyebrow');
    if (eyebrow?.children.length >= 2) {
      const labelRect = documentRect(eyebrow);
      zones.push({ index: 0, size: 32, left: documentRect(eyebrow.firstElementChild).right + 6, right: documentRect(eyebrow.lastElementChild).left - 6, top: labelRect.top - 10, bottom: labelRect.bottom + 12 });
    }

    const gutterTop = Math.max(contentRect.top + 140, headerHeight + 60);
    const gutterBottom = Math.min(contentRect.bottom - 60, Math.max(height - 60, gutterTop + 120));
    if (!mobile) {
      zones.push({ index: 0, size: 58, left: leftEdge + 12, right: innerLeft - 20, top: gutterTop, bottom: gutterBottom });
      zones.push({ index: 2, size: 62, left: innerRight + 20, right: width - 12, top: gutterTop, bottom: gutterBottom });
    }

    // A short page can have genuinely unused space below all of its controls.
    const page = [...content.querySelectorAll(':scope > div')].find(element =>
      ['eventDetail', 'dashboardPage', 'membersPage', 'emptyState'].includes(element.id) && element.getBoundingClientRect().height > 0);
    if (page) {
      zones.push({ index: 3, size: mobile ? 40 : 62, left: innerRight - 180, right: innerRight - 12, top: documentRect(page).bottom + 40, bottom: height - 40 });
    }

    const protectedAreas = [...document.querySelectorAll('.layout .card, .layout .summary-grid, .layout .per-person-bar, .layout .carry-forward-bar, .layout .detail-titlebar, .layout .event-shortcuts, .layout .backup-banner, .layout .page-eyebrow > span, .layout button, .layout input, .layout select, .layout textarea, .mobile-title, .mobile-avatar, .sidebar button, .sidebar .event-item, .sidebar-header, .sidebar-section-label, .sidebar-cheer, .sidebar-footer')]
      .filter(element => element.getBoundingClientRect().height > 0)
      .map(element => {
        const area = documentRect(element);
        const fixed = Boolean(element.closest('.mobile-header, .sidebar'));
        const padding = fixed ? 5 : element.closest('.page-eyebrow') ? 6 : 16;
        return { left: area.left - padding, right: area.right + padding, top: area.top - padding, bottom: area.bottom + padding, fixed };
      });
    ornaments.forEach(item => { item.placed = false; });
    let placed = 0;
    const occupied = [];
    for (const zone of zones) {
      if (placed >= 4) break;
      if (ornaments[zone.index].placed) continue;
      const size = zone.size;
      const clearance = size * 0.62 + 4;
      if (zone.right - zone.left < clearance * 2 || zone.bottom - zone.top < clearance * 2) continue;
      const x = (zone.left + zone.right) / 2;
      const y = Math.max(zone.top + clearance, Math.min(zone.bottom - clearance, zone.top + (zone.bottom - zone.top) * (zone.yBias ?? 0.5)));
      const bounds = { left: x - clearance, right: x + clearance, top: y - clearance, bottom: y + clearance };
      if (protectedAreas.some(area => area.fixed === Boolean(zone.fixed) && intersects(bounds, area)) || occupied.some(area => intersects(bounds, area))) continue;
      const item = ornaments[zone.index];
      item.baseX = x - width / 2;
      item.documentY = y - (zone.fixed ? scrollY : 0);
      item.size = size;
      item.fixed = Boolean(zone.fixed);
      item.placed = true;
      item.anchor.scale.setScalar(size);
      occupied.push(bounds);
      placed++;
    }
    toggle.classList.toggle('hidden', placed === 0);
    syncAnimation();
  }

  function scheduleLayout() {
    if (disposed || layoutRequest) return;
    layoutRequest = requestAnimationFrame(() => { layoutRequest = 0; layout(); });
  }
  const resizeObserver = new ResizeObserver(scheduleLayout);
  resizeObserver.observe(stage);
  resizeObserver.observe(document.querySelector('.layout'));
  resizeObserver.observe(document.getElementById('eventList'));
  const contentObserver = new MutationObserver(scheduleLayout);
  contentObserver.observe(document.querySelector('.layout'), { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  contentObserver.observe(document.getElementById('eventList'), { subtree: true, childList: true, characterData: true });
  document.fonts?.ready.then(scheduleLayout);
  const onScroll = () => {
    if (scrollRequest || disposed) return;
    scrollRequest = requestAnimationFrame(() => {
      scrollRequest = 0;
      const wasVisible = visible;
      if (!lost) draw();
      if (wasVisible !== visible) syncAnimation();
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });

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
  const onContextRestored = () => { lost = false; layout(); syncAnimation(); };
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
    resizeObserver.disconnect(); contentObserver.disconnect();
    cancelAnimationFrame(layoutRequest); cancelAnimationFrame(scrollRequest);
    reducedMotion.removeEventListener('change', onMotionChange);
    printMedia.removeEventListener('change', syncAnimation);
    document.removeEventListener('visibilitychange', syncAnimation);
    window.removeEventListener('scroll', onScroll);
    const geometries = new Set();
    scene.traverse(object => { if (object.geometry) geometries.add(object.geometry); });
    geometries.forEach(geometry => geometry.dispose());
    Object.values(materials).forEach(material => material.dispose());
    renderer.dispose();
  });
  window.addEventListener('pageshow', syncAnimation);
  updateToggle();
  layout();
}
