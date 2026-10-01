# 运行分析：step-5-preview_2026-10-01_114857245-57296

- 模型：step-5-preview；种子 63916；规则版本 16；回放 schema 7
- 截止 tick 261，决策周期 65，最终余额 **694.16**
- 生成时间 2026-10-01T21:35:31.215Z；数据文件：replay_step-5-preview_2026-10-01_114857245-57296.json、report_step-5-preview_2026-10-01_114857245-57296.json、api-log_step-5-preview_2026-10-01_114857245-57296.jsonl、raw-api-log_step-5-preview_2026-10-01_114857245-57296.jsonl

## 1. 基础分析

### 1.1 上下文能力

- prompt tokens：平均 24004.9，P50 25466，P95 45333，最大 61162（n=189）
- completion tokens：平均 7056.4，P50 5492，P95 16384，最大 16384（n=189）；其中推理 tokens：平均 0，P50 0，P95 0，最大 0（n=189）
- 每周期 API 轮数：平均 2.9，P50 3，P95 5，最大 6（n=65）；上限 8，用满上限的周期 0 个
- 每次请求的平均字符数：系统提示 7735.4，user 15433.9，工具结果 1541.2，assistant 482.7；消息条数 平均 4.7，P50 4，P95 10，最大 14（n=191）
- 工具参数中的 ID 共 392 个：出现在当轮可见上下文里的占 1，当轮不可见但本局别处出现过 0 个，本局从未出现 0 个，非规范横道短键 0 个

| ID 类型 | 总数 | 当轮可见 | 别处出现 | 从未出现 | 非规范短键 |
| --- | --- | --- | --- | --- | --- |
| lane | 230 | 230 | 0 | 0 | 0 |
| vehicle | 62 | 62 | 0 | 0 | 0 |
| crosswalk | 62 | 62 | 0 | 0 | 0 |
| incident | 38 | 38 | 0 | 0 | 0 |

- 同一周期内重复提交已失败的相同调用：0 次 {}
- 提交类型：verified 18，unverified 1，hold 35；放行类提交中 verified 占 0.947
- working memory：调用 1 次 {"SAVE_PLAN":1}，观测里带有计划的周期 0 个

### 1.2 注意力分布

关注率 = 字段出现在该周期观测里、且推理文本提到它的周期数 / 字段出现的周期数。

| 概念 | 出现周期 | 提到且出现 | 关注率 | 提到周期（含未出现） | 提及次数 |
| --- | --- | --- | --- | --- | --- |
| stalledVehicles | 39 | 38 | 0.974 | 54 | 777 |
| crosswalks | 65 | 63 | 0.969 | 63 | 8110 |
| candidateConflicts | 65 | 63 | 0.969 | 63 | 2235 |
| pedestrianAlerts | 55 | 53 | 0.964 | 63 | 11484 |
| stoplineCandidates | 65 | 62 | 0.954 | 62 | 504 |
| emergency | 65 | 62 | 0.954 | 62 | 2186 |
| timeBudget | 65 | 62 | 0.954 | 62 | 350 |
| revokedAdmissions | 18 | 17 | 0.944 | 43 | 332 |
| dischargingLanes | 31 | 29 | 0.935 | 48 | 466 |
| driverAlerts | 58 | 53 | 0.914 | 60 | 1363 |
| recentCycles | 64 | 58 | 0.906 | 59 | 283 |
| lastSettlement | 64 | 53 | 0.828 | 54 | 220 |
| holds | 51 | 41 | 0.804 | 42 | 246 |
| activeVehicleMotions | 55 | 44 | 0.8 | 45 | 127 |
| laneGuidance | 65 | 46 | 0.708 | 46 | 401 |
| laneMatrices | 0 | 0 |  | 63 | 1850 |
| exits | 0 | 0 |  | 63 | 3262 |
| reservedUntil | 0 | 0 |  | 63 | 1869 |
| incidentBlocked | 0 | 0 |  | 30 | 237 |
| workingMemory | 0 | 0 |  | 21 | 41 |

中断响应：

| 中断类型 | 次数 | 有响应 | 响应率 | 判定规则 |
| --- | --- | --- | --- | --- |
| PEDESTRIAN_PATIENCE | 29 | 11 | 0.379 | 同周期任一试算或提交带 pedestrian_phases |
| PEDESTRIAN_JAYWALK | 19 | 8 | 0.421 | 推理文本提到了中断对象 ID |
| ACCIDENT_INTERRUPT | 7 | 7 | 1 | 同周期调用 inspect_incident / order_accident_clearance / set_lane_detour |
| VEHICLE_RED_LIGHT | 2 | 2 | 1 | 推理文本提到了中断对象 ID |

- 每次回复的推理字符数：平均 24526.8，P50 18578，P95 58633，最大 61524（n=189）

### 1.3 tool_call 准确性

- 工具调用 203 次，成功 150 次，成功率 0.739
- 失败分类：{"RESOURCE_CONFLICT":24,"DRY_RUN_QUOTA_EXHAUSTED":11,"PLANNING_HORIZON_EXCEEDED":10,"LANE_HEAD_NOT_READY":4,"SCHEMA_ERROR":2,"TOOL_EXECUTION_ERROR":2}
- 每次回复的工具调用数分布：{"0":29,"1":127,"2":23,"3":9,"4":1}；finish_reason：{"tool_calls":160,"length":25,"stop":4}
- API 错误 2 次 {"Request timed out.":2}；回退周期 [11,21,25,30,38,44,47,49,51,54,62]
- 从未使用的工具：dispatch_emergency_convoy、guide_inbound_lane_change

| 工具 | 调用 | 成功 | 成功率 | 结果分类 |
| --- | --- | --- | --- | --- |
| dry_run_admit | 94 | 43 | 0.457 | {"OK":43,"PLANNING_HORIZON_EXCEEDED":10,"DRY_RUN_QUOTA_EXHAUSTED":11,"LANE_HEAD_NOT_READY":4,"RESOURCE_CONFLICT":24,"TOOL_EXECUTION_ERROR":2} |
| commit_schedule | 55 | 54 | 0.982 | {"OK":54,"SCHEMA_ERROR":1} |
| reroute_queue_around_stall | 1 | 1 | 1 | {"OK":1} |
| dispatch_tow_truck | 8 | 8 | 1 | {"OK":8} |
| inspect_incident | 22 | 22 | 1 | {"OK":22} |
| order_accident_clearance | 16 | 16 | 1 | {"OK":16} |
| inspect_crosswalk | 1 | 1 | 1 | {"OK":1} |
| set_lane_detour | 4 | 4 | 1 | {"OK":4} |
| inspect_lane_queue | 1 | 1 | 1 | {"OK":1} |
| manage_working_memory | 1 | 0 | 0 | {"SCHEMA_ERROR":1} |

错误样例：

- **PLANNING_HORIZON_EXCEEDED**
  - c4 t90 dry_run_admit：Admission planning horizon exceeded for V00093；参数 `{"lane_batches":[{"lane_id":"IN_S_L1_LEFT","top_n":8,"speed_profile":"CRUISE"}]}`
  - c5 t100 dry_run_admit：Admission planning horizon exceeded for V00071；参数 `{"lane_batches":[{"lane_id":"IN_S_S1_STRAIGHT","top_n":5},{"lane_id":"IN_S_S2_STRAIGHT","top_n":3},{"lane_id":"IN_W_L1_LEFT","top_n":4},{"lane_id":"IN_E_R1_RIGHT","top_n":1}]}`
  - c8 t127 dry_run_admit：Admission planning horizon exceeded for V00064；参数 `{"lane_batches":[{"lane_id":"IN_N_L1_LEFT","top_n":1},{"lane_id":"IN_N_S1_STRAIGHT","top_n":5},{"lane_id":"IN_N_S2_STRAIGHT","top_n":8}]}`
