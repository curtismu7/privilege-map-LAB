import React from 'react';
import features from '../data/features.json';
import { PAGES } from '../data/pages.js';
import DiagramView from '../diagram/DiagramView.jsx';
import { featureDiagramName } from '../../lib/feature-diagram.js';

// A feature's own diagram (diagrams/feature-<id>.json, served by name), opened from its feature page in a new tab.
export default function FeatureDiagramPage({ featureId, speed, onSpeed }) {
  const feature = features.find((f) => f.id === featureId);
  const page = feature && PAGES.find((p) => p.id === feature.page);
  if (!feature) {
    return (
      <section aria-label="Feature diagram">
        <h2>No such feature</h2>
        <p className="page-purpose">There is no feature named &ldquo;{featureId}&rdquo;. <a href="#/map">Back to the Map</a></p>
      </section>
    );
  }
  return (
    <section aria-label={`${feature.name} diagram`}>
      <a className="back-link" href={`#/${feature.page}?feature=${feature.id}`}>
        &larr; Back to {page.title}
      </a>
      <h2>{feature.name}: what it uses</h2>
      <DiagramView fixedId={featureDiagramName(feature.id)} initialSpeed={speed} onSpeed={onSpeed} />
    </section>
  );
}
