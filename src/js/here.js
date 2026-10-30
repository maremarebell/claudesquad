// Check-in, a React app inside the 11ty page. Join with your name and GitHub
// username (or Sign in with GitHub once it's set up), then on a meetup day
// shake your phone at the same time as someone next to you, like Bump. The
// pig does a rep per shake; the third sends a bump, and bumps close in time
// and place check everyone in. React, htm and the renderer come from the
// importmap in here.njk; the 3D pig (pig3d.js, React Three Fiber) loads once
// someone is signed in, and the flat SVG pig stays where WebGL won't start or
// motion is reduced.
//
// What the screen shows is React state; the bump itself (shake listener,
// location, the re-sending loop) is plain async code that reads refs, so a
// loop started by one tap can't be fooled by a render in between.
import React, { useState, useEffect, useRef, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import htm from 'htm';
import { SHAKES, POINTS, nyToday, tally, shakeCounter, readShakeProfile, leaderboard, meetupOn, nextMeetup } from './checkin.js';
import { plural, githubLogin, profileLink } from './format.js';
import { PIG } from './pig.js';
import { collide } from './collide.js';
import { API, api as call, token as store, SignedOut, mergedPRs, REDUCED } from './squad.js';

const html = htm.bind(React.createElement);
const cfg = JSON.parse(document.getElementById('here-config').textContent);
const eventDates = new Set(cfg.events.map(e => e.date));
const Pig3D = React.lazy(() => import('./pig3d.js').then(m => ({ default: m.Pig3D })));

const MOG = 'Friendship­mog';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const and = list => new Intl.ListFormat('en', { type: 'conjunction' }).format(list);

// Is there a WebGL context to be had? Asked before the 3D pig mounts, because
// R3F reports a refused context as a rejection nothing else can catch.
function webglWorks() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

// iPhone offers "Undo Typing" when you shake a page you typed into, which
// would pop up over every bump. Typing only happens on the way in, so signing
// in starts the page over: a fresh page has nothing to undo.
const WELCOME = 'squad-welcome';
function signedIn(token, welcome) {
  store.set(token);
  try { welcome ? sessionStorage.setItem(WELCOME, welcome) : sessionStorage.removeItem(WELCOME); } catch {}
  location.replace(location.pathname);
}

const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
// a GitHub sign-in the home-screen app is waiting to collect
const PENDING = 'squad-github-nonce';
// what this phone has learned about how its owner shakes (see shakeCounter)
const SHAKE = 'squad-shake';
// after the first match the group stays open this long with nobody new
const GROUP_MS = 6000;
const GROUP_MAX_MS = 40000;

// Where the phone is. Asked at the tap to warm it up, then again for every
// bump (a fix up to 30s old is reused), so walking to the gym with the page
// open doesn't leave a stale location behind. Matches are within 250m.
// Indoors GPS often never gets a fix, so a timeout falls back to the phone's
// rough location (wifi and cell towers), which is still well inside 250m.
const where = opts => new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
  pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }), reject, opts));

