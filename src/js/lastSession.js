// The homepage's condensed recap of the last meetup: title, time + place
// (straight from events.json now - see partiful.js), who checked in, and
// photos if any. The full writeup lives on the session page; this is just a
// teaser that links there.
import { useState, useEffect } from 'react';
import { api } from './squad.js';
import { formatDate } from './meetup.js';
import { thumb } from './format.js';
import { html, Fragment, Avatar } from './ui.js';

export function LastSession({ date, title, time, place, host }) {
  const [members, setMembers] = useState(null);
  const [photos, setPhotos] = useState(null);

  useEffect(() => {
    api(`/api/sessions?dates=${date}`).then(rows => setMembers(rows[0]?.members || [])).catch(() => setMembers([]));
    api(`/api/photos?dates=${date}`).then(setPhotos).catch(() => setPhotos([]));
  }, [date]);

  const meta = [formatDate(date), time, place].filter(Boolean).join(' · ');

  return html`<${Fragment}>
    <p className="last-session__title">${title}</p>
    <p className="last-session__meta">${meta}</p>
    ${members === null ? html`<p className="session__status" role="status">Loading…</p>` :
      members.length ? html`
        <div className="last-session__faces">
          ${members.map(m => html`<${Avatar} key=${m.id} member=${m} className="last-session__face" />`)}
        </div>` : html`<p className="session__status">Nobody checked in to this one.</p>`}
    ${photos && photos.length ? html`
      <div className="last-session__photos">
        ${photos.slice(0, 4).map(p => html`<img key=${p.id} src=${thumb(p.url, 160)} alt="" className="last-session__photo" loading="lazy" />`)}
      </div>` : ''}
    <p className="session__back"><a href=${`/sessions/${date}/`}>Recap <span aria-hidden="true">→</span></a></p>
  <//>`;
}
