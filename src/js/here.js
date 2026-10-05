// Check-in: sign in with GitHub, then on a meetup day shake the phone. The pig
// does a rep for every shake, and the third one checks you in.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { SHAKES, nyToday, tally, shakeCounter } from './checkin.js';

const root = document.getElementById('here');
const cfg = JSON.parse(document.getElementById('here-config').textContent);
const POINTS_PER_MEETUP = 10;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');
const eventDates = new Set(cfg.events.map(e => e.date));
const eventOn = date => cfg.events.find(e => e.date === date);
const nextAfter = date => cfg.events.filter(e => e.date > date).sort((a, b) => a.date.localeCompare(b.date))[0];

const $ = sel => root.querySelector(sel);
const show = (sel, on = true) => { $(sel).hidden = !on; };
const say = msg => { $('#here-status').textContent = msg; };

// The logo pig, drawn as SVG cells. Rows 0-3 are the barbell, so a rep moves
// that group; the eyelids sit over the two eye holes for blinking.
const PIG = [
  '.##............................##.',
  '.##............................##.',
  '.##.....###.............##.....##.',
  '##################################',
  '.##....####............####....##.',
  '.##...####..............####...##.',
  '.##...###................###...##.',
  '......###................###......',
  '......###..############..###......',
  '......####.############.####......',
  '......#######.######.#######......',
  '......#######.######.#######......',
  '.......####################.......',
  '........##################........',
  '...........############...........',
  '...........############...........',
  '............#.#....#.#............',
  '............#.#....#.#............',
];

function drawPig() {
  const cells = bar => PIG.flatMap((row, r) => [...row].map((ch, c) =>
    ch === '#' && (r < 4) === bar ? `<rect x="${c}" y="${r}" width="1" height="1"/>` : '')).join('');
  $('#here-pig').innerHTML = `
    <svg viewBox="-1 -3 36 22" shape-rendering="crispEdges">
      <g class="pig__body">${cells(false)}
        <rect class="pig__lid" x="13" y="10" width="1" height="2"/>
        <rect class="pig__lid" x="20" y="10" width="1" height="2"/>
      </g>
      <g class="pig__bar">${cells(true)}</g>
    </svg>`;
}

drawPig();

const configured = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);
const db = configured ? createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
let user = null;
let checkingIn = false;

// Android buzzes through vibrate(). iOS Safari has no vibrate, but toggling a
// switch-style checkbox through its label plays the system haptic.
function buzz(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
  else $('.here__haptic').click();
}

function signIn() {
  db.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: location.href.split('#')[0] } });
}

async function saveMember() {
  const m = user.user_metadata;
  const { error } = await db.from('members').upsert({
    id: user.id,
    login: m.user_name,
    name: m.full_name || m.user_name,
    avatar_url: m.avatar_url,
  });
  if (error) throw new Error(`Could not save your profile: ${error.message}`);
}

function avatar(member) {
  const img = document.createElement('img');
  img.src = member.avatar_url;
  img.alt = member.name;
  img.title = member.name;
  img.className = 'here__face';
  return img;
}

// Redraws points, today's faces and the leaderboard. Returns how many meetups
// you have and whether you are already in today. Only meetup dates are read,
// so the row count grows with meetups, not with every check-in ever.
async function renderBoard() {
  const today = nyToday();
  const { data, error } = await db.from('checkins')
    .select('event_date, members(id, login, name, avatar_url)')
    .in('event_date', [...eventDates, today]);
  if (error) throw new Error(`Could not load attendance: ${error.message}`);

  const { meetups, present } = tally(data, eventDates, today);
  const mine = meetups.get(user.id)?.meetups || 0;
  $('#here-points').textContent = mine * POINTS_PER_MEETUP;
  $('#here-meetups').textContent = `${mine} ${mine === 1 ? 'meetup' : 'meetups'}`;

  $('#here-faces').replaceChildren(...present.map(avatar));
  show('#here-present', present.length > 0);

  $('#here-board').replaceChildren(...[...meetups.values()]
    .sort((a, b) => b.meetups - a.meetups)
    .map(({ member, meetups: n }) => {
      const li = document.createElement('li');
      if (member.id === user.id) li.className = 'is-you';
      li.append(avatar(member), Object.assign(document.createElement('span'), { textContent: member.name }),
        Object.assign(document.createElement('b'), { textContent: `${n * POINTS_PER_MEETUP} pts` }));
      return li;
    }));

  show('#here-locked', mine === 0);
  show('#here-unlocked', mine > 0);
  if (mine > 0) {
    const login = user.user_metadata.user_name;
    // JSON strings are valid YAML, so a name with a colon can't break the front matter
    const template = `---\nname: ${JSON.stringify(user.user_metadata.full_name || login)}\nrole:\nphoto:\n---\n\n`;
    $('#here-profile-link').href = `${cfg.repo}/new/main/src/profiles?filename=${encodeURIComponent(login)}.md&value=${encodeURIComponent(template)}`;
  }

  return { mine, inToday: present.some(m => m.id === user.id) };
}

// One rep from the pig: the bar goes up, the body squishes, a little wobble.
function rep(n) {
  if (REDUCED.matches) return;
  const ease = { duration: 380, easing: 'cubic-bezier(.3,0,.3,1)' };
  $('.pig__bar').animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-2px)' }, { transform: 'translateY(0)' }], ease);
  $('.pig__body').animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(.92)' }, { transform: 'scaleY(1)' }], ease);
  $('#here-pig').animate([{ transform: `rotate(${n % 2 ? -3 : 3}deg)` }, { transform: 'none' }], { duration: 300 });
}

