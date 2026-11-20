// Photos from a session: everyone sees them; a signed-in member adds one or
// more at once (POST /api/photos per file, which the server uploads to
// Cloudinary) - the native picker's own multi-select works on mobile too.
import { useState, useEffect, useRef } from 'react';
import { api, token, SignedOut } from './squad.js';
import { thumb } from './format.js';
import { html, Fragment, useReveal } from './ui.js';

const MAX_BYTES = 6_000_000;

function toDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function Photos({ date, host }) {
  const [photos, setPhotos] = useState(null);
  const [me, setMe] = useState(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    api(`/api/photos?dates=${date}`).then(setPhotos).catch(() => setPhotos([]));
    if (token.get()) api('/api/me').then(r => setMe(r.member)).catch(() => {});
  }, [date]);
  useReveal(host, 'session__photos--in');

  async function upload(e) {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    const skipped = [];
    for (const [i, file] of files.entries()) {
      if (!file.type.startsWith('image/')) { skipped.push(`${file.name} isn't an image`); continue; }
      if (file.size > MAX_BYTES) { skipped.push(`${file.name} is too big (6MB max)`); continue; }
      setStatus(files.length > 1 ? `Uploading ${i + 1} of ${files.length}…` : 'Uploading…');
      try {
        const image = await toDataURL(file);
        const photo = await api('/api/photos', { event_date: date, image });
        setPhotos(list => [...list, photo]);
      } catch (err) {
        if (err instanceof SignedOut) { setStatus('Log in again to upload.'); setBusy(false); return; }
        skipped.push(`${file.name}: ${err.message}`);
      }
    }
    setStatus(skipped.length ? `Skipped: ${skipped.join('; ')}` : '');
    setBusy(false);
  }

  return html`<${Fragment}>
    <p className="session__eyebrow">[ Snapshots ]</p>
    <h2>Photos</h2>
    ${me ? html`
      <p className="session__upload">
        <button className="here__btn" type="button" disabled=${busy} onClick=${() => inputRef.current.click()}>Add photos</button>
        <input ref=${inputRef} type="file" accept="image/*" multiple hidden onChange=${upload} />
      </p>` : html`
      <p className="session__upload"><a className="here__btn" href="/here/">Log in to add photos</a></p>`}
    <p className="session__status" role="status">${status}</p>
    ${photos && photos.length ? html`
      <div className="gallery__grid session__photo-grid">
        ${photos.map((p, i) => html`
          <figure key=${p.id} className="gallery__item" style=${{ '--i': i }}>
            <img src=${thumb(p.url, 240)} alt="" className="gallery__image" loading="lazy" />
          </figure>`)}
      </div>` : photos && !photos.length && html`<p className="session__status">No photos yet. Be the first to add one.</p>`}
  <//>`;
}
