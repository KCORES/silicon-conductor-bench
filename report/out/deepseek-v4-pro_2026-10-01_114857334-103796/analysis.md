# 运行分析：deepseek-v4-pro_2026-10-01_114857334-103796

- 模型：deepseek-v4-pro；种子 63916；规则版本 16；回放 schema 7
- 截止 tick 261，决策周期 51，最终余额 **689.28**
- 生成时间 2026-10-01T21:35:14.086Z；数据文件：replay_deepseek-v4-pro_2026-10-01_114857334-103796.json、report_deepseek-v4-pro_2026-10-01_114857334-103796.json、api-log_deepseek-v4-pro_2026-10-01_114857334-103796.jsonl、raw-api-log_deepseek-v4-pro_2026-10-01_114857334-103796.jsonl

## 1. 基础分析

### 1.1 上下文能力

- prompt tokens：平均 26096.7，P50 24593，P95 47186，最大 63462（n=206）
- completion tokens：平均 6862.9，P50 4637，P95 22155，最大 40571（n=206）；其中推理 tokens：平均 6721.9，P50 4467，P95 22082，最大 40385（n=206）
- 每周期 API 轮数：平均 4，P50 4，P95 6，最大 7（n=51）；上限 8，用满上限的周期 0 个
- 每次请求的平均字符数：系统提示 7722，user 15919.3，工具结果 3220.8，assistant 649.5；消息条数 平均 6.4，P50 6，P95 13，最大 19（n=206）
- 工具参数中的 ID 共 519 个：出现在当轮可见上下文里的占 1，当轮不可见但本局别处出现过 0 个，本局从未出现 0 个，非规范横道短键 0 个

| ID 类型 | 总数 | 当轮可见 | 别处出现 | 从未出现 | 非规范短键 |
| --- | --- | --- | --- | --- | --- |
| vehicle | 119 | 119 | 0 | 0 | 0 |
| lane | 197 | 197 | 0 | 0 | 0 |
| crosswalk | 142 | 142 | 0 | 0 | 0 |
| incident | 61 | 61 | 0 | 0 | 0 |

- 同一周期内重复提交已失败的相同调用：0 次 {}
- 提交类型：verified 16，unverified 3，hold 32；放行类提交中 verified 占 0.842
- working memory：调用 0 次 {}，观测里带有计划的周期 0 个

### 1.2 注意力分布

关注率 = 字段出现在该周期观测里、且推理文本提到它的周期数 / 字段出现的周期数。

| 概念 | 出现周期 | 提到且出现 | 关注率 | 提到周期（含未出现） | 提及次数 |
| --- | --- | --- | --- | --- | --- |
| stoplineCandidates | 51 | 51 | 1 | 51 | 730 |
| crosswalks | 51 | 51 | 1 | 51 | 7802 |
| candidateConflicts | 51 | 51 | 1 | 51 | 2776 |
| pedestrianAlerts | 42 | 42 | 1 | 51 | 10201 |
| emergency | 51 | 51 | 1 | 51 | 2380 |
| stalledVehicles | 19 | 19 | 1 | 46 | 948 |
| dischargingLanes | 19 | 19 | 1 | 33 | 428 |
| timeBudget | 51 | 51 | 1 | 51 | 266 |
| recentCycles | 50 | 49 | 0.98 | 49 | 403 |
| driverAlerts | 44 | 43 | 0.977 | 49 | 2747 |
| holds | 44 | 42 | 0.955 | 44 | 717 |
| activeVehicleMotions | 48 | 44 | 0.917 | 45 | 300 |
| laneGuidance | 51 | 46 | 0.902 | 46 | 354 |
| revokedAdmissions | 11 | 9 | 0.818 | 24 | 104 |
| lastSettlement | 50 | 40 | 0.8 | 40 | 184 |
| laneMatrices | 0 | 0 |  | 51 | 1796 |
| exits | 0 | 0 |  | 51 | 7204 |
| reservedUntil | 0 | 0 |  | 51 | 2318 |
| incidentBlocked | 0 | 0 |  | 33 | 1054 |
| workingMemory | 0 | 0 |  | 14 | 42 |

中断响应：

| 中断类型 | 次数 | 有响应 | 响应率 | 判定规则 |
| --- | --- | --- | --- | --- |
| PEDESTRIAN_PATIENCE | 23 | 19 | 0.826 | 同周期任一试算或提交带 pedestrian_phases |
| PEDESTRIAN_JAYWALK | 13 | 8 | 0.615 | 推理文本提到了中断对象 ID |
| ACCIDENT_INTERRUPT | 9 | 9 | 1 | 同周期调用 inspect_incident / order_accident_clearance / set_lane_detour |
| VEHICLE_RED_LIGHT | 4 | 4 | 1 | 推理文本提到了中断对象 ID |

- 每次回复的推理字符数：平均 24259.6，P50 16233，P95 81025，最大 126697（n=206）

### 1.3 tool_call 准确性

- 工具调用 279 次，成功 205 次，成功率 0.735
- 失败分类：{"RESOURCE_CONFLICT":50,"DRY_RUN_QUOTA_EXHAUSTED":12,"LANE_HEAD_NOT_READY":5,"TOOL_EXECUTION_ERROR":3,"PLANNING_HORIZON_EXCEEDED":3,"ROUTE_SEVERED":1}
- 每次回复的工具调用数分布：{"1":156,"2":33,"3":12,"4":4,"5":1}；finish_reason：{"tool_calls":206}
- API 错误 0 次 {}；回退周期 []
- 从未使用的工具：manage_working_memory、guide_inbound_lane_change

| 工具 | 调用 | 成功 | 成功率 | 结果分类 |
| --- | --- | --- | --- | --- |
| dry_run_admit | 109 | 35 | 0.321 | {"OK":35,"TOOL_EXECUTION_ERROR":3,"RESOURCE_CONFLICT":50,"LANE_HEAD_NOT_READY":5,"DRY_RUN_QUOTA_EXHAUSTED":12,"ROUTE_SEVERED":1,"PLANNING_HORIZON_EXCEEDED":3} |
| commit_schedule | 51 | 51 | 1 | {"OK":51} |
| reroute_queue_around_stall | 1 | 1 | 1 | {"OK":1} |
| dispatch_tow_truck | 6 | 6 | 1 | {"OK":6} |
| dispatch_emergency_convoy | 1 | 1 | 1 | {"OK":1} |
| inspect_incident | 40 | 40 | 1 | {"OK":40} |
| inspect_crosswalk | 30 | 30 | 1 | {"OK":30} |
| order_accident_clearance | 21 | 21 | 1 | {"OK":21} |
| set_lane_detour | 8 | 8 | 1 | {"OK":8} |
| inspect_lane_queue | 12 | 12 | 1 | {"OK":12} |

错误样例：

- **TOOL_EXECUTION_ERROR**
  - c2 t71 dry_run_admit：Admission plan exceeds 16 vehicles: 22；参数 `{"lane_batches":[{"lane_id":"IN_N_S1_STRAIGHT","top_n":4},{"lane_id":"IN_N_S2_STRAIGHT","top_n":8},{"lane_id":"IN_N_R1_RIGHT","top_n":8},{"lane_id":"IN_E_R1_RIGHT","top_n":2}]}`
  - c9 t133 dry_run_admit：Admission plan exceeds 16 vehicles: 17；参数 `{"lane_batches":[{"lane_id":"IN_E_L1_LEFT","top_n":3},{"lane_id":"IN_E_R1_RIGHT","top_n":2},{"lane_id":"IN_E_S1_STRAIGHT","top_n":3},{"lane_id":"IN_E_S2_STRAIGHT","top_n":2},{"lane_id":"IN_N_R1_RIGHT","top_n":4},{"lane_i`
  - c40 t236 dry_run_admit：Admission plan exceeds 16 vehicles: 21；参数 `{"lane_batches":[{"lane_id":"IN_N_S2_STRAIGHT","top_n":3},{"lane_id":"IN_N_S1_STRAIGHT","top_n":5},{"lane_id":"IN_E_R1_RIGHT","top_n":4},{"lane_id":"IN_N_R1_RIGHT","top_n":1},{"lane_id":"IN_S_S1_STRAIGHT","top_n":4},{"la`
