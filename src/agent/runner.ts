import OpenAI from "openai";
import {
  config,
  type ReasoningEffort,
  type ReasoningFormat,
} from "../config.js";
import {
  CUT_IN_MIN_QUEUE_ADVANTAGE,
  DRIVER_ALERT_LIMIT,
  DRIVER_PATIENCE_RANGES,
  DRIVER_WARNING_REMAINING_TICKS,
  ROGUE_GAP_CHECK_SLOTS,
  TAILGATE_FOLLOWER_LIMIT,
  TAILGATE_MAX_GAP_SLOTS,
} from "../core/drivers.js";
import { PEDESTRIAN_WAITING_AREA_CAPACITY } from "../core/pedestrians.js";
import type { CompactObservation } from "../core/types.js";
import {
  BUS_PASSENGERS,
  HEAVY_TRUCK_UNITS,
  SHUTTLE_PASSENGERS,
  TAXI_PASSENGERS,
} from "../core/vehicleRoster.js";
import { createArtifactIdentity } from "../io/artifacts.js";
import {
  createDefaultAgentApiLogger,
  type AgentApiLogger,
} from "./api-logger.js";
import {
  AgentMetricsCollector,
  type AgentCycleMetrics,
  type AgentEconomyConfig,
} from "./metrics.js";
import {
  AGENT_TOOLS,
  AgentToolRuntime,
  COMMIT_SCHEDULE,
  type CommitExecution,
} from "./tools.js";
import { WorkingMemoryStack } from "./working-memory.js";
import type { SimulationEngine } from "../core/engine.js";
import {
  compactObservationForModel,
  laneVehicleCounts,
} from "./model-observation.js";
import type { AgentSettlementSummary } from "./settlement.js";

/** Zero cost lines carry no information for the model. */
export function compactSettlement(
  settlement: AgentSettlementSummary | null,
): Record<string, unknown> | null {
  if (settlement === null) {
    return null;
  }
  const costs = Object.fromEntries(
    Object.entries(settlement.costs).filter(([, value]) => value !== 0),
  );
  return {
    ...settlement,
    costs,
    ...(settlement.revenue === 0 ? { revenue: undefined } : {}),
    ...(settlement.pedestrianReward === 0 ? { pedestrianReward: undefined } : {}),
  };
}

const FINAL_ROUND_WARNING =
  "SYSTEM WARNING: 只剩一轮 API。下一次回复必须调用 commit_schedule。";

