# Report template

Reference: `report/qwen-3.8-27b-final-report-2026-10-02.md` is a complete example of this structure (written before the best-of-three rule, so it has no stability section).

```markdown
# <模型名> 路口调度测试最终报告

- 有效运行：`<best run id>`（三次中得分最高；规则版本 N，种子 S，tick A–B，C 个决策周期）
- 其余运行：`<id>`、`<id>`（只用于稳定性对比）
- 数据来源：`report/analyze-run.mjs` 与 `report/select-best-run.mjs` 的输出，加上对原始推理日志的人工判读
- 复现命令：`node report/select-best-run.mjs --model <model>`，然后 `node report/analyze-run.mjs <replay>`

## 结论摘要

一段话：分数、相对 balanced / search baseline 的位置、最大的优点、最大的问题。
然后 2–4 条编号结论，每条带一个关键数字。

## 0. 分数与稳定性

三次运行表：排名、运行 ID、最终余额、放行车辆、事故数、API 调用、工具成功率、行人相位成功/尝试。
附均值、最差、标准差，并用一句话判断稳定性（最好的一次是常态还是运气）。

有效运行 vs baseline 表：最终余额、放行车辆、未服务负债、事故、锁格扣费、上游积压、撞人、闯红灯罚、校车、拖车。

余额拆解：起始 1000 + 局内变化 + 终局通行费 − 未服务负债。
按时间段的损失表：周期数、放行车辆、局内余额变化、主要扣费项。

## 1. 基础分析

### 1.1 上下文能力
指标表（prompt / 推理 tokens、每周期轮数、ID 引用、非规范 ID、重复失败调用、working memory）+ 判读。

### 1.2 注意力分布
高 / 中 / 低关注三栏表 + 中断响应表 + 判读（区分"没看到"和"看到了但用错"）。

### 1.3 tool_call 准确性
总成功率、每个工具的成功率与主要失败、未使用的工具、典型格式错误（带周期和 tick）+ 判读。

### 1.4 Agent 能力
工具序列模式、先试算再提交的比例、提交构成、每周期放行、lane_batches / 速度档位 / sleep_ticks、决策开销 + 判读。

## 2. 进阶分析

### 2.1 逻辑推理
3–5 条，每条带原文引用：路线-横道断言正确率与错误样例、"说安全却冲突"、纠错效率、其他典型误解。

### 2.2 复杂环境博弈
行人（因果链）、事故处置表、抢行司机、紧急车辆与抛锚。

### 2.3 亮眼操作
3–5 个案例：周期、tick、车辆/车道 ID、做了什么、结果。

### 2.4 最差操作
3–5 个案例：周期、tick、ID、当时观测里的风险信号、模型推理原文、后果与估算成本。

## 3. 损失链条
一个 text 代码块，用箭头串起从根因到最终损失的链条，最后一句话量化和 search baseline 的差距来自哪一环。

## 4. 评测局限
1. 规则版本带来的环境限制（只写对当前规则版本仍然成立的）。
2. 仍存在的引擎问题。
3. 统计口径是启发式的（正则匹配、事故成本分摊、周期价值排序）。
4. 样本量：三次取最好，单一种子。
```

## Known engine limitations (as of rules 19)

Update this list when the engine changes.

- Jaywalk safety check treats only vehicles moving this tick as threats; a vehicle that pauses for a tick (e.g. SLOW_SLIDE) lets a jaywalker step out, which can start pileups.
- Vehicles already in the junction do not brake for wrecks, and dry-runs only check current locks, so vehicles admitted next to an open incident can still pile into it.

Fixed in earlier versions (mention only when evaluating runs from those versions):
- Rules ≤ 17: no route-to-crosswalk rule in the prompt, future vehicle reservations not shown on crosswalks, short crosswalk keys and route-ID lane aliases rejected.
- Rules ≤ 18: pedestrian reward paid only after the crossing completed, so it was often 0 for every strategy.
