// Netguard (rules 1 and 2): the only door for outbound requests. This app has no provider, so nothing is ever sent.
//  - guardedFetch: mock mode refuses every call before a socket opens. Live mode (never reachable in this app) would
//    send only to the one origin in settings, over https (loopback http), with no redirects and time and size caps.
//  - installProcessGuard: refuses any fetch or socket connection to a non-loopback host made anywhere in this process.
//  - netguardSelfTest: exercises all of it with stubs. It never touches the network.
export const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const BLOCKED_LITERALS = new Set(['0.0.0.0', '169.254.169.254', '[fd00:ec2::254]', 'fd00:ec2::254']);

export class NetguardError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NetguardError';
  }
}

// Counters since process start. "attempts" counts every guarded call; "sent" counts requests that left the process.
export const netguardCounters = { attempts: 0, refused: 0, sent: 0 };

export function checkUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new NetguardError('not a valid URL');
  }
  if (url.username || url.password) throw new NetguardError('credentials in the URL are refused');
  const host = url.hostname.toLowerCase();
  if (BLOCKED_LITERALS.has(host) || host.startsWith('169.254.') || host.startsWith('fe80:')) {
    throw new NetguardError('link-local and metadata addresses are refused (SSRF guard)');
  }
  if (url.protocol === 'https:') return url;
  if (url.protocol === 'http:' && LOOPBACK.has(host)) return url;
  throw new NetguardError('only https, or http to loopback, is allowed');
}

