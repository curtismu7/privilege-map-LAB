// Diagram view (rules 5 and 17). Data comes from /api/diagrams/<name>: diagram-studio/1 data served by this app.
// Nodes and edges are mapped from that data only; nothing here is drawn by hand. ReactFlow only.
// Simulate walks the data's steps (each step lights its arrows), with Prev, Next, Pause, a speed control and Reset
// (Reset also puts every box back where the data placed it). Boxes can be dragged.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, Background, BaseEdge, Controls, Handle, Position, MarkerType, useNodesState, useReactFlow, useStore, useViewport } from '@xyflow/react';
import { routeEdges, placeLabels } from './layout.js';
import { getJson } from '../api.js';

const NODE_W = 210;
const NODE_H = 110; // used until ReactFlow has measured the real box
const BADGE_ZOOM = 0.4;
const FIT = { padding: 0.04, minZoom: 0.1 };

const SPEEDS = { slow: 2600, normal: 1400, fast: 600 };
const GROUP_CLASS = { red: 'dg-red', dark: 'dg-dark', grey: 'dg-grey', blue: 'dg-blue', green: 'dg-green', amber: 'dg-amber' };

function BoxNode({ data }) {
  return (
    <div className={`dbox ${GROUP_CLASS[data.color] || 'dg-grey'}`} data-state={data.active ? 'active' : 'idle'}>
      <Handle type="target" position={Position.Left} />
      <div className="dbox__group">{data.groupLabel}</div>
      <div className="dbox__label">{data.label}</div>
      {(data.sub || []).map((line) => (
        <div className="dbox__sub" key={line}>
          {line}
        </div>
      ))}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { box: BoxNode };

const isActiveNode = (diagram, active, id) => diagram.edges.some((e, i) => active.has(i) && (e.source === id || e.target === id));

// Data nodes -> ReactFlow nodes. Positions are the data's own; Reset puts boxes back to them.
function toNodes(diagram, active) {
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

// Arrows are drawn by RouteEdge from a path that layout.js computes (own slot on each box side, so no two arrows share a path).
function RouteEdge({ id, data, markerEnd }) {
  return <BaseEdge id={id} path={data.d} markerEnd={markerEnd} />;
}

const edgeTypes = { route: RouteEdge };

function toEdges(diagram, active, routes) {
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

// Size of the drawing in flow units, so the canvas can take the diagram's own shape.
function contentShape(diagram) {
  const xs = diagram.nodes.map((n) => n.x || 0);
  const ys = diagram.nodes.map((n) => n.y || 0);
  return { w: Math.max(...xs) - Math.min(...xs) + NODE_W, h: Math.max(...ys) - Math.min(...ys) + NODE_H };
}

// Labels are drawn in screen space on top of the canvas, so their text keeps one readable size at any zoom.
// Positions come from placeLabels() and are recomputed whenever a box moves or the view zooms or pans.
function LabelLayer({ diagram, routes, rects, active, onBadges }) {
  const { x: tx, y: ty, zoom } = useViewport();
  const width = useStore((st) => st.width);
  const height = useStore((st) => st.height);
  const probe = useRef(null);
  const [sizes, setSizes] = useState({});

  const items = useMemo(() => diagram.edges.map((e, i) => ({ id: `e${i}`, n: i + 1, text: e.label || '' })).filter((it) => it.text), [diagram]);

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
    return placeLabels({ labels, obstacles, bounds: { w: width, h: height }, badgeOnly: zoom < BADGE_ZOOM });
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

// Fits the whole drawing into the canvas when it first appears, when the canvas changes size and after Reset.
function FitView({ diagramId, tick }) {
  const { fitView } = useReactFlow();
  const width = useStore((st) => st.width);
  const height = useStore((st) => st.height);
  const ready = useStore((st) => st.nodesInitialized);
  useEffect(() => {
    if (ready && width && height) fitView(FIT);
  }, [ready, width, height, diagramId, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

const NONE = new Set();

// fixedId shows exactly one diagram by name (a feature's page opens one in its own tab) and hides the picker.
export default function DiagramView({ initialId = '', fixedId = '', initialSpeed = 'normal', onSpeed }) {
  const [list, setList] = useState([]);
  const [id, setId] = useState(fixedId);
  const [diagram, setDiagram] = useState(null);
  const [error, setError] = useState('');
  const [stepIndex, setStepIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(SPEEDS[initialSpeed] ? initialSpeed : 'normal');
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [badges, setBadges] = useState(0);
  const [fitTick, setFitTick] = useState(0);

  useEffect(() => {
    if (fixedId) return;
    getJson('/api/diagrams')
      .then((data) => {
        // The picker lists the Map diagrams; each feature's own diagram is opened from its feature page.
        const maps = (data.diagrams || []).filter((d) => d.kind === 'map');
        setList(maps);
        const wanted = maps.find((d) => d.available && d.id === initialId);
        const first = wanted || maps.find((d) => d.available);
        if (first) setId(first.id);
        else setError('No diagram data is available. Run npm run doctor.');
      })
      .catch((e) => setError(`Diagram list failed: ${e.message}`));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (initialId && list.some((d) => d.available && d.id === initialId)) setId(initialId);
  }, [initialId, list]);

  useEffect(() => {
    if (!id) return;
    setPlaying(false);
    setStepIndex(-1);
    getJson(`/api/diagrams/${encodeURIComponent(id)}`)
      .then((d) => {
        setError('');
        setDiagram(d);
        setNodes(toNodes(d, NONE));
      })
      .catch((e) => setError(e.message));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const steps = diagram?.steps || [];
  const active = useMemo(() => (stepIndex >= 0 && steps[stepIndex] ? new Set(steps[stepIndex].edges) : NONE), [stepIndex, steps]);

  // Walking the steps only flags the boxes at the ends of the lit arrows; a box the user has moved stays where it is.
  useEffect(() => {
    if (!diagram) return;
    setNodes((prev) => prev.map((n) => ({ ...n, data: { ...n.data, active: isActiveNode(diagram, active, n.id) } })));
  }, [active, diagram]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!playing || !diagram) return undefined;
    const timer = setTimeout(() => {
      setStepIndex((i) => {
        if (i + 1 >= steps.length) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, SPEEDS[speed]);
    return () => clearTimeout(timer);
  }, [playing, stepIndex, speed, diagram, steps.length]);

  const simulate = () => {
    if (!diagram) return;
    if (playing) {
      setPlaying(false);
      return;
    }
    if (stepIndex >= steps.length - 1) setStepIndex(-1);
    setPlaying(true);
  };

  const reset = () => {
    setPlaying(false);
    setStepIndex(-1);
    if (diagram) {
      setNodes(toNodes(diagram, NONE));
      setFitTick((t) => t + 1);
    }
  };

  const chooseSpeed = (value) => {
    setSpeed(value);
    if (onSpeed) onSpeed(value);
  };

  // Arrow paths follow the boxes: any move (drag, Reset) recomputes them, and the labels are placed again from them.
  const rects = useMemo(
    () =>
      nodes.map((n) => ({
        id: n.id,
        x: n.position.x,
        y: n.position.y,
        w: (n.measured && n.measured.width) || NODE_W,
        h: (n.measured && n.measured.height) || NODE_H
      })),
    [nodes]
  );
  const routes = useMemo(() => (diagram ? routeEdges(rects, diagram.edges.map((e, i) => ({ id: `e${i}`, source: e.source, target: e.target }))) : {}), [diagram, rects]);
  const edges = useMemo(() => (diagram ? toEdges(diagram, active, routes) : []), [diagram, active, routes]);
  const shape = diagram ? contentShape(diagram) : { w: 3, h: 1 };
  const nodeName = (nid) => (diagram.nodes.find((n) => n.id === nid) || {}).label || nid;
  const step = stepIndex >= 0 ? steps[stepIndex] : null;

  return (
    <div className="dview">
      <div className={fixedId ? 'dtools dtools--fixed' : 'dtools'}>
        {fixedId ? null : (
          <label>
            Diagram
            <select value={id} onChange={(e) => setId(e.target.value)}>
              {list.map((d) => (
                <option key={d.id} value={d.id} disabled={!d.available}>
                  {d.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Speed
          <select value={speed} onChange={(e) => chooseSpeed(e.target.value)}>
            <option value="slow">Slow</option>
            <option value="normal">Normal</option>
            <option value="fast">Fast</option>
          </select>
        </label>
        <div className="dbuttons">
          <button type="button" onClick={() => setStepIndex((i) => Math.max(-1, i - 1))} disabled={!diagram || stepIndex < 0}>
            Prev
          </button>
          <button type="button" className="primary" onClick={simulate} disabled={!diagram}>
            {playing ? 'Pause' : 'Simulate'}
          </button>
          <button type="button" onClick={() => setStepIndex((i) => Math.min(steps.length - 1, i + 1))} disabled={!diagram || stepIndex >= steps.length - 1}>
            Next
          </button>
          <button type="button" onClick={reset} disabled={!diagram}>
            Reset
          </button>
        </div>
      </div>
      {error ? (
        <p className="dnote" role="alert">
          {error}
        </p>
      ) : null}
      {diagram ? <p className="dnote">{diagram.lede}</p> : null}
      <div className="dcanvas" aria-label="Flow diagram" style={{ aspectRatio: `${shape.w} / ${shape.h}` }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          fitView
          fitViewOptions={FIT}
          nodesConnectable={false}
          edgesFocusable={false}
          proOptions={{ hideAttribution: true }}
          minZoom={0.1}
        >
          <Background gap={24} />
          <Controls showInteractive={false} fitViewOptions={FIT} />
          <FitView diagramId={id} tick={fitTick} />
          {diagram ? <LabelLayer diagram={diagram} routes={routes} rects={rects} active={active} onBadges={setBadges} /> : null}
        </ReactFlow>
      </div>
      {diagram ? (
        <details className="diagram-legend" open={badges > 0 ? true : undefined}>
          <summary>Arrow labels ({diagram.edges.length})</summary>
          <ol className="diagram-legend__list">
            {diagram.edges.map((e, i) => (
              <li key={`${e.source}-${e.target}-${e.label}`} data-state={active.has(i) ? 'active' : 'idle'}>
                <strong>{e.label || 'call'}</strong> ({nodeName(e.source)} to {nodeName(e.target)})
              </li>
            ))}
          </ol>
        </details>
      ) : null}
      <div className="dstep" aria-live="polite">
        {diagram && step ? (
          <>
            <strong>
              Step {stepIndex + 1} of {steps.length}: {step.title}
            </strong>
            <p>{step.what}</p>
            {step.why ? <p>{step.why}</p> : null}
          </>
        ) : (
          <p>Press Simulate to walk the steps in order. Boxes can be moved; Reset puts them back. Scroll or pinch to zoom.</p>
        )}
      </div>
    </div>
  );
}
