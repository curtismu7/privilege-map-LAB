import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PAGES } from '../src/data/pages.js';

const features = JSON.parse(readFileSync(new URL('../src/data/features.json', import.meta.url), 'utf8'));
const pageIds = new Set(PAGES.map((p) => p.id));

test('every feature has the four standard sections filled', () => {
  for (const f of features) {
    for (const k of ['why', 'how', 'userValue']) assert.ok(String(f[k] || '').trim(), `${f.id} missing ${k}`);
    assert.ok(Array.isArray(f.components) && f.components.length > 0, `${f.id} has no components`);
  }
});

test('feature ids are unique and each feature sits on exactly one known page', () => {
  const ids = features.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const f of features) assert.ok(pageIds.has(f.page), `${f.id} page ${f.page}`);
});

test('every page has at least one feature', () => {
  for (const p of PAGES) assert.ok(features.some((f) => f.page === p.id), `${p.id} is empty`);
});

test('data carries no author machine paths', () => {
  assert.equal(readFileSync(new URL('../src/data/features.json', import.meta.url), 'utf8').includes('/Users/'), false);
});
