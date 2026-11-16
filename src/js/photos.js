// Photos from a session: everyone sees them; a signed-in member adds one
// (POST /api/photos, which the server uploads to Cloudinary).
import { useState, useEffect, useRef } from 'react';
import { api, token, SignedOut } from './squad.js';
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
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return setStatus('Pick an image file.');
    if (file.size > MAX_BYTES) return setStatus('That image is too big (6MB max).');
    setBusy(true);
    setStatus('Uploading…');
    try {
      const image = await toDataURL(file);
      const photo = await api('/api/photos', { event_date: date, image });
      setPhotos(list => [...list, photo]);
      setStatus('');
    } catch (err) {
      setStatus(err instanceof SignedOut ? 'Log in again to upload.' : err.message);
    } finally {
      setBusy(false);
    }
  }

  return html`<${Fragment}>
    <p className="session__eyebrow">[ Snapshots ]</p>
    <h2>Photos</h2>
    ${me ? html`
      <p className="session__upload">
        <button className="here__btn" type="button" disabled=${busy} onClick=${() => inputRef.current.click()}>Add a photo</button>
        <input ref=${inputRef} type="file" accept="image/*" hidden onChange=${upload} />
      </p>` : html`
      <p className="session__upload"><a className="here__btn" href="/here/">Log in to add photos</a></p>`}
    <p className="session__status" role="status">${status}</p>
    ${photos && photos.length ? html`
      <div className="gallery__grid session__photo-grid">
        ${photos.map((p, i) => html`
          <figure key=${p.id} className="gallery__item" style=${{ '--i': i }}>
            <img src=${p.url} alt="" className="gallery__image" loading="lazy" />
          </figure>`)}
      </div>` : photos && !photos.length && html`<p className="session__status">No photos yet. Be the first to add one.</p>`}
  <//>`;
}