export function buildTrafficSystemPrompt(
  maxApiRounds: number,
  economy: Partial<AgentEconomyConfig> = {},
): string {
  const initialBalance = economy.initialBalance ?? 1000;
  const tollMotorcycle = economy.tollMotorcycle ?? 0.2;
  const tollStandard = economy.tollStandard ?? 0.1;
  const tollEmergency = economy.tollEmergency ?? 1;
  const decisionTax = economy.decisionTax ?? 0.02;
  const toolTax = economy.toolTax ?? 0.0015;
  const emergencyDelay = economy.emergencyDelayBleedPerTick ?? 0.0015;
  const stallChainStep = economy.stallChainStep ?? 0.0002;
  const hazardBleed = economy.hazardBleedPerResource ?? 0.002;
  const secondaryPenalty = economy.secondaryAdmitPenalty ?? 0.3;
  const pedestrianDelay = economy.pedestrianDelayPerTick ?? 0.001;
  const pedestrianGrace = economy.pedestrianWaitingGraceTicks ?? 10;
  const pedestrianReward = economy.pedestrianCompletionReward ?? 0.04;
  const jaywalkWavePenalty =
    economy.pedestrianJaywalkWavePenalty ?? 0.5;
  const jaywalkerPenalty = economy.pedestrianJaywalkerPenalty ?? 0.1;
  const pedestrianCollisionPenalty =
    economy.pedestrianCollisionPenalty ?? 5;
  const delayBleed = economy.delayBleedPerTick ?? 0.0002;
  const upstreamBleed = economy.upstreamBleedPerTick ?? 0.002;
  const unservedLiability = economy.unservedVehicleLiability ?? 0.1;
  const schoolBusPenalty = economy.schoolBusAccidentPenalty ?? 10;
  const hazmatMultiplier = economy.hazmatHazardMultiplier ?? 3;
  const aggression = economy.vehicleAggression ?? true;
  const [aggressiveLow, aggressiveHigh] = DRIVER_PATIENCE_RANGES.AGGRESSIVE;
  const [normalLow, normalHigh] = DRIVER_PATIENCE_RANGES.NORMAL;
  const [calmLow, calmHigh] = DRIVER_PATIENCE_RANGES.CALM;
  const aggressionSection = aggression
    ? `

### 司机抢行
- 除特殊车辆外，每名司机的耐心由 Seed 固定：激进型（出租车、跑车、肌肉车）${aggressiveLow}–${aggressiveHigh} tick，普通型 ${normalLow}–${normalHigh}，温和型（公交、校车、重型货车、垃圾车）${calmLow}–${calmHigh}。在进口道上每静止一拍消耗一点，向前挪动不清零。剩余不超过 ${DRIVER_WARNING_REMAINING_TICKS} 时出现在 driverAlerts，最多 ${DRIVER_ALERT_LIMIT} 条，最急的在前。预警本身不唤醒你。
- 闯红灯：耐心耗尽、没有许可的停止线队首，只要此刻前方 ${ROGUE_GAP_CHECK_SLOTS} 格没有车，路线经过的横道上也没有行人或行人预约，就自行冲进路口。它不看未来预约：和路口内车辆冲突就会撞车；和已排程未入场的车冲突时，那些车及同车道后方排程被作废（RED_LIGHT_RUNNER）。发生时以 VEHICLE_RED_LIGHT 唤醒你。
- 跟车闯入：某车道最后一辆获准车辆入场时，紧跟其后（间距不超过 ${TAILGATE_MAX_GAP_SLOTS} 格）的车如果耐心已耗尽，或是剩余不超过 ${DRIVER_WARNING_REMAINING_TICKS} 的激进型司机，就会跟着冲进路口，每次最多 ${TAILGATE_FOLLOWER_LIMIT} 辆，规则同闯红灯，作废原因 TAILGATER。dry_run_admit 和 commit_schedule 的 tailgate_risk（vehicle_id、lane_id、behind_vehicle_id）提前列出这些车；把它们纳入同一批次就变成合法放行。发生时以 VEHICLE_TAILGATE 唤醒你。
- 加塞：距停止线 12–24 格、耐心耗尽的车，如果相邻车道队列至少短 ${CUT_IN_MIN_QUEUE_ADVANTAGE} 辆且对应位置空闲，会自行借道，并作废目标车道已放行未入场车辆的许可（LANE_TRANSFER）。加塞车仍需合法放行，照常收费，不唤醒你。
- 闯红灯和跟车闯入的车不付离场收入，也不检查出口容量，出口满时会停在路口里变成 EXIT_BLOCKED 并锁格。它们造成的事故照常计费。`
    : "";
  const horizonText =
    economy.horizonTicks === undefined || economy.horizonTicks === null
      ? "本局在固定决策周期数后结束"
      : economy.endTick === undefined
        ? `本局在预热后固定运行 ${economy.horizonTicks} tick 后结束，最后一次睡眠会被截断到截止时刻`
        : `本局在 currentTick 到达 ${economy.endTick} 时结束（预热之后再运行 ${economy.horizonTicks} tick；currentTick 从开局起计数，包含预热）。observation.endTick 是截止拍，ticksRemaining 是剩余拍数，最后一次睡眠会被截断到截止时刻`;
  return `你是这个路口的交通调度代理。四个方向，每个方向 4 条进口车道。首要目标是让最终财务余额尽可能高。下面的玩法是基线，不是最优策略，也不高于余额。

### 计分
- 开局余额为 ${initialBalance}，最终余额就是你的成绩。
- 普通车辆按乘员计价，stoplineCandidates 每行第 3 项给出每车乘员数：乘用车 1、出租车 ${TAXI_PASSENGERS}、通勤小巴（van）${SHUTTLE_PASSENGERS}、公交和校车 ${BUS_PASSENGERS}、轻型货车 1、重型货车按 ${HEAVY_TRUCK_UNITS} 个货物单位。lanes 每条车道第 2 项是排队车辆（不含已获许可的）的乘员合计。
- 离场收入：普通车辆每位乘员 ${tollStandard}（一辆公交 ${Number((tollStandard * BUS_PASSENGERS).toFixed(4))}）；摩托车 ${tollMotorcycle}；emergency 类警车、救护车、消防车等特殊车辆按车计 ${tollEmergency}。
- 每次 API 调用扣 ${decisionTax}。每次非终结工具调用扣 ${toolTax}。
- 地图内任意进口车道上的实体车辆，处于排队/停止线/抛锚状态且连续静止满 10 tick 后，每位乘员每拍扣 ${delayBleed}；emergency 特殊车辆进入 12 格内后改为按车每拍 ${emergencyDelay}，不叠加普通费率。任意向前移动或进入路口会清零连续静止计时，但已经产生的扣分不会退回。
- lanes 每条车道第 3 项 upstream 是已按种子生成、但暂时进不了已满车道的界外 FIFO 车数。它不生成 3D 车辆，但积压车上的每位乘员每拍扣 ${upstreamBleed}；入口腾出后会按队首顺序入场。
- ${horizonText}。截止时：已离开路口的车辆补发全额离场收入；仍在路口内的车辆按已走过的轨迹比例补发收入；仍在进口车道等待或在 upstreamQueues 积压的车辆，每位乘员一次性扣 ${unservedLiability}。完全不放行会被这些成本持续惩罚。
- 风险车辆：车型字母 S 的校车卷入事故时额外扣 ${schoolBusPenalty}；车型字母 H 的危化品罐车卷入事故时，该事故锁格的扣费乘 ${hazmatMultiplier}。
- 停止线前 24 格内，抛锚车后方的每一辆车连续堵住超过 20 拍后，超出的第 k 拍再扣 k × ${stallChainStep}。k 每过一拍加 1，所以同一段睡眠里后面的拍比前面更贵。sleep_ticks 会把这些车的堵住时间继续往前推。放行其他车道不会停下这条车道的加价。绕行失败时车不动，接下来的睡眠仍按这个加价计。
- 每个被事故锁住的冲突格每拍 ${hazardBleed}。向已切断的路线放行被拒绝时，每次扣 ${secondaryPenalty}。
- 行人等待超过 ${pedestrianGrace} tick 宽限后，每人每 tick 扣 ${pedestrianDelay}；每名经 pedestrian_phases 放行并完成过街的行人奖励 ${pedestrianReward}，闯红灯过街不奖励。
- 每次首次出现 jaywalk 波次扣 ${jaywalkWavePenalty}，并对该波次中每名首次 jaywalker 再扣 ${jaywalkerPenalty}；每名车人碰撞伤员扣 ${pedestrianCollisionPenalty}。每项状态转换只结算一次，事故锁格仍另按每格每拍 ${hazardBleed} 扣费。
- 一条直行大约预约 13 拍。reservedUntil 列出被在途预约占住的路线及其到期 tick，通常可等到期后再试；incidentBlocked 是事故切断的路线，在对应事故关闭前绝对不可放行，其中的 tick 只是清障估计而不是保证解锁时刻。sleep_ticks 取 1 到 10，由你决定。
- dry_run_admit 每个决策周期最多 2 次。你有 ${maxApiRounds} 轮 API。第三次返回 DRY_RUN_QUOTA_EXHAUSTED，并且不会模拟。
- 每名行人的耐心阈值由 Seed 固定在 40–60 tick；斑马线上每 4 tick 前进一格。approaching 是从街区内部沿人行道走来的可见压力，尚不能放行且不消耗耐心；到达等候区后才计入 waiting 并开始耐心计时。满员后的 externalBacklog 不生成 3D 行人。pedestrian_phases 可按斑马线选择 A_TO_B、B_TO_A 或双向，每个 phase 按 FIFO 最多放行 8 人，新到者不跟随本次 phase；绝不自动放行，是否放行仍由你决定。
- 耐心耗尽者每次迈向下一格前会观察该格相关来车：上游 4 格内本 tick 有动车就等待，否则开始或继续 jaywalk。单方向 phase 可使用两行，双方向各占一行。
- 每条路线经过两条斑马线：进口侧一条、出口侧一条。斑马线 N 被 N_* 全部路线、S 直行、E 右转、W 左转经过；S 被 S_* 全部、N 直行、W 右转、E 左转经过；E 被 E_* 全部、W 直行、S 右转、N 左转经过；W 被 W_* 全部、E 直行、N 右转、S 左转经过。引导路线按 GUIDED_ 之后的实际转向算，例如 N_S2_GUIDED_LEFT 是左转。例：N_R1_RIGHT 经过 N 和 W，E_S1_STRAIGHT 经过 E 和 W。一条斑马线的 phase 只有在这些路线不占用该横道的时段里才能通过试算；行人每 4 tick 走一格，8 列走完约 32 tick。
- 路口内可锁定三档速度：SLOW_SLIDE=0.5 格/tick（整数位移 0、1 循环）、CRUISE=1.0（每拍 1 格，默认）、BURST=1.5（整数位移 1、2 循环）。档位只在 CROSSING/EXIT_BLOCKED 生效，进入路口后不可改档。
- vehicle_speed_profiles 只用于零散显式车辆；lane_batches.speed_profile 对整批生效。省略均规范化为 CRUISE。卡车和公交的直行慢起步及整个转弯会把档位上限压到 SLOW_SLIDE，不会与 Agent 档位叠成 0.25。
- BURST 的预约和事故检查覆盖本拍当前、中间、目标姿态的完整车身 swept 资源，不能用两格跳跃跨过车辆、事故锁格或行人。dry_run_admit 与 commit_schedule 的显式车辆、逐车档位、lane batch（含档位）和 pedestrian phases 必须规范化后完全匹配，否则不算 verified。${aggressionSection}

### 观测
- lane_batches 可以在一次 dry_run/commit 中并行指定多条进口车道的 Top-N，例如东西双向四条直行车道各 Top-3。这是提高吞吐量的主要手段；candidate_vehicle_ids / admit_vehicle_ids 留给零散队首和特情。
- crosswalks 按斑马线给出 A 侧等候区、横道格子、B 侧等候区（格式见“空间矩阵”）。每个等候区最多容纳 ${PEDESTRIAN_WAITING_AREA_CAPACITY} 人，满员后新到者计入 externalBacklog。只有 waiting 可被 phase 放行，总压力应同时考虑 approaching、waiting 与 externalBacklog。pedestrianAlerts 会在耐心剩余不超过 24 tick 时提前预警，或列出正在 jaywalk 的高风险个体。需要有限个体详情时使用 inspect_crosswalk。
- candidateConflictScope 固定为 STOPLINE_HEADS_SAME_TICK：candidateConflicts 只比较当前队首在同一 tick 进入的两两冲突，不包含 Top-N 后续车辆、已获许可车队或路口在途车辆。无冲突边不能证明 lane_batches 安全。
- 已提交但尚未越过停止线的车由引擎持有 SCHEDULED_ENTERING 许可，不会再次出现在 stoplineCandidates。dischargingLanes 会给出仍在持续放行的车道、剩余车辆和预计出清 tick。
- 许可会被引擎作废并列入 revokedAdmissions（最近 10 拍）：LANE_TRANSFER 表示有车换道插入该车道；HEAD_UNSCHEDULED 表示前方有未放行的车挡住；SLIDE_LIMIT 表示入口持续受阻、累计顺延超过上限；JAYWALKER_AHEAD 表示这辆车尚未进入路口，而它要经过的横道上有人闯红灯，于是该车及同车道后方所有排程一并作废（已在路口内的车不受影响，也不会刹停）；RED_LIGHT_RUNNER 和 TAILGATER 表示有司机抢行冲进了这辆车的预约路径，它为避让而刹停。被作废的车重新出现在 stoplineCandidates，需要重新 dry-run 放行。
- dry_run_admit 与 commit_schedule 的结果若含 jaywalker_warnings（vehicle_id、crosswalk_id、pedestrian_ids），表示该车路线经过的横道上此刻有人闯红灯。预约表不包含闯红灯行人，立即入场的车会直接撞上，排程车会在入场前被 JAYWALKER_AHEAD 作废。看到警告应把这些车移出计划，重新试算。
- activeVehicleMotions 只列路口内或已获许可待入场的车辆及其档位；普通未放行队首不重复展示默认档位。
- 长车队通常配合 8~10 拍休眠，但重车、转弯和队列缝隙可能让整个车队超过 10 拍才出清。下一周期先看 dischargingLanes，不要重复放行已获许可的车。
- emergencyAlerts 是已经进入 12 格的紧急车清单；静止拍数 >= 10 表示正在按 ${emergencyDelay}/tick 扣分。车辆一旦前移或进入路口，连续计时清零，但已经产生的扣分不会退回。
- emergencyNotices 每条边沿只出现一次：第一次在 12 格外看到是 OUTSIDE_HORIZON；第一次进入 12 格内是 ENTERED_HORIZON，包括上一轮睡眠期间跨过这条线、这一轮才看到的情况。同一条边沿不重复。
- recentCycles 是最多 2 个已经发生的决策的压缩记录。里面列出的通知是历史，不是新警报。
- stalledVehicles 的绕行列表会给出每条相邻路线当前最多能挪几辆，以及第一个阻塞车辆和槽位。只在可挪车数足够时调用 reroute_queue_around_stall。它返回 TARGET_LANE_SLOT_OCCUPIED 时车没有被挪走，后方链式加价还在。
- stalledVehicles 带拖车项表示付费拖车已在路上，不要重复派车。所有绕行可挪车数都为 0 或链式损失持续增长时使用 dispatch_tow_truck；拖车到达前延误仍计费。
- 事故有 SCRAPE、REAR_END、ANGLE_COLLISION、PILEUP 四类，清障准备和撤离速度依次变慢；inspect_incident 会给出 severity、estimated_clearance_ticks 和二次事故风险。停止线新车会在断路前刹停，但已经进入路口的车可能并入事故并升级为 PILEUP。
- incidentBlocked 中的路线必须等对应事故 CLOSED；不要用 sleep_ticks=1 追逐它的估计 tick。先 inspect_incident，并推进已下达的清障。
- set_lane_detour 是有副作用的事故处置，不是查询工具。HOLD 会暂停车道直到事故关闭并自动释放，RELEASE 可提前解除；查询路线使用 incidentBlocked 或 inspect_incident。它不能修复抛锚；普通路线返回 SOURCE_NOT_SEVERED，抛锚队首返回 STALLED_HEAD。
- 借道只改车道，不改去向：车辆换到直接相邻车道后仍按原意图（intentRouteId）驶向原出口方向。目标车道原生路线去向相同时直接使用原生路线（例如 S1 与 S2 直行互借），否则使用 *_GUIDED_* 引导轨迹；没有保持去向的轨迹时返回 MANEUVER_NOT_SUPPORTED。换道必须由工具把车实体滑到有空间的直接相邻车道；禁止只改 route，也禁止跨过中间车道。事故队首即使已经到停止线也必须通过相邻性和槽位占用检查。失败时按 valid_target_route_ids、blocking_vehicle_id 和 blocked_slot 修正，不要重复原调用。
- 任何换道（绕行、清道、事故借道、车道诱导）都会作废目标车道上已放行未入场车辆的许可，见 revokedAdmissions。stoplineCandidates 带 intentRouteId 表示这辆车正在借道，routeId 是它实际走的引导轨迹。
- laneGuidanceOpportunities 列出距停止线 12–24 格内可诱导到相邻车道的车辆；两条车道的占用直接看 lanes 矩阵。guide_inbound_lane_change 会把车辆原子地移到相邻物理车道，并绑定保留原意图的临时许可；失败时世界状态不变。inspect_lane_queue 会返回每辆车的 distance_to_stopline 和 valid_guidance_target_lanes。该工具不是终结动作，车辆到停止线后应基于新 route 重新 dry-run，不能复用换道前的试算。
- activeLaneGuidancePermits 只表示仍在进口道上的借道车辆；车辆获准进入路口后许可元数据自动释放，但它继续沿已预约的引导轨迹行驶。每个方向支持 L1 左转借 S2、S2 直行借 L1、S1 直行借 R1、R1 右转借 S1 四种引导轨迹，不支持跨道或潮汐改向。

### 基线玩法（可以偏离）
1. 先看事故、抛锚回包和这一轮新的紧急通知，再看普通车流。
2. workingMemoryTop 还有效时，可以接着执行。否则比较两条轴线，选一条。
3. 组合同一轴线相容的队首；优先用多个 lane_batches 同时放行整条方向相位。同一进口的直行和右转使用分离轨迹，斑马线和出口状态允许时应一起试算放行。路线还在 reservedUntil 或 incidentBlocked 里的队首先拿掉。垂直方向的直行这一拍可能合法，但会把路口预约给下一波。
4. dry_run_admit 先试一次。车辆和 pedestrian_phases 必须作为同一个原子计划验证；有冲突就调整后再试。任何 top_n >= 2 或包含 pedestrian_phases 的计划，verified commit 都必须使用规范化后完全相同参数的 phase；失败、改参或配额耗尽后不得用历史组合替代验证。
5. 放行一整波之后，多睡几拍可以等它离开路口。只是在等预约到期时，短睡就够。抛锚后方的链式加价会随睡眠继续上涨，放行别的方向停不掉它。余额更高时就偏离这些步骤。

如果 interruptReason 以 ACCIDENT_INTERRUPT 开头，先调用 inspect_incident，然后 order_accident_clearance，或者 set_lane_detour。不要向已切断的路线放行。dispatch_emergency_convoy 的 clearing_route_id 同样执行实体相邻换道并保持原去向，目标被占、不相邻或无法保持去向时整组不动。guide_inbound_lane_change、dispatch_emergency_convoy、reroute_queue_around_stall 和 dispatch_tow_truck 都不是终结动作，用过之后仍然要调用 commit_schedule。commit_schedule 是终结动作：会在未来占用同一冲突格的车仍会被放行，并在那里追尾。不要编造车辆或车道 ID。

### 空间矩阵
- 车型字母：P 乘用车、T 出租车、V 通勤小巴、B 公交、S 校车、L 轻型货车、K 重型货车、H 危化品罐车、E 特殊车辆（警车、救护车、消防车等）、M 摩托车。矩阵里大写字母是车头，同一辆车的车身用对应小写字母，每个字母占 1 格，所以字母个数就是车长（例如 Bbbb 是 4 格长的公交）。. 是空格。
- lanes：{进口车道 ID: [矩阵, 排队乘员, upstream, 已获许可车数, 本轮净变化]}。矩阵每个字符是一格，下标 0 紧贴停止线，越往后离路口越远；末尾的空格被截掉。已获许可车数是车道上已排程待入场的车；本轮净变化是与上一次决策时相比车道上的车数变化，首轮没有这一项。没有车也没有积压的车道省略。
- exits：{出口车道 ID: 矩阵}，下标 0 紧贴路口出口，越往后离路口越远；车头朝外，车身在车头下标更小的一侧。空出口省略。
- crosswalks：{N|E|S|W: [A 侧, 格子, B 侧, 车辆预约截止 tick?]}，分别对应 CROSSWALK:NORTH/EAST/SOUTH/WEST；工具的 crosswalk_id 直接填这些短键也可以。A 侧是 A_TO_B 方向的等候区，B 侧是 B_TO_A 方向的等候区，每侧为 [approaching, waiting, externalBacklog, minPatienceRemaining, clearTick]（没有时为 null）。格子是两行字符串，每行 8 列，列 0 是 A 端：南北两条横道的西端、东西两条横道的北端。c 已放行行人，j 闯红灯行人，x 伤员，v 车辆压在该格上，. 空。第 4 项是已有车辆预约（含路口内和已排程待入场的车）占用该横道任一格的最后一个 tick；没有这一项表示此刻没有车辆预约这条横道。在它之前放行 phase 通常会 RESOURCE_CONFLICT。
- 路口中心不在每轮观测里。需要时调用 inspect_junction：网格固定 15×15，行 0 是最北一行（y=-7），列 0 是最西一列（x=-7），北在上；空格表示不在任何轨迹上的格子。它的 crosswalks 逐格给出横道在 horizon 内最早被车辆预约的拍偏移。

### 紧凑观测编码
- 缺失的集合字段表示空集合，元组按下面的顺序给出，末尾缺省项省略，中间缺省为 null。
- stoplineCandidates：[vehicleId, 车型字母, 乘员, waitingTicks, routeId, intentRouteId?]。进口车道由 routeId 前两段确定，例如 E_S2_GUIDED_LEFT 在 IN_E_S2_STRAIGHT 上；需要 lane_id 的工具也接受 routeId，自动换成它所在的进口车道。
- reservedUntil：{routeId: 预约到期 tick}。incidentBlocked：{事故 ID（多起用 + 连接）: {估计解锁 tick: [routeId...]}}。
- candidateConflicts 的范围固定为 STOPLINE_HEADS_SAME_TICK，写成邻接表 {vehicleId: [与之冲突的 vehicleId...]}，每对只出现一次。
- dischargingLanes：{laneId: [剩余车辆, 下一辆入场 tick, 预计出清 tick]}。
- revokedAdmissions：[tick, laneId, reason, [vehicleId...]]。
- activeVehicleMotions：[vehicleId, routeId, 状态, 档位, scheduledEnterTick?]。状态 X=CROSSING、EB=EXIT_BLOCKED、SE=SCHEDULED_ENTERING；档位 S=SLOW_SLIDE、C=CRUISE、B=BURST。
- emergencyAlerts：[vehicleId, laneId, queueIndex, distanceToStopline, 静止拍数, [前方阻挡 vehicleId...]]。收费状态由静止拍数 >= 10 推导，费率固定为 ${emergencyDelay}/tick。
- emergencyNotices：[vehicleId, laneId, distanceToStopline, kind, surchargeActive 0/1]。
- stalledVehicles：[vehicleId, laneId, routeId, distanceToStopline, 后方受阻车数, [[绕行 routeId, 最多可挪车数, 阻挡 vehicleId?, 阻挡槽位?, 不支持的 vehicleId?]...], [拖车完成 tick, 剩余拍数]?]。
- activeLaneHolds：[laneId, routeId, incidentId, sinceTick]，事故关闭时自动释放。
- exitHolds、crosswalkHolds：{laneId: [当前是否有车 0/1, 解除 tick]}。
- pedestrianAlerts：[pedestrianId, 方向 AB|BA, 类型 P=耐心告急 J=正在闯红灯, patienceRemaining]；pedestrianId 以所在斑马线 ID 结尾。
- driverAlerts：[vehicleId, laneId, distanceToStopline, 性格 A=激进 N=普通 C=温和, patienceRemaining]。
- laneGuidanceOpportunities：[源车道, 目标车道, [vehicleId...]]。activeLaneGuidancePermits：[vehicleId, 源车道, 目标车道, guidedRouteId, intentRouteId]。
- 事故类 interruptReason 里的 locked=N 是锁格数量，具体格子用 inspect_incident 的 lock_grid 查看。
- dry_run_admit 与 commit_schedule 的 vehicle_plans：[vehicleId, 档位, enterTick, 预计出清 tick, 是否排程 0/1]。
- lastSettlement 是上一完整周期的财务结算；costs 中各项都是正数扣款，只列非零项，未列出的收入为 0；netDelta = endingBalance - startingBalance。首周期为 null。`;
}

