// The shell every page renders into (head, header and nav, WhatsApp bar,
// footer, scripts) and Island, a piece of a page React also runs in the
// browser. Build only: the pages import it, the browser never loads it.
import React from 'react';
import { html } from '../js/ui.js';

// Where the browser loads React, three and the renderer from. One map on every
// page, so there is a single copy of three: @react-three/fiber carries its own
// unless ?external says otherwise, and react/jsx-runtime is what fiber imports
// React by. react and htm are the versions in package.json (a test checks), so
// the markup the build renders is what the browser's React expects to find.
export const VERSIONS = { react: '19.3.1', htm: '3.1.1', three: '0.180.0', fiber: '9.8.2' };
export const IMPORTS = {
  react: `https://esm.sh/react@${VERSIONS.react}`,
  'react/jsx-runtime': `https://esm.sh/react@${VERSIONS.react}/jsx-runtime`,
  'react-dom': `https://esm.sh/react-dom@${VERSIONS.react}`,
  'react-dom/client': `https://esm.sh/react-dom@${VERSIONS.react}/client`,
  three: `https://unpkg.com/three@${VERSIONS.three}/build/three.module.min.js`,
  '@react-three/fiber': `https://esm.sh/@react-three/fiber@${VERSIONS.fiber}?external=react,react-dom,three`,
  htm: `https://esm.sh/htm@${VERSIONS.htm}`,
};

const NAV = [
  { href: '/here/', label: 'Log in', id: 'nav-login' },
  { href: '/calendar/', label: 'Calendar' },
  { href: '/projects/', label: 'Projects' },
  { href: '/members/', label: 'Members', within: true },
];
const current = (item, url) => (item.within ? url.includes(item.href) : url === item.href);

export function Layout({ site, js, url, title, name, children }) {
  const pageName = name || title;
  const pageTitle = `${pageName && pageName !== 'Home' ? `${pageName} · ` : ''}Claude Squad`;
  return html`
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
        <title>${pageTitle}</title>
        <link rel="icon" href="/images/favicon/favicon.ico" sizes="any" />
        <link rel="icon" href="/images/pig.svg" type="image/svg+xml" />
        <link rel="icon" type="image/png" sizes="32x32" href="/images/favicon/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/images/favicon/favicon-16x16.png" />
        <link rel="apple-touch-icon" href="/images/favicon/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="squad-api" content=${site.apiUrl} />
        ${url === '/admin/' && html`<meta name="robots" content="noindex" />`}
        <meta name="theme-color" content="#000000" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Squad" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=JetBrains+Mono:wght@400;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600&family=Hanken+Grotesk:wght@400;500;600&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="/css/styles.css" />
        <script type="importmap" dangerouslySetInnerHTML=${{ __html: JSON.stringify({ imports: IMPORTS }) }} />
      </head>
      <body className="page">
        <header className="header">
          <div className="header__container">
            <a href="/" className="header__brand">
              <img src="/images/pig.svg" width="68" height="36" alt="Claude Squad" className="header__logo-img" />
              <span className="header__logo-text">Claude Squad</span>
            </a>
            <nav className="nav">
              <ul className="nav__list">
                ${NAV.map(item => html`
                  <li key=${item.href} className="nav__item">
                    <a href=${item.href} className="nav__link" id=${item.id} aria-current=${current(item, url) ? 'page' : undefined}>${item.label}</a>
                  </li>`)}
              </ul>
            </nav>
          </div>
        </header>

        <div className="topbar">
          <div className="topbar__inner">
            <p className="topbar__text">Whatsapp has best info: </p>
            <a href=${site.whatsappLink} target="_blank" rel="noopener" className="topbar__button">💪 Join the WhatsApp</a>
          </div>
        </div>

        <main className="main">${children}</main>

        <footer className="footer">
          <div className="footer__container">
            <p className="footer__mark" aria-hidden="true">Make No Mistakes.</p>
            <p className="footer__meta"><span>© 2026 Claude Squad</span><a href=${site.repo} target="_blank" rel="noopener">GitHub</a><span>NYC</span></p>
          </div>
        </footer>
        <script type="module" src=${`${js}/site.js`} />
        <script type="module" src=${`${js}/mount.js`} />
      </body>
    </html>`;
}

// A piece of a page React also runs in the browser: rendered here, then taken
// over in place by mount.js, which finds the component's module by the island's
// name (board.js exports Board) and its props as JSON in data-props.
export function Island({ name, component, props, as = 'div', ...attrs }) {
  return React.createElement(as, { ...attrs, 'data-island': name, 'data-props': JSON.stringify(props) }, React.createElement(component, props));
}
