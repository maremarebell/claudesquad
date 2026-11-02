// A member's page, from their src/profiles/*.md: the front matter and the
// rendered body arrive as data.
import { html } from '../../js/ui.js';
import { Layout } from '../layout.mjs';

export default function Profile({ site, js, url, name, role, photo, content }) {
  return html`<${Layout} site=${site} js=${js} url=${url} name=${name}>
    <div className="profile">
      ${photo
        ? html`<img src=${photo} alt=${name} className="profile__photo" />`
        : html`<div className="profile__photo profile__photo--placeholder" aria-hidden="true" />`}
      <h1 className="profile__name page-title">${name}</h1>
      ${role && html`<p className="profile__role page-subtitle">${role}</p>`}
      <div className="profile__bio" dangerouslySetInnerHTML=${{ __html: content }} />
    </div>
  <//>`;
}
