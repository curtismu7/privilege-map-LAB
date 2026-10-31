// Shared settings loader (rule: one settings file for every standalone app).
// File: ~/Development/.env, or the path in STANDALONE_ENV. Only the keys this app uses are read.
// Every other line is skipped before its value is looked at, so admin and worker credentials that may sit
// in a neighbouring file are never read into this process, and a key already set in the environment wins.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The keys this app reads from the shared file. All are optional.
export const SHARED_KEYS = ['MODE', 'WORKSPACE_ID', 'CUSTOMER_CONFIG'];

export function sharedEnvPath(env = process.env) {
  return env.STANDALONE_ENV || path.join(os.homedir(), 'Development', '.env');
}

function unquote(value) {
  const v = value.trim();
  if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v.at(-1) === v[0]) return v.slice(1, -1);
  return v.replace(/\s+#.*$/, '');
}

// Returns only the allowed keys found in the text. Other lines are never parsed beyond their key name.
export function parseAllowed(text, allowed = SHARED_KEYS) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (!m || !allowed.includes(m[1])) continue;
    out[m[1]] = unquote(line.slice(m[0].length));
  }
  return out;
}

// Loads the allowed keys into env (never overriding a key that is already set). Returns what happened, never values.
export function loadSharedSettings({ env = process.env, file = sharedEnvPath(env) } = {}) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return { file, found: false, loaded: [], looseMode: false };
  }
  let looseMode = false;
  try {
    looseMode = (fs.statSync(file).mode & 0o077) !== 0;
  } catch {
    // stat failed after a successful read: treat as unknown
  }
  const loaded = [];
  for (const [key, value] of Object.entries(parseAllowed(text))) {
    if (env[key] === undefined && value !== '') {
      env[key] = value;
      loaded.push(key);
    }
  }
  return { file, found: true, loaded, looseMode };
}
