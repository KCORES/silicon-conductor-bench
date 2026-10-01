# 运行分析：step-5-preview_2026-10-01_152857185-51224

- 模型：step-5-preview；种子 63916；规则版本 16；回放 schema 7
- 截止 tick 261，决策周期 61，最终余额 **601.99**
- 生成时间 2026-10-01T21:35:35.570Z；数据文件：replay_step-5-preview_2026-10-01_152857185-51224.json、report_step-5-preview_2026-10-01_152857185-51224.json、api-log_step-5-preview_2026-10-01_152857185-51224.jsonl、raw-api-log_step-5-preview_2026-10-01_152857185-51224.jsonl

## 1. 基础分析

### 1.1 上下文能力

- prompt tokens：平均 22753.6，P50 24279，P95 37112，最大 61966（n=177）
- completion tokens：平均 6588.7，P50 5316，P95 16384，最大 16384（n=177）；其中推理 tokens：平均 0，P50 0，P95 0，最大 0（n=177）
- 每周期 API 轮数：平均 2.9，P50 3，P95 5，最大 6（n=61）；上限 8，用满上限的周期 0 个
- 每次请求的平均字符数：系统提示 7732.8，user 15156，工具结果 1879.8，assistant 596.8；消息条数 平均 4.9，P50 4，P95 11，最大 16（n=178）
- 工具参数中的 ID 共 396 个：出现在当轮可见上下文里的占 1，当轮不可见但本局别处出现过 0 个，本局从未出现 0 个，非规范横道短键 0 个

| ID 类型 | 总数 | 当轮可见 | 别处出现 | 从未出现 | 非规范短键 |
| --- | --- | --- | --- | --- | --- |
| lane | 206 | 206 | 0 | 0 | 0 |
| vehicle | 78 | 78 | 0 | 0 | 0 |
| crosswalk | 67 | 67 | 0 | 0 | 0 |
| incident | 45 | 45 | 0 | 0 | 0 |

- 同一周期内重复提交已失败的相同调用：0 次 {}
- 提交类型：verified 16，unverified 4，hold 31；放行类提交中 verified 占 0.8
- working memory：调用 1 次 {"SAVE_PLAN":1}，观测里带有计划的周期 0 个

### 1.2 注意力分布

关注率 = 字段出现在该周期观测里、且推理文本提到它的周期数 / 字段出现的周期数。

| 概念 | 出现周期 | 提到且出现 | 关注率 | 提到周期（含未出现） | 提及次数 |
| --- | --- | --- | --- | --- | --- |
| stalledVehicles | 26 | 26 | 1 | 50 | 987 |
| crosswalks | 61 | 60 | 0.984 | 60 | 6125 |
| candidateConflicts | 61 | 60 | 0.984 | 60 | 2211 |
| pedestrianAlerts | 49 | 48 | 0.98 | 60 | 8371 |
| activeVehicleMotions | 56 | 54 | 0.964 | 55 | 239 |
| dischargingLanes | 22 | 21 | 0.955 | 47 | 454 |
| stoplineCandidates | 61 | 58 | 0.951 | 58 | 509 |
| timeBudget | 61 | 58 | 0.951 | 58 | 311 |
| emergency | 61 | 57 | 0.934 | 57 | 1676 |
| driverAlerts | 52 | 48 | 0.923 | 56 | 1287 |
| revokedAdmissions | 20 | 18 | 0.9 | 34 | 375 |
| recentCycles | 60 | 53 | 0.883 | 53 | 304 |
| lastSettlement | 60 | 51 | 0.85 | 52 | 212 |
| holds | 48 | 39 | 0.813 | 40 | 264 |
| laneGuidance | 61 | 44 | 0.721 | 44 | 218 |
| laneMatrices | 0 | 0 |  | 60 | 1637 |
| exits | 0 | 0 |  | 58 | 4179 |
| reservedUntil | 0 | 0 |  | 60 | 1992 |
| incidentBlocked | 0 | 0 |  | 36 | 348 |
| workingMemory | 0 | 0 |  | 18 | 39 |

中断响应：

| 中断类型 | 次数 | 有响应 | 响应率 | 判定规则 |
| --- | --- | --- | --- | --- |
| VEHICLE_RED_LIGHT | 2 | 2 | 1 | 推理文本提到了中断对象 ID |
| PEDESTRIAN_PATIENCE | 28 | 10 | 0.357 | 同周期任一试算或提交带 pedestrian_phases |
| ACCIDENT_INTERRUPT | 11 | 9 | 0.818 | 同周期调用 inspect_incident / order_accident_clearance / set_lane_detour |
| PEDESTRIAN_JAYWALK | 18 | 9 | 0.5 | 推理文本提到了中断对象 ID |
| VEHICLE_TAILGATE | 1 | 1 | 1 | 推理文本提到了中断对象 ID |

- 每次回复的推理字符数：平均 22854，P50 19681，P95 58100，最大 61647（n=177）

### 1.3 tool_call 准确性

- 工具调用 201 次，成功 147 次，成功率 0.731
- 失败分类：{"RESOURCE_CONFLICT":27,"DRY_RUN_QUOTA_EXHAUSTED":12,"PLANNING_HORIZON_EXCEEDED":8,"LANE_HEAD_NOT_READY":3,"SCHEMA_ERROR":3,"UNKNOWN_ID":1}
- 每次回复的工具调用数分布：{"0":25,"1":119,"2":22,"3":7,"4":2,"5":2}；finish_reason：{"tool_calls":152,"length":21,"stop":4}
- API 错误 1 次 {"Request timed out.":1}；回退周期 [3,6,12,30,35,39,42,47,52,60]
- 从未使用的工具：set_lane_detour、dispatch_emergency_convoy、guide_inbound_lane_change

| 工具 | 调用 | 成功 | 成功率 | 结果分类 |
| --- | --- | --- | --- | --- |
| dry_run_admit | 86 | 35 | 0.407 | {"OK":35,"RESOURCE_CONFLICT":27,"LANE_HEAD_NOT_READY":3,"DRY_RUN_QUOTA_EXHAUSTED":12,"SCHEMA_ERROR":1,"PLANNING_HORIZON_EXCEEDED":8} |
| commit_schedule | 52 | 51 | 0.981 | {"OK":51,"SCHEMA_ERROR":1} |
| reroute_queue_around_stall | 1 | 1 | 1 | {"OK":1} |
| dispatch_tow_truck | 7 | 7 | 1 | {"OK":7} |
| inspect_incident | 24 | 24 | 1 | {"OK":24} |
| order_accident_clearance | 21 | 21 | 1 | {"OK":21} |
| inspect_crosswalk | 2 | 2 | 1 | {"OK":2} |
| manage_working_memory | 1 | 0 | 0 | {"SCHEMA_ERROR":1} |
| inspect_lane_queue | 6 | 6 | 1 | {"OK":6} |
| deprecated | 1 | 0 | 0 | {"UNKNOWN_ID":1} |

错误样例：

- **RESOURCE_CONFLICT**
  - c9 t119 dry_run_admit：CROSSWALK:WEST:CELL:1:0 vs V00042；参数 `{"lane_batches":[{"lane_id":"IN_E_R1_RIGHT","top_n":3}],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:WEST","directions":["A_TO_B"]}]}`
  - c13 t142 dry_run_admit：CROSSWALK:NORTH:CELL:0:0 vs V00017；参数 `{"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:EAST","directions":["B_TO_A"]},{"crosswalk_id":"CROSSWALK:NORTH","directions":["A_TO_B"]},{"crosswalk_id":"CROSSWALK:WEST","directions":["A_TO_B"]}]}`
  - c13 t142 dry_run_admit：CROSSWALK:WEST:CELL:0:0 vs V00017；参数 `{"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:EAST","directions":["B_TO_A"]},{"crosswalk_id":"CROSSWALK:WEST","directions":["A_TO_B"]}]}`