- **RESOURCE_CONFLICT**
  - c7 t119 dry_run_admit：CROSSWALK:WEST:CELL:1:0 vs V00018；参数 `{"lane_batches":[{"lane_id":"IN_E_R1_RIGHT","top_n":2},{"lane_id":"IN_N_R1_RIGHT","top_n":3},{"lane_id":"IN_S_R1_RIGHT","top_n":2},{"lane_id":"IN_W_R1_RIGHT","top_n":2}],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:WE`
  - c10 t142 dry_run_admit：CROSSWALK:EAST:CELL:7:0 vs V00084；参数 `{"candidate_vehicle_ids":["V00169"],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:EAST","directions":["B_TO_A"]},{"crosswalk_id":"CROSSWALK:WEST","directions":["A_TO_B"]},{"crosswalk_id":"CROSSWALK:NORTH","directions":`
  - c10 t142 dry_run_admit：CROSSWALK:NORTH:CELL:0:0 vs V00053；参数 `{"candidate_vehicle_ids":["V00169"],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:WEST","directions":["A_TO_B"]},{"crosswalk_id":"CROSSWALK:NORTH","directions":["A_TO_B"]}]}`
- **LANE_HEAD_NOT_READY**
  - c8 t128 dry_run_admit：Lane head is not ready: IN_E_S2_STRAIGHT；参数 `{"lane_batches":[{"lane_id":"IN_E_S1_STRAIGHT","top_n":4},{"lane_id":"IN_E_S2_STRAIGHT","top_n":1},{"lane_id":"IN_W_R1_RIGHT","top_n":2},{"lane_id":"IN_N_R1_RIGHT","top_n":3}]}`
  - c8 t128 dry_run_admit：Lane head is not ready: IN_N_R1_RIGHT；参数 `{"lane_batches":[{"lane_id":"IN_E_S1_STRAIGHT","top_n":4},{"lane_id":"IN_W_R1_RIGHT","top_n":2},{"lane_id":"IN_N_R1_RIGHT","top_n":3}]}`
  - c13 t162 dry_run_admit：Lane head is not ready: IN_S_S1_STRAIGHT；参数 `{"lane_batches":[{"lane_id":"IN_N_S2_STRAIGHT","top_n":3},{"lane_id":"IN_N_S1_STRAIGHT","top_n":2},{"lane_id":"IN_S_S1_STRAIGHT","top_n":2}],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:WEST","directions":["A_TO_B"]}]`
- **DRY_RUN_QUOTA_EXHAUSTED**
  - c8 t128 dry_run_admit：-；参数 `{"lane_batches":[{"lane_id":"IN_E_S1_STRAIGHT","top_n":4},{"lane_id":"IN_W_R1_RIGHT","top_n":2}]}`
  - c10 t142 dry_run_admit：-；参数 `{"candidate_vehicle_ids":["V00169"],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:WEST","directions":["A_TO_B"]}]}`
  - c13 t162 dry_run_admit：-；参数 `{"lane_batches":[{"lane_id":"IN_N_S2_STRAIGHT","top_n":3},{"lane_id":"IN_N_S1_STRAIGHT","top_n":2}]}`
- **ROUTE_SEVERED**
  - c23 t199 dry_run_admit：none；参数 `{"lane_batches":[{"lane_id":"IN_E_R1_RIGHT","top_n":5},{"lane_id":"IN_S_S1_STRAIGHT","top_n":4},{"lane_id":"IN_S_S2_STRAIGHT","top_n":4}],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:EAST","directions":["A_TO_B","B_TO`
- **PLANNING_HORIZON_EXCEEDED**
  - c36 t225 dry_run_admit：Admission planning horizon exceeded for V00043；参数 `{"lane_batches":[{"lane_id":"IN_E_S2_STRAIGHT","top_n":3,"speed_profile":"CRUISE"},{"lane_id":"IN_N_S1_STRAIGHT","top_n":5,"speed_profile":"CRUISE"},{"lane_id":"IN_N_R1_RIGHT","top_n":3,"speed_profile":"CRUISE"},{"lane_i`
  - c48 t256 dry_run_admit：Admission planning horizon exceeded for V00140；参数 `{"lane_batches":[{"lane_id":"IN_W_L1_LEFT","top_n":4,"speed_profile":"CRUISE"},{"lane_id":"IN_S_L1_LEFT","top_n":4,"speed_profile":"CRUISE"},{"lane_id":"IN_N_R1_RIGHT","top_n":4,"speed_profile":"CRUISE"},{"lane_id":"IN_W`
  - c51 t260 dry_run_admit：Admission planning horizon exceeded for V00224；参数 `{"lane_batches":[{"lane_id":"IN_E_L1_LEFT","top_n":8,"speed_profile":"CRUISE"}]}`

### 1.4 Agent 能力

- 周期内工具序列（D=试算，C=提交，T=其他工具）：{"DDC":12,"DDDC":5,"TTTTDDC":5,"TTTTTDDC":3,"TTDC":2,"TTTDDC":2,"DC":1,"TDDC":1,"TTC":1,"TDDDC":1,"TDDTC":1,"TTDDDC":1,"TTTTDDTC":1,"TTTDDDC":1,"TTDDTTC":1,"TTDDC":1,"TTDTTTTTDTTC":1,"TTTTDDTTTTC":1,"TTTTDTDDC":1,"TTTDTTDC":1,"DDTTC":1,"TTTTTDDTTC":1,"TTDDTTDTC":1,"DTTTDC":1,"DDTC":1,"DTTDTTDC":1,"DDDTTC":1,"DTDC":1}
- 含提交的周期里先试算再提交的比例：0.98
- 提交构成：{"verified":16,"unverified":3,"hold":32,"reckless":0}；每周期放行车数 平均 2.1，P50 0，P95 13，最大 16（n=51）；共放行 107 辆
- 成功提交 51 次，其中使用 lane_batches 11 次；每次 top_n 合计 平均 1.8，P50 0，P95 13，最大 16（n=51）
- 速度档位：{"CRUISE":32}；sleep_ticks：平均 6.1，P50 6，P95 10，最大 10（n=51） {"1":7,"2":5,"3":2,"4":4,"5":7,"6":1,"7":1,"8":6,"9":2,"10":16}
- 工具使用：{"dry_run_admit":109,"commit_schedule":51,"inspect_incident":40,"inspect_crosswalk":30,"order_accident_clearance":21,"inspect_lane_queue":12,"set_lane_detour":8,"dispatch_tow_truck":6,"reroute_queue_around_stall":1,"dispatch_emergency_convoy":1}
- 决策开销：API 206 次，扣 4.12；非终结工具 228 次，扣 0.342

与同条件 baseline 对比：

| 策略 | 最终余额 | 放行车辆 | 未服务负债 | 事故数 | 锁格扣费 | 上游积压 | 撞人 | 闯红灯罚 | 行人奖励 | 校车 | 拖车 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| deepseek-v4-pro | 689.28 | 107 | 206.8 | 5 | 34.7 | 59.85 | 20 | 7.8 | 0 | 0 | 7.2 |
| baseline-balanced | 674.49 | 84 | 219.6 | 6 | 21.3 | 58.85 | 25 | 5.5 | 0 | 0 | 8.4 |
| baseline-balanced-bus | 659.61 | 87 | 208.1 | 4 | 90.26 | 53.27 | 5 | 4.9 | 0 | 0 | 6 |
| baseline-balanced-no-ped | 717.59 | 132 | 187.4 | 4 | 74.39 | 47.7 | 0 | 0 | 0 | 10 | 10.8 |
| baseline-longest-queue | 633.99 | 183 | 195.7 | 10 | 76.09 | 44.92 | 50 | 11.6 | 0 | 10 | 10.8 |
| baseline-random | 539.49 | 114 | 207.6 | 7 | 139.2 | 73.82 | 35 | 11 | 0 | 0 | 7.2 |
| baseline-search | 788.38 | 122 | 185.4 | 2 | 3.69 | 45.85 | 10 | 6.7 | 0 | 0 | 8.4 |

