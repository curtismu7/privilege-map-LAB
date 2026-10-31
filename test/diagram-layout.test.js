// Pure tests for the diagram arrow routing and label placement (src/diagram/layout.js). No browser needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { routeEdges, placeLabels, pointAt, polylineLength } from '../src/diagram/layout.js';

const box = (id, x, y) => ({ id, x, y, w: 210, h: 110 });

const overlap = (a, b, pad = 0) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

test('arrows between the same two boxes get separate paths', () => {
  const nodes = [box('a', 0, 0), box('b', 400, 0)];
  const edges = [
    { id: 'e0', source: 'a', target: 'b' },
    { id: 'e1', source: 'b', target: 'a' },
    { id: 'e2', source: 'a', target: 'b' }
  ];
  const routes = routeEdges(nodes, edges);
  const starts = new Set(Object.values(routes).map((r) => `${r.points[0].x},${r.points[0].y}`));
  assert.equal(starts.size, 3, 'each arrow has its own start point');
  assert.equal(new Set(Object.values(routes).map((r) => r.d)).size, 3);
});

test('a self arrow loops under its box', () => {
  const routes = routeEdges([box('a', 0, 0)], [{ id: 'e0', source: 'a', target: 'a' }]);
  assert.equal(routes.e0.self, true);
  assert.ok(Math.max(...routes.e0.points.map((p) => p.y)) > 110);
});

test('pointAt walks along the polyline', () => {
  const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
  assert.equal(polylineLength(pts), 100);
  const mid = pointAt(pts, 0.5);
  assert.equal(Math.round(mid.x), 50);
  assert.equal(Math.round(mid.y), 0);
});

// Several arrows that run on one identical line: the case that stacked four labels on one midpoint.
const sameLine = (n) => Array.from({ length: n }, (_, i) => ({ id: `e${i}`, w: 120, h: 34, points: [{ x: 100, y: 200 }, { x: 500, y: 200 }] }));

test('labels on one shared path get different positions and never overlap', () => {
  const out = placeLabels({ labels: sameLine(4), obstacles: [], bounds: { w: 600, h: 400 } });
  const rects = Object.values(out);
  assert.equal(rects.length, 4);
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) assert.equal(overlap(rects[i], rects[j], 4), false, `labels ${i} and ${j} apart by at least 4px`);
  }
  assert.ok(rects.every((r) => r.mode === 'text'));
});

test('a label never sits on a box or outside the canvas', () => {
  const obstacles = [{ x: 280, y: 170, w: 100, h: 60 }];
  const out = placeLabels({ labels: sameLine(2), obstacles, bounds: { w: 600, h: 400 } });
  for (const r of Object.values(out)) {
    assert.equal(overlap(r, obstacles[0], 3), false);
    assert.ok(r.x >= 2 && r.y >= 2 && r.x + r.w <= 598 && r.y + r.h <= 398);
  }
});

test('labels that cannot fit as text become numbered badges, still apart', () => {
  const labels = sameLine(8).map((l) => ({ ...l, w: 130, h: 36, points: [{ x: 100, y: 100 }, { x: 180, y: 100 }] }));
  const out = placeLabels({ labels, obstacles: [], bounds: { w: 300, h: 200 } });
  const rects = Object.values(out);
  assert.ok(rects.some((r) => r.mode === 'badge'), 'some labels fall back to badges');
  assert.ok(rects.every((r) => r.mode !== 'hidden'), 'nothing is dropped in a small crowd');
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) assert.equal(overlap(rects[i], rects[j], 0), false);
  }
});

test('an arrow that is out of view draws no label, and a label is never forced onto a box', () => {
  const off = [{ id: 'far', w: 100, h: 24, points: [{ x: 2000, y: 2000 }, { x: 2400, y: 2000 }] }];
  const out = placeLabels({ labels: off, obstacles: [], bounds: { w: 600, h: 400 } });
  assert.equal(out.far.mode, 'hidden');
  assert.equal(out.far.offscreen, true);
  // The only visible stretch is covered by a box big enough to leave no free spot.
  const covered = [{ id: 'c', w: 100, h: 24, points: [{ x: 10, y: 10 }, { x: 40, y: 10 }] }];
  const wall = [{ x: 0, y: 0, w: 600, h: 400 }];
  assert.equal(placeLabels({ labels: covered, obstacles: wall, bounds: { w: 600, h: 400 } }).c.mode, 'hidden');
});

test('badgeOnly turns every label into a badge', () => {
  const out = placeLabels({ labels: sameLine(3), obstacles: [], bounds: { w: 600, h: 400 }, badgeOnly: true });
  assert.ok(Object.values(out).every((r) => r.mode === 'badge' && r.w === 22));
});

test('placement is deterministic and moving a box moves the labels with it', () => {
  const nodes = [box('a', 0, 0), box('b', 500, 0)];
  const edges = [{ id: 'e0', source: 'a', target: 'b' }];
  const place = (ns) => {
    const route = routeEdges(ns, edges).e0;
    return placeLabels({ labels: [{ id: 'e0', w: 100, h: 24, points: route.points }], obstacles: ns, bounds: { w: 900, h: 600 } }).e0;
  };
  assert.deepEqual(place(nodes), place(nodes));
  const moved = place([box('a', 0, 0), box('b', 500, 300)]);
  assert.notEqual(moved.y, place(nodes).y);
});
