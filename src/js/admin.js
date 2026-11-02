// /admin/: a Partiful link per meetup. Save copies the updated events.json and
// opens it in GitHub's editor; GitHub decides who can commit it.
import { useState } from 'react';
import { html, Fragment } from './ui.js';

export function Admin({ events, repo, branch }) {
  const [status, setStatus] = useState('');
  const [json, setJson] = useState(null);
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));

  function save(e) {
    e.preventDefault();
    const form = e.target;
    const bad = [];
    const next = events.map(ev => {
      const v = form.elements[ev.date].value.trim();
      if (v && !/^https:\/\/(www\.)?partiful\.com\//.test(v)) bad.push(ev.date);
      return { ...ev, partiful: v || null };
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

  return html`<${Fragment}>
    <p>Paste a Partiful link next to each meetup, then Save. It copies the updated meetups file and opens it on GitHub: select everything there, paste, and commit.</p>
    <form className="admin__form" id="admin" onSubmit=${save}>
      ${sorted.map(e => html`
        <label key=${e.date} className="admin__row">
          <span className="admin__when">${e.date} · ${e.title}</span>
          <input type="url" inputMode="url" name=${e.date} defaultValue=${e.partiful || ''} placeholder="https://partiful.com/e/..." />
        </label>`)}
      <button className="here__btn" type="submit">Save</button>
      <p className="admin__status" role="status">${status}</p>
      ${json && html`<pre className="admin__json">${json}</pre>`}
    </form>
  <//>`;
}