export interface AgentRunnerOptions {
  readonly client: OpenAI;
  readonly engine: SimulationEngine;
  readonly memory: WorkingMemoryStack;
  readonly model: string;
  readonly reasoningFormat?: ReasoningFormat;
  readonly reasoningEffort?: ReasoningEffort;
  readonly replayReasoningContent?: boolean;
  readonly maxTokens: number;
  readonly maxApiRounds: number;
  readonly maxToolCalls: number;
  readonly economy: AgentEconomyConfig;
  readonly tollMotorcycle: number;
  readonly tollStandard: number;
  readonly tollEmergency: number;
  readonly towDispatchCost?: number;
  readonly towClearanceTicks?: number;
  readonly logger?: AgentApiLogger;
}

export interface AgentCycleInput {
  readonly financialBalance: number;
  readonly interruptReason?: string;
  readonly lastSettlement?: AgentSettlementSummary | null;
}

export interface AgentTraceEvent {
  readonly kind:
    | "API_REQUEST"
    | "API_RESPONSE"
    | "API_ERROR"
    | "MODEL_RESPONSE"
    | "TOOL_RESULT"
    | "PROTOCOL_WARNING"
    | "FALLBACK";
  readonly round: number;
  readonly data: unknown;
}

export interface AgentCycleResult {
  readonly commit: CommitExecution;
  readonly metrics: AgentCycleMetrics;
  readonly trace: readonly AgentTraceEvent[];
  readonly observation: CompactObservation;
  readonly usedFallback: boolean;
}

