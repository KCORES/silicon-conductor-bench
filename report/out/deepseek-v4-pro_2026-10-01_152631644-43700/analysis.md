# 运行分析：deepseek-v4-pro_2026-10-01_152631644-43700

- 模型：deepseek-v4-pro；种子 63916；规则版本 16；回放 schema 7
- 截止 tick 261，决策周期 44，最终余额 **740.17**
- 生成时间 2026-10-01T21:35:19.203Z；数据文件：replay_deepseek-v4-pro_2026-10-01_152631644-43700.json、report_deepseek-v4-pro_2026-10-01_152631644-43700.json、api-log_deepseek-v4-pro_2026-10-01_152631644-43700.jsonl、raw-api-log_deepseek-v4-pro_2026-10-01_152631644-43700.jsonl

## 1. 基础分析

### 1.1 上下文能力

- prompt tokens：平均 25830.6，P50 24588，P95 50035，最大 56797（n=161）
- completion tokens：平均 7922.3，P50 4779，P95 25818，最大 40755（n=161）；其中推理 tokens：平均 7763.8，P50 4647，P95 25551，最大 40487（n=161）
- 每周期 API 轮数：平均 3.7，P50 3，P95 6，最大 7（n=44）；上限 8，用满上限的周期 0 个
- 每次请求的平均字符数：系统提示 7722，user 14535.2，工具结果 1776.2，assistant 680.1；消息条数 平均 6.2，P50 6，P95 13，最大 17（n=161）
- 工具参数中的 ID 共 469 个：出现在当轮可见上下文里的占 1，当轮不可见但本局别处出现过 0 个，本局从未出现 0 个，非规范横道短键 0 个

| ID 类型 | 总数 | 当轮可见 | 别处出现 | 从未出现 | 非规范短键 |
| --- | --- | --- | --- | --- | --- |
| vehicle | 106 | 106 | 0 | 0 | 0 |
| lane | 176 | 176 | 0 | 0 | 0 |
| crosswalk | 154 | 154 | 0 | 0 | 0 |
| incident | 33 | 33 | 0 | 0 | 0 |

- 同一周期内重复提交已失败的相同调用：0 次 {}
- 提交类型：verified 20，unverified 6，hold 18；放行类提交中 verified 占 0.769
- working memory：调用 1 次 {"SAVE_PLAN":1}，观测里带有计划的周期 0 个

### 1.2 注意力分布

关注率 = 字段出现在该周期观测里、且推理文本提到它的周期数 / 字段出现的周期数。

| 概念 | 出现周期 | 提到且出现 | 关注率 | 提到周期（含未出现） | 提及次数 |
| --- | --- | --- | --- | --- | --- |
| stoplineCandidates | 44 | 44 | 1 | 44 | 594 |
| crosswalks | 44 | 44 | 1 | 44 | 8202 |
| candidateConflicts | 44 | 44 | 1 | 44 | 2899 |
| pedestrianAlerts | 35 | 35 | 1 | 44 | 10312 |
| emergency | 44 | 44 | 1 | 44 | 2253 |
| stalledVehicles | 30 | 30 | 1 | 43 | 1224 |
| timeBudget | 44 | 44 | 1 | 44 | 260 |
| holds | 32 | 31 | 0.969 | 32 | 527 |
| dischargingLanes | 27 | 26 | 0.963 | 34 | 342 |
| driverAlerts | 36 | 34 | 0.944 | 42 | 2518 |
| recentCycles | 43 | 40 | 0.93 | 40 | 306 |
| activeVehicleMotions | 40 | 37 | 0.925 | 37 | 194 |
| revokedAdmissions | 11 | 10 | 0.909 | 24 | 183 |
| laneGuidance | 44 | 39 | 0.886 | 39 | 229 |
| lastSettlement | 43 | 32 | 0.744 | 32 | 148 |
| laneMatrices | 0 | 0 |  | 44 | 1182 |
| exits | 0 | 0 |  | 44 | 6500 |
| reservedUntil | 0 | 0 |  | 44 | 2068 |
| incidentBlocked | 0 | 0 |  | 23 | 364 |
| workingMemory | 0 | 0 |  | 12 | 32 |

中断响应：

| 中断类型 | 次数 | 有响应 | 响应率 | 判定规则 |
| --- | --- | --- | --- | --- |
| PEDESTRIAN_PATIENCE | 20 | 15 | 0.75 | 同周期任一试算或提交带 pedestrian_phases |
| PEDESTRIAN_JAYWALK | 7 | 4 | 0.571 | 推理文本提到了中断对象 ID |
| ACCIDENT_INTERRUPT | 7 | 7 | 1 | 同周期调用 inspect_incident / order_accident_clearance / set_lane_detour |
| VEHICLE_RED_LIGHT | 1 | 1 | 1 | 推理文本提到了中断对象 ID |

- 每次回复的推理字符数：平均 28081.2，P50 17377，P95 93274，最大 150830（n=161）

### 1.3 tool_call 准确性

- 工具调用 221 次，成功 160 次，成功率 0.724
- 失败分类：{"RESOURCE_CONFLICT":42,"DRY_RUN_QUOTA_EXHAUSTED":11,"LANE_HEAD_NOT_READY":3,"PLANNING_HORIZON_EXCEEDED":2,"NOT_LANE_HEAD":1,"SCHEMA_ERROR":1,"TOOL_EXECUTION_ERROR":1}
- 每次回复的工具调用数分布：{"1":126,"2":21,"3":7,"4":4,"5":2,"6":1}；finish_reason：{"tool_calls":161}
- API 错误 0 次 {}；回退周期 []
- 从未使用的工具：guide_inbound_lane_change

| 工具 | 调用 | 成功 | 成功率 | 结果分类 |
| --- | --- | --- | --- | --- |
| dry_run_admit | 90 | 32 | 0.356 | {"OK":32,"LANE_HEAD_NOT_READY":3,"RESOURCE_CONFLICT":41,"DRY_RUN_QUOTA_EXHAUSTED":11,"PLANNING_HORIZON_EXCEEDED":2,"TOOL_EXECUTION_ERROR":1} |
| commit_schedule | 44 | 43 | 0.977 | {"OK":43,"RESOURCE_CONFLICT":1} |
| dispatch_tow_truck | 10 | 10 | 1 | {"OK":10} |
| reroute_queue_around_stall | 2 | 2 | 1 | {"OK":2} |
| inspect_lane_queue | 12 | 12 | 1 | {"OK":12} |
| inspect_incident | 21 | 21 | 1 | {"OK":21} |
| order_accident_clearance | 12 | 12 | 1 | {"OK":12} |
| inspect_crosswalk | 23 | 23 | 1 | {"OK":23} |
| dispatch_emergency_convoy | 1 | 0 | 0 | {"NOT_LANE_HEAD":1} |
| set_lane_detour | 5 | 5 | 1 | {"OK":5} |
| manage_working_memory | 1 | 0 | 0 | {"SCHEMA_ERROR":1} |

错误样例：

