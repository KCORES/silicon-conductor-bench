# 运行分析：stealth-space-bunny-alpha_2026-10-01_114857334-21412

- 模型：stealth/space-bunny-alpha；种子 63916；规则版本 16；回放 schema 7
- 截止 tick 261，决策周期 56，最终余额 **692.7**
- 生成时间 2026-10-01T21:35:25.867Z；数据文件：replay_stealth-space-bunny-alpha_2026-10-01_114857334-21412.json、report_stealth-space-bunny-alpha_2026-10-01_114857334-21412.json、api-log_stealth-space-bunny-alpha_2026-10-01_114857334-21412.jsonl、raw-api-log_stealth-space-bunny-alpha_2026-10-01_114857334-21412.jsonl

## 1. 基础分析

### 1.1 上下文能力

- prompt tokens：平均 19899.4，P50 19029，P95 31983，最大 37183（n=234）
- completion tokens：平均 2912.9，P50 1702，P95 9424，最大 16384（n=234）；其中推理 tokens：平均 0，P50 0，P95 0，最大 0（n=234）
- 每周期 API 轮数：平均 4.2，P50 4，P95 7，最大 8（n=56）；上限 8，用满上限的周期 2 个
- 每次请求的平均字符数：系统提示 7723.4，user 16170.9，工具结果 3469.6，assistant 891.9；消息条数 平均 7.3，P50 7，P95 16，最大 18（n=234）
- 工具参数中的 ID 共 663 个：出现在当轮可见上下文里的占 1，当轮不可见但本局别处出现过 0 个，本局从未出现 0 个，非规范横道短键 0 个

| ID 类型 | 总数 | 当轮可见 | 别处出现 | 从未出现 | 非规范短键 |
| --- | --- | --- | --- | --- | --- |
| lane | 353 | 353 | 0 | 0 | 0 |
| crosswalk | 142 | 142 | 0 | 0 | 0 |
| vehicle | 65 | 65 | 0 | 0 | 0 |
| incident | 101 | 101 | 0 | 0 | 0 |
| route | 2 | 2 | 0 | 0 | 0 |

- 同一周期内重复提交已失败的相同调用：0 次 {}
- 提交类型：verified 16，unverified 12，hold 27；放行类提交中 verified 占 0.571
- working memory：调用 16 次 {"SAVE_PLAN":12,"PEEK_PLAN":4}，观测里带有计划的周期 40 个

### 1.2 注意力分布

关注率 = 字段出现在该周期观测里、且推理文本提到它的周期数 / 字段出现的周期数。

| 概念 | 出现周期 | 提到且出现 | 关注率 | 提到周期（含未出现） | 提及次数 |
| --- | --- | --- | --- | --- | --- |
| crosswalks | 56 | 56 | 1 | 56 | 3235 |
| pedestrianAlerts | 47 | 47 | 1 | 56 | 4515 |
| emergency | 56 | 56 | 1 | 56 | 1107 |
| candidateConflicts | 56 | 55 | 0.982 | 55 | 792 |
| timeBudget | 56 | 55 | 0.982 | 55 | 223 |
| stalledVehicles | 29 | 28 | 0.966 | 44 | 404 |
| recentCycles | 55 | 53 | 0.964 | 53 | 464 |
| stoplineCandidates | 56 | 53 | 0.946 | 53 | 306 |
| driverAlerts | 49 | 45 | 0.918 | 51 | 665 |
| dischargingLanes | 33 | 30 | 0.909 | 40 | 182 |
| revokedAdmissions | 30 | 26 | 0.867 | 39 | 350 |
| holds | 54 | 42 | 0.778 | 42 | 147 |
| lastSettlement | 55 | 40 | 0.727 | 41 | 192 |
| laneGuidance | 56 | 38 | 0.679 | 38 | 161 |
| activeVehicleMotions | 48 | 26 | 0.542 | 29 | 50 |
| workingMemory | 40 | 19 | 0.475 | 23 | 42 |
| laneMatrices | 0 | 0 |  | 56 | 992 |
| exits | 0 | 0 |  | 56 | 2058 |
| reservedUntil | 0 | 0 |  | 56 | 1080 |
| incidentBlocked | 0 | 0 |  | 38 | 504 |

中断响应：

| 中断类型 | 次数 | 有响应 | 响应率 | 判定规则 |
| --- | --- | --- | --- | --- |
| PEDESTRIAN_PATIENCE | 28 | 20 | 0.714 | 同周期任一试算或提交带 pedestrian_phases |
| PEDESTRIAN_JAYWALK | 17 | 2 | 0.118 | 推理文本提到了中断对象 ID |
| ACCIDENT_INTERRUPT | 18 | 17 | 0.944 | 同周期调用 inspect_incident / order_accident_clearance / set_lane_detour |
| VEHICLE_TAILGATE | 1 | 1 | 1 | 推理文本提到了中断对象 ID |
| VEHICLE_RED_LIGHT | 1 | 1 | 1 | 推理文本提到了中断对象 ID |

- 每次回复的推理字符数：平均 9893.8，P50 5437，P95 34285，最大 56380（n=234）

### 1.3 tool_call 准确性

- 工具调用 351 次，成功 251 次，成功率 0.715
- 失败分类：{"RESOURCE_CONFLICT":54,"LANE_HEAD_NOT_READY":18,"DRY_RUN_QUOTA_EXHAUSTED":7,"SCHEMA_ERROR":7,"NOT_LANE_HEAD":4,"TARGET_LANE_SLOT_OCCUPIED":3,"NOT_AT_STOPLINE":2,"PLANNING_HORIZON_EXCEEDED":2,"TARGET_NOT_ADJACENT":1,"TOOL_EXECUTION_ERROR":1,"SOURCE_NOT_SEVERED":1}
- 每次回复的工具调用数分布：{"0":1,"1":158,"2":45,"3":22,"4":6,"6":1,"8":1}；finish_reason：{"tool_calls":233,"length":1}
- API 错误 0 次 {}；回退周期 []
- 从未使用的工具：无

| 工具 | 调用 | 成功 | 成功率 | 结果分类 |
| --- | --- | --- | --- | --- |
| dry_run_admit | 108 | 28 | 0.259 | {"OK":28,"NOT_AT_STOPLINE":1,"LANE_HEAD_NOT_READY":16,"RESOURCE_CONFLICT":52,"DRY_RUN_QUOTA_EXHAUSTED":7,"PLANNING_HORIZON_EXCEEDED":2,"TOOL_EXECUTION_ERROR":1,"SCHEMA_ERROR":1} |
| commit_schedule | 58 | 53 | 0.914 | {"OK":53,"LANE_HEAD_NOT_READY":2,"NOT_AT_STOPLINE":1,"RESOURCE_CONFLICT":2} |
| dispatch_emergency_convoy | 11 | 5 | 0.455 | {"OK":5,"NOT_LANE_HEAD":4,"TARGET_NOT_ADJACENT":1,"TARGET_LANE_SLOT_OCCUPIED":1} |
| dispatch_tow_truck | 8 | 8 | 1 | {"OK":8} |
| reroute_queue_around_stall | 1 | 1 | 1 | {"OK":1} |
| inspect_lane_queue | 22 | 22 | 1 | {"OK":22} |
| guide_inbound_lane_change | 2 | 0 | 0 | {"TARGET_LANE_SLOT_OCCUPIED":2} |
| manage_working_memory | 16 | 10 | 0.625 | {"SCHEMA_ERROR":6,"OK":10} |
| inspect_crosswalk | 13 | 13 | 1 | {"OK":13} |
| inspect_incident | 55 | 55 | 1 | {"OK":55} |
| order_accident_clearance | 46 | 46 | 1 | {"OK":46} |
| set_lane_detour | 11 | 10 | 0.909 | {"OK":10,"SOURCE_NOT_SEVERED":1} |

错误样例：

- **NOT_AT_STOPLINE**
  - c3 t81 dry_run_admit：PAIR:N_S2_STRAIGHT:8|S_L1_LEFT:6 vs V00019,V00025；参数 `{"candidate_vehicle_ids":["V00022","V00033","V00036","V00019","V00027","V00034","V00056"]}`
  - c19 t182 commit_schedule：-；参数 `{"admit_vehicle_ids":["V00079","V00098","V00105","V00118","V00124","V00128"],"vehicle_speed_profiles":[{"vehicle_id":"V00079","speed_profile":"BURST"},{"vehicle_id":"V00098","speed_profile":"BURST"},{"vehicle_id":"V00105`
