// Homepage hero: the logo pig as voxels, two glowing orbit rings as the light,
// and tumbling debris that parts around the pointer. If anything here fails the
// static <img> logo stays on screen, so there is never an empty hero.
import * as THREE from 'three';

const hero = document.querySelector('.hero');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const ACCENT = 0xd9835f;
const GLOW = 0xffc9a8;

// Sampled from logo.jpg on its 30px pixel grid, top row first.
const PIG = [
  '.##............................##.',
  '.##............................##.',
  '.##.....###.............##.....##.',
  '##################################',
  '.##....####............####....##.',
  '.##...####..............####...##.',
  '.##...###................###...##.',
  '......###................###......',
  '......###..############..###......',
  '......####.############.####......',
  '......#######.######.#######......',
  '......#######.######.#######......',
  '.......####################.......',
  '........##################........',
  '...........############...........',
  '...........############...........',
  '............#.#....#.#............',
  '............#.#....#.#............',
];
const VOXEL = 0.1;

function buildPig() {
  const cells = [];
  PIG.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === '#') cells.push([(c - (row.length - 1) / 2) * VOXEL, ((PIG.length - 1) / 2 - r) * VOXEL]);
  }));
  // One bevelled voxel, instanced across the logo. The edges catch the ring light.
  const half = VOXEL * 0.4;
  const shape = new THREE.Shape();
  shape.moveTo(-half, -half);
  shape.lineTo(half, -half);
  shape.lineTo(half, half);
  shape.lineTo(-half, half);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: VOXEL * 2.4, steps: 1, bevelEnabled: true,
    bevelSegments: 1, bevelSize: VOXEL * 0.07, bevelThickness: VOXEL * 0.07,
  });
  geometry.translate(0, 0, -VOXEL * 1.2);
  const mesh = new THREE.InstancedMesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: ACCENT, roughness: 0.38, metalness: 0.18, emissive: ACCENT, emissiveIntensity: 0.08 }),
    cells.length,
  );
  const m = new THREE.Matrix4();
  cells.forEach(([x, y], i) => mesh.setMatrixAt(i, m.makeTranslation(x, y, 0)));
  return mesh;
}

function ring(radius) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.009, 8, 160),
    new THREE.MeshBasicMaterial({ color: GLOW, toneMapped: false }),
  ));
  // Two faint shoulders soften the glow without a full-screen bloom pass.
  g.add(new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.028, 8, 160),
    new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  ));
  g.add(new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.075, 8, 160),
    new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.025, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  ));
  const light = new THREE.PointLight(GLOW, 8, 0, 2);
  // Positive local Y becomes positive world Z, facing the camera.
  light.position.set(0, radius, 0);
  g.userData.light = light;
  g.add(light);
  return g;
}

// one soft shaft of light falling on the pig from above
function shaft() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  const across = g.createLinearGradient(0, 0, 64, 0);
  across.addColorStop(0, 'rgba(255,201,168,0)');
  across.addColorStop(0.5, 'rgba(255,201,168,1)');
  across.addColorStop(1, 'rgba(255,201,168,0)');
  g.fillStyle = across;
  g.fillRect(0, 0, 64, 256);
  g.globalCompositeOperation = 'destination-in';
  const down = g.createLinearGradient(0, 0, 0, 256);
  down.addColorStop(0, 'rgba(0,0,0,0.5)');
  down.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = down;
  g.fillRect(0, 0, 64, 256);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 7),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.14, toneMapped: false }),
  );
  mesh.position.set(0, 1.2, -1);
  return mesh;
}

