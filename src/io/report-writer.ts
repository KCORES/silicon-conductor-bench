import {
  ARTIFACT_PURPOSES,
  type RunArtifactStore,
} from "./artifacts.js";
import { SIMULATION_RULES_VERSION } from "../replay/types.js";

export interface BenchmarkReport {
  readonly generatedAt: string;
  readonly identity: RunArtifactStore["identity"];
  readonly simulationRulesVersion: number;
  readonly summary: unknown;
}

export function writeBenchmarkReport(
  store: RunArtifactStore,
  summary: unknown,
  generatedAt = new Date().toISOString(),
): string {
  const report: BenchmarkReport = {
    generatedAt,
    identity: store.identity,
    simulationRulesVersion: SIMULATION_RULES_VERSION,
    summary,
  };
  return store.writeJson(ARTIFACT_PURPOSES.report, report);
}
