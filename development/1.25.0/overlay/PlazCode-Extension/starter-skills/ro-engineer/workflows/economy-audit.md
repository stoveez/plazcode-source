# Workflow: economy-audit

Check an economy's balance, pacing and exploitability. Load
`references/progression-economy.md`.

## Phases

1. **Map currencies.** For every currency (soft, hard, event, items that act
   as currency): every source and every sink, with rates where known. In
   `studio` / `rotex` mode, find them in code: grep for balance mutations
   and config tables.
2. **Pacing.** Expected income per minute at key stages vs. cost of the next
   meaningful purchase. Time to first upgrade, first zone, first rebirth.
   Compare against the intended session and meta loops.
3. **Multipliers.** List every multiplier (pets, rebirth, boosts,
   gamepasses, events), the order of operations, and caps. Compute the
   max-stack case.
4. **Exploits.**
   - client-trusted values (price, amount, reward from payload)
   - duplication through retries, rejoin, trading or races
   - check-then-deduct races on purchase
   - free loops between conversions (buy/sell, craft/salvage)
   - negative, NaN or huge amounts
   - product grants outside `ProcessReceipt` or not idempotent
5. **Policy.** Any paid random mechanic, trading of paid items, or
   time-limited offer checked against current Roblox policy
   (`PolicyService` restrictions, odds disclosure).
6. **Inflation risk.** Sources without sinks; sinks without value.

## Output

- Source/sink table per currency
- Pacing table (milestone, expected time, notes)
- Findings ranked by severity (exploits first), each with a fix
- Tuning suggestions as config changes, not code changes, where possible
