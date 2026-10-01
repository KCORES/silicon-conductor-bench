# 运行分析：deepseek-flash_2026-10-01_141147819-122688

- 模型：deepseek-flash；种子 63916；规则版本 16；回放 schema 7
- 截止 tick 261，决策周期 62，最终余额 **607.47**
- 生成时间 2026-10-01T21:35:11.950Z；数据文件：replay_deepseek-flash_2026-10-01_141147819-122688.json、report_deepseek-flash_2026-10-01_141147819-122688.json、api-log_deepseek-flash_2026-10-01_141147819-122688.jsonl、raw-api-log_deepseek-flash_2026-10-01_141147819-122688.jsonl

## 1. 基础分析

### 1.1 上下文能力

- prompt tokens：平均 21184.8，P50 21372，P95 33791，最大 40849（n=193）
- completion tokens：平均 4816.9，P50 4156，P95 11537，最大 17410（n=193）；其中推理 tokens：平均 4601.9，P50 3896，P95 11215，最大 16926（n=193）
- 每周期 API 轮数：平均 3.1，P50 3，P95 5，最大 6（n=62）；上限 8，用满上限的周期 0 个
- 每次请求的平均字符数：系统提示 7722，user 16379.6，工具结果 5939.6，assistant 798.4；消息条数 平均 6.3，P50 6，P95 14，最大 18（n=193）
- 工具参数中的 ID 共 538 个：出现在当轮可见上下文里的占 1，当轮不可见但本局别处出现过 0 个，本局从未出现 0 个，非规范横道短键 0 个

| ID 类型 | 总数 | 当轮可见 | 别处出现 | 从未出现 | 非规范短键 |
| --- | --- | --- | --- | --- | --- |
| lane | 212 | 212 | 0 | 0 | 0 |
| vehicle | 65 | 65 | 0 | 0 | 0 |
| crosswalk | 111 | 111 | 0 | 0 | 0 |
| incident | 150 | 150 | 0 | 0 | 0 |

- 同一周期内重复提交已失败的相同调用：0 次 {}
- 提交类型：verified 17，unverified 1，hold 44；放行类提交中 verified 占 0.944
- working memory：调用 3 次 {"SAVE_PLAN":3}，观测里带有计划的周期 52 个

### 1.2 注意力分布

关注率 = 字段出现在该周期观测里、且推理文本提到它的周期数 / 字段出现的周期数。

| 概念 | 出现周期 | 提到且出现 | 关注率 | 提到周期（含未出现） | 提及次数 |
| --- | --- | --- | --- | --- | --- |
| crosswalks | 62 | 62 | 1 | 62 | 5950 |
| pedestrianAlerts | 52 | 52 | 1 | 62 | 6378 |
| emergency | 62 | 62 | 1 | 62 | 1230 |
| dischargingLanes | 26 | 26 | 1 | 39 | 607 |
| candidateConflicts | 62 | 59 | 0.952 | 59 | 1241 |
| timeBudget | 62 | 58 | 0.935 | 58 | 186 |
| recentCycles | 61 | 55 | 0.902 | 55 | 292 |
| stoplineCandidates | 62 | 55 | 0.887 | 55 | 406 |
| stalledVehicles | 32 | 28 | 0.875 | 47 | 507 |
| lastSettlement | 61 | 52 | 0.852 | 52 | 180 |
| holds | 55 | 44 | 0.8 | 44 | 187 |
| driverAlerts | 55 | 41 | 0.745 | 47 | 542 |
| laneGuidance | 62 | 42 | 0.677 | 42 | 111 |
| revokedAdmissions | 24 | 16 | 0.667 | 25 | 116 |
| activeVehicleMotions | 44 | 27 | 0.614 | 28 | 59 |
| workingMemory | 52 | 17 | 0.327 | 19 | 36 |
| laneMatrices | 0 | 0 |  | 61 | 1160 |
| exits | 0 | 0 |  | 61 | 2435 |
| reservedUntil | 0 | 0 |  | 60 | 1211 |
| incidentBlocked | 0 | 0 |  | 47 | 781 |

中断响应：

| 中断类型 | 次数 | 有响应 | 响应率 | 判定规则 |
| --- | --- | --- | --- | --- |
| VEHICLE_RED_LIGHT | 2 | 2 | 1 | 推理文本提到了中断对象 ID |
| PEDESTRIAN_PATIENCE | 26 | 9 | 0.346 | 同周期任一试算或提交带 pedestrian_phases |
| PEDESTRIAN_JAYWALK | 16 | 4 | 0.25 | 推理文本提到了中断对象 ID |
| ACCIDENT_INTERRUPT | 22 | 22 | 1 | 同周期调用 inspect_incident / order_accident_clearance / set_lane_detour |

- 每次回复的推理字符数：平均 16638.8，P50 14563，P95 38985，最大 57489（n=193）

### 1.3 tool_call 准确性

- 工具调用 389 次，成功 348 次，成功率 0.895
- 失败分类：{"RESOURCE_CONFLICT":24,"LANE_HEAD_NOT_READY":8,"PLANNING_HORIZON_EXCEEDED":3,"DRY_RUN_QUOTA_EXHAUSTED":2,"NOT_AT_STOPLINE":2,"TOOL_EXECUTION_ERROR":1,"SCHEMA_ERROR":1}
- 每次回复的工具调用数分布：{"1":110,"2":26,"3":24,"4":18,"5":9,"6":5,"8":1}；finish_reason：{"tool_calls":193}
- API 错误 0 次 {}；回退周期 []
- 从未使用的工具：set_lane_detour、dispatch_emergency_convoy、guide_inbound_lane_change

| 工具 | 调用 | 成功 | 成功率 | 结果分类 |
| --- | --- | --- | --- | --- |
| dry_run_admit | 74 | 34 | 0.459 | {"OK":34,"LANE_HEAD_NOT_READY":8,"DRY_RUN_QUOTA_EXHAUSTED":2,"NOT_AT_STOPLINE":2,"RESOURCE_CONFLICT":24,"TOOL_EXECUTION_ERROR":1,"PLANNING_HORIZON_EXCEEDED":3} |
| commit_schedule | 62 | 62 | 1 | {"OK":62} |
| dispatch_tow_truck | 7 | 7 | 1 | {"OK":7} |
| reroute_queue_around_stall | 1 | 1 | 1 | {"OK":1} |
| inspect_lane_queue | 24 | 24 | 1 | {"OK":24} |
| manage_working_memory | 3 | 2 | 0.667 | {"OK":2,"SCHEMA_ERROR":1} |
| inspect_crosswalk | 68 | 68 | 1 | {"OK":68} |
| inspect_incident | 85 | 85 | 1 | {"OK":85} |
| order_accident_clearance | 65 | 65 | 1 | {"OK":65} |

错误样例：

- **LANE_HEAD_NOT_READY**
  - c4 t90 dry_run_admit：Lane head is not ready: IN_W_S1_STRAIGHT；参数 `{"lane_batches":[{"lane_id":"IN_W_S1_STRAIGHT","top_n":4,"speed_profile":"CRUISE"},{"lane_id":"IN_W_R1_RIGHT","top_n":3,"speed_profile":"CRUISE"}]}`
  - c7 t120 dry_run_admit：Lane head is not ready: IN_N_S1_STRAIGHT；参数 `{"lane_batches":[{"lane_id":"IN_S_L1_LEFT","top_n":3,"speed_profile":"CRUISE"},{"lane_id":"IN_N_R1_RIGHT","top_n":4,"speed_profile":"CRUISE"},{"lane_id":"IN_N_S1_STRAIGHT","top_n":3,"speed_profile":"CRUISE"},{"lane_id":"`
  - c10 t141 dry_run_admit：Lane head is not ready: IN_S_L1_LEFT；参数 `{"lane_batches":[{"lane_id":"IN_S_L1_LEFT","top_n":4,"speed_profile":"CRUISE"},{"lane_id":"IN_W_S1_STRAIGHT","top_n":4,"speed_profile":"CRUISE"},{"lane_id":"IN_E_L1_LEFT","top_n":3,"speed_profile":"CRUISE"}]}`
