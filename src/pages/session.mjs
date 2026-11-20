// /sessions/{date}/: one page per past meetup (paginated over pastEvents).
// The build renders everything from events.json, including the Partiful
// card now (title/time/place/description/image, set once via /admin/'s
// "Pull from Partiful" since none of that changes after the invite exists).
// Who showed up and the photos are still fetched live from the check-in
// server, same as the homepage leaderboard.
import { html } from '../js/ui.js';
import { Layout, Island } from '../_includes/layout.mjs';
import { formatDate } from '../js/meetup.js';
import { Partiful } from '../js/partiful.js';
import { Attendees } from '../js/attendees.js';
import { Photos } from '../js/photos.js';

export const data = {
  pagination: { data: 'pastEvents', size: 1, alias: 'session' },
  // the "raw" compile option (see .eleventy.js) only skips re-templating a
  // literal permalink string; it would return a permalink *function*
  // uncalled, so the per-page path is computed ahead of that instead.
  eleventyComputed: { permalink: data => `/sessions/${data.session.date}/` },
  eleventyExcludeFromCollections: true,
};

export default function SessionPage({ site, js, url, session }) {
  const [y, m, d] = session.date.split('-').map(Number);
  const stamp = new Date(Date.UTC(y, m - 1, d));
  const month = stamp.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
  const year = stamp.toLocaleDateString('en-US', { year: '2-digit', timeZone: 'UTC' });

  return html`<${Layout} site=${site} js=${js} url=${url} title=${session.title}>
    <div className="content session">
      <header className="session__header ticks">
        <p className="session__eyebrow">[ Session Log ]</p>
        <div className="session__stamp" aria-hidden="true">
          ${session.emoji && html`<span className="session__emoji">${session.emoji}</span>`}
          <span className="session__stamp-day">${String(d).padStart(2, '0')}</span>
          <span className="session__stamp-month">${month}<br/>’${year}</span>
        </div>
        <h1 className="page-title">${session.title}</h1>
        <p className="session__date">${formatDate(session.date)}</p>
      </header>

      <section className="session__partiful">
        <${Partiful} url=${session.partiful} title=${session.title} time=${session.time} place=${session.place} description=${session.description} image=${session.image} />
      </section>
      <${Island} name="attendees" component=${Attendees} props=${{ date: session.date }} as="section" className="session__attendees" />
      <${Island} name="photos" component=${Photos} props=${{ date: session.date }} as="section" className="session__photos" />

      <p className="session__back"><a href="/sessions/">← All sessions</a></p>
    </div>
  <//>`;
}