- **LANE_HEAD_NOT_READY**
  - c3 t81 dry_run_admit：Lane head is not ready: IN_N_L1_LEFT；参数 `{"lane_batches":[{"lane_id":"IN_N_L1_LEFT","top_n":1},{"lane_id":"IN_N_S1_STRAIGHT","top_n":2},{"lane_id":"IN_N_S2_STRAIGHT","top_n":2}]}`
  - c3 t81 commit_schedule：Lane head is not ready: IN_E_S1_STRAIGHT；参数 `{"lane_batches":[{"lane_id":"IN_E_S1_STRAIGHT","top_n":2,"speed_profile":"CRUISE"}],"sleep_ticks":10,"tactical_summary":"Cycle 3: dispatched zero-gap convoys for emergencies V00034 (S_L1) and V00036 (W_R1) — 6 vehicles c`
  - c4 t91 dry_run_admit：Lane head is not ready: IN_E_S1_STRAIGHT；参数 `{"candidate_vehicle_ids":["V00008"],"lane_batches":[{"lane_id":"IN_E_S1_STRAIGHT","top_n":2,"speed_profile":"CRUISE"},{"lane_id":"IN_E_R1_RIGHT","top_n":2,"speed_profile":"CRUISE"}]}`
- **RESOURCE_CONFLICT**
  - c8 t131 dry_run_admit：CROSSWALK:EAST:CELL:5:0 vs V00009；参数 `{"candidate_vehicle_ids":[],"lane_batches":[{"lane_id":"IN_W_S1_STRAIGHT","top_n":3,"speed_profile":"BURST"},{"lane_id":"IN_W_S2_STRAIGHT","top_n":3,"speed_profile":"BURST"},{"lane_id":"IN_E_S1_STRAIGHT","top_n":2,"speed`
  - c9 t141 dry_run_admit：PAIR:N_L1_LEFT:5|E_S1_STRAIGHT:8 vs V00056,V00149；参数 `{"candidate_vehicle_ids":["V00056"],"lane_batches":[{"lane_id":"IN_W_L1_LEFT","speed_profile":"BURST","top_n":4},{"lane_id":"IN_N_R1_RIGHT","speed_profile":"CRUISE","top_n":4},{"lane_id":"IN_E_R1_RIGHT","speed_profile":"`
  - c10 t142 dry_run_admit：CROSSWALK:EAST:CELL:7:0 vs V00084；参数 `{"lane_batches":[{"lane_id":"IN_N_L1_LEFT","top_n":2,"speed_profile":"CRUISE"},{"lane_id":"IN_N_R1_RIGHT","top_n":4,"speed_profile":"CRUISE"},{"lane_id":"IN_W_L1_LEFT","top_n":3,"speed_profile":"BURST"},{"lane_id":"IN_S_`
- **DRY_RUN_QUOTA_EXHAUSTED**
  - c9 t141 dry_run_admit：-；参数 `{"lane_batches":[{"lane_id":"IN_W_L1_LEFT","speed_profile":"BURST","top_n":4},{"lane_id":"IN_N_R1_RIGHT","speed_profile":"CRUISE","top_n":4},{"lane_id":"IN_E_R1_RIGHT","speed_profile":"CRUISE","top_n":2},{"lane_id":"IN_S`
  - c23 t186 dry_run_admit：-；参数 `{"lane_batches":[{"lane_id":"IN_W_R1_RIGHT","speed_profile":"CRUISE","top_n":3}]}`
  - c28 t204 dry_run_admit：-；参数 `{"lane_batches":[{"lane_id":"IN_E_R1_RIGHT","speed_profile":"BURST","top_n":3},{"lane_id":"IN_S_R1_RIGHT","speed_profile":"BURST","top_n":3},{"lane_id":"IN_N_R1_RIGHT","speed_profile":"BURST","top_n":3},{"lane_id":"IN_S_`
- **TARGET_LANE_SLOT_OCCUPIED**
  - c9 t141 guide_inbound_lane_change：-；参数 `{"vehicle_id":"V00087","target_lane":"IN_W_L1_LEFT"}`
  - c9 t141 guide_inbound_lane_change：-；参数 `{"vehicle_id":"V00072","target_lane":"IN_W_L1_LEFT"}`
  - c18 t181 dispatch_emergency_convoy：-；参数 `{"clearing_route_id":"E_S1_STRAIGHT","emergency_vehicle_id":"V00212","lane_id":"IN_E_R1_RIGHT"}`
