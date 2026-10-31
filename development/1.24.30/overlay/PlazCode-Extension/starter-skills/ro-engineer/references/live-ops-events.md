# Live ops and events

## Cadence

| Cadence | Content | Purpose |
|---|---|---|
| Daily | Daily reward, daily quests, shop rotation | Reason to check in briefly |
| Weekly | Weekly challenges, leaderboard reset, featured mode | Medium-term goal |
| Seasonal (4-8 weeks) | Season pass/track, new zone, themed event | Big return moments |
| Ad hoc | Holiday events, collaborations, admin events | Spikes and freshness |

Plan a calendar a few weeks ahead. Sustainable beats ambitious: a reliable
weekly update outperforms an irregular big one.

## Limited-time events

- Clear start and end, shown in game with a countdown.
- A themed twist on the core loop (new resource, modified rules), not a
  separate game that needs separate learning.
- Event rewards that are desirable (cosmetics, themed pets, titles) but do
  not invalidate permanent progress or make non-participants uncompetitive.
- Event currency that expires or converts at the end, with clear messaging,
  so it does not leak into the main economy.
- Achievable for a casual player in a few sessions; extra goals for
  dedicated players.
- Avoid FOMO pressure aimed at young players: no guilt messaging, and
  consider bringing popular event items back later.

## Avoiding content cliffs

- After an event ends, players should land back in a main loop that still
  has goals.
- Stagger releases so there is always something upcoming and visible.
- Do not move all players' attention to an event zone that becomes empty
  afterwards.

## Server time

- Use `os.time()` (UTC) on the server for day/week boundaries. Never trust
  client time.
- Define the reset time in UTC and show players their local time on the
  client.
- `workspace:GetServerTimeNow()` gives a synchronized clock for countdowns
  on clients.
- Store "last claimed" timestamps in player data, and compute eligibility on
  the server.

## Feature flags and config

- Drive event start/end and parameters from config so you can change them
  without a code change. Options: a config module plus a published update,
  or a live config source (e.g. `ConfigService`/MemoryStore/DataStore-based
  flags; **[verify]** available services).
- Ship event code dormant ahead of time, enable by date.

## Safe rollout

- Test in a private or test place first with production-like data.
- Use migration-safe data changes: new fields with defaults, never repurpose
  old fields.
- Have a kill switch for new features.
- Shut down servers to update with `BindToClose` saves working, or use
  migration to the latest version.
- Watch error rates, economy logs and analytics after release.