function start() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  // transparent, so the giant wordmark behind the canvas shows through
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.className = 'hero__canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'button');
  canvas.setAttribute('aria-label', 'Make the 3D pig do a rep');
  canvas.setAttribute('aria-keyshortcuts', 'Enter Space');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  scene.add(new THREE.AmbientLight(0xffffff, 0.22));
  scene.fog = new THREE.Fog(0x000000, 1, 2);
  scene.add(shaft());

  const pig = buildPig();
  scene.add(pig);

  const upper = ring(2.3);
  upper.position.y = 1.15;
  upper.rotation.x = Math.PI / 2 + 0.15;
  const lower = ring(1.6);
  lower.position.y = -1.25;
  lower.rotation.x = Math.PI / 2 - 0.35;
  scene.add(upper, lower);

  // debris: a loose spiral of small cubes
  const COUNT = 160;
  const debris = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x4b3024, roughness: 0.65, metalness: 0.12 }),
    COUNT,
  );
  const seeds = Array.from({ length: COUNT }, (_, i) => ({
    radius: 2 + Math.random() * 2.2,
    angle: (i / COUNT) * Math.PI * 2 * 3,
    height: (Math.random() - 0.5) * 3.2,
    size: 0.03 + Math.random() ** 3 * 0.12,
    spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()),
    push: new THREE.Vector3(),
  }));
  scene.add(debris);

  let elapsed = 0, startedAt = 0, running = false, visible = false, lost = false;
  const time = () => elapsed + (running ? (performance.now() - startedAt) / 1000 : 0);
  const pointer = new THREE.Vector2(9, 9);
  const target = new THREE.Vector3(99, 99, 99);
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane();
  hero.addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  });
  hero.addEventListener('pointerleave', () => pointer.set(9, 9));

  // Look-around: the camera leans toward the pointer, or toward how a phone is
  // tilted, so the pig reads as a solid object rather than a picture.
  const lean = new THREE.Vector2();
  const leanTo = new THREE.Vector2();
  hero.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const r = hero.getBoundingClientRect();
    leanTo.set(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
  });
  hero.addEventListener('pointerleave', () => leanTo.set(0, 0));
  // Scrolling through the hero tips the pig back and pulls the camera away,
  // eased like the lean so a flick of the wheel doesn't jump it.
  let scrolled = 0, scrolledTo = 0;
  addEventListener('scroll', () => {
    scrolledTo = Math.min(1, Math.max(0, scrollY / (hero.offsetHeight || 1)));
  }, { passive: true });

  addEventListener('deviceorientation', e => {
    if (e.gamma == null) return;
    leanTo.set(THREE.MathUtils.clamp(e.gamma / 30, -1, 1), THREE.MathUtils.clamp((e.beta - 45) / 30, -1, 1));
  });

  // tap the stage and the pig does a rep: a press, a ring flare, and a shockwave
  // through the debris. The corner tag keeps count.
  let repAt = -10, reps = 0;
  const tag = hero.querySelector('.hero__tag');
  function rep() {
    if (motion.matches || lost) return;
    repAt = time();
    reps += 1;
    tag.textContent = `[ REPS ${String(reps).padStart(2, '0')} ] NYC`;
  }
  canvas.addEventListener('click', rep);
  // iPhone only shares tilt after asking, and only inside a tap: ask on the first one
  canvas.addEventListener('click', () => {
    if (typeof DeviceOrientationEvent?.requestPermission === 'function') DeviceOrientationEvent.requestPermission().catch(() => {});
  }, { once: true });
  canvas.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (!e.repeat) rep();
  });

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const away = new THREE.Vector3();

  function fit() {
    const w = hero.clientWidth, h = hero.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // The tilted upper ring and its glow fit a sphere of radius 2.9. Fit it
    // in BOTH axes, including portrait phones and every camera angle.
    const half = THREE.MathUtils.degToRad(camera.fov / 2);
    const horizontal = Math.atan(Math.tan(half) * camera.aspect);
    camera.userData.dist = 2.9 / Math.sin(Math.min(half, horizontal));
    scene.fog.near = camera.userData.dist;
    scene.fog.far = camera.userData.dist + 6;
    camera.updateProjectionMatrix();
  }

  const REP = 0.7;
  const lights = [upper.userData.light, lower.userData.light];

  function frame(t) {
    const k = (t - repAt) / REP;
    const flare = k >= 0 && k < 1 ? 1 - k : 0;
    const lift = k >= 0 && k < 1 ? Math.sin(Math.PI * k) ** 2 * 0.35 : 0;

    // camera never stops: a slow sway around the front of the pig
    // eased toward the target each frame: a spring, so stepping per frame is right
    lean.lerp(leanTo, 0.06);
    scrolled += (scrolledTo - scrolled) * 0.1;
    const d = camera.userData.dist * (1 + scrolled * 0.7);
    const az = Math.sin(t * 0.12) * 0.24 + lean.x * 0.45;
    camera.position.set(Math.sin(az) * d, 0.2 + Math.sin(t * 0.2) * 0.12 - lean.y * 1.1, Math.cos(az) * d);
    camera.lookAt(0, 0, 0);

    pig.position.y = Math.sin(t * 0.8) * 0.06 + lift + scrolled * 0.6;
    pig.rotation.x = -scrolled * 0.9;
    lights.forEach(l => { l.intensity = 8 + 10 * flare; });
    pig.rotation.y = Math.sin(t * 0.3) * 0.3 + scrolled * 1.2;
    upper.rotation.x = Math.PI / 2 + 0.15 + Math.sin(t * 0.18) * 0.06;
    lower.rotation.x = Math.PI / 2 - 0.35 + Math.sin(t * 0.15) * 0.06;

    plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(p).negate(), new THREE.Vector3());
    ray.setFromCamera(pointer, camera);
    if (!ray.ray.intersectPlane(plane, target)) target.set(99, 99, 99);

    seeds.forEach((sd, i) => {
      const a = sd.angle + t * 0.05 * (3 / sd.radius);
      p.set(Math.cos(a) * sd.radius, sd.height + Math.sin(t * 0.3 + i) * 0.1, Math.sin(a) * sd.radius);
      // springs step per frame, which is what a spring is
      away.subVectors(p, target);
      const dist = away.length();
      const want = dist < 1.2 ? away.normalize().multiplyScalar((1.2 - dist) * 0.9) : away.set(0, 0, 0);
      if (flare) want.addScaledVector(p, flare * 0.35);
      sd.push.lerp(want, 0.08);
      p.add(sd.push);
      e.set(sd.spin.x * t, sd.spin.y * t, sd.spin.z * t);
      s.setScalar(sd.size);
      debris.setMatrixAt(i, m.compose(p, q.setFromEuler(e), s));
    });
    debris.instanceMatrix.needsUpdate = true;
    renderer.render(scene, camera);
  }

  hero.prepend(canvas);
  fit();
  frame(0);
  hero.dataset.three = '';

  function updateMotion() {
    const animate = !motion.matches && !lost && visible && !document.hidden;
    if (running) elapsed = time();
    running = animate;
    if (running) startedAt = performance.now();
    renderer.setAnimationLoop(running ? () => frame(time()) : null);
    canvas.setAttribute('aria-disabled', String(motion.matches || lost));
  }
  motion.addEventListener('change', () => {
    repAt = -10;
    updateMotion();
    if (!lost) frame(motion.matches ? 0 : time());
  });
  document.addEventListener('visibilitychange', updateMotion);
  canvas.addEventListener('webglcontextlost', e => {
    e.preventDefault();
    lost = true;
    updateMotion();
    delete hero.dataset.three;
    canvas.hidden = true;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false;
    fit();
    frame(motion.matches ? 0 : time());
    canvas.hidden = false;
    hero.dataset.three = '';
    updateMotion();
  });
  addEventListener('resize', () => {
    fit();
    if (!running && !lost) frame(motion.matches ? 0 : time());
  });
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    updateMotion();
  }).observe(hero);
}

try {
  start();
} catch (err) {
  console.warn('3D hero unavailable, showing the flat logo:', err);
}
