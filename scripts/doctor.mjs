#!/usr/bin/env node
// Checks that this app is ready and running. Prints one line per check. Exit 1 if any check fails.
// Offline checks first (Node, content, diagrams, data folder, settings file), then the running app's /api/health.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSharedSettings } from '../lib/settings.js';
import { loadCustomerConfig } from '../lib/customer.js';
import { loadCast, loadStories, resolveDeep } from '../lib/stories.js';
import { parseTalkTrack } from '../lib/talk.js';
import { listDiagrams } from '../lib/diagrams.js';
import { netguardSelfTest } from '../lib/netguard.js';
import { resolveMode } from '../lib/mode.js';
import { resolveWorkspace, workspaceDir } from '../lib/workspace.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shared = loadSharedSettings();
const port = process.env.PORT || '5300';
let failed = false;
const line = (ok, label, detail = '') => {
  if (!ok) failed = true;
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
};
const attempt = (label, fn) => {
  try {
    const detail = fn();
    line(true, label, detail);
  } catch (error) {
    line(false, label, error.message);
  }
};

line(Number(process.versions.node.split('.')[0]) >=26, 'Node 26 or newer', process.version);
attempt('MODE is valid', () => resolveMode(process.env.MODE));
attempt('WORKSPACE_ID is valid', () => resolveWorkspace(process.env.WORKSPACE_ID));
if (shared.found) line(!shared.looseMode, 'shared settings file is mode 600', shared.looseMode ? `chmod 600 ${shared.file}` : shared.file);
else console.log(`note  no shared settings file at ${shared.file}; the app does not need one`);

attempt('customer config, cast, stories and talk track resolve', () => {
  const customer = loadCustomerConfig(process.env.CUSTOMER_CONFIG || path.join(ROOT, 'customer.config.json'));
  const cast = loadCast(path.join(ROOT, 'content', 'cast.json'), customer.vocabulary);
  const stories = loadStories(path.join(ROOT, 'content', 'stories'), cast);
  const steps = resolveDeep(parseTalkTrack(fs.readFileSync(path.join(ROOT, 'docs', 'talk-track.md'), 'utf8')), cast);
  return `${stories.length} stories, ${steps.length} talk-track steps`;
});
attempt('diagrams load and validate', () => {
  const list = listDiagrams();
  const bad = list.filter((d) => !d.available);
  if (bad.length) throw new Error(bad[0].error);
  return list.map((d) => d.id).join(', ');
});
attempt('workspace data folder is writable', () => {
  const dir = workspaceDir(process.env.DATA_ROOT || ROOT, resolveWorkspace(process.env.WORKSPACE_ID));
  fs.mkdirSync(dir, { recursive: true });
  const probe = path.join(dir, '.doctor-probe');
  fs.writeFileSync(probe, 'ok');
  fs.rmSync(probe);
  return dir.replace(ROOT, '.');
});
const guard = await netguardSelfTest();
line(guard.ok, 'netguard self-test', `${guard.checks.filter((c) => c.ok).length} of ${guard.checks.length} checks`);
line(fs.existsSync(path.join(ROOT, 'dist', 'index.html')), 'page is built', 'run npm run build if this fails');

try {
  const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(3000) });
  const body = await res.json();
  line(body.schema === 'demo-health/1' && body.state === 'ready', 'app answers /api/health', `port ${port}, state ${body.state}, runtime ${body.runtime}`);
} catch {
  line(false, 'app answers /api/health', `nothing on port ${port}; run npm start`);
}
process.exit(failed ? 1 : 0);
