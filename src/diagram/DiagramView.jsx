// Diagram view (rules 5 and 17). Data comes from /api/diagrams/<name>: diagram-studio/1 data served by this app.
// Nodes and edges are mapped from that data only; nothing here is drawn by hand. ReactFlow only.
// Simulate walks the data's steps (each step lights its arrows), with Prev, Next, Pause, a speed control and Reset
// (Reset also puts every box back where the data placed it). Boxes can be dragged.
import React, { useEffect, useMemo, useState } from 'react';
import { ReactFlow, Background, Controls, useNodesState, useReactFlow, useStore } from '@xyflow/react';
import { routeEdges } from './layout.js';
import { getJson } from '../api.js';
import { BoxNode, toNodes, toEdges, toLabelItems, LabelLayer, RouteEdge, NODE_W, NODE_H, FIT } from './shared.jsx';

// Size of the drawing in flow units, so the canvas can take the diagram's own shape.
function contentShape(diagram) {
  const xs = diagram.nodes.map((n) => n.x || 0);
  const ys = diagram.nodes.map((n) => n.y || 0);
  return { w: Math.max(...xs) - Math.min(...xs) + NODE_W, h: Math.max(...ys) - Math.min(...ys) + NODE_H };
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
const SPEEDS = { slow: 2600, normal: 1400, fast: 600 };

export default function DiagramView({ initialId = '', initialSpeed = 'normal', onSpeed }) {
  const [list, setList] = useState([]);
  const [id, setId] = useState('');
  const [diagram, setDiagram] = useState(null);
  const [error, setError] = useState('');
  const [stepIndex, setStepIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(SPEEDS[initialSpeed] ? initialSpeed : 'normal');
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [badges, setBadges] = useState(0);
  const [fitTick, setFitTick] = useState(0);

  useEffect(() => {
    getJson('/api/diagrams')
      .then((data) => {
        setList(data.diagrams || []);
        const wanted = (data.diagrams || []).find((d) => d.available && d.id === initialId);
        const first = wanted || (data.diagrams || []).find((d) => d.available);
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
    setNodes((prev) => prev.map((n) => ({ ...n, data: { ...n.data, active: diagram.edges.some((e, i) => active.has(i) && (e.source === n.id || e.target === n.id)) } })));
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
  const items = useMemo(() => (diagram ? toLabelItems(diagram) : []), [diagram]);
  const shape = diagram ? contentShape(diagram) : { w: 3, h: 1 };
  const nodeName = (nid) => (diagram.nodes.find((n) => n.id === nid) || {}).label || nid;
  const step = stepIndex >= 0 ? steps[stepIndex] : null;

  return (
    <div className="dview">
      <div className="dtools">
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
          nodeTypes={{ box: BoxNode }}
          edgeTypes={{ route: RouteEdge }}
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
          {diagram ? <LabelLayer diagram={diagram} items={items} routes={routes} rects={rects} active={active} onBadges={setBadges} /> : null}
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
