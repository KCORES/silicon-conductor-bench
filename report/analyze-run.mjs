// Analyze how a model played one benchmark run.
// Reads the replay plus the sibling report / api-log / raw-api-log of the same run
// (and same-condition baseline reports in the same directory) and writes
// analysis.json and analysis.md with metrics and evidence cards.
//
//   node report/analyze-run.mjs logs/replay_<ID>.json [--out report/out] [--top 5]
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

// ---------------------------------------------------------------- arguments

function parseArgs(argv) {
  const options = { out: "report/out", top: 5, replay: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") {
      options.out = argv[++index];
    } else if (arg === "--top") {
      options.top = Number(argv[++index]);
    } else if (options.replay === undefined) {
      options.replay = arg;
    }
  }
  if (options.replay === undefined) {
    throw new Error("Usage: node report/analyze-run.mjs logs/replay_<ID>.json [--out dir] [--top n]");
  }
  return options;
}

function resolveArtifacts(replayPath) {
  const absolute = resolve(replayPath);
  const match = /^replay_(.+)\.json$/.exec(basename(absolute));
  if (match === null) {
    throw new Error(`Not a replay file: ${replayPath}`);
  }
  const id = match[1];
  const directory = dirname(absolute);
  const path = (prefix, extension) => join(directory, `${prefix}_${id}.${extension}`);
  const artifacts = {
    id,
    directory,
    replay: absolute,
    report: path("report", "json"),
    apiLog: path("api-log", "jsonl"),
    rawApiLog: path("raw-api-log", "jsonl"),
  };
  for (const key of ["report", "apiLog"]) {
    if (!existsSync(artifacts[key])) {
      throw new Error(`Missing ${key}: ${artifacts[key]}`);
    }
  }
  if (!existsSync(artifacts.rawApiLog)) {
    artifacts.rawApiLog = undefined;
  }
  return artifacts;
}

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

function readJsonl(path) {
  const records = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.trim() === "") {
      continue;
    }
    try {
      records.push(JSON.parse(line));
    } catch {
      // Truncated trailing line of an interrupted run.
    }
  }
  return records;
}

// ---------------------------------------------------------------- helpers

const round = (value, digits = 2) =>
  typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(digits)) : value;

function stats(values) {
  const sorted = values.filter((value) => typeof value === "number").sort((a, b) => a - b);
  if (sorted.length === 0) {
    return { count: 0 };
  }
  const at = (fraction) => sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    count: sorted.length,
    mean: round(sum / sorted.length, 1),
    p50: at(0.5),
    p95: at(0.95),
    max: sorted.at(-1),
    min: sorted[0],
  };
}

function countBy(values) {
  const counts = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]));
}

const groupBy = (values, key) => {
  const groups = new Map();
  for (const value of values) {
    const group = key(value);
    const list = groups.get(group) ?? [];
    list.push(value);
    groups.set(group, list);
  }
  return groups;
};

const ratio = (part, whole) => (whole === 0 ? null : round(part / whole, 3));

function excerpt(text, head = 500, tail = 300) {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  if (flat.length <= head + tail + 20) {
    return flat;
  }
  return `${flat.slice(0, head)} …… ${flat.slice(-tail)}`;
}

function snippetsAround(text, pattern, width = 220, limit = 3) {
  const flat = (text ?? "").replace(/\s+/g, " ");
  const found = [];
  const regex = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  let match;
  while ((match = regex.exec(flat)) !== null && found.length < limit) {
    found.push(flat.slice(Math.max(0, match.index - width), match.index + match[0].length + width));
    regex.lastIndex = match.index + match[0].length + width;
  }
  return found;
}

/** Entry crosswalk is the approach side; exit side follows the turn. */
const EXIT_SIDE = {
  STRAIGHT: { N: "S", S: "N", E: "W", W: "E" },
  RIGHT: { N: "W", E: "N", S: "E", W: "S" },
  LEFT: { N: "E", E: "S", S: "W", W: "N" },
};
const SIDE_NAME = { N: "CROSSWALK:NORTH", S: "CROSSWALK:SOUTH", E: "CROSSWALK:EAST", W: "CROSSWALK:WEST" };

function routeCrosswalks(routeId) {
  const entry = routeId?.charAt(0);
  const turn = routeId?.split("_").at(-1);
  const exit = EXIT_SIDE[turn]?.[entry];
  return exit === undefined ? [] : [SIDE_NAME[entry], SIDE_NAME[exit]];
}

function classifyId(value) {
  if (/^V\d{5}$/.test(value)) return "vehicle";
  if (/^INC\d+$/.test(value)) return "incident";
  if (/^PED:/.test(value)) return "pedestrian";
  if (/^(IN|OUT)_[A-Z0-9_]+$/.test(value)) return "lane";
  if (/^CROSSWALK:(NORTH|SOUTH|EAST|WEST)$/.test(value)) return "crosswalk";
  if (/^CROSSWALK:|^[NESW]$|^(NORTH|SOUTH|EAST|WEST)$/i.test(value)) return "crosswalkShortKey";
  if (/^[NSEW]_[A-Z0-9]+_[A-Z_]+$/.test(value)) return "route";
  return undefined;
}

const FREE_TEXT_KEYS = new Set(["tactical_summary", "plan_data", "phase_name", "resume_condition"]);

function collectIds(value, key, out) {
  if (FREE_TEXT_KEYS.has(key)) {
    return out;
  }
  if (typeof value === "string") {
    let kind = classifyId(value);
    if (kind === "route" && (key === "lane_id" || key === "target_lane")) kind = "routeAsLaneId";
    if (kind !== undefined) {
      out.push({ kind, value, key });
    }
  } else if (Array.isArray(value)) {
    for (const item of value) collectIds(item, key, out);
  } else if (value !== null && typeof value === "object") {
    for (const [childKey, child] of Object.entries(value)) collectIds(child, childKey, out);
  }
  return out;
}

const messageText = (message) =>
  (typeof message.content === "string" ? message.content : JSON.stringify(message.content ?? "")) +
  (message.tool_calls === undefined ? "" : JSON.stringify(message.tool_calls));

// ---------------------------------------------------------------- load

function loadRun(artifacts) {
  const replay = readJson(artifacts.replay);
  const report = readJson(artifacts.report);
  const summary = report.summary ?? report;
  const api = readJsonl(artifacts.apiLog);
  const raw = artifacts.rawApiLog === undefined ? [] : readJsonl(artifacts.rawApiLog);

  const requests = api.filter((record) => record.event === "API_REQUEST");
  const responses = api.filter((record) => record.event === "API_RESPONSE");
  const apiErrors = api.filter((record) => record.event === "API_ERROR");
  const results = new Map(
    api.filter((record) => record.event === "TOOL_RESULT").map((record) => [record.payload.toolCallId, record]),
  );
  const calls = api
    .filter((record) => record.event === "TOOL_CALL")
    .map((record, order) => {
      const result = results.get(record.payload.toolCallId);
      return {
        order,
        id: record.payload.toolCallId,
        tool: record.payload.toolName,
        args: record.payload.arguments ?? {},
        cycle: record.cycle,
        round: record.round,
        tick: record.tick,
        output: result?.payload.output,
      };
    });
  for (const call of calls) {
    call.outcome = toolOutcome(call);
  }

  const reasoning = new Map();
  for (const record of raw) {
    if (record.event !== "API_RESPONSE") continue;
    const message = record.payload?.choices?.[0]?.message ?? {};
    const text = message.reasoning ?? message.reasoning_content ?? "";
    const key = `${record.cycle}:${record.round}`;
    reasoning.set(key, `${reasoning.get(key) ?? ""}${text}`);
  }

  const firstRequestByCycle = new Map();
  for (const request of requests) {
    if (!firstRequestByCycle.has(request.cycle)) firstRequestByCycle.set(request.cycle, request);
  }
  const requestByRound = new Map(requests.map((request) => [`${request.cycle}:${request.round}`, request]));

  const replayCycles = new Map(replay.cycles.map((cycle) => [cycle.cycle, cycle]));
  const reportCycles = new Map((summary.cycles ?? []).map((cycle) => [cycle.cycle, cycle]));
  const cycleNumbers = [...new Set([...replayCycles.keys(), ...reportCycles.keys()])].sort((a, b) => a - b);

  const events = replay.events ?? [];
  // A commit may schedule a delayed entry, so the committing cycle comes from the replay cycles.
  const committedIn = new Map();
  for (const cycle of replay.cycles) {
    for (const vehicleId of cycle.admittedVehicleIds ?? []) {
      const list = committedIn.get(vehicleId) ?? [];
      list.push({ cycle: cycle.cycle, tick: cycle.decisionTick });
      committedIn.set(vehicleId, list);
    }
  }
  const revokedAt = new Map();
  for (const event of events) {
    if (event.kind !== "ADMISSION_REVOKED") continue;
    for (const vehicleId of event.payload.vehicleIds ?? []) {
      revokedAt.set(vehicleId, [...(revokedAt.get(vehicleId) ?? []), event.tick]);
    }
  }
  // A revoked vehicle that later enters on its own (red light) is not the committing cycle's admission.
  const committingCycle = (vehicleId, entryTick) => {
    const commit = (committedIn.get(vehicleId) ?? []).filter((item) => entryTick === undefined || item.tick <= entryTick).at(-1);
    if (commit === undefined) return undefined;
    const revoked = (revokedAt.get(vehicleId) ?? []).some(
      (tick) => tick >= commit.tick && (entryTick === undefined || tick <= entryTick),
    );
    return revoked ? undefined : commit.cycle;
  };
  const admittedIn = new Map();
  for (const event of events) {
    if (event.kind === "ADMIT" && !admittedIn.has(event.payload.vehicleId)) {
      const committed = committedIn.has(event.payload.vehicleId);
      admittedIn.set(event.payload.vehicleId, {
        cycle: committed ? committingCycle(event.payload.vehicleId, event.tick) : event.cycle,
        tick: event.tick,
        routeId: event.payload.routeId,
      });
    }
  }
  for (const vehicleId of committedIn.keys()) {
    if (!admittedIn.has(vehicleId)) admittedIn.set(vehicleId, { cycle: committingCycle(vehicleId, undefined) });
  }
  for (const event of events) {
    if (event.kind === "SPAWN" && admittedIn.get(event.payload.vehicleId)?.routeId === undefined && admittedIn.has(event.payload.vehicleId)) {
      admittedIn.get(event.payload.vehicleId).routeId = event.payload.routeId;
    }
  }
  const vehicleTypes = new Map(
    events.filter((event) => event.kind === "SPAWN").map((event) => [event.payload.vehicleId, event.payload.type]),
  );
  const systemPrompt = requests[0]?.payload.messages?.[0]?.content ?? "";

  return {
    artifacts,
    replay,
    summary,
    requests,
    responses,
    apiErrors,
    calls,
    reasoning,
    firstRequestByCycle,
    requestByRound,
    replayCycles,
    reportCycles,
    cycleNumbers,
    events,
    admittedIn,
    vehicleTypes,
    systemPrompt,
    economy: parseEconomy(systemPrompt),
  };
}

