// The calendar: the months, built from events.json, and the grid that shows
// them. Today and the finished months come from the build machine's date on
// the way down and New York's date in the browser (a build can be days old).
import { useState, useMemo } from 'react';
import { html, useToday } from './ui.js';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = n => String(n).padStart(2, '0');
const quarterKey = (year, monthIndex) => `${year}-${Math.floor(monthIndex / 3)}`;
const eventTooltip = event => (event.partiful
  ? `${event.title}: RSVP on Partiful`
  : `${event.title}: Partiful TBA, ask in the WhatsApp group`);

// One 3-month block per quarter that has an event in it, in order. It does NOT
// advance with today's date: the next quarter appears once an event is added
// to it. Falls back to today's quarter when there are no events. `today` is a
// YYYY-MM-DD string; it marks the day and greys out the months before it.
export function buildMonths(events, today) {
  const [thisYear, thisMonth] = today.split('-').map(Number);
  const eventsByDate = {};
  const quarters = new Set();
  for (const e of events) {
    (eventsByDate[e.date] ||= []).push({ ...e, tooltip: eventTooltip(e) });
    const [y, m] = e.date.split('-').map(Number);
    quarters.add(quarterKey(y, m - 1));
  }
  if (!quarters.size) quarters.add(quarterKey(thisYear, thisMonth - 1));

  const months = [];
  const sorted = [...quarters].map(k => k.split('-').map(Number)).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (const [year, q] of sorted) {
    for (let monthIndex = q * 3; monthIndex < q * 3 + 3; monthIndex++) {
      const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
      const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
      const days = Array(firstWeekday).fill(null);
      for (let d = 1; d <= daysInMonth; d++) {
        const date = `${year}-${pad(monthIndex + 1)}-${pad(d)}`;
        days.push({ date, day: d, isToday: date === today, events: eventsByDate[date] || [] });
      }
      while (days.length % 7) days.push(null);
      const weeks = [];
      for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
      const isPast = year < thisYear || (year === thisYear && monthIndex < thisMonth - 1);
      months.push({ name: MONTH_NAMES[monthIndex], year, weeks, isPast });
    }
  }
  return months;
}

function Day({ day, open, onToggle }) {
  if (!day) return html`<div className="calendar__day calendar__day--empty" />`;
  const today = day.isToday ? ' calendar__day--today' : '';
  const [event] = day.events;
  if (!event) {
    return html`<div className=${`calendar__day${today}`} data-date=${day.date}><span className="calendar__day-number">${day.day}</span></div>`;
  }
  const linked = Boolean(event.partiful);
  // Days without a Partiful link yet: tap/click toggles a tooltip instead of navigating.
  const toggle = e => { e.preventDefault(); e.stopPropagation(); onToggle(day.date); };
  return html`
    <a href=${event.partiful || '#'} target=${linked ? '_blank' : undefined} rel=${linked ? 'noopener' : undefined}
       data-date=${day.date} data-event-name=${event.tooltip}
       className=${`calendar__day calendar__day--event${today}${linked ? '' : ' calendar__day--no-link'}`}
       style=${{ background: event.color || 'var(--accent)' }}
       onClick=${linked ? undefined : toggle}>
      <span className="calendar__day-number">${day.day}</span>
      ${event.emoji && html`<span className="calendar__day-emoji">${event.emoji}</span>`}
      ${open && html`<div className="calendar__event-tooltip-click">${event.tooltip}</div>`}
    </a>`;
}

export function Calendar({ events, today: built }) {
  const [today] = useToday(built);
  const [open, setOpen] = useState(null);
  const months = useMemo(() => buildMonths(events, today), [events, today]);
  const toggle = date => setOpen(o => (o === date ? null : date));
  return months.map(month => html`
    <div key=${`${month.year}-${month.name}`} className=${`calendar__month-block${month.isPast ? ' calendar__month-block--past' : ''}`}>
      <div className="calendar__month-header">
        <span className="calendar__month-name">${month.name}</span>
        <span className="calendar__month-year">${month.year}</span>
      </div>
      <table className="calendar__table">
        <thead><tr>${DAYS.map(d => html`<th key=${d} className="calendar__th">${d}</th>`)}</tr></thead>
        <tbody>
          ${month.weeks.map((week, w) => html`
            <tr key=${w}>${week.map((day, i) => html`<td key=${i}><${Day} day=${day} open=${Boolean(day) && open === day.date} onToggle=${toggle} /></td>`)}</tr>`)}
        </tbody>
      </table>
    </div>`);
}
