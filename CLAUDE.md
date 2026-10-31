# Privilege Map LAB

Standalone ReactFlow demo of the PingOne Privilege NHI model (Demo tier, mock only).

- Diagram data: `src/diagrams/privilegeNhiDiagrams.js`. Written for this repo; there are no imports from other repos.
- Node tests: `npm test`. Diagram integrity only (nodes, edges, steps). No UI tests yet.
- Shared theme tokens (`--th-*`) are defined in `src/styles.css` because the diagram data uses those names.
- The container (`Dockerfile`, `docker/nginx.conf`) serves `/api/health` as `demo-health/1`.
- Do not add identifiers from other projects (tenant ids, client ids, hostnames, customer names). Use `.example` or `.invalid` hosts.
