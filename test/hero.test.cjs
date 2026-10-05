const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');

// Exercise the browser lifecycle without a GPU or CDN. These tests don't assess pixels.
function mount({ reduced = false, width = 1280, fail = false } = {}) {
  class Element {
    constructor() { this.events = {}; this.dataset = {}; this.style = {}; this.children = []; }
    addEventListener(name, fn) { (this.events[name] ||= []).push(fn); }
    emit(name, event = {}) { this.events[name]?.forEach(fn => fn(event)); }
    setAttribute(name, value) { this[name] = String(value); }
    prepend(...nodes) { this.children.unshift(...nodes); }
    append(...nodes) { this.children.push(...nodes); }
    remove() { this.removed = true; }
    closest() { return null; }
    getBoundingClientRect() { return { left: 0, top: 0, width, height: 640 }; }
    getContext() { return { createLinearGradient: () => ({ addColorStop() {} }), fillRect() {} }; }
  }
  const hero = new Element();
  hero.clientWidth = width;
  hero.clientHeight = 640;
  const tag = new Element();
  tag.textContent = '[ CS/01 ] NYC';
  hero.querySelector = selector => ({ '.hero__tag': tag })[selector] || null;
  const media = new Element();
  media.matches = reduced;
  const document = new Element();
  document.hidden = false;
  document.querySelector = () => hero;
  document.createElement = () => new Element();
  const state = { hero, tag, media, document, renders: 0, now: 0 };

  class Object3D {
    constructor(...args) {
      this.children = []; this.userData = {}; this.instanceMatrix = {};
      this.position = new Vector(); this.rotation = new Vector();
      if (typeof args[0] === 'object') Object.assign(this, args[0]);
      this.args = args;
    }
    add(...nodes) { this.children.push(...nodes); }
    setMatrixAt() {} lookAt() {} updateProjectionMatrix() {} dispose() {}
    getWorldDirection(vector) { return vector; }
    moveTo() { return this; } lineTo() { return this; } closePath() { return this; }
    translate() { return this; }
  }
  class Vector {
    constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
    set(x, y, z) { Object.assign(this, { x, y, z }); return this; }
    makeTranslation() { return this; } compose() { return this; }
    setFromEuler() { return this; } setFromNormalAndCoplanarPoint() { return this; }
    subVectors() { return this; } normalize() { return this; } multiplyScalar() { return this; }
    negate() { return this; } add() { return this; } addScaledVector() { return this; }
    lerp() { return this; } setScalar() { return this; } length() { return 9; }
  }
  class Renderer {
    constructor() {
      if (fail) throw new Error('WebGL unavailable');
      this.domElement = new Element(); state.renderer = this;
    }
    setPixelRatio() {} setClearColor() {} dispose() {}
    setSize(w, h) { state.size = [w, h]; }
    setAnimationLoop(loop) { state.loop = loop; }
    render(scene, camera) { state.renders++; state.camera = camera; state.scene = scene; }
  }
  const THREE = new Proxy({
    WebGLRenderer: Renderer,
    MathUtils: { degToRad: degrees => degrees * Math.PI / 180 },
    PerspectiveCamera: class extends Object3D { constructor(fov) { super(); this.fov = fov; } },
    Clock: class { getElapsedTime() { return state.now / 1000; } },
    Raycaster: class { constructor() { this.ray = { intersectPlane: () => null }; } setFromCamera() {} },
  }, { get: (target, key) => target[key] || (/Vector|Matrix|Quaternion|Euler|Plane$/.test(key) ? Vector : Object3D) });
  runInNewContext(readFileSync(process.env.HERO_SOURCE || 'src/js/hero.js', 'utf8').replace(/import .*?;\n/, ''), {
    THREE, document, matchMedia: () => media, devicePixelRatio: 1,
    performance: { now: () => state.now }, console: { warn() {} },
    addEventListener() {},
    IntersectionObserver: class {
      constructor(callback) { state.intersect = value => callback([{ isIntersecting: value }]); }
      observe() { state.intersect(true); }
    },
  });
  return state;
}

