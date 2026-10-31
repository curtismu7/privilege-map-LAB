// Pure layout helpers for the diagram view: no DOM, no React, so node:test can exercise them (test/diagram-layout.test.js).
//
// routeEdges(): where each arrow runs. Arrows that meet the same side of a box get their own slot on that side,
//   so two arrows never share one path (the cause of labels piling up on one midpoint).
// placeLabels(): where each label sits. Every label gets its own position along its own arrow, nudged along and across
//   the arrow until no two label boxes touch and none sits on a box. A label that cannot fit as text becomes a small
//   numbered badge (its text stays in the legend under the diagram).

const rect = (x, y, w, h) => ({ x, y, w, h });

// ---------- routing (flow coordinates) ----------

// nodes: [{ id, x, y, w, h }]   edges: [{ id, source, target }]
// Returns { [edgeId]: { d, points, self } } where d is an SVG path and points is the same curve sampled as a polyline.
export function routeEdges(nodes, edges, { samples = 40 } = {}) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const sides = new Map(); // "nodeId|side" -> [{ edgeId, key, end }]
  const plan = [];

  for (const e of edges) {
    const a = byId.get(e.source);
    const b = byId.get(e.target);
    if (!a || !b) continue;
    if (a === b) {
      plan.push({ e, self: true, a });
      continue;
    }
    const dx = b.x + b.w / 2 - (a.x + a.w / 2);
    const dy = b.y + b.h / 2 - (a.y + a.h / 2);
    let sa;
    let sb;
    if (Math.abs(dx) >= Math.abs(dy)) {
      sa = dx >= 0 ? 'right' : 'left';
      sb = dx >= 0 ? 'left' : 'right';
    } else {
      sa = dy >= 0 ? 'bottom' : 'top';
      sb = dy >= 0 ? 'top' : 'bottom';
    }
    const horizontal = sa === 'left' || sa === 'right';
    const add = (node, side, other, end) => {
      const k = `${node.id}|${side}`;
      if (!sides.has(k)) sides.set(k, []);
      // Slots on a side are ordered by where the other end is, so arrows cross as little as possible.
      sides.get(k).push({ edgeId: e.id, end, key: horizontal ? other.y + other.h / 2 : other.x + other.w / 2 });
    };
    add(a, sa, b, 'source');
    add(b, sb, a, 'target');
    plan.push({ e, a, b, sa, sb });
  }

  const slot = new Map(); // "edgeId|end" -> 0..1 position along its side
  for (const list of sides.values()) {
    list.sort((p, q) => p.key - q.key || (p.edgeId < q.edgeId ? -1 : 1));
    list.forEach((item, i) => slot.set(`${item.edgeId}|${item.end}`, (i + 1) / (list.length + 1)));
  }

  const anchor = (n, side, t) => {
    if (side === 'left') return { x: n.x, y: n.y + n.h * t };
    if (side === 'right') return { x: n.x + n.w, y: n.y + n.h * t };
    if (side === 'top') return { x: n.x + n.w * t, y: n.y };
    return { x: n.x + n.w * t, y: n.y + n.h };
  };
  const out = (side) => ({ left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] })[side];

  const result = {};
  for (const p of plan) {
    let p0;
    let p1;
    let p2;
    let p3;
    if (p.self) {
      // A self arrow is a small loop under the box.
      const n = p.a;
      const cx = n.x + n.w / 2;
      const by = n.y + n.h;
      p0 = { x: cx - 26, y: by };
      p1 = { x: cx - 50, y: by + 64 };
      p2 = { x: cx + 50, y: by + 64 };
      p3 = { x: cx + 26, y: by };
    } else {
      p0 = anchor(p.a, p.sa, slot.get(`${p.e.id}|source`));
      p3 = anchor(p.b, p.sb, slot.get(`${p.e.id}|target`));
      const reach = Math.max(36, Math.hypot(p3.x - p0.x, p3.y - p0.y) * 0.35);
      const [ox, oy] = out(p.sa);
      const [tx, ty] = out(p.sb);
      p1 = { x: p0.x + ox * reach, y: p0.y + oy * reach };
      p2 = { x: p3.x + tx * reach, y: p3.y + ty * reach };
    }
    const points = [];
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const u = 1 - t;
      points.push({
        x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
        y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y
      });
    }
    result[p.e.id] = { d: `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`, points, self: Boolean(p.self) };
  }
  return result;
}

// ---------- label placement (screen coordinates) ----------

export function polylineLength(points) {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return len;
}

