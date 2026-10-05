// The check-in rules with no DOM or network in them, so Node can test them.

export const SHAKES = 3;

// New York's calendar date. Moves together with the insert policy in
// supabase/schema.sql, which compares against the same zone.
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

// A friendshipmog is SHAKES hard jolts inside a second. One jolt spans several
// motion samples, so a sample within `gap` ms of the last counted jolt is the
// same jolt. `threshold` is m/s² above gravity.
export function shakeCounter({ need = SHAKES, within = 1000, gap = 150, threshold = 14 } = {}) {
  let hits = [];
  return (t, accel) => {
    if (!accel || Math.hypot(accel.x, accel.y, accel.z) - 9.81 < threshold) return 0;
    if (t - (hits[hits.length - 1] ?? -Infinity) < gap) return 0;
    hits = hits.filter(h => t - h < within).concat(t);
    return Math.min(hits.length, need);
  };
}
