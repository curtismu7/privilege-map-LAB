import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { guardedFetch, netguardSelfTest, netguardCounters, checkUrl, wrapFetch, wrapConnect, NetguardError } from '../lib/netguard.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'lib', 'netguard.js'), 'utf8');

test('the netguard self-test passes and touches no network', async () => {
  const result = await netguardSelfTest();
  assert.equal(result.schema, 'netguard-selftest/1');
  assert.equal(result.ok, true, JSON.stringify(result.checks.filter((c) => !c.ok)));
  assert.ok(result.checks.length >= 12);
});

test('mock mode makes zero outbound attempts: the stub fetch is never called', async () => {
  let calls = 0;
  const stub = async () => {
    calls += 1;
    return new Response('x', { status: 200 });
  };
  const before = { ...netguardCounters };
  await assert.rejects(() => guardedFetch('https://idp.example.invalid/x', {}, { mode: 'mock', fetchImpl: stub }), NetguardError);
  await assert.rejects(() => guardedFetch('http://127.0.0.1:9/x', {}, { mode: 'mock', fetchImpl: stub }), NetguardError);
  assert.equal(calls, 0);
  assert.equal(netguardCounters.sent, before.sent);
});

test('URL rules: https, loopback http only, no credentials, no metadata address', () => {
  assert.ok(checkUrl('https://idp.example.invalid/x'));
  assert.ok(checkUrl('http://127.0.0.1:11434/api'));
  assert.ok(checkUrl('http://localhost:9/x'));
  assert.throws(() => checkUrl('http://idp.example.invalid/x'), NetguardError);
  assert.throws(() => checkUrl('https://169.254.169.254/latest/meta-data'), NetguardError);
  assert.throws(() => checkUrl('https://user:secret@idp.example.invalid/'), NetguardError);
  assert.throws(() => checkUrl('ftp://idp.example.invalid/'), NetguardError);
  assert.throws(() => checkUrl('not a url'), NetguardError);
});

test('live mode (not reachable in this app) sends only to the one configured origin, with no redirects and a size cap', async () => {
  const allowedOrigin = 'https://idp.example.invalid';
  const stub = async () => new Response('ok');
  await assert.rejects(() => guardedFetch('https://other.example.invalid/x', {}, { mode: 'live', allowedOrigin, fetchImpl: stub }), /configured origin/);
  await assert.rejects(() => guardedFetch('https://idp.example.invalid/x', {}, { mode: 'live', fetchImpl: stub }), /configured origin/);
  assert.equal((await guardedFetch('https://idp.example.invalid/x', {}, { mode: 'live', allowedOrigin, fetchImpl: stub })).status, 200);
  await assert.rejects(
    () => guardedFetch('https://idp.example.invalid/x', {}, { mode: 'live', allowedOrigin, fetchImpl: async () => new Response(null, { status: 301, headers: { location: 'https://o.example.invalid/' } }) }),
    /redirect 301 refused/
  );
  await assert.rejects(() => guardedFetch('https://idp.example.invalid/x', {}, { mode: 'live', allowedOrigin, maxBytes: 3, fetchImpl: async () => new Response('0123456789') }), /byte cap/);
});

test('the process guard refuses a non-loopback fetch and socket, and lets loopback through', async () => {
  let reached = 0;
  const fetchGuard = wrapFetch(async () => {
    reached += 1;
    return new Response('ok');
  });
  await assert.rejects(async () => fetchGuard('https://public.example.invalid/'), NetguardError);
  assert.equal(reached, 0);
  assert.equal((await fetchGuard('http://127.0.0.1:1/')).status, 200);
  assert.equal((await fetchGuard('http://localhost:1/')).status, 200);
  let connects = 0;
  const connectGuard = wrapConnect(() => {
    connects += 1;
  });
  assert.throws(() => connectGuard({ host: 'public.example.invalid', port: 443 }), NetguardError);
  assert.throws(() => connectGuard(443, '203.0.113.9'), NetguardError);
  connectGuard({ host: '127.0.0.1', port: 1 });
  connectGuard({ path: '/tmp/some.sock' });
  assert.equal(connects, 2);
});

test('in a real process, a fetch to a public name is refused before any socket opens', () => {
  const log = path.join(os.tmpdir(), `guard-proof-${process.pid}.log`);
  fs.rmSync(log, { force: true });
  const script = `
    import net from 'node:net';
    import { installProcessGuard, NetguardError } from './lib/netguard.js';
    installProcessGuard(net);
    try { await fetch('https://public.example.invalid/'); console.log('ALLOWED'); }
    catch (e) { console.log(e instanceof NetguardError ? 'REFUSED' : 'OTHER ' + e.message); }
  `;
  const preload = pathToFileURL(path.join(ROOT, 'test', 'support', 'count-outbound.mjs')).href;
  const run = spawnSync(process.execPath, ['--import', preload, '--input-type=module', '-e', script], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, OUTBOUND_LOG: log } });
  assert.match(run.stdout, /REFUSED/, run.stderr);
  assert.equal(fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '', '');
  fs.rmSync(log, { force: true });
});

// Mutation proof: each edit below breaks one guard. The self-test must notice every one of them,
// otherwise "the self-test passes" proves nothing.
const MUTATIONS = [
  ['mock mode lets calls through', "if (mode !== 'live') {", 'if (false) {'],
  ['live mode accepts any origin', "if (!allowedOrigin || url.origin !== allowedOrigin) {", 'if (false) {'],
  ['redirects are followed', 'if (response.status >= 300 && response.status < 400) {', 'if (false) {'],
  ['the body size cap is gone', 'if (total > maxBytes) {', 'if (false) {'],
  ['the process fetch guard lets public names through', 'if (!isLoopbackHost(host)) {\n      netguardCounters.refused += 1;\n      throw new NetguardError(`outbound fetch', 'if (false) {\n      netguardCounters.refused += 1;\n      throw new NetguardError(`outbound fetch'],
  ['the process socket guard lets public hosts through', "if (!isLoopbackHost(host || 'localhost')) {", 'if (false) {'],
  ['credentials in the URL are accepted', 'if (url.username || url.password) throw', 'if (false) throw']
];

for (const [name, from, to] of MUTATIONS) {
  test(`mutation proof: the self-test fails when ${name}`, async () => {
    assert.ok(SOURCE.includes(from), `mutation target not found: ${from}`);
    const file = path.join(os.tmpdir(), `netguard-mutant-${process.pid}-${Math.random().toString(36).slice(2)}.mjs`);
    fs.writeFileSync(file, SOURCE.replace(from, to));
    try {
      const mutant = await import(pathToFileURL(file).href);
      const result = await mutant.netguardSelfTest();
      assert.equal(result.ok, false, `the self-test did not notice: ${name}`);
    } finally {
      fs.rmSync(file, { force: true });
    }
  });
}
