// The Partiful card on a session page: title, time, place, description and
// cover image, all read straight from events.json. These used to be fetched
// live from Partiful on every visit; now /admin/'s "Pull from Partiful" is a
// one-time pull into fields a person edits and saves, since none of this
// actually changes once the invite exists. Purely presentational: no
// network, no state, so it never needs to be an island.
import { html, Fragment } from './ui.js';

export function Partiful({ url, title, time, place, description, image }) {
  if (!url) return html`<p className="session__status">No Partiful link for this one.</p>`;
  const meta = [time, place].filter(Boolean).join(' · ');
  return html`<${Fragment}>
    <div className="session__ticket">
      ${image && html`<img src=${image} alt="" className="session__partiful-image" />`}
      <div className=${`session__ticket-body${image ? ' session__ticket-body--cut' : ''}`}>
        <h2 className="session__partiful-title">${title || 'Partiful'}</h2>
        ${meta && html`<p className="session__partiful-meta">${meta}</p>`}
        ${description && html`<p className="session__partiful-description">${description}</p>`}
        <a className="here__btn" href=${url} target="_blank" rel="noopener">View on Partiful</a>
      </div>
    </div>
  <//>`;
}
