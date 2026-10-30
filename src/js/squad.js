// What every page that talks to the check-in server shares: the session token
// on this phone, calls to the server, merged-PR counts from GitHub, and the
// DOM helpers the collision (collide.js) draws with.
import { countPRs } from './checkin.js';

// On a laptop running the site locally, the server runs locally too
// (`node server/index.mjs`, port 10124); everywhere else it's site.apiUrl.
// Empty in the build, which renders the pages and never calls the server.
export const API = typeof location === 'undefined' ? ''
  : /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://localhost:10124'
  : document.querySelector('meta[name="squad-api"]').content;
const TOKEN = 'squad-token';

export const token = {
  get: () => { try { return localStorage.getItem(TOKEN); } catch { return null; } },
  set: t => { try { t ? localStorage.setItem(TOKEN, t) : localStorage.removeItem(TOKEN); } catch {} },
};

export class SignedOut extends Error {}

// The free server sleeps when idle and takes up to a minute to wake, during
// which requests fail or come back 502/503. Reads keep trying for 90 seconds;
// writes (join, bump) don't, so nothing is sent twice.
const WAKE_MS = 90000;

export async function api(path, body) {
  const t = token.get();
  const retry = !body;
  const until = Date.now() + WAKE_MS;
  let res;
  for (;;) {
    try {
      res = await fetch(API + path, {
        method: body ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json', ...(t && { Authorization: `Bearer ${t}` }) },
        body: body && JSON.stringify(body),
      });
      if (!retry || ![502, 503, 504].includes(res.status) || Date.now() > until) break;
    } catch {
      if (!retry || Date.now() > until) throw new Error("Can't reach the check-in server. Check your signal and try again.");
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  const out = await res.json().catch(() => ({}));
  if (res.status === 401) {
    token.set(null);
    throw new SignedOut(out.error || 'Sign in again.');
  }
  if (!res.ok) throw new Error(out.error || `Check-in server error ${res.status}`);
  return out;
}

// Merged PRs to the squad's repos, straight from GitHub's public search, so
// nobody can type their way to PR points. Cached ten minutes per tab; if
// GitHub is unreachable or rate-limited, PRs just don't count until it's back.
export async function mergedPRs(repos) {
  const key = 'squad-prs';
  try {
    const hit = JSON.parse(sessionStorage.getItem(key));
    if (hit && Date.now() - hit.at < 600000) return new Map(hit.counts);
  } catch {}
  const q = ['is:pr', 'is:merged', ...repos.map(r => `repo:${r}`)].join(' ');
  const items = [];
  for (let page = 1; page <= 5; page++) {
    const res = await fetch(`https://api.github.com/search/issues?q=${encodeURIComponent(q)}&per_page=100&page=${page}`);
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const body = await res.json();
    items.push(...body.items);
    if (items.length >= body.total_count || !body.items.length) break;
  }
  const counts = countPRs(items);
  try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), counts: [...counts] })); } catch {}
  return counts;
}

// Reduced motion is the off switch for every animation; still in the build.
export const REDUCED = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

export function avatar(member, className = 'here__face') {
  const img = document.createElement('img');
  img.src = member.avatar_url;
  img.alt = member.name;
  img.title = member.name;
  img.className = className;
  img.loading = 'lazy';
  // no GitHub picture (or a typo'd username): the pig stands in
  img.onerror = () => { img.onerror = null; img.src = '/images/pig.svg'; img.classList.add('is-pig'); };
  return img;
}

export const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};
