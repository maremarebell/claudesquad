// Not in the nav. GitHub decides who can actually change anything: only people
// with write access to the repo can commit the edit; anyone else gets a PR.
import { html } from '../js/ui.js';
import { Layout, Island } from '../_includes/layout.mjs';
import { Admin } from '../js/admin.js';

export const data = { permalink: '/admin/', title: 'Meetup links', eleventyExcludeFromCollections: true };

export default function AdminPage({ site, js, url, title, events }) {
  return html`<${Layout} site=${site} js=${js} url=${url} title=${title}>
    <div className="content admin">
      <h1>Meetup links</h1>
      <${Island} name="admin" component=${Admin} props=${{ events, repo: site.repo, branch: site.branch }} />
    </div>
  <//>`;
}