- **DRY_RUN_QUOTA_EXHAUSTED**
  - c10 t141 dry_run_admit：-；参数 `{"candidate_vehicle_ids":["V00103"]}`
  - c15 t160 dry_run_admit：-；参数 `{"lane_batches":[{"lane_id":"IN_E_S2_STRAIGHT","speed_profile":"CRUISE","top_n":7},{"lane_id":"IN_E_R1_RIGHT","speed_profile":"CRUISE","top_n":5},{"lane_id":"IN_N_R1_RIGHT","speed_profile":"CRUISE","top_n":1},{"lane_id":`
- **NOT_AT_STOPLINE**
  - c11 t142 dry_run_admit：none；参数 `{"candidate_vehicle_ids":["V00034","V00103"],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:EAST","directions":["B_TO_A"]}]}`
  - c16 t162 dry_run_admit：none；参数 `{"candidate_vehicle_ids":["V00193"]}`
- **RESOURCE_CONFLICT**
  - c11 t142 dry_run_admit：CROSSWALK:EAST:CELL:2:0 vs V00125；参数 `{"candidate_vehicle_ids":["V00103"],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:EAST","directions":["B_TO_A"]}]}`
  - c12 t146 dry_run_admit：CROSSWALK:NORTH:CELL:0:0 vs V00061；参数 `{"candidate_vehicle_ids":["V00079","V00103"],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:EAST","directions":["B_TO_A"]},{"crosswalk_id":"CROSSWALK:WEST","directions":["A_TO_B"]},{"crosswalk_id":"CROSSWALK:NORTH","dir`
  - c14 t153 dry_run_admit：CROSSWALK:EAST:CELL:7:0 vs V00084；参数 `{"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:EAST","directions":["B_TO_A"]},{"crosswalk_id":"CROSSWALK:WEST","directions":["A_TO_B"]}]}`
- **TOOL_EXECUTION_ERROR**
  - c15 t160 dry_run_admit：Admission plan exceeds 16 vehicles: 18；参数 `{"lane_batches":[{"lane_id":"IN_W_S1_STRAIGHT","top_n":8,"speed_profile":"CRUISE"},{"lane_id":"IN_E_R1_RIGHT","top_n":7,"speed_profile":"CRUISE"},{"lane_id":"IN_N_R1_RIGHT","top_n":3,"speed_profile":"CRUISE"}]}`
