const events = require("./events.json");

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function pad(n) {
  return String(n).padStart(2, "0");
}

function eventTooltip(event) {
  return event.partiful
    ? `${event.title} — RSVP on Partiful`
    : `${event.title} — Partiful TBA, ask in the WhatsApp group`;
}

// Builds a rolling 12-month grid (this month through +11 months), stretched
// to also cover any event date that falls outside that window.
module.exports = function() {
  const today = new Date();
  const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const todayStr = `${todayUTC.getUTCFullYear()}-${pad(todayUTC.getUTCMonth() + 1)}-${pad(todayUTC.getUTCDate())}`;

  const eventsByDate = {};
  events.forEach(e => {
    const augmented = { ...e, tooltip: eventTooltip(e) };
    if (!eventsByDate[e.date]) eventsByDate[e.date] = [];
    eventsByDate[e.date].push(augmented);
  });

  let startMonth = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), 1));
  let endMonth = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth() + 11, 1));

  events.forEach(e => {
    const [y, m] = e.date.split("-").map(Number);
    const eventMonth = new Date(Date.UTC(y, m - 1, 1));
    if (eventMonth < startMonth) startMonth = eventMonth;
    if (eventMonth > endMonth) endMonth = eventMonth;
  });

  const months = [];
  let cursor = new Date(startMonth);

  while (cursor <= endMonth) {
    const year = cursor.getUTCFullYear();
    const monthIndex = cursor.getUTCMonth();
    const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

    const days = [];
    for (let i = 0; i < firstWeekday; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${pad(monthIndex + 1)}-${pad(d)}`;
      days.push({
        date: dateStr,
        day: d,
        isToday: dateStr === todayStr,
        events: eventsByDate[dateStr] || []
      });
    }
    while (days.length % 7 !== 0) days.push(null);

    const weeks = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

    months.push({ name: MONTH_NAMES[monthIndex], year, weeks });

    cursor = new Date(Date.UTC(year, monthIndex + 1, 1));
  }

  return months;
};
