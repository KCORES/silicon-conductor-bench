# 运行分析：deepseek-v4-pro_2026-10-01_124426092-121024

- 模型：deepseek-v4-pro；种子 63916；规则版本 16；回放 schema 7
- 截止 tick 261，决策周期 57，最终余额 **686.92**
- 生成时间 2026-10-01T21:35:16.743Z；数据文件：replay_deepseek-v4-pro_2026-10-01_124426092-121024.json、report_deepseek-v4-pro_2026-10-01_124426092-121024.json、api-log_deepseek-v4-pro_2026-10-01_124426092-121024.jsonl、raw-api-log_deepseek-v4-pro_2026-10-01_124426092-121024.jsonl

## 1. 基础分析

### 1.1 上下文能力

- prompt tokens：平均 27063.7，P50 25108，P95 50889，最大 81370（n=212）
- completion tokens：平均 7289.7，P50 4842，P95 21478，最大 40621（n=212）；其中推理 tokens：平均 7126.8，P50 4773，P95 21319，最大 40303（n=212）
- 每周期 API 轮数：平均 3.7，P50 4，P95 6，最大 7（n=57）；上限 8，用满上限的周期 0 个
- 每次请求的平均字符数：系统提示 7722，user 16268.2，工具结果 5989.9，assistant 782.5；消息条数 平均 6.9，P50 6，P95 15，最大 19（n=212）
- 工具参数中的 ID 共 605 个：出现在当轮可见上下文里的占 1，当轮不可见但本局别处出现过 0 个，本局从未出现 0 个，非规范横道短键 0 个

| ID 类型 | 总数 | 当轮可见 | 别处出现 | 从未出现 | 非规范短键 |
| --- | --- | --- | --- | --- | --- |
| vehicle | 118 | 118 | 0 | 0 | 0 |
| lane | 229 | 229 | 0 | 0 | 0 |
| crosswalk | 179 | 179 | 0 | 0 | 0 |
| incident | 79 | 79 | 0 | 0 | 0 |

- 同一周期内重复提交已失败的相同调用：0 次 {}
- 提交类型：verified 22，unverified 4，hold 30；放行类提交中 verified 占 0.846
- working memory：调用 2 次 {"SAVE_PLAN":2}，观测里带有计划的周期 52 个

### 1.2 注意力分布

关注率 = 字段出现在该周期观测里、且推理文本提到它的周期数 / 字段出现的周期数。

| 概念 | 出现周期 | 提到且出现 | 关注率 | 提到周期（含未出现） | 提及次数 |
| --- | --- | --- | --- | --- | --- |
| stoplineCandidates | 57 | 57 | 1 | 57 | 655 |
| candidateConflicts | 57 | 57 | 1 | 57 | 2633 |
| pedestrianAlerts | 45 | 45 | 1 | 57 | 10863 |
| driverAlerts | 49 | 49 | 1 | 56 | 2265 |
| dischargingLanes | 35 | 35 | 1 | 45 | 634 |
| timeBudget | 57 | 57 | 1 | 57 | 375 |
| stalledVehicles | 33 | 32 | 0.97 | 54 | 1481 |
| crosswalks | 57 | 55 | 0.965 | 55 | 8266 |
| holds | 50 | 48 | 0.96 | 49 | 787 |
| emergency | 55 | 52 | 0.945 | 54 | 2348 |
| recentCycles | 56 | 52 | 0.929 | 53 | 474 |
| activeVehicleMotions | 52 | 47 | 0.904 | 49 | 320 |
| revokedAdmissions | 11 | 9 | 0.818 | 32 | 259 |
| lastSettlement | 56 | 45 | 0.804 | 45 | 229 |
| laneGuidance | 57 | 44 | 0.772 | 44 | 252 |
| workingMemory | 52 | 24 | 0.462 | 27 | 84 |
| laneMatrices | 0 | 0 |  | 57 | 2134 |
| exits | 0 | 0 |  | 57 | 6093 |
| reservedUntil | 0 | 0 |  | 57 | 2406 |
| incidentBlocked | 0 | 0 |  | 34 | 948 |

中断响应：

| 中断类型 | 次数 | 有响应 | 响应率 | 判定规则 |
| --- | --- | --- | --- | --- |
| VEHICLE_RED_LIGHT | 2 | 2 | 1 | 推理文本提到了中断对象 ID |
| PEDESTRIAN_PATIENCE | 24 | 22 | 0.917 | 同周期任一试算或提交带 pedestrian_phases |
| VEHICLE_TAILGATE | 1 | 1 | 1 | 推理文本提到了中断对象 ID |
| PEDESTRIAN_JAYWALK | 11 | 5 | 0.455 | 推理文本提到了中断对象 ID |
| ACCIDENT_INTERRUPT | 8 | 8 | 1 | 同周期调用 inspect_incident / order_accident_clearance / set_lane_detour |

- 每次回复的推理字符数：平均 25677.6，P50 17196，P95 75698，最大 143812（n=212）

### 1.3 tool_call 准确性

- 工具调用 336 次，成功 266 次，成功率 0.792
- 失败分类：{"RESOURCE_CONFLICT":51,"DRY_RUN_QUOTA_EXHAUSTED":10,"LANE_HEAD_NOT_READY":4,"TARGET_LANE_SLOT_OCCUPIED":1,"NOT_LANE_HEAD":1,"NOT_AT_STOPLINE":1,"ROUTE_SEVERED":1,"PLANNING_HORIZON_EXCEEDED":1}
- 每次回复的工具调用数分布：{"1":147,"2":38,"3":14,"4":5,"5":2,"6":4,"7":1,"10":1}；finish_reason：{"tool_calls":212}
- API 错误 0 次 {}；回退周期 []
- 从未使用的工具：无

| 工具 | 调用 | 成功 | 成功率 | 结果分类 |
| --- | --- | --- | --- | --- |
| dry_run_admit | 104 | 37 | 0.356 | {"OK":37,"RESOURCE_CONFLICT":51,"DRY_RUN_QUOTA_EXHAUSTED":10,"LANE_HEAD_NOT_READY":4,"ROUTE_SEVERED":1,"PLANNING_HORIZON_EXCEEDED":1} |
| commit_schedule | 57 | 56 | 0.982 | {"OK":56,"NOT_AT_STOPLINE":1} |
| reroute_queue_around_stall | 1 | 1 | 1 | {"OK":1} |
| dispatch_tow_truck | 9 | 9 | 1 | {"OK":9} |
| inspect_lane_queue | 24 | 24 | 1 | {"OK":24} |
| manage_working_memory | 2 | 2 | 1 | {"OK":2} |
| guide_inbound_lane_change | 1 | 0 | 0 | {"TARGET_LANE_SLOT_OCCUPIED":1} |
| dispatch_emergency_convoy | 2 | 1 | 0.5 | {"NOT_LANE_HEAD":1,"OK":1} |
| inspect_crosswalk | 42 | 42 | 1 | {"OK":42} |
| inspect_incident | 50 | 50 | 1 | {"OK":50} |
| order_accident_clearance | 29 | 29 | 1 | {"OK":29} |
| set_lane_detour | 15 | 15 | 1 | {"OK":15} |

错误样例：

- **TARGET_LANE_SLOT_OCCUPIED**
  - c6 t105 guide_inbound_lane_change：-；参数 `{"vehicle_id":"V00050","target_lane":"IN_N_R1_RIGHT"}`
- **NOT_LANE_HEAD**
  - c10 t133 dispatch_emergency_convoy：-；参数 `{"lane_id":"IN_N_S1_STRAIGHT","emergency_vehicle_id":"V00050"}`