- **SCHEMA_ERROR**
  - c50 t238 manage_working_memory：[ { "code": "too_big", "maximum": 160, "type": "string", "inclusive": true, "exact": false, "message": "String must contain at most 160 character(s)", "path": [；参数 `{"action":"SAVE_PLAN","plan_data":{"phase_name":"W-axis straight wave when reservations expire","intended_duration":8,"resume_condition":"t>=246: dry-run/commit W_S1+W_S2 Top-N straights (WEST crosswalk clean until ~249)`
- **PLANNING_HORIZON_EXCEEDED**
  - c57 t246 dry_run_admit：Admission planning horizon exceeded for V00278；参数 `{"lane_batches":[{"lane_id":"IN_S_R1_RIGHT","top_n":8}]}`
  - c57 t246 dry_run_admit：Admission planning horizon exceeded for V00278；参数 `{"lane_batches":[{"lane_id":"IN_S_R1_RIGHT","top_n":4}]}`
  - c59 t249 dry_run_admit：Admission planning horizon exceeded for V00296；参数 `{"lane_batches":[{"lane_id":"IN_S_R1_RIGHT","top_n":6}]}`

### 1.4 Agent 能力

- 周期内工具序列（D=试算，C=提交，T=其他工具）：{"DDC":7,"DC":6,"TTDC":4,"TTTTTDDC":4,"TTTTC":3,"TTC":3,"TTTTTTDC":3,"TTTDC":2,"TTDTTDC":2,"TTTTTC":2,"TTTTTTC":2,"TTTTTTTTTTC":2,"TTTTTTTTTDC":2,"TTDDC":1,"DTDTTDTC":1,"DDDC":1,"DTTDC":1,"TTTTTTTDC":1,"TTTDDC":1,"TTTTDDC":1,"TTTTTTTC":1,"TTTTTTTTDDC":1,"TTTC":1,"TTTTTTTTDC":1,"TTDTTTTC":1,"TTTTDTTC":1,"TTTTTTDTTTTDC":1,"TTDTTTC":1,"TTTTTTDDTTTC":1,"TTTTTTTTTC":1,"TTTTTTDTDC":1,"TTTTTTTTTDDC":1,"TTTDTTTDC":1}
- 含提交的周期里先试算再提交的比例：0.758
- 提交构成：{"verified":17,"unverified":1,"hold":44,"reckless":0}；每周期放行车数 平均 2.2，P50 0，P95 13，最大 16（n=62）；共放行 137 辆
- 成功提交 62 次，其中使用 lane_batches 14 次；每次 top_n 合计 平均 2.1，P50 0，P95 13，最大 16（n=62）
- 速度档位：{"CRUISE":38}；sleep_ticks：平均 8.2，P50 10，P95 10，最大 10（n=62） {"2":5,"3":3,"4":2,"5":2,"6":3,"7":2,"8":5,"9":1,"10":39}
- 工具使用：{"inspect_incident":85,"dry_run_admit":74,"inspect_crosswalk":68,"order_accident_clearance":65,"commit_schedule":62,"inspect_lane_queue":24,"dispatch_tow_truck":7,"manage_working_memory":3,"reroute_queue_around_stall":1}
- 决策开销：API 193 次，扣 3.86；非终结工具 327 次，扣 0.4905

与同条件 baseline 对比：

| 策略 | 最终余额 | 放行车辆 | 未服务负债 | 事故数 | 锁格扣费 | 上游积压 | 撞人 | 闯红灯罚 | 行人奖励 | 校车 | 拖车 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| deepseek-flash | 607.47 | 137 | 182.6 | 7 | 123.68 | 44.3 | 40 | 9.1 | 0 | 20 | 8.4 |
| baseline-balanced | 674.49 | 84 | 219.6 | 6 | 21.3 | 58.85 | 25 | 5.5 | 0 | 0 | 8.4 |
| baseline-balanced-bus | 659.61 | 87 | 208.1 | 4 | 90.26 | 53.27 | 5 | 4.9 | 0 | 0 | 6 |
| baseline-balanced-no-ped | 717.59 | 132 | 187.4 | 4 | 74.39 | 47.7 | 0 | 0 | 0 | 10 | 10.8 |
| baseline-longest-queue | 633.99 | 183 | 195.7 | 10 | 76.09 | 44.92 | 50 | 11.6 | 0 | 10 | 10.8 |
| baseline-random | 539.49 | 114 | 207.6 | 7 | 139.2 | 73.82 | 35 | 11 | 0 | 0 | 7.2 |
| baseline-search | 788.38 | 122 | 185.4 | 2 | 3.69 | 45.85 | 10 | 6.7 | 0 | 0 | 8.4 |

## 2. 进阶分析

### 2.1 逻辑推理

- 试算失败（不含额度用完）38 次；之后再试 23 次，其中改了参数 23 次，成功 14 次（0.609）；失败所在周期最终 verified 提交 6 次、hold 31 次
- 推理中"路线 X 经过/不经过 Y 横道"的断言 334 条，正确 309，错误 25，准确率 0.925；前半局 8/58 错，后半局 17/276 错
  - c2：「S_L1_LEFT turns from southbound to east? It would cross N」（实际经过 CROSSWALK:SOUTH+CROSSWALK:WEST）
  - c11：「S_L1_LEFT left turn from south — does it cross the EAST」（实际经过 CROSSWALK:SOUTH+CROSSWALK:WEST）
  - c13：「E_L1_LEFT turns left, crossing W」（实际经过 CROSSWALK:EAST+CROSSWALK:SOUTH）
  - c16：「E_L1_LEFT) would cross the north」（实际经过 CROSSWALK:EAST+CROSSWALK:SOUTH）
  - c21：「W_R1_RIGHT (west right → north)? Actually which vehicles cross NORTH」（实际经过 CROSSWALK:WEST+CROSSWALK:SOUTH）
  - c24：「N_R1_RIGHT goes from North to East? Then it exits EAST, crossing EAST」（实际经过 CROSSWALK:NORTH+CROSSWALK:WEST）
  - c27：「E_L1_LEFT (east to north) exits via north leg → crosses NORTH」（实际经过 CROSSWALK:EAST+CROSSWALK:SOUTH）
  - c27：「W_L1_LEFT goes west→south, exits via south leg → crosses SOUTH」（实际经过 CROSSWALK:WEST+CROSSWALK:NORTH）
- 推理写"安全/无冲突"但同一轮试算冲突：18 次
  - c12 r1 t146：「 admit V00079 and V00103 together? They don't conflict with each other (not listed). Let me check: candidateConflicts lists pairs. V00079-V00103 not listed, so no conflict. But wait, V00079 route E_L1_LEFT - E_L1 is a left turn from east. Hmm, E_L1_LEFT. V00103 is W_R1_RIGHT from west. Now pedestrians: If I admit these vehicles, 」→ CROSSWALK:NORTH:CELL:0:0 vs V00061
  - c14 r1 t153：「nflicts with W traffic that we want to release at 159. Releasing WEST peds conflicts with E discharging. Therefore: release NORTH and SOUTH crosswalk peds now (no conflict), and defer EAST/WEST peds to a later window? But EAST/WEST peds have patience 13/17 → jaywalk ~166/170. Hmm, by 166-170, W_S1 traffic still going. So conflict」→ CROSSWALK:EAST:CELL:7:0 vs V00084
  - c18 r2 t172：「, does it conflict with the discharging IN_E_S2_STRAIGHT? Those are same direction different lanes. E_S1 straight and E_S2 straight — different parallel lanes, no conflict. Also candidateConflicts: V00170 (E_S1) conflicts with V00109 (N_L1), V00057 (N_S1), V00132 (S_S2), V00031 (W_L1). Those are the perpendicular ones. So admitti」→ CROSSWALK:EAST:CELL:7:0 vs INCIDENT
  - c20 r2 t175：「ase WEST/EAST/NORTH? Let me test with a dry_run including all and see if it errors due to conflict. If dry_run ok, then... but "ok only means reservation table no conflict, doesn't mean no collision". For pedestrians, the reservation table presumably includes crosswalk cells and vehicle paths. If a vehicle path uses those cells, 」→ CROSSWALK:EAST:CELL:7:1 vs INCIDENT
  - c20 r3 t175：「est those three. Actually let me think: WEST crosswalk - is it locked? The incident locked CROSSWALK:EAST cells and various SPACE/PAIR. Not WEST cells. So WEST should be fine. Let me dry_run [SOUTH, WEST, NORTH]. Hmm but wait, if all three accepted, then I commit with those three (max 4 phases allowed). Good. But actually, do I want」→ CROSSWALK:NORTH:CELL:0:0 vs V00155
  - c21 r2 t176：「过的横道上也没有行人或行人预约" for red-light running. Hmm. I think the atomic validation in dry_run handles conflicts between vehicle routes and pedestrian phases. If ok, it should be safe. Let me try. But actually, to be safe and simple, maybe I should prioritize. Let me think about magnitude: - Emergency stationary penalty: 0.0015/tick. Small. 」→ CROSSWALK:WEST:CELL:0:0 vs V00130
- 自我修正标记（Wait/Actually/Let me recheck…）：共 7258 次，每次回复 平均 37.6，P50 29，P95 98，最大 176（n=193）
- 认知模式 letterCounting：11 处
  - 「 list includes 13 lanes. Which lanes are missing? 4 directions * 4 lanes = 16. Listed: N_S1, N_S2, W_S1, S_S1, S_L1, W_R1, W_S2, N_R1, E_L1, W_L1, E_S1, S_S2, S_R1 = 13. Missing: E_S2, N_L1, S_? wait let me recount. Lanes per direction: L1_LEFT, S1_STRAIGHT, S2_STRAIGHT, R1_RIGHT. E: E_L1 (listed), E_S1 (listed), E_S2 (missing), E_R1 (missing). W: W_L1 (listed), W_S1 (listed), W_S2 (listed), W_R1 (listed). all 」
  - 「uble check commit params identical to dry-run: lane_batches [{"lane_id":"IN_W_S2_STRAIGHT","top_n":5,"speed_profile":"CRUISE"}]. No candidate ids, no peds, no speed profiles. Good. tactical_summary ≤ 300 chars. Go. Let me analyze this situation carefully. Current tick 153, end 261, 108 ticks remaining. Balance 990.66. Key observations: - All stoplineCandidates' routes are in blockedRoutes with RESERVATION 」
  - 「ep. Let me sleep 10 → 196. Actually, wait: completion 204. If I sleep 10 → 196, next cycle 196, then I might sleep to ~204-206 to let tow complete. Good. Let me commit sleep 10. tactical_summary (max 300 chars). Let me write: "t186: both incidents CRITICAL PILEUP under clearance (INC0002~207, INC0001~230). All inlet routes severed except E_R1_RIGHT, blocked by jaywalker PED:24 (EAST) => no safe admit. Tow 」
- 认知模式 idFormat：0 处

### 2.2 复杂环境博弈

**行人与车辆**

- 行人相位尝试 17 次，成功 1 次 {"RESOURCE_CONFLICT":15,"NOT_AT_STOPLINE":1,"OK":1}
- 实际放行 2 批 9 人；闯红灯 16 次 16 人；被撞 8 人；奖励 0，扣费 {"delay":0.98,"jaywalk":9.1,"strike":40}

行人相位冲突样例：

| 周期 | tick | 冲突偏移 at | 冲突 |
| --- | --- | --- | --- |
| 11 | 142 | 20 | CROSSWALK:EAST:CELL:2:0 vs V00125 |
| 12 | 146 | 0 | CROSSWALK:NORTH:CELL:0:0 vs V00061 |
| 14 | 153 | 0 | CROSSWALK:EAST:CELL:7:0 vs V00084 |
| 14 | 153 | 0 | CROSSWALK:WEST:CELL:0:0 vs V00061 |
| 18 | 172 | 0 | CROSSWALK:EAST:CELL:7:0 vs INCIDENT |
| 18 | 172 | 0 | CROSSWALK:NORTH:CELL:0:0 vs V00130 |
| 20 | 175 | 0 | CROSSWALK:EAST:CELL:7:1 vs INCIDENT |
| 20 | 175 | 0 | CROSSWALK:NORTH:CELL:0:0 vs V00155 |
| 21 | 176 | 0 | CROSSWALK:WEST:CELL:0:0 vs V00130 |
| 24 | 180 | 0 | CROSSWALK:NORTH:CELL:0:0 vs V00186 |

在行人耐心告急（PATIENCE_CRITICAL）时放行、且路线经过该横道的车辆：156 车次

| 周期 | tick | 车辆 | 路线 | 横道 | 行人 | 剩余耐心 | 该行人后来被撞 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 12 | 146 | V00079 | E_L1_LEFT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 20 | 是 |
| 12 | 146 | V00103 | W_R1_RIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 24 | 是 |
| 13 | 151 | V00045 | W_S2_STRAIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 15 | 是 |
| 13 | 151 | V00045 | W_S2_STRAIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 19 | 是 |
| 13 | 151 | V00072 | W_S2_STRAIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 15 | 是 |
| 13 | 151 | V00072 | W_S2_STRAIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 19 | 是 |
| 13 | 151 | V00087 | W_S2_STRAIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 15 | 是 |
| 13 | 151 | V00087 | W_S2_STRAIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 19 | 是 |
| 13 | 151 | V00095 | W_S2_STRAIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 15 | 是 |
| 13 | 151 | V00095 | W_S2_STRAIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 19 | 是 |
| 13 | 151 | V00102 | W_S2_STRAIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 15 | 是 |
| 13 | 151 | V00102 | W_S2_STRAIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 19 | 是 |
| 15 | 160 | V00066 | W_S1_STRAIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 6 | 是 |
| 15 | 160 | V00066 | W_S1_STRAIGHT | CROSSWALK:EAST | PED:24:0:CROSSWALK:EAST | 17 |  |
| 15 | 160 | V00066 | W_S1_STRAIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 10 | 是 |

行人时间线：

| tick | 事件 | 横道 | 人数 |
| --- | --- | --- | --- |
| 171 | PED_COLLISION | CROSSWALK:EAST | 1 |
| 172 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 177 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 181 | PED_COLLISION | CROSSWALK:WEST | 1 |
| 182 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 186 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 199 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 200 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 205 | PED_JAYWALK | CROSSWALK:SOUTH | 1 |
| 208 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 211 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 211 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 225 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 228 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 234 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 236 | PED_COLLISION | CROSSWALK:EAST | 1 |
| 236 | PED_COLLISION | CROSSWALK:NORTH | 1 |
| 239 | PED_GRANT | CROSSWALK:SOUTH | 3 |
| 239 | PED_GRANT | CROSSWALK:WEST | 6 |
| 239 | PED_COLLISION | CROSSWALK:WEST | 1 |
| 243 | PED_COLLISION | CROSSWALK:WEST | 1 |
| 244 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 244 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 249 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 251 | PED_COLLISION | CROSSWALK:WEST | 1 |
| 257 | PED_COLLISION | CROSSWALK:NORTH | 1 |

**事故处置**

| 事故 | 类型 | 发生 | 车辆 | 行人 | 首次响应 | 清障令 | 清障调用次数 | 关闭 | 事故后才放行、后来卷入 | 非模型放行（抢行） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| INC0001 | PILEUP | 171 | 8 | 1 | 172 | 172 | 20 | 230 | V00034@176 |  |
| INC0002 | PILEUP | 181 | 6 | 1 | 182 | 182 | 14 | 230 | V00058@185 |  |
| INC0003 | ANGLE_COLLISION | 236 | 2 | 1 | 237 | 237 | 8 | 251 |  |  |
| INC0004 | ANGLE_COLLISION | 236 | 1 | 1 | 237 | 237 | 8 | 251 |  |  |
| INC0005 | ANGLE_COLLISION | 239 | 1 | 2 | 240 | 240 | 6 | 259 |  |  |
| INC0006 | PILEUP | 241 | 3 | 1 | 241 | 241 | 8 |  |  | V00040 |
| INC0007 | ANGLE_COLLISION | 257 | 1 | 1 | 258 | 258 | 1 |  |  |  |

事故成本估算：

| 事故 | 最终严重度 | 锁格（含二次） | 开放拍数 | 危化品 | 校车 | 分摊锁格费 | 估算总成本 | 放行来源 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| INC0001 | CRITICAL | 58 | 59 |  | 是 | 48.979 | 63.979 | V00169@c9 V00066@c15 V00085@c15 V00087@c13 V00095@c13 V00092@c15 V00102@c13 V00034@c21 |
| INC0002 | CRITICAL | 49 | 49 |  |  | 34.365 | 39.365 | V00155@c19 V00186@c19 V00170@c19 V00203@c17 V00031@c25 V00058@c25 |
| INC0003 | SERIOUS | 20 | 15 |  |  | 2.863 | 7.863 | V00179@c47 V00217@c47 |
| INC0004 | SERIOUS | 17 | 15 |  |  | 2.433 | 7.433 | V00205@c47 |
| INC0005 | SERIOUS | 28 | 20 |  |  | 5.343 | 15.343 | V00129@c46 |
| INC0006 | CRITICAL | 96 | 20 |  |  | 27.481 | 32.481 | V00040@c- V00108@c46 V00114@c46 |
| INC0007 | SERIOUS | 58 | 4 |  | 是 | 2.214 | 17.214 | V00065@c46 |

**司机抢行**

总计 {"redLight":2,"tailgate":0,"cutIn":2}

| 周期 | 类型 | 车辆 | 此前出现在 driverAlerts 的周期数 | 最后一次预警 | 卷入事故 |
| --- | --- | --- | --- | --- | --- |
| 10 | VEHICLE_RED_LIGHT | V00008 | 2 | IN_E_L1_LEFT 距停止线 0 剩余 0 |  |
| 49 | VEHICLE_RED_LIGHT | V00040 | 10 | IN_S_L1_LEFT 距停止线 0 剩余 0 | INC0006 |

**紧急车辆与抛锚**

紧急车辆延误扣费 0.461

| 车辆 | 首次进入 12 格 | 放行 tick | 等待拍数 | 最长静止 |
| --- | --- | --- | --- | --- |
| V00034 | 70 | 176 | 106 | 71 |
| V00036 | 70 | 100 | 30 | 20 |
| V00043 | 80 | 91 | 11 | 0 |
| V00050 | 80 | 118 | 38 | 29 |
| V00056 | 80 | 100 | 20 | 14 |
| V00096 | 120 | 150 | 30 | 24 |
| V00101 | 142 | 160 | 18 | 6 |
| V00217 | 160 | 234 | 74 | 54 |
| V00241 | 182 |  |  | 76 |
| V00265 | 182 |  |  | 56 |

拖车费 8.4，链式加价 0.291

| 车辆 | 车道 | 抛锚 | 派拖车 | 派车延迟 | 绕行 |
| --- | --- | --- | --- | --- | --- |
| V00014 | IN_S_R1_RIGHT | 64 | 90 | 26 | 70 |
| V00006 | IN_N_R1_RIGHT | 65 | 70 | 5 |  |
| V00029 | IN_W_S2_STRAIGHT | 85 | 90 | 5 |  |
| V00063 | IN_W_S1_STRAIGHT | 100 | 120 | 20 |  |
| V00068 | IN_N_L1_LEFT | 103 | 120 | 17 |  |
| V00122 | IN_W_R1_RIGHT | 149 | 174 | 25 |  |
| V00099 | IN_W_S1_STRAIGHT | 174 | 186 | 12 |  |
| V00221 | IN_E_R1_RIGHT | 252 |  |  |  |

### 2.3 亮眼操作与最差操作

周期价值 = 未卷入事故的放行车数 + 1.5×放行行人 + 2×成功的特情工具 − 归因事故成本。事故成本按锁格×开放时长分摊本局真实锁格扣费，再加撞人和校车罚款，平均分给放行了涉事车辆的周期。这是用于挑选证据的启发式，不是精确账目。

亮点事件：

| tick | 周期 | 类型 | 说明 |
| --- | --- | --- | --- |
| 70 | 2 | TOW_DISPATCH | V00006 |
| 70 | 2 | STALL_REROUTE | V00074 around V00014 |
| 70 | 2 | LARGE_VERIFIED_RELEASE | 13 vehicles, blame=0 |
| 90 | 4 | TOW_DISPATCH | V00029 |
| 90 | 4 | TOW_DISPATCH | V00014 |
| 100 | 5 | LARGE_VERIFIED_RELEASE | 13 vehicles, blame=0 |
| 120 | 7 | TOW_DISPATCH | V00063 |
| 120 | 7 | TOW_DISPATCH | V00068 |
| 156 | 14 | LANE_GUIDANCE | V00097 IN_N_S2_STRAIGHT->IN_N_L1_LEFT |
| 160 | 15 | LANE_GUIDANCE | V00112 IN_S_L1_LEFT->IN_S_S2_STRAIGHT |
| 160 | 15 | LARGE_VERIFIED_RELEASE | 16 vehicles, blame=23.99 |
| 174 | 19 | TOW_DISPATCH | V00122 |
| 186 | 29 | TOW_DISPATCH | V00099 |
| 239 | 51 | PED_GRANT | CROSSWALK:SOUTH A_TO_B+B_TO_A x3 |
| 239 | 51 | PED_GRANT | CROSSWALK:WEST A_TO_B+B_TO_A x6 |

#### 得分最高的周期

**周期 2（tick 70）**：放行 13，未出事 13，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -1.52，提交类型 verified，睡眠 10

- 观测要点：余额 999.89，停止线候选 9，受阻路线 2，行人预警 []，司机预警 []，紧急车 [V00034, V00036]，抛锚 [V00006, V00014]
- 工具序列：r1 dispatch_tow_truck -> ok；r1 reroute_queue_around_stall -> ok；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 战术摘要：Cycle2: tow V00006 (clears t88), reroute V00074 off S_R1 stall. Admit EW straights (W_S1 x6, W_S2 x5, E_S1 x2)=13 veh, reward 11.2. Sleep 10 to discharge.
- 推理摘录：Let me analyze the situation. Current tick 70, end tick 261, remaining 191. We have stopline candidates. Let me look at conflicts and blocked routes. Blocked routes: - E_L1_LEFT blocked until 74 (RESERVATION) - W_R1_RIGHT blocked until 82 (RESERVATION) So V00008 (IN_E_L1_LEFT) is blocked until 74. V00022 (IN_W_R1_RIGHT) blocked until 82. Discharging lanes: IN_E_R1_RIGHT has 1 vehicle remaining, nextEnterTick 76, clear tick 86. Active motions: several crossing, V00011 SCHEDULED_ENTERING at 76. St …… t 80. So crossing occupied. NS can't. Let me just sleep 10 and reassess. Actually, I realize there might be an issue: will the pipeline continue to completion while I sleep only 10 and then do other things? Yes, permits persist and vehicles enter per schedule. OK commit. Let me set tactical_summary.

**周期 5（tick 100）**：放行 13，未出事 13，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -0.937，提交类型 verified，睡眠 10

- 观测要点：余额 994.98，停止线候选 11，受阻路线 3，行人预警 []，司机预警 []，紧急车 [V00034, V00050, V00056]，抛锚 [V00014, V00029]
- 工具序列：r1 dry_run_admit -> ok；r2 commit_schedule -> ok
- 战术摘要：Cycle5 (t100): N phase wave — all 4 N lanes (S1 top4 incl emergency V00050, S2 top4, R1 top3, L1 top2 incl emergency V00056). Reward ~11.2. Sleep 10 -> t110; S routes unblock 108-109, tows clear t108, then launch S + remaining.
- 推理摘录：Let me analyze this situation carefully. Current tick 100, end tick 261. Balance 994.975. Key observations: - Route E_L1_LEFT blocked until 108 (RESERVATION) - S_S1_STRAIGHT blocked until 109 (RESERVATION) - S_S2_STRAIGHT blocked until 108 (RESERVATION) Available stopline candidates not on blocked routes: - V00008 E_L1_LEFT - blocked - V00082 E_R1_RIGHT - free - V00069 E_S2_STRAIGHT - free - V00056 N_L1_LEFT - free (emergency) - V00017 N_R1_RIGHT - free - V00015 N_S1_STRAIGHT - free - V00010 N_S …… tick). Upstream queues penalized 0.002/tick. North upstream queues waiting 1 each — small. Actually there's a big consideration: many lanes have been waiting a long time (waitingTicks up to 39). The stationary penalty after 10 ticks. But we can't clear everything at once. Let's just proceed. Commit.

**周期 6（tick 110）**：放行 13，未出事 13，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -1.589，提交类型 verified，睡眠 10

- 观测要点：余额 994.04，停止线候选 9，受阻路线 5，行人预警 []，司机预警 []，紧急车 [V00034, V00050]，抛锚 [V00063, V00068]
- 工具序列：r1 dry_run_admit -> ok；r2 commit_schedule -> ok
- 战术摘要：Cycle6 (t110): N-S axis wave — S_S1 straight top4 (73pax lane), S_S2 straight top3 (incl HAZMAT V00035), W_R1 right top4 (57pax), E_R1 right top2. 13 vehicles, reward~6.5. Sleep10 -> t120; S discharge continues to ~140.
- 推理摘录：Let me analyze this situation. Current tick 110, end 261. Balance 994.0384. Let me look at the state. Stopline candidates: - V00008 passenger 1, IN_E_L1_LEFT, waiting 49, route E_L1_LEFT — blocked (RESERVATION until 113) - V00082 passenger 2, IN_E_R1_RIGHT, waiting 11, route E_R1_RIGHT — not blocked - V00088 truck 1, IN_E_S1_STRAIGHT, waiting 9, route E_S1_STRAIGHT — blocked until 125 - V00069 truck 1, IN_E_S2_STRAIGHT, waiting 17, route E_S2_STRAIGHT — blocked until 126 - V00019 truck 1, IN_S_L …… do something else, conflicts. If I sleep 10 again (→130), those finish. Alternatively sleep 10 now, and at 120 decide based on state. Fine. Let me commit. commit_schedule must match dry run exactly: lane_batches same, no vehicle_speed_profiles, no pedestrian_phases. sleep_ticks 10. tactical_summary.

**周期 7（tick 120）**：放行 9，未出事 8，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -4.327，提交类型 verified，睡眠 10

- 观测要点：余额 992.45，停止线候选 10，受阻路线 7，行人预警 []，司机预警 []，紧急车 [V00034, V00096]，抛锚 [V00063, V00068]
- 工具序列：r1 dispatch_tow_truck -> ok；r1 dispatch_tow_truck -> ok；r1 dry_run_admit -> LANE_HEAD_NOT_READY (Lane head is not ready: IN_N_S1_STRAIGHT)；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 战术摘要：Cycle7 (t120): 两条紧急车清障+可用右转/左转波。放行 S_L1_LEFT top3(含紧急V00034,109pax车道), N_R1_RIGHT top4(含紧急V00096), E_R1_RIGHT top2。派拖车V00063/V00068(138清)。reward~3。睡10 -> t130，等 W_L1(127)/W_S2(129)/N_S2(132) 解禁。
- 推理摘录：Let me analyze this traffic situation carefully. Current tick 120, end 261, 141 ticks remaining. Balance 992.4495. Let me understand the state: **stoplineCandidates** (vehicles at stoplines): - V00008 passenger 1, IN_E_L1_LEFT, route E_L1_LEFT (blocked until 133 RESERVATION) - V00106 passenger 2, IN_E_R1_RIGHT, route E_R1_RIGHT (not blocked) - V00088 truck 1, IN_E_S1_STRAIGHT, route E_S1_STRAIGHT (blocked until 136) - V00069 truck 1, IN_E_S2_STRAIGHT, route E_S2_STRAIGHT (blocked until 135) - V0 …… ehicles? Actually the dry run reward 3.0 = sum of departure revenue for the 9 vehicles: V00019 truck 1 → 0.1, V00027 ?, V00034 emergency 1 → 1, V00046 truck 1 → 0.1, V00053?, V00061?, V00096 emergency 1, V00106 passenger 2 → 0.2, V00113? Hmm 3.0. Whatever, it's revenue. Commit with identical params.

**周期 8（tick 130）**：放行 11，未出事 11，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -1.064，提交类型 verified，睡眠 10

- 观测要点：余额 988.12，停止线候选 11，受阻路线 7，行人预警 []，司机预警 [V00008:10]，紧急车 [V00034, V00096]，抛锚 [V00063, V00068]
- 工具序列：r1 inspect_lane_queue -> ok；r1 inspect_lane_queue -> ok；r1 inspect_lane_queue -> ok；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 战术摘要：Cycle8 (t130): E-W money wave — E_S2 straight top6 (99pax, ~9.9) + E_R1 right top5 (6pax). Reward 10.5. Sleep10 -> t140, wait E_S1(136)/W_S2(139)/S_R1(134) unblock; watch V00008 aggressive red-light ~140.
- 推理摘录：Let me analyze this traffic situation carefully. Current state at tick 130, endTick 261, ticksRemaining 131. Balance: 988.1221 Let me look at the key elements: **Stopline candidates** (vehicles waiting at stoplines): - V00008, passenger, 1 pax, IN_E_L1_LEFT, waiting 69, route E_L1_LEFT — but E_L1_LEFT is blocked until 152 (RESERVATION). Also this vehicle has driverAlert patienceRemaining=10, AGGRESSIVE. Danger of red-light running. - V00120, passenger, 1 pax, IN_E_R1_RIGHT, route E_R1_RIGHT - V0 …… dy in the pipeline. OK commit sleep 10. Let me write tactical_summary. Also should I add a pedestrian phase? Crosswalks waiting counts are 1 each with high patience. Skip. Commit: lane_batches: [{IN_E_S2_STRAIGHT,6,CRUISE},{IN_E_R1_RIGHT,5,CRUISE}] sleep_ticks: 10 tactical_summary: ... Let me do it.

#### 损失最大的周期

**周期 46（tick 233）**：放行 4，未出事 0，放行行人 0，耐心风险放行 15，归因成本 65.04，周期余额变化 -1.476，提交类型 verified，睡眠 6

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:87:0:CROSSWALK:WEST remaining=24
- 观测要点：余额 874.93，停止线候选 16，受阻路线 3，行人预警 [S:J0, N:J0, E:J0, N:J0, E:J0, N:P1, N:J0, S:P8, W:P16, N:P11, S:P8, W:P24, N:P11, E:P16]，司机预警 [V00040:0, V00047:0, V00081:0, V00098:0, V00109:0, V00132:0, V00055:0, V00089:0]，紧急车 [V00217, V00241, V00265]，抛锚 []
- 工具序列：r1 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:SOUTH:CELL:7:0 vs V00197,PED:38:0:CROSSWALK:SOUTH)；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 后果：INC0005 ANGLE_COLLISION tick=239 vehicles=1 pedestrians=2 estCost=15.343；INC0006 PILEUP tick=241 vehicles=3 pedestrians=1 estCost=32.481；INC0007 ANGLE_COLLISION tick=257 vehicles=1 pedestrians=1 estCost=17.214
- 战术摘要：t233: All 4 crosswalks carry jaywalkers; verified plan = W-approach heads (V00108/V00114 straight, V00065 school bus L, V00129 R). Jaywalker warnings are timing-based, not same-tick cell conflicts, so admit and measure strike cost. Sleep 6 to t239; then re-check crosswalk state (SOUTH clears ~t237) 
- 推理摘录：Let me analyze this situation carefully. Current tick 233, end tick 261. 28 ticks remaining. Balance 874.9337. We have many stopline candidates across all four directions. Blocked routes: E_S2_STRAIGHT, N_S1_STRAIGHT, S_R1_RIGHT — all RESERVATION with blockedUntilTick 233 (i.e., now due). Emergency alerts: V00217 (emergency, lane IN_E_R1_RIGHT, queueIndex 1, distanceToStopline 0, stationaryTicks 53). Also V00241 (emergency) in IN_E_S2_STRAIGHT queueIndex 4 distance 11, and V00265 (emergency) IN_ …… W (one direction), no cross traffic. They'd just enter behind the bus and traverse. Cost: no revenue, maybe exit blocked. Minor. OK committing. Let me write tactical_summary. sleep_ticks: let me choose 6. Hmm, actually, if collisions happen, we want to know soon. Sleep 6 → t239. Fine. Let me commit.

