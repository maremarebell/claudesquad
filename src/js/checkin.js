// The check-in rules with no DOM or network in them, so Node can test them.

export const SHAKES = 3;
// One point per meetup attended, one per merged PR.
export const POINTS = { meetup: 1, pr: 1 };

// New York's calendar date. Moves together with POST /api/bump in
// server/index.mjs, which dates check-ins in the same zone.
export const nyToday = (date = new Date()) => date.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

// Meetups per member, counting only check-ins on an events.json date, plus who
// is in today. A check-in on a random Tuesday is stored but never scores.
export function tally(rows, eventDates, today) {
  const meetups = new Map();
  const present = [];
  for (const { event_date, members: member } of rows) {
    if (!member) continue;
    if (event_date === today) present.push(member);
    if (!eventDates.has(event_date)) continue;
    const entry = meetups.get(member.id) || { member, meetups: 0 };
    entry.meetups += 1;
    meetups.set(member.id, entry);
  }
  return { meetups, present };
}

// The meetup on a date, and the first one after it, from events.json.
export const meetupOn = (events, date) => events.find(e => e.date === date);
export const nextMeetup = (events, date) =>
  events.filter(e => e.date > date).sort((a, b) => a.date.localeCompare(b.date))[0];

// How hard one motion sample is, in m/s² away from gravity, or null when the
// reading has no numbers in it (a phone's sensors waking up, or some Android
// sensors that send the object with null axes).
export const joltOf = a =>
  a && [a.x, a.y, a.z].every(Number.isFinite) ? Math.hypot(a.x, a.y, a.z) - 9.81 : null;

// The timing of a friendshipmog, shared with the motion debug readout.
export const SHAKE = { need: SHAKES, within: 1000, gap: 150 };

// A friendshipmog is SHAKES jolts inside a second. How hard a jolt has to be
// adapts to the phone and the person shaking it, in m/s² away from gravity:
// - the bar starts at `start`, then sits at half the strength of their recent
//   jolts, so a gentle shaker gets a lower bar and a hard one a higher bar;
// - it never drops below 3x the phone's resting jitter (`noise`), so a
//   jittery sensor or a bouncing hand doesn't count as shaking;
// - SHAKES near misses (at least half the bar) inside a second are someone
//   trying and not getting there: they're learned as that person's strength,
//   so the next try counts.
// One jolt spans several motion samples, so a sample within `gap` ms of the
// last one counted is the same jolt. `profile` carries what was learned from
// one shake to the next (here.js keeps it per phone).
export const newShakeProfile = () => ({ noise: 0.5, peaks: [] });

const floorOf = (profile, min) => Math.max(min, profile.noise * 3);

export function shakeBar(profile, { min = 5, max = 16, start = 10 } = {}) {
  const sorted = [...profile.peaks].sort((a, b) => a - b);
  const typical = sorted.length >= SHAKES ? sorted[sorted.length >> 1] / 2 : start;
  return Math.min(max, Math.max(floorOf(profile, min), typical));
}

export function shakeCounter({ need = SHAKE.need, within = SHAKE.within, gap = SHAKE.gap, profile = newShakeProfile(), ...limits } = {}) {
  let hits = [];
  let misses = [];
  const learn = list => { profile.peaks = [...profile.peaks, ...list.map(h => h.peak)].slice(-9); };
  // the strongest sample of a jolt is its strength
  const same = (list, t, dev) => {
    const last = list[list.length - 1];
    if (!last || t - last.t >= gap) return false;
    last.peak = Math.max(last.peak, dev);
    return true;
  };
  return (t, accel) => {
    const dev = joltOf(accel);
    if (dev == null) return 0;
    if (same(hits, t, dev)) return 0;
    const bar = shakeBar(profile, limits);
    if (dev >= bar) {
      hits = hits.filter(h => t - h.t < within).concat({ t, peak: dev });
      if (hits.length === need) learn(hits);
      return Math.min(hits.length, need);
    }
    if (same(misses, t, dev)) return 0;
    if (dev >= Math.max(floorOf(profile, limits.min ?? 5), bar / 2)) {
      misses = misses.filter(m => t - m.t < within).concat({ t, peak: dev });
      if (misses.length >= need) { learn(misses); misses = []; }
      return 0;
    }
    // resting jitter, learned only while nobody is shaking
    const recent = [...hits, ...misses].some(h => t - h.t < within);
    if (!recent) profile.noise += (Math.abs(dev) - profile.noise) * 0.01;
    return 0;
  };
}

// What a phone learned about its shaker, read back from storage. Anything
// odd starts over rather than leaving the bar somewhere nobody can reach.
export function readShakeProfile(raw) {
  try {
    const p = JSON.parse(raw);
    const ok = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < 100;
    if (ok(p?.noise) && Array.isArray(p.peaks) && p.peaks.every(ok)) return { noise: p.noise, peaks: p.peaks.slice(-9) };
  } catch {}
  return newShakeProfile();
}

// Merged pull requests per GitHub login (lowercased), from GitHub search
// results. Bots don't score.
export function countPRs(items) {
  const counts = new Map();
  for (const { user } of items) {
    if (!user || user.type === 'Bot') continue;
    const login = user.login.toLowerCase();
    counts.set(login, (counts.get(login) || 0) + 1);
  }
  return counts;
}

// One row per member with any points: meetups from check-ins, PRs matched by
// GitHub login. Highest first.
export function leaderboard(members, meetups, prs) {
  return members
    .map(member => {
      const m = meetups.get(member.id)?.meetups || 0;
      const p = prs.get(member.login.toLowerCase()) || 0;
      return { member, meetups: m, prs: p, points: m * POINTS.meetup + p * POINTS.pr };
    })
    .filter(row => row.points > 0)
    .sort((a, b) => b.points - a.points);
}
