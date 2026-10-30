// Motion debug: a readout pinned top left showing what the motion sensor
// sends, measured the way shakeCounter measures a jolt. Switched on from
// /here/ and listening on its own, so it works on any day, armed or not.
import { SHAKE, shakeCounter, shakeBar, readShakeProfile, joltOf } from './checkin.js';

const G = 9.81;
const SPAN = 3000; // ms of history in the graph
const W = 200, H = 56;

const fmt = n => (n == null ? '—' : n.toFixed(1)).padStart(6);

// What the real check-in counter on /here/ is doing, from the page's classes.
export const counterState = classes =>
  classes.contains('here--waiting') ? 'bumping'
    : !classes.contains('here--armed') ? 'not armed'
    : classes.contains('here--motion') ? 'listening' : 'tap only';

// The readout's text. samples ({ t, jolt }) and hits (timestamps of counted
// jolts) hold the last SPAN ms; events counts every motion event, missing the
// ones without a reading; bar is this phone's current shakeBar.
export function readout({ samples, hits, events, missing, max, interval, accel, bar, counter }, now) {
  const peak = samples.reduce((p, s) => Math.max(p, s.jolt), -G);
  const inSecond = hits.filter(t => now - t < SHAKE.within).length;
  const rate = samples.filter(s => now - s.t < 1000).length;
  return [
    events ? `events ${events}  ${rate} Hz${interval ? ` (${Math.round(interval)} ms)` : ''}` : 'no motion events yet',
    missing ? `no accel data: ${missing}` : null,
    `x${fmt(accel?.x)} y${fmt(accel?.y)} z${fmt(accel?.z)}`,
    `jolt ${fmt(samples.at(-1)?.jolt)}  need ${bar.toFixed(1)}`,
    `peak ${fmt(samples.length ? peak : null)}  max ${fmt(events - missing ? max : null)}`,
    `jolts ${Math.min(inSecond, SHAKE.need)}/${SHAKE.need} in 1s`,
    `counter: ${counter}`,
  ].filter(Boolean).join('\n');
}

export function motionDebug(root) {
  const box = document.createElement('div');
  box.className = 'motion-debug';
  box.setAttribute('aria-hidden', 'true');
  box.innerHTML = `<b>Motion debug</b><pre></pre><canvas width="${W * 2}" height="${H * 2}"></canvas>`;
  document.body.append(box);
  const text = box.querySelector('pre');
  const canvas = box.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim();
  const ink = css.getPropertyValue('--ink').trim();
  const rule = css.getPropertyValue('--rule').trim();

  // the same counter the check-in uses, fed the same samples, starting from
  // what this phone has learned (a copy: the readout never changes the real bar)
  const profile = (() => { try { return readShakeProfile(localStorage.getItem('squad-shake')); } catch { return readShakeProfile(null); } })();
  const step = shakeCounter({ profile });
  const samples = []; // { t, jolt }
  const hits = []; // timestamps of counted jolts
  let events = 0, missing = 0, max = 0, interval = null, accel = null;

  const onMotion = e => {
    events++;
    interval = e.interval;
    const a = e.accelerationIncludingGravity;
    const jolt = joltOf(a);
    if (jolt == null) {
      missing++;
      accel = null;
      return;
    }
    accel = a;
    max = Math.max(max, jolt);
    samples.push({ t: e.timeStamp, jolt });
    if (step(e.timeStamp, a)) hits.push(e.timeStamp);
  };
  addEventListener('devicemotion', onMotion);

  let frame;
  const draw = () => {
    frame = requestAnimationFrame(draw);
    const now = performance.now();
    while (samples.length && now - samples[0].t > SPAN) samples.shift();
    while (hits.length && now - hits[0] > SPAN) hits.shift();
    const bar = shakeBar(profile);
    text.textContent = readout({
      samples, hits, events, missing, max, interval, accel, bar, counter: counterState(root.classList),
    }, now);

    // |a| − g over the last few seconds; the dashed line is the threshold,
    // ticks mark counted jolts
    const top = Math.max(bar * 2, max);
    const y = v => H - ((v + G) / (top + G)) * H;
    const x = t => W - ((now - t) / SPAN) * W;
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1;
    ctx.strokeStyle = rule;
    ctx.beginPath();
    ctx.moveTo(0, y(0)); ctx.lineTo(W, y(0));
    ctx.stroke();
    ctx.strokeStyle = accent;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(0, y(bar)); ctx.lineTo(W, y(bar));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = accent;
    for (const t of hits) ctx.fillRect(x(t) - 1, 0, 2, H);
    ctx.strokeStyle = ink;
    ctx.beginPath();
    samples.forEach((s, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, x(s.t), y(s.jolt)));
    ctx.stroke();
  };
  draw();

  return {
    stop() {
      cancelAnimationFrame(frame);
      removeEventListener('devicemotion', onMotion);
      box.remove();
    },
  };
}
