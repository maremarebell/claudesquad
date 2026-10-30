// The bump collision: the moment phones match. Two faces fly in from opposite
// edges, a bigger group from all around (up to MAX faces, smaller the more
// there are), tilted in 3D, and smash together in the middle; on impact a
// shockwave rings out, the screen flashes and shakes, pixel shards scatter and
// BUMPED slams in. About a second and a half, then it clears itself. With
// reduced motion it's a still card for the same time instead.
import { el, avatar } from './squad.js';

const EASE_IN = 'cubic-bezier(.45, 0, .8, .35)';
const OUT = 'cubic-bezier(.15, .8, .2, 1)';

const IMPACT = 420;
const FLY = 1500;
const STAGE = 1900;

const MAX = 8;

// Where each face ends up: on a ring around the middle, the first (you) on the
// left. Two faces overlap at 34px out, the original pair; more sit on a ring
// just tight enough that neighbours overlap a little.
function layout(n) {
  const size = n <= 2 ? 104 : Math.max(56, 104 - 14 * (n - 2));
  const r = n <= 2 ? 34 : 0.8 * (size / 2) / Math.sin(Math.PI / n);
  return { size, r, at: i => Math.PI + (i * 2 * Math.PI) / n };
}

// one face thrown in from its edge along angle a, tilted away and
// accelerating, so they all meet exactly at IMPACT; s tips it by its side
function fly(img, a, r) {
  const x = Math.cos(a);
  const y = Math.sin(a);
  const s = x < -0.01 ? -1 : x > 0.01 ? 1 : y > 0 ? 1 : -1;
  const to = k => `translate(${x * r * k}px, ${y * r * k}px)`;
  img.animate([
    { transform: `translate(${x * 60}vw, ${y * 50 - x * 10}vh) rotateY(${-s * 70}deg) rotateZ(${s * 25}deg) scale(.6)`, easing: EASE_IN },
    { transform: `${to(1)} rotateY(0) rotateZ(${s * 8}deg) scale(1)`, offset: IMPACT / FLY },
    { transform: `${to(1.41)} rotateZ(${s * 14}deg) scale(1.08)`, offset: 0.42 },
    { transform: `${to(1.18)} rotateZ(${s * 10}deg) scale(1)`, offset: 0.75 },
    { transform: `${to(1.18)} translateY(-30vh) rotateZ(${s * 10}deg) scale(.7)`, opacity: 0 },
  ], { duration: FLY, fill: 'forwards' });
}

export function collide({ me, them, reduced, shake, onImpact }) {
  const label = el('p', { className: 'collide__label' },
    el('span', { className: 'collide__word', textContent: 'Bumped' }),
    el('span', { className: 'collide__names', textContent: [me.name, ...them.map(t => t.name)].join(' + ') }));
  const people = [me, ...them].slice(0, MAX);
  const { size, r, at } = layout(people.length);
  const faces = people.map(m => {
    const img = avatar(m, 'collide__face');
    Object.assign(img.style, { width: `${size}px`, height: `${size}px`, margin: `${-size / 2}px 0 0 ${-size / 2}px` });
    return img;
  });
  // a bigger ring pushes the words down below it
  if (people.length > 2) label.style.top = `calc(44% + ${Math.round(r * 1.18 + size / 2 + 16)}px)`;
  const stage = el('div', { className: 'collide', ariaHidden: 'true' }, ...faces, label);
  document.body.append(stage);

  if (reduced) {
    stage.classList.add('collide--still');
    // the faces where they'd have landed, tipped by side, and the words
    faces.forEach((img, i) => {
      const a = at(i);
      img.style.transform = `translate(${Math.cos(a) * r * 1.18}px, ${Math.sin(a) * r * 1.18}px) rotate(${Math.cos(a) < 0 ? -10 : 10}deg)`;
    });
    stage.animate([{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], STAGE)
      .onfinish = () => stage.remove();
    onImpact?.();
    return;
  }

  // the page dims behind it, so the faces and the word read over anything
  stage.animate([
    { backgroundColor: 'rgba(0, 0, 0, 0)' },
    { backgroundColor: 'rgba(0, 0, 0, .62)', offset: 0.2 },
    { backgroundColor: 'rgba(0, 0, 0, .62)', offset: 0.8 },
    { backgroundColor: 'rgba(0, 0, 0, 0)' },
  ], STAGE).onfinish = () => stage.remove();
  faces.forEach((img, i) => fly(img, at(i), r));

  setTimeout(() => {
    onImpact?.();
    // three rings out of the point of contact, each a little later and wider
    for (let i = 0; i < 3; i++) {
      const ring = el('i', { className: 'collide__ring' });
      stage.append(ring);
      ring.animate([
        { transform: 'translate(-50%, -50%) scale(.1)', opacity: 1 },
        { transform: `translate(-50%, -50%) scale(${5 + i * 2.5})`, opacity: 0, borderWidth: '1px' },
      ], { duration: 700 + i * 160, delay: i * 70, easing: OUT, fill: 'forwards' });
    }
    const flash = el('i', { className: 'collide__flash' });
    stage.append(flash);
    flash.animate([{ opacity: 0.85 }, { opacity: 0 }], { duration: 260, easing: 'ease-out', fill: 'forwards' });
    for (let i = 0; i < 26; i++) {
      const shard = el('i', { className: i % 4 ? 'collide__shard' : 'collide__shard collide__shard--ink' });
      stage.append(shard);
      const a = Math.random() * Math.PI * 2;
      const d = 90 + Math.random() * 170;
      shard.animate([
        { transform: 'translate(-50%, -50%) rotate(0) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) rotate(${(Math.random() - 0.5) * 540}deg) scale(.3)`, opacity: 0 },
      ], { duration: 600 + Math.random() * 400, easing: OUT, fill: 'forwards' });
    }
    label.animate([
      { transform: 'translate(-50%, 0) scale(2.4)', opacity: 0 },
      { transform: 'translate(-50%, 0) scale(.92)', opacity: 1, offset: 0.25 },
      { transform: 'translate(-50%, 0) scale(1)', opacity: 1, offset: 0.4 },
      { transform: 'translate(-50%, 0) scale(1)', opacity: 1, offset: 0.8 },
      { transform: 'translate(-50%, -12px) scale(1)', opacity: 0 },
    ], { duration: 1300, easing: OUT, fill: 'forwards' });
    shake?.animate([
      { transform: 'translate(0, 0)' }, { transform: 'translate(-9px, 4px)' }, { transform: 'translate(8px, -5px)' },
      { transform: 'translate(-5px, 3px)' }, { transform: 'translate(3px, -1px)' }, { transform: 'translate(0, 0)' },
    ], { duration: 320, easing: 'linear' });
  }, IMPACT);
}
