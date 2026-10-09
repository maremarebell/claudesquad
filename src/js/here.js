// Check-in: join with your name and GitHub username (or Sign in with GitHub
// once it's set up), then on a meetup day shake your phone at the same time
// as someone next to you, like Bump. The pig does a rep per shake;
// the third sends a bump, and two bumps close in time and place check both in.
import { SHAKES, POINTS, nyToday, tally, shakeCounter, leaderboard } from './checkin.js';
import { PIG } from './pig.js';
import { collide } from './collide.js';
import { api as call, token as store, SignedOut, mergedPRs, plural, countTo, avatar, REDUCED } from './squad.js';

const root = document.getElementById('here');
const cfg = JSON.parse(document.getElementById('here-config').textContent);
const eventDates = new Set(cfg.events.map(e => e.date));
const eventOn = date => cfg.events.find(e => e.date === date);
const nextAfter = date => cfg.events.filter(e => e.date > date).sort((a, b) => a.date.localeCompare(b.date))[0];

const $ = sel => root.querySelector(sel);
const show = (sel, on = true) => { $(sel).hidden = !on; };
const say = msg => { $('#here-status').textContent = msg; };

// The logo pig, drawn as SVG cells; the eyelids sit over the two eye holes
// for blinking.

function drawPig() {
  const cells = PIG.flatMap((row, r) => [...row].map((ch, c) =>
    ch === '#' ? `<rect x="${c}" y="${r}" width="1" height="1"/>` : '')).join('');
  $('#here-pig').innerHTML = `
    <svg viewBox="-1 -3 36 22" shape-rendering="crispEdges">
      <g class="pig__z"><rect x="27" y="-3" width="2" height="1"/><rect x="28" y="-2" width="1" height="1"/><rect x="27" y="-1" width="2" height="1"/></g>
      <g class="pig__z pig__z--2"><rect x="30" y="-6" width="3" height="1"/><rect x="31" y="-5" width="1" height="1"/><rect x="30" y="-4" width="3" height="1"/></g>
      ${cells}
      <rect class="pig__lid" x="13" y="10" width="1" height="2"/>
      <rect class="pig__lid" x="20" y="10" width="1" height="2"/>
    </svg>`;
}

drawPig();

// The 3D pig takes over the stage where WebGL starts and motion is welcome;
// otherwise the flat pig above stays. Its mood follows the page's state.
let pig3d = null;
const mood = () => pig3d?.mood({
  sleeping: root.classList.contains('here--sleeping'),
  happy: root.classList.contains('here--checked-in'),
});
if (!REDUCED.matches) {
  import('./pig3d.js').then(({ mountPig }) => {
    pig3d = mountPig($('.here__stage'));
    if (!pig3d) return;
    root.classList.add('here--3d');
    mood();
    new MutationObserver(mood).observe(root, { attributes: true, attributeFilter: ['class'] });
  }).catch(() => {});
}

// A signed-out answer from the server takes the page back to the join form.
async function api(path, body) {
  try {
    return await call(path, body);
  } catch (e) {
    if (e instanceof SignedOut) render(null);
    throw e;
  }
}

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

async function join(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('button');
  btn.disabled = true;
  try {
    const { token, member } = await api('/api/join', {
      name: form.name.value,
      github: form.github.value.trim().replace(/^@/, ''),
    });
    store.set(token);
    buzz(30);
    await render(member);
    say(`Welcome, ${member.name}. ${$('#here-status').textContent}`);
  } catch (err) {
    say(err.message);
  } finally {
    btn.disabled = false;
  }
}