- **LANE_HEAD_NOT_READY**
  - c6 t106 dry_run_admit：Lane head is not ready: IN_W_R1_RIGHT；参数 `{"candidate_vehicle_ids":["V00082","V00017","V00084"],"lane_batches":[{"lane_id":"IN_W_R1_RIGHT","top_n":6}]}`
  - c20 t180 dry_run_admit：Lane head is not ready: IN_N_S1_STRAIGHT；参数 `{"lane_batches":[{"lane_id":"IN_N_S2_STRAIGHT","top_n":3,"speed_profile":"CRUISE"},{"lane_id":"IN_N_S1_STRAIGHT","top_n":2,"speed_profile":"CRUISE"}],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:NORTH","directions":["`
  - c27 t199 dry_run_admit：Lane head is not ready: IN_W_S2_STRAIGHT；参数 `{"lane_batches":[{"lane_id":"IN_W_S2_STRAIGHT","top_n":3},{"lane_id":"IN_W_S1_STRAIGHT","top_n":2},{"lane_id":"IN_N_R1_RIGHT","top_n":1},{"lane_id":"IN_S_R1_RIGHT","top_n":2}],"pedestrian_phases":[{"crosswalk_id":"CROSSW`
- **RESOURCE_CONFLICT**
  - c10 t142 dry_run_admit：CROSSWALK:EAST:CELL:7:0 vs V00074；参数 `{"candidate_vehicle_ids":["V00120","V00169","V00103"],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:EAST","directions":["B_TO_A"]},{"crosswalk_id":"CROSSWALK:WEST","directions":["A_TO_B"]}]}`
  - c10 t142 dry_run_admit：CROSSWALK:WEST:CELL:0:0 vs V00053；参数 `{"candidate_vehicle_ids":["V00120","V00169","V00103"],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:WEST","directions":["A_TO_B"]}]}`
  - c13 t153 dry_run_admit：CROSSWALK:EAST:CELL:6:0 vs V00043；参数 `{"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:EAST","directions":["B_TO_A"]},{"crosswalk_id":"CROSSWALK:WEST","directions":["A_TO_B"]}]}`
- **DRY_RUN_QUOTA_EXHAUSTED**
  - c10 t142 dry_run_admit：-；参数 `{"candidate_vehicle_ids":["V00120","V00169","V00103"]}`
  - c15 t166 dry_run_admit：-；参数 `{"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:WEST","directions":["A_TO_B","B_TO_A"]},{"crosswalk_id":"CROSSWALK:NORTH","directions":["A_TO_B","B_TO_A"]},{"crosswalk_id":"CROSSWALK:SOUTH","directions":["A_TO_B"]}]}`
  - c18 t176 dry_run_admit：-；参数 `{"lane_batches":[{"lane_id":"IN_E_R1_RIGHT","top_n":2}],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:SOUTH","directions":["A_TO_B"]}]}`
- **NOT_LANE_HEAD**
  - c26 t196 dispatch_emergency_convoy：-；参数 `{"lane_id":"IN_S_S1_STRAIGHT","emergency_vehicle_id":"V00137"}`
