# 运行分析：qwen-3.8-27b_2026-10-02_034707777-14640

- 模型：qwen-3.8-27b；种子 63916；规则版本 18；回放 schema 7
- 截止 tick 261，决策周期 57，最终余额 **575.26**
- 生成时间 2026-10-01T21:35:23.967Z；数据文件：replay_qwen-3.8-27b_2026-10-02_034707777-14640.json、report_qwen-3.8-27b_2026-10-02_034707777-14640.json、api-log_qwen-3.8-27b_2026-10-02_034707777-14640.jsonl、raw-api-log_qwen-3.8-27b_2026-10-02_034707777-14640.jsonl

## 1. 基础分析

### 1.1 上下文能力

- prompt tokens：平均 12858.8，P50 12820，P95 13875，最大 14409（n=137）
- completion tokens：平均 5230.5，P50 4235，P95 13175，最大 16384（n=137）；其中推理 tokens：平均 5074，P50 4099，P95 12995，最大 16384（n=137）
- 每周期 API 轮数：平均 2.5，P50 2，P95 5，最大 7（n=57）；上限 8，用满上限的周期 0 个
- 每次请求的平均字符数：系统提示 10197.4，user 7094，工具结果 593.3，assistant 319.1；消息条数 平均 4.5，P50 4，P95 10，最大 14（n=140）
- 工具参数中的 ID 共 278 个：出现在当轮可见上下文里的占 0.975，当轮不可见但本局别处出现过 0 个，本局从未出现 0 个，非规范横道短键 7 个

| ID 类型 | 总数 | 当轮可见 | 别处出现 | 从未出现 | 非规范短键 |
| --- | --- | --- | --- | --- | --- |
| vehicle | 88 | 88 | 0 | 0 | 0 |
| routeAsLaneId | 65 | 65 | 0 | 0 | 0 |
| lane | 78 | 78 | 0 | 0 | 0 |
| incident | 40 | 40 | 0 | 0 | 0 |
| crosswalkShortKey | 7 | 0 | 0 | 0 | 7 |

- 同一周期内重复提交已失败的相同调用：0 次 {}
- 提交类型：verified 22，unverified 1，hold 31；放行类提交中 verified 占 0.957
- working memory：调用 3 次 {"SAVE_PLAN":3}，观测里带有计划的周期 23 个

### 1.2 注意力分布

关注率 = 字段出现在该周期观测里、且推理文本提到它的周期数 / 字段出现的周期数。

| 概念 | 出现周期 | 提到且出现 | 关注率 | 提到周期（含未出现） | 提及次数 |
| --- | --- | --- | --- | --- | --- |
| crosswalks | 57 | 57 | 1 | 57 | 5492 |
| reservedUntil | 43 | 43 | 1 | 54 | 2889 |
| pedestrianAlerts | 46 | 46 | 1 | 54 | 4231 |
| dischargingLanes | 14 | 14 | 1 | 22 | 128 |
| timeBudget | 57 | 56 | 0.982 | 56 | 268 |
| incidentBlocked | 34 | 33 | 0.971 | 36 | 548 |
| stoplineCandidates | 57 | 54 | 0.947 | 54 | 427 |
| emergency | 57 | 54 | 0.947 | 54 | 604 |
| exits | 56 | 52 | 0.929 | 53 | 1436 |
| laneMatrices | 57 | 50 | 0.877 | 50 | 672 |
| activeVehicleMotions | 48 | 38 | 0.792 | 41 | 127 |
| candidateConflicts | 57 | 45 | 0.789 | 45 | 897 |
| stalledVehicles | 23 | 16 | 0.696 | 29 | 249 |
| driverAlerts | 49 | 33 | 0.673 | 36 | 606 |
| lastSettlement | 56 | 32 | 0.571 | 32 | 65 |
| recentCycles | 56 | 31 | 0.554 | 31 | 91 |
| revokedAdmissions | 19 | 10 | 0.526 | 15 | 29 |
| laneGuidance | 57 | 16 | 0.281 | 16 | 40 |
| holds | 45 | 10 | 0.222 | 10 | 31 |
| workingMemory | 23 | 5 | 0.217 | 8 | 16 |

中断响应：

| 中断类型 | 次数 | 有响应 | 响应率 | 判定规则 |
| --- | --- | --- | --- | --- |
| PEDESTRIAN_PATIENCE | 25 | 1 | 0.04 | 同周期任一试算或提交带 pedestrian_phases |
| VEHICLE_TAILGATE | 1 | 1 | 1 | 推理文本提到了中断对象 ID |
| PEDESTRIAN_JAYWALK | 15 | 10 | 0.667 | 推理文本提到了中断对象 ID |
| ACCIDENT_INTERRUPT | 16 | 14 | 0.875 | 同周期调用 inspect_incident / order_accident_clearance / set_lane_detour |
| VEHICLE_RED_LIGHT | 1 | 1 | 1 | 推理文本提到了中断对象 ID |

- 每次回复的推理字符数：平均 14531.8，P50 11459，P95 37177，最大 46926（n=137）

### 1.3 tool_call 准确性

- 工具调用 156 次，成功 141 次，成功率 0.904
- 失败分类：{"RESOURCE_CONFLICT":5,"LANE_HEAD_NOT_READY":3,"SCHEMA_ERROR":3,"DRY_RUN_QUOTA_EXHAUSTED":3,"ROUTE_SEVERED":1}
- 每次回复的工具调用数分布：{"0":3,"1":115,"2":16,"3":3}；finish_reason：{"tool_calls":134,"length":3}
- API 错误 3 次 {"400 status code (no body)":3}；回退周期 [9,49,50]
- 从未使用的工具：inspect_crosswalk、inspect_lane_queue、inspect_junction、set_lane_detour、dispatch_emergency_convoy、guide_inbound_lane_change

| 工具 | 调用 | 成功 | 成功率 | 结果分类 |
| --- | --- | --- | --- | --- |
| dry_run_admit | 52 | 40 | 0.769 | {"LANE_HEAD_NOT_READY":3,"OK":40,"RESOURCE_CONFLICT":5,"DRY_RUN_QUOTA_EXHAUSTED":3,"ROUTE_SEVERED":1} |
| commit_schedule | 56 | 54 | 0.964 | {"OK":54,"SCHEMA_ERROR":2} |
| dispatch_tow_truck | 4 | 4 | 1 | {"OK":4} |
| reroute_queue_around_stall | 1 | 1 | 1 | {"OK":1} |
| inspect_incident | 24 | 24 | 1 | {"OK":24} |
| order_accident_clearance | 16 | 16 | 1 | {"OK":16} |
| manage_working_memory | 3 | 2 | 0.667 | {"SCHEMA_ERROR":1,"OK":2} |

错误样例：

- **LANE_HEAD_NOT_READY**
  - c1 t61 dry_run_admit：Lane head is not ready: IN_N_S2_STRAIGHT；参数 `{"candidate_vehicle_ids":["V00008","V00003","V00005","V00001","V00004","V00007"],"lane_batches":[{"lane_id":"N_S2_STRAIGHT","top_n":3}]}`
  - c36 t205 dry_run_admit：Lane head is not ready: IN_S_R1_RIGHT；参数 `{"lane_batches":[{"lane_id":"IN_E_L1_LEFT","top_n":1},{"lane_id":"IN_E_R1_RIGHT","top_n":1},{"lane_id":"IN_S_R1_RIGHT","top_n":1}],"speed_profile":"CRUISE"}`
  - c46 t241 dry_run_admit：Lane head is not ready: IN_N_R1_RIGHT；参数 `{"lane_batches":[{"lane_id":"IN_N_R1_RIGHT","top_n":5,"speed_profile":"CRUISE"}]}`
