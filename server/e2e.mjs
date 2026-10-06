// End-to-end check of the server against a throwaway local Postgres:
//   docker run -d --rm --name sq-pg -e POSTGRES_PASSWORD=local -p 55432:5432 postgres:16-alpine
//   node server/e2e.mjs
// Starts the server itself on a spare port. Refuses any non-local database.
import { spawn, execSync } from 'node:child_process';
import assert from 'node:assert/strict';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:local@127.0.0.1:55432/postgres';
if (!/127\.0\.0\.1|localhost/.test(DATABASE_URL)) throw new Error('local databases only');
const PORT = 10123;
const API = `http://127.0.0.1:${PORT}`;
const sql = q => execSync(`docker exec -i sq-pg psql -U postgres -tA`, { input: q, encoding: 'utf8' }).trim();

sql('drop schema if exists claudesquad cascade; drop table if exists posts, sessions, bumps, checkins, members cascade;');
const server = spawn('node', [new URL('./index.mjs', import.meta.url).pathname], {
  env: { ...process.env, DATABASE_URL, PORT, SITE_URL: 'https://claudesquad.onrender.com' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise(r => server.stdout.once('data', r));

async function call(path, { token, method = 'GET', body, origin } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }), ...(origin && { Origin: origin }) },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) };
}
const join = async (name, github) => (await call('/api/join', { method: 'POST', body: { name, github } })).body;

const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push(`ok   ${name}`); } catch (e) { results.push(`FAIL ${name}: ${e.message}`); }
};
const gym = { lat: 40.7411, lng: -73.9897 };
const nearby = { lat: 40.7414, lng: -73.9893 };
const farAway = { lat: 40.6782, lng: -73.9442 };
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

let ana, ben, cy;
await check('joining with a name and GitHub username signs you in', async () => {
  ana = await join('Ana', 'ana-gh');
  assert.ok(ana.token);
  const me = await call('/api/me', { token: ana.token });
  assert.equal(me.body.member.name, 'Ana');
  assert.equal(me.body.member.avatar_url, 'https://github.com/ana-gh.png?size=96');
  ben = await join('Ben', 'ben-gh');
  cy = await join('Cy', 'cy-gh');
});

await check('a GitHub username already in the squad cannot be taken by typing it', async () => {
  const r = await call('/api/join', { method: 'POST', body: { name: 'Not Ana', github: 'ANA-gh' } });
  assert.equal(r.status, 409);
});

await check('bad input is refused with a message', async () => {
  assert.equal((await call('/api/join', { method: 'POST', body: { name: '', github: 'x' } })).status, 400);
  assert.equal((await call('/api/join', { method: 'POST', body: { name: 'X', github: 'not a login!' } })).status, 400);
  assert.equal((await call('/api/bump', { method: 'POST', token: ana.token, body: { lat: 'x' } })).status, 400);
});

await check('signed-out callers cannot bump or read the board', async () => {
  assert.equal((await call('/api/bump', { method: 'POST', body: gym })).status, 401);
  assert.equal((await call(`/api/board?dates=${today}`)).status, 401);
});

await check('a bump alone waits; someone far away does not match', async () => {
  assert.equal((await call('/api/bump', { method: 'POST', token: ana.token, body: gym })).body.matched, false);
  assert.equal((await call('/api/bump', { method: 'POST', token: cy.token, body: farAway })).body.matched, false);
});

await check('two people shaking together nearby both get checked in', async () => {
  const r = await call('/api/bump', { method: 'POST', token: ben.token, body: nearby });
  assert.deepEqual(r.body, { matched: true, with: ['Ana'] });
  const board = await call(`/api/board?dates=${today}`, { token: cy.token });
  assert.deepEqual(board.body.map(row => row.members.name).sort(), ['Ana', 'Ben']);
  assert.ok(board.body.every(row => row.event_date === today));
});

await check('a bump over 20s old does not match; someone already in can bring a newcomer in', async () => {
  sql("update claudesquad.bumps set at = now() - interval '30 seconds';");
  assert.equal((await call('/api/bump', { method: 'POST', token: cy.token, body: gym })).body.matched, false);
  const r = await call('/api/bump', { method: 'POST', token: ana.token, body: nearby });
  assert.deepEqual(r.body.with, ['Cy']);
  assert.equal(sql(`select count(*) from claudesquad.checkins;`), '3');
});

await check('two bumps in the same instant still match', async () => {
  sql("update claudesquad.bumps set at = now() - interval '30 seconds';");
  const dee = await join('Dee', 'dee-gh');
  const eli = await join('Eli', 'eli-gh');
  const both = await Promise.all([dee, eli].map(u => call('/api/bump', { method: 'POST', token: u.token, body: gym })));
  assert.ok(both.some(r => r.body.matched), JSON.stringify(both.map(r => r.body)));
  assert.equal(sql(`select count(*) from claudesquad.checkins;`), '5');
});

await check('the site may call the API; other origins get no CORS header', async () => {
  const ok = await call('/api/config', { origin: 'https://claudesquad.onrender.com' });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://claudesquad.onrender.com');
  const no = await call('/api/config', { origin: 'https://evil.example' });
  assert.equal(no.headers.get('access-control-allow-origin'), null);
});

await check('the leaderboard is public and counts only the dates asked for', async () => {
  const r = await call(`/api/leaderboard?dates=${today}`);
  assert.equal(r.status, 200);
  const byName = Object.fromEntries(r.body.map(m => [m.name, m.meetups]));
  assert.equal(byName.Ana, 1);
  assert.equal(byName.Dee + byName.Eli, 2);
  const none = await call('/api/leaderboard?dates=2000-01-01');
  assert.ok(none.body.every(m => m.meetups === 0));
});

await check('members post what they work on; anyone reads it; only the author deletes it', async () => {
  assert.equal((await call('/api/posts', { method: 'POST', body: { body: 'x' } })).status, 401);
  const made = await call('/api/posts', { method: 'POST', token: ana.token, body: { body: 'Shader for the hero', link: 'https://github.com/x/y' } });
  assert.equal(made.status, 200);
  assert.equal((await call('/api/posts', { method: 'POST', token: ana.token, body: { body: 'again' } })).status, 429);
  assert.equal((await call('/api/posts', { method: 'POST', token: ben.token, body: { body: 'x', link: 'javascript:alert(1)' } })).status, 400);
  const feed = await call('/api/posts');
  assert.equal(feed.body[0].body, 'Shader for the hero');
  assert.equal(feed.body[0].member.name, 'Ana');
  await call('/api/posts/delete', { method: 'POST', token: ben.token, body: { id: made.body.id } });
  assert.equal((await call('/api/posts')).body.length, 1);
  await call('/api/posts/delete', { method: 'POST', token: ana.token, body: { id: made.body.id } });
  assert.equal((await call('/api/posts')).body.length, 0);
});

await check('signing out ends the session', async () => {
  await call('/api/signout', { method: 'POST', token: cy.token });
  assert.equal((await call('/api/me', { token: cy.token })).status, 401);
});

server.kill();
console.log(results.join('\n'));
if (results.some(r => r.startsWith('FAIL'))) process.exit(1);
