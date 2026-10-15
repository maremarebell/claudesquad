// What every page that talks to the check-in server shares: the session token
// on this phone, calls to the server, merged-PR counts from GitHub, and two
// small display helpers.
import { countPRs } from './checkin.js';

// On a laptop running the site locally, the server runs locally too
// (`node server/index.mjs`, port 10124); everywhere else it's site.apiUrl.
export const API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
  ? 'http://localhost:10124'
  : document.querySelector('meta[name="squad-api"]').content;
const TOKEN = 'squad-token';

export const token = {
  get: () => { try { return localStorage.getItem(TOKEN); } catch { return null; } },
  set: t => { try { t ? localStorage.setItem(TOKEN, t) : localStorage.removeItem(TOKEN); } catch {} },
};

export class SignedOut extends Error {}

export async function api(path, body) {
  const t = token.get();
  let res;
  try {
    res = await fetch(API + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(t && { Authorization: `Bearer ${t}` }) },
      body: body && JSON.stringify(body),
    });
  } catch {
    throw new Error("Can't reach the check-in server. Check your signal and try again.");
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

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');

// Numbers tick up to their new value instead of jumping.
export function countTo(el, to) {
  const from = Number(el.textContent) || 0;
  if (REDUCED.matches || from === to || document.hidden) return void (el.textContent = to);
  // frames stop in a background tab: make sure the real number lands anyway
  setTimeout(() => { el.textContent = to; }, 700);
  const start = performance.now();
  const step = now => {
    const k = Math.min(1, (now - start) / 600);
    el.textContent = Math.round(from + (to - from) * (1 - (1 - k) ** 3));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

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
