// /admin/: everything events.json carries about a meetup. The title, time,
// place and description are all one-time pulls from Partiful - "Pull from
// Partiful" fills them in with whatever's on the invite right now, as a
// starting point to edit (place is always approximate there, never a street
// address, until someone RSVPs). None of this actually changes once the
// invite exists, so unlike the old build the site no longer re-fetches
// Partiful on every visit; a field here is the real, final value. Save
// copies the updated events.json and opens it in GitHub's editor; GitHub
// decides who can commit it either way (a non-collaborator's "Commit" there
// opens a PR, not a push to main) — this page only ever offers the form to
// the repo owner's own signed-in GitHub session, so a stranger who finds the
// URL sees a sign-in prompt, not the day's meetup data.
import { useState, useEffect } from 'react';
import { api, token } from './squad.js';
import { partifulTime } from './format.js';
import { html, Fragment } from './ui.js';

const PLACES = ['Vital', 'McCarren Park Calisthenics Equipment'];

export function Admin({ events, repo, branch }) {
  const owner = new URL(repo).pathname.split('/')[1];
  const [me, setMe] = useState(null);
  const [status, setStatus] = useState('');
  const [json, setJson] = useState(null);
  const [pulling, setPulling] = useState(null);
  const [custom, setCustom] = useState(() => new Set(events.filter(e => e.place && !PLACES.includes(e.place)).map(e => e.date)));
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));

  useEffect(() => {
    if (token.get()) api('/api/me').then(r => setMe(r.member)).catch(() => {});
  }, []);

  function toggleCustom(date, isOther) {
    setCustom(prev => {
      const next = new Set(prev);
      if (isOther) next.add(date); else next.delete(date);
      return next;
    });
  }

  async function pull(date) {
    const form = document.getElementById('admin');
    const url = form.elements[`${date}-partiful`].value.trim();
    if (!/^https:\/\/(www\.)?partiful\.com\//.test(url)) return setStatus('That row needs a partiful.com link first.');
    setPulling(date);
    setStatus('');
    try {
      const info = await api(`/api/partiful?url=${encodeURIComponent(url)}`);
      if (info.title) form.elements[`${date}-title`].value = info.title;
      form.elements[`${date}-time`].value = partifulTime(info.start, info.timezone) || '';
      form.elements[`${date}-description`].value = info.description || '';
      form.elements[`${date}-image`].value = info.image || '';
      if (info.place && PLACES.includes(info.place)) {
        form.elements[`${date}-place`].value = info.place;
        toggleCustom(date, false);
      } else if (info.place) {
        form.elements[`${date}-place`].value = 'other';
        form.elements[`${date}-place-custom`].value = info.place;
        toggleCustom(date, true);
      }
      setStatus('Pulled. Check it over, then Save.');
    } catch {
      setStatus("Couldn't reach Partiful for that one.");
    } finally {
      setPulling(null);
    }
  }

  function save(e) {
    e.preventDefault();
    const form = e.target;
    const bad = [];
    const next = events.map(ev => {
      const v = form.elements[`${ev.date}-partiful`].value.trim();
      if (v && !/^https:\/\/(www\.)?partiful\.com\//.test(v)) bad.push(ev.date);
      const selected = form.elements[`${ev.date}-place`].value;
      const place = selected === 'other' ? form.elements[`${ev.date}-place-custom`].value.trim() : selected;
      const title = form.elements[`${ev.date}-title`].value.trim();
      const time = form.elements[`${ev.date}-time`].value.trim();
      const description = form.elements[`${ev.date}-description`].value.trim();
      const image = form.elements[`${ev.date}-image`].value.trim();
      return {
        ...ev, partiful: v || null, place: place || null,
        title: title || ev.title, time: time || null, description: description || null, image: image || null,
      };
    });
    if (bad.length) return setStatus(`Those need to be partiful.com links: ${bad.join(', ')}`);
    const text = `${JSON.stringify(next, null, 2)}\n`;
    const open = () => window.open(`${repo}/edit/${branch}/src/_data/events.json`, '_blank', 'noopener');
    navigator.clipboard.writeText(text).then(() => {
      setStatus('Copied. On GitHub: select all, paste, Commit changes.');
      open();
    }, () => {
      setStatus("Couldn't copy here, so here it is to copy by hand:");
      setJson(text);
      open();
    });
  }

  if (!(me?.verified && me.login.toLowerCase() === owner.toLowerCase())) {
    return html`<${Fragment}>
      <p>This only works signed in as <code>${owner}</code> through Sign in with GitHub.</p>
      <p><a className="here__btn" href="/here/">Sign in</a></p>
    <//>`;
  }

  return html`<${Fragment}>
    <p>Paste a Partiful link next to each meetup, then "Pull from Partiful" to fill in the title, time, place and description as a starting point - edit any of it before Save, since place especially is only ever approximate there (a neighbourhood, never a street address) until someone RSVPs. None of this changes once the invite exists, so it's a one-time pull, not something the site keeps re-checking. Save copies the updated meetups file and opens it on GitHub, where you select everything there, paste, and commit.</p>
    <form className="admin__form" id="admin" onSubmit=${save}>
      ${sorted.map(e => html`
        <div key=${e.date} className="admin__row">
          <span className="admin__when">${e.date}</span>
          <input type="url" inputMode="url" name=${`${e.date}-partiful`} aria-label=${`Partiful link for ${e.date}`} defaultValue=${e.partiful || ''} placeholder="https://partiful.com/e/..." />
          <button className="here__btn admin__pull" type="button" disabled=${pulling === e.date} onClick=${() => pull(e.date)}>Pull from Partiful</button>
          <input type="text" name=${`${e.date}-title`} aria-label=${`Title for ${e.date}`} defaultValue=${e.title || ''} placeholder="Title" />
          <input type="text" name=${`${e.date}-time`} aria-label=${`Time for ${e.date}`} defaultValue=${e.time || ''} placeholder="Time, e.g. 7:00 PM" />
          <span className="admin__place">
            <select name=${`${e.date}-place`} aria-label=${`Place for ${e.date}`} defaultValue=${custom.has(e.date) ? 'other' : (e.place || '')} onChange=${ev => toggleCustom(e.date, ev.target.value === 'other')}>
              <option value="">No place set</option>
              ${PLACES.map(p => html`<option key=${p} value=${p}>${p}</option>`)}
              <option value="other">Add something else…</option>
            </select>
            <input type="text" name=${`${e.date}-place-custom`} aria-label=${`Custom place for ${e.date}`} hidden=${!custom.has(e.date)} defaultValue=${custom.has(e.date) ? e.place || '' : ''} placeholder="Type the place" />
          </span>
          <textarea name=${`${e.date}-description`} aria-label=${`Description for ${e.date}`} defaultValue=${e.description || ''} placeholder="Description"></textarea>
          <input type="url" inputMode="url" name=${`${e.date}-image`} aria-label=${`Cover image for ${e.date}`} defaultValue=${e.image || ''} placeholder="Cover image URL" />
        </div>`)}
      <button className="here__btn" type="submit">Save</button>
      <p className="admin__status" role="status">${status}</p>
      ${json && html`<pre className="admin__json">${json}</pre>`}
    </form>
  <//>`;
}
