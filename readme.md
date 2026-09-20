# VaaliRaivo

VaaliRaivo is a source-aware election-night dashboard designed for a large
watch-party screen. It brings results, a geographic district map, turnout,
electronic voting, reporting, broadcasts, the night timeline and source health
into one view.

The app is deliberately dependency-free: Node serves the JSON API, static UI
and a Server-Sent Events stream. It runs locally or as a small Docker service.

## Run it

Node 20 or newer is required.

```sh
npm start
```

Open <http://localhost:3000>. During development, `npm run dev` restarts the
server when files change.

With Docker:

```sh
docker compose up --build
```

The dashboard still starts when external sources are unavailable. Successful
automatic refreshes and operator updates are stored in the `vaaliraivo-data`
volume.

## App structure

- `/` — generic election-project overview
- `/projects/2026-russia-state-duma` — the Duma election-night view
- `/api/projects` — project registry
- `/api/projects/:slug` — current merged dashboard snapshot
- `/api/projects/:slug/events` — live Server-Sent Events stream
- `/api/health` — deployment health check
- `data/projects/` — version-controlled seed snapshots and source configuration
- `public/maps/` — election boundary maps and their attribution/license files

### Election-night updates

The Duma desk refreshes the public CEC Telegram page, RBC's RSS election data,
Public Chamber counters, and metadata from the configured independent live
pages every five minutes.
Source failures are isolated: the last successful snapshot remains visible and
the source is marked stale or offline. Set `SOURCE_REFRESH_ENABLED=false` to
disable polling, or run a one-off refresh with:

```sh
npm run refresh:sources
```

CEC's result counter, the federal DEG portal and Moscow's observer portal do not
expose a reliable server-side feed from this deployment environment. They
therefore remain clearly labelled manual/browser sources; their values must
carry the article or retrieval time used by the operator.

Set `DASHBOARD_EDIT_TOKEN` to enable `PATCH /api/projects/:slug`. Updates are
deep-merged with the seed snapshot and persisted atomically to
`VAALIRAIVO_DATA_DIR` (or `data/runtime` outside Docker). Only dashboard data
sections are accepted.

```sh
curl -X PATCH http://localhost:3000/api/projects/2026-russia-state-duma \
  -H "Authorization: Bearer $DASHBOARD_EDIT_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"turnout":{"nationalPercent":42.7,"reportedAt":"2026-09-20T21:12:00+03:00"}}'
```

Keep the token server-side. The public dashboard only has read access.

## Verification

```sh
npm test
npm run check
```

The data-model tests reject unused or unknown source IDs and require every
published report to include a configured source, timestamp and direct URL.

For each election, there should be list of separate sources to use.
Focus should especially be on real time sources. Streams. Immediate news sources. And official data. (Other ideas?)

Shared UI and data conventions live in `public/js`, `public/styles.css` and the
project JSON schema. A new election needs a registry entry and project snapshot;
the generic view picks it up automatically.

## Elections

Election workspaces live under `elections/<year>-<country>-<election>`.

- [2026 Russian State Duma election](elections/2026-russia-state-duma/README.md) — source research and dashboard complete; live URLs still require election-day verification

## Process of starting to follow an election

### 1. Create folder structure for the election

### 2. Do research on possible sources

#### 2.1. Make a list of possible sources in sources.md

#### 2.2. For each source, estimate the value of data it provides. Value of source can be both either informative or 'fun'. Also, latency (how close to real time data is) is value.

#### 2.3. For each source, estimate the ability for hooking it into the dashboard

### 3. Using the components of VaaliRaivo, build a dashboard
