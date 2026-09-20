# 2026 Russian State Duma election

VaaliRaivo workspace for following the election of the ninth State Duma from
Finland.

## Status

| Process stage | Status |
| --- | --- |
| 1. Create folder structure | Complete |
| 2. Research possible sources | Complete; source behavior verified on 19 September |
| 3. Build dashboard | Live — automatic adapters, cached fallback and operator API implemented |

The source evaluation and recommended launch set are in [sources.md](sources.md).
Run the application from the repository root and open
`/projects/2026-russia-state-duma` to use the desk.

## Event facts relevant to the live view

- Voting takes place from 18 to 20 September 2026.
- The Duma has 450 seats: 225 party-list seats and 225 single-member district
  seats.
- On 20 September, Finland and Moscow are both UTC+3. Times published in Moscow
  time can therefore be shown unchanged to the watch party.
- Moscow and most of European Russia close at 20:00 Finland time. Kaliningrad is
  the last regular time zone to close, at 21:00 Finland time.
- The most useful watch-party window is expected to be 20:30–00:30, with the
  first publishable nationwide exit polls and preliminary result reporting
  expected after 21:00.

The dashboard shows the source timestamp and retrieval status beside every live
value so stale or unreachable official data is not presented as current. CEC
Telegram, RBC's election RSS item and Public Chamber data are refreshed
automatically; inaccessible or browser-only sources retain explicit manual
status.
