# 运行分析：deepseek-flash_2026-10-01_114857242-96632

- 模型：deepseek-flash；种子 63916；规则版本 16；回放 schema 7
- 截止 tick 261，决策周期 52，最终余额 **572.62**
- 生成时间 2026-10-01T21:35:07.785Z；数据文件：replay_deepseek-flash_2026-10-01_114857242-96632.json、report_deepseek-flash_2026-10-01_114857242-96632.json、api-log_deepseek-flash_2026-10-01_114857242-96632.jsonl、raw-api-log_deepseek-flash_2026-10-01_114857242-96632.jsonl

## 1. 基础分析

### 1.1 上下文能力

- prompt tokens：平均 20981.8，P50 20594，P95 33763，最大 35480（n=175）
- completion tokens：平均 3937.9，P50 2823，P95 9876，最大 17446（n=175）；其中推理 tokens：平均 3740.3，P50 2593，P95 9612，最大 16881（n=175）
- 每周期 API 轮数：平均 3.4，P50 3，P95 5，最大 6（n=52）；上限 8，用满上限的周期 0 个
- 每次请求的平均字符数：系统提示 7722，user 15762.6，工具结果 5531.6，assistant 814.9；消息条数 平均 6.2，P50 6，P95 13，最大 17（n=175）
- 工具参数中的 ID 共 479 个：出现在当轮可见上下文里的占 1，当轮不可见但本局别处出现过 0 个，本局从未出现 0 个，非规范横道短键 0 个

| ID 类型 | 总数 | 当轮可见 | 别处出现 | 从未出现 | 非规范短键 |
| --- | --- | --- | --- | --- | --- |
| lane | 248 | 248 | 0 | 0 | 0 |
| vehicle | 34 | 34 | 0 | 0 | 0 |
| incident | 70 | 70 | 0 | 0 | 0 |
| crosswalk | 127 | 127 | 0 | 0 | 0 |

- 同一周期内重复提交已失败的相同调用：0 次 {}
- 提交类型：verified 17，unverified 2，hold 33；放行类提交中 verified 占 0.895
- working memory：调用 6 次 {"PEEK_PLAN":3,"SAVE_PLAN":3}，观测里带有计划的周期 40 个

### 1.2 注意力分布

关注率 = 字段出现在该周期观测里、且推理文本提到它的周期数 / 字段出现的周期数。

| 概念 | 出现周期 | 提到且出现 | 关注率 | 提到周期（含未出现） | 提及次数 |
| --- | --- | --- | --- | --- | --- |
| pedestrianAlerts | 39 | 39 | 1 | 51 | 5010 |
| dischargingLanes | 24 | 24 | 1 | 37 | 382 |
| crosswalks | 52 | 51 | 0.981 | 51 | 4411 |
| candidateConflicts | 52 | 50 | 0.962 | 50 | 996 |
| emergency | 52 | 50 | 0.962 | 50 | 661 |
| stoplineCandidates | 52 | 48 | 0.923 | 48 | 386 |
| timeBudget | 52 | 48 | 0.923 | 48 | 147 |
| stalledVehicles | 19 | 17 | 0.895 | 34 | 425 |
| recentCycles | 51 | 44 | 0.863 | 44 | 196 |
| revokedAdmissions | 14 | 12 | 0.857 | 22 | 73 |
| driverAlerts | 45 | 34 | 0.756 | 41 | 389 |
| lastSettlement | 51 | 38 | 0.745 | 38 | 122 |
| holds | 39 | 28 | 0.718 | 29 | 111 |
| activeVehicleMotions | 49 | 25 | 0.51 | 26 | 56 |
| laneGuidance | 52 | 26 | 0.5 | 26 | 72 |
| workingMemory | 40 | 8 | 0.2 | 12 | 22 |
| laneMatrices | 0 | 0 |  | 52 | 955 |
| exits | 0 | 0 |  | 50 | 1276 |
| reservedUntil | 0 | 0 |  | 52 | 952 |
| incidentBlocked | 0 | 0 |  | 34 | 490 |

中断响应：

| 中断类型 | 次数 | 有响应 | 响应率 | 判定规则 |
| --- | --- | --- | --- | --- |
| VEHICLE_RED_LIGHT | 3 | 3 | 1 | 推理文本提到了中断对象 ID |
| ACCIDENT_INTERRUPT | 12 | 12 | 1 | 同周期调用 inspect_incident / order_accident_clearance / set_lane_detour |
| PEDESTRIAN_PATIENCE | 24 | 15 | 0.625 | 同周期任一试算或提交带 pedestrian_phases |
| PEDESTRIAN_JAYWALK | 14 | 5 | 0.357 | 推理文本提到了中断对象 ID |

- 每次回复的推理字符数：平均 13660.3，P50 9289，P95 35818，最大 64662（n=175）

### 1.3 tool_call 准确性

- 工具调用 285 次，成功 232 次，成功率 0.814
- 失败分类：{"RESOURCE_CONFLICT":24,"LANE_HEAD_NOT_READY":16,"DRY_RUN_QUOTA_EXHAUSTED":10,"PLANNING_HORIZON_EXCEEDED":2,"SCHEMA_ERROR":1}
- 每次回复的工具调用数分布：{"1":113,"2":33,"3":14,"4":12,"5":2,"6":1}；finish_reason：{"tool_calls":175}
- API 错误 0 次 {}；回退周期 []
- 从未使用的工具：set_lane_detour、dispatch_emergency_convoy、reroute_queue_around_stall、guide_inbound_lane_change

| 工具 | 调用 | 成功 | 成功率 | 结果分类 |
| --- | --- | --- | --- | --- |
| dry_run_admit | 85 | 34 | 0.4 | {"OK":34,"PLANNING_HORIZON_EXCEEDED":2,"LANE_HEAD_NOT_READY":16,"DRY_RUN_QUOTA_EXHAUSTED":10,"RESOURCE_CONFLICT":23} |
| commit_schedule | 52 | 51 | 0.981 | {"OK":51,"RESOURCE_CONFLICT":1} |
| dispatch_tow_truck | 5 | 5 | 1 | {"OK":5} |
| inspect_lane_queue | 18 | 18 | 1 | {"OK":18} |
| inspect_incident | 42 | 42 | 1 | {"OK":42} |
| manage_working_memory | 6 | 5 | 0.833 | {"OK":5,"SCHEMA_ERROR":1} |
| order_accident_clearance | 28 | 28 | 1 | {"OK":28} |
| inspect_crosswalk | 49 | 49 | 1 | {"OK":49} |

错误样例：

- **PLANNING_HORIZON_EXCEEDED**
  - c2 t71 dry_run_admit：Admission planning horizon exceeded for V00038；参数 `{"lane_batches":[{"lane_id":"IN_W_S1_STRAIGHT","top_n":8},{"lane_id":"IN_W_S2_STRAIGHT","top_n":5},{"lane_id":"IN_E_S1_STRAIGHT","top_n":2},{"lane_id":"IN_N_S1_STRAIGHT","top_n":3},{"lane_id":"IN_N_S2_STRAIGHT","top_n":8`
  - c36 t215 dry_run_admit：Admission planning horizon exceeded for V00235；参数 `{"lane_batches":[{"lane_id":"IN_S_R1_RIGHT","top_n":6}]}`
