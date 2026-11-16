import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildMonths } from '../src/js/calendar.js';
import { pickNext, formatDate } from '../src/js/meetup.js';

const require = createRequire(import.meta.url);
const { slug, reposFrom } = require('../src/_data/prRepos.js');

const ev = (date, extra = {}) => ({ date, title: `Meetup ${date}`, partiful: null, ...extra });

test('the calendar shows each quarter with an event, in order, and nothing else', () => {
  const months = buildMonths([ev('2027-02-10'), ev('2026-10-15'), ev('2026-11-12')], '2026-10-30');
  assert.deepEqual(months.map(m => `${m.name} ${m.year}`), [
    'October 2026', 'November 2026', 'December 2026',
    'January 2027', 'February 2027', 'March 2027',
  ]);
});

test('with no events the calendar falls back to the current quarter', () => {
  const months = buildMonths([], '2026-05-20');
  assert.deepEqual(months.map(m => m.name), ['April', 'May', 'June']);
});

test('calendar weeks start on Sunday, pad with nulls, and carry events and today', () => {
  const [oct] = buildMonths([ev('2026-10-15', { partiful: 'https://partiful.com/e/x' })], '2026-10-30');
  // 1 October 2026 is a Thursday
  assert.deepEqual(oct.weeks[0].slice(0, 5).map(d => d && d.day), [null, null, null, null, 1]);
  assert.ok(oct.weeks.every(w => w.length === 7));
  const days = oct.weeks.flat().filter(Boolean);
  assert.equal(days.length, 31);
  assert.deepEqual(days.filter(d => d.isToday).map(d => d.date), ['2026-10-30']);
  // every day (not just event days) knows whether it's behind "today", for
  // the current month's own day-by-day gray-out
  assert.equal(days.find(d => d.date === '2026-10-15').isPast, true);
  assert.equal(days.find(d => d.date === '2026-10-30').isPast, false);
  assert.equal(days.find(d => d.date === '2026-10-31').isPast, false);
  const [meetup] = days.find(d => d.date === '2026-10-15').events;
  // 2026-10-15 is before "today" (2026-10-30), so it's already past
  assert.equal(meetup.isPast, true);
  assert.equal(meetup.tooltip, 'Meetup 2026-10-15: see the recap');
});

test('meetups without a Partiful link say so in the tooltip', () => {
  const [oct] = buildMonths([ev('2026-10-29')], '2026-10-01');
  const [meetup] = oct.weeks.flat().find(d => d && d.date === '2026-10-29').events;
  assert.equal(meetup.isPast, false);
  assert.match(meetup.tooltip, /Partiful TBA/);
});

test('a past meetup says "see the recap" even with a Partiful link, and today\'s own meetup is not past', () => {
  const [oct] = buildMonths([ev('2026-10-15', { partiful: 'https://partiful.com/e/x' }), ev('2026-10-30')], '2026-10-30');
  const days = oct.weeks.flat().filter(Boolean);
  const [past] = days.find(d => d.date === '2026-10-15').events;
  assert.equal(past.isPast, true);
  assert.equal(past.tooltip, 'Meetup 2026-10-15: see the recap');
  const [today] = days.find(d => d.date === '2026-10-30').events;
  assert.equal(today.isPast, false);
});

test('months fully before today are past; the current month is not', () => {
  const months = buildMonths([ev('2026-08-01'), ev('2026-11-01')], '2026-10-30');
  const past = Object.fromEntries(months.map(m => [m.name, m.isPast]));
  assert.deepEqual(past, { July: true, August: true, September: true, October: false, November: false, December: false });
});

test('leap years give February 29 days', () => {
  const months = buildMonths([ev('2028-02-01')], '2028-01-01');
  assert.equal(months[1].weeks.flat().filter(Boolean).length, 29);
});

test('the next meetup is the soonest on or after today, with a readable date', () => {
  const events = [ev('2026-12-03'), ev('2026-10-15'), ev('2026-10-29')];
  assert.equal(pickNext(events, '2026-10-29').date, '2026-10-29');
  assert.equal(pickNext(events, '2026-10-30').date, '2026-12-03');
  assert.equal(pickNext(events, '2026-10-30').dateLabel, 'December 3, 2026');
  assert.equal(pickNext(events, '2027-01-01'), null);
  assert.equal(formatDate('2027-01-01'), 'January 1, 2027');
});

test('PR points count this repo and each project repo once', () => {
  assert.equal(slug('https://github.com/maremarebell/claudesquad'), 'maremarebell/claudesquad');
  assert.equal(slug('https://github.com/a/b/tree/main#readme'), 'a/b');
  assert.equal(slug('https://gitlab.com/a/b'), undefined);
  assert.equal(slug(undefined), undefined);
  assert.deepEqual(reposFrom([
    '---\nname: X\nrepo: https://github.com/a/x\n---\n',
    '---\nname: Y\nrepo: https://github.com/maremarebell/claudesquad\n---\n',
    '---\nname: Z\n---\nno repo line',
  ], 'https://github.com/maremarebell/claudesquad'), ['a/x', 'maremarebell/claudesquad']);
});

// The content people add by PR: catch a broken file before the site builds.

const src = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src');
const frontMatter = file => {
  const text = fs.readFileSync(file, 'utf8');
  const block = text.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(block, `${file} starts with front matter`);
  return Object.fromEntries(block[1].split('\n')
    .map(line => line.match(/^(\w+):\s*(.*)$/))
    .filter(Boolean)
    .map(([, k, v]) => [k, v.replace(/^(["'])(.*)\1$/, '$2')]));
};
const markdown = dir => fs.readdirSync(path.join(src, dir)).filter(f => f.endsWith('.md')).map(f => path.join(src, dir, f));
const exists = url => fs.existsSync(path.join(src, url));

test('every meetup in events.json is well formed', () => {
  const events = require('../src/_data/events.json');
  assert.ok(Array.isArray(events));
  const dates = new Set();
  for (const e of events) {
    assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/, JSON.stringify(e));
    assert.equal(new Date(`${e.date}T00:00:00Z`).toISOString().slice(0, 10), e.date, `${e.date} is a real date`);
    assert.ok(!dates.has(e.date), `${e.date} appears once`);
    dates.add(e.date);
    assert.equal(typeof e.title, 'string');
    assert.ok(e.title.trim(), `${e.date} has a title`);
    assert.ok('partiful' in e, `${e.date} has a partiful field`);
    if (e.partiful !== null) assert.match(e.partiful, /^https:\/\/(www\.)?partiful\.com\//, `${e.date} links to Partiful`);
    if ('place' in e && e.place !== null) assert.ok(typeof e.place === 'string' && e.place.trim(), `${e.date} place is a non-empty string`);
  }
});

test('every profile has a name, and its photo exists', () => {
  for (const file of markdown('profiles')) {
    const fm = frontMatter(file);
    assert.ok(fm.name, `${file} has a name`);
    if (fm.photo) assert.ok(exists(fm.photo), `${file}: ${fm.photo} exists`);
  }
});

test('every project has a name and a GitHub repo', () => {
  for (const file of markdown('projects')) {
    const fm = frontMatter(file);
    assert.ok(fm.name, `${file} has a name`);
    assert.ok(slug(fm.repo), `${file}: repo is a GitHub URL`);
  }
});
