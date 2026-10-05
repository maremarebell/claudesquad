// Homepage hero: the logo pig as voxels, two glowing orbit rings as the light,
// and tumbling debris that parts around the pointer. If anything here fails the
// static <img> logo stays on screen, so there is never an empty hero.
import * as THREE from 'three';

const hero = document.querySelector('.hero');
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
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
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(VOXEL * 0.94, VOXEL * 0.94, VOXEL * 1.6),
    new THREE.MeshStandardMaterial({ color: ACCENT, roughness: 0.5, emissive: ACCENT, emissiveIntensity: 0.35 }),
    cells.length,
  );
  const m = new THREE.Matrix4();
  cells.forEach(([x, y], i) => mesh.setMatrixAt(i, m.makeTranslation(x, y, 0)));
  return mesh;
}

function ring(radius) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.012, 8, 200),
    new THREE.MeshBasicMaterial({ color: GLOW, toneMapped: false }),
  ));
  // a wide faint tube around the line reads as glow without postprocessing
  g.add(new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.05, 8, 200),
    new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }),
  ));
  const light = new THREE.PointLight(GLOW, 12, 0, 1.4);
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
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.35 }),
  );
  mesh.position.set(0, 1.2, -1);
  return mesh;
}

function start() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  // transparent, so the giant wordmark behind the canvas shows through
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.className = 'hero__canvas';
  canvas.setAttribute('aria-hidden', 'true');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  scene.add(new THREE.AmbientLight(0xffffff, 0.3));
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
  // the ring lights sit on the ring's front edge so the pig is lit from them
  upper.children[2].position.set(0, -1.6, 0);
  lower.children[2].position.set(0, -1.2, 0);

  // debris: a loose spiral of small cubes
  const COUNT = 160;
  const debris = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.8 }),
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

  const pointer = new THREE.Vector2(9, 9);
  const target = new THREE.Vector3(99, 99, 99);
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane();
  hero.addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  });
  hero.addEventListener('pointerleave', () => pointer.set(9, 9));

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
    // keep a 5.4-unit wide by 4.6-unit tall frame inside the view
    const half = THREE.MathUtils.degToRad(camera.fov / 2);
    const distH = 2.3 / Math.tan(half);
    // on a phone held upright let the rings run off the edges so the pig stays big
    const distW = (camera.aspect < 0.8 ? 1.9 : 2.7) / (Math.tan(half) * camera.aspect);
    camera.userData.dist = Math.max(distH, distW) + 1;
    scene.fog.near = camera.userData.dist;
    scene.fog.far = camera.userData.dist + 6;
    camera.updateProjectionMatrix();
  }

  function frame(t) {
    // camera never stops: a slow sway around the front of the pig
    const d = camera.userData.dist;
    const az = Math.sin(t * 0.12) * 0.55;
    camera.position.set(Math.sin(az) * d, 0.4 + Math.sin(t * 0.2) * 0.3, Math.cos(az) * d);
    camera.lookAt(0, 0, 0);

    pig.position.y = Math.sin(t * 0.8) * 0.06;
    pig.rotation.y = Math.sin(t * 0.3) * 0.25;
    upper.rotation.z = t * 0.15;
    lower.rotation.z = -t * 0.2;

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

  addEventListener('resize', () => { fit(); if (REDUCED) frame(0); });
  if (REDUCED) return;

  const clock = new THREE.Clock();
  const loop = () => frame(clock.getElapsedTime());
  new IntersectionObserver(([entry]) => renderer.setAnimationLoop(entry.isIntersecting ? loop : null)).observe(hero);
}

try {
  start();
} catch (err) {
  console.warn('3D hero unavailable, showing the flat logo:', err);
}
