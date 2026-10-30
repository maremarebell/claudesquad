// The server's rules with no database or network in them, so Node can test
// them (test/server-rules.test.mjs). index.mjs wires them to the routes.
import { createHash } from 'node:crypto';

export const LIVE_SITE = 'https://claudesquad.org';
export const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
export const DATE = /^\d{4}-\d{2}-\d{2}$/;
// what the home-screen app sends to collect a GitHub sign-in
export const NONCE = /^[A-Za-z0-9_-]{20,64}$/;
// no 0/O or 1/I/L, so a code read off one phone types cleanly into another
export const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export class Oops extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const hash = token => createHash('sha256').update(token).digest('hex');

// SITE_URL may carry a path or trailing slash; the live site is always
// allowed, at its own domain and at Render's.
export const allowedOrigins = siteUrl => new Set([
  new URL(siteUrl).origin, LIVE_SITE, 'https://www.claudesquad.org', 'https://claudesquad.onrender.com',
  'http://localhost:8080', 'http://127.0.0.1:8080',
]);

// Neon's pooled host ("-pooler") rejects the search_path startup option, so
// connect to the direct host instead. Local and single-word hosts (Docker)
// skip SSL.
export function connectionFor(databaseUrl) {
  const local = /localhost|127\.0\.0\.1/.test(databaseUrl || '') || !/\./.test(new URL(databaseUrl || 'postgres://x').hostname);
  return {
    connectionString: databaseUrl?.replace('-pooler.', '.'),
    ssl: local ? false : { rejectUnauthorized: false },
  };
}

export async function readJSON(req, limit = 10_000) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > limit) throw new Oops(413, 'too much');
  }
  try { return JSON.parse(raw || '{}'); } catch { throw new Oops(400, 'bad JSON'); }
}

export const bearer = header => (header || '').replace(/^Bearer /, '');

// The OAuth state set as a cookie before the GitHub round trip: random hex,
// plus `.nonce` when the home-screen app is waiting to claim the session.
export const githubState = (hex, app) => hex + (NONCE.test(app || '') ? `.${app}` : '');
export const appFromState = state => state.split('.')[1];
export const stateFromCookie = cookie => (cookie || '').match(/gh_state=([a-f0-9]+(?:\.[A-Za-z0-9_-]+)?)/)?.[1];

// A sign-in code from random bytes, shown as XXXX-XXXX.
export function codeFrom(bytes) {
  const code = [...bytes].map(b => CODE_CHARS[b % CODE_CHARS.length]).join('');
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

// What /api/auth/claim looks up: an app nonce as sent, or a typed code with
// case, dashes and spaces dropped.
export const cleanCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const claimKey = code => {
  const raw = String(code || '');
  return NONCE.test(raw) ? raw : cleanCode(raw);
};

export const avatarFor = login => `https://github.com/${login}.png?size=96`;

// ?dates=2026-10-15,... : well-formed dates only, at most 400 of them.
export const parseDates = param => (param || '').split(',').filter(d => DATE.test(d)).slice(0, 400);

export function cleanJoin({ name, github: login }) {
  const clean = String(name || '').trim().slice(0, 40);
  if (!clean) throw new Oops(400, 'Add your name.');
  if (!LOGIN.test(login || '')) throw new Oops(400, "That doesn't look like a GitHub username.");
  return { name: clean, login };
}

// A login GitHub has vouched for is only signed in through GitHub again.
export const takenMessage = () => 'That GitHub username signed in with GitHub. Use Sign in with GitHub.';

export function cleanPost({ body, link }) {
  const text = String(body || '').trim().slice(0, 280);
  if (!text) throw new Oops(400, 'Say what you\'re working on.');
  const url = String(link || '').trim();
  if (url && !/^https?:\/\/\S+$/.test(url)) throw new Oops(400, 'Links start with https://');
  return { body: text, link: url || null };
}

export function cleanBump({ lat, lng }) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new Oops(400, 'A location is needed to bump.');
  }
  return { lat, lng };
}

// names and faces of whoever matched, for the collision on the phone
export const bumpResult = rows => rows.length
  ? { matched: true, members: rows.map(r => ({ id: r.member_id, name: r.name, avatar_url: r.avatar_url })).sort((a, b) => a.name.localeCompare(b.name)) }
  : { matched: false };

export const githubAuthorizeUrl = ({ clientId, state, apiUrl }) =>
  `https://github.com/login/oauth/authorize?client_id=${clientId}&state=${state}&scope=read:user&redirect_uri=${encodeURIComponent(`${apiUrl}/api/auth/github/callback`)}`;

// What a thrown error becomes on the wire: its own status and message, or a
// plain 500 that doesn't leak internals.
export const errorReply = e => {
  const status = e.status || 500;
  return { status, body: { error: status === 500 ? 'Something broke on the server.' : e.message } };
};