- **DRY_RUN_QUOTA_EXHAUSTED**
  - c9 t137 dry_run_admit：-；参数 `{"lane_batches":[{"lane_id":"IN_W_S1_STRAIGHT","top_n":4},{"lane_id":"IN_W_S2_STRAIGHT","top_n":5}]}`
  - c13 t146 dry_run_admit：-；参数 `{"lane_batches":[],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:WEST","directions":["A_TO_B"]},{"crosswalk_id":"CROSSWALK:EAST","directions":["B_TO_A"]}]}`
  - c23 t184 dry_run_admit：-；参数 `{"candidate_vehicle_ids":[],"lane_batches":[],"vehicle_speed_profiles":[],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:NORTH","directions":["A_TO_B","B_TO_A"]}]}`
- **LANE_HEAD_NOT_READY**
  - c13 t146 dry_run_admit：Lane head is not ready: IN_S_S1_STRAIGHT；参数 `{"candidate_vehicle_ids":[],"lane_batches":[{"lane_id":"IN_S_S1_STRAIGHT","top_n":3},{"lane_id":"IN_S_R1_RIGHT","top_n":2}],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:WEST","directions":["A_TO_B"]},{"crosswalk_id":"`
  - c13 t146 dry_run_admit：Lane head is not ready: IN_S_R1_RIGHT；参数 `{"candidate_vehicle_ids":[],"lane_batches":[{"lane_id":"IN_S_R1_RIGHT","top_n":2}],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:WEST","directions":["A_TO_B"]},{"crosswalk_id":"CROSSWALK:EAST","directions":["B_TO_A"]}]`
  - c25 t187 dry_run_admit：Lane head is not ready: IN_N_L1_LEFT；参数 `{"lane_batches":[{"lane_id":"IN_N_L1_LEFT","top_n":4},{"lane_id":"IN_W_R1_RIGHT","top_n":4}]}`
- **RESOURCE_CONFLICT**
  - c15 t162 dry_run_admit：CROSSWALK:WEST:CELL:0:0 vs V00101；参数 `{"lane_batches":[{"lane_id":"IN_E_R1_RIGHT","top_n":3},{"lane_id":"IN_N_R1_RIGHT","top_n":2}],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:WEST","directions":["A_TO_B"]}]}`
  - c16 t166 dry_run_admit：CROSSWALK:EAST:CELL:7:0 vs V00084；参数 `{"lane_batches":[{"lane_id":"IN_N_S1_STRAIGHT","top_n":4},{"lane_id":"IN_N_S2_STRAIGHT","top_n":5}],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:WEST","directions":["A_TO_B","B_TO_A"]},{"crosswalk_id":"CROSSWALK:EAST"`
  - c16 t166 dry_run_admit：CROSSWALK:WEST:CELL:0:0 vs V00107；参数 `{"lane_batches":[{"lane_id":"IN_N_S1_STRAIGHT","top_n":4},{"lane_id":"IN_N_S2_STRAIGHT","top_n":5}],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:WEST","directions":["A_TO_B","B_TO_A"]}]}`
