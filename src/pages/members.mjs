import { html } from '../js/ui.js';
import { Layout } from '../_includes/layout.mjs';

export const data = { permalink: '/members/', title: 'Members', uses: ['profile'] };

export default function Members({ site, js, url, title, profiles }) {
  return html`<${Layout} site=${site} js=${js} url=${url} title=${title}>
    <div className="content">
      <h1>Members</h1>
      <div className="members__grid">
        ${profiles.map(member => html`
          <a key=${member.url} href=${member.url} className="members__item">
            ${member.photo
              ? html`<img src=${member.photo} alt=${member.name} className="members__photo" />`
              : html`<div className="members__photo members__photo--placeholder" aria-hidden="true" />`}
            <span className="members__name">${member.name}</span>
            ${member.role && html`<span className="members__role">${member.role}</span>`}
          </a>`)}
      </div>
    </div>
  <//>`;
}
