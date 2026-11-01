import React, { useState } from 'react';
import features from '../data/features.json';
import { PAGES } from '../data/pages.js';
import { isDeckSourced } from '../../lib/feature-diagram.js';

function Section({ title, children }) {
  return (
    <section className="feature__section">
      <h4>{title}</h4>
      {children}
    </section>
  );
}

function FeatureDetail({ feature }) {
  return (
    <article className="feature" aria-labelledby={`f-${feature.id}`}>
      <h3 id={`f-${feature.id}`}>{feature.name}</h3>
      <p className="feature__badges">
        {feature.status ? <span className="badge" data-kind="status">{feature.status}</span> : null}
        {isDeckSourced(feature) ? <span className="badge" data-kind="confidential">Internal, confidential</span> : null}
      </p>
      <p className="feature__diagram-link">
        <a href={`#/diagram/${feature.id}`} target="_blank" rel="noopener noreferrer">
          Open the diagram in a new tab <span aria-hidden="true">&#8599;</span>
        </a>
      </p>
      <Section title="Why we need it">
        <p>{feature.why}</p>
      </Section>
      <Section title="How it works">
        <p>{feature.how}</p>
      </Section>
      <Section title="Value to the end user">
        <p>{feature.userValue}</p>
      </Section>
      <Section title="Components used">
        <ul className="chips">
          {feature.components.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </Section>
      <details className="feature__more">
        <summary>Sources and what is not verified</summary>
        <p className="small">
          <strong>Sources:</strong> {feature.sources.join('; ')}. The owner notes are working notes and are not part of this repo.
        </p>
        {feature.unverified.length > 0 && (
          <>
            <p className="small">
              <strong>Not verified:</strong>
            </p>
            <ul className="small">
              {feature.unverified.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          </>
        )}
      </details>
    </article>
  );
}

export default function FeaturePage({ pageId, featureId = '' }) {
  const page = PAGES.find((p) => p.id === pageId);
  const list = features.filter((f) => f.page === pageId);
  const [selected, setSelected] = useState(list.some((f) => f.id === featureId) ? featureId : list[0]?.id);
  const current = list.find((f) => f.id === selected) || list[0];
  return (
    <section aria-label={page.title}>
      <h2>{page.title}</h2>
      <p className="page-purpose">{page.purpose}</p>
      <p className="draft-note" role="note">
        Draft content compiled from Ping documentation and our own tests. Open &ldquo;Sources and what is not verified&rdquo; on a feature before presenting it.
      </p>
      {list.some(isDeckSourced) ? (
        <p className="draft-note" role="note" data-kind="confidential">
          <strong>Internal and confidential.</strong> Features marked Internal, confidential use text from an internal Ping deck, including unreleased and roadmap items. They are stated by the deck and not tested on our tenant. Do not share them outside Ping.
        </p>
      ) : null}
      <div className="split">
        <nav className="feature-list" aria-label={`${page.title} features`}>
          {list.map((f) => (
            <button key={f.id} type="button" aria-pressed={current.id === f.id} onClick={() => setSelected(f.id)}>
              {f.name}
            </button>
          ))}
        </nav>
        <FeatureDetail key={current.id} feature={current} />
      </div>
    </section>
  );
}