- **SCHEMA_ERROR**
  - c33 t220 manage_working_memory：[ { "code": "too_big", "maximum": 160, "type": "string", "inclusive": true, "exact": false, "message": "String must contain at most 160 character(s)", "path": [；参数 `{"action":"SAVE_PLAN","plan_data":{"phase_name":"WAIT_TILL_232_THEN_E_WAVE","intended_duration":12,"resume_condition":"tick>=232: WEST/SOUTH clear; admit E_S1/E_S2/W_R1/S_R1/S_L1 batches, then W_S1/W_S2 at 234; tick>=244`
- **PLANNING_HORIZON_EXCEEDED**
  - c37 t235 dry_run_admit：Admission planning horizon exceeded for V00112；参数 `{"lane_batches":[{"lane_id":"IN_S_L1_LEFT","top_n":8}]}`
  - c44 t259 dry_run_admit：Admission planning horizon exceeded for V00222；参数 `{"lane_batches":[{"lane_id":"IN_N_R1_RIGHT","top_n":8},{"lane_id":"IN_S_R1_RIGHT","top_n":8}]}`
- **TOOL_EXECUTION_ERROR**
  - c43 t256 dry_run_admit：Admission plan exceeds 16 vehicles: 25；参数 `{"lane_batches":[{"lane_id":"IN_N_S1_STRAIGHT","top_n":5},{"lane_id":"IN_N_S2_STRAIGHT","top_n":5},{"lane_id":"IN_S_S1_STRAIGHT","top_n":5},{"lane_id":"IN_S_S2_STRAIGHT","top_n":5},{"lane_id":"IN_N_R1_RIGHT","top_n":5}]}`

### 1.4 Agent 能力

- 周期内工具序列（D=试算，C=提交，T=其他工具）：{"DDC":10,"DC":4,"TDC":3,"TTDDDC":3,"TDDC":3,"DDDC":3,"TTDC":2,"TTTTTTDDC":2,"TTDTDC":2,"TTTTDDC":2,"DTDDC":1,"TTTTTTTDDC":1,"TTTDDDTC":1,"TTTTDTTTTDC":1,"TTTTTTTTTDDC":1,"TTTTDDDTC":1,"DTTDTC":1,"DDTC":1,"TTTTDDDC":1,"DDTTTDC":1}
- 含提交的周期里先试算再提交的比例：1
- 提交构成：{"verified":20,"unverified":6,"hold":18,"reckless":0}；每周期放行车数 平均 2.9，P50 1，P95 12，最大 16（n=44）；共放行 129 辆
- 成功提交 43 次，其中使用 lane_batches 15 次；每次 top_n 合计 平均 2.6，P50 0，P95 12，最大 16（n=43）
- 速度档位：{"CRUISE":40}；sleep_ticks：平均 7.1，P50 8，P95 10，最大 10（n=44） {"1":2,"2":1,"3":2,"4":3,"5":7,"6":2,"7":3,"8":7,"9":2,"10":15}
- 工具使用：{"dry_run_admit":90,"commit_schedule":44,"inspect_crosswalk":23,"inspect_incident":21,"inspect_lane_queue":12,"order_accident_clearance":12,"dispatch_tow_truck":10,"set_lane_detour":5,"reroute_queue_around_stall":2,"dispatch_emergency_convoy":1,"manage_working_memory":1}
- 决策开销：API 161 次，扣 3.22；非终结工具 177 次，扣 0.2655

与同条件 baseline 对比：

| 策略 | 最终余额 | 放行车辆 | 未服务负债 | 事故数 | 锁格扣费 | 上游积压 | 撞人 | 闯红灯罚 | 行人奖励 | 校车 | 拖车 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| deepseek-v4-pro | 740.17 | 129 | 194.1 | 6 | 5.38 | 51.52 | 30 | 3.7 | 0 | 0 | 12 |
| baseline-balanced | 674.49 | 84 | 219.6 | 6 | 21.3 | 58.85 | 25 | 5.5 | 0 | 0 | 8.4 |
| baseline-balanced-bus | 659.61 | 87 | 208.1 | 4 | 90.26 | 53.27 | 5 | 4.9 | 0 | 0 | 6 |
| baseline-balanced-no-ped | 717.59 | 132 | 187.4 | 4 | 74.39 | 47.7 | 0 | 0 | 0 | 10 | 10.8 |
| baseline-longest-queue | 633.99 | 183 | 195.7 | 10 | 76.09 | 44.92 | 50 | 11.6 | 0 | 10 | 10.8 |
| baseline-random | 539.49 | 114 | 207.6 | 7 | 139.2 | 73.82 | 35 | 11 | 0 | 0 | 7.2 |
| baseline-search | 788.38 | 122 | 185.4 | 2 | 3.69 | 45.85 | 10 | 6.7 | 0 | 0 | 8.4 |

## 2. 进阶分析

### 2.1 逻辑推理

- 试算失败（不含额度用完）47 次；之后再试 25 次，其中改了参数 25 次，成功 10 次（0.4）；失败所在周期最终 verified 提交 10 次、hold 32 次
- 推理中"路线 X 经过/不经过 Y 横道"的断言 241 条，正确 216，错误 25，准确率 0.896；前半局 3/84 错，后半局 22/157 错
  - c12：「S_R1_RIGHT which doesn't cross E」（实际经过 CROSSWALK:SOUTH+CROSSWALK:EAST）
  - c22：「N_S2_STRAIGHT—do any cross WEST」（实际经过 CROSSWALK:NORTH+CROSSWALK:SOUTH）
  - c22：「E_R1_RIGHT (if we admit, east right = south, crosses SOUTH」（实际经过 CROSSWALK:EAST+CROSSWALK:NORTH）
  - c23：「E_L1_LEFT (entering east, left turn goes north - crosses north」（实际经过 CROSSWALK:EAST+CROSSWALK:SOUTH）
  - c24：「N_R1_RIGHT eastbound should cross EAST」（实际经过 CROSSWALK:NORTH+CROSSWALK:WEST）
  - c26：「S_S1_STRAIGHT cross WEST」（实际经过 CROSSWALK:SOUTH+CROSSWALK:NORTH）
  - c26：「S_S1_STRAIGHT cross the EAST」（实际经过 CROSSWALK:SOUTH+CROSSWALK:NORTH）
  - c28：「N_S1_STRAIGHT etc likely cross east」（实际经过 CROSSWALK:NORTH+CROSSWALK:SOUTH）
- 推理写"安全/无冲突"但同一轮试算冲突：27 次
  - c13 r1 t153：「nters from N, turns right (east? or west?). Entering from N heading south, right turn = west. It crosses NORTH crosswalk first, then WEST crosswalk at exit. So no conflict with EAST crosswalk. WEST A_TO_B pedestrians: cross west road. N_R1_RIGHT exits west, crossing WEST crosswalk. Conflict! Hmm wait, WEST crosswalk A_TO_B: pedes」→ CROSSWALK:EAST:CELL:6:0 vs V00043
  - c15 r1 t166：「 make a decision and commit (sleep). Let me think about what to do: 1. We can admit E_R1_RIGHT V00134 (free). 2. We should serve pedestrians on crosswalks that won't conflict with active vehicles. Active vehicles crossing: W_S2, W_S1, W_L1 (W->E platoon), N_R1 (north right turn), E_S1. The W->E platoon: W_L1, W_S1, W_S2 all crossing」→ CROSSWALK:EAST:CELL:7:0 vs PED:11:0:CROSSWALK:EAST
  - c16 r1 t169：「, let me think about the axis selection. The baseline says pick an axis. But we can be smarter. Let me consider the conflicts graph more carefully to determine compatible set. Vehicles at stopline and their routes: 1. V00079 E_L1_LEFT 2. V00134 E_R1_RIGHT 3. V00149 E_S1 (blocked) 4. V00111 E_S2 (blocked) 5. V00050 N_S1 (blocked)」→ CROSSWALK:WEST:CELL:0:0 vs V00096
  - c17 r1 t175：「ateConflicts for V00050: conflicts with V00040 (S_L1), V00071 (W_L1), V00095 (W_S2). If we only admit N_S1 (and maybe N_S1 batch), and not S_L1/W_L1/W_S2, then no conflict. But we need to check in-flight vehicles too. The engine dry-run will validate. Actually, we also want to release pedestrians. Let me think about the whole pla」→ CROSSWALK:WEST:CELL:0:0 vs V00101
  - c18 r1 t176：「out E_R1_RIGHT. Right turn route from East. Right turns go... Eastbound right turn heads south? Let me not overthink geometry. Actually the key strategy: admit compatible vehicles and release pedestrians. Let me consider which vehicles can be admitted now: - E_R1_RIGHT V00134 (waiting 51) - not blocked, clear. - N_R1_RIGHT V0013」→ CROSSWALK:NORTH:CELL:1:0 vs V00057
  - c19 r3 t177：「nds on coordinate system. N_R1_RIGHT is northbound right turn. These might conflict with each other? candidateConflicts only compares stopline heads same tick. No conflict listed between V00134 and V00130, so they can go together. But wait — there might be pedestrians crossing. Let me check crosswalk states: - EAST: B_TO_A crossi」→ CROSSWALK:NORTH:CELL:0:0 vs V00130
- 自我修正标记（Wait/Actually/Let me recheck…）：共 4093 次，每次回复 平均 25.4，P50 11，P95 76，最大 199（n=161）
- 认知模式 letterCounting：5 处
  - 「ient. Let me commit. For the commit, I must match dry-run exactly: candidate_vehicle_ids ["V00120","V00103"], no lane_batches, no speed profiles, no pedestrian phases. Sleep 10. Tactical summary (max 300 chars). Let me also save working memory plan. Actually, I can do that in the same turn? The commit is terminal (ends the cycle and sleeps). I can save memory before commit? Working memory is a tool (non-te」
  - 「Dry-run quota exhausted (N_S1 head not ready; N_S2+NORTH phase conflicts with in-flight V00057). Empty commit, sleep 4 to tick 184 for crosswalk/intersection clearing." Let me write it concisely (max 300 chars). Let me analyze the current situation carefully. Current tick 181, endTick 261, 80 ticks remaining. Balance 983.0859. Let me look at the state: Blocked routes: - E_L1_LEFT: RESERVATION until 187 - E」
  - 「t no, dry run 1 and 2 were separate tool calls but in the same assistant turn? No, I made dry run 1 in one turn, got result, then dry run 2 in next turn. Actually each assistant turn is an API round. Let me recount: - Turn 1: inspect_incident × 2 (1 API round). - Turn 2: dry_run 1 (1 API round). - Turn 3: dry_run 2 (1 API round). - Turn 4: dry_run 3 (quota exhausted) (1 API round). - Turn 5 (now): commit. So we」
- 认知模式 idFormat：0 处

### 2.2 复杂环境博弈

**行人与车辆**

- 行人相位尝试 61 次，成功 10 次 {"RESOURCE_CONFLICT":40,"OK":10,"DRY_RUN_QUOTA_EXHAUSTED":9,"LANE_HEAD_NOT_READY":2}
- 实际放行 7 批 21 人；闯红灯 7 次 7 人；被撞 6 人；奖励 0，扣费 {"delay":0.72,"jaywalk":3.7,"strike":30}

行人相位冲突样例：

| 周期 | tick | 冲突偏移 at | 冲突 |
| --- | --- | --- | --- |
| 10 | 142 | 0 | CROSSWALK:EAST:CELL:7:0 vs V00074 |
| 10 | 142 | 0 | CROSSWALK:WEST:CELL:0:0 vs V00053 |
| 13 | 153 | 5 | CROSSWALK:EAST:CELL:6:0 vs V00043 |
| 15 | 166 | 0 | CROSSWALK:EAST:CELL:7:0 vs PED:11:0:CROSSWALK:EAST |
| 15 | 166 | 0 | CROSSWALK:EAST:CELL:7:0 vs PED:11:0:CROSSWALK:EAST |
| 16 | 169 | 0 | CROSSWALK:WEST:CELL:0:0 vs V00096 |
| 17 | 175 | 0 | CROSSWALK:WEST:CELL:0:0 vs V00101 |
| 18 | 176 | 4 | CROSSWALK:NORTH:CELL:1:0 vs V00057 |
| 18 | 176 | 0 | CROSSWALK:WEST:CELL:0:0 vs V00107 |
| 19 | 177 | 0 | CROSSWALK:NORTH:CELL:0:0 vs V00130 |

在行人耐心告急（PATIENCE_CRITICAL）时放行、且路线经过该横道的车辆：80 车次

| 周期 | tick | 车辆 | 路线 | 横道 | 行人 | 剩余耐心 | 该行人后来被撞 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 11 | 146 | V00056 | N_L1_LEFT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 20 | 是 |
| 11 | 146 | V00068 | N_L1_LEFT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 20 | 是 |
| 11 | 146 | V00043 | W_S1_STRAIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 20 | 是 |
| 11 | 146 | V00043 | W_S1_STRAIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 24 | 是 |
| 11 | 146 | V00051 | W_S1_STRAIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 20 | 是 |
| 11 | 146 | V00051 | W_S1_STRAIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 24 | 是 |
| 11 | 146 | V00063 | W_S1_STRAIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 20 | 是 |
| 11 | 146 | V00063 | W_S1_STRAIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 24 | 是 |
| 12 | 151 | V00141 | E_S1_STRAIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 15 | 是 |
| 12 | 151 | V00141 | E_S1_STRAIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 19 | 是 |
| 12 | 151 | V00149 | E_S1_STRAIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 15 | 是 |
| 12 | 151 | V00149 | E_S1_STRAIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 19 | 是 |
| 12 | 151 | V00045 | W_S2_STRAIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 15 | 是 |
| 12 | 151 | V00045 | W_S2_STRAIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 19 | 是 |
| 12 | 151 | V00072 | W_S2_STRAIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 15 | 是 |

行人时间线：

| tick | 事件 | 横道 | 人数 |
| --- | --- | --- | --- |
| 166 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 175 | PED_GRANT | CROSSWALK:EAST | 2 |
| 176 | PED_COLLISION | CROSSWALK:EAST | 1 |
| 179 | PED_COLLISION | CROSSWALK:WEST | 1 |
| 180 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 186 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 195 | PED_COLLISION | CROSSWALK:EAST | 1 |
| 198 | PED_COLLISION | CROSSWALK:EAST | 1 |
| 199 | PED_COLLISION | CROSSWALK:WEST | 1 |
| 200 | PED_GRANT | CROSSWALK:NORTH | 4 |
| 200 | PED_GRANT | CROSSWALK:SOUTH | 2 |
| 200 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 200 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 211 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 225 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 236 | PED_GRANT | CROSSWALK:EAST | 3 |
| 236 | PED_GRANT | CROSSWALK:NORTH | 2 |
| 236 | PED_GRANT | CROSSWALK:SOUTH | 2 |
| 244 | PED_GRANT | CROSSWALK:WEST | 6 |
| 255 | PED_COLLISION | CROSSWALK:WEST | 1 |

**事故处置**

| 事故 | 类型 | 发生 | 车辆 | 行人 | 首次响应 | 清障令 | 清障调用次数 | 关闭 | 事故后才放行、后来卷入 | 非模型放行（抢行） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| INC0001 | ANGLE_COLLISION | 176 | 1 | 1 | 177 | 177 | 3 | 193 |  |  |
| INC0002 | ANGLE_COLLISION | 179 | 1 | 1 | 180 | 180 | 2 | 194 |  |  |
| INC0003 | ANGLE_COLLISION | 195 | 1 | 1 | 196 | 196 | 2 | 210 |  |  |
| INC0004 | ANGLE_COLLISION | 198 | 1 | 1 | 199 | 199 | 2 | 213 |  |  |
| INC0005 | ANGLE_COLLISION | 199 | 2 | 1 | 200 | 200 | 2 | 216 |  | V00095 |
| INC0006 | ANGLE_COLLISION | 255 | 1 | 1 | 256 | 256 | 1 |  |  |  |

事故成本估算：

| 事故 | 最终严重度 | 锁格（含二次） | 开放拍数 | 危化品 | 校车 | 分摊锁格费 | 估算总成本 | 放行来源 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| INC0001 | SERIOUS | 17 | 17 |  |  | 1.127 | 6.127 | V00087@c12 |
| INC0002 | SERIOUS | 14 | 15 |  |  | 0.819 | 5.819 | V00107@c14 |
| INC0003 | SERIOUS | 11 | 15 |  |  | 0.644 | 5.644 | V00098@c25 |
| INC0004 | SERIOUS | 16 | 15 |  |  | 0.936 | 5.936 | V00149@c25 |
| INC0005 | SERIOUS | 24 | 17 |  |  | 1.592 | 6.592 | V00129@c25 V00095@c- |
| INC0006 | SERIOUS | 11 | 6 |  |  | 0.257 | 5.257 | V00067@c37 |

**司机抢行**

总计 {"redLight":1,"tailgate":0,"cutIn":0}

| 周期 | 类型 | 车辆 | 此前出现在 driverAlerts 的周期数 | 最后一次预警 | 卷入事故 |
| --- | --- | --- | --- | --- | --- |
| 27 | VEHICLE_RED_LIGHT | V00095 | 14 | IN_W_S2_STRAIGHT 距停止线 0 剩余 0 | INC0005 |

**紧急车辆与抛锚**

紧急车辆延误扣费 0.427

| 车辆 | 首次进入 12 格 | 放行 tick | 等待拍数 | 最长静止 |
| --- | --- | --- | --- | --- |
| V00034 | 71 | 142 | 71 | 65 |
| V00036 | 71 | 101 | 30 | 21 |
| V00050 | 71 | 175 | 104 | 87 |
| V00056 | 81 | 146 | 65 | 60 |
| V00043 | 106 | 146 | 40 | 30 |
| V00096 | 134 | 162 | 28 | 9 |
| V00101 | 146 | 167 | 21 | 8 |
| V00137 | 151 | 256 | 105 | 59 |

拖车费 12，链式加价 0.013

| 车辆 | 车道 | 抛锚 | 派拖车 | 派车延迟 | 绕行 |
| --- | --- | --- | --- | --- | --- |
| V00014 | IN_S_R1_RIGHT | 64 | 71 | 7 | 71 |
| V00006 | IN_N_R1_RIGHT | 75 | 81 | 6 |  |
| V00029 | IN_W_S2_STRAIGHT | 111 | 116 | 5 |  |
| V00089 | IN_S_S1_STRAIGHT | 141 | 142 | 1 | 142 |
| V00068 | IN_N_L1_LEFT | 149 | 151 | 2 |  |
| V00063 | IN_W_S1_STRAIGHT | 156 | 162 | 6 |  |
| V00122 | IN_W_R1_RIGHT | 156 | 166 | 10 |  |
| V00131 | IN_S_S1_STRAIGHT | 173 | 175 | 2 |  |
| V00117 | IN_S_R1_RIGHT | 178 | 180 | 2 |  |
| V00124 | IN_E_L1_LEFT | 224 | 225 | 1 |  |

### 2.3 亮眼操作与最差操作

周期价值 = 未卷入事故的放行车数 + 1.5×放行行人 + 2×成功的特情工具 − 归因事故成本。事故成本按锁格×开放时长分摊本局真实锁格扣费，再加撞人和校车罚款，平均分给放行了涉事车辆的周期。这是用于挑选证据的启发式，不是精确账目。

亮点事件：

| tick | 周期 | 类型 | 说明 |
| --- | --- | --- | --- |
| 71 | 2 | TOW_DISPATCH | V00014 |
| 71 | 2 | STALL_REROUTE | V00074 around V00014 |
| 71 | 2 | LARGE_VERIFIED_RELEASE | 12 vehicles, blame=0 |
| 81 | 3 | TOW_DISPATCH | V00006 |
| 96 | 5 | LARGE_VERIFIED_RELEASE | 14 vehicles, blame=0 |
| 116 | 7 | TOW_DISPATCH | V00029 |
| 142 | 10 | TOW_DISPATCH | V00089 |
| 142 | 10 | STALL_REROUTE | V00110,V00117 around V00089 |
| 151 | 12 | TOW_DISPATCH | V00068 |
| 162 | 14 | TOW_DISPATCH | V00063 |
| 166 | 15 | TOW_DISPATCH | V00122 |
| 175 | 17 | TOW_DISPATCH | V00131 |
| 175 | 17 | PED_GRANT | CROSSWALK:EAST B_TO_A x2 |
| 180 | 20 | TOW_DISPATCH | V00117 |
| 200 | 28 | PED_GRANT | CROSSWALK:NORTH B_TO_A x4 |
| 200 | 28 | PED_GRANT | CROSSWALK:SOUTH A_TO_B x2 |
| 225 | 34 | TOW_DISPATCH | V00124 |
| 236 | 38 | PED_GRANT | CROSSWALK:EAST A_TO_B x3 |
| 236 | 38 | PED_GRANT | CROSSWALK:NORTH A_TO_B x2 |
| 236 | 38 | PED_GRANT | CROSSWALK:SOUTH B_TO_A x2 |
| 244 | 41 | PED_GRANT | CROSSWALK:WEST A_TO_B+B_TO_A x6 |
| 256 | 43 | LARGE_VERIFIED_RELEASE | 16 vehicles, blame=0 |

#### 得分最高的周期

**周期 2（tick 71）**：放行 12，未出事 12，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -1.479，提交类型 verified，睡眠 10

- 观测要点：余额 999.89，停止线候选 11，受阻路线 2，行人预警 []，司机预警 []，紧急车 [V00034, V00036, V00050]，抛锚 [V00014]
- 工具序列：r1 dispatch_tow_truck -> ok；r1 reroute_queue_around_stall -> ok；r1 dry_run_admit -> ok；r2 commit_schedule -> ok
- 战术摘要：North+East+S_S1 wave: drain heavy N_S2/N_S1 queues plus N/E right turns and S_S1 (upstream drain). Dispatched tow for stall V00014 and rerouted V00074 around it. Sleep 10 to let wave enter.
- 推理摘录：Let me analyze this observation carefully. Current tick: 71, endTick 261, ticksRemaining 190. Balance 999.8879. This is cycle 2 (previous cycle 1 at tick 61). We have a fresh observation. Key state: - Active motions (in intersection): V00002 (W_S1 straight, CROSSING), V00004 (S_R1 right, CROSSING), V00005 (N_L1 left, CROSSING), V00007 (W_R1 right, CROSSING). - Blocked routes: E_L1_LEFT until 74 (reservation), W_R1_RIGHT until 82 (reservation). Wait, W_R1_RIGHT is blocked until 82 but V00007 is W …… mit with sleep_ticks=10. Tactical summary: "North+East+S_S1 wave with tow for stall; cleared heavy north queues and rerouted one vehicle around stall." Commit params must exactly match dry_run: lane_batches same. No candidate_vehicle_ids, no speed profiles, no pedestrian phases. Let me write commit.

**周期 43（tick 256）**：放行 16，未出事 16，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -3.986，提交类型 verified，睡眠 5

- 唤醒原因：ACCIDENT_INTERRUPT incident=INC0006 locked=CROSSWALK:WEST:CELL:3:0,CROSSWALK:WEST:CELL:3:1,PAIR:S_L1_LEFT:13|S_S2_GUIDED_LEFT:13,PAIR:S_L1_LEFT:13|S_S2_GUIDED_LEFT:14,SPACE:-5:-1,SPACE:-5:-2,SPACE:-6:
- 观测要点：余额 940.02，停止线候选 16，受阻路线 12，行人预警 [E:J0, E:P7]，司机预警 [V00047:0, V00062:0, V00066:0, V00071:0, V00109:0, V00116:0, V00128:0, V00146:0]，紧急车 [V00137]，抛锚 []
- 工具序列：r1 inspect_incident -> ok；r1 inspect_crosswalk -> ok；r1 inspect_crosswalk -> ok；r1 inspect_crosswalk -> ok；r1 inspect_crosswalk -> ok；r2 order_accident_clearance -> ok；r2 dry_run_admit -> TOOL_EXECUTION_ERROR (Admission plan exceeds 16 vehicles: 25)；r3 dry_run_admit -> ok；r4 commit_schedule -> ok
- 战术摘要：ACCIDENT_INTERRUPT: cleared INC0006 to OUT_WEST_2. Committed verified straight-lane batches (N_S2,S_S1,N_S1,S_S2) so heads cross stopline before endTick; later entries/tailgaters land after endTick and are inert. Sleep 5 to end.
- 推理摘录：Let me analyze this situation carefully. Current tick is 256, endTick 261, so only 5 ticks remaining. Financial balance is 940.0246. The interrupt reason is ACCIDENT_INTERRUPT for incident INC0006. There's an accident involving V00067, locking various cells and crosswalk WEST. Let me understand what's happening. We're near the end (5 ticks left). The previous cycle had a pedestrian strike cost of 5 (pedestrianStrike: 5) which hurt. Also schoolBus cost was 0, but there's a school bus waiting at I …… ed straight-lane batches (N_S2,S_S1,N_S1,S_S2) to move heads past stopline before endTick; tailgate risks enter after endTick so inert. Sleep 5 to end." Let me make sure the summary is concise. Now, about the sleep_ticks: ticksRemaining is 5. "最后一次睡眠会被截断到截止时刻". I'll set sleep_ticks=5. Let me commit.

**周期 5（tick 96）**：放行 14，未出事 14，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -0.768，提交类型 verified，睡眠 10

- 观测要点：余额 996.47，停止线候选 11，受阻路线 2，行人预警 []，司机预警 []，紧急车 [V00034, V00036, V00050, V00056]，抛锚 [V00006]
- 工具序列：r1 dry_run_admit -> ok；r2 commit_schedule -> ok
- 战术摘要：Run E-W straight wave (E_S1,E_S2,W_S1,W_S2) 14 vehicles ~18.2 reward. Sleep 10 to let wave enter and N reservations expire for next northbound wave.
- 推理摘录：Let me analyze the current state. Current tick 96, end 261, 165 ticks remaining. Balance 996.4691. We have stopline candidates: - V00042 bus 40pax E_S1_STRAIGHT waiting 19 - V00069 truck E_S2_STRAIGHT waiting 3 - V00056 emergency N_L1_LEFT waiting 10 - V00050 emergency N_S1_STRAIGHT waiting 13 - V00038 passenger N_S2_STRAIGHT waiting 19 - V00019 truck S_L1_LEFT waiting 28 - V00039 passenger S_S1_STRAIGHT waiting 19 - V00035 truck HAZMAT S_S2_STRAIGHT waiting 23 - V00031 passenger W_L1_LEFT waiti ……  Each commit is an API call. We want to minimize commits but also act timely. Let me sleep 10. Commit now. tactical_summary: "E-W straight wave: E_S1,E_S2,W_S1,W_S2 Top batches, 14 vehicles ~18.2 reward. Sleep 10 to let wave enter and N reservations expire." Let me commit with exact same parameters.

**周期 7（tick 116）**：放行 10，未出事 10，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -2.106，提交类型 verified，睡眠 8

- 观测要点：余额 994.49，停止线候选 14，受阻路线 8，行人预警 []，司机预警 []，紧急车 [V00034, V00043, V00050, V00056]，抛锚 [V00029]
- 工具序列：r1 dispatch_tow_truck -> ok；r1 dry_run_admit -> ok；r2 commit_schedule -> ok
- 战术摘要：Serve unblocked lanes: S_L1 top3 frees emergency V00034, E_S1 bus (40p), and right turns E_R1/W_R1/N_R1 top2. Tow dispatched for W_S2 stall. Sleep 8 to reach tick 124 when S_S2/S_S1/N_L1 reservations expire.
- 推理摘录：Let me analyze this observation carefully. Current tick: 116, endTick 261, ticksRemaining 145. Balance 994.4922. We have stoplineCandidates with various vehicles. blockedRoutes list shows RESERVATION blocks: - E_S2_STRAIGHT until 130 - N_L1_LEFT until 124 - N_S1_STRAIGHT until 127 - N_S2_STRAIGHT until 126 - S_S1_STRAIGHT until 124 - S_S2_STRAIGHT until 123 - W_L1_LEFT until 126 - W_S1_STRAIGHT until 128 So blocked routes are RESERVATIONs (in-flight reservations from previous waves). Not INCIDEN ……  "scheduled: false" meaning they enter at 116 (now). Fine. Let me commit with sleep 8. tactical_summary: "Admit S_L1 top3 (free emergency V00034), E_S1 bus, and right-turn batches E_R1/W_R1/N_R1 top2. Tow dispatched for W_S2 stall. Sleep 8 to let S_S1/S_S2/N_L1 reservations expire." Let me finalize.

**周期 8（tick 124）**：放行 12，未出事 12，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -1.199，提交类型 verified，睡眠 10

- 观测要点：余额 992.39，停止线候选 12，受阻路线 6，行人预警 []，司机预警 []，紧急车 [V00034, V00043, V00050, V00056]，抛锚 [V00029]
- 工具序列：r1 dry_run_admit -> ok；r2 commit_schedule -> ok
- 战术摘要：Admit compatible unblocked heads: S_S1 top4 (121p queue), W_L1 top3, N_R1 top3, S_S2 HAZMAT 1, S_R1 1. Sleep 10 to tick 134 when tow clears W_S2 stall and W_S1/N_L1 reservations expire.
- 推理摘录：Let me analyze the current state carefully. Current tick: 124, endTick 261, ticksRemaining 137. Balance 992.3862. We need to maximize final balance. Let's understand the situation. Stopline candidates (heads): - V00079 passenger 1p, IN_E_L1_LEFT, route E_L1_LEFT, waiting 26 — blocked RESERVATION until 148. - V00111 passenger 2p, IN_E_S2_STRAIGHT, route E_S2_STRAIGHT, waiting 10 — NOT in blockedRoutes! Wait, check blockedRoutes: E_L1_LEFT, N_L1_LEFT, N_S1_STRAIGHT, N_S2_STRAIGHT, W_R1_RIGHT, W_S1 …… 34 is good. Let me commit. Tactical summary: "Admit compatible unblocked heads via batches: S_S1 top4 (clears big 121p queue), W_L1 top3, N_R1 top3, S_S2 HAZMAT 1, S_R1 1. Sleep 10 to 134 when tow clears W_S2 stall and W_S1/N_L1 reservations expire." Let me write commit with exact same lane_batches.

#### 损失最大的周期

**周期 25（tick 195）**：放行 9，未出事 6，放行行人 0，耐心风险放行 16，归因成本 18.17，周期余额变化 -5.448，提交类型 unverified，睡眠 6

- 观测要点：余额 991.75，停止线候选 13，受阻路线 6，行人预警 [N:J0, S:P10, N:P13, W:P4, W:P5, N:P16]，司机预警 [V00095:0, V00085:0, V00105:0, V00080:0, V00118:0, V00114:0, V00124:0, V00112:0]，紧急车 [V00137]，抛锚 [V00117]
- 工具序列：r1 inspect_lane_queue -> ok；r1 inspect_lane_queue -> ok；r2 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:WEST:CELL:2:1 vs V00116)；r3 inspect_crosswalk -> ok；r4 dry_run_admit -> ok；r5 commit_schedule -> ok
- 后果：INC0003 ANGLE_COLLISION tick=195 vehicles=1 pedestrians=1 estCost=5.644；INC0004 ANGLE_COLLISION tick=198 vehicles=1 pedestrians=1 estCost=5.936；INC0005 ANGLE_COLLISION tick=199 vehicles=2 pedestrians=1 estCost=6.592
- 战术摘要：Dropped NORTH-crossing lanes (E_R1/N_R1/N_S2) due to jaywalker PED:20:0 warnings; admitted safe E_L1/E_S1/W_R1. WEST ped phase conflicts with committed E_S2 discharge, deferred. Sleep 6 to tick 201 for tow/S_R1 release.
- 推理摘录：Let me analyze this situation carefully. We're at tick 195, endTick 261, 66 ticks remaining. Balance 991.75. Let me understand the state: **Stopline candidates (13):** - V00098 E_L1_LEFT, passenger, 1 pax, waiting 88 - V00142 E_R1_RIGHT, passenger, 2 pax, waiting 66 - V00149 E_S1_STRAIGHT, passenger, 1 pax, waiting 63 - V00109 N_L1_LEFT, passenger, 2 pax, waiting 82 - V00130 N_R1_RIGHT, passenger, 1 pax, waiting 71 - V00062 N_S1_STRAIGHT, passenger, 1 pax, waiting 105 - V00047 N_S2_STRAIGHT, pas …… r 10 penalty + possible accident. Definitely worse. OK, committing subset. Hmm, actually, one more idea: could I release the NORTH pedestrian phase to... no, the jaywalker is already jaywalking (can't be phase-released). And releasing NORTH peds would conflict with N vehicles. Skip. Let me finalize.

**周期 12（tick 151）**：放行 7，未出事 4，放行行人 0，耐心风险放行 13，归因成本 6.13，周期余额变化 -1.271，提交类型 verified，睡眠 8

- 观测要点：余额 990.53，停止线候选 11，受阻路线 6，行人预警 [E:P15, W:P19]，司机预警 [V00097:1, V00095:6, V00112:11]，紧急车 [V00050, V00096, V00101, V00137]，抛锚 [V00068, V00089]
- 工具序列：r1 dispatch_tow_truck -> ok；r1 dry_run_admit -> ok；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 后果：INC0001 ANGLE_COLLISION tick=176 vehicles=1 pedestrians=1 estCost=6.127
- 战术摘要：Tow dispatched for N_L1 stall V00068 (clears tick 169). Admit E-W straight platoon: E_S1 top2, W_S2 top4 (includes tailgate V00095), S_R1 right. Sleep 8 to advance platoon; next cycle serve critical EAST B_TO_A / WEST A_TO_B pedestrians once E-W exit crosswalks clear.
- 推理摘录：Let me analyze the current state carefully. Current tick: 151, endTick: 261, 110 ticks remaining. Financial balance: 990.5294. Stopline candidates: - V00079: passenger, IN_E_L1_LEFT, route E_L1_LEFT, waiting 53. But E_L1_LEFT is blocked (RESERVATION until 168). - V00120: passenger, IN_E_R1_RIGHT, route E_R1_RIGHT, waiting 33. Not blocked. - V00141: van (8 passengers), IN_E_S1_STRAIGHT, route E_S1_STRAIGHT, waiting 23. Not blocked. - V00111: passenger (2), IN_E_S2_STRAIGHT, route E_S2_STRAIGHT, w …… ally I used 2 dry-runs (quota exhausted). So I can't verify any more changes. I must commit exactly the last verified plan. So commit the last dry-run plan exactly. Good. Sleep 8. Let me write tactical_summary. One more consideration: the tow for V00068 completes at 169 (18 ticks). Fine. Commit now.

**周期 14（tick 162）**：放行 3，未出事 2，放行行人 0，耐心风险放行 6，归因成本 5.82，周期余额变化 5.981，提交类型 verified，睡眠 10

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:20:0:CROSSWALK:NORTH remaining=24
- 观测要点：余额 988.14，停止线候选 9，受阻路线 7，行人预警 [E:P4, N:P24, E:P15, W:P8]，司机预警 [V00112:0, V00097:0, V00178:4, V00124:6, V00054:7, V00080:8, V00107:10, V00165:10]，紧急车 [V00050, V00096, V00101, V00137]，抛锚 [V00063, V00068, V00122]
- 工具序列：r1 dispatch_tow_truck -> ok；r1 dry_run_admit -> ok；r2 commit_schedule -> ok
- 后果：INC0002 ANGLE_COLLISION tick=179 vehicles=1 pedestrians=1 estCost=5.819
- 战术摘要：Tow dispatched for W_S1 stall V00063 (clears 180). Admit N_R1 right-turn top3 (2 emergency + tailgater V00107), reward 2.1. Sleep 10 to 172; next cycle serve NORTH pedestrians before patience expires and open S_L1 at 174.
- 推理摘录：Let me analyze this observation carefully. Current tick: 162, endTick 261, ticksRemaining 99. Balance 988.1368. We have an interruptReason: PEDESTRIAN_PATIENCE pedestrian=PED:20:0:CROSSWALK:NORTH remaining=24. So we're woken by pedestrian patience critical. Let me look at stoplineCandidates and blockedRoutes. Blocked routes (RESERVATION): - E_L1_LEFT until 178 - E_S2_STRAIGHT until 184 - N_S1_STRAIGHT until 178 - N_S2_STRAIGHT until 182 - S_L1_LEFT until 174 - S_R1_GUIDED_STRAIGHT until 188 - S_ …… _S1 stall V00063 (clears 180). Admit N_R1 right-turn batch top3 (2 emergency + aggressive V00107) to earn 2.1 and clear N_R1 queue. Sleep 10 to 172; next serve NORTH pedestrians (patience ~14 left) and open S_L1 at 174." Wait patience: at 172, NORTH A_TO_B patience = 24-10 = 14. Good. Let me commit.

**周期 37（tick 235）**：放行 2，未出事 1，放行行人 0，耐心风险放行 6，归因成本 5.26，周期余额变化 -1.056，提交类型 unverified，睡眠 8

- 观测要点：余额 964.46，停止线候选 15，受阻路线 2，行人预警 [N:J0, E:J0, W:P14, S:P6, W:P22, N:P9, E:P14]，司机预警 [V00040:0, V00047:0, V00062:0, V00066:0, V00071:0, V00109:0, V00116:0, V00067:0]，紧急车 [V00137]，抛锚 [V00124]
- 工具序列：r1 dry_run_admit -> ok；r2 dry_run_admit -> PLANNING_HORIZON_EXCEEDED (Admission planning horizon exceeded for V00112)；r3 commit_schedule -> ok
- 后果：INC0006 ANGLE_COLLISION tick=255 vehicles=1 pedestrians=1 estCost=5.257
- 战术摘要：Legalize S_L1 red-light threats V00040/V00067 (path clear of NORTH/EAST jaywalkers; west exit estimated ok). Sleep 8 toward NORTH crosswalk clearTick 243, then serve north-exit vehicles.
- 推理摘录：Let me analyze the current state carefully. Current tick 235, endTick 261, ticksRemaining 26. Balance 964.4591. We have many stopline candidates. Some blockedRoutes with RESERVATION until tick 235 (so cleared now at tick 235). Active vehicle motion V00118 E_L1_LEFT crossing. Stalled vehicle V00124 on IN_E_L1_LEFT, tow en route completion tick 243. Exit holds: OUT_SOUTH_1 occupied until 252, OUT_WEST_0 occupied until 252. Crosswalks: several jaywalking and patience critical pedestrians. Pedestria …… ditional tailgate risk beyond V00067. In dry-run 1 (single V00040), tailgate risk was V00067. With top_n=2 (both admitted), V00067 is legal, so no tailgate from it. But could the 3rd vehicle (V00100?) tailgate? It's at distance ~12-24 (guidance range), so distance > 2, no tailgate. Fine. Commit now.

**周期 11（tick 146）**：放行 5，未出事 5，放行行人 0，耐心风险放行 8，归因成本 0，周期余额变化 -0.85，提交类型 unverified，睡眠 5

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:3:0:CROSSWALK:WEST remaining=24
- 观测要点：余额 991.38，停止线候选 13，受阻路线 6，行人预警 [E:P20, W:P24]，司机预警 [V00063:0, V00097:6, V00095:11, V00112:11]，紧急车 [V00043, V00050, V00056, V00096, V00101]，抛锚 [V00089]
- 工具序列：r1 dry_run_admit -> ok；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 战术摘要：Clear east-exiting platoon: emergencies N_L1(V00056) and W_S1(V00043), plus S_R1 right V00169; include W_S1 V00051/V00063 to legalize tailgate risk. Avoid south-exit (blocked until 162) and north-exit partially held. Sleep 5 to tick 151 for E-W straight batch and pedestrian review.
- 推理摘录：Let me analyze this situation carefully. Current tick: 146, endTick 261, ticksRemaining 115, balance 991.3795. We have an interruptReason: PEDESTRIAN_PATIENCE pedestrian=PED:3:0:CROSSWALK:WEST remaining=24. Let me look at the state. Stopline candidates (13 vehicles): - V00079 passenger E_L1_LEFT waiting 48 - V00120 passenger E_R1_RIGHT waiting 28 - V00141 van (8p) E_S1_STRAIGHT waiting 18 - V00111 passenger (2p) E_S2_STRAIGHT waiting 32 - V00056 emergency N_L1_LEFT waiting 60 - V00050 emergency  …… 2 also free. N_S2 exits south (blocked until 162), so not useful now. So sleep 5 is fine; no need for 6. Sleep 5 it is. Commit. Actually, one more consideration: the dry_run reward was 6.4, which is the expected revenue. The commit will finalize. Let me write the tactical summary. Let me commit now.

### 附：逐周期一览

| 周期 | tick | 提交 | 放行 | 行人 | 耐心风险 | 归因事故 | 归因成本 | 余额变化 | 睡眠 | 唤醒原因 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 61 | verified | 4 | 0 | 0 |  | 0 | -0.112 | 10 |  |
| 2 | 71 | verified | 12 | 0 | 0 |  | 0 | -1.479 | 10 |  |
| 3 | 81 | verified | 6 | 0 | 0 |  | 0 | -1.606 | 10 |  |
| 4 | 91 | verified | 1 | 0 | 0 |  | 0 | -0.334 | 5 |  |
| 5 | 96 | verified | 14 | 0 | 0 |  | 0 | -0.768 | 10 |  |
| 6 | 106 | verified | 3 | 0 | 0 |  | 0 | -1.209 | 10 |  |
| 7 | 116 | verified | 10 | 0 | 0 |  | 0 | -2.106 | 8 |  |
| 8 | 124 | verified | 12 | 0 | 0 |  | 0 | -1.199 | 10 |  |
| 9 | 134 | verified | 1 | 0 | 0 |  | 0 | -1.557 | 8 |  |
| 10 | 142 | hold | 0 | 0 | 0 |  | 0 | 1.749 | 8 | PEDESTRIAN_PATIENCE pedestrian=PED:11:0:CROSSWALK:EAST remai |
| 11 | 146 | unverified | 5 | 0 | 8 |  | 0 | -0.85 | 5 | PEDESTRIAN_PATIENCE pedestrian=PED:3:0:CROSSWALK:WEST remain |
| 12 | 151 | verified | 7 | 0 | 13 | INC0001 | 6.13 | -1.271 | 8 |  |
| 13 | 153 | verified | 2 | 0 | 3 |  | 0 | -1.122 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:24:0:CROSSWALK:EAST remai |
| 14 | 162 | verified | 3 | 0 | 6 | INC0002 | 5.82 | 5.981 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:20:0:CROSSWALK:NORTH rema |
| 15 | 166 | hold | 0 | 0 | 0 |  | 0 | -1.263 | 3 | PEDESTRIAN_JAYWALK pedestrian=PED:11:0:CROSSWALK:EAST |
| 16 | 169 | verified | 7 | 0 | 7 |  | 0 | -0.061 | 9 |  |
| 17 | 175 | verified | 5 | 0 | 5 |  | 0 | -1.167 | 9 | PEDESTRIAN_PATIENCE pedestrian=PED:44:0:CROSSWALK:WEST remai |
| 18 | 176 | hold | 0 | 0 | 0 |  | 0 | -1.058 | 4 | PEDESTRIAN_PATIENCE pedestrian=PED:45:1:CROSSWALK:WEST remai |
| 19 | 177 | hold | 0 | 0 | 0 |  | 0 | -5.782 | 5 | ACCIDENT_INTERRUPT incident=INC0001 locked=CROSSWALK:EAST:CE |
| 20 | 180 | hold | 0 | 0 | 0 |  | 0 | -1.701 | 4 | PEDESTRIAN_JAYWALK pedestrian=PED:3:0:CROSSWALK:WEST; ACCIDE |
| 21 | 181 | hold | 0 | 0 | 0 |  | 0 | -0.724 | 5 | PEDESTRIAN_PATIENCE pedestrian=PED:38:0:CROSSWALK:SOUTH rema |
| 22 | 184 | verified | 3 | 0 | 6 |  | 0 | 3.035 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:43:0:CROSSWALK:NORTH rema |
| 23 | 186 | hold | 0 | 0 | 0 |  | 0 | 0.585 | 5 | PEDESTRIAN_JAYWALK pedestrian=PED:20:0:CROSSWALK:NORTH |
| 24 | 187 | verified | 3 | 0 | 6 |  | 0 | 5.772 | 8 | PEDESTRIAN_PATIENCE pedestrian=PED:50:0:CROSSWALK:NORTH rema |
| 25 | 195 | unverified | 9 | 0 | 16 | INC0003 INC0004 INC0005 | 18.17 | -5.448 | 6 |  |
| 26 | 196 | hold | 0 | 0 | 0 |  | 0 | -2.237 | 3 | ACCIDENT_INTERRUPT incident=INC0003 locked=CROSSWALK:EAST:CE |
| 27 | 199 | hold | 0 | 0 | 0 |  | 0 | -6.345 | 7 | ACCIDENT_INTERRUPT incident=INC0004 locked=CROSSWALK:EAST:CE |
| 28 | 200 | unverified | 0 | 0 | 0 |  | 0 | -0.712 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:44:0:CROSSWALK:WEST; PEDES |
| 29 | 201 | unverified | 0 | 0 | 0 |  | 0 | -1.942 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:61:0:CROSSWALK:EAST remai |
| 30 | 211 | hold | 0 | 0 | 0 |  | 0 | -2.627 | 5 | PEDESTRIAN_JAYWALK pedestrian=PED:50:0:CROSSWALK:NORTH |
| 31 | 216 | unverified | 2 | 0 | 2 |  | 0 | -0.604 | 7 |  |
| 32 | 217 | hold | 0 | 0 | 0 |  | 0 | -1.06 | 4 | PEDESTRIAN_PATIENCE pedestrian=PED:86:0:CROSSWALK:SOUTH rema |
| 33 | 220 | hold | 0 | 0 | 0 |  | 0 | -2.162 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:89:0:CROSSWALK:NORTH rema |
| 34 | 225 | hold | 0 | 0 | 0 |  | 0 | -2.082 | 8 | PEDESTRIAN_PATIENCE pedestrian=PED:81:0:CROSSWALK:WEST remai |
| 35 | 233 | hold | 0 | 0 | 0 |  | 0 | -1.001 | 1 | PEDESTRIAN_PATIENCE pedestrian=PED:87:0:CROSSWALK:WEST remai |
| 36 | 234 | hold | 0 | 0 | 0 |  | 0 | -1.074 | 1 |  |
| 37 | 235 | unverified | 2 | 0 | 6 | INC0006 | 5.26 | -1.056 | 8 |  |
| 38 | 236 | verified | 0 | 0 | 0 |  | 0 | -2.276 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:106:0:CROSSWALK:WEST rema |
| 39 | 239 | hold | 0 | 0 | 0 |  | 0 | -3.328 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:91:0:CROSSWALK:EAST remai |
| 40 | 242 | hold | 0 | 0 | 0 |  | 0 | -2.255 | 6 | PEDESTRIAN_PATIENCE pedestrian=PED:113:0:CROSSWALK:WEST rema |
| 41 | 244 | verified | 0 | 0 | 0 |  | 0 | -11.804 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:101:0:CROSSWALK:WEST rema |
| 42 | 254 | hold | 0 | 0 | 0 |  | 0 | -3.715 | 7 |  |
| 43 | 256 | verified | 16 | 0 | 0 |  | 0 | -3.986 | 5 | ACCIDENT_INTERRUPT incident=INC0006 locked=CROSSWALK:WEST:CE |
| 44 | 259 | verified | 2 | 0 | 2 |  | 0 | -3.229 | 2 | PEDESTRIAN_PATIENCE pedestrian=PED:111:0:CROSSWALK:NORTH rem |

