// Every page: the service worker, a greeting in the console, the footer slab
// tilting toward the pointer (or the way a phone is held), and the nav saying
// Check in on a phone that has a session.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');

const repo = document.querySelector('.footer__meta a').href;
console.log('%cMAKE NO MISTAKES.', 'font: 16px "Press Start 2P", monospace; color: #d9835f; background: #000; padding: 8px');
console.log(`Reading the source? Check in at a meetup and PR yourself onto the site: ${repo}`);

const mark = document.querySelector('.footer__mark');
if (mark && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const tilt = (x, y) => {
    mark.style.setProperty('--tilt-y', `${(x * 9).toFixed(1)}deg`);
    mark.style.setProperty('--tilt-x', `${(14 - y * 14).toFixed(1)}deg`);
  };
  addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse') tilt(e.clientX / innerWidth * 2 - 1, e.clientY / innerHeight * 2 - 1);
  }, { passive: true });
  addEventListener('deviceorientation', e => {
    if (e.gamma != null) tilt(Math.max(-1, Math.min(1, e.gamma / 30)), Math.max(-1, Math.min(1, (e.beta - 45) / 30)));
  });
}

try {
  if (localStorage.getItem('squad-token')) document.getElementById('nav-login').textContent = 'Check in';
} catch {}
