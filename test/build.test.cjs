const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { jsVersion } = require('../.eleventy.js');

// Scripts are served from /js/<version>/, so one page's imports all come
// from the same build however the CDN caches each file.
test('the script version follows the scripts\' contents', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'js-'));
  fs.writeFileSync(path.join(dir, 'a.js'), 'export const a = 1;');
  fs.writeFileSync(path.join(dir, 'b.js'), 'export const b = 2;');
  fs.mkdirSync(path.join(dir, 'sub'));
  const v = jsVersion(dir);
  assert.match(v, /^[0-9a-f]{10}$/);
  assert.equal(jsVersion(dir), v, 'same files, same version');
  fs.writeFileSync(path.join(dir, 'b.js'), 'export const b = 3;');
  assert.notEqual(jsVersion(dir), v, 'a changed file changes it');
  fs.writeFileSync(path.join(dir, 'b.js'), 'export const b = 2;');
  assert.equal(jsVersion(dir), v);
  fs.renameSync(path.join(dir, 'b.js'), path.join(dir, 'c.js'));
  assert.notEqual(jsVersion(dir), v, 'a renamed file changes it');
  fs.rmSync(dir, { recursive: true });
});

test('pages load their scripts from the versioned folder', () => {
  for (const page of ['here.njk', 'index.njk', 'projects.njk']) {
    const text = fs.readFileSync(path.join(__dirname, '..', 'src', page), 'utf8');
    const scripts = [...text.matchAll(/<script type="module" src="([^"]+)"/g)].map(m => m[1]);
    assert.ok(scripts.length, `${page} has a module script`);
    for (const src of scripts) assert.match(src, /^\{\{ js \}\}\//, `${page}: ${src}`);
  }
});
