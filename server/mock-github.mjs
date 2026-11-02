// A stand-in for GitHub's OAuth endpoints, for server/e2e.mjs and for trying
// Sign in with GitHub on a laptop: point the server at it with
// GITHUB_URL=http://127.0.0.1:10125 GITHUB_API_URL=http://127.0.0.1:10125
// (plus any GITHUB_CLIENT_ID and GITHUB_SECRET). Authorize sends the browser
// straight back with a code, the code becomes a token, and the token names
// one user (MOCK_LOGIN, default ana-gh).
import http from 'node:http';

export const MOCK_USER = {
  login: process.env.MOCK_LOGIN || 'ana-gh',
  id: 4242,
  name: 'Ana From GitHub',
  avatar_url: 'https://avatars.githubusercontent.com/u/4242?v=4',
};

export function startMockGitHub(port = 10125) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (url.pathname === '/login/oauth/authorize') {
      const back = new URL(url.searchParams.get('redirect_uri'));
      back.searchParams.set('code', url.searchParams.get('client_id') === 'bad-client' ? 'bad-code' : 'mock-code');
      back.searchParams.set('state', url.searchParams.get('state'));
      res.writeHead(302, { Location: back.href });
      return res.end();
    }
    if (url.pathname === '/login/oauth/access_token' && req.method === 'POST') {
      let text = '';
      for await (const chunk of req) text += chunk;
      const { code, client_secret: secret } = JSON.parse(text || '{}');
      return json(200, code === 'mock-code' && secret ? { access_token: 'mock-token', token_type: 'bearer' } : { error: 'bad_verification_code' });
    }
    if (url.pathname === '/user') {
      return req.headers.authorization === 'Bearer mock-token' ? json(200, MOCK_USER) : json(401, { message: 'Bad credentials' });
    }
    json(404, { message: 'Not Found' });
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const port = Number(process.env.PORT) || 10125;
  await startMockGitHub(port);
  console.log(`mock GitHub on ${port}, user ${MOCK_USER.login}`);
}
