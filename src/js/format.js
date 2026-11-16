// Small text rules shared by the pages, with no DOM in them, so Node can test
// them (test/format.test.mjs).

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// "just now", "5m ago", "3h ago", "2d ago" for a post's ISO timestamp.
export function ago(iso, now = Date.now()) {
  const s = (now - Date.parse(iso)) / 1000;
  if (s < 90) return 'just now';
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  if (s < 129600) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

// A Partiful start time in the event's own timezone, e.g. "7:00 PM" — start
// is a UTC ISO string, timezone an IANA name (both from the Partiful scrape,
// so either can be missing).
export function partifulTime(start, timezone) {
  if (!start || !timezone) return null;
  return new Date(start).toLocaleTimeString('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' });
}

// A link shown without its scheme or trailing slash: github.com/a/b
export function linkLabel(link) {
  const url = new URL(link);
  return url.host + url.pathname.replace(/\/$/, '');
}

// What people type as their GitHub username: spaces and a leading @ dropped.
export const githubLogin = input => input.trim().replace(/^@/, '');

// "Add your profile" opens GitHub's new-file page with the front matter
// started. JSON strings are valid YAML, so a name with a colon can't break it.
export function profileLink({ repo, branch }, { login, name }) {
  const template = `---\nname: ${JSON.stringify(name || login)}\nrole:\nphoto:\n---\n\n`;
  return `${repo}/new/${branch}/src/profiles?filename=${encodeURIComponent(login)}.md&value=${encodeURIComponent(template)}`;
}
