import { readFileSync } from "node:fs";
const root = "z:/works/kcores.com/repo/silicon-conductor-bench";
const [id, ...specs] = process.argv.slice(2);
const raw = readFileSync(`${root}/logs/raw-api-log_${id}.jsonl`, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((x) => x?.event === "API_RESPONSE");
const text = (cycle) => raw.filter((x) => x.cycle === cycle).map((x) => { const m = x.payload?.choices?.[0]?.message ?? {}; return (m.reasoning ?? m.reasoning_content ?? "") + "\n[CONTENT] " + (m.content ?? ""); }).join("\n").replace(/\s+/g, " ");
for (const spec of specs) {
  const [cycleText, pattern, widthText] = spec.split("|");
  const width = Number(widthText ?? 220);
  const t = text(Number(cycleText));
  const regex = new RegExp(pattern, "gi");
  let match; let count = 0;
  while ((match = regex.exec(t)) !== null && count < 2) {
    console.log(`c${cycleText} /${pattern}/: ...${t.slice(Math.max(0, match.index - width), match.index + width)}...\n`);
    count += 1;
    regex.lastIndex = match.index + width;
  }
  if (count === 0) console.log(`c${cycleText} /${pattern}/: (no match, ${t.length} chars)\n`);
}
