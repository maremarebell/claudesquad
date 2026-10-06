// The check-in pig in 3D: the logo bitmap as voxels in a small stage. It
// breathes and turns while it waits, hops on every shake, spins and throws
// voxel confetti on a match, and lies down asleep when there's no meetup.
// Drag it to turn it. Returns null where WebGL won't start, so the caller can
// keep the flat SVG pig.
import * as THREE from 'three';
import { PIG } from './pig.js';

const ACCENT = 0xd9835f;
const INK = 0x120c08;
const V = 0.1;
const EYES = [[13, 10], [13, 11], [20, 10], [20, 11]];

export function mountPig(stage) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const canvas = renderer.domElement;
  canvas.className = 'here__pig3d';
  canvas.setAttribute('aria-hidden', 'true');
  stage.append(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 0.5, 7);
  camera.lookAt(0, -0.1, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xffe2cc, 2.4);
  key.position.set(2, 3, 4);
  const rim = new THREE.DirectionalLight(ACCENT, 2);
  rim.position.set(-3, 1, -3);
  scene.add(key, rim);

  // body voxels, plus eyelid voxels that fill the eye holes when asleep or happy
  const cells = [];
  PIG.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') cells.push([c, r]); }));
  const at = ([c, r]) => [(c - (PIG[0].length - 1) / 2) * V, ((PIG.length - 1) / 2 - r) * V];
  const cube = new THREE.BoxGeometry(V * 0.92, V * 0.92, V * 2);
  const pig = new THREE.Group();
  const body = new THREE.InstancedMesh(cube, new THREE.MeshStandardMaterial({ color: ACCENT, roughness: 0.45, metalness: 0.1 }), cells.length);
  const lids = new THREE.InstancedMesh(cube, new THREE.MeshStandardMaterial({ color: ACCENT, roughness: 0.45 }), EYES.length);
  const m = new THREE.Matrix4();
  cells.forEach((cell, i) => body.setMatrixAt(i, m.makeTranslation(...at(cell), 0)));
  EYES.forEach((cell, i) => lids.setMatrixAt(i, m.makeTranslation(...at(cell), 0.02)));
  lids.visible = false;
  pig.add(body, lids);
  scene.add(pig);

  // a floor shadow so the hop reads as leaving the ground
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.4, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -1.05;
  shadow.scale.set(1.3, 0.35, 1);
  scene.add(shadow);

  // confetti: voxels in the accent and the cream, flung up from the pig
  const BITS = 70;
  const confetti = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.6 }), BITS);
  const cream = new THREE.Color(0xf3ece4), accent = new THREE.Color(ACCENT), ink = new THREE.Color(INK);
  const bits = Array.from({ length: BITS }, (_, i) => {
    confetti.setColorAt(i, [accent, cream, ink][i % 3]);
    return { v: new THREE.Vector3(), spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(8) };
  });
  confetti.visible = false;
  scene.add(confetti);

  const clock = new THREE.Clock();
  let hopAt = -10, hopDir = 1, spinAt = -10, burstAt = -10, asleep = false, drag = 0, dragTo = 0;
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3();

  function frame() {
    const t = clock.getElapsedTime();
    const hop = Math.max(0, 1 - (t - hopAt) / 0.45);
    const lift = hop ? Math.sin(Math.PI * (1 - hop)) * 0.45 : 0;
    const squash = hop && hop < 0.25 ? 1 - hop * 0.6 : 1;
    const spin = Math.min(1, Math.max(0, (t - spinAt) / 0.9));
    drag += (dragTo - drag) * 0.12;

    pig.position.y = (asleep ? -0.35 : 0) + lift + Math.sin(t * 2) * 0.02;
    pig.rotation.z = asleep ? 0.35 : hop ? hopDir * 0.12 * Math.sin(Math.PI * (1 - hop)) : 0;
    pig.rotation.y = drag + (asleep ? 0.2 : Math.sin(t * 0.7) * 0.35) + (spin < 1 ? (1 - (1 - spin) ** 3) * Math.PI * 2 : 0);
    const breathe = 1 + Math.sin(t * (asleep ? 1.2 : 2.4)) * 0.015;
    pig.scale.set(breathe / squash ** 0.5, breathe * squash, 1);
    shadow.scale.set(1.3 * (1 - lift * 0.4), 0.35 * (1 - lift * 0.4), 1);

    const k = t - burstAt;
    confetti.visible = k < 1.6;
    if (confetti.visible) {
      bits.forEach((b, i) => {
        p.set(b.v.x * k, b.v.y * k - 4.5 * k * k, b.v.z * k);
        e.set(b.spin.x * k, b.spin.y * k, b.spin.z * k);
        s.setScalar(0.14 * Math.max(0, 1 - k / 1.6));
        confetti.setMatrixAt(i, m.compose(p, q.setFromEuler(e), s));
      });
      confetti.instanceMatrix.needsUpdate = true;
    }
    renderer.render(scene, camera);
  }

  function fit() {
    const w = stage.clientWidth, h = Math.round(w * 0.62);
    renderer.setSize(w, h, false);
    canvas.style.height = `${h}px`;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    frame();
  }
  new ResizeObserver(fit).observe(stage);

  const still = matchMedia('(prefers-reduced-motion: reduce)');
  new IntersectionObserver(([entry]) => {
    renderer.setAnimationLoop(entry.isIntersecting && !still.matches ? frame : null);
  }).observe(canvas);

  // drag sideways to turn the pig
  let from = null;
  canvas.addEventListener('pointerdown', ev => { from = ev.clientX - dragTo * 120; canvas.setPointerCapture(ev.pointerId); });
  canvas.addEventListener('pointermove', ev => { if (from !== null) dragTo = (ev.clientX - from) / 120; });
  canvas.addEventListener('pointerup', () => { from = null; });
  canvas.style.touchAction = 'pan-y';

  return {
    rep(n) { hopAt = clock.getElapsedTime(); hopDir = n % 2 ? -1 : 1; frame(); },
    celebrate(big) {
      const t = clock.getElapsedTime();
      spinAt = t;
      burstAt = t;
      bits.forEach(b => {
        const a = Math.random() * Math.PI * 2;
        const up = 2.2 + Math.random() * (big ? 3.4 : 2.2);
        b.v.set(Math.cos(a) * (0.6 + Math.random() * 1.6), up, Math.sin(a) * (0.6 + Math.random()));
      });
      frame();
    },
    mood({ sleeping = false, happy = false }) {
      asleep = sleeping;
      lids.visible = sleeping || happy;
      frame();
    },
  };
}
