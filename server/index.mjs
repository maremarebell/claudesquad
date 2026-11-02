// The check-in server: who you are, and bumps. Runs on Render next to its
// Postgres. The static site calls it from the browser.
//
//   POST /api/join            { name, github }        -> { token, member }
//   GET  /api/auth/github?app=NONCE                   -> GitHub sign-in (when configured)
//   GET  /api/auth/github/callback                    -> back to /here/#token=...
//   POST /api/auth/code                               -> { code }   (signed in; for another phone)
//   POST /api/auth/claim      { code }                -> { token, member }
//   GET  /api/me                                      -> { member }
//   GET  /api/members                                 -> [member]
//   GET  /api/board?dates=2026-10-15,...              -> [{ event_date, members }]
//   POST /api/bump            { lat, lng }            -> { matched, members: [{ id, name, avatar_url }] }
//   GET  /api/leaderboard?dates=...                   -> [{ ...member, meetups }]   (public)
//   GET  /api/posts                                   -> latest 50 posts            (public)
//   POST /api/posts           { body, link }          -> post
//   POST /api/posts/delete    { id }                  -> {}   (your own only)
//   GET  /api/config                                  -> { github }
//
// A bump is like the old Bump app: members shaking within 20 seconds and 250
// metres of each other are all checked in for today (New York date). Any
// number can bump together; each bump answers with everyone it matched.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import {
  LIVE_SITE, Oops, hash, allowedOrigins, connectionFor, readJSON as body, bearer, stateFromCookie,
  avatarFor, parseDates, cleanJoin, takenMessage, cleanPost, cleanBump, bumpResult, githubAuthorizeUrl, errorReply,
  githubState, appFromState, codeFrom, claimKey, GITHUB, GITHUB_API,
} from './rules.mjs';

const {
  DATABASE_URL, PORT = 10000,
  SITE_URL = LIVE_SITE,
  GITHUB_CLIENT_ID, GITHUB_SECRET,
  // GitHub itself, or server/mock-github.mjs when trying the sign-in locally
  GITHUB_URL = GITHUB, GITHUB_API_URL = GITHUB_API,
} = process.env;
const API_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
const ORIGINS = allowedOrigins(SITE_URL);
const github = Boolean(GITHUB_CLIENT_ID && GITHUB_SECRET);

// Everything lives in its own schema, so the database can be shared with
// another project without any table of ours touching theirs.
const SCHEMA = process.env.DB_SCHEMA || 'claudesquad';
// the direct host, not Neon's pooler; the server only opens a handful
const connection = connectionFor(DATABASE_URL);
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

async function handOff(code, memberId) {
  await db.query("delete from handoffs where at < now() - interval '10 minutes'");
  await db.query('insert into handoffs (code_hash, member_id) values ($1, $2) on conflict do nothing', [hash(code), memberId]);
}

async function signIn(memberId) {
  const token = randomBytes(32).toString('base64url');
  await db.query('insert into sessions (token_hash, member_id) values ($1, $2)', [hash(token), memberId]);
  return token;
}

async function whoami(req) {
  const token = bearer(req.headers.authorization);
  if (!token) throw new Oops(401, 'sign in first');
  const { rows } = await db.query(
    `select m.id, m.login, m.name, m.avatar_url, m.verified from sessions s join members m on m.id = s.member_id
     where s.token_hash = $1`, [hash(token)]);
  if (!rows[0]) throw new Oops(401, 'sign in again');
  return rows[0];
}

