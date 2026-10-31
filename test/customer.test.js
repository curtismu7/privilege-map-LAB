import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCustomerConfig, normalizeCustomer, DEFAULT_CUSTOMER } from '../lib/customer.js';
import { loadCast, loadStories } from '../lib/stories.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('a missing customer config gives the safe defaults, and the title ends in LAB', () => {
  assert.deepEqual(loadCustomerConfig(path.join(os.tmpdir(), 'no-such-customer-config.json')), DEFAULT_CUSTOMER);
  assert.match(DEFAULT_CUSTOMER.branding.productName, /LAB$/);
});

test('the example file loads, only known keys are used, and over-long text is cut', () => {
  const example = loadCustomerConfig(path.join(ROOT, 'customer.config.example.json'));
  assert.equal(example.branding.productName, 'Privilege Map LAB');
  assert.equal(example.vocabulary.agent, 'the claims agent');
  const junk = normalizeCustomer({ branding: { productName: 42, extra: 'x', tagline: 'y'.repeat(500) }, vocabulary: { Bad: 'x', ok: '', agent: 'a clerk' }, other: true });
  assert.equal(junk.branding.productName, DEFAULT_CUSTOMER.branding.productName);
  assert.equal(junk.branding.tagline.length, 120);
  assert.equal(Object.hasOwn(junk.branding, 'extra'), false);
  assert.deepEqual(junk.vocabulary, { agent: 'a clerk' });
});

test('the example config holds no real names or links', () => {
  const text = fs.readFileSync(path.join(ROOT, 'customer.config.example.json'), 'utf8');
  assert.doesNotMatch(text, /https?:\/\//);
});

test('vocabulary renames a cast role everywhere, and an unknown role is ignored', () => {
  const customer = normalizeCustomer({ vocabulary: { agent: 'the claims agent', nobody: 'ghost' } });
  const cast = loadCast(path.join(ROOT, 'content', 'cast.json'), customer.vocabulary);
  assert.equal(cast.agent, 'the claims agent');
  assert.equal(Object.hasOwn(cast, 'nobody'), false);
  const stories = JSON.stringify(loadStories(path.join(ROOT, 'content', 'stories'), cast));
  assert.match(stories, /the claims agent/);
  assert.doesNotMatch(stories, /the AI agent/);
});
