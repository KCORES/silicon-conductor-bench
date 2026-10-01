import {
  ARTIFACT_PURPOSES,
  type RunArtifactStore,
} from "../io/artifacts.js";

export interface WorkingMemoryPlanInput {
  readonly phaseName: string;
  readonly intendedDuration: number;
  readonly resumeCondition?: string;
}

export interface WorkingMemoryPlan extends WorkingMemoryPlanInput {
  readonly savedAtTick: number;
  readonly targetTick: number;
}

export type WorkingMemoryAction = "SAVE_PLAN" | "PEEK_PLAN" | "POP_PLAN" | "CLEAR";

export interface WorkingMemoryResult {
  readonly action: WorkingMemoryAction;
  readonly depth: number;
  readonly plan: WorkingMemoryPlan | null;
}

export interface WorkingMemorySnapshot {
  readonly updatedAt: string;
  readonly tick: number;
  readonly depth: number;
  readonly lastAction: WorkingMemoryAction | null;
  readonly plans: readonly WorkingMemoryPlan[];
}

export interface WorkingMemoryOptions {
  readonly persist?: (snapshot: WorkingMemorySnapshot) => void;
}

export class WorkingMemoryStack {
  private readonly plans: WorkingMemoryPlan[] = [];
  private readonly persist: ((snapshot: WorkingMemorySnapshot) => void) | undefined;
  private lastTick = 0;

  constructor(
    private readonly maxDepth = 8,
    options: WorkingMemoryOptions = {},
  ) {
    if (!Number.isInteger(maxDepth) || maxDepth < 1) {
      throw new Error("Working memory depth must be a positive integer");
    }
    this.persist = options.persist;
  }

  get depth(): number {
    return this.plans.length;
  }

  save(input: WorkingMemoryPlanInput, currentTick: number): WorkingMemoryResult {
    if (this.plans.length >= this.maxDepth) {
      throw new Error(`Working memory is full at ${this.maxDepth} plans`);
    }
    const plan: WorkingMemoryPlan = {
      ...input,
      savedAtTick: currentTick,
      targetTick: currentTick + input.intendedDuration,
    };
    this.plans.push(plan);
    return this.finish("SAVE_PLAN", currentTick, plan);
  }

  peek(): WorkingMemoryResult {
    return {
      action: "PEEK_PLAN",
      depth: this.depth,
      plan: this.plans.at(-1) ?? null,
    };
  }

  pop(): WorkingMemoryResult {
    return this.finish("POP_PLAN", this.lastTick, this.plans.pop() ?? null);
  }

  clear(): WorkingMemoryResult {
    const previousTop = this.plans.at(-1) ?? null;
    this.plans.length = 0;
    return this.finish("CLEAR", this.lastTick, previousTop);
  }

  snapshot(
    lastAction: WorkingMemoryAction | null = null,
    tick = this.lastTick,
  ): WorkingMemorySnapshot {
    return {
      updatedAt: new Date().toISOString(),
      tick,
      depth: this.depth,
      lastAction,
      plans: [...this.plans],
    };
  }

  restore(snapshot: WorkingMemorySnapshot): void {
    this.plans.length = 0;
    this.plans.push(...snapshot.plans);
    this.lastTick = snapshot.tick;
    this.persist?.(this.snapshot(snapshot.lastAction, snapshot.tick));
  }

  private finish(
    action: WorkingMemoryAction,
    tick: number,
    plan: WorkingMemoryPlan | null,
  ): WorkingMemoryResult {
    this.lastTick = tick;
    this.persist?.(this.snapshot(action, tick));
    return { action, depth: this.depth, plan };
  }
}

export function persistWorkingMemoryToStore(
  store: RunArtifactStore,
): (snapshot: WorkingMemorySnapshot) => void {
  return (snapshot) => {
    store.writeJson(ARTIFACT_PURPOSES.workingMemory, {
      identity: store.identity,
      ...snapshot,
    });
  };
}
