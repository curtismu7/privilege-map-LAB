// Embedded diagram on a feature card. Same diagram-studio/1 data and the same rendering
// path as the Map page's DiagramView, through the shared diagram kit (§8c): arrow labels
// in a layer above the boxes, clicking a box expands it in place with its details.
// Chrome differs from the Map page: no diagram picker, Prev/Next stepping.
import React, { useEffect, useMemo, useState } from 'react';
import { ReactFlow, Background, Controls, useNodesState, useReactFlow, useStore } from '@xyflow/react';
import { getJson } from '../api.js';
import { ArrowNoLabel, EdgeLabels, FitOpen, PassportActions } from '../diagram-kit/DiagramKit.jsx';
import { BoxNode, toNodes, toEdges, toLabelItems, asGraph, labelPointFor, boxPassport, NODE_W, NODE_H, FIT } from './shared.jsx';
import '../diagram-kit/diagram-kit.css';

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
  const [open, setOpen] = useState(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);

  useEffect(() => {
    setStepIndex(-1);
    setOpen(null);
    getJson(`/api/diagrams/${encodeURIComponent(diagramId)}`)
      .then((d) => {
        setError('');
        const graph = asGraph(d);
        setDiagram({ ...d, graph, passportFor: (id) => boxPassport(graph, id) });
        setNodes(toNodes(d, NONE));
      })
      .catch((e) => setError(e.message));
  }, [diagramId]);

  const steps = diagram?.steps || [];
  const active = useMemo(() => (stepIndex >= 0 && steps[stepIndex] ? new Set(steps[stepIndex].edges) : NONE), [stepIndex, steps]);

  // Walking the steps only flags the boxes at the ends of the lit arrows; a box the user has moved stays where it is.
  // An expanded box carries its details (the kit's Passport) and sits above its neighbours.
  useEffect(() => {
    if (!diagram) return;
    setNodes((prev) =>
      prev.map((n) => ({
        ...n,
        zIndex: n.id === open ? 10 : undefined,
        data: {
          ...n.data,
          active: diagram.edges.some((e, i) => active.has(i) && (e.source === n.id || e.target === n.id)),
          passport: n.id === open ? diagram.passportFor(n.id) : null
        }
      }))
    );
  }, [active, diagram, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const positions = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n.position])), [nodes]);
  const items = useMemo(() => (diagram ? toLabelItems(diagram, positions, active) : []), [diagram, positions, active]);
  const shape = diagram
    ? {
        w: Math.max(...diagram.nodes.map((n) => n.x || 0)) - Math.min(...diagram.nodes.map((n) => n.x || 0)) + NODE_W,
        h: Math.max(...diagram.nodes.map((n) => n.y || 0)) - Math.min(...diagram.nodes.map((n) => n.y || 0)) + NODE_H
      }
    : { w: 3, h: 1 };
  const step = stepIndex >= 0 ? steps[stepIndex] : null;
  if (error) return null;

  const actions = useMemo(
    () => ({
      open: (id) => setOpen(id),
      close: () => setOpen(null),
      link: (id) => {
        const u = new URL(window.location.href);
        u.searchParams.set('box', id);
        return u.toString();
      }
    }),
    []
  );

  return (
    <div className="fdiag">
      <div className="fdiag__bar">
        <button type="button" onClick={() => setStepIndex((i) => Math.max(-1, i - 1))} disabled={stepIndex < 0}>
          Prev
        </button>
        <button type="button" onClick={() => setStepIndex(stepIndex >= steps.length - 1 ? -1 : stepIndex + 1)}>
          {stepIndex >= 0 && stepIndex < steps.length - 1 ? 'Next' : 'Simulate'}
        </button>
        <a className="fdiag__open" href={`#/map?diagram=${encodeURIComponent(diagramId)}`}>
          Open on the Map page
        </a>
      </div>
      {diagram ? <p className="dnote">{diagram.lede}</p> : null}
      <div className="dcanvas" aria-label="Flow diagram" style={{ aspectRatio: `${shape.w} / ${shape.h}` }}>
        <PassportActions.Provider value={actions}>
          <ReactFlow
            nodes={nodes}
            edges={diagram ? toEdges(diagram, active) : []}
            nodeTypes={{ box: BoxNode }}
            edgeTypes={{ arrow: ArrowNoLabel }}
            onNodesChange={onNodesChange}
            onNodeClick={(_, n) => setOpen((o) => (o === n.id ? null : n.id))}
            onPaneClick={() => setOpen(null)}
            fitView
            fitViewOptions={FIT}
            nodesConnectable={false}
            edgesFocusable={false}
            proOptions={{ hideAttribution: true }}
            minZoom={0.1}
          >
            <Background gap={24} />
            <Controls showInteractive={false} fitViewOptions={FIT} />
            <FitView diagramId={diagramId} closePadding={0.08} />
            {diagram ? <EdgeLabels items={items} pointFor={labelPointFor} fallback={{ w: NODE_W, h: NODE_H }} /> : null}
          </ReactFlow>
        </PassportActions.Provider>
      </div>
      {diagram ? (
        <details className="diagram-legend" open>
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
          <p>Press Simulate to walk the steps in order. Boxes can be moved; click a box to see its details.</p>
        )}
      </div>
    </div>
  );
}