## 2. 进阶分析

### 2.1 逻辑推理

- 试算失败（不含额度用完）62 次；之后再试 37 次，其中改了参数 37 次，成功 17 次（0.459）；失败所在周期最终 verified 提交 8 次、hold 49 次
- 推理中"路线 X 经过/不经过 Y 横道"的断言 449 条，正确 342，错误 107，准确率 0.762；前半局 39/145 错，后半局 68/304 错
  - c12：「S_R1_RIGHT crossing WEST」（实际经过 CROSSWALK:SOUTH+CROSSWALK:EAST）
  - c13：「N_R1_RIGHT crossing (exits east, crosses EAST」（实际经过 CROSSWALK:NORTH+CROSSWALK:WEST）
  - c13：「S_L1_LEFT: exits east, crosses EAST」（实际经过 CROSSWALK:SOUTH+CROSSWALK:WEST）
  - c15：「E_L1_LEFT vehicles (from east left turn) might cross north」（实际经过 CROSSWALK:EAST+CROSSWALK:SOUTH）
  - c15：「S_R1_RIGHT (V00169), it would cross west」（实际经过 CROSSWALK:SOUTH+CROSSWALK:EAST）
  - c15：「S_R1_RIGHT crosses west」（实际经过 CROSSWALK:SOUTH+CROSSWALK:EAST）
  - c15：「E_R1_RIGHT crosses south」（实际经过 CROSSWALK:EAST+CROSSWALK:NORTH）
  - c15：「S_R1_RIGHT crosses WEST」（实际经过 CROSSWALK:SOUTH+CROSSWALK:EAST）
- 推理写"安全/无冲突"但同一轮试算冲突：36 次
  - c7 r1 t119：「(N_S2) conflicts with W_L1 - V00052 (S_S1) conflicts with W_S1, W_S2 - V00054 (S_S2) conflicts with W_S1, W_S2 Right turns are not in conflict list, so they're compatible with each other and with most things? Candidate conflicts only show same-tick heads. Right turns (E_R1, N_R1, S_R1, W_R1) don't appear in conflicts, so all fou」→ CROSSWALK:WEST:CELL:1:0 vs V00018
  - c10 r1 t142：「tick. But it also needs to check against in-motion vehicles? The dry_run_admit checks reservations. Let's just run a dry run. For pedestrians: which crosswalks are safe? The EAST crosswalk B_TO_A - releasing pedestrians there. Do they conflict with moving vehicles? The dry run will show jaywalker_warnings only for jaywalkers, 」→ CROSSWALK:EAST:CELL:7:0 vs V00084
  - c11 r1 t146：「un will warn. Let me also consider whether we should release NORTH A_TO_B (1 waiting, patience 40). Not critical yet, but approaching 3. We could include it if no conflict. OK let me just do a first dry run and see the result. Plan A dry run: - lane_batches: IN_E_R1_RIGHT top_n 2, IN_S_R1_RIGHT top_n 1 - pedestrian_phases: EAST B」→ CROSSWALK:EAST:CELL:7:0 vs V00121
  - c12 r1 t153：「e consider what vehicles to admit. Free (not blocked) heads: - E_L1_LEFT: V00105 (1 pax) - conflicts with S_S1, S_S2, W_S1, W_S2 - E_R1_RIGHT: V00142 (2 pax) - no conflicts listed! Interesting, right turn no conflicts. - E_S1_STRAIGHT: V00149 (1 pax) - conflicts with N_L1, N_S1, N_S2, S_S2, W_L1 - E_S2_STRAIGHT: V00191 (bus, 40 pa」→ CROSSWALK:WEST:CELL:0:0 vs V00053
  - c13 r2 t162：「). W_L1 crosses WEST (no active crossing, but conflicts with N straights). N_S1/N_S2 cross NORTH (no active crossing). So the main vehicle plan is N_S1 + N_S2 (compatible). And we can test WEST A_TO_B pedestrians with them. Let me dry-run: lane_batches N_S2 top_n 3, N_S1 top_n 2; pedestrian WEST A_TO_B. If that succeeds, we comm」→ CROSSWALK:WEST:CELL:0:0 vs V00061
  - c16 r1 t176：「timate is pessimistic). But blockedRoutes blockKind=RESERVATION says "通常可等到 blockedUntilTick 后再试". Trying before might get REJECTED (blocked route) but dry_run is safe to check. Actually the instruction says for INCIDENT routes never discharge. For RESERVATION, wait until blockedUntilTick. Trying early might fail or might wor」→ CROSSWALK:EAST:CELL:0:0 vs V00142
- 自我修正标记（Wait/Actually/Let me recheck…）：共 4500 次，每次回复 平均 21.8，P50 11，P95 79，最大 135（n=206）
- 认知模式 letterCounting：8 处
  - 「, not scheduled. So no N_S1 scheduled. So the head should be a candidate. Unless... the N_S1 head is blocked behind something at the stopline? No. Wait, maybe I'm wrong about which vehicles are N_S1. Let me recount activeVehicleMotions N_S1: - V00020 N_S1_STRAIGHT CROSSING - V00032 N_S1_STRAIGHT CROSSING - V00050 N_S1_STRAIGHT CROSSING These are 3 crossing. The queue has 5 more. So the head of those 5 should be」
  - 「1 right-turn head to keep exits clear for upcoming south/west batches. Incident INC0001 clearance in progress to OUT_SOUTH_1. Sleep 5 to tow completion for W_R1 stall." Let me write it concisely (max 300 chars). Commit with: - lane_batches: [{IN_E_R1_RIGHT, top_n:3}, {IN_S_R1_RIGHT, top_n:1}] - no vehicle_speed_profiles (all CRUISE, default) - no pedestrian_phases - sleep_ticks: 5 - tactical_summary. Let m」
  - 「rst dry-run (EAST both directions) failed at cell 7:1 vs V00194. If I try EAST A_TO_B only, it might avoid cell 7:1. But I've used my dry-run quota (2 calls). So I can't test now. Hmm wait, actually, let me recount my dry-run calls: 1. dry_run with EAST+SOUTH → failed (RESOURCE_CONFLICT). 2. dry_run with SOUTH only → ok. That's 2 dry-run calls. Quota exhausted. Correct. So this cycle I can only commit what I've」
- 认知模式 idFormat：0 处

### 2.2 复杂环境博弈

**行人与车辆**

- 行人相位尝试 59 次，成功 8 次 {"RESOURCE_CONFLICT":40,"OK":8,"DRY_RUN_QUOTA_EXHAUSTED":7,"LANE_HEAD_NOT_READY":2,"ROUTE_SEVERED":1,"PLANNING_HORIZON_EXCEEDED":1}
- 实际放行 4 批 13 人；闯红灯 13 次 13 人；被撞 4 人；奖励 0，扣费 {"delay":0.85,"jaywalk":7.8,"strike":20}

行人相位冲突样例：

