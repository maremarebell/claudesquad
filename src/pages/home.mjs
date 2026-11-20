// The homepage: the 3D hero (hero.js, raw three.js) with the next meetup over
// it, the intro, the leaderboard and the photos. three imports its core, so
// both are preloaded: they download in parallel instead of one after the other.
import { html } from '../js/ui.js';
import { Layout, Island, IMPORTS } from '../_includes/layout.mjs';
import { Meetup, pickNext } from '../js/meetup.js';
import { Board } from '../js/board.js';
import { LastSession } from '../js/lastSession.js';
import { Gallery } from '../js/gallery.js';

export const data = { permalink: '/', title: 'Home' };

export default function Home({ site, js, url, title, today, events, prRepos, pastEvents }) {
  const last = pastEvents[0];
  const dates = pastEvents.map(e => e.date).join(',');
  return html`<${Layout} site=${site} js=${js} url=${url} title=${title}>
    <div className="hero">
      <h1 className="hero__title"><span>Claude</span><span>Squad</span></h1>
      <img src="/images/logo-840.png" width="840" height="600" alt="Make No Mistakes" className="hero__logo" />
      <div className="hero__hud">
        <span className="hero__tag">NYC</span>
        <${Island} name="meetup" component=${Meetup} props=${{ events, today }} className="hero__meetup ticks" hidden=${!pickNext(events, today)} />
        <p className="hero__tagline">Make No Mistakes.</p>
      </div>
    </div>
    <link rel="modulepreload" href=${IMPORTS.three} crossOrigin="" />
    <link rel="modulepreload" href=${IMPORTS.three.replace('three.module', 'three.core')} crossOrigin="" />
    <script type="module" src=${`${js}/hero.js`} />

    <div className="content">
      <h2>What is Claude Squad?</h2>
      <p>We are <mark>NYC's most elite fitness and computing club</mark>. <mark>We set PRs while we push PRs.</mark> We burn tokens while we burn calories. We <mark>friendshipmog and tokenmaxx</mark>.</p>
      <p>More specifically, we meet up ~every other week to prompt, lift, and friendshipmog everyone else in the area in matching tanks. When the weather is nice, we meet outside for calisthenics, otherwise we meet at the weights in Vital.</p>
      <p><mark>Everyone is welcome</mark>, whatever your skill level with working out and/or AI. It's all better with a squad!</p>
    </div>

    ${last && html`
      <div className="content">
        <h2>Last Session</h2>
        <${Island} name="lastSession" component=${LastSession} props=${{ date: last.date, title: last.title, time: last.time, place: last.place }} className="last-session" />
      </div>`}

    <${Island} name="board" component=${Board} props=${{ prRepos, events }} as="section" className="content board" id="board" />

    <div className="gallery">
      <h2>Photos</h2>
      <${Island} name="gallery" component=${Gallery} props=${{ dates, lastDate: last?.date }} />
    </div>
  <//>`;
}
