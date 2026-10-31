import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseAllowed, loadSharedSettings, sharedEnvPath, SHARED_KEYS } from '../lib/settings.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pm-settings-'));

test('only the allowed keys are returned, whatever else the file holds', () => {
  const text = ['# comment', 'MODE=mock', 'PINGONE_ADMIN_CLIENT_SECRET=admin-secret-value', 'WORKER_CLIENT_SECRET="worker-secret-value"', 'export WORKSPACE_ID="visitor-1"', 'VAULT_PASSWORD=x'].join('\n');
  const parsed = parseAllowed(text);
  assert.deepEqual(parsed, { MODE: 'mock', WORKSPACE_ID: 'visitor-1' });
  assert.doesNotMatch(JSON.stringify(parsed), /secret|VAULT|admin|worker/i);
});

test('the allowed list names no admin or worker key', () => {
  for (const key of SHARED_KEYS) assert.doesNotMatch(key, /ADMIN|WORKER|SECRET|PASSWORD|VAULT|TOKEN/i, key);
});

test('loading sets allowed keys only, never overrides the environment, and never exports the others', () => {
  const dir = tmp();
  const file = path.join(dir, '.env');
  fs.writeFileSync(file, 'MODE=mock\nWORKSPACE_ID=from-file\nPINGONE_ADMIN_CLIENT_SECRET=nope\nUNRELATED=1\n', { mode: 0o600 });
  const env = { WORKSPACE_ID: 'from-env' };
  const result = loadSharedSettings({ env, file });
  assert.equal(result.found, true);
  assert.deepEqual(result.loaded, ['MODE']);
  assert.equal(env.WORKSPACE_ID, 'from-env');
  assert.equal(env.PINGONE_ADMIN_CLIENT_SECRET, undefined);
  assert.equal(env.UNRELATED, undefined);
  assert.equal(result.looseMode, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a file readable by others is reported, and a missing file is fine', () => {
  const dir = tmp();
  const file = path.join(dir, '.env');
  fs.writeFileSync(file, 'MODE=mock\n');
  fs.chmodSync(file, 0o644);
  assert.equal(loadSharedSettings({ env: {}, file }).looseMode, true);
  assert.deepEqual(loadSharedSettings({ env: {}, file: path.join(dir, 'none') }), { file: path.join(dir, 'none'), found: false, loaded: [], looseMode: false });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('STANDALONE_ENV overrides the default path', () => {
  assert.equal(sharedEnvPath({ STANDALONE_ENV: '/somewhere/else.env' }), '/somewhere/else.env');
  assert.equal(sharedEnvPath({}), path.join(os.homedir(), 'Development', '.env'));
});
