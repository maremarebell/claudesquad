import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PIG } from '../src/js/pig.js';

// The pig bitmap lives in three places (CLAUDE.md: change all three together).
const rows = (file, start) => {
  const text = readFileSync(file, 'utf8');
  const block = text.slice(text.indexOf(start));
  return block.slice(0, block.indexOf(']')).match(/'[.#]+'/g).map(s => s.slice(1, -1));
};

test('the pig bitmap is a clean rectangle of pixels', () => {
  assert.equal(PIG.length, 18);
  for (const row of PIG) assert.match(row, /^[.#]{34}$/);
});

test('hero.js and scripts/icons.py draw the same pig as pig.js', () => {
  assert.deepEqual(rows('src/js/hero.js', 'const PIG = ['), PIG);
  assert.deepEqual(rows('scripts/icons.py', 'PIG = ['), PIG);
});
