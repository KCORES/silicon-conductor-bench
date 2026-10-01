import type { ReplayBundle, ReplayEvent } from "@replay/types.js";
import type { PlaybackState } from "@replay/playback.js";
import { currentLogicalTick } from "@replay/playback.js";
import type { PlaybackContext } from "@replay/playback.js";
import { summarizeReplayEvent } from "@replay/event-summary.js";
import { cumulativeTokens, formatTokenTotal } from "@replay/run-stats.js";
import { isDryRunPayload } from "../loadReplay.js";
import type { DebugSceneMode } from "../scene/TrafficScene.js";
import {
  DEMO_CATALOG,
  type DemoId,
} from "../demo/demoScenarios.js";
import type { DemoPhase } from "../demo/demoPlayback.js";
import type { TrafficLogicPrecision } from "../scene/trafficLogicGrid.js";

export interface HudCallbacks {
  onPlay(): void;
  onPause(): void;
  onSpeed(speed: number): void;
  onAutoPause(enabled: boolean): void;
  onScrubStart(): void;
  onScrub(tick: number): void;
  onScrubEnd(): void;
  onStep(direction: 1 | -1): void;
  onJumpDecision(direction: 1 | -1): void;
  onFile(file: File): void;
  onOpenRuns(): void;
  onScoreBubbles(enabled: boolean): void;
  onXRay(enabled: boolean): void;
  onXRayCellIds(enabled: boolean): void;
  onXRayVehicleIds(enabled: boolean): void;
  onXRayPedestrianIds(enabled: boolean): void;
  onToggleDemo(id: DemoId): void;
  onDebugCatalog(): void;
  onDebugRandomFleet(): void;
  onDebugReturn(): void;
}

export class CommandHud {
  private menuOpen = false;
  private debugMenuOpen = false;
  private displayMenuOpen = false;
  private demoAnimateMenuOpen = false;
  private debugMode: DebugSceneMode = "replay";

  constructor(
    private readonly root: HTMLElement,
    private readonly callbacks: HudCallbacks,
  ) {
    this.root.innerHTML = layout();
    this.bind();
  }

