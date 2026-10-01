// Rebuild .env files from scripts/env.template.
// `KEY=@keep` takes the value from the existing file; other values are fixed by the template.
// `#@if KEY` ... `#@endif` blocks are kept only when the existing file defines KEY.
// Values are never printed. Dry-run by default; pass --write to overwrite files.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TARGETS = [
  ".env",
  ".env.example",
  ".env.qwen3.8-27b-cerebras",
  ".env.deepseek-flash",
  ".env.deepseek-v4-pro",
  ".env.mimo-v2.6-pro-ultraspeed",
  ".env.space-bunny-alpha",
  ".env.step-5-preview",
];
const RETIRED = new Set([
  "STARVATION_THRESHOLD_TICKS",
  "STARVATION_FINE",
  "STARVATION_BLEED_PER_TICK",
  "SCORE_OFFSET",
  "SCORE_SCALE",
]);

const write = process.argv.includes("--write");
const template = readFileSync(new URL("./env.template", import.meta.url), "utf8");
const templateKeys = new Set(
  [...template.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]),
);
const backupDir = join(tmpdir(), `env-backup-${Date.now()}`);
let failed = false;

for (const target of TARGETS) {
  const source = readFileSync(target, "utf8");
  const values = new Map();
  const problems = [];
  // Tolerates comment lines whose newline was lost: a key may follow non-key characters.
  for (const match of source.matchAll(/(?:^|[^A-Za-z0-9_*{])([A-Z][A-Z0-9_]{2,})=([^\s\uFFFD]*)/gm)) {
    const [, key, value] = match;
    if (values.has(key)) problems.push(`duplicate ${key}`);
    values.set(key, value);
  }
  for (const key of values.keys()) {
    if (!templateKeys.has(key) && !RETIRED.has(key)) problems.push(`unknown ${key}`);
  }

  const output = [];
  let skipping = false;
  for (const line of template.split("\n")) {
    const open = /^#@if ([A-Z0-9_]+)$/.exec(line);
    if (open !== null) {
      skipping = !values.has(open[1]);
      continue;
    }
    if (line === "#@endif") {
      skipping = false;
      continue;
    }
    if (skipping) continue;
    const keep = /^([A-Z][A-Z0-9_]*)=@keep$/.exec(line);
    if (keep !== null) {
      const key = keep[1];
      if (!values.has(key)) {
        problems.push(`missing ${key}`);
        continue;
      }
      output.push(`${key}=${values.get(key)}`);
      continue;
    }
    output.push(line);
  }
  const text = output.join("\n");

  const changed = [...templateKeys].filter((key) => {
    const line = new RegExp(`^${key}=(.*)$`, "m").exec(text);
    return line !== null && values.has(key) && values.get(key) !== line[1];
  });
  const added = [...templateKeys].filter(
    (key) => !values.has(key) && new RegExp(`^${key}=`, "m").test(text),
  );
  const dropped = [...values.keys()].filter((key) => RETIRED.has(key));
  console.log(
    `${target.padEnd(32)} keys=${values.size} lines=${text.split("\n").length - 1}` +
      ` changed=[${changed.join(",")}] added=[${added.join(",")}] dropped=[${dropped.join(",")}]` +
      (problems.length > 0 ? ` PROBLEMS=[${problems.join(", ")}]` : ""),
  );
  if (problems.length > 0) {
    failed = true;
    continue;
  }
  if (write) {
    mkdirSync(backupDir, { recursive: true });
    copyFileSync(target, join(backupDir, target));
    writeFileSync(target, text, "utf8");
  }
}

if (write) console.log(`backup: ${backupDir}`);
if (failed) process.exitCode = 1;