// Point and unit normal at fraction t (0..1) of the polyline's length.
export function pointAt(points, t) {
  const total = polylineLength(points);
  let want = Math.min(Math.max(t, 0), 1) * total;
  for (let i = 1; i < points.length; i++) {
    const seg = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    if (want <= seg || i === points.length - 1) {
      const f = seg ? Math.min(want / seg, 1) : 0;
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      const n = Math.hypot(dx, dy) || 1;
      return { x: points[i - 1].x + dx * f, y: points[i - 1].y + dy * f, nx: -dy / n, ny: dx / n };
    }
    want -= seg;
  }
  return { x: points[0].x, y: points[0].y, nx: 0, ny: 1 };
}

const hits = (a, b, pad) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
const inside = (r, bounds, margin) => r.x >= margin && r.y >= margin && r.x + r.w <= bounds.w - margin && r.y + r.h <= bounds.h - margin;

// Fractions along the arrow that are tried, 0.04 apart.
const T_STEPS = Array.from({ length: 25 }, (_, i) => 0.04 + i * 0.04);

// labels:    [{ id, w, h, points }]  w and h are the label's size in px, points the arrow as a screen-space polyline
// badge:     { w, h }               size of the numbered badge used when a label does not fit as text
// obstacles: [rect]                 node boxes and any control that must stay clear
// bounds:    { w, h }               the canvas
// badgeOnly: true when the drawing is too small for any text label (every label becomes a badge)
// Returns { [id]: { x, y, w, h, anchor, mode: 'text' | 'badge' | 'hidden' } } with x,y the top-left corner and anchor the point on the
// arrow the label belongs to. 'hidden' (offscreen: true when the arrow is out of view) means nothing is drawn because no free spot exists.
export function placeLabels({ labels, badge = { w: 22, h: 22 }, obstacles = [], bounds, pad = 4, nodePad = 3, margin = 2, badgeOnly = false }) {
  const placed = []; // rects already taken
  const result = {};
  const order = [...labels].sort((a, b) => polylineLength(a.points) - polylineLength(b.points));

  const lines = labels.map((l) => ({ id: l.id, points: l.points }));
  const crossings = (r, ownId) => {
    let n = 0;
    for (const line of lines) {
      if (line.id === ownId) continue;
      for (const p of line.points) if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) { n++; break; }
    }
    return n;
  };

  // Every spot along the arrow, on it or nudged across it. cost grows with distance from the arrow's middle and from the arrow.
  const candidates = (l, size, nudges) => {
    const list = [];
    for (const k of nudges) {
      const off = k * (size.h / 2 + 5);
      for (const t of T_STEPS) {
        const c = pointAt(l.points, t);
        list.push({ anchor: { x: c.x, y: c.y }, r: rect(c.x + c.nx * off - size.w / 2, c.y + c.ny * off - size.h / 2, size.w, size.h), cost: Math.abs(t - 0.5) * 20 + Math.abs(k) * 9 });
      }
    }
    return list;
  };

  const free = (r) => inside(r, bounds, margin) && !placed.some((p) => hits(r, p, pad)) && !obstacles.some((o) => hits(r, o, nodePad));

  // Cheapest free spot; a spot that sits on another arrow costs extra so a label stays next to its own arrow.
  const best = (l, size, nudges) => {
    let pick = null;
    let score = Infinity;
    for (const c of candidates(l, size, nudges)) {
      if (c.cost >= score || !free(c.r)) continue;
      const s = c.cost + 5 * crossings(c.r, l.id);
      if (s < score) { score = s; pick = c; }
    }
    return pick;
  };

  const TEXT_NUDGES = [0, 1, -1, 2, -2];
  const BADGE_NUDGES = [0, 1, -1, 2, -2, 3, -3, 4, -4, 6, -6];

  for (const l of order) {
    const asText = badgeOnly ? null : best(l, { w: l.w, h: l.h }, TEXT_NUDGES);
    if (asText) {
      placed.push(asText.r);
      result[l.id] = { ...asText.r, anchor: asText.anchor, mode: 'text' };
      continue;
    }
    const asBadge = best(l, badge, BADGE_NUDGES);
    if (asBadge) {
      placed.push(asBadge.r);
      result[l.id] = { ...asBadge.r, anchor: asBadge.anchor, mode: 'badge' };
      continue;
    }
    // No free spot even for a badge (its arrow is off screen, or boxes were dragged into a pile): draw nothing rather than
    // draw on top of something. The text stays in the legend and the step line.
    const visible = l.points.some((p) => p.x >= 0 && p.x <= bounds.w && p.y >= 0 && p.y <= bounds.h);
    result[l.id] = { x: 0, y: 0, w: 0, h: 0, mode: 'hidden', offscreen: !visible };
  }
  return result;
}
