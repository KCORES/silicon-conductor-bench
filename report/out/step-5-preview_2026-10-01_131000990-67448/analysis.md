# 运行分析：step-5-preview_2026-10-01_131000990-67448

- 模型：step-5-preview；种子 63916；规则版本 16；回放 schema 7
- 截止 tick 261，决策周期 65，最终余额 **621.45**
- 生成时间 2026-10-01T21:35:33.424Z；数据文件：replay_step-5-preview_2026-10-01_131000990-67448.json、report_step-5-preview_2026-10-01_131000990-67448.json、api-log_step-5-preview_2026-10-01_131000990-67448.jsonl、raw-api-log_step-5-preview_2026-10-01_131000990-67448.jsonl

## 1. 基础分析

### 1.1 上下文能力

- prompt tokens：平均 23520.4，P50 23564，P95 44930，最大 76307（n=178）
- completion tokens：平均 6837.1，P50 5683，P95 16384，最大 16384（n=178）；其中推理 tokens：平均 0，P50 0，P95 0，最大 0（n=178）
- 每周期 API 轮数：平均 2.7，P50 3，P95 5，最大 6（n=65）；上限 8，用满上限的周期 0 个
- 每次请求的平均字符数：系统提示 7738.5，user 16177.1，工具结果 2511.2，assistant 372.7；消息条数 平均 4.6，P50 4，P95 10，最大 16（n=178）
- 工具参数中的 ID 共 310 个：出现在当轮可见上下文里的占 1，当轮不可见但本局别处出现过 0 个，本局从未出现 0 个，非规范横道短键 0 个

| ID 类型 | 总数 | 当轮可见 | 别处出现 | 从未出现 | 非规范短键 |
| --- | --- | --- | --- | --- | --- |
| lane | 150 | 150 | 0 | 0 | 0 |
| vehicle | 55 | 55 | 0 | 0 | 0 |
| crosswalk | 50 | 50 | 0 | 0 | 0 |
| incident | 55 | 55 | 0 | 0 | 0 |

- 同一周期内重复提交已失败的相同调用：0 次 {}
- 提交类型：verified 20，unverified 0，hold 38；放行类提交中 verified 占 1
- working memory：调用 3 次 {"SAVE_PLAN":3}，观测里带有计划的周期 55 个

### 1.2 注意力分布

关注率 = 字段出现在该周期观测里、且推理文本提到它的周期数 / 字段出现的周期数。

| 概念 | 出现周期 | 提到且出现 | 关注率 | 提到周期（含未出现） | 提及次数 |
| --- | --- | --- | --- | --- | --- |
| crosswalks | 65 | 65 | 1 | 65 | 5826 |
| pedestrianAlerts | 55 | 55 | 1 | 64 | 8422 |
| emergency | 65 | 65 | 1 | 65 | 2309 |
| stalledVehicles | 33 | 33 | 1 | 60 | 863 |
| dischargingLanes | 29 | 29 | 1 | 50 | 455 |
| revokedAdmissions | 4 | 4 | 1 | 30 | 120 |
| candidateConflicts | 65 | 64 | 0.985 | 64 | 1624 |
| stoplineCandidates | 65 | 62 | 0.954 | 62 | 601 |
| timeBudget | 65 | 62 | 0.954 | 62 | 394 |
| driverAlerts | 58 | 54 | 0.931 | 60 | 1054 |
| recentCycles | 64 | 58 | 0.906 | 58 | 359 |
| holds | 57 | 51 | 0.895 | 51 | 493 |
| lastSettlement | 64 | 57 | 0.891 | 57 | 190 |
| activeVehicleMotions | 42 | 37 | 0.881 | 40 | 147 |
| workingMemory | 55 | 43 | 0.782 | 46 | 202 |
| laneGuidance | 65 | 48 | 0.738 | 48 | 356 |
| laneMatrices | 0 | 0 |  | 65 | 1623 |
| exits | 0 | 0 |  | 65 | 4483 |
| reservedUntil | 0 | 0 |  | 64 | 1583 |
| incidentBlocked | 0 | 0 |  | 45 | 557 |

中断响应：

| 中断类型 | 次数 | 有响应 | 响应率 | 判定规则 |
| --- | --- | --- | --- | --- |
| VEHICLE_RED_LIGHT | 3 | 3 | 1 | 推理文本提到了中断对象 ID |
| PEDESTRIAN_PATIENCE | 28 | 9 | 0.321 | 同周期任一试算或提交带 pedestrian_phases |
| PEDESTRIAN_JAYWALK | 19 | 8 | 0.421 | 推理文本提到了中断对象 ID |
| ACCIDENT_INTERRUPT | 12 | 11 | 0.917 | 同周期调用 inspect_incident / order_accident_clearance / set_lane_detour |
| VEHICLE_TAILGATE | 2 | 2 | 1 | 推理文本提到了中断对象 ID |

- 每次回复的推理字符数：平均 23824，P50 19185，P95 57773，最大 60753（n=178）

### 1.3 tool_call 准确性

- 工具调用 203 次，成功 166 次，成功率 0.818
- 失败分类：{"RESOURCE_CONFLICT":23,"DRY_RUN_QUOTA_EXHAUSTED":7,"TOOL_EXECUTION_ERROR":2,"PLANNING_HORIZON_EXCEEDED":1,"SCHEMA_ERROR":1,"NOT_LANE_HEAD":1,"NOT_AT_STOPLINE":1,"LANE_HEAD_NOT_READY":1}
- 每次回复的工具调用数分布：{"0":25,"1":113,"2":32,"3":7,"5":1}；finish_reason：{"tool_calls":153,"length":20,"stop":5}
- API 错误 0 次 {}；回退周期 [6,12,31,42,46,52]
- 从未使用的工具：inspect_lane_queue、reroute_queue_around_stall、guide_inbound_lane_change

| 工具 | 调用 | 成功 | 成功率 | 结果分类 |
| --- | --- | --- | --- | --- |
| dry_run_admit | 68 | 33 | 0.485 | {"OK":33,"PLANNING_HORIZON_EXCEEDED":1,"RESOURCE_CONFLICT":23,"DRY_RUN_QUOTA_EXHAUSTED":7,"SCHEMA_ERROR":1,"TOOL_EXECUTION_ERROR":2,"LANE_HEAD_NOT_READY":1} |
| commit_schedule | 59 | 58 | 0.983 | {"OK":58,"NOT_AT_STOPLINE":1} |
| dispatch_emergency_convoy | 2 | 1 | 0.5 | {"OK":1,"NOT_LANE_HEAD":1} |
| dispatch_tow_truck | 6 | 6 | 1 | {"OK":6} |
| manage_working_memory | 3 | 3 | 1 | {"OK":3} |
| inspect_incident | 31 | 31 | 1 | {"OK":31} |
| order_accident_clearance | 24 | 24 | 1 | {"OK":24} |
| set_lane_detour | 6 | 6 | 1 | {"OK":6} |
| inspect_crosswalk | 4 | 4 | 1 | {"OK":4} |

错误样例：

- **PLANNING_HORIZON_EXCEEDED**
  - c7 t111 dry_run_admit：Admission planning horizon exceeded for V00146；参数 `{"lane_batches":[{"lane_id":"IN_E_R1_RIGHT","top_n":4},{"lane_id":"IN_W_R1_RIGHT","top_n":8}]}`