interface RecentCycle {
  readonly cycle: number;
  readonly tick: number;
  readonly sleepTicks: number;
  readonly admittedVehicleIds: readonly string[];
  readonly balance: number;
  readonly notices: readonly string[];
  readonly tacticalSummary: string;
}

export interface RunnerCheckpointState {
  readonly cycle: number;
  readonly recentCycles: readonly unknown[];
  readonly pendingFeedback: readonly string[];
  readonly incidents: readonly {
    readonly id: string;
    readonly fact: unknown;
    readonly clearanceOrdered: boolean;
  }[];
}

type StepFunChatCompletionRequest = Omit<
  OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  "reasoning_effort"
> & {
  readonly reasoning_format?: ReasoningFormat;
  readonly reasoning_effort?: ReasoningEffort;
};

type ProviderAssistantMessage =
  OpenAI.Chat.Completions.ChatCompletionMessage & {
    readonly reasoning?: string | null;
    readonly reasoning_content?: string | null;
  };

type ReasoningAssistantMessage =
  OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam & {
    readonly reasoning_content?: string;
  };

export class ToolCallAgentRunner {
  private readonly pendingFeedback: string[] = [];
  private readonly recentCycles: RecentCycle[] = [];
  private previousLaneCounts: ReadonlyMap<string, number> | undefined;
  private readonly logger: AgentApiLogger;
  private cycle = 0;
  private cycleBalance = 0;

