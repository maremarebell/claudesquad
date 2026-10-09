// The bump collision: the moment two phones match. Both faces fly in from
// opposite edges, tilted in 3D, and smash together in the middle; on impact a
// shockwave rings out, the screen flashes and shakes, pixel shards scatter and
// BUMPED slams in. About a second and a half, then it clears itself. With
// reduced motion it's a still card for the same time instead.
import { el, avatar } from './squad.js';

const EASE_IN = 'cubic-bezier(.45, 0, .8, .35)';
const OUT = 'cubic-bezier(.15, .8, .2, 1)';

const IMPACT = 420;
const FLY = 1500;
const STAGE = 1900;

// one face thrown in from its edge (s = -1 left, 1 right), tilted away and
// accelerating, so the two meet exactly at IMPACT
function fly(img, s) {
  img.animate([
    { transform: `translate(${s * 60}vw, ${-s * 10}vh) rotateY(${-s * 70}deg) rotateZ(${s * 25}deg) scale(.6)`, easing: EASE_IN },
    { transform: `translate(${s * 34}px, 0) rotateY(0) rotateZ(${s * 8}deg) scale(1)`, offset: IMPACT / FLY },
    { transform: `translate(${s * 48}px, 0) rotateZ(${s * 14}deg) scale(1.08)`, offset: 0.42 },
    { transform: `translate(${s * 40}px, 0) rotateZ(${s * 10}deg) scale(1)`, offset: 0.75 },
    { transform: `translate(${s * 40}px, -30vh) rotateZ(${s * 10}deg) scale(.7)`, opacity: 0 },
  ], { duration: FLY, fill: 'forwards' });
}

export function collide({ me, them, reduced, shake, onImpact }) {
  const label = el('p', { className: 'collide__label' },
    el('span', { className: 'collide__word', textContent: 'Bumped' }),
    el('span', { className: 'collide__names', textContent: [me.name, ...them.map(t => t.name)].join(' + ') }));
  const left = avatar(me, 'collide__face collide__face--left');
  const right = avatar(them[0], 'collide__face collide__face--right');
  const stage = el('div', { className: 'collide', ariaHidden: 'true' }, left, right, label);
  document.body.append(stage);

  if (reduced) {
    stage.classList.add('collide--still');
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
  fly(left, -1);
  fly(right, 1);

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
