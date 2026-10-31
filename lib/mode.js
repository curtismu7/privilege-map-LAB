// Mode (rule 1). Mock is the default and runs fully offline with in-process content.
// This app has no live mode: it draws the Privilege model from documentation and owner tests and has no tenant
// to connect to. The header still shows a Mock / Live toggle on every page; Live is disabled and says why.
export const MODES = ['mock', 'live'];
export const LIVE_AVAILABLE = false;
export const NO_LIVE_REASON = 'This app has no live mode: it has no tenant or provider to connect to.';

export function resolveMode(value) {
  const mode = value === undefined || value === '' ? 'mock' : String(value);
  if (!MODES.includes(mode)) throw new Error(`MODE must be "mock" or "live", not "${mode}"`);
  if (mode === 'live' && !LIVE_AVAILABLE) throw new Error(`MODE=live is refused. ${NO_LIVE_REASON}`);
  return mode;
}