- **RESOURCE_CONFLICT**
  - c14 t153 dry_run_admit：PAIR:N_L1_LEFT:8|S_S1_STRAIGHT:8 vs V00039,V00143；参数 `{"candidate_vehicle_ids":["V00036","V00113","V00053","V00019","V00143","V00039"],"vehicle_speed_profiles":[{"speed_profile":"BURST","vehicle_id":"V00036"}]}`
  - c28 t184 dry_run_admit：CROSSWALK:NORTH:CELL:7:0 vs V00142；参数 `{"pedestrian_phases":[{"crosswalk_id":"N","directions":["B_TO_A"]}]}`
  - c29 t185 dry_run_admit：CROSSWALK:NORTH:CELL:5:0 vs PED:20:0:CROSSWALK:NORTH；参数 `{"candidate_vehicle_ids":["V00148"],"pedestrian_phases":[{"crosswalk_id":"N","directions":["B_TO_A"]}]}`
- **SCHEMA_ERROR**
  - c14 t153 commit_schedule：[ { "code": "custom", "message": "Speed profile vehicle is not an explicit vehicle id: V00036", "path": [ "vehicle_speed_profiles", 0, "vehicle_id" ] } ]；参数 `{"candidate_vehicle_ids":"[\"V00036\", \"V00113\", \"V00053\", \"V00019\", \"V00143\"]","vehicle_speed_profiles":[{"speed_profile":"BURST","vehicle_id":"V00036"}],"sleep_ticks":8,"tactical_summary":"Admitted 5: V00036 (E`
  - c20 t174 commit_schedule：[ { "code": "custom", "message": "Speed profile vehicle is not an explicit vehicle id: V00027", "path": [ "vehicle_speed_profiles", 0, "vehicle_id" ] } ]；参数 `{"candidate_vehicle_ids":"[\"V00027\"]","vehicle_speed_profiles":[{"vehicle_id":"V00027","speed_profile":"CRUISE"}],"sleep_ticks":8,"tactical_summary":"ACCIDENT_INTERRUPT secondary for INC0001 (SERIOUS, 42 locked). Re-ta`
  - c27 t182 manage_working_memory：[ { "code": "too_big", "maximum": 160, "type": "string", "inclusive": true, "exact": false, "message": "String must contain at most 160 character(s)", "path": [；参数 `{"action":"SAVE_PLAN","plan_data":{"phase_name":"Wait for incident clearance","intended_duration":43,"resume_condition":"INC0003 clears (~tick 209): admit E_R1_RIGHT, S_R1_RIGHT, S_S1_STRAIGHT. INC0001 clears (~tick 225)`
- **DRY_RUN_QUOTA_EXHAUSTED**
  - c29 t185 dry_run_admit：-；参数 `{"candidate_vehicle_ids":["V00090"]}`
  - c35 t203 dry_run_admit：-；参数 `{"candidate_vehicle_ids":["V00159"]}`
  - c36 t205 dry_run_admit：-；参数 `{"lane_batches":[{"lane_id":"IN_E_R1_RIGHT","top_n":2}]}`
- **ROUTE_SEVERED**
  - c36 t205 dry_run_admit：none；参数 `{"lane_batches":[{"lane_id":"IN_E_L1_LEFT","top_n":1},{"lane_id":"IN_E_R1_RIGHT","top_n":1}]}`

### 1.4 Agent 能力

- 周期内工具序列（D=试算，C=提交，T=其他工具）：{"C":15,"DC":12,"DDC":8,"TTC":3,"TTDDC":2,"TTTC":2,"D":1,"DTC":1,"DDCC":1,"TTDTTDC":1,"TTDCC":1,"TTTTDC":1,"TTTTC":1,"TTTTDDDC":1,"DTTTTC":1,"TC":1,"DDDC":1,"TTDDDTC":1,"TTTDDC":1,"(none)":1,"TT":1}
- 含提交的周期里先试算再提交的比例：0.593
- 提交构成：{"verified":22,"unverified":1,"hold":31,"reckless":0}；每周期放行车数 平均 1.6，P50 0，P95 8，最大 10（n=57）；共放行 89 辆
- 成功提交 54 次，其中使用 lane_batches 15 次；每次 top_n 合计 平均 1.3，P50 0，P95 8，最大 10（n=54）
- 速度档位：{"CRUISE":42,"SLOW_SLIDE":2,"BURST":1}；sleep_ticks：平均 7.7，P50 10，P95 10，最大 10（n=56） {"1":3,"2":4,"3":1,"4":2,"5":4,"6":3,"8":8,"9":2,"10":29}
- 工具使用：{"commit_schedule":56,"dry_run_admit":52,"inspect_incident":24,"order_accident_clearance":16,"dispatch_tow_truck":4,"manage_working_memory":3,"reroute_queue_around_stall":1}
- 决策开销：API 140 次，扣 2.8；非终结工具 100 次，扣 0.15

与同条件 baseline 对比：

| 策略 | 最终余额 | 放行车辆 | 未服务负债 | 事故数 | 锁格扣费 | 上游积压 | 撞人 | 闯红灯罚 | 行人奖励 | 校车 | 拖车 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| qwen-3.8-27b | 575.26 | 89 | 209.4 | 6 | 122.18 | 61.49 | 20 | 9 | 0 | 10 | 4.8 |
| baseline-balanced | 674.49 | 84 | 219.6 | 6 | 21.3 | 58.85 | 25 | 5.5 | 0 | 0 | 8.4 |
| baseline-search | 788.38 | 122 | 185.4 | 2 | 3.69 | 45.85 | 10 | 6.7 | 0 | 0 | 8.4 |

## 2. 进阶分析

### 2.1 逻辑推理

- 试算失败（不含额度用完）9 次；之后再试 3 次，其中改了参数 3 次，成功 2 次（0.667）；失败所在周期最终 verified 提交 4 次、hold 5 次
- 推理中"路线 X 经过/不经过 Y 横道"的断言 381 条，正确 362，错误 19，准确率 0.95；前半局 4/91 错，后半局 15/290 错
  - c9：「N_L1_LEFT (if they cross S」（实际经过 CROSSWALK:NORTH+CROSSWALK:EAST）
  - c10：「S_S1_STRAIGHT goes from south to north - it would cross the E」（实际经过 CROSSWALK:SOUTH+CROSSWALK:NORTH）
  - c10：「W_S1_STRAIGHT goes from west to east - it would cross the N」（实际经过 CROSSWALK:WEST+CROSSWALK:EAST）
  - c10：「E_S1_STRAIGHT (from East, going straight = West) would cross the NORTH」（实际经过 CROSSWALK:EAST+CROSSWALK:WEST）
  - c36：「E_L1_LEFT crosses the N」（实际经过 CROSSWALK:EAST+CROSSWALK:SOUTH）
  - c44：「E_L1_LEFT) - crosses N」（实际经过 CROSSWALK:EAST+CROSSWALK:SOUTH）
  - c47：「E_L1_LEFT (N left turn): crosses N」（实际经过 CROSSWALK:EAST+CROSSWALK:SOUTH）
  - c47：「N_L1_LEFT) Routes that cross S」（实际经过 CROSSWALK:NORTH+CROSSWALK:EAST）
- 推理写"安全/无冲突"但同一轮试算冲突：4 次
  - c14 r2 t153：「EFT) conflicts with V00037 - V00035 (S_S2_STRAIGHT) conflicts with V00037 - V00039 (S_S1_STRAIGHT) - no explicit conflicts listed So V00039 (S_S1_STRAIGHT) has no conflicts with the vehicles I'm already admitting. Let me add it. Also, what about a pedestrian phase? The interrupt is about PED:24:0 on EAST crosswalk with 24 ticks re」→ PAIR:N_L1_LEFT:8|S_S1_STRAIGHT:8 vs V00039,V00143
  - c28 r1 t184：「But the only vehicle that would use N crosswalk from stopline candidates is V00148 (E_R1_RIGHT), which is also blocked by E crosswalk reservation until 212. So no conflict. Let me think about what I should do at different time points: - Tick 184: Release N B_TO_A phase - Tick 187: S crosswalk vehicle reservation expires. S A side」→ CROSSWALK:NORTH:CELL:7:0 vs V00142
  - c35 r2 t203：「STRAIGHT (not E_R1_RIGHT) - Combined: W_R1_GUIDED_STRAIGHT (not E_R1_RIGHT) So E_R1_RIGHT is indeed NOT blocked. Now, the candidateConflicts show: - V00159 has no conflicts listed (it doesn't appear as a key in candidateConflicts) Wait, let me re-read: ``` "candidateConflicts":{"V00098":["V00039","V00035","V00043","V00045"],"V0016」→ CROSSWALK:NORTH:CELL:7:0 vs V00159
  - c51 r1 t246：「 - V00049: S_S2_STRAIGHT (1 pax) - V00043: W_S1_STRAIGHT (1 pax, emergency E) Now checking conflicts: - V00098 conflicts with: V00049, V00043, V00045 - V00180: no conflicts listed - V00096: no conflicts listed - V00203 conflicts with: V00074 - V00074: conflicts with V00203 (mutual) - V00049 conflicts with: V00043, V00045 - V00043 」→ CROSSWALK:NORTH:CELL:0:0 vs V00096,PED:89:0:CROSSWALK:NORTH
- 自我修正标记（Wait/Actually/Let me recheck…）：共 1068 次，每次回复 平均 7.8，P50 6，P95 22，最大 32（n=137）
- 认知模式 letterCounting：10 处
  - 「 waiting for S_S2_STRAIGHT to clear. If I release V00035 (H, heavy truck, SLOW_SLIDE), it will be in the junction for ~26 ticks. The vehicles behind it (P, P, T, P, P, T, L, T = 2+2+2+2+2+2+1+2 wait, let me recount) Actually the matrix for IN_S_S2_STRAIGHT is: "HhhhhPppPppTttPppPpp...........................Ttt...Lll.Ttt" - Hhhhh = H (5 cells) - Ppp = P (3 cells) - Ppp = P (3 cells) - Ttt = T (3 cells) - Ppp = 」
  - 「is in incidentBlocked (INC0001 blocks it until 186). - Lane: "PppEeeEeePppPpPppBbbbPppKkkkkPppPppPppPppPpp.........TttVvv" - Position 9: let me count... P(0)p(1)p(2)P(3)P(4)P(5)P(6)P(7)P(8)P(9) Wait, let me recount: "PppPppPppPppPppPppBbbbPppKkkkkPppPppPppPppPpp.........TttVvv" P(0) p(1) p(2) P(3) p(4) p(5) P(6) p(7) p(8) P(9) p(10) p(11) P(12) p(13) p(14) P(15) p(16) p(17) P(18) p(19) p(20) B(21) b(22) b(23) b」
  - 「mit V00125 with sleep 8. Actually, wait. Let me reconsider. Let me look at what's on the E_S2 lane: IN_E_S2_STRAIGHT: "VvvBbbb.Bbbb.Ppp.Hhhhh.Vvv.Eee.Lll......VvvTtt" The first character is V (a van, 3 chars "Vvv"). That's V00125. After it are Bbbb (bus), .Bbbb (bus), .Ppp (car), .Hhhhh (hazmat), .Vvv (van), .Eee (emergency), .Lll (light truck), ......VvvTtt. So the E_S2 lane has a long queue. If I admit」
- 认知模式 idFormat：1 处
  - 「 1 + 1 + 1 + 3 + 8 = 136 pax Let me dry-run this to verify. I'll use: - lane_batches: E_S1 top 3, E_S2 top 2 - candidate_vehicle_ids: V00104, V00028, V00019, V00033, V00013 Wait, for lane_batches the lane_id should be like "IN_E_S1_STRAIGHT" or just "E_S1_STRAIGHT". Let me use the route ID format since the tool accepts that. Actually, I need to be careful. If I put E_S1_STRAIGHT in lane_batches with top_n=3, th」

### 2.2 复杂环境博弈

**行人与车辆**

- 行人相位尝试 7 次，成功 4 次 {"OK":4,"RESOURCE_CONFLICT":3}
- 实际放行 2 批 6 人；闯红灯 15 次 15 人；被撞 4 人；奖励 0，扣费 {"delay":0.96,"jaywalk":9,"strike":20}

行人相位冲突样例：

| 周期 | tick | 冲突偏移 at | 冲突 |
| --- | --- | --- | --- |
| 28 | 184 | 0 | CROSSWALK:NORTH:CELL:7:0 vs V00142 |
| 29 | 185 | 8 | CROSSWALK:NORTH:CELL:5:0 vs PED:20:0:CROSSWALK:NORTH |
| 35 | 203 | 5 | CROSSWALK:NORTH:CELL:7:0 vs V00159 |

在行人耐心告急（PATIENCE_CRITICAL）时放行、且路线经过该横道的车辆：104 车次

| 周期 | tick | 车辆 | 路线 | 横道 | 行人 | 剩余耐心 | 该行人后来被撞 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 12 | 142 | V00106 | E_R1_RIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 24 | 是 |
| 12 | 142 | V00121 | S_R1_RIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 24 | 是 |
| 13 | 146 | V00109 | N_L1_LEFT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 20 | 是 |
| 14 | 153 | V00036 | W_R1_RIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 17 | 是 |
| 14 | 153 | V00113 | E_R1_RIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 13 | 是 |
| 14 | 153 | V00113 | E_R1_RIGHT | CROSSWALK:EAST | PED:24:0:CROSSWALK:EAST | 24 |  |
| 14 | 153 | V00053 | N_R1_RIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 17 | 是 |
| 14 | 153 | V00019 | S_L1_LEFT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 17 | 是 |
| 14 | 153 | V00143 | N_L1_LEFT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 13 | 是 |
| 14 | 153 | V00143 | N_L1_LEFT | CROSSWALK:EAST | PED:24:0:CROSSWALK:EAST | 24 |  |
| 15 | 161 | V00141 | E_S1_STRAIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 5 | 是 |
| 15 | 161 | V00141 | E_S1_STRAIGHT | CROSSWALK:EAST | PED:24:0:CROSSWALK:EAST | 16 |  |
| 15 | 161 | V00141 | E_S1_STRAIGHT | CROSSWALK:WEST | PED:3:0:CROSSWALK:WEST | 9 | 是 |
| 15 | 161 | V00149 | E_S1_STRAIGHT | CROSSWALK:EAST | PED:11:0:CROSSWALK:EAST | 5 | 是 |
| 15 | 161 | V00149 | E_S1_STRAIGHT | CROSSWALK:EAST | PED:24:0:CROSSWALK:EAST | 16 |  |

行人时间线：

| tick | 事件 | 横道 | 人数 |
| --- | --- | --- | --- |
| 169 | PED_COLLISION | CROSSWALK:WEST | 1 |
| 170 | PED_GRANT | CROSSWALK:NORTH | 2 |
| 170 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 170 | PED_COLLISION | CROSSWALK:EAST | 1 |
| 171 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 177 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 199 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 200 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 203 | PED_GRANT | CROSSWALK:NORTH | 4 |
| 204 | PED_COLLISION | CROSSWALK:SOUTH | 1 |
| 205 | PED_JAYWALK | CROSSWALK:SOUTH | 1 |
| 211 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 225 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 241 | PED_JAYWALK | CROSSWALK:SOUTH | 1 |
| 244 | PED_JAYWALK | CROSSWALK:NORTH | 1 |
| 244 | PED_COLLISION | CROSSWALK:SOUTH | 1 |
| 245 | PED_JAYWALK | CROSSWALK:SOUTH | 1 |
| 249 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 249 | PED_JAYWALK | CROSSWALK:EAST | 1 |
| 257 | PED_JAYWALK | CROSSWALK:WEST | 1 |
| 260 | PED_JAYWALK | CROSSWALK:WEST | 1 |

**事故处置**

| 事故 | 类型 | 发生 | 车辆 | 行人 | 首次响应 | 清障令 | 清障调用次数 | 关闭 | 事故后才放行、后来卷入 | 非模型放行（抢行） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| INC0001 | PILEUP | 169 | 8 | 1 | 170 | 170 | 8 | 233 | V00125@171 |  |
| INC0002 | REAR_END | 170 | 2 | 0 | 170 | 170 | 1 | 178 |  | V00059 |
| INC0003 | PILEUP | 170 | 4 | 1 | 171 | 171 | 6 | 209 | V00079@172 |  |
| INC0004 | ANGLE_COLLISION | 204 | 1 | 1 | 205 | 205 | 1 | 221 |  |  |
| INC0005 | PILEUP | 243 | 4 | 0 | 245 |  | 0 |  |  | V00031 |
| INC0006 | ANGLE_COLLISION | 244 | 1 | 1 | 245 |  | 0 |  |  |  |

事故成本估算：

| 事故 | 最终严重度 | 锁格（含二次） | 开放拍数 | 危化品 | 校车 | 分摊锁格费 | 估算总成本 | 放行来源 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| INC0001 | CRITICAL | 57 | 64 |  |  | 55.739 | 60.739 | V00053@c14 V00141@c15 V00111@c15 V00019@c14 V00116@c15 V00149@c15 V00027@c20 V00125@c19 |
| INC0002 | MODERATE | 30 | 8 |  |  | 1.834 | 1.834 | V00044@c15 V00059@c- |
| INC0003 | CRITICAL | 45 | 39 |  |  | 26.815 | 31.815 | V00169@c15 V00193@c17 V00037@c17 V00079@c17 |
| INC0004 | SERIOUS | 20 | 17 |  | 是 | 3.463 | 18.463 | V00090@c30 |
| INC0005 | CRITICAL | 116 | 18 |  |  | 31.903 | 31.903 | V00031@c- V00062@c43 V00055@c42 V00060@c42 |
| INC0006 | SERIOUS | 14 | 17 |  |  | 2.424 | 7.424 | V00103@c43 |

**司机抢行**

总计 {"redLight":1,"tailgate":1,"cutIn":1}

| 周期 | 类型 | 车辆 | 此前出现在 driverAlerts 的周期数 | 最后一次预警 | 卷入事故 |
| --- | --- | --- | --- | --- | --- |
| 17 | VEHICLE_TAILGATE | V00059 | 0 |  | INC0002 |
| 45 | VEHICLE_RED_LIGHT | V00031 | 9 | IN_W_L1_LEFT 距停止线 0 剩余 0 | INC0005 |

**紧急车辆与抛锚**

紧急车辆延误扣费 0.793

| 车辆 | 首次进入 12 格 | 放行 tick | 等待拍数 | 最长静止 |
| --- | --- | --- | --- | --- |
| V00034 | 71 |  |  | 84 |
| V00036 | 71 |  |  | 34 |
| V00050 | 71 | 143 | 72 | 44 |
| V00056 | 79 | 94 | 15 | 8 |
| V00043 | 142 |  |  | 90 |
| V00096 | 142 |  |  | 80 |
| V00101 | 146 |  |  | 81 |
| V00211 | 220 |  |  | 42 |

拖车费 4.8，链式加价 0.053

| 车辆 | 车道 | 抛锚 | 派拖车 | 派车延迟 | 绕行 |
| --- | --- | --- | --- | --- | --- |
| V00006 | IN_N_R1_RIGHT | 64 | 79 | 15 |  |
| V00014 | IN_S_R1_RIGHT | 64 | 104 | 40 | 79 |
| V00068 | IN_N_L1_LEFT | 97 | 104 | 7 |  |
| V00029 | IN_W_S2_STRAIGHT | 142 | 146 | 4 |  |
| V00122 | IN_W_R1_RIGHT | 240 |  |  |  |

### 2.3 亮眼操作与最差操作

周期价值 = 未卷入事故的放行车数 + 1.5×放行行人 + 2×成功的特情工具 − 归因事故成本。事故成本按锁格×开放时长分摊本局真实锁格扣费，再加撞人和校车罚款，平均分给放行了涉事车辆的周期。这是用于挑选证据的启发式，不是精确账目。

亮点事件：

| tick | 周期 | 类型 | 说明 |
| --- | --- | --- | --- |
| 71 | 2 | LARGE_VERIFIED_RELEASE | 9 vehicles, blame=0 |
| 79 | 3 | TOW_DISPATCH | V00006 |
| 79 | 3 | STALL_REROUTE | V00074 around V00014 |
| 104 | 6 | TOW_DISPATCH | V00014 |
| 104 | 6 | TOW_DISPATCH | V00068 |
| 133 | 11 | LARGE_VERIFIED_RELEASE | 10 vehicles, blame=0 |
| 146 | 13 | TOW_DISPATCH | V00029 |
| 168 | 17 | LANE_GUIDANCE | V00126 IN_S_S1_STRAIGHT->IN_S_R1_RIGHT |
| 170 | 18 | PED_GRANT | CROSSWALK:NORTH A_TO_B x2 |
| 203 | 35 | PED_GRANT | CROSSWALK:NORTH B_TO_A x4 |
| 236 | 43 | LARGE_VERIFIED_RELEASE | 8 vehicles, blame=18.06 |

#### 得分最高的周期

**周期 11（tick 133）**：放行 10，未出事 10，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -2.198，提交类型 verified，睡眠 10

- 观测要点：余额 989.83，停止线候选 15，受阻路线 4，行人预警 []，司机预警 [V00063:0, V00030:7]，紧急车 [V00034, V00036, V00050]，抛锚 []
- 工具序列：r1 dry_run_admit -> ok；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 战术摘要：10 vehicles: W straights+right, N_R1, S_R1, E_R1. Includes tailgater V00030 to neutralize risk. Sleeping 10 to let them clear. After this, N straights should be free (reserved 140-143).
- 推理摘录：Let me analyze the current situation: 1. **Current state**: Tick 133, balance 989.8319, 128 ticks remaining 2. **Active vehicles in intersection**: 5 East vehicles (V00048, V00076, V00086, V00088, V00115) all crossing East routes 3. **Emergency vehicles**: - V00034 in IN_S_L1_LEFT, queue index 3, distance 6, stationary 64 ticks, blocked by V00019 and V00027 - V00036 in IN_W_R1_RIGHT, queue index 2, distance 4, stationary 34 ticks, blocked by V00033 - V00050 in IN_N_S1_STRAIGHT, queue index 1, di …… o add V00030 to the batch to make it legal. Let me re-dry-run with V00030 added as a candidate vehicle, or increase W_S1_STRAIGHT top_n to 3. Let me try W_S1_STRAIGHT top_n=3 to include V00030. Good — 10 vehicles, reward 6.1, no conflicts. Now commit the same plan and sleep enough for them to clear.

**周期 2（tick 71）**：放行 9，未出事 9，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -0.324，提交类型 verified，睡眠 8

- 观测要点：余额 999.87，停止线候选 9，受阻路线 3，行人预警 []，司机预警 []，紧急车 [V00034, V00036, V00050]，抛锚 [V00006, V00014]
- 工具序列：r1 dry_run_admit -> ok；r2 commit_schedule -> ok
- 战术摘要：Released N and E straight axes (9 vehicles: E_S1 top-2, N_S1 top-3, N_S2 top-3, S_S1 heavy truck slow-slide). W straights conflict with N straights so deferred. Sleeping 8 to let first cohoort enter and start clearing.
- 推理摘录：Let me analyze the current situation: **Current State (Tick 71, 190 ticks remaining):** - Balance: 999.8684 - 9 stopline candidates - 5 active vehicles crossing - 3 emergency vehicles entering horizon - 2 stalled vehicles **Key Issues:** 1. **Stalled vehicles:** - V00006 at IN_N_R1_RIGHT (N_R1_RIGHT), distance 0, 10 cars behind. Bypass to N_S1_STRAIGHT blocked by V00020 at slot 55 (0 movable). - V00014 at IN_S_R1_RIGHT (S_R1_RIGHT), distance 0, 3 cars behind. Bypass to S_S1_STRAIGHT has 1 movabl ……  3 vehicles ahead. The guidance opportunities show V00050 can go to IN_N_R1_RIGHT. But IN_N_R1_RIGHT has a stalled vehicle V00006 with 10 vehicles behind it, and the bypass availability is 0 (blocked by V00020 at slot 55). So that's not helpful. Let me just commit the current plan and sleep 8 ticks.

**周期 12（tick 142）**：放行 7，未出事 7，放行行人 0，耐心风险放行 2，归因成本 0，周期余额变化 2.853，提交类型 verified，睡眠 10

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:11:0:CROSSWALK:EAST remaining=24
- 观测要点：余额 987.63，停止线候选 14，受阻路线 8，行人预警 [E:P24]，司机预警 [V00063:0, V00095:6, V00097:10, V00112:11]，紧急车 [V00034, V00036, V00043, V00050, V00096]，抛锚 []
- 工具序列：r1 dry_run_admit -> ok；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 战术摘要：7 vehicles: N_S1×2 (V00050+E, V00057), N_S2×2 (V00038+V00047), N_R1 (V00046 L), E_R1 (V00106 T), S_R1 (V00121 P). N+E+S axes combined, all CRUISE. Sleep 10 to clear most. Pedestrian PATIENCE alert on EAST B side (PED:11:0 remaining=24) — will address next cycle if still pending.
- 推理摘录：Let me analyze the current situation: **Current State:** - Tick 142, 119 ticks remaining - Balance: 987.63 - Interrupt: PED:11:0:CROSSWALK:EAST patience remaining 24 (B_TO_A direction) **Key Observations:** 1. **Emergency vehicles:** - V00034 (IN_S_L1_LEFT, queue pos 3, dist 6, 73 ticks stationary, blocked by V00019, V00027) - V00036 (IN_W_R1_RIGHT, queue pos 1, dist 0, 4 ticks stationary) - at stopline! - V00043 (IN_W_S1_STRAIGHT, queue pos 3, dist 10, 0 ticks stationary, blocked by V00030, V00 …… ). Total 7 vehicles, reward 1.9. Let me commit this and sleep enough to let them clear. The farthest exit tick is 168, so 10 ticks of sleep would cover a lot of it. Let me commit with sleep 10. Wait, I have budget for 8 API calls per cycle. I've already used 2 dry_run_admit calls. Let me commit now.

**周期 1（tick 61）**：放行 6，未出事 6，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -0.132，提交类型 verified，睡眠 10

- 观测要点：余额 1000，停止线候选 7，受阻路线 0，行人预警 []，司机预警 []，紧急车 []，抛锚 []
- 工具序列：r1 dry_run_admit -> LANE_HEAD_NOT_READY (Lane head is not ready: IN_N_S2_STRAIGHT)；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 战术摘要：Released all 6 stopline heads (1 left, 4 right, 1 straight-ish). E and N lefts/rights + S right + W right turn. Bus V00007 goes W_R1_RIGHT. Sleeping 10 ticks to let them transverse.
- 推理摘录：Let me analyze the current state of the intersection: **Current Tick:** 61, **End Tick:** 261, **200 ticks remaining** **Financial Balance:** 1000 **Stopline Candidates (vehicles waiting at stoplines):** - V00008: P (passenger), 1 passenger, 0 ticks waiting, E_L1_LEFT - V00003: L (light truck), 1 passenger, 2 ticks waiting, E_R1_RIGHT - V00005: P (passenger), 1 passenger, 1 tick waiting, N_L1_LEFT - V00001: P (passenger), 1 passenger, 3 ticks waiting, N_R1_RIGHT - V00004: T (taxi), 2 passengers, …… 4 passengers, head is Ppp at position ~7 (not at stop line yet) - E_S2_STRAIGHT: 91 passengers, head is Lll at position ~32 - N_S1_STRAIGHT: 0 passengers, head Ppp at ~4 - N_S2_STRAIGHT: 0 passengers, head Ppp at ~1 These are all fairly spread out. Let me commit now with 10 ticks sleep and reassess.

**周期 7（tick 109）**：放行 6，未出事 6，放行行人 0，耐心风险放行 0，归因成本 0，周期余额变化 -1.815，提交类型 verified，睡眠 10

- 观测要点：余额 993.49，停止线候选 14，受阻路线 0，行人预警 []，司机预警 []，紧急车 [V00034, V00036, V00050]，抛锚 [V00014, V00068]
- 工具序列：r1 dry_run_admit -> ok；r2 commit_schedule -> ok
- 战术摘要：Released 6 vehicles: E_S1 bus (40pax, clears 129), E_S2 light truck, E_R1 taxi, N_R1 taxi, W_S1 light truck, W_S2 passenger. Sleeping 10 to let taxis/rights clear by ~119 and start straights. Will handle S_E axis and emergency V00050 next cycle.
- 推理摘录：Let me analyze the current situation: 1. **Current state**: Tick 109, 152 ticks remaining, balance 993.491 2. **Active vehicles in junction**: V00032 (N_S1_STRAIGHT, CROSSING, CRUISE), V00056 (N_L1_LEFT, CROSSING, CRUISE) 3. **Emergency vehicles**: - V00034 (S_L1_LEFT, queue index 3, distance 6, stalled 40 ticks, blocked by V00019 and V00027) - V00036 (W_R1_RIGHT, queue index 2, distance 4, 10 ticks, blocked by V00033) - V00050 (N_S1_STRAIGHT, queue index 1, distance 0, 11 ticks, at stopline) 4. …… en handle pedestrians if needed. Actually, let me think about the sleep time. The vehicles will take about 13-20 ticks to clear depending on the vehicle type. The bus takes until tick 129, so 20 ticks. I should sleep maybe 10 ticks to be safe, and then check again. Let me commit with sleep_ticks=10.

#### 损失最大的周期

**周期 15（tick 161）**：放行 7，未出事 1，放行行人 0，耐心风险放行 17，归因成本 40.16，周期余额变化 -0.316，提交类型 verified，睡眠 10

- 观测要点：余额 985.49，停止线候选 15，受阻路线 6，行人预警 [E:P5, E:P16, W:P9]，司机预警 [V00063:0, V00095:0, V00097:0, V00112:0, V00054:3, V00089:3, V00114:5, V00126:6]，紧急车 [V00034, V00043, V00096, V00101]，抛锚 [V00029]
- 工具序列：r1 dry_run_admit -> ok；r2 commit_schedule -> ok
- 后果：INC0001 PILEUP tick=169 vehicles=8 pedestrians=1 estCost=60.739；INC0002 REAR_END tick=170 vehicles=2 pedestrians=0 estCost=1.834；INC0003 PILEUP tick=170 vehicles=4 pedestrians=1 estCost=31.815
- 战术摘要：Admitted 7: E_S1 (V00141 V, V00149), E_S2 (V00111 T, V00116), E_R1 (V00120 P), W_R1 (V00044 P), S_R1 (V00169 P). All CRUISE. Tailgate risk V00059 behind V00044 noted. Sleeping 10 to clear first wave by ~178; next cycle should free W_S1 (170), N_R1 (~172), E_L1 (165) for N/W admission.
- 推理摘录：Let me analyze the current situation: **Current State:** - Tick 161, 100 ticks remaining, balance 985.49 - Multiple vehicles in the junction (activeVehicleMotions shows 7 vehicles crossing) - Several lanes with reservations that will soon expire **Key Issues:** 1. **Emergency vehicles stuck:** - V00034 (IN_S_L1_LEFT, queue 2, dist 3, stopped 3 ticks, blocked by V00027) - V00043 (IN_W_S1_STRAIGHT, queue 2, dist 4, stopped 13 ticks, blocked by V00037) - V00096 (IN_N_R1_RIGHT, queue 2, dist 3, stop ……  at 161 and 166, clearing at 178 and 183. So E_S1_STRAIGHT will be reserved until ~178+. Similarly E_S2 until ~183. The N routes should be free after their current reservations expire (172-176). The S_L1_LEFT is reserved until 184 which is quite far. I think sleeping 10 is reasonable. Let me commit.

**周期 17（tick 165）**：放行 3，未出事 0，放行行人 0，耐心风险放行 7，归因成本 23.86，周期余额变化 -6.764，提交类型 verified，睡眠 10

- 唤醒原因：VEHICLE_TAILGATE vehicle=V00059 route=W_R1_RIGHT
- 观测要点：余额 992.61，停止线候选 12，受阻路线 9，行人预警 [E:P1, N:P21, E:P12, W:P5]，司机预警 [V00054:0, V00063:0, V00089:0, V00095:0, V00097:0, V00112:0, V00114:1, V00126:2]，紧急车 [V00034, V00043, V00096, V00101]，抛锚 []
- 工具序列：r1 dry_run_admit -> ok；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 后果：INC0003 PILEUP tick=170 vehicles=4 pedestrians=1 estCost=31.815
- 战术摘要：Admitted 3: W_S1 V00037 (K,3pax, unblocks emergency V00043), S_R1 V00193 (K,3pax), E_L1 V00079 (P,1pax, enters 172). All CRUISE. After 10 ticks: E_R1(170), N_R1(172), S_S1(174), S_S2(175) reservations expire. V00059 tailgater already in junction on W_R1 — no further action needed. Next cycle: use fr
- 推理摘录：Let me analyze the current situation: 1. **Current state**: Tick 165, 96 ticks remaining, balance 992.6053 2. **Interrupt**: VEHICLE_TAILGATE - V00059 on W_R1_RIGHT tailgated into the junction 3. **Key observations**: - V00059 (W_R1_RIGHT) is now in the junction (X state, CRUISE) - it tailgated V00044 - Several vehicles are already crossing/entering the junction - dischargingLanes: IN_E_S1_STRAIGHT (1 remaining, next entry 166, clear 183), IN_E_S2_STRAIGHT (1 remaining, next entry 166, clear 183 …… ally wait - the dry run was done with lane_batches for W_S1 and S_R1 and then a second dry run added E_L1. Both passed. Let me use the same parameters in commit. Let me commit with: - lane_batches: IN_W_S1_STRAIGHT top 1 CRUISE, IN_S_R1_RIGHT top 1 CRUISE, IN_E_L1_LEFT top 1 CRUISE - sleep_ticks: 10

**周期 42（tick 233）**：放行 5，未出事 3，放行行人 0，耐心风险放行 15，归因成本 21.27，周期余额变化 -3.553，提交类型 verified，睡眠 10

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:87:0:CROSSWALK:WEST remaining=24
- 观测要点：余额 845.03，停止线候选 16，受阻路线 4，行人预警 [W:J0, E:J0, E:J0, S:P8, W:P16, S:P8, W:P24, N:P11, E:P16]，司机预警 [V00031:0, V00039:0, V00045:0, V00055:0, V00061:0, V00062:0, V00098:0, V00180:0]，紧急车 [V00034, V00043, V00096, V00101, V00211]，抛锚 []
- 工具序列：r1 dry_run_admit -> ok；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 后果：INC0005 PILEUP tick=243 vehicles=4 pedestrians=0 estCost=31.903
- 战术摘要：Admitted N_S2 top2 (V00055 L, V00060 P) + S_S1 top2 (V00039 P, V00052 P) + S_S2 top1 (V00035 H). All clean, no jaywalker conflicts. V00074 (S_S1_GUIDED_RIGHT→EAST) excluded due to jaywalkers on East. Tailgators V00064/70 (N_S2) and V00049/54 (S_S2) will follow; V00074 blocked by jaywalkers on East c
- 推理摘录：Let me analyze the current situation: 1. **Current state**: Tick 233, 28 ticks remaining (ends at 261), balance 845.034 2. **Interrupt**: PEDESTRIAN_PATIENCE - PED:87:0:CROSSWALK:WEST with 24 ticks remaining 3. **Working memory** is expired (target tick 209 has passed) 4. **Recent cycles**: Last two cycles had no vehicle admissions due to jaywalkers and incidents Key observations: - **Jaywalkers**: Multiple jaywalkers active: - CROSSWALK:EAST: PED:45:0 (BA, J), PED:61:0 (AB, J) - jaywalking - CR …… eters matching my dry run. So I'm stuck with the first or second dry run. Let me go with the first (clean). Wait, one more thought: should I add pedestrian phases? The dry run didn't include any, so I can't add them to the commit. The rule is strict: commit must match dry run exactly. Let me commit.

**周期 30（tick 187）**：放行 1，未出事 0，放行行人 0，耐心风险放行 3，归因成本 18.46，周期余额变化 -16.205，提交类型 verified，睡眠 8

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:45:0:CROSSWALK:EAST remaining=24
- 观测要点：余额 951.45，停止线候选 14，受阻路线 28，行人预警 [E:J0, S:P18, N:P21, W:P12, E:P24, W:P13]，司机预警 [V00080:0, V00063:0, V00054:0, V00095:0, V00107:0, V00124:0, V00089:0, V00132:0]，紧急车 [V00034, V00043, V00096, V00101]，抛锚 []
- 工具序列：r1 dry_run_admit -> ok；r2 inspect_incident -> ok；r2 inspect_incident -> ok；r3 order_accident_clearance -> ok；r3 order_accident_clearance -> ok；r4 commit_schedule -> ok
- 后果：INC0004 ANGLE_COLLISION tick=204 vehicles=1 pedestrians=1 estCost=18.463
- 战术摘要：Both pileups evading: INC0001→OUT_WEST_3, INC0003→OUT_SOUTH_3. Only unblocked candidate V00090 (W_R1_RIGHT, wait 86) admitted. Sleeping 8 to advance evacuations and let incidents clear their locked cells.
- 推理摘录：Let me analyze the current situation: 1. **Current state**: Tick 187, balance 951.4473, 74 ticks remaining (ends at 261) 2. **Interruption**: PEDESTRIAN_PATIENCE - PED:45:0:CROSSWALK:EAST has 24 patience remaining 3. **Incidents**: - INC0001: Blocks routes until ~233 (N_L1_LEFT, N_R1_RIGHT, N_R1_GUIDED_STRAIGHT, N_R1_GUIDED_RIGHT, N_S1_GUIDED_RIGHT, N_S1_STRAIGHT, N_S2_STRAIGHT, N_S2_GUIDED_LEFT, S_L1_LEFT, W_L1_LEFT, W_S2_GUIDED_LEFT, E_R1_GUIDED_STRAIGHT, E_S1_STRAIGHT, E_S2_STRAIGHT) - INC000 ……  so releasing EAST phase wouldn't help and S crosswalk has vehicles. Let me keep it simple — just admit V00090 and sleep. Actually the W crosswalk has injured x and low patience. W_R1_RIGHT crosses W crosswalk. But dry_run returned ok with no jaywalker_warnings, so it's fine. Commit V00090, sleep 8.

**周期 43（tick 236）**：放行 8，未出事 6，放行行人 0，耐心风险放行 30，归因成本 18.06，周期余额变化 -2.566，提交类型 verified，睡眠 10

- 唤醒原因：PEDESTRIAN_PATIENCE pedestrian=PED:106:0:CROSSWALK:WEST remaining=24
- 观测要点：余额 841.48，停止线候选 13，受阻路线 9，行人预警 [W:P24, E:J0, E:J0, S:P5, W:P13, S:P5, W:P21, N:P8, E:P13]，司机预警 [V00031:0, V00045:0, V00061:0, V00062:0, V00098:0, V00180:0, V00040:0, V00072:0]，紧急车 [V00034, V00043, V00096, V00101, V00211]，抛锚 []
- 工具序列：r1 dry_run_admit -> ok；r2 dry_run_admit -> ok；r3 commit_schedule -> ok
- 后果：INC0005 PILEUP tick=243 vehicles=4 pedestrians=0 estCost=31.903；INC0006 ANGLE_COLLISION tick=244 vehicles=1 pedestrians=1 estCost=7.424
- 战术摘要：Admitting N_S1 top5 (V00062,75,80,94,127) + W_R1 top3 (V00103,122,129) to maximize throughput before E/W straight routes unblock (~tick 248-252).
- 推理摘录：Let me analyze the current situation carefully. **Current State:** - Tick 236, 25 ticks remaining (ends at 261) - Balance: 841.4811 - Interrupt: PEDESTRIAN_PATIENCE - PED:106:0:CROSSWALK:WEST, BA direction, 24 ticks remaining patience **Key Issues:** 1. Only 25 ticks remaining - this is very tight 2. Multiple emergency vehicles at stop lines (V00034 E at S_L1_LEFT, V00043 E at W_S1_STRAIGHT) 3. Jaywalkers on East (PED:45, PED:61) and possibly West 4. Many vehicles queued with high passenger coun …… , W_S2_STRAIGHT:251 — many east/west routes reserved until ~248-252. After I sleep 10 (tick 246), those become available. N_L1_LEFT:249, S_L1_LEFT:251 also reserved. So after sleeping, I can admit E and W straight/left. Let me commit sleep 10 for now to let this batch enter and free up reservations.

### 附：逐周期一览

| 周期 | tick | 提交 | 放行 | 行人 | 耐心风险 | 归因事故 | 归因成本 | 余额变化 | 睡眠 | 唤醒原因 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 61 | verified | 6 | 0 | 0 |  | 0 | -0.132 | 10 |  |
| 2 | 71 | verified | 9 | 0 | 0 |  | 0 | -0.324 | 8 |  |
| 3 | 79 | hold | 0 | 0 | 0 |  | 0 | -1.537 | 5 |  |
| 4 | 84 | hold | 0 | 0 | 0 |  | 0 | -0.531 | 10 |  |
| 5 | 94 | verified | 3 | 0 | 0 |  | 0 | -0.939 | 10 |  |
| 6 | 104 | hold | 0 | 0 | 0 |  | 0 | -3.048 | 5 |  |
| 7 | 109 | verified | 6 | 0 | 0 |  | 0 | -1.815 | 10 |  |
| 8 | 119 | unverified | 5 | 0 | 0 |  | 0 | -1.343 | 10 |  |
| 9 | 129 | fallback | 0 | 0 | 0 |  | 0 | -0.234 | 1 |  |
| 10 | 130 | hold | 0 | 0 | 0 |  | 0 | -0.268 | 3 |  |
| 11 | 133 | verified | 10 | 0 | 0 |  | 0 | -2.198 | 10 |  |
| 12 | 142 | verified | 7 | 0 | 2 |  | 0 | 2.853 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:11:0:CROSSWALK:EAST remai |
| 13 | 146 | verified | 1 | 0 | 1 |  | 0 | -2.668 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:3:0:CROSSWALK:WEST remain |
| 14 | 153 | verified | 5 | 0 | 7 | INC0001 | 15.18 | -2.328 | 8 | PEDESTRIAN_PATIENCE pedestrian=PED:24:0:CROSSWALK:EAST remai |
| 15 | 161 | verified | 7 | 0 | 17 | INC0001 INC0002 INC0003 | 40.16 | -0.316 | 10 |  |
| 16 | 162 | hold | 0 | 0 | 0 |  | 0 | 7.429 | 8 | PEDESTRIAN_PATIENCE pedestrian=PED:20:0:CROSSWALK:NORTH rema |
| 17 | 165 | verified | 3 | 0 | 7 | INC0003 | 23.86 | -6.764 | 10 | VEHICLE_TAILGATE vehicle=V00059 route=W_R1_RIGHT |
| 18 | 170 | verified | 1 | 0 | 3 |  | 0 | -5.161 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:3:0:CROSSWALK:WEST; ACCIDE |
| 19 | 171 | verified | 3 | 0 | 3 | INC0001 | 7.59 | -1.353 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:11:0:CROSSWALK:EAST; ACCID |
| 20 | 174 | verified | 1 | 0 | 0 | INC0001 | 7.59 | -1.053 | 8 | ACCIDENT_INTERRUPT incident=INC0001 secondary=true |
| 21 | 175 | verified | 1 | 0 | 1 |  | 0 | -1.75 | 8 | PEDESTRIAN_PATIENCE pedestrian=PED:44:0:CROSSWALK:WEST remai |
| 22 | 176 | hold | 0 | 0 | 0 |  | 0 | -2.327 | 2 | PEDESTRIAN_PATIENCE pedestrian=PED:45:1:CROSSWALK:WEST remai |
| 23 | 177 | hold | 0 | 0 | 0 |  | 0 | -1.612 | 1 | PEDESTRIAN_JAYWALK pedestrian=PED:24:0:CROSSWALK:EAST |
| 24 | 178 | verified | 1 | 0 | 2 |  | 0 | -1.797 | 5 |  |
| 25 | 179 | hold | 0 | 0 | 0 |  | 0 | -4.138 | 5 | ACCIDENT_INTERRUPT incident=INC0003 secondary=true |
| 26 | 181 | hold | 0 | 0 | 0 |  | 0 | -2.546 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:38:0:CROSSWALK:SOUTH rema |
| 27 | 182 | hold | 0 | 0 | 0 |  | 0 | -4.925 | 2 | ACCIDENT_INTERRUPT incident=INC0001 secondary=true |
| 28 | 184 | hold | 0 | 0 | 0 |  | 0 | -2.618 | 1 | PEDESTRIAN_PATIENCE pedestrian=PED:43:0:CROSSWALK:NORTH rema |
| 29 | 185 | verified | 1 | 0 | 1 |  | 0 | -5.115 | 10 | ACCIDENT_INTERRUPT incident=INC0001 secondary=true |
| 30 | 187 | verified | 1 | 0 | 3 | INC0004 | 18.46 | -16.205 | 8 | PEDESTRIAN_PATIENCE pedestrian=PED:45:0:CROSSWALK:EAST remai |
| 31 | 195 | hold | 0 | 0 | 0 |  | 0 | -10.906 | 6 |  |
| 32 | 199 | hold | 0 | 0 | 0 |  | 0 | 0.742 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:44:0:CROSSWALK:WEST |
| 33 | 200 | hold | 0 | 0 | 0 |  | 0 | -2.717 | 9 | PEDESTRIAN_JAYWALK pedestrian=PED:45:1:CROSSWALK:WEST |
| 34 | 201 | hold | 0 | 0 | 0 |  | 0 | -5.237 | 2 | PEDESTRIAN_PATIENCE pedestrian=PED:61:0:CROSSWALK:EAST remai |
| 35 | 203 | verified | 0 | 0 | 0 |  | 0 | -11.242 | 6 |  |
| 36 | 205 | hold | 0 | 0 | 0 |  | 0 | -12.848 | 4 | PEDESTRIAN_JAYWALK pedestrian=PED:38:0:CROSSWALK:SOUTH; ACCI |
| 37 | 209 | verified | 4 | 0 | 8 |  | 0 | -4.106 | 6 |  |
| 38 | 211 | hold | 0 | 0 | 0 |  | 0 | -12.677 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:45:0:CROSSWALK:EAST |
| 39 | 217 | hold | 0 | 0 | 0 |  | 0 | -3.23 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:80:0:CROSSWALK:SOUTH rema |
| 40 | 220 | hold | 0 | 0 | 0 |  | 0 | -10.831 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:89:0:CROSSWALK:NORTH rema |
| 41 | 225 | hold | 0 | 0 | 0 |  | 0 | -17.156 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:81:0:CROSSWALK:WEST remai |
| 42 | 233 | verified | 5 | 0 | 15 | INC0005 | 21.27 | -3.553 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:87:0:CROSSWALK:WEST remai |
| 43 | 236 | verified | 8 | 0 | 30 | INC0005 INC0006 | 18.06 | -2.566 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:106:0:CROSSWALK:WEST rema |
| 44 | 238 | verified | 1 | 0 | 4 |  | 0 | -1.317 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:95:0:CROSSWALK:SOUTH rema |
| 45 | 239 | hold | 0 | 0 | 0 |  | 0 | -3.073 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:91:0:CROSSWALK:EAST remai |
| 46 | 241 | hold | 0 | 0 | 0 |  | 0 | -1.303 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:86:0:CROSSWALK:SOUTH |
| 47 | 242 | hold | 0 | 0 | 0 |  | 0 | -1.395 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:113:0:CROSSWALK:WEST rema |
| 48 | 243 | hold | 0 | 0 | 0 |  | 0 | -2.469 | 10 | ACCIDENT_INTERRUPT incident=INC0005 locked=PAIR:N_S1_STRAIGH |
| 49 | 244 | fallback | 0 | 0 | 0 |  | 0 | -7.731 | 1 | PEDESTRIAN_PATIENCE pedestrian=PED:98:0:CROSSWALK:NORTH rema |
| 50 | 245 | fallback | 0 | 0 | 0 |  | 0 | -2.033 | 1 | PEDESTRIAN_JAYWALK pedestrian=PED:80:0:CROSSWALK:SOUTH; ACCI |
| 51 | 246 | hold | 0 | 0 | 0 |  | 0 | -2.222 | 10 |  |
| 52 | 247 | hold | 0 | 0 | 0 |  | 0 | -4.77 | 10 | PEDESTRIAN_PATIENCE pedestrian=PED:115:0:CROSSWALK:EAST rema |
| 53 | 249 | hold | 0 | 0 | 0 |  | 0 | -6.771 | 10 | PEDESTRIAN_JAYWALK pedestrian=PED:81:0:CROSSWALK:WEST; PEDES |
| 54 | 252 | hold | 0 | 0 | 0 |  | 0 | -11.902 | 9 | PEDESTRIAN_PATIENCE pedestrian=PED:119:0:CROSSWALK:WEST rema |
| 55 | 257 | hold | 0 | 0 | 0 |  | 0 | -4.596 | 4 | PEDESTRIAN_JAYWALK pedestrian=PED:87:0:CROSSWALK:WEST |
| 56 | 259 | hold | 0 | 0 | 0 |  | 0 | -2.986 | 2 | PEDESTRIAN_PATIENCE pedestrian=PED:111:0:CROSSWALK:NORTH rem |
| 57 | 260 | hold | 0 | 0 | 0 |  | 0 | -2.392 | 1 | PEDESTRIAN_JAYWALK pedestrian=PED:106:0:CROSSWALK:WEST |