  render(
    bundle: ReplayBundle | undefined,
    state: PlaybackState,
    context: PlaybackContext | undefined,
    notice: string | undefined,
    debugMode: DebugSceneMode = "replay",
    activeDemoId: DemoId | null = null,
    demoPhase: DemoPhase = "inactive",
    xRayEnabled = false,
    xRayPrecision: TrafficLogicPrecision = "route-estimate",
    xRayCellIdsEnabled = false,
    xRayVehicleIdsEnabled = false,
    xRayPedestrianIdsEnabled = false,
  ): void {
    this.debugMode = debugMode;
    const tick = context === undefined ? 0 : currentLogicalTick(state, context);
    const event =
      context === undefined ? undefined : context.events[state.eventCursor];
    const cycle = [...(bundle?.cycles ?? [])]
      .reverse()
      .find((item) => tick >= item.decisionTick);
    const warmupTicks = bundle?.warmupTicks ?? 0;
    this.setText(
      "tick-readout",
      bundle === undefined ? "--" : (tick - warmupTicks).toFixed(1),
    );
    this.setText(
      "total-tick-readout",
      bundle === undefined ? "TOTAL --" : `TOTAL ${tick.toFixed(1)}`,
    );
    this.setText("cycle-readout", cycle === undefined ? "--" : String(cycle.cycle));
    const frameBalance = context?.frames[state.frameIndex]?.financialBalance;
    const balance =
      frameBalance !== undefined
        ? frameBalance
        : cycle?.financialBalance;
    this.setText(
      "balance-readout",
      balance === undefined ? "--" : balance.toFixed(2),
    );
    this.setText(
      "token-readout",
      formatTokenTotal(
        cumulativeTokens(bundle?.cycles ?? [], tick),
      ),
    );
    this.setText("speed-readout", `${state.speed.toFixed(2)}x`);
    this.setText(
      "model-readout",
      bundle === undefined ? "NO SIGNAL" : bundle.model,
    );
    const playButton = this.root.querySelector<HTMLButtonElement>("[data-play]");
    if (playButton !== null) {
      playButton.textContent = state.playing ? "PAUSE" : "PLAY";
      playButton.setAttribute("aria-pressed", String(state.playing));
    }
    this.root.querySelectorAll<HTMLButtonElement>("[data-speed]").forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(Number(button.dataset.speed) === state.speed),
      );
    });
    const autoPause = this.root.querySelector<HTMLInputElement>("[data-autopause]");
    if (autoPause !== null) {
      autoPause.checked = state.autoPauseOnDecision;
    }
    const xRay = this.root.querySelector<HTMLInputElement>("[data-display-xray]");
    if (xRay !== null) {
      xRay.checked = xRayEnabled;
    }
    const xRayCellIds = this.root.querySelector<HTMLInputElement>(
      "[data-display-xray-cell-ids]",
    );
    if (xRayCellIds !== null) {
      xRayCellIds.checked = xRayCellIdsEnabled;
      xRayCellIds.disabled = !xRayEnabled;
    }
    const xRayVehicleIds = this.root.querySelector<HTMLInputElement>(
      "[data-display-xray-vehicle-ids]",
    );
    if (xRayVehicleIds !== null) {
      xRayVehicleIds.checked = xRayVehicleIdsEnabled;
      xRayVehicleIds.disabled = !xRayEnabled;
    }
    const xRayPedestrianIds = this.root.querySelector<HTMLInputElement>(
      "[data-display-xray-pedestrian-ids]",
    );
    if (xRayPedestrianIds !== null) {
      xRayPedestrianIds.checked = xRayPedestrianIdsEnabled;
      xRayPedestrianIds.disabled = !xRayEnabled;
    }
    this.setText(
      "xray-precision",
      xRayPrecision === "reservation" ? "RESERVATION" : "ROUTE ESTIMATE",
    );
    this.root
      .querySelector<HTMLElement>("[data-xray-legend]")
      ?.setAttribute("data-active", String(xRayEnabled));
    const debugVehicles =
      this.root.querySelector<HTMLButtonElement>("[data-debug-show-all-vehicles]");
    if (debugVehicles !== null) {
      debugVehicles.setAttribute("aria-pressed", String(debugMode === "catalog"));
    }
    const randomFleet =
      this.root.querySelector<HTMLButtonElement>("[data-debug-random-fleet]");
    if (randomFleet !== null) {
      randomFleet.textContent =
        debugMode === "randomFleet"
          ? "REGENERATE RANDOM COLORS"
          : "FILL RANDOM COLOR VEHICLES";
      randomFleet.setAttribute(
        "aria-pressed",
        String(debugMode === "randomFleet"),
      );
    }
    const returnButton =
      this.root.querySelector<HTMLButtonElement>("[data-debug-return-replay]");
    if (returnButton !== null) {
      returnButton.disabled = debugMode === "replay";
    }
    this.root
      .querySelectorAll<HTMLButtonElement>("[data-demo-id]")
      .forEach((button) => {
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.demoId === activeDemoId),
        );
      });
    const activeDemo = DEMO_CATALOG.find((item) => item.id === activeDemoId);
    this.setText(
      "demo-status",
      activeDemo === undefined
        ? "NO DEMO SELECTED"
        : `ACTIVE · ${activeDemo.title} · ${demoPhase.toUpperCase()}`,
    );
    this.root
      .querySelectorAll<HTMLButtonElement>("[data-playback-control]")
      .forEach((button) => {
        button.disabled = debugMode !== "replay" || activeDemoId !== null;
      });
    const slider = this.root.querySelector<HTMLInputElement>("[data-scrub]");
    if (slider !== null) {
      slider.disabled = debugMode !== "replay" || activeDemoId !== null;
    }
    if (
      slider !== null &&
      bundle !== undefined &&
      document.activeElement !== slider
    ) {
      slider.dataset.syncing = "1";
      slider.max = String(bundle.totalTicks);
      const nextValue = String(Math.round(tick));
      if (slider.value !== nextValue) {
        slider.value = nextValue;
      }
      delete slider.dataset.syncing;
    }
    this.renderObservation(cycle?.observation.stoplineCandidates ?? []);
    this.renderPressure(cycle?.observation.lanePressureSignals ?? []);
    this.renderEvent(event, cycle?.tacticalSummary);
    this.setText("notice", notice ?? "");
    this.root.classList.toggle("has-notice", Boolean(notice));
  }

  private renderObservation(
    candidates: readonly { vehicleId: string; routeId: string; waitingTicks: number }[],
  ): void {
    const body = this.root.querySelector("[data-candidates]");
    if (body === null) {
      return;
    }
    body.innerHTML =
      candidates.length === 0
        ? `<li class="empty">No stopline candidates</li>`
        : candidates
            .slice(0, 8)
            .map(
              (item) =>
                `<li><span>${item.vehicleId}</span><em>${item.routeId}</em><b>${item.waitingTicks}t</b></li>`,
            )
            .join("");
  }

  private renderPressure(
    signals: readonly { laneId: string; capacityOccupancy: number; queuedVehicles: number }[],
  ): void {
    const body = this.root.querySelector("[data-pressure]");
    if (body === null) {
      return;
    }
    body.innerHTML =
      signals.length === 0
        ? `<li class="empty">Quiet approaches</li>`
        : signals
            .slice(0, 6)
            .map((item) => {
              const pct = Math.round(item.capacityOccupancy * 100);
              return `<li><span>${item.laneId}</span><div class="bar"><i style="width:${pct}%"></i></div><b>${item.queuedVehicles}</b></li>`;
            })
            .join("");
  }

  private renderEvent(event: ReplayEvent | undefined, summary?: string): void {
    const log = this.root.querySelector("[data-event-log]");
    const summaryNode = this.root.querySelector("[data-summary]");
    if (summaryNode !== null) {
      summaryNode.textContent = summary ?? "Waiting for a commit_schedule.";
    }
    if (log === null) {
      return;
    }
    if (event === undefined) {
      log.innerHTML = `<p class="empty">Clock is advancing. No agent event at this cursor.</p>`;
      return;
    }
    const eventSummary = summarizeReplayEvent(event);
    if (eventSummary !== undefined) {
      log.innerHTML = `<p><b>${event.kind}</b></p><p>${escapeHtml(eventSummary)}</p>`;
      return;
    }
    if (event.kind === "DRY_RUN_ADMIT" && isDryRunPayload(event.payload)) {
      const conflict = event.payload.conflict;
      log.innerHTML = `
        <p><b>dry_run_admit</b> ${event.payload.feasible ? "FEASIBLE" : "CONFLICT"}</p>
        <p>${
          event.payload.candidates
            .map((item) =>
              item.enterTickOffset === undefined
                ? item.vehicleId
                : `${item.vehicleId}@+${item.enterTickOffset}`,
            )
            .join(", ") || "no candidates"
        }</p>
        ${
          conflict === undefined
            ? ""
            : `<p class="warn">${conflict.conflictResourceId} vs ${conflict.conflictingVehicleIds.join(", ")}</p>`
        }
      `;
      return;
    }
    log.innerHTML = `<p><b>${event.kind}</b></p><pre>${escapeHtml(JSON.stringify(event.payload, null, 2)).slice(0, 800)}</pre>`;
  }

  private bind(): void {
    const menuShell = this.root.querySelector<HTMLElement>("[data-menu-shell]");
    this.root.querySelector("[data-menu-toggle]")?.addEventListener("click", () => {
      this.menuOpen = !this.menuOpen;
      if (!this.menuOpen) {
        this.debugMenuOpen = false;
        this.displayMenuOpen = false;
        this.demoAnimateMenuOpen = false;
      }
      this.syncMenu();
    });
    this.root.querySelector("[data-menu-display]")?.addEventListener("click", () => {
      this.debugMenuOpen = false;
      this.demoAnimateMenuOpen = false;
      this.displayMenuOpen = true;
      this.syncMenu();
    });
    this.root.querySelector("[data-menu-debug]")?.addEventListener("click", () => {
      this.displayMenuOpen = false;
      this.demoAnimateMenuOpen = false;
      this.debugMenuOpen = true;
      this.syncMenu();
    });
    this.root
      .querySelector("[data-menu-demo-animate]")
      ?.addEventListener("click", () => {
        this.displayMenuOpen = false;
        this.debugMenuOpen = false;
        this.demoAnimateMenuOpen = true;
        this.syncMenu();
      });
    this.root.querySelectorAll("[data-menu-back]").forEach((button) => {
      button.addEventListener("click", () => {
        this.debugMenuOpen = false;
        this.displayMenuOpen = false;
        this.demoAnimateMenuOpen = false;
        this.syncMenu();
      });
    });
    this.root
      .querySelector<HTMLInputElement>("[data-display-score-bubbles]")
      ?.addEventListener("change", (event) => {
        const target = event.currentTarget as HTMLInputElement;
        this.callbacks.onScoreBubbles(target.checked);
      });
    this.root
      .querySelector<HTMLInputElement>("[data-display-xray]")
      ?.addEventListener("change", (event) => {
        const target = event.currentTarget as HTMLInputElement;
        this.callbacks.onXRay(target.checked);
      });
    this.root
      .querySelector<HTMLInputElement>("[data-display-xray-cell-ids]")
      ?.addEventListener("change", (event) => {
        const target = event.currentTarget as HTMLInputElement;
        this.callbacks.onXRayCellIds(target.checked);
      });
    this.root
      .querySelector<HTMLInputElement>("[data-display-xray-vehicle-ids]")
      ?.addEventListener("change", (event) => {
        const target = event.currentTarget as HTMLInputElement;
        this.callbacks.onXRayVehicleIds(target.checked);
      });
    this.root
      .querySelector<HTMLInputElement>("[data-display-xray-pedestrian-ids]")
      ?.addEventListener("change", (event) => {
        const target = event.currentTarget as HTMLInputElement;
        this.callbacks.onXRayPedestrianIds(target.checked);
      });
    this.root
      .querySelectorAll<HTMLButtonElement>("[data-demo-id]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const descriptor = DEMO_CATALOG.find(
            (item) => item.id === button.dataset.demoId,
          );
          if (descriptor !== undefined) {
            button.blur();
            this.callbacks.onToggleDemo(descriptor.id);
          }
        });
      });
    this.root
      .querySelector("[data-debug-show-all-vehicles]")
      ?.addEventListener("click", () => {
        this.callbacks.onDebugCatalog();
      });
    this.root
      .querySelector("[data-debug-random-fleet]")
      ?.addEventListener("click", () => {
        this.callbacks.onDebugRandomFleet();
      });
    this.root
      .querySelector("[data-debug-return-replay]")
      ?.addEventListener("click", () => {
        if (this.debugMode !== "replay") {
          this.callbacks.onDebugReturn();
        }
      });
    document.addEventListener("pointerdown", (event) => {
      if (
        this.menuOpen &&
        event.target instanceof Node &&
        !menuShell?.contains(event.target)
      ) {
        this.closeMenu();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.menuOpen) {
        this.closeMenu();
      }
    });
    this.root.querySelector("[data-play]")?.addEventListener("click", () => {
      const playing = this.root.querySelector("[data-play]")?.textContent === "PAUSE";
      if (playing) {
        this.callbacks.onPause();
      } else {
        this.callbacks.onPlay();
      }
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-speed]").forEach((button) => {
      button.addEventListener("click", () => {
        this.callbacks.onSpeed(Number(button.dataset.speed));
      });
    });
    this.root
      .querySelector<HTMLInputElement>("[data-autopause]")
      ?.addEventListener("change", (event) => {
        const target = event.currentTarget as HTMLInputElement;
        this.callbacks.onAutoPause(target.checked);
      });
    const slider = this.root.querySelector<HTMLInputElement>("[data-scrub]");
    slider?.addEventListener("pointerdown", () => this.callbacks.onScrubStart());
    slider?.addEventListener("input", () => {
      if (slider.dataset.syncing === "1") {
        return;
      }
      this.callbacks.onScrub(Number(slider.value));
    });
    slider?.addEventListener("pointerup", () => this.callbacks.onScrubEnd());
    slider?.addEventListener("change", () => this.callbacks.onScrubEnd());
    this.root.querySelector("[data-step-back]")?.addEventListener("click", () => {
      this.callbacks.onStep(-1);
    });
    this.root.querySelector("[data-step-fwd]")?.addEventListener("click", () => {
      this.callbacks.onStep(1);
    });
    this.root.querySelector("[data-prev-decision]")?.addEventListener("click", () => {
      this.callbacks.onJumpDecision(-1);
    });
    this.root.querySelector("[data-next-decision]")?.addEventListener("click", () => {
      this.callbacks.onJumpDecision(1);
    });
    this.root
      .querySelector<HTMLInputElement>("[data-file]")
      ?.addEventListener("change", (event) => {
        const input = event.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        if (file !== undefined) {
          this.callbacks.onFile(file);
          input.value = "";
          this.closeMenu();
        }
      });
    this.root.querySelector("[data-open-runs]")?.addEventListener("click", () => {
      this.closeMenu();
      this.callbacks.onOpenRuns();
    });
    document.addEventListener("dragover", (event) => event.preventDefault());
    document.addEventListener("drop", (event) => {
      event.preventDefault();
      const file = event.dataTransfer?.files[0];
      if (file !== undefined) {
        this.callbacks.onFile(file);
      }
    });
    this.syncMenu();
  }

  private closeMenu(): void {
    this.menuOpen = false;
    this.debugMenuOpen = false;
    this.displayMenuOpen = false;
    this.demoAnimateMenuOpen = false;
    this.syncMenu();
  }

  private syncMenu(): void {
    const toggle = this.root.querySelector<HTMLButtonElement>("[data-menu-toggle]");
    const popover = this.root.querySelector<HTMLElement>("[data-menu-popover]");
    const primary = this.root.querySelector<HTMLElement>("[data-menu-primary]");
    const debug = this.root.querySelector<HTMLElement>("[data-menu-debug-panel]");
    const display = this.root.querySelector<HTMLElement>(
      "[data-menu-display-panel]",
    );
    const demoAnimate = this.root.querySelector<HTMLElement>(
      "[data-menu-demo-animate-panel]",
    );
    toggle?.setAttribute("aria-expanded", String(this.menuOpen));
    if (popover !== null) {
      popover.hidden = !this.menuOpen;
    }
    if (primary !== null) {
      primary.hidden =
        this.debugMenuOpen ||
        this.displayMenuOpen ||
        this.demoAnimateMenuOpen;
    }
    if (debug !== null) {
      debug.hidden = !this.debugMenuOpen;
    }
    if (display !== null) {
      display.hidden = !this.displayMenuOpen;
    }
    if (demoAnimate !== null) {
      demoAnimate.hidden = !this.demoAnimateMenuOpen;
    }
  }

  private setText(id: string, value: string): void {
    const node = this.root.querySelector(`[data-${id}]`);
    if (node !== null) {
      node.textContent = value;
    }
  }
}