- **RESOURCE_CONFLICT**
  - c14 t152 dry_run_admit：CROSSWALK:WEST:CELL:0:0 vs V00028；参数 `{"lane_batches":[{"lane_id":"IN_N_L1_LEFT","top_n":1},{"lane_id":"IN_N_S1_STRAIGHT","top_n":3},{"lane_id":"IN_N_S2_STRAIGHT","top_n":8}],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:WEST","directions":["A_TO_B"]}]}`
  - c15 t160 dry_run_admit：CROSSWALK:WEST:CELL:0:0 vs V00046；参数 `{"lane_batches":[{"lane_id":"IN_E_R1_RIGHT","top_n":3},{"lane_id":"IN_S_S1_STRAIGHT","top_n":6},{"lane_id":"IN_S_S2_STRAIGHT","top_n":2}],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:WEST","directions":["A_TO_B"]}]}`
  - c16 t162 dry_run_admit：CROSSWALK:WEST:CELL:0:0 vs V00046；参数 `{"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:WEST","directions":["A_TO_B","B_TO_A"]}]}`
- **DRY_RUN_QUOTA_EXHAUSTED**
  - c15 t160 dry_run_admit：-；参数 `{"lane_batches":[{"lane_id":"IN_E_R1_RIGHT","top_n":3},{"lane_id":"IN_S_S1_STRAIGHT","top_n":7},{"lane_id":"IN_S_S2_STRAIGHT","top_n":3}]}`
  - c17 t165 dry_run_admit：-；参数 `{"candidate_vehicle_ids":["V00053"],"lane_batches":[],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:WEST","directions":["B_TO_A"]}]}`
  - c36 t199 dry_run_admit：-；参数 `{"lane_batches":[{"lane_id":"IN_N_R1_RIGHT","speed_profile":"CRUISE","top_n":4}],"pedestrian_phases":[{"crosswalk_id":"CROSSWALK:SOUTH","directions":["A_TO_B"]}]}`
- **SCHEMA_ERROR**
  - c17 t165 dry_run_admit：[ { "code": "custom", "message": "Provide vehicle ids or at least one lane batch", "path": [] } ]；参数 `{"lane_batches":[],"pedestrian_phases":[],"candidate_vehicle_ids":[]}`
- **NOT_LANE_HEAD**
  - c22 t174 dispatch_emergency_convoy：-；参数 `{"lane_id":"IN_E_R1_RIGHT","emergency_vehicle_id":"V00212"}`
- **NOT_AT_STOPLINE**
  - c27 t179 commit_schedule：-；参数 `{"admit_vehicle_ids":["V00212","V00217","V00223"],"pedestrian_phases":[],"sleep_ticks":10,"tactical_summary":"INC0002清障已成队(V00031 secondary并入OUT_EAST_1,no_op)。NORTH行人相位被INC0001锁格拒绝(CELL:0:0 INCIDENT),放弃。放E_R1整批3车(+1.2,紧急`
- **TOOL_EXECUTION_ERROR**
  - c53 t237 dry_run_admit：Admission plan exceeds 16 vehicles: 18；参数 `{"lane_batches":[{"lane_id":"IN_E_R1_RIGHT","top_n":6},{"lane_id":"IN_N_R1_RIGHT","top_n":6},{"lane_id":"IN_S_R1_RIGHT","top_n":6}]}`
  - c56 t241 dry_run_admit：Admission plan exceeds 16 vehicles: 24；参数 `{"lane_batches":[{"lane_id":"IN_E_R1_RIGHT","top_n":8},{"lane_id":"IN_S_R1_RIGHT","top_n":8},{"lane_id":"IN_N_R1_RIGHT","top_n":8}]}`
- **LANE_HEAD_NOT_READY**
  - c59 t247 dry_run_admit：Lane head is not ready: IN_W_R1_RIGHT；参数 `{"lane_batches":[{"lane_id":"IN_W_R1_RIGHT","top_n":8}]}`

### 1.4 Agent 能力

- 周期内工具序列（D=试算，C=提交，T=其他工具）：{"DC":12,"DDC":8,"C":7,"TTC":6,"(none)":4,"TTTTC":3,"TC":2,"DTDDC":2,"DDDDC":2,"TDTC":2,"TTDC":2,"TTTC":2,"DDDC":2,"DTT":1,"DTDC":1,"TTTDDC":1,"TTTTDDC":1,"TT":1,"TTTTTDC":1,"TDC":1,"TDTDTTTTTC":1,"DTTDC":1,"DTTTDTC":1,"TDTTC":1}
- 含提交的周期里先试算再提交的比例：0.661
- 提交构成：{"verified":20,"unverified":0,"hold":38,"reckless":1}；每周期放行车数 平均 1.6，P50 0，P95 10，最大 12（n=65）；共放行 107 辆
- 成功提交 58 次，其中使用 lane_batches 14 次；每次 top_n 合计 平均 1.7，P50 0，P95 11，最大 12（n=58）
- 速度档位：{"CRUISE":30,"BURST":6}；sleep_ticks：平均 8.5，P50 10，P95 10，最大 10（n=59） {"1":1,"2":1,"3":2,"4":3,"5":1,"6":6,"7":1,"8":3,"9":3,"10":38}
- 工具使用：{"dry_run_admit":68,"commit_schedule":59,"inspect_incident":31,"order_accident_clearance":24,"dispatch_tow_truck":6,"set_lane_detour":6,"inspect_crosswalk":4,"manage_working_memory":3,"dispatch_emergency_convoy":2}
- 决策开销：API 178 次，扣 3.56；非终结工具 144 次，扣 0.216

与同条件 baseline 对比：

| 策略 | 最终余额 | 放行车辆 | 未服务负债 | 事故数 | 锁格扣费 | 上游积压 | 撞人 | 闯红灯罚 | 行人奖励 | 校车 | 拖车 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| step-5-preview | 621.45 | 107 | 207.8 | 3 | 99.87 | 63.6 | 10 | 10.4 | 0 | 0 | 7.2 |
| baseline-balanced | 674.49 | 84 | 219.6 | 6 | 21.3 | 58.85 | 25 | 5.5 | 0 | 0 | 8.4 |
| baseline-balanced-bus | 659.61 | 87 | 208.1 | 4 | 90.26 | 53.27 | 5 | 4.9 | 0 | 0 | 6 |
| baseline-balanced-no-ped | 717.59 | 132 | 187.4 | 4 | 74.39 | 47.7 | 0 | 0 | 0 | 10 | 10.8 |
| baseline-longest-queue | 633.99 | 183 | 195.7 | 10 | 76.09 | 44.92 | 50 | 11.6 | 0 | 10 | 10.8 |
| baseline-random | 539.49 | 114 | 207.6 | 7 | 139.2 | 73.82 | 35 | 11 | 0 | 0 | 7.2 |
| baseline-search | 788.38 | 122 | 185.4 | 2 | 3.69 | 45.85 | 10 | 6.7 | 0 | 0 | 8.4 |

## 2. 进阶分析

### 2.1 逻辑推理