  constructor(private readonly options: AgentRunnerOptions) {
    if (options.maxApiRounds < 2) {
      throw new Error("maxApiRounds must be at least 2");
    }
    this.logger =
      options.logger ??
      createDefaultAgentApiLogger({
        enabled: config.agent.apiLog,
        consoleEnabled: config.agent.apiLogConsole,
        directory: config.agent.apiLogDir,
        identity: createArtifactIdentity({
          model: options.model,
          ...(config.agent.artifactPostfix.length > 0
            ? { postfix: config.agent.artifactPostfix }
            : {}),
        }),
      });
  }

  async runCycle(input: AgentCycleInput): Promise<AgentCycleResult> {
    this.cycle += 1;
    this.cycleBalance = input.financialBalance;
    const tick = this.options.engine.currentTick;
    const peeked = this.options.memory.peek().plan;
    const observation = this.options.engine.buildObservation(
      input.financialBalance,
      input.interruptReason,
      peeked === null
        ? null
        : {
            phaseName: peeked.phaseName,
            targetTick: peeked.targetTick,
            isExpired: tick >= peeked.targetTick,
            depth: this.options.memory.depth,
          },
    );
    const metrics = new AgentMetricsCollector(this.options.economy);
    const runtime = new AgentToolRuntime({
      engine: this.options.engine,
      memory: this.options.memory,
      metrics,
      tollMotorcycle: this.options.tollMotorcycle,
      tollStandard: this.options.tollStandard,
      tollEmergency: this.options.tollEmergency,
      ...(this.options.towDispatchCost === undefined
        ? {}
        : { towDispatchCost: this.options.towDispatchCost }),
      ...(this.options.towClearanceTicks === undefined
        ? {}
        : { towClearanceTicks: this.options.towClearanceTicks }),
    });
    const trace: AgentTraceEvent[] = [];
    const spatialSnapshot = this.options.engine.spatialSnapshot();
    const previousLaneCounts = this.previousLaneCounts;
    this.previousLaneCounts = laneVehicleCounts(spatialSnapshot);
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: buildTrafficSystemPrompt(
          this.options.maxApiRounds,
          this.options.economy,
        ),
      },
      {
        role: "user",
        content: JSON.stringify(
          roundModelNumericPrecision({
            observation: compactObservationForModel(
              observation,
              this.options.economy.endTick,
              {
                snapshot: spatialSnapshot,
                ...(previousLaneCounts === undefined ? {} : { previousLaneCounts }),
              },
            ),
            previous_agent_feedback: this.consumePendingFeedback(),
            recentCycles: this.recentCycles,
            lastSettlement: compactSettlement(input.lastSettlement ?? null),
          }),
        ),
      },
    ];

    let nonTerminalToolCalls = 0;
    let noToolResponses = 0;

    for (let round = 1; round <= this.options.maxApiRounds; round += 1) {
      const requestPayload: StepFunChatCompletionRequest = {
        model: this.options.model,
        max_tokens: this.options.maxTokens,
        ...(this.options.reasoningFormat === undefined
          ? {}
          : { reasoning_format: this.options.reasoningFormat }),
        ...(this.options.reasoningEffort === undefined
          ? {}
          : { reasoning_effort: this.options.reasoningEffort }),
        tool_choice: "auto",
        tools: AGENT_TOOLS,
        messages,
      };
      this.logger.logRaw?.({
        timestamp: new Date().toISOString(),
        event: "API_REQUEST",
        tick,
        cycle: this.cycle,
        round,
        payload: requestPayload,
      });
      this.logger.log({
        timestamp: new Date().toISOString(),
        event: "API_REQUEST",
        tick,
        cycle: this.cycle,
        round,
        payload: requestPayload,
      });
      trace.push({ kind: "API_REQUEST", round, data: requestPayload });

      const startedAt = performance.now();
      let response: OpenAI.Chat.Completions.ChatCompletion;
      try {
        response = await this.options.client.chat.completions.create(
          requestPayload as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
        );
      } catch (error) {
        const latencyMs = Math.round(performance.now() - startedAt);
        const status = errorStatus(error);
        const errorPayload = {
          message: error instanceof Error ? error.message : String(error),
          ...(status === undefined ? {} : { status }),
        };
        this.logger.logRaw?.({
          timestamp: new Date().toISOString(),
          event: "API_ERROR",
          tick,
          cycle: this.cycle,
          round,
          latencyMs,
          payload: serializeRawError(error),
        });
        metrics.recordApiCall(latencyMs);
        metrics.recordProtocolViolation("api_error");
        this.logger.log({
          timestamp: new Date().toISOString(),
          event: "API_ERROR",
          tick,
          cycle: this.cycle,
          round,
          latencyMs,
          payload: errorPayload,
        });
        trace.push({ kind: "API_ERROR", round, data: errorPayload });
        trace.push({
          kind: "FALLBACK",
          round,
          data: {
            reason: "api_error",
            message: errorPayload.message,
          },
        });
        return this.fallback(observation, metrics, trace);
      }

      const latencyMs = Math.round(performance.now() - startedAt);
      const tokenStats = metrics.recordApiCall(latencyMs, response.usage);
      const message = response.choices[0]?.message;
      this.logger.logRaw?.({
        timestamp: new Date().toISOString(),
        event: "API_RESPONSE",
        tick,
        cycle: this.cycle,
        round,
        latencyMs,
        payload: response,
      });
      const responsePayload = {
        id: response.id,
        model: response.model,
        finishReason: response.choices[0]?.finish_reason ?? null,
        content: message?.content ?? null,
        toolCalls: message?.tool_calls ?? [],
        usage: response.usage ?? null,
        tokenStats,
      };
      this.logger.log({
        timestamp: new Date().toISOString(),
        event: "API_RESPONSE",
        tick,
        cycle: this.cycle,
        round,
        latencyMs,
        payload: responsePayload,
      });
      trace.push({ kind: "API_RESPONSE", round, data: responsePayload });
      trace.push({
        kind: "MODEL_RESPONSE",
        round,
        data: {
          finishReason: response.choices[0]?.finish_reason ?? null,
          content: message?.content ?? null,
          toolCalls: message?.tool_calls ?? [],
        },
      });

      if (message === undefined) {
        metrics.recordProtocolViolation("missing_model_message");
        return this.fallback(observation, metrics, trace);
      }
      messages.push(
        normalizeAssistantMessage(
          message,
          this.options.replayReasoningContent !== false,
        ),
      );

      const toolCalls = (message.tool_calls ?? []).filter(
        (
          call,
        ): call is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall =>
          call.type === "function",
      );
      if (toolCalls.length === 0) {
        noToolResponses += 1;
        metrics.recordProtocolViolation("text_without_tool_call");
        messages.push({
          role: "system",
          content:
            noToolResponses >= 2
              ? "Tool protocol violated twice. The system will apply a safe fallback."
              : "You must use the provided tools and finish with commit_schedule.",
        });
        if (noToolResponses >= 2) {
          return this.fallback(observation, metrics, trace);
        }
        continue;
      }

      const terminalIndex = toolCalls.findIndex(
        (call) => call.function.name === COMMIT_SCHEDULE,
      );
      if (terminalIndex >= 0 && toolCalls.length > 1) {
        metrics.recordParallelTerminalWarning();
        this.pendingFeedback.push("warning_parallel_terminal");
        trace.push({
          kind: "PROTOCOL_WARNING",
          round,
          data: "warning_parallel_terminal",
        });
      }

      const hasCommit = terminalIndex >= 0;
      const lastIndex = hasCommit ? terminalIndex : toolCalls.length - 1;
      for (let index = 0; index <= lastIndex; index += 1) {
        const toolCall = toolCalls[index];
        if (toolCall === undefined) {
          continue;
        }
        const isTerminal = toolCall.function.name === COMMIT_SCHEDULE;
        if (!isTerminal && nonTerminalToolCalls >= this.options.maxToolCalls) {
          if (hasCommit) {
            metrics.recordWarning("warning_tool_quota_skipped");
            continue;
          }
          metrics.recordProtocolViolation("tool_call_limit_exhausted");
          trace.push({
            kind: "FALLBACK",
            round,
            data: { reason: "tool_call_limit_exhausted" },
          });
          return this.fallback(observation, metrics, trace);
        }

        this.logger.log({
          timestamp: new Date().toISOString(),
          event: "TOOL_CALL",
          tick,
          cycle: this.cycle,
          round,
          payload: {
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            arguments: parseToolArguments(toolCall.function.arguments),
          },
        });
        const execution = runtime.execute(
          toolCall.function.name,
          toolCall.function.arguments,
        );
        if (!isTerminal) {
          nonTerminalToolCalls += 1;
        }
        const remaining = this.options.maxToolCalls - nonTerminalToolCalls;
        let output = execution.output;
        if (!execution.terminal && remaining <= 2) {
          output = appendQuotaWarning(output, remaining);
        }
        if (round === this.options.maxApiRounds - 1 && !execution.terminal) {
          output = appendFinalRoundWarning(output);
        }
        this.logger.log({
          timestamp: new Date().toISOString(),
          event: "TOOL_RESULT",
          tick,
          cycle: this.cycle,
          round,
          payload: {
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            output,
          },
        });
        trace.push({
          kind: "TOOL_RESULT",
          round,
          data: {
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            output,
          },
        });

        if (execution.terminal && execution.commit !== undefined) {
          this.remember(observation, execution.commit);
          return {
            commit: execution.commit,
            metrics: metrics.snapshot(),
            trace,
            observation,
            usedFallback: false,
          };
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(output),
        });
      }
    }

    metrics.recordProtocolViolation("api_round_limit_exhausted");
    trace.push({
      kind: "FALLBACK",
      round: this.options.maxApiRounds,
      data: { reason: "api_round_limit_exhausted" },
    });
    return this.fallback(observation, metrics, trace);
  }

  private fallback(
    observation: CompactObservation,
    metrics: AgentMetricsCollector,
    trace: AgentTraceEvent[],
  ): AgentCycleResult {
    const admission = this.options.engine.applyAdmissions([]);
    const commit = {
      admission,
      pedestrianPhases: [],
      sleepTicks: 1,
      tacticalSummary: "Safe fallback: no admissions",
    };
    this.remember(observation, commit);
    return {
      commit,
      metrics: metrics.snapshot(),
      trace,
      observation,
      usedFallback: true,
    };
  }

  private remember(observation: CompactObservation, commit: CommitExecution): void {
    this.recentCycles.push({
      cycle: this.cycle,
      tick: observation.currentTick,
      sleepTicks: commit.sleepTicks,
      admittedVehicleIds: [...commit.admission.admittedVehicleIds],
      balance: this.cycleBalance,
      notices: observation.emergencyNotices.map(
        (notice) => `${notice.vehicleId}:${notice.kind}`,
      ),
      tacticalSummary: commit.tacticalSummary,
    });
    if (this.recentCycles.length > 2) {
      this.recentCycles.shift();
    }
  }

  private consumePendingFeedback(): string[] {
    const feedback = [...this.pendingFeedback];
    this.pendingFeedback.length = 0;
    return feedback;
  }

  exportRunnerState(): RunnerCheckpointState {
    return {
      cycle: this.cycle,
      recentCycles: this.recentCycles.map((cycle) => ({ ...cycle })),
      pendingFeedback: [...this.pendingFeedback],
      incidents: [],
    };
  }

  restoreRunnerState(state: RunnerCheckpointState): void {
    this.cycle = state.cycle;
    this.recentCycles.length = 0;
    this.recentCycles.push(...(state.recentCycles as RecentCycle[]));
    this.pendingFeedback.length = 0;
    this.pendingFeedback.push(...state.pendingFeedback);
  }
}

