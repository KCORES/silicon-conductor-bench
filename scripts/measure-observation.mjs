// Measure how much of each model request is spent on the system prompt, the
// initial observation (per field) and tool results (per tool).
// Usage: node scripts/measure-observation.mjs logs/api-log_*.jsonl
import { readFileSync } from "node:fs";

const contentLength = (message) =>
  (typeof message.content === "string"
    ? message.content.length
    : JSON.stringify(message.content ?? "").length) +
  (message.tool_calls === undefined ? 0 : JSON.stringify(message.tool_calls).length);

for (const path of process.argv.slice(2)) {
  const fields = new Map();
  const tools = new Map();
  const roles = new Map();
  let requests = 0;
  let promptTokens = 0;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.trim() === "") {
      continue;
    }
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    const messages = record.payload?.messages;
    if (!Array.isArray(messages)) {
      const usage = record.payload?.usage ?? record.payload?.response?.usage;
      promptTokens += usage?.prompt_tokens ?? 0;
      continue;
    }
    requests += 1;
    const toolNames = new Map();
    for (const message of messages) {
      roles.set(message.role, (roles.get(message.role) ?? 0) + contentLength(message));
      for (const call of message.tool_calls ?? []) {
        toolNames.set(call.id, call.function?.name ?? "?");
      }
      if (message.role === "tool") {
        const name = toolNames.get(message.tool_call_id) ?? "?";
        const entry = tools.get(name) ?? { chars: 0, count: 0 };
        entry.chars += contentLength(message);
        entry.count += 1;
        tools.set(name, entry);
      }
    }
    const user = messages.find((message) => message.role === "user");
    let parsed;
    try {
      parsed = JSON.parse(user?.content ?? "");
    } catch {
      continue;
    }
    for (const [key, value] of Object.entries(parsed.observation ?? {})) {
      fields.set(key, (fields.get(key) ?? 0) + JSON.stringify(value).length);
    }
    for (const key of ["previous_agent_feedback", "recentCycles", "lastSettlement"]) {
      fields.set(`@${key}`, (fields.get(`@${key}`) ?? 0) + JSON.stringify(parsed[key] ?? null).length);
    }
  }
  if (requests === 0) {
    console.log(`${path}: no requests`);
    continue;
  }
  const average = (value) => Math.round(value / requests);
  console.log(`# ${path}`);
  console.log(`requests=${requests}${promptTokens > 0 ? ` avgPromptTokens=${average(promptTokens)}` : ""}`);
  for (const [role, chars] of roles) {
    console.log(`role ${role.padEnd(10)} ${String(average(chars)).padStart(7)}`);
  }
  console.log("observation fields (avg chars per request):");
  for (const [key, chars] of [...fields].sort((left, right) => right[1] - left[1])) {
    console.log(`  ${key.padEnd(28)} ${String(average(chars)).padStart(7)}`);
  }
  console.log("tool results (avg chars per result):");
  for (const [name, entry] of [...tools].sort((left, right) => right[1].chars - left[1].chars)) {
    console.log(`  ${name.padEnd(28)} ${String(Math.round(entry.chars / entry.count)).padStart(7)} x${entry.count}`);
  }
}
