# 运行分析：qwen-3.8-27b_2026-10-02_030455362-104156

- 模型：qwen-3.8-27b；种子 63916；规则版本 17；回放 schema 7
- 截止 tick 261，决策周期 58，最终余额 **683.05**
- 生成时间 2026-10-01T21:35:22.441Z；数据文件：replay_qwen-3.8-27b_2026-10-02_030455362-104156.json、report_qwen-3.8-27b_2026-10-02_030455362-104156.json、api-log_qwen-3.8-27b_2026-10-02_030455362-104156.jsonl、raw-api-log_qwen-3.8-27b_2026-10-02_030455362-104156.jsonl

## 1. 基础分析

### 1.1 上下文能力

- prompt tokens：平均 12153.9，P50 12082，P95 13133，最大 14747（n=173）
- completion tokens：平均 4919.1，P50 4740，P95 11810，最大 16384（n=173）；其中推理 tokens：平均 4754.3，P50 4568，P95 11688，最大 16384（n=173）
- 每周期 API 轮数：平均 3，P50 3，P95 4，最大 6（n=58）；上限 8，用满上限的周期 0 个
- 每次请求的平均字符数：系统提示 9667.4，user 7020.7，工具结果 640.4，assistant 430.1；消息条数 平均 4.6，P50 4，P95 9，最大 15（n=174）
- 工具参数中的 ID 共 498 个：出现在当轮可见上下文里的占 0.984，当轮不可见但本局别处出现过 0 个，本局从未出现 0 个，非规范横道短键 8 个

| ID 类型 | 总数 | 当轮可见 | 别处出现 | 从未出现 | 非规范短键 |
| --- | --- | --- | --- | --- | --- |
| vehicle | 115 | 115 | 0 | 0 | 0 |
| lane | 317 | 317 | 0 | 0 | 0 |
| route | 1 | 1 | 0 | 0 | 0 |
| crosswalk | 31 | 31 | 0 | 0 | 0 |
| crosswalkShortKey | 8 | 0 | 0 | 0 | 8 |
| incident | 12 | 12 | 0 | 0 | 0 |
| routeAsLaneId | 14 | 14 | 0 | 0 | 0 |

- 同一周期内重复提交已失败的相同调用：0 次 {}
- 提交类型：verified 17，unverified 4，hold 36；放行类提交中 verified 占 0.81
- working memory：调用 0 次 {}，观测里带有计划的周期 0 个

### 1.2 注意力分布

关注率 = 字段出现在该周期观测里、且推理文本提到它的周期数 / 字段出现的周期数。

| 概念 | 出现周期 | 提到且出现 | 关注率 | 提到周期（含未出现） | 提及次数 |
| --- | --- | --- | --- | --- | --- |
| laneMatrices | 58 | 58 | 1 | 58 | 1074 |
| crosswalks | 58 | 58 | 1 | 58 | 9057 |
| reservedUntil | 55 | 55 | 1 | 57 | 1243 |
| pedestrianAlerts | 49 | 49 | 1 | 55 | 6802 |
| stalledVehicles | 20 | 20 | 1 | 29 | 259 |
| emergency | 58 | 57 | 0.983 | 57 | 670 |
| timeBudget | 58 | 57 | 0.983 | 57 | 294 |
| driverAlerts | 50 | 49 | 0.98 | 52 | 727 |
| stoplineCandidates | 58 | 56 | 0.966 | 56 | 386 |
| incidentBlocked | 23 | 22 | 0.957 | 29 | 331 |
| candidateConflicts | 58 | 54 | 0.931 | 54 | 2084 |
| exits | 56 | 52 | 0.929 | 54 | 1460 |
| dischargingLanes | 10 | 9 | 0.9 | 18 | 87 |
| activeVehicleMotions | 49 | 44 | 0.898 | 48 | 161 |
| revokedAdmissions | 9 | 7 | 0.778 | 19 | 127 |
| recentCycles | 57 | 34 | 0.596 | 34 | 109 |
| lastSettlement | 57 | 26 | 0.456 | 26 | 42 |
| holds | 44 | 14 | 0.318 | 14 | 29 |
| laneGuidance | 58 | 12 | 0.207 | 12 | 24 |
| workingMemory | 0 | 0 |  | 4 | 4 |

中断响应：

| 中断类型 | 次数 | 有响应 | 响应率 | 判定规则 |
| --- | --- | --- | --- | --- |
| PEDESTRIAN_PATIENCE | 29 | 9 | 0.31 | 同周期任一试算或提交带 pedestrian_phases |
| PEDESTRIAN_JAYWALK | 21 | 10 | 0.476 | 推理文本提到了中断对象 ID |
| VEHICLE_RED_LIGHT | 3 | 3 | 1 | 推理文本提到了中断对象 ID |
| ACCIDENT_INTERRUPT | 7 | 6 | 0.857 | 同周期调用 inspect_incident / order_accident_clearance / set_lane_detour |

- 每次回复的推理字符数：平均 13965.7，P50 12430，P95 32513，最大 47260（n=173）

### 1.3 tool_call 准确性

- 工具调用 187 次，成功 138 次，成功率 0.738
- 失败分类：{"RESOURCE_CONFLICT":19,"DRY_RUN_QUOTA_EXHAUSTED":14,"LANE_HEAD_NOT_READY":4,"UNKNOWN_ID":4,"SCHEMA_ERROR":3,"UNKNOWN_CROSSWALK:E":1,"UNKNOWN_CROSSWALK:N":1,"ROUTE_SEVERED":1,"UNKNOWN_CROSSWALK:W":1,"PLANNING_HORIZON_EXCEEDED":1}
- 每次回复的工具调用数分布：{"0":1,"1":158,"2":13,"3":1}；finish_reason：{"tool_calls":172,"length":1}
- API 错误 1 次 {"400 status code (no body)":1}；回退周期 [22]
- 从未使用的工具：inspect_lane_queue、manage_working_memory、inspect_junction、set_lane_detour、dispatch_emergency_convoy、guide_inbound_lane_change

| 工具 | 调用 | 成功 | 成功率 | 结果分类 |
| --- | --- | --- | --- | --- |
| dry_run_admit | 106 | 61 | 0.575 | {"OK":61,"LANE_HEAD_NOT_READY":4,"DRY_RUN_QUOTA_EXHAUSTED":14,"RESOURCE_CONFLICT":18,"UNKNOWN_CROSSWALK:E":1,"SCHEMA_ERROR":2,"UNKNOWN_CROSSWALK:N":1,"ROUTE_SEVERED":1,"UNKNOWN_CROSSWALK:W":1,"UNKNOWN_ID":2,"PLANNING_HORIZON_EXCEEDED":1} |
| commit_schedule | 58 | 56 | 0.966 | {"OK":56,"RESOURCE_CONFLICT":1,"SCHEMA_ERROR":1} |
| dispatch_tow_truck | 6 | 6 | 1 | {"OK":6} |
| reroute_queue_around_stall | 1 | 1 | 1 | {"OK":1} |
| inspect_incident | 6 | 6 | 1 | {"OK":6} |
| order_accident_clearance | 6 | 6 | 1 | {"OK":6} |
| inspect_crosswalk | 4 | 2 | 0.5 | {"UNKNOWN_ID":2,"OK":2} |

错误样例：

- **LANE_HEAD_NOT_READY**
  - c10 t142 dry_run_admit：Lane head is not ready: IN_N_R1_RIGHT；参数 `{"lane_batches":[{"lane_id":"IN_W_S1_STRAIGHT","top_n":1,"speed_profile":"SLOW_SLIDE"},{"lane_id":"IN_N_R1_RIGHT","top_n":2,"speed_profile":"CRUISE"},{"lane_id":"IN_W_R1_RIGHT","top_n":1,"speed_profile":"SLOW_SLIDE"}]}`
  - c10 t142 dry_run_admit：Lane head is not ready: IN_W_R1_RIGHT；参数 `{"lane_batches":[{"lane_id":"IN_W_S1_STRAIGHT","top_n":1,"speed_profile":"SLOW_SLIDE"},{"lane_id":"IN_W_R1_RIGHT","top_n":1,"speed_profile":"SLOW_SLIDE"}],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:EAST","directions`
  - c24 t186 dry_run_admit：Lane head is not ready: IN_N_S2_STRAIGHT；参数 `{"lane_batches":[{"lane_id":"IN_E_R1_RIGHT","top_n":3},{"lane_id":"IN_N_S2_STRAIGHT","top_n":2},{"lane_id":"IN_S_S1_STRAIGHT","top_n":2},{"lane_id":"IN_S_S2_STRAIGHT","top_n":2}]}`
