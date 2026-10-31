import React, { useEffect, useRef } from 'react';
import Banner from './Banner.jsx';

// Presenter mode (rule 3): the talk track as full-screen steps. The banner stays visible. Escape leaves.
export default function Presenter({ steps, index, mode, onIndex, onExit }) {
  const nextRef = useRef(null);
  const step = steps[index];

  useEffect(() => {
    nextRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onExit();
      if (e.key === 'ArrowRight') onIndex(Math.min(index + 1, steps.length - 1));
      if (e.key === 'ArrowLeft') onIndex(Math.max(index - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, steps.length, onExit, onIndex]);

  if (!step) return null;
  return (
    <div className="presenter" role="dialog" aria-modal="true" aria-labelledby="presenter-title">
      <div className="presenter__inner">
        <Banner mode={mode} />
        <p className="presenter__count">
          Step {index + 1} of {steps.length}
        </p>
        <h2 id="presenter-title" className="presenter__title">
          {step.title}
        </h2>
        <div className="presenter__body">
          {step.body.split(/\n\s*\n/).map((para) => (
            <p key={para}>{para}</p>
          ))}
        </div>
        <div className="presenter__buttons">
          <button type="button" onClick={() => onIndex(index - 1)} disabled={index === 0}>
            Previous
          </button>
          <button type="button" className="primary" ref={nextRef} onClick={() => onIndex(index + 1)} disabled={index === steps.length - 1}>
            Next
          </button>
          <button type="button" onClick={onExit}>
            Exit presenter
          </button>
        </div>
        <ol className="presenter__list">
          {steps.map((s, i) => (
            <li key={s.title}>
              <button type="button" aria-pressed={i === index} onClick={() => onIndex(i)}>
                {s.title}
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
