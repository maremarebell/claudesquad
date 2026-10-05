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
- `src/here.njk` + `src/js/here.js` — `/here/`, login + check-in: GitHub sign-in through Supabase, shake to check in (vibrate on Android, switch-checkbox haptic on iOS), 10 points per check-in on an `events.json` date, unlocks an "Add your profile" GitHub link after the first one. Schema and RLS in `supabase/schema.sql`, setup in README.
- `src/manifest.webmanifest` + `src/sw.js` — PWA, starts at `/here/`. The worker is network-first and same-origin only.
- `src/calendar.njk` — calendar page, entirely data-driven (see below)
- `src/members.njk` — `/members/` index, lists everyone in the `profile` collection (photo, name, role) linking to their page
- `src/profiles/*.md` — one file per person; filename *is* the URL slug (`mare-co-captain.md` → `/members/mare-co-captain/`). Shared front matter/layout comes from `src/profiles/profiles.json` (11ty directory data file: `layout: profile.njk`, `tags: profile`, `permalink: /members/{{ page.fileSlug }}/`)
- `src/gallery/*.md` — one file per photo, front matter only (`image`, `date`, `event`, `caption`). `src/gallery/gallery.json` sets `tags: photo`, `permalink: false` (these don't render their own pages, just feed the `photo` collection)
- `src/_includes/layouts/base.njk` — shared shell: head/fonts/favicon, header+nav, WhatsApp topbar, footer. `{{ content | safe }}` is the page body.
- `src/_includes/layouts/profile.njk` — profile page layout (photo circle, name, role, bio)
- `src/css/styles.css` — the only stylesheet, plain CSS with custom properties, BEM-ish class names (`.calendar__day--event`, etc.)

### `src/_data/` (11ty global data)

- `site.json` — `{ whatsappLink, repo, supabaseUrl, supabaseAnonKey }`. Empty Supabase values make `/here/` say it isn't connected. Currently always set to a real invite link; there's no "link missing" fallback anywhere anymore (it was removed on purpose — see git log "Remove the no-link fallback for the WhatsApp button"). If this ever needs to go back to being optional, that pattern would need re-adding in `base.njk`.
- `events.json` — the single source of truth for all meetups. Each entry: `date` (`YYYY-MM-DD`), `title`, `emoji` (optional), `color` (optional, defaults to `var(--accent)`), `partiful` (URL or `null`). This is the file to edit when meetups are added/changed — nothing else needs touching.
- `calendarMonths.js` — computes the calendar grid *from* `events.json`. Key behavior: it only renders 3-month blocks for quarters that actually contain an event (sorted chronologically), **not** a rolling window based on today's date. The next quarter only appears once an event is added to it — this was an explicit user request, don't "fix" it back to date-based rolling. Falls back to today's quarter if `events.json` is ever empty. Also flags `isPast` per month (fully-elapsed months) for the gray-out/mobile-hide behavior in CSS.
- `nextEvent.js` — soonest event on/after today, used by the homepage hero. Returns `null` if nothing upcoming (the meetup block just doesn't render).

## Design system

- Colors (`:root` in `styles.css`): `--site-bg: #000000` (sampled exactly from `logo.jpg`'s background — keep it pure black, don't drift back to `#0b0b0b`), `--accent: #d9835f` (terracotta from the logo), `--ink` / `--ink-muted` for text, `--card-bg` / `--border` for panels.
- Fonts: `Press Start 2P` (pixel, Google Fonts) for headings/h1/h2/logo wordmark/nav brand; `Open Sans` for everything else (body copy, calendar, footer, tooltips). Loaded together in one `<link>` in `base.njk`.
- `h1`/`h2`/`.page-title` all share the same Press Start 2P look — intentional, keep new headings consistent with that rather than introducing a third heading style.
- Images: `src/images/logo.jpg` is the full lockup (pig + "MAKE NO MISTAKES" tagline) used in the homepage hero. `src/images/logomark.jpg` is the cropped pig-only mark used in the header and as the favicon source. `src/images/favicon/` was generated from `logomark.jpg` (cropped, background keyed transparent) — regenerate from that same source if the mark ever changes.

## Content model

- Profiles live under `/members/slug/` and are listed on `/members/`.
- `CONTRIBUTING.md` has the full user-facing instructions for adding a meetup, a profile, or a gallery photo via PR — keep it in sync if the data shapes above change.
- Git: remote is github.com/maremarebell/claudesquad. Not deployed anywhere yet.

## TODO

- Figure out the actual contribution model: current docs (`CONTRIBUTING.md`) assume standalone git/PR workflow, but we still need a real way for people to collaboratively edit the site together live, in person, during a Claude Squad workout session (not everyone will have a dev setup ready to go) — needs more thought.
