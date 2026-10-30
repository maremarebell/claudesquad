import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// squad.js runs in the browser; give it just enough of one. On localhost it
// talks to the local server, so it never reads the page's <meta>.
const storage = () => {
  const data = new Map();
  return {
    getItem: k => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: k => data.delete(k),
    clear: () => data.clear(),
  };
};
Object.assign(globalThis, {
  location: { hostname: 'localhost' },
  localStorage: storage(),
  sessionStorage: storage(),
  matchMedia: () => ({ matches: false }),
});
const { API, api, token, SignedOut, mergedPRs } = await import('../src/js/squad.js');

let calls;
// each fetch takes the next answer: a status and body, or an Error to throw
function answer(...replies) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    const next = replies.length > 1 ? replies.shift() : replies[0];
    if (next instanceof Error) throw next;
    const [status, body] = next;
    // like a real response, an empty body fails to parse
    return { status, ok: status >= 200 && status < 300, json: async () => body ?? JSON.parse('') };
  };
}

// run a call while advancing fake time, so retries happen without waiting
async function settle(promise) {
  let done = false;
  promise.then(() => { done = true; }, () => { done = true; });
  for (let i = 0; i < 100 && !done; i++) {
    await new Promise(r => setImmediate(r));
    mock.timers.tick(3000);
  }
  return promise;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
});
afterEach(() => mock.timers.reset());

test('on localhost the site talks to the local server', () => {
  assert.equal(API, 'http://localhost:10124');
});

test('reads send the session token and return the JSON', async () => {
  token.set('tok');
  answer([200, { member: { id: 1 } }]);
  assert.deepEqual(await api('/api/me'), { member: { id: 1 } });
  assert.equal(calls[0].url, 'http://localhost:10124/api/me');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
});

test('writes POST JSON, and no token means no Authorization header', async () => {
  answer([200, {}]);
  await api('/api/join', { name: 'Mare' });
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.body, '{"name":"Mare"}');
  assert.equal(calls[0].init.headers.Authorization, undefined);
});

test('a 401 forgets the token and signs out with the server message', async () => {
  token.set('old');
  answer([401, { error: 'sign in again' }]);
  await assert.rejects(api('/api/me'), err => err instanceof SignedOut && err.message === 'sign in again');
  assert.equal(token.get(), null);
});

test('other errors carry the server message, or the status when there is none', async () => {
  answer([409, { error: 'taken' }]);
  await assert.rejects(api('/api/join', {}), { message: 'taken' });
  answer([418, undefined]);
  await assert.rejects(api('/api/join', {}), { message: 'Check-in server error 418' });
});

test('reads wait out a sleeping server', async () => {
  answer([503, {}], new Error('offline'), [502, {}], [200, { ok: true }]);
  assert.deepEqual(await settle(api('/api/config')), { ok: true });
  assert.equal(calls.length, 4);
});

test('reads give up after 90 seconds', async () => {
  answer([503, { error: "Check-in isn't open yet." }]);
  await assert.rejects(settle(api('/api/config')), { message: "Check-in isn't open yet." });
  assert.ok(calls.length >= 30 && calls.length <= 32, `${calls.length} tries`);
  answer(new Error('offline'));
  await assert.rejects(settle(api('/api/config')), /Can't reach the check-in server/);
});

test('writes are never sent twice', async () => {
  answer([503, {}]);
  await assert.rejects(settle(api('/api/bump', { lat: 1, lng: 2 })), { message: 'Check-in server error 503' });
  assert.equal(calls.length, 1);
  answer(new Error('offline'));
  await assert.rejects(settle(api('/api/bump', {})), /Can't reach/);
  assert.equal(calls.length, 1);
});

test('the token survives storage that throws (private mode)', () => {
  const real = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  try {
    assert.equal(token.get(), null);
    assert.doesNotThrow(() => token.set('x'));
  } finally {
    globalThis.localStorage = real;
  }
});

const pr = login => ({ user: { login, type: 'User' } });

test('merged PRs page through GitHub search and count per login', async () => {
  answer(
    [200, { total_count: 3, items: [pr('Mare'), pr('iso')] }],
    [200, { total_count: 3, items: [pr('mare')] }],
  );
  const counts = await mergedPRs(['a/x', 'maremarebell/claudesquad']);
  assert.deepEqual([...counts], [['mare', 2], ['iso', 1]]);
  assert.equal(calls.length, 2);
  const q = new URL(calls[0].url).searchParams.get('q');
  assert.equal(q, 'is:pr is:merged repo:a/x repo:maremarebell/claudesquad');
  assert.equal(new URL(calls[1].url).searchParams.get('page'), '2');
});

test('PR counts are cached ten minutes per tab', async () => {
  answer([200, { total_count: 1, items: [pr('mare')] }]);
  await mergedPRs(['a/x']);
  mock.timers.tick(9 * 60_000);
  assert.deepEqual([...await mergedPRs(['a/x'])], [['mare', 1]]);
  assert.equal(calls.length, 1);
  mock.timers.tick(2 * 60_000);
  await mergedPRs(['a/x']);
  assert.equal(calls.length, 2);
});

test('a GitHub error is thrown for the caller to treat as no PRs', async () => {
  answer([403, {}]);
  await assert.rejects(mergedPRs(['a/x']), { message: 'GitHub 403' });
});