- **LANE_HEAD_NOT_READY**
  - c6 t111 dry_run_admit：Lane head is not ready: IN_S_R1_RIGHT；参数 `{"lane_batches":[{"lane_id":"IN_S_L1_LEFT","top_n":4},{"lane_id":"IN_S_R1_RIGHT","top_n":3},{"lane_id":"IN_E_S1_STRAIGHT","top_n":2},{"lane_id":"IN_E_R1_RIGHT","top_n":2},{"lane_id":"IN_W_S2_STRAIGHT","top_n":2},{"lane_i`
  - c6 t111 dry_run_admit：Lane head is not ready: IN_E_S1_STRAIGHT；参数 `{"lane_batches":[{"lane_id":"IN_S_L1_LEFT","top_n":4},{"lane_id":"IN_E_S1_STRAIGHT","top_n":2},{"lane_id":"IN_E_R1_RIGHT","top_n":2},{"lane_id":"IN_W_S2_STRAIGHT","top_n":2},{"lane_id":"IN_W_R1_RIGHT","top_n":2}]}`
  - c7 t116 dry_run_admit：Lane head is not ready: IN_E_S2_STRAIGHT；参数 `{"lane_batches":[{"lane_id":"IN_E_S1_STRAIGHT","top_n":2},{"lane_id":"IN_E_S2_STRAIGHT","top_n":2},{"lane_id":"IN_E_R1_RIGHT","top_n":2},{"lane_id":"IN_S_L1_LEFT","top_n":2},{"lane_id":"IN_W_R1_RIGHT","top_n":2}]}`
- **DRY_RUN_QUOTA_EXHAUSTED**
  - c6 t111 dry_run_admit：-；参数 `{"lane_batches":[{"lane_id":"IN_S_L1_LEFT","top_n":4},{"lane_id":"IN_E_R1_RIGHT","top_n":2}]}`
  - c25 t184 dry_run_admit：-；参数 `{"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:SOUTH","directions":["A_TO_B"]},{"crosswalk_id":"CROSSWALK:WEST","directions":["A_TO_B","B_TO_A"]}]}`
  - c26 t187 dry_run_admit：-；参数 `{"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:NORTH","directions":["A_TO_B","B_TO_A"]},{"crosswalk_id":"CROSSWALK:WEST","directions":["A_TO_B","B_TO_A"]}]}`
- **RESOURCE_CONFLICT**
  - c16 t146 dry_run_admit：CROSSWALK:EAST:CELL:2:0 vs INCIDENT；参数 `{"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:WEST","directions":["A_TO_B"]},{"crosswalk_id":"CROSSWALK:NORTH","directions":["A_TO_B"]},{"crosswalk_id":"CROSSWALK:EAST","directions":["B_TO_A"]}]}`
  - c17 t153 dry_run_admit：CROSSWALK:EAST:CELL:2:0 vs INCIDENT；参数 `{"lane_batches":[{"lane_id":"IN_E_R1_RIGHT","top_n":3},{"lane_id":"IN_S_R1_RIGHT","top_n":3}],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:EAST","directions":["B_TO_A"]}]}`
  - c21 t175 dry_run_admit：CROSSWALK:EAST:CELL:2:1 vs INCIDENT；参数 `{"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:EAST","directions":["A_TO_B","B_TO_A"]},{"crosswalk_id":"CROSSWALK:WEST","directions":["A_TO_B","B_TO_A"]}]}`
