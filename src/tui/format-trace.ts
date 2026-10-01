const TRACE_LIMIT = 124;

export function formatBenchTrace(text: string): string {
  const name = text.match(/"toolName"\s*:\s*"([^"]+)"/)?.[1];
  const speedProfiles = [
    ...text.matchAll(
      /"(?:speed_profile|speedProfile)"\s*:\s*"(SLOW_SLIDE|CRUISE|BURST)"/g,
    ),
  ].map((match) => match[1]);
  const speedSummary =
    speedProfiles.length === 0
      ? ""
      : ` speed ${[...new Set(speedProfiles)].join("/")}`;
  const line =
    name !== undefined
      ? `tool ${name}${speedSummary}`
      : (text.split("\n")[0]?.trim() ?? "");
  if (line.length === 0) {
    return "";
  }
  return line.length > TRACE_LIMIT ? `${line.slice(0, TRACE_LIMIT - 1)}…` : line;
}

export function traceIsHot(line: string): boolean {
  return (
    line.includes("dispatch_emergency_convoy") ||
    line.includes("reroute_queue_around_stall")
  );
}
