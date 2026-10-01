# 运行分析：deepseek-flash_2026-10-01_114857254-73552

- 模型：deepseek-flash；种子 63916；规则版本 16；回放 schema 7
- 截止 tick 261，决策周期 54，最终余额 **748.3**
- 生成时间 2026-10-01T21:35:09.708Z；数据文件：replay_deepseek-flash_2026-10-01_114857254-73552.json、report_deepseek-flash_2026-10-01_114857254-73552.json、api-log_deepseek-flash_2026-10-01_114857254-73552.jsonl、raw-api-log_deepseek-flash_2026-10-01_114857254-73552.jsonl

## 1. 基础分析

### 1.1 上下文能力

- prompt tokens：平均 22307.5，P50 22869，P95 36993，最大 50748（n=185）
- completion tokens：平均 5480.2，P50 3860，P95 15124，最大 22200（n=185）；其中推理 tokens：平均 5277.8，P50 3762，P95 14934，最大 22011（n=185）
- 每周期 API 轮数：平均 3.4，P50 3，P95 5，最大 5（n=54）；上限 8，用满上限的周期 0 个
- 每次请求的平均字符数：系统提示 7722，user 15352.7，工具结果 3377.5，assistant 841.2；消息条数 平均 6.1，P50 6，P95 14，最大 17（n=185）
- 工具参数中的 ID 共 542 个：出现在当轮可见上下文里的占 1，当轮不可见但本局别处出现过 0 个，本局从未出现 0 个，非规范横道短键 0 个

| ID 类型 | 总数 | 当轮可见 | 别处出现 | 从未出现 | 非规范短键 |
| --- | --- | --- | --- | --- | --- |
| vehicle | 121 | 121 | 0 | 0 | 0 |
| lane | 271 | 271 | 0 | 0 | 0 |
| crosswalk | 109 | 109 | 0 | 0 | 0 |
| incident | 41 | 41 | 0 | 0 | 0 |

- 同一周期内重复提交已失败的相同调用：0 次 {}
- 提交类型：verified 18，unverified 4，hold 31；放行类提交中 verified 占 0.818
- working memory：调用 0 次 {}，观测里带有计划的周期 0 个

### 1.2 注意力分布

关注率 = 字段出现在该周期观测里、且推理文本提到它的周期数 / 字段出现的周期数。

| 概念 | 出现周期 | 提到且出现 | 关注率 | 提到周期（含未出现） | 提及次数 |
| --- | --- | --- | --- | --- | --- |
| crosswalks | 54 | 54 | 1 | 54 | 7806 |
| candidateConflicts | 54 | 54 | 1 | 54 | 1532 |
| pedestrianAlerts | 45 | 45 | 1 | 54 | 7599 |
| dischargingLanes | 23 | 23 | 1 | 33 | 534 |
| timeBudget | 54 | 52 | 0.963 | 52 | 177 |
| stoplineCandidates | 54 | 51 | 0.944 | 51 | 572 |
| stalledVehicles | 36 | 33 | 0.917 | 41 | 747 |
| emergency | 54 | 49 | 0.907 | 49 | 1002 |
| driverAlerts | 46 | 41 | 0.891 | 48 | 482 |
| recentCycles | 53 | 47 | 0.887 | 48 | 201 |
| revokedAdmissions | 20 | 16 | 0.8 | 27 | 210 |
| holds | 46 | 35 | 0.761 | 35 | 193 |
| lastSettlement | 53 | 40 | 0.755 | 41 | 90 |
| activeVehicleMotions | 50 | 34 | 0.68 | 34 | 93 |
| laneGuidance | 54 | 32 | 0.593 | 32 | 96 |
| laneMatrices | 0 | 0 |  | 54 | 1284 |
| exits | 0 | 0 |  | 52 | 3236 |
| reservedUntil | 0 | 0 |  | 54 | 1246 |
| incidentBlocked | 0 | 0 |  | 32 | 524 |
| workingMemory | 0 | 0 |  | 9 | 14 |

中断响应：

| 中断类型 | 次数 | 有响应 | 响应率 | 判定规则 |
| --- | --- | --- | --- | --- |
| PEDESTRIAN_PATIENCE | 28 | 11 | 0.393 | 同周期任一试算或提交带 pedestrian_phases |
| VEHICLE_TAILGATE | 1 | 1 | 1 | 推理文本提到了中断对象 ID |
| ACCIDENT_INTERRUPT | 8 | 8 | 1 | 同周期调用 inspect_incident / order_accident_clearance / set_lane_detour |
| PEDESTRIAN_JAYWALK | 15 | 6 | 0.4 | 推理文本提到了中断对象 ID |
| VEHICLE_RED_LIGHT | 4 | 4 | 1 | 推理文本提到了中断对象 ID |

- 每次回复的推理字符数：平均 19155.4，P50 13959，P95 53119，最大 76089（n=185）

### 1.3 tool_call 准确性

- 工具调用 298 次，成功 235 次，成功率 0.789
- 失败分类：{"LANE_HEAD_NOT_READY":20,"RESOURCE_CONFLICT":20,"DRY_RUN_QUOTA_EXHAUSTED":14,"TOOL_EXECUTION_ERROR":4,"PLANNING_HORIZON_EXCEEDED":3,"ROUTE_SEVERED":1,"SCHEMA_ERROR":1}
- 每次回复的工具调用数分布：{"1":129,"2":27,"3":12,"4":9,"5":6,"6":1,"8":1}；finish_reason：{"tool_calls":185}
- API 错误 0 次 {}；回退周期 [26]
- 从未使用的工具：manage_working_memory、set_lane_detour、reroute_queue_around_stall、guide_inbound_lane_change

| 工具 | 调用 | 成功 | 成功率 | 结果分类 |
| --- | --- | --- | --- | --- |
| dry_run_admit | 103 | 40 | 0.388 | {"OK":40,"TOOL_EXECUTION_ERROR":4,"LANE_HEAD_NOT_READY":20,"PLANNING_HORIZON_EXCEEDED":3,"DRY_RUN_QUOTA_EXHAUSTED":14,"RESOURCE_CONFLICT":20,"ROUTE_SEVERED":1,"SCHEMA_ERROR":1} |
| commit_schedule | 53 | 53 | 1 | {"OK":53} |
| dispatch_tow_truck | 8 | 8 | 1 | {"OK":8} |
| dispatch_emergency_convoy | 1 | 1 | 1 | {"OK":1} |
| inspect_crosswalk | 59 | 59 | 1 | {"OK":59} |
| inspect_lane_queue | 33 | 33 | 1 | {"OK":33} |
| inspect_incident | 24 | 24 | 1 | {"OK":24} |
| order_accident_clearance | 17 | 17 | 1 | {"OK":17} |

错误样例：

- **TOOL_EXECUTION_ERROR**
  - c5 t101 dry_run_admit：Admission plan exceeds 16 vehicles: 18；参数 `{"lane_batches":[{"lane_id":"IN_W_S1_STRAIGHT","top_n":6},{"lane_id":"IN_W_S2_STRAIGHT","top_n":6},{"lane_id":"IN_W_R1_RIGHT","top_n":3}],"candidate_vehicle_ids":["V00056","V00057","V00082"]}`
  - c7 t121 dry_run_admit：Admission plan exceeds 16 vehicles: 20；参数 `{"lane_batches":[{"lane_id":"IN_N_R1_RIGHT","top_n":6},{"lane_id":"IN_W_R1_RIGHT","top_n":6},{"lane_id":"IN_S_R1_RIGHT","top_n":3},{"lane_id":"IN_E_R1_RIGHT","top_n":5}]}`
  - c48 t244 dry_run_admit：Admission plan exceeds 16 vehicles: 19；参数 `{"lane_batches":[{"lane_id":"IN_N_R1_RIGHT","top_n":2},{"lane_id":"IN_N_S1_STRAIGHT","top_n":2},{"lane_id":"IN_N_S2_STRAIGHT","top_n":2},{"lane_id":"IN_S_L1_LEFT","top_n":2},{"lane_id":"IN_S_R1_RIGHT","top_n":3},{"lane_i`