- **LANE_HEAD_NOT_READY**
  - c11 t139 dry_run_admit：Lane head is not ready: IN_N_R1_RIGHT；参数 `{"lane_batches":[{"lane_id":"IN_N_S1_STRAIGHT","top_n":3},{"lane_id":"IN_N_S2_STRAIGHT","top_n":3},{"lane_id":"IN_E_R1_RIGHT","top_n":2},{"lane_id":"IN_W_R1_RIGHT","top_n":2},{"lane_id":"IN_N_R1_RIGHT","top_n":1}]}`
  - c24 t181 dry_run_admit：Lane head is not ready: IN_S_S2_STRAIGHT；参数 `{"lane_batches":[{"lane_id":"IN_S_R1_RIGHT","top_n":2},{"lane_id":"IN_S_S2_STRAIGHT","top_n":2}],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:SOUTH","directions":["A_TO_B"]},{"crosswalk_id":"CROSSWALK:NORTH","directio`
  - c47 t233 dry_run_admit：Lane head is not ready: IN_W_L1_LEFT；参数 `{"lane_batches":[{"lane_id":"IN_W_L1_LEFT","top_n":8,"speed_profile":"CRUISE"},{"lane_id":"IN_W_S1_STRAIGHT","top_n":8,"speed_profile":"CRUISE"}]}`
- **DRY_RUN_QUOTA_EXHAUSTED**
  - c13 t142 dry_run_admit：-；参数 `{"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:EAST","directions":["B_TO_A"]}]}`
  - c16 t149 dry_run_admit：-；参数 `{"candidate_vehicle_ids":["V00079","V00148","V00028","V00084"]}`
  - c20 t162 dry_run_admit：-；参数 `{"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:SOUTH","directions":["A_TO_B"]}]}`
