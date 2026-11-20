// Rendering pieces shared by DiagramView (Map page) and FeatureDiagram (feature cards).
// Both map diagram-studio/1 data to ReactFlow through these; nothing is drawn by hand.
import React, { useLayoutEffect, useMemo, useEffect, useRef, useState } from 'react';
import { BaseEdge, Handle, MarkerType, Position, useViewport, useStore } from '@xyflow/react';
import { placeLabels } from './layout.js';

export const NODE_W = 210;
export const NODE_H = 110; // used until ReactFlow has measured the real box
export const FIT = { padding: 0.04, minZoom: 0.1 };

const GROUP_CLASS = { red: 'dg-red', dark: 'dg-dark', grey: 'dg-grey', blue: 'dg-blue', green: 'dg-green', amber: 'dg-amber' };

// The handles are what ReactFlow anchors arrows to; a node type without them draws no edges.
export function BoxNode({ data }) {
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <div className={`dbox ${GROUP_CLASS[data.color] || 'dg-grey'}`} data-state={data.active ? 'active' : 'idle'}>
        <div className="dbox__group">{data.groupLabel}</div>
        <div className="dbox__label">{data.label}</div>
        {(data.sub || []).map((line) => (
          <div className="dbox__sub" key={line}>
            {line}
          </div>
        ))}
      </div>
      <Handle type="source" position={Position.Right} />
    </>
  );
}

export function toNodes(diagram, active) {
  return diagram.nodes.map((n) => {
    const group = diagram.groups?.[n.group] || {};
    return {
      id: n.id,
      type: 'box',
      position: { x: n.x || 0, y: n.y || 0 },
      data: { label: n.label, sub: Array.isArray(n.sub) ? n.sub : [], color: group.color, groupLabel: group.label || '', active: isActiveNode(diagram, active, n.id) }
    };
  });
}

export const isActiveNode = (diagram, active, id) => diagram.edges.some((e, i) => active.has(i) && (e.source === id || e.target === id));

export function RouteEdge({ id, data, markerEnd }) {
  return <BaseEdge id={id} path={data.d} markerEnd={markerEnd} />;
}

export function toEdges(diagram, active, routes) {
  return diagram.edges.map((e, i) => {
    const on = active.has(i);
    const classes = ['d-edge', on ? 'is-active' : '', e.dashed ? 'is-refusal' : ''].filter(Boolean).join(' ');
    return {
      id: `e${i}`,
      type: 'route',
      source: e.source,
      target: e.target,
      data: { d: routes[`e${i}`] ? routes[`e${i}`].d : '' },
      animated: on,
      markerEnd: { type: MarkerType.ArrowClosed },
      className: classes
    };
  });
}

export const toLabelItems = (diagram) => diagram.edges.map((e, i) => ({ id: `e${i}`, n: i + 1, text: e.label || '' })).filter((it) => it.text);

// Labels are drawn in screen space on top of the canvas, so their text keeps one readable size at any zoom.
// Positions come from placeLabels() and are recomputed whenever a box moves or the view zooms or pans.
export function LabelLayer({ diagram, items, routes, rects, active, onBadges }) {
  const { x: tx, y: ty, zoom } = useViewport();
  const width = useStore((st) => st.width);
  const height = useStore((st) => st.height);
  const probe = useRef(null);
  const [sizes, setSizes] = useState({});

  useLayoutEffect(() => {
    const measure = () => {
      if (!probe.current) return;
      const next = {};
      for (const el of probe.current.children) next[el.dataset.id] = { w: Math.ceil(el.offsetWidth), h: Math.ceil(el.offsetHeight) };
      setSizes((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    measure();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  }, [items]);

  const placement = useMemo(() => {
    if (!width || !height || !items.every((it) => sizes[it.id])) return {};
    const at = (pt) => ({ x: pt.x * zoom + tx, y: pt.y * zoom + ty });
    const labels = items.filter((it) => routes[it.id]).map((it) => ({ id: it.id, w: sizes[it.id].w, h: sizes[it.id].h, points: routes[it.id].points.map(at) }));
    const obstacles = rects.map((r) => ({ x: r.x * zoom + tx, y: r.y * zoom + ty, w: r.w * zoom, h: r.h * zoom }));
    obstacles.push({ x: 8, y: height - 96, w: 36, h: 88 }); // the zoom controls
    // Below this zoom the boxes are too small for text beside them, so every label is a numbered badge (text is in the legend).
    return placeLabels({ labels, obstacles, bounds: { w: width, h: height }, badgeOnly: zoom < 0.4 });
  }, [items, sizes, routes, rects, tx, ty, zoom, width, height]);

  // Badges and labels dropped for lack of room (not ones whose arrow is simply out of view) send the reader to the legend.
  const badges = items.filter((it) => placement[it.id] && (placement[it.id].mode === 'badge' || (placement[it.id].mode === 'hidden' && !placement[it.id].offscreen))).length;
  useEffect(() => {
    onBadges(badges);
  }, [badges]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="diagram-labels__probe" ref={probe} aria-hidden="true">
        {items.map((it) => (
          <div key={it.id} className="diagram-label" data-id={it.id}>
            {it.text}
          </div>
        ))}
      </div>
      <svg className="diagram-labels__leaders" aria-hidden="true">
        {items.map((it) => {
          const pos = placement[it.id];
          if (!pos || !pos.anchor || pos.mode === 'hidden') return null;
          // A label that sits beside its arrow (not on it) gets a short leader line to the point it belongs to.
          const ax = pos.anchor.x;
          const ay = pos.anchor.y;
          const nx = Math.min(Math.max(ax, pos.x), pos.x + pos.w);
          const ny = Math.min(Math.max(ay, pos.y), pos.y + pos.h);
          if (Math.hypot(nx - ax, ny - ay) < 3) return null;
          return <line key={it.id} x1={ax} y1={ay} x2={nx} y2={ny} />;
        })}
      </svg>
      <div className="react-flow__edgelabel-renderer diagram-labels">
        {items.map((it) => {
          const pos = placement[it.id];
          if (!pos || pos.mode === 'hidden') return null;
          return (
            <div
              key={it.id}
              className="diagram-label"
              data-mode={pos.mode}
              data-state={active.has(it.n - 1) ? 'active' : 'idle'}
              title={`${it.n}. ${it.text}`}
              aria-label={pos.mode === 'badge' ? `${it.n}. ${it.text}` : undefined}
              style={{ left: pos.x, top: pos.y }}
            >
              {pos.mode === 'badge' ? it.n : it.text}
            </div>
          );
        })}
      </div>
    </>
  );
}
