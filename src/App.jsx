import React, { useEffect, useMemo, useState } from 'react';
import { ReactFlow, Background, Controls, Handle, MarkerType, Position, useEdgesState, useNodesState } from '@xyflow/react';
import { NHI_ENTITY_DIAGRAM, NHI_CHECK_DIAGRAM } from './diagrams/privilegeNhiDiagrams.js';
import FeaturePage from './FeaturePage.jsx';
import { PAGES } from './data/pages.js';

const DIAGRAMS = [
  { id: 'entity', title: 'What an agent identity is made of', config: NHI_ENTITY_DIAGRAM, layout: 'horizontal' },
  { id: 'checks', title: 'What the gateway checks on each call', config: NHI_CHECK_DIAGRAM, layout: 'vertical' },
];
const SPEEDS = [
  { ms: 2500, label: '2.5s (default)' },
  { ms: 1200, label: '1.2s' },
  { ms: 600, label: '0.6s' },
];

function buildNodes(config, layout) {
  return config.NODES.map((n) => ({
    id: n.id,
    position: { x: n.x, y: n.y },
    data: { label: n.label, sub: n.sub, group: n.group, color: config.GROUPS[n.group]?.bg, layout },
    type: 'diagramNode',
  }));
}

function buildEdges(config) {
  return config.EDGES.map(([source, target, label, opts], i) => ({
    id: `e${i}`,
    source,
    target,
    label: `${i + 1}  ${label}`,
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed },
    style: opts?.dashed ? { strokeDasharray: '6 4', stroke: opts?.color || undefined } : { stroke: opts?.color || undefined },
    labelStyle: { fontSize: 11 },
  }));
}

function DiagramNode({ data }) {
  const vertical = data.layout === 'vertical';
  return (
    <div className="pm-node" style={{ borderColor: data.color }}>
      <Handle type="target" position={vertical ? Position.Top : Position.Left} />
      <Handle type="source" position={vertical ? Position.Bottom : Position.Right} />
      <div className="pm-node-group" style={{ background: data.color }}>{data.groupLabel}</div>
      <div className="pm-node-title">{data.label}</div>
      {data.sub.map((line) => <div key={line} className="pm-node-sub">{line}</div>)}
    </div>
  );
}
const nodeTypes = { diagramNode: DiagramNode };

function Diagram({ diagram }) {
  const { config } = diagram;
  const initialNodes = useMemo(() => buildNodes(config, diagram.layout).map((n) => ({ ...n, data: { ...n.data, groupLabel: config.GROUPS[n.data.group]?.label } })), [config]);
  const initialEdges = useMemo(() => buildEdges(config), [config]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [step, setStep] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(SPEEDS[0].ms);
  const total = config.STEPS.length;

  useEffect(() => {
    const activeEdges = new Set(step >= 0 ? config.STEPS[step].edges : []);
    setEdges((es) => es.map((e, i) => ({
      ...e,
      animated: activeEdges.has(i),
      style: { ...e.style, stroke: activeEdges.has(i) ? 'var(--pm-active)' : e.style?.stroke, strokeWidth: activeEdges.has(i) ? 3 : 1.5 },
    })));
  }, [step, config, setEdges]);

  useEffect(() => {
    if (!playing) return undefined;
    const t = setTimeout(() => {
      setStep((s) => {
        if (s + 1 >= total) { setPlaying(false); return s; }
        return s + 1;
      });
    }, speed);
    return () => clearTimeout(t);
  }, [playing, step, speed, total]);

  const reset = () => {
    setPlaying(false);
    setStep(-1);
    setNodes(initialNodes);
    setEdges(initialEdges);
  };

  const current = step >= 0 ? config.STEPS[step] : null;

  return (
    <section className="pm-diagram" aria-label={diagram.title}>
      <h2>{diagram.title}</h2>
      <div className="pm-bar">
        <label>Step time{' '}
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {SPEEDS.map((s) => <option key={s.ms} value={s.ms}>{s.label}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => setStep((s) => Math.max(-1, s - 1))} disabled={step <= -1}>Prev</button>
        <button type="button" onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Simulate'}</button>
        <button type="button" onClick={() => setStep((s) => Math.min(total - 1, s + 1))} disabled={step >= total - 1}>Next</button>
        <span className="pm-count">{step < 0 ? `0 / ${total}` : `Step ${step + 1} / ${total}`}</span>
        <button type="button" onClick={reset}>Reset</button>
      </div>
      <p className="pm-caption">{current ? <><strong>{current.title}.</strong> {current.what}</> : 'Drag any box. Simulate walks the arrows one step at a time.'}</p>
      <div className="pm-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodesDraggable
          fitView
          fitViewOptions={{ padding: 0.15 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </section>
  );
}

function MapView() {
  const [tab, setTab] = useState(DIAGRAMS[0].id);
  const diagram = DIAGRAMS.find((d) => d.id === tab);
  return (
    <main className="pm-app">
      <header>
        <h1>Privilege Map LAB</h1>
        <p>PingOne Privilege non-human identity model. Simulated diagrams, no live tenant.</p>
        <nav>
          {DIAGRAMS.map((d) => (
            <button key={d.id} type="button" aria-pressed={tab === d.id} onClick={() => setTab(d.id)}>{d.title}</button>
          ))}
        </nav>
      </header>
      <Diagram key={diagram.id} diagram={diagram} />
    </main>
  );
}

const NAV = [{ id: 'map', title: 'Map' }, ...PAGES];

function currentRoute() {
  const id = window.location.hash.replace('#/', '');
  return NAV.some((n) => n.id === id) ? id : 'map';
}

export default function App() {
  const [route, setRoute] = useState(currentRoute());
  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return (
    <div className="pm-shell">
      <nav className="pm-top" aria-label="Pages">
        {NAV.map((n) => (
          <a key={n.id} href={`#/${n.id}`} aria-current={route === n.id ? 'page' : undefined}>{n.title}</a>
        ))}
      </nav>
      {route === 'map' ? <MapView /> : <main className="pm-app"><FeaturePage key={route} pageId={route} /></main>}
    </div>
  );
}