- **SCHEMA_ERROR**
  - c24 t181 dry_run_admit：[ { "code": "invalid_type", "expected": "array", "received": "string", "path": [ "pedestrian_phases" ], "message": "Expected array, received string" } ]；参数 `{"lane_batches":[{"lane_id":"IN_S_R1_RIGHT","top_n":3}],"pedestrian_phases":"[{\"crosswalk_id\": \"CROSSWALK:SOUTH\", \"directions\": [\"A_TO_B\"]}"}`
  - c28 t197 commit_schedule：[ { "code": "invalid_type", "expected": "number", "received": "undefined", "path": [ "lane_batches", 0, "top_n" ], "message": "Required" }, { "code": "invalid_t；参数 `{"admit_vehicle_ids":[],"lane_batches":[{"lane_id":"IN_E_L1_LEFT"},{"lane_id":"IN_E_R1_RIGHT"},{"lane_id":"IN_E_S1_STRAIGHT"},{"lane_id":"IN_E_S2_STRAIGHT"}],"pedestrian_phases":[],"vehicle_speed_profiles":[],"sleep_tick`
  - c32 t204 manage_working_memory：[ { "code": "too_big", "maximum": 160, "type": "string", "inclusive": true, "exact": false, "message": "String must contain at most 160 character(s)", "path": [；参数 `{"action":"SAVE_PLAN","plan_data":{"intended_duration":55,"phase_name":"PED_RESET_WINDOW","resume_condition":"at tick 207: release EAST B_TO_A + NORTH A_TO_B/B_TO_A ped phases before patience expires; then sleep until S_`
- **PLANNING_HORIZON_EXCEEDED**
  - c28 t197 dry_run_admit：Admission planning horizon exceeded for V00171；参数 `{"lane_batches":[{"lane_id":"IN_E_L1_LEFT","top_n":8},{"lane_id":"IN_E_R1_RIGHT","top_n":8},{"lane_id":"IN_E_S1_STRAIGHT","top_n":8},{"lane_id":"IN_E_S2_STRAIGHT","top_n":8}]}`
  - c30 t200 dry_run_admit：Admission planning horizon exceeded for V00112；参数 `{"candidate_vehicle_ids":["V00204"],"lane_batches":[{"lane_id":"IN_S_L1_LEFT","top_n":4}]}`
  - c41 t220 dry_run_admit：Admission planning horizon exceeded for V00168；参数 `{"lane_batches":[{"lane_id":"IN_W_L1_LEFT","top_n":8},{"lane_id":"IN_E_R1_RIGHT","top_n":8}]}`
- **UNKNOWN_ID**
  - c55 t246 deprecated：Unknown tool: deprecated；参数 `{"name":"dry_run_admit</dry_run"}`

### 1.4 Agent 能力

- 周期内工具序列（D=试算，C=提交，T=其他工具）：{"DC":11,"(none)":8,"DDC":8,"DDDC":6,"C":5,"TTTDDC":3,"DTC":1,"TDTDDC":1,"TDTC":1,"TTTDC":1,"TTC":1,"TTDTC":1,"TDDDDC":1,"CDC":1,"DDD":1,"DDDTC":1,"TDTDC":1,"TTDTTC":1,"TTDDTTTTTC":1,"TTTTTTTC":1,"D":1,"DTTDC":1,"TTTTDDDC":1,"DTTTTDTTDC":1,"TDTTDTTC":1,"TTDC":1}
- 含提交的周期里先试算再提交的比例：0.863
- 提交构成：{"verified":16,"unverified":4,"hold":31,"reckless":0}；每周期放行车数 平均 1.9，P50 0，P95 8，最大 14（n=61）；共放行 116 辆
- 成功提交 51 次，其中使用 lane_batches 15 次；每次 top_n 合计 平均 2，P50 0，P95 10，最大 14（n=51）
- 速度档位：{"CRUISE":44,"BURST":1}；sleep_ticks：平均 7.8，P50 9，P95 10，最大 10（n=52） {"1":1,"2":1,"3":3,"4":5,"5":3,"6":2,"8":10,"9":2,"10":25}
- 工具使用：{"dry_run_admit":86,"commit_schedule":52,"inspect_incident":24,"order_accident_clearance":21,"dispatch_tow_truck":7,"inspect_lane_queue":6,"inspect_crosswalk":2,"reroute_queue_around_stall":1,"manage_working_memory":1,"deprecated":1}
- 决策开销：API 178 次，扣 3.56；非终结工具 149 次，扣 0.2235

与同条件 baseline 对比：

| 策略 | 最终余额 | 放行车辆 | 未服务负债 | 事故数 | 锁格扣费 | 上游积压 | 撞人 | 闯红灯罚 | 行人奖励 | 校车 | 拖车 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| step-5-preview | 601.99 | 116 | 208.2 | 7 | 61.92 | 85.1 | 25 | 9.8 | 0 | 10 | 8.4 |
| baseline-balanced | 674.49 | 84 | 219.6 | 6 | 21.3 | 58.85 | 25 | 5.5 | 0 | 0 | 8.4 |
| baseline-balanced-bus | 659.61 | 87 | 208.1 | 4 | 90.26 | 53.27 | 5 | 4.9 | 0 | 0 | 6 |
| baseline-balanced-no-ped | 717.59 | 132 | 187.4 | 4 | 74.39 | 47.7 | 0 | 0 | 0 | 10 | 10.8 |
| baseline-longest-queue | 633.99 | 183 | 195.7 | 10 | 76.09 | 44.92 | 50 | 11.6 | 0 | 10 | 10.8 |
| baseline-random | 539.49 | 114 | 207.6 | 7 | 139.2 | 73.82 | 35 | 11 | 0 | 0 | 7.2 |
| baseline-search | 788.38 | 122 | 185.4 | 2 | 3.69 | 45.85 | 10 | 6.7 | 0 | 0 | 8.4 |

## 2. 进阶分析

### 2.1 逻辑推理

- 试算失败（不含额度用完）39 次；之后再试 21 次，其中改了参数 21 次，成功 9 次（0.429）；失败所在周期最终 verified 提交 3 次、hold 29 次
- 推理中"路线 X 经过/不经过 Y 横道"的断言 148 条，正确 96，错误 52，准确率 0.649；前半局 7/21 错，后半局 45/127 错
  - c21：「E_R1_RIGHT - does its route cross WEST」（实际经过 CROSSWALK:EAST+CROSSWALK:NORTH）
  - c21：「S_R1_RIGHT - crosses WEST」（实际经过 CROSSWALK:SOUTH+CROSSWALK:EAST）
  - c21：「S_R1_RIGHT right turn may cross WEST」（实际经过 CROSSWALK:SOUTH+CROSSWALK:EAST）
  - c21：「E_R1_RIGHT (from East, right turn) exits south — crosses SOUTH」（实际经过 CROSSWALK:EAST+CROSSWALK:NORTH）
  - c21：「S_R1_RIGHT exits west — crosses WEST」（实际经过 CROSSWALK:SOUTH+CROSSWALK:EAST）
  - c23：「S_R1_RIGHT cross NORTH」（实际经过 CROSSWALK:SOUTH+CROSSWALK:EAST）
  - c23：「S_R1_RIGHT cross WEST」（实际经过 CROSSWALK:SOUTH+CROSSWALK:EAST）
  - c32：「W_L1_LEFT from west heads south → crosses SOUTH」（实际经过 CROSSWALK:WEST+CROSSWALK:NORTH）
- 推理写"安全/无冲突"但同一轮试算冲突：16 次
  - c9 r1 t119：「n E_R1_RIGHT. So there's already a vehicle on that route crossing. But V00104's route is E_R1_RIGHT, and V00106 wants E_R1_RIGHT too. It's a right turn though, should be fine if V00104 is already crossing. Let me think about whether admitting V00106 is worth it. V00106 has 2 passengers, reward 0.2. Cost of API call 0.02 + commit. Ti」→ CROSSWALK:WEST:CELL:1:0 vs V00042
  - c13 r1 t142：「- WEST A_TO_B: 1 waiting patience 28. Reward 0.04. But we must check: does releasing pedestrians conflict with vehicle admissions? Since no vehicles this tick, no conflict. But do pedestrians conflict with in-transit vehicles? The dry_run_admit would tell us via ok/warnings. Actually, there's a subtlety: pedestrian phases and veh」→ CROSSWALK:NORTH:CELL:0:0 vs V00017
  - c14 r1 t145：「bout what to do. The options: 1. Admit the bus V00084 on S_R1_RIGHT. Since S_R1_RIGHT is not blocked, and it's a right turn... Let me check candidateConflicts: no conflicts listed with V00084. So a right turn from S_R1 doesn't conflict with other stopline heads. Good. 2. Emergency convoy for V00043 in IN_W_S1_STRAIGHT. V00043 is a」→ CROSSWALK:EAST:CELL:7:0 vs V00074
  - c16 r1 t149：「ng my possible candidates (V00079, V00148, V00028, V00084, V00132): - V00079 conflicts with V00132 (both in candidates list). So can't admit both. - V00132 has no conflict with V00148, V00028, V00084. - V00079 has no conflict with V00148, V00028, V00084. Wait, candidateConflicts scope is STOPLINE_HEADS_SAME_TICK: only compares ca」→ CROSSWALK:EAST:CELL:7:0 vs V00074
  - c16 r2 t149：「but CRUISE 1/tick - reservation table covers future cells too. If V00074 is on that cell at 149 and my vehicles would traverse that cell at tick 149+something, no conflict... but dry-run says conflict at tick 149. So my plan requests that cell at tick 149. That means pedestrian phase peds would step into that cell at tick 149 (ri」→ CROSSWALK:WEST:CELL:6:0 vs INCIDENT
  - c20 r1 t162：「Avoids jaywalk risk 0.7. Yes, worth it. But do west-bound vehicles exist that would cross? We're not admitting west vehicles anyway (all severed). So ped phase is safe. WEST B_TO_A has waiting=1, min 37. NORTH A_TO_B waiting=2 min 24. NORTH B_TO_A waiting=1 min 46. SOUTH A_TO_B waiting=1 min 43. The crosswalk directions: each」→ CROSSWALK:WEST:CELL:6:0 vs INCIDENT
- 自我修正标记（Wait/Actually/Let me recheck…）：共 3677 次，每次回复 平均 20.8，P50 12，P95 67，最大 104（n=177）
- 认知模式 letterCounting：14 处
  - 「t outside candidate list because... whatever. Actually hmm, why is N_L1_LEFT not in stoplineCandidates if V00056 is the head at distance 5? Maybe stopline candidates are only listed for lanes with... Let me recount stoplineCandidates: E: L1(V00008), R1(V00011), S1(V00024) — E_S2 missing (lanePressure shows E_S2 not even? E lanes: L1, R1, S1 listed; S2 occupancy 0.3279 but no candidate — maybe queue empty head f」
  - 「 sleep 10 → 104. Cycle D at 104: dry-run W lanes (OUT_EAST free at 102), S_L1 (free 102), etc. That's 4 cycles = 8 API calls but only 5 rounds. Too many. Need compression. Compression: Round budget — let me recount. The user message included observation referencing cycles 2 and 3 already executed. The "8 rounds" likely includes all rounds so far. If we've used 3 rounds (cycle1 initial? Hmm cycles are 1-indexed;」
  - 「ers (-0.1 each) — that's bad: W_S1 59 pax × 0.1 = 5.9, etc. Hmm, that's a problem. Wait, but "rounds of API" — maybe it means tool calls rounds, and I've done 1 call round so far (the parallel pair). Let me recount: user message 1 (observation). My message 2: dry_run + reroute (round 2?). The history shows cycles 2, 3 already done before this observation. So rounds used: cycle 1 (round 1), cycle 2 (round 2), cy」
- 认知模式 idFormat：0 处

### 2.2 复杂环境博弈

**行人与车辆**

- 行人相位尝试 38 次，成功 5 次 {"RESOURCE_CONFLICT":23,"DRY_RUN_QUOTA_EXHAUSTED":8,"OK":5,"LANE_HEAD_NOT_READY":1,"SCHEMA_ERROR":1}
- 实际放行 2 批 3 人；闯红灯 18 次 18 人；被撞 5 人；奖励 0，扣费 {"delay":1.04,"jaywalk":9.8,"strike":25}

行人相位冲突样例：

| 周期 | tick | 冲突偏移 at | 冲突 |
| --- | --- | --- | --- |
| 9 | 119 | 4 | CROSSWALK:WEST:CELL:1:0 vs V00042 |
| 13 | 142 | 0 | CROSSWALK:NORTH:CELL:0:0 vs V00017 |
| 13 | 142 | 3 | CROSSWALK:WEST:CELL:0:0 vs V00017 |
| 14 | 145 | 1 | CROSSWALK:EAST:CELL:7:0 vs V00074 |
| 14 | 145 | 1 | CROSSWALK:EAST:CELL:7:0 vs V00074 |
| 15 | 146 | 0 | CROSSWALK:EAST:CELL:7:0 vs V00074 |
| 15 | 146 | 0 | CROSSWALK:EAST:CELL:7:0 vs V00074 |
| 16 | 149 | 0 | CROSSWALK:EAST:CELL:7:0 vs V00074 |
| 16 | 149 | 0 | CROSSWALK:WEST:CELL:6:0 vs INCIDENT |
| 20 | 162 | 0 | CROSSWALK:WEST:CELL:6:0 vs INCIDENT |

在行人耐心告急（PATIENCE_CRITICAL）时放行、且路线经过该横道的车辆：183 车次

| 周期 | tick | 车辆 | 路线 | 横道 | 行人 | 剩余耐心 | 该行人后来被撞 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 17 | 150 | V00084 | S_R1_RIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 16 |  |
| 17 | 150 | V00148 | E_R1_RIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 16 |  |
| 17 | 150 | V00028 | N_R1_RIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 20 |  |
| 21 | 170 | V00159 | E_R1_RIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 16 |  |
| 23 | 176 | V00110 | S_S1_STRAIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 10 |  |
| 23 | 176 | V00117 | S_S1_STRAIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 10 |  |
| 23 | 176 | V00126 | S_S1_STRAIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 10 |  |
| 23 | 176 | V00131 | S_S1_STRAIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 10 |  |
| 23 | 176 | V00226 | S_S2_STRAIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 10 |  |
| 25 | 184 | V00181 | E_R1_RIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 2 |  |
| 25 | 184 | V00181 | E_R1_RIGHT | CROSSWALK:NORTH | PED:43:0:CROSSWALK:NORTH | 24 |  |
| 25 | 184 | V00238 | S_S2_STRAIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 2 |  |
| 25 | 184 | V00238 | S_S2_STRAIGHT | CROSSWALK:SOUTH | PED:38:0:CROSSWALK:SOUTH | 21 |  |
| 25 | 184 | V00238 | S_S2_STRAIGHT | CROSSWALK:NORTH | PED:43:0:CROSSWALK:NORTH | 24 |  |
| 25 | 184 | V00244 | S_S2_STRAIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 2 |  |

行人时间线：

| tick | 事件 | 横道 | 人数 |
| --- | --- | --- | --- |
| 151 | PED_GRANT | CROSSWALK:EAST | 2 |
| 170 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 184 | PED_GRANT | CROSSWALK:SOUTH | 1 |
| 186 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 199 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 200 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 208 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 210 | PED_COLLISION | CROSSWALK:EAST | 1 |
| 211 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 211 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 211 | PED_COLLISION | CROSSWALK:WEST | 1 |
| 225 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 228 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 234 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 237 | PED_COLLISION | CROSSWALK:NORTH | 1 |
| 240 | PED_COLLISION | CROSSWALK:SOUTH | 1 |
| 241 | PED_JAYWALK | CROSSWALK:SOUTH | 1 |
| 241 | PED_JAYWALK | CROSSWALK:SOUTH | 1 |
| 244 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 244 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 246 | PED_COLLISION | CROSSWALK:EAST | 1 |
| 249 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 249 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 257 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 260 | PED_JAYWALK | CROSSWALK:WEST | 1 |

**事故处置**

| 事故 | 类型 | 发生 | 车辆 | 行人 | 首次响应 | 清障令 | 清障调用次数 | 关闭 | 事故后才放行、后来卷入 | 非模型放行（抢行） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| INC0001 | PILEUP | 149 | 7 | 0 | 149 | 149 | 5 | 197 | V00028@150 | V00030 |
| INC0002 | ANGLE_COLLISION | 210 | 1 | 1 | 211 | 211 | 4 | 227 |  |  |
| INC0003 | ANGLE_COLLISION | 211 | 2 | 1 | 212 | 212 | 4 | 228 |  |  |
| INC0004 | SCRAPE | 222 | 2 | 0 | 223 | 223 | 2 | 228 |  | V00118 |
| INC0005 | ANGLE_COLLISION | 237 | 1 | 1 | 238 | 238 | 3 | 252 |  |  |
| INC0006 | ANGLE_COLLISION | 240 | 1 | 1 | 242 | 242 | 2 | 258 |  |  |
| INC0007 | ANGLE_COLLISION | 246 | 1 | 1 | 247 | 247 | 1 | 261 |  |  |

事故成本估算：

| 事故 | 最终严重度 | 锁格（含二次） | 开放拍数 | 危化品 | 校车 | 分摊锁格费 | 估算总成本 | 放行来源 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| INC0001 | CRITICAL | 105 | 48 |  | 是 | 47.751 | 57.751 | V00030@c- V00032@c11 V00010@c11 V00016@c11 V00090@c11 V00050@c11 V00028@c17 |
| INC0002 | SERIOUS | 20 | 17 |  |  | 2.148 | 7.148 | V00194@c25 |
| INC0003 | SERIOUS | 35 | 17 |  |  | 3.758 | 8.758 | V00088@c28 V00111@c28 |
| INC0004 | MINOR | 83 | 6 |  |  | 1.573 | 1.573 | V00021@c37 V00118@c- |
| INC0005 | SERIOUS | 22 | 15 |  |  | 2.084 | 7.084 | V00201@c46 |
| INC0006 | SERIOUS | 28 | 18 |  |  | 3.183 | 8.183 | V00204@c46 |
| INC0007 | SERIOUS | 15 | 15 |  |  | 1.421 | 6.421 | V00109@c46 |

**司机抢行**

总计 {"redLight":2,"tailgate":1,"cutIn":0}

| 周期 | 类型 | 车辆 | 此前出现在 driverAlerts 的周期数 | 最后一次预警 | 卷入事故 |
| --- | --- | --- | --- | --- | --- |
| 12 | VEHICLE_RED_LIGHT | V00017 | 2 | IN_N_R1_RIGHT 距停止线 2 剩余 0 |  |
| 15 | VEHICLE_RED_LIGHT | V00030 | 4 | IN_W_S1_STRAIGHT 距停止线 0 剩余 0 | INC0001 |
| 38 | VEHICLE_TAILGATE | V00118 | 6 | IN_E_L1_LEFT 距停止线 7 剩余 0 | INC0004 |

**紧急车辆与抛锚**

紧急车辆延误扣费 0.449

| 车辆 | 首次进入 12 格 | 放行 tick | 等待拍数 | 最长静止 |
| --- | --- | --- | --- | --- |
| V00034 | 71 | 116 | 45 | 35 |
| V00036 | 71 | 102 | 31 | 22 |
| V00050 | 71 | 148 | 77 | 44 |
| V00056 | 81 | 92 | 11 | 6 |
| V00043 | 111 |  |  | 82 |
| V00212 | 181 |  |  | 31 |
| V00137 | 186 |  |  | 68 |

拖车费 8.4，链式加价 1.696

| 车辆 | 车道 | 抛锚 | 派拖车 | 派车延迟 | 绕行 |
| --- | --- | --- | --- | --- | --- |
| V00006 | IN_N_R1_RIGHT | 64 | 119 | 55 |  |
| V00014 | IN_S_R1_RIGHT | 64 | 119 | 55 | 82 |
| V00068 | IN_N_L1_LEFT | 95 | 119 | 24 |  |
| V00089 | IN_S_S1_STRAIGHT | 146 | 151 | 5 |  |
| V00122 | IN_W_R1_RIGHT | 215 | 220 | 5 |  |
| V00029 | IN_W_S2_STRAIGHT | 216 | 220 | 4 |  |
| V00124 | IN_E_L1_LEFT | 219 | 220 | 1 |  |

### 2.3 亮眼操作与最差操作

周期价值 = 未卷入事故的放行车数 + 1.5×放行行人 + 2×成功的特情工具 − 归因事故成本。事故成本按锁格×开放时长分摊本局真实锁格扣费，再加撞人和校车罚款，平均分给放行了涉事车辆的周期。这是用于挑选证据的启发式，不是精确账目。

亮点事件：

| tick | 周期 | 类型 | 说明 |
| --- | --- | --- | --- |
| 82 | 4 | STALL_REROUTE | V00074 around V00014 |
| 111 | 8 | LARGE_VERIFIED_RELEASE | 8 vehicles, blame=0 |
| 119 | 9 | TOW_DISPATCH | V00006 |
| 119 | 9 | TOW_DISPATCH | V00014 |
| 119 | 9 | TOW_DISPATCH | V00068 |
| 139 | 11 | LARGE_VERIFIED_RELEASE | 10 vehicles, blame=48.13 |
| 151 | 18 | TOW_DISPATCH | V00089 |
| 151 | 18 | PED_GRANT | CROSSWALK:EAST B_TO_A x2 |
| 184 | 25 | PED_GRANT | CROSSWALK:SOUTH A_TO_B x1 |
| 220 | 41 | TOW_DISPATCH | V00029 |
| 220 | 41 | TOW_DISPATCH | V00124 |
| 220 | 41 | TOW_DISPATCH | V00122 |
| 232 | 46 | LARGE_VERIFIED_RELEASE | 14 vehicles, blame=21.69 |

#### 得分最高的周期

**周期 9（tick 119）**：放行 3，未出事 3，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -6.329，提交类型 verified，睡眠 10

- 观测要点：余额 994.82，停止线候选 8，受阻路线 7，行人预警 []，司机预警 []，紧急车 [V00043, V00050]，抛锚 [V00006, V00014, V00068]
- 工具序列：r1 dispatch_tow_truck -> ok；r1 dispatch_tow_truck -> ok；r1 dispatch_tow_truck -> ok；r1 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:WEST:CELL:1:0 vs V00042)；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 战术摘要：Admit E_R1 top3 (V00106 now, V00113@124, V00120@129, +0.4). Towed V00006/V00014/V00068 (stall chain relief, lanes free@137). Major axes still RESERVATION-blocked until 132-138; sleep 10 to approach S_S1(132) unblock for next wave.
- 推理摘录：Let me analyze this situation carefully. Current state: - Tick 119, endTick 261, 142 ticks remaining - Balance: 994.8156 - No working memory plan active blockedRoutes: All major routes are blocked by RESERVATION until ticks 132-138. This means I cannot admit vehicles on these routes yet: - N_S1_STRAIGHT blocked until 137 - N_S2_STRAIGHT blocked until 136 - S_S1_STRAIGHT blocked until 132 - S_S2_STRAIGHT blocked until 134 - W_L1_LEFT blocked until 138 - W_S1_STRAIGHT blocked until 134 - W_S2_STRA …… _n":3}] - sleep_ticks: 10 - tactical_summary: "Admit E_R1 top3 (V00106 now, V00113@124, V00120@129, +0.4); tow dispatched for V00006/V00014/V00068 (chain stall relief, lanes free@137); all major axes resume-blocked by RESERVATION until 132-138, sleep 10 to approach S_S1 (132) unblock for next wave."

**周期 8（tick 111）**：放行 8，未出事 8，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -1.716，提交类型 verified，睡眠 8

- 观测要点：余额 996.53，停止线候选 11，受阻路线 5，行人预警 []，司机预警 []，紧急车 [V00034, V00043, V00050]，抛锚 [V00006, V00014, V00068]
- 工具序列：r1 dry_run_admit -> ok；r2 commit_schedule -> ok
- 战术摘要：Verified turn-only batch: S_L1 top4 (frees emergency V00034), W_R1 top2, E_R1 top1, E_L1 top1; conflicting/blocked heads (N/S straights, W_L1, W straights) deferred to their reservation windows; exits EAST/WEST stay locked so W/E straights not added; sleep 8 to clear staggered entries."
- 推理摘录：Let me analyze the current state carefully. Current tick: 111, end tick 261, so 150 ticks remaining. Balance: 996.5314. Key observations: 1. **Discharging lanes**: IN_E_S1_STRAIGHT (1 vehicle, next enter 116, clear 133), IN_E_S2_STRAIGHT (1 vehicle, next enter 116, clear 134). V00048 and V00086 are SCHEDULED_ENTERING at tick 116. Don't re-admit these. 2. **Active crossings**: V00013 (W_S2), V00020 (N_S1), V00023 (W_S1), V00024 (E_S1), V00036 (W_R1), V00042 (E_S1), V00048 (E_S1 scheduled), V00069 …… ste the attempt. Better to stick with a single safe batch rather than gamble on a joint plan. I'll settle on an 8-tick sleep and commit now, since the reward figures from the dry-run (8 vehicles cleared, reward 2.50) are what actually matter for the commit regardless of those aggregated cost fields.

**周期 56（tick 247）**：放行 8，未出事 8，放行行人 0，耐心风险放行 64，归因成本 0，周期余额变化 -4.983，提交类型 verified，睡眠 5

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:115:0:CROSSWALK:EAST remaining=24; ACCIDENT_INTERRUPT incident=INC0007 locked=CROSSWALK:EAST:CELL:4:0,CROSSWALK:EAST:CELL:4:1,PAIR:N_L1_LEFT:12|N_S2_GUIDED_LEFT:14,P
- 观测要点：余额 830.75，停止线候选 15，受阻路线 17，行人预警 [W:P21, W:P13, W:P19, E:P24, N:J0, N:J0, S:J0, W:P2, N:J0, W:P10, N:J0, E:P16, E:P2, S:P15, N:P21]，司机预警 [V00025:0, V00041:0, V00045:0, V00126:0, V00143:0, V00072:0, V00141:0, V00047:0]，紧急车 [V00043, V00137, V00212]，抛锚 []
- 工具序列：r1 inspect_incident -> ok；r2 order_accident_clearance -> ok；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 战术摘要：INC0007 evacuation started (V00109->OUT_EAST_2); E_S2 westbound straight is the only open non-jaywalker lane (crosses WEST, jaywalks blocked t249). Admitted 8 BURST, sleeping 5 to t252 for INC0005 clear.
- 推理摘录：Let me analyze the current situation carefully. Current tick: 247, endTick: 261, ticksRemaining: 14 Balance: 830.7521 Key observations: 1. ACCIDENT_INTERRUPT incident=INC0007 locked several routes (blockKind=INCIDENT, blockedUntilTick=261 - which is the end tick, so these won't clear this game). 2. Multiple routes blocked by incidents: - INC0007: E_L1_GUIDED_STRAIGHT, E_L1_LEFT, N_L1_LEFT, N_S2_GUIDED_LEFT, W_L1_GUIDED_STRAIGHT, W_S2_STRAIGHT (blockedUntilTick=261) - these won't clear before gam …… es; if dry-run at t252 says no warnings, vehicles entering t252 conflicts? OK. I'm going in circles. Execute: commit E_S2 batch + sleep 5. Wait, but is the commit's plan EXACT match with dry-run: lane_batches: [{IN_E_S2_STRAIGHT, top_n 8, speed_profile BURST}]. Yes. sleep_ticks: 5. tactical_summary.

**周期 7（tick 103）**：放行 7，未出事 7，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -1.155，提交类型 verified，睡眠 8

- 观测要点：余额 997.69，停止线候选 10，受阻路线 5，行人预警 []，司机预警 []，紧急车 [V00034, V00050]，抛锚 [V00006, V00014, V00068]
- 工具序列：r1 dry_run_admit -> ok；r2 commit_schedule -> ok
- 战术摘要：Verified E-axis batch: E_R1 top1 + E_S1 top3 + E_S2 top3 (no conflicts, no jaywalker warnings, reward 12.5); sleep 8 to let staggered entries clear the junction.
- 推理摘录：Let me analyze the current situation. Current tick 103, endTick 261, ticks remaining 158. Balance 997.686. Key things to consider: 1. blockedRoutes: RESERVATION block until ticks 116, 112, 114, 117, 116. These are E_L1_LEFT, N_S2_STRAIGHT, S_L1_LEFT, S_S1_STRAIGHT, S_S2_STRAIGHT. 2. dischargingLanes: W_S1 and W_S2 have vehicles scheduled entering at 104/105. 3. activeVehicleMotions: V00009, V00012 CROSSING; V00013, V00023 SCHEDULED_ENTERING; V00020 N_S1 CROSSING; V00033, V00036 W_R1 CROSSING; V0 …… eduled up to 116, estimated clear up to 136. A sleep of 8-10 is reasonable. Let's commit with sleep_ticks 8 (wake at ~111) so I can next handle S_L1 at 114 and N_S2 at 112. Actually sleep 8 -> tick 111. Then next cycle: N_S2 blocked until 112 still active at 111; sleep 1 there. Let's choose sleep 8.

**周期 10（tick 129）**：放行 7，未出事 7，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -3.424，提交类型 verified，睡眠 10

- 观测要点：余额 988.49，停止线候选 11，受阻路线 5，行人预警 []，司机预警 [V00017:5, V00063:10]，紧急车 [V00043, V00050]，抛锚 [V00006, V00014, V00068]
- 工具序列：r1 dry_run_admit -> ok；r2 commit_schedule -> ok
- 战术摘要：NS-axis south wave: S_S1 top4 + S_S2 top3 verified (reward 0.9), south exits free; staggered entry to ~tick144, clears by~160. Sleep 10 to tick139 so N_S1/S2(136/137), W_S1/S2(134/135), W_L1(138) reservations expire, tow completions@137 land, exit holds(132) cleared; next cycle run NS-axis north str
- 推理摘录：Let me carefully analyze this observation. Current tick 129, endTick 261, ticksRemaining 132. Balance 988.4871. We need to maximize final balance. Let me look at the current state. Stopline candidates: - V00079 passenger 1, IN_E_L1_LEFT, waiting 31 - V00088 truck 1, IN_E_S1_STRAIGHT, waiting 28 - V00111 passenger 2, IN_E_S2_STRAIGHT, waiting 15 - V00032 truck 3, IN_N_S1_STRAIGHT, waiting 57 - V00010 passenger 1, IN_N_S2_STRAIGHT, waiting 67 - V00039 passenger 1, IN_S_S1_STRAIGHT, waiting 52 - V0 …… 134/139/144/138/143. Sleeping 10 to 139 lands mid-batch. Fine. If I sleep less, I'd be at 134-138 with still blocked N/W. Sleep 10 to 139 is the best alignment. Do sleep 10. Commit identical: lane_batches [S_S1 top4, S_S2 top3], no others. reward we don't pass. tactical_summary short. Let me commit.

#### 损失最大的周期

**周期 11（tick 139）**：放行 10，未出事 5，放行行人 0，耐心风险放行 0，归因成本 48.13，周期余额变化 -0.66，提交类型 verified，睡眠 10

- 观测要点：余额 985.06，停止线候选 11，受阻路线 5，行人预警 []，司机预警 [V00017:0, V00063:0, V00097:3, V00030:6, V00095:10, V00107:12]，紧急车 [V00043, V00050]，抛锚 []
- 工具序列：r2 dry_run_admit -> LANE_HEAD_NOT_READY (Lane head is not ready: IN_N_R1_RIGHT)；r3 dry_run_admit -> ok；r4 commit_schedule -> ok
- 后果：INC0001 PILEUP tick=149 vehicles=7 pedestrians=0 estCost=57.751
- 战术摘要：NS north wave + E/W right: N_S1 top3 (clears V00032@patience6, admits emergency V00050 stopping 0.0015/t), N_S2 top3 (drains 9 upstream), E_R1 top2, W_R1 top2. Verified reward 10.9. Staggered entries 139-153. Sleep 10 to tick149; W_S1@151 W_S2@152 E_S@155/156 unblock next, then W waves.
- 推理摘录：Let me analyze the current situation carefully. Current state: - Tick 139, end tick 261, 122 ticks remaining - Balance: 985.0636 - Recent cycles show we've been running NS-axis south waves and waiting for reservations to expire Key observations: 1. **Discharging lanes**: IN_S_S1_STRAIGHT and IN_S_S2_STRAIGHT have active vehicles still crossing (SCHEDULED_ENTERING at ticks 143, 144). They'll clear by ~160. Don't re-admit these. 2. **Blocked routes (RESERVATION)**: - E_L1_LEFT: blocked until 153 - …… s not avoidable. Given no strong reason for a specific length, 10 maximizes sleep efficiency (fewer cycles). But wait, is there benefit to reacting at 147 vs 149? At 147 nothing new unblocks (W_S1@151). So no. Sleep 10. Hmm, actually one more: should I sleep 12? Not allowed. 10 it is. Let me commit.

**周期 46（tick 232）**：放行 14，未出事 11，放行行人 0，耐心风险放行 48，归因成本 21.69，周期余额变化 -1.491，提交类型 verified，睡眠 10

- 观测要点：余额 867.63，停止线候选 13，受阻路线 2，行人预警 [N:J0, N:J0, E:J0, N:P2, N:J0, S:P9, W:P17, N:P12, S:P9, N:P12, E:P17]，司机预警 [V00025:0, V00031:0, V00041:0, V00109:0, V00116:0, V00126:0, V00093:0, V00045:0]，紧急车 [V00043, V00137, V00212]，抛锚 [V00029, V00122, V00124]
- 工具序列：r2 dry_run_admit -> PLANNING_HORIZON_EXCEEDED (Admission planning horizon exceeded for V00174)；r3 dry_run_admit -> ok；r4 dry_run_admit -> DRY_RUN_QUOTA_EXHAUSTED；r5 commit_schedule -> ok
- 后果：INC0005 ANGLE_COLLISION tick=237 vehicles=1 pedestrians=1 estCost=7.084；INC0006 ANGLE_COLLISION tick=240 vehicles=1 pedestrians=1 estCost=8.183；INC0007 ANGLE_COLLISION tick=246 vehicles=1 pedestrians=1 estCost=6.421
- 战术摘要：Dry-run verified: discharge W straight+left, N left, S right, E right in parallel (14 vehicles, includes all 3 emergency vehicles). Jaywalker warnings present on E_R1/N_L1/S_R1 entries but no same-tick head conflicts and route through junction; benefit outweighs one-time 5-penalty risk. Later moves 
- 推理摘录：Let me analyze this situation carefully. Current tick: 232, end tick 261, 29 ticks remaining. Balance: 867.6328. Key observations: 1. **blockedRoutes**: E_S1_STRAIGHT and N_S1_STRAIGHT are blocked with RESERVATION until tick 232 (which is now). So they may be available now. 2. **stalledVehicles**: Three stalled vehicles: - V00029 in IN_W_S2_STRAIGHT, tow en route, completion at 238 (6 ticks) - V00122 in IN_W_R1_RIGHT, tow en route, completion at 238 - V00124 in IN_E_L1_LEFT, tow en route, comple ……  = 5+5+2+2+2 = 16 vehicles. This includes the tailgaters and fewer pointless deep entries. Hmm, but E_R1 top 2 excludes V00212 (emergency, stationary 29 → burning 0.0015/tick). The emergency is valuable to move. E_R1 top 3 includes V00212 (entry 242, clear 252). Keep E_R1 top 3. Total 17. Let's try.

**周期 17（tick 150）**：放行 3，未出事 2，放行行人 0，耐心风险放行 3，归因成本 9.63，周期余额变化 -11.432，提交类型 verified，睡眠 10

- 唤醒原因：ACCIDENT_INTERRUPT incident=INC0001 secondary=true
- 观测要点：余额 984.15，停止线候选 13，受阻路线 20，行人预警 [E:P16, W:P20]，司机预警 [V00063:0, V00095:0, V00097:0, V00107:5, V00178:9, V00114:12, V00165:12]，紧急车 [V00043]，抛锚 [V00089]
- 工具序列：r1 inspect_incident -> ok；r1 dry_run_admit -> ok；r2 order_accident_clearance -> ok；r2 commit_schedule -> ok
- 后果：INC0001 PILEUP tick=149 vehicles=7 pedestrians=0 estCost=57.751
- 战术摘要：INC0001 critical pileup still OPEN (est. clear ~185), holding most routes. Committed verified wave: bus V00084 (S_R1 right) + right-turns V00148/V00028 (all unblocked, dry-run ok, reward 4.2, no jaywalker/tailgate warning). Ordered accident evac toward free OUT_SOUTH_2. Sleep 10 to advance evac and 
- 推理摘录：Let me analyze this situation carefully. Current state: - Tick 150, endTick 261, so 111 ticks remaining - Balance: 984.1507 - interruptReason: ACCIDENT_INTERRUPT incident=INC0001 secondary=true - There's a big incident blocking many routes until tick 185 (INC0001) - blockedRoutes: many routes are blocked with INCIDENT until tick 185 The blocked routes include: - E_L1_GUIDED_STRAIGHT, E_R1_GUIDED_STRAIGHT, E_S1_STRAIGHT, E_S2_GUIDED_LEFT, E_S2_STRAIGHT - N_L1_GUIDED_STRAIGHT, N_R1_GUIDED_STRAIGHT …… arallel: - order_accident_clearance(INC0001, OUT_SOUTH_2) - commit_schedule(admit_vehicle_ids=["V00084","V00148","V00028"], sleep_ticks=10, tactical_summary="...") Tactical summary: mention incident evac + admit bus/right turns + sleep to 160 for exit frees and incident progression. Let me write it.

**周期 28（tick 197）**：放行 12，未出事 9，放行行人 0，耐心风险放行 30，归因成本 8.76，周期余额变化 -1.78，提交类型 unverified，睡眠 8

- 观测要点：余额 920.85，停止线候选 13，受阻路线 4，行人预警 [N:J0, W:J0, N:P11, W:P2, E:P14, W:P3, N:P14]，司机预警 [V00025:0, V00111:0, V00126:0, V00041:0, V00038:0, V00062:0, V00105:0, V00045:0]，紧急车 [V00043, V00137, V00212]，抛锚 []
- 工具序列：r1 commit_schedule -> SCHEMA_ERROR ([ { "code": "invalid_type", "expected": "number", "received": "undefined", "path)；r2 dry_run_admit -> PLANNING_HORIZON_EXCEEDED (Admission planning horizon exceeded for V00171)；r3 commit_schedule -> ok
- 后果：INC0003 ANGLE_COLLISION tick=211 vehicles=2 pedestrians=1 estCost=8.758
- 战术摘要：INC0001 cleared; East axis released. Verified plan = 3 vehicles per E lane (12 total); legally admits V00111 (aggressive, patience 0) and followers to avoid red-light runs, draining large E queues. top_n=8 exceeded admission horizon. Sleep 8 to advance crossing; next phase West to free emergency V00
- 推理摘录：Let me analyze this observation carefully. Current state: - Tick 197 of 261, 64 ticks remaining - Balance 920.8501 - Recent cycles show INC0001 pileup blocked all routes until ~197, now at tick 197 the RESERVATION blocks are clearing Let me look at what's changed: - blockedRoutes now shows RESERVATION blocks (not INCIDENT): - N_S2_STRAIGHT: blockedUntilTick 197 (now current, so cleared) - S_L1_LEFT: blockedUntilTick 203 - S_R1_RIGHT: blockedUntilTick 212 - W_S1_STRAIGHT: blockedUntilTick 197 (cl …… next phase W. Let me commit now with top_n=3. Also, I should double-check: does commit_schedule allow omitting speed_profile and ped phases and candidate ids? Yes. Provide lane_batches with top_n=3, admit_vehicle_ids=[], pedestrian_phases=[], vehicle_speed_profiles=[], sleep_ticks, summary. Proceed.

**周期 25（tick 184）**：放行 5，未出事 4，放行行人 0，耐心风险放行 10，归因成本 7.15，周期余额变化 -3.992，提交类型 verified，睡眠 8

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:43:0:CROSSWALK:NORTH remaining=24
- 观测要点：余额 928.8，停止线候选 12，受阻路线 24，行人预警 [N:P2, W:J0, S:P21, N:P24, W:P15, W:P16]，司机预警 [V00025:0, V00111:0, V00041:0, V00105:0, V00118:0, V00112:0, V00063:0, V00080:0]，紧急车 [V00043, V00212]，抛锚 []
- 工具序列：r1 dry_run_admit -> ok；r2 commit_schedule -> ok
- 后果：INC0002 ANGLE_COLLISION tick=210 vehicles=1 pedestrians=1 estCost=7.148
- 战术摘要：S free phase drained (S_R1+S_S2 top2) + E_R1 head + SOUTH ped. INC0001 evac ongoing to ~197; reassess freed routes after clearance.
- 推理摘录：Let me analyze the situation carefully. Current state: - Balance: 928.7982 - currentTick: 184, endTick: 261, ticksRemaining: 77 - There's a major incident INC0001 blocking many routes. It's a critical pileup OPEN, evac in progress, est clearance ~197 +16 ticks. Key observation from recent cycles: - Cycle 23 admitted S_S1 top4 + S_S2 head at tick 176 (sleep 10) - Cycle 24: empty commit, sleep 6, dry-run quota used. Notices: V00212 ENTERED_HORIZON, V00319 OUTSIDE_HORIZON. - INC0001 blocks all rout …… e vehicles flow. If I sleep 8 → tick 192. At 192 exit holds clear and V00212 stationaryTicks would be ~14 → emergency starts costing 0.0015/t. I might want to handle V00212 near then. But V00212 blocked by V00181 which now clears ~194. So after ~194 the path clears for emergency. Let me sleep 8 now.

### 附：逐周期一览

| 周期 | tick | 提交 | 放行 | 行人 | 耐心风险 | 归因事故 | 归因成本 | 余额变化 | 睡眠 | 唤醒原因 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 61 | verified | 6 | 0 | 0 |  | 0 | -0.11 | 10 |  |
| 2 | 71 | verified | 4 | 0 | 0 |  | 0 | -0.333 | 10 |  |
| 3 | 81 | fallback | 0 | 0 | 0 |  | 0 | -0.082 | 1 |  |
| 4 | 82 | verified | 4 | 0 | 0 |  | 0 | -0.618 | 10 |  |
| 5 | 92 | verified | 6 | 0 | 0 |  | 0 | -1.029 | 10 |  |
| 6 | 102 | fallback | 0 | 0 | 0 |  | 0 | -0.142 | 1 |  |
| 7 | 103 | verified | 7 | 0 | 0 |  | 0 | -1.155 | 8 |  |
| 8 | 111 | verified | 8 | 0 | 0 |  | 0 | -1.716 | 8 |  |
| 9 | 119 | verified | 3 | 0 | 0 |  | 0 | -6.329 | 10 |  |
| 10 | 129 | verified | 7 | 0 | 0 |  | 0 | -3.424 | 10 |  |
| 11 | 139 | verified | 10 | 0 | 0 | INC0001 | 48.13 | -0.66 | 10 |  |
| 12 | 141 | fallback | 0 | 0 | 0 |  | 0 | -0.271 | 1 | VEHICLE_RED_LIGHT vehicle=V00017 route=N_R1_RIGHT |
| 13 | 142 | hold | 0 | 0 | 0 |  | 0 | 2.841 | 3 | PEDESTRIAN_PATIENCE pedestrian=PED:11:0:CROSSWALK:EAST remai |
| 14 | 145 | hold | 0 | 0 | 0 |  | 0 | -0.399 | 4 |  |
| 15 | 146 | hold | 0 | 0 | 0 |  | 0 | -1.041 | 4 | PEDESTRIAN_PATIENCE pedestrian=PED:3:0:CROSSWALK:WEST remain |
| 16 | 149 | hold | 0 | 0 | 0 |  | 0 | -1.385 | 10 | ACCIDENT_INTERRUPT incident=INC0001 locked=CROSSWALK:WEST:CE |
| 17 | 150 | verified | 3 | 0 | 3 | INC0001 | 9.63 | -11.432 | 10 | ACCIDENT_INTERRUPT incident=INC0001 secondary=true |
| 18 | 151 | verified | 3 | 0 | 0 |  | 0 | -2.424 | 10 | ACCIDENT_INTERRUPT incident=INC0001 secondary=true |
| 19 | 152 | hold | 0 | 0 | 0 |  | 0 | -14.417 | 10 | ACCIDENT_INTERRUPT incident=INC0001 secondary=true |
| 20 | 162 | hold | 0 | 0 | 0 |  | 0 | -10.98 | 8 | PEDESTRIAN_PATIENCE pedestrian=PED:20:0:CROSSWALK:NORTH rema |
| 21 | 170 | verified | 2 | 0 | 1 |  | 0 | -2.607 | 8 | PEDESTRIAN_JAYWALK pedestrian=PED:3:0:CROSSWALK:WEST |
| 22 | 175 | hold | 0 | 0 | 0 |  | 0 | -1.67 | 8 | PEDESTRIAN_PATIENCE pedestrian=PED:44:0:CROSSWALK:WEST remai |
| 23 | 176 | unverified | 5 | 0 | 5 |  | 0 | -8.137 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:45:1:CROSSWALK:WEST remai |
| 24 | 181 | hold | 0 | 0 | 0 |  | 0 | -3.685 | 6 | PEDESTRIAN_PATIENCE pedestrian=PED:38:0:CROSSWALK:SOUTH rema |
| 25 | 184 | verified | 5 | 0 | 10 | INC0002 | 7.15 | -3.992 | 8 | PEDESTRIAN_PATIENCE pedestrian=PED:43:0:CROSSWALK:NORTH rema |
| 26 | 186 | hold | 0 | 0 | 0 |  | 0 | -1.501 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:20:0:CROSSWALK:NORTH |
| 27 | 187 | hold | 0 | 0 | 0 |  | 0 | -2.455 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:45:0:CROSSWALK:EAST remai |
| 28 | 197 | unverified | 12 | 0 | 30 | INC0003 | 8.76 | -1.78 | 8 |  |
| 29 | 199 | hold | 0 | 0 | 0 |  | 0 | -1.192 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:44:0:CROSSWALK:WEST |
| 30 | 200 | fallback | 0 | 0 | 0 |  | 0 | -0.79 | 1 | PEDESTRIAN_JAYWALK pedestrian=PED:45:1:CROSSWALK:WEST |
| 31 | 201 | hold | 0 | 0 | 0 |  | 0 | -1.322 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:61:0:CROSSWALK:EAST remai |
| 32 | 204 | hold | 0 | 0 | 0 |  | 0 | -2.31 | 3 | PEDESTRIAN_PATIENCE pedestrian=PED:68:0:CROSSWALK:NORTH rema |
| 33 | 207 | hold | 0 | 0 | 0 |  | 0 | -1.467 | 8 |  |
| 34 | 208 | hold | 0 | 0 | 0 |  | 0 | -0.708 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:43:0:CROSSWALK:NORTH |
| 35 | 210 | fallback | 0 | 0 | 0 |  | 0 | -7.117 | 1 | PEDESTRIAN_PATIENCE pedestrian=PED:62:0:CROSSWALK:NORTH rema |
| 36 | 211 | hold | 0 | 0 | 0 |  | 0 | -5.931 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:45:0:CROSSWALK:EAST; PEDES |
| 37 | 212 | unverified | 2 | 0 | 1 | INC0004 | 1.57 | -4.292 | 10 | ACCIDENT_INTERRUPT incident=INC0003 locked=CROSSWALK:WEST:CE |
| 38 | 216 | hold | 0 | 0 | 0 |  | 0 | -1.195 | 10 | VEHICLE_TAILGATE vehicle=V00118 route=E_L1_LEFT |
| 39 | 217 | fallback | 0 | 0 | 0 |  | 0 | -1.252 | 1 | PEDESTRIAN_PATIENCE pedestrian=PED:80:0:CROSSWALK:SOUTH rema |
| 40 | 218 | hold | 0 | 0 | 0 |  | 0 | -2.651 | 10 |  |
| 41 | 220 | hold | 0 | 0 | 0 |  | 0 | -6.454 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:82:0:CROSSWALK:NORTH rema |
| 42 | 222 | fallback | 0 | 0 | 0 |  | 0 | -1.323 | 1 | ACCIDENT_INTERRUPT incident=INC0004 locked=PAIR:E_L1_LEFT:4\| |
| 43 | 223 | hold | 0 | 0 | 0 |  | 0 | -3.883 | 5 |  |
| 44 | 225 | hold | 0 | 0 | 0 |  | 0 | -4.87 | 4 | PEDESTRIAN_PATIENCE pedestrian=PED:81:0:CROSSWALK:WEST remai |
| 45 | 228 | hold | 0 | 0 | 0 |  | 0 | -4.679 | 4 | PEDESTRIAN_JAYWALK pedestrian=PED:68:0:CROSSWALK:NORTH |
| 46 | 232 | verified | 14 | 0 | 48 | INC0005 INC0006 INC0007 | 21.69 | -1.491 | 10 |  |
| 47 | 233 | fallback | 0 | 0 | 0 |  | 0 | -2.049 | 1 | PEDESTRIAN_PATIENCE pedestrian=PED:87:0:CROSSWALK:WEST remai |
| 48 | 234 | hold | 0 | 0 | 0 |  | 0 | 1.289 | 8 | PEDESTRIAN_JAYWALK pedestrian=PED:62:0:CROSSWALK:NORTH |
| 49 | 236 | hold | 0 | 0 | 0 |  | 0 | -8.084 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:106:0:CROSSWALK:WEST rema |
| 50 | 238 | unverified | 1 | 0 | 4 |  | 0 | -1.513 | 8 | PEDESTRIAN_PATIENCE pedestrian=PED:95:0:CROSSWALK:SOUTH rema |
| 51 | 239 | hold | 0 | 0 | 0 |  | 0 | -8.758 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:91:0:CROSSWALK:EAST remai |
| 52 | 241 | fallback | 0 | 0 | 0 |  | 0 | -1.675 | 1 | PEDESTRIAN_JAYWALK pedestrian=PED:80:0:CROSSWALK:SOUTH; PEDE |
| 53 | 242 | hold | 0 | 0 | 0 |  | 0 | -4.083 | 5 | PEDESTRIAN_PATIENCE pedestrian=PED:113:0:CROSSWALK:WEST rema |
| 54 | 244 | hold | 0 | 0 | 0 |  | 0 | -3.583 | 2 | PEDESTRIAN_PATIENCE pedestrian=PED:98:0:CROSSWALK:NORTH rema |
| 55 | 246 | hold | 0 | 0 | 0 |  | 0 | -6.934 | 6 |  |
| 56 | 247 | verified | 8 | 0 | 64 |  | 0 | -4.983 | 5 | PEDESTRIAN_PATIENCE pedestrian=PED:115:0:CROSSWALK:EAST rema |
| 57 | 249 | hold | 0 | 0 | 0 |  | 0 | -5.534 | 3 | PEDESTRIAN_JAYWALK pedestrian=PED:81:0:CROSSWALK:WEST; PEDES |
| 58 | 252 | verified | 6 | 0 | 17 |  | 0 | -9.073 | 9 | PEDESTRIAN_PATIENCE pedestrian=PED:119:0:CROSSWALK:WEST rema |
| 59 | 257 | hold | 0 | 0 | 0 |  | 0 | -3.451 | 4 | PEDESTRIAN_JAYWALK pedestrian=PED:87:0:CROSSWALK:WEST |
| 60 | 259 | fallback | 0 | 0 | 0 |  | 0 | -2.414 | 1 | PEDESTRIAN_PATIENCE pedestrian=PED:111:0:CROSSWALK:NORTH rem |
| 61 | 260 | hold | 0 | 0 | 0 |  | 0 | -1.705 | 1 | PEDESTRIAN_JAYWALK pedestrian=PED:106:0:CROSSWALK:WEST |

