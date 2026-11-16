// The /sessions/ index: same list the build renders from events.json, with
// each item's title swapped for its Partiful event's own name once that
// loads (the server scrapes it, same as the per-session Partiful card).
import { useState, useEffect } from 'react';
import { api } from './squad.js';
import { html, Fragment } from './ui.js';
import { formatDate } from './meetup.js';

export function SessionsList({ events }) {
  const [titles, setTitles] = useState({});

  useEffect(() => {
    events.filter(e => e.partiful).forEach(e => {
      api(`/api/partiful?url=${encodeURIComponent(e.partiful)}`)
        .then(info => { if (info?.title) setTitles(t => ({ ...t, [e.date]: info.title })); })
        .catch(() => {});
    });
  }, [events]);

  if (!events.length) return html`<p className="sessions__empty">No sessions yet.</p>`;
  return html`<${Fragment}>
    ${events.map(e => html`
      <a key=${e.date} href=${`/sessions/${e.date}/`} className="sessions__item">
        <span className="sessions__title">${titles[e.date] || e.title}</span>
        <span className="sessions__date">${formatDate(e.date)}</span>
      </a>`)}
  <//>`;
}
