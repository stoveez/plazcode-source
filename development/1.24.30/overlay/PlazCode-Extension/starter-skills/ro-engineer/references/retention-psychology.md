# Retention psychology

Why players come back, explained as principles linked to concrete in-game
features. Use this to choose features on purpose, explain why a hook works,
and catch hooks that work only by pressure.

`player-incentives.md` is the overview (motivations, hooks by time scale,
onboarding, ethics guardrails). This file goes deeper on each principle.
Examples refer to the games in `market-references.md`.

Many Roblox players are children. Every principle below can be used fairly
or manipulatively. Each one says which is which.

## Quick map

| Principle | Typical features | Risk |
|---|---|---|
| Variable reward | Rolls, lucky blocks, spawn tables, mutations | Medium (high if paid) |
| Anticipation, tension and release | Chases, safe zones, pressure valves, hatch timers | Low |
| Goal gradient | Progress bars, "next unlock" meters | Low |
| Endowed progress | First goal partly filled | Low |
| Completion pull (Zeigarnik) | Index with empty slots, sets, variants | Low-medium |
| Scarcity and urgency | Restock timers, limited spawns, events | High |
| Loss aversion | Stealing, base defence, streaks | Medium-high |
| Competence | Skill checks, mastery, harder zones | Low |
| Autonomy | Route choice, build/upgrade choices | Low |
| Relatedness and social proof | Visible pets, leaderboards, co-op, trading | Medium |
| Ownership (IKEA effect) | The base, displays, customization | Low |
| Peak-end rule | Session end screens, reveals at the base | Low |
| Return hooks | Daily rewards, offline income, restocks | Medium |

## Principles

### Variable reward

**Mechanism:** unpredictable rewards are more exciting and get checked more
often than fixed ones. The anticipation is part of the reward.

**Features:** spawn tables with rarity tiers; the roll when a block is kicked
or an egg arrives at the base; mutations (a rare variant of a common item).

**Tuning:**
- reveal timing (pre- vs post-acquisition, see `game-loops.md`)
- rarity curve
- how dramatic the reveal is (sound, VFX, pause)
- pity/guarantee after N attempts

**Fair vs manipulative:**
- *Fair:* free rolls earned through play, guaranteed minimum value, pity
  systems.
- *Manipulative:* paid rolls with hidden odds, near-miss animations faked to
  imply "almost".
- Paid random items are governed by Roblox policy (odds disclosure, regional
  restrictions via `PolicyService`). Check the current rules.

**Measure:** reveal frequency per session, rare-drop rate vs intended, quit
rate right after bad rolls.

### Anticipation, tension and release

**Mechanism:** arousal followed by relief feels good, and the relief is
sharper after real risk. "Just made it" moments are what players remember
and tell friends about.

**Features:**
- a monster or tsunami chase back to base
- PvPvE theft risk
- an egg hatch timer (tension with no enemy)
- pressure-valve safe pockets along a linear route

**Tuning:**
- threat speed vs player speed (the progression axis)
- distance between safe pockets
- sustained vs pulsed rhythm
- a short grace window on contact

**Fair vs manipulative:** generally fair. The risk is fatigue: constant
tension with no release burns players out. Keep failures fast and cheap to
retry.

**Measure:** run success rate by distance, deaths per run, how often players
reach the far, high-value zones.

### Goal gradient and endowed progress

**Mechanism:** effort speeds up as a goal gets closer. A goal that starts
partly done feels closer, so people finish it more often.

**Features:**
- progress bars on the next upgrade, zone or index set
- "2/10 collected" counters
- a first quest that starts at 1/3

**Tuning:** milestone spacing, putting the next goal on screen, short first
goals.

**Fair vs manipulative:** fair. Abuse is a bar that slows sharply near the
end to push a purchase.

**Measure:** milestone completion rate, time between milestones, drop-off
just before a milestone (a grind wall).

### Completion pull (Zeigarnik effect)

**Mechanism:** unfinished sets nag at people; empty slots invite filling.

**Features:**
- a collection index with silhouettes of missing items
- set bonuses
- mutation and variant tiers that reopen a "finished" collection
- base displays with visible gaps

**Tuning:** set size, how many slots are visible at once, a reward for
finishing each set, a new layer added after completion.

**Fair vs manipulative:** fair if every slot can be earned through play.
Manipulative if a set can only be finished with paid or expired items.

**Measure:** index completion distribution, attempts on the last missing
item.

### Scarcity and urgency

**Mechanism:** limited or time-boxed items seem more valuable; a deadline
pushes people to act now.

**Features:**
- timed world restocks (eggs respawn on a global timer)
- a rare spawn announced to the server
- limited-time events

**Tuning:** restock interval, how scarce rare items are, event length,
whether event items come back later.

**Fair vs manipulative:** **high risk with young players.**
- *Fair:* short, frequent restock cycles that create rush moments during
  play; rare spawns that reward whoever is online.
- *Manipulative:* countdowns on purchases, "never coming back" messaging,
  urgency that pushes players to log in at fixed times.