function parseEconomy(prompt) {
  const number = (pattern, fallback) => {
    const match = pattern.exec(prompt);
    return match === null ? fallback : Number(match[1]);
  };
  return {
    decisionTax: number(/每次 API 调用扣 ([\d.]+)/, 0.02),
    toolTax: number(/每次非终结工具调用扣 ([\d.]+)/, 0.0015),
    hazardPerCellTick: number(/每个被事故锁住的冲突格每拍 ([\d.]+)/, 0.002),
    pedestrianStrike: number(/每名车人碰撞伤员扣 ([\d.]+)/, 5),
    schoolBus: number(/校车卷入事故时额外扣 ([\d.]+)/, 10),
  };
}

/** Normalizes every tool result into { ok, category, detail }. */
function toolOutcome(call) {
  const output = call.output;
  if (output === undefined) {
    return { ok: false, category: "NO_RESULT", detail: "" };
  }
  const error = output.error;
  if (error !== undefined && typeof error === "object") {
    const message = String(error.message ?? "");
    let category = error.code ?? "ERROR";
    if (message.trimStart().startsWith("[")) {
      category = "SCHEMA_ERROR";
    } else if (/unknown|UNKNOWN_/i.test(message)) {
      category = "UNKNOWN_ID";
    } else if (/head is not ready/i.test(message)) {
      category = "LANE_HEAD_NOT_READY";
    } else if (/planning horizon/i.test(message)) {
      category = "PLANNING_HORIZON_EXCEEDED";
    }
    return { ok: false, category, detail: message.replace(/\s+/g, " ").slice(0, 160) };
  }
  if (call.tool === "commit_schedule") {
    if (output.committed === false) {
      return { ok: false, category: output.error ?? (output.conflict ? "RESOURCE_CONFLICT" : "NOT_COMMITTED"), detail: output.conflict ?? "" };
    }
    return { ok: true, category: "OK", detail: "" };
  }
  if (output.ok === false) {
    const category = output.reason ?? (typeof output.error === "string" ? output.error : "REJECTED");
    return { ok: false, category, detail: [output.conflict, output.vs?.join?.(",")].filter(Boolean).join(" vs ") };
  }
  return { ok: true, category: "OK", detail: "" };
}

// ---------------------------------------------------------------- basic analysis

function analyzeContext(run) {
  const promptTokens = run.responses.map((record) => record.payload.usage?.prompt_tokens);
  const completionTokens = run.responses.map((record) => record.payload.usage?.completion_tokens);
  const reasoningTokens = run.responses.map(
    (record) => record.payload.usage?.completion_tokens_details?.reasoning_tokens,
  );
  const sizes = run.requests.map((request) => {
    const messages = request.payload.messages ?? [];
    const sum = (role) =>
      messages.filter((message) => message.role === role).reduce((total, message) => total + messageText(message).length, 0);
    return {
      system: sum("system"),
      user: sum("user"),
      tool: sum("tool"),
      assistant: sum("assistant"),
      messages: messages.length,
    };
  });
  const roundsPerCycle = [...groupBy(run.requests, (request) => request.cycle).values()].map((list) => list.length);
  const maxRounds = run.summary.maxApiRounds;

  // Grounding: was every ID in a tool argument visible in the request that produced the call?
  const knownIds = new Set();
  for (const request of run.requests) {
    for (const message of request.payload.messages ?? []) {
      if (message.role === "system") continue;
      for (const match of messageText(message).matchAll(/[A-Z][A-Z0-9_:]+/g)) knownIds.add(match[0]);
    }
  }
  for (const event of run.events) {
    if (event.kind === "SPAWN") {
      knownIds.add(event.payload.vehicleId);
      knownIds.add(event.payload.routeId);
    }
  }
  const grounding = { total: 0, visible: 0, knownElsewhere: 0, neverSeen: 0, nonCanonical: 0, byKind: {}, neverSeenSamples: [] };
  for (const call of run.calls) {
    const request = run.requestByRound.get(`${call.cycle}:${call.round}`);
    const visible = (request?.payload.messages ?? [])
      .filter((message) => message.role !== "system")
      .map(messageText)
      .join("\n");
    for (const id of collectIds(call.args, "", [])) {
      const bucket = (grounding.byKind[id.kind] ??= { total: 0, visible: 0, knownElsewhere: 0, neverSeen: 0, nonCanonical: 0 });
      grounding.total += 1;
      bucket.total += 1;
      if (id.kind === "crosswalkShortKey") {
        grounding.nonCanonical += 1;
        bucket.nonCanonical += 1;
      } else if (visible.includes(id.value)) {
        grounding.visible += 1;
        bucket.visible += 1;
      } else if (knownIds.has(id.value)) {
        grounding.knownElsewhere += 1;
        bucket.knownElsewhere += 1;
      } else {
        grounding.neverSeen += 1;
        bucket.neverSeen += 1;
        if (grounding.neverSeenSamples.length < 12) {
          grounding.neverSeenSamples.push({ cycle: call.cycle, tool: call.tool, key: id.key, value: id.value });
        }
      }
    }
  }

  // Repeating a call that already failed with identical arguments in the same cycle.
  const repeatedFailures = [];
  for (const [cycle, list] of groupBy(run.calls, (call) => call.cycle)) {
    const failed = new Set();
    for (const call of list) {
      const signature = `${call.tool}:${JSON.stringify(call.args)}`;
      if (failed.has(signature)) {
        repeatedFailures.push({ cycle, tool: call.tool, category: call.outcome.category });
      }
      if (!call.outcome.ok && call.outcome.category !== "DRY_RUN_QUOTA_EXHAUSTED") failed.add(signature);
    }
  }

  const totals = run.summary.totals ?? {};
  const memoryCalls = run.calls.filter((call) => call.tool === "manage_working_memory");
  const memoryVisibleCycles = [...run.firstRequestByCycle.values()].filter((request) => {
    try {
      return JSON.parse(request.payload.messages[1].content).observation?.workingMemoryTop != null;
    } catch {
      return false;
    }
  }).length;

  return {
    promptTokens: stats(promptTokens),
    completionTokens: stats(completionTokens),
    reasoningTokens: stats(reasoningTokens),
    requestChars: {
      system: stats(sizes.map((size) => size.system)),
      user: stats(sizes.map((size) => size.user)),
      tool: stats(sizes.map((size) => size.tool)),
      assistant: stats(sizes.map((size) => size.assistant)),
      messages: stats(sizes.map((size) => size.messages)),
    },
    roundsPerCycle: { ...stats(roundsPerCycle), maxAllowed: maxRounds, cyclesAtMax: roundsPerCycle.filter((n) => n >= maxRounds).length },
    grounding: {
      ...grounding,
      visibleRate: ratio(grounding.visible, grounding.total),
      neverSeenRate: ratio(grounding.neverSeen, grounding.total),
    },
    repeatedFailures: { count: repeatedFailures.length, byTool: countBy(repeatedFailures.map((item) => `${item.tool}:${item.category}`)) },
    commits: {
      verified: totals.verifiedCommits,
      unverified: totals.unverifiedCommits,
      hold: totals.holdCommits,
      verifiedRateAmongReleases: ratio(totals.verifiedCommits ?? 0, (totals.verifiedCommits ?? 0) + (totals.unverifiedCommits ?? 0)),
    },
    workingMemory: {
      calls: memoryCalls.length,
      actions: countBy(memoryCalls.map((call) => call.args.action)),
      cyclesWithPlanVisible: memoryVisibleCycles,
    },
  };
}

