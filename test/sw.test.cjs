const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');

// Runs src/sw.js against a fake worker scope: a network to answer or not,
// and a cache.
function worker() {
  const handlers = {};
  const cached = new Map();
  const deleted = [];
  const state = { cached, deleted, fetched: [], claimed: false, skipped: false };
  const caches = {
    keys: async () => ['squad', 'old-v1'],
    delete: async key => { deleted.push(key); return true; },
    open: async () => ({ put: async (req, res) => { cached.set(req.url, res); } }),
    match: async req => cached.get(req.url),
  };
  state.network = () => Promise.resolve({ ok: true, status: 200, body: 'fresh', clone() { return { ...this, body: 'copy' }; } });
  runInNewContext(readFileSync('src/sw.js', 'utf8'), {
    self: {
      addEventListener: (name, fn) => { handlers[name] = fn; },
      skipWaiting: () => { state.skipped = true; },
    },
    caches,
    clients: { claim: async () => { state.claimed = true; } },
    location: { origin: 'https://claudesquad.onrender.com' },
    URL,
    setTimeout,
    fetch: req => { state.fetched.push(req.url); return state.network(req); },
  });
  // fire a fetch event; resolves to what respondWith got (or undefined if the
  // worker left the request alone) once waitUntil has settled
  state.request = async (url, method = 'GET') => {
    let responded;
    const waits = [];
    handlers.fetch({
      request: { url, method },
      respondWith: p => { responded = p; },
      waitUntil: p => waits.push(p),
    });
    const res = responded && await responded;
    await Promise.all(waits);
    return res;
  };
  state.lifecycle = async name => {
    const waits = [];
    handlers[name]({ waitUntil: p => waits.push(p) });
    await Promise.all(waits);
  };
  return state;
}

const PAGE = 'https://claudesquad.onrender.com/here/';

test('installing takes over at once; activating drops old caches and claims pages', async () => {
  const sw = worker();
  await sw.lifecycle('install');
  assert.ok(sw.skipped);
  await sw.lifecycle('activate');
  assert.deepEqual(sw.deleted, ['old-v1']);
  assert.ok(sw.claimed);
});

test('pages come from the network first, and a copy is cached', async () => {
  const sw = worker();
  const res = await sw.request(PAGE);
  assert.equal(res.body, 'fresh');
  assert.equal(sw.cached.get(PAGE).body, 'copy');
});

test('the check-in server, CDNs and non-GET requests are left alone', async () => {
  const sw = worker();
  assert.equal(await sw.request('https://claudesquad-api.onrender.com/api/me'), undefined);
  assert.equal(await sw.request('https://unpkg.com/three'), undefined);
  assert.equal(await sw.request(PAGE, 'POST'), undefined);
  assert.deepEqual(sw.fetched, []);
});

test('errors and partial responses are never cached', async () => {
  const sw = worker();
  sw.network = () => Promise.resolve({ ok: false, status: 500, body: 'oops', clone() { return this; } });
  assert.equal((await sw.request(PAGE)).status, 500);
  sw.network = () => Promise.resolve({ ok: true, status: 206, body: 'part', clone() { return this; } });
  await sw.request(PAGE);
  assert.equal(sw.cached.size, 0);
});

test('offline, the cached copy is served', async () => {
  const sw = worker();
  await sw.request(PAGE);
  sw.network = () => Promise.reject(new TypeError('offline'));
  assert.equal((await sw.request(PAGE)).body, 'copy');
});

test('offline with nothing cached, the network error comes through', async () => {
  const sw = worker();
  sw.network = () => Promise.reject(new TypeError('offline'));
  await assert.rejects(sw.request(PAGE), TypeError);
});

test('a network that hangs past 3 seconds gets the cached copy, and still refreshes it', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const sw = worker();
    await sw.request(PAGE);
    let finish;
    sw.network = () => new Promise(r => { finish = r; });
    let served;
    const done = sw.request(PAGE).then(res => { served = res; });
    await new Promise(r => setImmediate(r));
    mock.timers.tick(3000);
    await new Promise(r => setImmediate(r));
    finish({ ok: true, status: 200, body: 'late', clone() { return { ...this, body: 'late copy' }; } });
    await done;
    assert.equal(served.body, 'copy');
    assert.equal(sw.cached.get(PAGE).body, 'late copy');
  } finally {
    mock.timers.reset();
  }
});
