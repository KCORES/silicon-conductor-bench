# 用法

基准程序一次启动就是一场完整实验：独立的模拟引擎、工作记忆、日志、报告和回放。连跑多场时用外层脚本重复启动它，不要把场次写进单场入口。

需要 Node.js 22 或更高版本。先复制 `.env.example` 为 `.env`，至少填好 `OPENAI_API_KEY`、`OPENAI_BASE_URL` 和 `OPENAI_MODEL`。其余计费、车流和 Agent 参数都在 `.env.example` 里有注释。

## 跑一场

```bash
npm run bench
```

这条命令会先编译，再执行 `node dist/src/cli.js`。终端是 TTY 时显示实时界面；流水线或重定向输出时自动改成纯文本。

```text
node dist/src/cli.js [cycles] [--ticks <integer>] [--seed <integer>] [--plain] [--no-release] [--resume <api-log>]
```

| 参数 | 含义 |
| --- | --- |
| `--ticks` | 本场在 warmup 之后固定运行的 tick 数，正整数。最后一次睡眠会被截断到截止时刻。省略时读 `.env` 的 `BENCH_HORIZON_TICKS`（默认 400）。 |
| `cycles` | 决策周期数上限，正整数。只写 `cycles` 不写 `--ticks` 时，本场按旧方式跑满这么多周期，不设 tick 截止；两者都写时先到者为准。都不写且 `BENCH_HORIZON_TICKS=0` 时是 40 个周期。 |
| `--seed` | 覆盖 `.env` 里的 `SIMULATION_SEED`。相同种子和相同放行会产生相同车流与随机事件。 |
| `--plain` | 关闭实时界面，只打印文本日志。 |
| `--no-release` | 完全不放行。每个周期不放车辆、不放行人，也不派拖车或清障，睡眠 10 拍（中途仍会被闯红灯等事件打断）。不调用模型，不计决策税。报告和回放与普通场次相同。 |
| `--resume` | 从已有的 `api-log_*.jsonl` 续跑。不能同时再写 `cycles`、`--ticks` 或 `--seed`，截止时长从检查点恢复。 |

```bash
npm run bench -- --ticks 400 --seed 63916 --plain
npm run bench -- --ticks 400 --seed 63916 --no-release --plain
npm run bench -- 20 --seed 2 --plain
```

固定 tick 截止是正式比较的口径：不同模型每周期睡眠长短不同，按周期数截止会让各场覆盖的车流长度不一样。

## 得分

最终余额就是得分，没有额外换算。开局余额为 `INITIAL_BALANCE`（默认 1000），模型在系统提示里能看到这个数。报告里的 `finalBalance` 是模型实时看到的财务余额，再加上截止时的终局结算：

- 已离开路口、尚未驶出地图的车辆补发全额离场收入。
- 仍在路口内的车辆，按已走过的轨迹比例补发收入。
- 仍在进口车道等待，或在地图外上游队列积压的车辆，每位乘员扣一次 `UNSERVED_VEHICLE_LIABILITY`（默认 0.1）。

规则版本 16 起，普通车辆按乘员计价：乘用车 1 人、出租车 2 人、通勤小巴 8 人、公交和校车 40 人、轻型货车 1、重型货车按 3 个货物单位。离场收入、进口延误、上游积压和终局负债都乘以这个数。特殊车辆和摩托车仍按车计。

运行过程中，地图内进口车道上静止超过宽限期的车辆每位乘员每拍扣 `DELAY_BLEED_PER_TICK`（默认 0.0002），上游积压车辆每位乘员每拍扣 `UPSTREAM_BLEED_PER_TICK`（默认 0.002）。只有经 `pedestrian_phases` 放行的行人完成过街才有奖励，闯红灯过街没有。规则版本 19 起，奖励在行人走完横道、开始离开时发放；之前要等他走完离开的人行道，往往要上百拍，晚放行的行人在比赛结束前拿不到奖励。

离场收入默认为普通车辆每位乘员 0.1（一辆公交 4）、摩托车 0.2、特殊车辆 1；每次决策扣 `DECISION_TAX`（默认 0.02），每次工具调用扣 `TOOL_TAX`（默认 0.0015）。校车卷入事故额外扣 `SCHOOL_BUS_ACCIDENT_PENALTY`（默认 10）；油罐车卷入的事故，锁格扣费乘 `HAZMAT_HAZARD_MULTIPLIER`（默认 3）。完整数值见 `scripts/env.template`，各基线的参考余额见 `docs/2026-10-01-step3-v16-aggression-tiers.md`。