- **RESOURCE_CONFLICT**
  - c12 t141 dry_run_admit：CROSSWALK:NORTH:CELL:0:0 vs V00061；参数 `{"candidate_vehicle_ids":["V00134","V00103"],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:EAST","directions":["B_TO_A"]},{"crosswalk_id":"CROSSWALK:WEST","directions":["A_TO_B"]},{"crosswalk_id":"CROSSWALK:NORTH","dir`
  - c12 t141 dry_run_admit：CROSSWALK:WEST:CELL:0:0 vs V00053；参数 `{"candidate_vehicle_ids":["V00134","V00103"],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:EAST","directions":["B_TO_A"]},{"crosswalk_id":"CROSSWALK:WEST","directions":["A_TO_B"]}]}`
  - c13 t142 dry_run_admit：CROSSWALK:WEST:CELL:0:0 vs V00053；参数 `{"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:EAST","directions":["B_TO_A"]},{"crosswalk_id":"CROSSWALK:WEST","directions":["A_TO_B"]}]}`
- **DRY_RUN_QUOTA_EXHAUSTED**
  - c12 t141 dry_run_admit：-；参数 `{"candidate_vehicle_ids":["V00134","V00103"],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:EAST","directions":["B_TO_A"]}]}`
  - c15 t151 dry_run_admit：-；参数 `{"lane_batches":[{"lane_id":"IN_E_L1_LEFT","top_n":4},{"lane_id":"IN_E_R1_RIGHT","top_n":4},{"lane_id":"IN_S_R1_RIGHT","top_n":1},{"lane_id":"IN_W_R1_RIGHT","top_n":2},{"lane_id":"IN_S_S2_STRAIGHT","top_n":2},{"lane_id":`
  - c22 t187 dry_run_admit：-；参数 `{"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:SOUTH","directions":["A_TO_B"]}]}`
- **LANE_HEAD_NOT_READY**
  - c13 t142 dry_run_admit：Lane head is not ready: IN_N_S2_STRAIGHT；参数 `{"candidate_vehicle_ids":["V00169"],"lane_batches":[{"lane_id":"IN_N_S2_STRAIGHT","top_n":3},{"lane_id":"IN_N_S1_STRAIGHT","top_n":3}],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:EAST","directions":["B_TO_A"]},{"cros`
  - c15 t151 dry_run_admit：Lane head is not ready: IN_S_S1_STRAIGHT；参数 `{"lane_batches":[{"lane_id":"IN_E_L1_LEFT","top_n":4},{"lane_id":"IN_E_R1_RIGHT","top_n":4},{"lane_id":"IN_S_R1_RIGHT","top_n":1},{"lane_id":"IN_W_R1_RIGHT","top_n":2},{"lane_id":"IN_S_S2_STRAIGHT","top_n":2},{"lane_id":`
  - c31 t212 dry_run_admit：Lane head is not ready: IN_S_S2_STRAIGHT；参数 `{"lane_batches":[{"lane_id":"IN_S_S2_STRAIGHT","top_n":1,"speed_profile":"CRUISE"},{"lane_id":"IN_S_R1_RIGHT","top_n":3,"speed_profile":"CRUISE"}],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:EAST","directions":["A_TO`
- **NOT_AT_STOPLINE**
  - c33 t216 commit_schedule：-；参数 `{"admit_vehicle_ids":["V00066","V00085"],"sleep_ticks":4,"tactical_summary":"W_S1 head V00066 + impatient tailgate follower V00085 admitted legally as explicit pair. No pedestrian phases (NORTH/WEST crosswalks incident-l`
- **ROUTE_SEVERED**
  - c52 t247 dry_run_admit：none；参数 `{"lane_batches":[{"lane_id":"IN_E_L1_LEFT","top_n":1},{"lane_id":"IN_E_R1_RIGHT","top_n":3},{"lane_id":"IN_S_R1_RIGHT","top_n":3},{"lane_id":"IN_S_S1_STRAIGHT","top_n":3},{"lane_id":"IN_S_S2_STRAIGHT","top_n":2},{"lane_i`
- **PLANNING_HORIZON_EXCEEDED**
  - c57 t260 dry_run_admit：Admission planning horizon exceeded for V00228；参数 `{"lane_batches":[{"lane_id":"IN_E_L1_LEFT","top_n":8},{"lane_id":"IN_N_S1_STRAIGHT","top_n":8},{"lane_id":"IN_N_S2_STRAIGHT","top_n":8},{"lane_id":"IN_S_R1_RIGHT","top_n":8},{"lane_id":"IN_W_S1_STRAIGHT","top_n":8},{"lan`

### 1.4 Agent 能力

- 周期内工具序列（D=试算，C=提交，T=其他工具）：{"DDC":9,"TDC":4,"TTTTDDC":4,"DC":3,"DDDC":3,"TTDDC":3,"TTTTTDC":2,"DTDC":2,"TDDDC":2,"TTTTTTDDDC":2,"TTDC":1,"TTTTTTDC":1,"DTC":1,"TDTC":1,"TDDC":1,"DDTTC":1,"TTTTTDDDC":1,"TTTTTTDDTC":1,"TTTTTTTTTTTTC":1,"TTTTTTTTDDTC":1,"TTTTTTTTTTDDC":1,"TTTTDDTC":1,"TTTDTTTTTTTTC":1,"TTTTTDDTC":1,"TTTTTDDC":1,"TTTTTTTTDDC":1,"TTTTTTC":1,"TTTTDTTDDC":1,"DDDTTTTC":1,"TTTTTTDDC":1,"TTTTDTTDC":1,"TTTDDC":1,"C":1}
- 含提交的周期里先试算再提交的比例：0.947
- 提交构成：{"verified":22,"unverified":4,"hold":30,"reckless":1}；每周期放行车数 平均 2.1，P50 0，P95 11，最大 13（n=57）；共放行 122 辆
- 成功提交 56 次，其中使用 lane_batches 14 次；每次 top_n 合计 平均 1.7，P50 0，P95 11，最大 13（n=56）
- 速度档位：{"CRUISE":34}；sleep_ticks：平均 6.4，P50 7，P95 10，最大 10（n=57） {"1":5,"2":5,"3":1,"4":7,"5":5,"6":3,"7":6,"8":6,"9":2,"10":17}
- 工具使用：{"dry_run_admit":104,"commit_schedule":57,"inspect_incident":50,"inspect_crosswalk":42,"order_accident_clearance":29,"inspect_lane_queue":24,"set_lane_detour":15,"dispatch_tow_truck":9,"manage_working_memory":2,"dispatch_emergency_convoy":2,"reroute_queue_around_stall":1,"guide_inbound_lane_change":1}
- 决策开销：API 212 次，扣 4.24；非终结工具 279 次，扣 0.4185

与同条件 baseline 对比：

| 策略 | 最终余额 | 放行车辆 | 未服务负债 | 事故数 | 锁格扣费 | 上游积压 | 撞人 | 闯红灯罚 | 行人奖励 | 校车 | 拖车 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| deepseek-v4-pro | 686.92 | 122 | 189.5 | 4 | 53.6 | 48.9 | 15 | 6.1 | 0 | 20 | 10.8 |
| baseline-balanced | 674.49 | 84 | 219.6 | 6 | 21.3 | 58.85 | 25 | 5.5 | 0 | 0 | 8.4 |
| baseline-balanced-bus | 659.61 | 87 | 208.1 | 4 | 90.26 | 53.27 | 5 | 4.9 | 0 | 0 | 6 |
| baseline-balanced-no-ped | 717.59 | 132 | 187.4 | 4 | 74.39 | 47.7 | 0 | 0 | 0 | 10 | 10.8 |
| baseline-longest-queue | 633.99 | 183 | 195.7 | 10 | 76.09 | 44.92 | 50 | 11.6 | 0 | 10 | 10.8 |
| baseline-random | 539.49 | 114 | 207.6 | 7 | 139.2 | 73.82 | 35 | 11 | 0 | 0 | 7.2 |
| baseline-search | 788.38 | 122 | 185.4 | 2 | 3.69 | 45.85 | 10 | 6.7 | 0 | 0 | 8.4 |

## 2. 进阶分析

### 2.1 逻辑推理