- **SCHEMA_ERROR**
  - c28 t199 manage_working_memory：[ { "code": "too_big", "maximum": 160, "type": "string", "inclusive": true, "exact": false, "message": "String must contain at most 160 character(s)", "path": [；参数 `{"action":"SAVE_PLAN","plan_data":{"phase_name":"NS_STRAIGHT_WHILE_EW_JAYWALK","intended_duration":40,"resume_condition":"WEST jaywalker clears (~tick 231); meanwhile run only N/S straight lanes (IN_N_S1/S2, IN_S_S1/S2) `

### 1.4 Agent 能力

- 周期内工具序列（D=试算，C=提交，T=其他工具）：{"DDC":6,"TTTTTTDDC":5,"TTTC":4,"TTTTDDC":4,"DC":3,"TTTDC":2,"TTTTTDDC":2,"TTTTTC":2,"TTTTDDDC":2,"DDDC":2,"TC":1,"DDTTTTDC":1,"DTTTC":1,"TTTTC":1,"TTTDDC":1,"TTDC":1,"TTTTTTTDDDC":1,"DDDTC":1,"DTTTTDDC":1,"DTTDC":1,"DTDC":1,"DDDDC":1,"TTTTDTC":1,"TTDDC":1,"TTTTDTTC":1,"DTC":1,"TDDTC":1,"TTDTDC":1,"TTTTTDC":1,"C":1}
- 含提交的周期里先试算再提交的比例：0.827
- 提交构成：{"verified":17,"unverified":2,"hold":33,"reckless":0}；每周期放行车数 平均 1.8，P50 0，P95 12，最大 15（n=52）；共放行 96 辆
- 成功提交 51 次，其中使用 lane_batches 13 次；每次 top_n 合计 平均 1.8，P50 0，P95 12，最大 15（n=51）
- 速度档位：{"CRUISE":33}；sleep_ticks：平均 8，P50 10，P95 10，最大 10（n=52） {"1":2,"2":2,"4":7,"5":4,"6":1,"8":1,"10":35}
- 工具使用：{"dry_run_admit":85,"commit_schedule":52,"inspect_crosswalk":49,"inspect_incident":42,"order_accident_clearance":28,"inspect_lane_queue":18,"manage_working_memory":6,"dispatch_tow_truck":5}
- 决策开销：API 175 次，扣 3.5；非终结工具 233 次，扣 0.3495

与同条件 baseline 对比：

| 策略 | 最终余额 | 放行车辆 | 未服务负债 | 事故数 | 锁格扣费 | 上游积压 | 撞人 | 闯红灯罚 | 行人奖励 | 校车 | 拖车 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| deepseek-flash | 572.62 | 96 | 197.7 | 5 | 126.7 | 80.55 | 20 | 7.4 | 0 | 0 | 6 |
| baseline-balanced | 674.49 | 84 | 219.6 | 6 | 21.3 | 58.85 | 25 | 5.5 | 0 | 0 | 8.4 |
| baseline-balanced-bus | 659.61 | 87 | 208.1 | 4 | 90.26 | 53.27 | 5 | 4.9 | 0 | 0 | 6 |
| baseline-balanced-no-ped | 717.59 | 132 | 187.4 | 4 | 74.39 | 47.7 | 0 | 0 | 0 | 10 | 10.8 |
| baseline-longest-queue | 633.99 | 183 | 195.7 | 10 | 76.09 | 44.92 | 50 | 11.6 | 0 | 10 | 10.8 |
| baseline-random | 539.49 | 114 | 207.6 | 7 | 139.2 | 73.82 | 35 | 11 | 0 | 0 | 7.2 |
| baseline-search | 788.38 | 122 | 185.4 | 2 | 3.69 | 45.85 | 10 | 6.7 | 0 | 0 | 8.4 |

## 2. 进阶分析

### 2.1 逻辑推理

- 试算失败（不含额度用完）41 次；之后再试 20 次，其中改了参数 20 次，成功 9 次（0.45）；失败所在周期最终 verified 提交 8 次、hold 30 次
- 推理中"路线 X 经过/不经过 Y 横道"的断言 204 条，正确 170，错误 34，准确率 0.833；前半局 5/52 错，后半局 29/152 错
  - c17：「E_R1_RIGHT does not cross the east」（实际经过 CROSSWALK:EAST+CROSSWALK:NORTH）
  - c23：「W_R1_RIGHT route from west might cross the east」（实际经过 CROSSWALK:WEST+CROSSWALK:SOUTH）
  - c23：「W_R1_RIGHT's route cross the EAST」（实际经过 CROSSWALK:WEST+CROSSWALK:SOUTH）
  - c23：「W_R1_RIGHT cross EAST」（实际经过 CROSSWALK:WEST+CROSSWALK:SOUTH）
  - c23：「W_R1_RIGHT crossing EAST」（实际经过 CROSSWALK:WEST+CROSSWALK:SOUTH）
  - c29：「N_L1_LEFT - left turn, crosses WEST」（实际经过 CROSSWALK:NORTH+CROSSWALK:EAST）
  - c29：「N_L1_LEFT) — left turn, crosses WEST」（实际经过 CROSSWALK:NORTH+CROSSWALK:EAST）
  - c29：「N_R1_RIGHT) goes east, crossing EAST」（实际经过 CROSSWALK:NORTH+CROSSWALK:WEST）
- 推理写"安全/无冲突"但同一轮试算冲突：17 次
  - c16 r2 t146：「phased? The atomic plan validates both. If V00148 crosses CROSSWALK:EAST and we phase EAST, conflict. If we phase only WEST and NORTH, and V00148 crosses EAST, no conflict. But do we know which crosswalk V00148 crosses? Let's just try and see if dry_run reports conflict. Hmm, but actually, thinking about geometry more concretely:」→ CROSSWALK:EAST:CELL:2:0 vs INCIDENT
  - c17 r2 t153：「nd 1: order clearance; dry_run_admit lane_batches for the open right-turn lanes (E_R1_RIGHT top 3, S_R1_RIGHT top 3) plus pedestrian_phases for crosswalks that are safe (NORTH, SOUTH, WEST) but NOT EAST (incident-locked). Then commit with a sleep. But wait, right-turn vehicles crossing crosswalks where we phase pedestrians = c」→ CROSSWALK:EAST:CELL:2:0 vs INCIDENT
  - c21 r3 t175：「uld: - Admit E_R1_RIGHT (V00194) and W_R1_RIGHT (V00129 after t177). Small but free. - Release pedestrian phases to prevent jaywalk and gain reward, but ensure no conflicts. - Sleep efficiently. Actually, could releasing pedestrians cause problems later? Peds crossing the intersection... they clear in a few ticks. Big concern: PED」→ CROSSWALK:EAST:CELL:2:1 vs INCIDENT
  - c22 r2 t176：「k? Possibly but engine handles. Also: does releasing peds conflict with vehicles? We're admitting essentially no vehicles (only W_R1_RIGHT if legal at 177). So no conflict. However, there's a subtlety: if we release pedestrian phases and there is a jaywalker already crossing, the phase peds might collide? Engine handles. Let me c」→ CROSSWALK:EAST:CELL:2:1 vs INCIDENT
  - c22 r3 t176：「nly. Then commit with sleep 10. Wait, but that's my second dry run. If it fails too I'm out of dry runs this cycle. Let me be careful: WEST, NORTH, SOUTH only. Should be fine? NORTH has crossing ped clearTick 178, WEST has crossing PED:3. But phases might conflict with existing crossing peds? The reservation... Let me just try. Actu」→ CROSSWALK:NORTH:CELL:7:1 vs V00194
  - c23 r2 t177：「s: WEST crosswalk has jaywalking 0 but B_TO_A waiting 1, approaching 7, minPatience 22. NORTH crosswalk. SOUTH. Actually releasing pedestrians: which crosswalk is safe? The crosswalks are at the approaches. A pedestrian phase on a crosswalk conflicts with vehicle routes crossing it. Given almost no vehicle throughput, releasi」→ CROSSWALK:NORTH:CELL:7:1 vs V00194
- 自我修正标记（Wait/Actually/Let me recheck…）：共 5078 次，每次回复 平均 29，P50 18，P95 92，最大 145（n=175）
- 认知模式 letterCounting：13 处
  - 「ut queued passengers total ~106 on W + 2 E. Hmm 11.5 could be the projected total including future. Actually maybe revenue counted differently. Whatever, it's positive. Wait, reward 11.5 seems large. Let me recount: W_S1 8 vehicles 51 pax, W_S2 5 vehicles 53 pax, E_S1 2 vehicles 2 pax = 106 pax → 10.6. Plus maybe. So ~11.5. OK so revenue really is ~0.1/passenger and this wave earns ~10.6. That's meaningful over」
  - 「E-W: W_L1 (1). And W straight discharging. Next cycle (tick 91): N-S still blocked (till 114). Nothing much E-W. We might sleep again until N-S unblocks. Let me commit. tactical_summary required, max 300 chars. Let me analyze this situation carefully. Current tick 91, end tick 261. Balance 999.1165. Key state: - stoplineCandidates: several vehicles, but their routes are mostly blocked by RESERVATION blocks」
  - 「 stalled lanes. Incident still until ~167. Actually, maybe sleep more, like 10 is max. So sleep 10. Let me also consider saving working memory plan. Not needed. Let's do it. tactical_summary must be ≤300 chars. Let me write: "Tick138: PILEUP INC0001 CRITICAL (5 vehicles, clear ~167) severs E/N/S + W_L1/W_S2GUIDED. All stopline heads on blocked routes (E_L1/W_S2 RESERVATION, rest INCIDENT) — no legal admit.」
- 认知模式 idFormat：0 处

### 2.2 复杂环境博弈

**行人与车辆**

- 行人相位尝试 29 次，成功 5 次 {"RESOURCE_CONFLICT":20,"OK":5,"DRY_RUN_QUOTA_EXHAUSTED":3,"LANE_HEAD_NOT_READY":1}
- 实际放行 4 批 8 人；闯红灯 14 次 14 人；被撞 4 人；奖励 0，扣费 {"delay":0.86,"jaywalk":7.4,"strike":20}

行人相位冲突样例：

| 周期 | tick | 冲突偏移 at | 冲突 |
| --- | --- | --- | --- |
| 16 | 146 | 0 | CROSSWALK:EAST:CELL:2:0 vs INCIDENT |
| 17 | 153 | 0 | CROSSWALK:EAST:CELL:2:0 vs INCIDENT |
| 21 | 175 | 0 | CROSSWALK:EAST:CELL:2:1 vs INCIDENT |
| 22 | 176 | 0 | CROSSWALK:EAST:CELL:2:1 vs INCIDENT |
| 22 | 176 | 4 | CROSSWALK:NORTH:CELL:7:1 vs V00194 |
| 23 | 177 | 3 | CROSSWALK:NORTH:CELL:7:1 vs V00194 |
| 23 | 177 | 1 | CROSSWALK:WEST:CELL:7:1 vs V00129 |
| 24 | 181 | 0 | CROSSWALK:EAST:CELL:2:1 vs INCIDENT |
| 24 | 181 | 0 | CROSSWALK:EAST:CELL:2:1 |
| 25 | 184 | 0 | CROSSWALK:EAST:CELL:2:1 vs INCIDENT |

在行人耐心告急（PATIENCE_CRITICAL）时放行、且路线经过该横道的车辆：79 车次

| 周期 | tick | 车辆 | 路线 | 横道 | 行人 | 剩余耐心 | 该行人后来被撞 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 17 | 153 | V00148 | E_R1_RIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 13 | 是 |
| 17 | 153 | V00148 | E_R1_RIGHT | CROSSWALK:EAST | PED:24:0:CROSSWALK:EAST | 24 |  |
| 17 | 153 | V00159 | E_R1_RIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 13 | 是 |
| 17 | 153 | V00159 | E_R1_RIGHT | CROSSWALK:EAST | PED:24:0:CROSSWALK:EAST | 24 |  |
| 17 | 153 | V00181 | E_R1_RIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 13 | 是 |
| 17 | 153 | V00181 | E_R1_RIGHT | CROSSWALK:EAST | PED:24:0:CROSSWALK:EAST | 24 |  |
| 17 | 153 | V00074 | S_R1_RIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 13 | 是 |
| 17 | 153 | V00074 | S_R1_RIGHT | CROSSWALK:EAST | PED:24:0:CROSSWALK:EAST | 24 |  |
| 17 | 153 | V00084 | S_R1_RIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 13 | 是 |
| 17 | 153 | V00084 | S_R1_RIGHT | CROSSWALK:EAST | PED:24:0:CROSSWALK:EAST | 24 |  |
| 17 | 153 | V00121 | S_R1_RIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 13 | 是 |
| 17 | 153 | V00121 | S_R1_RIGHT | CROSSWALK:EAST | PED:24:0:CROSSWALK:EAST | 24 |  |
| 21 | 175 | V00194 | E_R1_RIGHT | CROSSWALK:EAST | PED:24:0:CROSSWALK:EAST | 2 |  |
| 23 | 177 | V00129 | W_R1_RIGHT | CROSSWALK:WEST | PED:44:0:CROSSWALK:WEST | 22 |  |
| 23 | 177 | V00129 | W_R1_RIGHT | CROSSWALK:WEST | PED:45:1:CROSSWALK:WEST | 23 |  |

行人时间线：

| tick | 事件 | 横道 | 人数 |
| --- | --- | --- | --- |
| 146 | PED_GRANT | CROSSWALK:NORTH | 1 |
| 146 | PED_GRANT | CROSSWALK:WEST | 1 |
| 167 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 169 | PED_COLLISION | CROSSWALK:EAST | 1 |
| 177 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 199 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 200 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 205 | PED_JAYWALK | CROSSWALK:SOUTH | 1 |
| 208 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 210 | PED_GRANT | CROSSWALK:EAST | 4 |
| 210 | PED_GRANT | CROSSWALK:WEST | 2 |
| 211 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 214 | PED_COLLISION | CROSSWALK:SOUTH | 1 |
| 215 | PED_COLLISION | CROSSWALK:NORTH | 1 |
| 228 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 234 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 240 | PED_COLLISION | CROSSWALK:SOUTH | 1 |
| 241 | PED_JAYWALK | CROSSWALK:SOUTH | 1 |
| 241 | PED_JAYWALK | CROSSWALK:SOUTH | 1 |
| 244 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 244 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 260 | PED_JAYWALK | CROSSWALK:WEST | 1 |

**事故处置**

| 事故 | 类型 | 发生 | 车辆 | 行人 | 首次响应 | 清障令 | 清障调用次数 | 关闭 | 事故后才放行、后来卷入 | 非模型放行（抢行） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| INC0001 | PILEUP | 137 | 9 | 0 | 137 | 137 | 13 | 199 |  | V00005 V00015 |
| INC0002 | ANGLE_COLLISION | 169 | 1 | 1 | 170 | 170 | 3 | 186 |  |  |
| INC0003 | PILEUP | 214 | 3 | 1 | 215 | 215 | 5 | 240 |  | V00010 |
| INC0004 | ANGLE_COLLISION | 215 | 2 | 1 | 216 | 216 | 3 | 232 |  |  |
| INC0005 | ANGLE_COLLISION | 240 | 1 | 1 | 241 | 241 | 4 | 257 |  |  |

事故成本估算：

| 事故 | 最终严重度 | 锁格（含二次） | 开放拍数 | 危化品 | 校车 | 分摊锁格费 | 估算总成本 | 放行来源 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| INC0001 | CRITICAL | 124 | 62 |  |  | 93.589 | 93.589 | V00005@c- V00141@c7 V00015@c- V00111@c8 V00116@c8 V00019@c7 V00125@c8 V00026@c8 V00027@c7 |
| INC0002 | SERIOUS | 21 | 17 |  |  | 2.897 | 7.897 | V00084@c17 |
| INC0003 | CRITICAL | 51 | 26 |  |  | 16.142 | 21.142 | V00010@c- V00020@c29 V00016@c31 |
| INC0004 | SERIOUS | 25 | 17 | 是 |  | 10.347 | 15.347 | V00039@c29 V00035@c29 |
| INC0005 | SERIOUS | 27 | 17 |  |  | 3.725 | 8.725 | V00197@c39 |

**司机抢行**

总计 {"redLight":3,"tailgate":0,"cutIn":0}

| 周期 | 类型 | 车辆 | 此前出现在 driverAlerts 的周期数 | 最后一次预警 | 卷入事故 |
| --- | --- | --- | --- | --- | --- |
| 9 | VEHICLE_RED_LIGHT | V00005 | 1 | IN_N_L1_LEFT 距停止线 0 剩余 6 | INC0001 |
| 9 | VEHICLE_RED_LIGHT | V00015 | 1 | IN_N_S1_STRAIGHT 距停止线 0 剩余 6 | INC0001 |
| 28 | VEHICLE_RED_LIGHT | V00010 | 3 | IN_N_S2_STRAIGHT 距停止线 0 剩余 0 | INC0003 |

**紧急车辆与抛锚**

紧急车辆延误扣费 0.845

| 车辆 | 首次进入 12 格 | 放行 tick | 等待拍数 | 最长静止 |
| --- | --- | --- | --- | --- |
| V00034 | 71 |  |  | 119 |
| V00036 | 71 | 101 | 30 | 21 |
| V00050 | 71 |  |  | 66 |
| V00043 | 81 | 92 | 11 | 0 |
| V00056 | 81 |  |  | 123 |
| V00217 | 167 |  |  | 79 |
| V00241 | 257 |  |  | 0 |

拖车费 6，链式加价 2.624

| 车辆 | 车道 | 抛锚 | 派拖车 | 派车延迟 | 绕行 |
| --- | --- | --- | --- | --- | --- |
| V00006 | IN_N_R1_RIGHT | 64 | 126 | 62 |  |
| V00014 | IN_S_R1_RIGHT | 64 | 126 | 62 |  |
| V00029 | IN_W_S2_STRAIGHT | 86 | 91 | 5 |  |
| V00063 | IN_W_S1_STRAIGHT | 102 | 126 | 24 |  |
| V00122 | IN_W_R1_RIGHT | 140 | 145 | 5 |  |
| V00099 | IN_W_S1_STRAIGHT | 255 |  |  |  |

### 2.3 亮眼操作与最差操作

周期价值 = 未卷入事故的放行车数 + 1.5×放行行人 + 2×成功的特情工具 − 归因事故成本。事故成本按锁格×开放时长分摊本局真实锁格扣费，再加撞人和校车罚款，平均分给放行了涉事车辆的周期。这是用于挑选证据的启发式，不是精确账目。

亮点事件：

| tick | 周期 | 类型 | 说明 |
| --- | --- | --- | --- |
| 71 | 2 | LARGE_VERIFIED_RELEASE | 15 vehicles, blame=0 |
| 91 | 4 | TOW_DISPATCH | V00029 |
| 126 | 8 | TOW_DISPATCH | V00063 |
| 126 | 8 | TOW_DISPATCH | V00006 |
| 126 | 8 | TOW_DISPATCH | V00014 |
| 126 | 8 | LARGE_VERIFIED_RELEASE | 12 vehicles, blame=53.48 |
| 145 | 15 | TOW_DISPATCH | V00122 |
| 146 | 16 | PED_GRANT | CROSSWALK:NORTH A_TO_B x1 |
| 146 | 16 | PED_GRANT | CROSSWALK:WEST A_TO_B x1 |
| 210 | 34 | PED_GRANT | CROSSWALK:EAST A_TO_B+B_TO_A x4 |
| 210 | 34 | PED_GRANT | CROSSWALK:WEST A_TO_B+B_TO_A x2 |
| 241 | 44 | LARGE_VERIFIED_RELEASE | 13 vehicles, blame=0 |

#### 得分最高的周期

**周期 2（tick 71）**：放行 15，未出事 15，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -0.368，提交类型 verified，睡眠 10

- 观测要点：余额 999.89，停止线候选 11，受阻路线 2，行人预警 []，司机预警 []，紧急车 [V00034, V00036, V00050]，抛锚 [V00006, V00014]
- 工具序列：r1 dry_run_admit -> ok；r2 dry_run_admit -> PLANNING_HORIZON_EXCEEDED (Admission planning horizon exceeded for V00038)；r3 commit_schedule -> ok
- 战术摘要：Tick71: East-West straight wave - W_S1 top8, W_S2 top5, E_S1 top2 (skip E/W right turns: routes reserved until 80/82). Sleeping 10 to discharge.
- 推理摘录：Let me analyze this traffic situation. Current tick: 71, end tick 261, 190 ticks remaining. Balance 999.8903. We need to admit vehicles to earn revenue. Revenue is small (0.1/passenger), but penalties for waiting vehicles are also small. Actually the main goal is to maximize final balance. Delays cost money, but revenue earned. Let me look at the situation. Stopline candidates (queue heads): - E_L1_LEFT V00008 (passenger, 1) - E_R1_RIGHT V00011 (passenger, 2) - route E_R1_RIGHT blocked until tic …… f we release them we get ~10.4. To maximize, we want to release as many as possible before end, and avoid the end-of-game -0.1/pax for those still waiting. Since the total set of vehicles over the game is bounded by arrivals, and each round we can push several out. Let me just keep flow. Commit now.

**周期 44（tick 241）**：放行 13，未出事 13，放行行人 0，耐心风险放行 13，归因成本 0，周期余额变化 -1.673，提交类型 verified，睡眠 10

- 唤醒原因：PEDESTRIAN_JAYWALK pedestrian=PED:80:0:CROSSWALK:SOUTH; PEDESTRIAN_JAYWALK pedestrian=PED:86:0:CROSSWALK:SOUTH; ACCIDENT_INTERRUPT incident=INC0005 locked=CROSSWALK:SOUTH:CELL:7:0,CROSSWALK:SOUTH:CELL
- 观测要点：余额 797.61，停止线候选 14，受阻路线 13，行人预警 [W:P19, N:J0, N:J0, N:J0, S:J0, N:P3, N:P3, S:P21]，司机预警 [V00008:0, V00017:0, V00031:0, V00045:0, V00049:0, V00052:0, V00066:0, V00204:0]，紧急车 [V00034, V00050, V00056, V00217]，抛锚 []
- 工具序列：r1 inspect_incident -> ok；r1 inspect_crosswalk -> ok；r1 inspect_crosswalk -> ok；r2 order_accident_clearance -> ok；r2 dry_run_admit -> ok；r3 dry_run_admit -> ok；r4 commit_schedule -> ok
- 战术摘要：t241: Ordered INC0005 clearance (V00197->OUT_EAST_0). Released E/W straight wave (E_S1x4, W_S1x5, W_S2x4 = 13 veh, verified clean, no jaywalker warnings); dropped W_R1 (crosses SOUTH jaywalker PED80). Sleeping 10 to t251.
- 推理摘录：Let me analyze this complex situation carefully. Current tick: 241, endTick: 261. Only 20 ticks remaining. Financial balance: 797.609. Let me look at the key facts: **Blocked routes:** - E_R1_RIGHT: RESERVATION until 245 - E_S1_STRAIGHT: RESERVATION until 241 (expires now) - N_L1_LEFT: RESERVATION until 269 - N_R1_RIGHT: RESERVATION until 245 - N_S1_STRAIGHT: RESERVATION until 272 - N_S2_STRAIGHT: RESERVATION until 271 - S_R1_GUIDED_STRAIGHT: INCIDENT until 257 - S_R1_RIGHT: INCIDENT until 257 - …… 2 top4], sleep_ticks=10, tactical_summary="..."). Let me write a concise summary. Actually, let me reconsider sleep_ticks. If I sleep 10 → t251. Then next cycle 10 more ticks (2 more cycles possible). Hmm, each cycle has overhead. Let me sleep 10 now. Hmm, but the max sleep is 10. OK. Let me commit.

