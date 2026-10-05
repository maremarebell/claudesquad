# Claude Squad

Static site for Claude Squad — home, calendar, and crew profiles. Built with [Eleventy](https://www.11ty.dev/).

## Develop

```
npm install
npm run dev
```

Builds to `_site/`. See `CONTRIBUTING.md` for how to add a profile or gallery photo.

## Check-in (login, bump, points)

`/here/` is the login page. Sign in with GitHub. On a meetup day, shake your phone at the same time as someone standing next to you, like the old Bump app: two shakes within 20 seconds and 250 metres of each other check you both in. Someone already in can bump a newcomer in. 10 points per meetup. Your first check-in puts an "Add yourself on GitHub" link right there, which opens a PR adding your profile.

The matching happens in the database (`public.bump()` in `supabase/migrations/`), so nobody can check in alone or from home. Locations are deleted after an hour and nobody can read them.

### Turning it on

1. Make a Supabase access token at https://supabase.com/dashboard/account/tokens, then run:

   ```
   SUPABASE_ACCESS_TOKEN=... node scripts/setup-supabase.mjs
   ```

   It creates the `claudesquad` project, applies the migrations, and writes the URL and anon key into `src/_data/site.json`. It prints the GitHub OAuth app values for step 2.
2. Make that GitHub OAuth app at https://github.com/settings/applications/new, then run the same command again with `GITHUB_CLIENT_ID=... GITHUB_SECRET=...` in front. Sign-in returns to https://claudesquad.onrender.com/here/ (and `localhost:8080` for dev); `SITE_URL=...` changes that.

Until then `/here/` says "Check-in isn't open yet."

### Hosting

Render static site at https://claudesquad.onrender.com (settings in `render.yaml`). Phones need it: shaking and location only work over HTTPS. Render can't see pushes to this repo yet, so deploy with Manual Deploy in the Render dashboard until the Render GitHub app is installed on the repo.

### Testing locally

```
npm test                         # unit tests, no network
npx supabase start               # local Supabase in Docker, applies the migrations
node scripts/bump-e2e.mjs        # logins, members and bumps against it
```
