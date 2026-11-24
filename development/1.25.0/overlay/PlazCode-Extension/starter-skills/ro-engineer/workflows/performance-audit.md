# Workflow: performance-audit

Measure first, then fix the biggest cost. Do not guess. Load
`references/performance.md`.

## Phases

1. **Define the problem.** Which scenario is slow (lobby, boss fight, full
   server, after 30 minutes), on which devices, client or server, and what
   the target is (e.g. 60 FPS on mid-range phones, server heartbeat 60).
2. **Measure.**
   - `studio`: use `execute_luau` to count parts, instances, scripts,
     active ParticleEmitters, lights with shadows and unanchored parts; run
     timed benchmarks with `os.clock()` and read them via
     `get_console_output`; use `start_stop_play` for the scenario.
   - `offline`: ask for MicroProfiler captures, Developer Console memory
     and script activity screenshots, and instance counts.
3. **Find the biggest cost.** Rank: rendering/instances, scripts,
   physics, network, memory growth, UI.
4. **Fix one thing.** Propose the fix with expected impact.
5. **Re-measure.** Record before/after numbers.
6. **Repeat** until the target is met, then stop.

## Output

- Scenario and target
- Measurements (table)
- Ranked costs
- Fixes applied or proposed, each with before/after numbers or expected
  impact
- What was not measured and should be
