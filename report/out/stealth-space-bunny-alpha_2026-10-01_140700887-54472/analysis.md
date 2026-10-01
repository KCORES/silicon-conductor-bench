# 运行分析：stealth-space-bunny-alpha_2026-10-01_140700887-54472

- 模型：stealth/space-bunny-alpha；种子 63916；规则版本 16；回放 schema 7
- 截止 tick 261，决策周期 49，最终余额 **638.02**
- 生成时间 2026-10-01T21:35:29.496Z；数据文件：replay_stealth-space-bunny-alpha_2026-10-01_140700887-54472.json、report_stealth-space-bunny-alpha_2026-10-01_140700887-54472.json、api-log_stealth-space-bunny-alpha_2026-10-01_140700887-54472.jsonl、raw-api-log_stealth-space-bunny-alpha_2026-10-01_140700887-54472.jsonl

## 1. 基础分析

### 1.1 上下文能力

- prompt tokens：平均 19340.8，P50 19783，P95 28859，最大 43485（n=191）
- completion tokens：平均 2859.2，P50 1406，P95 9303，最大 16384（n=191）；其中推理 tokens：平均 0，P50 0，P95 0，最大 0（n=191）
- 每周期 API 轮数：平均 3.9，P50 4，P95 6，最大 7（n=49）；上限 8，用满上限的周期 0 个
- 每次请求的平均字符数：系统提示 7723.3，user 15936.7，工具结果 4914.3，assistant 806.9；消息条数 平均 6.9，P50 6，P95 15，最大 19（n=191）
- 工具参数中的 ID 共 541 个：出现在当轮可见上下文里的占 1，当轮不可见但本局别处出现过 0 个，本局从未出现 0 个，非规范横道短键 0 个

| ID 类型 | 总数 | 当轮可见 | 别处出现 | 从未出现 | 非规范短键 |
| --- | --- | --- | --- | --- | --- |
| crosswalk | 121 | 121 | 0 | 0 | 0 |
| lane | 289 | 289 | 0 | 0 | 0 |
| vehicle | 32 | 32 | 0 | 0 | 0 |
| route | 1 | 1 | 0 | 0 | 0 |
| incident | 98 | 98 | 0 | 0 | 0 |

- 同一周期内重复提交已失败的相同调用：0 次 {}
- 提交类型：verified 15，unverified 10，hold 22；放行类提交中 verified 占 0.6
- working memory：调用 12 次 {"SAVE_PLAN":6,"PEEK_PLAN":6}，观测里带有计划的周期 48 个

### 1.2 注意力分布

关注率 = 字段出现在该周期观测里、且推理文本提到它的周期数 / 字段出现的周期数。

| 概念 | 出现周期 | 提到且出现 | 关注率 | 提到周期（含未出现） | 提及次数 |
| --- | --- | --- | --- | --- | --- |
| crosswalks | 49 | 49 | 1 | 49 | 2593 |
| pedestrianAlerts | 40 | 40 | 1 | 46 | 3353 |
| revokedAdmissions | 12 | 12 | 1 | 27 | 208 |
| candidateConflicts | 49 | 48 | 0.98 | 48 | 533 |
| stalledVehicles | 24 | 23 | 0.958 | 35 | 360 |
| recentCycles | 48 | 46 | 0.958 | 46 | 352 |
| timeBudget | 49 | 46 | 0.939 | 46 | 223 |
| emergency | 49 | 45 | 0.918 | 45 | 802 |
| dischargingLanes | 27 | 24 | 0.889 | 32 | 158 |
| stoplineCandidates | 49 | 42 | 0.857 | 42 | 211 |
| holds | 42 | 36 | 0.857 | 36 | 114 |
| driverAlerts | 42 | 35 | 0.833 | 40 | 436 |
| lastSettlement | 48 | 37 | 0.771 | 37 | 154 |
| laneGuidance | 49 | 31 | 0.633 | 31 | 118 |
| workingMemory | 48 | 22 | 0.458 | 22 | 41 |
| activeVehicleMotions | 44 | 19 | 0.432 | 21 | 41 |
| laneMatrices | 0 | 0 |  | 47 | 857 |
| exits | 0 | 0 |  | 48 | 2088 |
| reservedUntil | 0 | 0 |  | 46 | 796 |
| incidentBlocked | 0 | 0 |  | 32 | 347 |

中断响应：

| 中断类型 | 次数 | 有响应 | 响应率 | 判定规则 |
| --- | --- | --- | --- | --- |
| PEDESTRIAN_PATIENCE | 24 | 20 | 0.833 | 同周期任一试算或提交带 pedestrian_phases |
| VEHICLE_TAILGATE | 1 | 0 | 0 | 推理文本提到了中断对象 ID |
| PEDESTRIAN_JAYWALK | 13 | 1 | 0.077 | 推理文本提到了中断对象 ID |
| ACCIDENT_INTERRUPT | 10 | 10 | 1 | 同周期调用 inspect_incident / order_accident_clearance / set_lane_detour |

- 每次回复的推理字符数：平均 9726.1，P50 4658，P95 33381，最大 57164（n=191）

### 1.3 tool_call 准确性

- 工具调用 292 次，成功 224 次，成功率 0.767
- 失败分类：{"RESOURCE_CONFLICT":44,"LANE_HEAD_NOT_READY":8,"PLANNING_HORIZON_EXCEEDED":4,"DRY_RUN_QUOTA_EXHAUSTED":4,"SCHEMA_ERROR":3,"TOOL_EXECUTION_ERROR":2,"NOT_AT_STOPLINE":2,"NOT_LANE_HEAD":1}
- 每次回复的工具调用数分布：{"0":1,"1":123,"2":48,"3":8,"4":6,"5":5}；finish_reason：{"tool_calls":190,"length":1}
- API 错误 0 次 {}；回退周期 []
- 从未使用的工具：reroute_queue_around_stall、guide_inbound_lane_change

| 工具 | 调用 | 成功 | 成功率 | 结果分类 |
| --- | --- | --- | --- | --- |
| manage_working_memory | 12 | 9 | 0.75 | {"OK":9,"SCHEMA_ERROR":3} |
| inspect_crosswalk | 13 | 13 | 1 | {"OK":13} |
| dry_run_admit | 85 | 24 | 0.282 | {"OK":24,"PLANNING_HORIZON_EXCEEDED":4,"LANE_HEAD_NOT_READY":8,"DRY_RUN_QUOTA_EXHAUSTED":4,"RESOURCE_CONFLICT":43,"TOOL_EXECUTION_ERROR":2} |
| commit_schedule | 49 | 46 | 0.939 | {"OK":46,"RESOURCE_CONFLICT":1,"NOT_AT_STOPLINE":2} |
| dispatch_emergency_convoy | 5 | 4 | 0.8 | {"OK":4,"NOT_LANE_HEAD":1} |
| dispatch_tow_truck | 6 | 6 | 1 | {"OK":6} |
| inspect_lane_queue | 20 | 20 | 1 | {"OK":20} |
| inspect_incident | 49 | 49 | 1 | {"OK":49} |
| order_accident_clearance | 49 | 49 | 1 | {"OK":49} |
| set_lane_detour | 4 | 4 | 1 | {"OK":4} |

错误样例：

- **PLANNING_HORIZON_EXCEEDED**
  - c2 t69 dry_run_admit：Admission planning horizon exceeded for V00030；参数 `{"lane_batches":[{"lane_id":"IN_N_S1_STRAIGHT","top_n":3,"speed_profile":"CRUISE"},{"lane_id":"IN_W_S1_STRAIGHT","top_n":3,"speed_profile":"CRUISE"},{"lane_id":"IN_E_S1_STRAIGHT","top_n":2,"speed_profile":"CRUISE"}]}`
  - c26 t197 dry_run_admit：Admission planning horizon exceeded for V00221；参数 `{"lane_batches":[{"lane_id":"IN_N_R1_RIGHT","top_n":8,"speed_profile":"CRUISE"},{"lane_id":"IN_S_R1_RIGHT","top_n":6,"speed_profile":"CRUISE"},{"lane_id":"IN_E_R1_RIGHT","top_n":6,"speed_profile":"CRUISE"},{"lane_id":"IN`
  - c27 t199 dry_run_admit：Admission planning horizon exceeded for V00221；参数 `{"lane_batches":[{"lane_id":"IN_N_R1_RIGHT","top_n":8},{"lane_id":"IN_S_R1_RIGHT","top_n":6},{"lane_id":"IN_E_R1_RIGHT","top_n":5},{"lane_id":"IN_W_R1_RIGHT","top_n":5}],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:NO`