**周期 3（tick 81）**：放行 8，未出事 8，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -0.406，提交类型 verified，睡眠 10

- 观测要点：余额 999.52，停止线候选 11，受阻路线 7，行人预警 []，司机预警 []，紧急车 [V00034, V00036, V00043, V00050, V00056]，抛锚 [V00006, V00014]
- 工具序列：r1 dry_run_admit -> ok；r2 commit_schedule -> ok
- 战术摘要：Tick81: E-W wave - E_S1 top2 (bus 40pax V00042), E_R1 top1, W_R1 top5 (frees emergency V00036). N-S all RESERVATION-blocked till ~114. Sleep 10.
- 推理摘录：Let me analyze this traffic situation carefully. Current tick 81, end tick 261, 180 ticks remaining. Balance ~999.52. Let me look at the state: Blocked routes (RESERVATION, can wait until blockedUntilTick): - E_L1_LEFT: 118 - N_L1_LEFT: 85 - N_S1_STRAIGHT: 114 - N_S2_STRAIGHT: 115 - S_L1_LEFT: 116 - S_S1_STRAIGHT: 119 - S_S2_STRAIGHT: 118 These are reservations - "通常可等到 blockedUntilTick 后再试". So these routes are reserved until those ticks. Hmm, that's a lot of blocked routes. Wait, RESERVATION b ……  commit, W_R1 will be fully drained (5 veh) and E_S1 drained (2). E_R1 drained. Remaining E-W: W_L1 (1). And W straight discharging. Next cycle (tick 91): N-S still blocked (till 114). Nothing much E-W. We might sleep again until N-S unblocks. Let me commit. tactical_summary required, max 300 chars.