**周期 15（tick 160）**：放行 16，未出事 11，放行行人 0，耐心风险放行 37，归因成本 23.99，周期余额变化 3.648，提交类型 verified，睡眠 10

- 观测要点：余额 990.11，停止线候选 11，受阻路线 8，行人预警 [E:P6, E:P17, W:P10]，司机预警 [V00114:10, V00124:11]，紧急车 [V00034, V00101, V00217]，抛锚 [V00122]
- 工具序列：r1 dry_run_admit -> TOOL_EXECUTION_ERROR (Admission plan exceeds 16 vehicles: 18)；r2 dry_run_admit -> ok；r3 dry_run_admit -> DRY_RUN_QUOTA_EXHAUSTED；r4 commit_schedule -> ok
- 后果：INC0001 PILEUP tick=171 vehicles=8 pedestrians=1 estCost=63.979
- 战术摘要：t160: verified batch W_S1 top8 + E_R1 top5 (clears emerg V00217 enter@180) + N_R1 top3 (clears emerg V00101 enter@160), 16 veh, reward 3.8, no jaywalker/tailgate warnings. Sleep 10 to t170. Next cycle: admit IN_E_S2_STRAIGHT (94 pax!) which is unblocked; blocked routes unblock N_L1@173 W_L1@174 N_S1
- 推理摘录：Let me analyze the situation carefully. Current tick 160, end tick 261. Ticks remaining 101. Balance 990.1091. Let me look at what's available. stoplineCandidates: - V00098, passenger, 1 pax, IN_E_L1_LEFT, waiting 53, route E_L1_LEFT - V00181, passenger, 1, IN_E_R1_RIGHT, waiting 11, route E_R1_RIGHT - V00109, passenger, 2, IN_N_L1_LEFT, waiting 47, route N_L1_LEFT - V00101, emergency, 1, IN_N_R1_RIGHT, waiting 51, route N_R1_RIGHT - V00057, truck, 3, IN_N_S1_STRAIGHT, waiting 74, route N_S1_STR …… tical_summary: "t160: admit W_S1 top8 + E_R1 top5 (clears emerg V00217) + N_R1 top3 (clears emerg V00101), 16 veh verified. Sleep 10 to t170. Next: E_S2_STRAIGHT (94 pax) available; blocked routes unblock 173-184 (N_L1@173, W_L1@174, N_S1@176, N_S2/S_L1@180, S_S2@183, E_L1/S_S1@184)." Let me commit.

