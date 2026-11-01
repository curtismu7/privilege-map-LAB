// Repo-level checks: the files that make this a standalone LAB app are present and say the right things.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_DIAGRAMS } from '../lib/diagrams.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const SKIP = new Set(['node_modules', 'dist', '.git', '.data', 'e2e-output']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const files = walk(ROOT);
const textFiles = files.filter((f) => /\.(m?js|jsx|json|md|ya?ml|html|css|sh)$/.test(f) && !f.endsWith('package-lock.json'));

test('Docker publishes 127.0.0.1 only', () => {
  const compose = read('docker-compose.yml');
  const ports = [...compose.matchAll(/^\s*-\s*"?([^"\n]*:\d+(?::\d+)?)"?\s*$/gm)].map((m) => m[1]);
  assert.ok(ports.length >= 1);
  for (const p of ports) assert.match(p, /^127\.0\.0\.1:/, `published port ${p}`);
  assert.match(compose, /read_only: true/);
});

test('the shelf entry has a catalog-free id, kind, health path and a relative composeFile that exists', () => {
  const s = json('docs/shelf-entry.json');
  assert.equal(s.id, 'privilege-map');
  assert.equal(s.kind, 'Demo');
  assert.equal(s.healthPath, '/api/health');
  assert.ok(!path.isAbsolute(s.composeFile) && !s.composeFile.includes('..'));
  assert.ok(fs.existsSync(path.join(ROOT, s.composeFile)));
  assert.match(s.url, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(Object.hasOwn(s, 'catalogId'), false, 'no catalog row matches this app');
});

test('the content pack is consistent with the stories, diagrams and glossary', () => {
  const pack = json('content-pack.json');
  assert.equal(pack.schema, 'demo-content-pack/1');
  assert.equal(pack.demo.id, json('docs/shelf-entry.json').id);
  assert.match(pack.demo.catalog, /^[A-Z][0-9]+$/);
  const terms = new Set(pack.glossary.map((g) => g.id));
  assert.equal(terms.size, pack.glossary.length);
  for (const c of pack.cards) for (const t of c.terms || []) assert.ok(terms.has(t), `card ${c.id} term ${t}`);
  const storyIds = fs.readdirSync(path.join(ROOT, 'content', 'stories')).map((f) => f.slice(0, 3));
  assert.deepEqual(pack.stories.map((s) => s.id), storyIds);
  for (const c of pack.cards) if (c.story) assert.ok(storyIds.includes(c.story));
  assert.deepEqual(pack.diagrams.map((d) => d.id), DEMO_DIAGRAMS);
  const features = json('src/data/features.json');
  for (const f of features) {
    const card = pack.cards.find((c) => c.id === `feature-${f.id}`);
    assert.ok(card, `no card for feature ${f.id}`);
    assert.equal(card.action.href, `/#/${f.page}?feature=${f.id}`);
    if (f.sources.some((x) => /Ping deck/i.test(x))) assert.match(card.description, /Internal and confidential/, `${f.id} card lacks the marking`);
    assert.equal(pack.diagrams.find((d) => d.id === f.id)?.href, `/#/diagram/${f.id}`);
  }
  assert.ok(pack.sources.some((s) => s.id === 'ping-deck' && /confidential/i.test(s.kind)));
  assert.doesNotMatch(JSON.stringify(pack), /eyJ[A-Za-z0-9_-]{10,}\./);
});

test('CI runs on hosted ubuntu runners, Node 26 only, with gitleaks and a secret-backed forbidden-strings job', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.doesNotMatch(ci, /self-hosted/);
  assert.match(ci, /runs-on: ubuntu-latest/);
  assert.match(ci, /node-version: 26/);
  assert.doesNotMatch(ci, /node-version: (18|20|22|24)/);
  assert.match(ci, /gitleaks/);
  assert.match(ci, /secrets\.FORBIDDEN_STRINGS/);
  assert.match(ci, /npm run doctor/);
  assert.match(ci, /actions\/checkout@v5/);
});

