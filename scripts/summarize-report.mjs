// Print the headline numbers of one or more benchmark reports.
// Usage: node scripts/summarize-report.mjs logs/report_*.json
import { readFileSync } from "node:fs";

for (const path of process.argv.slice(2)) {
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  const report = parsed.summary ?? parsed;
  const totals = report.totals ?? {};
  const pick = (key) => (typeof totals[key] === "number" ? Number(totals[key].toFixed(2)) : totals[key]);
  console.log(
    JSON.stringify({
      report: path,
      model: report.model,
      finalBalance: report.finalBalance,
      terminal: report.terminal,
      apiCalls: totals.apiCalls,
      aggression: totals.aggression,
      violationExits: totals.violationExits,
      incidents: Array.isArray(report.incidents) ? report.incidents.length : undefined,
      hazardBleed: pick("hazardBleed"),
      exitLockBleed: pick("exitLockBleed"),
      upstreamBleed: pick("upstreamBleed"),
      schoolBusPenalties: pick("schoolBusPenalties"),
      towingCosts: pick("towingCosts"),
      secondaryPenalties: pick("secondaryPenalties"),
      interrupts: Array.isArray(report.cycles)
        ? report.cycles.filter((cycle) => cycle.interruptReason !== null).length
        : undefined,
      cycles: Array.isArray(report.cycles) ? report.cycles.length : undefined,
    }),
  );
}
