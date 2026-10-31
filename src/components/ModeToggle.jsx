import React from 'react';

// Mock / Live toggle (shown on every page). The server decides the mode. This app has no live mode,
// so Live is disabled and the reason is on the button and in the note under the header.
export default function ModeToggle({ mode, liveAvailable, liveReason, onChoose }) {
  return (
    <div className="mode-toggle" role="group" aria-label="Mode">
      <button type="button" className="mode-toggle__button" aria-pressed={mode === 'mock'} onClick={() => onChoose('mock')}>
        Mock
      </button>
      <button
        type="button"
        className="mode-toggle__button"
        aria-pressed={mode === 'live'}
        disabled={!liveAvailable}
        title={liveAvailable ? '' : liveReason}
        onClick={() => onChoose('live')}
      >
        Live
      </button>
    </div>
  );
}
