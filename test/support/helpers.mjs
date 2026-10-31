import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// Test servers use ports 4770-4779 only. Test files run in parallel, so a taken port moves on to the next one.
export const TEST_PORTS = Array.from({ length: 10 }, (_, i) => 4770 + i);

export function ensureBuilt() {
  if (fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) return;
  const result = spawnSync(process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`vite build failed: ${result.stderr || result.stdout}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Starts server.js as a child process with a private workspace and an outbound log. Resolves when it answers health.
export async function startServer(extraEnv = {}) {
  ensureBuilt();
  const preload = pathToFileURL(path.join(ROOT, 'test', 'support', 'count-outbound.mjs')).href;
  const order = [...TEST_PORTS].sort(() => Math.random() - 0.5);
  for (const port of order) {
    const workspace = `test-${port}-${process.pid}`;
    const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-data-'));
    const outboundLog = path.join(os.tmpdir(), `outbound-${port}-${process.pid}.log`);
    fs.rmSync(outboundLog, { force: true });
    const child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        STANDALONE_ENV: path.join(os.tmpdir(), 'no-shared-env-for-tests'),
        MODE: 'mock',
        PORT: String(port),
        WORKSPACE_ID: workspace,
        DATA_ROOT: dataRoot,
        OUTBOUND_LOG: outboundLog,
        NODE_OPTIONS: `--import ${preload}`,
        ...extraEnv
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    let exited = false;
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    child.once('exit', () => {
      exited = true;
    });
    const base = `http://127.0.0.1:${port}`;
    let up = false;
    let foreign = false;
    for (let i = 0; i < 100 && !exited; i += 1) {
      try {
        // Another test file may already own this port, so only a server that reports our workspace counts as ours.
        const state = await fetch(`${base}/api/state`);
        if (state.ok && (await state.json()).workspace === workspace) {
          up = true;
          break;
        }
        if (state.ok) {
          foreign = true;
          break;
        }
      } catch {
        // not up yet
      }
      await sleep(100);
    }
    if (!up) {
      child.kill('SIGTERM');
      await new Promise((r) => (exited ? r() : child.once('exit', r)));
      fs.rmSync(dataRoot, { recursive: true, force: true });
      if (foreign || /EADDRINUSE/.test(output)) continue;
      throw new Error(`server did not start on ${port}: ${output}`);
    }
    return {
      base,
      port,
      workspace,
      dataRoot,
      dataDir: path.join(dataRoot, '.data', workspace),
      outboundLog,
      output: () => output,
      stop: () =>
        new Promise((resolve) => {
          child.once('exit', () => {
            fs.rmSync(dataRoot, { recursive: true, force: true });
            fs.rmSync(outboundLog, { force: true });
            resolve();
          });
          child.kill('SIGTERM');
        })
    };
  }
  throw new Error('no free test port in 4770-4779');
}