- **SCHEMA_ERROR**
  - c31 t201 commit_schedule：[ { "code": "too_big", "maximum": 10, "type": "number", "inclusive": true, "exact": false, "message": "Number must be less than or equal to 10", "path": [ "slee；参数 `{"sleep_ticks":14,"tactical_summary":"2 jaywalkers (NORTH PED:20, WEST PED:45:1) block almost every route; all dry runs return jaywalker warnings (revoked admissions). No safe admissions now. Sleep to tick 215 so INC0002`
  - c48 t234 manage_working_memory：[ { "code": "too_big", "maximum": 160, "type": "string", "inclusive": true, "exact": false, "message": "String must contain at most 160 character(s)", "path": [；参数 `{"action":"SAVE_PLAN","plan_data":{"phase_name":"Jaywalker window waves","intended_duration":27,"resume_condition":"SOUTH clears ~238: admit SOUTH-only heads V00067(van8)/V00233/V00146; NORTH A_TO_B ~246; EAST big straig`
- **TOOL_EXECUTION_ERROR**
  - c55 t243 dry_run_admit：Admission plan exceeds 16 vehicles: 22；参数 `{"lane_batches":[{"lane_id":"IN_W_S1_STRAIGHT","top_n":8},{"lane_id":"IN_W_S2_STRAIGHT","top_n":8},{"lane_id":"IN_W_R1_RIGHT","top_n":6}]}`
  - c59 t249 dry_run_admit：Admission plan exceeds 16 vehicles: 17；参数 `{"lane_batches":[{"lane_id":"IN_S_S1_STRAIGHT","top_n":5},{"lane_id":"IN_N_R1_RIGHT","top_n":4},{"lane_id":"IN_W_S2_STRAIGHT","top_n":5},{"lane_id":"IN_E_R1_RIGHT","top_n":3}]}`

### 1.4 Agent 能力

- 周期内工具序列（D=试算，C=提交，T=其他工具）：{"DDC":12,"DC":10,"(none)":9,"DDDC":8,"C":4,"TDDC":2,"DTTC":1,"TTDDC":1,"DTTDC":1,"TDTTC":1,"DTDTC":1,"TDTC":1,"TDDD":1,"TTDDDC":1,"TTDC":1,"TD":1,"DDCC":1,"TTTTC":1,"TTDDTTTTC":1,"TTTTTDDDC":1,"TTDTTC":1,"TTTDC":1,"DTTTTC":1,"TTTTDC":1,"TDTDC":1,"DDTC":1}
- 含提交的周期里先试算再提交的比例：0.907
- 提交构成：{"verified":18,"unverified":1,"hold":35,"reckless":0}；每周期放行车数 平均 1.8，P50 0，P95 10，最大 16（n=65）；共放行 119 辆
- 成功提交 54 次，其中使用 lane_batches 17 次；每次 top_n 合计 平均 2.1，P50 0，P95 14，最大 16（n=54）
- 速度档位：{"CRUISE":39}；sleep_ticks：平均 7.4，P50 10，P95 10，最大 14（n=55） {"1":5,"2":3,"3":3,"4":3,"5":1,"6":4,"7":2,"8":4,"9":2,"10":27,"14":1}
- 工具使用：{"dry_run_admit":94,"commit_schedule":55,"inspect_incident":22,"order_accident_clearance":16,"dispatch_tow_truck":8,"set_lane_detour":4,"reroute_queue_around_stall":1,"inspect_crosswalk":1,"inspect_lane_queue":1,"manage_working_memory":1}
- 决策开销：API 191 次，扣 3.82；非终结工具 148 次，扣 0.222

与同条件 baseline 对比：

| 策略 | 最终余额 | 放行车辆 | 未服务负债 | 事故数 | 锁格扣费 | 上游积压 | 撞人 | 闯红灯罚 | 行人奖励 | 校车 | 拖车 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| step-5-preview | 694.16 | 119 | 203.6 | 4 | 18.02 | 54.41 | 20 | 10.4 | 0 | 10 | 9.6 |
| baseline-balanced | 674.49 | 84 | 219.6 | 6 | 21.3 | 58.85 | 25 | 5.5 | 0 | 0 | 8.4 |
| baseline-balanced-bus | 659.61 | 87 | 208.1 | 4 | 90.26 | 53.27 | 5 | 4.9 | 0 | 0 | 6 |
| baseline-balanced-no-ped | 717.59 | 132 | 187.4 | 4 | 74.39 | 47.7 | 0 | 0 | 0 | 10 | 10.8 |
| baseline-longest-queue | 633.99 | 183 | 195.7 | 10 | 76.09 | 44.92 | 50 | 11.6 | 0 | 10 | 10.8 |
| baseline-random | 539.49 | 114 | 207.6 | 7 | 139.2 | 73.82 | 35 | 11 | 0 | 0 | 7.2 |
| baseline-search | 788.38 | 122 | 185.4 | 2 | 3.69 | 45.85 | 10 | 6.7 | 0 | 0 | 8.4 |

## 2. 进阶分析

### 2.1 逻辑推理

- 试算失败（不含额度用完）40 次；之后再试 25 次，其中改了参数 25 次，成功 13 次（0.52）；失败所在周期最终 verified 提交 7 次、hold 31 次
- 推理中"路线 X 经过/不经过 Y 横道"的断言 194 条，正确 151，错误 43，准确率 0.778；前半局 12/52 错，后半局 31/142 错
  - c15：「W_L1_LEFT goes from west to south — it would cross the south」（实际经过 CROSSWALK:WEST+CROSSWALK:NORTH）
  - c16：「W_L1_LEFT turns south, crossing the south」（实际经过 CROSSWALK:WEST+CROSSWALK:NORTH）
  - c19：「E_L1_LEFT from east entering, turning left - crosses the north」（实际经过 CROSSWALK:EAST+CROSSWALK:SOUTH）
  - c19：「E_L1_LEFT left turn from east: crosses NORTH」（实际经过 CROSSWALK:EAST+CROSSWALK:SOUTH）
  - c22：「E_L1_LEFT left turn crosses NORTH」（实际经过 CROSSWALK:EAST+CROSSWALK:SOUTH）
  - c22：「E_L1_LEFT - 2 peds cross NORTH」（实际经过 CROSSWALK:EAST+CROSSWALK:SOUTH）
  - c22：「E_L1_LEFT vehicles? Only if the vehicles' routes cross the north」（实际经过 CROSSWALK:EAST+CROSSWALK:SOUTH）
  - c22：「E_L1_LEFT path crosses NORTH」（实际经过 CROSSWALK:EAST+CROSSWALK:SOUTH）
- 推理写"安全/无冲突"但同一轮试算冲突：18 次
  - c15 r1 t162：「1 straight, W L1 left) - V00057 vs V00067, V00065, V00037 - V00067 vs V00065, V00037, V00045 Available candidates that are NOT blocked: - V00107 (N_R1_RIGHT) - no conflicts listed, no blocked route - V00148 (E_R1_RIGHT) - no conflicts, no blocked route Wait, let me check blocked routes again: - E_L1_LEFT: blocked → V00079 blocked 」→ CROSSWALK:WEST:CELL:0:0 vs V00101
  - c16 r1 t166：「 4.0 revenue. But conflicts with V00057 (N_S1) same-tick? candidateConflicts: V00057-V00065 yes. So choose one. - N_S1 V00057 (3 pax) and N_S2 V00055 (1 pax) — no conflict between them. - N_S1 and N_S2 as lane_batches? stoplineCandidates only list head vehicles V00057, V00055. lane_batches Top-N could admit more vehicles from the」→ CROSSWALK:EAST:CELL:7:0 vs V00084
  - c17 r1 t167：「re atomic in the same plan. Do we need peds AND vehicles together, or can we have only peds? We can commit only pedestrian_phases. Or only vehicles. Or both if no conflict. Buses: the N straights cross NORTH crosswalk. NORTH crosswalk has waiting: A_TO_B 2 (patience 19), B_TO_A 1 (patience 41). If we admit N straights, they'd con」→ CROSSWALK:WEST:CELL:0:0 vs V00107
  - c18 r1 t169：「The baseline says pedestrian_phases must be part of the atomic plan verified. So if we plan to commit pedestrian_phases, we should dry_run them first to verify no conflicts with vehicle reservations. Actually, do we need dry_run for pedestrian-only? The dry_run quota is 2 per decision cycle. If we can fit peds + vehicles in one pl」→ CROSSWALK:NORTH:CELL:0:0 vs V00130
  - c20 r1 t176：「e. Good. But candidateConflicts lists V00060 vs V00067, V00037, V00045. This just means if I admitted all four in same tick, conflict. If only V00060 admitted, no conflict (scope is same-tick heads). But there may be in-transit vehicles on N_S2: V00047, V00055 are CROSSING on N_S2_STRAIGHT. V00060 would be scheduled after them; r」→ CROSSWALK:NORTH:CELL:7:1 vs V00159
  - c22 r1 t182：「). If we only schedule V00098, candidateConflicts only matter when comparing vehicles in the same admit batch. Since we wouldn't schedule V00230/V00037/V00045, no conflict. But wait, there are also activeVehicleMotions in the intersection. The candidateConflicts scope doesn't include in-transit vehicles. So V00098 going left from」→ CROSSWALK:NORTH:CELL:4:0 vs V00065
- 自我修正标记（Wait/Actually/Let me recheck…）：共 4456 次，每次回复 平均 23.6，P50 13，P95 67，最大 137（n=189）
- 认知模式 letterCounting：4 处
  - 「cycles spaced 10+ (137→147→157... plus we'd want up to ~180+). Hmm, from 157 we'd only have cycles at 167, 177, ... exceed. Actually with 3 cycles remaining after 127, wake points 127, 137, 147, 157? Let me recount: rounds: R1 dry_run(done), R2 commit sleep10 → tick 127 (that's the decision at 127 after engine runs?? no). Careful: commit_schedule includes sleep_ticks which advances the world. So: - R2: commit(s」
  - 「 — six rounds. 61 ticks / 6 rounds → need sleep ~10 every time. 6×10 = 60 ≈ 61. So from now on: EVERY round must sleep 10 (or near). And each round should be maximally productive (admit big batches). Let me recount: current tick 200. Round now: act at 200, sleep 10 → 210. Round 4: act at 210, sleep 10 → 220. Round 5: →230. Round 6: →240. Round 7: →250. Round 8: →260, sleep 1 → 261 end. That works: 6 rounds × 10」
  - 「072) — not listed... wait V00072 conflicts list includes V00115? Check: "V00072" appears in conflicts: V00072 paired with V00128, V00062, V00115? Hmm: {"V00115","V00071"}, ..., {"V00115","V00076"}... Let me recount: conflicts for V00115: with V00109, V00137, V00230, V00071. V00072's pairs: V00128, V00062, V00115? hmm the list shows V00072 paired with V00128, V00062, V00115? no — "V00230","V00072" and earlier "V」
- 认知模式 idFormat：0 处

### 2.2 复杂环境博弈

**行人与车辆**

- 行人相位尝试 31 次，成功 2 次 {"RESOURCE_CONFLICT":21,"DRY_RUN_QUOTA_EXHAUSTED":6,"LANE_HEAD_NOT_READY":2,"OK":2}
- 实际放行 1 批 2 人；闯红灯 19 次 19 人；被撞 4 人；奖励 0，扣费 {"delay":1.07,"jaywalk":10.4,"strike":20}

行人相位冲突样例：

| 周期 | tick | 冲突偏移 at | 冲突 |
| --- | --- | --- | --- |
| 15 | 162 | 0 | CROSSWALK:WEST:CELL:0:0 vs V00101 |
| 16 | 166 | 0 | CROSSWALK:EAST:CELL:7:0 vs V00084 |
| 16 | 166 | 0 | CROSSWALK:WEST:CELL:0:0 vs V00107 |
| 17 | 167 | 0 | CROSSWALK:WEST:CELL:0:0 vs V00107 |
| 18 | 169 | 0 | CROSSWALK:NORTH:CELL:0:0 vs V00130 |
| 18 | 169 | 0 | CROSSWALK:WEST:CELL:0:0 vs V00107 |
| 20 | 176 | 0 | CROSSWALK:NORTH:CELL:7:1 vs V00159 |
| 22 | 182 | 18 | CROSSWALK:NORTH:CELL:4:0 vs V00065 |
| 23 | 184 | 16 | CROSSWALK:NORTH:CELL:4:0 vs V00065 |
| 23 | 184 | 16 | CROSSWALK:NORTH:CELL:4:0 vs V00065 |

在行人耐心告急（PATIENCE_CRITICAL）时放行、且路线经过该横道的车辆：81 车次

| 周期 | tick | 车辆 | 路线 | 横道 | 行人 | 剩余耐心 | 该行人后来被撞 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 14 | 153 | V00084 | S_R1_RIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 13 |  |
| 14 | 153 | V00084 | S_R1_RIGHT | CROSSWALK:EAST | PED:24:0:CROSSWALK:EAST | 24 |  |
| 14 | 153 | V00121 | S_R1_RIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 13 |  |
| 14 | 153 | V00121 | S_R1_RIGHT | CROSSWALK:EAST | PED:24:0:CROSSWALK:EAST | 24 |  |
| 14 | 153 | V00169 | S_R1_RIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 13 |  |
| 14 | 153 | V00169 | S_R1_RIGHT | CROSSWALK:EAST | PED:24:0:CROSSWALK:EAST | 24 |  |
| 14 | 153 | V00197 | S_R1_RIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 13 |  |
| 14 | 153 | V00197 | S_R1_RIGHT | CROSSWALK:EAST | PED:24:0:CROSSWALK:EAST | 24 |  |
| 15 | 162 | V00148 | E_R1_RIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 24 | 是 |
| 15 | 162 | V00159 | E_R1_RIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 24 | 是 |
| 15 | 162 | V00181 | E_R1_RIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 24 | 是 |
| 15 | 162 | V00107 | N_R1_RIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 24 | 是 |
| 15 | 162 | V00107 | N_R1_RIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 8 | 是 |
| 15 | 162 | V00130 | N_R1_RIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 24 | 是 |
| 15 | 162 | V00130 | N_R1_RIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 8 | 是 |

行人时间线：

| tick | 事件 | 横道 | 人数 |
| --- | --- | --- | --- |
| 153 | PED_GRANT | CROSSWALK:EAST | 2 |
| 174 | PED_COLLISION | CROSSWALK:WEST | 1 |
| 175 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 186 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 198 | PED_COLLISION | CROSSWALK:WEST | 1 |
| 199 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 200 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 201 | PED_COLLISION | CROSSWALK:NORTH | 1 |
| 205 | PED_JAYWALK | CROSSWALK:SOUTH | 1 |
| 208 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 211 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 212 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 212 | PED_COLLISION | CROSSWALK:EAST | 1 |
| 225 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 228 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 234 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 241 | PED_JAYWALK | CROSSWALK:SOUTH | 1 |
| 241 | PED_JAYWALK | CROSSWALK:SOUTH | 1 |
| 244 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 244 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 249 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 249 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 257 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 260 | PED_JAYWALK | CROSSWALK:WEST | 1 |

**事故处置**

| 事故 | 类型 | 发生 | 车辆 | 行人 | 首次响应 | 清障令 | 清障调用次数 | 关闭 | 事故后才放行、后来卷入 | 非模型放行（抢行） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| INC0001 | ANGLE_COLLISION | 174 | 1 | 1 | 175 | 175 | 3 | 189 |  |  |
| INC0002 | ANGLE_COLLISION | 198 | 2 | 1 | 199 | 199 | 4 | 215 |  | V00045 |
| INC0003 | PILEUP | 201 | 3 | 1 | 202 | 202 | 5 | 228 |  |  |
| INC0004 | ANGLE_COLLISION | 212 | 1 | 1 | 213 | 213 | 4 | 229 |  |  |

事故成本估算：

| 事故 | 最终严重度 | 锁格（含二次） | 开放拍数 | 危化品 | 校车 | 分摊锁格费 | 估算总成本 | 放行来源 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| INC0001 | SERIOUS | 11 | 15 |  |  | 0.796 | 5.796 | V00130@c15 |
| INC0002 | SERIOUS | 43 | 17 |  |  | 3.525 | 8.525 | V00129@c26 V00045@c- |
| INC0003 | CRITICAL | 58 | 27 |  | 是 | 11.326 | 26.326 | V00065@c19 V00088@c27 V00069@c27 |
| INC0004 | SERIOUS | 29 | 17 |  |  | 2.377 | 7.377 | V00207@c29 |

**司机抢行**

总计 {"redLight":2,"tailgate":0,"cutIn":1}

| 周期 | 类型 | 车辆 | 此前出现在 driverAlerts 的周期数 | 最后一次预警 | 卷入事故 |
| --- | --- | --- | --- | --- | --- |
| 28 | VEHICLE_RED_LIGHT | V00045 | 0 |  | INC0002 |
| 50 | VEHICLE_RED_LIGHT | V00067 | 8 | IN_S_L1_LEFT 距停止线 0 剩余 0 |  |

**紧急车辆与抛锚**

紧急车辆延误扣费 0.642

| 车辆 | 首次进入 12 格 | 放行 tick | 等待拍数 | 最长静止 |
| --- | --- | --- | --- | --- |
| V00034 | 71 | 116 | 45 | 38 |
| V00036 | 71 | 107 | 36 | 17 |
| V00050 | 71 | 155 | 84 | 72 |
| V00043 | 81 |  |  | 174 |
| V00056 | 81 | 127 | 46 | 41 |
| V00096 | 137 | 149 | 12 | 0 |
| V00101 | 142 | 154 | 12 | 0 |
| V00137 | 166 |  |  | 63 |
| V00217 | 176 |  |  | 60 |

拖车费 9.6，链式加价 0.722

| 车辆 | 车道 | 抛锚 | 派拖车 | 派车延迟 | 绕行 |
| --- | --- | --- | --- | --- | --- |
| V00006 | IN_N_R1_RIGHT | 64 | 81 | 17 |  |
| V00014 | IN_S_R1_RIGHT | 64 | 127 | 63 | 81 |
| V00029 | IN_W_S2_STRAIGHT | 85 | 90 | 5 |  |
| V00089 | IN_S_S1_STRAIGHT | 126 | 127 | 1 |  |
| V00068 | IN_N_L1_LEFT | 130 | 166 | 36 |  |
| V00122 | IN_W_R1_RIGHT | 146 | 166 | 20 |  |
| V00131 | IN_S_S1_STRAIGHT | 170 | 175 | 5 |  |
| V00124 | IN_E_L1_LEFT | 195 | 198 | 3 |  |

### 2.3 亮眼操作与最差操作

周期价值 = 未卷入事故的放行车数 + 1.5×放行行人 + 2×成功的特情工具 − 归因事故成本。事故成本按锁格×开放时长分摊本局真实锁格扣费，再加撞人和校车罚款，平均分给放行了涉事车辆的周期。这是用于挑选证据的启发式，不是精确账目。

亮点事件：

| tick | 周期 | 类型 | 说明 |
| --- | --- | --- | --- |
| 81 | 3 | STALL_REROUTE | V00074 around V00014 |
| 81 | 3 | TOW_DISPATCH | V00006 |
| 90 | 4 | TOW_DISPATCH | V00029 |
| 107 | 6 | LARGE_VERIFIED_RELEASE | 16 vehicles, blame=0 |
| 117 | 7 | LARGE_VERIFIED_RELEASE | 14 vehicles, blame=0 |
| 127 | 8 | TOW_DISPATCH | V00089 |
| 127 | 8 | TOW_DISPATCH | V00014 |
| 153 | 14 | PED_GRANT | CROSSWALK:EAST B_TO_A x2 |
| 153 | 14 | LARGE_VERIFIED_RELEASE | 15 vehicles, blame=0 |
| 166 | 16 | LANE_GUIDANCE | V00112 IN_S_L1_LEFT->IN_S_S2_STRAIGHT |
| 166 | 16 | TOW_DISPATCH | V00068 |
| 166 | 16 | TOW_DISPATCH | V00122 |
| 175 | 19 | TOW_DISPATCH | V00131 |
| 198 | 28 | TOW_DISPATCH | V00124 |

#### 得分最高的周期

**周期 6（tick 107）**：放行 16，未出事 15，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -1.885，提交类型 verified，睡眠 10

- 观测要点：余额 995.36，停止线候选 9，受阻路线 7，行人预警 []，司机预警 []，紧急车 [V00034, V00036, V00043, V00050, V00056]，抛锚 [V00014, V00029]
- 工具序列：r1 dry_run_admit -> ok；r2 commit_schedule -> ok
- 战术摘要：Admit W_R1 top8 (clears emergency V00036 at head) and N_R1 top8; no pedestrian phases needed. Sleep 10 to tick 117; next cycle target E lanes and N_L1 once reservations expire (~123-126).
- 推理摘录：Let me analyze the current state carefully. Current tick 107, endTick 261, ticksRemaining 154. Balance 995.3645. Key observations: 1. **Stalled vehicles**: V00029 in IN_W_S2_STRAIGHT has a tow task EN_ROUTE, completion tick 108, remaining 1 tick. No need to re-dispatch. V00014 in IN_S_R1_RIGHT has blockedBehindCount 5, bypass maxMovableVehicles = 0 for S_S1 (blocked by V00039). 2. **Blocked routes** (RESERVATION): E_L1_LEFT until 123, E_S1_STRAIGHT until 126, E_S2_STRAIGHT until 125, N_L1_LEFT u …… 129), N_S1(131/132) open ~132. Alternatively sleep 10 now, then at 117 admit nothing new but could handle the S_R1 stall bypass (V00039 entered at 108, so bypass to S_S1 may be free by then) and the tow completion for V00029 (frees W_S2 head at 108). Those happen regardless. Sleep 10. Let me commit.

**周期 14（tick 153）**：放行 15，未出事 15，放行行人 0，耐心风险放行 8，归因成本 0，周期余额变化 -1.177，提交类型 verified，睡眠 10

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:24:0:CROSSWALK:EAST remaining=24
- 观测要点：余额 986.92，停止线候选 11，受阻路线 6，行人预警 [E:P13, E:P24, W:P17]，司机预警 [V00063:0, V00097:0, V00095:4, V00165:9, V00178:9, V00080:11, V00112:12, V00182:12]，紧急车 [V00043, V00050, V00101]，抛锚 [V00068, V00122]
- 工具序列：r1 dry_run_admit -> ok；r2 commit_schedule -> ok
- 战术摘要：Admit south phase: S_S1 x8 (big 118-pax queue), S_S2 x3, S_R1 x4 (school/route-free per blockedRoutes); verified no conflicts; release EAST B_TO_A peds before jaywalk. Sleep 10 to 163 to let batch enter, exits clear at 162, then target E/W waves opening 169-174.
- 推理摘录：Let me analyze the current situation carefully. Current state at tick 153: - Financial balance: 986.9239 - ticksRemaining: 108, endTick 261 - workingMemoryTop: null - interruptReason: PEDESTRIAN_PATIENCE pedestrian=PED:24:0:CROSSWALK:EAST remaining=24 Let me look at what's available: Stopline candidates (available to admit now): - E direction: V00079 (L1_LEFT, passenger, 1), V00148 (R1_RIGHT, passenger, 1), V00088 (S1_STRAIGHT, truck, 1), V00069 (S2_STRAIGHT, truck, 1) - S direction: V00067 (L1_ ……  W lanes are jammed; when E_W routes open at 169+, huge waves. OK, proceed: commit now (sleep 10). Let me double check the commit params must match dry-run exactly: lane_batches same (S_S1 top_n 8, S_S2 top_n 3, S_R1 top_n 4), pedestrian_phases EAST B_TO_A. sleep_ticks 10. tactical_summary. Proceed.

**周期 7（tick 117）**：放行 14，未出事 14，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -2.203，提交类型 verified，睡眠 10

- 观测要点：余额 993.48，停止线候选 10，受阻路线 9，行人预警 []，司机预警 []，紧急车 [V00043, V00050, V00056]，抛锚 [V00014]
- 工具序列：r1 dry_run_admit -> ok；r2 commit_schedule -> ok
- 战术摘要：Admitted E_R1 top6 and S_S1 top8 (incl guided head V00074), draining S_S1's 119-passenger queue; sleep to tick 127 when E_L1/E_S1/E_S2/N_L1 reservations expire."
- 推理摘录：Let me analyze the current state carefully. Current tick: 117, end tick: 261, ticks remaining: 144. Balance: 993.4796. Key observations: 1. **Blocked routes** (all RESERVATION): - E_L1_LEFT until 123 - E_S1_STRAIGHT until 126 - E_S2_STRAIGHT until 125 - N_L1_LEFT until 126 - N_S1_STRAIGHT until 132 - N_S2_STRAIGHT until 131 - S_S1_GUIDED_RIGHT until 117 - W_S1_STRAIGHT until 129 - W_S2_STRAIGHT until 130 2. **Discharging lanes**: - IN_N_R1_RIGHT: 5 remaining, next enter tick 120, clear 163 - IN_ …… 4)? Uncertain. Simpler: sleep 10 → 127, attempt E_L1+E_S1+E_S2+N_L1 combined at 127. Keep round budget. Let me commit now. Tactical summary: Admitted E_R1 top6 and S_S1 top8 (guided head + straights); drained S_S1 queue; sleeping to 127 for E-axis/N_L1 reservation expiry. Commit with sleep_ticks 10.

**周期 8（tick 127）**：放行 10，未出事 10，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -4.477，提交类型 verified，睡眠 10

- 观测要点：余额 991.28，停止线候选 10，受阻路线 4，行人预警 []，司机预警 [V00015:5]，紧急车 [V00043, V00050, V00056]，抛锚 [V00014, V00089]
- 工具序列：r1 dispatch_tow_truck -> ok；r1 dispatch_tow_truck -> ok；r1 dry_run_admit -> PLANNING_HORIZON_EXCEEDED (Admission planning horizon exceeded for V00064)；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 战术摘要：Admit N-axis: N_L1 head (emergency V00056), N_S1 top4 (clears aggressive V00015 patience 5 and advances emergency V00050), N_S2 top5 (drains 99-pax lane, relieves upstream backlog). Tow trucks en route for stalls V00089 and V00014 (complete 145) to stop quadratic chain penalties; both had zero bypas
- 推理摘录：Let me analyze this observation carefully. Current state: - currentTick: 127, endTick: 261, ticksRemaining: 134 - financialBalance: 991.2763 - We're losing about 2.2 per cycle, mostly from upstream queues (1.072) and delay (1.03). Key issues: 1. **upstreamQueues**: IN_N_S2_STRAIGHT waiting=7, IN_W_S1_STRAIGHT waiting=4. This costs 0.002 per passenger per tick = big drain (1.072 last cycle). 2. **Stalled vehicles**: V00089 in IN_S_S1_STRAIGHT has 14 blocked behind it. V00014 in IN_S_R1_RIGHT has  …… ight have more rounds (not sure), sleep 10 to tick 137, then next cycle admit W axis. If this is the last commit, sleep length doesn't matter much; use 10. Commit: lane_batches identical: N_L1 top1, N_S1 top4, N_S2 top5. No speed profiles (defaults CRUISE). No peds. sleep_ticks 10. tactical_summary.

**周期 3（tick 81）**：放行 6，未出事 6，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -1.556，提交类型 verified，睡眠 9

- 观测要点：余额 999.57，停止线候选 10，受阻路线 6，行人预警 []，司机预警 []，紧急车 [V00034, V00036, V00043, V00050, V00056]，抛锚 [V00006, V00014]
- 工具序列：r1 dry_run_admit -> ok；r1 reroute_queue_around_stall -> ok；r1 dispatch_tow_truck -> ok；r2 commit_schedule -> ok
- 战术摘要：Admit E_S1 top3 + W_R1 top2 (frees emergency V00036) + E_R1 head; tow N_R1 stall; bypass 1 from S_R1 stall. Sleep to tick 90 to await N/S reservation expiry.
- 推理摘录：Let me analyze the current situation. Current tick 81, balance 999.5717, 180 ticks remaining. Active vehicle motions: 8 vehicles currently CROSSING (V00007, V00009, V00012, V00013, V00018, V00021, V00023, V00030) — mostly W straight lanes and E_S1. Blocked routes (RESERVATION): - E_L1_LEFT until 94 - N_S1_STRAIGHT until 89 - N_S2_STRAIGHT until 90 - S_L1_LEFT until 90 - S_S1_STRAIGHT until 93 - S_S2_STRAIGHT until 92 These are reservation blockages from the current in-flight vehicles. So I can't …… te: V00011 estimated clear 91, V00022 clear 91 — right turns. V00024 clear 100. Entering now at 81. Next decision at 90: N_S1 (89), N_S2 (90), S_L1 (90) unblocked. Check discharging lanes then. Commit: same lane_batches, candidate_vehicle_ids ["V00011"] → admit_vehicle_ids ["V00011"]. sleep_ticks 9.

#### 损失最大的周期

**周期 27（tick 194）**：放行 10，未出事 8，放行行人 0，耐心风险放行 30，归因成本 17.55，周期余额变化 -0.991，提交类型 verified，睡眠 8

- 观测要点：余额 974.45，停止线候选 13，受阻路线 7，行人预警 [N:J0, S:P11, N:P14, W:P5, E:P17, W:P6, N:P17]，司机预警 [V00080:0, V00095:0, V00063:0, V00111:0, V00140:0, V00097:0, V00085:0, V00114:0]，紧急车 [V00043, V00137, V00217]，抛锚 []
- 工具序列：r1 dry_run_admit -> ok；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 后果：INC0003 PILEUP tick=201 vehicles=3 pedestrians=1 estCost=26.326
- 战术摘要：After 2 dry-runs: NORTH jaywalker PED:20 forces out N_S1/N_S2 (revoked) and E_R1 top3 (V00194 immediate collides - unavoidable with quota; V00204/V00214 revoked). Safe core: E_S1 top3 + E_S2 top4 clears the two largest backlogs (E_S1 147pax, E_S2 245pax). V00111 included to prevent tailgate red-ligh
- 推理摘录：Let me analyze this observation carefully. Current state: - Tick 194, endTick 261, 67 ticks remaining - Balance: 974.4524 - 13 stopline candidates - 7 blocked routes (mostly RESERVATION, blocking until 194-210) - Various pressures Let me think about what to do. The key observations: 1. There are 2 emergency vehicles: V00043 (in W_S1_STRAIGHT, stationary 108 ticks - way past 10), V00137 (in S_S1_STRAIGHT, stationary 21 ticks - past 10). These are being charged 0.0015/tick each = 0.003/tick = 0.03 …… r emergency V00137/V00217; V00194 immediate collides with NORTH jaywalker PED:20 (unavoidable given 2-dryrun quota). Sleeping 8 to let wave enter/clear." Hmm wait, V00137 is S_S1 emergency, V00217 is E_R1 emergency. E_R1 top 3 clears V00217's blockers (V00194, V00204, V00214). Good. Let me finalize.

**周期 19（tick 175）**：放行 3，未出事 2，放行行人 0，耐心风险放行 4，归因成本 8.78，周期余额变化 -1.562，提交类型 verified，睡眠 8

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:44:0:CROSSWALK:WEST remaining=24; PEDESTRIAN_JAYWALK pedestrian=PED:3:0:CROSSWALK:WEST; ACCIDENT_INTERRUPT incident=INC0001 locked=CROSSWALK:WEST:CELL:0:0,CROSSWALK:
- 观测要点：余额 978.04，停止线候选 10，受阻路线 8，行人预警 [N:P11, W:P24]，司机预警 [V00095:0, V00063:0, V00111:0, V00124:0, V00085:0, V00114:0, V00097:0, V00139:0]，紧急车 [V00043, V00137]，抛锚 [V00068, V00122, V00131]
- 工具序列：r1 inspect_incident -> ok；r1 dry_run_admit -> ok；r2 order_accident_clearance -> ok；r2 dispatch_tow_truck -> ok；r2 commit_schedule -> ok
- 后果：INC0003 PILEUP tick=201 vehicles=3 pedestrians=1 estCost=26.326
- 战术摘要：Admit W_L1 school bus V00065+V00071 and E_L1 V00079 (+4.2). Ordered INC0001 clearance to OUT_WEST_0 and tow for stalled V00131 (S_S1, 14 behind). Sleep 8 to tick 183: E_S2/S_L1/W_S2/W_S1 reservations expire, tows complete 184.
- 推理摘录：Let me analyze this observation carefully. Current tick: 175, end tick 261. Balance: 978.0368. The interruptReason contains multiple things: 1. PEDESTRIAN_PATIENCE: PED:44:0:CROSSWALK:WEST remaining=24 2. PEDESTRIAN_JAYWALK: PED:3:0:CROSSWALK:WEST 3. ACCIDENT_INTERRUPT incident=INC0001 with locked cells including CROSSWALK:WEST cells and PAIR routes N_R1_RIGHT and N_S1_GUIDED_RIGHT, plus SPACE cells. Per instructions: "If interruptReason starts with ACCIDENT_INTERRUPT, first call inspect_inciden …… s. Clearance order for V00130 on N_R1 — that's blocked route; no admission there. No conflict with our commit. Fine. sleep_ticks: 8. Next cycle tick 183. Reservations: E_S2 176, S_L1 180, W_S2 181, W_S1 182 will have expired by then. Tow completions at 184. Good timing. Tactical summary accordingly.

**周期 26（tick 188）**：放行 2，未出事 1，放行行人 0，耐心风险放行 6，归因成本 8.53，周期余额变化 0.699，提交类型 verified，睡眠 6

- 观测要点：余额 973.75，停止线候选 13，受阻路线 13，行人预警 [N:J0, S:P17, N:P20, W:P11, E:P23, W:P12, N:P23]，司机预警 [V00080:0, V00124:0, V00095:0, V00063:0, V00111:0, V00140:0, V00097:0, V00085:0]，紧急车 [V00043, V00137, V00217]，抛锚 [V00131]
- 工具序列：r1 inspect_incident -> ok；r1 dry_run_admit -> ok；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 后果：INC0002 ANGLE_COLLISION tick=198 vehicles=2 pedestrians=1 estCost=8.525
- 战术摘要：Admitted W_R1 top-2 (V00129 truck, V00146). Dropped V00109 N_L1 due to NORTH jaywalker JAYWALKER_AHEAD risk (clear ~218). INC0001 evacuation in progress, closes ~189, freeing N_R1/E_S1/GUIDED routes. Sleeping to 194 to catch N_S1/N_R1 windows.
- 推理摘录：Let me analyze this situation carefully. Current state: - currentTick: 188, endTick: 261, ticksRemaining: 73 - financialBalance: 973.7538 - Last settlement: netDelta -0.03 per cycle (with sleep 1). We're bleeding money through delays/upstream queues. Key observations: **Incident INC0001**: routes blocked with INCIDENT kind: - E_R1_GUIDED_STRAIGHT (blocked 189) - E_S1_STRAIGHT (blocked 202) - N_R1_RIGHT (blocked 189) - N_S1_GUIDED_RIGHT (blocked 189) Recent cycle 24 summary says: "Incident INC000 ……  true unlock is incident closure. Inspect says est clearance 1 tick from 189? Wait current tick 188, estimated_clearance_ticks 1 → clears at 189. Hmm E_S1 blockedUntilTick 202 vs INC est 189 — contradictory; the 202 might be stale/from parallel. I'll rely on INC status: closed ~189.) Commit sleep 6.

**周期 29（tick 199）**：放行 3，未出事 2，放行行人 0，耐心风险放行 6，归因成本 7.38，周期余额变化 -1.102，提交类型 verified，睡眠 8

- 唤醒原因：PEDESTRIAN_JAYWALK pedestrian=PED:44:0:CROSSWALK:WEST; ACCIDENT_INTERRUPT incident=INC0002 locked=CROSSWALK:WEST:CELL:7:0,CROSSWALK:WEST:CELL:7:1,PAIR:W_R1_RIGHT:1|W_R1_GUIDED_STRAIGHT:1,PAIR:W_R1_RIG
- 观测要点：余额 966.14，停止线候选 11，受阻路线 14，行人预警 [N:J0, S:P6, N:P9, E:P12, W:P1, N:P12]，司机预警 [V00062:0, V00109:0, V00075:0, V00080:0, V00087:0, V00095:0, V00063:0, V00127:0]，紧急车 [V00043, V00137, V00217]，抛锚 [V00124]
- 工具序列：r1 inspect_incident -> ok；r2 order_accident_clearance -> ok；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 后果：INC0004 ANGLE_COLLISION tick=212 vehicles=1 pedestrians=1 estCost=7.377
- 战术摘要：INC0002 evacuation started (V00129->OUT_SOUTH_0). Verified-and-admitted S_R1 top3 (V00207 immediate, V00233@219, V00271@224; no jaywalker warnings). Sleep 8 to tick 207 so S_L1 reservation expires; next cycle reassess S_L1 and post-incident W discharge.
- 推理摘录：Let me analyze the current state carefully. Current tick 199, end tick 261, 62 ticks remaining. Balance 966.1411. Key facts: - InterruptReason: PEDESTRIAN_JAYWALK pedestrian=PED:44:0:CROSSWALK:WEST; ACCIDENT_INTERRUPT incident=INC0002 ... - INC0002 is an incident locking WEST crosswalk cells and W_R1_RIGHT, W_R1_GUIDED_STRAIGHT, W_S1_G*, W_S2* etc. Many W routes blocked by INCIDENT until 215. - blockedRoutes: many W routes blocked by INCIDENT until 215. N_L1 blocked RESERVATION until 223. N_R1_G …… ter 219 scheduled. Good. Let's commit. Tactical summary in English maybe. Must include sleep_ticks 8 and no vehicles. Should we set lane_batches with speed_profile CRUISE identical. Yes. Concern: commit with lane_batches top_n 3 will also commit the scheduled V00233/V00271. Fine. Let's write commit.

**周期 15（tick 162）**：放行 5，未出事 4，放行行人 0，耐心风险放行 7，归因成本 5.8，周期余额变化 -1.17，提交类型 verified，睡眠 4

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:20:0:CROSSWALK:NORTH remaining=24
- 观测要点：余额 985.75，停止线候选 10，受阻路线 6，行人预警 [N:P24, W:P8]，司机预警 [V00095:0, V00063:0, V00097:0, V00178:0, V00165:2, V00112:3, V00182:3, V00124:6]，紧急车 [V00043]，抛锚 [V00068, V00122]
- 工具序列：r1 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:WEST:CELL:0:0 vs V00101)；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 后果：INC0001 ANGLE_COLLISION tick=174 vehicles=1 pedestrians=1 estCost=5.796
- 战术摘要：Admit E_R1 x3 + N_R1 x2 (verified, no peds). Sleep 4 so in-transit V00101 clears WEST crosswalk; next cycle release critical WEST peds (patience ~4 left), then target bus/van after S_L1 unblocks at 173.
- 推理摘录：Let me analyze this observation carefully. Current state: - Tick 162, endTick 261, 99 ticks remaining - Balance: 985.7471 - No working memory - Interrupt: PEDESTRIAN_PATIENCE - PED:20:0:CROSSWALK:NORTH remaining 24 Stopline candidates: - V00079 (passenger, 1 pax) IN_E_L1_LEFT, waiting 64 - V00148 (passenger, 1 pax) IN_E_R1_RIGHT, waiting 30 - V00088 (truck, 1 pax) IN_E_S1_STRAIGHT, waiting 61 - V00069 (truck, 1 pax) IN_E_S2_STRAIGHT, waiting 69 - V00107 (passenger, 1 pax) IN_N_R1_RIGHT, waiting  …… n 8). If I release B_TO_A only now, crossing row free — but keeps A_TO_B waiting (jaywalk imminent). Next cycle A_TO_B. Hmm — no, better: commit vehicles now + sleep 4, then peds next cycle. That handles it. Alternatively, commit vehicles with sleep 4 AND... no peds in commit (dry-run had none). Go.

