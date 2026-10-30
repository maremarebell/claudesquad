import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nyToday, tally, shakeCounter, countPRs, leaderboard, SHAKES, POINTS, SHAKE, joltOf, meetupOn, nextMeetup } from '../src/js/checkin.js';

const mare = { id: 'u2', name: 'Mare' };
const iso = { id: 'u1', name: 'Iso' };

test('only meetup dates score, and today lists who is in', () => {
  const rows = [
    { event_date: '2026-10-15', members: iso },
    { event_date: '2026-10-20', members: iso },
    { event_date: '2026-10-29', members: iso },
    { event_date: '2026-10-29', members: mare },
    { event_date: '2026-10-29', members: null },
  ];
  const { meetups, present } = tally(rows, new Set(['2026-10-15', '2026-10-29']), '2026-10-29');
  assert.equal(meetups.get('u1').meetups, 2);
  assert.equal(meetups.get('u2').meetups, 1);
  assert.deepEqual(present, [iso, mare]);
});

test('an empty table scores nobody', () => {
  const { meetups, present } = tally([], new Set(['2026-10-15']), '2026-10-15');
  assert.equal(meetups.size, 0);
  assert.equal(present.length, 0);
});

test('New York date holds after UTC has rolled over, and across the DST change', () => {
  assert.equal(nyToday(new Date('2026-10-16T03:30:00Z')), '2026-10-15');
  assert.equal(nyToday(new Date('2026-11-01T05:30:00Z')), '2026-11-01');
  assert.equal(nyToday(new Date('2026-11-01T04:30:00Z')), '2026-11-01');
  assert.equal(nyToday(new Date('2026-11-01T03:30:00Z')), '2026-10-31');
});

const jolt = { x: 30, y: 0, z: 9.81 };

test('samples from one jolt count once', () => {
  const step = shakeCounter();
  assert.equal(step(0, jolt), 1);
  assert.equal(step(16, jolt), 0);
  assert.equal(step(100, jolt), 0);
  assert.equal(step(200, jolt), 2);
});

test('three jolts inside a second finish the shake, spread out they do not', () => {
  const quick = shakeCounter();
  quick(0, jolt); quick(300, jolt);
  assert.equal(quick(600, jolt), SHAKES);

  const slow = shakeCounter();
  slow(0, jolt); slow(600, jolt);
  assert.equal(slow(1100, jolt), 2);
});

test('gentle movement and missing sensors do not count', () => {
  const step = shakeCounter();
  assert.equal(step(0, { x: 1, y: 2, z: 9.81 }), 0);
  assert.equal(step(500, null), 0);
});

test('null axes (some Android sensors) do not count', () => {
  const step = shakeCounter();
  assert.equal(step(0, { x: null, y: null, z: null }), 0);
  assert.equal(step(200, { x: 30, y: null, z: 9.81 }), 0);
});

test('a jolt is the reading above gravity, null without a reading', () => {
  assert.equal(joltOf({ x: 0, y: 0, z: 9.81 }), 0);
  assert.ok(Math.abs(joltOf({ x: 0, y: 0, z: 23.81 }) - 14) < 1e-9);
  assert.equal(joltOf(null), null);
  assert.equal(joltOf({ x: 1, y: null, z: 1 }), null);
  assert.equal(joltOf({ x: 0, y: 0, z: 0 }), -9.81);
});

test('a jolt right at the threshold counts, just under does not', () => {
  const at = { x: 0, y: 0, z: 9.81 + SHAKE.threshold };
  const under = { x: 0, y: 0, z: 9.81 + SHAKE.threshold - 0.01 };
  assert.equal(shakeCounter()(0, under), 0);
  assert.equal(shakeCounter()(0, at), 1);
});

test('the counter can be tuned', () => {
  const step = shakeCounter({ need: 2, threshold: 5 });
  const soft = { x: 0, y: 0, z: 9.81 + 6 };
  assert.equal(step(0, soft), 1);
  assert.equal(step(200, soft), 2);
  assert.equal(step(400, soft), 2);
});

const events = [{ date: '2026-12-03' }, { date: '2026-10-15' }, { date: '2026-10-29' }];

test('a date finds its meetup; the next meetup is the soonest strictly after it', () => {
  assert.equal(meetupOn(events, '2026-10-29'), events[2]);
  assert.equal(meetupOn(events, '2026-10-30'), undefined);
  assert.equal(nextMeetup(events, '2026-10-15').date, '2026-10-29');
  assert.equal(nextMeetup(events, '2026-10-29').date, '2026-12-03');
  assert.equal(nextMeetup(events, '2026-12-03'), undefined);
  assert.deepEqual(events.map(e => e.date), ['2026-12-03', '2026-10-15', '2026-10-29'], 'the list is left as it was');
});

test('the debounce counts at exactly the gap and caps at SHAKES', () => {
  const step = shakeCounter();
  step(0, jolt);
  assert.equal(step(149, jolt), 0);
  assert.equal(step(150, jolt), 2);
  assert.equal(step(300, jolt), 3);
  assert.equal(step(450, jolt), SHAKES);
});

test('in today on a non-meetup date shows up but does not score', () => {
  const { meetups, present } = tally([{ event_date: '2026-10-20', members: iso }], new Set(['2026-10-15']), '2026-10-20');
  assert.deepEqual(present, [iso]);
  assert.equal(meetups.size, 0);
});

test('merged PRs count per login, case-insensitive, bots left out', () => {
  const prs = countPRs([
    { user: { login: 'Iso', type: 'User' } },
    { user: { login: 'iso', type: 'User' } },
    { user: { login: 'dependabot[bot]', type: 'Bot' } },
    { user: null },
  ]);
  assert.equal(prs.get('iso'), 2);
  assert.equal(prs.size, 1);
});

test('the leaderboard adds meetups and PRs and drops members with nothing', () => {
  const members = [
    { id: 'u1', login: 'Iso', name: 'Iso' },
    { id: 'u2', login: 'mare', name: 'Mare' },
    { id: 'u3', login: 'new', name: 'New' },
  ];
  const meetups = new Map([['u2', { meetups: 3 }]]);
  const prs = new Map([['iso', 2]]);
  const rows = leaderboard(members, meetups, prs);
  assert.deepEqual(rows.map(r => [r.member.name, r.points]), [['Mare', 3 * POINTS.meetup], ['Iso', 2 * POINTS.pr]]);
  assert.deepEqual(POINTS, { meetup: 1, pr: 1 });
});
