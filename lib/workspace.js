// Workspace id (rule 13). Scopes the per-run data directory: trace, run state and saved (non-secret) settings.
// Reset clears the current workspace's trace and run state only. Saved settings and other workspaces are kept.
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_WORKSPACE = 'default';
const WORKSPACE_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const TRACE_CAP_BYTES = 1_000_000;

export function resolveWorkspace(value) {
  const id = value === undefined || value === '' ? DEFAULT_WORKSPACE : String(value);
  if (!WORKSPACE_RE.test(id)) {
    throw new Error('WORKSPACE_ID must be 1 to 40 lowercase letters, digits or dashes');
  }
  return id;
}

export function workspaceDir(root, workspaceId) {
  return path.join(root, '.data', resolveWorkspace(workspaceId));
}

function readJson(dir, name) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeJson(dir, name, value) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), `${JSON.stringify(value, null, 2)}\n`);
}

export function appendTrace(dir, line) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'trace.ndjson');
  try {
    if (fs.statSync(file).size > TRACE_CAP_BYTES) fs.truncateSync(file, 0);
  } catch {
    // no trace yet
  }
  fs.appendFileSync(file, `${line}\n`);
}

export function readTrace(dir, limit = 50) {
  try {
    return fs.readFileSync(path.join(dir, 'trace.ndjson'), 'utf8').split('\n').filter(Boolean).slice(-limit);
  } catch {
    return [];
  }
}

export const readSettings = (dir) => readJson(dir, 'settings.json');
export const writeSettings = (dir, settings) => writeJson(dir, 'settings.json', settings);
export const readRun = (dir) => readJson(dir, 'run.json');
export const writeRun = (dir, run) => writeJson(dir, 'run.json', run);

// Run state is what a visitor did in this workspace: the trace and where they were in the presenter. Settings stay.
export function clearRunState(dir) {
  fs.rmSync(path.join(dir, 'trace.ndjson'), { force: true });
  fs.rmSync(path.join(dir, 'run.json'), { force: true });
}
