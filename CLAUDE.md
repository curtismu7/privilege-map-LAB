# Privilege Map LAB

Tier: Demo. ReactFlow diagrams and 41 feature cards (5 pages, each with its own diagram) for the PingOne Privilege Federated Identity model.
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
- `src/data/features.json` is the content (41 features); `npm run spec` regenerates `docs/standard-ui.md` and `npm run diagrams` regenerates `diagrams/<feature id>.json` from it. Tests fail on drift. Diagram ids are at most 48 characters (Diagram Studio's limit).
- 33 features come from an internal, confidential Ping deck (Internal ping-sandbox repo only). Keep the "Internal, confidential" badge, the "(internal, confidential)" source line and the "not tested on our tenant" unverified line on each; `npm test` checks them. Status badges (GA, New in 2026-11-02 release, Roadmap) come from the data. Roadmap text must say it is roadmap. "Federated Identity" is a display rename; API names (NonHumanIdentity and the like) stay.
- The content pack keeps the placeholder catalog id D0; a card and a diagram per feature must stay in `content-pack.json` (a test checks).
- No tenant ids, client ids, hostnames, personal or customer names. Use `.example` or `.invalid`. Never commit `.env` files, keys, licences or `customer.config.json`.
- Docker publishes `127.0.0.1` only; a test pins it.