test('motion stops when the reduced-motion preference changes', () => {
  const s = mount();
  assert.equal(typeof s.loop, 'function');
  s.media.matches = true;
  s.media.emit('change');
  assert.equal(s.loop, null);
});

test('reduced motion renders once and leaves the loop idle', () => {
  const s = mount({ reduced: true });
  assert.equal(s.renders, 1);
  assert.ok(!s.loop);
  assert.ok('three' in s.hero.dataset);
});

test('the pig can do a rep from the keyboard', () => {
  const s = mount();
  const canvas = s.renderer.domElement;
  assert.equal(canvas.tabIndex, 0);
  canvas.emit('keydown', { key: 'Enter', preventDefault() {} });
  assert.match(s.tag.textContent, /REPS 01/);
});

test('a lost WebGL context returns to the static logo', () => {
  const s = mount();
  s.renderer.domElement.emit('webglcontextlost', { preventDefault() {} });
  assert.ok(!('three' in s.hero.dataset));
  assert.equal(s.loop, null);
});

test('WebGL initialization failure keeps the static logo', () => {
  const s = mount({ fail: true });
  assert.ok(!('three' in s.hero.dataset));
  assert.equal(s.renders, 0);
});

test('backgrounding stops the loop and keeps the animation time', () => {
  const s = mount();
  s.now = 1000;
  s.loop();
  const position = { ...s.camera.position };
  s.document.hidden = true;
  s.document.emit('visibilitychange');
  assert.equal(s.loop, null);
  s.now = 20000;
  s.document.hidden = false;
  s.document.emit('visibilitychange');
  s.loop();
  assert.deepEqual({ ...s.camera.position }, position);
});

test('context restoration keeps the reduced-motion composition', () => {
  const s = mount();
  s.now = 30000;
  s.loop();
  s.media.matches = true;
  s.media.emit('change');
  const position = { ...s.camera.position };
  s.renderer.domElement.emit('webglcontextlost', { preventDefault() {} });
  s.renderer.domElement.emit('webglcontextrestored');
  assert.deepEqual({ ...s.camera.position }, position);
  assert.ok('three' in s.hero.dataset);
  assert.equal(s.loop, null);
});

test('both orbit rings fit the view at phone and desktop widths throughout the sway', () => {
  for (const width of [320, 390, 760, 1440]) {
    const s = mount({ width });
    for (const seconds of [0, 5, 15, 30, 60, 120]) {
      s.now = seconds * 1000;
      s.loop();
      const camera = s.camera;
      const { x: cx, y: cy, z: cz } = camera.position;
      const distance = Math.hypot(cx, cy, cz);
      const rightLength = Math.hypot(cx, cz);
      const right = [cz / rightLength, 0, -cx / rightLength];
      const back = [cx / distance, cy / distance, cz / distance];
      const up = [-back[1] * right[2], back[2] * right[0] - back[0] * right[2], back[1] * right[0]];
      const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
      const tan = Math.tan(camera.fov * Math.PI / 360);
      // Ring geometry is sampled independently of the production fit formula.
      for (const ring of s.scene.children.filter(node => node.userData.light)) {
        const radius = ring.children[0].args[0].args[0];
        for (let i = 0; i < 72; i++) {
          const angle = i * Math.PI / 36;
          const localY = Math.sin(angle) * radius;
          const point = [Math.cos(angle) * radius,
            Math.cos(ring.rotation.x) * localY + ring.position.y,
            Math.sin(ring.rotation.x) * localY];
          const depth = distance - dot(point, back);
          assert.ok((Math.abs(dot(point, right)) + 0.075) / (depth * tan * camera.aspect) < 1,
            `ring clipped horizontally at ${width}px, ${seconds}s`);
          assert.ok((Math.abs(dot(point, up)) + 0.075) / (depth * tan) < 1,
            `ring clipped vertically at ${width}px, ${seconds}s`);
        }
      }
    }
  }
});
