import React, { useEffect, useState } from 'react';
import { getJson } from '../api.js';

// Stories (rule 10): text comes resolved from the server, with the cast names from customer.config.
export default function StoriesPage() {
  const [stories, setStories] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    getJson('/api/stories')
      .then((d) => setStories(d.stories))
      .catch((e) => setError(e.message));
  }, []);
  if (error) return <p className="note" role="alert">Stories failed to load: {error}</p>;
  if (!stories) return <p className="note">Loading stories.</p>;
  return (
    <section aria-label="Stories">
      <h2>Stories</h2>
      <p className="page-purpose">Three short walk-throughs to tell around the diagrams. The names come from the cast, which customer.config can rename.</p>
      <div className="story-list">
        {stories.map((s) => (
          <article key={s.id} className="story" aria-labelledby={`story-${s.id}`}>
            <h3 id={`story-${s.id}`}>
              {s.id}: {s.title}
            </h3>
            <dl className="story__facts">
              <dt>Goal</dt>
              <dd>{s.goal}</dd>
              <dt>Obstacle</dt>
              <dd>{s.obstacle}</dd>
              <dt>Control</dt>
              <dd>{s.control}</dd>
            </dl>
            <ol className="story__steps">
              {s.steps.map((step) => (
                <li key={step.n}>
                  <strong>{step.title}.</strong> {step.tell}
                  <span className="story__say"> Say: {step.say}</span>
                </li>
              ))}
            </ol>
            <a className="story__link" href={`#/map?diagram=${s.diagram}`}>
              Open the diagram
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}
