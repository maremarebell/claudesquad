// What the React pages share, in the build and in the browser: htm bound to
// React (markup in template strings, so no JSX and no bundler), and the small
// pieces more than one page uses.
import React, { useState, useEffect, useRef } from 'react';
import htm from 'htm';
import { nyToday } from './checkin.js';
import { REDUCED } from './squad.js';

export const html = htm.bind(React.createElement);
export const Fragment = React.Fragment;

// The build renders with its machine's date; in the browser it's New York's
// today, swapped in after the first render so that render matches the markup
// that came down. `live` says the swap has happened.
export function useToday(built) {
  const [today, setToday] = useState(null);
  useEffect(() => { setToday(nyToday()); }, []);
  return [today ?? built, today !== null];
}

// A number that ticks up to its new value instead of jumping.
export function useCountTo(to, start = to) {
  const [shown, setShown] = useState(start);
  const last = useRef(start);
  useEffect(() => {
    const from = last.current;
    last.current = to;
    if (REDUCED.matches || from === to || document.hidden) return void setShown(to);
    const t0 = performance.now();
    let frame;
    const step = now => {
      const k = Math.min(1, (now - t0) / 600);
      setShown(Math.round(from + (to - from) * (1 - (1 - k) ** 3)));
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    // frames stop in a background tab: make sure the real number lands anyway
    const settle = setTimeout(() => setShown(to), 700);
    return () => { cancelAnimationFrame(frame); clearTimeout(settle); };
  }, [to]);
  return shown;
}

// A GitHub picture; the pig stands in when there is none (or a typo'd username).
export function Avatar({ member, className = 'here__face' }) {
  const [pig, setPig] = useState(false);
  return html`<img
    src=${pig ? '/images/pig.svg' : member.avatar_url}
    alt=${member.name} title=${member.name}
    className=${pig ? `${className} is-pig` : className}
    loading="lazy"
    onError=${() => setPig(true)} />`;
}
