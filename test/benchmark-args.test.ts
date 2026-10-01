import { describe, expect, it } from "vitest";
import {
  BenchmarkArgsError,
  parseBenchmarkArgs,
  shouldUseBenchTui,
} from "../src/benchmark-args.js";

describe("benchmark seed argument", () => {
  it("lets --seed override the environment seed", () => {
    expect(parseBenchmarkArgs(["40", "--seed", "42"], 1)).toEqual({
      cycleCount: 40,
      seed: 42,
      plain: false,
      horizonTicks: null,
      resume: null,
      noRelease: false,
    });
    expect(parseBenchmarkArgs(["--seed", "7"], 1)).toEqual({
      cycleCount: 40,
      seed: 7,
      plain: false,
      horizonTicks: null,
      resume: null,
      noRelease: false,
    });
    expect(parseBenchmarkArgs(["--seed=-3", "12"], 1)).toEqual({
      cycleCount: 12,
      seed: -3,
      plain: false,
      horizonTicks: null,
      resume: null,
      noRelease: false,
    });
  });

  it("falls back to the environment seed or 1", () => {
    expect(parseBenchmarkArgs(["15"], 8)).toEqual({
      cycleCount: 15,
      seed: 8,
      plain: false,
      horizonTicks: null,
      resume: null,
      noRelease: false,
    });
    expect(parseBenchmarkArgs([])).toEqual({
      cycleCount: 40,
      seed: 1,
      plain: false,
      horizonTicks: null,
      resume: null,
      noRelease: false,
    });
  });

  it("turns the live view off for --plain and a non-TTY stdout", () => {
    expect(parseBenchmarkArgs(["--plain", "2"], 1)).toEqual({
      cycleCount: 2,
      seed: 1,
      plain: true,
      horizonTicks: null,
      resume: null,
      noRelease: false,
    });
    expect(parseBenchmarkArgs(["100", "--seed", "63916", "--no-release", "--plain"], 1)).toEqual({
      cycleCount: 100,
      seed: 63916,
      plain: true,
      horizonTicks: null,
      resume: null,
      noRelease: true,
    });
    expect(() => parseBenchmarkArgs(["--no-release", "--no-release"])).toThrow(
      BenchmarkArgsError,
    );
    expect(shouldUseBenchTui(false, true)).toBe(true);
    expect(shouldUseBenchTui(true, true)).toBe(false);
    expect(shouldUseBenchTui(false, false)).toBe(false);
    expect(() => parseBenchmarkArgs(["--plain", "--plain"])).toThrow(
      BenchmarkArgsError,
    );
  });

  it("parses a fixed tick horizon from --ticks or the environment", () => {
    expect(parseBenchmarkArgs(["--ticks", "400", "--seed", "5"], 1)).toMatchObject({
      cycleCount: 400,
      horizonTicks: 400,
      seed: 5,
    });
    expect(parseBenchmarkArgs(["--ticks=120", "30"], 1)).toMatchObject({
      cycleCount: 30,
      horizonTicks: 120,
    });
    expect(parseBenchmarkArgs([], 1, 400)).toMatchObject({
      cycleCount: 400,
      horizonTicks: 400,
    });
    expect(parseBenchmarkArgs(["25"], 1, 400)).toMatchObject({
      cycleCount: 25,
      horizonTicks: null,
    });
    expect(() => parseBenchmarkArgs(["--ticks", "0"])).toThrow(BenchmarkArgsError);
    expect(() => parseBenchmarkArgs(["--ticks", "5", "--ticks", "6"])).toThrow(
      BenchmarkArgsError,
    );
    expect(() =>
      parseBenchmarkArgs(["--resume", "logs/api-log.jsonl", "--ticks", "5"]),
    ).toThrow(BenchmarkArgsError);
  });

  it("rejects a missing, fractional, or repeated seed", () => {
    expect(() => parseBenchmarkArgs(["--seed"])).toThrow(BenchmarkArgsError);
    expect(() => parseBenchmarkArgs(["--seed", "1.5"])).toThrow(
      BenchmarkArgsError,
    );
    expect(() => parseBenchmarkArgs(["--seed", "abc"])).toThrow(
      BenchmarkArgsError,
    );
    expect(() => parseBenchmarkArgs(["40", "--seed", "1", "--seed", "2"])).toThrow(
      BenchmarkArgsError,
    );
    expect(() => parseBenchmarkArgs(["0"])).toThrow(BenchmarkArgsError);
    expect(() => parseBenchmarkArgs(["--cycles", "4"])).toThrow(
      BenchmarkArgsError,
    );
    expect(() => parseBenchmarkArgs(["--resume"])).toThrow(BenchmarkArgsError);
    expect(() => parseBenchmarkArgs(["--resume", "logs/api-log.jsonl", "10"])).toThrow(
      BenchmarkArgsError,
    );
    expect(() => parseBenchmarkArgs(["--resume", "logs/api-log.jsonl", "--seed", "1"])).toThrow(
      BenchmarkArgsError,
    );
  });
});