**周期 13（tick 151）**：放行 5，未出事 2，放行行人 0，耐心风险放行 10，归因成本 23.99，周期余额变化 0.663，提交类型 verified，睡眠 10

- 观测要点：余额 990，停止线候选 10，受阻路线 8，行人预警 [E:P15, W:P19]，司机预警 [V00097:4, V00095:6, V00112:7]，紧急车 [V00034, V00101]，抛锚 [V00122]
- 工具序列：r1 inspect_crosswalk -> ok；r1 inspect_crosswalk -> ok；r1 inspect_lane_queue -> ok；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 后果：INC0001 PILEUP tick=171 vehicles=8 pedestrians=1 estCost=63.979
- 战术摘要：t151: W_S2 straight Top-5 verified+committed (entries 151-171, clear ~191). Streaming this free lane (108 pax) to drain it. Next: continue W_S2 remaining, watch S_L1 unblock@161 (conflicts W_S2). Peds EAST B_TO_A patience low - monitor.
- 推理摘录：Let me analyze the situation carefully. Current tick 151, end 261. Balance 989.9989. Key: blockedRoutes with RESERVATION. Many north/south/west routes blocked until ~159-176. East routes not blocked. S_L1_LEFT blocked until 161. stoplineCandidates: - V00098 E_L1_LEFT (pax1) - route E_L1_LEFT not blocked - V00109 N_L1_LEFT (pax2) - blocked until 173 - V00057 N_S1_STRAIGHT (truck, 3) - blocked until 176 - V00047 N_S2_STRAIGHT (pax1) - blocked until 175 - V00034 S_L1_LEFT (emergency, 1) - blocked u …… 27 pax (low). Not worth. Skip. And W_S2 continues. Fine. I'll sleep 10. Let me also double check commit params identical to dry-run: lane_batches [{"lane_id":"IN_W_S2_STRAIGHT","top_n":5,"speed_profile":"CRUISE"}]. No candidate ids, no peds, no speed profiles. Good. tactical_summary ≤ 300 chars. Go.