- 试算失败（不含额度用完）28 次；之后再试 16 次，其中改了参数 16 次，成功 10 次（0.625）；失败所在周期最终 verified 提交 7 次、hold 20 次
- 推理中"路线 X 经过/不经过 Y 横道"的断言 77 条，正确 59，错误 18，准确率 0.766；前半局 7/30 错，后半局 11/47 错
  - c14：「N_L1_LEFT crosses the west」（实际经过 CROSSWALK:NORTH+CROSSWALK:EAST）
  - c25：「S_S1_STRAIGHT vehicles (going south approach crossing west」（实际经过 CROSSWALK:SOUTH+CROSSWALK:NORTH）
  - c29：「E_R1_RIGHT cross SOUTH」（实际经过 CROSSWALK:EAST+CROSSWALK:NORTH）
  - c31：「W_S1_STRAIGHT crosses the NORTH」（实际经过 CROSSWALK:WEST+CROSSWALK:EAST）
  - c31：「E_R1_RIGHT (turning south) crosses the south」（实际经过 CROSSWALK:EAST+CROSSWALK:NORTH）
  - c31：「W_R1_RIGHT (turning north) crosses NORTH」（实际经过 CROSSWALK:WEST+CROSSWALK:SOUTH）
  - c31：「W_R1_RIGHT scheduled @193 — it will cross NORTH」（实际经过 CROSSWALK:WEST+CROSSWALK:SOUTH）
  - c34：「E_S2_STRAIGHT vehicles which cross the north」（实际经过 CROSSWALK:EAST+CROSSWALK:WEST）
- 推理写"安全/无冲突"但同一轮试算冲突：17 次
  - c14 r1 t152：「V00047). Do they conflict with each other? N_L1-N_S1: not in conflict list. N_L1-N_S2: not listed. N_S1-N_S2: not listed. So all three north heads are mutually compatible. But wait — conflicts with E: V00170 (E_S1) conflicts with V00056 (N_L1) and V00057 (N_S1). So can't include E_S1 head with north. V00105 (E_L1) doesn't confli」→ CROSSWALK:WEST:CELL:0:0 vs V00028
  - c15 r1 t160：「sn't list V00192 conflicts. Conflicts listed involve V00105(V00170, V00191, etc.), V00191 with S lane etc. V00192 not in any conflict pair. So admitting V00192 seems safe same-tick. But wait — is E_R1_RIGHT route physically fine? The discharging lanes show nothing for E_R1. The reservation blocks listed don't include E_R1_RIGHT.」→ CROSSWALK:WEST:CELL:0:0 vs V00046
  - c16 r1 t162：「 vehicles we want to admit. Actually, pedestrians crossing block vehicles (jaywalker_warnings) if the pedestrian is jaywalking. But properly phased pedestrians should be OK for vehicles whose routes don't conflict. Wait, actually the interaction is the opposite. Vehicles' routes have to be checked against pedestrian reservations. 」→ CROSSWALK:WEST:CELL:0:0 vs V00046
  - c16 r2 t162：「at would give me confidence to commit. Actually, per the rules, the reservation checks use "已预约车辆" which are the SCHEDULED_ENTERING ones. So a dry_run ok means no conflict with reserved vehicles. But it may not check vehicle physical motion? Actually it just checks the reservation table. Hmm. The WEST dry_run failed because V0004」→ CROSSWALK:NORTH:CELL:1:0 vs V00075
  - c21 r1 t173：「h V00073, V00012, V00009 - V00170 with V00070, V00031 - V00191 with V00070, V00031 - V00070 with V00073, V00031 - V00073 with V00012 So V00169 (S_R1_RIGHT) has no conflicts with any other stopline candidate. Now, discharging lanes show IN_S_S1_STRAIGHT is actively discharging (3 vehicles remaining, next enter at 174). S_R1_RIGHT i」→ CROSSWALK:NORTH:CELL:0:0 vs INCIDENT
  - c27 r2 t179：「hink about conflict: E_R1_RIGHT right turn east. Does it conflict with the discharging W_R1_RIGHT at 193? V00146 enters at 193. Our V00212 enters now. Possibly no conflict if timing differs. Let me also consider lane batch: IN_E_R1_RIGHT has 3 queued vehicles. V00212 is head. Could admit top_n=1 or 2/3. But the vehicles behind V0」→ CROSSWALK:NORTH:CELL:0:0 vs INCIDENT
