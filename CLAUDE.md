# Claude Squad site

Static site for Claude Squad (NYC fitness + computing crew). Eleventy (11ty) v2, Nunjucks templates, one hand-written stylesheet, no JS framework, no build step beyond 11ty itself.

## Commands

```
npm install
npm run dev     # eleventy --serve (live reload)
npm run build   # outputs to _site/
```

## Structure

- `src/index.njk` — homepage: 3D hero (`src/js/hero.js`, raw three.js from an importmap) with the next meetup overlaid, intro copy, photo gallery (sorted by date, newest first). Without WebGL the flat `logo.jpg` shows instead.
- `src/here.njk` + `src/js/here.js` — `/here/`, login + check-in against the check-in server (`site.apiUrl`). Join = name + GitHub username, session token in localStorage; Sign in with GitHub appears when the server has GitHub OAuth env vars. Check-in is a Bump: on a meetup day a pixel pig (SVG, same bitmap as the hero) waits; tap arms motion and location, 3 shakes POST `/api/bump`, and two bumps within 20s and 250m check both people in (server-side, the only way a check-in row is written). Someone already in can bump a newcomer in. Tap works instead of shaking when motion is denied or silent. First check-in shows an "Add yourself on GitHub" card. Points (also on the homepage leaderboard): 1 per check-in on an `events.json` date + 1 per merged PR to this repo or a Projects repo (`src/_data/prRepos.js`), counted in the browser from GitHub's public search (10-minute cache) and matched to members by GitHub login; the rules are `POINTS`/`countPRs`/`leaderboard` in `checkin.js`.
- `server/` — the check-in server: plain Node `http` + `pg`, schema in `server/schema.sql` (applied on every start, create-if-missing). Routes are listed at the top of `server/index.mjs`. `server/e2e.mjs` tests it against a local Postgres in Docker.
- `src/js/hero.js` lifecycle (reduced motion, background tabs, lost WebGL context falling back to the flat logo, ring framing at phone and desktop widths) is covered by `test/hero.test.cjs`, which runs the file against stubs, no GPU.
- `src/js/checkin.js` — the pure rules (New York date, tally, shake counter), tested by `npm test` (`node --test`, no dependencies).
- `src/manifest.webmanifest` + `src/sw.js` — PWA, starts at `/here/`. The worker is network-first and same-origin only.
- `src/calendar.njk` — calendar page, entirely data-driven (see below)
- `src/js/squad.js` — shared by every page that talks to the server: `API` (`site.apiUrl` via `<meta name="squad-api">`, or `http://localhost:10124` when the site runs on localhost), the session token (`localStorage['squad-token']`), `api()`, `mergedPRs()`, `countTo()`, `avatar()` (falls back to the pig).
- Homepage leaderboard (`#board`, `src/js/board.js`): public, `GET /api/leaderboard` + GitHub PR counts, bars grow when on screen, refreshes every 30s.
- `/admin/` (`src/admin.njk`, not in the nav, noindex): a Partiful field per meetup; Save copies the updated `events.json` and opens it in GitHub's editor. GitHub decides who can commit it.
- `src/projects.njk` — `/projects/`: "What are you working on?" (`src/js/working.js`; members post a line + optional link via `POST /api/posts`, everyone reads `GET /api/posts`, authors can delete), then everything in `src/projects/*.md` (front matter `name`, `repo`, `lead`, `help` list; body is the description). `projects.json` sets `tags: project`, `permalink: false`. Each links to the repo's issues and its `good first issue` ones; "Add a project" opens GitHub with the file started.
- `src/members.njk` — `/members/` index, lists everyone in the `profile` collection (photo, name, role) linking to their page
- `src/profiles/*.md` — one file per person; filename *is* the URL slug (`mare-co-captain.md` → `/members/mare-co-captain/`). Shared front matter/layout comes from `src/profiles/profiles.json` (11ty directory data file: `layout: profile.njk`, `tags: profile`, `permalink: /members/{{ page.fileSlug }}/`)
- `src/gallery/*.md` — one file per photo, front matter only (`image`, `date`, `event`, `caption`). `src/gallery/gallery.json` sets `tags: photo`, `permalink: false` (these don't render their own pages, just feed the `photo` collection)
- `src/_includes/layouts/base.njk` — shared shell: head/fonts/favicon, header+nav, WhatsApp topbar, footer. `{{ content | safe }}` is the page body.
- `src/_includes/layouts/profile.njk` — profile page layout (photo circle, name, role, bio)
- `src/css/styles.css` — the only stylesheet, plain CSS with custom properties, BEM-ish class names (`.calendar__day--event`, etc.)

### `src/_data/` (11ty global data)

- `site.json` — `{ whatsappLink, repo, apiUrl }`. `apiUrl` is the check-in server. Currently always set to a real invite link; there's no "link missing" fallback anywhere anymore (it was removed on purpose — see git log "Remove the no-link fallback for the WhatsApp button"). If this ever needs to go back to being optional, that pattern would need re-adding in `base.njk`.
- `events.json` — the single source of truth for all meetups. Each entry: `date` (`YYYY-MM-DD`), `title`, `emoji` (optional), `color` (optional, defaults to `var(--accent)`), `partiful` (URL or `null`). This is the file to edit when meetups are added/changed — nothing else needs touching.
- `calendarMonths.js` — computes the calendar grid *from* `events.json`. Key behavior: it only renders 3-month blocks for quarters that actually contain an event (sorted chronologically), **not** a rolling window based on today's date. The next quarter only appears once an event is added to it — this was an explicit user request, don't "fix" it back to date-based rolling. Falls back to today's quarter if `events.json` is ever empty. Also flags `isPast` per month (fully-elapsed months) for the gray-out/mobile-hide behavior in CSS.
- `nextEvent.js` — soonest event on/after today, used by the homepage hero. Returns `null` if nothing upcoming (the meetup block just doesn't render).

## Design system

- Colors (`:root` in `styles.css`): `--site-bg: #000000` (sampled exactly from `logo.jpg`'s background — keep it pure black, don't drift back to `#0b0b0b`), `--accent: #d9835f` (terracotta from the logo), `--ink` / `--ink-muted` for text, `--card-bg` / `--border` for panels.
- Fonts: Claude's look. Claude uses Anthropic Serif/Sans/Mono (not open licence), so `--serif` (Source Serif 4), `--sans` (Hanken Grotesk) and `--mono` (JetBrains Mono) stand in, each listed after the Anthropic name so a machine with the real font uses it. Serif for h1/h2, the hero wordmark and calendar months; sans for body; mono uppercase for small labels. `Press Start 2P` (`--pixel`) stays only for brand bits: header wordmark, tagline, footer mark, points, the Friendshipmog button.
- Look: industrial/terminal. No border-radius anywhere (reset sets it to 0), 1px `--rule` hairlines to divide things, `.ticks` for corner registration marks, `<mark>` for the accent highlighter that swipes in on scroll. Two page-height hairlines live on `.page::before`. No section numbers or noise grain (dropped on purpose).
- Layout: spacing comes from the `--space-*` scale in `:root` (3xs 4px to 2xl fluid), never raw px. `--gutter` lines page content up just inside the two page hairlines (6vw + 24px, 16px on phones, where the hairlines hide). `.content` and `.gallery` are two-column sections: sticky heading left, material right, a rule between sections. Stacking uses `--z-scene/--z-overlay/--z-tooltip/--z-chrome`.
- Small rewards: clicking the hero canvas (or Enter/Space when it has focus) makes the pig do a rep (corner tag counts reps); on `/here/` each counted shake is a pig rep plus a filled pip, and a check-in bursts pixels and pixel hearts off the pig, bigger at 5/10/25/50/100 meetups. No pause-motion control (the user said no); reduced motion is the off switch. Buttons are square accent blocks that invert to `--ink` on hover.
- `h1`/`h2`/`.page-title` all share the serif look; keep new headings consistent with that.
- Icons are drawn from the pig bitmap by `python3 scripts/icons.py`: `src/images/pig.svg` (header and SVG favicon), the PNG favicons and `favicon.ico`, and the home-screen icons (dark pig on the accent, inside the maskable safe zone). The bitmap is also in `hero.js` and `here.js`; change all three together. `logo-840.png` (hero fallback) is a 16-colour PNG from `logo.jpg` (ffmpeg `palettegen`/`paletteuse=dither=none`). three.js is the minified build, with both files `modulepreload`ed in `index.njk` so they download in parallel.
- Images: `src/images/logo.jpg` is the full lockup (pig + "MAKE NO MISTAKES" tagline) used in the homepage hero. `src/images/logomark.jpg` is the cropped pig-only mark used in the header and as the favicon source. `src/images/favicon/` comes from `scripts/icons.py`.

## Content model

- Profiles live under `/members/slug/` and are listed on `/members/`.
- `CONTRIBUTING.md` has the full user-facing instructions for adding a meetup, a profile, or a gallery photo via PR — keep it in sync if the data shapes above change.
- Git: remote is github.com/maremarebell/claudesquad.
- Deploy: Render, all free. Static site `claudesquad` (https://claudesquad.onrender.com, made in the dashboard, builds `claudesquad-3d-attendance`; switch to `main` once the PR merges), plus the Blueprint in `render.yaml`: `claudesquad-api` (server/). Its database is not chosen yet (Render's one free database is Meridian's): set `DATABASE_URL` on the service to any Postgres and the server creates its tables in schema `claudesquad` on start. Render has no access to the repo (it's maremarebell's), so pushes do NOT auto-deploy: Manual Deploy in the dashboard, or have maremarebell install the Render GitHub app.

## TODO

- Figure out the actual contribution model: current docs (`CONTRIBUTING.md`) assume standalone git/PR workflow, but we still need a real way for people to collaboratively edit the site together live, in person, during a Claude Squad workout session (not everyone will have a dev setup ready to go) — needs more thought.
