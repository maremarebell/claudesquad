# Claude Squad

Static site for Claude Squad: home, calendar, and crew profiles. Built with [Eleventy](https://www.11ty.dev/).

## Develop

```
npm install
npm run dev
```

Builds to `_site/`. See `CONTRIBUTING.md` for how to add a profile or gallery photo.

## Check-in (login, bump, points)

`/here/` is the login page. Join with your name and GitHub username (one tap, no password). On a meetup day, shake your phone at the same time as someone standing next to you, like the old Bump app: two shakes within 20 seconds and 250 metres of each other check you both in. Someone already in can bump a newcomer in. 1 point per meetup, and 1 per merged pull request to this repo or any repo on the Projects page (counted straight from GitHub, matched by GitHub username). Your first check-in puts an "Add yourself on GitHub" link right there, which opens a PR adding your profile.

The check-in server is `server/` (Node + Postgres), hosted on Render next to the site; `render.yaml` describes it. Matching happens on the server, so nobody can check in alone or from home. Locations are deleted after an hour and never sent to anyone.

A GitHub username can only be joined once by typing it. Once a GitHub OAuth app is set up (callback `https://claudesquad-api.onrender.com/api/auth/github/callback`) and its `GITHUB_CLIENT_ID` and `GITHUB_SECRET` are added to the `claudesquad-api` service on Render, a "Sign in with GitHub" button appears, and that's how people get back in on a new phone.

### Also on the server

- The homepage leaderboard: public, live, refreshed every 30 seconds.
- "What are you working on?" on the Projects page: members post a line and a link, everyone can read it.
- `/admin/`: a Partiful link field per meetup. Save copies the updated `events.json` and opens it on GitHub to commit.

### Hosting

Free: the static site at https://claudesquad.onrender.com and the server at https://claudesquad-api.onrender.com on Render, with the server's tables in their own `claudesquad` schema on a free Neon Postgres (project `claudesquad`), whose address is set by hand as `DATABASE_URL` on the Render service. Phones need the HTTPS site: shaking and location only work there. The free server sleeps when idle and takes up to a minute to wake, so the check-in page wakes it as it opens.

Render deploys the static site on every push to the branch it builds.

### Testing locally

```
npm test                                   # unit tests, no network
docker run -d --rm --name sq-pg -e POSTGRES_PASSWORD=local -p 55432:5432 postgres:16-alpine
(cd server && npm ci) && node server/e2e.mjs   # join, bumps, matching, CORS, sign-out
```
