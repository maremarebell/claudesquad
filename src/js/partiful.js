// The Partiful card on a session page: its title, description and cover
// image. The browser can't read partiful.com's HTML itself (no CORS), so the
// check-in server fetches it and hands back just the link-preview tags.
import { useState, useEffect } from 'react';
import { api } from './squad.js';
import { partifulTime } from './format.js';
import { html, Fragment } from './ui.js';

export function Partiful({ url, place }) {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    if (!url) return;
    api(`/api/partiful?url=${encodeURIComponent(url)}`).then(setInfo).catch(() => setInfo({}));
  }, [url]);

  if (!url) return html`<p className="session__status">No Partiful link for this one.</p>`;
  // Partiful's own page only ever gives an approximate place (never a street
  // address) to anyone who hasn't RSVP'd, which is all the server's scrape
  // can see either; events.json's own `place`, set by hand on /admin/, is
  // the real venue name and always wins when it's there.
  const meta = [partifulTime(info?.start, info?.timezone), place || info?.place].filter(Boolean).join(' · ');
  return html`<${Fragment}>
    <div className="session__ticket">
      ${info?.image && html`<img src=${info.image} alt="" className="session__partiful-image" />`}
      <div className=${`session__ticket-body${info?.image ? ' session__ticket-body--cut' : ''}`}>
        <h2 className="session__partiful-title">${info?.title || 'Partiful'}</h2>
        ${meta && html`<p className="session__partiful-meta">${meta}</p>`}
        ${info?.description && html`<p className="session__partiful-description">${info.description}</p>`}
        <a className="here__btn" href=${url} target="_blank" rel="noopener">View on Partiful</a>
      </div>
    </div>
  <//>`;
}
