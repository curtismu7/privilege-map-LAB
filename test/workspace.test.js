import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveWorkspace, workspaceDir, appendTrace, readTrace, clearRunState, writeSettings, readSettings, writeRun, readRun } from '../lib/workspace.js';

test('the workspace id defaults to "default" and rejects unsafe values', () => {
  assert.equal(resolveWorkspace(undefined), 'default');
  assert.equal(resolveWorkspace(''), 'default');
  assert.equal(resolveWorkspace('visitor-42'), 'visitor-42');
  for (const bad of ['../etc', 'A', 'has space', 'x'.repeat(41), '-lead', 'a/b']) {
    assert.throws(() => resolveWorkspace(bad), /WORKSPACE_ID/, bad);
  }
});

test('reset clears run state in the current workspace only, and keeps saved settings', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-test-'));
  try {
    const mine = workspaceDir(root, 'alpha');
    const other = workspaceDir(root, 'beta');
    appendTrace(mine, '{"a":1}');
    writeRun(mine, { presenterStep: 3 });
    writeSettings(mine, { speed: 'fast' });
    appendTrace(other, '{"b":1}');
    writeRun(other, { presenterStep: 5 });
    clearRunState(mine);
    assert.deepEqual(readTrace(mine), []);
    assert.deepEqual(readRun(mine), {});
    assert.equal(readSettings(mine).speed, 'fast', 'saved settings survive a reset');
    assert.equal(readTrace(other).length, 1, 'another workspace is untouched');
    assert.equal(readRun(other).presenterStep, 5);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