function serializeRawError(error: unknown): unknown {
  if (!(error instanceof Error)) {
    return error;
  }
  const record = error as Error & {
    readonly status?: unknown;
    readonly code?: unknown;
    readonly type?: unknown;
    readonly param?: unknown;
  };
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    status: record.status,
    code: record.code,
    type: record.type,
    param: record.param,
  };
}

function roundModelNumericPrecision(value: unknown): unknown {
  if (typeof value === "number") {
    return Number.isFinite(value) && !Number.isInteger(value)
      ? Number(value.toFixed(4))
      : value;
  }
  if (Array.isArray(value)) {
    return value.map(roundModelNumericPrecision);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      roundModelNumericPrecision(nested),
    ]),
  );
}

function normalizeAssistantMessage(
  rawMessage: OpenAI.Chat.Completions.ChatCompletionMessage,
  replayReasoningContent: boolean,
): ReasoningAssistantMessage {
  const message = rawMessage as ProviderAssistantMessage;
  const reasoningContent = replayReasoningContent
    ? (message.reasoning_content ?? message.reasoning ?? undefined)
    : undefined;
  return {
    role: "assistant",
    content: message.content,
    ...(message.tool_calls === undefined
      ? {}
      : { tool_calls: message.tool_calls }),
    ...(reasoningContent === undefined
      ? {}
      : { reasoning_content: reasoningContent }),
  };
}

function appendQuotaWarning(output: unknown, remaining: number): unknown {
  const warning = `SYSTEM WARNING: 非终结工具配额即将用完（还剩 ${remaining} 次）。请立即调用 commit_schedule。`;
  if (typeof output === "object" && output !== null && !Array.isArray(output)) {
    return { ...output, quota_warning: warning };
  }
  return { result: output, quota_warning: warning };
}

function appendFinalRoundWarning(output: unknown): unknown {
  if (typeof output === "object" && output !== null && !Array.isArray(output)) {
    return { ...output, system_warning: FINAL_ROUND_WARNING };
  }
  return { result: output, system_warning: FINAL_ROUND_WARNING };
}

function parseToolArguments(rawArguments: string): unknown {
  try {
    return JSON.parse(rawArguments);
  } catch {
    return rawArguments;
  }
}

function errorStatus(error: unknown): number | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }
  return undefined;
}
