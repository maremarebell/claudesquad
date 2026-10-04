# Contributing to Claude Squad

## Add your profile

1. Add a photo (optional) to `src/images/profiles/your-name.jpg`.
2. Create `src/profiles/your-slug.md` (the filename becomes the URL, e.g. `your-slug.md` → `/your-slug/`):

   ```md
   ---
   name: Your Name
   role: Your Role
   photo: /images/profiles/your-name.jpg
   ---

   A couple sentences about you.
   ```
3. Open a PR.

## Add a gallery photo

1. Add the image to `src/images/gallery/your-file.jpg`.
2. Create a matching file in `src/gallery/your-file.md`:

   ```md
   ---
   image: /images/gallery/your-file.jpg
   date: 2026-03-15
   event: Event name
   caption: Optional one-liner
   ---
   ```
3. Open a PR. The homepage gallery sorts automatically by `date`, newest first.
