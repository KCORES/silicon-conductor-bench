---
name: model-eval-report
description: Evaluates one model's silicon-conductor-bench runs: picks the highest-scoring of its (usually three) runs under the current rules version, runs the log analyzer, and writes a Chinese final report on context ability, attention, tool_call accuracy, agent ability, reasoning, game play, and best/worst operations. Use when the user asks to evaluate, analyze, or write a final report for a model's benchmark runs.
disable-model-invocation: true
---

# 模型评测报告

Input: a model name (as in `summary.model`, e.g. `qwen-3.8-27b` or `stealth/space-bunny-alpha`). Each model is run three times; the run with the highest final balance is the valid run and gets the full analysis. The other runs are used only for a stability comparison.

Respond to the user in Chinese. Never print values from `.env*` files or `%TEMP%\env-backup-*`.

## Workflow

```
- [ ] 1. Select the best run
- [ ] 2. Analyze all comparable runs
- [ ] 3. Verify the numbers
- [ ] 4. Collect case evidence from raw logs
- [ ] 5. Write the report
- [ ] 6. Cross-check the report
```

### 1. Select the best run

```powershell
node report/select-best-run.mjs --model <model> [--rules N] [--expected 3]
```

- Defaults to the latest rules version among the model's complete runs; only runs with the same rules version, seed, and horizon are compared.
- Output: ranked runs, balance spread, matching baselines, `BEST_REPLAY=...`, and `report/out/<slug>_rules-<N>_runs.json`.
- Handle every `WARN`:
  - Fewer than 3 runs: tell the user and ask whether to continue with what exists.
  - Missing `baseline-balanced` / `baseline-search`: run them under the same rules (about 8 minutes for search), then rerun the selector:
    ```powershell
    foreach ($b in 'balanced','search') { Remove-Item Env:DECISION_BASELINE,Env:PEDESTRIAN_DEMAND_ENABLED -ErrorAction SilentlyContinue; $env:BENCH_QUIET_CONSOLE='1'; $env:DOTENV_CONFIG_PATH=".env.baseline-$b"; node dist/src/cli.js --ticks 200 --seed 63916 --plain }
    ```
    Use the seed and tick count of the model's runs. Run `npm run build` first if `dist/` is stale.
  - Incomplete runs are excluded automatically; mention them in the report.

### 2. Analyze all comparable runs

```powershell
node report/analyze-run.mjs <replay of each comparable run>
```

Each run writes `report/out/<run-id>/analysis.json` and `analysis.md`. The best run gets the deep dive; for the others, only pull the headline numbers (balance, admitted vehicles, incidents, tool success rate, phase success, crosswalk-claim accuracy) for the stability table.

On the Z: drive, add `Start-Sleep 2` before reading freshly written files. Read Chinese files with the Read tool or `Get-Content -Encoding UTF8` (console output may show mojibake; the files are fine).

### 3. Verify the numbers

Before trusting `analysis.json`, check it against `report_<id>.json`:
- `agent.overhead.apiCalls` equals `summary.totals.apiCalls`.
- Scoreboard balances match the selector output.
- Ledger: 1000 + sum of `summary.cycles[].financialDelta` + `terminal.outboundToll` − `terminal.unservedLiability` ≈ `finalBalance`.
- Report cycle N carries the interrupt that wakes cycle N + 1 (the analyzer already shifts this; keep it in mind when reading `report_*.json` directly).

If something does not match, fix `report/analyze-run.mjs` rather than patching numbers in the report.

### 4. Collect case evidence

The analyzer's cycle cards and highlights only pick candidate cases. For each case used in the report, open the raw reasoning (`raw-api-log_<id>.jsonl`, `payload.choices[0].message.reasoning`, filtered by `cycle`) and quote the decisive sentence. Typical evidence queries:
- Cost by time segment: sum `summary.cycles[]` fields between ticks to find where the loss happened.
- Patience-risk admissions vs. struck pedestrians (`game.pedestrians.patienceRiskAdmissions`).
- Wrong crosswalk claims (`reasoning.crosswalkClaims.wrongSamples`).
- Incident chain: `incidents[].admittedBy` and `game.incidents[].selfEntered` (self-entered vehicles are aggressive drivers, not model admissions).

### 5. Write the report

Write `report/<model-slug>-final-report-<YYYY-MM-DD>.md` in Chinese, using the structure in [report-template.md](report-template.md). Every claim needs a number or a cycle/tick/ID reference. Lead with the conclusion.

### 6. Cross-check

Re-read the report and verify each number and ID against `analysis.json` or the logs (driver counts, tick ranges, which crosswalk a route crosses, percentages). Then give the user a short Chinese summary: best run ID and score, rank vs. baselines, three main findings, and the report path.

## Domain notes

- Route-to-crosswalk rule: a route crosses its entry-side crosswalk and its exit-side crosswalk. Exit side — STRAIGHT: N→S, S→N, E→W, W→E; RIGHT: N→W, E→N, S→E, W→S; LEFT: N→E, E→S, S→W, W→N. `GUIDED_<TURN>` routes use that turn.
- Hold-heavy late games usually show up as `upstreamBleed` plus terminal `unservedLiability`; this is often the largest loss.
- Metrics based on reasoning text (attention rates, crosswalk claims, contradictions) are regex heuristics; quote raw text for any case built on them.
- The analyzer's cycle value and incident blame are heuristics for picking evidence, not exact accounting. Say so in the report.
- Known engine limitations still present must be listed in the report's limitations section; check `USAGE.zh.md` and `SIMULATION_RULES_VERSION` in `src/replay/types.ts` for the current state. See the template for the list as of rules 19.
