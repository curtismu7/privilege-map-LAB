import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { startServer } from './support/helpers.mjs';

// One server for the whole file: a real child process in MODE=mock, with an outbound recorder loaded into it.
let app;
test.before(async () => {
  app = await startServer();
});
test.after(async () => {
  if (app) await app.stop();
});

const post = (p, body = {}, headers = {}) =>
  fetch(`${app.base}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

const rawGet = (host, p = '/api/health') =>
  new Promise((resolve, reject) => {
    const req = http.request(`${app.base}${p}`, { headers: host ? { Host: host } : {} }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', reject);
    req.end();
  });

test('health answers demo-health/1: public, small, no secrets', async () => {
  const res = await fetch(`${app.base}/api/health`);
  const text = await res.text();
  const body = JSON.parse(text);
  assert.equal(res.status, 200);
  assert.equal(body.schema, 'demo-health/1');
  assert.equal(body.state, 'ready');
  assert.equal(body.runtime, 'offline');
  assert.deepEqual(Object.keys(body.demo).sort(), ['id', 'name', 'version']);
  assert.match(body.demo.name, /LAB$/);
  assert.ok(text.length < 4096);
  assert.ok(!Number.isNaN(Date.parse(body.at)));
});

test('health is GET only', async () => {
  const res = await post('/api/health');
  assert.equal(res.status, 404);
});

test('state reports mock mode, no live mode, the workspace and the customer branding', async () => {
  const s = await (await fetch(`${app.base}/api/state`)).json();
  assert.equal(s.mode, 'mock');
  assert.equal(s.liveAvailable, false);
  assert.match(s.liveReason, /no live mode/);
  assert.equal(s.workspace, app.workspace);
  assert.match(s.customer.branding.productName, /LAB$/);
  assert.deepEqual(s.problems, []);
});

test('live mode cannot be switched on: the toggle is refused with the reason', async () => {
  const res = await post('/api/mode', { mode: 'live' });
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.match(body.error, /no live mode/);
  assert.equal(body.mode, 'mock');
  assert.equal((await post('/api/mode', { mode: 'nonsense' })).status, 400);
  assert.equal((await post('/api/mode', { mode: 'mock' })).status, 200);
});

test('the whole API runs with zero outbound attempts: the guard counters and the socket recorder both read zero', async () => {
  await (await fetch(`${app.base}/api/stories`)).json();
  await (await fetch(`${app.base}/api/diagrams/nhi-checks`)).json();
  const net = await (await fetch(`${app.base}/api/netguard`)).json();
  assert.equal(net.mode, 'mock');
  assert.deepEqual(net.counters, { attempts: 0, refused: 0, sent: 0 });
  assert.equal(net.selfTest.ok, true);
  // The running server must have the process guard installed on fetch and on sockets (server.js calls installProcessGuard).
  assert.deepEqual(net.processGuard, { fetch: true, connect: true });
  const outbound = fs.existsSync(app.outboundLog) ? fs.readFileSync(app.outboundLog, 'utf8').trim() : '';
  assert.equal(outbound, '', `outbound attempts in mock mode:\n${outbound}`);
});

test('a foreign Host header gets 421 and a foreign Origin write gets 403', async () => {
  assert.equal(await rawGet('evil.example.invalid'), 421);
  const res = await post('/api/reset', {}, { Origin: 'http://evil.example.invalid' });
  assert.equal(res.status, 403);
  assert.equal((await post('/api/reset', {}, { Origin: app.base })).status, 200);
});

test('talk track, stories and diagrams are served, with every cast token resolved', async () => {
  const talk = await (await fetch(`${app.base}/api/talk-track`)).json();
  assert.ok(talk.steps.length >= 8);
  const stories = await (await fetch(`${app.base}/api/stories`)).json();
  assert.equal(stories.stories.length, 3);
  assert.doesNotMatch(JSON.stringify([talk, stories]), /\{\{|\}\}/);
  const list = await (await fetch(`${app.base}/api/diagrams`)).json();
  assert.deepEqual(list.diagrams.map((d) => d.id), ['nhi-entity', 'nhi-checks']);
  const one = await (await fetch(`${app.base}/api/diagrams/nhi-entity`)).json();
  assert.equal(one.schema, 'diagram-studio/1');
  assert.equal((await fetch(`${app.base}/api/diagrams/not-ours`)).status, 404);
});

test('run state and settings are saved per workspace, and reset clears the run but keeps the settings', async () => {
  assert.equal((await post('/api/run', { presenterStep: 2, page: 'identity' })).status, 200);
  assert.equal((await post('/api/settings', { speed: 'fast' })).status, 200);
  let s = await (await fetch(`${app.base}/api/state`)).json();
  assert.equal(s.run.presenterStep, 2);
  assert.equal(s.settings.speed, 'fast');
  assert.ok(fs.existsSync(app.dataDir), 'data lives in this workspace folder');
  const reset = await (await post('/api/reset')).json();
  assert.equal(reset.workspace, app.workspace);
  s = await (await fetch(`${app.base}/api/state`)).json();
  assert.deepEqual(s.run, {});
  assert.equal(s.settings.speed, 'fast');
});

test('bad run and settings values are refused', async () => {
  assert.equal((await post('/api/run', { presenterStep: 999 })).status, 400);
  assert.equal((await post('/api/run', { presenterStep: 'x' })).status, 400);
  assert.equal((await post('/api/run', { page: '../etc' })).status, 400);
  assert.equal((await post('/api/settings', { speed: 'warp' })).status, 400);
  const big = await fetch(`${app.base}/api/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: 'x'.repeat(40000) }) });
  assert.equal(big.status, 413);
});

test('the page is served from this app with a CSP that allows only this origin, and no external link', async () => {
  const res = await fetch(`${app.base}/`);
  const page = await res.text();
  assert.equal(res.status, 200);
  assert.match(page, /<title>Privilege Map LAB<\/title>/);
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.doesNotMatch(page, /https?:\/\/(?!127\.0\.0\.1|localhost)/, 'the page links to nothing outside this machine');
  const deep = await fetch(`${app.base}/stories`);
  assert.equal(deep.status, 200, 'a page route gets the app');
  assert.equal((await fetch(`${app.base}/nope.js`)).status, 404);
});

test('path traversal never reads outside dist', async () => {
  const res = await fetch(`${app.base}/%2e%2e/%2e%2e/server.js`);
  const text = await res.text();
  assert.doesNotMatch(text, /createServer/);
});

test('a method other than GET on a page route is refused', async () => {
  const res = await fetch(`${app.base}/`, { method: 'POST' });
  assert.equal(res.status, 405);
});

test('the trace for this workspace records the reset', async () => {
  await post('/api/reset');
  const t = await (await fetch(`${app.base}/api/trace`)).json();
  assert.equal(t.workspace, app.workspace);
  assert.ok(t.lines.some((l) => JSON.parse(l).type === 'reset'));
});