**周期 1（tick 61）**：放行 5，未出事 5，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -0.11，提交类型 verified，睡眠 10

- 观测要点：余额 1000，停止线候选 7，受阻路线 0，行人预警 []，司机预警 []，紧急车 []，抛锚 []
- 工具序列：r1 dry_run_admit -> ok；r2 commit_schedule -> ok
- 战术摘要：Tick61: clear right turns E/N/S/W + W straight (bus 40pax V00007). Excluded E-left (conflict w/ W straight) and N-left (exit OUT_WEST held till 72). Sleeping 10 to clear.
- 推理摘录：Let me analyze the situation. Current tick 61, endTick 261. 200 ticks remaining. Balance 1000. Stopline candidates (7 vehicles at various lanes): - V00008 passenger 1, IN_E_L1_LEFT, route E_L1_LEFT - V00003 truck 1, IN_E_R1_RIGHT, route E_R1_RIGHT - V00005 passenger 1, IN_N_L1_LEFT, route N_L1_LEFT - V00001 passenger 1, IN_N_R1_RIGHT, route N_R1_RIGHT - V00004 passenger 2, IN_S_R1_RIGHT, route S_R1_RIGHT - V00007 bus 40, SCHOOL_BUS risk, IN_W_R1_RIGHT, route W_R1_RIGHT - V00002 truck 1, IN_W_S1_ ……  long wastes opportunities. We have 200 ticks, and intersection mostly empty. Clearing fully is good. Let's commit with sleep 10, then re-evaluate. Actually to be efficient, let's sleep 10. Then at tick 71 we can admit remaining heads; if exit holds block, we wait. I'll commit same params, sleep 10.

