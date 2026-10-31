import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMode, LIVE_AVAILABLE } from '../lib/mode.js';

test('mock is the default', () => {
  assert.equal(resolveMode(undefined), 'mock');
  assert.equal(resolveMode(''), 'mock');
  assert.equal(resolveMode('mock'), 'mock');
});

test('this app has no live mode, so live is refused with a reason', () => {
  assert.equal(LIVE_AVAILABLE, false);
  assert.throws(() => resolveMode('live'), /no live mode/);
});

test('an unknown mode is refused', () => {
  assert.throws(() => resolveMode('demo'), /MODE must be/);
});
