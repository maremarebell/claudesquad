const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Eleventy = require('@11ty/eleventy');
const { jsVersion } = require('../.eleventy.js');

// Scripts are served from /js/<version>/, so one page's imports all come
// from the same build however the CDN caches each file.
test('the script version follows the scripts\' contents', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'js-'));
  fs.writeFileSync(path.join(dir, 'a.js'), 'export const a = 1;');
  fs.writeFileSync(path.join(dir, 'b.js'), 'export const b = 2;');
  fs.mkdirSync(path.join(dir, 'sub'));
  const v = jsVersion(dir);
  assert.match(v, /^[0-9a-f]{10}$/);
  assert.equal(jsVersion(dir), v, 'same files, same version');
  fs.writeFileSync(path.join(dir, 'b.js'), 'export const b = 3;');
  assert.notEqual(jsVersion(dir), v, 'a changed file changes it');
  fs.writeFileSync(path.join(dir, 'b.js'), 'export const b = 2;');
  assert.equal(jsVersion(dir), v);
  fs.renameSync(path.join(dir, 'b.js'), path.join(dir, 'c.js'));
  assert.notEqual(jsVersion(dir), v, 'a renamed file changes it');
  fs.rmSync(dir, { recursive: true });
});

// The pages are React components rendered by the build. Render the whole site
// in memory (nothing is written) and read the documents back.
const pages = {};
before(async () => {
  const root = path.join(__dirname, '..');
  const site = new Eleventy(path.join(root, 'src'), path.join(os.tmpdir(), 'squad-site'), {
    configPath: path.join(root, '.eleventy.js'),
    quietMode: true,
  });
  // permalink: false entries (gallery, projects) have no url and no page
  for (const page of await site.toJSON()) if (page.url) pages[page.url] = page.content;
});

const js = `/js/${jsVersion(path.join(__dirname, '..', 'src', 'js'))}`;
const scripts = html => [...html.matchAll(/<script type="module" src="([^"]+)"/g)].map(m => m[1]);
const importmap = html => JSON.parse(html.match(/<script type="importmap">([^<]+)<\/script>/)[1]).imports;

test('every page is a full document with its scripts from the versioned folder', () => {
  const urls = Object.keys(pages);
  for (const url of ['/', '/calendar/', '/members/', '/members/dsshimel/', '/projects/', '/admin/', '/here/']) {
    assert.ok(urls.includes(url), `${url} is built (have ${urls.join(' ')})`);
  }
  for (const [url, html] of Object.entries(pages)) {
    assert.ok(html.startsWith('<!DOCTYPE html>'), `${url} starts with a doctype`);
    assert.match(html, /<html lang="en"><head>/, `${url} has a head`);
    assert.match(html, /<main class="main">/, `${url} has a main`);
    const srcs = scripts(html);
    assert.ok(srcs.length >= 2, `${url} loads site.js and mount.js`);
    for (const src of srcs) assert.ok(src.startsWith(`${js}/`), `${url}: ${src}`);
  }
});

test('the browser gets the same React and htm the build rendered with', () => {
  const map = importmap(pages['/']);
  assert.equal(map.react, `https://esm.sh/react@${require('react/package.json').version}`);
  assert.equal(map['react-dom/client'], `https://esm.sh/react-dom@${require('react-dom/package.json').version}/client`);
  const htm = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'htm', 'package.json'), 'utf8')).version;
  assert.equal(map.htm, `https://esm.sh/htm@${htm}`);
  assert.match(map['@react-three/fiber'], /\?external=react,react-dom,three$/, 'one copy of three on the page');
  assert.equal(map.three, pages['/'].match(/<link rel="modulepreload" href="([^"]+three\.module[^"]+)"/)[1], 'the hero preloads the same three');
});

