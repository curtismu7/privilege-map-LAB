import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, startServer } from './support/helpers.mjs';

const run = (script, env) =>
  spawnSync(process.execPath, [path.join(ROOT, 'scripts', script)], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, STANDALONE_ENV: path.join(os.tmpdir(), 'no-shared-env-for-tests'), ...env }
  });

test('doctor passes against a running app, one line per check, and exits 0', async () => {
  const app = await startServer();
  try {
    const out = run('doctor.mjs', { PORT: String(app.port), DATA_ROOT: app.dataRoot, WORKSPACE_ID: app.workspace });
    assert.equal(out.status, 0, out.stdout + out.stderr);
    const lines = out.stdout.split('\n').filter((l) => /^(OK|FAIL)/.test(l));
    assert.ok(lines.length >= 9);
    assert.ok(lines.every((l) => l.startsWith('OK')));
    assert.match(out.stdout, /app answers \/api\/health/);
  } finally {
    await app.stop();
  }
});

test('doctor exits 1 and says what to do when nothing is listening', () => {
  const out = run('doctor.mjs', { PORT: '4779', DATA_ROOT: fs.mkdtempSync(path.join(os.tmpdir(), 'pm-doc-')) });
  assert.equal(out.status, 1);
  assert.match(out.stdout, /FAIL {2}app answers \/api\/health \(nothing on port 4779; run npm start\)/);
});

test('doctor exits 1 when the mode is not valid', () => {
  const out = run('doctor.mjs', { PORT: '4779', MODE: 'live', DATA_ROOT: os.tmpdir() });
  assert.equal(out.status, 1);
  assert.match(out.stdout, /FAIL {2}MODE is valid/);
});

test('reset asks the running app, clears run state, and keeps saved settings', async () => {
  const app = await startServer();
  try {
    await fetch(`${app.base}/api/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ presenterStep: 1 }) });
    await fetch(`${app.base}/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ speed: 'slow' }) });
    const out = run('reset.mjs', { PORT: String(app.port), DATA_ROOT: app.dataRoot, WORKSPACE_ID: app.workspace });
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /cleared by the running app/);
    const s = await (await fetch(`${app.base}/api/state`)).json();
    assert.deepEqual(s.run, {});
    assert.equal(s.settings.speed, 'slow');
  } finally {
    await app.stop();
  }
});

test('reset with no app running clears the workspace files directly', () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-reset-'));
  const dir = path.join(dataRoot, '.data', 'offline-ws');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'run.json'), '{"presenterStep":2}');
  fs.writeFileSync(path.join(dir, 'trace.ndjson'), '{}\n');
  fs.writeFileSync(path.join(dir, 'settings.json'), '{"speed":"fast"}');
  const out = run('reset.mjs', { PORT: '4779', DATA_ROOT: dataRoot, WORKSPACE_ID: 'offline-ws' });
  assert.equal(out.status, 0);
  assert.equal(fs.existsSync(path.join(dir, 'run.json')), false);
  assert.equal(fs.existsSync(path.join(dir, 'trace.ndjson')), false);
  assert.equal(fs.existsSync(path.join(dir, 'settings.json')), true);
  fs.rmSync(dataRoot, { recursive: true, force: true });
});