**周期 19（tick 174）**：放行 7，未出事 2，放行行人 0，耐心风险放行 14，归因成本 19.68，周期余额变化 2.036，提交类型 verified，睡眠 10

- 唤醒原因：ACCIDENT_INTERRUPT incident=INC0001 secondary=true
- 观测要点：余额 988.95，停止线候选 11，受阻路线 14，行人预警 [N:P12, E:P3, W:P0]，司机预警 [V00089:0, V00124:0, V00080:0, V00126:2, V00178:2, V00165:4, V00118:5, V00182:5]，紧急车 [V00034, V00217]，抛锚 [V00122]
- 工具序列：r1 inspect_incident -> ok；r1 inspect_crosswalk -> ok；r1 inspect_crosswalk -> ok；r1 inspect_crosswalk -> ok；r1 inspect_lane_queue -> ok；r2 order_accident_clearance -> ok；r2 dispatch_tow_truck -> ok；r3 dry_run_admit -> ok；r4 commit_schedule -> ok
- 后果：INC0002 PILEUP tick=181 vehicles=6 pedestrians=1 estCost=39.365
- 战术摘要：t174: ordered INC0001 evac (OUT_EAST_1), tow V00122 (done t192). Verified+committed IN_E_S1_STRAIGHT top4 + IN_N_R1_RIGHT top3 (no jaywalker/tailgate warnings, reward ~4.7). Sleep 10 -> t184. Next: watch INC0001 close (~187), N_L1 unblock (196), exit holds (~192); keep E-side flowing, avoid west-cro
- 推理摘录：Let me analyze this situation carefully. Current tick 174, end tick 261, 87 ticks remaining. Balance 988.9466. Interrupt reason: ACCIDENT_INTERRUPT incident=INC0001 secondary=true. I need to inspect_incident first, then order_accident_clearance or set_lane_detour. Let me look at the state. Blocked routes with INC0001: S_R1_RIGHT, S_S1_GUIDED_RIGHT, W_L1_GUIDED_STRAIGHT, W_R1_GUIDED_STRAIGHT, W_S1_STRAIGHT, W_S2_STRAIGHT — blockedUntilTick 187. The incident is at INC0001. Let me inspect it. Stall ……  lane_batches exactly matching: IN_E_S1_STRAIGHT top4 CRUISE, IN_N_R1_RIGHT top3 CRUISE. sleep_ticks 10. tactical_summary. Let me write it. Actually wait — should I worry that committing top_n>=2 requires "verified commit must use fully identical normalized params". We use same. Good. Let me commit.

