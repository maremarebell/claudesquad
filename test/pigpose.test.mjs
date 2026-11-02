import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pigPose, throwVoxel, confettiAt, HOP_S, SPIN_S, BURST_S, ASLEEP_Y } from '../src/js/pigpose.js';

const near = (a, b, eps, what) => assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} is not within ${eps} of ${b}`);

test('at rest the pig sits on the floor, upright, breathing a little', () => {
  for (const t of [0, 1.3, 7.7, 100]) {
    const p = pigPose({ t });
    near(p.y, 0, 0.02, 'y');
    assert.equal(p.rz, 0);
    near(p.scale[0], 1, 0.02, 'breathe x');
    near(p.scale[1], 1, 0.02, 'breathe y');
    assert.deepEqual(p.shadow, [1.3, 0.35, 1]);
  }
});

test('asleep it lies lower and tipped over', () => {
  const p = pigPose({ t: 4, asleep: true });
  near(p.y, ASLEEP_Y, 0.02, 'y');
  assert.equal(p.rz, 0.35);
  near(p.ry, 0.2, 0, 'ry');
});

test('a rep lifts the pig mid-hop, tips it to the side it was asked, and lands it', () => {
  const hopAt = 10;
  const up = pigPose({ t: hopAt + HOP_S / 2, hopAt, hopDir: 1 });
  near(up.y, 0.45, 0.02, 'top of the hop');
  assert.ok(up.rz > 0.1, 'tipped right');
  assert.ok(up.shadow[0] < 1.3, 'the shadow shrinks under it');
  const left = pigPose({ t: hopAt + HOP_S / 2, hopAt, hopDir: -1 });
  assert.ok(left.rz < -0.1, 'tipped left on the other side');
  const landing = pigPose({ t: hopAt + HOP_S * 0.9, hopAt });
  assert.ok(landing.scale[1] < 0.98 && landing.scale[0] > 1.01, 'squashed on landing');
  const down = pigPose({ t: hopAt + HOP_S + 0.01, hopAt });
  near(down.y, 0, 0.02, 'back on the floor');
  assert.equal(down.rz, 0);
});

test('a match turns the pig a full circle in SPIN_S', () => {
  const spinAt = 20;
  const t = spinAt + SPIN_S * 0.999;
  const extra = pigPose({ t, spinAt }).ry - pigPose({ t }).ry;
  near(extra, Math.PI * 2, 0.02, 'almost a full turn just before it ends');
  // just past the end (SPIN_S itself is a float away from exact) it is back to its idle sway
  const after = spinAt + SPIN_S * 1.001;
  assert.equal(pigPose({ t: after, spinAt }).ry, pigPose({ t: after }).ry);
});

test('drag turns the pig by hand on top of its idle sway', () => {
  const t = 3;
  near(pigPose({ t, drag: 1.5 }).ry - pigPose({ t }).ry, 1.5, 1e-9, 'drag');
});

test('a thrown voxel goes up and out, higher on a round-number meetup', () => {
  const fixed = () => 0.5;
  const v = throwVoxel(false, fixed);
  const big = throwVoxel(true, fixed);
  assert.equal(v.length, 3);
  assert.ok(v.every(Number.isFinite));
  assert.ok(v[1] > 2.2, 'up');
  assert.ok(big[1] > v[1], 'higher when big');
});

test('confetti starts at the pig, falls under gravity and is gone by BURST_S', () => {
  const bit = { v: [1, 3, 0], spin: [1, 2, 3] };
  const start = confettiAt(bit, 0);
  assert.deepEqual(start.p, [0, 0, 0]);
  near(start.s, 0.14, 1e-9, 'full size');
  const later = confettiAt(bit, 1);
  assert.deepEqual(later.p, [1, 3 - 4.5, 0]);
  assert.deepEqual(later.r, [1, 2, 3]);
  assert.ok(later.s > 0 && later.s < 0.14, 'shrinking');
  assert.equal(confettiAt(bit, BURST_S).s, 0);
  assert.equal(confettiAt(bit, BURST_S + 1).s, 0);
});