/** Concept -> [regex used on reasoning, compact-observation keys that carry it]. */
const ATTENTION_CONCEPTS = {
  stoplineCandidates: [/stoplineCandidates|stopline (?:candidate|head)s?|lane heads?/i, ["stoplineCandidates"]],
  laneMatrices: [/\blanes\b|matri(?:x|ces)|position \d|index 0/i, ["lanes"]],
  exits: [/\bexits?\b|OUT_[A-Z]+_\d/i, ["exits"]],
  crosswalks: [/crosswalk/i, ["crosswalks"]],
  reservedUntil: [/reservedUntil|reserved until|reservation/i, ["reservedUntil"]],
  incidentBlocked: [/incidentBlocked|incident[- ]blocked|severed/i, ["incidentBlocked"]],
  candidateConflicts: [/candidateConflicts|conflicts? with/i, ["candidateConflicts"]],
  pedestrianAlerts: [/pedestrianAlerts|patience|jaywalk/i, ["pedestrianAlerts"]],
  driverAlerts: [/driverAlerts|driver alert|aggressive|red[- ]light|tailgat/i, ["driverAlerts"]],
  emergency: [/emergency/i, ["emergencyAlerts", "emergencyNotices"]],
  stalledVehicles: [/stall|tow truck|dispatch_tow/i, ["stalledVehicles"]],
  dischargingLanes: [/discharging/i, ["dischargingLanes"]],
  activeVehicleMotions: [/activeVehicleMotions|active (?:vehicle )?motions|in[- ]junction/i, ["activeVehicleMotions"]],
  laneGuidance: [/laneGuidance|guidance|guide_inbound/i, ["laneGuidanceOpportunities", "activeLaneGuidancePermits"]],
  holds: [/exitHolds|crosswalkHolds|exit hold|activeLaneHolds/i, ["exitHolds", "crosswalkHolds", "activeLaneHolds"]],
  revokedAdmissions: [/revoked/i, ["revokedAdmissions"]],
  timeBudget: [/ticksRemaining|endTick|ticks? remaining|game ends/i, ["ticksRemaining", "endTick"]],
  workingMemory: [/workingMemory|working memory/i, ["workingMemoryTop"]],
  lastSettlement: [/lastSettlement|netDelta|settlement/i, ["@lastSettlement"]],
  recentCycles: [/recentCycles|previous cycle|last cycle/i, ["@recentCycles"]],
};

/** Report cycle N is settled at the tick that wakes cycle N + 1, so its interrupt belongs to the next cycle. */
const wakeReason = (run, cycle) => run.reportCycles.get(cycle - 1)?.interruptReason ?? null;

function cycleAtTick(run, tick) {
  let found;
  for (const cycle of run.cycleNumbers) {
    const decisionTick = run.replayCycles.get(cycle)?.decisionTick;
    if (decisionTick !== undefined && decisionTick <= tick) found = cycle;
  }
  return found;
}

function cycleReasoning(run, cycle) {
  let text = "";
  for (const [key, value] of run.reasoning) {
    if (key.startsWith(`${cycle}:`)) text += `${value}\n`;
  }
  return text;
}

function firstUserPayload(run, cycle) {
  try {
    return JSON.parse(run.firstRequestByCycle.get(cycle)?.payload.messages?.[1]?.content ?? "{}");
  } catch {
    return {};
  }
}

function analyzeAttention(run) {
  const concepts = {};
  for (const [name, [pattern, keys]] of Object.entries(ATTENTION_CONCEPTS)) {
    concepts[name] = { present: 0, mentionedWhenPresent: 0, mentionedTotal: 0, occurrences: 0, keys };
    for (const cycle of run.cycleNumbers) {
      const payload = firstUserPayload(run, cycle);
      const observation = payload.observation ?? {};
      const present = keys.some((key) => {
        const value = key.startsWith("@") ? payload[key.slice(1)] : observation[key];
        return value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0);
      });
      const text = cycleReasoning(run, cycle);
      const occurrences = (text.match(new RegExp(pattern.source, `${pattern.flags}g`)) ?? []).length;
      if (present) concepts[name].present += 1;
      if (occurrences > 0) concepts[name].mentionedTotal += 1;
      if (present && occurrences > 0) concepts[name].mentionedWhenPresent += 1;
      concepts[name].occurrences += occurrences;
    }
    concepts[name].attentionRate = ratio(concepts[name].mentionedWhenPresent, concepts[name].present);
  }

  // Did the cycle react to the reason it was woken for?
  const interrupts = [];
  for (const cycle of run.cycleNumbers) {
    const reason = wakeReason(run, cycle);
    if (!reason) continue;
    const calls = run.calls.filter((call) => call.cycle === cycle);
    const text = cycleReasoning(run, cycle);
    for (const part of reason.split(";").map((item) => item.trim()).filter(Boolean)) {
      const kind = part.split(" ")[0];
      const subject = /(?:pedestrian|vehicle|incident)=(\S+)/.exec(part)?.[1];
      let responded;
      if (kind === "ACCIDENT_INTERRUPT") {
        responded = calls.some((call) =>
          ["inspect_incident", "order_accident_clearance", "set_lane_detour"].includes(call.tool),
        );
      } else if (kind === "PEDESTRIAN_PATIENCE") {
        responded = calls.some((call) => (call.args.pedestrian_phases ?? []).length > 0);
      } else {
        responded = subject !== undefined && text.includes(subject);
      }
      interrupts.push({ cycle, kind, subject, responded });
    }
  }
  const byKind = {};
  for (const item of interrupts) {
    const bucket = (byKind[item.kind] ??= { count: 0, responded: 0 });
    bucket.count += 1;
    if (item.responded) bucket.responded += 1;
  }
  for (const bucket of Object.values(byKind)) bucket.rate = ratio(bucket.responded, bucket.count);

  const lengths = [...run.reasoning.values()].map((text) => text.length);
  return {
    concepts,
    interruptResponse: {
      rules: {
        ACCIDENT_INTERRUPT: "同周期调用 inspect_incident / order_accident_clearance / set_lane_detour",
        PEDESTRIAN_PATIENCE: "同周期任一试算或提交带 pedestrian_phases",
        other: "推理文本提到了中断对象 ID",
      },
      byKind,
    },
    reasoningChars: stats(lengths),
  };
}

function analyzeTools(run) {
  const byTool = {};
  for (const call of run.calls) {
    const bucket = (byTool[call.tool] ??= { calls: 0, ok: 0, categories: {} });
    bucket.calls += 1;
    if (call.outcome.ok) bucket.ok += 1;
    bucket.categories[call.outcome.category] = (bucket.categories[call.outcome.category] ?? 0) + 1;
  }
  for (const bucket of Object.values(byTool)) bucket.successRate = ratio(bucket.ok, bucket.calls);

  const errorSamples = {};
  for (const call of run.calls) {
    if (call.outcome.ok) continue;
    const list = (errorSamples[call.outcome.category] ??= []);
    if (list.length < 3) {
      list.push({ cycle: call.cycle, tick: call.tick, tool: call.tool, detail: call.outcome.detail, args: JSON.stringify(call.args).slice(0, 220) });
    }
  }
  const failures = run.calls.filter((call) => !call.outcome.ok);
  const callsPerResponse = run.responses.map((record) => (record.payload.toolCalls ?? []).length);
  const availableTools = (run.requests[0]?.payload.tools ?? []).map((tool) => tool.function?.name);
  return {
    totalCalls: run.calls.length,
    okCalls: run.calls.length - failures.length,
    successRate: ratio(run.calls.length - failures.length, run.calls.length),
    failureCategories: countBy(failures.map((call) => call.outcome.category)),
    byTool,
    errorSamples,
    callsPerResponse: countBy(callsPerResponse),
    finishReasons: countBy(run.responses.map((record) => record.payload.finishReason)),
    apiErrors: { count: run.apiErrors.length, messages: countBy(run.apiErrors.map((record) => record.payload.message)) },
    fallbackCycles: [...run.reportCycles.values()].filter((cycle) => cycle.usedFallback).map((cycle) => cycle.cycle),
    availableTools,
    unusedTools: availableTools.filter((name) => !byTool[name]),
  };
}

