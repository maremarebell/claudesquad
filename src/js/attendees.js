// Who checked in at a past session, from the public history endpoint.
import { useState, useEffect } from 'react';
import { api } from './squad.js';
import { html, Fragment, Avatar, useReveal } from './ui.js';

export function Attendees({ date, host }) {
  const [members, setMembers] = useState(null);

  useEffect(() => {
    api(`/api/sessions?dates=${date}`).then(rows => setMembers(rows[0]?.members || [])).catch(() => setMembers([]));
  }, [date]);
  useReveal(host, 'session__attendees--in');

  return html`<${Fragment}>
    <p className="session__eyebrow">[ Roll Call ]</p>
    <h2>Who was definitely<span className="session__star" aria-hidden="true">*</span> there</h2>
    <p className="session__attendees-note"><span aria-hidden="true">*</span> Not exhaustive, only the members who remembered to bump at the session.</p>
    ${members === null ? html`<p className="session__status" role="status">Loading…</p>` :
      members.length ? html`
        <ul className="session__attendees-list">
          ${members.map((m, i) => html`
            <li key=${m.id} className="session__attendee" style=${{ '--i': i }}>
              <${Avatar} member=${m} className="session__face" />
              <span className="session__attendee-name">${m.name}</span>
            </li>`)}
        </ul>` : html`<p className="session__status">Nobody checked in to this one.</p>`}
  <//>`;
}
