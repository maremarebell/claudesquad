// The 3D pig's pose at a moment, with no three.js in it, so Node can test it
// (test/pigpose.test.mjs). pig3d.js reads this every frame. Everything is a
// function of the clock, never of the previous frame, so a tab coming back
// from the background lands where it should instead of jumping.

export const HOP_S = 0.45; // a rep: up and back down
export const SPIN_S = 0.9; // a full turn on a match
export const BURST_S = 1.6; // how long confetti stays in the air
export const ASLEEP_Y = -0.35;

// t is the clock in seconds; hopAt, spinAt are when the last rep and match
// started (far in the past when there was none); drag is how far the pig has
// been turned by hand, in radians.
export function pigPose({ t, hopAt = -10, hopDir = 1, spinAt = -10, asleep = false, drag = 0 }) {
  const hop = Math.max(0, 1 - (t - hopAt) / HOP_S);
  const lift = hop ? Math.sin(Math.PI * (1 - hop)) * 0.45 : 0;
  // the landing squashes it a little
  const squash = hop && hop < 0.25 ? 1 - hop * 0.6 : 1;
  const spin = Math.min(1, Math.max(0, (t - spinAt) / SPIN_S));
  const breathe = 1 + Math.sin(t * (asleep ? 1.2 : 2.4)) * 0.015;
  return {
    y: (asleep ? ASLEEP_Y : 0) + lift + Math.sin(t * 2) * 0.02,
    rz: asleep ? 0.35 : hop ? hopDir * 0.12 * Math.sin(Math.PI * (1 - hop)) : 0,
    ry: drag + (asleep ? 0.2 : Math.sin(t * 0.7) * 0.35) + (spin < 1 ? (1 - (1 - spin) ** 3) * Math.PI * 2 : 0),
    scale: [breathe / squash ** 0.5, breathe * squash, 1],
    shadow: [1.3 * (1 - lift * 0.4), 0.35 * (1 - lift * 0.4), 1],
  };
}

// Where a burst throws one voxel: up, out in a random direction, higher on a
// round-number meetup. `rand` is Math.random, or a fixed one in a test.
export function throwVoxel(big, rand = Math.random) {
  const a = rand() * Math.PI * 2;
  return [Math.cos(a) * (0.6 + rand() * 1.6), 2.2 + rand() * (big ? 3.4 : 2.2), Math.sin(a) * (0.6 + rand())];
}

// One confetti voxel k seconds after the burst: along its throw, falling
// under gravity, tumbling, and shrinking to nothing by BURST_S.
export function confettiAt({ v, spin }, k) {
  return {
    p: [v[0] * k, v[1] * k - 4.5 * k * k, v[2] * k],
    r: [spin[0] * k, spin[1] * k, spin[2] * k],
    s: 0.14 * Math.max(0, 1 - k / BURST_S),
  };
}
