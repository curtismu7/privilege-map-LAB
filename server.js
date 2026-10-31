// Privilege Map LAB server: serves the built page and a small JSON API. Plain node:http, no framework.
// Mock mode is the only mode: everything is in-process content, and netguard refuses any non-loopback traffic.
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSharedSettings } from './lib/settings.js';
import { installProcessGuard, netguardCounters, netguardSelfTest } from './lib/netguard.js';
import { resolveMode, LIVE_AVAILABLE, NO_LIVE_REASON } from './lib/mode.js';
import { loadCustomerConfig } from './lib/customer.js';
import { loadCast, loadStories, resolveDeep } from './lib/stories.js';
import { parseTalkTrack } from './lib/talk.js';
import { listDiagrams, loadDiagramByName, DEMO_DIAGRAMS } from './lib/diagrams.js';
import { resolveWorkspace, workspaceDir, appendTrace, readTrace, clearRunState, readRun, writeRun, readSettings, writeSettings } from './lib/workspace.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const APP = { id: 'privilege-map', name: 'Privilege Map LAB', version: '1.0.0' };

// Shared settings: ~/Development/.env, or STANDALONE_ENV. Only this app's keys are read (lib/settings.js).
const shared = loadSharedSettings();

installProcessGuard(net);

const HOST = '127.0.0.1';
// The Docker image sets BIND_HOST=0.0.0.0 and publishes 127.0.0.1 only.
const BIND_HOST = process.env.BIND_HOST || HOST;
const PORT = Number(process.env.PORT) || 5300;
const DEV = process.argv.includes('--dev');
const DIST = path.join(ROOT, 'dist');

let MODE;
let WORKSPACE;
try {
  MODE = resolveMode(process.env.MODE);
  WORKSPACE = resolveWorkspace(process.env.WORKSPACE_ID);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const DATA_DIR = workspaceDir(process.env.DATA_ROOT || ROOT, WORKSPACE);

// Content is resolved once at startup. A bad token or diagram makes health say "broken" instead of serving a half page.
const problems = [];
let CUSTOMER = loadCustomerConfig(null);
let STORIES = [];
let TALK = [];
try {
  CUSTOMER = loadCustomerConfig(process.env.CUSTOMER_CONFIG || path.join(ROOT, 'customer.config.json'));
  const cast = loadCast(path.join(ROOT, 'content', 'cast.json'), CUSTOMER.vocabulary);
  STORIES = loadStories(path.join(ROOT, 'content', 'stories'), cast);
  TALK = resolveDeep(parseTalkTrack(fs.readFileSync(path.join(ROOT, 'docs', 'talk-track.md'), 'utf8')), cast);
} catch (error) {
  problems.push(error.message);
}
for (const d of listDiagrams()) if (!d.available) problems.push(d.error);

const PUBLIC_PORTS = new Set([String(PORT), process.env.HOST_PORT].filter(Boolean));
const ALLOWED_HOSTS = new Set([...PUBLIC_PORTS].flatMap((p) => [`127.0.0.1:${p}`, `localhost:${p}`]));
const ALLOWED_ORIGINS = new Set([...PUBLIC_PORTS].flatMap((p) => [`http://127.0.0.1:${p}`, `http://localhost:${p}`]));
const SPEEDS = ['slow', 'normal', 'fast'];
const PAGES = ['map', 'identity', 'llm', 'mcp', 'oversight', 'platform', 'stories'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

// Everything the page loads comes from this origin. Fonts are bundled, so the browser makes no outside request either.
const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

const nowIso = () => new Date().toISOString();

function trace(type, payload = {}) {
  try {
    appendTrace(DATA_DIR, JSON.stringify({ ts: nowIso(), type, ...payload }));
  } catch {
    // The trace is a convenience; an unwritable disk must not stop the demo.
  }
}

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(payload));
}

