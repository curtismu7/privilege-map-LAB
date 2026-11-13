# Privilege Map LAB

ReactFlow diagrams and feature cards for PingOne Privilege's Federated Identity (formerly non-human identity, NHI) model: what an agent access key is made of, and the five checks the gateway runs on every call.

Tier: Demo
Repo: https://github.com/curtismu7/privilege-map-LAB
Catalog: none yet. No catalog row matches this app, so `docs/shelf-entry.json` has no `catalogId`. `content-pack.json` carries the provisional id D101 because the pack schema requires one; the owner assigns the real one.

## What is simulated

**Mock mode (default, and the only mode).** Everything runs offline inside this app. The diagrams, 21 feature cards, stories and talk track are content drawn from Ping documentation and our own tests; there is no Privilege gateway, no tenant, no token and no sign-in behind them. Cards list what was not verified. The banner on every page says this, including in presenter mode.

**Live mode.** This app has none. It has no tenant or provider to connect to. The Live button is shown on every page so the mode is always visible, but it is disabled, and the server refuses `MODE=live` and a live request.

## Run from a clone

Prerequisites: Node 26 or newer. Docker only if you use the Docker form.

```sh
git clone https://github.com/curtismu7/privilege-map-LAB.git
cd privilege-map-LAB
npm ci
npm run build
npm start
```

Open http://127.0.0.1:5300 . With no setup at all, mock mode shows every page: the Map (two diagrams), the five feature pages, Stories, and Presenter mode.

For development, `npm run dev` serves the same page on the same port with hot reload.

## Settings file

All standalone apps read one settings file, `~/Development/.env` (mode 600). Set `STANDALONE_ENV` to read a different file. This app reads these keys from it, all optional, and ignores every other line without reading its value:

- `MODE`: `mock` (default). `live` is refused, because this app has no live mode.
- `WORKSPACE_ID`: lowercase letters, digits and dashes (default `default`). Scopes the saved run state.
- `CUSTOMER_CONFIG`: path to a customer config file (default `customer.config.json` next to the server, git-ignored).

A variable already set in the environment wins over the file. The app needs no tenant and no credentials. Admin and worker credentials never belong in this file and this app never reads them.

Other environment variables: `PORT`, `BIND_HOST` (Docker only), `HOST_PORT` (Docker), `DATA_ROOT` (where `.data/<workspace>/` lives).

## Ports, and what to do if the port is taken

Ports: privilege-map listens on 5300 (set with PORT, default 5300). Docker publishes 5301 (set with HOST_PORT, default 5301). Tests use 4770-4779.
Port range for this app: 5300-5301.

If the port is taken:
1. Find what is using it:
   lsof -iTCP:5300 -sTCP:LISTEN -n -P
2. If it is an old copy of this app, stop that process: kill <PID>.
3. If it is something else, stop it, or start this app on another port:
   PORT=5302 npm start
4. Do not use 8080, 5173, 3000, 4000, 4400, 4510, 4600-4601, 18080, 19080 or 19090.

## Mock and live modes

The header on every page has a **Mock / Live** toggle, and the banner shows the same mode. In mock mode nothing leaves the machine: a netguard refuses any non-loopback fetch or socket in the server process, the page's content security policy allows only this origin, and the fonts are bundled. `GET /api/netguard` runs the guard's self-test and reports the counters (`attempts`, `refused`, `sent`), which stay at zero. The test suite proves the guard by breaking it seven ways and checking that the self-test notices each one.

The Live button is disabled and its tooltip says why. `POST /api/mode` with `live` returns 409.

**Presenter mode.** The Presenter button shows `docs/talk-track.md` one `##` step at a time, with the banner kept on screen. Arrow keys move between steps and Escape leaves. Your place is saved in the workspace.

**Stories and customer config.** Stories in `content/stories/` use `{{cast.<role>}}` tokens, resolved from `content/cast.json`; an undefined token fails the tests and the server's health. Copy `customer.config.example.json` to `customer.config.json` to set the product name, tagline, footer and to rename cast roles (`vocabulary`) for a room. No real customer name is shipped.

**Diagrams.** `diagrams/nhi-entity.json` and `diagrams/nhi-checks.json` are `diagram-studio/1` data, the format Diagram Studio edits and exports. The page builds the ReactFlow graph from the data: drag any box, Simulate walks the steps, Prev and Next step by hand, the speed control sets the pace, and Reset stops the walk and puts every box back.

## Health, doctor and reset