- 试算失败（不含额度用完）57 次；之后再试 30 次，其中改了参数 30 次，成功 11 次（0.367）；失败所在周期最终 verified 提交 9 次、hold 41 次
- 推理中"路线 X 经过/不经过 Y 横道"的断言 652 条，正确 494，错误 158，准确率 0.758；前半局 9/71 错，后半局 149/581 错
  - c17：「N_R1_RIGHT exits to east, crossing east」（实际经过 CROSSWALK:NORTH+CROSSWALK:WEST）
  - c18：「N_L1_LEFT cross the WEST」（实际经过 CROSSWALK:NORTH+CROSSWALK:EAST）
  - c22：「S_R1_RIGHT vehicles would exit west, crossing WEST」（实际经过 CROSSWALK:SOUTH+CROSSWALK:EAST）
  - c25：「N_S1_STRAIGHT (north→south) crosses the east」（实际经过 CROSSWALK:NORTH+CROSSWALK:SOUTH）
  - c26：「S_S2_STRAIGHT (and maybe others not crossing NORTH」（实际经过 CROSSWALK:SOUTH+CROSSWALK:NORTH）
  - c26：「N_R1_RIGHT might not cross NORTH」（实际经过 CROSSWALK:NORTH+CROSSWALK:WEST）
  - c26：「N_R1_RIGHT and S-straights don't cross NORTH」（实际经过 CROSSWALK:NORTH+CROSSWALK:WEST）
  - c26：「N_R1_RIGHT does NOT cross NORTH」（实际经过 CROSSWALK:NORTH+CROSSWALK:WEST）
- 推理写"安全/无冲突"但同一轮试算冲突：29 次
  - c12 r1 t141：「040 (S_L1) vs V00058 (W_L1) - V00040 (S_L1) vs V00066 (W_S1) - V00040 (S_L1) vs V00045 (W_S2) - V00138 (S_S2) vs V00066 (W_S1) - V00138 (S_S2) vs V00045 (W_S2) No conflicts listed for E_R1_RIGHT or W_R1_RIGHT. So they are conflict-free with each other presumably. But wait, the red light runner V00008 is on E_L1_LEFT currently cros」→ CROSSWALK:NORTH:CELL:0:0 vs V00061
  - c13 r2 t142：「hes and use candidate_vehicle_ids. Candidate vehicles: V00134 (E_R1), V00169 (S_R1), V00103 (W_R1). Pedestrian phases: EAST B_TO_A, WEST A_TO_B. Which vehicles are safe with these pedestrian phases? - E_R1_RIGHT: enters from east, turns right (north), crosses EAST crosswalk. Conflicts with EAST B_TO_A phase. Likely conflict. -」→ CROSSWALK:WEST:CELL:0:0 vs V00053
  - c14 r1 t146：「ossing 4 ticks per grid cell. A crosswalk is presumably some number of cells wide. The phase allows up to 8 pedestrians FIFO. Let me determine which crosswalks are safe to release now given the discharging traffic. Discharging lanes are all North approach: N_R1, N_S1, N_S2. These are entering from the north side, going south. 」→ CROSSWALK:WEST:CELL:0:0 vs V00061
  - c18 r1 t172：「t lanes occupied. Vehicles admitted to routes using those exits may get EXIT_BLOCKED inside the intersection. But dry_run might still say ok (reservation table no conflict). The engine checks exit capacity at entry? "停止线新车会在断路前刹停" hmm that's about incidents. Let me recall: "闯红灯和跟车闯入的车不付离场收入，也不检查出口容量，出口满时会停在路口里变成 EXIT_BLOCKED 并锁格"」→ CROSSWALK:NORTH:CELL:0:0 vs V00107
  - c19 r1 t181：「d to destinations: - OUT_EAST_0 (eastbound exit) maybe vehicles exiting to east (from W through? etc) - OUT_NORTH_2, OUT_SOUTH_1, OUT_SOUTH_2. We need choose a compatible batch of vehicles/peds. Let's map route directions: Inbound lanes: - IN_E_R1_RIGHT route E_R1_RIGHT: eastbound right turn, likely to south? At east side, right」→ CROSSWALK:NORTH:CELL:7:1 vs V00181
  - c19 r2 t181：「 non-terminal queries freely? inspect tools are non-terminal but not dry-run quota. We can use them. But we need plan. Let's think: Which vehicle movements are compatible with north pedestrian phase? - E_S1/S2: route east->west, crosses EAST entry and WEST exit. North peds at north crosswalk no conflict. But west peds crossing a」→ CROSSWALK:EAST:CELL:7:1 vs V00197
- 自我修正标记（Wait/Actually/Let me recheck…）：共 4926 次，每次回复 平均 23.2，P50 12，P95 79，最大 147（n=212）
- 认知模式 letterCounting：10 处
  - 「10. That doesn't add up. Unless the game runs multiple ticks between my observations even without my input? No, commit_schedule with sleep_ticks advances the physics. Hmm, wait, maybe I'm misreading. Let me recount: currentTick 69, endTick 261, ticksRemaining 192. Recent cycle 1 at tick 61. So the playable window is 61 to 261 = 200 ticks. With sleep max 10, minimum 20 cycles. But "8 轮 API" suggests only 8 cycle」
  - 「k, not active vehicles. We need to consider intersection occupancy. Actually, let me think about what's happening. There are already 8 vehicles crossing: 4 from W (W_S1×2, W_S2×2, W_R1, W_S1, W_S2... let me recount): - V00002 W_S1_STRAIGHT CROSSING - V00003 E_R1_RIGHT CROSSING - V00007 W_R1_RIGHT CROSSING - V00009 W_S2_STRAIGHT CROSSING - V00012 W_S1_STRAIGHT CROSSING - V00013 W_S2_STRAIGHT CROSSING - V00018 E_」
  - 「S_S2 unblocks at 153 (1 tick later). So at 152, I can plan for both S_S1 and S_S2. Let me sleep 10. Let me write the commit. Actually, one more consideration: the commit's tactical_summary field (max 300 chars) is required. Let me write a concise summary. Also, I should note: I dispatched tow for V00068 (completion 160). That's a non-terminal action already done. Good. Let me also reconsider: is there any 」
- 认知模式 idFormat：0 处

### 2.2 复杂环境博弈

**行人与车辆**

- 行人相位尝试 65 次，成功 8 次 {"RESOURCE_CONFLICT":47,"OK":8,"DRY_RUN_QUOTA_EXHAUSTED":7,"LANE_HEAD_NOT_READY":2,"ROUTE_SEVERED":1}
- 实际放行 5 批 10 人；闯红灯 11 次 11 人；被撞 3 人；奖励 0，扣费 {"delay":0.9,"jaywalk":6.1,"strike":15}

行人相位冲突样例：

| 周期 | tick | 冲突偏移 at | 冲突 |
| --- | --- | --- | --- |
| 12 | 141 | 1 | CROSSWALK:NORTH:CELL:0:0 vs V00061 |
| 12 | 141 | 0 | CROSSWALK:WEST:CELL:0:0 vs V00053 |
| 13 | 142 | 0 | CROSSWALK:WEST:CELL:0:0 vs V00053 |
| 14 | 146 | 0 | CROSSWALK:WEST:CELL:0:0 vs V00061 |
| 18 | 172 | 0 | CROSSWALK:NORTH:CELL:0:0 vs V00107 |
| 19 | 181 | 5 | CROSSWALK:NORTH:CELL:7:1 vs V00181 |
| 19 | 181 | 0 | CROSSWALK:EAST:CELL:7:1 vs V00197 |
| 20 | 182 | 28 | CROSSWALK:NORTH:CELL:7:0 vs V00217 |
| 21 | 184 | 2 | CROSSWALK:NORTH:CELL:7:1 vs V00181 |
| 22 | 187 | 0 | CROSSWALK:EAST:CELL:0:0 vs V00194 |

在行人耐心告急（PATIENCE_CRITICAL）时放行、且路线经过该横道的车辆：52 车次

| 周期 | tick | 车辆 | 路线 | 横道 | 行人 | 剩余耐心 | 该行人后来被撞 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 15 | 151 | V00103 | W_R1_RIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 19 |  |
| 15 | 151 | V00122 | W_R1_RIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 19 |  |
| 18 | 172 | V00107 | N_R1_RIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 14 | 是 |
| 23 | 193 | V00040 | S_L1_LEFT | CROSSWALK:SOUTH | PED:38:0:CROSSWALK:SOUTH | 12 |  |
| 23 | 193 | V00067 | S_L1_LEFT | CROSSWALK:SOUTH | PED:38:0:CROSSWALK:SOUTH | 12 |  |
| 23 | 193 | V00073 | S_L1_LEFT | CROSSWALK:SOUTH | PED:38:0:CROSSWALK:SOUTH | 12 |  |
| 23 | 193 | V00207 | S_R1_RIGHT | CROSSWALK:SOUTH | PED:38:0:CROSSWALK:SOUTH | 12 |  |
| 23 | 193 | V00207 | S_R1_RIGHT | CROSSWALK:EAST | PED:45:0:CROSSWALK:EAST | 18 |  |
| 23 | 193 | V00235 | S_R1_RIGHT | CROSSWALK:SOUTH | PED:38:0:CROSSWALK:SOUTH | 12 |  |
| 23 | 193 | V00235 | S_R1_RIGHT | CROSSWALK:EAST | PED:45:0:CROSSWALK:EAST | 18 |  |
| 23 | 193 | V00275 | S_R1_RIGHT | CROSSWALK:SOUTH | PED:38:0:CROSSWALK:SOUTH | 12 |  |
| 23 | 193 | V00275 | S_R1_RIGHT | CROSSWALK:EAST | PED:45:0:CROSSWALK:EAST | 18 |  |
| 24 | 200 | V00149 | E_S1_STRAIGHT | CROSSWALK:EAST | PED:45:0:CROSSWALK:EAST | 11 |  |
| 24 | 200 | V00130 | N_R1_RIGHT | CROSSWALK:NORTH | PED:43:0:CROSSWALK:NORTH | 8 | 是 |
| 24 | 200 | V00129 | W_R1_RIGHT | CROSSWALK:SOUTH | PED:38:0:CROSSWALK:SOUTH | 5 |  |

行人时间线：

| tick | 事件 | 横道 | 人数 |
| --- | --- | --- | --- |
| 146 | PED_GRANT | CROSSWALK:EAST | 2 |
| 162 | PED_GRANT | CROSSWALK:WEST | 3 |
| 184 | PED_GRANT | CROSSWALK:NORTH | 2 |
| 201 | PED_GRANT | CROSSWALK:EAST | 1 |
| 201 | PED_GRANT | CROSSWALK:SOUTH | 2 |
| 209 | PED_COLLISION | CROSSWALK:NORTH | 1 |
| 210 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 215 | PED_COLLISION | CROSSWALK:NORTH | 1 |
| 225 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 228 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 234 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 241 | PED_JAYWALK | CROSSWALK:SOUTH | 1 |
| 244 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 244 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 249 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 249 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 257 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 260 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 260 | PED_COLLISION | CROSSWALK:EAST | 1 |

**事故处置**

| 事故 | 类型 | 发生 | 车辆 | 行人 | 首次响应 | 清障令 | 清障调用次数 | 关闭 | 事故后才放行、后来卷入 | 非模型放行（抢行） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| INC0001 | ANGLE_COLLISION | 209 | 1 | 1 | 210 | 210 | 7 | 224 |  | V00217 |
| INC0002 | PILEUP | 212 | 5 | 0 | 212 | 212 | 13 | 254 |  | V00111 |
| INC0003 | PILEUP | 215 | 4 | 1 | 216 | 216 | 9 | 246 |  |  |
| INC0004 | ANGLE_COLLISION | 260 | 1 | 1 |  |  | 0 |  |  |  |

事故成本估算：

| 事故 | 最终严重度 | 锁格（含二次） | 开放拍数 | 危化品 | 校车 | 分摊锁格费 | 估算总成本 | 放行来源 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| INC0001 | SERIOUS | 16 | 15 |  |  | 2.24 | 7.24 | V00217@c- |
| INC0002 | CRITICAL | 51 | 42 |  | 是 | 29.987 | 39.987 | V00086@c20 V00111@c- V00067@c23 V00149@c24 V00073@c23 |
| INC0003 | CRITICAL | 49 | 31 |  | 是 | 21.265 | 36.265 | V00110@c25 V00138@c26 V00117@c25 V00167@c30 |
| INC0004 | SERIOUS | 12 | 1 |  |  | 0.112 | 5.112 | V00128@c57 |

**司机抢行**

总计 {"redLight":2,"tailgate":1,"cutIn":3}

| 周期 | 类型 | 车辆 | 此前出现在 driverAlerts 的周期数 | 最后一次预警 | 卷入事故 |
| --- | --- | --- | --- | --- | --- |
| 10 | VEHICLE_RED_LIGHT | V00015 | 1 | IN_N_S1_STRAIGHT 距停止线 0 剩余 6 |  |
| 12 | VEHICLE_RED_LIGHT | V00008 | 2 | IN_E_L1_LEFT 距停止线 0 剩余 0 |  |
| 24 | VEHICLE_TAILGATE | V00111 | 8 | IN_E_S2_STRAIGHT 距停止线 7 剩余 0 | INC0002 |

**紧急车辆与抛锚**

紧急车辆延误扣费 0.424

| 车辆 | 首次进入 12 格 | 放行 tick | 等待拍数 | 最长静止 |
| --- | --- | --- | --- | --- |
| V00034 | 69 | 125 | 56 | 49 |
| V00036 | 69 | 99 | 30 | 19 |
| V00043 | 79 | 90 | 11 | 0 |
| V00050 | 79 | 155 | 76 | 62 |
| V00056 | 79 |  |  | 32 |
| V00096 | 126 | 147 | 21 | 16 |
| V00101 | 126 | 152 | 26 | 17 |
| V00217 | 181 | 201 | 20 | 13 |
| V00145 | 184 |  |  | 74 |
| V00263 | 206 |  |  | 30 |
| V00137 | 212 |  |  | 43 |

拖车费 10.8，链式加价 0.1

| 车辆 | 车道 | 抛锚 | 派拖车 | 派车延迟 | 绕行 |
| --- | --- | --- | --- | --- | --- |
| V00014 | IN_S_R1_RIGHT | 64 | 69 | 5 | 69 |
| V00006 | IN_N_R1_RIGHT | 72 | 79 | 7 |  |
| V00029 | IN_W_S2_STRAIGHT | 86 | 89 | 3 |  |
| V00063 | IN_W_S1_STRAIGHT | 115 | 118 | 3 |  |
| V00068 | IN_N_L1_LEFT | 121 | 142 | 21 |  |
| V00089 | IN_S_S1_STRAIGHT | 126 | 133 | 7 |  |
| V00122 | IN_W_R1_RIGHT | 155 | 162 | 7 |  |
| V00124 | IN_E_L1_LEFT | 174 | 181 | 7 |  |
| V00221 | IN_E_R1_RIGHT | 204 | 206 | 2 |  |

### 2.3 亮眼操作与最差操作

周期价值 = 未卷入事故的放行车数 + 1.5×放行行人 + 2×成功的特情工具 − 归因事故成本。事故成本按锁格×开放时长分摊本局真实锁格扣费，再加撞人和校车罚款，平均分给放行了涉事车辆的周期。这是用于挑选证据的启发式，不是精确账目。

亮点事件：

| tick | 周期 | 类型 | 说明 |
| --- | --- | --- | --- |
| 69 | 2 | STALL_REROUTE | V00074 around V00014 |
| 69 | 2 | TOW_DISPATCH | V00014 |
| 79 | 3 | TOW_DISPATCH | V00006 |
| 79 | 3 | LARGE_VERIFIED_RELEASE | 12 vehicles, blame=0 |
| 89 | 4 | TOW_DISPATCH | V00029 |
| 105 | 6 | LARGE_VERIFIED_RELEASE | 11 vehicles, blame=0 |
| 118 | 8 | TOW_DISPATCH | V00063 |
| 133 | 10 | TOW_DISPATCH | V00089 |
| 142 | 13 | TOW_DISPATCH | V00068 |
| 146 | 14 | PED_GRANT | CROSSWALK:EAST B_TO_A x2 |
| 151 | 15 | LARGE_VERIFIED_RELEASE | 13 vehicles, blame=0 |
| 162 | 17 | TOW_DISPATCH | V00122 |
| 162 | 17 | PED_GRANT | CROSSWALK:WEST A_TO_B+B_TO_A x3 |
| 163 | 17 | LANE_GUIDANCE | V00112 IN_S_L1_LEFT->IN_S_S2_STRAIGHT |
| 181 | 19 | TOW_DISPATCH | V00124 |
| 181 | 19 | EMERGENCY_CONVOY | V00217 on IN_E_R1_RIGHT |
| 184 | 21 | PED_GRANT | CROSSWALK:NORTH A_TO_B x2 |
| 201 | 25 | PED_GRANT | CROSSWALK:EAST B_TO_A x1 |
| 201 | 25 | PED_GRANT | CROSSWALK:SOUTH A_TO_B x2 |
| 206 | 27 | TOW_DISPATCH | V00221 |
| 249 | 53 | LANE_GUIDANCE | V00160 IN_W_S1_STRAIGHT->IN_W_R1_RIGHT |
| 253 | 54 | LANE_GUIDANCE | V00166 IN_W_S1_STRAIGHT->IN_W_R1_RIGHT |

#### 得分最高的周期

**周期 3（tick 79）**：放行 12，未出事 12，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -1.576，提交类型 verified，睡眠 10

- 观测要点：余额 998.45，停止线候选 12，受阻路线 4，行人预警 []，司机预警 []，紧急车 [V00034, V00036, V00043, V00050, V00056]，抛锚 [V00006, V00014]
- 工具序列：r1 dispatch_tow_truck -> ok；r1 inspect_lane_queue -> ok；r1 inspect_lane_queue -> ok；r1 inspect_lane_queue -> ok；r1 inspect_lane_queue -> ok；r1 inspect_lane_queue -> ok；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 战术摘要：W-dominant wave: W_S1 Top-3 (releases emergency V00043 + clears upstream), W_S2 Top-3, E_S1 Top-3 (bus lane), W_R1 Top-3 (releases emergency V00036). Dispatched tow for N_R1 stall V00006 (11 blocked). N lanes and S_L1 emergency deferred to next cycle.
- 推理摘录：Let me analyze this observation carefully. Current tick 79, end 261, 182 ticks remaining. Balance 998.451. Let me understand the state: Stopline candidates (heads waiting at stopline): - V00008 E_L1_LEFT passenger 1, waiting 18, route E_L1_LEFT — BLOCKED (reservation until 86) - V00011 E_R1_RIGHT passenger 2, waiting 16, route E_R1_RIGHT — BLOCKED (reservation until 88) - V00024 E_S1_STRAIGHT truck 1, waiting 9 - V00015 N_S1_STRAIGHT passenger 1, waiting 14 - V00010 N_S2_STRAIGHT passenger 1, wa …… n west side. Exit and entrance are separate lanes. Should be fine. Also E_S1 head V00024 is a truck (1 passenger), but E_S1 lane has 42 passengers in 3 vehicles, so V00042 and V00048 include a bus (40). Good value. OK, commit. sleep_ticks 10. Let me write the commit with the exact same lane_batches.

**周期 2（tick 69）**：放行 7，未出事 7，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -1.441，提交类型 verified，睡眠 10

- 观测要点：余额 999.89，停止线候选 10，受阻路线 2，行人预警 []，司机预警 []，紧急车 [V00034, V00036]，抛锚 [V00014]
- 工具序列：r1 reroute_queue_around_stall -> ok；r1 dispatch_tow_truck -> ok；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 战术摘要：East-West wave: W_S1 Top-2 + W_S2 Top-2 (east, high passenger lanes) plus E_R1/E_S1/N_R1 heads. Stall towed (completes 87) and 1 vehicle rerouted to S_S1.
- 推理摘录：Let me analyze the current state. Current tick 69, endTick 261, ticksRemaining 192. Balance 999.8919. Let me understand the situation: - There are 10 stopline candidates. - Blocked routes: E_L1_LEFT (reservation until 74), W_R1_RIGHT (reservation until 82). - Active vehicles: V00002 (W_S1 straight crossing), V00004 (S_R1 right crossing), V00005 (N_L1 left crossing), V00007 (W_R1 right crossing). - Emergency alerts: V00034 in IN_S_L1_LEFT (blocked by V00019 and V00027, distance 6), V00036 in IN_W …… _schedule 的显式车辆、逐车档位、lane batch（含档位）和 pedestrian phases 必须规范化后完全匹配". My dry-run had candidate_vehicle_ids ["V00003","V00018","V00001"] and lane_batches with top_n 2 (default CRUISE). Commit must have admit_vehicle_ids ["V00003","V00018","V00001"] and same lane_batches. Good. Sleep 10. Let me commit.

**周期 6（tick 105）**：放行 11，未出事 11，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -0.81，提交类型 verified，睡眠 6

- 观测要点：余额 994.62，停止线候选 10，受阻路线 7，行人预警 []，司机预警 []，紧急车 [V00034, V00050, V00056]，抛锚 [V00029]
- 工具序列：r1 guide_inbound_lane_change -> TARGET_LANE_SLOT_OCCUPIED；r1 dry_run_admit -> ok；r2 commit_schedule -> ok
- 战术摘要：Committed open-lane wave (N_R1 top4, W_R1 top4, W_L1 top3). Guide for emergency V00050 to N_R1 failed: slot 46 occupied by V00053, will retry after N_R1 drains. Sleep 6 to tick 111 for W_S2 tow completion at 107.
- 推理摘录：Let me analyze the current state. Current tick 105, balance 994.6241. End tick 261, 156 ticks remaining. Let me look at the situation: **Blocked routes (RESERVATION):** - E_L1_LEFT until 131 - E_S1_STRAIGHT until 125 - E_S2_STRAIGHT until 124 - N_L1_LEFT until 123 - N_S1_STRAIGHT until 136 - N_S2_STRAIGHT until 135 - W_S1_STRAIGHT until 120 **Stopline candidates (heads):** - V00008 passenger, E_L1_LEFT, blocked until 131 (RESERVATION) - V00088 truck, E_S1_STRAIGHT, blocked until 125 - V00069 tru …… IN_W_R1_RIGHT, 4}, {IN_W_L1_LEFT, 3}], no vehicle_speed_profiles, no pedestrian_phases. tactical_summary: "Guide V00050 to N_R1 failed (slot occupied by V00053). Committed open-lane wave: N_R1 top4, W_R1 top4, W_L1 top3. Sleep 6 to tick 111 for W_S2 tow completion (107) and reassess." Let me commit.