- **SCHEMA_ERROR**
  - c12 t153 manage_working_memory：[ { "code": "too_big", "maximum": 80, "type": "string", "inclusive": true, "exact": false, "message": "String must contain at most 80 character(s)", "path": [ "；参数 `{"action":"SAVE_PLAN","plan_data":{"phase_name":"Late-game drain: clear blocked straights (S_S1/S_S2 @170, E_L1 @169, N_S1 @184) with lane_batches + ped phases","intended_duration":108,"resume_condition":"Tick ~165-175: `
  - c16 t176 manage_working_memory：[ { "code": "too_big", "maximum": 80, "type": "string", "inclusive": true, "exact": false, "message": "String must contain at most 80 character(s)", "path": [ "；参数 `{"action":"SAVE_PLAN","plan_data":{"phase_name":"FLUSH-THROUGH: all 9 stopline routes sit behind RESERVATION holds (N_R1 180, N_S1 184, E_L1 189, E_S2 192, E_S1 193, W_S2 198, N_S2/S_S1_GUIDED/W_L1 200)","intended_durati`
  - c29 t205 dry_run_admit：[ { "code": "invalid_type", "expected": "array", "received": "undefined", "path": [ "pedestrian_phases", 1, "directions" ], "message": "Required" } ]；参数 `{"lane_batches":[{"lane_id":"IN_S_S1_STRAIGHT","speed_profile":"BURST","top_n":3},{"lane_id":"IN_S_S2_STRAIGHT","speed_profile":"BURST","top_n":3},{"lane_id":"IN_S_R1_RIGHT","speed_profile":"CRUISE","top_n":2},{"lane_id"`
- **NOT_LANE_HEAD**
  - c15 t175 dispatch_emergency_convoy：-；参数 `{"lane_id":"IN_N_R1_RIGHT","emergency_vehicle_id":"V00101"}`
  - c23 t186 dispatch_emergency_convoy：-；参数 `{"emergency_vehicle_id":"V00212","lane_id":"IN_E_R1_RIGHT"}`
  - c30 t206 dispatch_emergency_convoy：-；参数 `{"lane_id":"IN_E_R1_RIGHT","emergency_vehicle_id":"V00212"}`
- **TARGET_NOT_ADJACENT**
  - c18 t181 dispatch_emergency_convoy：-；参数 `{"emergency_vehicle_id":"V00212","lane_id":"IN_E_R1_RIGHT","clearing_route_id":"E_R1_RIGHT"}`
- **PLANNING_HORIZON_EXCEEDED**
  - c19 t182 dry_run_admit：Admission planning horizon exceeded for V00136；参数 `{"lane_batches":[{"lane_id":"IN_E_L1_LEFT","top_n":8,"speed_profile":"BURST"}],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:NORTH","directions":["A_TO_B"]}]}`
  - c42 t233 dry_run_admit：Admission planning horizon exceeded for V00303；参数 `{"lane_batches":[{"lane_id":"IN_E_S1_STRAIGHT","top_n":8},{"lane_id":"IN_E_S2_STRAIGHT","top_n":6},{"lane_id":"IN_S_R1_RIGHT","top_n":6}],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:SOUTH","directions":["A_TO_B","B_T`
- **TOOL_EXECUTION_ERROR**
  - c28 t204 dry_run_admit：Admission plan exceeds 16 vehicles: 17；参数 `{"lane_batches":[{"lane_id":"IN_E_R1_RIGHT","top_n":3,"speed_profile":"BURST"},{"lane_id":"IN_S_R1_RIGHT","top_n":3,"speed_profile":"BURST"},{"lane_id":"IN_N_R1_RIGHT","top_n":3,"speed_profile":"BURST"},{"lane_id":"IN_S_`
- **SOURCE_NOT_SEVERED**
  - c32 t208 set_lane_detour：-；参数 `{"severed_lane_id":"IN_N_L1_LEFT","action":"HOLD_AT_STOPLINE"}`

### 1.4 Agent 能力

- 周期内工具序列（D=试算，C=提交，T=其他工具）：{"DDC":7,"TDDC":4,"TTTDDC":4,"DC":3,"TTDDC":3,"TTTTTTDC":3,"TTTTTTTDC":2,"TTTTDTDC":2,"TTTTTTDDC":2,"C":2,"TTDDCC":1,"TTDDDTTC":1,"DTTTDC":1,"DDTTC":1,"TTTTTDTTDC":1,"TTTDDTC":1,"TTTTTTTDDC":1,"TTTTTDDTTDC":1,"TTTTDDTC":1,"DDDC":1,"TTTDDDDTTC":1,"TTTTTDDTTCC":1,"TTTTDDC":1,"TTTTTTTTTTDDC":1,"TTTTTDDTTTC":1,"DTTDTTDC":1,"TTTTTDDTC":1,"TTTDDTTC":1,"DTDC":1,"DTDTC":1,"TTTTTDDC":1,"TTDTTTDTTTC":1,"TDDDC":1,"TTDDDC":1}
- 含提交的周期里先试算再提交的比例：0.964
- 提交构成：{"verified":16,"unverified":12,"hold":27,"reckless":1}；每周期放行车数 平均 2.7，P50 0，P95 12，最大 14（n=56）；共放行 150 辆
- 成功提交 53 次，其中使用 lane_batches 19 次；每次 top_n 合计 平均 2.7，P50 0，P95 12，最大 14（n=53）
- 速度档位：{"CRUISE":41,"BURST":14}；sleep_ticks：平均 8.6，P50 10，P95 10，最大 10（n=58） {"1":1,"2":1,"4":4,"5":4,"6":2,"7":1,"8":3,"9":1,"10":41}
- 工具使用：{"dry_run_admit":108,"commit_schedule":58,"inspect_incident":55,"order_accident_clearance":46,"inspect_lane_queue":22,"manage_working_memory":16,"inspect_crosswalk":13,"dispatch_emergency_convoy":11,"set_lane_detour":11,"dispatch_tow_truck":8,"guide_inbound_lane_change":2,"reroute_queue_around_stall":1}
- 决策开销：API 234 次，扣 4.68；非终结工具 293 次，扣 0.4395

与同条件 baseline 对比：

| 策略 | 最终余额 | 放行车辆 | 未服务负债 | 事故数 | 锁格扣费 | 上游积压 | 撞人 | 闯红灯罚 | 行人奖励 | 校车 | 拖车 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| stealth/space-bunny-alpha | 692.7 | 150 | 183.9 | 7 | 55.88 | 50.38 | 45 | 9.2 | 0 | 0 | 9.6 |
| baseline-balanced | 674.49 | 84 | 219.6 | 6 | 21.3 | 58.85 | 25 | 5.5 | 0 | 0 | 8.4 |
| baseline-balanced-bus | 659.61 | 87 | 208.1 | 4 | 90.26 | 53.27 | 5 | 4.9 | 0 | 0 | 6 |
| baseline-balanced-no-ped | 717.59 | 132 | 187.4 | 4 | 74.39 | 47.7 | 0 | 0 | 0 | 10 | 10.8 |
| baseline-longest-queue | 633.99 | 183 | 195.7 | 10 | 76.09 | 44.92 | 50 | 11.6 | 0 | 10 | 10.8 |
| baseline-random | 539.49 | 114 | 207.6 | 7 | 139.2 | 73.82 | 35 | 11 | 0 | 0 | 7.2 |
| baseline-search | 788.38 | 122 | 185.4 | 2 | 3.69 | 45.85 | 10 | 6.7 | 0 | 0 | 8.4 |

## 2. 进阶分析

### 2.1 逻辑推理

- 试算失败（不含额度用完）73 次；之后再试 42 次，其中改了参数 42 次，成功 17 次（0.405）；失败所在周期最终 verified 提交 11 次、hold 38 次
- 推理中"路线 X 经过/不经过 Y 横道"的断言 130 条，正确 100，错误 30，准确率 0.769；前半局 15/52 错，后半局 15/78 错
  - c15：「N_R1_RIGHT → east exit (crossing EAST」（实际经过 CROSSWALK:NORTH+CROSSWALK:WEST）
  - c15：「S_R1_RIGHT → west exit (crossing WEST」（实际经过 CROSSWALK:SOUTH+CROSSWALK:EAST）
  - c15：「W_R1_RIGHT → north exit (crossing NORTH」（实际经过 CROSSWALK:WEST+CROSSWALK:SOUTH）
  - c15：「S_R1_RIGHT vehicles cross the WEST」（实际经过 CROSSWALK:SOUTH+CROSSWALK:EAST）
  - c15：「W_R1_RIGHT crosses NORTH」（实际经过 CROSSWALK:WEST+CROSSWALK:SOUTH）
  - c15：「N_R1_RIGHT (emergency V00101, V00061, V00096) crosses EAST」（实际经过 CROSSWALK:NORTH+CROSSWALK:WEST）
  - c15：「E_R1_RIGHT crosses SOUTH」（实际经过 CROSSWALK:EAST+CROSSWALK:NORTH）
  - c15：「S_R1_RIGHT which should cross WEST」（实际经过 CROSSWALK:SOUTH+CROSSWALK:EAST）
- 推理写"安全/无冲突"但同一轮试算冲突：24 次
  - c8 r1 t131：「41 (E_S1) conflicts with V00056, V00057, V00031. Not with W straights? Let me check: conflicts list has V00141-V00056, V00141-V00057, V00141-V00031. So E_S1 is compatible with W_S1, W_S2, S lanes. - V00056 conflicts with V00052, V00035 (N_L1 vs S straights) — N_L1 blocked anyway. - V00057 conflicts with V00040, V00031 (N_S1 vs S」→ CROSSWALK:EAST:CELL:5:0 vs V00009
  - c9 r3 t141：「ed: V00056(N_L1), V00057(N_S1), V00031(W_L1). S_S2 (V00035) isn't in E_S1's conflict list. And S_S2's conflicts: V00079(E_L1), V00056(N_L1). So E_S1 + S_S2 are compatible.) Value comparison: - Option A: N_L1 (1.0) + W_L1 top3 (51 pax lane) + N_R1 top3 + E_R1 top2. - Option B: E_S1 top2 (2 pax total in lane - tiny) + S_S2 top3 (9」→ PAIR:N_L1_LEFT:5|E_S1_STRAIGHT:8 vs V00056,V00149
  - c10 r1 t142：「lict with each other (parallel). Hmm but N_L1 vs N_S1 not listed. OK. - N_S1-S_L1, N_S1-W_L1, N_S2-S_L1, N_S2-W_L1, W_L1-? W_L1 vs S_L1 same axis (southbound), no conflict. So conflicts: E_L1 ↔ (S_S1, S_S2, N_L1); N_L1 ↔ (S_S1, S_S2, E_S1); E_S1 ↔ (N_S1, W_L1); N_S1 ↔ (S_L1, W_L1); N_S2 ↔ (S_L1, W_L1); W_L1 ↔ (N_S1, N_S2, E_S1). 」→ CROSSWALK:EAST:CELL:7:0 vs V00084
  - c11 r1 t146：「1 W_S1_STRAIGHT Conflicts among heads: V00079 conflicts with V00052, V00035, V00051. V00164 vs V00057. V00057 vs V00051. V00047 vs V00051. V00035 vs V00051. So compatible sets: E_S1 (V00164) with... V00164 conflicts only with V00057. E_R1 (V00142) no conflicts listed. Note candidateConflicts only compares stopline heads same tic」→ CROSSWALK:NORTH:CELL:0:0 vs V00046
  - c12 r1 t153：「ts: V00191 (E_S2) conflicts with V00057 (N_S1) and V00052 (S_S1) and V00035 (S_S2). But N_S1, S_S1, S_S2 are all blocked routes. So admitting V00191 and V00169 should be fine. Hmm, but wait — S_R1_RIGHT has V00084, V00121 CROSSING currently, and V00169 is the head. There are active motions on S_R1_RIGHT. So admitting V00169 might be」→ CROSSWALK:EAST:CELL:7:0 vs V00084
  - c13 r1 t162：「ent candidates: - E_L1_LEFT: V00079 (passenger, waiting 64 ticks) — conflict with V00052 (S_S1) and V00035 (S_S2). - E_R1_RIGHT: V00159 (passenger, 25 ticks) — no conflict. - E_S1_STRAIGHT: V00179 — blocked (RESERVATION until 192). - E_S2_STRAIGHT: V00200 bus (40 pax) — blocked (RESERVATION until 190). - N_S1_STRAIGHT: V00057 tru」→ CROSSWALK:EAST:CELL:7:0 vs V00169
- 自我修正标记（Wait/Actually/Let me recheck…）：共 3215 次，每次回复 平均 13.7，P50 7，P95 48，最大 120（n=234）
- 认知模式 letterCounting：6 处
  - 「 there's nothing we can do — unless we could sleep more. Let me reconsider: maybe the sleep_ticks maximum of 10 is a schema constraint but the game might accept... no, must respect schema. Hmm, wait. Let me recount the API budget. "你有 8 轮 API" = 8 rounds of API. recentCycles shows cycle 2 and 3. Maybe cycle 1 also happened (recentCycles shows max 2). So cycles 1,2,3 done → 5 left. Tick 91 = after 4 cycles of 10」
  - 「Let me pick 6. Hmm, actually there's another thought: could I admit N_R1_RIGHT now despite the reservation (blockedUntilTick 180)? My dry-runs are used up. No. Commit sleep6. Fix lengths. phase_name ≤80 chars: "FLUSH reservations: N_R1@180 N_S1@184 E_L1@189 E_S2@192 W_S2@198 mass@200" — count: let's make it short: "FLUSH reservations then mass wave at t200" (40 chars). resume_condition ≤160: "t182 admit N」
  - 「save doesn't happen, I just have the old plan. And if commit doesn't happen... then it's not terminal? It says terminal. Ugh. I'll do them separately: manage now, then commit. Shorten phase_name to <=80 chars. "t215: SOUTH wave S_S1x3+S_S2x3+S_R1x2 + PED NORTH x2, EAST B_TO_A" — that's ~66 chars. Good. resume_condition <=160 chars. Then commit. Only one round of API left. Must commit now. Commit empty pla」
- 认知模式 idFormat：0 处

### 2.2 复杂环境博弈

**行人与车辆**

- 行人相位尝试 68 次，成功 4 次 {"RESOURCE_CONFLICT":52,"LANE_HEAD_NOT_READY":6,"OK":4,"DRY_RUN_QUOTA_EXHAUSTED":3,"PLANNING_HORIZON_EXCEEDED":2,"SCHEMA_ERROR":1}
- 实际放行 2 批 5 人；闯红灯 17 次 17 人；被撞 9 人；奖励 0，扣费 {"delay":1.03,"jaywalk":9.2,"strike":45}

行人相位冲突样例：

| 周期 | tick | 冲突偏移 at | 冲突 |
| --- | --- | --- | --- |
| 8 | 131 | 8 | CROSSWALK:EAST:CELL:5:0 vs V00009 |
| 10 | 142 | 2 | CROSSWALK:EAST:CELL:7:0 vs V00084 |
| 11 | 146 | 0 | CROSSWALK:NORTH:CELL:0:0 vs V00046 |
| 12 | 153 | 0 | CROSSWALK:EAST:CELL:7:0 vs V00084 |
| 13 | 162 | 0 | CROSSWALK:EAST:CELL:7:0 vs V00169 |
| 13 | 162 | 0 | CROSSWALK:WEST:CELL:0:0 vs V00053 |
| 14 | 166 | 0 | CROSSWALK:EAST:CELL:7:0 vs PED:11:0:CROSSWALK:EAST |
| 15 | 175 | 0 | CROSSWALK:EAST:CELL:7:0 vs V00194 |
| 15 | 175 | 0 | CROSSWALK:WEST:CELL:0:0 vs V00061 |
| 17 | 177 | 0 | CROSSWALK:EAST:CELL:7:1 vs INCIDENT |

在行人耐心告急（PATIENCE_CRITICAL）时放行、且路线经过该横道的车辆：195 车次

| 周期 | tick | 车辆 | 路线 | 横道 | 行人 | 剩余耐心 | 该行人后来被撞 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 142 | V00056 | N_L1_LEFT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 24 |  |
| 10 | 142 | V00068 | N_L1_LEFT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 24 |  |
| 11 | 146 | V00051 | W_S1_STRAIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 20 |  |
| 11 | 146 | V00051 | W_S1_STRAIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 24 | 是 |
| 11 | 146 | V00063 | W_S1_STRAIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 20 |  |
| 11 | 146 | V00063 | W_S1_STRAIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 24 | 是 |
| 11 | 146 | V00066 | W_S1_STRAIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 20 |  |
| 11 | 146 | V00066 | W_S1_STRAIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 24 | 是 |
| 11 | 146 | V00164 | E_S1_STRAIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 20 |  |
| 11 | 146 | V00164 | E_S1_STRAIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 24 | 是 |
| 11 | 146 | V00170 | E_S1_STRAIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 20 |  |
| 11 | 146 | V00170 | E_S1_STRAIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 24 | 是 |
| 11 | 146 | V00142 | E_R1_RIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 20 |  |
| 11 | 146 | V00148 | E_R1_RIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 20 |  |
| 12 | 153 | V00191 | E_S2_STRAIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 13 |  |

行人时间线：

| tick | 事件 | 横道 | 人数 |
| --- | --- | --- | --- |
| 166 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 176 | PED_COLLISION | CROSSWALK:EAST | 1 |
| 177 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 181 | PED_GRANT | CROSSWALK:WEST | 3 |
| 181 | PED_COLLISION | CROSSWALK:WEST | 1 |
| 185 | PED_COLLISION | CROSSWALK:WEST | 1 |
| 186 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 204 | PED_COLLISION | CROSSWALK:SOUTH | 1 |
| 205 | PED_JAYWALK | CROSSWALK:SOUTH | 1 |
| 206 | PED_GRANT | CROSSWALK:EAST | 2 |
| 207 | PED_COLLISION | CROSSWALK:EAST | 1 |
| 207 | PED_COLLISION | CROSSWALK:EAST | 1 |
| 211 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 213 | PED_COLLISION | CROSSWALK:NORTH | 1 |
| 215 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 225 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 228 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 234 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 234 | PED_COLLISION | CROSSWALK:EAST | 1 |
| 241 | PED_JAYWALK | CROSSWALK:SOUTH | 1 |
| 241 | PED_JAYWALK | CROSSWALK:SOUTH | 1 |
| 242 | PED_COLLISION | CROSSWALK:NORTH | 1 |
| 244 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 244 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 249 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 249 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 257 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 260 | PED_JAYWALK | CROSSWALK:WEST | 1 |

**事故处置**

| 事故 | 类型 | 发生 | 车辆 | 行人 | 首次响应 | 清障令 | 清障调用次数 | 关闭 | 事故后才放行、后来卷入 | 非模型放行（抢行） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| INC0001 | ANGLE_COLLISION | 176 | 2 | 1 | 177 | 177 | 7 | 200 |  |  |
| INC0002 | ANGLE_COLLISION | 181 | 2 | 2 | 182 | 182 | 6 | 199 |  | V00107 |
| INC0003 | PILEUP | 204 | 5 | 1 | 205 | 205 | 17 | 260 | V00072@205 V00093@207 |  |
| INC0004 | PILEUP | 207 | 3 | 2 | 207 | 207 | 8 | 228 |  | V00074 |
| INC0005 | ANGLE_COLLISION | 213 | 1 | 1 | 214 | 214 | 4 | 228 |  | V00210 |
| INC0006 | PILEUP | 234 | 4 | 1 | 235 | 235 | 3 | 260 |  | V00236 |
| INC0007 | ANGLE_COLLISION | 242 | 1 | 1 | 244 | 247 | 1 |  |  |  |

事故成本估算：

| 事故 | 最终严重度 | 锁格（含二次） | 开放拍数 | 危化品 | 校车 | 分摊锁格费 | 估算总成本 | 放行来源 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| INC0001 | SERIOUS | 41 | 24 |  |  | 6.638 | 11.638 | V00194@c12 V00204@c15 |
| INC0002 | SERIOUS | 32 | 18 |  |  | 3.886 | 13.886 | V00101@c17 V00107@c- |
| INC0003 | CRITICAL | 51 | 56 |  |  | 28.9 | 33.9 | V00129@c21 V00146@c21 V00085@c27 V00072@c27 V00093@c27 |
| INC0004 | CRITICAL | 31 | 21 |  |  | 6.587 | 16.587 | V00074@c- V00066@c27 V00045@c27 |
| INC0005 | SERIOUS | 15 | 15 |  |  | 1.518 | 6.518 | V00210@c- |
| INC0006 | CRITICAL | 22 | 26 |  |  | 5.788 | 10.788 | V00236@c- V00079@c43 V00216@c42 V00212@c43 |
| INC0007 | SERIOUS | 20 | 19 |  |  | 2.563 | 7.563 | V00185@c46 |

**司机抢行**

总计 {"redLight":1,"tailgate":1,"cutIn":2}

| 周期 | 类型 | 车辆 | 此前出现在 driverAlerts 的周期数 | 最后一次预警 | 卷入事故 |
| --- | --- | --- | --- | --- | --- |
| 18 | VEHICLE_TAILGATE | V00107 | 6 | IN_N_R1_RIGHT 距停止线 3 剩余 0 | INC0002 |
| 26 | VEHICLE_RED_LIGHT | V00074 | 0 |  | INC0004 |

**紧急车辆与抛锚**

紧急车辆延误扣费 0.231

| 车辆 | 首次进入 12 格 | 放行 tick | 等待拍数 | 最长静止 |
| --- | --- | --- | --- | --- |
| V00034 | 71 | 114 | 43 | 32 |
| V00036 | 71 | 102 | 31 | 21 |
| V00050 | 71 | 89 | 18 | 0 |
| V00056 | 81 | 142 | 61 | 56 |
| V00043 | 121 | 139 | 18 | 7 |
| V00096 | 141 | 172 | 31 | 25 |
| V00101 | 166 | 177 | 11 | 1 |
| V00212 | 175 | 234 | 59 | 25 |
| V00236 | 209 | 234 | 25 | 7 |
| V00256 | 214 |  |  | 26 |

拖车费 9.6，链式加价 0.356

| 车辆 | 车道 | 抛锚 | 派拖车 | 派车延迟 | 绕行 |
| --- | --- | --- | --- | --- | --- |
| V00014 | IN_S_R1_RIGHT | 64 | 101 | 37 | 91 |
| V00006 | IN_N_R1_RIGHT | 65 | 91 | 26 |  |
| V00029 | IN_W_S2_STRAIGHT | 143 | 146 | 3 |  |
| V00068 | IN_N_L1_LEFT | 145 | 162 | 17 |  |
| V00122 | IN_W_R1_RIGHT | 151 | 162 | 11 |  |
| V00063 | IN_W_S1_STRAIGHT | 153 | 162 | 9 |  |
| V00209 | IN_E_S1_STRAIGHT | 208 | 209 | 1 |  |
| V00126 | IN_S_R1_RIGHT | 239 | 242 | 3 |  |

### 2.3 亮眼操作与最差操作

周期价值 = 未卷入事故的放行车数 + 1.5×放行行人 + 2×成功的特情工具 − 归因事故成本。事故成本按锁格×开放时长分摊本局真实锁格扣费，再加撞人和校车罚款，平均分给放行了涉事车辆的周期。这是用于挑选证据的启发式，不是精确账目。

亮点事件：

| tick | 周期 | 类型 | 说明 |
| --- | --- | --- | --- |
| 71 | 2 | LARGE_VERIFIED_RELEASE | 12 vehicles, blame=0 |
| 81 | 3 | EMERGENCY_CONVOY | V00036 on IN_W_R1_RIGHT |
| 81 | 3 | EMERGENCY_CONVOY | V00034 on IN_S_L1_LEFT |
| 91 | 4 | TOW_DISPATCH | V00006 |
| 91 | 4 | STALL_REROUTE | V00074 around V00014 |
| 101 | 5 | TOW_DISPATCH | V00014 |
| 131 | 8 | LARGE_VERIFIED_RELEASE | 14 vehicles, blame=0 |
| 142 | 10 | LARGE_VERIFIED_RELEASE | 12 vehicles, blame=0 |
| 146 | 11 | TOW_DISPATCH | V00029 |
| 156 | 12 | LANE_GUIDANCE | V00097 IN_N_S2_STRAIGHT->IN_N_L1_LEFT |
| 162 | 13 | TOW_DISPATCH | V00063 |
| 162 | 13 | TOW_DISPATCH | V00068 |
| 162 | 13 | TOW_DISPATCH | V00122 |
| 174 | 14 | LANE_GUIDANCE | V00126 IN_S_S1_STRAIGHT->IN_S_R1_RIGHT |
| 181 | 18 | PED_GRANT | CROSSWALK:WEST A_TO_B+B_TO_A x3 |
| 184 | 21 | EMERGENCY_CONVOY | V00212 on IN_E_R1_RIGHT |
| 200 | 26 | EMERGENCY_CONVOY | V00212 on IN_E_R1_RIGHT |
| 205 | 29 | EMERGENCY_CONVOY | V00212 on IN_E_R1_RIGHT |
| 206 | 30 | PED_GRANT | CROSSWALK:EAST B_TO_A x2 |
| 209 | 33 | TOW_DISPATCH | V00209 |
| 242 | 48 | TOW_DISPATCH | V00126 |

#### 得分最高的周期

**周期 8（tick 131）**：放行 14，未出事 14，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -1.649，提交类型 verified，睡眠 10

- 观测要点：余额 991.84，停止线候选 14，受阻路线 5，行人预警 []，司机预警 [V00063:8, V00095:12]，紧急车 [V00043, V00056]，抛锚 []
- 工具序列：r1 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:EAST:CELL:5:0 vs V00009)；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 战术摘要：Cycle 8: broad verified wave (14 vehicles, est reward 12) — West straights top-3 BURST (incl. emergency V00043 behind V00030/V00037), East straight top-2 BURST (van V00141), plus all four open right-turn lanes (E_R1 top2, S_R1 top2 incl. 40-pax bus V00084, W_R1 top2 incl. school bus V00090). N/S str
- 推理摘录：Let me analyze the current state. Current tick 131, endTick 261, so 130 ticks remaining. Balance 991.84. Blocked routes by RESERVATION: - N_L1_LEFT until 141 - N_S1_STRAIGHT until 144 - N_S2_STRAIGHT until 143 - S_S1_STRAIGHT until 139 - W_L1_LEFT until 143 So unblocked routes available: E_L1_LEFT, E_R1_RIGHT, E_S1_STRAIGHT, S_L1_LEFT, S_R1_RIGHT, S_S2_STRAIGHT, W_R1_RIGHT, W_S1_STRAIGHT, W_S2_STRAIGHT. Wait, candidateConflicts: let me analyze which combos are conflict-free. Vehicles: - V00079 ( …… 0.04/person, ~2 people waiting). Yes — drop pedestrians to guarantee a verified commit. Let me dry run vehiclesonly. Verified: 14 vehicles, reward 12 (estimated revenue). Note V00084 (bus 40) clear tick 155 and V00090 (bus 40) clear 153 — they are slow. Now commit with sleep_ticks=10. Let me commit.

**周期 2（tick 71）**：放行 12，未出事 12，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -0.277，提交类型 verified，睡眠 10

- 观测要点：余额 999.89，停止线候选 9，受阻路线 2，行人预警 []，司机预警 []，紧急车 [V00034, V00036, V00050]，抛锚 [V00006, V00014]
- 工具序列：r1 dry_run_admit -> ok；r2 commit_schedule -> ok
- 战术摘要：Cycle 2: N-axis straight wave (N_S1 top4 incl. emergency V00050, N_S2 top4) + S_S1 top2 + E_S1 top2 = 12 vehicles; W axis held (W_S1/W_S2 mutually conflicting), S-left held (conflicts with W_S1 and N_S2). Sleep 10 to discharge.
- 推理摘录：Let me analyze the situation. Current tick 71, 190 ticks remaining. Balance 999.89. State: Several vehicles crossing. Emergency vehicles: - V00034 in IN_S_L1_LEFT, queueIndex 3, blocking V00019, V00027, distance 6, stationaryTicks 2. - V00036 in IN_W_R1_RIGHT, queueIndex 3, blocking V00022, V00033, distance 7, stationaryTicks 1. - V00050 in IN_N_S1_STRAIGHT, queueIndex 4, blocking V00015, V00020, V00032, distance 12. Emergency vehicles charge 0.0015/tick after 10 stationary ticks. That's small b ……  the queue moves forward as vehicles ahead are admitted, so it may move. Good. Let's dryrun. Verified, 12 vehicles, reward estimate 10.3. Commit with sleep 10. Note V00018 (E_S1) enters at 89 — because E_S1 reservation? It was delayed (scheduled at 89). Fine. Commit with same params, sleep_ticks=10.

**周期 10（tick 142）**：放行 12，未出事 12，放行行人 0，耐心风险放行 2，归因成本 0，周期余额变化 2.951，提交类型 verified，睡眠 10

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:11:0:CROSSWALK:EAST remaining=24
- 观测要点：余额 989.93，停止线候选 11，受阻路线 3，行人预警 [E:P24]，司机预警 [V00063:5, V00095:5]，紧急车 [V00056, V00096]，抛锚 []
- 工具序列：r1 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:EAST:CELL:7:0 vs V00084)；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 战术摘要：Cycle 10: verified 12-vehicle wave (est reward 7.8). N axis: L1 top-2 (releases emergency ambulance V00056 stuck 56 ticks) + R1 top-4 (includes ambulance V00096 at horizon). Left-turn pair W_L1 top-3 BURST + S_L1 top-3 BURST (S_L1 carries 110 queued pax). EAST crosswalk B_TO_A ped phase deferred: bl
- 推理摘录：Let me analyze the current situation. Tick 142, endTick 261, ticksRemaining 119. Balance 989.93. Key observations: - No active incident apparently (no incidentIds mentioned, no blocked INCIDENT routes). - Emergency V00056 (IN_N_L1_LEFT, distance 0, stationaryTicks 56) is waiting at the stopline — an emergency vehicle that has been stopped 56 ticks, costing 0.0015/tick. It's blocked because N_L1_LEFT route is presumably in use by crossing vehicles? Let's check: blockedRoutes shows E_L1_LEFT (unti …… 1 right) estimated clear ~159? Hmm, its clear wasn't shown here but dischargingLanes said estimatedClearTick 159 for IN_S_R1_RIGHT. That means the EAST ped phase may still be blocked next cycle. Hmm. We'll see; if V00084 has cleared by then we can release EAST peds. Let's commit with sleep_ticks 10.

**周期 5（tick 101）**：放行 9，未出事 9，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -2.509，提交类型 verified，睡眠 10

- 观测要点：余额 997.04，停止线候选 12，受阻路线 5，行人预警 []，司机预警 []，紧急车 [V00034, V00036, V00056]，抛锚 [V00006, V00014]
- 工具序列：r1 inspect_lane_queue -> ok；r1 inspect_lane_queue -> ok；r1 inspect_lane_queue -> ok；r1 inspect_lane_queue -> ok；r1 inspect_lane_queue -> ok；r1 inspect_lane_queue -> ok；r2 dispatch_tow_truck -> ok；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 战术摘要：Cycle 5: paid tow (1.2) for stalled V00014 in S_R1_RIGHT to release a 48-passenger queue; verified E-phase dispatch (E_S1 top3 incl. 40-pax bus V00042, E_S2 top3 incl. two ~40-pax buses, E_R1 V00082) plus W_S1 top2 = 12.7 expected revenue. Holding N_L1 emergency V00056 (conflicts with E straights) a
- 推理摘录：Let me analyze the current state. Current tick 101, endTick 261, 160 ticks remaining. Balance 997.0445. Key observations: - No incidents currently listed (blockedRoutes all RESERVATION). - Two stalled vehicles: V00006 in IN_N_R1_RIGHT (tow en route, completes tick 109), V00014 in IN_S_R1_RIGHT (blocked behind 4). - Emergency vehicles: V00034 (stationary 32 ticks, blocking), V00036 (at distance 1, scheduled entering tick 102), V00056 (emergency in IN_N_L1_LEFT, distance 0, stationary 15 ticks — i …… x = 8.1, E_S1 42 = 4.2, E_R1 2 = 0.2, W_S1 (V00012 1 + V00023 ?) — total 12.7 means W_S1 two vehicles = 0.2? 4.2+8.1+0.2 = 12.5, +0.2 = 12.7. So V00023 has 1 pax. OK. Now commit with identical params, sleep 10. Tow for V00014 completes at 119 → cycle 6 (tick 111) not yet, cycle 7 (~121) yes. Commit.

**周期 13（tick 162）**：放行 3，未出事 3，放行行人 0，耐心风险放行 5，归因成本 0，周期余额变化 3.018，提交类型 unverified，睡眠 10

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:20:0:CROSSWALK:NORTH remaining=24
- 观测要点：余额 988.42，停止线候选 8，受阻路线 4，行人预警 [E:P4, N:P24, E:P15, W:P8]，司机预警 [V00095:0, V00107:0, V00112:0, V00054:2, V00114:4, V00089:5, V00124:6, V00178:7]，紧急车 [V00096]，抛锚 [V00029, V00063, V00068, V00122]
- 工具序列：r1 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:EAST:CELL:7:0 vs V00169)；r1 dispatch_tow_truck -> ok；r1 dispatch_tow_truck -> ok；r1 dispatch_tow_truck -> ok；r2 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:WEST:CELL:0:0 vs V00053)；r3 commit_schedule -> ok
- 战术摘要：Cycle 13: both dry-run slots burned on pedestrian phases (EAST cell held by V00169, WEST cell held by V00053) so no top_n>=2 wave is verifiable this cycle. Fall back to the 3 conflict-free stopline heads: S_S1 straight V00052, S_S2 HAZMAT truck V00035, E_R1 right V00159. Tows dispatched for stalled 
- 推理摘录：Let me analyze the current state. Tick 162, 99 ticks remaining. Balance 988.42, started at 1000 — we're down ~11.6. Last settlement: revenue only 0.1, costs: upstream 1.234, delay 0.9582, api 0.06. Net -2.21. Key problems: - Big queues everywhere, stalled vehicles with tow already en route (V00029 clears at 164). - upstream queues: IN_N_S2 7, IN_S_L1 1, IN_S_S1 4, IN_W_S1 4, IN_W_S2 5 = 21 vehicles upstream, each passenger 0.002/tick — that's expensive. - Stall chain not active yet (stallChain 0 …… 92): E_S2 bus + E_S1 + N_S1. Cycle 17: N_S2... OK commit now. Also note: I should double-check whether committing while V00169 occupies the EAST crosswalk cell matters — we're not admitting EAST-crossing vehicles. S_S1/S_S2 straights exit north, E_R1 right exits north. Should be fine. Let me commit.

#### 损失最大的周期

**周期 27（tick 201）**：放行 8，未出事 3，放行行人 0，耐心风险放行 14，归因成本 36.93，周期余额变化 3.81，提交类型 verified，睡眠 7

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:61:0:CROSSWALK:EAST remaining=24
- 观测要点：余额 976.3，停止线候选 9，受阻路线 5，行人预警 [N:J0, S:P4, N:P7, E:P10, N:P10, E:P24]，司机预警 [V00045:0, V00109:0, V00055:0, V00085:0, V00062:0, V00089:0, V00087:0, V00105:0]，紧急车 [V00212]，抛锚 []
- 工具序列：r1 manage_working_memory -> ok；r1 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:EAST:CELL:5:1 vs V00045)；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 后果：INC0003 PILEUP tick=204 vehicles=5 pedestrians=1 estCost=33.9；INC0004 PILEUP tick=207 vehicles=3 pedestrians=2 estCost=16.587
- 战术摘要：Verified W-axis straights (W_S1 x3, W_S2 x3) + S_L1_LEFT x2 all BURST, expected reward 5.0. EAST pedestrian phase is mutually exclusive with W_S2 route (cell 5:1 conflict), so skipped; W straights take priority. Sleep 7 so that at t208 I can legally absorb tailgate-risk V00095 (W_S2) before V00087 e
- 推理摘录：Let me analyze the situation at tick 201, 60 ticks remaining. Balance: 976.30. We're in a losing spiral. Let me think about what's most profitable. Key facts: - E-axis straights are discharging (V00179, V00195, V00209, V00200, V00220, V00226 committed at tick 200, entering 205-211). estimatedClearTick 221-224. - W_R1_RIGHT still discharging: V00129 CROSSING, V00146 enter 204, V00172 enter 217, clear 236. - Blocked routes are RESERVATION: N_L1_LEFT until 219, N_S1_STRAIGHT until 221, N_S2_STRAIGH ……  Hmm, then the dry run's top_n applies to candidates only. So I'd specify candidate_vehicle_ids: ["V00095"] — explicit admit. That works. OK: sleep 7. Let's commit. Commit params must match dry run exactly: lane_batches as given, no admit_vehicle_ids, no vehicle_speed_profiles, no pedestrian_phases.

**周期 17（tick 177）**：放行 1，未出事 0，放行行人 0，耐心风险放行 4，归因成本 13.89，周期余额变化 -1.522，提交类型 unverified，睡眠 8

- 唤醒原因：PEDESTRIAN_JAYWALK pedestrian=PED:24:0:CROSSWALK:EAST; ACCIDENT_INTERRUPT incident=INC0001 locked=CROSSWALK:EAST:CELL:7:0,CROSSWALK:EAST:CELL:7:1,PAIR:S_R1_RIGHT:4|S_S1_GUIDED_RIGHT:5,PAIR:S_R1_RIGHT:
- 观测要点：余额 985.62，停止线候选 9，受阻路线 12，行人预警 [E:J0, N:P9, W:P0, W:P22, W:P23]，司机预警 [V00107:0, V00089:0, V00095:0, V00118:0, V00080:0, V00124:0, V00112:0, V00114:0]，紧急车 [V00101, V00212]，抛锚 [V00063, V00068, V00122]
- 工具序列：r1 inspect_incident -> ok；r1 inspect_crosswalk -> ok；r2 order_accident_clearance -> ok；r3 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:EAST:CELL:7:1 vs INCIDENT)；r4 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:NORTH:CELL:0:0 vs V00101)；r5 commit_schedule -> ok
- 后果：INC0002 ANGLE_COLLISION tick=181 vehicles=2 pedestrians=2 estCost=13.886
- 战术摘要：Cycle 17: both dry-runs rejected — EAST crosswalk cell 7 is locked by INC0001, and the NORTH phase collides with the emergency V00101 path. Started INC0001 clearance toward OUT_EAST_0 (V00194 sliding out). No admissible stopline head this cycle except the emergency V00101 on the open N_R1_RIGHT rout
- 推理摘录：Let me analyze the situation. Current tick 177, end tick 261, 84 ticks remaining. Balance 985.62. Last settlement showed -6.09 due to a pedestrian strike (5) and jaywalk (0.6). We need to recover. Key facts: - INC0001 is active, locking cells including CROSSWALK:EAST:CELL:7. Need inspect_incident and order_accident_clearance. - Three tow trucks en route, completion tick 180 (3 ticks away). - Blocked routes by RESERVATION: E_L1_LEFT until 189, E_S1 193, E_S2 192, N_S1 184, N_S2 200, W_L1 200, W_S …… working memory plan update? manage_working_memory costs 0.0015 + API 0.02. It might be useful for continuity but the phase name is already saved. I'll skip to save budget... Actually the workingMemoryTop says "FLUSH reservations, mass admit wave at t200" which is roughly consistent. Skip. Commitnow.

**周期 21（tick 184）**：放行 3，未出事 1，放行行人 0，耐心风险放行 3，归因成本 13.56，周期余额变化 -5.745，提交类型 verified，睡眠 10

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:43:0:CROSSWALK:NORTH remaining=24
- 观测要点：余额 980.89，停止线候选 14，受阻路线 21，行人预警 [E:J0, N:P2, S:P21, N:P24]，司机预警 [V00085:0, V00089:0, V00105:0, V00095:0, V00112:0, V00118:0, V00080:0, V00124:0]，紧急车 [V00212]，抛锚 []
- 工具序列：r1 inspect_incident -> ok；r1 inspect_incident -> ok；r1 inspect_crosswalk -> ok；r2 order_accident_clearance -> ok；r2 order_accident_clearance -> ok；r2 dispatch_emergency_convoy -> ok；r3 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:SOUTH:CELL:7:0 vs INCIDENT)；r4 dry_run_admit -> ok；r5 commit_schedule -> ok
- 后果：INC0003 PILEUP tick=204 vehicles=5 pedestrians=1 estCost=33.9
- 战术摘要：Convoyed emergency V00212 out of E_R1_RIGHT (4 vehicles released, +revenue). Both INC0001/INC0002 already evacuating (no_op confirms), so no re-tasking. SOUTH/NORTH pedestrian phases both physically blocked by incident-locked crosswalk cells — skipped. Committed verified W_R1_RIGHT top-3 CRUISE (V00
- 推理摘录：Key situation: - INC0001: serious, clearance est 16 ticks, secondary collision risk. Vehicles ACCIDENT_STOPPED on S_R1_RIGHT. suggested evac lane OUT_EAST_0. But exitHolds shows OUT_EAST_0 occupied blockedUntilTick 192. Hmm, exit holds: OUT_EAST_0 occupied, OUT_NORTH_2 occupied, both until 192. OUT_SOUTH_1 and OUT_SOUTH_2 free. - INC0002: clearance est 12 ticks, no secondary risk. suggested lanes OUT_SOUTH_1, OUT_WEST_0. OUT_SOUTH_1 is free. Previous cycle already ordered clearance? The summary  …… 0192, V00201, V00210, V00212 on E_R1_RIGHT already. Let me save a working memory note? That costs 0.02. Given limited rounds, I'll skip and keep it in the commit summary. Actually workingMemoryTop exists already and is valid ("FLUSH reservations, mass admit wave at t200"). I'll leave it. Commit now.

**周期 46（tick 238）**：放行 1，未出事 0，放行行人 0，耐心风险放行 5，归因成本 7.56，周期余额变化 -6.289，提交类型 unverified，睡眠 10

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:95:0:CROSSWALK:SOUTH remaining=24
- 观测要点：余额 921.81，停止线候选 10，受阻路线 26，行人预警 [W:P22, N:J0, N:J0, N:J0, N:J0, S:P3, W:P11, N:P6, S:P3, W:P19, N:P6, E:P11, S:P24]，司机预警 [V00047:0, V00071:0, V00081:0, V00087:0, V00109:0, V00055:0, V00095:0, V00135:0]，紧急车 [V00256]，抛锚 []
- 工具序列：r1 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:EAST:CELL:0:0 vs INCIDENT)；r1 inspect_incident -> ok；r2 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:NORTH:CELL:0:0 vs V00185)；r2 order_accident_clearance -> ok；r3 commit_schedule -> ok
- 后果：INC0007 ANGLE_COLLISION tick=242 vehicles=1 pedestrians=1 estCost=7.563
- 战术摘要：INC0003 (CRITICAL PILEUP, 5 vehicles) re-targeted to evac OUT_NORTH_3; nothing able to start yet. Every E/N/W route plus S_L1 severed; S_S1/S_S2 only RESERVATION (249/251). Only legal vehicle route this cycle is N_R1_RIGHT, and CROSSWALK:EAST/SOUTH/WEST phase cells are incident-locked while NORTH ph
- 推理摘录：Let me analyze the situation. We're at tick 238, endTick 261, 23 ticks remaining. Balance 921.81. Key facts: - Most routes are severed by incidents INC0003 and INC0006 (PILEUPs). - Only open routes: N_R1_RIGHT? Let me check. blockedRoutes includes N_R1_GUIDED_STRAIGHT (INC0003) but N_R1_RIGHT is NOT in the blocked list. S_R1_RIGHT not blocked either. S_S1_STRAIGHT reservation until 249, S_S2_STRAIGHT reservation until 251. - Active lane holds: N_S1, W_L1, W_S2 (from INC0003). - Previous cycle: p …… dmitted, will they red-light run? Their drivers: normal patience 100-140; they've waited a while. V00185 waited 88 ticks. The followers V00202/V00215 have waited maybe 60-70. Patience likely not exhausted. The driverAlerts list doesn't include them. So no immediate red-light risk. OK. Let me commit.

**周期 43（tick 234）**：放行 10，未出事 7，放行行人 0，耐心风险放行 30，归因成本 7.19，周期余额变化 -6.795，提交类型 verified，睡眠 10

- 唤醒原因：PEDESTRIAN_JAYWALK pedestrian=PED:62:0:CROSSWALK:NORTH
- 观测要点：余额 934.22，停止线候选 13，受阻路线 15，行人预警 [N:J0, N:J0, E:J0, N:J0, N:J0, S:P7, W:P15, N:P10, S:P7, W:P23, N:P10, E:P15]，司机预警 [V00047:0, V00071:0, V00079:0, V00081:0, V00087:0, V00109:0, V00055:0, V00095:0]，紧急车 [V00212, V00236, V00256]，抛锚 []
- 工具序列：r1 dry_run_admit -> LANE_HEAD_NOT_READY (Lane head is not ready: IN_E_S1_STRAIGHT)；r1 inspect_incident -> ok；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 后果：INC0006 PILEUP tick=234 vehicles=4 pedestrians=1 estCost=10.788
- 战术摘要：INC0003 re-inspected: CRITICAL PILEUP, est 26t clear (~tick 260), so no detour/hold change; 13 severed routes stay dead. Dry run #1 failed (IN_E_S1_STRAIGHT head not ready). Dry run #2 verified the East wave E_R1 top5 + E_S2 top3 + E_L1 top2 (proj reward 4.5): captures emergency V00212 (25 ticks sta
- 推理摘录：Let me analyze the current state carefully. Current tick 234, endTick 261, 27 ticks remaining. Balance 934.2174. We have 8 rounds of API calls. Let's think about what maximizes balance. Key observations: - INC0003 is a CRITICAL PILEUP blocking 13 routes until tick 260 estimate. So N_S1_STRAIGHT, N_S2_STRAIGHT, S_L1_LEFT, W_L1_LEFT, W_S1_STRAIGHT, W_S2_STRAIGHT, W_R1_RIGHT are all severed. - Available routes for heads: - IN_E_L1_LEFT → E_L1_LEFT (not blocked) ✓ - IN_E_R1_RIGHT → E_R1_RIGHT (not b …… nters at 254). Hmm, let's simplify: commit East plan, sleep 10. Then evaluate. Let me write the commit with exact same params: lane_batches: E_R1 top5, E_S2 top3, E_L1 top2, no pedestrian_phases, no admit_vehicle_ids, no vehicle_speed_profiles. sleep_ticks: 10. tactical_summary: describe. Let me go.

### 附：逐周期一览

| 周期 | tick | 提交 | 放行 | 行人 | 耐心风险 | 归因事故 | 归因成本 | 余额变化 | 睡眠 | 唤醒原因 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 61 | verified | 8 | 0 | 0 |  | 0 | -0.11 | 10 |  |
| 2 | 71 | verified | 12 | 0 | 0 |  | 0 | -0.277 | 10 |  |
| 3 | 81 | hold | 0 | 0 | 0 |  | 0 | -0.517 | 10 |  |
| 4 | 91 | unverified | 1 | 0 | 0 |  | 0 | -2.051 | 10 |  |
| 5 | 101 | verified | 9 | 0 | 0 |  | 0 | -2.509 | 10 |  |
| 6 | 111 | verified | 6 | 0 | 0 |  | 0 | -1.616 | 10 |  |
| 7 | 121 | verified | 7 | 0 | 0 |  | 0 | -1.083 | 10 |  |
| 8 | 131 | verified | 14 | 0 | 0 |  | 0 | -1.649 | 10 |  |
| 9 | 141 | hold | 0 | 0 | 0 |  | 0 | -0.255 | 10 |  |
| 10 | 142 | verified | 12 | 0 | 2 |  | 0 | 2.951 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:11:0:CROSSWALK:EAST remai |
| 11 | 146 | verified | 7 | 0 | 12 |  | 0 | -2.257 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:3:0:CROSSWALK:WEST remain |
| 12 | 153 | verified | 3 | 0 | 7 | INC0001 | 5.82 | -2.208 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:24:0:CROSSWALK:EAST remai |
| 13 | 162 | unverified | 3 | 0 | 5 |  | 0 | 3.018 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:20:0:CROSSWALK:NORTH rema |
| 14 | 166 | hold | 0 | 0 | 0 |  | 0 | 0.663 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:11:0:CROSSWALK:EAST |
| 15 | 175 | unverified | 9 | 0 | 14 | INC0001 | 5.82 | -0.385 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:44:0:CROSSWALK:WEST remai |
| 16 | 176 | hold | 0 | 0 | 0 |  | 0 | -6.093 | 4 | PEDESTRIAN_PATIENCE pedestrian=PED:45:1:CROSSWALK:WEST remai |
| 17 | 177 | unverified | 1 | 0 | 4 | INC0002 | 13.89 | -1.522 | 8 | PEDESTRIAN_JAYWALK pedestrian=PED:24:0:CROSSWALK:EAST; ACCID |
| 18 | 181 | unverified | 0 | 0 | 0 |  | 0 | -1.558 | 6 | PEDESTRIAN_PATIENCE pedestrian=PED:38:0:CROSSWALK:SOUTH rema |
| 19 | 182 | - | 0 | 0 | 0 |  | 0 | -0.902 | 10 | ACCIDENT_INTERRUPT incident=INC0002 locked=CROSSWALK:WEST:CE |
| 20 | 183 | verified | 4 | 0 | 4 |  | 0 | -0.75 | 10 | ACCIDENT_INTERRUPT incident=INC0001 secondary=true |
| 21 | 184 | verified | 3 | 0 | 3 | INC0003 | 13.56 | -5.745 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:43:0:CROSSWALK:NORTH rema |
| 22 | 185 | hold | 0 | 0 | 0 |  | 0 | -1.25 | 10 | ACCIDENT_INTERRUPT incident=INC0002 locked=CROSSWALK:NORTH:C |
| 23 | 186 | hold | 0 | 0 | 0 |  | 0 | 3.786 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:20:0:CROSSWALK:NORTH |
| 24 | 187 | hold | 0 | 0 | 0 |  | 0 | 0.435 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:45:0:CROSSWALK:EAST remai |
| 25 | 197 | hold | 0 | 0 | 0 |  | 0 | -1.331 | 5 |  |
| 26 | 200 | verified | 6 | 0 | 6 |  | 0 | -0.48 | 10 | VEHICLE_RED_LIGHT vehicle=V00074 route=S_S1_GUIDED_RIGHT |
| 27 | 201 | verified | 8 | 0 | 14 | INC0003 INC0004 | 36.93 | 3.81 | 7 | PEDESTRIAN_PATIENCE pedestrian=PED:61:0:CROSSWALK:EAST remai |
| 28 | 204 | verified | 7 | 0 | 28 |  | 0 | -6.273 | 5 | PEDESTRIAN_PATIENCE pedestrian=PED:68:0:CROSSWALK:NORTH rema |
| 29 | 205 | hold | 0 | 0 | 0 |  | 0 | -0.017 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:38:0:CROSSWALK:SOUTH; ACCI |
| 30 | 206 | unverified | 0 | 0 | 0 |  | 0 | -10.923 | 10 | ACCIDENT_INTERRUPT incident=INC0003 secondary=true |
| 31 | 207 | hold | 0 | 0 | 0 |  | 0 | -0.294 | 10 | ACCIDENT_INTERRUPT incident=INC0003 secondary=true; ACCIDENT |
| 32 | 208 | unverified | 0 | 0 | 0 |  | 0 | -0.331 | 5 | ACCIDENT_INTERRUPT incident=INC0004 secondary=true; ACCIDENT |
| 33 | 209 | hold | 0 | 0 | 0 |  | 0 | -2.562 | 6 | ACCIDENT_INTERRUPT incident=INC0004 secondary=true |
| 34 | 210 | hold | 0 | 0 | 0 |  | 0 | -2.022 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:62:0:CROSSWALK:NORTH rema |
| 35 | 211 | hold | 0 | 0 | 0 |  | 0 | -7.765 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:50:0:CROSSWALK:NORTH |
| 36 | 214 | hold | 0 | 0 | 0 |  | 0 | -2.014 | 10 | ACCIDENT_INTERRUPT incident=INC0005 locked=CROSSWALK:NORTH:C |
| 37 | 215 | unverified | 1 | 0 | 2 |  | 0 | 1.303 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:43:0:CROSSWALK:NORTH |
| 38 | 217 | hold | 0 | 0 | 0 |  | 0 | -4.501 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:80:0:CROSSWALK:SOUTH rema |
| 39 | 220 | hold | 0 | 0 | 0 |  | 0 | -3.512 | 8 | PEDESTRIAN_PATIENCE pedestrian=PED:82:0:CROSSWALK:NORTH rema |
| 40 | 225 | verified | 3 | 0 | 6 |  | 0 | -1.704 | 4 | PEDESTRIAN_PATIENCE pedestrian=PED:81:0:CROSSWALK:WEST remai |
| 41 | 228 | hold | 0 | 0 | 0 |  | 0 | -7.022 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:68:0:CROSSWALK:NORTH |
| 42 | 233 | unverified | 14 | 0 | 50 | INC0006 | 3.6 | 1.739 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:87:0:CROSSWALK:WEST remai |
| 43 | 234 | verified | 10 | 0 | 30 | INC0006 | 7.19 | -6.795 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:62:0:CROSSWALK:NORTH |
| 44 | 235 | hold | 0 | 0 | 0 |  | 0 | -1.887 | 10 | ACCIDENT_INTERRUPT incident=INC0006 locked=CROSSWALK:EAST:CE |
| 45 | 236 | unverified | 1 | 0 | 3 |  | 0 | -3.724 | 4 | PEDESTRIAN_PATIENCE pedestrian=PED:106:0:CROSSWALK:WEST rema |
| 46 | 238 | unverified | 1 | 0 | 5 | INC0007 | 7.56 | -6.289 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:95:0:CROSSWALK:SOUTH rema |
| 47 | 241 | hold | 0 | 0 | 0 |  | 0 | -1.961 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:80:0:CROSSWALK:SOUTH; PEDE |
| 48 | 242 | hold | 0 | 0 | 0 |  | 0 | -8.251 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:113:0:CROSSWALK:WEST rema |
| 49 | 243 | hold | 0 | 0 | 0 |  | 0 | -2.471 | 10 | ACCIDENT_INTERRUPT incident=INC0007 locked=CROSSWALK:NORTH:C |
| 50 | 244 | unverified | 0 | 0 | 0 |  | 0 | -6.275 | 5 | PEDESTRIAN_PATIENCE pedestrian=PED:98:0:CROSSWALK:NORTH rema |
| 51 | 247 | hold | 0 | 0 | 0 |  | 0 | -4.795 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:115:0:CROSSWALK:EAST rema |
| 52 | 249 | hold | 0 | 0 | 0 |  | 0 | -6.628 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:81:0:CROSSWALK:WEST; PEDES |
| 53 | 252 | hold | 0 | 0 | 0 |  | 0 | -10.498 | 9 | PEDESTRIAN_PATIENCE pedestrian=PED:119:0:CROSSWALK:WEST rema |
| 54 | 257 | hold | 0 | 0 | 0 |  | 0 | -4.454 | 4 | PEDESTRIAN_JAYWALK pedestrian=PED:87:0:CROSSWALK:WEST |
| 55 | 259 | hold | 0 | 0 | 0 |  | 0 | -2.059 | 2 | PEDESTRIAN_PATIENCE pedestrian=PED:111:0:CROSSWALK:NORTH rem |
| 56 | 260 | hold | 0 | 0 | 0 |  | 0 | -1.431 | 1 | PEDESTRIAN_JAYWALK pedestrian=PED:106:0:CROSSWALK:WEST |

