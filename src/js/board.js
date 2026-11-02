// The homepage leaderboard: everyone's points, live. Public, no sign-in. The
// build renders the frame; the rows load in the browser.
import { useState, useEffect } from 'react';
import { leaderboard } from './checkin.js';
import { api, mergedPRs, REDUCED } from './squad.js';
import { plural } from './format.js';
import { html, Fragment, Avatar, useCountTo } from './ui.js';

function Row({ rank, member, meetups, prs, points, top, you }) {
  // a new row counts up from 0; a redraw counts from where it was
  const shown = useCountTo(points, 0);
  return html`
    <li className=${`board__row${you ? ' is-you' : ''}`} style=${{ '--i': rank }}>
      <span className="board__rank">${String(rank + 1).padStart(2, '0')}</span>
      <${Avatar} member=${member} className="board__face" />
      <span className="board__who">
        <span className="board__name">${member.name}</span>
        <span className="board__detail">${plural(meetups, 'meetup')} · ${plural(prs, 'PR')}</span>
      </span>
      <b className="board__pts">${shown}</b>
      <i className="board__bar" style=${{ '--w': `${(points / top) * 100}%` }} />
    </li>`;
}

export function Board({ prRepos, events, host }) {
  const [rows, setRows] = useState(null);
  const [status, setStatus] = useState('');
  const [me, setMe] = useState(null);
  const dates = events.map(e => e.date).join(',');

  useEffect(() => {
    // the homepage leaderboard marks your row, from the /here/ session
    try { setMe(JSON.parse(localStorage.getItem('squad-me') || 'null')); } catch {}
    // Draw from check-ins straight away, then again once GitHub's PR counts land.
    const draw = (members, prs) => {
      const next = leaderboard(members, new Map(members.map(m => [m.id, { meetups: m.meetups }])), prs);
      setRows(next);
      setStatus(next.length ? '' : 'No points yet. Check in at a meetup or get a PR merged.');
    };
    const load = async () => {
      const members = await api(`/api/leaderboard?dates=${dates}`);
      draw(members, new Map());
      draw(members, await mergedPRs(prRepos).catch(() => new Map()));
    };
    // Load straight away and keep it fresh while the tab is open; the bars wait
    // to grow until the section is on screen, so you see them do it.
    load().catch(() => setStatus("The leaderboard isn't open yet."));
    const tick = setInterval(() => { if (!document.hidden) load().catch(() => {}); }, 30000);
    if (REDUCED.matches) host.classList.add('board--still');
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      host.classList.add('board--in');
      io.disconnect();
    }, { rootMargin: '0px 0px -15% 0px' });
    io.observe(host);
    return () => { clearInterval(tick); io.disconnect(); };
  }, [dates, prRepos, host]);

  const top = rows?.[0]?.points || 1;
  return html`<${Fragment}>
    <h2>Leaderboard</h2>
    <div>
      <p className="board__how">1 point for every meetup you check in at, 1 for every merged PR.</p>
      <ol className="board__list">
        ${(rows ?? []).map((row, i) => html`<${Row} key=${row.member.id} rank=${i} ...${row} top=${top} you=${row.member.login === me} />`)}
      </ol>
      <p className="board__status" role="status">${status}</p>
      <p className="board__cta"><a href="/here/">Check in</a> · <a href="/projects/">Find something to PR</a></p>
    </div>
  <//>`;
}