**周期 15（tick 151）**：放行 13，未出事 11，放行行人 0，耐心风险放行 2，归因成本 0，周期余额变化 -1.075，提交类型 verified，睡眠 10

- 观测要点：余额 986.71，停止线候选 11，受阻路线 6，行人预警 [W:P19]，司机预警 [V00097:0, V00095:6, V00112:11, V00080:11, V00165:12]，紧急车 [V00050, V00101]，抛锚 [V00068]
- 工具序列：r1 dry_run_admit -> ok；r2 dry_run_admit -> LANE_HEAD_NOT_READY (Lane head is not ready: IN_S_S1_STRAIGHT)；r3 dry_run_admit -> DRY_RUN_QUOTA_EXHAUSTED；r4 commit_schedule -> ok
- 战术摘要：Admit available E_L1(4), E_R1(4), S_R1(1), W_R1(2), S_S2(2). Sleep 10 to tick 161; next handle WEST ped (N_R1 clears) + E_S1/E_S2/S_L1/W_S2 unblocking 162-166.
- 推理摘录：Let me analyze this observation carefully. Current tick 151, endTick 261, 110 ticks remaining. Balance 986.7131. Let me look at the state. Stopline candidates: - V00079 E_L1_LEFT passenger waiting 53 - V00134 E_R1_RIGHT passenger waiting 26 - V00088 E_S1_STRAIGHT truck waiting 50 (blocked by RESERVATION until 162) - V00069 E_S2_STRAIGHT truck waiting 58 (blocked until 163) - V00040 S_L1_LEFT passenger waiting 73 (blocked until 165) - V00169 S_R1_RIGHT passenger waiting 9 - V00138 S_S2_STRAIGHT p …… e_id":"IN_E_L1_LEFT","top_n":4}, {"lane_id":"IN_E_R1_RIGHT","top_n":4}, {"lane_id":"IN_S_R1_RIGHT","top_n":1}, {"lane_id":"IN_W_R1_RIGHT","top_n":2}, {"lane_id":"IN_S_S2_STRAIGHT","top_n":2}] - vehicle_speed_profiles: [] (omitted) - pedestrian_phases: [] (omitted) Commit with the same. Let me do it.

