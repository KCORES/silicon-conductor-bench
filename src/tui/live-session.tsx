import { render } from "ink";
import { BenchLiveView } from "./BenchLiveView.js";
import { formatBenchTrace } from "./format-trace.js";
import type { BenchRadar } from "./radar.js";

export const BENCH_FRAME_DELAY_MS = 80;
const LOG_LIMIT = 4;

export type BenchPhase = "thinking" | "advancing";

export interface BenchStatus {
  readonly map: string;
  readonly cycle: number;
  readonly cycleCount: number;
  readonly tick: number;
  readonly seed: number;
  readonly balance: number;
  readonly phase: BenchPhase;
  readonly tacticalSummary: string;
  readonly interruptReason: string;
  readonly radar: BenchRadar;
  readonly startedAtMs: number;
  readonly completedCycles: number;
  readonly completedAtMs: number;
}

export interface BenchFrame extends BenchStatus {
  readonly logs: readonly string[];
  readonly elapsedMs: number;
  readonly estimatedRemainingMs: number | null;
}

export interface BenchLiveSession {
  update(status: BenchStatus): void;
  pushLog(line: string): void;
  unmount(): void;
}

export function mountBenchLiveView(status: BenchStatus): BenchLiveSession {
  const logs: string[] = [];
  let current = status;
  const app = render(<BenchLiveView frame={frameOf(current, logs)} />, {
    exitOnCtrlC: false,
    patchConsole: false,
  });

  const paint = (): void => {
    app.rerender(<BenchLiveView frame={frameOf(current, logs)} />);
  };
  const timer = setInterval(paint, 1_000);
  timer.unref();

  return {
    update(next) {
      current = next;
      paint();
    },
    pushLog(line) {
      const compact = formatBenchTrace(line);
      if (compact.length === 0) {
        return;
      }
      logs.push(compact);
      while (logs.length > LOG_LIMIT) {
        logs.shift();
      }
      paint();
    },
    unmount() {
      clearInterval(timer);
      app.unmount();
    },
  };
}

export function waitForBenchFrame(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, BENCH_FRAME_DELAY_MS);
  });
}

function frameOf(status: BenchStatus, logs: readonly string[]): BenchFrame {
  const timing = benchTiming(status, Date.now());
  return { ...status, ...timing, logs: [...logs] };
}

export function benchTiming(
  status: Pick<
    BenchStatus,
    "startedAtMs" | "completedCycles" | "completedAtMs" | "cycleCount"
  >,
  nowMs: number,
): { readonly elapsedMs: number; readonly estimatedRemainingMs: number | null } {
  const elapsedMs = Math.max(0, nowMs - status.startedAtMs);
  if (status.completedCycles <= 0) {
    return { elapsedMs, estimatedRemainingMs: null };
  }
  const completedDuration = Math.max(
    0,
    status.completedAtMs - status.startedAtMs,
  );
  const averageCycleMs = completedDuration / status.completedCycles;
  const remainingCycles = Math.max(
    0,
    status.cycleCount - status.completedCycles,
  );
  const estimatedEndMs =
    status.completedAtMs + averageCycleMs * remainingCycles;
  return {
    elapsedMs,
    estimatedRemainingMs: Math.max(0, estimatedEndMs - nowMs),
  };
}
