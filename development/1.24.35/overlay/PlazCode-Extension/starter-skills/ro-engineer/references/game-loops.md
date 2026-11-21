# Game loops

How to design and break down loops for current Roblox hits. The framework
here is meant to last. For the game-by-game breakdown, see
`market-references.md`, which is a dated snapshot. For why each block keeps
players coming back, see `retention-psychology.md`.

## Loop anatomy

```
action -> reward -> progression -> reinvestment -> (action, now better)
```

- **Action:** the verb the player performs (steal, ride, kick, dig).
- **Reward:** what the action produces (a pet, a brainrot, treasure, cash).
- **Progression:** visible change in the player (faster, stronger, more
  slots, new zone).
- **Reinvestment:** the player spends the reward to get better at the action,
  so the next run feels better.

If a step is missing, the loop leaks: rewards with nothing to spend them on,
spending that changes nothing visible, or progression the player can't feel.

## Time scales

- **Micro (seconds):** the verb and its feedback. It must feel good even with
  no rewards attached: movement, the chase, the roll reveal, sound, VFX.
- **Session (minutes):** a run out of the base and back. It ends on a visible
  gain and a visible next goal.
- **Meta (days/weeks):** collection completion, rebirth, rare variants,
  events.

## The current market: base-and-collect

The highest-earning Roblox games right now sit in a narrow niche: simulators
and tycoons where the player **leaves a base, gets a thing, and brings it
back**. Under the hood most of the hits are the same game. They swap out a
few building blocks, and the blocks they change are the ones that set them
apart. Design by choosing each block on purpose, not by inventing everything
from scratch.

## Game anatomy: the building blocks

Think of a game as a house. The foundation is **fantasy** and **unique
mechanic**: the highest-leverage blocks and the main way to stand out. The
rest is the frame. It is usually shared with the genre and changed only when
the change means something.

### 1. Fantasy

The fantasy is the **primary verb**, usually right in the title: ride, steal,
escape, kick, dig, save, raise.

- It sets what the player does and how it feels.
- It **signals the audience**. "Save animals" or "raise a creature" can reach
  players who never tried "steal a thing", which opens a new audience rather
  than competing for the same one.
- A new fantasy on a proven frame is the cheapest strong innovation.

### 2. Unique mechanic

The one thing the reference games don't do. Variants seen in the niche:

| Mechanic | What it does | Note |
|---|---|---|
| Exploration | Open world to roam for spawns | Usually paired with radial level design |
| Timed world restock | World spawns refresh on a global timer | A UI shop restock moved into the world; creates rush moments |
| Pressure-valve level design | Safe pockets along a dangerous route | The level itself becomes the mechanic (see Tension) |
| Skill check | Timing bar or tap on interaction | Adds competence to a luck moment |
| Cleaning / processing | Work on the item after you get it | Turns the reward into a satisfying second verb |
| Feeding / raising | Grow the item over time at the base | Shifts the fantasy from taking to nurturing |

A mechanic doesn't need to be new to Roblox, only new to this niche or this
fantasy. Borrowing a mechanic from another genre is a legitimate innovation.

### 3. Core loop

For the whole niche: **leave base → get thing → return**. Games differ in
what "get" means (grab, steal, kick open, dig up, rescue) and what threatens
the trip back.

### 4. RNG

Two independent choices:

**Source:** where the randomness comes from
- *World spawn table:* the world spawns random items to go and get.
- *Roll on interaction:* the item is decided when you act (kick the block).
- *Timed restock:* a global refresh decides what is available.

**Reveal timing:** when the player sees the result

| Timing | Player experience | Use when |
|---|---|---|
| Pre-acquisition | The roll or rarity shows before you carry it home | You want the trip back tense ("I'm carrying something rare") |
| Post-acquisition | The roll happens once it's safely at the base | You want a reveal moment at home, as a reward for getting back |
| No roll (visible) | Rarity is visible in the world | You want route choice: risk the far, rare item or not |

