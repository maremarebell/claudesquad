// The check-in server: who you are, and bumps. Runs on Render next to its
// Postgres. The static site calls it from the browser.
//
//   POST /api/join            { name, github }        -> { token, member }
//   GET  /api/auth/github                             -> GitHub sign-in (when configured)
//   GET  /api/auth/github/callback                    -> back to /here/#token=...
//   GET  /api/me                                      -> { member }
//   GET  /api/members                                 -> [member]
//   GET  /api/board?dates=2026-10-15,...              -> [{ event_date, members }]
//   POST /api/bump            { lat, lng }            -> { matched, members: [{ name, avatar_url }] }
//   GET  /api/leaderboard?dates=...                   -> [{ ...member, meetups }]   (public)
//   GET  /api/posts                                   -> latest 50 posts            (public)
//   POST /api/posts           { body, link }          -> post
//   POST /api/posts/delete    { id }                  -> {}   (your own only)
//   GET  /api/config                                  -> { github }
//
// A bump is like the old Bump app: two members shaking within 20 seconds and
// 250 metres of each other are both checked in for today (New York date).
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';

const {
  DATABASE_URL, PORT = 10000,
  SITE_URL = 'https://claudesquad.onrender.com',
  GITHUB_CLIENT_ID, GITHUB_SECRET,
} = process.env;
const API_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
const ORIGINS = new Set([SITE_URL, 'http://localhost:8080', 'http://127.0.0.1:8080']);
const github = Boolean(GITHUB_CLIENT_ID && GITHUB_SECRET);

// Everything lives in its own schema, so the database can be shared with
// another project without any table of ours touching theirs.
const SCHEMA = process.env.DB_SCHEMA || 'claudesquad';
const connection = {
  connectionString: DATABASE_URL,
  ssl: /localhost|127\.0\.0\.1/.test(DATABASE_URL || '') || !/\./.test(new URL(DATABASE_URL || 'postgres://x').hostname)
    ? false : { rejectUnauthorized: false },
};
const db = new pg.Pool({ ...connection, options: `-c search_path=${SCHEMA}` });