- **DRY_RUN_QUOTA_EXHAUSTED**
  - c10 t142 dry_run_admit：-；参数 `{"lane_batches":[{"lane_id":"IN_W_S1_STRAIGHT","top_n":1,"speed_profile":"SLOW_SLIDE"}],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:EAST","directions":["B_TO_A"]}]}`
  - c15 t165 dry_run_admit：-；参数 `{"lane_batches":[{"lane_id":"IN_N_R1_RIGHT","top_n":3,"speed_profile":"CRUISE"},{"lane_id":"IN_E_S2_STRAIGHT","top_n":3,"speed_profile":"CRUISE"},{"lane_id":"IN_W_S2_STRAIGHT","top_n":3,"speed_profile":"CRUISE"},{"lane_i`
  - c18 t175 dry_run_admit：-；参数 `{"lane_batches":[{"lane_id":"IN_N_S1_STRAIGHT","speed_profile":"CRUISE","top_n":1},{"lane_id":"IN_N_S2_STRAIGHT","speed_profile":"CRUISE","top_n":1},{"lane_id":"IN_S_S1_STRAIGHT","speed_profile":"CRUISE","top_n":1},{"lan`
- **RESOURCE_CONFLICT**
  - c14 t162 dry_run_admit：CROSSWALK:WEST:CELL:0:0 vs V00061；参数 `{"lane_batches":[{"lane_id":"IN_E_S1_STRAIGHT","top_n":1,"speed_profile":"CRUISE"},{"lane_id":"IN_W_S1_STRAIGHT","top_n":1,"speed_profile":"CRUISE"}],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:WEST","directions":["A`
  - c17 t172 dry_run_admit：CROSSWALK:WEST:CELL:0:0 vs V00096；参数 `{"admit_vehicle_ids":"[\"V00148\", \"V00206\"]","pedestrian_phases":[{"crosswalk_id":"CROSSWALK:WEST","directions":["A_TO_B"]}]}`
  - c18 t175 dry_run_admit：CROSSWALK:EAST:CELL:7:0 vs V00196；参数 `{"lane_batches":[{"lane_id":"IN_N_S1_STRAIGHT","top_n":1,"speed_profile":"CRUISE"},{"lane_id":"IN_N_S2_STRAIGHT","top_n":1,"speed_profile":"CRUISE"},{"lane_id":"IN_S_S1_STRAIGHT","top_n":1,"speed_profile":"CRUISE"},{"lan`
- **UNKNOWN_CROSSWALK:E**
  - c15 t165 dry_run_admit：none；参数 `{"lane_batches":[{"lane_id":"IN_N_R1_RIGHT","top_n":3,"speed_profile":"CRUISE"},{"lane_id":"IN_E_S2_STRAIGHT","top_n":3,"speed_profile":"CRUISE"},{"lane_id":"IN_W_S2_STRAIGHT","top_n":3,"speed_profile":"CRUISE"},{"lane_i`
