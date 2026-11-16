# Contributing to Claude Squad

## Add or edit a meetup

All meetups live in one file: `src/_data/events.json`. Add an entry (or edit one):

```json
{
  "date": "2026-11-14",
  "title": "Name of the meetup",
  "emoji": "🏋️",
  "partiful": "https://partiful.com/e/xxxxx"
}
```

- `date`: `YYYY-MM-DD`.
- `title`: shown in the calendar tooltip and, if it's the next upcoming one, in the homepage hero.
- `emoji`: optional, shown on the calendar day.
- `color`: optional CSS color for the day's background; defaults to the site accent.
- `partiful`: the RSVP link. If you don't have one yet, set it to `null`. The day still shows on the calendar (click it to see the title), and the homepage hero links to the calendar instead of an RSVP.
- `place`: optional, the venue name shown on the session page and the homepage's "Last Session" (e.g. `"Vital"`). Without one, the site falls back to whatever approximate place Partiful itself gives out (a neighbourhood, never a street address) — `/admin/` (signed in as the repo owner) has a place dropdown of known venues plus "Add something else", and a "Pull from Partiful" button that fills it in with Partiful's approximate place as a starting point.

The calendar and the homepage hero both read straight from this file. No other files need to change.

## Add your profile

Quickest way: log in at `/here/`, check in at a meetup, then hit "Add your profile". It opens GitHub with the file already started. Or by hand:

1. Add a photo (optional) to `src/images/profiles/your-name.jpg`.
2. Create `src/profiles/your-slug.md` (the filename becomes the URL, e.g. `your-slug.md` → `/members/your-slug/`). You'll also show up automatically on the `/members` list.

   ```md
   ---
   name: Your Name
   role: Your Role
   photo: /images/profiles/your-name.jpg
   ---

   A couple sentences about you.
   ```
3. Open a PR.

## Add a project

Something you're building that other people can help with. Hit "Add a project" on `/projects/`, or create `src/projects/your-project.md`:

```md
---
name: Your Project
repo: https://github.com/you/your-project
lead: Your Name
help:
  - One thing you'd like help with
  - Another
---

What it is, in a sentence or two.
```

The projects page links each one to its open issues and to issues labelled `good first issue`, so label a few of those on your repo.

## Points

Every merged pull request to this repo, or to any repo on the Projects page, is 1 point on the leaderboard, as long as you joined with the same GitHub username. Each meetup you check in at is 1 point too.

## Photos

Photos aren't added via PR — sign in at `/here/`, go to any session's page, and add one there once you've checked in. The homepage gallery shows the newest of those automatically.
