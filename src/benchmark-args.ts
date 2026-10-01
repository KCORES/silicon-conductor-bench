export class BenchmarkArgsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BenchmarkArgsError";
  }
}

export interface BenchmarkArgs {
  readonly cycleCount: number;
  readonly horizonTicks: number | null;
  readonly seed: number;
  readonly plain: boolean;
  readonly resume: string | null;
  readonly noRelease: boolean;
}

const USAGE =
  "Usage: node dist/src/cli.js [cycles] [--ticks <integer>] [--seed <integer>] [--plain] [--no-release] [--resume <api-log>]";
const DEFAULT_CYCLES = 40;

export function parseBenchmarkArgs(
  args: readonly string[],
  envSeed = 1,
  envHorizonTicks = 0,
): BenchmarkArgs {
  if (!Number.isInteger(envSeed)) {
    throw new BenchmarkArgsError(
      `SIMULATION_SEED must be an integer.\n${USAGE}`,
    );
  }

  let cycleCount: number | undefined;
  let horizonTicks: number | undefined;
  let seed: number | undefined;
  let plain = false;
  let noRelease = false;
  let resume: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      continue;
    }
    if (arg === "--plain") {
      if (plain) {
        throw new BenchmarkArgsError(`--plain was provided more than once.\n${USAGE}`);
      }
      plain = true;
      continue;
    }
    if (arg === "--no-release") {
      if (noRelease) {
        throw new BenchmarkArgsError(
          `--no-release was provided more than once.\n${USAGE}`,
        );
      }
      noRelease = true;
      continue;
    }
    if (arg === "--resume" || arg.startsWith("--resume=")) {
      if (resume !== undefined) {
        throw new BenchmarkArgsError(`--resume was provided more than once.\n${USAGE}`);
      }
      const raw = arg === "--resume" ? args[index + 1] : arg.slice("--resume=".length);
      if (arg === "--resume") {
        index += 1;
      }
      if (raw === undefined || raw.trim().length === 0 || raw.startsWith("--")) {
        throw new BenchmarkArgsError(`--resume requires an API log path.\n${USAGE}`);
      }
      resume = raw;
      continue;
    }
    if (arg === "--seed" || arg.startsWith("--seed=")) {
      if (seed !== undefined) {
        throw new BenchmarkArgsError(`--seed was provided more than once.\n${USAGE}`);
      }
      const raw = arg === "--seed" ? args[index + 1] : arg.slice("--seed=".length);
      if (arg === "--seed") {
        index += 1;
      }
      seed = requireInteger(raw, "--seed");
      continue;
    }
    if (arg === "--ticks" || arg.startsWith("--ticks=")) {
      if (horizonTicks !== undefined) {
        throw new BenchmarkArgsError(`--ticks was provided more than once.\n${USAGE}`);
      }
      const raw = arg === "--ticks" ? args[index + 1] : arg.slice("--ticks=".length);
      if (arg === "--ticks") {
        index += 1;
      }
      horizonTicks = requireInteger(raw, "--ticks");
      if (horizonTicks < 1) {
        throw new BenchmarkArgsError(`--ticks must be a positive integer.\n${USAGE}`);
      }
      continue;
    }
    if (arg.startsWith("--")) {
      throw new BenchmarkArgsError(`Unknown argument: ${arg}\n${USAGE}`);
    }
    if (cycleCount !== undefined) {
      throw new BenchmarkArgsError(
        `Cycle count was provided more than once.\n${USAGE}`,
      );
    }
    cycleCount = requireInteger(arg, "Cycle count");
    if (cycleCount < 1) {
      throw new BenchmarkArgsError(
        `Cycle count must be a positive integer.\n${USAGE}`,
      );
    }
  }

  if (
    resume !== undefined &&
    (cycleCount !== undefined || seed !== undefined || horizonTicks !== undefined)
  ) {
    throw new BenchmarkArgsError(
      `--resume does not take a cycle count, --ticks or --seed.\n${USAGE}`,
    );
  }

  const horizon =
    horizonTicks ??
    (cycleCount === undefined && envHorizonTicks > 0 ? envHorizonTicks : null);
  return {
    cycleCount: cycleCount ?? horizon ?? DEFAULT_CYCLES,
    horizonTicks: horizon,
    seed: seed ?? envSeed,
    plain,
    resume: resume ?? null,
    noRelease,
  };
}

export function shouldUseBenchTui(plain: boolean, stdoutIsTTY: boolean): boolean {
  return !plain && stdoutIsTTY;
}

function requireInteger(raw: string | undefined, label: string): number {
  if (raw === undefined || !/^-?\d+$/.test(raw)) {
    throw new BenchmarkArgsError(`${label} must be an integer.\n${USAGE}`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new BenchmarkArgsError(`${label} must be an integer.\n${USAGE}`);
  }
  return value;
}