- 自我修正标记（Wait/Actually/Let me recheck…）：共 4309 次，每次回复 平均 24.2，P50 14，P95 75，最大 106（n=178）
- 认知模式 letterCounting：29 处
  - 「future cycle seems to be a fresh observation anyway. I'll skip working memory to save calls, and instead encode my plan in the tactical_summary of commit. Wait, actually, the tactical_summary is only 300 chars and goes to... it's recorded. Fine, I'll summarize there. Let me finalize my tool calls for this cycle. Round of parallel calls (all independent): 1. dry_run_admit with the batch. 2. dispatch_tow_tru」
  - 「tools costs money; a no-op costs 0.0015. Skip. Final: manage_working_memory SAVE_PLAN + commit_schedule(sleep_ticks=10, tactical_summary). Let me craft the plan_data within constraints: - phase_name ≤80 chars: "等预约解封：147后放北/西轴与紧急V00056" - intended_duration: 40 (ticks) - resume_condition ≤160: "tick>=147: 先放V00056(N_L1紧急)+V00103(W_R1)+V00031(W_L1);W_S1/S2要到152/154,E轴持续放行" Summary ≤300 chars. I'll issue bot」
  - 「 It's a non-terminal tool call → 0.0015. Fine. Let me also verify the commit won't violate anything. The N_S1 batch dry_run ok. Commit same params. Good. Let me write the tactical_summary concisely (≤300 chars). One more consideration: The dry_run reward 1.1 and the fact that V00094 and V00127 enter at 175 and 180. My sleep_ticks=8 means the round advances 170→178. During that, V00094 enters at 175 (within」
- 认知模式 idFormat：1 处
  - 「 from the south side going north. Left turn from northbound = west. Alternatively, in some conventions lanes on the south side carry traffic exiting southward (i.e., the lane is at the exit). But no, IN_ prefix = incoming. Hmm, actually let me reconsider: maybe convention here is by the side of the intersection the lane is on, and traffic flows INTO the intersection from that side. So IN_S = on the south si」

### 2.2 复杂环境博弈

**行人与车辆**

- 行人相位尝试 29 次，成功 3 次 {"RESOURCE_CONFLICT":21,"DRY_RUN_QUOTA_EXHAUSTED":5,"OK":3}
- 实际放行 1 批 2 人；闯红灯 19 次 19 人；被撞 2 人；奖励 0，扣费 {"delay":1.05,"jaywalk":10.4,"strike":10}

行人相位冲突样例：

| 周期 | tick | 冲突偏移 at | 冲突 |
| --- | --- | --- | --- |
| 14 | 152 | 0 | CROSSWALK:WEST:CELL:0:0 vs V00028 |
| 15 | 160 | 3 | CROSSWALK:WEST:CELL:0:0 vs V00046 |
| 16 | 162 | 1 | CROSSWALK:WEST:CELL:0:0 vs V00046 |
| 16 | 162 | 4 | CROSSWALK:NORTH:CELL:1:0 vs V00075 |
| 17 | 165 | 0 | CROSSWALK:WEST:CELL:0:0 vs V00046 |
| 21 | 173 | 0 | CROSSWALK:NORTH:CELL:0:0 vs INCIDENT |
| 24 | 176 | 0 | CROSSWALK:NORTH:CELL:0:0 vs INCIDENT |
| 27 | 179 | 0 | CROSSWALK:NORTH:CELL:0:0 vs INCIDENT |
| 30 | 184 | 0 | CROSSWALK:NORTH:CELL:0:0 vs INCIDENT |
| 30 | 184 | 20 | CROSSWALK:EAST:CELL:2:1 vs V00226 |

在行人耐心告急（PATIENCE_CRITICAL）时放行、且路线经过该横道的车辆：36 车次

| 周期 | tick | 车辆 | 路线 | 横道 | 行人 | 剩余耐心 | 该行人后来被撞 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 11 | 142 | V00164 | E_S1_STRAIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 24 |  |
| 13 | 147 | V00028 | N_R1_RIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 23 | 是 |
| 13 | 147 | V00041 | N_R1_RIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 23 | 是 |
| 13 | 147 | V00046 | N_R1_RIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 23 | 是 |
| 13 | 147 | V00103 | W_R1_RIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 23 | 是 |
| 13 | 147 | V00122 | W_R1_RIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 23 | 是 |
| 17 | 165 | V00053 | N_R1_RIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 21 |  |
| 17 | 165 | V00053 | N_R1_RIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 5 | 是 |
| 18 | 170 | V00080 | N_S1_STRAIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 16 |  |
| 18 | 170 | V00094 | N_S1_STRAIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 16 |  |
| 18 | 170 | V00127 | N_S1_STRAIGHT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 16 |  |
| 24 | 176 | V00073 | S_L1_LEFT | CROSSWALK:WEST | PED:44:0:CROSSWALK:WEST | 23 |  |
| 24 | 176 | V00073 | S_L1_LEFT | CROSSWALK:WEST | PED:45:1:CROSSWALK:WEST | 24 |  |
| 25 | 177 | V00031 | W_L1_LEFT | CROSSWALK:NORTH | PED:20:0:CROSSWALK:NORTH | 9 |  |
| 25 | 177 | V00031 | W_L1_LEFT | CROSSWALK:WEST | PED:44:0:CROSSWALK:WEST | 22 |  |

行人时间线：

| tick | 事件 | 横道 | 人数 |
| --- | --- | --- | --- |
| 142 | PED_GRANT | CROSSWALK:EAST | 2 |
| 169 | PED_COLLISION | CROSSWALK:WEST | 1 |
| 170 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 186 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 199 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 200 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 205 | PED_JAYWALK | CROSSWALK:SOUTH | 1 |
| 208 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 211 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 211 | PED_COLLISION | CROSSWALK:EAST | 1 |
| 212 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 225 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 228 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 234 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 241 | PED_JAYWALK | CROSSWALK:SOUTH | 1 |
| 241 | PED_JAYWALK | CROSSWALK:SOUTH | 1 |
| 244 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 244 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 249 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 249 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 257 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 260 | PED_JAYWALK | CROSSWALK:WEST | 1 |

**事故处置**

| 事故 | 类型 | 发生 | 车辆 | 行人 | 首次响应 | 清障令 | 清障调用次数 | 关闭 | 事故后才放行、后来卷入 | 非模型放行（抢行） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| INC0001 | PILEUP | 169 | 3 | 1 | 170 | 170 | 7 | 195 | V00080@170 |  |
| INC0002 | PILEUP | 177 | 11 | 0 | 177 | 177 | 15 | 255 | V00191@181 | V00012 V00009 V00132 V00054 |
| INC0003 | ANGLE_COLLISION | 211 | 1 | 1 | 212 | 212 | 2 | 228 |  |  |

事故成本估算：

| 事故 | 最终严重度 | 锁格（含二次） | 开放拍数 | 危化品 | 校车 | 分摊锁格费 | 估算总成本 | 放行来源 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| INC0001 | CRITICAL | 27 | 26 |  |  | 4.326 | 9.326 | V00046@c13 V00053@c17 V00080@c18 |
| INC0002 | CRITICAL | 195 | 78 |  |  | 93.73 | 93.73 | V00012@c- V00075@c14 V00009@c- V00064@c14 V00129@c22 V00031@c25 V00132@c- V00073@c24 V00054@c- V00049@c15 V00191@c28 |
| INC0003 | SERIOUS | 26 | 17 |  |  | 1.816 | 6.816 | V00204@c35 |

**司机抢行**

总计 {"redLight":3,"tailgate":2,"cutIn":1}

| 周期 | 类型 | 车辆 | 此前出现在 driverAlerts 的周期数 | 最后一次预警 | 卷入事故 |
| --- | --- | --- | --- | --- | --- |
| 10 | VEHICLE_RED_LIGHT | V00017 | 1 | IN_N_R1_RIGHT 距停止线 1 剩余 5 |  |
| 21 | VEHICLE_TAILGATE | V00054 | 1 | IN_S_S2_STRAIGHT 距停止线 8 剩余 0 | INC0002 |
| 22 | VEHICLE_RED_LIGHT | V00012 | 5 | IN_W_S1_STRAIGHT 距停止线 0 剩余 0 | INC0002 |
| 23 | VEHICLE_RED_LIGHT | V00009 | 1 | IN_W_S2_STRAIGHT 距停止线 0 剩余 0 | INC0002 |
| 25 | VEHICLE_TAILGATE | V00132 | 0 |  | INC0002 |

**紧急车辆与抛锚**

紧急车辆延误扣费 0.642

| 车辆 | 首次进入 12 格 | 放行 tick | 等待拍数 | 最长静止 |
| --- | --- | --- | --- | --- |
| V00034 | 71 | 117 | 46 | 42 |
| V00036 | 71 | 102 | 31 | 21 |
| V00050 | 71 | 89 | 18 | 0 |
| V00056 | 81 | 152 | 71 | 66 |
| V00096 | 160 |  |  | 62 |
| V00101 | 160 |  |  | 61 |
| V00212 | 160 | 182 | 22 | 7 |
| V00145 | 176 |  |  | 60 |
| V00043 | 179 |  |  | 79 |
| V00255 | 182 |  |  | 49 |

拖车费 7.2，链式加价 1.129

| 车辆 | 车道 | 抛锚 | 派拖车 | 派车延迟 | 绕行 |
| --- | --- | --- | --- | --- | --- |
| V00006 | IN_N_R1_RIGHT | 63 | 110 | 47 |  |
| V00014 | IN_S_R1_RIGHT | 64 | 110 | 46 |  |
| V00122 | IN_W_R1_RIGHT | 151 | 152 | 1 |  |
| V00068 | IN_N_L1_LEFT | 155 | 160 | 5 |  |
| V00089 | IN_S_S1_STRAIGHT | 173 | 174 | 1 |  |
| V00217 | IN_E_R1_RIGHT | 186 | 187 | 1 |  |

### 2.3 亮眼操作与最差操作

周期价值 = 未卷入事故的放行车数 + 1.5×放行行人 + 2×成功的特情工具 − 归因事故成本。事故成本按锁格×开放时长分摊本局真实锁格扣费，再加撞人和校车罚款，平均分给放行了涉事车辆的周期。这是用于挑选证据的启发式，不是精确账目。

亮点事件：

| tick | 周期 | 类型 | 说明 |
| --- | --- | --- | --- |
| 71 | 2 | LARGE_VERIFIED_RELEASE | 11 vehicles, blame=0 |
| 81 | 3 | EMERGENCY_CONVOY | V00036 on IN_W_R1_RIGHT |
| 110 | 6 | TOW_DISPATCH | V00006 |
| 110 | 6 | TOW_DISPATCH | V00014 |
| 134 | 9 | LANE_GUIDANCE | V00063 IN_W_S1_STRAIGHT->IN_W_R1_RIGHT |
| 142 | 11 | PED_GRANT | CROSSWALK:EAST B_TO_A x2 |
| 152 | 14 | TOW_DISPATCH | V00122 |
| 152 | 14 | LARGE_VERIFIED_RELEASE | 12 vehicles, blame=26.78 |
| 160 | 15 | TOW_DISPATCH | V00068 |
| 160 | 15 | LARGE_VERIFIED_RELEASE | 11 vehicles, blame=13.39 |
| 174 | 22 | TOW_DISPATCH | V00089 |
| 187 | 33 | TOW_DISPATCH | V00217 |

#### 得分最高的周期

**周期 2（tick 71）**：放行 11，未出事 11，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -0.28，提交类型 verified，睡眠 10

- 观测要点：余额 999.89，停止线候选 9，受阻路线 1，行人预警 []，司机预警 []，紧急车 [V00034, V00036, V00050]，抛锚 [V00006, V00014]
- 工具序列：r1 dry_run_admit -> ok；r2 commit_schedule -> ok
- 战术摘要：放行 N_S1/N_S2/S_S1/E_S1 整轴直行批次，吃下校车侧 N_S1 队列、S_S1 upstream 积压与紧急车 V00050，休眠 10 拍等待批次出清。
- 推理摘录：Let me analyze the current state. Current tick 71, endTick 261, 190 ticks remaining. Balance 999.89 (slightly down from 1000 due to upstream queue penalties 0.068 and api costs). Key observations: - stoplineCandidates: 9 vehicles at stoplines across lanes: E_L1_LEFT (V00008), E_S1_STRAIGHT (V00018), N_S1 (V00015), N_S2 (V00010), S_L1_LEFT (V00019 truck), S_S1_STRAIGHT (V00026 truck 3 passengers), W_R1_RIGHT (V00022), W_S1 (V00012), W_S2 (V00009). - blockedRoutes: W_R1_RIGHT RESERVATION blocked u ……  dischargingLanes will report progress; V00018/V00024 entering at 88/92 remain scheduled, so no duplicate admission. Potential issue: exitHolds OUT_NORTH_3 blocked until 72 — N_S1/N_S2 vehicles exit north presumably. They enter at 71 and clear at ~88; exit free by then. OK. Commit now with sleep 10.

**周期 1（tick 61）**：放行 8，未出事 8，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -0.11，提交类型 verified，睡眠 10

- 观测要点：余额 1000，停止线候选 7，受阻路线 0，行人预警 []，司机预警 []，紧急车 []，抛锚 []
- 工具序列：r1 dry_run_admit -> ok；r2 commit_schedule -> ok
- 战术摘要：批次放行大部分右转/直行/左转主线，跳过与西直行冲突的东左转，让清洁车辆高价值疏散。
- 推理摘录：We need answer with tool calls. Need act as traffic scheduler. Need reason maximize final balance. We have 8 API rounds? We need use calls. Current observation tick61, 200 ticks. Need decide schedule. We need emit one or more tool calls, likely dry_run then commit. We only have response maybe function calls. We should not call final natural answer except if asking? We are agent. Need choose actions. Let's understand state. Financial 1000. End tick261. Need release vehicles for income. Costs. Sto …… ther while discharges? But commit_schedule terminal includes sleep; after observation, dischargingLanes will show remaining. Good. Should we include vehicles in admit_vehicle_ids? Dry-run had no candidate_vehicle_ids. Commit schema optional admit_vehicle_ids; if same no explicit. Good. Let's commit.

**周期 7（tick 111）**：放行 8，未出事 8，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -2.131，提交类型 verified，睡眠 10

- 观测要点：余额 994.49，停止线候选 11，受阻路线 9，行人预警 []，司机预警 []，紧急车 [V00034, V00056]，抛锚 [V00006, V00014]
- 工具序列：r1 dry_run_admit -> PLANNING_HORIZON_EXCEEDED (Admission planning horizon exceeded for V00146)；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 战术摘要：放行东西右转全部可行队列 E_R1×4+W_R1×4（62名乘客），预计+5.6，出清后入口可接上游积压。睡10拍到121，届时S_S1(122)/S_S2(123)/N_L1(123)预约将到期，最后一轮再抢这三个队首。不动被预约挡住的西/北大线与校车、HAZMAT 车；拖车已在路上不重复派。
- 推理摘录：Let me analyze the current state: Current tick: 111, end tick: 261, so 150 ticks remaining. Financial balance: 994.4929. Key observations: 1. Emergency vehicle V00056 at IN_N_L1_LEFT, waiting 25 ticks, distanceToStopline=0, stationaryTicks=25. This is costing 0.0015/tick. 2. Emergency V00034 at IN_S_L1_LEFT is queueIndex 2, blocked behind V00027, stationaryTicks=42. The dischargingLanes says IN_S_L1_LEFT has 4 remaining vehicles, nextEnterTick=112. So V00027 is scheduled to enter at tick 112, V0 …… allel 4 each. Should I try to squeeze more? The remaining E_R1 queue was 4 (exhausted). W_R1 had 8 queued; we took top 4; more would exceed horizon. Fine. Now commit same plan. sleep_ticks: 10 (advance to 121). Commit then final round decides. Let me commit with same lane_batches and sleep_ticks 10.

**周期 9（tick 131）**：放行 8，未出事 8，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -1.013，提交类型 verified，睡眠 10

- 观测要点：余额 990.73，停止线候选 13，受阻路线 7，行人预警 []，司机预警 [V00063:2, V00017:5, V00008:9, V00030:9, V00095:12]，紧急车 [V00056]，抛锚 []
- 工具序列：r1 dry_run_admit -> ok；r2 commit_schedule -> ok
- 战术摘要：东向放行 E_L1×3+E_R1×3+E_S1×2（8辆，+1.6），包含紧急队首 V00008 防其闯红灯撞车。南北西大排队仍被预约挡到136-145，且被V00008左转冲突挡住，睡10到141等N_L1到期与东向batch清出路口再下一批。
- 推理摘录：Let me analyze this observation carefully. Current state: - Tick 131, endTick 261, 130 ticks remaining - Balance: 990.7279 - Last settlement was negative: -1.6337 (costs exceeding revenue) Key observations: 1. **Blocked routes** (RESERVATION - can wait): - N_L1_LEFT (until 141) - N_S1_STRAIGHT (until 144) - N_S2_STRAIGHT (until 143) - S_S1_STRAIGHT (until 139) - W_L1_LEFT (until 139) - W_R1_RIGHT (until 145) - W_S2_STRAIGHT (until 136) 2. **Stopline candidates** - vehicles waiting at stopline: - …… onflict)? V00008 enters 131, left turn; if it clears conflict cells by ~140 and W_S2 frees at 136... but V00008 still in intersection till 150 per plan. The dry-run at 136 would probably show W_S2 blocked by RESERVATION till ~150. So no. Therefore sleep 10, next decision at 141. Fine. Let me commit.

