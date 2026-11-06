import React, { useCallback, useEffect, useState } from 'react';
import DiagramView from './diagram/DiagramView.jsx';
import FeaturePage from './pages/FeaturePage.jsx';
import StoriesPage from './pages/StoriesPage.jsx';
import ModeToggle from './components/ModeToggle.jsx';
import ShelfLink from "./components/ShelfLink.jsx";
import Banner from './components/Banner.jsx';
import Presenter from './components/Presenter.jsx';
import { PAGES } from './data/pages.js';
import { getJson, postJson } from './api.js';

const NAV = [{ id: 'map', title: 'Map' }, ...PAGES, { id: 'stories', title: 'Stories' }];
const THEME_KEY = 'privmap.theme';
const THEMES = [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']];

function initialTheme() {
  try { const t = localStorage.getItem(THEME_KEY); if (t === 'light' || t === 'dark') return t; } catch { /* storage blocked */ }
  return 'auto';
}

// Routes are hash routes: #/identity, or #/map?diagram=nhi-checks.
function currentRoute() {
  const [path, query = ''] = window.location.hash.replace(/^#\/?/, '').split('?');
  const known = NAV.some((n) => n.id === path);
  return { id: known ? path : 'map', diagram: new URLSearchParams(query).get('diagram') || '' };
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
  const [theme, setTheme] = useState(initialTheme);
  const pickTheme = (next) => {
    try { if (next === 'auto') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, next); } catch { /* not remembered */ }
    setTheme(next);
  };
  // The picker only sets data-theme; the shared stylesheet does the rest ("auto" follows the system setting).
  useEffect(() => { if (theme === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme; }, [theme]);
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
    if (info) postJson('/api/run', { page: route.id });
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
          <ShelfLink />
          <ModeToggle mode={info.mode} liveAvailable={info.liveAvailable} liveReason={info.liveReason} onChoose={chooseMode} />
          <label className="shell-theme">Theme
            <select value={theme} onChange={(e) => pickTheme(e.target.value)}>
              {THEMES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
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
        {route.id !== 'map' && route.id !== 'stories' ? <FeaturePage key={route.id} pageId={route.id} /> : null}
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