- **LANE_HEAD_NOT_READY**
  - c9 t141 dry_run_admit：Lane head is not ready: IN_E_R1_RIGHT；参数 `{"lane_batches":[{"lane_id":"IN_S_L1_LEFT","top_n":8},{"lane_id":"IN_E_S1_STRAIGHT","top_n":6},{"lane_id":"IN_E_R1_RIGHT","top_n":4},{"lane_id":"IN_S_R1_RIGHT","top_n":2}]}`
  - c11 t146 dry_run_admit：Lane head is not ready: IN_N_R1_RIGHT；参数 `{"lane_batches":[{"lane_id":"IN_N_R1_RIGHT","top_n":3},{"lane_id":"IN_E_R1_RIGHT","top_n":1},{"lane_id":"IN_S_R1_RIGHT","top_n":1},{"lane_id":"IN_W_R1_RIGHT","top_n":1},{"lane_id":"IN_S_S2_STRAIGHT","top_n":2}]}`
  - c11 t146 dry_run_admit：Lane head is not ready: IN_S_S2_STRAIGHT；参数 `{"lane_batches":[{"lane_id":"IN_E_R1_RIGHT","top_n":1},{"lane_id":"IN_S_R1_RIGHT","top_n":1},{"lane_id":"IN_S_S2_STRAIGHT","top_n":2},{"lane_id":"IN_E_S1_STRAIGHT","top_n":2}]}`
- **PLANNING_HORIZON_EXCEEDED**
  - c9 t141 dry_run_admit：Admission planning horizon exceeded for V00093；参数 `{"lane_batches":[{"lane_id":"IN_S_L1_LEFT","top_n":8},{"lane_id":"IN_E_S1_STRAIGHT","top_n":6}]}`
  - c41 t236 dry_run_admit：Admission planning horizon exceeded for V00276；参数 `{"lane_batches":[{"lane_id":"IN_W_R1_RIGHT","top_n":8},{"lane_id":"IN_S_R1_RIGHT","top_n":6}]}`
  - c53 t259 dry_run_admit：Admission planning horizon exceeded for V00261；参数 `{"lane_batches":[{"lane_id":"IN_N_R1_RIGHT","top_n":8},{"lane_id":"IN_W_L1_LEFT","top_n":4},{"lane_id":"IN_S_S1_STRAIGHT","top_n":4}]}`
- **DRY_RUN_QUOTA_EXHAUSTED**
  - c9 t141 dry_run_admit：-；参数 `{"lane_batches":[{"lane_id":"IN_S_L1_LEFT","top_n":4},{"lane_id":"IN_E_S1_STRAIGHT","top_n":6}]}`
  - c15 t164 dry_run_admit：-；参数 `{"lane_batches":[{"lane_id":"IN_E_R1_RIGHT","top_n":3},{"lane_id":"IN_W_R1_RIGHT","top_n":2},{"lane_id":"IN_S_R1_RIGHT","top_n":1}]}`
  - c19 t177 dry_run_admit：-；参数 `{"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:WEST","directions":["A_TO_B","B_TO_A"]}]}`
- **RESOURCE_CONFLICT**
  - c12 t153 dry_run_admit：CROSSWALK:EAST:CELL:7:0 vs V00169；参数 `{"lane_batches":[{"lane_id":"IN_S_S1_STRAIGHT","top_n":6,"speed_profile":"CRUISE"}],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:EAST","directions":["B_TO_A"]}]}`
  - c14 t162 dry_run_admit：CROSSWALK:NORTH:CELL:0:0 vs V00096；参数 `{"candidate_vehicle_ids":["V00159","V00194"],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:WEST","directions":["A_TO_B"]},{"crosswalk_id":"CROSSWALK:NORTH","directions":["A_TO_B"]}]}`
  - c14 t162 dry_run_admit：CROSSWALK:WEST:CELL:0:0 vs V00061；参数 `{"candidate_vehicle_ids":["V00159","V00194"],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:WEST","directions":["A_TO_B"]}]}`
- **ROUTE_SEVERED**
  - c39 t233 dry_run_admit：none；参数 `{"lane_batches":[{"lane_id":"IN_S_L1_LEFT","top_n":6},{"lane_id":"IN_W_R1_RIGHT","top_n":6}],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:EAST","directions":["A_TO_B","B_TO_A"]},{"crosswalk_id":"CROSSWALK:NORTH","dire`
