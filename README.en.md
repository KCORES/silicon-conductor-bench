# Silicon Conductor Bench

[中文](README.md) | English

![Silicon Conductor Bench](assets/images/cover.jpg)

A benchmark that puts an LLM in the role of a traffic officer: at a busy intersection with no traffic lights, the model schedules vehicles and pedestrians using only text / structured observations and tool calls. The final balance is the score.

leaderboard: [https://silicon-conductor-bench.kcores.com/](https://silicon-conductor-bench.kcores.com/)

## What it tests

The simulator is a deterministic, tick-based four-way intersection. Each decision cycle the model receives a compact JSON observation, uses tools to inspect, dry-run and commit a release plan, then decides how long to sleep. It has to deal with:

- **Downstream spillback and gridlock**: releasing into a full exit leaves vehicles stuck inside the junction, locking cells.
- **Heterogeneous traffic**: cars, taxis, minibuses, buses, school buses, trucks, hazmat tankers, motorcycles and emergency vehicles, each with different length, start-up behavior and pricing.
- **Pedestrians and crosswalk geometry**: every route crosses two crosswalks, one on the inbound side and one on the outbound side. Get it wrong and someone gets hit.
- **Aggressive drivers**: drivers who run out of patience will run red lights, tailgate into the junction, or cut into adjacent lanes.
- **Incidents**: breakdowns, accidents and emergency convoys that call for tow trucks, clearance crews and detours.
- **Partial observability and interruption**: junction occupancy costs a paid tool call to inspect, and events such as red-light runners interrupt the model's sleep.

Tools available to the model include `inspect_junction`, `inspect_lane_queue`, `inspect_crosswalk`, `inspect_incident`, `dry_run_admit`, `commit_schedule`, `dispatch_tow_truck`, `order_accident_clearance`, `dispatch_emergency_convoy`, `guide_inbound_lane_change`, `reroute_queue_around_stall`, `set_lane_detour`, `hold` and `sleep`. Every decision and every non-terminal tool call has a cost.

The project also ships baseline policies (`random`, `longest-queue`, `hold`, `balanced`, `balanced-bus`) and a `search` planner that can see future demand, used to estimate the score ceiling.

## Quick start

Requires Node.js 22 or later.

```bash
npm install
cp .env.example .env   # fill in OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL
npm run bench -- --ticks 400 --seed 63916 --plain
```

Any OpenAI-compatible endpoint works. To run multiple sessions:

```bash
npm run bench:runs -- --parallel 6 --runs 5 --env .env.deepseek-flash --env .env.deepseek-v4-pro -- --seed 63916 --plain
```

To run a baseline (no model calls):

```bash
DOTENV_CONFIG_PATH=.env.baseline-balanced npm run bench -- --ticks 400 --seed 63916 --plain
```

API logs, reports and replays for each run are written to `logs/`. To open the 3D replay viewer:

```bash
npm run replay:dev
```

Full details on arguments, scoring rules, observation format, resuming failed runs and output artifacts are in [USAGE.zh.md](USAGE.zh.md) (Chinese).

## Scoring

The run starts with `INITIAL_BALANCE` (default 1000), and the final balance is the score. Vehicles leaving the junction earn revenue per occupant, and pedestrians released legally earn a reward when they cross. Delay, upstream backlog, accident cell locks, pedestrian injuries, unserved vehicles, and every decision and tool call cost money. All values are configurable in `.env`; see `scripts/env.template` for the template.

## Results

Four models, three runs each, under rules version 16 and seed 63916 (reference: `balanced` baseline 674.49, `search` planner 788.38):

| Model | Best | Mean | Worst |
| --- | --- | --- | --- |
| deepseek-flash | 748.30 | 642.80 | 572.62 |
| deepseek-v4-pro | 740.17 | 705.46 | 686.92 |
| step-5-preview | 694.16 | 639.20 | 601.99 |
| space-bunny-alpha | 692.70 | 628.36 | 554.37 |

See [report/rules-16-models-comparison-2026-10-02.md](report/rules-16-models-comparison-2026-10-02.md) and the per-model reports under `report/` for the full analysis (Chinese).

## Contributing benchmark results

Results for new models are welcome. Run 3 sessions with seed 63916 and submit the files in `logs/` as a PR.

1. Copy `.env.example` to `.env.<model-name>` and fill in the endpoint, API key and model name. Leave the rule parameters at their defaults.
2. Run 3 sessions:

   ```bash
   npm run bench:runs -- --runs 3 --env .env.<model-name> -- --seed 63916 --plain
   ```

3. Make sure all 3 sessions wrote a report. If any failed, use `npm run bench:runs -- --list-failed` to find and resume them.
4. Commit the files these 3 sessions produced under `logs/` (`api-log_*`, `report_*`, `replay_*`, `run_*`, etc.) in your PR. `logs/` is in `.gitignore`, so add them with `git add -f logs/<file>`.

Do not commit any `.env.*` file; it contains your API key. In the PR description, include the model name, the provider, and any non-default `.env` values you changed (such as `OPENAI_MAX_TOKENS`).

## Project layout

| Path | Contents |
| --- | --- |
| `src/core` | Intersection simulation engine, traffic, pedestrians, incidents and scoring |
| `src/agent` | System prompt, observation encoding, tool definitions and the model loop |
| `src/io` | Report, replay and checkpoint writers |
| `src/tui` | Live terminal UI |
| `src/replay` | Replay recording, data model and run statistics |
| `apps/replay` | Vite-based 3D replay viewer |
| `scripts` | Batch runs, config templates, observation measurement and asset scripts |
| `docs` | Design notes and per-version rule changes |
| `report` | Evaluation reports and analysis scripts |
| `test` | Unit tests |

## Development

```bash
npm test            # unit tests
npm run typecheck   # type check only
npm run build       # compile to dist/
```

## License

[MIT](LICENSE)
