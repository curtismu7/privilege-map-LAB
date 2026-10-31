import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEMO_DIAGRAMS, DIAGRAM_DIR, loadDiagramByName, listDiagrams, validateDiagram } from '../lib/diagrams.js';

for (const name of DEMO_DIAGRAMS) {
  const c = loadDiagramByName(name);

  test(`${name}: loads as diagram-studio/1 data`, () => {
    assert.equal(c.schema, 'diagram-studio/1');
    assert.equal(c.id, name);
    assert.deepEqual(validateDiagram(c), []);
  });

  test(`${name}: nodes are unique and in declared groups`, () => {
    const ids = c.nodes.map((n) => n.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const n of c.nodes) assert.ok(c.groups[n.group], `${n.id} group ${n.group}`);
  });

  test(`${name}: every edge references real nodes and has a label`, () => {
    const ids = new Set(c.nodes.map((n) => n.id));
    c.edges.forEach((e, i) => {
      assert.ok(ids.has(e.source) && ids.has(e.target), `edge ${i} references a missing node`);
      assert.ok(String(e.label || '').trim(), `edge ${i} has no label`);
    });
  });

  test(`${name}: steps reference real edges and cover all of them`, () => {
    const covered = new Set(c.steps.flatMap((s) => s.edges));
    for (const s of c.steps) for (const e of s.edges) assert.ok(c.edges[e], `step ${s.title} edge ${e}`);
    c.edges.forEach((_e, i) => assert.ok(covered.has(i), `edge ${i} not in any step`));
  });

  test(`${name}: no two boxes sit on top of each other at their starting positions`, () => {
    const W = 210;
    const H = 100;
    for (let a = 0; a < c.nodes.length; a++) {
      for (let b = a + 1; b < c.nodes.length; b++) {
        const dx = Math.abs(c.nodes[a].x - c.nodes[b].x);
        const dy = Math.abs(c.nodes[a].y - c.nodes[b].y);
        assert.ok(dx >= W || dy >= H, `${c.nodes[a].id} and ${c.nodes[b].id} overlap`);
      }
    }
  });
}

test('only the app\'s named diagrams are served, and a path is not a name', () => {
  assert.throws(() => loadDiagramByName('../package'), /not used by this app/);
  assert.throws(() => loadDiagramByName('auth-code-pkce'), /not used by this app/);
  assert.equal(listDiagrams().length, 2);
  assert.ok(listDiagrams().every((d) => d.available));
});

test('validation rejects an arrow to a missing box, a step to a missing arrow and a bad group colour', () => {
  const base = { schema: 'diagram-studio/1', id: 'x', title: 'X', groups: { g: { label: 'G', color: 'dark' } }, nodes: [{ id: 'a', group: 'g', label: 'A', x: 0, y: 0 }, { id: 'b', group: 'g', label: 'B', x: 300, y: 0 }], edges: [{ source: 'a', target: 'b', label: 'go' }], steps: [{ title: 'S', edges: [0] }] };
  assert.deepEqual(validateDiagram(base), []);
  assert.notEqual(validateDiagram({ ...base, edges: [{ source: 'a', target: 'zz', label: 'go' }] }).length, 0);
  assert.notEqual(validateDiagram({ ...base, steps: [{ title: 'S', edges: [5] }] }).length, 0);
  assert.notEqual(validateDiagram({ ...base, groups: { g: { label: 'G', color: 'purple' } } }).length, 0);
});

// When a Diagram Studio checkout is available (DIAGRAM_STUDIO_DIR, or ~/Development/diagram-studio), the real validator must agree.
const studioValidate = path.join(process.env.DIAGRAM_STUDIO_DIR || path.join(os.homedir(), 'Development', 'diagram-studio'), 'core', 'src', 'validate.js');
test('the diagram-studio validator accepts both diagrams', { skip: !fs.existsSync(studioValidate) && 'no Diagram Studio checkout found' }, async () => {
  const { validateDiagram: studio } = await import(pathToFileURL(studioValidate).href);
  for (const name of DEMO_DIAGRAMS) {
    assert.deepEqual(studio(JSON.parse(fs.readFileSync(path.join(DIAGRAM_DIR, `${name}.json`), 'utf8'))), [], name);
  }
});