| 周期 | tick | 冲突偏移 at | 冲突 |
| --- | --- | --- | --- |
| 7 | 119 | 4 | CROSSWALK:WEST:CELL:1:0 vs V00018 |
| 10 | 142 | 0 | CROSSWALK:EAST:CELL:7:0 vs V00084 |
| 10 | 142 | 1 | CROSSWALK:NORTH:CELL:0:0 vs V00053 |
| 11 | 146 | 0 | CROSSWALK:EAST:CELL:7:0 vs V00121 |
| 11 | 146 | 0 | CROSSWALK:WEST:CELL:0:0 vs V00046 |
| 12 | 153 | 0 | CROSSWALK:WEST:CELL:0:0 vs V00053 |
| 13 | 162 | 0 | CROSSWALK:WEST:CELL:0:0 vs V00061 |
| 16 | 176 | 0 | CROSSWALK:EAST:CELL:0:0 vs V00142 |
| 16 | 176 | 4 | CROSSWALK:NORTH:CELL:1:0 vs V00062 |
| 18 | 184 | 5 | CROSSWALK:NORTH:CELL:1:0 vs V00080 |

在行人耐心告急（PATIENCE_CRITICAL）时放行、且路线经过该横道的车辆：64 车次

| 周期 | tick | 车辆 | 路线 | 横道 | 行人 | 剩余耐心 | 该行人后来被撞 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 12 | 153 | V00074 | S_S1_GUIDED_RIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 13 |  |
| 12 | 153 | V00074 | S_S1_GUIDED_RIGHT | CROSSWALK:EAST | PED:24:0:CROSSWALK:EAST | 24 |  |
| 14 | 171 | V00057 | N_S1_STRAIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 15 | 是 |
| 14 | 171 | V00062 | N_S1_STRAIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 15 | 是 |
| 14 | 171 | V00075 | N_S1_STRAIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 15 | 是 |
| 14 | 171 | V00080 | N_S1_STRAIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 15 | 是 |
| 14 | 171 | V00094 | N_S1_STRAIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 15 | 是 |
| 14 | 171 | V00070 | N_S2_STRAIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 15 | 是 |
| 14 | 171 | V00077 | N_S2_STRAIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 15 | 是 |
| 14 | 171 | V00083 | N_S2_STRAIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 15 | 是 |
| 14 | 171 | V00091 | N_S2_STRAIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 15 | 是 |
| 14 | 171 | V00097 | N_S2_STRAIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 15 | 是 |
| 15 | 175 | V00142 | E_R1_RIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 11 | 是 |
| 15 | 175 | V00148 | E_R1_RIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 11 | 是 |
| 15 | 175 | V00159 | E_R1_RIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 11 | 是 |

行人时间线：

| tick | 事件 | 横道 | 人数 |
| --- | --- | --- | --- |
| 153 | PED_GRANT | CROSSWALK:EAST | 2 |
| 170 | PED_COLLISION | CROSSWALK:WEST | 1 |
| 171 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 187 | PED_COLLISION | CROSSWALK:NORTH | 1 |
| 188 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 199 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 200 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 202 | PED_GRANT | CROSSWALK:SOUTH | 3 |
| 207 | PED_COLLISION | CROSSWALK:NORTH | 1 |
| 208 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 211 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 211 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 222 | PED_COLLISION | CROSSWALK:EAST | 1 |
| 225 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 228 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 234 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 237 | PED_GRANT | CROSSWALK:EAST | 4 |
| 237 | PED_GRANT | CROSSWALK:NORTH | 4 |
| 249 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 257 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 260 | PED_JAYWALK | CROSSWALK:WEST | 1 |

**事故处置**

| 事故 | 类型 | 发生 | 车辆 | 行人 | 首次响应 | 清障令 | 清障调用次数 | 关闭 | 事故后才放行、后来卷入 | 非模型放行（抢行） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| INC0001 | ANGLE_COLLISION | 170 | 1 | 1 | 171 | 171 | 4 | 185 |  |  |
| INC0002 | PILEUP | 187 | 3 | 1 | 188 | 188 | 2 | 210 |  |  |
| INC0003 | PILEUP | 188 | 5 | 0 | 188 | 188 | 6 | 220 |  | V00012 V00009 |
| INC0004 | ANGLE_COLLISION | 207 | 2 | 1 | 208 | 208 | 6 | 230 |  |  |
| INC0005 | ANGLE_COLLISION | 222 | 1 | 1 | 223 | 223 | 3 | 237 |  |  |

事故成本估算：

| 事故 | 最终严重度 | 锁格（含二次） | 开放拍数 | 危化品 | 校车 | 分摊锁格费 | 估算总成本 | 放行来源 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| INC0001 | SERIOUS | 16 | 15 |  |  | 1.444 | 6.444 | V00096@c9 |
| INC0002 | CRITICAL | 27 | 23 |  |  | 5.604 | 10.604 | V00101@c19 V00075@c14 V00083@c14 |
| INC0003 | CRITICAL | 81 | 32 |  |  | 23.391 | 23.391 | V00012@c- V00062@c14 V00009@c- V00077@c14 V00129@c18 |
| INC0004 | SERIOUS | 21 | 23 |  |  | 2.906 | 7.906 | V00181@c23 V00110@c23 |
| INC0005 | SERIOUS | 15 | 15 |  |  | 1.354 | 6.354 | V00174@c29 |

**司机抢行**

总计 {"redLight":4,"tailgate":0,"cutIn":2}

| 周期 | 类型 | 车辆 | 此前出现在 driverAlerts 的周期数 | 最后一次预警 | 卷入事故 |
| --- | --- | --- | --- | --- | --- |
| 19 | VEHICLE_RED_LIGHT | V00012 | 5 | IN_W_S1_STRAIGHT 距停止线 0 剩余 0 | INC0003 |
| 19 | VEHICLE_RED_LIGHT | V00009 | 4 | IN_W_S2_STRAIGHT 距停止线 0 剩余 0 | INC0003 |
| 42 | VEHICLE_RED_LIGHT | V00040 | 12 | IN_S_L1_LEFT 距停止线 0 剩余 0 |  |
| 45 | VEHICLE_RED_LIGHT | V00067 | 8 | IN_S_L1_LEFT 距停止线 0 剩余 0 |  |

**紧急车辆与抛锚**

紧急车辆延误扣费 0.569

| 车辆 | 首次进入 12 格 | 放行 tick | 等待拍数 | 最长静止 |
| --- | --- | --- | --- | --- |
| V00034 | 71 | 135 | 64 | 59 |
| V00036 | 71 | 101 | 30 | 21 |
| V00050 | 71 | 89 | 18 | 0 |
| V00056 | 81 | 101 | 20 | 15 |
| V00096 | 133 | 163 | 30 | 13 |
| V00101 | 162 | 185 | 23 | 18 |
| V00161 | 185 |  |  | 69 |
| V00043 | 199 |  |  | 68 |
| V00145 | 199 |  |  | 66 |
| V00212 | 199 |  |  | 54 |
| V00242 | 201 |  |  | 44 |
| V00137 | 204 |  |  | 36 |

拖车费 7.2，链式加价 0.055

| 车辆 | 车道 | 抛锚 | 派拖车 | 派车延迟 | 绕行 |
| --- | --- | --- | --- | --- | --- |
| V00014 | IN_S_R1_RIGHT | 64 | 91 | 27 | 71 |
| V00006 | IN_N_R1_RIGHT | 75 | 91 | 16 |  |
| V00068 | IN_N_L1_LEFT | 104 | 109 | 5 |  |
| V00122 | IN_W_R1_RIGHT | 153 | 162 | 9 |  |
| V00089 | IN_S_S1_STRAIGHT | 165 | 171 | 6 |  |
| V00124 | IN_E_L1_LEFT | 182 | 184 | 2 |  |

### 2.3 亮眼操作与最差操作

周期价值 = 未卷入事故的放行车数 + 1.5×放行行人 + 2×成功的特情工具 − 归因事故成本。事故成本按锁格×开放时长分摊本局真实锁格扣费，再加撞人和校车罚款，平均分给放行了涉事车辆的周期。这是用于挑选证据的启发式，不是精确账目。

