// Stories are data (rule 10). Text uses {{cast.<role>}} tokens resolved from content/cast.json.
// customer.config vocabulary may rename a role. An undefined token is an error: a test fails on it,
// and the server refuses to start with it.
import fs from 'node:fs';
import path from 'node:path';

const TOKEN_RE = /\{\{\s*([^{}]*?)\s*\}\}/g;

export function loadCast(file, overrides = {}) {
  const cast = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [role, name] of Object.entries(cast)) {
    if (typeof name !== 'string' || !name.trim()) throw new Error(`cast role "${role}" needs a name`);
  }
  // Vocabulary can rename a role that exists. It cannot add one: an unknown key is ignored.
  for (const [role, name] of Object.entries(overrides)) {
    if (Object.hasOwn(cast, role) && typeof name === 'string' && name.trim()) cast[role] = name.trim();
  }
  return cast;
}

// Every token in a string, as the raw inner text (e.g. "cast.agent").
export function tokensIn(text) {
  return [...String(text).matchAll(TOKEN_RE)].map((m) => m[1]);
}

export function resolveText(text, cast) {
  return String(text).replace(TOKEN_RE, (whole, inner, offset, source) => {
    const m = /^cast\.([a-z][a-z0-9_]*)$/.exec(inner);
    if (!m || !Object.hasOwn(cast, m[1])) throw new Error(`undefined token: {{${inner}}}`);
    const name = cast[m[1]];
    // A name that opens a sentence starts with a capital letter.
    const opensSentence = /(^|[.!?:]\s+|\n\s*)$/.test(source.slice(0, offset));
    return opensSentence ? name.charAt(0).toUpperCase() + name.slice(1) : name;
  });
}

export function resolveDeep(value, cast) {
  if (typeof value === 'string') return resolveText(value, cast);
  if (Array.isArray(value)) return value.map((v) => resolveDeep(v, cast));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveDeep(v, cast)]));
  }
  return value;
}

export function loadStories(dir, cast) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => resolveDeep(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), cast));
}
