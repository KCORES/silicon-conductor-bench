import { violationForfeitsToll } from "../core/drivers.js";
import type { VehicleState, VehicleType, VehicleViolation } from "../core/types.js";
import type { ReplayScorePhase } from "./types.js";

export interface VehicleScore {
  readonly score: number;
  readonly scorePhase: ReplayScorePhase;
}

export interface LedgerVehicle {
  readonly id: string;
  readonly type: VehicleType;
  readonly state: VehicleState;
  readonly violation?: VehicleViolation;
}

interface LedgerEntry {
  score: number;
  settled: boolean;
}

export class VehicleLedger {
  private readonly entries = new Map<string, LedgerEntry>();

  applyCharges(
    charges: readonly { readonly vehicleId: string; readonly amount: number }[],
  ): void {
    for (const charge of charges) {
      if (!(charge.amount > 0)) {
        continue;
      }
      const entry = this.entry(charge.vehicleId);
      if (entry.settled) {
        continue;
      }
      entry.score -= charge.amount;
    }
  }

  settleOutbound(
    vehicles: Iterable<LedgerVehicle>,
    tollFor: (type: VehicleType) => number,
  ): void {
    for (const vehicle of vehicles) {
      if (vehicle.state !== "OUTBOUND") {
        continue;
      }
      const entry = this.entries.get(vehicle.id);
      if (entry === undefined || entry.settled) {
        continue;
      }
      this.settleActors(
        [vehicle.id],
        violationForfeitsToll(vehicle.violation) ? 0 : tollFor(vehicle.type),
      );
    }
  }

  settleActors(actorIds: Iterable<string>, reward = 0): void {
    for (const actorId of actorIds) {
      const entry = this.entries.get(actorId);
      if (entry === undefined || entry.settled) {
        continue;
      }
      entry.score += reward;
      entry.settled = true;
    }
  }

  scoreFor(vehicleId: string): VehicleScore | undefined {
    const entry = this.entries.get(vehicleId);
    if (entry === undefined) {
      return undefined;
    }
    return {
      score: entry.score,
      scorePhase: entry.settled ? "settled" : "charging",
    };
  }

  scores(): ReadonlyMap<string, VehicleScore> {
    const snapshot = new Map<string, VehicleScore>();
    for (const id of this.entries.keys()) {
      const score = this.scoreFor(id);
      if (score !== undefined) {
        snapshot.set(id, score);
      }
    }
    return snapshot;
  }

  exportEntries(): readonly { id: string; score: number; settled: boolean }[] {
    return [...this.entries.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([id, entry]) => ({
        id,
        score: entry.score,
        settled: entry.settled,
      }));
  }

  restoreEntries(
    entries: readonly { id: string; score: number; settled: boolean }[],
  ): void {
    this.entries.clear();
    for (const entry of entries) {
      this.entries.set(entry.id, {
        score: entry.score,
        settled: entry.settled,
      });
    }
  }

  private entry(vehicleId: string): LedgerEntry {
    const existing = this.entries.get(vehicleId);
    if (existing !== undefined) {
      return existing;
    }
    const created = { score: 0, settled: false };
    this.entries.set(vehicleId, created);
    return created;
  }
}
