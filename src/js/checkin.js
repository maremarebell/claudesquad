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

// A friendshipmog is SHAKES hard jolts inside a second. One jolt spans several
// motion samples, so a sample within `gap` ms of the last counted jolt is the
// same jolt. `threshold` is m/s² above gravity.
export const SHAKE = { need: SHAKES, within: 1000, gap: 150, threshold: 14 };

// How hard one motion sample is, in m/s² above gravity, or null when the
// sensor sent no reading (some Android phones send the object with null axes).
export const joltOf = a =>
  a && a.x != null && a.y != null && a.z != null ? Math.hypot(a.x, a.y, a.z) - 9.81 : null;

export function shakeCounter(opts = {}) {
  const { need, within, gap, threshold } = { ...SHAKE, ...opts };
  let hits = [];
  return (t, accel) => {
    if (!(joltOf(accel) >= threshold)) return 0;
    if (t - (hits[hits.length - 1] ?? -Infinity) < gap) return 0;
    hits = hits.filter(h => t - h < within).concat(t);
    return Math.min(hits.length, need);
  };
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
