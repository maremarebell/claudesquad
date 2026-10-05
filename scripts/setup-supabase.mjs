// One command from nothing to working GitHub logins:
//
//   SUPABASE_ACCESS_TOKEN=... node scripts/setup-supabase.mjs
//
// Creates (or finds) the "claudesquad" Supabase project, applies every
// migration in supabase/migrations, and writes the project URL and anon key
// into src/_data/site.json. Run it again with GITHUB_CLIENT_ID and
// GITHUB_SECRET from a GitHub OAuth app to switch GitHub sign-in on; the first
// run prints the callback URL that app needs. Safe to re-run.
//
// SITE_URL (default http://localhost:8080) is where sign-in returns to; set it
// to the deployed site once there is one.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error('Set SUPABASE_ACCESS_TOKEN: make one at https://supabase.com/dashboard/account/tokens');
  process.exit(1);
}
const siteUrl = (process.env.SITE_URL || 'http://localhost:8080').replace(/\/$/, '');
const NAME = 'claudesquad';

async function api(method, path, body) {
  const res = await fetch(`https://api.supabase.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

let project = (await api('GET', '/projects')).find(p => p.name === NAME);
if (!project) {
  const [org] = await api('GET', '/organizations');
  if (!org) throw new Error('No Supabase organization on this account; make one in the dashboard first.');
  console.log(`Creating project "${NAME}" in ${org.name}…`);
  project = await api('POST', '/projects', {
    name: NAME,
    organization_id: org.id,
    region: 'us-east-1',
    // nobody needs this password: everything below goes through the API
    db_pass: randomBytes(24).toString('base64url'),
  });
}
const ref = project.id || project.ref;

process.stdout.write('Waiting for the database');
for (;;) {
  const { status } = await api('GET', `/projects/${ref}`);
  if (status === 'ACTIVE_HEALTHY') break;
  process.stdout.write('.');
  await new Promise(r => setTimeout(r, 5000));
}
console.log(' ready.');

for (const file of readdirSync('supabase/migrations').sort()) {
  await api('POST', `/projects/${ref}/database/query`, { query: readFileSync(`supabase/migrations/${file}`, 'utf8') });
  console.log(`Applied ${file}`);
}

const auth = {
  site_url: siteUrl,
  uri_allow_list: [`${siteUrl}/here/`, 'http://localhost:8080/here/'].join(','),
};
const { GITHUB_CLIENT_ID: id, GITHUB_SECRET: secret } = process.env;
if (id && secret) Object.assign(auth, { external_github_enabled: true, external_github_client_id: id, external_github_secret: secret });
await api('PATCH', `/projects/${ref}/config/auth`, auth);

const keys = await api('GET', `/projects/${ref}/api-keys?reveal=false`);
const anon = keys.find(k => k.name === 'anon');
const url = `https://${ref}.supabase.co`;
const site = JSON.parse(readFileSync('src/_data/site.json', 'utf8'));
Object.assign(site, { supabaseUrl: url, supabaseAnonKey: anon.api_key });
writeFileSync('src/_data/site.json', JSON.stringify(site, null, 2) + '\n');
console.log(`Wrote ${url} and the anon key to src/_data/site.json.`);

if (id && secret) {
  console.log(`GitHub sign-in is on. Sign-in returns to ${siteUrl}/here/.`);
} else {
  console.log(`
GitHub sign-in is still off. One step left:
  1. Open https://github.com/settings/applications/new
       Homepage URL:               ${siteUrl}
       Authorization callback URL: ${url}/auth/v1/callback
  2. Generate a client secret, then run this again with
       GITHUB_CLIENT_ID=... GITHUB_SECRET=... SUPABASE_ACCESS_TOKEN=... node scripts/setup-supabase.mjs`);
}