**周期 5（tick 100）**：放行 7，未出事 7，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -1.294，提交类型 verified，睡眠 10

- 观测要点：余额 998.39，停止线候选 12，受阻路线 5，行人预警 []，司机预警 []，紧急车 [V00034, V00036, V00056]，抛锚 [V00006, V00014]
- 工具序列：r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 战术摘要：放行东轴全部排队（E_S1×3、E_S2×3、E_R1×1）共约12.5收入+减少延误，预计133出清。睡10拍到110，届时W_S1/W_S2预约到期，改放西大批。暂不动S_L1正在放行的车道与校车/危险品S_S2（等轴空闲）。
- 推理摘录：Let me analyze the current state carefully. Current tick: 100, endTick: 261, ticksRemaining: 161. Balance: 998.3923. Key observations: 1. Emergency vehicles: V00056 in IN_N_L1_LEFT at stopline, stationaryTicks=14 (charging 0.0015/tick). V00034 in IN_S_L1_LEFT stationaryTicks=31. V00036 in IN_W_R1_RIGHT at distance 2, stationaryTicks=0 (will enter at tick 102). 2. Blocked routes (RESERVATION): - E_L1_LEFT blockedUntilTick=133 - N_S1_STRAIGHT until 138 - N_S2_STRAIGHT until 137 - W_S1_STRAIGHT unt …… in when lanes free. At tick 110: West straight reservations expire at 108 and 110. Good, we can admit W_S1 and W_S2 then. Let me commit with sleep 10. Also, should I use the second dry-run now for a combined plan (e.g., East axis + something in the same dry-run)? Not needed and risky. Let me commit.