### 附：逐周期一览

| 周期 | tick | 提交 | 放行 | 行人 | 耐心风险 | 归因事故 | 归因成本 | 余额变化 | 睡眠 | 唤醒原因 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 61 | verified | 6 | 0 | 0 |  | 0 | -0.11 | 10 |  |
| 2 | 71 | verified | 7 | 0 | 0 |  | 0 | -0.319 | 10 |  |
| 3 | 81 | verified | 6 | 0 | 0 |  | 0 | -1.556 | 9 |  |
| 4 | 90 | verified | 4 | 0 | 0 |  | 0 | -1.885 | 10 |  |
| 5 | 100 | verified | 9 | 0 | 0 |  | 0 | -0.767 | 7 |  |
| 6 | 107 | verified | 16 | 0 | 0 |  | 0 | -1.885 | 10 |  |
| 7 | 117 | verified | 14 | 0 | 0 |  | 0 | -2.203 | 10 |  |
| 8 | 127 | verified | 10 | 0 | 0 |  | 0 | -4.477 | 10 |  |
| 9 | 137 | hold | 0 | 0 | 0 |  | 0 | -0.725 | 3 |  |
| 10 | 140 | verified | 1 | 0 | 0 |  | 0 | -0.324 | 10 |  |
| 11 | 142 | fallback | 0 | 0 | 0 |  | 0 | -0.289 | 1 | PEDESTRIAN_PATIENCE pedestrian=PED:11:0:CROSSWALK:EAST remai |
| 12 | 143 | hold | 0 | 0 | 0 |  | 0 | 3.023 | 10 |  |
| 13 | 146 | hold | 0 | 0 | 0 |  | 0 | -1.561 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:3:0:CROSSWALK:WEST remain |
| 14 | 153 | verified | 15 | 0 | 8 |  | 0 | -1.177 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:24:0:CROSSWALK:EAST remai |
| 15 | 162 | verified | 5 | 0 | 7 | INC0001 | 5.8 | -1.17 | 4 | PEDESTRIAN_PATIENCE pedestrian=PED:20:0:CROSSWALK:NORTH rema |
| 16 | 166 | hold | 0 | 0 | 0 |  | 0 | 1.526 | 1 |  |
| 17 | 167 | verified | 2 | 0 | 2 |  | 0 | -0.727 | 2 |  |
| 18 | 169 | hold | 0 | 0 | 0 |  | 0 | -7.339 | 10 |  |
| 19 | 175 | verified | 3 | 0 | 4 | INC0003 | 8.78 | -1.562 | 8 | PEDESTRIAN_PATIENCE pedestrian=PED:44:0:CROSSWALK:WEST remai |
| 20 | 176 | verified | 1 | 0 | 1 |  | 0 | -0.117 | 5 | PEDESTRIAN_PATIENCE pedestrian=PED:45:1:CROSSWALK:WEST remai |
| 21 | 181 | fallback | 0 | 0 | 0 |  | 0 | -0.451 | 1 | PEDESTRIAN_PATIENCE pedestrian=PED:38:0:CROSSWALK:SOUTH rema |
| 22 | 182 | verified | 3 | 0 | 3 |  | 0 | -0.586 | 6 |  |
| 23 | 184 | hold | 0 | 0 | 0 |  | 0 | -1.167 | 6 | PEDESTRIAN_PATIENCE pedestrian=PED:43:0:CROSSWALK:NORTH rema |
| 24 | 186 | hold | 0 | 0 | 0 |  | 0 | -0.371 | 7 | PEDESTRIAN_JAYWALK pedestrian=PED:20:0:CROSSWALK:NORTH |
| 25 | 187 | fallback | 0 | 0 | 0 |  | 0 | -0.03 | 1 | PEDESTRIAN_PATIENCE pedestrian=PED:45:0:CROSSWALK:EAST remai |
| 26 | 188 | verified | 2 | 0 | 6 | INC0002 | 8.53 | 0.699 | 6 |  |
| 27 | 194 | verified | 10 | 0 | 30 | INC0003 | 17.55 | -0.991 | 8 |  |
| 28 | 198 | hold | 0 | 0 | 0 |  | 0 | -7.32 | 10 | VEHICLE_RED_LIGHT vehicle=V00045 route=W_S2_STRAIGHT |
| 29 | 199 | verified | 3 | 0 | 6 | INC0004 | 7.38 | -1.102 | 8 | PEDESTRIAN_JAYWALK pedestrian=PED:44:0:CROSSWALK:WEST; ACCID |
| 30 | 200 | fallback | 0 | 0 | 0 |  | 0 | -0.681 | 1 | PEDESTRIAN_JAYWALK pedestrian=PED:45:1:CROSSWALK:WEST; ACCID |
| 31 | 201 | hold | 0 | 0 | 0 |  | 0 | -5.974 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:61:0:CROSSWALK:EAST remai |
| 32 | 202 | hold | 0 | 0 | 0 |  | 0 | -11.069 | 10 | ACCIDENT_INTERRUPT incident=INC0003 locked=CROSSWALK:NORTH:C |
| 33 | 203 | hold | 0 | 0 | 0 |  | 0 | -0.288 | 10 | ACCIDENT_INTERRUPT incident=INC0003 secondary=true |
| 34 | 204 | hold | 0 | 0 | 0 |  | 0 | -1.66 | 4 | PEDESTRIAN_PATIENCE pedestrian=PED:68:0:CROSSWALK:NORTH rema |
| 35 | 205 | hold | 0 | 0 | 0 |  | 0 | -2.391 | 2 | PEDESTRIAN_JAYWALK pedestrian=PED:38:0:CROSSWALK:SOUTH |
| 36 | 207 | hold | 0 | 0 | 0 |  | 0 | 2.223 | 8 |  |
| 37 | 208 | hold | 0 | 0 | 0 |  | 0 | -2.129 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:43:0:CROSSWALK:NORTH |
| 38 | 210 | fallback | 0 | 0 | 0 |  | 0 | -1.819 | 1 | PEDESTRIAN_PATIENCE pedestrian=PED:62:0:CROSSWALK:NORTH rema |
| 39 | 211 | hold | 0 | 0 | 0 |  | 0 | -1.853 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:50:0:CROSSWALK:NORTH |
| 40 | 212 | hold | 0 | 0 | 0 |  | 0 | -6.163 | 3 | PEDESTRIAN_JAYWALK pedestrian=PED:45:0:CROSSWALK:EAST |
| 41 | 213 | hold | 0 | 0 | 0 |  | 0 | -4.837 | 10 | ACCIDENT_INTERRUPT incident=INC0004 locked=CROSSWALK:EAST:CE |
| 42 | 217 | hold | 0 | 0 | 0 |  | 0 | -2.972 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:80:0:CROSSWALK:SOUTH rema |
| 43 | 220 | hold | 0 | 0 | 0 |  | 0 | -2.516 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:82:0:CROSSWALK:NORTH rema |
| 44 | 225 | fallback | 0 | 0 | 0 |  | 0 | 2.522 | 1 | PEDESTRIAN_PATIENCE pedestrian=PED:81:0:CROSSWALK:WEST remai |
| 45 | 226 | hold | 0 | 0 | 0 |  | 0 | -2.766 | 10 |  |
| 46 | 228 | hold | 0 | 0 | 0 |  | 0 | -3.05 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:68:0:CROSSWALK:NORTH |
| 47 | 233 | fallback | 0 | 0 | 0 |  | 0 | -1.677 | 1 | PEDESTRIAN_PATIENCE pedestrian=PED:87:0:CROSSWALK:WEST remai |
| 48 | 234 | hold | 0 | 0 | 0 |  | 0 | -1.948 | 4 | PEDESTRIAN_JAYWALK pedestrian=PED:62:0:CROSSWALK:NORTH |
| 49 | 236 | fallback | 0 | 0 | 0 |  | 0 | -1.169 | 1 | PEDESTRIAN_PATIENCE pedestrian=PED:106:0:CROSSWALK:WEST rema |
| 50 | 237 | hold | 0 | 0 | 0 |  | 0 | 2.888 | 1 | VEHICLE_RED_LIGHT vehicle=V00067 route=S_L1_LEFT |
| 51 | 238 | fallback | 0 | 0 | 0 |  | 0 | 2.828 | 1 | PEDESTRIAN_PATIENCE pedestrian=PED:95:0:CROSSWALK:SOUTH rema |
| 52 | 239 | hold | 0 | 0 | 0 |  | 0 | -2.849 | 6 | PEDESTRIAN_PATIENCE pedestrian=PED:91:0:CROSSWALK:EAST remai |
| 53 | 241 | hold | 0 | 0 | 0 |  | 0 | -1.119 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:80:0:CROSSWALK:SOUTH; PEDE |
| 54 | 242 | fallback | 0 | 0 | 0 |  | 0 | -1.062 | 1 | PEDESTRIAN_PATIENCE pedestrian=PED:113:0:CROSSWALK:WEST rema |
| 55 | 243 | hold | 0 | 0 | 0 |  | 0 | -1.71 | 10 |  |
| 56 | 244 | unverified | 2 | 0 | 14 |  | 0 | -1.261 | 1 | PEDESTRIAN_PATIENCE pedestrian=PED:98:0:CROSSWALK:NORTH rema |
| 57 | 245 | hold | 0 | 0 | 0 |  | 0 | -2.443 | 10 |  |
| 58 | 247 | hold | 0 | 0 | 0 |  | 0 | -3.857 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:115:0:CROSSWALK:EAST rema |
| 59 | 249 | hold | 0 | 0 | 0 |  | 0 | -1.411 | 1 | PEDESTRIAN_JAYWALK pedestrian=PED:81:0:CROSSWALK:WEST; PEDES |
| 60 | 250 | hold | 0 | 0 | 0 |  | 0 | -2.673 | 10 |  |
| 61 | 252 | hold | 0 | 0 | 0 |  | 0 | -6.861 | 9 | PEDESTRIAN_PATIENCE pedestrian=PED:119:0:CROSSWALK:WEST rema |
| 62 | 257 | fallback | 0 | 0 | 0 |  | 0 | -1.369 | 1 | PEDESTRIAN_JAYWALK pedestrian=PED:87:0:CROSSWALK:WEST |
| 63 | 258 | hold | 0 | 0 | 0 |  | 0 | -1.414 | 3 |  |
| 64 | 259 | hold | 0 | 0 | 0 |  | 0 | -2.064 | 2 | PEDESTRIAN_PATIENCE pedestrian=PED:111:0:CROSSWALK:NORTH rem |
| 65 | 260 | hold | 0 | 0 | 0 |  | 0 | -1.485 | 1 | PEDESTRIAN_JAYWALK pedestrian=PED:106:0:CROSSWALK:WEST |