**周期 5（tick 99）**：放行 10，未出事 10，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -0.485，提交类型 verified，睡眠 6

- 观测要点：余额 995.11，停止线候选 12，受阻路线 2，行人预警 []，司机预警 []，紧急车 [V00034, V00050, V00056]，抛锚 [V00029]
- 工具序列：r1 dry_run_admit -> ok；r2 manage_working_memory -> ok；r2 commit_schedule -> ok
- 战术摘要：S-dominant wave: S_L1 Top3 frees emergency V00034; S_S1 Top3, S_S2 Top2 (HAZMAT head), S_R1 bus 40p, E_R1. Defer N_L1 emergency V00056 (conflicts S_S1/S_S2) until N unblock. Sleep 6 to tick 105.
- 推理摘录：Let me analyze the current state carefully. Current tick 99, endTick 261, 162 ticks remaining. Balance 995.1089. Key observations: - Stalled vehicle V00029 in IN_W_S2_STRAIGHT, tow en route completion tick 107 (8 ticks away), cost already 1.2. bypassAvailability all 0, so no rerouting possible. - Blocked routes: N_S1_STRAIGHT (RESERVATION until 105), N_S2_STRAIGHT (RESERVATION until 104). - Stopline candidates: - E_L1_LEFT: V00008 passenger 1, waiting 38 - E_R1_RIGHT: V00082 passenger 2, waiting ……  brief one. Let me commit with identical parameters: lane_batches same as dry_run. sleep_ticks 6. Tactical summary: "S-dominant wave: S_L1 Top3 frees emergency V00034; S_S1 Top3, S_S2 Top2 (HAZMAT head), S_R1 bus, E_R1. Sleep 6 to tick 105 for N_S1/N_S2 unblock and W_S2 tow at 107." Let me finalize.

