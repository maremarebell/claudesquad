// The homepage leaderboard: everyone's points, live. Public, no sign-in.
import { leaderboard } from './checkin.js';
import { api, mergedPRs, plural, countTo, avatar, el, REDUCED } from './squad.js';

const root = document.getElementById('board');
const cfg = JSON.parse(document.getElementById('board-config').textContent);
const list = root.querySelector('.board__list');
const status = root.querySelector('.board__status');
const dates = cfg.events.map(e => e.date).join(',');
// last points drawn per member, so a redraw counts from there, not from 0
const shown = new Map();
const me = (() => { try { return JSON.parse(localStorage.getItem('squad-me') || 'null'); } catch { return null; } })();

// Draw from check-ins straight away, then again once GitHub's PR counts land.
async function load() {
  const members = await api(`/api/leaderboard?dates=${dates}`);
  draw(members, new Map());
  draw(members, await mergedPRs(cfg.prRepos).catch(() => new Map()));
}

function draw(members, prs) {
  const rows = leaderboard(members, new Map(members.map(m => [m.id, { meetups: m.meetups }])), prs);
  status.textContent = rows.length ? '' : 'No points yet. Check in at a meetup or get a PR merged.';
  const top = rows[0]?.points || 1;
  list.replaceChildren(...rows.map(({ member, meetups, prs: p, points }, i) => {
    const pts = el('b', { className: 'board__pts', textContent: '0' });
    const li = el('li', { className: `board__row${member.login === me ? ' is-you' : ''}` },
      el('span', { className: 'board__rank', textContent: String(i + 1).padStart(2, '0') }),
      avatar(member, 'board__face'),
      el('span', { className: 'board__who' },
        el('span', { className: 'board__name', textContent: member.name }),
        el('span', { className: 'board__detail', textContent: `${plural(meetups, 'meetup')} · ${plural(p, 'PR')}` })),
      pts,
      el('i', { className: 'board__bar', style: `--w:${(points / top) * 100}%` }));
    li.style.setProperty('--i', i);
    pts.textContent = shown.get(member.id) || 0;
    countTo(pts, points);
    shown.set(member.id, points);
    return li;
  }));
}

// Load straight away and keep it fresh while the tab is open; the bars wait
// to grow until the section is on screen, so you see them do it.
load().catch(() => { status.textContent = "The leaderboard isn't open yet."; });
setInterval(() => { if (!document.hidden) load().catch(() => {}); }, 30000);
new IntersectionObserver(([entry], io) => {
  if (!entry.isIntersecting) return;
  root.classList.add('board--in');
  io.disconnect();
}, { rootMargin: '0px 0px -15% 0px' }).observe(root);

if (REDUCED.matches) root.classList.add('board--still');
