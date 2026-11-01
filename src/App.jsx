import React, { useCallback, useEffect, useState } from 'react';
import DiagramView from './diagram/DiagramView.jsx';
import FeaturePage from './pages/FeaturePage.jsx';
import StoriesPage from './pages/StoriesPage.jsx';
import FeatureDiagramPage from './pages/FeatureDiagramPage.jsx';
import ModeToggle from './components/ModeToggle.jsx';
import Banner from './components/Banner.jsx';
import Presenter from './components/Presenter.jsx';
import { PAGES } from './data/pages.js';
import { getJson, postJson } from './api.js';

const NAV = [{ id: 'map', title: 'Map' }, ...PAGES, { id: 'stories', title: 'Stories' }];

const DIAGRAM_PREFIX = 'diagram/';

// Routes are hash routes: #/identity, #/identity?feature=agent-registry, #/map?diagram=nhi-checks, and
// #/diagram/<feature id> (a feature's own diagram, opened in a new tab from its page).
function currentRoute() {
  const [path, query = ''] = window.location.hash.replace(/^#\/?/, '').split('?');
  const params = new URLSearchParams(query);
  if (path.startsWith(DIAGRAM_PREFIX)) return { id: 'feature-diagram', featureId: path.slice(DIAGRAM_PREFIX.length), diagram: '', feature: '' };
  const known = NAV.some((n) => n.id === path);
  return { id: known ? path : 'map', diagram: params.get('diagram') || '', feature: params.get('feature') || '' };
}

function MapPage({ diagram, speed, onSpeed }) {
  return (
    <section aria-label="Map">
      <h2>Map</h2>
      <p className="page-purpose">Two diagrams of the Federated Identity model. Drag a box, press Simulate to walk the steps, press Reset to put everything back.</p>
      <DiagramView initialId={diagram} initialSpeed={speed} onSpeed={onSpeed} />
    </section>
  );
}

export default function App() {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [route, setRoute] = useState(currentRoute());
  const [talk, setTalk] = useState([]);
  const [presenting, setPresenting] = useState(false);
  const [step, setStep] = useState(0);
  const [note, setNote] = useState('');

  useEffect(() => {
    getJson('/api/state')
      .then((s) => {
        setInfo(s);
        setStep(Math.min(s.run?.presenterStep || 0, 99));
        if (!window.location.hash && s.run?.page && NAV.some((n) => n.id === s.run.page)) window.location.hash = `#/${s.run.page}`;
      })
      .catch((e) => setError(e.message));
    getJson('/api/talk-track')
      .then((d) => setTalk(d.steps))
      .catch(() => setTalk([]));
  }, []);

  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (info && route.id !== 'feature-diagram') postJson('/api/run', { page: route.id });
  }, [route.id, info]);

  const chooseMode = useCallback(async (mode) => {
    const res = await postJson('/api/mode', { mode });
    setNote(res.ok ? '' : res.data.error || 'The mode was not changed.');
  }, []);

  const goStep = useCallback(
    (i) => {
      const next = Math.max(0, Math.min(i, talk.length - 1));
      setStep(next);
      postJson('/api/run', { presenterStep: next });
    },
    [talk.length]
  );

  const reset = async () => {
    const res = await postJson('/api/reset');
    if (res.ok) {
      setStep(0);
      setPresenting(false);
      setNote('Reset: run state for this workspace is cleared. Saved settings are kept.');
    } else {
      setNote('Reset failed.');
    }
  };

  const saveSpeed = (speed) => {
    postJson('/api/settings', { speed });
  };

  if (error) {
    return (
      <main className="page">
        <p className="note" role="alert">
          The server did not answer: {error}. Is the app running? Try npm start.
        </p>
      </main>
    );
  }
  if (!info) return <main className="page"><p className="note">Loading.</p></main>;

  const { branding } = info.customer;
  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar__brand">
          <h1>{branding.productName}</h1>
          <p>{branding.tagline}</p>
        </div>
        <div className="topbar__controls">
          <ModeToggle mode={info.mode} liveAvailable={info.liveAvailable} liveReason={info.liveReason} onChoose={chooseMode} />
          <button type="button" onClick={() => setPresenting(true)} disabled={!talk.length}>
            Presenter
          </button>
        </div>
      </header>
      <Banner mode={info.mode} />
      <p className="note" aria-live="polite">
        {note || (info.liveAvailable ? '' : info.liveReason)}
      </p>
      <nav className="page-nav" aria-label="Pages">
        {NAV.map((n) => (
          <a key={n.id} href={`#/${n.id}`} aria-current={route.id === n.id ? 'page' : undefined}>
            {n.title}
          </a>
        ))}
      </nav>
      <main className="page">
        {route.id === 'map' ? <MapPage diagram={route.diagram} speed={info.settings?.speed} onSpeed={saveSpeed} /> : null}
        {route.id === 'stories' ? <StoriesPage /> : null}
        {route.id === 'feature-diagram' ? <FeatureDiagramPage key={route.featureId} featureId={route.featureId} speed={info.settings?.speed} onSpeed={saveSpeed} /> : null}
        {!['map', 'stories', 'feature-diagram'].includes(route.id) ? <FeaturePage key={`${route.id}:${route.feature}`} pageId={route.id} featureId={route.feature} /> : null}
      </main>
      <footer className="footer">
        <span>
          Workspace <code>{info.workspace}</code>
        </span>
        {branding.footer ? <span>{branding.footer}</span> : null}
        <button type="button" onClick={reset}>
          Reset this workspace
        </button>
      </footer>
      {presenting ? <Presenter steps={talk} index={step} mode={info.mode} onIndex={goStep} onExit={() => setPresenting(false)} /> : null}
    </div>
  );
}
