// Embedded diagram on a feature card. Same diagram-studio/1 data and the same rendering
// path as the Map page's DiagramView (layout.js routes the arrows); only the chrome differs:
// no diagram picker, and Prev/Next step instead of the full tool strip.
import React, { useEffect, useMemo, useState } from 'react';
import { ReactFlow, Background, Controls, MarkerType, useNodesState, useReactFlow, useStore } from '@xyflow/react';
import { routeEdges, placeLabels } from './layout.js';
import { getJson } from '../api.js';
import { BoxNode, toNodes, toEdges, toLabelItems, LabelLayer, RouteEdge, NODE_W, NODE_H, FIT } from './shared.jsx';

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

export default function FeatureDiagram({ diagramId }) {
  const [diagram, setDiagram] = useState(null);
  const [error, setError] = useState('');
  const [stepIndex, setStepIndex] = useState(-1);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [badges, setBadges] = useState(0);
  const [fitTick, setFitTick] = useState(0);

  useEffect(() => {
    setStepIndex(-1);
    getJson(`/api/diagrams/${encodeURIComponent(diagramId)}`)
      .then((d) => {
        setError('');
        setDiagram(d);
        setNodes(toNodes(d, NONE));
      })
      .catch((e) => setError(e.message));
  }, [diagramId]);

  const steps = diagram?.steps || [];
  const active = useMemo(() => (stepIndex >= 0 && steps[stepIndex] ? new Set(steps[stepIndex].edges) : NONE), [stepIndex, steps]);

  useEffect(() => {
    if (!diagram) return;
    setNodes((prev) => prev.map((n) => ({ ...n, data: { ...n.data, active: diagram.edges.some((e, i) => active.has(i) && (e.source === n.id || e.target === n.id)) } })));
  }, [active, diagram]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const shape = diagram ? { w: Math.max(...diagram.nodes.map((n) => n.x || 0)) - Math.min(...diagram.nodes.map((n) => n.x || 0)) + NODE_W, h: Math.max(...diagram.nodes.map((n) => n.y || 0)) - Math.min(...diagram.nodes.map((n) => n.y || 0)) + NODE_H } : { w: 3, h: 1 };
  const step = stepIndex >= 0 ? steps[stepIndex] : null;
  if (error) return null;

  return (
    <div className="fdiag">
      <div className="fdiag__bar">
        <button type="button" onClick={() => setStepIndex((i) => Math.max(-1, i - 1))} disabled={stepIndex < 0}>
          Prev
        </button>
        <button type="button" className="primary" onClick={() => setStepIndex(stepIndex >= steps.length - 1 ? -1 : stepIndex + 1)}>
          {stepIndex >= 0 && stepIndex < steps.length - 1 ? 'Next' : 'Simulate'}
        </button>
        <a className="fdiag__open" href={`#/map?diagram=${encodeURIComponent(diagramId)}`}>
          Open on the Map page
        </a>
      </div>
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
          <FitView diagramId={diagramId} tick={fitTick} />
          {diagram ? <LabelLayer diagram={diagram} items={items} routes={routes} rects={rects} active={active} onBadges={setBadges} /> : null}
        </ReactFlow>
      </div>
      {diagram ? (
        <details className="diagram-legend" open={badges > 0 ? true : undefined}>
          <summary>Arrow labels ({diagram.edges.length})</summary>
          <ol className="diagram-legend__list">
            {diagram.edges.map((e, i) => (
              <li key={`${e.source}-${e.target}-${e.label}`} data-state={active.has(i) ? 'active' : 'idle'}>
                <strong>{e.label}</strong> ({e.source} to {e.target})
              </li>
            ))}
          </ol>
        </details>
      ) : null}
      <div className="dstep" aria-live="polite">
        {step ? (
          <>
            <strong>
              Step {stepIndex + 1} of {steps.length}: {step.title}
            </strong>
            <p>{step.what}</p>
            {step.why ? <p>{step.why}</p> : null}
          </>
        ) : (
          <p>Press Simulate to walk the steps in order. Boxes can be moved.</p>
        )}
      </div>
    </div>
  );
}
