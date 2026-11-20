// /sessions/: every past meetup, newest first, each linking to its own
// page. events.json's own title is the real one now (see partiful.js), so
// this is plain static markup - no island, no network.
import { html, Fragment } from '../js/ui.js';
import { Layout } from '../_includes/layout.mjs';
import { formatDate } from '../js/meetup.js';

export const data = { permalink: '/sessions/', title: 'Sessions' };

export default function Sessions({ site, js, url, title, pastEvents }) {
  return html`<${Layout} site=${site} js=${js} url=${url} title=${title}>
    <div className="content">
      <h1>Sessions</h1>
      <div className="sessions">
        ${pastEvents.length ? html`<${Fragment}>
          ${pastEvents.map(e => html`
            <a key=${e.date} href=${`/sessions/${e.date}/`} className="sessions__item">
              <span className="sessions__title">${e.title}</span>
              <span className="sessions__date">${formatDate(e.date)}</span>
            </a>`)}
        <//>` : html`<p className="sessions__empty">No sessions yet.</p>`}
      </div>
    </div>
  <//>`;
}
