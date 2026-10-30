import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Oops, hash, allowedOrigins, connectionFor, readJSON, bearer, stateFromCookie, avatarFor, parseDates,
  cleanJoin, takenMessage, cleanPost, cleanBump, bumpResult, githubAuthorizeUrl, errorReply,
  githubState, appFromState, codeFrom, cleanCode, claimKey, CODE_CHARS,
} from '../server/rules.mjs';

const oops = (status, message) => err => err instanceof Oops && err.status === status && (!message || err.message === message);

test('session tokens are stored as a stable sha256', () => {
  assert.equal(hash('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.notEqual(hash('abc'), hash('abd'));
});

test('the live site and local dev are always allowed origins, whatever SITE_URL looks like', () => {
  const origins = allowedOrigins('https://preview.example.com/some/path/');
  assert.ok(origins.has('https://preview.example.com'));
  assert.ok(origins.has('https://claudesquad.onrender.com'));
  assert.ok(origins.has('http://localhost:8080'));
  assert.ok(origins.has('http://127.0.0.1:8080'));
  assert.ok(!origins.has('https://evil.example.com'));
});

test('Neon connects to the direct host with SSL; local and Docker databases skip SSL', () => {
  const neon = connectionFor('postgres://u:p@ep-cool-123-pooler.us-west-2.aws.neon.tech/db');
  assert.equal(neon.connectionString, 'postgres://u:p@ep-cool-123.us-west-2.aws.neon.tech/db');
  assert.deepEqual(neon.ssl, { rejectUnauthorized: false });
  assert.equal(connectionFor('postgres://postgres:local@127.0.0.1:55432/postgres').ssl, false);
  assert.equal(connectionFor('postgres://postgres:local@localhost/postgres').ssl, false);
  assert.equal(connectionFor('postgres://postgres:local@db:5432/postgres').ssl, false);
  assert.equal(connectionFor(undefined).ssl, false);
});

test('request bodies parse as JSON, empty is {}, junk and floods are refused', async () => {
  assert.deepEqual(await readJSON(['{"a":', '1}']), { a: 1 });
  assert.deepEqual(await readJSON([]), {});
  await assert.rejects(readJSON(['{nope']), oops(400, 'bad JSON'));
  await assert.rejects(readJSON(['x'.repeat(6000), 'x'.repeat(6000)]), oops(413));
  assert.deepEqual(await readJSON(['{"a":"xx"}'], 10), { a: 'xx' });
  await assert.rejects(readJSON(['{"a":"xxx"}'], 10), oops(413));
});

test('bearer tokens come out of the header, a missing header is empty', () => {
  assert.equal(bearer('Bearer abc.def'), 'abc.def');
  assert.equal(bearer(undefined), '');
  assert.equal(bearer('abc'), 'abc');
});

test('the OAuth state is read from among other cookies, with its app nonce', () => {
  assert.equal(stateFromCookie('a=1; gh_state=deadbeef; b=2'), 'deadbeef');
  assert.equal(stateFromCookie('gh_state=beef.abc_DEF-123; b=2'), 'beef.abc_DEF-123');
  assert.equal(stateFromCookie('gh_state=NOTHEX'), undefined);
  assert.equal(stateFromCookie(undefined), undefined);
});

const NONCE = 'n'.repeat(24);

test('the home-screen app\'s nonce rides along in the state, if it looks like one', () => {
  assert.equal(githubState('beef', NONCE), `beef.${NONCE}`);
  assert.equal(appFromState(`beef.${NONCE}`), NONCE);
  assert.equal(githubState('beef', 'short'), 'beef');
  assert.equal(githubState('beef', 'x'.repeat(20) + '.evil'), 'beef');
  assert.equal(githubState('beef', null), 'beef');
  assert.equal(appFromState('beef'), undefined);
});

test('sign-in codes are XXXX-XXXX from easy-to-read characters', () => {
  assert.equal(codeFrom([0, 1, 2, 3, 4, 5, 6, 7]), 'ABCD-EFGH');
  assert.equal(codeFrom([CODE_CHARS.length, 255, 255, 255, 255, 255, 255, 255]).length, 9);
  for (let i = 0; i < 50; i++) {
    const code = codeFrom(Array.from({ length: 8 }, () => Math.floor(Math.random() * 256)));
    assert.match(code, /^[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}$/);
  }
});

test('typed codes forgive case, dashes and spaces; app nonces are taken as sent', () => {
  assert.equal(cleanCode(' abcd-efgh '), 'ABCDEFGH');
  assert.equal(cleanCode(undefined), '');
  assert.equal(claimKey('abcd efgh'), 'ABCDEFGH');
  assert.equal(claimKey(NONCE), NONCE);
  assert.equal(claimKey('Ab_cd-ef' + 'g'.repeat(20)), 'Ab_cd-ef' + 'g'.repeat(20));
});

test('avatars come from GitHub at 96px', () => {
  assert.equal(avatarFor('octocat'), 'https://github.com/octocat.png?size=96');
});

test('only well-formed dates are queried, at most 400', () => {
  assert.deepEqual(parseDates('2026-10-15,nope,2026-11-01,; drop table'), ['2026-10-15', '2026-11-01']);
  assert.deepEqual(parseDates(null), []);
  assert.equal(parseDates(Array(500).fill('2026-01-01').join(',')).length, 400);
});

test('joining needs a name (trimmed to 40) and a real-looking GitHub username', () => {
  assert.deepEqual(cleanJoin({ name: '  Mare  ', github: 'mare-bell' }), { name: 'Mare', login: 'mare-bell' });
  assert.equal(cleanJoin({ name: 'x'.repeat(60), github: 'a' }).name.length, 40);
  assert.throws(() => cleanJoin({ name: '   ', github: 'mare' }), oops(400, 'Add your name.'));
  for (const github of ['', '-mare', 'has space', 'a'.repeat(40), '@mare', undefined]) {
    assert.throws(() => cleanJoin({ name: 'Mare', github }), oops(400), String(github));
  }
  assert.doesNotThrow(() => cleanJoin({ name: 'Mare', github: 'a'.repeat(39) }));
});

test('a taken username points to GitHub sign-in only when it is set up', () => {
  assert.match(takenMessage(true), /Sign in with GitHub/);
  assert.doesNotMatch(takenMessage(false), /Sign in with GitHub/);
  assert.match(takenMessage(false), /Sign in somewhere else/);
});

test('posts need text (trimmed to 280) and only http(s) links', () => {
  assert.deepEqual(cleanPost({ body: ' a thing ', link: '' }), { body: 'a thing', link: null });
  assert.deepEqual(cleanPost({ body: 'x', link: ' https://github.com/a/b ' }), { body: 'x', link: 'https://github.com/a/b' });
  assert.equal(cleanPost({ body: 'y'.repeat(400) }).body.length, 280);
  assert.throws(() => cleanPost({ body: '  ' }), oops(400));
  for (const link of ['javascript:alert(1)', 'github.com/a', 'https://a b', 'ftp://x']) {
    assert.throws(() => cleanPost({ body: 'x', link }), oops(400, 'Links start with https://'), link);
  }
});

test('a bump needs a numeric location on the globe', () => {
  assert.deepEqual(cleanBump({ lat: 40.7, lng: -74 }), { lat: 40.7, lng: -74 });
  assert.deepEqual(cleanBump({ lat: -90, lng: 180 }), { lat: -90, lng: 180 });
  for (const at of [{}, { lat: '40', lng: -74 }, { lat: 91, lng: 0 }, { lat: 0, lng: -181 }, { lat: 0 }]) {
    assert.throws(() => cleanBump(at), oops(400), JSON.stringify(at));
  }
});

test('a match returns everyone matched, sorted by name; no match says so', () => {
  assert.deepEqual(bumpResult([]), { matched: false });
  assert.deepEqual(bumpResult([
    { member_id: 2, name: 'Zed', avatar_url: 'z' },
    { member_id: 1, name: 'Ann', avatar_url: 'a' },
  ]), { matched: true, members: [{ id: 1, name: 'Ann', avatar_url: 'a' }, { id: 2, name: 'Zed', avatar_url: 'z' }] });
});

test('GitHub sign-in sends the state and the callback on this server', () => {
  const url = new URL(githubAuthorizeUrl({ clientId: 'cid', state: 'abc', apiUrl: 'https://api.example.com' }));
  assert.equal(url.origin + url.pathname, 'https://github.com/login/oauth/authorize');
  assert.equal(url.searchParams.get('client_id'), 'cid');
  assert.equal(url.searchParams.get('state'), 'abc');
  assert.equal(url.searchParams.get('scope'), 'read:user');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://api.example.com/api/auth/github/callback');
});

test('errors keep their status and message; anything unexpected is a quiet 500', () => {
  assert.deepEqual(errorReply(new Oops(409, 'taken')), { status: 409, body: { error: 'taken' } });
  assert.deepEqual(errorReply(new Error('password=hunter2')), { status: 500, body: { error: 'Something broke on the server.' } });
});
