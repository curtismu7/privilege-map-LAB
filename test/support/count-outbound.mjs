// Preloaded into the server child process (NODE_OPTIONS=--import). Records every outbound socket and fetch
// that does not go to loopback, one line per attempt, in the file named by OUTBOUND_LOG.
// It is installed before the app's own guard, so it sees only what gets past the guard: the count must stay zero.
import fs from 'node:fs';
import net from 'node:net';

const log = process.env.OUTBOUND_LOG;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const record = (what) => {
  if (log) fs.appendFileSync(log, `${what}\n`);
};

const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function patchedConnect(...args) {
  const first = args[0];
  const isPath = typeof first === 'string' || (typeof first === 'object' && first !== null && first.path);
  const host = typeof first === 'object' && first !== null ? first.host : args[1];
  if (!isPath && !LOOPBACK.has(host || 'localhost')) record(`socket ${host}`);
  return originalConnect.apply(this, args);
};

const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = String(input?.url ?? input);
  try {
    const host = new URL(url).hostname;
    if (!LOOPBACK.has(host)) record(`fetch ${host}`);
  } catch {
    record(`fetch ${url}`);
  }
  return originalFetch(input, init);
};