test('package.json requires Node 26 and names the scripts the standard asks for', () => {
  const p = json('package.json');
  assert.match(p.engines.node, />=\s*26/);
  for (const s of ['start', 'dev', 'build', 'test', 'doctor', 'reset']) assert.ok(p.scripts[s], s);
  assert.match(p.scripts.test, /test\/\*\.test\.js/, 'node --test uses a glob, not a directory');
});

test('the README follows the standard: title ends in LAB, tier, repo, and the required sections', () => {
  const r = read('README.md');
  assert.match(r.split('\n')[0], /^# .* LAB$/);
  assert.match(r, /^Tier: Demo$/m);
  assert.match(r, /^Repo: https:\/\/github\.com\/ping-sandbox\/privilege-map-LAB$/m);
  for (const h of ['What is simulated', 'Run from a clone', 'Settings file', 'Ports, and what to do if the port is taken', 'Mock and live modes', 'Health, doctor and reset', 'Docker (optional)', 'Tests', 'Troubleshooting', 'Ownership']) {
    assert.match(r, new RegExp(`^## ${h.replace(/[()]/g, '\\$&')}$`, 'm'), h);
  }
  assert.match(r, /lsof -iTCP:5300 -sTCP:LISTEN -n -P/);
  assert.match(r, /PORT=5302 npm start/);
});

test('no machine paths, outside links or EC key generation in the source', () => {
  for (const f of textFiles) {
    const rel = path.relative(ROOT, f);
    if (rel.startsWith('test/')) continue; // tests name the patterns they forbid
    const text = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(text, /\/Users\/|\/home\/[a-z]/, `${rel} has a machine path`);
    if (/^(src|index\.html)/.test(rel)) assert.doesNotMatch(text, /https?:\/\/(?!127\.0\.0\.1|localhost)/, `${rel} links outside this machine`);
    if (/\.(m?js|jsx)$/.test(rel) && !rel.startsWith('test/')) assert.doesNotMatch(text, /generateKeyPair(Sync)?\(\s*['"]ec['"]/, rel);
  }
});

test('no licence file, key or env file is part of the repo', () => {
  for (const f of files) {
    const name = path.basename(f);
    assert.doesNotMatch(name, /\.(lic|pem|key)$/, name);
    assert.ok(name === '.env.example' || !/^\.env/.test(name), name);
  }
  assert.match(read('.gitignore'), /customer\.config\.json/);
});

test('grids that auto-fit have a real minimum column width, so cards wrap at 375px instead of squeezing', () => {
  const css = read('src/styles.css');
  assert.doesNotMatch(css, /auto-(fit|fill),\s*minmax\(0[a-z%]*,/, 'a zero minimum never wraps');
  assert.match(css, /\.story-list\s*\{[^}]*minmax\(min\(100%,\s*\d+px\),\s*1fr\)/);
});

test('the version is the same in package.json, server.js and the content pack', () => {
  const server = read('server.js').match(/version: '([^']+)'/)[1];
  assert.equal(json('package.json').version, server);
  assert.equal(json('content-pack.json').version, server);
});

test('the runtime image carries the feature list the server reads to know which diagrams exist', () => {
  assert.match(read('Dockerfile'), /^COPY src\/data\/features\.json \.\/src\/data\/features\.json$/m);
});

test('the shelf entry states the real feature count and internal count', () => {
  const features = json('src/data/features.json');
  const internal = features.filter((f) => f.sources.some((x) => /Ping deck/i.test(x))).length;
  const d = json('docs/shelf-entry.json').description;
  assert.match(d, new RegExp(`\\b${features.length} Privilege feature cards`));
  assert.match(d, new RegExp(`\\b${internal} are internal and confidential`));
});

test('the feature page shows the Internal, confidential badge and opens the diagram in a new tab', () => {
  const page = read('src/pages/FeaturePage.jsx');
  assert.match(page, /isDeckSourced\(feature\)\s*\?\s*<span className="badge" data-kind="confidential">Internal, confidential<\/span>/);
  assert.match(page, /<a href=\{`#\/diagram\/\$\{feature\.id\}`\} target="_blank" rel="noopener noreferrer">/);
});