function findBaselines(run) {
  const target = run.summary;
  const rules = run.replay.simulationRulesVersion;
  const latest = new Map();
  for (const name of readdirSync(run.artifacts.directory)) {
    const match = /^report_(baseline-[a-z-]+)_(.+)\.json$/.exec(name);
    if (match === null) continue;
    let report;
    try {
      report = readJson(join(run.artifacts.directory, name));
    } catch {
      continue;
    }
    const summary = report.summary ?? report;
    if (
      report.simulationRulesVersion !== rules ||
      summary.seed !== target.seed ||
      summary.horizonTicks !== target.horizonTicks
    ) {
      continue;
    }
    const previous = latest.get(match[1]);
    if (previous === undefined || report.generatedAt > previous.generatedAt) {
      latest.set(match[1], { name: match[1], file: name, generatedAt: report.generatedAt, summary });
    }
  }
  return [...latest.values()].sort((left, right) => left.name.localeCompare(right.name));
}

const COST_KEYS = [
  "hazardBleed",
  "upstreamBleed",
  "emergencyBleed",
  "stallChainBleed",
  "exitLockBleed",
  "secondaryPenalties",
  "towingCosts",
  "pedestrianDelay",
  "pedestrianJaywalk",
  "pedestrianStrike",
  "schoolBusPenalties",
];

function scoreRow(name, summary) {
  const totals = summary.totals ?? {};
  return {
    name,
    finalBalance: round(summary.finalBalance),
    admittedVehicles: totals.admittedVehicles,
    unservedLiability: round(summary.terminal?.unservedLiability),
    pedestrianReward: round(totals.pedestrianReward),
    ...Object.fromEntries(COST_KEYS.map((key) => [key, round(totals[key])])),
    incidents: summary.incidents?.length,
  };
}

function analyzeAgent(run) {
  const commits = run.calls.filter((call) => call.tool === "commit_schedule");
  const okCommits = commits.filter((call) => call.outcome.ok);
  const admittedPerCycle = [...run.reportCycles.values()].map((cycle) => cycle.admitted?.length ?? 0);
  const flows = run.cycleNumbers.map((cycle) =>
    run.calls
      .filter((call) => call.cycle === cycle)
      .map((call) => ({ dry_run_admit: "D", commit_schedule: "C" })[call.tool] ?? "T")
      .join(""),
  );
  const totals = run.summary.totals ?? {};
  const economy = run.economy;
  const baselines = findBaselines(run);
  return {
    cycles: run.cycleNumbers.length,
    flowPatterns: countBy(flows.map((flow) => flow || "(none)")),
    dryRunBeforeCommitRate: ratio(
      flows.filter((flow) => /D.*C/.test(flow)).length,
      flows.filter((flow) => flow.includes("C")).length,
    ),
    commitMix: { verified: totals.verifiedCommits, unverified: totals.unverifiedCommits, hold: totals.holdCommits, reckless: totals.recklessAttempts },
    admittedPerCycle: stats(admittedPerCycle),
    admittedTotal: totals.admittedVehicles,
    laneBatches: {
      commitsUsingBatches: okCommits.filter((call) => (call.args.lane_batches ?? []).length > 0).length,
      okCommits: okCommits.length,
      topNSum: stats(okCommits.map((call) => (call.args.lane_batches ?? []).reduce((sum, batch) => sum + (batch.top_n ?? 0), 0))),
    },
    speedProfiles: countBy(
      okCommits.flatMap((call) => [
        ...(call.args.lane_batches ?? []).map((batch) => batch.speed_profile ?? "CRUISE"),
        ...(call.args.vehicle_speed_profiles ?? []).map((item) => item.speed_profile),
      ]),
    ),
    sleepTicks: { ...stats(commits.map((call) => call.args.sleep_ticks)), distribution: countBy(commits.map((call) => call.args.sleep_ticks)) },
    toolDiversity: countBy(run.calls.map((call) => call.tool)),
    overhead: {
      apiCalls: totals.apiCalls,
      nonTerminalToolCalls: totals.toolCalls,
      decisionTaxPaid: round((totals.apiCalls ?? 0) * economy.decisionTax, 3),
      toolTaxPaid: round((totals.toolCalls ?? 0) * economy.toolTax, 4),
    },
    scoreboard: [scoreRow(run.summary.model ?? "model", run.summary), ...baselines.map((item) => scoreRow(item.name, item.summary))],
    baselineFiles: baselines.map((item) => item.file),
  };
}

// ---------------------------------------------------------------- advanced analysis

