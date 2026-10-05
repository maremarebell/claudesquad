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
// SITE_URL is where sign-in returns to. Set it once the site is deployed; a
// later run without it keeps whatever the project already has (or the Render
// site on the very first run). Redirect URLs are only ever added, never dropped.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error('Set SUPABASE_ACCESS_TOKEN: make one at https://supabase.com/dashboard/account/tokens');
  process.exit(1);
}
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
for (let tries = 0; ; tries++) {
  const { status } = await api('GET', `/projects/${ref}`);
  if (status === 'ACTIVE_HEALTHY') break;
  if (status === 'INACTIVE') throw new Error('The project is paused. Restore it in the Supabase dashboard, then run this again.');
  if (/FAILED/.test(status) || tries > 120) throw new Error(`The project is stuck in ${status}. Check the Supabase dashboard.`);
  process.stdout.write('.');
  await new Promise(r => setTimeout(r, 5000));
}
console.log(' ready.');

for (const file of readdirSync('supabase/migrations').sort()) {
  await api('POST', `/projects/${ref}/database/query`, { query: readFileSync(`supabase/migrations/${file}`, 'utf8') });
  console.log(`Applied ${file}`);
}

const current = await api('GET', `/projects/${ref}/config/auth`);
const keep = current.site_url && !/^http:\/\/(localhost|127\.0\.0\.1)(:3000)?\/?$/.test(current.site_url) ? current.site_url : null;
const siteUrl = (process.env.SITE_URL || keep || 'https://claudesquad.onrender.com').replace(/\/$/, '');
const allow = new Set((current.uri_allow_list || '').split(',').filter(Boolean));
allow.add(`${siteUrl}/here/`);
allow.add('http://localhost:8080/here/');
const auth = { site_url: siteUrl, uri_allow_list: [...allow].join(',') };
const { GITHUB_CLIENT_ID: id, GITHUB_SECRET: secret } = process.env;
if (id && secret) Object.assign(auth, { external_github_enabled: true, external_github_client_id: id, external_github_secret: secret });
await api('PATCH', `/projects/${ref}/config/auth`, auth);

const keys = await api('GET', `/projects/${ref}/api-keys?reveal=false`);
const anon = keys.find(k => k.name === 'anon');
if (!anon) throw new Error('No "anon" API key on the project. Re-enable legacy API keys under Project Settings > API Keys.');
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
       GITHUB_CLIENT_ID=... GITHUB_SECRET=... SUPABASE_ACCESS_TOKEN=... node scripts/setup-supabase.mjs
     (add SITE_URL=https://... once the site is deployed)`);
}
