// Check-in: sign in with GitHub, shake the phone on a meetup day, get points.
// Points are counted only for dates in events.json, so a check-in on a random
// Tuesday is stored but never scores.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const root = document.getElementById('here');
const cfg = JSON.parse(document.getElementById('here-config').textContent);
const POINTS_PER_MEETUP = 10;
const eventDates = new Set(cfg.events.map(e => e.date));
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const todaysEvent = cfg.events.find(e => e.date === today);
const nextEvent = cfg.events.filter(e => e.date > today).sort((a, b) => a.date.localeCompare(b.date))[0];

const $ = sel => root.querySelector(sel);
const show = (id, on = true) => { $(id).hidden = !on; };
const say = msg => { $('#here-status').textContent = msg; };

if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
  say('Check-in is not connected yet: supabaseUrl and supabaseAnonKey are empty in src/_data/site.json.');
  throw new Error('supabase config missing');
}

const db = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

// Android buzzes through vibrate(). iOS Safari has no vibrate, but toggling a
// switch-style checkbox through its label plays the system haptic.
function buzz() {
  if (navigator.vibrate) navigator.vibrate([60, 40, 120]);
  else $('.here__haptic').click();
}

function signIn() {
  db.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: location.href.split('#')[0] } });
}

async function saveMember(user) {
  const m = user.user_metadata;
  const { error } = await db.from('members').upsert({
    id: user.id,
    login: m.user_name,
    name: m.full_name || m.user_name,
    avatar_url: m.avatar_url,
  });
  if (error) say(`Could not save your profile: ${error.message}`);
}

function avatar(member) {
  const img = document.createElement('img');
  img.src = member.avatar_url;
  img.alt = member.name;
  img.title = member.name;
  img.className = 'here__face';
  return img;
}

async function renderBoard(user) {
  const { data, error } = await db.from('checkins').select('event_date, members(id, login, name, avatar_url)');
  if (error) return say(`Could not load attendance: ${error.message}`);

  const scores = new Map();
  const present = [];
  for (const row of data) {
    if (!row.members) continue;
    if (row.event_date === today) present.push(row.members);
    if (!eventDates.has(row.event_date)) continue;
    const s = scores.get(row.members.id) || { member: row.members, points: 0 };
    s.points += POINTS_PER_MEETUP;
    scores.set(row.members.id, s);
  }

  const mine = scores.get(user.id)?.points || 0;
  $('#here-points').textContent = mine;
  const n = mine / POINTS_PER_MEETUP;
  $('#here-meetups').textContent = `${n} ${n === 1 ? 'meetup' : 'meetups'}`;

  const faces = $('#here-faces');
  faces.replaceChildren(...present.map(avatar));
  show('#here-present', present.length > 0);

  const board = $('#here-board');
  board.replaceChildren(...[...scores.values()]
    .sort((a, b) => b.points - a.points)
    .map(({ member, points }) => {
      const li = document.createElement('li');
      if (member.id === user.id) li.className = 'is-you';
      li.append(avatar(member), Object.assign(document.createElement('span'), { textContent: member.name }),
        Object.assign(document.createElement('b'), { textContent: `${points} pts` }));
      return li;
    }));

  const unlocked = mine > 0;
  show('#here-locked', !unlocked);
  show('#here-unlocked', unlocked);
  if (unlocked) {
    const login = user.user_metadata.user_name;
    const template = `---\nname: ${user.user_metadata.full_name || login}\nrole:\nphoto:\n---\n\n`;
    $('#here-profile-link').href = `${cfg.repo}/new/main/src/profiles?filename=${encodeURIComponent(login)}.md&value=${encodeURIComponent(template)}`;
  }

  return present.some(m => m.id === user.id);
}