const CONFIDENT_SAFE = /\b(no conflicts?|should be (?:safe|fine|ok)|(?:is|are|looks|seems) safe|no issues?|won'?t conflict|compatible)\b/i;
const SELF_CORRECTION = /\b(wait,|actually,|let me re-?(?:check|read|count|think|consider)|i'?m confus|hmm)\b/gi;

function analyzeReasoning(run) {
  // Error correction: what happened after a dry run failed (quota exhaustion excluded)?
  const corrections = { failures: 0, retried: 0, retriedChanged: 0, retriedSucceeded: 0, thenVerifiedCommit: 0, thenHold: 0 };
  for (const list of groupBy(run.calls, (call) => call.cycle).values()) {
    const dryRuns = list.filter((call) => call.tool === "dry_run_admit");
    dryRuns.forEach((call, index) => {
      if (call.outcome.ok || call.outcome.category === "DRY_RUN_QUOTA_EXHAUSTED") return;
      corrections.failures += 1;
      const next = dryRuns[index + 1];
      if (next !== undefined && next.outcome.category !== "DRY_RUN_QUOTA_EXHAUSTED") {
        corrections.retried += 1;
        if (JSON.stringify(next.args) !== JSON.stringify(call.args)) corrections.retriedChanged += 1;
        if (next.outcome.ok) corrections.retriedSucceeded += 1;
      }
      const commit = list.find((item) => item.tool === "commit_schedule" && item.order > call.order);
      const reportCycle = run.reportCycles.get(call.cycle);
      if (commit !== undefined && reportCycle?.verifiedCommits > 0) corrections.thenVerifiedCommit += 1;
      if (commit !== undefined && (reportCycle?.holdCommits ?? 0) > 0) corrections.thenHold += 1;
    });
  }
  corrections.retrySuccessRate = ratio(corrections.retriedSucceeded, corrections.retried);

  // Confident "safe" reasoning immediately followed by a conflict in the same round.
  const contradictions = [];
  for (const [key, text] of run.reasoning) {
    if (!CONFIDENT_SAFE.test(text)) continue;
    const [cycle, roundNumber] = key.split(":").map(Number);
    const failed = run.calls.find(
      (call) => call.cycle === cycle && call.round === roundNumber && call.outcome.category === "RESOURCE_CONFLICT",
    );
    if (failed !== undefined) {
      contradictions.push({
        cycle,
        round: roundNumber,
        tick: failed.tick,
        claim: snippetsAround(text, CONFIDENT_SAFE, 160, 1)[0],
        result: failed.outcome.detail,
      });
    }
  }

  const allText = [...run.reasoning.values()].join("\n");
  const selfCorrections = [...run.reasoning.values()].map((text) => (text.match(SELF_CORRECTION) ?? []).length);
  const misconceptionPatterns = {
    letterCounting: /let me recount|\d+ chars?\b|\d+ characters? long/i,
    idFormat: /IN_ prefix|lane_id should|short key|full crosswalk id/i,
  };
  const misconceptions = Object.fromEntries(
    Object.entries(misconceptionPatterns).map(([name, pattern]) => [
      name,
      {
        occurrences: (allText.match(new RegExp(pattern.source, `${pattern.flags}g`)) ?? []).length,
        samples: snippetsAround(allText, pattern, 200, 3),
      },
    ]),
  );
  return {
    corrections,
    crosswalkClaims: crosswalkClaims(run),
    contradictions: { count: contradictions.length, samples: contradictions.slice(0, 6) },
    selfCorrectionMarkers: { perResponse: stats(selfCorrections), total: selfCorrections.reduce((a, b) => a + b, 0) },
    misconceptions,
  };
}

const CROSSWALK_CLAIM =
  /\b([NSEW]_[A-Z]\d_(?:STRAIGHT|LEFT|RIGHT))\b([^.;\n_]{0,50}?)\bcross(?:es|ing)?\s+(?:the\s+)?(?:only\s+)?(NORTH|SOUTH|EAST|WEST|N|S|E|W)\b/gi;
const NEGATION = /\b(?:not|never|doesn'?t|don'?t|won'?t|avoid|without)\b/i;

/** Checks every "<route> crosses <side>" statement in the reasoning against the entry/exit rule. */
function crosswalkClaims(run) {
  const result = { claims: 0, correct: 0, wrong: 0, byCycleHalf: { first: { claims: 0, wrong: 0 }, second: { claims: 0, wrong: 0 } }, wrongSamples: [] };
  const middle = run.cycleNumbers[Math.floor(run.cycleNumbers.length / 2)] ?? 0;
  for (const [key, text] of run.reasoning) {
    const cycle = Number(key.split(":")[0]);
    for (const match of text.replace(/\s+/g, " ").matchAll(CROSSWALK_CLAIM)) {
      const routeId = match[1].toUpperCase();
      const side = SIDE_NAME[match[3].charAt(0).toUpperCase()];
      const negative = NEGATION.test(match[2]);
      const crosses = routeCrosswalks(routeId).includes(side);
      const correct = negative ? !crosses : crosses;
      const half = cycle < middle ? result.byCycleHalf.first : result.byCycleHalf.second;
      result.claims += 1;
      half.claims += 1;
      if (correct) {
        result.correct += 1;
      } else {
        result.wrong += 1;
        half.wrong += 1;
        if (result.wrongSamples.length < 8) {
          result.wrongSamples.push({ cycle, claim: match[0], actual: routeCrosswalks(routeId).join("+") });
        }
      }
    }
  }
  result.accuracy = ratio(result.correct, result.claims);
  return result;
}

const SEVERITY_MULTIPLIER = { MINOR: 1, MODERATE: 1.5, SERIOUS: 2, CRITICAL: 3 };

function incidentCosts(run) {
  const economy = run.economy;
  const endTick = run.summary.endTick ?? run.replay.totalTicks;
  const accidents = new Map(
    run.events.filter((event) => event.kind === "ACCIDENT").map((event) => [event.payload.incidentId, event.payload]),
  );
  const cleared = new Map(
    run.events.filter((event) => event.kind === "ACCIDENT_CLEARED").map((event) => [event.payload.incidentId, event.tick]),
  );
  const incidents = (run.summary.incidents ?? []).map((incident) => {
    const lockedAtTrigger = accidents.get(incident.id)?.lockedResourceIds?.length ?? 0;
    // Secondary collisions add hazard cells and can raise severity, mirroring hazardResourceUnits().
    const cells = new Set(accidents.get(incident.id)?.lockedResourceIds ?? []);
    let severity = incident.severity;
    for (const event of run.events) {
      if (!["ACCIDENT", "SECONDARY_ACCIDENT"].includes(event.kind) || event.payload.incidentId !== incident.id) continue;
      if ((SEVERITY_MULTIPLIER[event.payload.severity] ?? 0) > (SEVERITY_MULTIPLIER[severity] ?? 0)) severity = event.payload.severity;
      for (const outcome of event.payload.collisionOutcomes ?? []) {
        for (const vehicle of outcome.vehicles ?? []) {
          for (const resourceId of vehicle.hazardResourceIds ?? []) cells.add(resourceId);
        }
      }
    }
    const lockedCells = Math.max(cells.size, incident.lockedResourceIds?.length ?? 0);
    const closeTick = cleared.get(incident.id) ?? endTick;
    const openTicks = Math.max(1, closeTick - incident.triggerTick);
    const schoolBus = incident.vehicleIds.some((id) => /school bus/i.test(run.vehicleTypes.get(id) ?? ""));
    const hazmat = incident.vehicleIds.some((id) => /tanker/i.test(run.vehicleTypes.get(id) ?? ""));
    const multiplier = (SEVERITY_MULTIPLIER[severity] ?? 1) * (hazmat ? 3 : 1);
    return {
      id: incident.id,
      triggerTick: incident.triggerTick,
      closeTick: cleared.get(incident.id),
      status: incident.status,
      collisionType: incident.collisionType,
      severity: incident.severity,
      vehicleIds: incident.vehicleIds,
      pedestrianIds: incident.pedestrianIds ?? [],
      admittedBy: incident.vehicleIds.map((id) => ({ vehicleId: id, ...(run.admittedIn.get(id) ?? {}) })),
      finalSeverity: severity,
      lockedAtTrigger,
      lockedCells,
      openTicks,
      schoolBus,
      hazmat,
      weight: lockedCells * openTicks * multiplier,
    };
  });
  // Spread the run's real hazard bleed over incidents by locked-cells x open-ticks.
  const totalHazard = run.summary.totals?.hazardBleed ?? 0;
  const totalWeight = incidents.reduce((sum, incident) => sum + incident.weight, 0);
  for (const incident of incidents) {
    incident.hazardShare = round(totalWeight === 0 ? 0 : (totalHazard * incident.weight) / totalWeight, 3);
    incident.estimatedCost = round(
      incident.hazardShare +
        incident.pedestrianIds.length * economy.pedestrianStrike +
        (incident.schoolBus ? economy.schoolBus : 0),
      3,
    );
  }
  return incidents;
}

function analyzeGame(run, incidents) {
  const events = run.events;
  const phaseCalls = run.calls.filter(
    (call) => ["dry_run_admit", "commit_schedule"].includes(call.tool) && (call.args.pedestrian_phases ?? []).length > 0,
  );
  const grants = events.filter((event) => event.kind === "PED_GRANT");
  const jaywalks = events.filter((event) => event.kind === "PED_JAYWALK");
  const strikes = events.filter((event) => event.kind === "PED_COLLISION");
  const pedestrianTimeline = [...grants, ...jaywalks, ...strikes]
    .sort((left, right) => left.tick - right.tick)
    .map((event) => ({
      tick: event.tick,
      kind: event.kind,
      crosswalk: event.payload.crosswalkId,
      pedestrians: event.payload.pedestrianIds?.length ?? 0,
    }));

  // Admissions whose route crosses a crosswalk with a pedestrian close to running out of patience.
  const patienceRiskAdmissions = [];
  for (const cycle of run.cycleNumbers) {
    const observation = run.replayCycles.get(cycle)?.observation ?? {};
    const alerts = (observation.pedestrianAlerts ?? []).filter((alert) => alert.kind === "PATIENCE_CRITICAL");
    if (alerts.length === 0) continue;
    for (const vehicleId of run.replayCycles.get(cycle)?.admittedVehicleIds ?? []) {
      const routeId = run.admittedIn.get(vehicleId)?.routeId;
      const crossed = routeCrosswalks(routeId);
      for (const alert of alerts) {
        if (!crossed.includes(alert.crosswalkId)) continue;
        patienceRiskAdmissions.push({
          cycle,
          tick: observation.currentTick,
          vehicleId,
          routeId,
          crosswalk: alert.crosswalkId,
          pedestrianId: alert.pedestrianId,
          patienceRemaining: alert.patienceRemaining,
          laterStruck: strikes.some((event) => event.payload.pedestrianIds?.includes(alert.pedestrianId)),
        });
      }
    }
  }

  // Incident handling: first reaction and admissions into an open incident that later joined it.
  const incidentHandling = incidents.map((incident) => {
    const reactions = run.calls.filter(
      (call) =>
        call.args.incident_id === incident.id &&
        ["inspect_incident", "order_accident_clearance", "set_lane_detour"].includes(call.tool),
    );
    const clearance = reactions.find((call) => call.tool === "order_accident_clearance" && call.outcome.ok);
    return {
      id: incident.id,
      triggerTick: incident.triggerTick,
      collisionType: incident.collisionType,
      vehicles: incident.vehicleIds.length,
      pedestrians: incident.pedestrianIds.length,
      firstReactionTick: reactions[0]?.tick,
      clearanceOrderTick: clearance?.tick,
      clearanceOrders: reactions.filter((call) => call.tool === "order_accident_clearance").length,
      closeTick: incident.closeTick,
      admittedWhileOpenThenJoined: incident.admittedBy
        .filter((item) => item.tick !== undefined && item.tick > incident.triggerTick)
        .map((item) => `${item.vehicleId}@${item.tick}`),
      selfEntered: incident.admittedBy.filter((item) => item.cycle === undefined).map((item) => item.vehicleId),
    };
  });

  // Aggressive drivers: were they visible in driverAlerts before they acted?
  const aggression = [];
  for (const cycle of run.cycleNumbers) {
    const reason = wakeReason(run, cycle) ?? "";
    for (const match of reason.matchAll(/(VEHICLE_RED_LIGHT|VEHICLE_TAILGATE) vehicle=(V\d+)/g)) {
      const seen = run.cycleNumbers
        .filter((other) => other < cycle)
        .map((other) => ({
          cycle: other,
          alert: (run.replayCycles.get(other)?.observation?.driverAlerts ?? []).find((item) => item.vehicleId === match[2]),
        }))
        .filter((item) => item.alert !== undefined);
      aggression.push({
        cycle,
        kind: match[1],
        vehicleId: match[2],
        alertedCycles: seen.length,
        lastAlert: seen.at(-1)?.alert,
        joinedIncident: incidents.find((incident) => incident.vehicleIds.includes(match[2]))?.id,
      });
    }
  }

  // Emergency vehicles: first time inside the 12-cell horizon versus admission.
  const emergency = new Map();
  for (const cycle of run.cycleNumbers) {
    const observation = run.replayCycles.get(cycle)?.observation ?? {};
    for (const alert of observation.emergencyAlerts ?? []) {
      const entry = emergency.get(alert.vehicleId) ?? { vehicleId: alert.vehicleId, firstAlertTick: observation.currentTick, maxStationary: 0 };
      entry.maxStationary = Math.max(entry.maxStationary, alert.stationaryTicks ?? 0);
      emergency.set(alert.vehicleId, entry);
    }
  }
  for (const entry of emergency.values()) {
    entry.admitTick = run.admittedIn.get(entry.vehicleId)?.tick;
    entry.waitTicks = entry.admitTick === undefined ? null : entry.admitTick - entry.firstAlertTick;
  }

  const stalls = events
    .filter((event) => event.kind === "STALL")
    .map((event) => {
      const tow = events.find((other) => other.kind === "TOW_DISPATCH" && other.payload.vehicleId === event.payload.vehicleId);
      const reroute = events.find((other) => other.kind === "STALL_REROUTE" && other.payload.vehicleId === event.payload.vehicleId);
      return {
        vehicleId: event.payload.vehicleId,
        laneId: event.payload.laneId,
        stallTick: event.tick,
        towTick: tow?.tick,
        towLatency: tow === undefined ? null : tow.tick - event.tick,
        rerouteTick: reroute?.tick,
      };
    });

  const totals = run.summary.totals ?? {};
  return {
    pedestrians: {
      phaseAttempts: phaseCalls.length,
      phaseOk: phaseCalls.filter((call) => call.outcome.ok).length,
      phaseOutcomes: countBy(phaseCalls.map((call) => call.outcome.category)),
      phaseConflicts: phaseCalls
        .filter((call) => call.outcome.category === "RESOURCE_CONFLICT")
        .slice(0, 10)
        .map((call) => ({ cycle: call.cycle, tick: call.tick, at: call.output?.at, detail: call.outcome.detail })),
      grants: grants.length,
      grantedPedestrians: grants.reduce((sum, event) => sum + (event.payload.pedestrianIds?.length ?? 0), 0),
      jaywalkEvents: jaywalks.length,
      jaywalkers: jaywalks.reduce((sum, event) => sum + (event.payload.pedestrianIds?.length ?? 0), 0),
      injured: strikes.reduce((sum, event) => sum + (event.payload.pedestrianIds?.length ?? 0), 0),
      reward: totals.pedestrianReward,
      penalties: { delay: round(totals.pedestrianDelay), jaywalk: round(totals.pedestrianJaywalk), strike: round(totals.pedestrianStrike) },
      timeline: pedestrianTimeline,
      patienceRiskAdmissions,
    },
    incidents: incidentHandling,
    aggression: { totals: totals.aggression, events: aggression },
    emergency: { bleed: round(totals.emergencyBleed, 3), vehicles: [...emergency.values()] },
    stalls: { towingCosts: round(totals.towingCosts), stallChainBleed: round(totals.stallChainBleed, 3), items: stalls },
  };
}

function buildCycleCards(run, incidents, game, top) {
  const riskBy = new Map();
  for (const item of game.pedestrians.patienceRiskAdmissions) {
    riskBy.set(item.cycle, (riskBy.get(item.cycle) ?? 0) + 1);
  }
  const grantsByCycle = new Map();
  for (const event of run.events.filter((item) => item.kind === "PED_GRANT")) {
    grantsByCycle.set(event.cycle, (grantsByCycle.get(event.cycle) ?? 0) + (event.payload.pedestrianIds?.length ?? 0));
  }
  const incidentVehicles = new Set(incidents.flatMap((incident) => incident.vehicleIds));
  const specialTools = ["dispatch_tow_truck", "dispatch_emergency_convoy", "guide_inbound_lane_change", "reroute_queue_around_stall"];

  const rows = run.cycleNumbers.map((cycle) => {
    const reportCycle = run.reportCycles.get(cycle) ?? {};
    const replayCycle = run.replayCycles.get(cycle) ?? {};
    const admitted = replayCycle.admittedVehicleIds ?? reportCycle.admitted ?? [];
    // Each incident's estimated cost is split over the cycles that admitted its vehicles.
    let blame = 0;
    const blamedIncidents = [];
    for (const incident of incidents) {
      const involved = incident.admittedBy.filter((item) => item.cycle !== undefined);
      const mine = involved.filter((item) => item.cycle === cycle).length;
      if (mine > 0) {
        blame += (incident.estimatedCost * mine) / involved.length;
        blamedIncidents.push(incident.id);
      }
    }
    const cleanAdmits = admitted.filter((id) => !incidentVehicles.has(id)).length;
    const calls = run.calls.filter((call) => call.cycle === cycle);
    const value =
      cleanAdmits +
      (grantsByCycle.get(cycle) ?? 0) * 1.5 +
      calls.filter((call) => call.outcome.ok && specialTools.includes(call.tool)).length * 2 -
      blame;
    return {
      cycle,
      tick: replayCycle.decisionTick,
      interrupt: wakeReason(run, cycle),
      admitted: admitted.length,
      cleanAdmits,
      pedestriansGranted: grantsByCycle.get(cycle) ?? 0,
      patienceRiskAdmits: riskBy.get(cycle) ?? 0,
      blamedIncidents,
      blame: round(blame, 2),
      financialDelta: round(reportCycle.financialDelta, 3),
      sleepTicks: reportCycle.sleepTicks,
      commitKind: reportCycle.verifiedCommits
        ? "verified"
        : reportCycle.unverifiedCommits
          ? "unverified"
          : reportCycle.holdCommits
            ? "hold"
            : reportCycle.usedFallback
              ? "fallback"
              : "-",
      value: round(value, 2),
    };
  });

  const card = (row) => {
    const observation = run.replayCycles.get(row.cycle)?.observation ?? {};
    const calls = run.calls.filter((call) => call.cycle === row.cycle);
    return {
      ...row,
      summary: run.replayCycles.get(row.cycle)?.tacticalSummary ?? run.reportCycles.get(row.cycle)?.tacticalSummary,
      context: {
        balance: round(observation.financialBalance),
        stoplineCandidates: observation.stoplineCandidates?.length ?? 0,
        blockedRoutes: observation.blockedRoutes?.length ?? 0,
        pedestrianAlerts: (observation.pedestrianAlerts ?? []).map(
          (alert) => `${alert.crosswalkId?.split(":")[1]?.charAt(0) ?? "?"}:${alert.kind === "JAYWALKING" ? "J" : "P"}${alert.patienceRemaining}`,
        ),
        driverAlerts: (observation.driverAlerts ?? []).map((alert) => `${alert.vehicleId}:${alert.patienceRemaining}`),
        emergencyAlerts: (observation.emergencyAlerts ?? []).map((alert) => alert.vehicleId),
        stalled: (observation.stalledVehicles ?? []).map((item) => item.vehicleId),
      },
      toolSequence: calls.map(
        (call) =>
          `r${call.round} ${call.tool} -> ${call.outcome.ok ? "ok" : call.outcome.category}${call.outcome.detail ? ` (${call.outcome.detail.slice(0, 80)})` : ""}`,
      ),
      reasoning: excerpt(cycleReasoning(run, row.cycle)),
      outcome: row.blamedIncidents.map((id) => {
        const incident = incidents.find((item) => item.id === id);
        return `${id} ${incident.collisionType} tick=${incident.triggerTick} vehicles=${incident.vehicleIds.length} pedestrians=${incident.pedestrianIds.length} estCost=${incident.estimatedCost}`;
      }),
    };
  };
  const best = [...rows].filter((row) => row.blame === 0).sort((a, b) => b.value - a.value).slice(0, top).map(card);
  const worst = [...rows]
    .filter((row) => row.blame > 0 || row.patienceRiskAdmits > 0)
    .sort((a, b) => b.blame - a.blame || b.patienceRiskAdmits - a.patienceRiskAdmits)
    .slice(0, top)
    .map(card);

  const highlights = [];
  for (const event of run.events) {
    if (event.kind === "PED_GRANT") highlights.push({ tick: event.tick, cycle: event.cycle, kind: "PED_GRANT", detail: `${event.payload.crosswalkId} ${event.payload.directions?.join("+")} x${event.payload.pedestrianIds?.length}` });
    if (event.kind === "LANE_GUIDANCE") highlights.push({ tick: event.tick, cycle: event.cycle, kind: "LANE_GUIDANCE", detail: `${event.payload.vehicleId} ${event.payload.sourceLaneId}->${event.payload.targetLaneId}` });
    if (event.kind === "STALL_REROUTE") highlights.push({ tick: event.tick, cycle: event.cycle, kind: "STALL_REROUTE", detail: `${event.payload.vehicleIds?.join(",")} around ${event.payload.vehicleId}` });
    if (event.kind === "TOW_DISPATCH") highlights.push({ tick: event.tick, cycle: event.cycle, kind: "TOW_DISPATCH", detail: event.payload.vehicleId });
  }
  for (const call of run.calls) {
    if (call.tool === "dispatch_emergency_convoy" && call.outcome.ok) {
      highlights.push({ tick: call.tick, cycle: call.cycle, kind: "EMERGENCY_CONVOY", detail: `${call.args.emergency_vehicle_id} on ${call.args.lane_id}` });
    }
  }
  const largestVerified = rows.filter((row) => row.commitKind === "verified").sort((a, b) => b.admitted - a.admitted).slice(0, 3);
  for (const row of largestVerified) {
    highlights.push({ tick: row.tick, cycle: row.cycle, kind: "LARGE_VERIFIED_RELEASE", detail: `${row.admitted} vehicles, blame=${row.blame}` });
  }
  for (const item of highlights) item.cycle ??= cycleAtTick(run, item.tick);
  highlights.sort((left, right) => left.tick - right.tick);
  return { rows, best, worst, highlights };
}

// ---------------------------------------------------------------- markdown

function table(rows, columns) {
  if (rows.length === 0) return "（无）\n";
  const header = `| ${columns.map(([label]) => label).join(" | ")} |`;
  const divider = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map(
    (row) =>
      `| ${columns
        .map(([, get]) => {
          const value = typeof get === "function" ? get(row) : row[get];
          return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
        })
        .join(" | ")} |`,
  );
  return `${[header, divider, ...body].join("\n")}\n`;
}

const statLine = (value) =>
  value.count === 0 ? "（无数据）" : `平均 ${value.mean}，P50 ${value.p50}，P95 ${value.p95}，最大 ${value.max}（n=${value.count}）`;

function renderMarkdown(analysis) {
  const { meta, context, attention, tools, agent, reasoning, game, cycles } = analysis;
  const lines = [];
  const push = (...items) => lines.push(...items);

  push(`# 运行分析：${meta.id}`, "");
  push(`- 模型：${meta.model}；种子 ${meta.seed}；规则版本 ${meta.rulesVersion}；回放 schema ${meta.schemaVersion}`);
  push(`- 截止 tick ${meta.endTick}，决策周期 ${agent.cycles}，最终余额 **${meta.finalBalance}**`);
  push(`- 生成时间 ${meta.generatedAt}；数据文件：${meta.files.join("、")}`, "");

  push("## 1. 基础分析", "", "### 1.1 上下文能力", "");
  push(`- prompt tokens：${statLine(context.promptTokens)}`);
  push(`- completion tokens：${statLine(context.completionTokens)}；其中推理 tokens：${statLine(context.reasoningTokens)}`);
  push(`- 每周期 API 轮数：${statLine(context.roundsPerCycle)}；上限 ${context.roundsPerCycle.maxAllowed}，用满上限的周期 ${context.roundsPerCycle.cyclesAtMax} 个`);
  push(`- 每次请求的平均字符数：系统提示 ${context.requestChars.system.mean}，user ${context.requestChars.user.mean}，工具结果 ${context.requestChars.tool.mean}，assistant ${context.requestChars.assistant.mean}；消息条数 ${statLine(context.requestChars.messages)}`);
  push(`- 工具参数中的 ID 共 ${context.grounding.total} 个：出现在当轮可见上下文里的占 ${context.grounding.visibleRate}，当轮不可见但本局别处出现过 ${context.grounding.knownElsewhere} 个，本局从未出现 ${context.grounding.neverSeen} 个，非规范横道短键 ${context.grounding.nonCanonical} 个`);
  push("", table(Object.entries(context.grounding.byKind).map(([kind, value]) => ({ kind, ...value })), [["ID 类型", "kind"], ["总数", "total"], ["当轮可见", "visible"], ["别处出现", "knownElsewhere"], ["从未出现", "neverSeen"], ["非规范短键", "nonCanonical"]]));
  if (context.grounding.neverSeenSamples.length > 0) {
    push("本局从未出现过的 ID 样例：", "", table(context.grounding.neverSeenSamples, [["周期", "cycle"], ["工具", "tool"], ["参数", "key"], ["值", "value"]]));
  }
  push(`- 同一周期内重复提交已失败的相同调用：${context.repeatedFailures.count} 次 ${JSON.stringify(context.repeatedFailures.byTool)}`);
  push(`- 提交类型：verified ${context.commits.verified}，unverified ${context.commits.unverified}，hold ${context.commits.hold}；放行类提交中 verified 占 ${context.commits.verifiedRateAmongReleases}`);
  push(`- working memory：调用 ${context.workingMemory.calls} 次 ${JSON.stringify(context.workingMemory.actions)}，观测里带有计划的周期 ${context.workingMemory.cyclesWithPlanVisible} 个`, "");

  push("### 1.2 注意力分布", "", "关注率 = 字段出现在该周期观测里、且推理文本提到它的周期数 / 字段出现的周期数。", "");
  push(table(
    Object.entries(attention.concepts).map(([name, value]) => ({ name, ...value })).sort((a, b) => (b.attentionRate ?? -1) - (a.attentionRate ?? -1)),
    [["概念", "name"], ["出现周期", "present"], ["提到且出现", "mentionedWhenPresent"], ["关注率", "attentionRate"], ["提到周期（含未出现）", "mentionedTotal"], ["提及次数", "occurrences"]],
  ));
  push("中断响应：", "", table(Object.entries(attention.interruptResponse.byKind).map(([kind, value]) => ({ kind, ...value, rule: attention.interruptResponse.rules[kind] ?? attention.interruptResponse.rules.other })), [["中断类型", "kind"], ["次数", "count"], ["有响应", "responded"], ["响应率", "rate"], ["判定规则", "rule"]]));
  push(`- 每次回复的推理字符数：${statLine(attention.reasoningChars)}`, "");

  push("### 1.3 tool_call 准确性", "");
  push(`- 工具调用 ${tools.totalCalls} 次，成功 ${tools.okCalls} 次，成功率 ${tools.successRate}`);
  push(`- 失败分类：${JSON.stringify(tools.failureCategories)}`);
  push(`- 每次回复的工具调用数分布：${JSON.stringify(tools.callsPerResponse)}；finish_reason：${JSON.stringify(tools.finishReasons)}`);
  push(`- API 错误 ${tools.apiErrors.count} 次 ${JSON.stringify(tools.apiErrors.messages)}；回退周期 ${JSON.stringify(tools.fallbackCycles)}`);
  push(`- 从未使用的工具：${tools.unusedTools.join("、") || "无"}`, "");
  push(table(Object.entries(tools.byTool).map(([tool, value]) => ({ tool, ...value, categories: JSON.stringify(value.categories) })), [["工具", "tool"], ["调用", "calls"], ["成功", "ok"], ["成功率", "successRate"], ["结果分类", "categories"]]));
  push("错误样例：", "");
  for (const [category, samples] of Object.entries(tools.errorSamples)) {
    push(`- **${category}**`);
    for (const sample of samples) push(`  - c${sample.cycle} t${sample.tick} ${sample.tool}：${sample.detail || "-"}；参数 \`${sample.args}\``);
  }
  push("");

  push("### 1.4 Agent 能力", "");
  push(`- 周期内工具序列（D=试算，C=提交，T=其他工具）：${JSON.stringify(agent.flowPatterns)}`);
  push(`- 含提交的周期里先试算再提交的比例：${agent.dryRunBeforeCommitRate}`);
  push(`- 提交构成：${JSON.stringify(agent.commitMix)}；每周期放行车数 ${statLine(agent.admittedPerCycle)}；共放行 ${agent.admittedTotal} 辆`);
  push(`- 成功提交 ${agent.laneBatches.okCommits} 次，其中使用 lane_batches ${agent.laneBatches.commitsUsingBatches} 次；每次 top_n 合计 ${statLine(agent.laneBatches.topNSum)}`);
  push(`- 速度档位：${JSON.stringify(agent.speedProfiles)}；sleep_ticks：${statLine(agent.sleepTicks)} ${JSON.stringify(agent.sleepTicks.distribution)}`);
  push(`- 工具使用：${JSON.stringify(agent.toolDiversity)}`);
  push(`- 决策开销：API ${agent.overhead.apiCalls} 次，扣 ${agent.overhead.decisionTaxPaid}；非终结工具 ${agent.overhead.nonTerminalToolCalls} 次，扣 ${agent.overhead.toolTaxPaid}`, "");
  push("与同条件 baseline 对比：", "");
  push(table(agent.scoreboard, [["策略", "name"], ["最终余额", "finalBalance"], ["放行车辆", "admittedVehicles"], ["未服务负债", "unservedLiability"], ["事故数", "incidents"], ["锁格扣费", "hazardBleed"], ["上游积压", "upstreamBleed"], ["撞人", "pedestrianStrike"], ["闯红灯罚", "pedestrianJaywalk"], ["行人奖励", "pedestrianReward"], ["校车", "schoolBusPenalties"], ["拖车", "towingCosts"]]));

  push("## 2. 进阶分析", "", "### 2.1 逻辑推理", "");
  const correction = reasoning.corrections;
  push(`- 试算失败（不含额度用完）${correction.failures} 次；之后再试 ${correction.retried} 次，其中改了参数 ${correction.retriedChanged} 次，成功 ${correction.retriedSucceeded} 次（${correction.retrySuccessRate}）；失败所在周期最终 verified 提交 ${correction.thenVerifiedCommit} 次、hold ${correction.thenHold} 次`);
  const claims = reasoning.crosswalkClaims;
  push(`- 推理中"路线 X 经过/不经过 Y 横道"的断言 ${claims.claims} 条，正确 ${claims.correct}，错误 ${claims.wrong}，准确率 ${claims.accuracy}；前半局 ${claims.byCycleHalf.first.wrong}/${claims.byCycleHalf.first.claims} 错，后半局 ${claims.byCycleHalf.second.wrong}/${claims.byCycleHalf.second.claims} 错`);
  for (const sample of claims.wrongSamples) push(`  - c${sample.cycle}：「${sample.claim}」（实际经过 ${sample.actual}）`);
  push(`- 推理写"安全/无冲突"但同一轮试算冲突：${reasoning.contradictions.count} 次`);
  for (const sample of reasoning.contradictions.samples) push(`  - c${sample.cycle} r${sample.round} t${sample.tick}：「${sample.claim}」→ ${sample.result}`);
  push(`- 自我修正标记（Wait/Actually/Let me recheck…）：共 ${reasoning.selfCorrectionMarkers.total} 次，每次回复 ${statLine(reasoning.selfCorrectionMarkers.perResponse)}`);
  for (const [name, value] of Object.entries(reasoning.misconceptions)) {
    push(`- 认知模式 ${name}：${value.occurrences} 处`);
    for (const sample of value.samples) push(`  - 「${sample}」`);
  }
  push("");

  push("### 2.2 复杂环境博弈", "", "**行人与车辆**", "");
  const pedestrians = game.pedestrians;
  push(`- 行人相位尝试 ${pedestrians.phaseAttempts} 次，成功 ${pedestrians.phaseOk} 次 ${JSON.stringify(pedestrians.phaseOutcomes)}`);
  push(`- 实际放行 ${pedestrians.grants} 批 ${pedestrians.grantedPedestrians} 人；闯红灯 ${pedestrians.jaywalkEvents} 次 ${pedestrians.jaywalkers} 人；被撞 ${pedestrians.injured} 人；奖励 ${pedestrians.reward}，扣费 ${JSON.stringify(pedestrians.penalties)}`);
  push("", "行人相位冲突样例：", "", table(pedestrians.phaseConflicts, [["周期", "cycle"], ["tick", "tick"], ["冲突偏移 at", "at"], ["冲突", "detail"]]));
  push(`在行人耐心告急（PATIENCE_CRITICAL）时放行、且路线经过该横道的车辆：${pedestrians.patienceRiskAdmissions.length} 车次`, "");
  push(table(pedestrians.patienceRiskAdmissions.slice(0, 15), [["周期", "cycle"], ["tick", "tick"], ["车辆", "vehicleId"], ["路线", "routeId"], ["横道", "crosswalk"], ["行人", "pedestrianId"], ["剩余耐心", "patienceRemaining"], ["该行人后来被撞", (row) => (row.laterStruck ? "是" : "")]]));
  push("行人时间线：", "", table(pedestrians.timeline, [["tick", "tick"], ["事件", "kind"], ["横道", "crosswalk"], ["人数", "pedestrians"]]));
  push("**事故处置**", "", table(game.incidents, [["事故", "id"], ["类型", "collisionType"], ["发生", "triggerTick"], ["车辆", "vehicles"], ["行人", "pedestrians"], ["首次响应", "firstReactionTick"], ["清障令", "clearanceOrderTick"], ["清障调用次数", "clearanceOrders"], ["关闭", "closeTick"], ["事故后才放行、后来卷入", (row) => row.admittedWhileOpenThenJoined.join(" ")], ["非模型放行（抢行）", (row) => row.selfEntered.join(" ")]]));
  push("事故成本估算：", "", table(analysis.incidents, [["事故", "id"], ["最终严重度", "finalSeverity"], ["锁格（含二次）", "lockedCells"], ["开放拍数", "openTicks"], ["危化品", (row) => (row.hazmat ? "是" : "")], ["校车", (row) => (row.schoolBus ? "是" : "")], ["分摊锁格费", "hazardShare"], ["估算总成本", "estimatedCost"], ["放行来源", (row) => row.admittedBy.map((item) => `${item.vehicleId}@c${item.cycle ?? "-"}`).join(" ")]]));
  push("**司机抢行**", "", `总计 ${JSON.stringify(game.aggression.totals)}`, "", table(game.aggression.events, [["周期", "cycle"], ["类型", "kind"], ["车辆", "vehicleId"], ["此前出现在 driverAlerts 的周期数", "alertedCycles"], ["最后一次预警", (row) => (row.lastAlert ? `${row.lastAlert.laneId} 距停止线 ${row.lastAlert.distanceToStopline} 剩余 ${row.lastAlert.patienceRemaining}` : "")], ["卷入事故", "joinedIncident"]]));
  push("**紧急车辆与抛锚**", "", `紧急车辆延误扣费 ${game.emergency.bleed}`, "", table(game.emergency.vehicles, [["车辆", "vehicleId"], ["首次进入 12 格", "firstAlertTick"], ["放行 tick", "admitTick"], ["等待拍数", "waitTicks"], ["最长静止", "maxStationary"]]));
  push(`拖车费 ${game.stalls.towingCosts}，链式加价 ${game.stalls.stallChainBleed}`, "", table(game.stalls.items, [["车辆", "vehicleId"], ["车道", "laneId"], ["抛锚", "stallTick"], ["派拖车", "towTick"], ["派车延迟", "towLatency"], ["绕行", "rerouteTick"]]));

  push("### 2.3 亮眼操作与最差操作", "", "周期价值 = 未卷入事故的放行车数 + 1.5×放行行人 + 2×成功的特情工具 − 归因事故成本。事故成本按锁格×开放时长分摊本局真实锁格扣费，再加撞人和校车罚款，平均分给放行了涉事车辆的周期。这是用于挑选证据的启发式，不是精确账目。", "");
  push("亮点事件：", "", table(cycles.highlights, [["tick", "tick"], ["周期", "cycle"], ["类型", "kind"], ["说明", "detail"]]));
  const renderCards = (title, list) => {
    push(`#### ${title}`, "");
    for (const item of list) {
      push(`**周期 ${item.cycle}（tick ${item.tick}）**：放行 ${item.admitted}，未出事 ${item.cleanAdmits}，放行行人 ${item.pedestriansGranted}，耐心风险放行 ${item.patienceRiskAdmits}，归因成本 ${item.blame}，周期余额变化 ${item.financialDelta}，提交类型 ${item.commitKind}，睡眠 ${item.sleepTicks}`, "");
      if (item.interrupt) push(`- 唤醒原因：${item.interrupt.slice(0, 200)}`);
      push(`- 观测要点：余额 ${item.context.balance}，停止线候选 ${item.context.stoplineCandidates}，受阻路线 ${item.context.blockedRoutes}，行人预警 [${item.context.pedestrianAlerts.join(", ")}]，司机预警 [${item.context.driverAlerts.join(", ")}]，紧急车 [${item.context.emergencyAlerts.join(", ")}]，抛锚 [${item.context.stalled.join(", ")}]`);
      push(`- 工具序列：${item.toolSequence.join("；") || "无"}`);
      if (item.outcome.length > 0) push(`- 后果：${item.outcome.join("；")}`);
      push(`- 战术摘要：${item.summary ?? ""}`);
      push(`- 推理摘录：${item.reasoning}`, "");
    }
  };
  renderCards("得分最高的周期", cycles.best);
  renderCards("损失最大的周期", cycles.worst);

  push("### 附：逐周期一览", "", table(cycles.rows, [["周期", "cycle"], ["tick", "tick"], ["提交", "commitKind"], ["放行", "admitted"], ["行人", "pedestriansGranted"], ["耐心风险", "patienceRiskAdmits"], ["归因事故", (row) => row.blamedIncidents.join(" ")], ["归因成本", "blame"], ["余额变化", "financialDelta"], ["睡眠", "sleepTicks"], ["唤醒原因", (row) => (row.interrupt ?? "").slice(0, 60)]]));
  return lines.join("\n");
}

// ---------------------------------------------------------------- main

function main() {
  const options = parseArgs(process.argv.slice(2));
  const artifacts = resolveArtifacts(options.replay);
  const run = loadRun(artifacts);
  const incidents = incidentCosts(run);
  const game = analyzeGame(run, incidents);
  const analysis = {
    meta: {
      id: artifacts.id,
      model: run.summary.model,
      seed: run.summary.seed,
      rulesVersion: run.replay.simulationRulesVersion,
      schemaVersion: run.replay.schemaVersion,
      endTick: run.summary.endTick,
      finalBalance: round(run.summary.finalBalance),
      generatedAt: new Date().toISOString(),
      files: [artifacts.replay, artifacts.report, artifacts.apiLog, artifacts.rawApiLog].filter(Boolean).map((file) => basename(file)),
      hasReasoning: run.reasoning.size > 0,
    },
    context: analyzeContext(run),
    attention: analyzeAttention(run),
    tools: analyzeTools(run),
    agent: analyzeAgent(run),
    reasoning: analyzeReasoning(run),
    game,
    incidents,
    cycles: buildCycleCards(run, incidents, game, options.top),
  };
  const outDirectory = resolve(options.out, artifacts.id);
  mkdirSync(outDirectory, { recursive: true });
  writeFileSync(join(outDirectory, "analysis.json"), `${JSON.stringify(analysis, null, 2)}\n`);
  writeFileSync(join(outDirectory, "analysis.md"), `${renderMarkdown(analysis)}\n`);
  console.log(`[analyze] ${artifacts.id} balance=${analysis.meta.finalBalance} -> ${outDirectory}`);
}

main();