**周期 47（tick 234）**：放行 12，未出事 9，放行行人 0，耐心风险放行 39，归因成本 15.3，周期余额变化 -1.565，提交类型 verified，睡眠 10

- 唤醒原因：PEDESTRIAN_JAYWALK pedestrian=PED:62:0:CROSSWALK:NORTH
- 观测要点：余额 873.46，停止线候选 12，受阻路线 8，行人预警 [S:J0, N:J0, E:J0, N:J0, E:J0, N:J0, N:J0, S:P7, W:P15, N:P10, S:P7, W:P23, N:P10, E:P15]，司机预警 [V00040:0, V00047:0, V00081:0, V00098:0, V00109:0, V00132:0, V00055:0, V00089:0]，紧急车 [V00217, V00241, V00265]，抛锚 []
- 工具序列：r1 dry_run_admit -> ok；r2 commit_schedule -> ok
- 后果：INC0003 ANGLE_COLLISION tick=236 vehicles=2 pedestrians=1 estCost=7.863；INC0004 ANGLE_COLLISION tick=236 vehicles=1 pedestrians=1 estCost=7.433
- 战术摘要：t234: Open routes only E_S1 straight + E/N/S right turns (all others RESERVATION until 244-257). Verified 4-lane wave top-3 (12 veh, reward 2.8). Jaywalker warnings on EAST/NORTH/SOUTH per route; ambiguous timing, prior identical gamble cost 0 strikes. Sleep 10 to t244 when E_L1/S_S2/S_S1 open; expe
- 推理摘录：Let me analyze this situation carefully. Current tick: 234, end tick 261, 27 ticks remaining. Balance: 873.4572. Key situation: - interruptReason: PEDESTRIAN_JAYWALK on NORTH crosswalk - Multiple jaywalkers across all crosswalks - blockedRoutes: all are RESERVATION (not INCIDENT), various blockedUntilTicks - Several emergency vehicles stuck with stationaryTicks ~51-54 Let me look at blockedRoutes: - E_L1_LEFT: blockedUntil 245 - E_S2_STRAIGHT: blockedUntil 257 - N_S1_STRAIGHT: blockedUntil 251 - …… le check: does commit_schedule need the exact same params as dry_run? Yes. My dry_run was lane_batches with 4 entries top_n 3 each, no speed profiles, no candidate ids, no ped phases. So commit with same lane_batches, admit_vehicle_ids empty, pedestrian_phases empty, plus sleep_ticks. Let me commit.

### 附：逐周期一览