- **SCHEMA_ERROR**
  - c41 t236 dry_run_admit：[ { "code": "too_big", "maximum": 8, "type": "number", "inclusive": true, "exact": false, "message": "Number must be less than or equal to 8", "path": [ "lane_b；参数 `{"lane_batches":[{"lane_id":"IN_W_R1_RIGHT","top_n":9},{"lane_id":"IN_S_R1_RIGHT","top_n":6},{"lane_id":"IN_S_L1_LEFT","top_n":8}]}`

### 1.4 Agent 能力

- 周期内工具序列（D=试算，C=提交，T=其他工具）：{"DDC":10,"DC":5,"DDDC":4,"TTTTTDC":3,"TTDDDC":2,"TTTTTC":2,"DDDDC":2,"TTC":1,"TTDC":1,"DTDDC":1,"DTC":1,"TTTDDC":1,"TDC":1,"TTTDTTDTC":1,"TTTTDDDC":1,"TTTTTTTTTTDC":1,"TDDC":1,"TTTTTTTTTDDC":1,"TTTTDDC":1,"TTTTTTDDC":1,"TTTDDTTTTTTT":1,"TTTTTDTTTDC":1,"TTTC":1,"TTTTTDDC":1,"TTTTTDTDC":1,"TTTTTTTDDC":1,"TTTDDTC":1,"TTTTTDDTC":1,"TTTDTTDDC":1,"TTTDDDC":1,"DDTTDC":1,"DTTDC":1,"TDTDC":1}
- 含提交的周期里先试算再提交的比例：0.925
- 提交构成：{"verified":18,"unverified":4,"hold":31,"reckless":0}；每周期放行车数 平均 2.3，P50 0，P95 12，最大 16（n=54）；共放行 123 辆
- 成功提交 53 次，其中使用 lane_batches 14 次；每次 top_n 合计 平均 1.9，P50 0，P95 11，最大 16（n=53）
- 速度档位：{"CRUISE":31}；sleep_ticks：平均 7.1，P50 8，P95 10，最大 10（n=53） {"1":5,"3":4,"4":5,"5":5,"6":4,"8":5,"9":1,"10":24}
- 工具使用：{"dry_run_admit":103,"inspect_crosswalk":59,"commit_schedule":53,"inspect_lane_queue":33,"inspect_incident":24,"order_accident_clearance":17,"dispatch_tow_truck":8,"dispatch_emergency_convoy":1}
- 决策开销：API 185 次，扣 3.7；非终结工具 245 次，扣 0.3675

与同条件 baseline 对比：

| 策略 | 最终余额 | 放行车辆 | 未服务负债 | 事故数 | 锁格扣费 | 上游积压 | 撞人 | 闯红灯罚 | 行人奖励 | 校车 | 拖车 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| deepseek-flash | 748.3 | 123 | 189 | 4 | 27.46 | 47.72 | 15 | 8 | 0 | 0 | 9.6 |
| baseline-balanced | 674.49 | 84 | 219.6 | 6 | 21.3 | 58.85 | 25 | 5.5 | 0 | 0 | 8.4 |
| baseline-balanced-bus | 659.61 | 87 | 208.1 | 4 | 90.26 | 53.27 | 5 | 4.9 | 0 | 0 | 6 |
| baseline-balanced-no-ped | 717.59 | 132 | 187.4 | 4 | 74.39 | 47.7 | 0 | 0 | 0 | 10 | 10.8 |
| baseline-longest-queue | 633.99 | 183 | 195.7 | 10 | 76.09 | 44.92 | 50 | 11.6 | 0 | 10 | 10.8 |
| baseline-random | 539.49 | 114 | 207.6 | 7 | 139.2 | 73.82 | 35 | 11 | 0 | 0 | 7.2 |
| baseline-search | 788.38 | 122 | 185.4 | 2 | 3.69 | 45.85 | 10 | 6.7 | 0 | 0 | 8.4 |

## 2. 进阶分析

### 2.1 逻辑推理

- 试算失败（不含额度用完）49 次；之后再试 30 次，其中改了参数 30 次，成功 13 次（0.433）；失败所在周期最终 verified 提交 5 次、hold 35 次
- 推理中"路线 X 经过/不经过 Y 横道"的断言 325 条，正确 298，错误 27，准确率 0.917；前半局 9/57 错，后半局 18/268 错
  - c7：「N_S1_STRAIGHT (north straight, heading south) crosses the east」（实际经过 CROSSWALK:NORTH+CROSSWALK:SOUTH）
  - c9：「E_L1_LEFT (V00079) turning left would cross the N」（实际经过 CROSSWALK:EAST+CROSSWALK:SOUTH）
  - c9：「E_S1_STRAIGHT from East heading West would cross the south」（实际经过 CROSSWALK:EAST+CROSSWALK:WEST）
  - c9：「S_L1_LEFT, that's a left turn from S which would cross E」（实际经过 CROSSWALK:SOUTH+CROSSWALK:WEST）
  - c16：「S_R1_RIGHT turn right — they don't cross E」（实际经过 CROSSWALK:SOUTH+CROSSWALK:EAST）
  - c17：「S_R1_RIGHT cross the WEST」（实际经过 CROSSWALK:SOUTH+CROSSWALK:EAST）
  - c19：「S_R1_RIGHT: S inbound right turn — crosses WEST」（实际经过 CROSSWALK:SOUTH+CROSSWALK:EAST）
  - c25：「E_L1_LEFT cross WEST」（实际经过 CROSSWALK:EAST+CROSSWALK:SOUTH）
- 推理写"安全/无冲突"但同一轮试算冲突：16 次
  - c12 r1 t153：「 for straight would clear faster but "预约和事故检查覆盖完整 swept 资源" and BURST can't jump over vehicles/incidents/peds. Might be risky if queue overlaps. Default CRUISE is safe. Use CRUISE. Hmm, actually BURST only in CROSSING/EXIT_BLOCKED states. Entering is still 1/tick? "档位只在 CROSSING/EXIT_BLOCKED 生效". So entering is normal. BURST 」→ CROSSWALK:EAST:CELL:7:0 vs V00169
  - c14 r1 t162：「conflict with each other or others. Actually candidateConflicts only lists stopline heads same tick. V00159 and V00194 aren't listed in conflict pairs, meaning no conflict. Hmm wait, but they might conflict with movements crossing their paths (in-transit vehicles). The candidateConflictScope is limited. Let me think about dischar」→ CROSSWALK:NORTH:CELL:0:0 vs V00096
  - c18 r2 t176：「ally, this matters for pedestrian-vehicle conflicts. Let me not overthink. In these traffic-sim problems, releasing pedestrians during a matching vehicle phase is safe if the crosswalk isn't used by those vehicles. Hmm, but the incident locked CROSSWALK:NORTH cells. That means the accident (S_S2_STRAIGHT vehicles) is sitting 」→ CROSSWALK:WEST:CELL:0:0 vs V00101
  - c19 r3 t177：「o phase WEST too. If I phase WEST (A_TO_B and B_TO_A), the WEST pedestrians cross legally. That avoids jaywalk. Since we're not admitting W vehicles this tick, no conflict. Good. But hold on — will pedestrian phases conflict with the evac vehicles heading to OUT_NORTH? NORTH crosswalk pedestrians vs evac crossing? Possibly. dry_r」→ CROSSWALK:NORTH:CELL:5:0 vs INCIDENT
  - c22 r3 t184：「p NORTH. Keep V00155 + WEST + SOUTH. Actually, wait. Let me reconsider whether including the vehicle is risky. Let me think about V00155 N_R1_RIGHT. It's free. Should be fine. Let me retry. Actually, let me reconsider SOUTH crosswalk. Is there any vehicle conflict? S_R1_RIGHT vehicles crossing (V00194, V00204, V00231). Right turn fr」→ CROSSWALK:WEST:CELL:0:0 vs V00130
  - c24 r2 t188：「 W_S1, W_S2, W_R1). Hmm so each crosswalk conflicts with the corresponding approach's routes. Since W is stalled and its non-straight routes blocked, WEST peds are safe-ish. This is getting really involved. Let me simplify and take measured actions. Given the 8-round budget and 73 ticks, let me do cycles of sleep ~10. Cycle pl」→ CROSSWALK:WEST:CELL:0:0 vs PED:3:0:CROSSWALK:WEST
- 自我修正标记（Wait/Actually/Let me recheck…）：共 8526 次，每次回复 平均 46.1，P50 33，P95 138，最大 257（n=185）
- 认知模式 letterCounting：8 处
  - 「 Let me do: 1. dispatch_tow_truck(V00006) 2. dispatch_tow_truck(V00014) 3. commit_schedule(sleep_ticks=10, tactical_summary=...) Order: tows first. Hmm, one concern: the commit's tactical_summary max 300 chars. tactical_summary: "Cycle4 t91: all W/N/S heads + W exits blocked (reservations clear 96-101, exits 102). Towed stalled V00006(N_R1,11 behind) & V00014(S_R1,4). Sleep 10 to t101; next: West wave W_L1」
  - 「max sleep 10. So we can't sleep 40; with max 10 ticks per sleep and 4 rounds, we cover only 40 ticks of the 160. Hmm. Wait, that means we can't reach tick 261 within 8 rounds if each sleep is max 10. Let me recount: 8 rounds, each commit with sleep up to 10 = 80 ticks max. Starting tick 101, we'd reach 181 at most. But endTick is 261. Hmm. Wait, "你有 8 轮 API" — maybe means 8 rounds in this context? Or total? The」
  - 「s followers might already have started (wait_ticks). Let me just dispatch. OK, executing: dispatch_tow_truck(V00089), then commit_schedule(sleep_ticks=8). Let me write a concise tactical_summary (max 300 chars). Let me analyze the situation carefully. Current tick 177, end tick 261, 84 ticks remaining. Balance 989.82. Interrupt reason: ACCIDENT_INTERRUPT incident=INC0001 secondary=true. But recentCycles sh」
- 认知模式 idFormat：0 处

### 2.2 复杂环境博弈

**行人与车辆**

- 行人相位尝试 30 次，成功 9 次 {"RESOURCE_CONFLICT":15,"OK":9,"DRY_RUN_QUOTA_EXHAUSTED":3,"LANE_HEAD_NOT_READY":2,"ROUTE_SEVERED":1}
- 实际放行 3 批 5 人；闯红灯 15 次 15 人；被撞 3 人；奖励 0，扣费 {"delay":1.04,"jaywalk":8,"strike":15}

行人相位冲突样例：

| 周期 | tick | 冲突偏移 at | 冲突 |
| --- | --- | --- | --- |
| 12 | 153 | 0 | CROSSWALK:EAST:CELL:7:0 vs V00169 |
| 14 | 162 | 1 | CROSSWALK:NORTH:CELL:0:0 vs V00096 |
| 14 | 162 | 0 | CROSSWALK:WEST:CELL:0:0 vs V00061 |
| 18 | 176 | 0 | CROSSWALK:WEST:CELL:0:0 vs V00101 |
| 19 | 177 | 0 | CROSSWALK:NORTH:CELL:5:0 vs INCIDENT |
| 22 | 184 | 0 | CROSSWALK:NORTH:CELL:5:0 vs INCIDENT |
| 22 | 184 | 0 | CROSSWALK:WEST:CELL:0:0 vs V00130 |
| 24 | 188 | 0 | CROSSWALK:WEST:CELL:0:0 vs PED:3:0:CROSSWALK:WEST |
| 25 | 196 | 14 | CROSSWALK:SOUTH:CELL:3:0 vs V00079 |
| 26 | 201 | 12 | CROSSWALK:EAST:CELL:3:0 vs V00118 |

在行人耐心告急（PATIENCE_CRITICAL）时放行、且路线经过该横道的车辆：73 车次

| 周期 | tick | 车辆 | 路线 | 横道 | 行人 | 剩余耐心 | 该行人后来被撞 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 142 | V00141 | E_S1_STRAIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 24 |  |
| 10 | 142 | V00149 | E_S1_STRAIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 24 |  |
| 10 | 142 | V00164 | E_S1_STRAIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 24 |  |
| 11 | 146 | V00148 | E_R1_RIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 20 |  |
| 11 | 146 | V00169 | S_R1_RIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 20 |  |
| 13 | 158 | V00061 | N_R1_RIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 12 |  |
| 13 | 158 | V00096 | N_R1_RIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 12 |  |
| 13 | 158 | V00101 | N_R1_RIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 12 |  |
| 13 | 158 | V00107 | N_R1_RIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 12 |  |
| 14 | 162 | V00159 | E_R1_RIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 24 | 是 |
| 16 | 174 | V00045 | W_S2_STRAIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 0 |  |
| 16 | 174 | V00072 | W_S2_STRAIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 0 |  |
| 16 | 174 | V00087 | W_S2_STRAIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 0 |  |
| 16 | 174 | V00095 | W_S2_STRAIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 0 |  |
| 16 | 174 | V00066 | W_S1_STRAIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 0 |  |

行人时间线：

| tick | 事件 | 横道 | 人数 |
| --- | --- | --- | --- |
| 158 | PED_GRANT | CROSSWALK:EAST | 3 |
| 186 | PED_COLLISION | CROSSWALK:NORTH | 1 |
| 187 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 188 | PED_GRANT | CROSSWALK:WEST | 1 |
| 188 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 196 | PED_GRANT | CROSSWALK:WEST | 1 |
| 205 | PED_JAYWALK | CROSSWALK:SOUTH | 1 |
| 208 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 211 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 213 | PED_COLLISION | CROSSWALK:SOUTH | 1 |
| 225 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 228 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 234 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 241 | PED_JAYWALK | CROSSWALK:SOUTH | 1 |
| 241 | PED_JAYWALK | CROSSWALK:SOUTH | 1 |
| 244 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 244 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 248 | PED_COLLISION | CROSSWALK:WEST | 1 |
| 249 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 249 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 257 | PED_JAYWALK | CROSSWALK:WEST | 1 |

**事故处置**

| 事故 | 类型 | 发生 | 车辆 | 行人 | 首次响应 | 清障令 | 清障调用次数 | 关闭 | 事故后才放行、后来卷入 | 非模型放行（抢行） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| INC0001 | PILEUP | 176 | 5 | 0 | 176 | 176 | 8 | 208 |  | V00054 |
| INC0002 | ANGLE_COLLISION | 186 | 1 | 1 | 187 | 187 | 2 | 201 |  |  |
| INC0003 | PILEUP | 213 | 3 | 1 | 214 | 214 | 6 | 234 |  | V00062 V00038 |
| INC0004 | ANGLE_COLLISION | 248 | 1 | 1 | 249 | 249 | 1 |  |  |  |

事故成本估算：

| 事故 | 最终严重度 | 锁格（含二次） | 开放拍数 | 危化品 | 校车 | 分摊锁格费 | 估算总成本 | 放行来源 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| INC0001 | CRITICAL | 55 | 32 |  |  | 16.613 | 16.613 | V00049@c10 V00054@c- V00081@c12 V00170@c16 V00181@c16 |
| INC0002 | SERIOUS | 17 | 15 |  |  | 1.605 | 6.605 | V00155@c22 |
| INC0003 | CRITICAL | 33 | 21 |  |  | 6.541 | 11.541 | V00062@c- V00038@c- V00098@c25 |
| INC0004 | SERIOUS | 33 | 13 |  |  | 2.7 | 7.7 | V00129@c42 |

**司机抢行**

总计 {"redLight":4,"tailgate":1,"cutIn":2}

| 周期 | 类型 | 车辆 | 此前出现在 driverAlerts 的周期数 | 最后一次预警 | 卷入事故 |
| --- | --- | --- | --- | --- | --- |
| 15 | VEHICLE_TAILGATE | V00054 | 2 | IN_S_S2_STRAIGHT 距停止线 6 剩余 8 | INC0001 |
| 26 | VEHICLE_RED_LIGHT | V00062 | 1 | IN_N_S1_STRAIGHT 距停止线 0 剩余 0 | INC0003 |
| 26 | VEHICLE_RED_LIGHT | V00038 | 1 | IN_N_S2_STRAIGHT 距停止线 0 剩余 0 | INC0003 |
| 40 | VEHICLE_RED_LIGHT | V00040 | 9 | IN_S_L1_LEFT 距停止线 0 剩余 0 |  |
| 45 | VEHICLE_RED_LIGHT | V00067 | 8 | IN_S_L1_LEFT 距停止线 0 剩余 0 |  |

**紧急车辆与抛锚**

紧急车辆延误扣费 0.276

| 车辆 | 首次进入 12 格 | 放行 tick | 等待拍数 | 最长静止 |
| --- | --- | --- | --- | --- |
| V00034 | 71 | 168 | 97 | 93 |
| V00036 | 71 | 121 | 50 | 15 |
| V00050 | 71 | 89 | 18 | 0 |
| V00056 | 81 |  |  | 15 |
| V00043 | 121 | 130 | 9 | 0 |
| V00096 | 141 | 163 | 22 | 9 |
| V00101 | 146 | 168 | 22 | 12 |
| V00212 | 174 |  |  | 78 |
| V00235 | 247 |  |  | 14 |

拖车费 9.6，链式加价 0.563

| 车辆 | 车道 | 抛锚 | 派拖车 | 派车延迟 | 绕行 |
| --- | --- | --- | --- | --- | --- |
| V00006 | IN_N_R1_RIGHT | 64 | 91 | 27 |  |
| V00014 | IN_S_R1_RIGHT | 64 | 91 | 27 |  |
| V00068 | IN_N_L1_LEFT | 104 | 131 | 27 |  |
| V00029 | IN_W_S2_STRAIGHT | 123 | 131 | 8 |  |
| V00063 | IN_W_S1_STRAIGHT | 139 | 141 | 2 |  |
| V00122 | IN_W_R1_RIGHT | 159 | 188 | 29 |  |
| V00089 | IN_S_S1_STRAIGHT | 166 | 176 | 10 |  |
| V00099 | IN_W_S1_STRAIGHT | 187 | 188 | 1 |  |
| V00209 | IN_E_S1_STRAIGHT | 241 |  |  |  |

### 2.3 亮眼操作与最差操作

周期价值 = 未卷入事故的放行车数 + 1.5×放行行人 + 2×成功的特情工具 − 归因事故成本。事故成本按锁格×开放时长分摊本局真实锁格扣费，再加撞人和校车罚款，平均分给放行了涉事车辆的周期。这是用于挑选证据的启发式，不是精确账目。

亮点事件：

| tick | 周期 | 类型 | 说明 |
| --- | --- | --- | --- |
| 91 | 4 | TOW_DISPATCH | V00006 |
| 91 | 4 | TOW_DISPATCH | V00014 |
| 101 | 5 | LARGE_VERIFIED_RELEASE | 16 vehicles, blame=0 |
| 111 | 6 | LARGE_VERIFIED_RELEASE | 12 vehicles, blame=0 |
| 121 | 7 | LARGE_VERIFIED_RELEASE | 16 vehicles, blame=0 |
| 131 | 8 | TOW_DISPATCH | V00029 |
| 131 | 8 | TOW_DISPATCH | V00068 |
| 141 | 9 | TOW_DISPATCH | V00063 |
| 142 | 10 | EMERGENCY_CONVOY | V00034 on IN_S_L1_LEFT |
| 158 | 13 | PED_GRANT | CROSSWALK:EAST B_TO_A x3 |
| 176 | 18 | TOW_DISPATCH | V00089 |
| 188 | 24 | TOW_DISPATCH | V00099 |
| 188 | 24 | TOW_DISPATCH | V00122 |
| 188 | 24 | PED_GRANT | CROSSWALK:WEST B_TO_A x1 |
| 196 | 25 | PED_GRANT | CROSSWALK:WEST A_TO_B x1 |
| 220 | 36 | LANE_GUIDANCE | V00144 IN_S_S1_STRAIGHT->IN_S_R1_RIGHT |
| 241 | 46 | LANE_GUIDANCE | V00197 IN_S_S1_STRAIGHT->IN_S_R1_RIGHT |

#### 得分最高的周期

**周期 5（tick 101）**：放行 16，未出事 16，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -1.515，提交类型 verified，睡眠 10

- 观测要点：余额 996.02，停止线候选 14，受阻路线 0，行人预警 []，司机预警 []，紧急车 [V00034, V00036, V00056]，抛锚 [V00006, V00014]
- 工具序列：r1 dry_run_admit -> TOOL_EXECUTION_ERROR (Admission plan exceeds 16 vehicles: 18)；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 战术摘要：Cycle5 t101: West phase verified+committed — W_S1 top6, W_S2 top6, W_R1 + heads V00056(N_L1 emergency), V00057(N_S1), V00082(E_R1). Reward ~12.9. Platoon scheduled entering through ~135, clears ~155. Sleep 10 -> t111, then check dischargingLanes; next target S_L1 (emergency V00034 behind V00019) and
- 推理摘录：Let me analyze this traffic situation. Current tick 101, end tick 261, 160 ticks remaining. Let me look at the state. I need to maximize financial balance. Balance is 996.0181. Stopline candidates: East, North, South, West directions. Let me check blocked routes - none mentioned in this observation? There's no blockedRoutes field shown. exitHolds shows OUT_EAST_1, OUT_EAST_3, OUT_NORTH_1 blocked until tick 102. Current tick is 101, so they'll clear at 102. activeVehicleMotions: V00018 E_S1_STRAI …… rtunities list e.g. IN_S_L1_LEFT → IN_S_S2_STRAIGHT with eligible V00067 etc. Guiding those pre-positions them for a future S phase. But it's not clearly beneficial. Let me just commit and sleep 10. Actually, let me reduce thinking: commit the verified plan, sleep 10, tactical summary. Let me do it.

**周期 7（tick 121）**：放行 16，未出事 16，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -1.255，提交类型 verified，睡眠 10

- 观测要点：余额 992.7，停止线候选 11，受阻路线 7，行人预警 []，司机预警 []，紧急车 [V00034, V00036, V00043]，抛锚 [V00068]
- 工具序列：r1 dry_run_admit -> TOOL_EXECUTION_ERROR (Admission plan exceeds 16 vehicles: 20)；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 战术摘要：Cycle7 t121: All straights/lefts blocked (RESERVATION) until 145-153 while E/W straight platoons discharge. Admitted 4 right-turn lanes Top-N (16 veh, reward 11.5), incl emergency V00036 head of W_R1. Sleep 10 -> t131. Next: more right turns, then N/S phase when unblocked ~145-153.
- 推理摘录：Let me analyze this situation carefully. Current tick 121, end tick 261, 140 ticks remaining. Balance: 992.7037. Key observations: - Discharging lanes: E_S1, E_S2, W_S1, W_S2 all still discharging with nextEnterTick 124, clear around 152-157. So east-west straight platoons are already committed. - Blocked routes (RESERVATION): E_L1_LEFT (147), N_S1_STRAIGHT (153), N_S2_STRAIGHT (152), S_L1_LEFT (145), S_S1_STRAIGHT (148), S_S2_STRAIGHT (147), W_L1_LEFT (152). So we can't admit those now. They're ……  I use BURST speed profile for the right turns to clear faster? The dry run used CRUISE (default). Let me keep CRUISE to match. Actually I could re-dry-run with BURST but I only have this dry run result matching. Changing to BURST would require a new dry run. Not worth. Commit CRUISE. Let me commit.

**周期 6（tick 111）**：放行 12，未出事 12，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -1.8，提交类型 verified，睡眠 10

- 观测要点：余额 994.5，停止线候选 11，受阻路线 6，行人预警 []，司机预警 []，紧急车 [V00034, V00036]，抛锚 [V00068]
- 工具序列：r1 dry_run_admit -> ok；r2 commit_schedule -> ok
- 战术摘要：Cycle6 t111: East phase verified+committed — E_S1 top5 (incl truck V00024), E_S2 top6, +E_R1 head V00104. Reward 18.3. Platoon enters thru ~140, clears ~157. Sleep 10 -> t121. Next: W_R1 emergency V00036 unblocks ~122; S_L1 emergency V00034 stuck behind blocked S_L1 (unblock 145).
- 推理摘录：Let me analyze this traffic intersection situation carefully. Current state: - Tick 111, end 261, 150 ticks remaining - Balance: 994.5033 - West phase just committed, platoon entering through ~135, clears ~155 - dischargingLanes: IN_W_S1 (5 remaining, clear 153), IN_W_S2 (5 remaining, clear 152) Let me look at the stopline candidates and blocked routes. blockedRoutes (RESERVATION, can wait): - E_L1_LEFT: until 147 - N_S1_STRAIGHT: until 142 - N_S2_STRAIGHT: until 143 - S_L1_LEFT: until 145 - S_S …… I also handle pedestrians? All crosswalk waiting=0. No need. Let me commit. Actually, let me reconsider: is there benefit to committing now vs. doing more? The dry run succeeded. Commit with matching params: lane_batches E_S1 top5, E_S2 top6, admit_vehicle_ids ["V00104"]. Let me commit and sleep 10.

**周期 2（tick 71）**：放行 9，未出事 9，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -0.279，提交类型 verified，睡眠 10

- 观测要点：余额 999.89，停止线候选 10，受阻路线 3，行人预警 []，司机预警 []，紧急车 [V00034, V00036, V00050]，抛锚 [V00006, V00014]
- 工具序列：r1 dry_run_admit -> ok；r2 commit_schedule -> ok
- 战术摘要：Cycle2 t71: N-S axis - admit N_S1 Top4 (incl emergency V00050) + N_S2 Top3 + S_S1 Top1 + E_S1 Top1. No ped waiting. Sleep 10; reservation runs ~t106, next cycle continue N_S then switch to W.
- 推理摘录：Let me analyze this traffic control scenario carefully. Current state: - currentTick: 71, endTick: 261, ticksRemaining: 190 - financialBalance: 999.8905 - We have stoplineCandidates (10 vehicles) - blockedRoutes: E_L1_LEFT (until 74), E_R1_RIGHT (until 80), W_R1_RIGHT (until 82) - all RESERVATION - candidateConflicts listed - activeVehicleMotions: 5 vehicles crossing - emergencyAlerts: V00034 (in S_L1_LEFT, behind V00019, V00027), V00036 (in W_R1_RIGHT), V00050 (in N_S1_STRAIGHT, queueIndex 4) - ……  straight and N straight conflict. Then E_S1 conflicts S straight too? Maybe. Anyway, engine handled it. Let me commit. tactical_summary: "Cycle2 t71: admit N_S1 Top4 (incl emergency V00050) + N_S2 Top3 + S_S1 + E_S1, N-S axis; sleep 10; next cycle continue N-S then switch to W axis." Let me commit.

**周期 36（tick 220）**：放行 9，未出事 9，放行行人 0，耐心风险放行 9，归因成本 0，周期余额变化 -2.115，提交类型 verified，睡眠 8

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:82:0:CROSSWALK:NORTH remaining=24; PEDESTRIAN_PATIENCE pedestrian=PED:89:0:CROSSWALK:NORTH remaining=24
- 观测要点：余额 973.43，停止线候选 15，受阻路线 14，行人预警 [N:J0, N:J0, E:P5, N:P14, N:P8, S:P21, N:P24, S:P21, N:P24]，司机预警 [V00031:0, V00040:0, V00047:0, V00075:0, V00095:0, V00105:0, V00109:0, V00132:0]，紧急车 [V00212]，抛锚 []
- 工具序列：r1 inspect_incident -> ok；r1 inspect_crosswalk -> ok；r1 inspect_crosswalk -> ok；r2 dry_run_admit -> ok；r3 dry_run_admit -> ok；r4 order_accident_clearance -> ok；r4 commit_schedule -> ok
- 战术摘要：t220: INC0003 PILEUP clears ~234 (evac OUT_SOUTH_2 confirmed). Only clean axis = E-W through (WEST crosswalk jaywalker gone; EAST no jaywalker yet). Admitted E_S1/E_S2/W_S2 top-3 (9 cars, ~12.8). Kept NORTH crosswalk free for N-S-through after 234. Sleeping 8t (wake ~228) to keep lane discharge flow
- 推理摘录：Let me carefully analyze this situation. Current tick 220, end tick 261, 41 ticks remaining. Balance 973.43. Key issues: 1. INC0003 PILEUP incident blocking many routes (N/S through, E-left, W-right, etc.) until ~234. This is an INCIDENT blockKind, so we cannot admit those routes until the incident is CLOSED, not just until blockedUntilTick. 2. Jaywalkers on CROSSWALK:NORTH (PED:43 B_TO_A, PED:50 A_TO_B) and CROSSWALK:EAST (PED:61 patience 5). 3. Emergency vehicle V00212 in IN_E_R1_RIGHT behind  ……  match. I'll omit. Let me write: commit_schedule: lane_batches: [{lane_id: IN_E_S1_STRAIGHT, top_n: 3}, {lane_id: IN_E_S2_STRAIGHT, top_n: 3}, {lane_id: IN_W_S2_STRAIGHT, top_n: 3}] sleep_ticks: 8 tactical_summary: "..." And order_accident_clearance(INC0003, OUT_SOUTH_2) in same block. Let me do it.

#### 损失最大的周期

**周期 25（tick 196）**：放行 6，未出事 5，放行行人 0，耐心风险放行 6，归因成本 11.54，周期余额变化 4.212，提交类型 verified，睡眠 5

- 观测要点：余额 969.94，停止线候选 11，受阻路线 21，行人预警 [W:J0, S:P9, N:P12, W:P4, N:P15]，司机预警 [V00038:0, V00062:0, V00095:0, V00132:0, V00080:0, V00105:0, V00114:0, V00118:0]，紧急车 [V00212]，抛锚 [V00099, V00122]
- 工具序列：r1 inspect_incident -> ok；r1 inspect_incident -> ok；r2 order_accident_clearance -> ok；r2 order_accident_clearance -> ok；r2 inspect_crosswalk -> ok；r2 inspect_crosswalk -> ok；r3 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:SOUTH:CELL:3:0 vs V00079)；r4 dry_run_admit -> ok；r5 commit_schedule -> ok
- 后果：INC0003 PILEUP tick=213 vehicles=3 pedestrians=1 estCost=11.541
- 战术摘要：t196: Both incidents already evacuating (no_op same target; clear ~201 INC0002 / ~208 INC0001). Admitted E_L1_LEFT Top-6 (only open-route head) + WEST A_TO_B phase (PED:45). SOUTH phase skipped: conflicts E-left. Sleeping 5 to reach t201 when N routes open.
- 推理摘录：Let me analyze this situation carefully. Current tick 196, end tick 261. 65 ticks remaining. Balance 969.94. Two incidents: - INC0001: affects E routes (E_R1_GUIDED_STRAIGHT, E_R1_RIGHT, E_S1_GUIDED_RIGHT, E_S1_STRAIGHT, E_S2_GUIDED_LEFT, E_S2_STRAIGHT), N_L1_LEFT, N_S2_GUIDED_LEFT, S_L1_GUIDED_STRAIGHT, S_R1_GUIDED_STRAIGHT, S_S1_STRAIGHT, S_S2_STRAIGHT, W_L1_LEFT, W_S2_GUIDED_LEFT, W_S2_STRAIGHT. blockedUntilTick ~208-215. - INC0002: affects N_R1_GUIDED_STRAIGHT, N_R1_RIGHT, N_S1_GUIDED_RIGHT, …… ep less to commit sooner. Let me sleep 5 → 201, when N opens. Actually, hmm, at 201 the E-batch is mid-discharge. If I want to also catch W_S2 (opened 199) — but WEST phase blocks until 228. Ugh. Let me just sleep 5. Hmm, wait, actually maybe sleep 4 → 200, then commit. Eh, 5 is fine. Let me commit.

**周期 16（tick 174）**：放行 11，未出事 9，放行行人 0，耐心风险放行 11，归因成本 8.31，周期余额变化 -0.268，提交类型 verified，睡眠 10

- 观测要点：余额 992.31，停止线候选 13，受阻路线 4，行人预警 [N:P12, W:P0]，司机预警 [V00095:0, V00124:0, V00114:0, V00112:0, V00097:0, V00165:0, V00118:2, V00178:2]，紧急车 [V00212]，抛锚 [V00089, V00122]
- 工具序列：r1 dry_run_admit -> ok；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 后果：INC0001 PILEUP tick=176 vehicles=5 pedestrians=0 estCost=16.613
- 战术摘要：t174: E-W相位波，W_S2 Top4(含抢行司机V00095合法化)+W_S1 Top3+E_S1 Top2+E_R1 Top2，共11车。无行人冲突无tailgate。Sleep10→184，随后转N-S轴。
- 推理摘录：Let me analyze this situation carefully. Current tick 174, end 261, 87 ticks remaining. Balance 992.31. Let me look at the stopline candidates and blocked routes. Blocked routes (RESERVATION): - E_L1_LEFT blocked until 181 - E_S2_STRAIGHT blocked until 185 - S_R1_RIGHT blocked until 187 - W_L1_LEFT blocked until 180 Stopline candidates: - V00079 E_L1_LEFT (blocked until 181) - can't admit - V00181 E_R1_RIGHT - not blocked! route E_R1_RIGHT - V00170 E_S1_STRAIGHT - not blocked - V00191 E_S2_STRAI …… let me consider sleep 8 → tick 182? Hmm. Let me do sleep 10 to tick 184, then reassess. Wait, but commit executes the admittances at tick 174 (the current tick). Then sleep advances. So commit + sleep 10 → observations at tick 184. Let me commit. tactical_summary: describe E-W wave. Let me write it.

**周期 42（tick 237）**：放行 1，未出事 0，放行行人 0，耐心风险放行 5，归因成本 7.7，周期余额变化 -0.08，提交类型 unverified，睡眠 5

- 观测要点：余额 958.36，停止线候选 15，受阻路线 7，行人预警 [W:P23, N:J0, N:J0, E:J0, N:J0, N:J0, S:P4, W:P12, N:P7, S:P4, W:P20, N:P7, E:P12]，司机预警 [V00031:0, V00047:0, V00075:0, V00105:0, V00108:0, V00109:0, V00110:0, V00132:0]，紧急车 [V00212]，抛锚 []
- 工具序列：r1 dry_run_admit -> LANE_HEAD_NOT_READY (Lane head is not ready: IN_S_L1_LEFT)；r2 dry_run_admit -> ok；r3 inspect_lane_queue -> ok；r3 inspect_lane_queue -> ok；r4 dry_run_admit -> DRY_RUN_QUOTA_EXHAUSTED；r5 commit_schedule -> ok
- 后果：INC0004 ANGLE_COLLISION tick=248 vehicles=1 pedestrians=1 estCost=7.7
- 战术摘要：t237: Jaywalkers sever EAST+NORTH crosswalk routes; only W_R1_RIGHT (clean) & S_L1_LEFT admissible. Exits SOUTH/WEST held to 252. Admitted lone clean head V00129 via candidate (quota spent). Sleep 5 toward 242.
- 推理摘录：Let me analyze the situation carefully. Current tick 237, end tick 261. 24 ticks remaining. Balance 958.36. Key issues: - Several jaywalkers on NORTH and EAST crosswalks severing E and N approach routes. - Emergency vehicle V00212 in IN_E_R1_RIGHT, queueIndex 4, stationaryTicks 55, distanceToStopline 9. Behind V00192, V00201, V00210. It's costing 0.0015/tick emergency delay. - Blocked routes: E_L1_LEFT (til 237), N_R1_RIGHT (til 237), N_S1_STRAIGHT (245), N_S2_STRAIGHT (244), W_L1_LEFT (246), W_ …… p 5. Hmm, one more consideration: the emergency vehicle V00212. stationaryTicks 55, costing 0.0015/tick. Nothing to do (east severed). It stays until end. Fine. Also, the "hazard"/"exitLock" costs. Exit holds cost? exitHolds blockedUntil 252 — maybe a fee. Not our concern. OK commit V00129, sleep 5.

**周期 22（tick 184）**：放行 1，未出事 0，放行行人 0，耐心风险放行 5，归因成本 6.61，周期余额变化 -8.004，提交类型 unverified，睡眠 6

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:43:0:CROSSWALK:NORTH remaining=24
- 观测要点：余额 985.96，停止线候选 10，受阻路线 18，行人预警 [N:P2, W:P0, S:P21, N:P24, W:P15, W:P16]，司机预警 [V00080:0, V00105:0, V00118:0, V00126:0, V00124:0, V00114:0, V00112:0, V00140:0]，紧急车 [V00212]，抛锚 [V00089, V00122]
- 工具序列：r1 inspect_incident -> ok；r2 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:NORTH:CELL:5:0 vs INCIDENT)；r3 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:WEST:CELL:0:0 vs V00130)；r4 commit_schedule -> ok
- 后果：INC0002 ANGLE_COLLISION tick=186 vehicles=1 pedestrians=1 estCost=6.605
- 战术摘要：t184: INC0001 PILEUP still OPEN (est clear ~208). NORTH xwalk cells incident-locked; WEST xwalk conflicts with active V00130 (N_R1_RIGHT). Only free head = V00155 (N_R1_RIGHT) -> admit to keep right-turn flow + suppress WEST jaywalk. Sleep 6 -> 190; reassess WEST ped phase after V00130 clears and ex
- 推理摘录：Let me analyze this situation carefully. We're at tick 184, end tick 261. 77 ticks remaining. Balance 985.9591. There's a major incident INC0001 which severed many routes. Let me look at blockedRoutes: - Many routes blocked by INC0001 until tick 208 (INCIDENT - cannot admit until incident CLOSED) - E_L1_LEFT RESERVATION until 201 - N_S1_STRAIGHT RESERVATION until 196 - N_S2_STRAIGHT RESERVATION until 202 - S_L1_LEFT RESERVATION until 197 The incident is still OPEN (est clear ~208 per recent cycl …… way. I'll include V00155. Final: commit_schedule(admit_vehicle_ids=["V00155"], sleep_ticks=6, tactical_summary=...). Wait, one more consideration: does committing V00155 (unverified) risk being treated as an invalid plan and rejected with cost? Just api cost. Fine. Let me write the tactical summary.

**周期 10（tick 142）**：放行 5，未出事 4，放行行人 0，耐心风险放行 3，归因成本 4.15，周期余额变化 2.949，提交类型 verified，睡眠 10

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:11:0:CROSSWALK:EAST remaining=24
- 观测要点：余额 985.98，停止线候选 8，受阻路线 4，行人预警 [E:P24]，司机预警 [V00097:10, V00095:11, V00112:11]，紧急车 [V00034, V00096]，抛锚 [V00029, V00063, V00068]
- 工具序列：r1 dry_run_admit -> ok；r2 dispatch_emergency_convoy -> ok；r2 commit_schedule -> ok
- 后果：INC0001 PILEUP tick=176 vehicles=5 pedestrians=0 estCost=16.613
- 战术摘要：Cycle10 t142: Dry-run verified E_S1 Top-3 + S_S2 Top-2 (1.4, no jaywalker/tailgate). S_L1/S_S1/N_S1/N_S2/W_L1 were RESERVATION-blocked. Dispatched emergency convoy for V00034 (stationary 73t, cost 0.0015/t) clearing S_L1. Sleep 10 -> t152 when N_S2/W_L1/N_S1 unblock. Next: serve N+W and EAST crosswa
- 推理摘录：Let me analyze the situation carefully. Current tick 142, endTick 261, 119 ticks remaining. Balance 985.98. Let me look at the state. **stoplineCandidates:** - V00079 passenger 1, IN_E_L1_LEFT, waiting 44, route E_L1_LEFT - V00141 van 8, IN_E_S1_STRAIGHT, waiting 14, route E_S1_STRAIGHT - V00062 passenger 1, IN_N_S1_STRAIGHT, waiting 52, route N_S1_STRAIGHT (blocked until 153 RESERVATION) - V00038 passenger 1, IN_N_S2_STRAIGHT, waiting 65, route N_S2_STRAIGHT (blocked until 152) - V00019 truck 1 …… aring_route_id because front car must lane change", then I'd have wanted to know before commit. But the commit is independent and still beneficial. OK parallel. commit_schedule params: lane_batches same, admit_vehicle_ids [], vehicle_speed_profiles [], sleep_ticks 10, tactical_summary. Let me write.

### 附：逐周期一览

| 周期 | tick | 提交 | 放行 | 行人 | 耐心风险 | 归因事故 | 归因成本 | 余额变化 | 睡眠 | 唤醒原因 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 61 | verified | 6 | 0 | 0 |  | 0 | -0.11 | 10 |  |
| 2 | 71 | verified | 9 | 0 | 0 |  | 0 | -0.279 | 10 |  |
| 3 | 81 | verified | 3 | 0 | 0 |  | 0 | -0.438 | 10 |  |
| 4 | 91 | hold | 0 | 0 | 0 |  | 0 | -3.156 | 10 |  |
| 5 | 101 | verified | 16 | 0 | 0 |  | 0 | -1.515 | 10 |  |
| 6 | 111 | verified | 12 | 0 | 0 |  | 0 | -1.8 | 10 |  |
| 7 | 121 | verified | 16 | 0 | 0 |  | 0 | -1.255 | 10 |  |
| 8 | 131 | verified | 3 | 0 | 0 |  | 0 | -4.053 | 10 |  |
| 9 | 141 | hold | 0 | 0 | 0 |  | 0 | -1.417 | 8 |  |
| 10 | 142 | verified | 5 | 0 | 3 | INC0001 | 4.15 | 2.949 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:11:0:CROSSWALK:EAST remai |
| 11 | 146 | unverified | 2 | 0 | 2 |  | 0 | -1.088 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:3:0:CROSSWALK:WEST remain |
| 12 | 153 | verified | 6 | 0 | 0 | INC0001 | 4.15 | -1.24 | 5 | PEDESTRIAN_PATIENCE pedestrian=PED:24:0:CROSSWALK:EAST remai |
| 13 | 158 | verified | 4 | 0 | 4 |  | 0 | -0.992 | 10 |  |
| 14 | 162 | unverified | 2 | 0 | 1 |  | 0 | 7.637 | 8 | PEDESTRIAN_PATIENCE pedestrian=PED:20:0:CROSSWALK:NORTH rema |
| 15 | 164 | hold | 0 | 0 | 0 |  | 0 | -0.934 | 10 | VEHICLE_TAILGATE vehicle=V00054 route=S_S2_STRAIGHT |
| 16 | 174 | verified | 11 | 0 | 11 | INC0001 | 8.31 | -0.268 | 10 |  |
| 17 | 175 | verified | 2 | 0 | 0 |  | 0 | -0.375 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:44:0:CROSSWALK:WEST remai |
| 18 | 176 | hold | 0 | 0 | 0 |  | 0 | -1.844 | 8 | PEDESTRIAN_PATIENCE pedestrian=PED:45:1:CROSSWALK:WEST remai |
| 19 | 177 | hold | 0 | 0 | 0 |  | 0 | -0.161 | 10 | ACCIDENT_INTERRUPT incident=INC0001 secondary=true |
| 20 | 179 | verified | 1 | 0 | 4 |  | 0 | -1.678 | 10 | ACCIDENT_INTERRUPT incident=INC0001 secondary=true |
| 21 | 181 | hold | 0 | 0 | 0 |  | 0 | -2.023 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:38:0:CROSSWALK:SOUTH rema |
| 22 | 184 | unverified | 1 | 0 | 5 | INC0002 | 6.61 | -8.004 | 6 | PEDESTRIAN_PATIENCE pedestrian=PED:43:0:CROSSWALK:NORTH rema |
| 23 | 187 | hold | 0 | 0 | 0 |  | 0 | -1.548 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:50:0:CROSSWALK:NORTH rema |
| 24 | 188 | verified | 0 | 0 | 0 |  | 0 | -6.468 | 8 | PEDESTRIAN_JAYWALK pedestrian=PED:3:0:CROSSWALK:WEST |
| 25 | 196 | verified | 6 | 0 | 6 | INC0003 | 11.54 | 4.212 | 5 |  |
| 26 | 201 | fallback | 0 | 0 | 0 |  | 0 | -0.619 | 1 | PEDESTRIAN_PATIENCE pedestrian=PED:61:0:CROSSWALK:EAST remai |
| 27 | 202 | hold | 0 | 0 | 0 |  | 0 | 2.256 | 6 |  |
| 28 | 204 | hold | 0 | 0 | 0 |  | 0 | -1.67 | 5 | PEDESTRIAN_PATIENCE pedestrian=PED:68:0:CROSSWALK:NORTH rema |
| 29 | 205 | hold | 0 | 0 | 0 |  | 0 | -0.86 | 3 | PEDESTRIAN_JAYWALK pedestrian=PED:38:0:CROSSWALK:SOUTH |
| 30 | 208 | hold | 0 | 0 | 0 |  | 0 | 3.144 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:43:0:CROSSWALK:NORTH |
| 31 | 210 | hold | 0 | 0 | 0 |  | 0 | -1.054 | 1 | PEDESTRIAN_PATIENCE pedestrian=PED:62:0:CROSSWALK:NORTH rema |
| 32 | 211 | hold | 0 | 0 | 0 |  | 0 | 2.68 | 5 | PEDESTRIAN_JAYWALK pedestrian=PED:50:0:CROSSWALK:NORTH |
| 33 | 214 | hold | 0 | 0 | 0 |  | 0 | -0.998 | 3 | ACCIDENT_INTERRUPT incident=INC0003 locked=CROSSWALK:SOUTH:C |
| 34 | 215 | verified | 3 | 0 | 3 |  | 0 | -1.898 | 3 | ACCIDENT_INTERRUPT incident=INC0003 secondary=true |
| 35 | 217 | hold | 0 | 0 | 0 |  | 0 | -1.697 | 3 | PEDESTRIAN_PATIENCE pedestrian=PED:80:0:CROSSWALK:SOUTH rema |
| 36 | 220 | verified | 9 | 0 | 9 |  | 0 | -2.115 | 8 | PEDESTRIAN_PATIENCE pedestrian=PED:82:0:CROSSWALK:NORTH rema |
| 37 | 225 | hold | 0 | 0 | 0 |  | 0 | -4.042 | 9 | PEDESTRIAN_PATIENCE pedestrian=PED:81:0:CROSSWALK:WEST remai |
| 38 | 228 | hold | 0 | 0 | 0 |  | 0 | -4.59 | 6 | PEDESTRIAN_JAYWALK pedestrian=PED:68:0:CROSSWALK:NORTH |
| 39 | 233 | hold | 0 | 0 | 0 |  | 0 | -1.599 | 1 | PEDESTRIAN_PATIENCE pedestrian=PED:87:0:CROSSWALK:WEST remai |
| 40 | 234 | hold | 0 | 0 | 0 |  | 0 | -1.655 | 4 | PEDESTRIAN_JAYWALK pedestrian=PED:62:0:CROSSWALK:NORTH; VEHI |
| 41 | 236 | hold | 0 | 0 | 0 |  | 0 | -1.073 | 1 | PEDESTRIAN_PATIENCE pedestrian=PED:106:0:CROSSWALK:WEST rema |
| 42 | 237 | unverified | 1 | 0 | 5 | INC0004 | 7.7 | -0.08 | 5 |  |
| 43 | 238 | verified | 5 | 0 | 20 |  | 0 | -1.037 | 4 | PEDESTRIAN_PATIENCE pedestrian=PED:95:0:CROSSWALK:SOUTH rema |
| 44 | 239 | hold | 0 | 0 | 0 |  | 0 | -0.958 | 4 | PEDESTRIAN_PATIENCE pedestrian=PED:91:0:CROSSWALK:EAST remai |
| 45 | 240 | hold | 0 | 0 | 0 |  | 0 | -1.755 | 4 | VEHICLE_RED_LIGHT vehicle=V00067 route=S_L1_LEFT |
| 46 | 241 | hold | 0 | 0 | 0 |  | 0 | -1.053 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:80:0:CROSSWALK:SOUTH; PEDE |
| 47 | 242 | hold | 0 | 0 | 0 |  | 0 | -2.722 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:113:0:CROSSWALK:WEST rema |
| 48 | 244 | hold | 0 | 0 | 0 |  | 0 | -2.236 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:98:0:CROSSWALK:NORTH rema |
| 49 | 247 | hold | 0 | 0 | 0 |  | 0 | -8.207 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:115:0:CROSSWALK:EAST rema |
| 50 | 249 | hold | 0 | 0 | 0 |  | 0 | -3.717 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:81:0:CROSSWALK:WEST; PEDES |
| 51 | 252 | hold | 0 | 0 | 0 |  | 0 | -6.817 | 6 | PEDESTRIAN_PATIENCE pedestrian=PED:119:0:CROSSWALK:WEST rema |
| 52 | 257 | hold | 0 | 0 | 0 |  | 0 | -2.812 | 4 | PEDESTRIAN_JAYWALK pedestrian=PED:87:0:CROSSWALK:WEST |
| 53 | 259 | hold | 0 | 0 | 0 |  | 0 | -1.54 | 1 | PEDESTRIAN_PATIENCE pedestrian=PED:111:0:CROSSWALK:NORTH rem |
| 54 | 260 | hold | 0 | 0 | 0 |  | 0 | -1.526 | 1 |  |