function parseBody(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit + 1024 * 1024) req.destroy(); // a client that keeps sending after the refusal is cut off
      if (size > limit) {
        chunks.length = 0;
        reject(new Error('body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {});
      } catch {
        reject(new Error('body is not valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function state() {
  return {
    mode: MODE,
    liveAvailable: LIVE_AVAILABLE,
    liveReason: LIVE_AVAILABLE ? '' : NO_LIVE_REASON,
    workspace: WORKSPACE,
    customer: CUSTOMER,
    run: readRun(DATA_DIR),
    settings: readSettings(DATA_DIR),
    problems
  };
}

function health() {
  const needsBuild = !DEV && !fs.existsSync(path.join(DIST, 'index.html'));
  const status = problems.length ? 'broken' : needsBuild ? 'needs-setup' : 'ready';
  return { schema: 'demo-health/1', at: nowIso(), state: status, runtime: MODE === 'live' ? 'live' : 'offline', demo: APP };
}

function sendFile(res, file) {
  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    const type = MIME[path.extname(file)] || 'application/octet-stream';
    const cache = file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache, 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    res.end(data);
  });
}

function serveStatic(res, pathname) {
  const rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.resolve(DIST, rel || 'index.html');
  if (file !== DIST && !file.startsWith(DIST + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }
  // A path with an extension that is not on disk is a 404. Any other path is a page route, so it gets the app.
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return sendFile(res, file);
  if (path.extname(rel)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }
  return sendFile(res, path.join(DIST, 'index.html'));
}

async function handleApi(req, res, url) {
  const route = `${req.method} ${url.pathname}`;
  switch (route) {
    case 'GET /api/health':
      return json(res, 200, health());
    case 'GET /api/state':
      return json(res, 200, state());
    case 'GET /api/talk-track':
      return json(res, 200, { steps: TALK });
    case 'GET /api/stories':
      return json(res, 200, { stories: STORIES });
    case 'GET /api/diagrams':
      return json(res, 200, { source: 'diagrams/*.json (diagram-studio/1 data)', diagrams: listDiagrams() });
    case 'GET /api/netguard':
      return json(res, 200, { mode: MODE, counters: { ...netguardCounters }, selfTest: await netguardSelfTest() });
    case 'GET /api/trace':
      return json(res, 200, { workspace: WORKSPACE, lines: readTrace(DATA_DIR) });
    case 'POST /api/reset':
      clearRunState(DATA_DIR);
      trace('reset');
      return json(res, 200, { ok: true, workspace: WORKSPACE });
    case 'POST /api/mode': {
      const body = await parseBody(req);
      if (body.mode !== 'mock' && body.mode !== 'live') return json(res, 400, { error: 'mode must be "mock" or "live"' });
      if (body.mode === 'live') {
        trace('mode-refused', { requested: 'live' });
        return json(res, 409, { error: NO_LIVE_REASON, mode: MODE, liveAvailable: LIVE_AVAILABLE });
      }
      return json(res, 200, { ok: true, mode: MODE, liveAvailable: LIVE_AVAILABLE });
    }
    case 'POST /api/run': {
      const body = await parseBody(req);
      const run = readRun(DATA_DIR);
      if (body.presenterStep !== undefined) {
        if (!Number.isInteger(body.presenterStep) || body.presenterStep < 0 || body.presenterStep >= Math.max(TALK.length, 1)) return json(res, 400, { error: 'presenterStep is out of range' });
        run.presenterStep = body.presenterStep;
      }
      if (body.page !== undefined) {
        if (!PAGES.includes(body.page)) return json(res, 400, { error: 'unknown page' });
        run.page = body.page;
      }
      writeRun(DATA_DIR, run);
      return json(res, 200, { ok: true, run });
    }
    case 'POST /api/settings': {
      const body = await parseBody(req);
      const settings = readSettings(DATA_DIR);
      if (body.speed !== undefined) {
        if (!SPEEDS.includes(body.speed)) return json(res, 400, { error: `speed must be one of ${SPEEDS.join(', ')}` });
        settings.speed = body.speed;
      }
      writeSettings(DATA_DIR, settings);
      return json(res, 200, { ok: true, settings });
    }
    default:
  }
  const diagram = /^\/api\/diagrams\/([a-z0-9-]+)$/.exec(url.pathname);
  if (req.method === 'GET' && diagram && DEMO_DIAGRAMS.includes(diagram[1])) {
    try {
      return json(res, 200, loadDiagramByName(diagram[1]));
    } catch (error) {
      return json(res, 500, { error: error.message });
    }
  }
  return json(res, 404, { error: 'not found' });
}

let vite = null;

const server = http.createServer(async (req, res) => {
  if (!ALLOWED_HOSTS.has(req.headers.host || '')) {
    res.writeHead(421, { 'Content-Type': 'text/plain' });
    res.end('Misdirected request: use http://127.0.0.1');
    return;
  }
  const isRead = req.method === 'GET' || req.method === 'HEAD';
  if (!isRead && !(ALLOWED_ORIGINS.has(req.headers.origin) || !req.headers.origin)) {
    json(res, 403, { error: 'Cross-origin writes are refused.' });
    return;
  }
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host}`);
  } catch {
    json(res, 400, { error: 'bad URL' });
    return;
  }
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (!isRead) {
      json(res, 405, { error: 'method not allowed' });
      return;
    }
    if (vite) return vite.middlewares(req, res, () => json(res, 404, { error: 'not found' }));
    return serveStatic(res, url.pathname);
  } catch (error) {
    if (error.message === 'body too large') res.setHeader('Connection', 'close');
    json(res, error.message === 'body too large' ? 413 : 400, { error: error.message });
  }
});

if (DEV) {
  // Development: Vite runs inside this server (page and hot reload on the same port), as middleware.
  const { createServer } = await import('vite');
  vite = await createServer({ root: ROOT, appType: 'spa', server: { middlewareMode: true, hmr: { server } } });
}

server.listen(PORT, BIND_HOST, () => {
  console.log(`${APP.name} on http://${HOST}:${PORT} (mode ${MODE}, workspace ${WORKSPACE}${DEV ? ', dev' : ''})`);
  if (shared.loaded.length) console.log(`settings read from ${shared.file}: ${shared.loaded.join(', ')}`);
  if (shared.looseMode) console.warn(`${shared.file} is readable by other users; run: chmod 600 ${shared.file}`);
  for (const p of problems) console.warn(`problem: ${p}`);
});