#### 损失最大的周期

**周期 23（tick 193）**：放行 6，未出事 4，放行行人 0，耐心风险放行 9，归因成本 19.99，周期余额变化 -0.304，提交类型 verified，睡眠 10

- 观测要点：余额 992.82，停止线候选 12，受阻路线 8，行人预警 [S:P12, N:P15, E:P18]，司机预警 [V00085:0, V00111:0, V00126:0, V00095:0, V00097:0, V00114:0, V00140:0, V00139:0]，紧急车 [V00145, V00217]，抛锚 [V00124]
- 工具序列：r1 dry_run_admit -> ok；r1 inspect_lane_queue -> ok；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 后果：INC0002 PILEUP tick=212 vehicles=5 pedestrians=0 estCost=39.987
- 战术摘要：South phase: S_L1 top3 + S_R1 top3 (6 vehicles, verified, reward 1.5). Sleep 10 to tick 203; west crosswalk clears ~198, tow truck arrives 199 opening E_L1.
- 推理摘录：Let me analyze this observation carefully. Current tick 193, endTick 261, 68 ticks remaining. Balance 992.8165. Let me understand the state: - Stopline candidates: 12 vehicles across all 4 directions. - blockedRoutes: several RESERVATION blocks (no INCIDENT blocks). N_L1_LEFT blocked until 205, N_S1_STRAIGHT 208, N_S2_STRAIGHT 207, S_S1_STRAIGHT 211, S_S2_STRAIGHT 205, W_L1_LEFT 208, W_R1_RIGHT 197, W_S1_STRAIGHT 193. So currently blocked routes (RESERVATION - can wait until tick): - N_L1_LEFT u …… gency V00145 (stationary ~17 ticks, penalty running) and possibly dispatch convoy (N_S1 unblocks 208). OK let me just commit now. tactical_summary: "South phase: S_L1 top3 + S_R1 top3 (6 vehicles). Sleep 10 to tick 203; then west crosswalk clear, tow done (E_L1 opens)." Let me write the commit call.

**周期 25（tick 201）**：放行 4，未出事 2，放行行人 0，耐心风险放行 8，归因成本 18.13，周期余额变化 -0.072，提交类型 verified，睡眠 5

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:61:0:CROSSWALK:EAST remaining=24
- 观测要点：余额 996.09，停止线候选 8，受阻路线 7，行人预警 [S:P4, N:P7, E:P10, E:P24]，司机预警 [V00109:0, V00085:0, V00087:0, V00126:0, V00095:0, V00135:0, V00140:0, V00097:0]，紧急车 [V00145]，抛锚 []
- 工具序列：r1 inspect_lane_queue -> ok；r1 inspect_lane_queue -> ok；r2 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:NORTH:CELL:7:0 vs V00214)；r3 dry_run_admit -> ok；r4 commit_schedule -> ok
- 后果：INC0003 PILEUP tick=215 vehicles=4 pedestrians=1 estCost=36.265
- 战术摘要：Admit S_S1 top-4 (truck head + 3, includes aggressive V00126 legally) plus SOUTH A_TO_B and EAST B_TO_A pedestrian phases. Sleep 5 to tick 206 to reassess before S_S2/N_L1 unlock and before NORTH B_TO_A (PED:43) patience hits 0.
- 推理摘录：Let me analyze this observation carefully. Current tick 201, endTick 261, ticksRemaining 60. Balance 996.0853. Interrupt reason: PEDESTRIAN_PATIENCE pedestrian PED:61:0:CROSSWALK:EAST remaining=24. Let me look at the situation. Stopline candidates (heads): - V00109 passenger 2, N_L1_LEFT, waitingTicks 88, route N_L1_LEFT — blocked until 210 (RESERVATION) - V00094 van 8, N_S1_STRAIGHT, blocked until 224 - V00064 passenger 1, N_S2_STRAIGHT, blocked until 222 - V00110 truck 1, S_S1_STRAIGHT, waitin ……  working memory is a nice-to-have. Let me skip it and just commit. The next observation will guide me. Let me commit now. tactical_summary: "Admit S_S1 top-4 (truck head + 3) with SOUTH A_TO_B and EAST B_TO_A pedestrian phases. Sleep 5 to reassess before N_L1/S_S2 unlock." Let me write it concisely.

**周期 24（tick 200）**：放行 3，未出事 2，放行行人 0，耐心风险放行 3，归因成本 10，周期余额变化 3.573，提交类型 unverified，睡眠 8