// The port opens first and the database is set up after, retrying, so a
// missing or sleeping database shows up as a clear 503 instead of a server
// that never answers.
let ready = false;
let dbError = DATABASE_URL ? 'connecting to the database' : 'DATABASE_URL is not set';
async function setUp() {
  if (!DATABASE_URL) return;
  for (let wait = 1000; !ready; wait = Math.min(wait * 2, 30000)) {
    try {
      const setup = new pg.Client(connection);
      await setup.connect();
      await setup.query(`create schema if not exists ${SCHEMA}`);
      await setup.end();
      await db.query(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
      ready = true;
      console.log('database ready');
    } catch (e) {
      dbError = `database: ${e.message}`;
      console.error(dbError);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

const hash = token => createHash('sha256').update(token).digest('hex');
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

class Oops extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function body(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 10_000) throw new Oops(413, 'too much');
  }
  try { return JSON.parse(raw || '{}'); } catch { throw new Oops(400, 'bad JSON'); }
}

async function signIn(memberId) {
  const token = randomBytes(32).toString('base64url');
  await db.query('insert into sessions (token_hash, member_id) values ($1, $2)', [hash(token), memberId]);
  return token;
}

async function whoami(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!token) throw new Oops(401, 'sign in first');
  const { rows } = await db.query(
    `select m.id, m.login, m.name, m.avatar_url, m.verified from sessions s join members m on m.id = s.member_id
     where s.token_hash = $1`, [hash(token)]);
  if (!rows[0]) throw new Oops(401, 'sign in again');
  return rows[0];
}

const avatarFor = login => `https://github.com/${login}.png?size=96`;

const routes = {
  'GET /api/config': async () => ({ github }),

  'POST /api/join': async req => {
    const { name, github: login } = await body(req);
    const clean = String(name || '').trim().slice(0, 40);
    if (!clean) throw new Oops(400, 'Add your name.');
    if (!LOGIN.test(login || '')) throw new Oops(400, "That doesn't look like a GitHub username.");
    // A login someone already holds can only be reclaimed through GitHub sign-in,
    // so typing a friend's username doesn't take over their points.
    const taken = await db.query('select id, verified from members where lower(login) = lower($1)', [login]);
    if (taken.rows[0]) throw new Oops(409, github
      ? 'That GitHub username is already in the squad. Use Sign in with GitHub to get back in.'
      : 'That GitHub username is already in the squad on another phone. Use that phone, or ask a captain.');
    const { rows } = await db.query(
      'insert into members (login, name, avatar_url) values ($1, $2, $3) returning id, login, name, avatar_url, verified',
      [login, clean, avatarFor(login)]);
    return { token: await signIn(rows[0].id), member: rows[0] };
  },

  'GET /api/auth/github': async (req, res) => {
    if (!github) throw new Oops(404, 'GitHub sign-in is not set up');
    const state = randomBytes(16).toString('hex');
    res.writeHead(302, {
      'Set-Cookie': `gh_state=${state}; Path=/api/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      Location: `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&state=${state}&scope=read:user&redirect_uri=${encodeURIComponent(`${API_URL}/api/auth/github/callback`)}`,
    });
    res.end();
  },

  'GET /api/auth/github/callback': async (req, res, url) => {
    const state = (req.headers.cookie || '').match(/gh_state=([a-f0-9]+)/)?.[1];
    if (!state || state !== url.searchParams.get('state')) throw new Oops(400, 'Sign-in expired, try again.');
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, client_secret: GITHUB_SECRET, code: url.searchParams.get('code') }),
    }).then(r => r.json());
    if (!tokenRes.access_token) throw new Oops(400, 'GitHub said no. Try again.');
    const gh = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${tokenRes.access_token}`, 'User-Agent': 'claudesquad' },
    }).then(r => r.json());
    // GitHub vouches for this login, so it claims the row even if someone typed it first
    const { rows } = await db.query(
      `insert into members (login, name, avatar_url, github_id, verified) values ($1, $2, $3, $4, true)
       on conflict ((lower(login))) do update set github_id = excluded.github_id, avatar_url = excluded.avatar_url, verified = true,
         name = coalesce(members.name, excluded.name)
       returning id`,
      [gh.login, gh.name || gh.login, gh.avatar_url, gh.id]);
    const token = await signIn(rows[0].id);
    res.writeHead(302, { Location: `${SITE_URL}/here/#token=${token}` });
    res.end();
  },

  'GET /api/me': async req => ({ member: await whoami(req) }),

  // everyone in the squad, so PR points can find people who haven't checked in yet
  'GET /api/members': async req => {
    await whoami(req);
    const { rows } = await db.query('select id, login, name, avatar_url from members order by created_at');
    return rows;
  },

  'POST /api/signout': async req => {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    await db.query('delete from sessions where token_hash = $1', [hash(token)]);
    return {};
  },

  // Public: names and GitHub avatars are already public on the site, and this
  // only counts check-ins on the dates the site asks about (its meetups).
  'GET /api/leaderboard': async (_req, _res, url) => {
    const dates = (url.searchParams.get('dates') || '').split(',').filter(d => DATE.test(d)).slice(0, 400);
    const { rows } = await db.query(
      `select m.id, m.login, m.name, m.avatar_url,
              count(c.event_date) filter (where c.event_date = any($1::date[]))::int as meetups
       from members m left join checkins c on c.member_id = m.id
       group by m.id order by m.created_at`, [dates]);
    return rows;
  },

  'GET /api/posts': async () => {
    const { rows } = await db.query(
      `select p.id, p.body, p.link, p.created_at,
              json_build_object('id', m.id, 'login', m.login, 'name', m.name, 'avatar_url', m.avatar_url) as member
       from posts p join members m on m.id = p.member_id
       order by p.created_at desc limit 50`);
    return rows;
  },

  'POST /api/posts': async req => {
    const me = await whoami(req);
    const { body: text, link } = await body(req);
    const clean = String(text || '').trim().slice(0, 280);
    if (!clean) throw new Oops(400, 'Say what you\'re working on.');
    const url = String(link || '').trim();
    if (url && !/^https?:\/\/\S+$/.test(url)) throw new Oops(400, 'Links start with https://');
    // a minute between posts, so nobody floods the page
    const recent = await db.query(
      "select 1 from posts where member_id = $1 and created_at > now() - interval '1 minute'", [me.id]);
    if (recent.rows[0]) throw new Oops(429, 'Give it a minute before posting again.');
    const { rows } = await db.query(
      'insert into posts (member_id, body, link) values ($1, $2, $3) returning id, body, link, created_at',
      [me.id, clean, url || null]);
    return { ...rows[0], member: { id: me.id, login: me.login, name: me.name, avatar_url: me.avatar_url } };
  },

  'POST /api/posts/delete': async req => {
    const me = await whoami(req);
    const { id } = await body(req);
    await db.query('delete from posts where id = $1 and member_id = $2', [Number(id) || 0, me.id]);
    return {};
  },

  'GET /api/board': async (req, _res, url) => {
    await whoami(req);
    const dates = (url.searchParams.get('dates') || '').split(',').filter(d => DATE.test(d)).slice(0, 400);
    const { rows } = await db.query(
      `select to_char(c.event_date, 'YYYY-MM-DD') as event_date,
              json_build_object('id', m.id, 'login', m.login, 'name', m.name, 'avatar_url', m.avatar_url) as members
       from checkins c join members m on m.id = c.member_id
       where c.event_date = any($1::date[])`, [dates]);
    return rows;
  },

  'POST /api/bump': async req => {
    const me = await whoami(req);
    const { lat, lng } = await body(req);
    if (typeof lat !== 'number' || typeof lng !== 'number' || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new Oops(400, 'A location is needed to bump.');
    }
    const client = await db.connect();
    try {
      await client.query('begin');
      // One bump at a time: two phones in the same instant would otherwise each
      // look for the other before either row was committed, and both miss.
      await client.query("select pg_advisory_xact_lock(hashtext('claudesquad.bump'))");
      await client.query("delete from bumps where at < now() - interval '1 hour'");
      await client.query('insert into bumps (member_id, lat, lng) values ($1, $2, $3)', [me.id, lat, lng]);
      const { rows } = await client.query(
        `select distinct b.member_id, m.name, m.avatar_url from bumps b join members m on m.id = b.member_id
         where b.member_id <> $1 and b.at > now() - interval '20 seconds'
           and metres_between($2, $3, b.lat, b.lng) < 250`, [me.id, lat, lng]);
      if (rows.length) {
        await client.query(
          `insert into checkins (member_id, event_date)
           select id, (now() at time zone 'America/New_York')::date from unnest($1::uuid[]) as id
           on conflict do nothing`, [[me.id, ...rows.map(r => r.member_id)]]);
      }
      await client.query('commit');
      // names and faces, for the collision on the phone
      return rows.length
        ? { matched: true, members: rows.map(r => ({ name: r.name, avatar_url: r.avatar_url })).sort((a, b) => a.name.localeCompare(b.name)) }
        : { matched: false };
    } catch (e) {
      await client.query('rollback');
      throw e;
    } finally {
      client.release();
    }
  },

  'GET /api/health': async () => ({ ok: true }),
  // ready only once the database is: what a deploy check or a person should look at
  'GET /api/ready': async () => {
    if (!ready) throw new Oops(503, dbError);
    return { ok: true };
  },
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, API_URL);
  const origin = req.headers.origin;
  if (ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') return res.writeHead(204).end();
  const route = routes[`${req.method} ${url.pathname}`];
  try {
    if (!route) throw new Oops(404, 'not found');
    if (!ready && !/^\/api\/(health|ready)$/.test(url.pathname)) throw new Oops(503, "Check-in isn't open yet.");
    const out = await route(req, res, url);
    if (!res.headersSent) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    }
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: status === 500 ? 'Something broke on the server.' : e.message }));
    }
  }
}).listen(PORT, () => {
  console.log(`check-in server on ${PORT}${github ? ', GitHub sign-in on' : ''}`);
  setUp();
});
