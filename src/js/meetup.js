// The next meetup, for the homepage hero: picked at build time from the build
// machine's date, then again in the browser by New York's date (the site only
// rebuilds on a push, so the build can be days old), with the countdown.
import { useEffect } from 'react';
import { html, Fragment, useToday } from './ui.js';

export function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

// The soonest event on or after today (YYYY-MM-DD), or null.
export function pickNext(events, today) {
  const [next] = events.filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  return next ? { ...next, dateLabel: formatDate(next.date) } : null;
}

export function Meetup({ events, today: built, host }) {
  const [today, live] = useToday(built);
  const next = pickNext(events, today);
  // the panel hides when nothing is coming up
  useEffect(() => { if (host) host.hidden = !next; }, [host, next]);
  if (!next) return null;
  const days = Math.round((Date.parse(next.date) - Date.parse(today)) / 864e5);
  const tminus = !live ? '' : days === 0 ? 'TODAY' : `T-${days} ${days === 1 ? 'DAY' : 'DAYS'}`;
  return html`<${Fragment}>
    <span className="hero__label">[ Next Meetup ] <b id="tminus" data-date=${next.date}>${tminus}</b></span>
    <span className="hero__event" id="next-title">${next.title}</span>
    <span className="hero__date" id="next-date">${next.dateLabel}</span>
    <a href=${next.partiful || '/calendar/'} className="hero__cta" id="next-link" target=${next.partiful ? '_blank' : undefined} rel=${next.partiful ? 'noopener' : undefined}><span id="next-link-text">${next.partiful ? 'RSVP on Partiful' : 'Calendar'}</span> <span aria-hidden="true">→</span></a>
    <a href="/here/" className="hero__cta">Log in / Check in <span aria-hidden="true">→</span></a>
  <//>`;
}
