// /here/: log in and check in. The whole panel is the Here component
// (here.js), rendered here and taken over in the browser.
import { html } from '../js/ui.js';
import { Layout, Island } from '../_includes/layout.mjs';
import { Here } from '../js/here.js';

export const data = { permalink: '/here/', title: 'Log in' };

// If React never arrives (no signal, a blocked CDN), the page says so instead
// of sitting on "Loading…". A classic script, so it is already listening
// before the module loads.
const FALLBACK = `(function () {
  var say = function () {
    var s = document.getElementById('here-status');
    if (s && s.textContent === 'Loading…') s.textContent = "Couldn't load the page. Check your signal and reload.";
  };
  addEventListener('error', function (e) { if (e.target && e.target.tagName === 'SCRIPT') say(); }, true);
  setTimeout(say, 15000);
})();`;

export default function HerePage({ site, js, url, title, events, prRepos }) {
  const props = { repo: site.repo, branch: site.branch, apiUrl: site.apiUrl, prRepos, events };
  return html`<${Layout} site=${site} js=${js} url=${url} title=${title}>
    <${Island} name="here" component=${Here} props=${props} id="here-root" />
    <script dangerouslySetInnerHTML=${{ __html: FALLBACK }} />
  <//>`;
}
