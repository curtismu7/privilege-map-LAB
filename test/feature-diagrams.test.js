// Per-feature diagrams (rules 5 and 17): diagrams/<feature id>.json is diagram-studio/1 data generated from the feature's own entry.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES } from '../src/data/pages.js';
import { buildFeatureDiagram, featureDiagramName, groupOf, splitComponent, FALLBACK_SUFFIX } from '../lib/feature-diagram.js';
import { loadDiagramByName, validateDiagram, DIAGRAM_DIR, MAP_DIAGRAMS } from '../lib/diagrams.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const features = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'features.json'), 'utf8'));

for (const f of features) {
  const page = PAGES.find((p) => p.id === f.page);
  const name = featureDiagramName(f.id);

  test(`${f.id}: the committed diagram file equals what the builder makes from the feature`, () => {
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(DIAGRAM_DIR, `${name}.json`), 'utf8')), buildFeatureDiagram(f, page.title), 'run npm run diagrams');
  });

  test(`${f.id}: one box and one arrow per component, a step per arrow, names of at most 40 characters`, () => {
    const d = loadDiagramByName(name);
    assert.deepEqual(validateDiagram(d), []);
    assert.equal(d.nodes.length, f.components.length + 1);
    assert.equal(d.edges.length, f.components.length);
    for (const e of d.edges) assert.ok(e.label.length <= 40, `"${e.label}"`);
    assert.deepEqual(d.steps.flatMap((s) => s.edges).sort((a, b) => a - b), d.edges.map((_e, i) => i));
    for (const s of d.steps) assert.ok(s.title && s.what && s.why, `step ${s.title}`);
  });

  test(`${f.id}: step text only reuses the feature's own words`, () => {
    const corpus = `${f.how} ${f.why}`;
    for (const s of buildFeatureDiagram(f).steps) assert.ok(s.what.endsWith(FALLBACK_SUFFIX) || corpus.includes(s.what), `step ${s.title} text comes from how-it-works`);
  });

  test(`${f.id}: no two boxes overlap at their starting positions, and the drawing is not stretched`, () => {
    const d = loadDiagramByName(name);
    for (let a = 0; a < d.nodes.length; a++) {
      for (let b = a + 1; b < d.nodes.length; b++) {
        assert.ok(Math.abs(d.nodes[a].x - d.nodes[b].x) >= 210 || Math.abs(d.nodes[a].y - d.nodes[b].y) >= 130, `${d.nodes[a].id} and ${d.nodes[b].id} overlap`);
      }
    }
    const ys = d.nodes.map((n) => n.y);
    assert.ok(Math.max(...ys) - Math.min(...ys) <= 1100, 'two columns keep the drawing from growing very tall');
  });
}

test('there is no stale diagram file: every diagrams/*.json is a Map diagram or belongs to a feature', () => {
  const wanted = new Set([...MAP_DIAGRAMS, ...features.map((f) => featureDiagramName(f.id))].map((n) => `${n}.json`));
  assert.equal(wanted.size, 2 + features.length, 'no feature id collides with a Map diagram');
  assert.deepEqual(fs.readdirSync(DIAGRAM_DIR).sort(), [...wanted].sort());
});

test('the diagram id fits Diagram Studio\'s 48-character limit', () => {
  for (const f of features) assert.ok(featureDiagramName(f.id).length <= 48, f.id);
});

test('a deck-sourced feature says in its diagram that it is internal and confidential', () => {
  const deck = features.find((f) => f.sources.some((s) => /Ping deck/i.test(s)));
  assert.match(buildFeatureDiagram(deck).lede, /Internal and confidential/);
  const plain = features.find((f) => !f.sources.some((s) => /Ping deck/i.test(s)));
  assert.doesNotMatch(buildFeatureDiagram(plain).lede, /confidential/i);
});

test('grouping and label splitting behave on typical component text', () => {
  assert.equal(groupOf('Agent Registry console page'), 'console');
  assert.equal(groupOf('Privilege gateway (LLM, MCP and A2A routes)'), 'gateway');
  assert.equal(groupOf('Per-key Runtime Protection (AI Guard)'), 'policy');
  assert.equal(groupOf('Gateway log'), 'other');
  const s = splitComponent('Custodian (a user who owns the key)');
  assert.equal(s.label, 'Custodian');
  assert.deepEqual(s.sub, ['a user who owns the key']);
  assert.ok(splitComponent('x'.repeat(200)).label.length <= 46);
});
