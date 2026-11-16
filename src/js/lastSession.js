// The homepage's condensed recap of the last meetup: title, time + place
// (from the Partiful invite, same scrape the session page uses), who
// checked in, and photos if any. The full writeup lives on the session page;
// this is just a teaser that links there.
import { useState, useEffect } from 'react';
import { api } from './squad.js';
import { formatDate } from './meetup.js';
import { partifulTime } from './format.js';
import { html, Fragment, Avatar } from './ui.js';

export function LastSession({ date, title, url, place, host }) {
  const [info, setInfo] = useState(null);
  const [members, setMembers] = useState(null);
  const [photos, setPhotos] = useState(null);

  useEffect(() => {
    if (url) api(`/api/partiful?url=${encodeURIComponent(url)}`).then(setInfo).catch(() => setInfo({}));
    api(`/api/sessions?dates=${date}`).then(rows => setMembers(rows[0]?.members || [])).catch(() => setMembers([]));
    api(`/api/photos?dates=${date}`).then(setPhotos).catch(() => setPhotos([]));
  }, [date, url]);

  // Partiful only ever gives an approximate place (never a street address)
  // to anyone who hasn't RSVP'd, which is all this scrape can see either;
  // events.json's own `place`, set by hand on /admin/, wins when it's there.
  const meta = [formatDate(date), partifulTime(info?.start, info?.timezone), place || info?.place].filter(Boolean).join(' · ');

  // events.json's title is only the static fallback for while this is
  // loading, or for a meetup with no Partiful link; the real title is
  // whatever's actually on the invite.
  return html`<${Fragment}>
    <p className="last-session__title">${info?.title || title}</p>
    <p className="last-session__meta">${meta}</p>
    ${members === null ? html`<p className="session__status" role="status">Loading…</p>` :
      members.length ? html`
        <div className="last-session__faces">
          ${members.map(m => html`<${Avatar} key=${m.id} member=${m} className="last-session__face" />`)}
        </div>` : html`<p className="session__status">Nobody checked in to this one.</p>`}
    ${photos && photos.length ? html`
      <div className="last-session__photos">
        ${photos.slice(0, 4).map(p => html`<img key=${p.id} src=${p.url} alt="" className="last-session__photo" loading="lazy" />`)}
      </div>` : ''}
    <p className="session__back"><a href=${`/sessions/${date}/`}>Full recap <span aria-hidden="true">→</span></a></p>
  <//>`;
}
