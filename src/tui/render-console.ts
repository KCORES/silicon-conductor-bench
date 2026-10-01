import type { BenchPhase } from "./live-session.js";
import type { BenchRadar } from "./radar.js";
import { shortLane } from "./radar.js";

export const SIDEBAR_ROWS = 24;
export const SIDEBAR_WIDTH = 70;

export type SidebarRow =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "phase"; readonly thinking: boolean };

export interface ConsoleInput {
  readonly cycle: number;
  readonly cycleCount: number;
  readonly tick: number;
  readonly seed: number;
  readonly balance: number;
  readonly phase: BenchPhase;
  readonly tacticalSummary: string;
  readonly interruptReason: string;
  readonly radar: BenchRadar;
  readonly elapsedMs: number;
  readonly estimatedRemainingMs: number | null;
}

export function sidebarRows(input: ConsoleInput): SidebarRow[] {
  const rows: SidebarRow[] = [
    {
      kind: "text",
      text: fit(
        `cycle ${input.cycle}/${input.cycleCount}  tick ${input.tick}  seed ${input.seed}`,
      ),
    },
    { kind: "text", text: fit(`balance ${input.balance.toFixed(2)}`) },
    {
      kind: "text",
      text: fit(
        `elapsed ${formatDuration(input.elapsedMs)}  eta ${
          input.estimatedRemainingMs === null
            ? "calculating"
            : formatDuration(input.estimatedRemainingMs)
        }`,
      ),
    },
    { kind: "phase", thinking: input.phase === "thinking" },
    { kind: "text", text: fit(`summary ${clip(input.tacticalSummary, 58)}`) },
    { kind: "text", text: fit(`interrupt ${clip(input.interruptReason, 56)}`) },
    { kind: "text", text: "RADAR" },
    ...radarRows(input.radar).map((text) => ({ kind: "text" as const, text: fit(text) })),
    { kind: "text", text: "LANES" },
    ...laneRows(input.radar).map((text) => ({ kind: "text" as const, text: fit(text) })),
    { kind: "text", text: "MEMORY" },
    { kind: "text", text: fit(memoryLine(input.radar)) },
  ];
  while (rows.length < SIDEBAR_ROWS) {
    rows.push({ kind: "text", text: " " });
  }
  return rows.slice(0, SIDEBAR_ROWS);
}

function radarRows(radar: BenchRadar): string[] {
  const lines = [
    ...radar.emergency,
    ...radar.stalls,
    ...radar.exits,
    ...radar.crosswalks,
    ...radar.upstream,
  ];
  if (lines.length === 0) {
    return ["none", " ", " ", " ", " ", " "];
  }
  const shown = lines.slice(0, 5);
  const extra = lines.length - shown.length;
  while (shown.length < 5) {
    shown.push(" ");
  }
  shown.push(extra > 0 ? `+${extra} more` : " ");
  return shown;
}

function laneRows(radar: BenchRadar): string[] {
  const left = radar.lanes.slice(0, 8);
  const right = radar.lanes.slice(8, 16);
  const rows: string[] = [];
  for (let index = 0; index < 8; index += 1) {
    const west = left[index];
    const east = right[index];
    rows.push(
      `${west === undefined ? "" : formatLane(west)}  ${east === undefined ? "" : formatLane(east)}`,
    );
  }
  return rows;
}

function formatLane(lane: BenchRadar["lanes"][number]): string {
  const bar = "=".repeat(Math.min(lane.depth, 8)).padEnd(8, ".");
  return `${shortLane(lane.laneId).padEnd(5, " ")} ${bar} ${String(lane.depth).padStart(2, " ")}`;
}

function memoryLine(radar: BenchRadar): string {
  const memory = radar.memory;
  if (memory === null) {
    return "-";
  }
  const state = memory.isExpired ? "expired" : "active";
  return `${memory.phaseName} -> ${memory.targetTick} ${state} depth ${memory.depth}`;
}

function clip(value: string, limit: number): string {
  if (value.length === 0) {
    return "-";
  }
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}

function fit(value: string): string {
  if (value.length === 0) {
    return " ";
  }
  return value.length <= SIDEBAR_WIDTH ? value : `${value.slice(0, SIDEBAR_WIDTH - 1)}…`;
}

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}
