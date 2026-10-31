#!/usr/bin/env node
// Clears run state (trace and presenter position) for the current workspace. Saved settings are kept.
// If the app is running it is asked to do it; if not, the workspace files are cleared directly. Usage: npm run reset
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSharedSettings } from '../lib/settings.js';
import { clearRunState, resolveWorkspace, workspaceDir } from '../lib/workspace.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadSharedSettings();
const port = process.env.PORT || '5300';
const workspace = resolveWorkspace(process.env.WORKSPACE_ID);
try {
  const res = await fetch(`http://127.0.0.1:${port}/api/reset`, { method: 'POST', signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  console.log(`reset: workspace "${workspace}" run state cleared by the running app; saved settings kept`);
} catch {
  clearRunState(workspaceDir(process.env.DATA_ROOT || ROOT, workspace));
  console.log(`reset: app not running on port ${port}; workspace "${workspace}" files cleared; saved settings kept`);
}