// Pixels and pixel hearts fly up off the pig. Round-number meetups get more.
function burst(big) {
  if (REDUCED.matches) return;
  const host = $('.here__stage');
  const plus = Object.assign(document.createElement('span'), { className: 'here__plus', textContent: `+${POINTS_PER_MEETUP}` });
  host.append(plus);
  plus.animate([{ transform: 'translate(-50%, 0)', opacity: 1 }, { transform: 'translate(-50%, -80px)', opacity: 0 }],
    { duration: 1100, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => plus.remove();
  for (let i = 0; i < (big ? 40 : 18); i++) {
    const px = Object.assign(document.createElement('i'), { className: i % 3 ? 'here__px' : 'here__px here__px--heart' });
    host.append(px);
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;
    const d = 80 + Math.random() * (big ? 200 : 110);
    px.animate([
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(.4)`, opacity: 0 },
    ], { duration: 700 + Math.random() * 600, easing: 'cubic-bezier(.1,.7,.3,1)' }).onfinish = () => px.remove();
  }
}

async function checkIn() {
  if (checkingIn) return;
  checkingIn = true;
  const { error } = await db.from('checkins').insert({ user_id: user.id, event_date: nyToday() });
  if (error && error.code !== '23505') {
    checkingIn = false;
    return say(`Check-in failed: ${error.message}`);
  }
  buzz([60, 40, 120]);
  root.classList.remove('here--armed');
  root.classList.add('here--checked-in');
  $('#here-checkin-btn').hidden = true;
  let mine = 0;
  try {
    ({ mine } = await renderBoard());
  } catch (e) {
    return say(e.message);
  }
  if (error) return say("You're already checked in today.");
  say(`Meetup #${mine}. +${POINTS_PER_MEETUP} points.`);
  burst([5, 10, 25, 50, 100].includes(mine));
}

function tapInstead(msg) {
  const btn = $('#here-checkin-btn');
  say(msg);
  btn.textContent = 'Tap to check in';
  btn.disabled = false;
}

// The tap arms the sensors (iOS asks permission, and only inside the tap, so
// nothing is awaited before it). Then the pig waits for shakes. On a laptop
// the tap is the check-in. Once armed, a tap only works as the fallback.
async function arm() {
  const btn = $('#here-checkin-btn');
  if (root.classList.contains('here--armed')) return checkIn();
  root.classList.add('here--armed');
  const hasMotion = 'DeviceMotionEvent' in window && matchMedia('(pointer: coarse)').matches;
  if (!hasMotion) {
    rep(1);
    return checkIn();
  }
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    const state = await DeviceMotionEvent.requestPermission().catch(() => 'denied');
    if (state !== 'granted') return tapInstead('No motion access, so tap to check in instead.');
  }
  btn.textContent = 'Shake!';
  btn.disabled = true;
  say('Shake your phone to friendshipmog.');

  const pips = [...root.querySelectorAll('.here__pips i')];
  const step = shakeCounter();
  let heard = false;
  const onMotion = e => {
    heard = true;
    const n = step(e.timeStamp, e.accelerationIncludingGravity);
    if (!n) return;
    buzz(25);
    rep(n);
    pips.forEach((p, i) => p.classList.toggle('on', i < n));
    if (n >= SHAKES) {
      removeEventListener('devicemotion', onMotion);
      checkIn();
    }
  };
  addEventListener('devicemotion', onMotion);
  // sensors blocked in site settings never send an event: hand the tap back
  setTimeout(() => {
    if (!heard && !checkingIn) tapInstead("Your phone isn't sending motion, so tap to check in instead.");
  }, 3000);
}

async function render(session) {
  user = session?.user || null;
  show('#here-signin', !user);
  show('#here-app', !!user);
  $('#here-title').textContent = user ? 'Check in' : 'Log in';
  if (!user) return say('');

  $('#here-name').textContent = user.user_metadata.full_name || user.user_metadata.user_name;
  try {
    await saveMember();
    const { inToday } = await renderBoard();
    const today = nyToday();
    const event = eventOn(today);
    const next = nextAfter(today);
    show('#here-checkin', !!event && !inToday);
    if (inToday) {
      root.classList.add('here--checked-in');
      say(`You're checked in for ${event ? event.title : 'today'}.`);
    } else if (event) {
      say(`${event.title} is today.`);
    } else {
      say(next ? `No meetup today. Next one is ${next.title} on ${next.date}.` : 'No meetup on the calendar.');
    }
  } catch (e) {
    say(e.message);
  }
}

if (!configured) {
  say("Check-in isn't open yet.");
  console.warn('Check-in is off: supabaseUrl and supabaseAnonKey are empty in src/_data/site.json.');
} else {
  $('#here-signin-btn').onclick = signIn;
  $('#here-signout').onclick = () => db.auth.signOut();
  $('#here-checkin-btn').onclick = arm;

  // The client fires this on every token refresh; only re-render when the user
  // changes. Signed out is a real first state, so `last` starts on neither.
  let last = 'none yet';
  db.auth.onAuthStateChange((_event, session) => {
    const id = session?.user?.id ?? null;
    if (id === last) return;
    last = id;
    render(session);
  });

  // live: a new face appears as soon as someone else checks in. Inserts land
  // close together at a meetup, so they share one refetch.
  let refetch;
  db.channel('checkins')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'checkins' }, () => {
      clearTimeout(refetch);
      refetch = setTimeout(() => user && renderBoard().catch(e => say(e.message)), 800);
    })
    .subscribe();
}