- 唤醒原因：VEHICLE_TAILGATE vehicle=V00111 route=E_S2_STRAIGHT
- 观测要点：余额 992.51，停止线候选 11，受阻路线 8，行人预警 [S:P5, N:P8, E:P11]，司机预警 [V00109:0, V00085:0, V00087:0, V00126:0, V00095:0, V00135:0, V00097:0, V00140:0]，紧急车 [V00145, V00217]，抛锚 []
- 工具序列：r1 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:NORTH:CELL:7:0 vs V00204)；r2 dry_run_admit -> RESOURCE_CONFLICT (PAIR:N_L1_LEFT:5|E_S1_STRAIGHT:7 vs V00109,V00141)；r3 commit_schedule -> ok
- 后果：INC0002 PILEUP tick=212 vehicles=5 pedestrians=0 estCost=39.987
- 战术摘要：Dry runs showed NORTH B_TO_A pedestrian phase conflicts with E_R1 crossing (V00204), and N_L1 head V00109 conflicts with E_S1 V00141 until ~204. Admit only the three unblocked, non-conflicting heads: E_S1 straight V00149, N_R1 right V00130, W_R1 right V00129. Sleep 8 to ~208 so S_S1/S_S2 and N_L1 re
- 推理摘录：Let me analyze this observation carefully. Current tick 200, end 261, 61 ticks remaining. Balance 992.5124. There's an interruptReason: VEHICLE_TAILGATE vehicle=V00111 route=E_S2_STRAIGHT. This means V00111 tailgated (ran into intersection illegally). It's now in activeVehicleMotions as CROSSING E_S2_STRAIGHT. This is informational; no accident apparently yet. Let me look at the state. stoplineCandidates (heads): - V00149 passenger, E_S1_STRAIGHT, waiting 68 - V00109 passenger, N_L1_LEFT, waitin …… 0129"] sleep_ticks: 8 tactical_summary: "Admit unblocked heads E_S1 straight, N_R1 right, W_R1 right. No pedestrian phases (NORTH conflicts with E_R1 crossing). Sleep 8 to ~208 for S_S1/S_S2 and N_L1 reservations to clear; watch V00109 red-light risk until NORTH crossing clears ~216." Let me commit.

**周期 20（tick 182）**：放行 6，未出事 5，放行行人 0，耐心风险放行 0，归因成本 10，周期余额变化 -0.389，提交类型 verified，睡眠 10

- 观测要点：余额 986.05，停止线候选 12，受阻路线 4，行人预警 [N:P4, S:P23]，司机预警 [V00126:0, V00095:0, V00111:0, V00097:0, V00114:0, V00178:0, V00176:0, V00182:0]，紧急车 [V00217]，抛锚 [V00124]
- 工具序列：r1 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:NORTH:CELL:7:0 vs V00217)；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 后果：INC0002 PILEUP tick=212 vehicles=5 pedestrians=0 estCost=39.987
- 战术摘要：Release E_S1/E_S2 straight batches (top 3 each) to drain high-passenger east queues; exits west free. NORTH peds conflict with E_R1 emergency convoy V00217 at tick 210, so defer peds. Sleep 10 to tick 192 when exit holds clear; then release W_S2/W_S1 and legalize tailgater V00111 before V00086 enter
- 推理摘录：Let me analyze the current situation carefully. Current tick: 182, endTick: 261, 79 ticks remaining. Balance 986.05. I need to make a decision. Let me understand the state. Stopline candidates (heads at stopline): - V00088 truck, IN_E_S1_STRAIGHT, route E_S1_STRAIGHT, waiting 81 - V00069 truck, IN_E_S2_STRAIGHT, route E_S2_STRAIGHT, waiting 89 - V00109 passenger 2, IN_N_L1_LEFT, N_L1_LEFT, waiting 69 - V00130 passenger 1, IN_N_R1_RIGHT, N_R1_RIGHT, waiting 58 - V00064 passenger 1, IN_N_S2_STRAIG …… gers → 1.3 revenue). But it clears queue heads, reducing delay for the high-value queue behind (E_S2 203 passengers). As heads clear, subsequent vehicles advance, reducing stopped ticks and allowing more throughput later. OK, commit. Let me write tactical_summary. Sleep 10 → tick 192. Let me commit.

**周期 26（tick 204）**：放行 2，未出事 1，放行行人 0，耐心风险放行 4，归因成本 9.07，周期余额变化 -0.95，提交类型 verified，睡眠 2

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:68:0:CROSSWALK:NORTH remaining=24
- 观测要点：余额 996.01，停止线候选 11，受阻路线 9，行人预警 [N:P4, E:P21, N:P24]，司机预警 [V00045:0, V00109:0, V00085:0, V00087:0, V00095:0, V00135:0, V00140:0, V00097:0]，紧急车 [V00145]，抛锚 []
- 工具序列：r1 inspect_crosswalk -> ok；r1 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:NORTH:CELL:7:0 vs V00214)；r2 dry_run_admit -> ok；r3 dry_run_admit -> DRY_RUN_QUOTA_EXHAUSTED；r4 commit_schedule -> ok
- 后果：INC0003 PILEUP tick=215 vehicles=4 pedestrians=1 estCost=36.265
- 战术摘要：NORTH B_TO_A release is blocked by E_R1_RIGHT V00214 at cell 7:0; defer pedestrians to next cycle once E_R1 clears (PED:43 patience 4 now, so short sleep). Commit verified unblocked heads: N_R1 right V00155 (exits west, safe) and S_S2 straight V00138.
- 推理摘录：Let me analyze this situation carefully. Current tick: 204, endTick 261, ticksRemaining 57. Balance 996.0134. We have an interruptReason: PEDESTRIAN_PATIENCE pedestrian=PED:68:0:CROSSWALK:NORTH remaining=24. Let me understand the state. Stopline candidates (11 vehicles): - V00128 truck, IN_E_L1_LEFT, route E_L1_LEFT, blocked until 220 (RESERVATION) - V00164 passenger, IN_E_S1_STRAIGHT, blocked until 228 - V00116 van (8 pax), IN_E_S2_STRAIGHT, blocked until 231 - V00109 passenger (2 pax), IN_N_L1 …… e. Admit verified unblocked heads N_R1 V00155 and S_S2 V00138." Actually, let me reconsider whether sleep 2 or sleep 3. PED:43 patience 4. Sleep 2 → 2 remaining. Sleep 3 → 1 remaining. Sleep 3 gets to 207, more likely E_R1 cleared. But patience 1 is risky. Sleep 2 is a good balance. Let me finalize.

### 附：逐周期一览

