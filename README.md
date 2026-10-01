# Silicon Conductor Bench

中文 | [English](README.en.md)

![Silicon Conductor Bench](assets/images/cover.jpg)

一个让大模型当「交警」的基准测试：在没有红绿灯的繁忙十字路口，模型只能通过纯文本 / 结构化观测和工具调用来调度车辆与行人，最终余额就是得分。

## 测什么

模拟器是一个确定性的、按 tick 推进的十字路口。模型每个决策周期拿到压缩过的 JSON 观测，用工具查看、试算并提交放行方案，然后决定睡多久。它要同时处理：

- **下游溢流与死锁**：出口满了还放车，车就会卡在路口中央锁格。
- **异构车流**：乘用车、出租车、小巴、公交、校车、货车、危化品罐车、摩托车、特殊车辆，长度、起步和计价各不相同。
- **行人与横道几何**：每条路线经过进口侧和出口侧两条斑马线，判断错了就会撞人。
- **司机抢行**：耐心耗尽的司机会闯红灯、跟车闯入、加塞。
- **突发事件**：抛锚、事故、紧急车队，需要派拖车、清障、绕行。
- **部分可观测与中断恢复**：路口中心占用要付费查询，闯红灯等事件会打断睡眠。

模型可用的工具包括 `inspect_junction`、`inspect_lane_queue`、`inspect_crosswalk`、`inspect_incident`、`dry_run_admit`、`commit_schedule`、`dispatch_tow_truck`、`order_accident_clearance`、`dispatch_emergency_convoy`、`guide_inbound_lane_change`、`reroute_queue_around_stall`、`set_lane_detour`、`hold`、`sleep` 等。每次决策和每次非终结工具调用都要扣费。

项目同时内置了 `random`、`longest-queue`、`hold`、`balanced`、`balanced-bus` 等基线策略，以及一个能看到未来需求的 `search` 规划器，用来估计分数天花板。

## 快速开始

需要 Node.js 22 或更高版本。

```bash
npm install
cp .env.example .env   # 填写 OPENAI_API_KEY、OPENAI_BASE_URL、OPENAI_MODEL
npm run bench -- --ticks 400 --seed 63916 --plain
```

任何 OpenAI 兼容接口都可以接入。连跑多场：

```bash
npm run bench:runs -- --parallel 6 --runs 3 --env .env.deepseek-flash --env .env.deepseek-v4-pro -- --seed 63916 --plain
```

跑基线测试（不调用模型）：

```bash
DOTENV_CONFIG_PATH=.env.baseline-balanced npm run bench -- --ticks 400 --seed 63916 --plain
```

每场的 API 日志、报告和回放写在 `logs/`。打开 3D 回放页面：

```bash
npm run replay:dev
```

完整的参数、计分规则、观测格式、失败续跑和产物说明见 [USAGE.zh.md](USAGE.zh.md)。

## 计分

开局余额 `INITIAL_BALANCE`（默认 1000），最终余额就是得分。车辆驶离路口按乘员计收入，合法放行的行人过街有奖励；延误、上游积压、事故锁格、撞人、未服务车辆、每次决策和工具调用都会扣分。所有数值都可以在 `.env` 里调整，模板见 `scripts/env.template`。

## 结果

规则版本 16、种子 63916 下四个模型各跑三次的对比（参考线：`balanced` 基线 674.49，`search` 规划器 788.38）：

| 模型 | 最佳 | 均值 | 最低 |
| --- | --- | --- | --- |
| deepseek-flash | 748.30 | 642.80 | 572.62 |
| deepseek-v4-pro | 740.17 | 705.46 | 686.92 |
| step-5-preview | 694.16 | 639.20 | 601.99 |
| space-bunny-alpha | 692.70 | 628.36 | 554.37 |

详细分析见 [report/rules-16-models-comparison-2026-10-02.md](report/rules-16-models-comparison-2026-10-02.md) 和 `report/` 下各模型的单独报告。

## 贡献跑分数据

欢迎提交新模型的跑分。只需要用种子 63916 跑 3 场，然后把 `logs/` 里的产物作为 PR 提交。

1. 复制 `.env.example` 为 `.env.<模型名>`，填好接口地址、密钥和模型名，其余规则参数保持默认。
2. 跑 3 场：

   ```bash
   npm run bench:runs -- --runs 3 --env .env.<模型名> -- --seed 63916 --plain
   ```

3. 确认 3 场都已写出报告。有失败的场次时，用 `npm run bench:runs -- --list-failed` 查看并续跑。
4. 把这 3 场在 `logs/` 下生成的文件（`api-log_*`、`report_*`、`replay_*`、`run_*` 等）提交到 PR。`logs/` 在 `.gitignore` 里，需要用 `git add -f logs/<文件名>` 添加。

不要提交 `.env.*` 文件，里面有你的 API 密钥。PR 描述里请写明模型名、服务商和 `.env` 里改过的非默认参数（比如 `OPENAI_MAX_TOKENS`）。

## 目录结构

| 路径 | 内容 |
| --- | --- |
| `src/core` | 路口模拟引擎、车流、行人、事故与计分 |
| `src/agent` | 系统提示、观测编码、工具定义和模型调度循环 |
| `src/io` | 报告、回放、检查点等产物写出 |
| `src/tui` | 终端实时界面 |
| `src/replay` | 回放录制、数据模型和场次统计 |
| `apps/replay` | 基于 Vite 的 3D 回放页面 |
| `scripts` | 连跑、配置模板、观测测量和资源处理脚本 |
| `docs` | 设计文档和各版本规则说明 |
| `report` | 评测报告和分析脚本 |
| `test` | 单元测试 |

## 开发

```bash
npm test            # 单元测试
npm run typecheck   # 类型检查
npm run build       # 编译到 dist/
```

## 许可证

[MIT](LICENSE)