async function readCapped(response, maxBytes) {
  if (!response.body) return '';
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new NetguardError(`response larger than the ${maxBytes} byte cap`);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new NetguardError(`response larger than the ${maxBytes} byte cap`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// mode 'mock' refuses every call before a socket opens. mode 'live' sends only to allowedOrigin, after the URL checks.
export async function guardedFetch(input, init = {}, { mode, allowedOrigin = '', fetchImpl = globalThis.fetch, timeoutMs = 15000, maxBytes = 1_000_000 } = {}) {
  netguardCounters.attempts += 1;
  if (mode !== 'live') {
    netguardCounters.refused += 1;
    throw new NetguardError('mock mode: outbound requests are refused (no real network)');
  }
  const url = checkUrl(String(input));
  if (!allowedOrigin || url.origin !== allowedOrigin) {
    netguardCounters.refused += 1;
    throw new NetguardError('only the one configured origin may be called');
  }
  const response = await fetchImpl(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
  netguardCounters.sent += 1;
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    throw new NetguardError(`redirect ${response.status} refused (no redirects are followed)`);
  }
  const text = await readCapped(response, maxBytes);
  return { status: response.status, ok: response.ok, headers: response.headers, text };
}

export function isLoopbackHost(host) {
  const h = String(host ?? 'localhost').toLowerCase();
  return LOOPBACK.has(h) || LOOPBACK.has(`[${h}]`) || /^127\.\d+\.\d+\.\d+$/.test(h);
}

// Wraps a fetch so a non-loopback URL is refused before the real fetch is called.
export function wrapFetch(realFetch) {
  return function guardedGlobalFetch(input, init) {
    netguardCounters.attempts += 1;
    let host;
    try {
      host = new URL(String(input?.url ?? input)).hostname;
    } catch {
      netguardCounters.refused += 1;
      throw new NetguardError('not a valid URL');
    }
    if (!isLoopbackHost(host)) {
      netguardCounters.refused += 1;
      throw new NetguardError(`outbound fetch to ${host} refused: this app only talks to loopback`);
    }
    return realFetch(input, init);
  };
}

// Works out which host a Socket.prototype.connect call is aimed at, or null for a local (IPC) socket.
// Node's own net.connect(), net.createConnection() and the http agent hand connect() ONE argument: an array
// [options, callback] that net.normalizeArgs built. A direct socket.connect() passes (options), (port, host) or (path).
export function connectTarget(args) {
  const list = Array.isArray(args[0]) ? args[0] : args;
  const first = list[0];
  if (first !== null && typeof first === 'object') return first.path ? null : first.host || 'localhost';
  if (typeof first === 'string' && !/^\d+$/.test(first)) return null; // a path: unix socket or named pipe
  return typeof list[1] === 'string' && list[1] ? list[1] : 'localhost'; // (port[, host])
}

// Wraps Socket.prototype.connect so a non-loopback TCP connection is refused before it opens.
export function wrapConnect(realConnect) {
  return function guardedConnect(...args) {
    const host = connectTarget(args);
    if (host !== null && !isLoopbackHost(host)) {
      netguardCounters.attempts += 1;
      netguardCounters.refused += 1;
      throw new NetguardError(`outbound connection to ${host} refused: this app only talks to loopback`);
    }
    return realConnect.apply(this, args);
  };
}

let installed = false;
export function installProcessGuard(net) {
  if (installed) return;
  installed = true;
  globalThis.fetch = wrapFetch(globalThis.fetch);
  net.Socket.prototype.connect = wrapConnect(net.Socket.prototype.connect);
}

// Self-test: exercises the guard with stubs. It never touches the network.
export async function netguardSelfTest() {
  const saved = { ...netguardCounters };
  try {
    return await runSelfTest();
  } finally {
    Object.assign(netguardCounters, saved); // the self-test's own stub calls are not app traffic
  }
}

async function runSelfTest() {
  const checks = [];
  const stubHits = { count: 0 };
  const stub = async () => {
    stubHits.count += 1;
    return new Response('ok', { status: 200 });
  };
  // A refusal counts only when it is a NetguardError that says the expected thing, so a call refused for
  // some other reason cannot hide a guard that has stopped working.
  const expectRefused = async (name, fn, because = /./) => {
    try {
      await fn();
      checks.push({ name, ok: false, detail: 'was allowed' });
    } catch (error) {
      checks.push({ name, ok: error instanceof NetguardError && because.test(error.message), detail: error.message });
    }
  };
  const live = { mode: 'live', allowedOrigin: 'https://idp.example.invalid', fetchImpl: stub };
  await expectRefused('mock mode refuses every call', () => guardedFetch('https://idp.example.invalid/x', {}, { mode: 'mock', fetchImpl: stub }), /mock mode/);
  await expectRefused('mock mode refuses loopback too', () => guardedFetch('http://127.0.0.1:9/x', {}, { mode: 'mock', fetchImpl: stub }), /mock mode/);
  checks.push({ name: 'mock mode made zero stub calls', ok: stubHits.count === 0, detail: `${stubHits.count} calls` });
  await expectRefused('live mode refuses an origin that is not the configured one', () => guardedFetch('https://other.example.invalid/x', {}, live), /configured origin/);
  await expectRefused('plain http to a public name is refused', () => guardedFetch('http://idp.example.invalid/x', {}, live), /https/);
  await expectRefused('metadata address is refused', () => guardedFetch('https://169.254.169.254/latest', {}, live), /SSRF/);
  await expectRefused('credentials in URL are refused', () => guardedFetch('https://user:pass@idp.example.invalid/x', {}, live), /credentials/);
  await expectRefused('redirects are refused', () =>
    guardedFetch('https://idp.example.invalid/x', {}, { ...live, fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://elsewhere.example.invalid/' } }) }),
    /redirect/
  );
  await expectRefused('oversized body is refused', () => guardedFetch('https://idp.example.invalid/x', {}, { ...live, maxBytes: 4, fetchImpl: async () => new Response('0123456789') }), /byte cap/);
  try {
    const ok = await guardedFetch('https://idp.example.invalid/x', {}, live);
    checks.push({ name: 'the configured https origin is allowed', ok: ok.status === 200, detail: `status ${ok.status}` });
  } catch (error) {
    checks.push({ name: 'the configured https origin is allowed', ok: false, detail: error.message });
  }
  // The process-wide guard, with a stub standing in for the real fetch and connect.
  const before = stubHits.count;
  const wrapped = wrapFetch(stub);
  await expectRefused('process guard refuses a fetch to a public name', async () => wrapped('https://public.example.invalid/'), /loopback/);
  checks.push({ name: 'process guard never reached the real fetch', ok: stubHits.count === before, detail: `${stubHits.count - before} calls` });
  try {
    const res = await wrapped('http://127.0.0.1:9/ping');
    checks.push({ name: 'process guard lets loopback through', ok: res.status === 200, detail: `status ${res.status}` });
  } catch (error) {
    checks.push({ name: 'process guard lets loopback through', ok: false, detail: error.message });
  }
  let connects = 0;
  const wrappedConnect = wrapConnect(() => {
    connects += 1;
  });
  await expectRefused('process guard refuses a socket to a public host', async () => wrappedConnect({ host: 'public.example.invalid', port: 443 }), /loopback/);
  wrappedConnect({ host: '127.0.0.1', port: 9 });
  checks.push({ name: 'process guard lets only the loopback socket through', ok: connects === 1, detail: `${connects} connects` });
  // net.connect(), net.createConnection() and http pass connect() a normalized [options, callback] array.
  await expectRefused('process guard refuses a normalized-args socket to a public host', async () => wrappedConnect([{ host: 'public.example.invalid', port: 443 }, null]), /loopback/);
  await expectRefused('process guard refuses connect(port, host) to a public host', async () => wrappedConnect(443, 'public.example.invalid'), /loopback/);
  wrappedConnect([{ port: 9 }, null]);
  checks.push({ name: 'process guard lets a normalized-args loopback socket through', ok: connects === 2, detail: `${connects} connects` });
  return { schema: 'netguard-selftest/1', ok: checks.every((c) => c.ok), checks };
}