#### 损失最大的周期

**周期 14（tick 152）**：放行 12，未出事 10，放行行人 0，耐心风险放行 0，归因成本 26.78，周期余额变化 -3.497，提交类型 verified，睡眠 8

- 观测要点：余额 990.43，停止线候选 11，受阻路线 0，行人预警 [W:P18]，司机预警 [V00030:0, V00095:0, V00097:3, V00114:4, V00178:4, V00107:5, V00176:10, V00139:11]，紧急车 [V00056]，抛锚 [V00122]
- 工具序列：r1 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:WEST:CELL:0:0 vs V00028)；r1 dispatch_tow_truck -> ok；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 后果：INC0002 PILEUP tick=177 vehicles=11 pedestrians=0 estCost=93.73
- 战术摘要：北轴整批放行：紧急V00056+N_S1×3+N_S2×8，reward2.3；拖车V00122已派(170到)。注意V00097将在186尾冲N_S2，后续周期避开其路径。下轮160放南轴。
- 推理摘录：Let me carefully analyze this situation. I need to balance maximizing revenue (getting vehicles out) against costs (delays, penalties). Current state: - Tick 152/261, 109 ticks remaining, balance 990.4291 - Last cycle: admitted 10 vehicles (mostly right-turns), revenue 0.5, but delay costs 0.5898, upstream 0.738, emergency 0.0075, pedestrian delay 0.01. Net delta -0.8868. Working memory: "等预约解封：147后放北/西轴与紧急V00056" targetTick 177, not expired. Key things to consider: **Vehicles at stoplines (cand ……  → 160, standard. Hmm, actually let me think about maximizing: next cycle at 160 I can admit S axis heads (V00073 S_L1, V00039 S_S1, V00035 S_S2) with top_n batches. That's the natural cadence. Sleep 8. Commit now with verified params, sleep 8, summary mentioning tow dispatched, tailgate risk noted.

**周期 28（tick 181）**：放行 7，未出事 6，放行行人 0，耐心风险放行 14，归因成本 13.39，周期余额变化 -1.484，提交类型 verified，睡眠 10

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:38:0:CROSSWALK:SOUTH remaining=24; ACCIDENT_INTERRUPT incident=INC0002 locked=CROSSWALK:WEST:CELL:4:0,CROSSWALK:WEST:CELL:4:1,CROSSWALK:WEST:CELL:5:0,CROSSWALK:WEST:
- 观测要点：余额 981.27，停止线候选 8，受阻路线 24，行人预警 [N:P5, S:P24, W:P18, W:P19]，司机预警 [V00023:0, V00030:0, V00124:0, V00112:0, V00107:0, V00126:0, V00097:0, V00085:0]，紧急车 [V00043, V00096, V00101, V00145, V00212]，抛锚 [V00089]
- 工具序列：r1 dry_run_admit -> ok；r2 commit_schedule -> ok
- 后果：INC0002 PILEUP tick=177 vehicles=11 pedestrians=0 estCost=93.73
- 战术摘要：放E_S2整批7车94人(+10.3),181起排入236清。睡10至191:E_S1/N_R1于195解封(INC0001),下轮放行解围紧急V00096/00101;E_L1/W/S/N_S2等大队伍待220(INC0002)后分批处理。
- 推理摘录：Let me分析当前情况。currentTick=181, endTick=261, 还有80拍。余额981.27。 关键信息： 1. 两个事故 INC0001 和 INC0002 都在活跃，blockedRoutes 显示大量路线被 INCIDENT 切断。 2. stallV00089 在 IN_S_S1_STRAIGHT, towTask EN_ROUTE completion_tick=192, remainingTicks=11. 3. emergencyAlerts: V00096 (IN_N_R1_RIGHT, stationaryTicks=11, 扣分中), V00101 (IN_N_R1_RIGHT, stationaryTicks=10), V00145 (IN_N_S1_STRAIGHT, stationaryTicks=3), V00212 (IN_E_R1_RIGHT, stationaryTicks=3, 已放行). 4. dischargingLanes: IN_W_R1_RIGHT remaining 1, nextEnter 193, estimat …… nlock). Committing at 181 and sleeping 10 → 191. At 191 still blocked. Sleep 4 more → 195. I'll sleep 10 now → 191. Then next decision sleep to ~195. Actually, we could sleep 10 and that's fine. Let me commit. tactical_summary: admit E_S2 batch 7 vehicles 94 pax, sleep to 191, then E_S1/N_R1 at 195.

**周期 25（tick 177）**：放行 2，未出事 1，放行行人 0，耐心风险放行 3，归因成本 13.39，周期余额变化 -1.2，提交类型 verified，睡眠 6

- 唤醒原因：VEHICLE_TAILGATE vehicle=V00132 route=S_S2_STRAIGHT; ACCIDENT_INTERRUPT incident=INC0002 locked=CROSSWALK:WEST:CELL:6:0,CROSSWALK:WEST:CELL:6:1,PAIR:N_S1_STRAIGHT:10|N_R1_GUIDED_STRAIGHT:10,PAIR:N_S1_
- 观测要点：余额 982.45，停止线候选 6，受阻路线 17，行人预警 [N:P9, W:P22, W:P23]，司机预警 [V00030:0, V00124:0, V00107:0, V00112:0, V00126:0, V00097:0, V00085:0, V00095:0]，紧急车 [V00096, V00101, V00145, V00212]，抛锚 [V00068, V00089]
- 工具序列：r1 inspect_incident -> ok；r1 dry_run_admit -> ok；r2 order_accident_clearance -> ok；r2 commit_schedule -> ok
- 后果：INC0002 PILEUP tick=177 vehicles=11 pedestrians=0 estCost=93.73
- 战术摘要：INC0002轻微刮擦,先向OUT_EAST_1清障。放行S_R1卡车V00194(3人,+0.3)与W_L1左转V00031(+0.1)。睡6拍至183:等INC0002解封西/北轴,届时批量放行W_S2(114人)/W_S1(64人)。
- 推理摘录：Let me analyze the current situation carefully. Current state: - Tick 177, endTick 261, ticksRemaining 84 - Financial balance: 982.4522 - The working memory plan is expired. Interrupt reason: VEHICLE_TAILGATE vehicle=V00132 route=S_S2_STRAIGHT; ACCIDENT_INTERRUPT incident=INC0002 locked cells... So there's an ACCIDENT_INTERRUPT for INC0002. Per instructions: If interruptReason starts with ACCIDENT_INTERRUPT, first call inspect_incident, then order_accident_clearance, or set_lane_detour. Do not a …… ght, execute order + commit. For commit, summary: "INC0002 MINOR SCRAPE→OUT_EAST_1清障。放行S_R1卡车V00194(+0.3)与W_L1左转V00031(+0.1)。睡6拍至183，待W/西轴解封后批量放行W_S1/W_S2大流量。" sleep_ticks 6. vehicle params: candidate → admit_vehicle_ids ["V00194","V00031"]. No speed profiles (CRUISE default). No peds. Let me do it.