## 司机抢行

`VEHICLE_AGGRESSION_ENABLED`（默认 `true`）打开司机抢行。每名司机（特殊车辆除外）有由种子固定的耐心：激进型（出租车、跑车、肌肉车）60–90 tick，普通型 100–140，温和型（公交、校车、重型货车、垃圾车）160–220。在进口道上每静止一拍消耗一点，向前挪动不清零。剩余不超过 12 时出现在观测的 `driverAlerts` 里，不唤醒模型。

- 闯红灯：耐心耗尽、没有许可的停止线队首，此刻前方 4 格没有车、所经横道没有行人时自行冲进路口。它不看未来预约，会和路口内车辆相撞；已排程未入场的车会被作废许可（`RED_LIGHT_RUNNER`）。以 `VEHICLE_RED_LIGHT` 中断唤醒模型。
- 跟车闯入：车道上最后一辆获准车辆入场时，紧跟其后的车耐心已耗尽，或是剩余不超过 12 的激进型司机，就会跟着冲进路口，每批最多 2 辆。`dry_run_admit` 和 `commit_schedule` 的结果用 `tailgate_risk` 提前列出。以 `VEHICLE_TAILGATE` 中断唤醒模型。
- 加塞：距停止线 12–24 格、耐心耗尽的车，在相邻车道队列至少短 3 辆时自行借道，作废目标车道已放行车辆的许可。加塞车仍需合法放行，照常收费，不中断。

闯红灯和跟车闯入的车不付离场收入，也不检查出口容量，出口满时会卡在路口里锁格。报告的 `totals.aggression` 统计三种抢行次数，`totals.violationExits` 是驶离地图的抢行车数。

`scripts/apply-env-template.mjs` 按 `scripts/env.template` 批量改写 `.env*` 文件的规则数值，保留各文件自己的模型、密钥和 `AGENT_*` 设置。默认只预览，加 `--write` 才写入，写入前会把原文件备份到系统临时目录。

## 模型看到的观测

规则版本 17 起，模型每轮收到的观测是压缩过的 JSON，字段格式写在系统提示的「空间矩阵」和「紧凑观测编码」两节：

- `lanes` 和 `exits` 把每条进口道、出口道画成一行字符串，一个字符一格。车型用字母表示（P 乘用车、T 出租车、V 通勤小巴、B 公交、S 校车、L 轻型货车、K 重型货车、H 危化品罐车、E 特殊车辆、M 摩托车），大写是车头，小写是车身，字母个数就是车长。
- `crosswalks` 给出每条斑马线两侧等候区的人数和 2×8 的横道格子。规则版本 18 起，有车辆预约这条横道时还会附上第 4 项：车辆预约占用它的最后一个 tick。
- 其余列表大多改成定长元组，常量挪进系统提示，零值和重复信息去掉。

路口中心的占用和预约不在每轮观测里，模型要调用付费工具 `inspect_junction`（按非终结工具扣 `TOOL_TAX`）才能看到 15×15 的占用网格、未来几拍的预约网格和路口内车辆列表。版本 18 起它还会返回 `crosswalks`，逐格给出横道在查询范围内最早被车辆预约的拍偏移。`inspect_incident` 的锁格改成同坐标的 `lock_grid`。

版本 18 的系统提示写明了每条路线经过哪两条斑马线：进口侧一条，出口侧一条。工具参数也接受两类别名，并在工具描述里写明：
- 需要进口车道的参数（`lane_batches.lane_id`、`inspect_lane_queue` 和 `dispatch_emergency_convoy` 的 `lane_id`、`guide_inbound_lane_change` 的 `target_lane`）可以直接填路线 ID，自动换成该路线所在的进口车道。
- `crosswalk_id` 可以填观测里的短键 `N/E/S/W`，也可以填 `NORTH` 这样的方向名。

`node scripts/measure-observation.mjs logs/api-log_*.jsonl` 统计一场里系统提示、观测各字段和各工具结果的平均体积；`node scripts/preview-observation.mjs [ticks]` 在本地推进引擎并打印压缩后的观测。

## 基线

