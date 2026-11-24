# Player incentives

Overview of motivation, hooks and onboarding. For the psychology behind each
principle, with matching in-game features, tuning knobs and the fair versus
manipulative version of each, see `retention-psychology.md`.

## Motivation basics

Players return for:
- **Competence:** getting better, mastering a skill, beating something hard.
- **Autonomy:** meaningful choices, expressing a style, owning a space.
- **Relatedness:** playing with or alongside others, being seen.
- **Discovery:** new places, secrets, surprises, lore.

Hooks work best when they serve one of these. For every hook, write the
player-facing reason ("I want to finish my collection") next to the game's
reason ("retention").

## Hooks by time scale

**First minute**
- An immediate, visible reward for the first action.
- A clear first goal on screen.
- A satisfying micro loop. No walls of text, no menus before play.

**Single session**
- Short goals with visible progress bars.
- "Almost there" milestones (next unlock at 80% shown prominently).
- A natural stopping point with a next-goal teaser.
- Session-scoped surprises (a rare spawn, a random event).

**Across days**
- Daily and weekly goals that take a reasonable session, not hours.
- Streak rewards that forgive a missed day (grace days, keep partial
  progress). Never wipe a long streak for one absence.
- Rotating content (shop rotation, featured zone, weekly challenge).
- Collection completion with visible slots.

**Long term**
- Prestige/rebirth with permanent, visible benefits.
- Ranks, titles, badges, rare cosmetics.
- Mastery goals (time trials, hard modes, completion percentages).

**Social**
- Leaderboards with achievable tiers (friends, server, weekly), not only the
  global top 10.
- Friend boosts and co-op bonuses that reward playing together.
- Trading (check policy and design against scams and exploits).
- Showing off: visible pets, titles, bases, outfits.

## Reward design

- **Predictable rewards** build trust: fixed prices, guaranteed milestone
  rewards.
- **Variable rewards** add excitement: drops, crits, rare spawns. Use them
  as spice, not the whole meal.
- Show progress toward the next reward. Near-complete goals motivate
  finishing.
- Reward effort and skill, not only time or spending.
- Pity/guarantee systems on random drops reduce frustration (and may be
  required for paid randomness; check policy).
- Make rewards visible to others when they are something to be proud of.

## Onboarding (first-time user experience)

- Teach by doing in the first loop, one concept at a time.
- First choice should be low-stakes and fun (pick a starter pet, a colour).
- Make the next goal obvious at every moment: arrows, highlights, a goal
  tracker.
- Delay complexity (multiple currencies, crafting, trading) until the core
  loop is understood.
- Test with someone who has never seen the game. Watch where they hesitate.

## Measuring

If you track analytics (Roblox Creator Dashboard analytics, custom events
via `AnalyticsService`; **[verify]** current APIs):
- Early drop-off: where in the first session players leave (funnel steps).
- Session length and sessions per day.
- Return rates at day 1, 7, 30.
- Progression distribution: how far players get.

Use these to find where the loop breaks, not to push harder.

## Ethics and policy guardrails

Many Roblox players are children. Design accordingly.

- Prefer hooks that give the player something they value. Avoid fake
  urgency, guilt-based streak loss, and purchase pressure aimed at young
  players.
- No dark patterns: confusing currency conversions that hide real cost,
  "you'll lose this forever" pop-ups, purchase prompts during intense
  gameplay, misleading odds.
- Paid random items (loot boxes, paid eggs), odds disclosure, regional
  restrictions (`PolicyService:GetPolicyInfoForPlayerAsync`, e.g.
  `ArePaidRandomItemsRestricted`) and similar mechanics are governed by
  Roblox policy and local law. **Check the current Roblox Community Standards,
  Terms and monetization policies before designing them.**
- Respect experience guidelines/content maturity settings for the audience.
- If a hook only works because the player feels bad, redesign it.

## Hook review questions

For each hook:
1. Which motivation does it serve?
2. What does the player get even if they ignore it?
3. Does missing it punish the player, or just not reward them?
4. Would you be comfortable explaining it to a parent?