**周期 24（tick 176）**：放行 1，未出事 0，放行行人 0，耐心风险放行 2，归因成本 13.39，周期余额变化 -0.754，提交类型 verified，睡眠 9

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:45:1:CROSSWALK:WEST remaining=24
- 观测要点：余额 983.21，停止线候选 6，受阻路线 10，行人预警 [N:P10, W:P23, W:P24]，司机预警 [V00030:0, V00124:0, V00107:0, V00112:0, V00126:0, V00097:0, V00085:0, V00095:0]，紧急车 [V00096, V00101, V00145, V00212]，抛锚 [V00068, V00089]
- 工具序列：r2 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:NORTH:CELL:0:0 vs INCIDENT)；r3 dry_run_admit -> ok；r4 commit_schedule -> ok
- 后果：INC0002 PILEUP tick=177 vehicles=11 pedestrians=0 estCost=93.73
- 战术摘要：放行 S_L1 卡车 V00073(出口WEST空闲,+0.1)。NORTH人行道被INC0001锁格不可放人；WEST行人耐心23-24暂不占用W轴通行。E_S2预约185解封、E_L1解封187，睡9拍到185优先批量放行E_S2(含40人公交V00191)。V00068拖车178到达。事故清障进行中(~195)。
- 推理摘录：Let me analyze this situation carefully. Current state: - Tick 176, endTick 261, 85 ticks remaining - Balance: 983.2064 - Working memory says: "等预约解封：147后放北/西轴与紧急V00056", target tick 177, not expired Key observations: 1. **INC0001 PILEUP** is blocking many routes (E_S1_STRAIGHT, N_* routes) until tick ~195. Must NOT admit vehicles on these routes. 2. **Blocked routes RESERVATION**: E_L1_LEFT (187), E_S2_STRAIGHT (185) - these are in-transit reservations, can wait. 3. Blocked routes INCIDENT: N_S …… l gain is tiny, the risk is moderate. But it's done; no revoke. Move on. Commit with sleep 9. Actually, one more consideration on sleep length: E_S2 clears at 185 (reservation blockedUntilTick 185). If I sleep 9 → currentTick 185. Good. Sleep in commit: "sleep_ticks 1..10". 176+9=185. Let me commit.

**周期 15（tick 160）**：放行 11，未出事 10，放行行人 0，耐心风险放行 0，归因成本 13.39，周期余额变化 -1.847，提交类型 verified，睡眠 6

- 观测要点：余额 986.93，停止线候选 11，受阻路线 8，行人预警 [W:P10]，司机预警 [V00030:0, V00095:0, V00097:0, V00114:0, V00178:0, V00107:2, V00176:2, V00139:3]，紧急车 [V00096, V00101, V00212]，抛锚 [V00068, V00122]
- 工具序列：r1 dry_run_admit -> RESOURCE_CONFLICT (CROSSWALK:WEST:CELL:0:0 vs V00046)；r1 dispatch_tow_truck -> ok；r2 dry_run_admit -> ok；r3 dry_run_admit -> DRY_RUN_QUOTA_EXHAUSTED；r4 commit_schedule -> ok
- 后果：INC0002 PILEUP tick=177 vehicles=11 pedestrians=0 estCost=93.73
- 战术摘要：南轴S_S1×6+S_S2×2与东右转×3并发放行(reward5.3)，清空E_R1为紧急V00212开路；拖车V00068已派(178清)。睡6到166，下轮放E_L1并重试WEST行人相位(避开在途V00046)，171放N_R1含紧急V00096/V00101。
- 推理摘录：Let me analyze this observation carefully. Current state: - Tick 160, endTick 261, ticksRemaining 101 - Balance: 986.9322 - Working memory: "等预约解封：147后放北/西轴与紧急V00056" targetTick 177, not expired Key observations: **BlockedRoutes (RESERVATION - these are just in-transit reservations, can wait):** - E_L1_LEFT blocked until 165 - E_S1_STRAIGHT blocked until 193 - E_S2_STRAIGHT blocked until 194 - N_R1_RIGHT blocked until 171 - S_L1_LEFT blocked until 197 - W_L1_LEFT blocked until 195 - W_S1_STRAIGH …… ters must EXACTLY match the verified dry run: lane_batches E_R1 3, S_S1 6, S_S2 2, no pedestrian phases, no vehicle_speed_profiles. Sleep 6. After commit, at 166: E_L1 unblocked (165). N_R1 unblocked 171. Try WEST ped phase again (V00046 should be done). N_L1 tow at 178. Tactical summary for commit.

### 附：逐周期一览

