// Meetups on or before today, newest first: what /sessions/ paginates over.
// Pure and local (no network), unlike the per-session Partiful/attendee/photo
// data, which the browser fetches live from the check-in server.
//
// Read with fs, not require(): require() caches the parsed JSON by path, and
// under `eleventy --serve` nothing clears that cache when events.json
// changes, so edits would need a full restart to show up here.
const fs = require("fs");
const path = require("path");

module.exports = function () {
  const events = JSON.parse(fs.readFileSync(path.join(__dirname, "events.json"), "utf8"));
  const today = new Date().toLocaleDateString("en-CA");
  return events.filter(e => e.date <= today).sort((a, b) => b.date.localeCompare(a.date));
};
