// Check-in: sign in with GitHub, then on a meetup day shake your phone at the
// same time as someone next to you, like Bump. The pig does a rep per shake;
// the third sends a bump, and two bumps close in time and place check both in.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { SHAKES, nyToday, tally, shakeCounter, userChanges } from './checkin.js';

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
// the live shake listener and its fallback timer, so sign-out can stop them
let disarm = () => {};

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
    const href = `${cfg.repo}/new/main/src/profiles?filename=${encodeURIComponent(login)}.md&value=${encodeURIComponent(template)}`;
    $('#here-profile-link').href = href;
    $('#here-welcome-link').href = href;
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

// Where the phone is, asked for at the tap so it's ready by the third shake.
// The bump only matches people within 250m of each other.
let fix = null;
function locate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("This browser can't share a location."));
    navigator.geolocation.getCurrentPosition(
      pos => resolve(fix = { lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err => reject(new Error(err.code === err.PERMISSION_DENIED
        ? 'Location is off. A bump needs it to know you are with the squad.'
        : "Couldn't get a location. Step outside the weights room and try again.")),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Back to waiting for shakes, after a miss or an error.
function rearm(msg) {
  checkingIn = false;
  root.classList.remove('here--waiting');
  root.querySelectorAll('.here__pips i').forEach(p => p.classList.remove('on'));
  say(msg);
  listen();
}

// The third shake lands here. Send the bump; if nobody nearby has shaken in
// the last 20 seconds, wait up to 20 more for someone whose bump checks us in.
async function bump() {
  if (checkingIn || !user) return;
  checkingIn = true;
  disarm();
  root.classList.add('here--waiting');
  say('Bumping…');
  const wasIn = root.classList.contains('here--checked-in');
  try {
    const at = fix || await locate();
    const { data, error } = await db.rpc('bump', { at_lat: at.lat, at_lng: at.lng });
    if (error) throw new Error(error.message);
    if (data.matched) return landed(data.with, wasIn);
    say('Now get someone next to you to shake too…');
    for (let i = 0; i < 10 && user; i++) {
      await sleep(2000);
      const { data: row } = await db.from('checkins').select('event_date')
        .eq('user_id', user.id).eq('event_date', nyToday()).maybeSingle();
      if (row && !wasIn) return landed(null, wasIn);
    }
    rearm('Nobody shook back. Shake together, at the same time.');
  } catch (e) {
    rearm(e.message);
  }
}

// Matched. Celebrate, and on someone's first meetup put the GitHub link
// right there, because that's the moment they're in the squad.
async function landed(names, wasIn) {
  buzz([60, 40, 120]);
  root.classList.remove('here--waiting', 'here--armed');
  root.classList.add('here--checked-in');
  checkingIn = false;
  const who = names?.length ? ` with ${names.join(', ')}` : '';
  let mine = 0;
  try {
    ({ mine } = await renderBoard());
  } catch (e) {
    return say(e.message);
  }
  if (wasIn) {
    say(`Bumped${who}. They're in.`);
    burst(false);
    return listen();
  }
  $('#here-checkin-btn').hidden = true;
  say(`Bumped${who}. Meetup #${mine}, +${POINTS_PER_MEETUP} points.`);
  burst([1, 5, 10, 25, 50, 100].includes(mine));
  show('#here-welcome', mine === 1);
}

function tapInstead(msg) {
  const btn = $('#here-checkin-btn');
  say(msg);
  btn.textContent = 'Tap to bump';
  btn.disabled = false;
}

// Listen for three shakes, then bump.
function listen() {
  const btn = $('#here-checkin-btn');
  btn.hidden = false;
  if (!root.classList.contains('here--motion')) {
    btn.textContent = 'Tap to bump';
    btn.disabled = false;
    return;
  }
  btn.textContent = 'Shake!';
  btn.disabled = true;
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
    if (n >= SHAKES) bump();
  };
  addEventListener('devicemotion', onMotion);
  // sensors blocked in site settings never send an event: hand the tap back
  const silent = setTimeout(() => {
    if (heard || checkingIn) return;
    root.classList.remove('here--motion');
    tapInstead("Your phone isn't sending motion, so tap at the same time as someone next to you.");
  }, 3000);
  disarm = () => {
    removeEventListener('devicemotion', onMotion);
    clearTimeout(silent);
  };
}

// The tap arms the sensors (iOS asks permission, and only inside the tap, so
// nothing is awaited before it) and starts finding the location. Once armed,
// a tap is the fallback for phones that won't shake.
async function arm() {
  if (root.classList.contains('here--armed')) {
    rep(1);
    return bump();
  }
  root.classList.add('here--armed');
  const hasMotion = 'DeviceMotionEvent' in window && matchMedia('(pointer: coarse)').matches;
  let motionOk = hasMotion;
  if (hasMotion && typeof DeviceMotionEvent.requestPermission === 'function') {
    motionOk = await DeviceMotionEvent.requestPermission().catch(() => 'denied') === 'granted';
  }
  locate().catch(e => say(e.message));
  root.classList.toggle('here--motion', motionOk);
  say(motionOk ? 'Shake your phone at the same time as someone next to you.'
    : 'Tap at the same time as someone next to you.');
  listen();
}

async function render(session) {
  user = session?.user || null;
  disarm();
  checkingIn = false;
  root.classList.remove('here--armed', 'here--checked-in', 'here--waiting', 'here--motion');
  const btn = $('#here-checkin-btn');
  btn.hidden = false;
  btn.disabled = false;
  btn.innerHTML = 'Friendship&shy;mog';
  root.querySelectorAll('.here__pips i').forEach(p => p.classList.remove('on'));
  show('#here-welcome', false);
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
    // already in? the pig stays out, so you can bump a newcomer in
    show('#here-checkin', !!event);
    if (inToday) {
      root.classList.add('here--checked-in');
      btn.textContent = 'Bump someone in';
      say(`You're in for ${event ? event.title : 'today'}.`);
    } else if (event) {
      say(`${event.title} is today. Bump someone to check in.`);
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

  // fires on every token refresh too; only a different user re-renders
  const changed = userChanges();
  db.auth.onAuthStateChange((_event, session) => {
    if (changed(session)) render(session);
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