亮点事件：

| tick | 周期 | 类型 | 说明 |
| --- | --- | --- | --- |
| 71 | 2 | STALL_REROUTE | V00074 around V00014 |
| 71 | 2 | LARGE_VERIFIED_RELEASE | 16 vehicles, blame=0 |
| 91 | 4 | TOW_DISPATCH | V00006 |
| 91 | 4 | TOW_DISPATCH | V00014 |
| 109 | 6 | TOW_DISPATCH | V00068 |
| 109 | 6 | EMERGENCY_CONVOY | V00034 on IN_S_L1_LEFT |
| 133 | 9 | LARGE_VERIFIED_RELEASE | 16 vehicles, blame=6.44 |
| 151 | 11 | LANE_GUIDANCE | V00063 IN_W_S1_STRAIGHT->IN_W_R1_RIGHT |
| 153 | 12 | PED_GRANT | CROSSWALK:EAST B_TO_A x2 |
| 162 | 13 | TOW_DISPATCH | V00122 |
| 163 | 13 | LANE_GUIDANCE | V00112 IN_S_L1_LEFT->IN_S_S2_STRAIGHT |
| 171 | 14 | TOW_DISPATCH | V00089 |
| 171 | 14 | LARGE_VERIFIED_RELEASE | 13 vehicles, blame=22.66 |
| 184 | 18 | TOW_DISPATCH | V00124 |
| 202 | 26 | PED_GRANT | CROSSWALK:SOUTH A_TO_B+B_TO_A x3 |
| 237 | 41 | PED_GRANT | CROSSWALK:EAST A_TO_B+B_TO_A x4 |
| 237 | 41 | PED_GRANT | CROSSWALK:NORTH A_TO_B+B_TO_A x4 |

#### 得分最高的周期

**周期 2（tick 71）**：放行 16，未出事 16，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -0.329，提交类型 verified，睡眠 10

- 观测要点：余额 999.89，停止线候选 11，受阻路线 2，行人预警 []，司机预警 []，紧急车 [V00034, V00036, V00050]，抛锚 [V00014]
- 工具序列：r1 reroute_queue_around_stall -> ok；r2 dry_run_admit -> TOOL_EXECUTION_ERROR (Admission plan exceeds 16 vehicles: 22)；r3 dry_run_admit -> ok；r4 commit_schedule -> ok
- 战术摘要：North phase: N_S1 top4 (incl emergency V00050), N_S2 top8, N_R1 top4. Clear high-value queues; corridor reserved until ~123.
- 推理摘录：Let me analyze the current state. Current tick 71, end 261, 190 ticks remaining. Balance 999.8879. Let me understand the situation: - We have stopline candidates across all four directions. - blockedRoutes: E_L1_LEFT until 74 (reservation), W_R1_RIGHT until 82 (reservation). - candidateConflicts: pairwise conflicts for same-tick entry. - activeVehicleMotions: V00002 W_S1 straight crossing, V00004 S_R1 right crossing, V00005 N_L1 left crossing, V00007 W_R1 right crossing. - stalledVehicles: V0001 …… ergency will go through and earn 1. Good. Let me commit. For tactical_summary, I'll describe the plan. commit_schedule parameters must match dry_run exactly: - lane_batches: same 3 entries. - sleep_ticks: 10. - No candidate_vehicle_ids, no vehicle_speed_profiles, no pedestrian_phases. Let me commit.

**周期 6（tick 109）**：放行 9，未出事 9，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -3.107，提交类型 verified，睡眠 10

- 观测要点：余额 994.93，停止线候选 11，受阻路线 4，行人预警 []，司机预警 []，紧急车 [V00034]，抛锚 [V00068]
- 工具序列：r1 dispatch_emergency_convoy -> ok；r1 dispatch_tow_truck -> ok；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 战术摘要：Emergency convoy freed S_L1 (V00019,V00027,V00034); tow dispatched for N_L1 stall V00068. Committing verified east phase E_S1/E_S2 top-4 + E_R1 top-1. Sleep 10 toward west-corridor opening (117-118).
- 推理摘录：Let me analyze this situation carefully. Current tick: 109, endTick 261, ticksRemaining 152. Balance 994.9346. Let me understand the state. Stopline candidates: - V00008 passenger, IN_E_L1_LEFT, route E_L1_LEFT, waitingTicks 48 — but E_L1_LEFT is blocked until 114 (RESERVATION). - V00104 passenger, IN_E_R1_RIGHT, route E_R1_RIGHT, waiting 0 — no conflicts listed, E_R1 available. - V00018 passenger, IN_E_S1_STRAIGHT, route E_S1_STRAIGHT, waiting 41 — conflicts with N_S1, W_L1. - V00069 truck, IN_ …… voy was released before the dry_run, so the engine accounted for them. Should be fine. Let me commit. One more thought: should I also include pedestrian phases? All crosswalks have waiting 0, so no pedestrians to release. approaching pedestrians can't be released. So no. Let me commit with sleep 10.

**周期 3（tick 81）**：放行 10，未出事 10，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -0.459，提交类型 verified，睡眠 10

- 观测要点：余额 999.56，停止线候选 10，受阻路线 5，行人预警 []，司机预警 []，紧急车 [V00034, V00036, V00050, V00056]，抛锚 [V00006, V00014]
- 工具序列：r1 dry_run_admit -> ok；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 战术摘要：Northbound corridor still discharging. Admit compatible southbound straights (S_S1/S_S2, incl HAZMAT) plus east/west right turns; W_R1 top4 clears path for emergency V00036. East/west straights remain reservation-blocked until ~113-118.
- 推理摘录：Let me analyze the current observation. Current tick 81, end 261, ticksRemaining 180. Balance 999.5589. Let me understand the state. Blocked routes (RESERVATION): - E_S1_STRAIGHT until 113 - S_L1_LEFT until 117 - W_L1_LEFT until 115 - W_S1_STRAIGHT until 118 - W_S2_STRAIGHT until 117 Stopline candidates: - V00008 passenger IN_E_L1_LEFT, waiting 20, route E_L1_LEFT (not blocked) - V00003 truck IN_E_R1_RIGHT, waiting 22, route E_R1_RIGHT (not blocked) - V00018 passenger IN_E_S1_STRAIGHT, waiting 1 …… he admitted vehicles: - V00026 truck passengers 3 → 0.3 - V00039 ? (unknown, maybe passenger) - V00035 HAZMAT truck 3 → 0.3 - V00049 ? - V00003 truck 1 → 0.1 - V00011 ? - V00022 passenger 1 → 0.1 - V00033 ? - V00036 emergency → 1.0 - V00044 ? Total 2.6 means the others sum to ~0.8. Fine. Commit now.

**周期 7（tick 119）**：放行 9，未出事 9，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -1.177，提交类型 verified，睡眠 9

- 观测要点：余额 991.83，停止线候选 12，受阻路线 8，行人预警 []，司机预警 []，紧急车 [V00034]，抛锚 [V00068]
- 工具序列：r1 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:WEST:CELL:1:0 vs V00018)；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 战术摘要：Admit all four right-turn lanes (9 vehicles incl. S_R1 40p bus) while straight/left routes reserved. Defer WEST pedestrian due to E_S1 crossing conflict. Sleep 9 to reach tick 128 when W_S1/W_S2 straight unblock and N_L1 tow completes.
- 推理摘录：Let me analyze the current state carefully. Current tick: 119, endTick 261, ticksRemaining 142, balance 991.8277. Stopline candidates (12 vehicles): - V00008 passenger 1p, E_L1_LEFT, waiting 58, route E_L1_LEFT (blocked RESERVATION until 141) - V00106 passenger 2p, E_R1_RIGHT, waiting 7, route E_R1_RIGHT (not blocked) - V00017 passenger 2p, N_R1_RIGHT, waiting 52, route N_R1_RIGHT (not blocked) - V00057 truck 3p, N_S1_STRAIGHT, waiting 33, blocked until 146 - V00070 truck 1p, N_S2_STRAIGHT, wait ……  release pedestrian after V00018 passes. Next cycle (tick 127/128) might still conflict. We'll check then. For now, commit the vehicle plan and sleep 9. Let me write tactical summary. Commit parameters must exactly match dry run: lane_batches same, no pedestrian, no candidate ids, no speed profiles.

