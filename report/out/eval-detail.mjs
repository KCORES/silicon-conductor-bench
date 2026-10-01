import { readFileSync } from "node:fs";
const root = "z:/works/kcores.com/repo/silicon-conductor-bench";
const id = process.argv[2];
const a = JSON.parse(readFileSync(`${root}/report/out/${id}/analysis.json`, "utf8"));
const out = (label, value) => console.log(`${label}: ${JSON.stringify(value)}`);
out("meta", a.meta);
out("prompt", a.context.promptTokens); out("reasonTok", a.context.reasoningTokens); out("reasonChars", a.attention.reasoningChars);
out("rounds", a.context.roundsPerCycle); out("grounding", { ...a.context.grounding, neverSeenSamples: a.context.grounding.neverSeenSamples.slice(0, 5) });
out("repeatedFailures", a.context.repeatedFailures); out("memory", a.context.workingMemory);
out("attention", Object.fromEntries(Object.entries(a.attention.concepts).map(([k, v]) => [k, [v.present, v.attentionRate]])));
out("interrupts", a.attention.interruptResponse.byKind);
out("tools", { total: a.tools.totalCalls, rate: a.tools.successRate, fail: a.tools.failureCategories, unused: a.tools.unusedTools, perResp: a.tools.callsPerResponse, finish: a.tools.finishReasons, apiErr: a.tools.apiErrors, fallback: a.tools.fallbackCycles });
out("byTool", Object.fromEntries(Object.entries(a.tools.byTool).map(([k, v]) => [k, [v.calls, v.successRate]])));
out("errSamples", Object.fromEntries(Object.entries(a.tools.errorSamples).map(([k, v]) => [k, v.slice(0, 2).map((s) => `c${s.cycle} t${s.tick} ${s.tool}: ${s.detail} ${s.args.slice(0, 120)}`)])));
out("agent", { flows: Object.fromEntries(Object.entries(a.agent.flowPatterns).slice(0, 6)), dryFirst: a.agent.dryRunBeforeCommitRate, mix: a.agent.commitMix, perCycle: a.agent.admittedPerCycle, batches: a.agent.laneBatches, speed: a.agent.speedProfiles, sleep: a.agent.sleepTicks, tools: a.agent.toolDiversity, overhead: a.agent.overhead });
out("scoreboard", a.agent.scoreboard.filter((s) => !/random|longest|bus|no-ped/.test(s.name)));
out("corrections", a.reasoning.corrections);
out("claims", a.reasoning.crosswalkClaims);
out("contradictions", a.reasoning.contradictions.samples.slice(0, 4).map((s) => `c${s.cycle} t${s.tick}: ${s.claim?.slice(100, 260)} => ${s.result}`));
out("selfCorr", a.reasoning.selfCorrectionMarkers);
out("misc", Object.fromEntries(Object.entries(a.reasoning.misconceptions).map(([k, v]) => [k, v.occurrences])));
const p = a.game.pedestrians;
out("peds", { attempts: p.phaseAttempts, ok: p.phaseOk, outcomes: p.phaseOutcomes, grants: p.grants, granted: p.grantedPedestrians, jay: p.jaywalkers, injured: p.injured, penalties: p.penalties, risk: p.patienceRiskAdmissions.length, riskStruck: [...new Set(p.patienceRiskAdmissions.filter((x) => x.laterStruck).map((x) => x.pedestrianId))] });
out("pedTimeline", p.timeline.map((x) => `${x.tick}${x.kind.replace("PED_", "").charAt(0)}${x.crosswalk?.split(":")[1]?.charAt(0)}${x.pedestrians}`).join(" "));
out("incidents", a.incidents.map((i) => `${i.id} ${i.collisionType}/${i.finalSeverity} t${i.triggerTick}-${i.closeTick ?? "end"} cells=${i.lockedCells} veh=${i.vehicleIds.length} ped=${i.pedestrianIds.length} bus=${i.schoolBus} hazmat=${i.hazmat} est=${i.estimatedCost} by=${i.admittedBy.map((x) => `${x.vehicleId}@c${x.cycle ?? "-"}/${x.routeId ?? ""}`).join(",")}`));
out("handling", a.game.incidents.map((i) => `${i.id} react=${i.firstReactionTick} clear=${i.clearanceOrderTick} n=${i.clearanceOrders} late=${i.admittedWhileOpenThenJoined} self=${i.selfEntered}`));
out("aggression", a.game.aggression);
out("emergency", a.game.emergency);
out("stalls", a.game.stalls);
out("highlights", a.cycles.highlights.map((h) => `${h.tick}/c${h.cycle} ${h.kind} ${h.detail}`));
for (const [name, list] of [["BEST", a.cycles.best], ["WORST", a.cycles.worst]]) {
  for (const c of list) {
    console.log(`\n${name} c${c.cycle} t${c.tick} adm=${c.admitted} clean=${c.cleanAdmits} peds=${c.pedestriansGranted} risk=${c.patienceRiskAdmits} blame=${c.blame} kind=${c.commitKind} sleep=${c.sleepTicks} wake=${(c.interrupt ?? "").slice(0, 90)}`);
    console.log(`  ctx ${JSON.stringify(c.context)}`);
    console.log(`  tools ${c.toolSequence.join(" | ").slice(0, 400)}`);
    console.log(`  outcome ${c.outcome.join("; ")}`);
    console.log(`  summary ${(c.summary ?? "").slice(0, 300)}`);
  }
}