const routes = {
  'GET /api/config': async () => ({ github }),

  'POST /api/join': async req => {
    const { name: clean, login } = cleanJoin(await body(req));
    // A username already in the squad signs in as that member, from any phone.
    // Once GitHub has vouched for a login (Sign in with GitHub), only GitHub
    // can sign it in again.
    const known = await db.query('select id, login, name, avatar_url, verified from members where lower(login) = lower($1)', [login]);
    if (known.rows[0]) {
      if (known.rows[0].verified && github) throw new Oops(409, takenMessage());
      return { token: await signIn(known.rows[0].id), member: known.rows[0] };
    }
    const { rows } = await db.query(
      'insert into members (login, name, avatar_url) values ($1, $2, $3) returning id, login, name, avatar_url, verified',
      [login, clean, avatarFor(login)]);
    return { token: await signIn(rows[0].id), member: rows[0] };
  },

  'GET /api/auth/github': async (req, res, url) => {
    if (!github) throw new Oops(404, 'GitHub sign-in is not set up');
    // The home-screen app passes a nonce, then collects the session with it
    // from /api/auth/claim, wherever this sign-in ends up finishing.
    const state = githubState(randomBytes(16).toString('hex'), url.searchParams.get('app'));
    res.writeHead(302, {
      'Set-Cookie': `gh_state=${state}; Path=/api/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      Location: githubAuthorizeUrl({ clientId: GITHUB_CLIENT_ID, state, apiUrl: API_URL, githubUrl: GITHUB_URL }),
    });
    res.end();
  },

  'GET /api/auth/github/callback': async (req, res, url) => {
    const state = stateFromCookie(req.headers.cookie);
    if (!state || state !== url.searchParams.get('state')) throw new Oops(400, 'Sign-in expired, try again.');
    const tokenRes = await fetch(`${GITHUB_URL}/login/oauth/access_token`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, client_secret: GITHUB_SECRET, code: url.searchParams.get('code') }),
    }).then(r => r.json());
    if (!tokenRes.access_token) throw new Oops(400, 'GitHub said no. Try again.');
    const gh = await fetch(`${GITHUB_API_URL}/user`, {
      headers: { Authorization: `Bearer ${tokenRes.access_token}`, 'User-Agent': 'claudesquad' },
    }).then(r => r.json());
    if (!gh.login || !gh.id) throw new Oops(400, 'GitHub said no. Try again.');
    // Someone who signed in before and has since renamed their GitHub account
    // is the same member: their GitHub id finds them, and the login follows.
    const renamed = await db.query(
      'update members set login = $1, avatar_url = $2 where github_id = $3 and lower(login) <> lower($1) returning id',
      [gh.login, gh.avatar_url, gh.id]);
    // GitHub vouches for this login, so it claims the row even if someone typed it first
    const { rows } = renamed.rows[0] ? renamed : await db.query(
      `insert into members (login, name, avatar_url, github_id, verified) values ($1, $2, $3, $4, true)
       on conflict ((lower(login))) do update set github_id = excluded.github_id, avatar_url = excluded.avatar_url, verified = true,
         name = coalesce(members.name, excluded.name)
       returning id`,
      [gh.login, gh.name || gh.login, gh.avatar_url, gh.id]);
    const app = appFromState(state);
    if (app) await handOff(app, rows[0].id);
    const token = await signIn(rows[0].id);
    res.writeHead(302, { Location: `${SITE_URL}/here/#token=${token}` });
    res.end();
  },

  // A code to sign in on another phone, or in the home-screen app.
  'POST /api/auth/code': async req => {
    const me = await whoami(req);
    const code = codeFrom(randomBytes(8));
    await handOff(code.replace('-', ''), me.id);
    return { code };
  },

  // Each code or nonce works once, for ten minutes.
  'POST /api/auth/claim': async req => {
    const { code } = await body(req);
    const key = claimKey(code);
    const { rows } = await db.query(
      `delete from handoffs where code_hash = $1 and at > now() - interval '10 minutes' returning member_id`, [hash(key)]);
    if (!rows[0]) throw new Oops(404, "That code didn't work. Codes last ten minutes; get a new one.");
    const member = await db.query('select id, login, name, avatar_url, verified from members where id = $1', [rows[0].member_id]);
    return { token: await signIn(rows[0].member_id), member: member.rows[0] };
  },

  'GET /api/me': async req => ({ member: await whoami(req) }),

  // everyone in the squad, so PR points can find people who haven't checked in yet
  'GET /api/members': async req => {
    await whoami(req);
    const { rows } = await db.query('select id, login, name, avatar_url from members order by created_at');
    return rows;
  },

  'POST /api/signout': async req => {
    await db.query('delete from sessions where token_hash = $1', [hash(bearer(req.headers.authorization))]);
    return {};
  },

  // Public: names and GitHub avatars are already public on the site, and this
  // only counts check-ins on the dates the site asks about (its meetups).
  'GET /api/leaderboard': async (_req, _res, url) => {
    const dates = parseDates(url.searchParams.get('dates'));
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
    const post = cleanPost(await body(req));
    // a minute between posts, so nobody floods the page
    const recent = await db.query(
      "select 1 from posts where member_id = $1 and created_at > now() - interval '1 minute'", [me.id]);
    if (recent.rows[0]) throw new Oops(429, 'Give it a minute before posting again.');
    const { rows } = await db.query(
      'insert into posts (member_id, body, link) values ($1, $2, $3) returning id, body, link, created_at',
      [me.id, post.body, post.link]);
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
    const dates = parseDates(url.searchParams.get('dates'));
    const { rows } = await db.query(
      `select to_char(c.event_date, 'YYYY-MM-DD') as event_date,
              json_build_object('id', m.id, 'login', m.login, 'name', m.name, 'avatar_url', m.avatar_url) as members
       from checkins c join members m on m.id = c.member_id
       where c.event_date = any($1::date[])`, [dates]);
    return rows;
  },

  'POST /api/bump': async req => {
    const me = await whoami(req);
    const { lat, lng } = cleanBump(await body(req));
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
      return bumpResult(rows);
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
    const { status, body: reply } = errorReply(e);
    if (status === 500) console.error(e);
    if (!res.headersSent) {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(reply));
    }
  }
}).listen(PORT, () => {
  console.log(`check-in server on ${PORT}${github ? ', GitHub sign-in on' : ''}`);
  setUp();
});