The back end can differ from what the player sees. Design the
**player-facing** timing on purpose. All rolls run on the server.

### 5. Level design

| Layout | Shape | Effect |
|---|---|---|
| Linear | Base at one end, a route out with rarer things further away | Distance = risk = rarity; simple to read |
| Radial | Base at the centre, spawns in every direction | Exploration and choice of direction |
| Simple / islands | Small areas, more unlocked over time | Low tension; progression gates new areas |
| Pressure valve | A linear route with safe pockets | Tension-release, tension-release on every run |

### 6. Tension

The "holy, I just made it" moment. Every hit in the niche has some.

| Type | Source | Release |
|---|---|---|
| PvE chase | A monster, tsunami or shark chases you | Reaching the safe zone or base |
| PvPvE | PvE chase plus other players who can steal | The base; compounded by scarcity |
| Time pressure | The item expires or hatches on a timer | Getting home in time |
| None / mild | Effort only (digging) | — (weakest block; a chance to innovate) |

Tension rhythm matters as much as type:
- **Sustained:** constant tension from pickup until the safe zone.
- **Compressed / pulsed:** short bursts with safe pockets in between (the
  pressure valve). The player chooses when to push on, which adds a
  risk-vs-reward decision to every run.

### 7. Progression axis

What reinvestment improves. Usually one primary axis:
- **Get faster:** speed, so you outrun the threat and reach further.
- **Get stronger:** power, so you kick or dig rarer things.
- **Capacity / income:** more slots, more cash per item at the base.

Make the axis match the threat: speed against a chase, power against
resistance.

### 8. Collection

The long-term goal: pets, brainrots, treasure, rescued animals. Extra layers
that deepen a collection without new base content:
- rarity tiers
- **mutations/variants** (the same item in rarer forms)
- an index with visible empty slots
- display at the base

## Differentiation method

1. **Pick the genre and one reference game** that is performing well now.
2. **Map its blocks** using the table above (`templates/game-loop-template.md`
   has a "game anatomy vs reference" table).
3. **Innovate where it matters most: fantasy and unique mechanic first.**
   Keep the proven frame (core loop, RNG, level design) unless you have a
   reason to change it.
4. **Size the ambition.** The source heuristic: changing roughly 20% of a
   proven reference, in the blocks that matter, is enough for a solid
   small-to-mid game. A much higher ceiling comes from **stacking several
   researched innovations**, such as a new fantasy plus a new mechanic plus
   new level design plus a different kind of tension.
5. **Every change must be meaningful,** felt in play and backed by research,
   not a reskin. A theme swap with an identical verb is not an innovation.

Look for a block the reference games all do weakly (e.g. no tension in a dig
game) and make that your strength.

## Loop checks

- Can a new player say the fantasy (the verb) after 30 seconds?
- Does the micro loop feel good with rewards turned off?
- Where is the tension peak on a run, and where is the release?
- Is the roll pre- or post-acquisition, and does that choice support the
  tension you want?
- Does the progression axis answer the threat (faster vs. a chase, stronger
  vs. resistance)?
- Is the far or rare reward visible early, so risk has a clear payoff?
- Which blocks match the reference, which differ, and is each difference
  meaningful?
- What does a player with 10 hours chase that one with 10 minutes doesn't
  (mutations, index completion, rebirth)?

## Common failures

- **Reskin, not innovation:** a new theme on an identical verb and mechanic.
- **No release:** constant tension with no safe pockets. It tires players out
  instead of thrilling them.
- **Flat tension:** nothing threatens the trip home, so getting back feels
  automatic.
- **Grind wall:** the next unlock takes far longer than the previous one,
  with nothing new in between.
- **Collection dead end:** the index is finished with no variant or rebirth
  layer behind it.
- **Invisible upgrades:** speed or strength gains the player can't feel.