// Redraws points, today's faces and the leaderboard. Returns how many meetups
// you have and whether you are already in today. Only meetup dates are read,
// so the row count grows with meetups, not with every check-in ever.
async function renderBoard() {
  const today = nyToday();
  const [data, members, prs] = await Promise.all([
    api(`/api/board?dates=${[...eventDates, today].join(',')}`),
    api('/api/members'),
    mergedPRs(cfg.prRepos).catch(() => new Map()),
  ]);

  const { meetups, present } = tally(data, eventDates, today);
  const rows = leaderboard(members, meetups, prs);
  const me = rows.find(r => r.member.id === user.id) || { meetups: 0, prs: 0, points: 0 };
  const mine = me.meetups;
  countTo($('#here-points'), me.points);
  $('#here-tally').textContent = `${plural(me.meetups, 'meetup')} · ${plural(me.prs, 'PR')}`;

  $('#here-faces').replaceChildren(...present.map(avatar));
  show('#here-present', present.length > 0);

  $('#here-board').replaceChildren(...rows.map(({ member, points }) => {
    const li = document.createElement('li');
    if (member.id === user.id) li.className = 'is-you';
    li.append(avatar(member), Object.assign(document.createElement('span'), { textContent: member.name }),
      Object.assign(document.createElement('b'), { textContent: plural(points, 'pt') }));
    return li;
  }));

  show('#here-locked', mine === 0);
  show('#here-unlocked', mine > 0);
  if (mine > 0) {
    const login = user.login;
    // JSON strings are valid YAML, so a name with a colon can't break the front matter
    const template = `---\nname: ${JSON.stringify(user.name || login)}\nrole:\nphoto:\n---\n\n`;
    const href = `${cfg.repo}/new/${cfg.branch}/src/profiles?filename=${encodeURIComponent(login)}.md&value=${encodeURIComponent(template)}`;
    $('#here-profile-link').href = href;
    $('#here-welcome-link').href = href;
  }

  return { mine, inToday: present.some(m => m.id === user.id) };
}

// One rep: the whole pig hops and squishes on landing, tipping a little to
// alternate sides. It moves as one piece, so the barbell never comes apart.
function rep(n) {
  if (REDUCED.matches) return;
  pig3d?.rep(n);
  const tip = n % 2 ? -4 : 4;
  $('#here-pig').animate([
    { transform: 'translateY(0) scale(1, 1)' },
    { transform: `translateY(-14px) rotate(${tip}deg) scale(.96, 1.04)`, offset: 0.4 },
    { transform: 'translateY(0) scale(1.06, .92)', offset: 0.75 },
    { transform: 'translateY(0) scale(1, 1)' },
  ], { duration: 420, easing: 'cubic-bezier(.3,0,.3,1)' });
}

// Pixels and pixel hearts fly up off the pig. Round-number meetups get more.
function burst(big) {
  if (REDUCED.matches) return;
  pig3d?.celebrate(big);
  const host = $('.here__stage');
  const plus = Object.assign(document.createElement('span'), { className: 'here__plus', textContent: `+${POINTS.meetup}` });
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

// Where the phone is. Asked at the tap to warm it up, then again for every
// bump (a fix up to 30s old is reused), so walking to the gym with the page
// open doesn't leave a stale location behind. Matches are within 250m.
function locate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("This browser can't share a location."));
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
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
// the last 20 seconds, send it again every 2s for 20s. Re-sending (rather than
// just watching for a check-in) is what lets someone who's already in see
// that their newcomer arrived, and it catches a partner who bumped a moment
// later. If the user changes mid-wait, the loop just stops.
async function bump() {
  if (checkingIn || !user) return;
  const me = user;
  checkingIn = true;
  disarm();
  root.classList.add('here--waiting');
  say('Bumping…');
  const wasIn = root.classList.contains('here--checked-in');
  try {
    for (let i = 0; i <= 10; i++) {
      if (i) await sleep(2000);
      if (user !== me) return;
      const at = await locate();
      const data = await api('/api/bump', { lat: at.lat, lng: at.lng });
      if (user !== me) return;
      if (data.matched) return landed(data.with, wasIn, data.members);
      if (!i) say('Now get someone next to you to shake too…');
    }
    rearm('Nobody shook back. Shake together, at the same time.');
  } catch (e) {
    if (user === me) rearm(e.message);
  }
}

