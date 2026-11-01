# Changelog

## 1.1.0 (the 41 features)

- The Map now carries the 41 Privilege features of the private Privilege Map on five pages (Identity 8, LLM 4, MCP and A2A 10, Oversight 11, Platform 8), up from 21. Each has Why / How it works / Value / Components, sources and a not-verified list.
- Status badges (GA, New in 2026-11-02 release, Enhanced, Roadmap, Part GA part roadmap) on the 20 features new to the deck, and an "Internal, confidential" badge, a page note and a marked source line on the 33 features that use internal Ping deck text. Claims we did not test on our tenant stay UNVERIFIED.
- Each feature has its own diagram, opened from its page in a new tab (`#/diagram/<feature id>`). They are `diagram-studio/1` files in `diagrams/`, generated from the feature data by `npm run diagrams`, served and validated by name; the Map picker still lists only the two Map diagrams.
- A feature can be linked directly: `#/<page>?feature=<feature id>`.
- Federated Identity wording is display-only; the API object names are unchanged.
- Content pack 1.1.0: a card and a diagram for each feature, the deck as a confidential source (catalog id still the placeholder D0). Talk track gains "Open a feature's diagram" and "Say what is internal". Shelf entry says 41.
- Docker: the runtime image now carries `src/data/features.json`, which the server reads to know which diagrams exist.

## 1.0.0

- Standalone completion: mock mode with a Mock/Live toggle on every page, netguard, doctor and reset, workspaces, presenter mode, stories, talk track, `diagram-studio/1` diagrams, shelf entry, content pack, Node 26 CI.
