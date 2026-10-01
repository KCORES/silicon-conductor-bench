export const AMBULANCE_DEMO_PENALTY_PER_100_MS = 10;

export function ambulanceDemoPenalty(
  logicalTick: number,
  tickDurationMs: number,
): number {
  const elapsedMs = Math.max(0, logicalTick) * Math.max(0, tickDurationMs);
  return -(
    elapsedMs *
    (AMBULANCE_DEMO_PENALTY_PER_100_MS / 100)
  );
}

const CHAIN_CRASHES = [
  { id: "demo-crash-north", tick: 12, base: 900 },
  { id: "demo-crash-west", tick: 12, base: 900 },
  { id: "demo-crash-south", tick: 16, base: 1_400 },
  { id: "demo-crash-north-tail", tick: 19, base: 1_100 },
  { id: "demo-crash-east", tick: 22, base: 2_000 },
  { id: "demo-crash-west-tail", tick: 25, base: 1_300 },
] as const;

export function chainCrashDemoPenalties(
  logicalTick: number,
  tickDurationMs: number,
): ReadonlyMap<string, number> {
  const penalties = new Map<string, number>();
  for (const crash of CHAIN_CRASHES) {
    const elapsedMs =
      (Math.max(0, logicalTick) - crash.tick) * Math.max(0, tickDurationMs);
    if (elapsedMs < 0) {
      continue;
    }
    penalties.set(crash.id, -(crash.base + elapsedMs * 0.5));
  }
  return penalties;
}