test('the nav marks the current page and titles follow the page', () => {
  assert.match(pages['/'], /<title>Claude Squad<\/title>/);
  assert.match(pages['/calendar/'], /<title>2026 Calendar · Claude Squad<\/title>/);
  assert.match(pages['/members/dsshimel/'], /<title>David · Claude Squad<\/title>/);
  assert.match(pages['/calendar/'], /<a href="\/calendar\/" class="nav__link" aria-current="page">Calendar<\/a>/);
  assert.match(pages['/members/dsshimel/'], /<a href="\/members\/" class="nav__link" aria-current="page">Members<\/a>/);
  assert.doesNotMatch(pages['/'], /aria-current/);
  assert.match(pages['/admin/'], /<meta name="robots" content="noindex"\/?>/);
  assert.doesNotMatch(pages['/'], /name="robots"/);
});

test('the islands are rendered with their props on the element', () => {
  const island = (html, name) => {
    const m = html.match(new RegExp(`<([a-z]+)([^>]*) data-island="${name}" data-props="([^"]*)"`));
    assert.ok(m, `${name} island`);
    const text = m[3].replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
    return { tag: m[1], attrs: m[2], props: JSON.parse(text) };
  };
  const board = island(pages['/'], 'board');
  assert.equal(board.tag, 'section');
  assert.match(board.attrs, /id="board"/);
  assert.ok(Array.isArray(board.props.prRepos) && Array.isArray(board.props.events));
  assert.match(pages['/'], /data-island="board"[^>]*><h2>Leaderboard<\/h2>/, 'the board frame is rendered');
  const meetup = island(pages['/'], 'meetup');
  assert.match(meetup.attrs, /class="hero__meetup ticks"/);
  assert.match(meetup.props.today, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(pages['/'], /<span class="hero__tag">NYC<\/span>/, 'the hero tag stays out of the island for hero.js');
  const here = island(pages['/here/'], 'here');
  assert.match(here.attrs, /id="here-root"/);
  assert.deepEqual(Object.keys(here.props).sort(), ['apiUrl', 'branch', 'events', 'prRepos', 'repo']);
  assert.match(pages['/here/'], /<h1 class="page-title" id="here-title">Log in<\/h1>/);
  assert.match(pages['/here/'], /<p class="here__status" id="here-status" role="status">Loading…<\/p>/);
  assert.match(pages['/here/'], /<form class="here__join" id="here-join">/, 'the join form is in the markup before React loads');
  assert.match(pages['/here/'], /class="here__links"/);
  assert.match(pages['/here/'], /Couldn't load the page/, 'the no-React fallback script');
  assert.equal(island(pages['/calendar/'], 'calendar').tag, 'div');
  assert.match(pages['/calendar/'], /calendar__month-block/);
  assert.match(pages['/calendar/'], /calendar__day--event/, 'meetups are on the grid');
  assert.equal(island(pages['/projects/'], 'working').tag, 'section');
  assert.match(pages['/projects/'], /<form class="working__form" hidden=""/);
  assert.ok(island(pages['/admin/'], 'admin').props.events.length > 0);
  assert.doesNotMatch(pages['/members/'], /data-island/, 'members has no island');
});

test('the content pages carry their data', () => {
  assert.match(pages['/members/'], /<a href="\/members\/dsshimel\/" class="members__item">/);
  assert.match(pages['/members/dsshimel/'], /<h1 class="profile__name page-title">David<\/h1>/);
  assert.match(pages['/projects/'], /<h2 class="project__name"><a href="https:\/\/github\.com\/maremarebell\/claudesquad"/);
  assert.match(pages['/projects/'], /<div class="project__about"><p>This website/, 'the project body is rendered Markdown');
  assert.match(pages['/projects/'], /\/new\/main\/src\/projects\?filename=your-project\.md&amp;value=---%0A/);
  // React writes apostrophes as &#x27;
  assert.match(pages['/'], /<mark>NYC&#x27;s most elite fitness and computing club<\/mark>\. <mark>We set PRs while we push PRs\.<\/mark> We burn/);
  assert.match(pages['/admin/'], /<p>Paste a Partiful link/);
  assert.match(pages['/'], /<script type="module" src="[^"]+\/hero\.js">/);
});