| 周期 | tick | 提交 | 放行 | 行人 | 耐心风险 | 归因事故 | 归因成本 | 余额变化 | 睡眠 | 唤醒原因 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 61 | verified | 8 | 0 | 0 |  | 0 | -0.107 | 9 |  |
| 2 | 70 | verified | 13 | 0 | 0 |  | 0 | -1.52 | 10 |  |
| 3 | 80 | verified | 5 | 0 | 0 |  | 0 | -0.383 | 10 |  |
| 4 | 90 | hold | 0 | 0 | 0 |  | 0 | -3.015 | 10 |  |
| 5 | 100 | verified | 13 | 0 | 0 |  | 0 | -0.937 | 10 |  |
| 6 | 110 | verified | 13 | 0 | 0 |  | 0 | -1.589 | 10 |  |
| 7 | 120 | verified | 9 | 0 | 0 |  | 0 | -4.327 | 10 |  |
| 8 | 130 | verified | 11 | 0 | 0 |  | 0 | -1.064 | 10 |  |
| 9 | 140 | verified | 8 | 0 | 0 | INC0001 | 8 | -0.052 | 10 |  |
| 10 | 141 | hold | 0 | 0 | 0 |  | 0 | -0.152 | 10 | VEHICLE_RED_LIGHT vehicle=V00008 route=E_L1_LEFT |
| 11 | 142 | hold | 0 | 0 | 0 |  | 0 | 3.34 | 8 | PEDESTRIAN_PATIENCE pedestrian=PED:11:0:CROSSWALK:EAST remai |
| 12 | 146 | verified | 2 | 0 | 2 |  | 0 | -0.195 | 5 | PEDESTRIAN_PATIENCE pedestrian=PED:3:0:CROSSWALK:WEST remain |
| 13 | 151 | verified | 5 | 0 | 10 | INC0001 | 23.99 | 0.663 | 10 |  |
| 14 | 153 | hold | 0 | 0 | 0 |  | 0 | -0.553 | 7 | PEDESTRIAN_PATIENCE pedestrian=PED:24:0:CROSSWALK:EAST remai |
| 15 | 160 | verified | 16 | 0 | 37 | INC0001 | 23.99 | 3.648 | 10 |  |
| 16 | 162 | hold | 0 | 0 | 0 |  | 0 | -0.099 | 3 | PEDESTRIAN_PATIENCE pedestrian=PED:20:0:CROSSWALK:NORTH rema |
| 17 | 165 | verified | 4 | 0 | 12 | INC0002 | 6.56 | -4.183 | 10 |  |
| 18 | 172 | hold | 0 | 0 | 0 |  | 0 | -0.529 | 6 | PEDESTRIAN_JAYWALK pedestrian=PED:11:0:CROSSWALK:EAST; ACCID |
| 19 | 174 | verified | 7 | 0 | 14 | INC0002 | 19.68 | 2.036 | 10 | ACCIDENT_INTERRUPT incident=INC0001 secondary=true |
| 20 | 175 | hold | 0 | 0 | 0 |  | 0 | -0.996 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:44:0:CROSSWALK:WEST remai |
| 21 | 176 | verified | 1 | 0 | 3 | INC0001 | 8 | -0.82 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:45:1:CROSSWALK:WEST remai |
| 22 | 177 | hold | 0 | 0 | 0 |  | 0 | -1.216 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:24:0:CROSSWALK:EAST; ACCID |
| 23 | 178 | hold | 0 | 0 | 0 |  | 0 | -12.883 | 10 | ACCIDENT_INTERRUPT incident=INC0001 secondary=true |
| 24 | 180 | hold | 0 | 0 | 0 |  | 0 | -1.382 | 10 | ACCIDENT_INTERRUPT incident=INC0001 secondary=true |
| 25 | 181 | verified | 6 | 0 | 24 | INC0002 | 13.12 | -7.293 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:38:0:CROSSWALK:SOUTH rema |
| 26 | 182 | hold | 0 | 0 | 0 |  | 0 | -1.712 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:3:0:CROSSWALK:WEST; ACCIDE |
| 27 | 183 | hold | 0 | 0 | 0 |  | 0 | -1.718 | 10 | ACCIDENT_INTERRUPT incident=INC0002 secondary=true |
| 28 | 184 | hold | 0 | 0 | 0 |  | 0 | -3.935 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:43:0:CROSSWALK:NORTH rema |
| 29 | 186 | hold | 0 | 0 | 0 |  | 0 | -3.401 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:20:0:CROSSWALK:NORTH; ACCI |
| 30 | 187 | hold | 0 | 0 | 0 |  | 0 | -2.351 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:45:0:CROSSWALK:EAST remai |
| 31 | 188 | hold | 0 | 0 | 0 |  | 0 | -4.684 | 10 | ACCIDENT_INTERRUPT incident=INC0002 secondary=true |
| 32 | 190 | hold | 0 | 0 | 0 |  | 0 | -11.676 | 10 | ACCIDENT_INTERRUPT incident=INC0002 secondary=true |
| 33 | 199 | hold | 0 | 0 | 0 |  | 0 | -3.127 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:44:0:CROSSWALK:WEST |
| 34 | 200 | hold | 0 | 0 | 0 |  | 0 | -1.285 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:45:1:CROSSWALK:WEST |
| 35 | 201 | hold | 0 | 0 | 0 |  | 0 | -7.67 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:61:0:CROSSWALK:EAST remai |
| 36 | 204 | hold | 0 | 0 | 0 |  | 0 | -3.274 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:68:0:CROSSWALK:NORTH rema |
| 37 | 205 | hold | 0 | 0 | 0 |  | 0 | -4.37 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:38:0:CROSSWALK:SOUTH |
| 38 | 208 | hold | 0 | 0 | 0 |  | 0 | -4.797 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:43:0:CROSSWALK:NORTH |
| 39 | 210 | hold | 0 | 0 | 0 |  | 0 | -3.647 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:62:0:CROSSWALK:NORTH rema |
| 40 | 211 | hold | 0 | 0 | 0 |  | 0 | -11.453 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:45:0:CROSSWALK:EAST; PEDES |
| 41 | 217 | hold | 0 | 0 | 0 |  | 0 | -7.192 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:80:0:CROSSWALK:SOUTH rema |
| 42 | 220 | hold | 0 | 0 | 0 |  | 0 | -6.778 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:82:0:CROSSWALK:NORTH rema |
| 43 | 225 | hold | 0 | 0 | 0 |  | 0 | -5.014 | 5 | PEDESTRIAN_PATIENCE pedestrian=PED:81:0:CROSSWALK:WEST remai |
| 44 | 228 | hold | 0 | 0 | 0 |  | 0 | -2.522 | 2 | PEDESTRIAN_JAYWALK pedestrian=PED:68:0:CROSSWALK:NORTH |
| 45 | 230 | hold | 0 | 0 | 0 |  | 0 | -0.854 | 6 |  |
| 46 | 233 | verified | 4 | 0 | 15 | INC0005 INC0006 INC0007 | 65.04 | -1.476 | 6 | PEDESTRIAN_PATIENCE pedestrian=PED:87:0:CROSSWALK:WEST remai |
| 47 | 234 | verified | 12 | 0 | 39 | INC0003 INC0004 | 15.3 | -1.565 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:62:0:CROSSWALK:NORTH |
| 48 | 236 | hold | 0 | 0 | 0 |  | 0 | -10.449 | 8 | PEDESTRIAN_PATIENCE pedestrian=PED:106:0:CROSSWALK:WEST rema |
| 49 | 237 | hold | 0 | 0 | 0 |  | 0 | -1.303 | 7 | ACCIDENT_INTERRUPT incident=INC0003 locked=CROSSWALK:EAST:CE |
| 50 | 238 | hold | 0 | 0 | 0 |  | 0 | -1.139 | 8 | PEDESTRIAN_PATIENCE pedestrian=PED:95:0:CROSSWALK:SOUTH rema |
| 51 | 239 | unverified | 0 | 0 | 0 |  | 0 | -6.404 | 2 | PEDESTRIAN_PATIENCE pedestrian=PED:91:0:CROSSWALK:EAST remai |
| 52 | 240 | hold | 0 | 0 | 0 |  | 0 | -1.29 | 8 | ACCIDENT_INTERRUPT incident=INC0005 locked=CROSSWALK:WEST:CE |
| 53 | 241 | hold | 0 | 0 | 0 |  | 0 | -1.931 | 4 | ACCIDENT_INTERRUPT incident=INC0006 locked=PAIR:E_L1_LEFT:10 |
| 54 | 242 | hold | 0 | 0 | 0 |  | 0 | -6.916 | 10 | ACCIDENT_INTERRUPT incident=INC0006 secondary=true |
| 55 | 243 | hold | 0 | 0 | 0 |  | 0 | -2.615 | 8 | ACCIDENT_INTERRUPT incident=INC0005 locked=CROSSWALK:WEST:CE |
| 56 | 244 | hold | 0 | 0 | 0 |  | 0 | 0.214 | 2 | PEDESTRIAN_PATIENCE pedestrian=PED:98:0:CROSSWALK:NORTH rema |
| 57 | 246 | hold | 0 | 0 | 0 |  | 0 | -1.998 | 4 |  |
| 58 | 247 | hold | 0 | 0 | 0 |  | 0 | -4.467 | 3 | PEDESTRIAN_PATIENCE pedestrian=PED:115:0:CROSSWALK:EAST rema |
| 59 | 249 | hold | 0 | 0 | 0 |  | 0 | -8.9 | 2 | PEDESTRIAN_JAYWALK pedestrian=PED:92:0:CROSSWALK:EAST |
| 60 | 251 | hold | 0 | 0 | 0 |  | 0 | -18.254 | 10 | ACCIDENT_INTERRUPT incident=INC0006 locked=CROSSWALK:WEST:CE |
| 61 | 258 | hold | 0 | 0 | 0 |  | 0 | -12.096 | 3 | ACCIDENT_INTERRUPT incident=INC0007 locked=CROSSWALK:NORTH:C |
| 62 | 259 | hold | 0 | 0 | 0 |  | 0 | -4.27 | 2 | PEDESTRIAN_PATIENCE pedestrian=PED:111:0:CROSSWALK:NORTH rem |

