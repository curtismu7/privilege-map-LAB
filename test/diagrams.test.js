import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NHI_ENTITY_DIAGRAM, NHI_CHECK_DIAGRAM } from '../src/diagrams/privilegeNhiDiagrams.js';

const cases = [['entity', NHI_ENTITY_DIAGRAM], ['checks', NHI_CHECK_DIAGRAM]];

for (const [name, c] of cases) {
  test(`${name}: nodes are unique and in declared groups`, () => {
    const ids = c.NODES.map((n) => n.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const n of c.NODES) assert.ok(c.GROUPS[n.group], `${n.id} group ${n.group}`);
  });

  test(`${name}: every edge references real nodes and has a label`, () => {
    const ids = new Set(c.NODES.map((n) => n.id));
    c.EDGES.forEach(([s, t, label], i) => {
      assert.ok(ids.has(s) && ids.has(t), `edge ${i} references a missing node`);
      assert.ok(String(label || '').trim(), `edge ${i} has no label`);
    });
  });

  test(`${name}: steps reference real edges and cover all of them`, () => {
    const covered = new Set(c.STEPS.flatMap((s) => s.edges));
    for (const s of c.STEPS) for (const e of s.edges) assert.ok(c.EDGES[e], `step ${s.key} edge ${e}`);
    c.EDGES.forEach((_e, i) => assert.ok(covered.has(i), `edge ${i} not in any step`));
  });
}