- Prefer cycles of minutes that create gameplay rushes over deadlines of
  days that pull players back in.

**Measure:** activity spikes at restocks, time-limited purchase share, player
complaints.

### Loss aversion

**Mechanism:** losing something hurts more than gaining the same thing feels
good.

**Features:**
- PvP stealing from bases or mid-run
- base defence and locks
- streaks
- items that break or expire

**Tuning:**
- what can be stolen (a share, not everything)
- protection windows and shields earned through play
- streak grace days

**Fair vs manipulative:**
- *Fair:* theft risk that adds tension, with ways to protect yourself through
  play, and losses that are quick to rebuild.
- *Manipulative:* losses only a purchase can prevent; streak wipes for one
  missed day; guilt messaging. See SE-24.

**Measure:** quit rate after being stolen from, streak break vs return rate.

### Competence

**Mechanism:** getting visibly better is motivating in itself.

**Features:**
- a skill-check timing bar on kicks
- routes and pressure-valve timing that expert players master
- harder, further zones
- personal bests

**Tuning:** skill-check window, payoff for skill vs luck, difficulty curve
by zone.

**Fair vs manipulative:** fair. This is one of the healthiest hooks;
skill-based rewards balance out luck-based ones.

**Measure:** skill-check success rate over time, how far players reach by
session count.

### Autonomy

**Mechanism:** meaningful choices create ownership and replay value.

**Features:**
- route choice in radial/exploration layouts
- push-or-retreat decisions at pressure valves
- which upgrade axis to buy first
- base layout

**Tuning:** real trade-offs between options (no single dominant choice).

**Fair vs manipulative:** fair.

**Measure:** spread of choices (if 95% pick the same option, it isn't a real
choice).

### Relatedness and social proof

**Mechanism:** people want to belong, compare, and show off; others'
behaviour signals value.

**Features:**
- pets following players
- visible bases and displays
- server announcements of rare finds
- leaderboards with friend and server tiers
- co-op bonuses
- trading
- PvP rivalry

**Tuning:** visibility of rare items, achievable leaderboard tiers, rewards
for playing with friends.

**Fair vs manipulative:**
- *Fair:* showing off, co-op, achievable leaderboards.
- *Manipulative:* status for sale and shaming non-payers.
- Trading needs scam and exploit protection, plus a policy check.

**Measure:** share of sessions with friends, join-via-friend rate,
leaderboard engagement.

### Ownership (IKEA effect)

**Mechanism:** people value what they built or chose more.

**Features:** the base itself, displays of collected items, upgrades shown on
the base, customization.

**Tuning:** visible change at the base after each session, display slots.

**Fair vs manipulative:** fair. Ownership is also why theft hurts; balance it
with protection (see loss aversion).

**Measure:** time spent at the base, customization use.

### Peak-end rule

**Mechanism:** a session is remembered by its peak and its end, not its
average.

**Features:**
- the post-acquisition reveal at the base (a peak at the moment of safety)
- an end-of-run summary
- a next-goal teaser at a natural stopping point

**Tuning:** put the best moment at the end of a run, never make a failure
the last thing the player sees without a quick retry, show progress made.

**Fair vs manipulative:** fair. Abuse is a purchase prompt timed to the
emotional peak.

**Measure:** next-day return rate by how the last session ended.

### Return hooks

**Mechanism:** a concrete reason to come back makes returning easy.

**Features:**
- daily rewards
- offline income at the base
- the restock cycle
- weekly events
- an egg or creature growing while away

**Tuning:**
- reward size vs session size
- forgiving streaks
- offline caps (so absence isn't punished and staying online isn't required)

**Fair vs manipulative:** fair when the player gets something whether or not
they come back daily. Manipulative when absence destroys progress.

**Measure:** D1/D7/D30 return, claim rates, how many return only to claim.

## Feature → principle lookup

| Feature | Principles |
|---|---|
| Roll on kick / at base | Variable reward, peak-end |
| Spawn table with far rare items | Variable reward, tension, autonomy |
| Monster / tsunami chase | Tension and release |
| PvP stealing | Tension, loss aversion, relatedness |
| Pressure-valve safe pockets | Tension and release, autonomy, competence |
| Hatch / crack timer | Tension (time pressure), return hooks |
| Timed restock | Scarcity, return hooks, variable reward |
| Skill check | Competence |
| Speed / strength upgrades | Goal gradient, competence |
| Collection index | Completion pull, goal gradient |
| Mutations / variants | Variable reward, completion pull |
| Base display | Ownership, social proof |
| Pets following the player | Social proof, ownership |
| Cleaning / feeding | Ownership, competence (a satisfying second verb) |
| Daily reward / offline income | Return hooks |
| Leaderboard tiers | Relatedness, competence |
| Rebirth | Goal gradient, competence, completion pull |

## Review questions for any hook

1. Which principle does it use?
2. Is it the fair or the manipulative version?
3. What does the player get even if they ignore it?
4. Does missing it punish the player, or just not reward them?
5. Would you be comfortable explaining it to a parent?

Ethics and policy guardrails: `player-incentives.md`.
