// End-to-end check of logins, members and bumps against the LOCAL Supabase
// (`npx supabase start`). Never point this at the real project: it creates
// users. Run: node scripts/bump-e2e.mjs
import { execSync } from 'node:child_process';
import assert from 'node:assert/strict';

const env = Object.fromEntries(execSync('npx supabase status -o env', { encoding: 'utf8' })
  .split('\n').filter(l => l.includes('=')).map(l => {
    const i = l.indexOf('=');
    return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')];
  }));
const URL = env.API_URL;
if (!/127\.0\.0\.1|localhost/.test(URL)) throw new Error(`refusing to run against ${URL}`);
const ANON = env.ANON_KEY;
const SERVICE = env.SERVICE_ROLE_KEY;
const sql = q => execSync('docker exec -i supabase_db_claudesquad psql -U postgres -tA', { input: q, encoding: 'utf8' }).trim();

async function call(path, { key = ANON, jwt, method = 'GET', body } = {}) {
  const res = await fetch(URL + path, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${jwt || key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body && JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

// A GitHub-shaped user: the account plus the identity GitHub would have sent.
async function githubUser(login) {
  const email = `${login}@example.test`;
  const { body: u } = await call('/auth/v1/admin/users', {
    key: SERVICE, method: 'POST',
    body: { email, password: 'test-password-1', email_confirm: true, user_metadata: { user_name: login, full_name: login.toUpperCase() } },
  });
  sql(`insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
       values ('${login}-gh', '${u.id}', '{"user_name":"${login}","avatar_url":"https://avatars.githubusercontent.com/${login}"}', 'github', now(), now(), now());`);
  const { body: s } = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password: 'test-password-1' } });
  assert.ok(s.access_token, `sign-in failed for ${login}: ${JSON.stringify(s)}`);
  return { id: u.id, login, jwt: s.access_token };
}

const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push(`ok   ${name}`); } catch (e) { results.push(`FAIL ${name}: ${e.message}`); }
};

sql("delete from auth.users where email like '%@example.test';");
const stamp = Date.now().toString(36);
const a = await githubUser(`ana${stamp}`);
const b = await githubUser(`ben${stamp}`);
const c = await githubUser(`cy${stamp}`);
const gym = { at_lat: 40.7411, at_lng: -73.9897 };
const nearby = { at_lat: 40.7414, at_lng: -73.9893 };      // ~45m away
const farAway = { at_lat: 40.6782, at_lng: -73.9442 };     // Brooklyn, ~8km

await check('a member row takes login and avatar from GitHub, not the request', async () => {
  const { status, body } = await call('/rest/v1/members', {
    jwt: a.jwt, method: 'POST',
    body: { id: a.id, login: 'torvalds', name: 'Ana', avatar_url: 'https://evil.example/p.gif' },
  });
  assert.equal(status, 201);
  assert.equal(body[0].login, a.login);
  assert.equal(body[0].avatar_url, `https://avatars.githubusercontent.com/${a.login}`);
});
for (const u of [b, c]) await call('/rest/v1/members', { jwt: u.jwt, method: 'POST', body: { id: u.id, login: u.login, name: u.login } });

await check('nobody can insert a check-in directly', async () => {
  const { status } = await call('/rest/v1/checkins', { jwt: a.jwt, method: 'POST', body: { user_id: a.id, event_date: new Date().toISOString().slice(0, 10) } });
  assert.notEqual(status, 201);
});

await check('signed-out callers cannot bump', async () => {
  const { status } = await call('/rest/v1/rpc/bump', { method: 'POST', body: gym });
  assert.notEqual(status, 200);
});

await check('a bump with nobody else around waits', async () => {
  const { body } = await call('/rest/v1/rpc/bump', { jwt: a.jwt, method: 'POST', body: gym });
  assert.equal(body.matched, false);
});

await check('someone far away at the same moment does not match', async () => {
  const { body } = await call('/rest/v1/rpc/bump', { jwt: c.jwt, method: 'POST', body: farAway });
  assert.equal(body.matched, false);
});

await check('two people shaking together nearby both get checked in', async () => {
  const { body } = await call('/rest/v1/rpc/bump', { jwt: b.jwt, method: 'POST', body: nearby });
  assert.equal(body.matched, true);
  assert.deepEqual(body.with, ['Ana']);
  const ids = sql("select string_agg(user_id::text, ',') from public.checkins;");
  assert.ok(ids.includes(a.id) && ids.includes(b.id), 'both in');
  assert.ok(!ids.includes(c.id), 'the far one is not');
});

await check('locations are unreadable to members', async () => {
  const { body } = await call('/rest/v1/bumps?select=lat,lng', { jwt: a.jwt });
  assert.deepEqual(body, []);
});

await check('a stale bump (over 20s old) does not match', async () => {
  sql(`update public.bumps set at = now() - interval '30 seconds';`);
  sql(`delete from public.checkins where user_id = '${c.id}';`);
  const { body } = await call('/rest/v1/rpc/bump', { jwt: c.jwt, method: 'POST', body: gym });
  assert.equal(body.matched, false);
});

await check('someone already in can bump a newcomer in', async () => {
  const { body } = await call('/rest/v1/rpc/bump', { jwt: a.jwt, method: 'POST', body: nearby });
  assert.equal(body.matched, true);
  assert.ok(sql(`select count(*) from public.checkins where user_id = '${c.id}';`) === '1');
});

await check('the leaderboard read works for members', async () => {
  const { status, body } = await call('/rest/v1/checkins?select=event_date,members(id,name)', { jwt: b.jwt });
  assert.equal(status, 200);
  assert.ok(body.length >= 3 && body.every(r => r.members));
});

sql("delete from auth.users where email like '%@example.test';");
console.log(results.join('\n'));
if (results.some(r => r.startsWith('FAIL'))) process.exit(1);
