import React from 'react';

// Simulation banner (rule 2): on every page and inside presenter mode. It says what is simulated and which mode is on.
export default function Banner({ mode, id }) {
  return (
    <p className="banner" id={id} role="status" data-state={mode === 'live' ? 'live' : 'mock'}>
      {mode === 'live'
        ? 'LIVE mode.'
        : 'MOCK mode. Simulated: the diagrams and walk-throughs below are drawn from documentation and owner tests. No tenant is connected and nothing leaves this machine. Anything marked "Not verified" is UNVERIFIED; check it before you present it.'}
    </p>
  );
}