| 周期 | tick | 提交 | 放行 | 行人 | 耐心风险 | 归因事故 | 归因成本 | 余额变化 | 睡眠 | 唤醒原因 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 61 | verified | 4 | 0 | 0 |  | 0 | -0.108 | 8 |  |
| 2 | 69 | verified | 7 | 0 | 0 |  | 0 | -1.441 | 10 |  |
| 3 | 79 | verified | 12 | 0 | 0 |  | 0 | -1.576 | 10 |  |
| 4 | 89 | verified | 1 | 0 | 0 |  | 0 | -1.766 | 10 |  |
| 5 | 99 | verified | 10 | 0 | 0 |  | 0 | -0.485 | 6 |  |
| 6 | 105 | verified | 11 | 0 | 0 |  | 0 | -0.81 | 6 |  |
| 7 | 111 | verified | 2 | 0 | 0 |  | 0 | -1.233 | 7 |  |
| 8 | 118 | verified | 6 | 0 | 0 |  | 0 | -2.767 | 8 |  |
| 9 | 126 | verified | 9 | 0 | 0 |  | 0 | -1.234 | 9 |  |
| 10 | 133 | verified | 4 | 0 | 0 |  | 0 | -2.408 | 7 | VEHICLE_RED_LIGHT vehicle=V00015 route=N_S1_STRAIGHT |
| 11 | 140 | unverified | 3 | 0 | 0 |  | 0 | -0.137 | 10 |  |
| 12 | 141 | hold | 0 | 0 | 0 |  | 0 | -0.28 | 10 | VEHICLE_RED_LIGHT vehicle=V00008 route=E_L1_LEFT |
| 13 | 142 | hold | 0 | 0 | 0 |  | 0 | 1.867 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:11:0:CROSSWALK:EAST remai |
| 14 | 146 | verified | 0 | 0 | 0 |  | 0 | -0.91 | 5 | PEDESTRIAN_PATIENCE pedestrian=PED:3:0:CROSSWALK:WEST remain |
| 15 | 151 | verified | 13 | 0 | 2 |  | 0 | -1.075 | 10 |  |
| 16 | 161 | verified | 8 | 0 | 0 |  | 0 | -0.313 | 10 |  |
| 17 | 162 | verified | 0 | 0 | 0 |  | 0 | 3.658 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:20:0:CROSSWALK:NORTH rema |
| 18 | 172 | verified | 1 | 0 | 1 |  | 0 | -1.421 | 10 |  |
| 19 | 181 | hold | 0 | 0 | 0 |  | 0 | -1.513 | 1 | PEDESTRIAN_PATIENCE pedestrian=PED:38:0:CROSSWALK:SOUTH rema |
| 20 | 182 | verified | 6 | 0 | 0 | INC0002 | 10 | -0.389 | 10 |  |
| 21 | 184 | verified | 0 | 0 | 0 |  | 0 | 0.046 | 5 | PEDESTRIAN_PATIENCE pedestrian=PED:43:0:CROSSWALK:NORTH rema |
| 22 | 187 | hold | 0 | 0 | 0 |  | 0 | 7.11 | 6 | PEDESTRIAN_PATIENCE pedestrian=PED:45:0:CROSSWALK:EAST remai |
| 23 | 193 | verified | 6 | 0 | 9 | INC0002 | 19.99 | -0.304 | 10 |  |
| 24 | 200 | unverified | 3 | 0 | 3 | INC0002 | 10 | 3.573 | 8 | VEHICLE_TAILGATE vehicle=V00111 route=E_S2_STRAIGHT |
| 25 | 201 | verified | 4 | 0 | 8 | INC0003 | 18.13 | -0.072 | 5 | PEDESTRIAN_PATIENCE pedestrian=PED:61:0:CROSSWALK:EAST remai |
| 26 | 204 | verified | 2 | 0 | 4 | INC0003 | 9.07 | -0.95 | 2 | PEDESTRIAN_PATIENCE pedestrian=PED:68:0:CROSSWALK:NORTH rema |
| 27 | 206 | hold | 0 | 0 | 0 |  | 0 | -1.462 | 1 |  |
| 28 | 207 | hold | 0 | 0 | 0 |  | 0 | -0.492 | 1 |  |
| 29 | 208 | verified | 1 | 0 | 2 |  | 0 | -6.397 | 4 |  |
| 30 | 210 | verified | 1 | 0 | 2 | INC0003 | 9.07 | -1.1 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:62:0:CROSSWALK:NORTH rema |
| 31 | 212 | hold | 0 | 0 | 0 |  | 0 | -11.065 | 2 | ACCIDENT_INTERRUPT incident=INC0002 locked=CROSSWALK:WEST:CE |
| 32 | 213 | hold | 0 | 0 | 0 |  | 0 | -8.108 | 8 | ACCIDENT_INTERRUPT incident=INC0002 secondary=true |
| 33 | 216 | - | 1 | 0 | 1 |  | 0 | -0.903 | 4 | ACCIDENT_INTERRUPT incident=INC0003 locked=CROSSWALK:NORTH:C |
| 34 | 217 | hold | 0 | 0 | 0 |  | 0 | -12.041 | 7 | PEDESTRIAN_PATIENCE pedestrian=PED:86:0:CROSSWALK:SOUTH rema |
| 35 | 218 | hold | 0 | 0 | 0 |  | 0 | -4.132 | 10 | ACCIDENT_INTERRUPT incident=INC0003 secondary=true |
| 36 | 220 | hold | 0 | 0 | 0 |  | 0 | 1.559 | 4 | PEDESTRIAN_PATIENCE pedestrian=PED:82:0:CROSSWALK:NORTH rema |
| 37 | 221 | hold | 0 | 0 | 0 |  | 0 | -1.383 | 1 | ACCIDENT_INTERRUPT incident=INC0002 secondary=true |
| 38 | 222 | hold | 0 | 0 | 0 |  | 0 | -4.55 | 2 |  |
| 39 | 224 | hold | 0 | 0 | 0 |  | 0 | -3.027 | 8 |  |
| 40 | 225 | hold | 0 | 0 | 0 |  | 0 | -3.265 | 7 | PEDESTRIAN_PATIENCE pedestrian=PED:81:0:CROSSWALK:WEST remai |
| 41 | 228 | unverified | 3 | 0 | 6 |  | 0 | -9.425 | 4 | PEDESTRIAN_JAYWALK pedestrian=PED:68:0:CROSSWALK:NORTH |
| 42 | 232 | hold | 0 | 0 | 0 |  | 0 | -1.544 | 10 |  |
| 43 | 233 | hold | 0 | 0 | 0 |  | 0 | -3.265 | 4 | PEDESTRIAN_PATIENCE pedestrian=PED:87:0:CROSSWALK:WEST remai |
| 44 | 234 | hold | 0 | 0 | 0 |  | 0 | -5.121 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:62:0:CROSSWALK:NORTH |
| 45 | 236 | hold | 0 | 0 | 0 |  | 0 | -5.274 | 3 | PEDESTRIAN_PATIENCE pedestrian=PED:106:0:CROSSWALK:WEST rema |
| 46 | 238 | hold | 0 | 0 | 0 |  | 0 | -2.795 | 8 | PEDESTRIAN_PATIENCE pedestrian=PED:95:0:CROSSWALK:SOUTH rema |
| 47 | 239 | hold | 0 | 0 | 0 |  | 0 | -6.034 | 7 | PEDESTRIAN_PATIENCE pedestrian=PED:91:0:CROSSWALK:EAST remai |
| 48 | 241 | hold | 0 | 0 | 0 |  | 0 | -2.771 | 5 | PEDESTRIAN_JAYWALK pedestrian=PED:86:0:CROSSWALK:SOUTH |
| 49 | 242 | hold | 0 | 0 | 0 |  | 0 | -6.042 | 4 | PEDESTRIAN_PATIENCE pedestrian=PED:113:0:CROSSWALK:WEST rema |
| 50 | 244 | hold | 0 | 0 | 0 |  | 0 | -4.69 | 2 | PEDESTRIAN_PATIENCE pedestrian=PED:98:0:CROSSWALK:NORTH rema |
| 51 | 246 | hold | 0 | 0 | 0 |  | 0 | -2.036 | 10 |  |
| 52 | 247 | hold | 0 | 0 | 0 |  | 0 | -4.761 | 7 | PEDESTRIAN_PATIENCE pedestrian=PED:115:0:CROSSWALK:EAST rema |
| 53 | 249 | hold | 0 | 0 | 0 |  | 0 | -5.593 | 5 | PEDESTRIAN_JAYWALK pedestrian=PED:81:0:CROSSWALK:WEST; PEDES |
| 54 | 252 | hold | 0 | 0 | 0 |  | 0 | -7.05 | 9 | PEDESTRIAN_PATIENCE pedestrian=PED:119:0:CROSSWALK:WEST rema |
| 55 | 257 | hold | 0 | 0 | 0 |  | 0 | -2.497 | 4 | PEDESTRIAN_JAYWALK pedestrian=PED:87:0:CROSSWALK:WEST |
| 56 | 259 | hold | 0 | 0 | 0 |  | 0 | -1.978 | 2 | PEDESTRIAN_PATIENCE pedestrian=PED:111:0:CROSSWALK:NORTH rem |
| 57 | 260 | unverified | 4 | 0 | 14 | INC0004 | 5.11 | -6.466 | 1 | PEDESTRIAN_JAYWALK pedestrian=PED:106:0:CROSSWALK:WEST |

