import { readFileSync } from "node:fs";
const root = "z:/works/kcores.com/repo/silicon-conductor-bench";
const keys = ["financialDelta", "upstreamBleed", "hazardBleed", "pedestrianJaywalk", "pedestrianStrike", "schoolBusPenalty", "towingCost"];
const segments = [[0, 140], [140, 175], [175, 210], [210, 262]];
for (const id of process.argv.slice(2)) {
  const r = JSON.parse(readFileSync(`${root}/logs/report_${id}.json`, "utf8")).summary;
  console.log(`\n${id} terminal=${JSON.stringify(r.terminal)}`);
  for (const [a, b] of segments) {
    const cs = r.cycles.filter((c) => c.tick > a && c.tick <= b);
    const o = { cycles: cs.length, admitted: cs.reduce((s, c) => s + (c.admitted?.length ?? 0), 0), holds: cs.filter((c) => c.holdCommits > 0).length };
    for (const k of keys) o[k] = +cs.reduce((s, c) => s + (c[k] ?? 0), 0).toFixed(2);
    console.log(`${a}-${b} ${JSON.stringify(o)}`);
  }
  const api = readFileSync(`${root}/logs/api-log_${id}.jsonl`, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const resp = api.filter((x) => x.event === "API_RESPONSE");
  const comp = resp.map((x) => x.payload.usage?.completion_tokens ?? 0);
  console.log(`completion max=${Math.max(...comp)} lengthFinish=${resp.filter((x) => x.payload.finishReason === "length").length} noTool=${resp.filter((x) => (x.payload.toolCalls ?? []).length === 0).length}`);
  const fb = api.filter((x) => x.event === "FALLBACK" || x.event === "API_ERROR").map((x) => `${x.event}@c${x.cycle}`);
  if (fb.length) console.log(`fallback/apiError ${fb.join(" ")}`);
}
