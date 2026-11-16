// The homepage's photo gallery: every photo uploaded to any past session
// (the same live, Cloudinary-backed photos a session page shows), newest
// first. Replaces the old PR-submitted gallery now that uploading is live.
import { useState, useEffect } from 'react';
import { api } from './squad.js';
import { html, Fragment } from './ui.js';

// Home only teases recent photos; everything else is on the sessions themselves.
const LIMIT = 12;

export function Gallery({ dates, lastDate }) {
  const [photos, setPhotos] = useState(null);

  useEffect(() => {
    if (!dates) return setPhotos([]);
    api(`/api/photos?dates=${dates}`).then(setPhotos).catch(() => setPhotos([]));
  }, [dates]);

  if (photos === null) return html`<p className="gallery__empty" role="status">Loading…</p>`;
  if (!photos.length) return html`<p className="gallery__empty">No photos yet. ${lastDate
    ? html`<a href=${`/sessions/${lastDate}/`}>Add one</a> from the last session's page once you're signed in.`
    : 'Add one from a session page once you\'re signed in.'}</p>`;

  const newest = [...photos].reverse();
  return html`<${Fragment}>
    <div className="gallery__grid">
      ${newest.slice(0, LIMIT).map(p => html`
        <a key=${p.id} href=${`/sessions/${p.event_date}/`} className="gallery__item">
          <img src=${p.url} alt="" className="gallery__image" loading="lazy" />
        </a>`)}
    </div>
    ${newest.length > LIMIT && html`<p className="gallery__more"><a href="/sessions/">See more photos on each session's page <span aria-hidden="true">→</span></a></p>`}
  <//>`;
}
