export interface TokenCycle {
  readonly decisionTick: number;
  readonly promptTokens?: number;
  readonly completionTokens?: number;
}

export function cumulativeTokens(
  cycles: readonly TokenCycle[],
  tick: number,
): number | null {
  let total = 0;
  let seen = false;
  for (const cycle of cycles) {
    if (cycle.decisionTick > tick) {
      continue;
    }
    if (cycle.promptTokens === undefined && cycle.completionTokens === undefined) {
      continue;
    }
    seen = true;
    total += (cycle.promptTokens ?? 0) + (cycle.completionTokens ?? 0);
  }
  return seen ? total : null;
}

export function formatTokenTotal(total: number | null): string {
  return total === null ? "--" : total.toLocaleString("en-US");
}