- **SCHEMA_ERROR**
  - c4 t89 manage_working_memory：[ { "code": "too_big", "maximum": 160, "type": "string", "inclusive": true, "exact": false, "message": "String must contain at most 160 character(s)", "path": [；参数 `{"action":"SAVE_PLAN","plan_data":{"phase_name":"Sleep to t99 (reservations expire), then N-ax+N_S1 batch","intended_duration":25,"resume_condition":"At tick>=99 admit V00056 (N_L1 emergency, stops 0.0015/tick) + lane_ba`
  - c17 t178 manage_working_memory：[ { "code": "too_big", "maximum": 160, "type": "string", "inclusive": true, "exact": false, "message": "String must contain at most 160 character(s)", "path": [；参数 `{"action":"SAVE_PLAN","plan_data":{"phase_name":"Flush: clear INC0001/2, then big Top-N waves from S_S1/S_L1/E_S2/W_S2","intended_duration":90,"resume_condition":"After INC0002/INC0001 close, admit Top-N batches on S_S1,`
  - c17 t178 manage_working_memory：[ { "code": "too_big", "maximum": 80, "type": "string", "inclusive": true, "exact": false, "message": "String must contain at most 80 character(s)", "path": [ "；参数 `{"action":"SAVE_PLAN","plan_data":{"intended_duration":90,"phase_name":"Clear INC0001/2 then big Top-N waves (S_S1, S_L1, E_S2, W_S2); flush all queues before 261","resume_condition":"After incidents close, admit Top-N o`
- **NOT_LANE_HEAD**
  - c5 t99 dispatch_emergency_convoy：-；参数 `{"lane_id":"IN_N_S1_STRAIGHT","emergency_vehicle_id":"V00050"}`
- **LANE_HEAD_NOT_READY**
  - c5 t99 dry_run_admit：Lane head is not ready: IN_W_S1_STRAIGHT；参数 `{"candidate_vehicle_ids":["V00082"],"lane_batches":[{"lane_id":"IN_W_S1_STRAIGHT","top_n":2,"speed_profile":"CRUISE"}]}`
  - c8 t129 dry_run_admit：Lane head is not ready: IN_E_S1_STRAIGHT；参数 `{"lane_batches":[{"lane_id":"IN_W_S1_STRAIGHT","top_n":5},{"lane_id":"IN_W_S2_STRAIGHT","top_n":4},{"lane_id":"IN_W_R1_RIGHT","top_n":2},{"lane_id":"IN_N_R1_RIGHT","top_n":2},{"lane_id":"IN_E_R1_RIGHT","top_n":1},{"lane_`
  - c9 t139 dry_run_admit：Lane head is not ready: IN_W_S2_STRAIGHT；参数 `{"lane_batches":[{"lane_id":"IN_W_S2_STRAIGHT","top_n":8,"speed_profile":"CRUISE"},{"lane_id":"IN_W_S1_STRAIGHT","top_n":3,"speed_profile":"CRUISE"},{"lane_id":"IN_W_R1_RIGHT","top_n":2,"speed_profile":"CRUISE"},{"lane_i`
- **DRY_RUN_QUOTA_EXHAUSTED**
  - c8 t129 dry_run_admit：-；参数 `{"lane_batches":[{"lane_id":"IN_W_S1_STRAIGHT","top_n":5},{"lane_id":"IN_W_S2_STRAIGHT","top_n":4},{"lane_id":"IN_W_R1_RIGHT","top_n":3},{"lane_id":"IN_N_R1_RIGHT","top_n":4},{"lane_id":"IN_E_R1_RIGHT","top_n":1}],"pedes`
  - c28 t200 dry_run_admit：-；参数 `{"lane_batches":[{"lane_id":"IN_N_R1_RIGHT","speed_profile":"BURST","top_n":3},{"lane_id":"IN_S_R1_RIGHT","speed_profile":"BURST","top_n":3},{"lane_id":"IN_W_R1_RIGHT","speed_profile":"BURST","top_n":3}],"pedestrian_phas`
  - c36 t220 dry_run_admit：-；参数 `{"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:EAST","directions":["A_TO_B","B_TO_A"]},{"crosswalk_id":"CROSSWALK:WEST","directions":["A_TO_B","B_TO_A"]}]}`
- **RESOURCE_CONFLICT**
  - c9 t139 dry_run_admit：CROSSWALK:NORTH:CELL:0:0 vs V00053；参数 `{"lane_batches":[{"lane_id":"IN_E_R1_RIGHT","top_n":2,"speed_profile":"CRUISE"}],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:NORTH","directions":["A_TO_B"]},{"crosswalk_id":"CROSSWALK:WEST","directions":["A_TO_B"]}]}`
  - c10 t142 dry_run_admit：CROSSWALK:EAST:CELL:6:0 vs V00037；参数 `{"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:EAST","directions":["B_TO_A"]}]}`
  - c10 t142 dry_run_admit：CROSSWALK:NORTH:CELL:0:0 vs V00053；参数 `{"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:NORTH","directions":["A_TO_B"]}]}`
- **TOOL_EXECUTION_ERROR**
  - c26 t197 dry_run_admit：Admission plan exceeds 16 vehicles: 18；参数 `{"lane_batches":[{"lane_id":"IN_N_R1_RIGHT","speed_profile":"CRUISE","top_n":5},{"lane_id":"IN_S_R1_RIGHT","speed_profile":"CRUISE","top_n":5},{"lane_id":"IN_E_R1_RIGHT","speed_profile":"CRUISE","top_n":4},{"lane_id":"IN`
  - c27 t199 dry_run_admit：Admission plan exceeds 16 vehicles: 18；参数 `{"lane_batches":[{"lane_id":"IN_N_R1_RIGHT","top_n":6},{"lane_id":"IN_S_R1_RIGHT","top_n":4},{"lane_id":"IN_E_R1_RIGHT","top_n":4},{"lane_id":"IN_W_R1_RIGHT","top_n":4}]}`
- **NOT_AT_STOPLINE**
  - c27 t199 commit_schedule：-；参数 `{"admit_vehicle_ids":["V00101","V00169","V00210","V00129","V00212"],"sleep_ticks":8,"tactical_summary":"Cycle 27: INC0002 PILEUP (7 stopped, 232 locked cells, 0.464/tick hazard) evac retargeted to OUT_NORTH_2. Dry-run qu`
  - c29 t201 commit_schedule：-；参数 `{"admit_vehicle_ids":["V00212"],"sleep_ticks":10,"tactical_summary":"Cycle 29: dry-run quota burned on two \"Lane head is not ready\" errors for IN_N/IN_S_R1_RIGHT (heads V00107/V00194 are QUEUED at 3 units but not in st`

### 1.4 Agent 能力

- 周期内工具序列（D=试算，C=提交，T=其他工具）：{"DDC":9,"TTDDC":5,"TDC":3,"TDDC":3,"TTTTTDDC":3,"TTTTDDC":3,"TTDC":2,"TC":2,"TTTTTTTTDDC":2,"TTTTDDDC":1,"TTDTTTTTTTDC":1,"TTTTDTTTC":1,"TTTDC":1,"TTDTTDC":1,"TTC":1,"TTTDDTTTC":1,"TTTTTDDDTC":1,"TTTTTDDTTC":1,"TTTTTTTC":1,"TTTTTTTTTTDDC":1,"TTTTTTTTTDDDC":1,"TTTTTTDDTTC":1,"TTTTC":1,"TTTDDC":1,"TTDDDC":1,"DDTTC":1}
- 含提交的周期里先试算再提交的比例：0.898
- 提交构成：{"verified":15,"unverified":10,"hold":22,"reckless":2}；每周期放行车数 平均 2.6，P50 0，P95 13，最大 15（n=49）；共放行 128 辆
- 成功提交 46 次，其中使用 lane_batches 16 次；每次 top_n 合计 平均 2.3，P50 0，P95 9，最大 15（n=46）
- 速度档位：{"CRUISE":43,"SLOW_SLIDE":2,"BURST":1}；sleep_ticks：平均 8.3，P50 10，P95 10，最大 10（n=49） {"1":1,"3":1,"4":4,"5":3,"6":4,"7":1,"8":4,"9":1,"10":30}
- 工具使用：{"dry_run_admit":85,"commit_schedule":49,"inspect_incident":49,"order_accident_clearance":49,"inspect_lane_queue":20,"inspect_crosswalk":13,"manage_working_memory":12,"dispatch_tow_truck":6,"dispatch_emergency_convoy":5,"set_lane_detour":4}
- 决策开销：API 191 次，扣 3.82；非终结工具 243 次，扣 0.3645

与同条件 baseline 对比：

| 策略 | 最终余额 | 放行车辆 | 未服务负债 | 事故数 | 锁格扣费 | 上游积压 | 撞人 | 闯红灯罚 | 行人奖励 | 校车 | 拖车 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| stealth/space-bunny-alpha | 638.02 | 128 | 200.7 | 6 | 71.59 | 64.16 | 25 | 7.8 | 0 | 10 | 7.2 |
| baseline-balanced | 674.49 | 84 | 219.6 | 6 | 21.3 | 58.85 | 25 | 5.5 | 0 | 0 | 8.4 |
| baseline-balanced-bus | 659.61 | 87 | 208.1 | 4 | 90.26 | 53.27 | 5 | 4.9 | 0 | 0 | 6 |
| baseline-balanced-no-ped | 717.59 | 132 | 187.4 | 4 | 74.39 | 47.7 | 0 | 0 | 0 | 10 | 10.8 |
| baseline-longest-queue | 633.99 | 183 | 195.7 | 10 | 76.09 | 44.92 | 50 | 11.6 | 0 | 10 | 10.8 |
| baseline-random | 539.49 | 114 | 207.6 | 7 | 139.2 | 73.82 | 35 | 11 | 0 | 0 | 7.2 |
| baseline-search | 788.38 | 122 | 185.4 | 2 | 3.69 | 45.85 | 10 | 6.7 | 0 | 0 | 8.4 |

## 2. 进阶分析

### 2.1 逻辑推理

- 试算失败（不含额度用完）57 次；之后再试 33 次，其中改了参数 33 次，成功 13 次（0.394）；失败所在周期最终 verified 提交 8 次、hold 26 次
- 推理中"路线 X 经过/不经过 Y 横道"的断言 144 条，正确 115，错误 29，准确率 0.799；前半局 7/23 错，后半局 22/121 错
  - c13：「E_R1_RIGHT probably doesn't cross EAST」（实际经过 CROSSWALK:EAST+CROSSWALK:NORTH）
  - c17：「E_L1_LEFT's route crosses the NORTH」（实际经过 CROSSWALK:EAST+CROSSWALK:SOUTH）
  - c17：「S_L1_LEFT crosses EAST」（实际经过 CROSSWALK:SOUTH+CROSSWALK:WEST）
  - c18：「E_L1_LEFT (from east turning left to north) would cross the north」（实际经过 CROSSWALK:EAST+CROSSWALK:SOUTH）
  - c18：「S_L1_LEFT) exit to the east and cross the east」（实际经过 CROSSWALK:SOUTH+CROSSWALK:WEST）
  - c22：「E_R1_RIGHT (east entering, right turn, exits south) — crosses south」（实际经过 CROSSWALK:EAST+CROSSWALK:NORTH）
  - c22：「E_R1_RIGHT exits south — crosses SOUTH」（实际经过 CROSSWALK:EAST+CROSSWALK:NORTH）
  - c26：「N_R1_RIGHT is a right turn from north, which may not cross the NORTH」（实际经过 CROSSWALK:NORTH+CROSSWALK:WEST）
- 推理写"安全/无冲突"但同一轮试算冲突：15 次
  - c10 r1 t142：「presumably on the east leg — vehicles from E lanes (E_L1, E_S1, E_S2, E_R1) cross it. Since I'm not admitting E vehicles this cycle, releasing EAST pedestrians is safe. Also W_S1/W_S2 vehicles might pass the east crosswalk? Typically a crosswalk is on one leg; vehicles turning right from the north leg might cross the east cro」→ CROSSWALK:EAST:CELL:6:0 vs V00037
  - c11 r1 t146：「t vehicles" meaning the reservation table had conflicts with in-transit vehicles. So the verification is thorough. Good — so including pedestrians and vehicles is safe to verify. Let's do it. dry_run #1: - admit_vehicle_ids: ["V00134"] - pedestrian_phases: [{CROSSWALK:WEST, [A_TO_B]}, {CROSSWALK:EAST, [B_TO_A]}] Hmm, also NOR」→ CROSSWALK:EAST:CELL:6:0 vs V00037
  - c12 r1 t153：「 until 171 So available now: E_L1_LEFT (V00098), S_S1_STRAIGHT (V00026), S_S2_STRAIGHT (V00035). Conflicts: E_L1 vs S_S1, E_L1 vs S_S2. S_S1 vs S_S2 presumably no conflict (same axis, parallel). So we can admit S_S1 and S_S2 tops, or E_L1. Also, lanes with permits that are still discharging: IN_N_S1 (V00050 entering 158), IN_N_S2」→ CROSSWALK:EAST:CELL:6:0 vs V00051
  - c14 r2 t166：「ry run failed due to ped phases conflicting with in-transit vehicles — "EAST cell 7 vs V00074(S_R1)", "NORTH cell 0 vs V00061(N_R1)"). So the ped phase must be compatible with vehicle movement in the same tick. In-transit vehicles crossing may occupy crosswalk cells. Plan: dry run #1: admit V00074 (S_R1) + pedestrian phases WEST」→ CROSSWALK:NORTH:CELL:0:0 vs V00096
  - c15 r2 t175：「. Since ped phases presumably conflict-check with vehicle admissions... "立即入场的车会直接撞上" for jaywalkers, but for phase-released peds the engine presumably ensures no conflict. The dry run checks. OK. But careful: if a ped phase is granted on WEST while the accident locks WEST cells 0:0/0:1 — the ped would walk into the locked cell w」→ CROSSWALK:NORTH:CELL:4:0 vs V00058
  - c16 r2 t176：「Let me test it empirically with a dry run: this cycle, include a pedestrian phase for NORTH along with... nothing (all heads blocked). The dry run will verify (no conflicts reported since no vehicles). Next cycle at 186, I try to admit N vehicles while NORTH peds may be crossing → dry run will show conflicts or jaywalker warnings?」→ CROSSWALK:NORTH:CELL:4:0 vs V00058
- 自我修正标记（Wait/Actually/Let me recheck…）：共 2572 次，每次回复 平均 13.5，P50 6，P95 55，最大 91（n=191）
- 认知模式 letterCounting：0 处
- 认知模式 idFormat：0 处

### 2.2 复杂环境博弈

**行人与车辆**

- 行人相位尝试 63 次，成功 9 次 {"RESOURCE_CONFLICT":44,"OK":9,"DRY_RUN_QUOTA_EXHAUSTED":4,"LANE_HEAD_NOT_READY":3,"PLANNING_HORIZON_EXCEEDED":2,"TOOL_EXECUTION_ERROR":1}
- 实际放行 5 批 15 人；闯红灯 13 次 13 人；被撞 5 人；奖励 0，扣费 {"delay":0.87,"jaywalk":7.8,"strike":25}

行人相位冲突样例：

| 周期 | tick | 冲突偏移 at | 冲突 |
| --- | --- | --- | --- |
| 9 | 139 | 0 | CROSSWALK:NORTH:CELL:0:0 vs V00053 |
| 10 | 142 | 4 | CROSSWALK:EAST:CELL:6:0 vs V00037 |
| 10 | 142 | 0 | CROSSWALK:NORTH:CELL:0:0 vs V00053 |
| 11 | 146 | 4 | CROSSWALK:EAST:CELL:6:0 vs V00037 |
| 12 | 153 | 4 | CROSSWALK:EAST:CELL:6:0 vs V00051 |
| 13 | 162 | 6 | CROSSWALK:EAST:CELL:7:0 vs V00074 |
| 13 | 162 | 0 | CROSSWALK:NORTH:CELL:0:0 vs V00061 |
| 14 | 166 | 1 | CROSSWALK:NORTH:CELL:0:0 vs V00096 |
| 14 | 166 | 0 | CROSSWALK:WEST:CELL:0:0 vs V00061 |
| 15 | 175 | 16 | CROSSWALK:NORTH:CELL:4:0 vs V00058 |

在行人耐心告急（PATIENCE_CRITICAL）时放行、且路线经过该横道的车辆：135 车次

| 周期 | tick | 车辆 | 路线 | 横道 | 行人 | 剩余耐心 | 该行人后来被撞 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 11 | 146 | V00134 | E_R1_RIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 20 |  |
| 11 | 146 | V00142 | E_R1_RIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 20 |  |
| 13 | 162 | V00148 | E_R1_RIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 4 |  |
| 13 | 162 | V00148 | E_R1_RIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 24 |  |
| 13 | 162 | V00148 | E_R1_RIGHT | CROSSWALK:EAST | PED:24:0:CROSSWALK:EAST | 15 |  |
| 13 | 162 | V00159 | E_R1_RIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 4 |  |
| 13 | 162 | V00159 | E_R1_RIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 24 |  |
| 13 | 162 | V00159 | E_R1_RIGHT | CROSSWALK:EAST | PED:24:0:CROSSWALK:EAST | 15 |  |
| 13 | 162 | V00061 | N_R1_RIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 24 |  |
| 13 | 162 | V00061 | N_R1_RIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 8 | 是 |
| 13 | 162 | V00096 | N_R1_RIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 24 |  |
| 13 | 162 | V00096 | N_R1_RIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 8 | 是 |
| 13 | 162 | V00058 | W_L1_LEFT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 24 |  |
| 13 | 162 | V00058 | W_L1_LEFT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 8 | 是 |
| 13 | 162 | V00065 | W_L1_LEFT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 24 |  |

行人时间线：

| tick | 事件 | 横道 | 人数 |
| --- | --- | --- | --- |
| 162 | PED_GRANT | CROSSWALK:EAST | 3 |
| 174 | PED_COLLISION | CROSSWALK:WEST | 1 |
| 175 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 186 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 188 | PED_GRANT | CROSSWALK:SOUTH | 1 |
| 199 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 200 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 200 | PED_COLLISION | CROSSWALK:WEST | 1 |
| 208 | PED_COLLISION | CROSSWALK:NORTH | 1 |
| 209 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 211 | PED_COLLISION | CROSSWALK:NORTH | 1 |
| 212 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 215 | PED_COLLISION | CROSSWALK:SOUTH | 1 |
| 225 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 228 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 233 | PED_GRANT | CROSSWALK:NORTH | 5 |
| 238 | PED_GRANT | CROSSWALK:EAST | 4 |
| 241 | PED_JAYWALK | CROSSWALK:SOUTH | 1 |
| 242 | PED_JAYWALK | CROSSWALK:SOUTH | 1 |
| 249 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 257 | PED_GRANT | CROSSWALK:SOUTH | 2 |
| 257 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 260 | PED_JAYWALK | CROSSWALK:WEST | 1 |

**事故处置**

| 事故 | 类型 | 发生 | 车辆 | 行人 | 首次响应 | 清障令 | 清障调用次数 | 关闭 | 事故后才放行、后来卷入 | 非模型放行（抢行） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| INC0001 | ANGLE_COLLISION | 174 | 1 | 1 | 175 | 175 | 6 | 189 |  |  |
| INC0002 | PILEUP | 178 | 7 | 0 | 178 | 178 | 27 | 231 | V00067@181 | V00054 |
| INC0003 | ANGLE_COLLISION | 200 | 1 | 1 | 201 | 201 | 2 | 217 |  |  |
| INC0004 | ANGLE_COLLISION | 208 | 1 | 1 | 209 | 209 | 5 | 223 |  |  |
| INC0005 | ANGLE_COLLISION | 211 | 1 | 1 | 212 | 212 | 4 | 226 |  |  |
| INC0006 | ANGLE_COLLISION | 215 | 1 | 1 | 216 | 216 | 5 | 232 |  |  |

事故成本估算：

| 事故 | 最终严重度 | 锁格（含二次） | 开放拍数 | 危化品 | 校车 | 分摊锁格费 | 估算总成本 | 放行来源 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| INC0001 | SERIOUS | 16 | 15 |  |  | 2.357 | 7.357 | V00096@c13 |
| INC0002 | CRITICAL | 73 | 53 |  | 是 | 57.004 | 67.004 | V00049@c12 V00054@c- V00052@c12 V00058@c13 V00065@c13 V00132@c15 V00067@c19 |
| INC0003 | SERIOUS | 16 | 17 |  |  | 2.672 | 7.672 | V00129@c26 |
| INC0004 | SERIOUS | 15 | 15 |  |  | 2.21 | 7.21 | V00210@c27 |
| INC0005 | SERIOUS | 17 | 15 |  |  | 2.505 | 7.505 | V00107@c31 |
| INC0006 | SERIOUS | 29 | 17 |  |  | 4.842 | 9.842 | V00194@c30 |

**司机抢行**

总计 {"redLight":0,"tailgate":1,"cutIn":3}

| 周期 | 类型 | 车辆 | 此前出现在 driverAlerts 的周期数 | 最后一次预警 | 卷入事故 |
| --- | --- | --- | --- | --- | --- |
| 14 | VEHICLE_TAILGATE | V00054 | 1 | IN_S_S2_STRAIGHT 距停止线 8 剩余 11 | INC0002 |

**紧急车辆与抛锚**

紧急车辆延误扣费 0.342

| 车辆 | 首次进入 12 格 | 放行 tick | 等待拍数 | 最长静止 |
| --- | --- | --- | --- | --- |
| V00034 | 69 | 95 | 26 | 20 |
| V00036 | 69 | 99 | 30 | 20 |
| V00050 | 79 | 158 | 79 | 46 |
| V00056 | 79 | 109 | 30 | 23 |
| V00043 | 109 | 140 | 31 | 24 |
| V00096 | 129 | 167 | 38 | 6 |
| V00101 | 142 | 197 | 55 | 29 |
| V00212 | 175 |  |  | 56 |
| V00252 | 209 |  |  | 52 |

拖车费 7.2，链式加价 0.825

| 车辆 | 车道 | 抛锚 | 派拖车 | 派车延迟 | 绕行 |
| --- | --- | --- | --- | --- | --- |
| V00014 | IN_S_R1_RIGHT | 64 | 139 | 75 |  |
| V00006 | IN_N_R1_RIGHT | 65 | 79 | 14 |  |
| V00068 | IN_N_L1_LEFT | 112 | 142 | 30 |  |
| V00122 | IN_W_R1_RIGHT | 149 | 175 | 26 |  |
| V00029 | IN_W_S2_STRAIGHT | 169 | 175 | 6 |  |
| V00063 | IN_W_S1_STRAIGHT | 170 | 175 | 5 |  |

### 2.3 亮眼操作与最差操作

周期价值 = 未卷入事故的放行车数 + 1.5×放行行人 + 2×成功的特情工具 − 归因事故成本。事故成本按锁格×开放时长分摊本局真实锁格扣费，再加撞人和校车罚款，平均分给放行了涉事车辆的周期。这是用于挑选证据的启发式，不是精确账目。

亮点事件：

| tick | 周期 | 类型 | 说明 |
| --- | --- | --- | --- |
| 69 | 2 | EMERGENCY_CONVOY | V00034 on IN_S_L1_LEFT |
| 69 | 2 | EMERGENCY_CONVOY | V00036 on IN_W_R1_RIGHT |
| 79 | 3 | TOW_DISPATCH | V00006 |
| 109 | 6 | LARGE_VERIFIED_RELEASE | 9 vehicles, blame=0 |
| 119 | 7 | LARGE_VERIFIED_RELEASE | 15 vehicles, blame=0 |
| 129 | 8 | LARGE_VERIFIED_RELEASE | 14 vehicles, blame=0 |
| 139 | 9 | TOW_DISPATCH | V00014 |
| 139 | 9 | EMERGENCY_CONVOY | V00050 on IN_N_S1_STRAIGHT |
| 142 | 10 | TOW_DISPATCH | V00068 |
| 144 | 10 | LANE_GUIDANCE | V00095 IN_W_S2_STRAIGHT->IN_W_L1_LEFT |
| 162 | 13 | PED_GRANT | CROSSWALK:EAST B_TO_A x3 |
| 175 | 15 | TOW_DISPATCH | V00029 |
| 175 | 15 | TOW_DISPATCH | V00063 |
| 175 | 15 | TOW_DISPATCH | V00122 |
| 188 | 24 | PED_GRANT | CROSSWALK:SOUTH A_TO_B+B_TO_A x1 |
| 200 | 28 | EMERGENCY_CONVOY | V00212 on IN_E_R1_RIGHT |
| 233 | 39 | PED_GRANT | CROSSWALK:NORTH A_TO_B+B_TO_A x5 |
| 238 | 41 | PED_GRANT | CROSSWALK:EAST A_TO_B+B_TO_A x4 |
| 250 | 46 | LANE_GUIDANCE | V00160 IN_W_S1_STRAIGHT->IN_W_R1_RIGHT |
| 254 | 47 | LANE_GUIDANCE | V00166 IN_W_S1_STRAIGHT->IN_W_R1_RIGHT |
| 257 | 48 | PED_GRANT | CROSSWALK:SOUTH A_TO_B+B_TO_A x2 |

#### 得分最高的周期

**周期 7（tick 119）**：放行 15，未出事 15，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -2.417，提交类型 verified，睡眠 10

- 观测要点：余额 994.08，停止线候选 13，受阻路线 5，行人预警 []，司机预警 []，紧急车 [V00043, V00050]，抛锚 [V00014, V00068]
- 工具序列：r1 inspect_lane_queue -> ok；r1 inspect_lane_queue -> ok；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 战术摘要：Cycle 7: S/W straights+lefts all RESERVATION-blocked, so ran the deepest legal wave on the open E+N axes: E_S1 top2, E_S2 top4, N_S2 top5, N_R1 top2, E_R1 top1, W_R1 top1 = 15 vehicles (dry-run reward 18.0). Avoids the N_S1 head (blocks emergency V00050) and W_L1 (conflicts E_S2). No pedestrian phas
- 推理摘录：Let me analyze the current state. currentTick 119, endTick 261, ticksRemaining 142. Balance 994.08. Blocked routes: S_L1_LEFT (124), S_S1_STRAIGHT (130), S_S2_STRAIGHT (132), W_S1_STRAIGHT (133), W_S2_STRAIGHT (131). So S and W straights/lefts are all reservation-blocked. Available: E_R1_RIGHT (V00106), E_S1_STRAIGHT (V00088), E_S2_STRAIGHT (V00069), N_R1_RIGHT (V00028), N_S1_STRAIGHT (V00032), N_S2_STRAIGHT (V00010), S_L1_LEFT blocked, S_S1 blocked, S_S2 blocked, W_L1_LEFT (V00058), W_R1_RIGHT  …… ially. Hmm, the N_S2 deep ones (V00047 at 163) may not clear before 261... they will (261 > 179). But if only 1-2 more rounds remain, the engine continues the scheduled entries regardless of my API calls. So the scheduled entries will happen. Sleep 10 → tick 129. Good. Commit with exact same params.

**周期 8（tick 129）**：放行 14，未出事 14，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -2.868，提交类型 verified，睡眠 10

- 观测要点：余额 991.67，停止线候选 11，受阻路线 5，行人预警 []，司机预警 [V00063:10]，紧急车 [V00043, V00050, V00096]，抛锚 [V00014, V00068]
- 工具序列：r1 inspect_lane_queue -> ok；r1 inspect_lane_queue -> ok；r1 inspect_lane_queue -> ok；r1 inspect_lane_queue -> ok；r2 dry_run_admit -> LANE_HEAD_NOT_READY (Lane head is not ready: IN_E_S1_STRAIGHT)；r3 dry_run_admit -> ok；r4 dry_run_admit -> DRY_RUN_QUOTA_EXHAUSTED；r5 commit_schedule -> ok
- 战术摘要：Final-round W-axis wave: S axis and W_L1 all RESERVATION-blocked, so opened every legal W head plus the two non-conflicting right turns. W_S1 top5 (pulls emergency V00043 out of surcharge and disarms aggressive V00063 at patience 10), W_S2 top4, W_R1 top2 (school bus V00090, 40 pax = 4.0), N_R1 top2
- 推理摘录：Let me analyze the current situation. Current tick 129, endTick 261, 132 ticks remaining. Balance 991.67. Blocked routes (RESERVATION): - N_S1_STRAIGHT until 151 - S_L1_LEFT until 135 - S_S1_STRAIGHT until 146 - S_S2_STRAIGHT until 147 - W_L1_LEFT until 171 So currently available lanes for new admissions: - IN_E_L1_LEFT (E_L1_LEFT) — not blocked - IN_E_R1_RIGHT — not blocked - IN_N_R1_RIGHT — not blocked - IN_W_R1_RIGHT — not blocked - IN_W_S1_STRAIGHT — not blocked - IN_W_S2_STRAIGHT — not bloc …… tions: [A_TO_B]} Let's go. The quota was exhausted because the first dry run (with E_S1/E_S2 error) also counted. So I must commit plan A exactly: lane_batches W_S1 5, W_S2 4, W_R1 2, N_R1 2, E_R1 1, no pedestrian phases, no vehicle_speed_profiles. Sleep: 10 ticks. Let me commit exactly as verified.

**周期 2（tick 69）**：放行 5，未出事 5，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -0.341，提交类型 verified，睡眠 10

- 观测要点：余额 999.87，停止线候选 8，受阻路线 2，行人预警 []，司机预警 []，紧急车 [V00034, V00036]，抛锚 [V00006, V00014]
- 工具序列：r1 dispatch_emergency_convoy -> ok；r1 dispatch_emergency_convoy -> ok；r2 dry_run_admit -> PLANNING_HORIZON_EXCEEDED (Admission planning horizon exceeded for V00030)；r3 dry_run_admit -> ok；r4 commit_schedule -> ok
- 战术摘要：Emergency convoys: released V00034 (S left) and V00036 (W right) with blockers. Verified N_S1 x2, W_S1 x2, E_S1 x1 straights (reward 4.4). Sleep 10 to let the wave clear.
- 推理摘录：Let me analyze the situation. Current tick 69, end 261, 192 ticks remaining. Balance 999.87. Key observations: - Emergency vehicles: V00034 in IN_S_L1_LEFT, queueIndex 3, blocking V00019, V00027, distance 6. V00036 in IN_W_R1_RIGHT, queueIndex 3, blocking V00022, V00033, distance 8. - These are emergency vehicles (police/ambulance/fire) worth 1.0 per vehicle on exit (flat 1 per vehicle for emergency class). Actually "emergency 类警车、救护车、消防车等特殊车辆按车计 1" — so 1.0 per emergency vehicle exit. Plus they …… as the blocking vehicle in N_S1 for the stall bypass (slot 55) — it's the second vehicle in the N_S1 lane and now scheduled to enter at tick 101. Now commit with identical params and sleep. Sleep choice: enter ticks up to 101. If I sleep 10, at tick 79 I'll see them entering. Let's sleep 10. Commit.

**周期 6（tick 109）**：放行 9，未出事 9，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -1.902，提交类型 verified，睡眠 10

- 观测要点：余额 995.99，停止线候选 15，受阻路线 4，行人预警 []，司机预警 []，紧急车 [V00043, V00050, V00056]，抛锚 [V00014]
- 工具序列：r1 dry_run_admit -> ok；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 战术摘要：Exploited the only legal window: N+W straights still reservation-blocked, so instead ran a cross-axis wave of 4 left turns + 3 right turns = 9 vehicles (reward 2.0). Clears emergency V00056 (N_L1, 23 stationary ticks, surcharge imminent) and frees E/W/N right lanes. Skipped pedestrian phases: all 4 
- 推理摘录：The dry run is verified, reward 1.8. Now, should I also add pedestrian phases? Dry run quota is 2 per cycle; I've used 1. Let me consider adding a second dry run that includes pedestrian phases plus the S-axis. But careful: commit must exactly match a verified dry run. Crosswalks: all have 0 waiting, only approaching pedestrians. No waiting means no phase release possible (只有 waiting 可被 phase 放行). So pedestrian phases would be useless — 0 waiting, nothing to release. So skip pedestrian phases. G …… lear at 125, V00104 at 119, V00044 at 119, V00017 at 118. Sleeping 10 → tick 119, then re-observe. Let me do the second dry run. Verified with 9 vehicles, reward 2.0. Commit with sleep 10 to reach tick 119, where N_S2/W_S2 reservations (113) and N_S1/W_S1 (114) have expired. Commit exactly matching.

**周期 39（tick 233）**：放行 9，未出事 9，放行行人 0，耐心风险放行 36，归因成本 0，周期余额变化 -1.488，提交类型 verified，睡眠 10

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:87:0:CROSSWALK:WEST remaining=24
- 观测要点：余额 870.46，停止线候选 16，受阻路线 1，行人预警 [E:J0, N:P1, N:J0, S:P8, W:P16, N:P11, S:P8, W:P24, N:P11, E:P16]，司机预警 [V00045:0, V00055:0, V00066:0, V00071:0, V00081:0, V00098:0, V00109:0, V00116:0]，紧急车 [V00212, V00252]，抛锚 []
- 工具序列：r2 inspect_crosswalk -> ok；r2 inspect_lane_queue -> ok；r2 inspect_lane_queue -> ok；r3 dry_run_admit -> ok；r4 dry_run_admit -> ok；r5 commit_schedule -> ok
- 战术摘要：Dry-run 1 showed every W/S east- or north-exiting route is jaywalker-blocked: warnings are on EXIT crosswalks (PED:61 EAST col, PED:68 NORTH col), so all those heads would strike pedestrians (5/casualty). Only routes crossing SOUTH/WEST (no jaywalkers) are safe: IN_S_L1_LEFT->west and IN_W_R1_RIGHT-
- 推理摘录：Let me analyze the situation. We're at tick 233, endTick 261, 28 ticks remaining. Balance 870.46. The balance is dropping ~7 per cycle due to upstream queue costs (3.296) and hazard (3.132) and delay (1.18). Key issues: - Incident INC0002 still seems to be blocking all routes? Recent cycles say all non-right-turn routes INCIDENT-severed. But blockedRoutes currently only shows E_S2_STRAIGHT with RESERVATION until 233. That suggests the incident has been cleared! Let me check — blockedRoutes only  ……  243 (already scheduled) — the second enters at 243 regardless. W_R1's next enters at 252. So nothing needs my attention before 243. Sleep 10 → 243. ✓ One consideration: the chain/escape costs during sleep — no stalls reported (stalledVehicles absent). Fine. Commit now with the exact verifiedparams.

#### 损失最大的周期

**周期 13（tick 162）**：放行 6，未出事 3，放行行人 0，耐心风险放行 14，归因成本 29.69，周期余额变化 2.924，提交类型 unverified，睡眠 10

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:20:0:CROSSWALK:NORTH remaining=24
- 观测要点：余额 982.25，停止线候选 9，受阻路线 5，行人预警 [E:P4, N:P24, E:P15, W:P8]，司机预警 [V00114:0, V00097:0, V00178:0, V00089:1, V00165:2, V00112:3, V00176:3, V00126:4]，紧急车 [V00096, V00101]，抛锚 [V00122]
- 工具序列：r1 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:EAST:CELL:7:0 vs V00074)；r2 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:NORTH:CELL:0:0 vs V00061)；r3 commit_schedule -> ok
- 后果：INC0001 ANGLE_COLLISION tick=174 vehicles=1 pedestrians=1 estCost=7.357；INC0002 PILEUP tick=178 vehicles=7 pedestrians=0 estCost=67.004
- 战术摘要：Cycle 13: E_L1/E_S1/E_S2/N_S1/S_L1 heads all sit behind RESERVATIONs until 178-189, so only E_R1, N_R1, S_R1, W_L1 were open. Dry run #1 (4 lanes + 3 ped phases) failed: EAST cell 7 vs V00074(S_R1). Dry run #2 (dropped S_R1) failed: NORTH cell 0 vs V00061(N_R1). Quota spent, so I committed the head-
- 推理摘录：Let me analyze the current state. Tick 162, endTick 261, 99 ticks remaining. Balance 982.25. Last cycle: revenue 0.2 only, costs 3.34 — mostly upstream queue cost (2.178) and delay (1.048) and stallChain (0.21). That's bad — we're barely earning revenue while accumulating delay penalties. The upstream queues hold vehicles paying 0.002/passenger/tick. Upstream waiting: N_S2 11, S_L1 1, S_S1 5, W_S1 8, W_S2 8 = 33 vehicles. Those cost us. Key issue: lanes aren't discharging. blockedRoutes show RES …… tion → potential EXIT_BLOCKED. Given unverified, keep top-2. Let me also consider whether to hold N_R1 for the emergency convoy. Top-2 includes V00061 and V00096 (emergency). Good. One more: V00058 is a truck in W_L1_LEFT with passengers 1 — trucks turn slowly, capped at SLOW_SLIDE. Fine. Commitnow.

**周期 12（tick 153）**：放行 6，未出事 4，放行行人 0，耐心风险放行 0，归因成本 22.33，周期余额变化 -3.339，提交类型 verified，睡眠 10

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:24:0:CROSSWALK:EAST remaining=24
- 观测要点：余额 985.59，停止线候选 7，受阻路线 4，行人预警 [E:P13, E:P24, W:P17]，司机预警 [V00097:0, V00114:6, V00178:6, V00165:9, V00089:10, V00176:10, V00054:11, V00107:11]，紧急车 [V00050, V00096, V00101]，抛锚 [V00014, V00068, V00122]
- 工具序列：r1 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:EAST:CELL:6:0 vs V00051)；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 后果：INC0002 PILEUP tick=178 vehicles=7 pedestrians=0 estCost=67.004
- 战术摘要：Cycle 12: only non-blocked heads were E_L1/S_S1/S_S2, and E_L1 conflicts with both S straight heads, so I ran the S axis (S_S1 top-4, S_S2 top-2 incl. HAZMAT V00035) to drain the heaviest queues (124 + 9 pax). Dry run #1 with an EAST B_TO_A ped phase was rejected (cell 6 vs V00051 in transit), so th
- 推理摘录：Let me analyze the situation. Current tick 153, endTick 261, 108 ticks remaining. Balance 985.59 — we're losing money. Last settlement: revenue 0.4, costs 2.67, net -2.27. Costs dominated by delay (0.75), upstream (1.65), stallChain (0.16). Key issues: - upstream queues cost 0.002/passenger/tick. Upstream queues: IN_E_R1_RIGHT 1, IN_N_S2_STRAIGHT 11, IN_S_S1_STRAIGHT 4, IN_W_S1_STRAIGHT 5, IN_W_S2_STRAIGHT 6. Big costs. - delay 0.7544 — stationary vehicles. - stallChain 0.1644. We need to move t …… full reservation checks presumably). Let's just commit and see. Sleep 10. Actually, let me reconsider: could I instead sleep only a few ticks so we come back at 158 and can admit something else? Nothing else is available. So 10 is fine — it lets the S convoy get in. Let's commit with sleep_ticks 10.

**周期 19（tick 181）**：放行 3，未出事 2，放行行人 0，耐心风险放行 9，归因成本 11.17，周期余额变化 -2.775，提交类型 verified，睡眠 10

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:38:0:CROSSWALK:SOUTH remaining=24
- 观测要点：余额 975.56，停止线候选 11，受阻路线 17，行人预警 [N:P5, S:P24, W:P18, W:P19]，司机预警 [V00089:0, V00105:0, V00107:0, V00118:0, V00124:0, V00080:0, V00112:0, V00126:0]，紧急车 [V00101, V00212]，抛锚 [V00029, V00063, V00122]
- 工具序列：r1 inspect_incident -> ok；r1 inspect_incident -> ok；r2 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:EAST:CELL:0:0 vs V00192)；r3 order_accident_clearance -> ok；r3 order_accident_clearance -> ok；r4 dry_run_admit -> ok；r5 commit_schedule -> ok
- 后果：INC0002 PILEUP tick=178 vehicles=7 pedestrians=0 estCost=67.004
- 战术摘要：Cycle 19: only S_L1_LEFT is unsevered, so released top-3 (V00067 van + 2 followers). Clearance orders re-issued to both incidents (both already evacuating, no_op). Sleep 10 to reach ~191 where INC0001 est. completes and E_L1/N_S1 reservations expire.
- 推理摘录：Let me analyze the situation. Current tick 181, end 261, 80 ticks remaining. Balance 975.56. Two incidents: INC0001 and INC0002. INC0001 evacuating to OUT_WEST_0, INC0002 re-tasked to OUT_NORTH_1. Blocked routes by INCIDENT: E_S1, E_S2, E_R1_GUIDED, N_L1_LEFT, N_R1_RIGHT, N_R1_GUIDED, N_S1_GUIDED_RIGHT, N_S2_GUIDED_LEFT, S_L1_GUIDED, S_R1_GUIDED, S_S1, S_S2, W_L1_LEFT, W_S2_GUIDED_LEFT, E_R1_GUIDED_STRAIGHT. RESERVATION blocks: E_L1_LEFT until 185, N_S1_STRAIGHT until 190, N_S2_STRAIGHT until 19 …… mitting now is fine — no downside. But wait: does holding S_L1_LEFT's reservation until ~197 block other things? Possibly. Let's commit with sleep 10 → tick 191. At 191, INC0001 should be closed (est 189), unlocking E_S1, E_S2(partly), N_R1_RIGHT, N_S1_GUIDED_RIGHT, E_R1_GUIDED_STRAIGHT. Commit now.

**周期 15（tick 175）**：放行 7，未出事 6，放行行人 0，耐心风险放行 5，归因成本 11.17，周期余额变化 -4.043，提交类型 unverified，睡眠 10

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:44:0:CROSSWALK:WEST remaining=24; PEDESTRIAN_JAYWALK pedestrian=PED:3:0:CROSSWALK:WEST; ACCIDENT_INTERRUPT incident=INC0001 locked=CROSSWALK:WEST:CELL:0:0,CROSSWALK:
- 观测要点：余额 978.5，停止线候选 11，受阻路线 11，行人预警 [N:P11, W:P24]，司机预警 [V00107:0, V00089:0, V00124:0, V00080:0, V00112:0, V00114:0, V00097:0, V00126:0]，紧急车 [V00101, V00212]，抛锚 [V00029, V00063, V00122]
- 工具序列：r1 inspect_incident -> ok；r1 dispatch_tow_truck -> ok；r1 dispatch_tow_truck -> ok；r1 dispatch_tow_truck -> ok；r2 order_accident_clearance -> ok；r2 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:NORTH:CELL:4:0 vs V00058)；r3 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:WEST:CELL:0:1 vs INCIDENT)；r4 commit_schedule -> ok
- 后果：INC0002 PILEUP tick=178 vehicles=7 pedestrians=0 estCost=67.004
- 战术摘要：Cycle 15: towed all 3 W-lane stalls (V00029/V00063/V00122, 3.6, clear tick 193) to kill the growing chain surcharge and unblock W upstream; ordered INC0001 clearance to OUT_WEST_0 (frees E_S1 + N_R1 later). Only E_R1/S_R1/S_S2 were unblocked (S_R1 bus V00084 = 4.0 revenue). Both dry runs failed only
- 推理摘录：Let me analyze the current state carefully. Current tick 175, end tick 261, 86 ticks remaining. Balance 978.4969. Key issues: 1. ACCIDENT_INTERRUPT INC0001 — locks CROSSWALK:WEST cells, PAIR:N_R1_RIGHT|N_S1_GUIDED_RIGHT, SPACE cells. Routes blocked: E_R1_GUIDED_STRAIGHT, E_S1_STRAIGHT, N_R1_GUIDED_STRAIGHT, N_R1_RIGHT, N_S1_GUIDED_RIGHT all INCIDENT blocked. 2. Pedestrian strike cost 5 in last settlement! pedestrianStrike: 5, pedestrianJaywalk: 0.6. That means someone was hit. Hmm, "每名车人碰撞伤员扣 5" ……  reconsider sleeping fewer ticks? Next cycle is at tick 185: E_L1 unblocks (until 185, so at 185 it should be free), E_S2 at 189, S_L1 at 188, N_S1 at 190, N_S2 at 194. Sleep 10 is right. Should I also consider releasing NORTH A_TO_B peds later when the intersection is clear? Next cycle. Commit now.

**周期 30（tick 204）**：放行 1，未出事 0，放行行人 0，耐心风险放行 1，归因成本 9.84，周期余额变化 -7.524，提交类型 unverified，睡眠 10

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:68:0:CROSSWALK:NORTH remaining=24
- 观测要点：余额 922.35，停止线候选 15，受阻路线 28，行人预警 [N:J0, N:P4, W:J0, N:P7, E:P21, N:P24]，司机预警 [V00045:0, V00055:0, V00109:0, V00085:0, V00089:0, V00105:0, V00135:0, V00062:0]，紧急车 [V00212]，抛锚 []
- 工具序列：r1 inspect_incident -> ok；r1 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:NORTH:CELL:5:1 vs INCIDENT)；r2 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:EAST:CELL:7:0 vs V00204)；r3 commit_schedule -> ok
- 后果：INC0006 ANGLE_COLLISION tick=215 vehicles=1 pedestrians=1 estCost=9.842
- 战术摘要：Dry-run quota spent: NORTH pedestrian phase blocked by incident-locked CROSSWALK:NORTH cells, second attempt collided with V00204 at EAST cell 7. Fallback to single explicit head admit: V00194 (truck, 3 pax) on the only unsevered route S_R1_RIGHT. INC0002 PILEUP still 27 ticks from clearing with all
- 推理摘录：Let me analyze the current state. Current tick 204, end tick 261, 57 ticks remaining. Balance 922.35. Key situation: Massive INC0002 (PILEUP) blocking most routes until tick 231. INC0003 blocking W routes until 217. Only non-blocked routes right now: - E_R1_RIGHT (blocked by RESERVATION until 209) - N_R1_RIGHT (blocked by RESERVATION until 208) - S_R1_RIGHT (not in blockedRoutes! V00194 truck, 3 passengers) - W_R1_RIGHT is INCIDENT until 217 - IN_S_R1_RIGHT: S_R1_RIGHT not blocked. V00194 truck  …… pedestrian phases without dry run? No — explicitly forbidden without verification. Should I use a longer sleep? Max 10. Yes, 10. Let me also update working memory? It costs 0.02 + 0.0015. Current plan "INC0002 clearance + right-turn-only throughput" is still valid; no need to save. Skip. Commit now.

### 附：逐周期一览

| 周期 | tick | 提交 | 放行 | 行人 | 耐心风险 | 归因事故 | 归因成本 | 余额变化 | 睡眠 | 唤醒原因 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 61 | verified | 8 | 0 | 0 |  | 0 | -0.131 | 8 |  |
| 2 | 69 | verified | 5 | 0 | 0 |  | 0 | -0.341 | 10 |  |
| 3 | 79 | verified | 3 | 0 | 0 |  | 0 | -1.773 | 10 |  |
| 4 | 89 | hold | 0 | 0 | 0 |  | 0 | -0.84 | 10 |  |
| 5 | 99 | unverified | 1 | 0 | 0 |  | 0 | -0.93 | 10 |  |
| 6 | 109 | verified | 9 | 0 | 0 |  | 0 | -1.902 | 10 |  |
| 7 | 119 | verified | 15 | 0 | 0 |  | 0 | -2.417 | 10 |  |
| 8 | 129 | verified | 14 | 0 | 0 |  | 0 | -2.868 | 10 |  |
| 9 | 139 | unverified | 1 | 0 | 0 |  | 0 | -2.229 | 10 |  |
| 10 | 142 | hold | 0 | 0 | 0 |  | 0 | 1.295 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:11:0:CROSSWALK:EAST remai |
| 11 | 146 | verified | 2 | 0 | 2 |  | 0 | -2.274 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:3:0:CROSSWALK:WEST remain |
| 12 | 153 | verified | 6 | 0 | 0 | INC0002 | 22.33 | -3.339 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:24:0:CROSSWALK:EAST remai |
| 13 | 162 | unverified | 6 | 0 | 14 | INC0001 INC0002 | 29.69 | 2.924 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:20:0:CROSSWALK:NORTH rema |
| 14 | 166 | unverified | 1 | 0 | 0 |  | 0 | -6.68 | 10 | VEHICLE_TAILGATE vehicle=V00054 route=S_S2_STRAIGHT |
| 15 | 175 | unverified | 7 | 0 | 5 | INC0002 | 11.17 | -4.043 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:44:0:CROSSWALK:WEST remai |
| 16 | 176 | hold | 0 | 0 | 0 |  | 0 | -0.821 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:45:1:CROSSWALK:WEST remai |
| 17 | 178 | hold | 0 | 0 | 0 |  | 0 | -0.573 | 10 | ACCIDENT_INTERRUPT incident=INC0002 locked=CROSSWALK:NORTH:C |
| 18 | 179 | hold | 0 | 0 | 0 |  | 0 | 2.501 | 10 | ACCIDENT_INTERRUPT incident=INC0002 secondary=true |
| 19 | 181 | verified | 3 | 0 | 9 | INC0002 | 11.17 | -2.775 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:38:0:CROSSWALK:SOUTH rema |
| 20 | 184 | hold | 0 | 0 | 0 |  | 0 | -1.46 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:43:0:CROSSWALK:NORTH rema |
| 21 | 185 | hold | 0 | 0 | 0 |  | 0 | -11.185 | 5 | ACCIDENT_INTERRUPT incident=INC0002 secondary=true |
| 22 | 186 | hold | 0 | 0 | 0 |  | 0 | -1.62 | 4 | PEDESTRIAN_JAYWALK pedestrian=PED:20:0:CROSSWALK:NORTH |
| 23 | 187 | hold | 0 | 0 | 0 |  | 0 | -1.747 | 6 | PEDESTRIAN_PATIENCE pedestrian=PED:50:0:CROSSWALK:NORTH rema |
| 24 | 188 | verified | 0 | 0 | 0 |  | 0 | -4.248 | 3 | ACCIDENT_INTERRUPT incident=INC0002 secondary=true |
| 25 | 191 | hold | 0 | 0 | 0 |  | 0 | -10.526 | 6 |  |
| 26 | 197 | unverified | 13 | 0 | 26 | INC0003 | 7.67 | -4.003 | 6 |  |
| 27 | 199 | - | 3 | 0 | 5 | INC0004 | 7.21 | -2.411 | 8 | PEDESTRIAN_JAYWALK pedestrian=PED:44:0:CROSSWALK:WEST |
| 28 | 200 | unverified | 3 | 0 | 2 |  | 0 | -7.073 | 8 | PEDESTRIAN_JAYWALK pedestrian=PED:45:1:CROSSWALK:WEST |
| 29 | 201 | - | 0 | 0 | 0 |  | 0 | -6.163 | 10 | ACCIDENT_INTERRUPT incident=INC0003 locked=CROSSWALK:WEST:CE |
| 30 | 204 | unverified | 1 | 0 | 1 | INC0006 | 9.84 | -7.524 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:68:0:CROSSWALK:NORTH rema |
| 31 | 209 | unverified | 1 | 0 | 2 | INC0005 | 7.5 | -2.134 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:43:0:CROSSWALK:NORTH; ACCI |
| 32 | 210 | hold | 0 | 0 | 0 |  | 0 | -5.123 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:62:0:CROSSWALK:NORTH rema |
| 33 | 212 | verified | 3 | 0 | 3 |  | 0 | -13.342 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:50:0:CROSSWALK:NORTH; ACCI |
| 34 | 216 | hold | 0 | 0 | 0 |  | 0 | -2.21 | 7 | ACCIDENT_INTERRUPT incident=INC0006 locked=CROSSWALK:SOUTH:C |
| 35 | 217 | hold | 0 | 0 | 0 |  | 0 | -5.574 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:80:0:CROSSWALK:SOUTH rema |
| 36 | 220 | hold | 0 | 0 | 0 |  | 0 | -4.964 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:82:0:CROSSWALK:NORTH rema |
| 37 | 225 | hold | 0 | 0 | 0 |  | 0 | -3.856 | 8 | PEDESTRIAN_PATIENCE pedestrian=PED:81:0:CROSSWALK:WEST remai |
| 38 | 228 | hold | 0 | 0 | 0 |  | 0 | -7.159 | 5 | PEDESTRIAN_JAYWALK pedestrian=PED:68:0:CROSSWALK:NORTH |
| 39 | 233 | verified | 9 | 0 | 36 |  | 0 | -1.488 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:87:0:CROSSWALK:WEST remai |
| 40 | 236 | hold | 0 | 0 | 0 |  | 0 | -2.133 | 5 | PEDESTRIAN_PATIENCE pedestrian=PED:106:0:CROSSWALK:WEST rema |
| 41 | 238 | unverified | 0 | 0 | 0 |  | 0 | -3.873 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:95:0:CROSSWALK:SOUTH rema |
| 42 | 241 | hold | 0 | 0 | 0 |  | 0 | -1.85 | 6 | PEDESTRIAN_JAYWALK pedestrian=PED:86:0:CROSSWALK:SOUTH |
| 43 | 242 | hold | 0 | 0 | 0 |  | 0 | -2.337 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:113:0:CROSSWALK:WEST rema |
| 44 | 244 | hold | 0 | 0 | 0 |  | 0 | -5.127 | 4 | PEDESTRIAN_PATIENCE pedestrian=PED:101:0:CROSSWALK:WEST rema |
| 45 | 248 | hold | 0 | 0 | 0 |  | 0 | -1.975 | 10 |  |
| 46 | 249 | verified | 7 | 0 | 4 |  | 0 | -4.167 | 4 | PEDESTRIAN_JAYWALK pedestrian=PED:81:0:CROSSWALK:WEST |
| 47 | 252 | verified | 4 | 0 | 14 |  | 0 | -7.808 | 9 | PEDESTRIAN_PATIENCE pedestrian=PED:119:0:CROSSWALK:WEST rema |
| 48 | 257 | verified | 3 | 0 | 12 |  | 0 | -1.146 | 4 | PEDESTRIAN_JAYWALK pedestrian=PED:87:0:CROSSWALK:WEST |
| 49 | 260 | hold | 0 | 0 | 0 |  | 0 | -1.611 | 1 | PEDESTRIAN_JAYWALK pedestrian=PED:106:0:CROSSWALK:WEST |

