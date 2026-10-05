# Claude Squad

Static site for Claude Squad — home, calendar, and crew profiles. Built with [Eleventy](https://www.11ty.dev/).

## Develop

```
npm install
npm run dev
```

Builds to `_site/`. See `CONTRIBUTING.md` for how to add a profile or gallery photo.

## Check-in (login, friendshipmog, points)

`/here/` is the login page. Sign in with GitHub, shake your phone on a meetup day to check in, get 10 points per meetup. After your first check-in it links you to add your profile as a PR.

It needs a Supabase project. One-time setup:

1. Create a project at supabase.com.
2. SQL editor: run `supabase/schema.sql`.
3. Authentication > Providers: enable GitHub (make a GitHub OAuth app, callback URL is the one Supabase shows).
4. Authentication > URL Configuration: set the site URL, and add `<site>/here/` and `http://localhost:8080/here/` to Redirect URLs. Sign-in returns to `/here/`; without it on the list Supabase sends people to `/`, which doesn't save the session.
5. Put the project URL and anon key in `src/_data/site.json` (`supabaseUrl`, `supabaseAnonKey`). The anon key is public by design; the row policies in the schema are what protect the data.

Until then `/here/` says "Check-in isn't open yet."
