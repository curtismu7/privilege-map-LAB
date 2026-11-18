// The header shows this lab's own Verified / In progress mark, read from the same GET /api/shelf call the Shelf link makes (through the
// lab-proxy that call reaches the shelf, whose payload lists every demo with its mark; opened on its own port it has only { shelfUrl }).
//
// This lab has no DOM test runner (node:test only, no jsdom), so the vendored VerifyMark.jsx is compiled with Vite's own transform and run with
// a small hook stand-in; what it returns is rendered to HTML with react-dom/server. App.jsx is checked as source (the one line that wires it in).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transformWithOxc } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const requireFromRoot = createRequire(path.join(ROOT, 'package.json'));
const { renderToStaticMarkup } = requireFromRoot('react-dom/server');
const ID = JSON.parse(read('docs/shelf-entry.json')).id;

// Compile the vendored component once; its `react` import points at a shim whose hooks the driver below controls.
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-verify-mark-'));
fs.writeFileSync(path.join(work, 'react-shim.mjs'), [
  "import { createRequire } from 'node:module';",
  `const React = createRequire(${JSON.stringify(path.join(ROOT, 'package.json'))})('react');`,
  'export default React;',
  'export const useState = (init) => globalThis.__verifyMarkHooks.useState(init);',
  'export const useEffect = (fn, deps) => globalThis.__verifyMarkHooks.useEffect(fn, deps);',
].join('\n'));
const compiled = await transformWithOxc(read('src/components/VerifyMark.jsx'), 'VerifyMark.jsx', { lang: 'jsx', jsx: { runtime: 'classic' } });
fs.writeFileSync(path.join(work, 'VerifyMark.mjs'), compiled.code.replace(/from\s+["']react["']/, 'from "./react-shim.mjs"'));
const { default: VerifyMark } = await import(pathToFileURL(path.join(work, 'VerifyMark.mjs')).href);
test.after(() => fs.rmSync(work, { recursive: true, force: true }));

// Render <VerifyMark id=... /> the way React does for one mount: first render, run the effect, let the fetch settle, render again.
async function renderMark(shelf, props = { id: ID }) {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (shelf instanceof Error) throw shelf;
    return typeof shelf === 'number' ? new Response('{}', { status: shelf }) : new Response(JSON.stringify(shelf));
  };
  const slots = [];
  const effects = [];
  let cursor = 0;
  let mounted = false;
  globalThis.__verifyMarkHooks = {
    useState: (init) => { const k = cursor++; if (!(k in slots)) slots[k] = init; return [slots[k], (v) => { slots[k] = v; }]; },
    useEffect: (fn) => { if (!mounted) effects.push(fn); },
  };
  try {
    VerifyMark(props);
    mounted = true;
    for (const fn of effects) fn();
    await new Promise((r) => setTimeout(r, 20));
    cursor = 0;
    return { html: renderToStaticMarkup(VerifyMark(props)), calls };
  } finally {
    globalThis.fetch = realFetch;
    delete globalThis.__verifyMarkHooks;
  }
}

const mark = (status, label, extra = {}) => ({ status, label, note: '', updatedAt: '2026-11-15', source: 'shipped', ...extra });

test('shows this lab\'s own mark (and no other lab\'s), with the note as its tooltip, from the same /api/shelf call the Shelf link makes', async () => {
  const { html, calls } = await renderMark({
    shelfUrl: 'http://shelf.example',
    demos: [{ id: 'other-lab', verification: mark('in-progress', 'In progress') }, { id: ID, verification: mark('verified', 'Verified', { note: 'Every diagram walked on the mock' }) }],
  });
  assert.match(html, /class="verify"/);
  assert.match(html, /data-status="verified"/);
  assert.match(html, /Verified/);
  assert.doesNotMatch(html, /In progress/);
  assert.match(html, /title="[^"]*Every diagram walked on the mock/);
  assert.equal((html.match(/class="verify"/g) || []).length, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/shelf');
  assert.equal(calls[0].init.credentials, 'same-origin');
});

test('an In progress mark shows its own label and status', async () => {
  const { html } = await renderMark({ shelfUrl: 'http://shelf.example', demos: [{ id: ID, verification: mark('in-progress', 'In progress') }] });
  assert.match(html, /data-status="in-progress"/);
  assert.match(html, /In progress/);
});

test('shows nothing for another lab\'s mark, without a mark, with status none, on the lab\'s own port ({ shelfUrl } only), or when the shelf is unreachable', async () => {
  const cases = {
    'only another lab has a mark': { shelfUrl: 'http://shelf.example', demos: [{ id: 'other-lab', verification: mark('verified', 'Verified') }] },
    'this lab has no mark': { shelfUrl: 'http://shelf.example', demos: [{ id: ID, verification: null }] },
    'mark is none': { shelfUrl: 'http://shelf.example', demos: [{ id: ID, verification: mark('none', 'None') }] },
    'own port answers { shelfUrl } only': { shelfUrl: 'http://shelf.example' },
    'shelf answers an error status': 500,
    'shelf fetch fails': new Error('unreachable'),
  };
  for (const [name, shelf] of Object.entries(cases)) {
    const { html, calls } = await renderMark(shelf);
    assert.equal(html, '', name);
    assert.equal(calls.length, 1, name);
  }
});

test('App.jsx renders exactly one <VerifyMark id> with this lab\'s shelf id, inside the shared TopMenu beside the Shelf link, and main.jsx loads its stylesheet', () => {
  const app = read('src/App.jsx');
  assert.equal(ID, 'privilege-map');
  assert.match(app, /^import VerifyMark from ["']\.\/components\/VerifyMark\.jsx["'];?$/m);
  assert.equal((app.match(/<VerifyMark\b/g) || []).length, 1, 'one badge');
  assert.match(app, new RegExp(`<VerifyMark id="${ID}" />`));
  const menu = app.slice(app.indexOf('<TopMenu'), app.indexOf('</TopMenu>'));
  assert.match(menu, /<ShelfLink \/>\s*<VerifyMark id="privilege-map" \/>/, 'beside the Shelf link, inside TopMenu');
  assert.match(read('src/main.jsx'), /^import ['"]\.\/components\/VerifyMark\.css['"];?$/m);
});
