# VaaliSeurain

VaaliSeurain is a source-aware election-night dashboard designed for a large
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
automatic refreshes and operator updates are stored in the `VaaliSeurain-data`
volume.

## App structure

- `/` — generic election-project overview
- `/projects/2026-russia-state-duma` — the Duma election-night view
- `/api/projects` — project registry
- `/api/projects/:slug` — current merged dashboard snapshot
- `/api/projects/:slug/results` — national and constituency results
- `/api/projects/:slug/districts` — every constituency, including those awaiting results
- `/api/projects/:slug/districts/:id` — one constituency's details and tally
- `/api/projects/:slug/events` — live Server-Sent Events stream
- `/api/health` — deployment health check
- `data/projects/` — version-controlled seed snapshots and source configuration
- `public/maps/` — election boundary maps and their attribution/license files

### Election-night updates

The Duma desk refreshes the public CEC Telegram pages, RBC's RSS election data,
Public Chamber counters, AFP metadata, and metadata from the configured
independent live pages every five minutes.
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
`VaaliSeurain_DATA_DIR` (or `data/runtime` outside Docker). Only dashboard data
sections are accepted.

```sh
curl -X PATCH http://localhost:3000/api/projects/2026-russia-state-duma \
  -H "Authorization: Bearer $DASHBOARD_EDIT_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"turnout":{"nationalPercent":42.7,"reportedAt":"2026-09-20T21:12:00+03:00"}}'
```

Keep the token server-side. The public dashboard only has read access.

### District results

District updates use the same authenticated `PATCH /api/projects/:slug` endpoint.
Send only the districts that changed in `constituencyResults.districts`; they
merge by numeric `id`, preserving all other districts and their map details.
Each district's `results` array replaces its previous candidate tally
(`candidates` is also accepted). National `results.parties` replaces the party
tally. Missing values stay unknown; an explicit zero is displayed as zero.

Every tally update requires `reportedAt` (an ISO timestamp with timezone), a
configured `sourceId`, and a direct HTTP(S) `sourceUrl`. These can be supplied
on each district or inherited from the incoming `constituencyResults` object.
Unknown districts, duplicate IDs and malformed counts return HTTP 422. Updates
older than a district's stored timestamp return HTTP 409; the entire request
is rejected. A leader is provisional; mark a seat `called` or `final` only when
the source calls it. Connected dashboards receive successful updates immediately.

Example payload structure (illustrative figures, not election results):

```json
{
  "constituencyResults": {
    "sourceId": "cec-counter",
    "sourceUrl": "https://example.org/official/district/1",
    "reportedAt": "2026-09-20T21:12:00+03:00",
    "districts": [{
      "id": 1,
      "countedPercent": 12.5,
      "ballotsCounted": 400,
      "results": [
        { "name": "Candidate A", "party": "Party A", "votes": 300, "sharePercent": 75 },
        { "name": "Candidate B", "party": "Party B", "votes": 100, "sharePercent": 25 }
      ]
    }]
  }
}
```

For automatic imports, set `RESULTS_FEED_URL` to a trusted JSON export using
this same structure plus a top-level `"projectSlug": "2026-russia-state-duma"`.
Only `results` and `constituencyResults` are accepted from the feed. Optional
`RESULTS_FEED_TOKEN` supplies a server-side bearer token. The normal source
refresh polls it every five minutes (or `SOURCE_REFRESH_INTERVAL_MS`), including
via `npm run refresh:sources`. Feed failures preserve the last good tallies and
appear on the constituency panel. Redirects are rejected; configure the final URL.

This is an import contract for a verified feed or upstream adapter. It does
not parse arbitrary CEC HTML. No working official district-result feed is
configured by default; the configured CEC page still times out from this host.
Until a compatible feed is available, sourced operator updates use the PATCH API.

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

### 3. Using the components of VaaliSeurain, build a dashboard