**周期 5（tick 101）**：放行 5，未出事 5，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -1.305，提交类型 verified，睡眠 10

- 观测要点：余额 997.16，停止线候选 11，受阻路线 6，行人预警 []，司机预警 []，紧急车 [V00034, V00050, V00056]，抛锚 [V00006, V00014, V00029]
- 工具序列：r1 dry_run_admit -> ok；r2 commit_schedule -> ok
- 战术摘要：Tick101: E wave - E_S2 top3 (bus in queue, 81 pax), E_S1 top1, E_R1 top1. N/S still RESERVATION-blocked till 114-119. Sleep 10 to tick 111.
- 推理摘录：Let me analyze the current state. Current tick 101, endTick 261, 160 ticks remaining. Balance 997.16. Key facts: - Blocked routes (RESERVATION) with until ticks: E_L1_LEFT@118, N_S1_STRAIGHT@114, N_S2_STRAIGHT@115, S_L1_LEFT@116, S_S1_STRAIGHT@119, S_S2_STRAIGHT@118. - Stopline candidates: - V00008 E_L1_LEFT - blocked until 118 - V00082 E_R1_RIGHT - free, waiting 2 - V00088 E_S1_STRAIGHT - free, waiting 0 - V00069 E_S2_STRAIGHT - free, waiting 8 - V00005 N_L1_LEFT - free? N_L1_LEFT not in blocke …… rpret "8 轮 API" as 8 decision cycles total. Actually that seems too few. Let me reconsider — could be a typo for 80. I'll just proceed efficiently, using sleep 10 and maximizing. Given uncertainty, let me maximize throughput per cycle and sleep 10. Commit: lane_batches same, sleep 10. Let me commit.

#### 损失最大的周期

**周期 8（tick 126）**：放行 12，未出事 7，放行行人 0，耐心风险放行 0，归因成本 53.48，周期余额变化 -5.448，提交类型 verified，睡眠 10

- 观测要点：余额 992.18，停止线候选 11，受阻路线 8，行人预警 []，司机预警 [V00005:6, V00015:6, V00017:8]，紧急车 [V00034, V00050, V00056]，抛锚 [V00006, V00014, V00063]
- 工具序列：r1 dry_run_admit -> ok；r2 dispatch_tow_truck -> ok；r2 dispatch_tow_truck -> ok；r2 dispatch_tow_truck -> ok；r3 commit_schedule -> ok
- 后果：INC0001 PILEUP tick=137 vehicles=9 pedestrians=0 estCost=93.589
- 战术摘要：Tick126: E_S2 top3 + E_R1 top4 + S_S1 top5 (verified). Towed 3 dead heads (V00063/V00006/V00014, 1.2 each, free @144) since bypass all 0. Sleep 10 -> t136.
- 推理摘录：Let me analyze the situation. Current tick 126, end 261. Balance 992.18. Let me look at the state carefully. Stopline candidates: - V00008, E_L1_LEFT, waiting 65, route blocked until 143 (RESERVATION) - V00113, E_R1_RIGHT, waiting 11, route E_R1_RIGHT not blocked - V00111, E_S2_STRAIGHT, waiting 12, route not blocked - V00005, N_L1_LEFT, waiting 66, route N_L1_LEFT blocked until 138 - V00015, N_S1_STRAIGHT, waiting 61, route N_S1_STRAIGHT blocked until 148 - V00010, N_S2_STRAIGHT, waiting 64, ro …… . Hmm, that's significant vs reward 3.1. But freeing lanes with 16-19 vehicles behind should more than pay off over the remaining ~117 ticks. They complete at 144. So they free at 144. Now commit the wave with sleep 10 → 136. Then at 136 re-evaluate; tows complete 144, so a bit later. Let me commit.

**周期 7（tick 116）**：放行 8，未出事 5，放行行人 0，耐心风险放行 0，归因成本 40.11，周期余额变化 -2.565，提交类型 verified，睡眠 10

- 观测要点：余额 994.75，停止线候选 12，受阻路线 4，行人预警 []，司机预警 []，紧急车 [V00034, V00050, V00056]，抛锚 [V00006, V00014, V00063]
- 工具序列：r1 dry_run_admit -> ok；r2 dry_run_admit -> LANE_HEAD_NOT_READY (Lane head is not ready: IN_E_S2_STRAIGHT)；r3 commit_schedule -> ok
- 后果：INC0001 PILEUP tick=137 vehicles=9 pedestrians=0 estCost=93.589
- 战术摘要：Tick116: E-S wave - E_S1 top2 (bus V00115, 40pax), E_R1 top2, S_L1 top2 (V00019 frees emergency V00034), W_R1 top2 (van V00078). No jaywalker/tailgate risk. N reservations clear ~125-128; sleep 10 then N/W axis.
- 推理摘录：Let me analyze the situation carefully. Current tick: 116, end tick 261, remaining 145. Balance: 994.7481. Let me look at the state. Stopline candidates: - V00008, passenger, lane IN_E_L1_LEFT, waiting 55, route E_L1_LEFT - V00104, passenger, lane IN_E_R1_RIGHT, waiting 7, route E_R1_RIGHT - V00115, bus (40 pax!), lane IN_E_S1_STRAIGHT, waiting 2, route E_S1_STRAIGHT - V00005, passenger, lane IN_N_L1_LEFT, waiting 56, route N_L1_LEFT (blocked RESERVATION until 125) - V00015, passenger, lane IN_N ……  me also add tactical_summary. Commit: lane_batches: E_S1 top2, E_R1 top2, S_L1 top2, W_R1 top2. sleep_ticks 10. Wait — but the note says commit must match dry run "规范化后完全相同参数". Plan A had no speed_profiles, no pedestrian_phases. So commit with same 4 batches, no speed profiles. Good. Let me commit.

**周期 29（tick 200）**：放行 9，未出事 6，放行行人 0，耐心风险放行 27，归因成本 25.92，周期余额变化 -0.817，提交类型 verified，睡眠 10

