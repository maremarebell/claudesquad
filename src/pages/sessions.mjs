// /sessions/: every past meetup, newest first, each linking to its own page.
// The title shown for each is live-swapped for its Partiful event's own name
// (sessionsList island); events.json's title is only the build-time fallback.
import { html } from '../js/ui.js';
import { Layout, Island } from '../_includes/layout.mjs';
import { SessionsList } from '../js/sessionsList.js';

export const data = { permalink: '/sessions/', title: 'Sessions' };

export default function Sessions({ site, js, url, title, pastEvents }) {
  return html`<${Layout} site=${site} js=${js} url=${url} title=${title}>
    <div className="content">
      <h1>Sessions</h1>
      <${Island} name="sessionsList" component=${SessionsList} props=${{ events: pastEvents }} as="div" className="sessions" />
    </div>
  <//>`;
}