```sh
npm run doctor   # Node, mode, content, diagrams, data folder, netguard self-test, built page, running app
npm run reset    # clears this workspace's run state (trace, presenter place); saved settings are kept
```

`GET /api/health` returns `demo-health/1` (public, GET only, no detail). The footer also has a **Reset this workspace** button, which calls `POST /api/reset`. Another workspace is never touched.

## Docker (optional)

```sh
docker compose up --build -d
```

This publishes 127.0.0.1:5301 only, runs as a non-root user on a read-only file system, and starts in mock mode. Use `HOST_PORT=<port>` to publish elsewhere. Run state lives in a temporary folder and is lost when the container is recreated.

## Tests

```sh
npm test
```

A good run on Node 26 is **89 tests, 89 pass, 0 fail**. The suite builds the page first if `dist/` is missing and starts real test servers on ports 4770-4779 only.

## Troubleshooting

- **Port is taken.** See "Ports, and what to do if the port is taken" above.
- **The page says the server did not answer, or `/api/health` says `needs-setup`.** Run `npm run build` once; the server serves the built page from `dist/`.
- **`npm run doctor` fails on "app answers /api/health".** Start the app with `npm start` first; doctor checks the running app on `PORT`.
- **The server exits with `MODE=live is refused`.** This app has no live mode. Remove `MODE=live` from your environment or the shared settings file.
- **`/api/health` says `broken`.** A story, the talk track or a diagram is invalid, for example an undefined cast token. The server prints the problem when it starts.

## Ownership

- Owner: the curtismu7 maintainers.
- License: MIT (see `LICENSE`). The bundled Montserrat and IBM Plex Mono fonts are under the SIL Open Font License 1.1.
- Found a problem? Open an issue on the repo.

---

## If the Privilege desktop agent shows "unregistered"

The PingOne Privilege **desktop app** (the one serving the local console at
`https://local.procyon.ai:8643`) stays registered with the Ping cloud through a background
agent (`ping-helper`). When that agent's device record is deleted or unapproved on the cloud
side, every Privilege app on this machine loses Real mode: the local console stops serving,
connections time out, and the desktop app shows the agent as **unregistered**.

### How to tell this is what happened

1. **The desktop app says the agent is unregistered** (banner or the agent status panel), or its
   diagnostics print `✖ Found N errors` with `Device … not found`.
2. **The local console is down with it**: `https://local.procyon.ai:8643` does not answer
   (connection refused / timeout) even though the PingOne Privilege app is running.
3. **The agent log loops on one error.** Check `/Library/Logs/Procyon/procyon-agent.log`:

   ```
   Error getting the device: HTTP error: 500 Internal Server Error
   Body: { "error": "Device <base64-id> not found", "code": 2, ... }
   ```

   repeated every ~2 seconds. That single line is the tell: the agent is asking the cloud
   about a device record the cloud no longer has. (A one-off is harmless — it is the endless
   repetition that means unregistered.)

### Why it happens

- The cloud side **deletes or disables the device record** (an admin action in the console, a
  tenant sync, or a guard tripping after network churn). The agent cannot re-create it by
  itself: it re-registers only on an enable/disable cycle, and re-registration **waits for a
  human to approve the new device** in the console.
- Network/VPN blips to `privilege.pingone.com` (`lookup … no such host` in the same log) force
  re-registrations and can churn the device identity, making the window for this bigger.

### How to fix it

1. Open the **PingOne Privilege** desktop app and make sure it is running.
2. Sign in to the **cloud console**: `https://console.pingone.com/?env=<your-privilege-env-id>`
   → launch **PingOne Privilege** → open the **Devices** page.
3. Find this machine's device (`DeviceName: mac-…`, type MAC). It is either:
   - **pending approval** — click **Approve** (the agent's certificate request is waiting;
     this is the usual state after a delete), or
   - **missing entirely** — in the desktop app toggle the agent **off and on** (or quit and
     reopen the app) so it mints a fresh certificate request, then approve it in the console.
4. The agent picks up the approval within seconds (watch
   `/Library/Logs/Procyon/procyon-agent.log` for `Device registered with controller`), and the
   local console at `local.procyon.ai:8643` starts serving again. Real mode in this app works
   immediately after — no restart of the app needed.

### If it comes back

The device being deleted repeatedly is a **console-side action** (admin, sync sweep, or a
server-side guard after repeated network drops). Note the times from
`grep "Delete request recieved" /Library/Logs/Procyon/procyon-agent*.log` and raise it with
 whoever administers the Privilege tenant — re-approving treats the symptom; the deletes have
 to stop for it to stay fixed.