**周期 12（tick 153）**：放行 5，未出事 5，放行行人 0，耐心风险放行 2，归因成本 0，周期余额变化 -2.078，提交类型 verified，睡眠 10

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:24:0:CROSSWALK:EAST remaining=24
- 观测要点：余额 989.63，停止线候选 14，受阻路线 3，行人预警 [E:P13, E:P24, W:P17]，司机预警 [V00030:0, V00095:0, V00178:0, V00114:3, V00107:7, V00139:7, V00154:7, V00112:9]，紧急车 [V00096]，抛锚 []
- 工具序列：r1 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:WEST:CELL:0:0 vs V00053)；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 战术摘要：Release critical EAST B_TO_A pedestrians and move heavy South straight queues (S_S1 top3, S_S2 top2). WEST A_TO_B still blocked by in-motion right-turner V00053; defer to next cycle.
- 推理摘录：Let me analyze this observation carefully. Current tick 153, endTick 261, ticksRemaining 108. Balance 989.6301. We need to maximize final balance. Let me understand the situation. Stopline candidates (heads at stopline): - V00105: passenger, 1 pax, IN_E_L1_LEFT, waiting 43, route E_L1_LEFT - V00142: passenger, 2 pax, IN_E_R1_RIGHT, waiting 24, route E_R1_RIGHT - V00149: passenger, 1 pax, IN_E_S1_STRAIGHT, waiting 21, route E_S1_STRAIGHT - V00191: bus, 40 pax, IN_E_S2_STRAIGHT, waiting 0, route E …… twice (quota exhausted for this cycle). The commit must match the successful dry-run exactly. The successful dry-run had lane_batches top_n 3 and 2, pedestrian EAST B_TO_A. Commit with those exact params. Let me also think about speed_profile: default CRUISE, omitted in both. Consistent. Commit now.

#### 损失最大的周期

**周期 14（tick 171）**：放行 13，未出事 9，放行行人 0，耐心风险放行 10，归因成本 22.66，周期余额变化 -1.497，提交类型 verified，睡眠 10

- 唤醒原因：PEDESTRIAN_JAYWALK pedestrian=PED:3:0:CROSSWALK:WEST; ACCIDENT_INTERRUPT incident=INC0001 locked=CROSSWALK:WEST:CELL:0:0,CROSSWALK:WEST:CELL:0:1,PAIR:N_R1_RIGHT:5|N_S1_GUIDED_RIGHT:5,PAIR:N_R1_RIGHT:5
- 观测要点：余额 988.66，停止线候选 14，受阻路线 7，行人预警 [N:P15]，司机预警 [V00012:0, V00030:0, V00097:0, V00085:0, V00095:0, V00114:0, V00139:0, V00154:0]，紧急车 [V00101]，抛锚 [V00089, V00122]
- 工具序列：r1 inspect_incident -> ok；r1 dispatch_tow_truck -> ok；r1 inspect_crosswalk -> ok；r2 order_accident_clearance -> ok；r2 dry_run_admit -> ok；r3 dry_run_admit -> ok；r4 commit_schedule -> ok
- 后果：INC0002 PILEUP tick=187 vehicles=3 pedestrians=1 estCost=10.604；INC0003 PILEUP tick=188 vehicles=5 pedestrians=0 estCost=23.391
- 战术摘要：Incident INC0001 clearance ordered to OUT_SOUTH_1; tow dispatched for S_S1 stall V00089. Admit North straights (N_S1/N_S2 top5) southbound plus East left E_L1 top3 after its reservation clears at 172. Verified plan, no tailgate risk.
- 推理摘录：Let me analyze this situation carefully. Current tick: 171, endTick 261, ticks remaining 90. Balance: 988.6597. Interrupt reason: PEDESTRIAN_JAYWALK (PED:3:0:CROSSWALK:WEST) + ACCIDENT_INTERRUPT incident INC0001. Let me understand the accident INC0001. It's locked cells including CROSSWALK:WEST cells, PAIR:N_R1_RIGHT:5|N_S1_GUIDED_RIGHT:5,6,7, etc. Vehicles=V00096, pedestrians PED:3:0. Blocked routes (INCIDENT, incidentIds INC0001): - E_R1_GUIDED_STRAIGHT (until 185) - E_S1_STRAIGHT (until 185)  …… ION until 172. The dry_run scheduled it at 173. Good. Commit now. Tactical summary: "Release North straights (N_S1/N_S2 top5) southbound and East left (E_L1 top3) after reservation clears; incident clearance ordered for INC0001 to OUT_SOUTH_1; tow dispatched for S_S1 stall." Let me write the commit.

**周期 23（tick 199）**：放行 3，未出事 1，放行行人 0，耐心风险放行 9，归因成本 7.91，周期余额变化 -2.113，提交类型 unverified，睡眠 10

- 唤醒原因：PEDESTRIAN_JAYWALK pedestrian=PED:44:0:CROSSWALK:WEST
- 观测要点：余额 968.92，停止线候选 13，受阻路线 22，行人预警 [S:P6, N:P9, W:J0, E:P12, W:P1, N:P12]，司机预警 [V00023:0, V00080:0, V00107:0, V00030:0, V00097:0, V00126:0, V00165:0, V00045:0]，紧急车 [V00043, V00145, V00161, V00212]，抛锚 [V00124]
- 工具序列：r1 inspect_incident -> ok；r1 inspect_incident -> ok；r1 inspect_crosswalk -> ok；r2 set_lane_detour -> ok；r2 dry_run_admit -> ROUTE_SEVERED (none)；r3 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:EAST:CELL:7:1 vs V00194)；r4 commit_schedule -> ok
- 后果：INC0004 ANGLE_COLLISION tick=207 vehicles=2 pedestrians=1 estCost=7.906
- 战术摘要：Both dry-runs failed (V00112 severed in S_S2 batch; EAST pedestrian phase conflicts with crossing S_R1 V00194), so committing only compatible free-route heads V00181(E_R1), V00110(S_S1), V00138(S_S2). Held N_S1 to contain patience-0 runner V00080. Sleep 10 to align with INC0002 clearance ~t210.
- 推理摘录：Let me analyze the situation carefully. Current tick 199, endTick 261, ticksRemaining 62. Balance 968.9238. There are two incidents INC0002 and INC0003. Many routes are blocked with blockKind=INCIDENT. Let me understand the blocked routes and what's available. Let me first inspect the incidents to understand clearance status. From recentCycles, clearance was ordered: INC0002→OUT_SOUTH_1, INC0003→OUT_EAST_1. Both critical pileups with estimated clearances ~21t and ~31t from tick 188-189. Blocked  ……  a few ticks to reach east exit. By then V00194 might be clear. But without dry run, uncertain. The safer play is skip. Given balance concerns, 0.3 revenue isn't worth a 5+ strike risk. Skip. Final: commit admit_vehicle_ids [V00181, V00110, V00138], sleep_ticks 10, tactical_summary. Let me write it.

