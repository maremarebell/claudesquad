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

function quarterKey(year, monthIndex) {
  const q = Math.floor(monthIndex / 3);
  return `${year}-${q}`;
}

// Shows one 3-month block per quarter that actually has an event in it —
// it does NOT auto-advance with today's date. The next quarter only
// appears once an event is added to it. Falls back to the current
// quarter if events.json has nothing in it yet.
module.exports = function() {
  const today = new Date();
  const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const todayStr = `${todayUTC.getUTCFullYear()}-${pad(todayUTC.getUTCMonth() + 1)}-${pad(todayUTC.getUTCDate())}`;

  const eventsByDate = {};
  const quarterKeysWithEvents = new Set();
  events.forEach(e => {
    const augmented = { ...e, tooltip: eventTooltip(e) };
    if (!eventsByDate[e.date]) eventsByDate[e.date] = [];
    eventsByDate[e.date].push(augmented);

    const [y, m] = e.date.split("-").map(Number);
    quarterKeysWithEvents.add(quarterKey(y, m - 1));
  });

  if (quarterKeysWithEvents.size === 0) {
    quarterKeysWithEvents.add(quarterKey(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth()));
  }

  const quarters = [...quarterKeysWithEvents]
    .map(key => {
      const [year, q] = key.split("-").map(Number);
      return { year, startMonth: q * 3 };
    })
    .sort((a, b) => (a.year - b.year) || (a.startMonth - b.startMonth));

  const months = [];

  quarters.forEach(({ year, startMonth }) => {
    for (let monthIndex = startMonth; monthIndex < startMonth + 3; monthIndex++) {
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

      const isPast = year < todayUTC.getUTCFullYear() ||
        (year === todayUTC.getUTCFullYear() && monthIndex < todayUTC.getUTCMonth());

      months.push({ name: MONTH_NAMES[monthIndex], year, weeks, isPast });
    }
  });

  return months;
};