- 唤醒原因：PEDESTRIAN_JAYWALK pedestrian=PED:45:1:CROSSWALK:WEST
- 观测要点：余额 881.93，停止线候选 15，受阻路线 6，行人预警 [E:J0, S:P5, N:P8, W:J0, E:P11, W:J0, N:P11]，司机预警 [V00008:0, V00017:0, V00085:0, V00049:0, V00087:0, V00109:0, V00025:0, V00054:0]，紧急车 [V00034, V00050, V00056, V00217]，抛锚 []
- 工具序列：r1 dry_run_admit -> LANE_HEAD_NOT_READY (Lane head is not ready: IN_N_S2_STRAIGHT)；r1 inspect_crosswalk -> ok；r1 inspect_crosswalk -> ok；r2 inspect_lane_queue -> ok；r2 inspect_crosswalk -> ok；r3 dry_run_admit -> ok；r4 dry_run_admit -> DRY_RUN_QUOTA_EXHAUSTED；r5 commit_schedule -> ok
- 后果：INC0003 PILEUP tick=214 vehicles=3 pedestrians=1 estCost=21.142；INC0004 ANGLE_COLLISION tick=215 vehicles=2 pedestrians=1 estCost=15.347
- 战术摘要：t200: N/S straight batch verified+committed (N_S1 top3: V00020 bus40/V00032/V00050 emerg; S_S1 top3; S_S2 top3 incl HAZMAT V00035), reward ~6.1, clears by t232. N_S2 head blocked by in-flight predecessor. E/W blocked by E/W jaywalkers (~232). Sleep 10 to t210; then next N/S batch; S_L1_LEFT unblocks
- 推理摘录：Let me analyze the situation carefully. Current tick 200, end tick 261, 61 ticks remaining. Balance 881.9322. Key issues: - Jaywalkers on EAST crosswalk (PED:24, PED:45 B_TO_A) and WEST crosswalk (PED:44, PED:45:1 A_TO_B). - Many routes blocked. - Emergency vehicles stationary for a long time (V00034 59 ticks, V00056 63 ticks, V00050 61 ticks). These are accumulating emergencyDelay cost. Let me look at the blocked routes: - E_S2_STRAIGHT blockedUntil 200 (RESERVATION) - now expiring - S_L1_LEFT  …… ks at 210." Let me commit. Hmm wait, also consider: should I include pedestrian phases? I decided to skip to avoid verification issues. Fine. Commit with exact params: lane_batches N_S1 top3, S_S1 top3, S_S2 top3. No speed profiles (default CRUISE). No pedestrians. Must match exactly. Let me commit.

**周期 31（tick 204）**：放行 3，未出事 2，放行行人 0，耐心风险放行 12，归因成本 10.57，周期余额变化 -1.454，提交类型 verified，睡眠 10

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:68:0:CROSSWALK:NORTH remaining=24
- 观测要点：余额 882.95，停止线候选 13，受阻路线 8，行人预警 [E:J0, S:P1, N:P4, W:J0, E:P7, W:J0, N:P7, E:P21, N:P24]，司机预警 [V00008:0, V00017:0, V00085:0, V00079:0, V00025:0, V00087:0, V00109:0, V00038:0]，紧急车 [V00034, V00050, V00056, V00217]，抛锚 []
- 工具序列：r1 dry_run_admit -> ok；r1 inspect_crosswalk -> ok；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 后果：INC0003 PILEUP tick=214 vehicles=3 pedestrians=1 estCost=21.142
- 战术摘要：t204: All E/W routes + turns still RESERVATION-blocked till 223-227; all E/W right-turn heads carry jaywalker warnings (EAST PED:24, WEST PED:44/45) so excluded to avoid strikes. Only clean admit = IN_N_S2_STRAIGHT top3 (V00016 bus40 + tailgaters V00025/V00038 legalized). Committed, reward ~4.2. Sle
- 推理摘录：Let me analyze the situation carefully. Current tick 204, end tick 261, 57 ticks remaining. Financial balance 882.9533. Key facts: - Interrupt reason: PEDESTRIAN_PATIENCE on CROSSWALK:NORTH, PED:68 patience remaining 24. - There are jaywalkers on EAST and WEST crosswalks (PED:24, PED:44, PED:45) causing blocks to E/W routes. - Several emergency vehicles stationary: V00034 (IN_S_L1_LEFT, stationary 63), V00056 (IN_N_L1_LEFT, stationary 67), V00050 (IN_N_S1_STRAIGHT, stationary 65), V00217 (IN_E_R …… /234 — we don't need to wait for them. We want to reach the unblock window (223). Sleeping 10 gets to 214; then another sleep 10 → 224. Two sleeps of 10 = 20 ticks of upstream/delay penalties. Alternatively sleep 10 now, then at 214 do a careful plan. I'll commit sleep 10. tactical_summary required.

**周期 39（tick 220）**：放行 4，未出事 3，放行行人 0，耐心风险放行 8，归因成本 8.72，周期余额变化 -20.505，提交类型 verified，睡眠 10

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:82:0:CROSSWALK:NORTH remaining=24; PEDESTRIAN_PATIENCE pedestrian=PED:89:0:CROSSWALK:NORTH remaining=24
- 观测要点：余额 850.87，停止线候选 16，受阻路线 28，行人预警 [W:J0, W:J0, N:J0, N:P14, N:P8, S:P21, N:P24, S:P21, N:P24]，司机预警 [V00008:0, V00017:0, V00031:0, V00045:0, V00049:0, V00052:0, V00085:0, V00040:0]，紧急车 [V00034, V00050, V00056, V00217]，抛锚 []
- 工具序列：r1 inspect_incident -> ok；r1 inspect_incident -> ok；r1 inspect_crosswalk -> ok；r1 inspect_crosswalk -> ok；r1 inspect_lane_queue -> ok；r1 inspect_lane_queue -> ok；r2 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:NORTH:CELL:6:1 vs INCIDENT)；r3 dry_run_admit -> ok；r4 commit_schedule -> ok
- 后果：INC0005 ANGLE_COLLISION tick=240 vehicles=1 pedestrians=1 estCost=8.725
- 战术摘要：t220: NORTH ped phase blocked by INC0004-locked cell 6:1 (clears ~232). Admitted IN_S_R1_RIGHT Top-4 (V00169 enters now, V00197 clears 260). Sleeping 10 to let INC0004 clear and unlock NORTH crosswalk + E/S lanes.
- 推理摘录：Let me analyze this situation carefully. Current tick 220, end tick 261, 41 ticks remaining. Balance 850.8654. The situation: Two incidents (INC0003 and INC0004) have severed almost all routes. The blockedRoutes list shows nearly every route is blocked by INC0003 or INC0004 with blockedUntilTick around 232-241. Let me look at what's NOT blocked: - E_R1_RIGHT is blocked (INC0004) - E_S1_STRAIGHT blocked - E_S2_STRAIGHT blocked - E_L1_LEFT blocked - N_R1_RIGHT: NOT in blockedRoutes! Let me check.  …… rture, maybe committing top_n 2 is equivalent. But top_n 4 gives V00207 partial revenue. Fine, keep 4. Let me commit. summary: "t220: NORTH ped phase blocked by INC0004-locked cell 6:1. Admitted IN_S_R1_RIGHT Top-4 (V00169 enters now). Sleeping 10 to let INC0004 clear (~t232) and NORTH peds unlock."

### 附：逐周期一览

