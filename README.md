# Privilege Map LAB

ReactFlow diagrams of PingOne Privilege's non-human identity (NHI) model: what an agent access key is made of,
and the checks the gateway runs on each call.

Tier: Demo
Repo: https://github.com/ping-sandbox/privilege-map-LAB

Mock only: no tenant, no credentials, no outbound calls.

## Run

```
npm install
npm run dev        # http://127.0.0.1:5300
npm test           # node --test test/*.test.js
npm run build
```

## Docker (local)

```
docker compose up --build -d     # publishes 127.0.0.1:5301 only
# health: http://127.0.0.1:5301/api/health
```

## Ports

Dev 5300, container 5301.