function layout(): string {
  return `
    <header class="mast">
      <h1>SILICON CONDUCTOR BENCH</h1>
      <div class="mast-badge">
        <p class="mast-model" data-model-readout>NO SIGNAL</p>
        <div class="mast-stats">
          <div class="tick-stat">
            <label>TICK</label>
            <strong data-tick-readout title="Effective tick, warmup excluded">--</strong>
            <small data-total-tick-readout>TOTAL --</small>
          </div>
          <div><label>CYCLE</label><strong data-cycle-readout>--</strong></div>
          <div><label>BALANCE</label><strong data-balance-readout>--</strong></div>
          <div><label>TOKENS</label><strong data-token-readout>--</strong></div>
        </div>
      </div>
    </header>
    <div class="menu-shell" data-menu-shell>
      <div class="menu-popover" data-menu-popover hidden>
        <div class="menu-panel" data-menu-primary>
          <p class="menu-heading">COMMAND MENU</p>
          <p class="speed-line"><label>SPEED</label> <strong data-speed-readout>1.00x</strong></p>
          <input data-scrub type="range" min="0" max="1" value="0" />
          <p class="notice" data-notice></p>
          <label class="menu-action file-pill">
            LOAD REPLAY
            <input data-file type="file" accept="application/json,.json" />
          </label>
          <button type="button" class="menu-action" data-open-runs>运行列表</button>
          <div class="menu-grid decisions">
            <button type="button" data-playback-control data-prev-decision>PREV DECISION</button>
            <button type="button" data-playback-control data-next-decision>NEXT DECISION</button>
          </div>
          <div class="menu-grid transport-buttons">
            <button type="button" data-playback-control data-step-back>−TICK</button>
            <button type="button" class="primary" data-playback-control data-play>PLAY</button>
            <button type="button" data-playback-control data-step-fwd>+TICK</button>
          </div>
          <div class="menu-grid speed-buttons">
            <button type="button" data-playback-control data-speed="0.5">0.5x</button>
            <button type="button" data-playback-control data-speed="1">1x</button>
            <button type="button" data-playback-control data-speed="2">2x</button>
            <button type="button" data-playback-control data-speed="4">4x</button>
          </div>
          <section class="menu-section">
            <h2>Stopline</h2>
            <ul data-candidates></ul>
          </section>
          <section class="menu-section">
            <h2>Lane pressure</h2>
            <ul data-pressure></ul>
          </section>
          <section class="menu-section">
            <h2>Tactical summary</h2>
            <p class="summary" data-summary></p>
          </section>
          <section class="menu-section">
            <h2>Agent stream</h2>
            <div class="log" data-event-log></div>
          </section>
          <button type="button" class="menu-nav" data-menu-display>
            DISPLAY <span aria-hidden="true">→</span>
          </button>
          <button type="button" class="menu-nav" data-menu-debug>
            DEBUG <span aria-hidden="true">→</span>
          </button>
          <button type="button" class="menu-nav" data-menu-demo-animate>
            DEMO ANIMATE <span aria-hidden="true">→</span>
          </button>
        </div>
        <div class="menu-panel" data-menu-display-panel hidden>
          <button type="button" class="menu-nav menu-back" data-menu-back>
            <span aria-hidden="true">←</span> COMMAND MENU
          </button>
          <p class="menu-heading">DISPLAY</p>
          <label class="toggle display-toggle">
            <input type="checkbox" data-display-score-bubbles checked>
            分数气泡
          </label>
          <label class="toggle display-toggle">
            <input type="checkbox" data-display-xray>
            X-RAY TRAFFIC LOGIC
          </label>
          <label class="toggle display-toggle xray-secondary-toggle">
            <input type="checkbox" data-display-xray-cell-ids disabled>
            显示格子 ID
          </label>
          <label class="toggle display-toggle xray-secondary-toggle">
            <input type="checkbox" data-display-xray-vehicle-ids disabled>
            显示汽车 ID
          </label>
          <label class="toggle display-toggle xray-secondary-toggle">
            <input type="checkbox" data-display-xray-pedestrian-ids disabled>
            显示行人 ID
          </label>
          <p class="xray-id-hint">道路/人行道：x:z · CW：斑马线 · E：入口 · W：旧等待区</p>
          <section class="traffic-logic-legend" data-xray-legend data-active="false">
            <p>GRID SOURCE <strong data-xray-precision>ROUTE ESTIMATE</strong></p>
            <ul>
              <li><i data-grid-kind="idle"></i>判定格</li>
              <li><i data-grid-kind="predicted"></i>AI 预估预约</li>
              <li><i data-grid-kind="actual"></i>已提交 / 实际轨迹</li>
              <li><i data-grid-kind="overlap"></i>预估与实际重合</li>
              <li><i data-grid-kind="occupied"></i>当前实体占用</li>
            </ul>
          </section>
        </div>
        <div class="menu-panel" data-menu-debug-panel hidden>
          <button type="button" class="menu-nav menu-back" data-menu-back>
            <span aria-hidden="true">←</span> COMMAND MENU
          </button>
          <p class="menu-heading">DEBUG</p>
          <button type="button" data-debug-show-all-vehicles>
            SHOW ALL VEHICLES
          </button>
          <button type="button" data-debug-random-fleet>
            FILL RANDOM COLOR VEHICLES
          </button>
          <button type="button" data-debug-return-replay disabled>
            RETURN TO REPLAY
          </button>
        </div>
        <div class="menu-panel" data-menu-demo-animate-panel hidden>
          <button type="button" class="menu-nav menu-back" data-menu-back>
            <span aria-hidden="true">←</span> COMMAND MENU
          </button>
          <p class="menu-heading">DEMO ANIMATE</p>
          <p class="demo-status" data-demo-status>NO DEMO SELECTED</p>
          <p class="demo-help">CLICK TO SELECT · SPACE TO PLAY / PAUSE</p>
          ${DEMO_CATALOG.map(
            (demo) => `
              <button type="button" data-demo-id="${demo.id}" aria-pressed="false">
                ${demo.title}
              </button>
            `,
          ).join("")}
        </div>
      </div>
      <button
        type="button"
        class="menu-toggle"
        data-menu-toggle
        aria-expanded="false"
        aria-haspopup="true"
      >
        MENU
      </button>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