async function locate() {
  if (!navigator.geolocation) throw new Error("This browser can't share a location.");
  try {
    return await where({ enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
  } catch (err) {
    if (err.code === err.PERMISSION_DENIED) throw new Error('Location is off. A bump needs it to know you are with the squad.');
    try {
      return await where({ enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
    } catch {
      throw new Error("Couldn't get a location. Step outside the weights room and try again.");
    }
  }
}

// A motion reading the shake counter can use. Some phones leave the
// gravity-included axes empty but fill in plain acceleration: that one is
// already gravity-free, so its size is handed over as the jolt.
function reading(e) {
  const g = e.accelerationIncludingGravity;
  if (g && [g.x, g.y, g.z].every(Number.isFinite)) return g;
  const a = e.acceleration;
  if (a && [a.x, a.y, a.z].every(Number.isFinite)) return { x: 0, y: 0, z: 9.81 + Math.hypot(a.x, a.y, a.z) };
  return null;
}

// A number that ticks up to its new value instead of jumping.
function useCountTo(to) {
  const [shown, setShown] = useState(to);
  const from = useRef(to);
  useEffect(() => {
    const start = from.current;
    from.current = to;
    if (REDUCED.matches || start === to || document.hidden) return void setShown(to);
    const t0 = performance.now();
    let frame;
    const step = now => {
      const k = Math.min(1, (now - t0) / 600);
      setShown(Math.round(start + (to - start) * (1 - (1 - k) ** 3)));
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
function Avatar({ member, className = 'here__face' }) {
  const [pig, setPig] = useState(false);
  return html`<img
    src=${pig ? '/images/pig.svg' : member.avatar_url}
    alt=${member.name} title=${member.name}
    className=${pig ? `${className} is-pig` : className}
    loading="lazy"
    onError=${() => setPig(true)} />`;
}

// The logo pig, drawn as SVG cells; the eyelids sit over the two eye holes
// for blinking, the Zs show when it's asleep.
function PigSVG() {
  return html`
    <svg viewBox="-1 -3 36 22" shapeRendering="crispEdges">
      <g className="pig__z"><rect x="27" y="-3" width="1" height="1" /><rect x="28" y="-3" width="1" height="1" /><rect x="28" y="-2" width="1" height="1" /><rect x="27" y="-1" width="1" height="1" /><rect x="28" y="-1" width="1" height="1" /></g>
      <g className="pig__z pig__z--2"><rect x="30" y="-6" width="3" height="1" /><rect x="31" y="-5" width="1" height="1" /><rect x="30" y="-4" width="3" height="1" /></g>
      ${PIG.flatMap((row, r) => [...row].map((ch, c) =>
        ch === '#' ? html`<rect key=${`${r}-${c}`} x=${c} y=${r} width="1" height="1" />` : null))}
      <rect className="pig__lid" x="13" y="10" width="1" height="2" />
      <rect className="pig__lid" x="20" y="10" width="1" height="2" />
    </svg>`;
}

function App() {
  const [github, setGithub] = useState(false);
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('Loading…');
  // the page's states, also its root classes (the CSS and motion-debug read them)
  const [flags, setFlags] = useState({ armed: false, waiting: false, checkedIn: false, motion: false, sleeping: false });
  const [checkin, setCheckin] = useState(false);
  const [btn, setBtn] = useState({ label: MOG, hidden: false });
  const [pips, setPips] = useState(0);
  const [board, setBoard] = useState(null);
  const [welcome, setWelcome] = useState(false);
  const [code, setCode] = useState(null);
  const [install, setInstall] = useState({ shown: false, prompt: false, ios: false });
  const [debug, setDebug] = useState(() => { try { return localStorage.getItem('squad-debug') === '1'; } catch { return false; } });
  const [gl, setGl] = useState(() => !REDUCED.matches && webglWorks());
  const [is3d, setIs3d] = useState(false);
  const [hop, setHop] = useState(null);
  const [celebrate, setCelebrate] = useState(null);
  const points = useCountTo(board?.me.points ?? 0);

  const root = useRef();
  const stage = useRef();
  const pigEl = useRef();
  const haptic = useRef();
  // what the async bump code reads, kept in step with the state above
  const userRef = useRef(null);
  const flagsRef = useRef(flags);
  const checkingIn = useRef(false);
  // the live shake listener and its fallback timer, so sign-out can stop them
  const disarm = useRef(() => {});
  const shakeProfile = useRef(null);
  const installPrompt = useRef(null);
  const pending = useRef(null);
  const polling = useRef(null);

  const say = setStatus;
  const setFlag = patch => {
    flagsRef.current = { ...flagsRef.current, ...patch };
    setFlags(flagsRef.current);
  };

  // Android buzzes through vibrate(). iOS Safari has no vibrate, but toggling a
  // switch-style checkbox through its label plays the system haptic.
  const buzz = pattern => {
    if (navigator.vibrate) navigator.vibrate(pattern);
    else haptic.current?.click();
  };

  // A signed-out answer from the server takes the page back to the join form.
  async function api(path, body) {
    try {
      return await call(path, body);
    } catch (e) {
      if (e instanceof SignedOut) render(null);
      throw e;
    }
  }

  if (!shakeProfile.current) {
    try { shakeProfile.current = readShakeProfile(localStorage.getItem(SHAKE)); } catch { shakeProfile.current = readShakeProfile(null); }
  }
  const saveShake = () => { try { localStorage.setItem(SHAKE, JSON.stringify(shakeProfile.current)); } catch {} };

  async function join(e) {
    e.preventDefault();
    const form = e.target;
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const { token, member } = await api('/api/join', { name: form.name.value, github: githubLogin(form.github.value) });
      buzz(30);
      signedIn(token, `Welcome, ${member.name}.`);
    } catch (err) {
      say(err.message);
    } finally {
      button.disabled = false;
    }
  }

  // A code from another phone where you're signed in. Also the way into the
  // home-screen app on iPhone, which doesn't share storage with Safari.
  async function claim(e) {
    e.preventDefault();
    const form = e.target;
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const { token } = await api('/api/auth/claim', { code: form.code.value });
      buzz(30);
      signedIn(token);
    } catch (err) {
      say(err.message);
    } finally {
      button.disabled = false;
    }
  }

  async function showCode() {
    try {
      const { code: c } = await api('/api/auth/code', {});
      setCode(c);
    } catch (e) {
      say(e.message);
    }
  }

  // Sign in with GitHub from the home-screen app. On iPhone, GitHub's page
  // opens in Safari or an in-app browser whose storage isn't the app's, so the
  // token in the redirect never reaches the app. Instead the app sends a random
  // nonce along and collects the session with it once GitHub is done. The nonce
  // is kept, because iOS can close the app while you're in Safari.
  function stopCollecting() {
    pending.current = null;
    clearInterval(polling.current);
    try { localStorage.removeItem(PENDING); } catch {}
  }
  async function collect() {
    const p = pending.current;
    if (!p || userRef.current) return;
    if (Date.now() > p.until) return stopCollecting();
    try {
      const { token } = await call('/api/auth/claim', { code: p.nonce });
      stopCollecting();
      signedIn(token);
    } catch {}
  }
  function startCollecting(p) {
    pending.current = p;
    clearInterval(polling.current);
    polling.current = setInterval(collect, 2000);
  }
  function githubFromApp(e) {
    if (!standalone) return;
    e.preventDefault();
    const nonce = [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join('');
    const p = { nonce, until: Date.now() + 600000 };
    try { localStorage.setItem(PENDING, JSON.stringify(p)); } catch {}
    window.open(`${e.currentTarget.href}?app=${nonce}`, '_blank');
    say('Finish signing in with GitHub, then come back here.');
    startCollecting(p);
  }

  // Points, today's faces and the leaderboard. Returns how many meetups you
  // have and whether you are already in today. Only meetup dates are read, so
  // the row count grows with meetups, not with every check-in ever.
  async function renderBoard() {
    const me = userRef.current;
    const today = nyToday();
    const [data, members, prs] = await Promise.all([
      api(`/api/board?dates=${[...eventDates, today].join(',')}`),
      api('/api/members'),
      mergedPRs(cfg.prRepos).catch(() => new Map()),
    ]);
    const { meetups, present } = tally(data, eventDates, today);
    const rows = leaderboard(members, meetups, prs);
    const mine = rows.find(r => r.member.id === me.id) || { meetups: 0, prs: 0, points: 0 };
    if (userRef.current === me) setBoard({ rows, present, me: mine });
    return { mine: mine.meetups, inToday: present.some(m => m.id === me.id) };
  }

  // One rep: the whole pig hops and squishes on landing, tipping a little to
  // alternate sides. It moves as one piece, so the barbell never comes apart.
  function rep(n) {
    if (REDUCED.matches) return;
    setHop({ n, at: performance.now() });
    const tip = n % 2 ? -4 : 4;
    pigEl.current?.animate([
      { transform: 'translateY(0) scale(1, 1)' },
      { transform: `translateY(-14px) rotate(${tip}deg) scale(.96, 1.04)`, offset: 0.4 },
      { transform: 'translateY(0) scale(1.06, .92)', offset: 0.75 },
      { transform: 'translateY(0) scale(1, 1)' },
    ], { duration: 420, easing: 'cubic-bezier(.3,0,.3,1)' });
  }

  // Pixels and pixel hearts fly up off the pig. Round-number meetups get more.
  function burst(big) {
    if (REDUCED.matches) return;
    setCelebrate({ big, at: performance.now() });
    const host = stage.current;
    if (!host) return;
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

  const smash = them => collide({ me: userRef.current, them, reduced: REDUCED.matches, shake: root.current, onImpact: () => buzz([90, 70, 160]) });

  // Back to waiting for shakes, after a miss or an error.
  function rearm(msg) {
    checkingIn.current = false;
    setFlag({ waiting: false });
    setPips(0);
    say(msg);
    listen();
  }

  // The third shake lands here. Send the bump; if nobody nearby has shaken in
  // the last 20 seconds, send it again every 2s for 20s. Re-sending (rather
  // than just watching for a check-in) is what lets someone who's already in
  // see that their newcomer arrived, and it catches a partner who bumped a
  // moment later. If the user changes mid-wait, the loop just stops.
  //
  // Any number can bump together: after the first match the group stays open,
  // re-sending until GROUP_MS pass with nobody new, so a third or fourth phone
  // that shakes in a moment later lands on every screen too.
  async function bump() {
    if (checkingIn.current || !userRef.current) return;
    const me = userRef.current;
    checkingIn.current = true;
    disarm.current();
    setFlag({ waiting: true });
    say('Bumping…');
    const wasIn = flagsRef.current.checkedIn;
    const group = new Map();
    let mine = 0;
    let first = 0;
    let last = 0;
    try {
      for (let i = 0; ; i++) {
        if (i) await sleep(2000);
        if (userRef.current !== me) return;
        const at = await locate();
        const data = await api('/api/bump', { lat: at.lat, lng: at.lng });
        if (userRef.current !== me) return;
        const fresh = (data.members || []).filter(m => !group.has(m.id));
        fresh.forEach(m => group.set(m.id, m));
        if (fresh.length) {
          last = Date.now();
          if (!first) {
            first = last;
            mine = await landed(fresh, wasIn);
          } else {
            joined(fresh, [...group.values()]);
          }
        }
        if (first ? Date.now() - last > GROUP_MS || Date.now() - first > GROUP_MAX_MS : i >= 10) break;
        if (!i && !first) say('Now get someone next to you to shake too…');
      }
    } catch (e) {
      if (userRef.current === me && !first) return rearm(e.message);
    }
    if (userRef.current !== me) return;
    if (!first) return rearm('Nobody shook back. Shake together, at the same time.');
    finish(wasIn, [...group.values()], mine);
  }

  // Matched. Celebrate, and on someone's first meetup put the GitHub link
  // right there, because that's the moment they're in the squad. The group
  // stays open after this, so checkingIn stays set and a tap can't re-arm.
  async function landed(members, wasIn) {
    // the collision plays while the board refreshes underneath it; two heavy
    // hits land with the faces
    smash(members);
    setFlag({ waiting: false, armed: false, checkedIn: true });
    if (!wasIn) setBtn(b => ({ ...b, hidden: true }));
    const who = and(members.map(m => m.name));
    let mine = 0;
    try {
      ({ mine } = await renderBoard());
    } catch (e) {
      say(e.message);
      return 0;
    }
    if (wasIn) {
      say(`Bumped with ${who}. They're in. More can shake in now.`);
      burst(false);
      return mine;
    }
    say(`Bumped with ${who}. Meetup #${mine}, +${plural(POINTS.meetup, 'point')}. More can shake in now.`);
    burst([1, 5, 10, 25, 50, 100].includes(mine));
    setWelcome(mine === 1);
    return mine;
  }

  // Someone else shook in while the group was open.
  function joined(fresh, everyone) {
    smash(fresh);
    burst(false);
    say(`${and(fresh.map(m => m.name))} joined. Bumped with ${and(everyone.map(m => m.name))}.`);
    renderBoard().catch(() => {});
  }

  // The group closed: one line for all of it. Someone who was already in goes
  // back to bumping more in.
  function finish(wasIn, everyone, mine) {
    checkingIn.current = false;
    const who = and(everyone.map(m => m.name));
    const n = everyone.length + 1;
    const all = n > 2 ? ` All ${n} of you are in.` : '';
    say(wasIn || !mine
      ? `Bumped with ${who}. ${n > 2 ? `All ${n} of you are in.` : "They're in."}`
      : `Bumped with ${who}. Meetup #${mine}, +${plural(POINTS.meetup, 'point')}.${all}`);
    if (wasIn) {
      setFlag({ armed: true });
      listen();
    }
  }

  function tapInstead(msg) {
    say(msg);
    setBtn({ label: 'Tap to bump', hidden: false });
  }

  // Listen for three shakes, then bump. The button stays live: a tap bumps
  // too, for shakes that don't register.
  function listen() {
    if (!flagsRef.current.motion) return setBtn({ label: 'Tap to bump', hidden: false });
    setBtn({ label: 'Shake! (or tap)', hidden: false });
    // nothing typed should be left in focus while the phone shakes
    document.activeElement?.blur?.();
    const step = shakeCounter({ profile: shakeProfile.current });
    let heard = false;
    const onMotion = e => {
      const accel = reading(e);
      // readings with no numbers don't count as the phone sending motion
      if (!accel) return;
      heard = true;
      const n = step(e.timeStamp, accel);
      if (!n) return;
      buzz(25);
      rep(n);
      setPips(n);
      if (n >= SHAKES) {
        saveShake();
        bump();
      }
    };
    addEventListener('devicemotion', onMotion);
    // sensors blocked in site settings never send a usable reading: say so
    const silent = setTimeout(() => {
      if (heard || checkingIn.current) return;
      setFlag({ motion: false });
      tapInstead("Your phone isn't sending motion, so tap at the same time as someone next to you.");
    }, 3000);
    disarm.current = () => {
      removeEventListener('devicemotion', onMotion);
      clearTimeout(silent);
      // near misses and jitter are learned too, not only finished shakes
      saveShake();
    };
  }

  // The tap arms the sensors (iOS asks permission, and only inside the tap, so
  // nothing is awaited before it) and starts finding the location. Once armed,
  // a tap is the fallback for phones that won't shake.
  async function arm() {
    if (checkingIn.current) return;
    if (flagsRef.current.armed) {
      rep(1);
      return bump();
    }
    setFlag({ armed: true });
    const hasMotion = 'DeviceMotionEvent' in window && matchMedia('(pointer: coarse)').matches;
    let motionOk = hasMotion;
    if (hasMotion && typeof DeviceMotionEvent.requestPermission === 'function') {
      motionOk = await DeviceMotionEvent.requestPermission().catch(() => 'denied') === 'granted';
    }
    locate().catch(e => say(e.message));
    setFlag({ motion: motionOk });
    say(motionOk ? 'Shake your phone at the same time as someone next to you.'
      : 'Tap at the same time as someone next to you.');
    listen();
  }

  // Signed in (or out): the whole page follows.
  async function render(member) {
    const me = member || null;
    userRef.current = me;
    setUser(me);
    if (me) stopCollecting();
    // lets the homepage leaderboard mark your row
    try { me ? localStorage.setItem('squad-me', JSON.stringify(me.login)) : localStorage.removeItem('squad-me'); } catch {}
    disarm.current();
    disarm.current = () => {};
    checkingIn.current = false;
    setFlag({ armed: false, checkedIn: false, waiting: false, motion: false, sleeping: false });
    setCheckin(false);
    setBtn({ label: MOG, hidden: false });
    setPips(0);
    setWelcome(false);
    setCode(null);
    if (!me) {
      setBoard(null);
      // the 3D pig is gone with the app view; the class comes back when it remounts
      setIs3d(false);
      return say('');
    }
    try {
      const { inToday } = await renderBoard();
      if (userRef.current !== me) return;
      const today = nyToday();
      const event = meetupOn(cfg.events, today);
      const next = nextMeetup(cfg.events, today);
      // the pig is always out: bumping on a meetup day (already in? bump a
      // newcomer in), asleep on the other days
      setCheckin(true);
      setFlag({ sleeping: !event });
      if (inToday) {
        setFlag({ checkedIn: true });
        setBtn({ label: 'Bump someone in', hidden: false });
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

  async function signOut() {
    await api('/api/signout', {}).catch(() => {});
    store.set(null);
    render(null);
  }

  // Coming back from Sign in with GitHub: the server hands the session over
  // in the URL fragment, which never reaches any server log. Then the free
  // server, which sleeps when idle and takes a while to wake, is woken as the
  // page opens, so the shake later doesn't wait on it.
  useEffect(() => {
    const handed = new URLSearchParams(location.hash.slice(1)).get('token');
    if (handed) {
      store.set(handed);
      history.replaceState(null, '', location.pathname);
    }
    say('Waking the check-in server…');
    api('/api/config').then(({ github: on }) => {
      setGithub(on);
      if (!store.get()) {
        try {
          const p = JSON.parse(localStorage.getItem(PENDING));
          if (p?.nonce && Date.now() < p.until) startCollecting(p);
        } catch {}
        return render(null);
      }
      return api('/api/me').then(({ member }) => render(member)).then(() => {
        let greeting = null;
        try { greeting = sessionStorage.getItem(WELCOME); sessionStorage.removeItem(WELCOME); } catch {}
        if (greeting) setStatus(s => `${greeting} ${s}`);
      });
    }).catch(e => say(e.message));
    // coming back to the app checks straight away
    const onVisible = () => { if (!document.hidden) collect(); };
    addEventListener('visibilitychange', onVisible);
    // R3F reports a refused WebGL context as a rejection: keep the flat pig
    const onReject = e => { if (/webgl/i.test(String(e.reason?.message))) { setGl(false); setIs3d(false); } };
    addEventListener('unhandledrejection', onReject);
    // faces appear as other people check in
    const tick = setInterval(() => {
      if (userRef.current && !document.hidden && !checkingIn.current) renderBoard().catch(() => {});
    }, 15000);
    return () => {
      removeEventListener('visibilitychange', onVisible);
      removeEventListener('unhandledrejection', onReject);
      clearInterval(tick);
      clearInterval(polling.current);
    };
  }, []);

  // Install as an app. Chrome and Android hand over a prompt to show on a tap;
  // iPhone has none, so it gets the two taps written out. Hidden once installed.
  useEffect(() => {
    if (standalone) return;
    const onPrompt = e => {
      e.preventDefault();
      installPrompt.current = e;
      setInstall({ shown: true, prompt: true, ios: false });
    };
    const onInstalled = () => setInstall(i => ({ ...i, shown: false }));
    addEventListener('beforeinstallprompt', onPrompt);
    addEventListener('appinstalled', onInstalled);
    if (/iP(hone|ad|od)/.test(navigator.userAgent)) setInstall({ shown: true, prompt: false, ios: true });
    return () => {
      removeEventListener('beforeinstallprompt', onPrompt);
      removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  async function installApp() {
    const p = installPrompt.current;
    p?.prompt();
    if ((await p?.userChoice)?.outcome === 'accepted') setInstall(i => ({ ...i, shown: false }));
  }

  // Motion debug: the readout from motion-debug.js, remembered per phone.
  useEffect(() => {
    try { debug ? localStorage.setItem('squad-debug', '1') : localStorage.removeItem('squad-debug'); } catch {}
    if (!debug) return;
    let handle = null;
    let off = false;
    import('./motion-debug.js').then(({ motionDebug }) => { if (!off) handle = motionDebug(root.current); });
    return () => { off = true; handle?.stop(); };
  }, [debug]);
  // iOS only asks for motion inside the tap, so that comes before any await
  const onDebug = e => {
    if (e.target.checked && typeof window.DeviceMotionEvent?.requestPermission === 'function') {
      DeviceMotionEvent.requestPermission().catch(() => {});
    }
    setDebug(e.target.checked);
  };

  const cls = ['here', is3d && 'here--3d', flags.sleeping && 'here--sleeping', flags.checkedIn && 'here--checked-in',
    flags.armed && 'here--armed', flags.waiting && 'here--waiting', flags.motion && 'here--motion'].filter(Boolean).join(' ');
  const mine = board?.me.meetups ?? 0;
  const profile = user && mine > 0 ? profileLink(cfg, user) : null;
  const contribute = `${cfg.repo}/blob/${cfg.branch}/CONTRIBUTING.md`;

  return html`
    <div className=${cls} id="here" ref=${root}>
      <div className="here__bar" aria-hidden="true"><span>[ Claude Squad ]</span><span>NYC</span></div>
      <h1 className="page-title" id="here-title">${user ? 'Check in' : 'Log in'}</h1>
      <p className="here__status" id="here-status" role="status">${status}</p>

      ${!user && html`
        <div id="here-signin">
          <a className="here__btn" id="here-github" href=${`${API}/api/auth/github`} hidden=${!github} onClick=${githubFromApp}>Sign in with GitHub</a>
          <form className="here__join" id="here-join" onSubmit=${join}>
            <label>Your name <input name="name" autoComplete="name" maxLength="40" required /></label>
            <label>GitHub username <input name="github" autoComplete="username" autoCapitalize="none" spellCheck="false" maxLength="39" required /></label>
            <button className="here__btn" type="submit">Join the squad</button>
          </form>
          <p className="here__links"><a href=${cfg.repo} target="_blank" rel="noopener">GitHub repo</a> · <a href=${contribute} target="_blank" rel="noopener">How to contribute</a></p>
          <form className="here__join here__code" id="here-claim" onSubmit=${claim}>
            <label>Already joined on another phone? <input name="code" placeholder="ABCD-EFGH" autoComplete="one-time-code" autoCapitalize="characters" spellCheck="false" maxLength="12" required /></label>
            <button className="here__btn" type="submit">Sign in with a code</button>
          </form>
        </div>`}

      ${user && html`
        <div id="here-app">
          <p className="here__who">Signed in as <b id="here-name">${user.name || user.login}</b> · <button className="here__link" id="here-signout" type="button" onClick=${signOut}>Sign out</button> · <button className="here__link" id="here-code-btn" type="button" onClick=${showCode}>Sign in somewhere else</button></p>
          <p className="here__who" id="here-code" hidden=${!code}>On the other phone or in the app, type <b className="here__code-value" id="here-code-value">${code}</b> under "Sign in with a code". It works once, for ten minutes.</p>

          <div id="here-checkin" hidden=${!checkin}>
            <div className="here__stage" aria-hidden="true" ref=${stage}>
              <div className="here__pig" id="here-pig" ref=${pigEl}><${PigSVG} /></div>
              ${gl && html`<${Suspense} fallback=${null}>
                <${Pig3D} sleeping=${flags.sleeping} happy=${flags.checkedIn} rep=${hop} celebrate=${celebrate} reduced=${REDUCED.matches} onReady=${() => setIs3d(true)} />
              <//>`}
            </div>
            <div className="here__pips" aria-hidden="true">${[0, 1, 2].map(i => html`<i key=${i} className=${i < pips ? 'on' : undefined} />`)}</div>
            <button className="here__btn here__btn--checkin" id="here-checkin-btn" type="button" hidden=${btn.hidden} onClick=${arm}>${btn.label}</button>
            <label className="here__debug"><input type="checkbox" id="here-debug" checked=${debug} onChange=${onDebug} /> Motion debug</label>
          </div>

          <div className="here__welcome" id="here-welcome" hidden=${!welcome}>
            <p className="here__welcome-title">First Claude Squad. You're in.</p>
            <p><a className="here__btn" id="here-welcome-link" href=${profile} target="_blank" rel="noopener">Add yourself on GitHub</a></p>
          </div>

          <div className="here__score">
            <span className="here__points" id="here-points">${points}</span>
            <span className="here__label" id="here-tally">${plural(board?.me.meetups ?? 0, 'meetup')} · ${plural(board?.me.prs ?? 0, 'PR')}</span>
          </div>

          <section id="here-present" hidden=${!board?.present.length}>
            <h2>Here today</h2>
            <div className="here__faces" id="here-faces">${(board?.present ?? []).map(m => html`<${Avatar} key=${m.id} member=${m} />`)}</div>
          </section>

          <section>
            <h2>Leaderboard</h2>
            <ol className="here__board" id="here-board">
              ${(board?.rows ?? []).map(({ member, points: pts }) => html`
                <li key=${member.id} className=${member.id === user.id ? 'is-you' : undefined}>
                  <${Avatar} member=${member} /><span>${member.name}</span><b>${plural(pts, 'pt')}</b>
                </li>`)}
            </ol>
          </section>

          <section>
            <h2>Edit the site</h2>
            <p id="here-profile" hidden=${!profile}><a className="here__btn" id="here-profile-link" href=${profile} target="_blank" rel="noopener">Add your profile</a></p>
            <p className="here__links"><a href="/projects/">Projects</a> · <a href=${cfg.repo} target="_blank" rel="noopener">GitHub repo</a> · <a href=${contribute} target="_blank" rel="noopener">How to contribute</a></p>
          </section>
        </div>`}

      <div className="here__install" id="here-install" hidden=${!install.shown}>
        <p className="here__install-title">Put Squad on your home screen</p>
        <button className="here__btn" id="here-install-btn" type="button" hidden=${!install.prompt} onClick=${installApp}>Install the app</button>
        <p id="here-install-ios" hidden=${!install.ios}>In Safari, tap Share, then Add to Home Screen.</p>
      </div>

      <label className="here__haptic" aria-hidden="true" ref=${haptic}><input type="checkbox" switch="" id="haptic" tabIndex="-1" /></label>
    </div>`;
}

createRoot(document.getElementById('here-root')).render(html`<${App} />`);