// Matched. Celebrate, and on someone's first meetup put the GitHub link
// right there, because that's the moment they're in the squad.
async function landed(names, wasIn, members) {
  const me = user;
  // the collision plays while the board refreshes underneath it
  collide({
    me: { name: me.name, avatar_url: me.avatar_url },
    them: members?.length ? members : (names || []).map(name => ({ name, avatar_url: '/images/pig.svg' })),
    reduced: REDUCED.matches,
    shake: root,
  });
  // two heavy hits, timed to land with the faces
  setTimeout(() => buzz([90, 70, 160]), 420);
  root.classList.remove('here--waiting', 'here--armed');
  root.classList.add('here--checked-in');
  if (!wasIn) $('#here-checkin-btn').hidden = true;
  const who = names?.length ? ` with ${names.join(', ')}` : '';
  let mine = 0;
  try {
    ({ mine } = await renderBoard());
  } catch (e) {
    checkingIn = false;
    return say(e.message);
  }
  // checkingIn stays set until here, so a tap during the refresh can't re-arm
  checkingIn = false;
  if (user !== me) return;
  if (wasIn) {
    say(`Bumped${who}. They're in.`);
    burst(false);
    root.classList.add('here--armed');
    return listen();
  }
  say(`Bumped${who}. Meetup #${mine}, +${plural(POINTS.meetup, 'point')}.`);
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
  if (checkingIn) return;
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

async function render(member) {
  user = member || null;
  // lets the homepage leaderboard mark your row
  try { user ? localStorage.setItem('squad-me', JSON.stringify(user.login)) : localStorage.removeItem('squad-me'); } catch {}
  disarm();
  checkingIn = false;
  root.classList.remove('here--armed', 'here--checked-in', 'here--waiting', 'here--motion', 'here--sleeping');
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

  $('#here-name').textContent = user.name || user.login;
  try {
    const { inToday } = await renderBoard();
    const today = nyToday();
    const event = eventOn(today);
    const next = nextAfter(today);
    // the pig is always out: bumping on a meetup day (already in? bump a
    // newcomer in), asleep on the other days
    show('#here-checkin', true);
    root.classList.toggle('here--sleeping', !event);
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

$('#here-join').onsubmit = join;
$('#here-signout').onclick = async () => {
  await api('/api/signout', {}).catch(() => {});
  store.set(null);
  render(null);
};
$('#here-checkin-btn').onclick = arm;

// Coming back from Sign in with GitHub: the server hands the session over in
// the URL fragment, which never reaches any server log.
const handed = new URLSearchParams(location.hash.slice(1)).get('token');
if (handed) {
  store.set(handed);
  history.replaceState(null, '', location.pathname);
}

// The free server sleeps when idle and takes a while to wake; this wakes it
// as the page opens, so the shake later doesn't wait on it.
say('Waking the check-in server…');
api('/api/config').then(({ github }) => {
  show('#here-github', github);
  if (!store.get()) return render(null);
  return api('/api/me').then(({ member }) => render(member));
}).catch(() => say("Check-in isn't open yet."));

// Install as an app. Chrome and Android hand over a prompt to show on a tap;
// iPhone has none, so it gets the two taps written out. Hidden once installed.
const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
if (!installed) {
  let prompt;
  addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    prompt = e;
    show('#here-install');
    show('#here-install-btn');
  });
  $('#here-install-btn').onclick = async () => {
    prompt?.prompt();
    if ((await prompt?.userChoice)?.outcome === 'accepted') show('#here-install', false);
  };
  if (/iP(hone|ad|od)/.test(navigator.userAgent)) {
    show('#here-install');
    show('#here-install-ios');
  }
  addEventListener('appinstalled', () => show('#here-install', false));
}

// Faces appear as other people check in.
setInterval(() => {
  if (user && !document.hidden && !checkingIn) renderBoard().catch(() => {});
}, 15000);
