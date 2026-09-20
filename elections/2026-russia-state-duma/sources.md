# Sources for the 2026 Russian State Duma election

Research snapshot: **19 September 2026, 23:12 EEST (UTC+3)**. Re-check all live
URLs before the 20:30 EEST watch-party start; election-night pages and stream
URLs may only be published on 20 September.

This document completes process step 2: it lists possible sources, rates their
informational and watch-party value, estimates latency, and records how feasible
each source is to connect to a later dashboard.

## Rating scale

- **Information**: 1 is background/noise; 5 is primary or essential election
  data.
- **Watchability**: 1 is useful only on demand; 5 works well as a continuously
  visible watch-party panel.
- **Integration**: 1 is manual or hostile to automation; 5 is a stable,
  structured feed with clear reuse terms.
- Latency is an estimate of the delay between an event/data update and its
  appearance at the source. It is not a measured service-level guarantee.

## Recommended launch set

| Source                                                                                                                                                                                                          | Best contribution                                                                    | Info | Watchability | Expected latency                            | Integration | Recommendation                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---: | -----------: | ------------------------------------------- | ----------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [CEC Duma live counter](https://cikrf.ru/analog/ediny-den-golosovaniya-2026/khod-golosovaniya/khod-golosovaniya.php?ID=2)                                                                                       | Official turnout and rotating preliminary-result displays                            |    5 |            4 | Real time to a few minutes                  |           2 | Primary numerical baseline. Keep a visible stale-data warning and a manual-entry fallback.                                                                                               |
| [CEC Information Centre](https://www.cikrf.ru/analog/ediny-den-golosovaniya-2026/informatsionnyy-tsentr-tsik-rossii/) and [video page](https://www.cikrf.ru/vid/)                                               | Official briefings, result announcements, and live video wall                        |    5 |            5 | Live                                        |           3 | Main event stream. Resolve the final player/embed URL on election day.                                                                                                                   |
| [CEC Telegram](https://t.me/s/cikrossii)                                                                                                                                                                        | Timestamped official turnout, incident, schedule, and result posts                   |    4 |            4 | Minutes                                     |           4 | Automatic adapter stores post IDs, timestamps, links and short text. It only promotes explicitly labelled national/DEG figures and never treats the channel as a structured results API. |
| [Federal DEG observer portal](https://stat.vybory.gov.ru/)                                                                                                                                                      | Federal remote-electronic-voting participation and, after close, DEG data            |    4 |            4 | Near-real time                              |           2 | Useful dedicated panel, but keep separate from nationwide turnout and Moscow's regional system.                                                                                          |
| [Moscow election observer](https://observer.mos.ru/)                                                                                                                                                            | Moscow electronic ballots issued/received and observer information                   |    4 |            4 | Near-real time                              |           1 | High-value comparison source for Moscow; needs a browser/manual fallback because automated access could not be verified.                                                                 |
| [RBC live DEG map](https://www.rbc.ru/politics/18/09/2026/6aad53b50e440270babdf175) and [public RSS feed](https://rssexport.rbc.ru/rbcnews/news/30/full.rss)                                                                                   | Updating federal and Moscow electronic-voting figures                                |    4 |            3 | Minutes                                     |           4 | Automatic adapter reads the named election item from RBC's RSS feed, retains its qualifiers, timestamp and direct article link, and never copies the full article body.                  |
| [Novaya Gazeta Europe election live page](https://novayagazeta.eu/elections2026/online)                                                                                                                         | Independent live reporting, incidents, and critical context                          |    4 |            4 | Minutes                                     |           2 | Use as one critical live feed; open externally if no licensed feed is available.                                                                                                         |
| [Meduza's updating election report](https://meduza.io/en/feature/2026/09/18/russia-s-state-duma-elections-begin-with-record-online-turnout-a-million-votes-in-occupied-donetsk-and-attempts-to-bribe-observers) | Rapid independent reporting on DEG, observers, coercion, and discrepancies           |    4 |            3 | Minutes to tens of minutes                  |           3 | Good English-language critical source. Track headline, update time, and link unless a supported feed is found.                                                                           |
| [Public Chamber election monitoring](https://monitoring.oprf.ru/)                                                                                                                                               | Official-aligned observer statistics, hotline activity, reports, and embedded video  |    3 |            4 | Near-real time                              |           4 | Automatic adapter reads the eight published counters and latest monitor headline. Figures remain labelled as the chamber's classifications.                                              |
| [DOXA election report](https://g3nr6w6k61.execute-api.eu-central-1.amazonaws.com/news/2026-09-18-vybory-gosduma-deg-sboi-nablyudateli)                                                                          | Independent observer-access, coercion, DEG, and alleged-violation reporting          |    4 |            2 | Tens of minutes to hours                    |           2 | Use for verified incident cards, not as a numerical result feed. The current mirror-like URL may change.                                                                                 |
| [RIA “Election Night: Duma 2026” stream](https://pressria.ru/20260920/959377040.html)                                                                                                                           | Scheduled election-night programme, regional live links, panels, and party briefings |    3 |            5 | Live from 15:00; party briefings from 22:00 |           3 | Strong watch-party background stream. Confirm player framing and regional accessibility on Sunday.                                                                                       |
| [AP election coverage](https://apnews.com/article/russia-parliamentary-election-state-duma-observer-31a304d3156d9a066ff8001cf1338d7e)                                                                           | International verification and geopolitical context                                  |    4 |            2 | Tens of minutes to hours                    |           1 | Keep as an editorial/context link, not a scraped feed. Article URLs are not a stable election API.                                                                                       |
| [Vedomosti turnout report](https://www.vedomosti.ru/politics/news/2026/09/19/1230198-yavka-previsila-40)                                                                                                        | Timestamped fallback publication of a CEC national-turnout figure                    |    4 |            2 | Minutes                                     |           1 | Used only when the CEC counter is unreachable; attribution names both the publisher and the underlying CEC claim.                                                                        |

### Why these sources complement each other

No single source covers the event well enough. The CEC sources are authoritative
for what the election administration publishes, but they do not independently
validate those figures. RBC adds a fast mainstream news layer. Novaya Gazeta
Europe, Meduza, and DOXA add independent reporting about irregularities and
differences between voting modes. The Public Chamber offers the official-aligned
observation account, while AP supplies international framing. Showing the source
on every item is therefore part of the product, not decorative attribution.

## Secondary and trigger-based sources

| Source                                                                                                                                                                                                                             | Use                                                   | Info | Watchability | Latency                                    | Integration | Notes                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---: | -----------: | ------------------------------------------ | ----------: | ------------------------------------------------------------------------------------------------------------------------------- |
| [CEC VK channel](https://vk.ru/cikrussia)                                                                                                                                                                                          | Backup host for CEC live video                        |    4 |            5 | Live                                       |           3 | CEC is directing viewers here, but the exact election-night video URL is not yet stable. Prefer the platform's supported embed. |
| [VTSIOM party ratings](https://wciom.ru/ratings/reiting-politicheskikh-partii/) and [10 September forecast](https://wciom.ru/analytical-reviews/analiticheskii-obzor/vybory-v-gosudarstvennuju-dumu-2026-prognoz-ac-vciom)         | Pre-election benchmark and likely exit-poll publisher |    3 |            3 | Static now; likely one release after 21:00 |           3 | Watch the homepage at 21:00. Do not mistake the 2016 exit-poll pages returned by search for 2026 data.                          |
| [FOM](https://fom.ru/)                                                                                                                                                                                                             | Polling benchmark or possible exit poll               |    2 |            2 | Unknown                                    |           2 | No Duma-2026 election-night endpoint was found in this research pass. Keep off-screen unless a current release appears.         |
| [Reuters Connect election video](https://www.reutersconnect.com/item/russia-begins-voting-in-parliamentary-election-to-select-450-state-duma-members/dGFnOnJldXRlcnMuY29tLDIwMjY6bmV3c21sX09XQU5BQ0FBVklERU8yMDI2MDkxODQyNTAzNjcz) | International context and footage                     |    4 |            3 | Tens of minutes to hours                   |           1 | Useful editorial reference, but Reuters Connect content is licensed and not a dashboard feed.                                   |
| [Red Line](https://www.rline.tv/)                                                                                                                                                                                                  | KPRF-aligned live commentary and observer reports     |    3 |            4 | Live/minutes                               |           2 | Optional party-perspective stream. Label the affiliation prominently and never use it as the sole source for an incident.       |

## Integration findings

Tests from the development host at the research timestamp produced these
results:

| Source                       | Probe result                                                    | Consequence for stage 3                                                                                                 |
| ---------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| CEC Duma counter             | Timed out after 12 seconds                                      | Do not make the whole view depend on a client-side CEC request. Add caching, a timeout, and a last-success timestamp.   |
| Federal DEG portal           | Timed out after 12 seconds; it is also a JavaScript application | Inspect its browser network calls before choosing an adapter. A screenshot/browser panel is the initial fallback.       |
| RBC article/topic pages      | Returned HTTP 401 to a plain automated request                  | Use RBC's public RSS export instead; it exposes the direct live-map URL, update time, summary and current DEG figures.   |
| Novaya Gazeta Europe         | HTTP 200, with `X-Frame-Options: SAMEORIGIN`                    | It cannot be placed directly in a cross-origin iframe. Use headline/link metadata or open it separately.                |
| Meduza                       | HTTP 200 and `Access-Control-Allow-Origin: *`                   | A small server/client adapter may be possible, but there is no verified stable data API. Do not copy full article text. |
| CEC Telegram public web view | HTTP 200, with `X-Frame-Options: SAMEORIGIN`                    | Implemented as a server-side, timeout-bounded metadata adapter. Parse failures do not clear the last good values.       |
| Public Chamber monitor       | Publicly readable and marked CC BY 4.0                          | Implemented for the published counters and headline ticker with explicit official-aligned attribution.                  |

These are observations, not permission to scrape. Before implementing an
adapter, check robots rules, terms, rate limits, attribution, and copyright. For
editorial publishers, the safe default is to store only source name, headline,
publication/update time, and link.

## Proposed source priority on election night

1. **Official numbers:** CEC Duma counter, with CEC Telegram as the fallback.
2. **Electronic voting:** federal DEG portal plus the separate Moscow observer
   source. Never combine them without labelling the coverage difference.
3. **Mainstream live reporting:** RBC.
4. **Independent live reporting:** Novaya Gazeta Europe and Meduza.
5. **Incidents:** show Public Chamber and DOXA reporting side-by-side and mark
   claims as reported, confirmed, disputed, or unresolved.
6. **Video:** CEC Information Centre first; RIA Election Night as the more
   watchable fallback.
7. **International interpretation:** AP/Reuters links after major calls or
   announcements, not as the live-results backbone.

## Election-day verification checklist

- At 20:00 EEST, resolve and test the final CEC and RIA stream/player URLs.
- At 20:45, test CEC, federal DEG, Moscow, RBC, Novaya, and Meduza from the same
  network and browser that will drive the large screen.
- At 21:00, locate the new CEC preliminary-results page and the current VTSIOM
  exit-poll release; do not reuse an older election page.
- Record the retrieval timestamp and source next to every numeric value.
- If a source fails twice, retain its last successful value but mark it stale;
  never silently replace an official figure with a media report.
- Preserve raw snapshots of structured data used by the dashboard so later
  corrections can be audited.

## Remaining election-night gaps

- No documented public API for nationwide CEC preliminary results was found.
- The exact CEC election-night live video and preliminary-results URLs may only
  become stable on 20 September.
- No confirmed 2026 exit-poll publication endpoint was available yet.
- Access from the Finland-hosted development environment to CEC and federal DEG
  endpoints timed out during this research pass, while other tested publishers
  were reachable.
- A current Golos/independent violation-map endpoint specific to this election
  was not found reliably enough to recommend. It is intentionally absent rather
  than guessed into the dashboard.

## Implemented refresh behavior

- `npm run refresh:sources` performs a one-off update; the server runs the same
  refresh every five minutes unless disabled.
- CEC Telegram, RBC RSS, Public Chamber, Novaya Gazeta Europe, Meduza and DOXA
  are fetched concurrently with a 12-second timeout per source.
- Only source metadata, short summaries and explicit numerical claims are kept;
  full editorial article bodies are neither stored nor reproduced.
- New data replaces older entries from the same automatic source. Failed
  sources keep their last successful timestamp and become stale/offline.
- New official figures are applied only when their stated report time is newer
  than the current dashboard value. Moscow and federal DEG remain separate.