- **SCHEMA_ERROR**
  - c17 t172 dry_run_admit：[ { "code": "custom", "message": "Provide vehicle ids or at least one lane batch", "path": [] } ]；参数 `{"admit_vehicle_ids":"[\"V00148\", \"V00206\"]"}`
  - c19 t176 dry_run_admit：[ { "code": "custom", "message": "Provide vehicle ids or at least one lane batch", "path": [] } ]；参数 `{"lan_batches":"[{\"lane_id\": \"IN_N_L1_LEFT\", \"top_n\": 1}, {\"lane_id\": \"IN_N_S1_STRAIGHT\", \"top_n\": 2}, {\"lane_id\": \"IN_N_S2_STRAIGHT\", \"top_n\": 2}]"}`
  - c31 t205 commit_schedule：[ { "code": "too_big", "maximum": 10, "type": "number", "inclusive": true, "exact": false, "message": "Number must be less than or equal to 10", "path": [ "slee；参数 `{"sleep_ticks":12,"tactical_summary":"All crosswalks with jaywalkers block every possible route. W crosswalk clears in ~12 ticks (col5 jaywalker), N in ~16, S in ~32. Sleeping 12 to unlock W and E axes for W-to-E and E-t`
- **UNKNOWN_CROSSWALK:N**
  - c19 t176 dry_run_admit：none；参数 `{"candidate_vehicle_ids":["V00148","V00032","V00010"],"pedestrian_phases":[{"crosswalk_id":"N","directions":["A_TO_B"]}]}`
- **ROUTE_SEVERED**
  - c21 t181 dry_run_admit：none；参数 `{"lane_batches":[{"lane_id":"IN_S_S1_STRAIGHT","top_n":3},{"lane_id":"IN_S_S2_STRAIGHT","top_n":3}]}`
- **UNKNOWN_CROSSWALK:W**
  - c27 t199 dry_run_admit：none；参数 `{"candidate_vehicle_ids":["V00098"],"vehicle_speed_profiles":[{"vehicle_id":"V00098","speed_profile":"CRUISE"}],"pedestrian_phases":[{"crosswalk_id":"W","directions":["A_TO_B"]},{"crosswalk_id":"S","directions":["A_TO_B"`
- **UNKNOWN_ID**
  - c33 t210 dry_run_admit：Unknown inbound lane: S_L1_LEFT；参数 `{"lane_batches":[{"lane_id":"S_L1_LEFT","top_n":2,"speed_profile":"CRUISE"},{"lane_id":"N_L1_LEFT","top_n":1,"speed_profile":"CRUISE"}],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:NORTH","directions":["B_TO_A"]}]}`
  - c37 t219 inspect_crosswalk：Unknown crosswalk: N；参数 `{"crosswalk_id":"N","limit":8}`
  - c37 t219 inspect_crosswalk：Unknown crosswalk: W；参数 `{"crosswalk_id":"W","limit":8}`
- **PLANNING_HORIZON_EXCEEDED**
  - c54 t249 dry_run_admit：Admission planning horizon exceeded for V00058；参数 `{"lane_batches":[{"lane_id":"IN_E_R1_RIGHT","top_n":3},{"lane_id":"IN_E_S1_STRAIGHT","top_n":3},{"lane_id":"IN_E_S2_STRAIGHT","top_n":3},{"lane_id":"IN_E_L1_LEFT","top_n":3},{"lane_id":"IN_N_R1_RIGHT","top_n":3},{"lane_i`

### 1.4 Agent 能力

- 周期内工具序列（D=试算，C=提交，T=其他工具）：{"DDC":17,"DDDC":13,"DC":10,"C":5,"TTDDC":2,"DTTC":1,"TTDC":1,"TDC":1,"TDDC":1,"TDDDC":1,"TDTDDDC":1,"(none)":1,"DCC":1,"TDTDC":1,"TDDTC":1,"TTDTTTTDC":1}
- 含提交的周期里先试算再提交的比例：0.912
- 提交构成：{"verified":17,"unverified":4,"hold":36,"reckless":0}；每周期放行车数 平均 1.3，P50 0，P95 6，最大 8（n=58）；共放行 76 辆
- 成功提交 56 次，其中使用 lane_batches 16 次；每次 top_n 合计 平均 1.2，P50 0，P95 6，最大 8（n=56）
- 速度档位：{"CRUISE":54,"SLOW_SLIDE":4}；sleep_ticks：平均 6.9，P50 8，P95 10，最大 12（n=58） {"1":5,"2":1,"3":2,"4":9,"5":10,"8":6,"9":1,"10":23,"12":1}
- 工具使用：{"dry_run_admit":106,"commit_schedule":58,"dispatch_tow_truck":6,"inspect_incident":6,"order_accident_clearance":6,"inspect_crosswalk":4,"reroute_queue_around_stall":1}
- 决策开销：API 174 次，扣 3.48；非终结工具 129 次，扣 0.1935

与同条件 baseline 对比：

| 策略 | 最终余额 | 放行车辆 | 未服务负债 | 事故数 | 锁格扣费 | 上游积压 | 撞人 | 闯红灯罚 | 行人奖励 | 校车 | 拖车 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| qwen-3.8-27b | 683.05 | 76 | 207.6 | 6 | 8.69 | 65.81 | 25 | 12.1 | 0 | 10 | 7.2 |
| baseline-balanced | 674.49 | 84 | 219.6 | 6 | 21.3 | 58.85 | 25 | 5.5 | 0 | 0 | 8.4 |
| baseline-search | 788.38 | 122 | 185.4 | 2 | 3.69 | 45.85 | 10 | 6.7 | 0 | 0 | 8.4 |

## 2. 进阶分析

### 2.1 逻辑推理

- 试算失败（不含额度用完）31 次；之后再试 16 次，其中改了参数 16 次，成功 7 次（0.438）；失败所在周期最终 verified 提交 1 次、hold 29 次
- 推理中"路线 X 经过/不经过 Y 横道"的断言 1135 条，正确 792，错误 343，准确率 0.698；前半局 45/132 错，后半局 298/1003 错
  - c7：「N_R1_RIGHT: North-bound → crosses S」（实际经过 CROSSWALK:NORTH+CROSSWALK:WEST）
  - c7：「W_R1_RIGHT: West-bound → crosses E」（实际经过 CROSSWALK:WEST+CROSSWALK:SOUTH）
  - c11：「W_R1_RIGHT turns right (North), so it might not cross the West」（实际经过 CROSSWALK:WEST+CROSSWALK:SOUTH）
  - c19：「E_S1_STRAIGHT (V00141) which crosses North」（实际经过 CROSSWALK:EAST+CROSSWALK:WEST）
  - c19：「N_S2_STRAIGHT, heading South) needs to cross the East」（实际经过 CROSSWALK:NORTH+CROSSWALK:SOUTH）
  - c19：「E_S1_STRAIGHT heading West) would cross the North」（实际经过 CROSSWALK:EAST+CROSSWALK:WEST）
  - c20：「N_S2_STRAIGHT) would cross the East」（实际经过 CROSSWALK:NORTH+CROSSWALK:SOUTH）
  - c20：「S_S1_STRAIGHT) would also cross the East」（实际经过 CROSSWALK:SOUTH+CROSSWALK:NORTH）
- 推理写"安全/无冲突"但同一轮试算冲突：12 次
  - c14 r1 t162：「 V00051 (from V00098's list) - V00115 doesn't list V00051 So V00051 (W_S1_STRAIGHT, school bus, 40 ppl) conflicts with V00098 (E_L1_LEFT). Let me try to find a compatible set: Option A: V00115 (E_S1, bus 40ppl) + V00051 (W_S1, school bus 40ppl) + V00109 (N_L1, taxi 2ppl) - V00115 conflicts with V00109! So can't have both. Option」→ CROSSWALK:WEST:CELL:0:0 vs V00061
  - c17 r1 t172：「 177 - W_L1_LEFT: 176 - W_S2_STRAIGHT: 181 So E_R1_RIGHT and S_R1_RIGHT and S_L1_LEFT are NOT reserved. These are free to try. V00148 (E_R1_RIGHT, P, 1, 40w) - no conflicts listed for it V00206 (S_R1_RIGHT, K, 3, 13w) - no conflicts listed for it V00027 (S_L1_LEFT, P, 1, 100w) - conflicts with V00072, V00032, V00010 Since V00027 c」→ CROSSWALK:WEST:CELL:0:0 vs V00096
  - c18 r1 t175：「 S_S1 conflicts with E_L1 and N_L1 and E_S2. Let me think about what I can admit together: - N_S1 (V00032) + N_S2 (V00010): Same direction straights, should be compatible with each other - S_S1 (V00052) + S_R1 (V00206): Different intents (straight vs right), should be compatible - E_R1 (V00148): Right turn, separate path from st」→ CROSSWALK:EAST:CELL:7:0 vs V00196
  - c21 r2 t181：「it. Let me try: - lane_batches: [{lane_id: "IN_S_S2_STRAIGHT", top_n: 2}] - pedestrian_phases: [{crosswalk_id: "CROSSWALK:SOUTH", directions: ["A_TO_B"]}] This should be safe since the crosswalk cells for South are clear ("........" and "........"). Actually, I realize I should think about this more strategically. I have 80 ticks le」→ CROSSWALK:SOUTH:CELL:2:0 vs V00010
  - c25 r2 t187：「ly, the phase just lets pedestrians into the crosswalk. If there's a vehicle there, the pedestrian would avoid it (the rules say "上游 4 格内本 tick 有动车就等待"). So it should be safe from a collision perspective, but the pedestrian might not actually move. Hmm, let me just focus on the dry-run. Let me try V00027 (S_L1_LEFT) alone. Wait, I s」→ PAIR:N_S2_STRAIGHT:8|S_L1_LEFT:6 vs V00027,V00016
  - c25 r3 t187：「AIGHT (South→North, crosses SOUTH and NORTH) None of these cross EAST or WEST crosswalks! They're all North-South straights. So opening a WEST pedestrian phase should be safe. Let me also consider: the jaywalkers on NORTH and EAST - will they be a problem for the W/S lanes I want to use later? PED:20:0 on NORTH (B_TO_A direction, st」→ CROSSWALK:WEST:CELL:0:1
- 自我修正标记（Wait/Actually/Let me recheck…）：共 1277 次，每次回复 平均 7.4，P50 6，P95 21，最大 24（n=173）
- 认知模式 letterCounting：18 处
  - 「(bus). But the bus is 3 slots behind, at CRUISE it would enter 3 ticks later. Should be fine. IN_W_R1_RIGHT: "PppKkkkEeePppTtt..Vvv.Ssss....Ppp......PppKkkkk....Ppp" - Position 0: P (V00022, but it's 1 char? That's a motorcycle M? No, it says P) Wait, "Ppp" is 3 chars. Let me recount. "Ppp" - that's P (head) + pp (body) = 3-slot passenger car Then "Kkkk" - K (head) + kkk (body) = 4-slot heavy truck Then」
  - 「ergencyAlerts with 5 ticks stalled). V00036 is at distance 4 with V00033 blocking it. So if I admit V00033, V00036 will be freed up. But wait, can I admit top 2 from W_R1? V00033 is a K (heavy truck, 5 chars in the matrix: "KkkkE" - wait, that's 5 chars but K is a heavy truck which is 5 cells long). The second vehicle is E (emergency). If I admit both, the emergency will follow the truck. But the emergen」
  - 「the heads in those lanes. Actually, let me look at the lane matrices more carefully: IN_E_S2_STRAIGHT: "TttVvvVvvBbbbBbbbPppHhhhhVvvEeeLll............VvvTtt" - Index 0 (closest to stopline): T (taxi, 3 chars) = V00111 - Then: Vvv (van, 4 chars total including head? No wait...) Actually, the matrix format is: each character is a cell. Uppercase = front of vehicle, lowercase = body. So: - Ttt = 3-cell taxi」
- 认知模式 idFormat：1 处
  - 「edestrian IDs reference "CROSSWALK:EAST" etc. So maybe the crosswalk_id for pedestrian_phases should be "CROSSWALK:EAST", "CROSSWALK:NORTH", "CROSSWALK:SOUTH", "CROSSWALK:WEST". Let me retry with the full crosswalk ID format. 6. **Stalled vehicles**: - V00063 on IN_W_S1_STRAIGHT (W_S1_STRAIGHT is severed!) - 18 vehicles behind it, tow truck arriving at tick 185 (9 ticks away) - V00122 on IN_W_R1_RIGHT (W_R1_RIGHT 」

### 2.2 复杂环境博弈

**行人与车辆**

- 行人相位尝试 23 次，成功 0 次 {"RESOURCE_CONFLICT":13,"DRY_RUN_QUOTA_EXHAUSTED":5,"LANE_HEAD_NOT_READY":1,"UNKNOWN_CROSSWALK:E":1,"UNKNOWN_CROSSWALK:N":1,"UNKNOWN_CROSSWALK:W":1,"UNKNOWN_ID":1}
- 实际放行 0 批 0 人；闯红灯 21 次 21 人；被撞 5 人；奖励 0，扣费 {"delay":1.12,"jaywalk":12.1,"strike":25}

行人相位冲突样例：

| 周期 | tick | 冲突偏移 at | 冲突 |
| --- | --- | --- | --- |
| 14 | 162 | 0 | CROSSWALK:WEST:CELL:0:0 vs V00061 |
| 17 | 172 | 0 | CROSSWALK:WEST:CELL:0:0 vs V00096 |
| 18 | 175 | 0 | CROSSWALK:EAST:CELL:7:0 vs V00196 |
| 18 | 175 | 0 | CROSSWALK:NORTH:CELL:0:0 vs V00101 |
| 21 | 181 | 8 | CROSSWALK:SOUTH:CELL:2:0 vs V00010 |
| 25 | 187 | 5 | PAIR:N_S2_STRAIGHT:8\|S_L1_LEFT:6 vs V00027,V00016 |
| 25 | 187 | 0 | CROSSWALK:WEST:CELL:0:1 |
| 26 | 192 | 0 | CROSSWALK:WEST:CELL:0:1 vs INCIDENT |
| 27 | 199 | 14 | CROSSWALK:SOUTH:CELL:3:0 vs V00098 |
| 33 | 210 | 0 | CROSSWALK:NORTH:CELL:7:0 vs PED:43:0:CROSSWALK:NORTH |

在行人耐心告急（PATIENCE_CRITICAL）时放行、且路线经过该横道的车辆：63 车次

| 周期 | tick | 车辆 | 路线 | 横道 | 行人 | 剩余耐心 | 该行人后来被撞 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 11 | 146 | V00090 | W_R1_RIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 24 | 是 |
| 11 | 146 | V00120 | E_R1_RIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 20 |  |
| 11 | 146 | V00121 | S_R1_RIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 20 |  |
| 12 | 153 | V00134 | E_R1_RIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 13 |  |
| 12 | 153 | V00134 | E_R1_RIGHT | CROSSWALK:EAST | PED:24:0:CROSSWALK:EAST | 24 | 是 |
| 12 | 153 | V00142 | E_R1_RIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 13 |  |
| 12 | 153 | V00142 | E_R1_RIGHT | CROSSWALK:EAST | PED:24:0:CROSSWALK:EAST | 24 | 是 |
| 12 | 153 | V00169 | S_R1_RIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 13 |  |
| 12 | 153 | V00169 | S_R1_RIGHT | CROSSWALK:EAST | PED:24:0:CROSSWALK:EAST | 24 | 是 |
| 13 | 158 | V00061 | N_R1_RIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 12 | 是 |
| 13 | 158 | V00196 | S_R1_RIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 8 |  |
| 13 | 158 | V00196 | S_R1_RIGHT | CROSSWALK:EAST | PED:24:0:CROSSWALK:EAST | 19 | 是 |
| 14 | 162 | V00115 | E_S1_STRAIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 4 |  |
| 14 | 162 | V00115 | E_S1_STRAIGHT | CROSSWALK:EAST | PED:24:0:CROSSWALK:EAST | 15 | 是 |
| 14 | 162 | V00115 | E_S1_STRAIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 8 | 是 |

行人时间线：

| tick | 事件 | 横道 | 人数 |
| --- | --- | --- | --- |
| 167 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 176 | PED_COLLISION | CROSSWALK:EAST | 1 |
| 177 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 184 | PED_COLLISION | CROSSWALK:WEST | 1 |
| 185 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 186 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 199 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 200 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 205 | PED_JAYWALK | CROSSWALK:SOUTH | 1 |
| 208 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 210 | PED_COLLISION | CROSSWALK:EAST | 1 |
| 211 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 211 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 218 | PED_COLLISION | CROSSWALK:SOUTH | 1 |
| 225 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 228 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 234 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 241 | PED_JAYWALK | CROSSWALK:SOUTH | 1 |
| 242 | PED_JAYWALK | CROSSWALK:SOUTH | 1 |
| 244 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 244 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 244 | PED_COLLISION | CROSSWALK:SOUTH | 1 |
| 249 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 249 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 257 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 260 | PED_JAYWALK | CROSSWALK:WEST | 1 |

**事故处置**

| 事故 | 类型 | 发生 | 车辆 | 行人 | 首次响应 | 清障令 | 清障调用次数 | 关闭 | 事故后才放行、后来卷入 | 非模型放行（抢行） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| INC0001 | SCRAPE | 176 | 2 | 0 | 176 | 176 | 1 | 181 |  | V00054 |
| INC0002 | ANGLE_COLLISION | 176 | 1 | 1 | 177 | 177 | 1 | 193 |  |  |
| INC0003 | ANGLE_COLLISION | 184 | 1 | 1 | 185 | 185 | 1 | 199 |  |  |
| INC0004 | ANGLE_COLLISION | 210 | 2 | 1 | 211 | 211 | 2 | 229 |  | V00074 |
| INC0005 | ANGLE_COLLISION | 218 | 1 | 1 | 219 | 219 | 1 | 233 |  |  |
| INC0006 | ANGLE_COLLISION | 244 | 1 | 1 |  |  | 0 |  |  |  |

事故成本估算：

| 事故 | 最终严重度 | 锁格（含二次） | 开放拍数 | 危化品 | 校车 | 分摊锁格费 | 估算总成本 | 放行来源 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| INC0001 | MINOR | 51 | 5 |  | 是 | 0.542 | 10.542 | V00051@c14 V00054@c- |
| INC0002 | SERIOUS | 24 | 17 |  |  | 1.735 | 6.735 | V00196@c13 |
| INC0003 | SERIOUS | 14 | 15 |  |  | 0.893 | 5.893 | V00107@c16 |
| INC0004 | SERIOUS | 26 | 19 |  |  | 2.101 | 7.101 | V00074@c- V00206@c30 |
| INC0005 | SERIOUS | 14 | 15 |  |  | 0.893 | 5.893 | V00098@c29 |
| INC0006 | SERIOUS | 35 | 17 |  |  | 2.53 | 7.53 | V00129@c42 |

**司机抢行**

总计 {"redLight":3,"tailgate":0,"cutIn":1}

| 周期 | 类型 | 车辆 | 此前出现在 driverAlerts 的周期数 | 最后一次预警 | 卷入事故 |
| --- | --- | --- | --- | --- | --- |
| 17 | VEHICLE_RED_LIGHT | V00054 | 0 |  | INC0001 |
| 27 | VEHICLE_RED_LIGHT | V00074 | 0 |  | INC0004 |
| 42 | VEHICLE_RED_LIGHT | V00027 | 9 | IN_S_L1_LEFT 距停止线 0 剩余 0 |  |

**紧急车辆与抛锚**

紧急车辆延误扣费 0.513

| 车辆 | 首次进入 12 格 | 放行 tick | 等待拍数 | 最长静止 |
| --- | --- | --- | --- | --- |
| V00034 | 69 | 238 | 169 | 80 |
| V00036 | 69 | 109 | 40 | 15 |
| V00050 | 79 |  |  | 74 |
| V00056 | 79 |  |  | 43 |
| V00043 | 89 |  |  | 15 |
| V00096 | 129 | 167 | 38 | 13 |
| V00101 | 139 | 172 | 33 | 12 |

拖车费 7.2，链式加价 0.047

| 车辆 | 车道 | 抛锚 | 派拖车 | 派车延迟 | 绕行 |
| --- | --- | --- | --- | --- | --- |
| V00006 | IN_N_R1_RIGHT | 64 | 69 | 5 |  |
| V00014 | IN_S_R1_RIGHT | 64 | 99 | 35 | 69 |
| V00029 | IN_W_S2_STRAIGHT | 82 | 99 | 17 |  |
| V00068 | IN_N_L1_LEFT | 132 | 139 | 7 |  |
| V00063 | IN_W_S1_STRAIGHT | 166 | 167 | 1 |  |
| V00122 | IN_W_R1_RIGHT | 170 | 175 | 5 |  |

### 2.3 亮眼操作与最差操作

周期价值 = 未卷入事故的放行车数 + 1.5×放行行人 + 2×成功的特情工具 − 归因事故成本。事故成本按锁格×开放时长分摊本局真实锁格扣费，再加撞人和校车罚款，平均分给放行了涉事车辆的周期。这是用于挑选证据的启发式，不是精确账目。

亮点事件：

| tick | 周期 | 类型 | 说明 |
| --- | --- | --- | --- |
| 61 | 1 | LARGE_VERIFIED_RELEASE | 6 vehicles, blame=0 |
| 69 | 2 | TOW_DISPATCH | V00006 |
| 69 | 2 | STALL_REROUTE | V00074 around V00014 |
| 99 | 5 | TOW_DISPATCH | V00029 |
| 99 | 5 | TOW_DISPATCH | V00014 |
| 139 | 9 | TOW_DISPATCH | V00068 |
| 139 | 9 | LARGE_VERIFIED_RELEASE | 8 vehicles, blame=0 |
| 146 | 11 | LARGE_VERIFIED_RELEASE | 7 vehicles, blame=0 |
| 167 | 16 | TOW_DISPATCH | V00063 |
| 171 | 16 | LANE_GUIDANCE | V00126 IN_S_S1_STRAIGHT->IN_S_R1_RIGHT |
| 175 | 18 | TOW_DISPATCH | V00122 |

#### 得分最高的周期

**周期 9（tick 139）**：放行 8，未出事 8，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -1.774，提交类型 verified，睡眠 10

- 观测要点：余额 987.6，停止线候选 15，受阻路线 2，行人预警 []，司机预警 [V00097:3, V00063:10]，紧急车 [V00034, V00050, V00096, V00101]，抛锚 [V00068]
- 工具序列：r1 dispatch_tow_truck -> ok；r1 dry_run_admit -> ok；r2 commit_schedule -> ok
- 战术摘要：8-lane broad wave CRUISE: E_S1 L(38w), E_S2 Bus40(39w), E_R1 Taxi, N_R1 HeavyTruck(55w), N_S1 Bus40(71w enter@150), W_R1 Van8(42w), W_S2 Sedan(59w), S_L1 LightTruck(71w enter@149). Skipped E_L1_LEFT(V00098) & W_L1_LEFT(V00031) & N_S2(head blocked by stalled V00068; tow dispatch completes 157). No ja
- 推理摘录：Let me analyze the current situation: **Balance**: 987.5981 **Tick**: 139/261, 122 ticks remaining **Key observations:** 1. **Active vehicles in junction**: - V00043 (W_S1_STRAIGHT, Crossing, Cruise) - V00046 (N_R1_RIGHT, Crossing, Cruise) - V00056 (N_L1_LEFT, Crossing, Cruise) - V00076 (E_S2_STRAIGHT, Crossing, SlowSlide) - V00084 (S_R1_RIGHT, Crossing, Cruise) 2. **Stopline candidates** (15 vehicles at stoplines): - V00098 (P, E_L1_LEFT, 32 ticks waiting) - V00113 (P, E_R1_RIGHT, 24 ticks) - V …… 0068). With 8 lanes and 3 emergency vehicles in the alert, I can skip them for now. I'm sleeping for 10 ticks to let the wave clear fully — the max enter is 150 with a clear around 181, and a 10-tick sleep (covering ticks 149-158) gets us through most of it. I can commit now with a tactical summary.

**周期 2（tick 69）**：放行 5，未出事 5，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -1.488，提交类型 verified，睡眠 10

- 观测要点：余额 999.89，停止线候选 8，受阻路线 3，行人预警 []，司机预警 []，紧急车 [V00034, V00036]，抛锚 [V00006, V00014]
- 工具序列：r1 dry_run_admit -> ok；r2 dispatch_tow_truck -> ok；r2 reroute_queue_around_stall -> ok；r3 commit_schedule -> ok
- 战术摘要：EW-axis burst: W_S1 top-2 + W_S2 top-2 + E_S1 top-1, 5 vehicles at CRUISE. Tow dispatched for stalled V00006 (N_R1), V00074 rerouted from S_R1 to S_S1. Sleeping 10 to let wave progress through junction.
- 推理摘录：Let me analyze the current situation: 1. **Current state**: Tick 69, balance 999.8923, 192 ticks remaining 2. **Stopline candidates**: 8 vehicles waiting at stoplines 3. **Emergency vehicles**: V00034 (IN_S_L1_LEFT, dist 6, blocked by V00019 and V00027), V00036 (IN_W_R1_RIGHT, dist 8, blocked by V00022 and V00033) 4. **Stalled vehicles**: V00006 (IN_N_R1_RIGHT, 10 cars behind, no viable detour), V00014 (IN_S_R1_RIGHT, 3 cars behind, can divert 1 to S_S1_STRAIGHT) 5. **Crosswalks**: E has vehicle …… S1_STRAIGHT (V00015) and N_S2_STRAIGHT (V00010)? They conflict with W_S1 and W_S2. So I can't send them in the same batch as the West vehicles. But wait - I already did the dry_run and it was OK. So I should just commit what I verified. Let me commit with sleep_ticks=10 to let the wave pass through.

**周期 5（tick 99）**：放行 5，未出事 5，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -3.251，提交类型 verified，睡眠 10

- 观测要点：余额 997.52，停止线候选 14，受阻路线 6，行人预警 []，司机预警 []，紧急车 [V00034, V00036, V00043, V00050, V00056]，抛锚 [V00014, V00029]
- 工具序列：r1 dispatch_tow_truck -> ok；r1 dispatch_tow_truck -> ok；r1 dry_run_admit -> ok；r2 commit_schedule -> ok
- 战术摘要：Multi-lane wave: E_R1(V00082,Taxi), N_R1(V00017,Taxi), E_S2(V00069,LightTruck), N_S1(V00015,Sedan), W_S1(V00030,Taxi) all CRUISE. Dispatched tow trucks for both stalled (V00029,15-behind; V00014,4-behind), both arrive tick 117. Sleeping 10 to let faster vehicles (taxis clear ~108-109) exit while tru
- 推理摘录：Let me analyze the current state: 1. **Current tick**: 99, end tick 261, 162 ticks remaining 2. **Balance**: 997.5157 3. **Active vehicles in junction**: V00023 (W_S1_STRAIGHT, crossing), V00033 (W_R1_RIGHT, crossing), V00042 (E_S1_STRAIGHT, crossing, SLOW_SLIDE) 4. **Stopline candidates** (14 vehicles): - V00079 (P, E_L1_LEFT, 17 ticks waiting) - V00082 (T, E_R1_RIGHT, 0 ticks) - V00048 (P, E_S1_STRAIGHT, 17 ticks) - V00069 (L, E_S2_STRAIGHT, 6 ticks) - V00056 (E, N_L1_LEFT, 13 ticks) - V00017  …… get us to tick 109 with most cleared but V00069 still in the junction. Let me sleep 10 to make good progress. Actually, I also dispatched tow trucks for both stalled vehicles. The V00029 tow is a 15-vehicle queue behind it - that's significant. The V00014 has 4 behind it. Let me commit the schedule.

**周期 11（tick 146）**：放行 7，未出事 7，放行行人 0，耐心风险放行 3，归因成本 0，周期余额变化 -0.552，提交类型 verified，睡眠 8

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:3:0:CROSSWALK:WEST remaining=24
- 观测要点：余额 988.79，停止线候选 13，受阻路线 8，行人预警 [E:P20, W:P24]，司机预警 [V00097:0, V00063:3, V00112:7]，紧急车 [V00034, V00050, V00096, V00101]，抛锚 [V00068]
- 工具序列：r1 dry_run_admit -> ok；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 战术摘要：7-vehicle wave across S/W/E axes: S_S1 (heavy truck + 2nd), S_S2 (hazmat + 2nd), W_R1 (school bus 40ppl), E_R1 (sedan), S_R1 (sedan). All CRUISE. In-traffic E/W vehicles from cycle 9 clearing. Waiting for reserved routes on E_L1@162, W_L1@162, N_S2@170. N_S2 head still blocked by stalled V00068 (tow
- 推理摘录：Let me analyze the current situation: 1. **Current tick**: 146, **End tick**: 261, **Ticks remaining**: 115 2. **Balance**: 988.7934 3. **Interrupt reason**: PEDESTRIAN_PATIENCE pedestrian=PED:3:0:CROSSWALK:WEST remaining=24 Let me look at the key issues: **Pedestrian alerts:** - PED:11:0:CROSSWALK:EAST, BA, P, 20 (patience remaining 20) - PED:3:0:CROSSWALK:WEST, AB, P, 24 (patience remaining 24) **Western crosswalk**: A side has [2,1,0,24,null] - 2 approaching, 1 waiting, min patience 24. B sid …… 6 (K, 3 ppl) + V00039 (C, enter at 154) - IN_S_S2_STRAIGHT: V00035 (H, 3 ppl) + V00049 (C, enter at 155) - IN_W_R1_RIGHT: V00090 (S, 40 ppl) - IN_E_R1_RIGHT: V00120 (P, 1 ppl) - IN_S_R1_RIGHT: V00121 (P, 1 ppl) This is a good wave. Let me commit with sleep_ticks=8 to let them clear the intersection.

**周期 1（tick 61）**：放行 6，未出事 6，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -0.108，提交类型 verified，睡眠 8

- 观测要点：余额 1000，停止线候选 7，受阻路线 0，行人预警 []，司机预警 []，紧急车 []，抛锚 []
- 工具序列：r1 dry_run_admit -> ok；r2 commit_schedule -> ok
- 战术摘要：Admitted 6 stopline heads across 6 different lane/route directions with no same-tick conflicts. Bus V00007 at SLOW_SLIDE for school safety. Sleeping 8 ticks to let them clear.
- 推理摘录：Let me analyze the current situation: **Tick 61, 200 ticks remaining, Balance: 1000** **Stopline Candidates (at the stop line, ready to go):** - V00008: P (passenger, 1 pax), route E_L1_LEFT, waiting 0 ticks - V00003: L (light truck, 1 pax), route E_R1_RIGHT, waiting 2 ticks - V00005: P (passenger, 1 pax), route N_L1_LEFT, waiting 1 tick - V00001: P (passenger, 1 pax), route N_R1_RIGHT, waiting 3 ticks - V00004: T (taxi, 2 pax), route S_R1_RIGHT, waiting 1 tick - V00007: S (school bus, 40 pax),  …… efault) Let me do a dry run to verify. Actually, let me reconsider. The school bus has 40 pax which is a huge amount of revenue. Even with SLOW_SLIDE, it's worth it. The revenue would be 40 * 0.1 = 4.0 for the bus alone. Let me do the dry run. The dry run succeeded. Let me commit with the same plan.

#### 损失最大的周期

**周期 14（tick 162）**：放行 2，未出事 1，放行行人 0，耐心风险放行 6，归因成本 10.54，周期余额变化 -0.853，提交类型 verified，睡眠 3

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:20:0:CROSSWALK:NORTH remaining=24
- 观测要点：余额 986.21，停止线候选 15，受阻路线 9，行人预警 [E:P4, N:P24, E:P15, W:P8]，司机预警 [V00063:0, V00095:0, V00112:0, V00097:0, V00165:0, V00025:3, V00080:3, V00089:5]，紧急车 [V00034, V00050, V00096, V00101]，抛锚 []
- 工具序列：r1 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:WEST:CELL:0:0 vs V00061)；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 后果：INC0001 SCRAPE tick=176 vehicles=2 pedestrians=0 estCost=10.542
- 战术摘要：E_S1 bus V00115 + W_S1 school bus V00051 CRUISE (both clear ~182). W-crosswalk AB held: V00061 still crossing cell 0,0 so W pedestrian phase conflict; re-try next cycle for PED:3 (patience 8). Watch: V00063 aggressive behind V00051 (tailgate risk), emergency V00034 still queued at IN_S_L1 (8 ticks s
- 推理摘录：Let me analyze the current situation: **Current Tick:** 162, **End Tick:** 261, **Ticks Remaining:** 99 **Balance:** 986.2129 **Interrupt Reason:** PEDESTRIAN_PATIENCE - PED:20:0:CROSSWALK:NORTH remaining=24 **Key observations:** 1. **Pedestrian alerts:** - PED:11:0:CROSSWALK:EAST BA patience 4 (CRITICAL!) - PED:20:0:CROSSWALK:NORTH AB patience 24 - PED:24:0:CROSSWALK:EAST BA patience 15 - PED:3:0:CROSSWALK:WEST AB patience 8 (CRITICAL!) 2. **Emergency alerts:** - V00034 IN_S_L1_LEFT, queue 2, d …… t's fine — I get 2 dry runs per cycle. So: commit the verified plan with sleep_ticks=3, tactical summary. Next cycle: dry-run a W crosswalk AB phase + whatever's available then. Hmm wait. Let me reconsider sleep=10 vs 3. Sleep 3 → 165. Then cycle at tick 165, 2 dry-run attempts. Good. Sleep 3 it is.

**周期 42（tick 233）**：放行 1，未出事 0，放行行人 0，耐心风险放行 4，归因成本 7.53，周期余额变化 -1.829，提交类型 unverified，睡眠 10

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:87:0:CROSSWALK:WEST remaining=24; VEHICLE_RED_LIGHT vehicle=V00027 route=S_L1_LEFT
- 观测要点：余额 931.46，停止线候选 15，受阻路线 5，行人预警 [N:J0, N:J0, E:J0, N:P1, N:J0, S:P8, W:P16, N:P11, S:P8, W:P24, N:P11, E:P16]，司机预警 [V00031:0, V00066:0, V00072:0, V00081:0, V00109:0, V00111:0, V00085:0, V00089:0]，紧急车 [V00034, V00050]，抛锚 []
- 工具序列：r1 dry_run_admit -> ok；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 后果：INC0006 ANGLE_COLLISION tick=244 vehicles=1 pedestrians=1 estCost=7.53
- 战术摘要：Only W_R1_RIGHT (V00129 heavy truck, 3 pax) is safe - no jaywalker crossings. EAST crosswalk blocked by PED:61, NORTH by 3 jaywalkers (PED:43/50/68). Sleeping 10 ticks: jaywalkers should clear by ~243 (NORTH B-side min patience 1 = near jaywalk, they advance 1 cell/4 ticks so 1-2 more ticks to exit)
- 推理摘录：Let me analyze the current situation: 1. **Current Tick**: 233, End Tick: 261, so 28 ticks remaining 2. **Balance**: 931.4638 3. **Interrupt Reason**: - PEDESTRIAN_PATIENCE: PED:87:0:CROSSWALK:WEST remaining=24 - VEHICLE_RED_LIGHT: V00027 route=S_L1_LEFT 4. **Key observations**: - V00027 is in the junction on S_L1_LEFT route (state X = CROSSING) - a red light runner - Emergency vehicles: V00034 (IN_S_L1_LEFT, queue 1, dist 3, 79 still ticks) and V00050 (IN_N_S1_STRAIGHT, dist 0, 47 still ticks)  …… g the jaywalker situation This should be safe. V00129 is a K (heavy truck, 3 passengers) making a right turn from west. Revenue: 3 * 0.1 = 0.3 per passenger? Wait no, "普通车辆每位乘员 0.1" so 3 * 0.1 = 0.3. Plus the vehicle is a K (heavy truck) with 3 cargo units, so revenue = 3 * 0.1 = 0.3. Let me commit.

**周期 30（tick 204）**：放行 1，未出事 0，放行行人 0，耐心风险放行 3，归因成本 7.1，周期余额变化 -1.253，提交类型 unverified，睡眠 10

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:68:0:CROSSWALK:NORTH remaining=24
- 观测要点：余额 948.2，停止线候选 15，受阻路线 3，行人预警 [N:J0, S:P1, N:P4, W:J0, E:P7, W:J0, N:P7, E:P21, N:P24]，司机预警 [V00109:0, V00111:0, V00085:0, V00089:0, V00087:0, V00040:0, V00095:0, V00062:0]，紧急车 [V00034, V00050]，抛锚 []
- 工具序列：r1 dry_run_admit -> ok；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 后果：INC0004 ANGLE_COLLISION tick=210 vehicles=2 pedestrians=1 estCost=7.101
- 战术摘要：Only V00206 (S_R1_RIGHT heavy truck) is safe - no jaywalker warnings. N crosswalk jaywalker ~16 ticks to clear, W crosswalk jaywalkers ~12 ticks. Sleeping 10 to let them advance. V00109 and V00111 have patience=0 (aggressive) but blocked by jaywalkers - risky to admit.
- 推理摘录：Let me analyze the current situation: 1. **Current state**: Tick 204, 57 ticks remaining, balance 948.201 2. **Interrupt**: PEDESTRIAN_PATIENCE - PED:68:0:CROSSWALK:NORTH with remaining patience 24 3. **Jaywalkers still active**: - PED:20:0:CROSSWALK:NORTH - AB, J (jaywalking), patience 0 - PED:44:0:CROSSWALK:WEST - BA, J (jaywalking), patience 0 - PED:45:1:CROSSWALK:WEST - AB, J (jaywalking), patience 0 4. **Crosswalk status**: - N: A side [5,2,0,7,220] - 2 waiting, min patience 7; cells show " …… et me just commit with the default CRUISE since that's what I verified. Actually, I realize I should just commit V00206 as-is (CRUISE) since that's what was verified in the dry_run. The engine will handle the speed capping internally. Let me commit with sleep_ticks=10 to let the jaywalkers progress.

**周期 13（tick 158）**：放行 2，未出事 1，放行行人 0，耐心风险放行 3，归因成本 6.74，周期余额变化 -0.734，提交类型 verified，睡眠 10

- 观测要点：余额 986.95，停止线候选 13，受阻路线 11，行人预警 [E:P8, E:P19, W:P12]，司机预警 [V00063:0, V00112:0, V00097:0, V00095:2, V00165:4, V00080:5, V00089:6, V00126:6]，紧急车 [V00034, V00050, V00096, V00101]，抛锚 []
- 工具序列：r1 dry_run_admit -> ok；r2 commit_schedule -> ok
- 后果：INC0002 ANGLE_COLLISION tick=176 vehicles=1 pedestrians=1 estCost=6.735
- 战术摘要：N_R1 (sedan 1ppl) + S_R1 (heavy truck 3ppl) both CRUISE. N_R1 unblocks V00096/V00101 emergency vehicles behind. S_R1 truck clears ~184. Sleeping 10 to free W_L1@162, W_S1@165, E_S2@166, W_R1@167, E_S1@167, W_S2@168 for next cycle. N crosswalk clear but V00053 (N_R1) still crossing, defer pedestrian 
- 推理摘录：Let me analyze the current situation: 1. **Current state**: Tick 158, 103 ticks remaining, balance 986.9471 2. **Active vehicles in junction**: 12 vehicles crossing (various directions) 3. **Reserved routes**: Multiple routes still reserved until ticks 162-180 4. **Emergency vehicles**: - V00034 on IN_S_L1_LEFT (queue index 2, distance 3, stationary 4 ticks, blocked by V00027) - V00050 on IN_N_S1_STRAIGHT (queue index 2, distance 5, stationary 2 ticks, blocked by V00032) - V00096 on IN_N_R1_RIGH …… 0, not urgent. And there's a vehicle (V00053) from N_R1_RIGHT currently in the crossing area. Let me just skip pedestrians this cycle. Final plan: - commit_schedule with: - admit_vehicle_ids: ["V00061", "V00196"] - sleep_ticks: 10 - tactical_summary: describing what's happening Let me finalize this.

**周期 16（tick 167）**：放行 4，未出事 3，放行行人 0，耐心风险放行 7，归因成本 5.89，周期余额变化 -1.992，提交类型 verified，睡眠 5

- 唤醒原因：PEDESTRIAN_JAYWALK pedestrian=PED:11:0:CROSSWALK:EAST
- 观测要点：余额 984.24，停止线候选 15，受阻路线 10，行人预警 [E:J0, N:P19, E:P10, W:P3]，司机预警 [V00095:0, V00025:0, V00089:0, V00080:0, V00112:0, V00097:0, V00165:0, V00178:2]，紧急车 [V00034, V00050, V00096, V00101]，抛锚 [V00063]
- 工具序列：r1 dispatch_tow_truck -> ok；r1 dry_run_admit -> ok；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 后果：INC0003 ANGLE_COLLISION tick=184 vehicles=1 pedestrians=1 estCost=5.893
- 战术摘要：N_R1 top3 (V00096,V00101,V00107 tailgate included) + W_R1 V00103 CRUISE. V00072 (W_S2) dropped due to jaywalker PED:11 on E-crosswalk — will re-admit next cycle. Tow dispatched for V00063 in W_S1 (completes tick 185). E-crosswalk B-side jaywalk active, no E-phase this cycle.
- 推理摘录：Let me analyze the current situation: 1. **Interrupt**: PEDESTRIAN_JAYWALK - PED:11:0:CROSSWALK:EAST is jaywalking (BA direction, patience 0) 2. **Financial state**: 984.24 balance, 94 ticks remaining until tick 261 3. **Key observations**: - Many vehicles at stoplines waiting - Several reservations expiring soon (174-183) - Emergency vehicles: V00034 (S_L1, dist 3, 13 ticks stopped), V00050 (N_S1, dist 5, 11 ticks), V00096 (N_R1, dist 0, 5 ticks), V00101 (N_R1, dist 3, 4 ticks) - Stalled vehicl …… he crosswalk, so it'll need to be re-admitted on the next cycle once that clears. For now I'm moving forward with N_R1's top 3 lanes plus W_R1, and the tailgater V00107 is included in the batch. For the sleep duration, I'm going to keep it short at 5 seconds to avoid accumulating upstream penalties.

### 附：逐周期一览

| 周期 | tick | 提交 | 放行 | 行人 | 耐心风险 | 归因事故 | 归因成本 | 余额变化 | 睡眠 | 唤醒原因 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 61 | verified | 6 | 0 | 0 |  | 0 | -0.108 | 8 |  |
| 2 | 69 | verified | 5 | 0 | 0 |  | 0 | -1.488 | 10 |  |
| 3 | 79 | verified | 4 | 0 | 0 |  | 0 | -0.347 | 10 |  |
| 4 | 89 | verified | 3 | 0 | 0 |  | 0 | -0.541 | 10 |  |
| 5 | 99 | verified | 5 | 0 | 0 |  | 0 | -3.251 | 10 |  |
| 6 | 109 | verified | 5 | 0 | 0 |  | 0 | -1.943 | 10 |  |
| 7 | 119 | verified | 4 | 0 | 0 |  | 0 | -2.204 | 10 |  |
| 8 | 129 | verified | 6 | 0 | 0 |  | 0 | -2.519 | 10 |  |
| 9 | 139 | verified | 8 | 0 | 0 |  | 0 | -1.774 | 10 |  |
| 10 | 142 | hold | 0 | 0 | 0 |  | 0 | 2.97 | 4 | PEDESTRIAN_PATIENCE pedestrian=PED:11:0:CROSSWALK:EAST remai |
| 11 | 146 | verified | 7 | 0 | 3 |  | 0 | -0.552 | 8 | PEDESTRIAN_PATIENCE pedestrian=PED:3:0:CROSSWALK:WEST remain |
| 12 | 153 | verified | 3 | 0 | 6 |  | 0 | -1.294 | 5 | PEDESTRIAN_PATIENCE pedestrian=PED:24:0:CROSSWALK:EAST remai |
| 13 | 158 | verified | 2 | 0 | 3 | INC0002 | 6.74 | -0.734 | 10 |  |
| 14 | 162 | verified | 2 | 0 | 6 | INC0001 | 10.54 | -0.853 | 3 | PEDESTRIAN_PATIENCE pedestrian=PED:20:0:CROSSWALK:NORTH rema |
| 15 | 165 | hold | 0 | 0 | 0 |  | 0 | -1.124 | 10 |  |
| 16 | 167 | verified | 4 | 0 | 7 | INC0003 | 5.89 | -1.992 | 5 | PEDESTRIAN_JAYWALK pedestrian=PED:11:0:CROSSWALK:EAST |
| 17 | 172 | hold | 0 | 0 | 0 |  | 0 | -1.038 | 3 | VEHICLE_RED_LIGHT vehicle=V00054 route=S_S2_STRAIGHT |
| 18 | 175 | hold | 0 | 0 | 0 |  | 0 | -1.725 | 5 | PEDESTRIAN_PATIENCE pedestrian=PED:44:0:CROSSWALK:WEST remai |
| 19 | 176 | hold | 0 | 0 | 0 |  | 0 | -15.941 | 5 | PEDESTRIAN_PATIENCE pedestrian=PED:45:1:CROSSWALK:WEST remai |
| 20 | 177 | verified | 4 | 0 | 4 |  | 0 | -1.002 | 8 | PEDESTRIAN_JAYWALK pedestrian=PED:24:0:CROSSWALK:EAST; ACCID |
| 21 | 181 | hold | 0 | 0 | 0 |  | 0 | -1.534 | 5 | PEDESTRIAN_PATIENCE pedestrian=PED:38:0:CROSSWALK:SOUTH rema |
| 22 | 184 | fallback | 0 | 0 | 0 |  | 0 | -6.151 | 1 | PEDESTRIAN_PATIENCE pedestrian=PED:43:0:CROSSWALK:NORTH rema |
| 23 | 185 | verified | 2 | 0 | 6 |  | 0 | 2.805 | 4 | PEDESTRIAN_JAYWALK pedestrian=PED:3:0:CROSSWALK:WEST; ACCIDE |
| 24 | 186 | hold | 0 | 0 | 0 |  | 0 | -0.601 | 4 | PEDESTRIAN_JAYWALK pedestrian=PED:20:0:CROSSWALK:NORTH |
| 25 | 187 | unverified | 0 | 0 | 0 |  | 0 | -2.44 | 5 | PEDESTRIAN_PATIENCE pedestrian=PED:45:0:CROSSWALK:EAST remai |
| 26 | 192 | hold | 0 | 0 | 0 |  | 0 | -3.793 | 10 |  |
| 27 | 199 | hold | 0 | 0 | 0 |  | 0 | -0.407 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:44:0:CROSSWALK:WEST; VEHIC |
| 28 | 200 | hold | 0 | 0 | 0 |  | 0 | -0.559 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:45:1:CROSSWALK:WEST |
| 29 | 201 | unverified | 1 | 0 | 3 | INC0005 | 5.89 | -1.656 | 5 | PEDESTRIAN_PATIENCE pedestrian=PED:61:0:CROSSWALK:EAST remai |
| 30 | 204 | unverified | 1 | 0 | 3 | INC0004 | 7.1 | -1.253 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:68:0:CROSSWALK:NORTH rema |
| 31 | 205 | hold | 0 | 0 | 0 |  | 0 | 3.591 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:38:0:CROSSWALK:SOUTH |
| 32 | 208 | hold | 0 | 0 | 0 |  | 0 | -0.44 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:43:0:CROSSWALK:NORTH |
| 33 | 210 | hold | 0 | 0 | 0 |  | 0 | -6.98 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:62:0:CROSSWALK:NORTH rema |
| 34 | 211 | hold | 0 | 0 | 0 |  | 0 | 1.641 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:45:0:CROSSWALK:EAST; PEDES |
| 35 | 214 | hold | 0 | 0 | 0 |  | 0 | -2.531 | 10 | ACCIDENT_INTERRUPT incident=INC0004 secondary=true |
| 36 | 217 | hold | 0 | 0 | 0 |  | 0 | -6.987 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:80:0:CROSSWALK:SOUTH rema |
| 37 | 219 | hold | 0 | 0 | 0 |  | 0 | 3.04 | 10 | ACCIDENT_INTERRUPT incident=INC0005 locked=CROSSWALK:SOUTH:C |
| 38 | 220 | hold | 0 | 0 | 0 |  | 0 | -6.237 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:82:0:CROSSWALK:NORTH rema |
| 39 | 225 | hold | 0 | 0 | 0 |  | 0 | -3.502 | 4 | PEDESTRIAN_PATIENCE pedestrian=PED:81:0:CROSSWALK:WEST remai |
| 40 | 228 | hold | 0 | 0 | 0 |  | 0 | 3.123 | 1 | PEDESTRIAN_JAYWALK pedestrian=PED:68:0:CROSSWALK:NORTH |
| 41 | 229 | hold | 0 | 0 | 0 |  | 0 | -0.201 | 4 |  |
| 42 | 233 | unverified | 1 | 0 | 4 | INC0006 | 7.53 | -1.829 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:87:0:CROSSWALK:WEST remai |
| 43 | 234 | hold | 0 | 0 | 0 |  | 0 | -1.219 | 1 | PEDESTRIAN_JAYWALK pedestrian=PED:62:0:CROSSWALK:NORTH |
| 44 | 235 | hold | 0 | 0 | 0 |  | 0 | -1.22 | 1 |  |
| 45 | 236 | hold | 0 | 0 | 0 |  | 0 | -0.326 | 1 | PEDESTRIAN_PATIENCE pedestrian=PED:106:0:CROSSWALK:WEST rema |
| 46 | 237 | hold | 0 | 0 | 0 |  | 0 | -1.202 | 8 |  |
| 47 | 238 | verified | 3 | 0 | 18 |  | 0 | -1.303 | 9 | PEDESTRIAN_PATIENCE pedestrian=PED:95:0:CROSSWALK:SOUTH rema |
| 48 | 239 | hold | 0 | 0 | 0 |  | 0 | -3.169 | 4 | PEDESTRIAN_PATIENCE pedestrian=PED:91:0:CROSSWALK:EAST remai |
| 49 | 241 | hold | 0 | 0 | 0 |  | 0 | -1.802 | 5 | PEDESTRIAN_JAYWALK pedestrian=PED:86:0:CROSSWALK:SOUTH |
| 50 | 242 | hold | 0 | 0 | 0 |  | 0 | 0.747 | 5 | PEDESTRIAN_PATIENCE pedestrian=PED:113:0:CROSSWALK:WEST rema |
| 51 | 244 | hold | 0 | 0 | 0 |  | 0 | -6.541 | 8 | PEDESTRIAN_PATIENCE pedestrian=PED:98:0:CROSSWALK:NORTH rema |
| 52 | 245 | hold | 0 | 0 | 0 |  | 0 | -3.19 | 8 | ACCIDENT_INTERRUPT incident=INC0006 locked=CROSSWALK:SOUTH:C |
| 53 | 247 | hold | 0 | 0 | 0 |  | 0 | -4.397 | 4 | PEDESTRIAN_PATIENCE pedestrian=PED:115:0:CROSSWALK:EAST rema |
| 54 | 249 | hold | 0 | 0 | 0 |  | 0 | -5.089 | 4 | PEDESTRIAN_JAYWALK pedestrian=PED:81:0:CROSSWALK:WEST; PEDES |
| 55 | 252 | hold | 0 | 0 | 0 |  | 0 | -8.113 | 5 | PEDESTRIAN_PATIENCE pedestrian=PED:119:0:CROSSWALK:WEST rema |
| 56 | 257 | hold | 0 | 0 | 0 |  | 0 | -3.181 | 4 | PEDESTRIAN_JAYWALK pedestrian=PED:87:0:CROSSWALK:WEST |
| 57 | 259 | hold | 0 | 0 | 0 |  | 0 | -2.436 | 2 | PEDESTRIAN_PATIENCE pedestrian=PED:111:0:CROSSWALK:NORTH rem |
| 58 | 260 | hold | 0 | 0 | 0 |  | 0 | 2.157 | 1 | PEDESTRIAN_JAYWALK pedestrian=PED:106:0:CROSSWALK:WEST |