**周期 18（tick 184）**：放行 6，未出事 5，放行行人 0，耐心风险放行 15，归因成本 7.8，周期余额变化 -1.686，提交类型 verified，睡眠 1

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:43:0:CROSSWALK:NORTH remaining=24
- 观测要点：余额 984.22，停止线候选 10，受阻路线 11，行人预警 [N:P2, S:P21, N:P24, W:P15, W:P16]，司机预警 [V00009:0, V00012:0, V00023:0, V00107:0, V00030:0, V00126:0, V00045:0, V00140:0]，紧急车 [V00101]，抛锚 [V00089, V00124]
- 工具序列：r1 inspect_incident -> ok；r1 dispatch_tow_truck -> ok；r2 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:NORTH:CELL:1:0 vs V00080)；r3 dry_run_admit -> ok；r4 dry_run_admit -> DRY_RUN_QUOTA_EXHAUSTED；r5 commit_schedule -> ok
- 后果：INC0003 PILEUP tick=188 vehicles=5 pedestrians=0 estCost=23.391
- 战术摘要：Incident INC0001 clears ~185. Tow dispatched for E_L1 stall V00124. NORTH pedestrian phase conflicts with scheduled V00080@189, so skip. Admit unblocked N_L1_LEFT top3 + W_R1_RIGHT top3 (validated, reward 0.9). Sleep 1 to reassess N_R1 emergency and WEST crosswalk after incident clears.
- 推理摘录：Let me analyze the current state carefully. Current tick: 184, endTick 261, 77 ticks remaining. Balance 984.2163. Let me understand the situation: **Incident INC0001**: blocks several routes: - E_R1_GUIDED_STRAIGHT (INCIDENT, until 185) - E_S1_STRAIGHT (INCIDENT, until 200) - N_R1_GUIDED_STRAIGHT (INCIDENT, until 185) - N_R1_RIGHT (INCIDENT, until 185) - N_S1_GUIDED_RIGHT (INCIDENT, until 185) Wait, E_S1_STRAIGHT is blocked by INCIDENT until 200. Also S_L1_LEFT, S_S2_STRAIGHT, W_L1_LEFT, W_S1_ST …… it V00063 (it'll be in stoplineCandidates or accessible via lane_batches). But the lane_batches admit from the head of unscheduled queue. Hmm. Actually, let me not overthink. The tailgate is a future event (tick 207). I'll handle it when I see it in a future observation. Commit now. Let me finalize.

**周期 9（tick 133）**：放行 16，未出事 15，放行行人 0，耐心风险放行 0，归因成本 6.44，周期余额变化 -1.737，提交类型 verified，睡眠 10

- 观测要点：余额 990.1，停止线候选 14，受阻路线 6，行人预警 []，司机预警 [V00063:0, V00008:7, V00030:7, V00095:10]，紧急车 [V00034, V00096]，抛锚 []
- 工具序列：r1 dry_run_admit -> TOOL_EXECUTION_ERROR (Admission plan exceeds 16 vehicles: 17)；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 后果：INC0001 ANGLE_COLLISION tick=170 vehicles=1 pedestrians=1 estCost=6.444
- 战术摘要：Admit coherent east phase (4 lanes) plus N_R1 (top4 clears emergency V00096) and W_R1 (school bus +1). 16 vehicles verified, no jaywalker/tailgate warnings. Sleep 10 to tick 143 when west straight routes unblock.
- 推理摘录：Let me analyze this observation carefully. Current tick: 133, end 261, 128 ticks remaining. Balance: 990.0967. Stopline candidates (heads): - V00008 passenger E_L1_LEFT waiting 72, aggressive patience 7 - V00120 passenger E_R1_RIGHT waiting 15 - V00088 truck E_S1_STRAIGHT waiting 32 - V00116 van E_S2_STRAIGHT waiting 16 - V00109 passenger N_L1_LEFT waiting 20 - V00046 truck N_R1_RIGHT waiting 52 - V00057 truck N_S1_STRAIGHT waiting 47 - V00070 truck N_S2_STRAIGHT waiting 39 - V00052 passenger S_ ……  parameters exactly match the dry-run. lane_batches: - IN_E_L1_LEFT top_n 3 - IN_E_R1_RIGHT top_n 2 - IN_E_S1_STRAIGHT top_n 3 - IN_E_S2_STRAIGHT top_n 2 - IN_N_R1_RIGHT top_n 4 - IN_W_R1_RIGHT top_n 2 No vehicle_speed_profiles, no pedestrian_phases, no admit_vehicle_ids. Commit with sleep_ticks 10.

**周期 29（tick 208）**：放行 4，未出事 3，放行行人 0，耐心风险放行 12，归因成本 6.35，周期余额变化 -2.976，提交类型 verified，睡眠 4

- 唤醒原因：PEDESTRIAN_JAYWALK pedestrian=PED:43:0:CROSSWALK:NORTH; ACCIDENT_INTERRUPT incident=INC0004 locked=CROSSWALK:NORTH:CELL:7:0,CROSSWALK:NORTH:CELL:7:1,PAIR:E_R1_RIGHT:6|E_S1_GUIDED_RIGHT:6,PAIR:E_R1_RIG
- 观测要点：余额 956.87，停止线候选 14，受阻路线 27，行人预警 [W:J0, E:P3, W:J0, N:P3, E:P17, N:P20]，司机预警 [V00013:0, V00023:0, V00031:0, V00080:0, V00107:0, V00030:0, V00097:0, V00126:0]，紧急车 [V00043, V00137, V00145, V00161, V00212, V00242]，抛锚 []
- 工具序列：r1 inspect_incident -> ok；r1 inspect_incident -> ok；r1 inspect_incident -> ok；r2 order_accident_clearance -> ok；r2 dry_run_admit -> ok；r3 dry_run_admit -> ok；r4 commit_schedule -> ok
- 后果：INC0005 ANGLE_COLLISION tick=222 vehicles=1 pedestrians=1 estCost=6.354
- 战术摘要：Admit clear-route heads: S_R1_RIGHT top2 + N_L1_LEFT top2 (both east exit, verified). INC0004 clearance ordered (V00181->OUT_NORTH_1). Deferred EAST pedestrian phase to avoid blocking east crosswalk until 244; jaywalkers yield to moving vehicles. Sleep 4 toward INC0002 clear.
- 推理摘录：Let me analyze this complex traffic situation carefully. Current tick 208, endTick 261, 53 ticks remaining. Balance 956.874. There's a big incident situation. Let me look at blockedRoutes - many routes are incident-severed. There are 4 incidents: INC0002, INC0003, INC0004. The interruptReason says PEDESTRIAN_JAYWALK and ACCIDENT_INTERRUPT incident=INC0004. Let me identify what's going on. Key incidents: - INC0002: blocks routes with blockedUntilTick 210-225 - INC0003: blocks routes with blockedU ……  write the tactical summary. Summary: "Admit clear-route heads IN_S_R1_RIGHT top2 + IN_N_L1_LEFT top2 (east exit). INC0004 clearance ordered (V00181→OUT_NORTH_1). EAST pedestrian phase deferred to avoid blocking east crosswalk; jaywalkers should yield to vehicles. Sleep 4 to reach INC0002 clearing."

### 附：逐周期一览

| 周期 | tick | 提交 | 放行 | 行人 | 耐心风险 | 归因事故 | 归因成本 | 余额变化 | 睡眠 | 唤醒原因 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 61 | verified | 4 | 0 | 0 |  | 0 | -0.112 | 10 |  |
| 2 | 71 | verified | 16 | 0 | 0 |  | 0 | -0.329 | 10 |  |
| 3 | 81 | verified | 10 | 0 | 0 |  | 0 | -0.459 | 10 |  |
| 4 | 91 | hold | 0 | 0 | 0 |  | 0 | -3.212 | 10 |  |
| 5 | 101 | verified | 2 | 0 | 0 |  | 0 | -0.953 | 8 |  |
| 6 | 109 | verified | 9 | 0 | 0 |  | 0 | -3.107 | 10 |  |
| 7 | 119 | verified | 9 | 0 | 0 |  | 0 | -1.177 | 9 |  |
| 8 | 128 | hold | 0 | 0 | 0 |  | 0 | -0.554 | 5 |  |
| 9 | 133 | verified | 16 | 0 | 0 | INC0001 | 6.44 | -1.737 | 10 |  |
| 10 | 142 | hold | 0 | 0 | 0 |  | 0 | 2.909 | 5 | PEDESTRIAN_PATIENCE pedestrian=PED:11:0:CROSSWALK:EAST remai |
| 11 | 146 | hold | 0 | 0 | 0 |  | 0 | -1.639 | 8 | PEDESTRIAN_PATIENCE pedestrian=PED:3:0:CROSSWALK:WEST remain |
| 12 | 153 | verified | 5 | 0 | 2 |  | 0 | -2.078 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:24:0:CROSSWALK:EAST remai |
| 13 | 162 | hold | 0 | 0 | 0 |  | 0 | 1.107 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:20:0:CROSSWALK:NORTH rema |
| 14 | 171 | verified | 13 | 0 | 10 | INC0002 INC0003 | 22.66 | -1.497 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:3:0:CROSSWALK:WEST; ACCIDE |
| 15 | 175 | verified | 4 | 0 | 3 |  | 0 | -0.498 | 5 | PEDESTRIAN_PATIENCE pedestrian=PED:44:0:CROSSWALK:WEST remai |
| 16 | 176 | hold | 0 | 0 | 0 |  | 0 | -0.96 | 9 | PEDESTRIAN_PATIENCE pedestrian=PED:45:1:CROSSWALK:WEST remai |
| 17 | 181 | verified | 1 | 0 | 1 |  | 0 | -1.488 | 4 | PEDESTRIAN_PATIENCE pedestrian=PED:38:0:CROSSWALK:SOUTH rema |
| 18 | 184 | verified | 6 | 0 | 15 | INC0003 | 7.8 | -1.686 | 1 | PEDESTRIAN_PATIENCE pedestrian=PED:43:0:CROSSWALK:NORTH rema |
| 19 | 185 | verified | 2 | 0 | 8 | INC0002 | 3.53 | -0.708 | 4 | VEHICLE_RED_LIGHT vehicle=V00012 route=W_S1_STRAIGHT; VEHICL |
| 20 | 187 | hold | 0 | 0 | 0 |  | 0 | -6.324 | 2 | PEDESTRIAN_PATIENCE pedestrian=PED:45:0:CROSSWALK:EAST remai |
| 21 | 188 | hold | 0 | 0 | 0 |  | 0 | -1.282 | 1 | PEDESTRIAN_JAYWALK pedestrian=PED:20:0:CROSSWALK:NORTH; ACCI |
| 22 | 189 | hold | 0 | 0 | 0 |  | 0 | -5.292 | 10 | ACCIDENT_INTERRUPT incident=INC0003 secondary=true; ACCIDENT |
| 23 | 199 | unverified | 3 | 0 | 9 | INC0004 | 7.91 | -2.113 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:44:0:CROSSWALK:WEST |
| 24 | 200 | hold | 0 | 0 | 0 |  | 0 | 2.404 | 3 | PEDESTRIAN_JAYWALK pedestrian=PED:45:1:CROSSWALK:WEST |
| 25 | 201 | hold | 0 | 0 | 0 |  | 0 | -1.405 | 1 | PEDESTRIAN_PATIENCE pedestrian=PED:61:0:CROSSWALK:EAST remai |
| 26 | 202 | verified | 0 | 0 | 0 |  | 0 | 0.859 | 3 |  |
| 27 | 204 | hold | 0 | 0 | 0 |  | 0 | -3.05 | 2 | PEDESTRIAN_PATIENCE pedestrian=PED:68:0:CROSSWALK:NORTH rema |
| 28 | 206 | hold | 0 | 0 | 0 |  | 0 | -8.745 | 8 |  |
| 29 | 208 | verified | 4 | 0 | 12 | INC0005 | 6.35 | -2.976 | 4 | PEDESTRIAN_JAYWALK pedestrian=PED:43:0:CROSSWALK:NORTH; ACCI |
| 30 | 210 | hold | 0 | 0 | 0 |  | 0 | -1.834 | 8 | PEDESTRIAN_PATIENCE pedestrian=PED:62:0:CROSSWALK:NORTH rema |
| 31 | 211 | hold | 0 | 0 | 0 |  | 0 | -1.593 | 2 | PEDESTRIAN_JAYWALK pedestrian=PED:45:0:CROSSWALK:EAST; PEDES |
| 32 | 213 | hold | 0 | 0 | 0 |  | 0 | -3.007 | 7 |  |
| 33 | 215 | hold | 0 | 0 | 0 |  | 0 | -2.332 | 5 | ACCIDENT_INTERRUPT incident=INC0004 secondary=true |
| 34 | 220 | hold | 0 | 0 | 0 |  | 0 | -3.746 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:82:0:CROSSWALK:NORTH rema |
| 35 | 223 | hold | 0 | 0 | 0 |  | 0 | -2.075 | 8 | ACCIDENT_INTERRUPT incident=INC0005 locked=CROSSWALK:EAST:CE |
| 36 | 225 | hold | 0 | 0 | 0 |  | 0 | -3.792 | 5 | PEDESTRIAN_PATIENCE pedestrian=PED:81:0:CROSSWALK:WEST remai |
| 37 | 228 | hold | 0 | 0 | 0 |  | 0 | -5.087 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:68:0:CROSSWALK:NORTH |
| 38 | 233 | hold | 0 | 0 | 0 |  | 0 | -1.833 | 5 | PEDESTRIAN_PATIENCE pedestrian=PED:87:0:CROSSWALK:WEST remai |
| 39 | 234 | unverified | 1 | 0 | 2 |  | 0 | -2.193 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:62:0:CROSSWALK:NORTH |
| 40 | 236 | hold | 0 | 0 | 0 |  | 0 | -1.334 | 1 | PEDESTRIAN_PATIENCE pedestrian=PED:106:0:CROSSWALK:WEST rema |
| 41 | 237 | verified | 0 | 0 | 0 |  | 0 | -1.268 | 10 |  |
| 42 | 238 | hold | 0 | 0 | 0 |  | 0 | -1.274 | 1 | PEDESTRIAN_PATIENCE pedestrian=PED:95:0:CROSSWALK:SOUTH rema |
| 43 | 239 | unverified | 2 | 0 | 2 |  | 0 | -3.543 | 8 |  |
| 44 | 242 | hold | 0 | 0 | 0 |  | 0 | -2.477 | 2 | PEDESTRIAN_PATIENCE pedestrian=PED:113:0:CROSSWALK:WEST rema |
| 45 | 244 | hold | 0 | 0 | 0 |  | 0 | -7.051 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:101:0:CROSSWALK:WEST rema |
| 46 | 249 | hold | 0 | 0 | 0 |  | 0 | -4.304 | 6 | PEDESTRIAN_JAYWALK pedestrian=PED:81:0:CROSSWALK:WEST |
| 47 | 252 | hold | 0 | 0 | 0 |  | 0 | -5.5 | 4 | PEDESTRIAN_PATIENCE pedestrian=PED:119:0:CROSSWALK:WEST rema |
| 48 | 256 | hold | 0 | 0 | 0 |  | 0 | -2.158 | 5 |  |
| 49 | 257 | hold | 0 | 0 | 0 |  | 0 | -1.404 | 1 | PEDESTRIAN_JAYWALK pedestrian=PED:87:0:CROSSWALK:WEST |
| 50 | 258 | hold | 0 | 0 | 0 |  | 0 | -3.748 | 2 |  |
| 51 | 260 | hold | 0 | 0 | 0 |  | 0 | -1.361 | 1 | PEDESTRIAN_JAYWALK pedestrian=PED:106:0:CROSSWALK:WEST |

