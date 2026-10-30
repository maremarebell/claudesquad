const events = require("./events.json");

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// The soonest event on or after today, for the homepage hero. Picked at build
// time; the homepage re-picks in the browser, since the build can be days old.
function pickNext(events, today) {
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const upcoming = events
    .filter(e => e.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!upcoming.length) return null;

  return { ...upcoming[0], dateLabel: formatDate(upcoming[0].date) };
}

module.exports = () => pickNext(events, new Date());
Object.assign(module.exports, { pickNext, formatDate });
