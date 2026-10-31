import { html } from '../js/ui.js';
import { Layout, Island } from '../_includes/layout.mjs';
import { Calendar } from '../js/calendar.js';

export const data = { permalink: '/calendar/', title: '2026 Calendar' };

export default function CalendarPage({ site, js, url, title, today, events }) {
  return html`<${Layout} site=${site} js=${js} url=${url} title=${title}>
    <div className="calendar">
      <header className="calendar__header">
        <h1 className="calendar__title page-title">2026</h1>
        <span className="calendar__subtitle page-subtitle">Calendar</span>
      </header>
      <${Island} name="calendar" component=${Calendar} props=${{ events, today }} className="calendar__grid" />
    </div>
  <//>`;
}