`DECISION_BASELINE` 设为 `random`、`longest-queue`、`hold`、`balanced` 或 `balanced-bus` 时，不调用模型，改用内置策略决策。`balanced-bus` 在 `balanced` 的相位排序前先比较排队乘员数，用来检验单纯「按乘员放行」是否够用（种子 63916 上它略低于 `balanced`）。仓库里有对应的 `.env.baseline-*` 文件。

注意进程环境变量优先于 `DOTENV_CONFIG_PATH` 指向的文件。当前终端里如果残留了 `DECISION_BASELINE`，会盖过基线文件里的设置。

`.env.baseline-balanced-no-ped` 在 `balanced` 基础上设 `PEDESTRIAN_DEMAND_ENABLED=false`：整场不生成行人，只放行车辆。它估计的是「完美规避行人事故」时的余额上沿，产物文件名带 `-no-ped` 后缀。

```bash
DOTENV_CONFIG_PATH=.env.baseline-balanced-no-ped npm run bench -- --ticks 400 --seed 63916 --plain
```

npm 把 `--` 后面的参数交给脚本末尾，所以它们会到达 `cli.js`。

`.env.baseline-search` 设 `DECISION_BASELINE=search`，用来估计这个场景的天花板。每次决策时，它复制当前仿真状态，枚举候选答案（相位、放行车数、睡眠时长、是否放紧急车队），在副本上向前模拟，后续决策用 `balanced` 续跑，选终局估值最高的一个。副本能看到确定的未来需求，所以它相当于一个完全知道仿真规则的规划器，模型不可能拿到这些信息。它只在 JEV 动作空间内搜索，每周期只能放一个相位，所以得分是天花板的下界。

- `SEARCH_SCREEN_TICKS`（默认 12）：第一轮粗筛相位和放行车数时，每个候选向前模拟的 tick 数。
- `SEARCH_LOOKAHEAD_TICKS`（默认 30）：第二轮细化时的前瞻 tick 数。
- `SEARCH_TOP_K`（默认 3）：粗筛后保留多少个候选进入细化。
- `BENCH_SEARCH_TRACE=1`：每次决策打印选中的候选和估值。

`--ticks 200` 一场约 11 分钟。

三个「轮次」不是一回事：

- 决策周期是上面的 `cycles`，一场里模型要做多少次放行。固定 `--ticks` 时，周期数由模型自己的睡眠长短决定。
- API 轮数是 `.env` 的 `AGENT_MAX_API_ROUNDS`，每个决策周期里模型和工具最多来回几次。
- 完整场次是下面的 `--runs`，把整场基准连跑几遍。

## 连跑多场

```bash
npm run bench:runs
```

默认每个配置连跑 3 场，一次只跑 1 个进程。编译只做一次，然后把全部场次放进同一个队列。`--parallel` 决定同时最多几个 `node`。有空位就立刻启动下一场。队列按配置轮转：每个模型先各跑第 1 场，再各跑第 2 场。某一场非 0 退出只结束这一场，空出来的位置继续取队列里的下一场。失败的场次不会自动重开，全部场次都启动过之后，父进程才结束。有失败时退出码仍为非零，并打印成功数和失败数。

```text
node scripts/bench-repeat.mjs [--runs <integer>] [--parallel <integer>] [--env <file>]... [--dry-run] [--list-failed] [--resume <api-log>] [--] [cli args...]
```

| 参数 | 含义 |
| --- | --- |
| `--runs` | 每个配置的完整场次数，正整数。省略时是 3。 |
| `--parallel` | 同时运行的进程上限，正整数。省略时是 1。 |
| `--env` | 一份完整的环境配置文件。可以重复写，每个文件代表一个模型。 |
| `--dry-run` | 只打印将要执行的命令，不调用模型和模拟器。 |
| `--list-failed` | 只打印还没有报告的失败场次，不启动评测。 |
| `--resume` | 按一份已有的 `api-log_*.jsonl` 续跑那一场。 |
| 其余参数 | 原样传给每一场的 `cli.js`，包括 `cycles`、`--seed` 和 `--plain`。 |

不写 `--env` 时，沿用当前进程环境，基准程序读取仓库里的 `.env`。