// Pixels fly off the points readout. Round-number meetups get a bigger burst.
function burst(big) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const host = $('.here__score');
  const plus = Object.assign(document.createElement('span'), { className: 'here__plus', textContent: `+${POINTS_PER_MEETUP}` });
  host.append(plus);
  plus.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-60px)', opacity: 0 }],
    { duration: 900, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => plus.remove();
  for (let i = 0; i < (big ? 48 : 20); i++) {
    const px = Object.assign(document.createElement('i'), { className: 'here__px' });
    host.append(px);
    const a = Math.random() * Math.PI * 2;
    const d = 60 + Math.random() * (big ? 220 : 120);
    px.animate([
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px) scale(0)`, opacity: 1 },
    ], { duration: 500 + Math.random() * 500, easing: 'cubic-bezier(.1,.7,.3,1)' }).onfinish = () => px.remove();
  }
}

async function checkIn(user) {
  const { error } = await db.from('checkins').insert({ user_id: user.id, event_date: today });
  if (error && error.code !== '23505') return say(`Check-in failed: ${error.message}`);
  buzz();
  root.classList.add('here--bumped');
  show('#here-bump', false);
  await renderBoard(user);
  const n = Number($('#here-points').textContent) / POINTS_PER_MEETUP;
  say(`Meetup #${n}. +${POINTS_PER_MEETUP} points.`);
  burst([5, 10, 25, 50, 100].includes(n));
}

// A friendshipmog is three hard jolts inside a second. One jolt spans several
// motion samples, so samples within 150ms of the last counted hit are ignored.
function listenForShake(onShake, onHit) {
  let hits = [];
  const onMotion = e => {
    const a = e.accelerationIncludingGravity;
    if (!a) return;
    const force = Math.hypot(a.x, a.y, a.z) - 9.81;
    if (force < 14) return;
    const now = performance.now();
    if (now - (hits[hits.length - 1] || 0) < 150) return;
    hits = hits.filter(t => now - t < 1000).concat(now);
    onHit(hits.length);
    if (hits.length >= 3) {
      removeEventListener('devicemotion', onMotion);
      onShake();
    }
  };
  addEventListener('devicemotion', onMotion);
}

async function armBump(user) {
  const hasMotion = 'DeviceMotionEvent' in window && matchMedia('(pointer: coarse)').matches;
  if (!hasMotion) return checkIn(user);
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    const state = await DeviceMotionEvent.requestPermission().catch(() => 'denied');
    if (state !== 'granted') {
      say('Motion access was denied, so shaking will not work. Tap again to check in without it.');
      $('#here-bump-btn').onclick = () => checkIn(user);
      return;
    }
  }
  root.classList.add('here--armed');
  $('#here-bump-btn').textContent = 'Shake it';
  say('Shake your phone to friendshipmog.');
  const btn = $('#here-bump-btn');
  listenForShake(() => checkIn(user), n => {
    // each counted jolt answers back, so you know the shakes are landing
    if (navigator.vibrate) navigator.vibrate(25);
    btn.textContent = `${n} / 3`;
    btn.animate([{ transform: 'rotate(-4deg) scale(1.04)' }, { transform: 'none' }], { duration: 180 });
  });
}

async function render(session) {
  const user = session?.user;
  show('#here-signin', !user);
  show('#here-app', !!user);
  $('#here-title').textContent = user ? 'Check in' : 'Log in';
  if (!user) return say('');

  $('#here-name').textContent = user.user_metadata.full_name || user.user_metadata.user_name;
  await saveMember(user);
  const already = await renderBoard(user);

  if (already) {
    root.classList.add('here--bumped');
    show('#here-bump', false);
    say(`You're checked in for ${todaysEvent ? todaysEvent.title : 'today'}.`);
  } else if (todaysEvent) {
    show('#here-bump', true);
    say(`${todaysEvent.title} is today.`);
  } else {
    show('#here-bump', false);
    say(nextEvent ? `No meetup today. Next one is ${nextEvent.title} on ${nextEvent.date}.` : 'No meetup on the calendar.');
  }
}

$('#here-signin-btn').onclick = signIn;
$('#here-signout').onclick = () => db.auth.signOut();
$('#here-bump-btn').onclick = async () => armBump((await db.auth.getUser()).data.user);

let last;
db.auth.onAuthStateChange((_event, session) => {
  // the client fires this on every token refresh, only re-render on a new user
  if (session?.user?.id === last) return;
  last = session?.user?.id;
  render(session);
});

// live: a new face appears as soon as someone else checks in
db.channel('checkins')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'checkins' }, async () => {
    const { data } = await db.auth.getUser();
    if (data.user) renderBoard(data.user);
  })
  .subscribe();
