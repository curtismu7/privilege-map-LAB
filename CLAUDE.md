# Privilege Map LAB

Tier: Demo. ReactFlow diagrams and 21 feature cards for the PingOne Privilege non-human identity model.
Plain `node:http` server (`server.js`) serving a Vite + React page built into `dist/`. Mock only: this app has no live mode.

## Run and test

```sh
npm ci
npm run build      # the server serves dist/
npm start          # http://127.0.0.1:5300 (Docker publishes 5301)
npm run dev        # same port, Vite hot reload inside the server
npm test           # node --test test/*.test.js (Node 26); test servers use ports 4770-4779 only
npm run doctor     # needs the app running
npm run reset      # run state only; settings kept
```

## Rules that bite

- Mock is the only mode. Every outbound path goes through `lib/netguard.js`, which also guards the whole process. `test/netguard.test.js` mutates the guard and requires the self-test to notice; `test/server.test.js` asserts zero outbound attempts.
- Settings come from `lib/settings.js`: shared `~/Development/.env` (or `STANDALONE_ENV`), allowlisted keys only. Never read admin or worker credentials, never print values.
- Diagrams are `diagram-studio/1` data in `diagrams/`, loaded by name (`lib/diagrams.js`). Do not hand-build nodes or edges in the UI. Arrow labels must not overlap or repeat; check with `~/Development/AI-DEMO-Standalone/scripts/diagram-overlap.js` in a browser after any diagram or label change.
- Story and talk-track text uses `{{cast.<role>}}`; an undefined token fails the tests and marks health `broken`.
- `src/standalone-ui.css` is the canonical shared stylesheet, byte-identical. Never edit it here; change `AI-DEMO-Standalone/shared/standalone-ui.css` and re-vendor. App CSS: tokens only, no colour literals, no `!important`, no italics, no id selectors, kebab-case BEM. Check with `AI-DEMO-Standalone/scripts/check-css.sh`.
- `src/data/features.json` is the content; `npm run spec` regenerates `docs/standard-ui.md` from it.
- No tenant ids, client ids, hostnames, personal or customer names. Use `.example` or `.invalid`. Never commit `.env` files, keys, licences or `customer.config.json`.
- Docker publishes `127.0.0.1` only; a test pins it.