| 周期 | tick | 提交 | 放行 | 行人 | 耐心风险 | 归因事故 | 归因成本 | 余额变化 | 睡眠 | 唤醒原因 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 61 | verified | 5 | 0 | 0 |  | 0 | -0.11 | 10 |  |
| 2 | 71 | verified | 15 | 0 | 0 |  | 0 | -0.368 | 10 |  |
| 3 | 81 | verified | 8 | 0 | 0 |  | 0 | -0.406 | 10 |  |
| 4 | 91 | hold | 0 | 0 | 0 |  | 0 | -1.952 | 10 |  |
| 5 | 101 | verified | 5 | 0 | 0 |  | 0 | -1.305 | 10 |  |
| 6 | 111 | hold | 0 | 0 | 0 |  | 0 | -1.111 | 5 |  |
| 7 | 116 | verified | 8 | 0 | 0 | INC0001 | 40.11 | -2.565 | 10 |  |
| 8 | 126 | verified | 12 | 0 | 0 | INC0001 | 53.48 | -5.448 | 10 |  |
| 9 | 133 | hold | 0 | 0 | 0 |  | 0 | -1.528 | 10 | VEHICLE_RED_LIGHT vehicle=V00005 route=N_L1_LEFT; VEHICLE_RE |
| 10 | 137 | verified | 1 | 0 | 0 |  | 0 | -1.261 | 4 | ACCIDENT_INTERRUPT incident=INC0001 locked=PAIR:E_S1_STRAIGH |
| 11 | 138 | hold | 0 | 0 | 0 |  | 0 | -1.482 | 10 | ACCIDENT_INTERRUPT incident=INC0001 secondary=true |
| 12 | 139 | hold | 0 | 0 | 0 |  | 0 | -1.593 | 10 | ACCIDENT_INTERRUPT incident=INC0001 secondary=true |
| 13 | 140 | hold | 0 | 0 | 0 |  | 0 | -2.925 | 10 | ACCIDENT_INTERRUPT incident=INC0001 secondary=true |
| 14 | 142 | hold | 0 | 0 | 0 |  | 0 | -0.947 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:11:0:CROSSWALK:EAST remai |
| 15 | 145 | hold | 0 | 0 | 0 |  | 0 | -3.198 | 10 | ACCIDENT_INTERRUPT incident=INC0001 secondary=true |
| 16 | 146 | verified | 0 | 0 | 0 |  | 0 | -12.825 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:3:0:CROSSWALK:WEST remain |
| 17 | 153 | verified | 6 | 0 | 12 | INC0002 | 7.9 | -13.857 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:24:0:CROSSWALK:EAST remai |
| 18 | 163 | hold | 0 | 0 | 0 |  | 0 | -7.942 | 10 |  |
| 19 | 167 | hold | 0 | 0 | 0 |  | 0 | -10.208 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:11:0:CROSSWALK:EAST |
| 20 | 170 | hold | 0 | 0 | 0 |  | 0 | -9.594 | 10 | ACCIDENT_INTERRUPT incident=INC0002 locked=CROSSWALK:EAST:CE |
| 21 | 175 | verified | 1 | 0 | 1 |  | 0 | 1.739 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:44:0:CROSSWALK:WEST remai |
| 22 | 176 | hold | 0 | 0 | 0 |  | 0 | -2.768 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:45:1:CROSSWALK:WEST remai |
| 23 | 177 | unverified | 1 | 0 | 2 |  | 0 | -8.769 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:24:0:CROSSWALK:EAST |
| 24 | 181 | unverified | 0 | 0 | 0 |  | 0 | -6.518 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:38:0:CROSSWALK:SOUTH rema |
| 25 | 184 | hold | 0 | 0 | 0 |  | 0 | -1.934 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:43:0:CROSSWALK:NORTH rema |
| 26 | 187 | hold | 0 | 0 | 0 |  | 0 | -14.27 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:45:0:CROSSWALK:EAST remai |
| 27 | 197 | hold | 0 | 0 | 0 |  | 0 | -3.593 | 4 |  |
| 28 | 199 | hold | 0 | 0 | 0 |  | 0 | -1.328 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:44:0:CROSSWALK:WEST; VEHIC |
| 29 | 200 | verified | 9 | 0 | 27 | INC0003 INC0004 | 25.92 | -0.817 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:45:1:CROSSWALK:WEST |
| 30 | 201 | hold | 0 | 0 | 0 |  | 0 | 1.838 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:61:0:CROSSWALK:EAST remai |
| 31 | 204 | verified | 3 | 0 | 12 | INC0003 | 10.57 | -1.454 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:68:0:CROSSWALK:NORTH rema |
| 32 | 205 | hold | 0 | 0 | 0 |  | 0 | -2.867 | 8 | PEDESTRIAN_JAYWALK pedestrian=PED:38:0:CROSSWALK:SOUTH |
| 33 | 208 | hold | 0 | 0 | 0 |  | 0 | -1.659 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:43:0:CROSSWALK:NORTH |
| 34 | 210 | verified | 0 | 0 | 0 |  | 0 | -1.451 | 4 | PEDESTRIAN_PATIENCE pedestrian=PED:62:0:CROSSWALK:NORTH rema |
| 35 | 211 | hold | 0 | 0 | 0 |  | 0 | -8.308 | 5 | PEDESTRIAN_JAYWALK pedestrian=PED:50:0:CROSSWALK:NORTH |
| 36 | 215 | hold | 0 | 0 | 0 |  | 0 | -6.919 | 2 | ACCIDENT_INTERRUPT incident=INC0003 locked=CROSSWALK:SOUTH:C |
| 37 | 216 | verified | 1 | 0 | 0 |  | 0 | -2.296 | 10 | ACCIDENT_INTERRUPT incident=INC0004 locked=CROSSWALK:NORTH:C |
| 38 | 217 | hold | 0 | 0 | 0 |  | 0 | -7.134 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:80:0:CROSSWALK:SOUTH rema |
| 39 | 220 | verified | 4 | 0 | 8 | INC0005 | 8.72 | -20.505 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:82:0:CROSSWALK:NORTH rema |
| 40 | 228 | hold | 0 | 0 | 0 |  | 0 | -13.802 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:68:0:CROSSWALK:NORTH |
| 41 | 234 | hold | 0 | 0 | 0 |  | 0 | -3.97 | 4 | PEDESTRIAN_JAYWALK pedestrian=PED:62:0:CROSSWALK:NORTH |
| 42 | 236 | hold | 0 | 0 | 0 |  | 0 | -4.134 | 5 | PEDESTRIAN_PATIENCE pedestrian=PED:106:0:CROSSWALK:WEST rema |
| 43 | 238 | verified | 4 | 0 | 4 |  | 0 | -10.844 | 4 | PEDESTRIAN_PATIENCE pedestrian=PED:95:0:CROSSWALK:SOUTH rema |
| 44 | 241 | verified | 13 | 0 | 13 |  | 0 | -1.673 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:80:0:CROSSWALK:SOUTH; PEDE |
| 45 | 242 | hold | 0 | 0 | 0 |  | 0 | -3.965 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:113:0:CROSSWALK:WEST rema |
| 46 | 244 | hold | 0 | 0 | 0 |  | 0 | -5.124 | 6 | PEDESTRIAN_PATIENCE pedestrian=PED:98:0:CROSSWALK:NORTH rema |
| 47 | 247 | hold | 0 | 0 | 0 |  | 0 | -9.118 | 5 | PEDESTRIAN_PATIENCE pedestrian=PED:115:0:CROSSWALK:EAST rema |
| 48 | 252 | hold | 0 | 0 | 0 |  | 0 | -1.928 | 1 | PEDESTRIAN_PATIENCE pedestrian=PED:119:0:CROSSWALK:WEST rema |
| 49 | 253 | hold | 0 | 0 | 0 |  | 0 | -7.408 | 4 |  |
| 50 | 257 | hold | 0 | 0 | 0 |  | 0 | -3.579 | 4 |  |
| 51 | 259 | hold | 0 | 0 | 0 |  | 0 | -2.501 | 2 | PEDESTRIAN_PATIENCE pedestrian=PED:111:0:CROSSWALK:NORTH rem |
| 52 | 260 | hold | 0 | 0 | 0 |  | 0 | -1.855 | 1 | PEDESTRIAN_JAYWALK pedestrian=PED:106:0:CROSSWALK:WEST |