| 周期 | tick | 提交 | 放行 | 行人 | 耐心风险 | 归因事故 | 归因成本 | 余额变化 | 睡眠 | 唤醒原因 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 61 | verified | 8 | 0 | 0 |  | 0 | -0.11 | 10 |  |
| 2 | 71 | verified | 11 | 0 | 0 |  | 0 | -0.28 | 10 |  |
| 3 | 81 | hold | 0 | 0 | 0 |  | 0 | -0.457 | 10 |  |
| 4 | 91 | verified | 5 | 0 | 0 |  | 0 | -0.761 | 9 |  |
| 5 | 100 | verified | 7 | 0 | 0 |  | 0 | -1.294 | 10 |  |
| 6 | 110 | fallback | 0 | 0 | 0 |  | 0 | -2.605 | 1 |  |
| 7 | 111 | verified | 8 | 0 | 0 |  | 0 | -2.131 | 10 |  |
| 8 | 121 | verified | 4 | 0 | 0 |  | 0 | -1.634 | 10 |  |
| 9 | 131 | verified | 8 | 0 | 0 |  | 0 | -1.013 | 10 |  |
| 10 | 137 | hold | 0 | 0 | 0 |  | 0 | -1.145 | 10 | VEHICLE_RED_LIGHT vehicle=V00017 route=N_R1_RIGHT |
| 11 | 142 | verified | 1 | 0 | 1 |  | 0 | 3.051 | 4 | PEDESTRIAN_PATIENCE pedestrian=PED:11:0:CROSSWALK:EAST remai |
| 12 | 146 | fallback | 0 | 0 | 0 |  | 0 | -0.304 | 1 | PEDESTRIAN_PATIENCE pedestrian=PED:3:0:CROSSWALK:WEST remain |
| 13 | 147 | verified | 10 | 0 | 5 | INC0001 | 3.11 | -0.887 | 5 |  |
| 14 | 152 | verified | 12 | 0 | 0 | INC0002 | 26.78 | -3.497 | 8 |  |
| 15 | 160 | verified | 11 | 0 | 0 | INC0002 | 13.39 | -1.847 | 6 |  |
| 16 | 162 | hold | 0 | 0 | 0 |  | 0 | 7.252 | 3 | PEDESTRIAN_PATIENCE pedestrian=PED:20:0:CROSSWALK:NORTH rema |
| 17 | 165 | verified | 1 | 0 | 2 | INC0001 | 3.11 | -6.459 | 10 |  |
| 18 | 170 | verified | 3 | 0 | 3 | INC0001 | 3.11 | 0.686 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:3:0:CROSSWALK:WEST; ACCIDE |
| 19 | 171 | hold | 0 | 0 | 0 |  | 0 | -0.628 | 6 | ACCIDENT_INTERRUPT incident=INC0001 secondary=true |
| 20 | 172 | hold | 0 | 0 | 0 |  | 0 | 0.383 | 10 | ACCIDENT_INTERRUPT incident=INC0001 secondary=true |
| 21 | 173 | verified | 1 | 0 | 0 |  | 0 | -0.647 | 10 | VEHICLE_TAILGATE vehicle=V00054 route=S_S2_STRAIGHT |
| 22 | 174 | verified | 2 | 0 | 0 | INC0002 | 13.39 | -1.829 | 10 | VEHICLE_RED_LIGHT vehicle=V00012 route=W_S1_STRAIGHT |
| 23 | 175 | hold | 0 | 0 | 0 |  | 0 | -0.636 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:44:0:CROSSWALK:WEST remai |
| 24 | 176 | verified | 1 | 0 | 2 | INC0002 | 13.39 | -0.754 | 9 | PEDESTRIAN_PATIENCE pedestrian=PED:45:1:CROSSWALK:WEST remai |
| 25 | 177 | verified | 2 | 0 | 3 | INC0002 | 13.39 | -1.2 | 6 | VEHICLE_TAILGATE vehicle=V00132 route=S_S2_STRAIGHT; ACCIDEN |
| 26 | 178 | hold | 0 | 0 | 0 |  | 0 | -1.246 | 6 | ACCIDENT_INTERRUPT incident=INC0002 secondary=true |
| 27 | 179 | - | 1 | 0 | 1 |  | 0 | 1.267 | 10 | ACCIDENT_INTERRUPT incident=INC0002 secondary=true |
| 28 | 181 | verified | 7 | 0 | 14 | INC0002 | 13.39 | -1.484 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:38:0:CROSSWALK:SOUTH rema |
| 29 | 182 | verified | 3 | 0 | 3 |  | 0 | -3.142 | 10 | ACCIDENT_INTERRUPT incident=INC0002 secondary=true; ACCIDENT |
| 30 | 184 | hold | 0 | 0 | 0 |  | 0 | -1.793 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:43:0:CROSSWALK:NORTH rema |
| 31 | 185 | fallback | 0 | 0 | 0 |  | 0 | 1.727 | 1 | ACCIDENT_INTERRUPT incident=INC0002 locked=CROSSWALK:NORTH:C |
| 32 | 186 | hold | 0 | 0 | 0 |  | 0 | -1.325 | 9 | PEDESTRIAN_JAYWALK pedestrian=PED:20:0:CROSSWALK:NORTH |
| 33 | 187 | hold | 0 | 0 | 0 |  | 0 | -3.114 | 8 | PEDESTRIAN_PATIENCE pedestrian=PED:45:0:CROSSWALK:EAST remai |
| 34 | 188 | hold | 0 | 0 | 0 |  | 0 | -6.967 | 7 | ACCIDENT_INTERRUPT incident=INC0002 secondary=true |
| 35 | 195 | verified | 1 | 0 | 2 | INC0003 | 6.82 | -7 | 10 |  |
| 36 | 199 | hold | 0 | 0 | 0 |  | 0 | -2.396 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:44:0:CROSSWALK:WEST |
| 37 | 200 | hold | 0 | 0 | 0 |  | 0 | -1.85 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:45:1:CROSSWALK:WEST |
| 38 | 201 | hold | 0 | 0 | 0 |  | 0 | 0.115 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:61:0:CROSSWALK:EAST remai |
| 39 | 204 | hold | 0 | 0 | 0 |  | 0 | -2.584 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:68:0:CROSSWALK:NORTH rema |
| 40 | 205 | hold | 0 | 0 | 0 |  | 0 | -1.987 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:38:0:CROSSWALK:SOUTH |
| 41 | 208 | hold | 0 | 0 | 0 |  | 0 | -2.11 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:43:0:CROSSWALK:NORTH |
| 42 | 210 | fallback | 0 | 0 | 0 |  | 0 | -2.373 | 1 | PEDESTRIAN_PATIENCE pedestrian=PED:62:0:CROSSWALK:NORTH rema |
| 43 | 211 | hold | 0 | 0 | 0 |  | 0 | -7.547 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:50:0:CROSSWALK:NORTH |
| 44 | 212 | hold | 0 | 0 | 0 |  | 0 | -9.442 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:45:0:CROSSWALK:EAST; ACCID |
| 45 | 217 | hold | 0 | 0 | 0 |  | 0 | -6.062 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:80:0:CROSSWALK:SOUTH rema |
| 46 | 220 | fallback | 0 | 0 | 0 |  | 0 | -2.083 | 1 | PEDESTRIAN_PATIENCE pedestrian=PED:82:0:CROSSWALK:NORTH rema |
| 47 | 221 | hold | 0 | 0 | 0 |  | 0 | -9.559 | 10 |  |
| 48 | 225 | hold | 0 | 0 | 0 |  | 0 | -7.417 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:81:0:CROSSWALK:WEST remai |
| 49 | 228 | hold | 0 | 0 | 0 |  | 0 | -9.859 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:68:0:CROSSWALK:NORTH |
| 50 | 233 | hold | 0 | 0 | 0 |  | 0 | -2.971 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:87:0:CROSSWALK:WEST remai |
| 51 | 234 | hold | 0 | 0 | 0 |  | 0 | -0.724 | 4 | PEDESTRIAN_JAYWALK pedestrian=PED:62:0:CROSSWALK:NORTH |
| 52 | 236 | fallback | 0 | 0 | 0 |  | 0 | -2.508 | 1 | PEDESTRIAN_PATIENCE pedestrian=PED:106:0:CROSSWALK:WEST rema |
| 53 | 237 | hold | 0 | 0 | 0 |  | 0 | -2.33 | 8 |  |
| 54 | 238 | hold | 0 | 0 | 0 |  | 0 | -2.377 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:95:0:CROSSWALK:SOUTH rema |
| 55 | 239 | hold | 0 | 0 | 0 |  | 0 | -5.694 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:91:0:CROSSWALK:EAST remai |
| 56 | 241 | hold | 0 | 0 | 0 |  | 0 | -2.243 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:80:0:CROSSWALK:SOUTH; PEDE |
| 57 | 242 | hold | 0 | 0 | 0 |  | 0 | -5.613 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:113:0:CROSSWALK:WEST rema |
| 58 | 244 | hold | 0 | 0 | 0 |  | 0 | -7.629 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:98:0:CROSSWALK:NORTH rema |
| 59 | 247 | hold | 0 | 0 | 0 |  | 0 | -6.631 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:115:0:CROSSWALK:EAST rema |
| 60 | 249 | hold | 0 | 0 | 0 |  | 0 | -8.337 | 6 | PEDESTRIAN_JAYWALK pedestrian=PED:81:0:CROSSWALK:WEST; PEDES |
| 61 | 252 | hold | 0 | 0 | 0 |  | 0 | -6.153 | 3 | PEDESTRIAN_PATIENCE pedestrian=PED:119:0:CROSSWALK:WEST rema |
| 62 | 255 | hold | 0 | 0 | 0 |  | 0 | -3.813 | 6 |  |
| 63 | 257 | hold | 0 | 0 | 0 |  | 0 | -3.147 | 4 | PEDESTRIAN_JAYWALK pedestrian=PED:87:0:CROSSWALK:WEST |
| 64 | 259 | hold | 0 | 0 | 0 |  | 0 | -2.249 | 2 | PEDESTRIAN_PATIENCE pedestrian=PED:111:0:CROSSWALK:NORTH rem |
| 65 | 260 | hold | 0 | 0 | 0 |  | 0 | -1.654 | 1 | PEDESTRIAN_JAYWALK pedestrian=PED:106:0:CROSSWALK:WEST |

