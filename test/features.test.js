import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PAGES } from '../src/data/pages.js';
import { isDeckSourced } from '../lib/feature-diagram.js';

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

const STATUSES = new Set(['GA', 'New in 2026-11-02 release', 'New in 2026-11-02 release (GA)', 'Enhanced in 2026-11-02 release (GA)', 'Roadmap', 'Part GA, part roadmap']);

test('the Map carries the 41 features of the private Privilege Map, spread over the five pages', () => {
  assert.equal(features.length, 41);
  const perPage = Object.fromEntries(PAGES.map((p) => [p.id, features.filter((f) => f.page === p.id).length]));
  assert.deepEqual(perPage, { identity: 8, llm: 4, mcp: 10, oversight: 11, platform: 8 });
  assert.equal(features.filter((f) => f.status).length, 20, 'the 20 features new to the deck carry a status badge');
});

test('a status, when present, is one of the known values', () => {
  for (const f of features) if (f.status !== undefined) assert.ok(STATUSES.has(f.status), `${f.id}: "${f.status}"`);
});

test('every entry taken from the Ping deck says it is internal and confidential, and is marked as stated, not tested', () => {
  const fromDeck = features.filter(isDeckSourced);
  assert.equal(fromDeck.length, 33, '20 new features and 13 updated ones use deck text');
  for (const f of fromDeck) {
    assert.ok(f.sources.every((s) => !/Ping deck/i.test(s) || /confidential/i.test(s)), `${f.id}: a deck source is not marked confidential`);
    assert.ok(f.unverified.some((u) => /not tested on our tenant/i.test(u)), `${f.id}: missing the not-tested line`);
  }
});

test('Roadmap items say so in their text, not only in the badge', () => {
  for (const f of features.filter((x) => x.status === 'Roadmap' || x.status === 'Part GA, part roadmap')) assert.match(`${f.how} ${f.userValue}`, /roadmap|planned|Q4 2026/i, f.id);
});

test('the Federated Identity rename is display-only: the old name is not a feature or component name', () => {
  assert.ok(features.some((f) => f.id === 'federated-identity' && f.name === 'Federated Identity'));
  for (const f of features) for (const text of [f.name, ...f.components]) assert.doesNotMatch(text, /\bNHI\b|non-human identity/i, `${f.id}: "${text}"`);
});

test('no feature id is a path, and every id fits a diagram name', () => {
  for (const f of features) assert.match(f.id, /^[a-z0-9][a-z0-9-]*$/, f.id);
});
