import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plural, ago, linkLabel, githubLogin, profileLink } from '../src/js/format.js';
import { readout, counterState } from '../src/js/motion-debug.js';

test('plural adds an s except for exactly one', () => {
  assert.equal(plural(0, 'meetup'), '0 meetups');
  assert.equal(plural(1, 'meetup'), '1 meetup');
  assert.equal(plural(2, 'PR'), '2 PRs');
});

test('post times read as just now, minutes, hours, then days', () => {
  const now = Date.parse('2026-10-30T12:00:00Z');
  const before = s => new Date(now - s * 1000).toISOString();
  assert.equal(ago(before(10), now), 'just now');
  assert.equal(ago(before(89), now), 'just now');
  assert.equal(ago(before(90), now), '2m ago');
  assert.equal(ago(before(45 * 60), now), '45m ago');
  assert.equal(ago(before(5400), now), '2h ago');
  assert.equal(ago(before(35 * 3600), now), '35h ago');
  assert.equal(ago(before(36 * 3600), now), '2d ago');
});

test('links show without scheme or trailing slash', () => {
  assert.equal(linkLabel('https://github.com/a/b/'), 'github.com/a/b');
  assert.equal(linkLabel('https://example.com'), 'example.com');
  assert.equal(linkLabel('http://example.com:8080/x?y=1'), 'example.com:8080/x');
});

test('typed GitHub usernames lose spaces and a leading @', () => {
  assert.equal(githubLogin('  @octocat '), 'octocat');
  assert.equal(githubLogin('octo@cat'), 'octo@cat');
});

test('the profile link opens GitHub with the file named and front matter started', () => {
  const url = new URL(profileLink(
    { repo: 'https://github.com/maremarebell/claudesquad', branch: 'main' },
    { login: 'mare', name: 'Mare: Co-Captain "MB"' }));
  assert.equal(url.pathname, '/maremarebell/claudesquad/new/main/src/profiles');
  assert.equal(url.searchParams.get('filename'), 'mare.md');
  assert.equal(url.searchParams.get('value'), '---\nname: "Mare: Co-Captain \\"MB\\""\nrole:\nphoto:\n---\n\n');
  const noName = new URL(profileLink({ repo: 'https://github.com/a/b', branch: 'x' }, { login: 'zed' }));
  assert.match(noName.searchParams.get('value'), /^---\nname: "zed"\n/);
});

const classes = (...names) => ({ contains: n => names.includes(n) });

test('the motion readout names what the check-in counter is doing', () => {
  assert.equal(counterState(classes()), 'not armed');
  assert.equal(counterState(classes('here--armed', 'here--motion')), 'listening');
  assert.equal(counterState(classes('here--armed')), 'tap only');
  assert.equal(counterState(classes('here--armed', 'here--motion', 'here--waiting')), 'bumping');
});

const quiet = { samples: [], hits: [], events: 0, missing: 0, max: 0, interval: null, accel: null, bar: 10, counter: 'not armed' };

test('before any motion the readout says so', () => {
  const text = readout(quiet, 5000);
  assert.match(text, /^no motion events yet\n/);
  assert.match(text, /peak +—  max +—/);
  assert.doesNotMatch(text, /no accel data/);
});

test('the readout shows rate, peak, missing readings and counted jolts', () => {
  const samples = [{ t: 3500, jolt: 2 }, { t: 4200, jolt: 18.25 }, { t: 4900, jolt: 0.5 }];
  const text = readout({
    samples, hits: [3000, 4200, 4600, 4800], events: 12, missing: 2, max: 21, interval: 16.4,
    accel: { x: 1, y: 2, z: 9.5 }, bar: 7.25, counter: 'listening',
  }, 5000);
  assert.deepEqual(text.split('\n'), [
    'events 12  2 Hz (16 ms)',
    'no accel data: 2',
    'x   1.0 y   2.0 z   9.5',
    'jolt    0.5  need 7.3',
    'peak   18.3  max   21.0',
    'jolts 3/3 in 1s',
    'counter: listening',
  ]);
});