写了 `--env` 之后，每一组只加载对应文件，不再读默认 `.env`。文件里的值会盖过进程里已经存在的同名变量。这些配置文件需要是完整配置，缺掉的键不会从 `.env` 补进来。某个文件不存在时，一场都不会开始。并行数大于 1 时，各进程共用一个终端，脚本会自动加上 `--plain`，并改成一块进度画面：总进度条、每场的周期进度条、已经过的时间，以及预计结束的钟点。接口报文不再刷到终端，仍然写在 `logs/` 的日志文件里。

```bash
npm run bench:runs -- --plain
npm run bench:runs -- --parallel 6 --runs 5 -- 20 --seed 2 --plain
npm run bench:runs -- --env .env.deepseek-flash --env .env.mimo-v2.6-pro-ultraspeed --plain
node scripts/bench-repeat.mjs --dry-run -- --plain
```

两个 `--env`、默认 `--runs 3` 的那条命令会排 6 场：两个模型的第 1 场，然后第 2 场，然后第 3 场。`--env` 和 `--parallel` 要写在单独的 `--` 前面。

正式测试是每个模型 100 场完整基准，同时最多 6 个进程，种子固定为 63916。每场使用默认的 `BENCH_HORIZON_TICKS=400` 截止时长：

```bash
npm run bench:formal
```

它等价于：

```bash
npm run bench:runs -- --parallel 6 --runs 100 --env .env.deepseek-flash --env .env.deepseek-v4-pro --env .env.mimo-v2.6-pro-ultraspeed -- --seed 63916 --plain
```

三个模型合计 300 场。这条命令会调用模型接口，确认要跑再执行。

不写 `--seed` 时，同一配置下的各场共用该文件里的 `SIMULATION_SEED`，车流剧本相同，差异来自模型采样。要比较不同路况，给每场单独指定种子：

```bash
npm run bench -- --seed 1 --plain
npm run bench -- --seed 2 --plain
npm run bench -- --seed 3 --plain
```

连跑时建议加上 `--plain`。实时界面按一场设计，多场连续刷新时纯文本日志更清楚。

## 失败后续跑

失败场次记在 `logs/bench-failures.jsonl`。每条包含时间、环境文件、第几场、退出码、最后完成的周期、`api-log` 路径，以及子进程标准错误的最后约 30 行。同一条日志后来写出了报告，就不再算失败。

```bash
npm run bench:runs -- --list-failed
```

列出的每条都带一条可复制的续跑命令。续跑只接受那份 API 日志，调度器会读同一次运行的 `run_*.json`，设回原来的环境文件，只启动一个进程。`--resume` 不能和 `--runs`、`--env` 或 `--dry-run` 写在一起。

```bash
npm run bench:runs -- --resume logs/api-log_<model>_<date>_<postfix>.jsonl
```

续跑从最后一个已经完成的决策周期接着做。崩溃发生在某个周期中间时，那个周期的半截 API 记录留在日志里，续跑会重新向模型请求这一周期。没有 `checkpoint_*.json` 时命令直接失败，不会另起一份新日志。这次功能加上之前已经崩溃的场次没有检查点，不能续跑。

## 产物

每场开始时，标准错误里的 `[bench] start` 行带有本场 `apiLog=` 绝对路径。结束时再打印报告和回放路径。默认目录是 `logs/`，可用 `AGENT_API_LOG_DIR` 修改。

文件名带模型名、日期和后缀。`AGENT_ARTIFACT_POSTFIX` 留空时，后缀是该场开始时的本地时间、毫秒和进程号，例如 `164600123-4821`，并行运行不会写进同一个文件。如果设了固定后缀，同一配置下的各场会写到同一批文件名上。

一场开始时会写很小的 `run_*.json`，里面是种子、周期数、截止 tick 数、环境文件路径和参数。warmup 之后，以及每个决策周期完整结束时，原子写入同名的 `checkpoint_*.json`，并只把这一周期新增的回放帧追加到 `replay-part_*.jsonl`。整场结束时仍写出完整的 `replay_*.json`。续跑读检查点还原路口、账本和工作记忆，再把已经追加的回放帧装回来。

打开回放：

```bash
npm run replay:dev
```

## 其他命令

| 命令 | 作用 |
| --- | --- |
| `npm test` | 跑单元测试。 |
| `npm run typecheck` | 只做类型检查。 |
| `npm run build` | 编译到 `dist/`。 |
| `npm run replay:build` | 构建回放页面。 |
