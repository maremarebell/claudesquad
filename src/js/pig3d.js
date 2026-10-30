// The check-in pig in 3D, a React Three Fiber scene: the logo bitmap as
// voxels in a small stage. It breathes and turns while it waits, hops on every
// shake, spins and throws voxel confetti on a match, and lies down asleep when
// there's no meetup. Drag it to turn it. Its pose each frame is pigpose.js;
// here.js mounts it where WebGL starts and motion is welcome, and keeps the
// flat SVG pig everywhere else.
import React, { useRef, useState, useEffect, useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import htm from 'htm';
import { PIG } from './pig.js';
import { pigPose, confettiAt, throwVoxel, BURST_S } from './pigpose.js';

const html = htm.bind(React.createElement);

const ACCENT = 0xd9835f;
const INK = 0x120c08;
const V = 0.1;
const EYES = [[13, 10], [13, 11], [20, 10], [20, 11]];
const BITS = 70;
// confetti: the accent, the cream and the ink, in turn
const COLOURS = [new THREE.Color(ACCENT), new THREE.Color(0xf3ece4), new THREE.Color(INK)];

const cells = [];
PIG.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') cells.push([c, r]); }));
const at = ([c, r]) => [(c - (PIG[0].length - 1) / 2) * V, ((PIG.length - 1) / 2 - r) * V];

function Scene({ sleeping, happy, rep, celebrate }) {
  const { clock, gl, invalidate } = useThree();
  const pig = useRef();
  const body = useRef();
  const lids = useRef();
  const shadow = useRef();
  const confetti = useRef();
  const m = useMemo(() => new THREE.Matrix4(), []);
  const tmp = useMemo(() => ({ p: new THREE.Vector3(), q: new THREE.Quaternion(), e: new THREE.Euler(), s: new THREE.Vector3() }), []);
  // what the frame reads: when the last rep, turn and burst started, and how
  // far the pig has been dragged round (dragTo is the hand, drag follows it)
  const st = useRef({ hopAt: -10, hopDir: 1, spinAt: -10, burstAt: -10, drag: 0, dragTo: 0, bits: [] });

  // body voxels, plus eyelid voxels that fill the eye holes when asleep or happy
  useLayoutEffect(() => {
    cells.forEach((cell, i) => body.current.setMatrixAt(i, m.makeTranslation(...at(cell), 0)));
    body.current.instanceMatrix.needsUpdate = true;
    EYES.forEach((cell, i) => lids.current.setMatrixAt(i, m.makeTranslation(...at(cell), 0.02)));
    lids.current.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < BITS; i++) confetti.current.setColorAt(i, COLOURS[i % 3]);
    confetti.current.instanceColor.needsUpdate = true;
  }, [m]);

  // a rep: one hop, tipping to alternate sides
  useEffect(() => {
    if (!rep) return;
    st.current.hopAt = clock.elapsedTime;
    st.current.hopDir = rep.n % 2 ? -1 : 1;
    invalidate();
  }, [rep, clock, invalidate]);

  // a match: a full turn and confetti, more on a round-number meetup
  useEffect(() => {
    if (!celebrate) return;
    st.current.spinAt = st.current.burstAt = clock.elapsedTime;
    st.current.bits = Array.from({ length: BITS }, () => ({
      v: throwVoxel(celebrate.big),
      spin: [Math.random() * 8, Math.random() * 8, Math.random() * 8],
    }));
    invalidate();
  }, [celebrate, clock, invalidate]);

  // drag sideways to turn the pig; the page still scrolls up and down over it
  useEffect(() => {
    const el = gl.domElement;
    el.className = 'here__pig3d';
    el.setAttribute('aria-hidden', 'true');
    el.style.touchAction = 'pan-y';
    let from = null;
    const down = ev => { from = ev.clientX - st.current.dragTo * 120; el.setPointerCapture(ev.pointerId); };
    const move = ev => { if (from !== null) { st.current.dragTo = (ev.clientX - from) / 120; invalidate(); } };
    const up = () => { from = null; };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
  }, [gl, invalidate]);

  useFrame(() => {
    const t = clock.elapsedTime;
    const s = st.current;
    s.drag += (s.dragTo - s.drag) * 0.12;
    const pose = pigPose({ t, hopAt: s.hopAt, hopDir: s.hopDir, spinAt: s.spinAt, asleep: sleeping, drag: s.drag });
    pig.current.position.y = pose.y;
    pig.current.rotation.z = pose.rz;
    pig.current.rotation.y = pose.ry;
    pig.current.scale.set(...pose.scale);
    shadow.current.scale.set(...pose.shadow);
    const k = t - s.burstAt;
    confetti.current.visible = k < BURST_S;
    if (confetti.current.visible) {
      s.bits.forEach((bit, i) => {
        const { p, r, s: size } = confettiAt(bit, k);
        confetti.current.setMatrixAt(i, m.compose(tmp.p.set(...p), tmp.q.setFromEuler(tmp.e.set(...r)), tmp.s.setScalar(size)));
      });
      confetti.current.instanceMatrix.needsUpdate = true;
    }
  });

  return html`
    <${React.Fragment}>
      <ambientLight intensity=${0.55} />
      <directionalLight color=${0xffe2cc} intensity=${2.4} position=${[2, 3, 4]} />
      <directionalLight color=${ACCENT} intensity=${2} position=${[-3, 1, -3]} />
      <group ref=${pig}>
        <instancedMesh ref=${body} args=${[undefined, undefined, cells.length]}>
          <boxGeometry args=${[V * 0.92, V * 0.92, V * 2]} />
          <meshStandardMaterial color=${ACCENT} roughness=${0.45} metalness=${0.1} />
        <//>
        <instancedMesh ref=${lids} args=${[undefined, undefined, EYES.length]} visible=${sleeping || happy}>
          <boxGeometry args=${[V * 0.92, V * 0.92, V * 2]} />
          <meshStandardMaterial color=${ACCENT} roughness=${0.45} />
        <//>
      </group>
      <!-- a floor shadow, so the hop reads as leaving the ground -->
      <mesh ref=${shadow} rotation=${[-Math.PI / 2, 0, 0]} position=${[0, -1.05, 0]} scale=${[1.3, 0.35, 1]}>
        <circleGeometry args=${[1.4, 32]} />
        <meshBasicMaterial color=${0x000000} transparent opacity=${0.35} />
      </mesh>
      <instancedMesh ref=${confetti} args=${[undefined, undefined, BITS]} visible=${false}>
        <boxGeometry args=${[1, 1, 1]} />
        <meshStandardMaterial roughness=${0.6} />
      <//>
    <//>`;
}

// The stage: a box as wide as its column and 62% as tall, the renderer inside
// it. The loop runs only while it's on screen and motion is welcome; off
// screen or with reduced motion a prop change still redraws once.
export function Pig3D({ sleeping, happy, rep, celebrate, reduced, onReady }) {
  const box = useRef();
  const [seen, setSeen] = useState(true);
  useEffect(() => {
    const io = new IntersectionObserver(([entry]) => setSeen(entry.isIntersecting));
    io.observe(box.current);
    return () => io.disconnect();
  }, []);
  return html`
    <div className="here__pig3d-box" ref=${box}>
      <${Canvas}
        gl=${{ antialias: true, alpha: true }}
        dpr=${[1, 2]}
        frameloop=${seen && !reduced ? 'always' : 'demand'}
        camera=${{ fov: 30, near: 0.1, far: 50, position: [0, 0.5, 7] }}
        onCreated=${({ gl, camera }) => {
          gl.setClearColor(0x000000, 0);
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          camera.lookAt(0, -0.1, 0);
          onReady?.();
        }}
      >
        <${Scene} sleeping=${sleeping} happy=${happy} rep=${rep} celebrate=${celebrate} />
      <//>
    </div>`;
}
