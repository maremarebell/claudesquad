// The server's rules with no database or network in them, so Node can test
// them (test/server-rules.test.mjs). index.mjs wires them to the routes.
import { createHash } from 'node:crypto';

export const LIVE_SITE = 'https://claudesquad.onrender.com';
export const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
export const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class Oops extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const hash = token => createHash('sha256').update(token).digest('hex');

// SITE_URL may carry a path or trailing slash; the live site is always allowed.
export const allowedOrigins = siteUrl =>
  new Set([new URL(siteUrl).origin, LIVE_SITE, 'http://localhost:8080', 'http://127.0.0.1:8080']);

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

// The OAuth state set as a cookie before the GitHub round trip.
export const stateFromCookie = cookie => (cookie || '').match(/gh_state=([a-f0-9]+)/)?.[1];

export const avatarFor = login => `https://github.com/${login}.png?size=96`;

// ?dates=2026-10-15,... : well-formed dates only, at most 400 of them.
export const parseDates = param => (param || '').split(',').filter(d => DATE.test(d)).slice(0, 400);

export function cleanJoin({ name, github: login }) {
  const clean = String(name || '').trim().slice(0, 40);
  if (!clean) throw new Oops(400, 'Add your name.');
  if (!LOGIN.test(login || '')) throw new Oops(400, "That doesn't look like a GitHub username.");
  return { name: clean, login };
}

// A login someone already holds can only be reclaimed through GitHub sign-in.
export const takenMessage = github => github
  ? 'That GitHub username is already in the squad. Use Sign in with GitHub to get back in.'
  : 'That GitHub username is already in the squad on another phone. Use that phone, or ask a captain.';

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
  ? { matched: true, members: rows.map(r => ({ name: r.name, avatar_url: r.avatar_url })).sort((a, b) => a.name.localeCompare(b.name)) }
  : { matched: false };

export const githubAuthorizeUrl = ({ clientId, state, apiUrl }) =>
  `https://github.com/login/oauth/authorize?client_id=${clientId}&state=${state}&scope=read:user&redirect_uri=${encodeURIComponent(`${apiUrl}/api/auth/github/callback`)}`;

// What a thrown error becomes on the wire: its own status and message, or a
// plain 500 that doesn't leak internals.
export const errorReply = e => {
  const status = e.status || 500;
  return { status, body: { error: status === 500 ? 'Something broke on the server.' : e.message } };
};
