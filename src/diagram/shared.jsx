// Rendering pieces shared by DiagramView (Map page) and FeatureDiagram (feature cards).
// Both map diagram-studio/1 data to ReactFlow through these; nothing is drawn by hand.
// Arrow labels and the expanded-box details come from the shared diagram kit (§8c of the
// UI patterns standard, vendored into src/diagram-kit): labels in a layer above the boxes,
// placed clear of each other; clicking a box expands it in place with its details.
import React from 'react';
import { Handle, MarkerType, Position } from '@xyflow/react';
import { Passport } from '../diagram-kit/DiagramKit.jsx';
import { boxPassport, sidePoint } from '../diagram-kit/diagramKit.js';

export const NODE_W = 210;
export const NODE_H = 110; // used until ReactFlow has measured the real box
export const FIT = { padding: 0.08 };

const GROUP_CLASS = { red: 'dg-red', dark: 'dg-dark', grey: 'dg-grey', blue: 'dg-blue', green: 'dg-green', amber: 'dg-amber' };

// The handles are what ReactFlow anchors arrows to; a node type without them draws no edges.
export function BoxNode({ data }) {
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <div className={`dbox ${GROUP_CLASS[data.color] || 'dg-grey'}`} data-state={data.active ? 'active' : 'idle'} data-testid={`dbox-${data.id}`}>
        <div className="dbox__group">{data.groupLabel}</div>
        <div className="dbox__label">{data.label}</div>
        {(data.sub || []).map((line) => (
          <div className="dbox__sub" key={line}>
            {line}
          </div>
        ))}
      </div>
      <Handle type="source" position={Position.Right} />
      {data.passport && <Passport p={data.passport} />}
    </>
  );
}

export function toNodes(diagram, active, open = null) {
  return diagram.nodes.map((n) => {
    const group = diagram.groups?.[n.group] || {};
    return {
      id: n.id,
      type: 'box',
      position: { x: n.x || 0, y: n.y || 0 },
      zIndex: n.id === open ? 10 : undefined, // an expanded box sits above its neighbours
      data: {
        id: n.id,
        label: n.label,
        sub: Array.isArray(n.sub) ? n.sub : [],
        color: group.color,
        groupLabel: group.label || '',
        active: isActiveNode(diagram, active, n.id),
        passport: n.id === open ? diagram.passportFor(n.id) : null
      }
    };
  });
}

export const isActiveNode = (diagram, active, id) => diagram.edges.some((e, i) => active.has(i) && (e.source === id || e.target === id));

export function RouteEdge({ id, data, markerEnd }) {
  return <BaseEdge id={id} path={data.d} markerEnd={markerEnd} />;
}

// diagram-studio/1 data as the kit's graph, plus the passport builder the boxes use.
export function asGraph(diagram) {
  return {
    nodes: diagram.nodes.map((n) => ({ id: n.id, label: n.label, sub: n.sub || [], group: n.group })),
    edges: diagram.edges.map((e, i) => ({ source: e.source, target: e.target, label: `${i + 1}. ${e.label || ''}` })),
    groups: diagram.groups
  };
}

export function toEdges(diagram, active) {
  return diagram.edges.map((e, i) => {
    const on = active.has(i);
    const classes = ['d-edge', on ? 'is-active' : '', e.dashed ? 'is-refusal' : ''].filter(Boolean).join(' ');
    return {
      id: `e${i}`,
      type: 'arrow',
      source: e.source,
      target: e.target,
      animated: on,
      markerEnd: { type: MarkerType.ArrowClosed },
      className: classes
    };
  });
}

// One label item per arrow, for the kit's EdgeLabels layer. Handles point at the facing sides.
export function toLabelItems(diagram, positions, active) {
  const side = (a, b) => {
    if (!a || !b) return ['r', 'l'];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? ['r', 'l'] : ['l', 'r']) : (dy > 0 ? ['b', 't'] : ['t', 'b']);
  };
  const by = Object.fromEntries(diagram.nodes.map((n) => [n.id, positions[n.id]]));
  return diagram.edges.map((e, i) => {
    const [sh, th] = side(by[e.source], by[e.target]);
    return {
      id: `e${i}`,
      text: e.label || '',
      source: e.source,
      target: e.target,
      sourceHandle: sh,
      targetHandle: th,
      active: active.has(i),
      dim: active.size > 0 && !active.has(i)
    };
  });
}

export { boxPassport };

export const labelPointFor = (box, handle) => sidePoint(box, String(handle));
