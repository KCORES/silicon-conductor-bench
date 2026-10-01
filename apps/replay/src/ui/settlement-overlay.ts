import type {
  RunSettlement,
  SettlementVehicleGroup,
} from "@replay/run-settlement.js";
import { VehicleThumbnailRenderer } from "../scene/vehicleThumbnailRenderer.js";

export interface SettlementOverlayCallbacks {
  onReplay(): void;
  onClose(): void;
}

export class SettlementOverlay {
  private readonly thumbnails = new VehicleThumbnailRenderer();
  private openPanel = false;
  private renderVersion = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly callbacks: SettlementOverlayCallbacks,
  ) {
    this.root.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest("[data-settlement-replay]") !== null) {
        this.callbacks.onReplay();
      } else if (target.closest("[data-settlement-close]") !== null) {
        this.callbacks.onClose();
      }
    });
    document.addEventListener("keydown", (event) => this.handleKeydown(event));
  }

  get isOpen(): boolean {
    return this.openPanel;
  }

  open(summary: RunSettlement): void {
    this.openPanel = true;
    this.renderVersion += 1;
    const version = this.renderVersion;
    this.root.hidden = false;
    this.root.innerHTML = settlementHtml(summary);
    this.root
      .querySelector<HTMLElement>("[data-settlement-dialog]")
      ?.focus();
    void this.loadThumbnails(summary, version);
  }

  close(): void {
    this.openPanel = false;
    this.renderVersion += 1;
    this.root.hidden = true;
    this.root.replaceChildren();
  }

  dispose(): void {
    this.close();
    this.thumbnails.dispose();
  }

  private async loadThumbnails(
    summary: RunSettlement,
    version: number,
  ): Promise<void> {
    const types = new Set(
      [
        ...summary.admittedGroups,
        ...summary.completedGroups,
        ...summary.towedGroups,
        ...summary.reroutedGroups,
        ...summary.accidentVehicleGroups,
      ].map((group) => group.type),
    );
    await Promise.all(
      [...types].map(async (type) => {
        try {
          const src = await this.thumbnails.renderType(type);
          if (!this.openPanel || version !== this.renderVersion) {
            return;
          }
          this.root
            .querySelectorAll<HTMLImageElement>(
              `[data-vehicle-thumbnail="${cssEscape(String(type))}"]`,
            )
            .forEach((image) => {
              image.src = src;
              image.dataset.loaded = "true";
            });
        } catch {
          // The row keeps its CSS fallback silhouette.
        }
      }),
    );
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (!this.openPanel) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      this.callbacks.onClose();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const focusable = [
      ...this.root.querySelectorAll<HTMLElement>(
        "button:not(:disabled), [tabindex=\"0\"]",
      ),
    ];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) {
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}

function settlementHtml(summary: RunSettlement): string {
  const score =
    summary.finalScore === null ? "—" : summary.finalScore.toFixed(2);
  const scoreTone =
    summary.finalScore !== null && summary.finalScore < 0
      ? "settlement-score-loss"
      : "settlement-score-gain";
  return `
    <div class="settlement-backdrop" data-settlement-close></div>
    <section class="settlement-panel" role="dialog" aria-modal="true"
      aria-labelledby="settlement-title" tabindex="-1" data-settlement-dialog>
      <header class="settlement-hero">
        <div>
          <p class="settlement-kicker">RUN COMPLETE</p>
          <h2 id="settlement-title">${escapeHtml(summary.model)}</h2>
        </div>
        <div class="settlement-score ${scoreTone}">
          <span>FINAL SCORE</span><strong>${score}</strong>
        </div>
      </header>
      <div class="settlement-metrics">
        ${metric("批准放行", summary.admittedCount)}
        ${metric("完成驶离", summary.completedCount)}
        ${metric("事故清障", `${summary.clearedAccidentCount}/${summary.accidentCount}`)}
        ${metric("拖车清障", `${summary.towedCount}/${summary.stalledCount}`)}
        ${metric("绕行处置", summary.reroutedCount)}
        ${metric("未解决", summary.unresolvedAccidentCount + summary.unresolvedStallCount, true)}
      </div>
      <div class="settlement-scroll">
        ${fleetSection("成功放行", "每个圆点代表一次批准放行", summary.admittedGroups, "admitted")}
        ${fleetSection("完成驶离", "每个圆点代表一辆驶出路网的车辆", summary.completedGroups, "completed")}
        ${fleetSection("故障清障", "拖车已完成", summary.towedGroups, "tow")}
        ${fleetSection("绕行处置", "后方队列已绕过抛锚车", summary.reroutedGroups, "reroute")}
        ${fleetSection("事故车辆", "圆点代表已清障事故涉及的车辆", summary.accidentVehicleGroups, "accident")}
      </div>
      <footer class="settlement-actions">
        <button type="button" data-settlement-close>关闭</button>
        <button type="button" class="primary" data-settlement-replay>重新播放</button>
      </footer>
    </section>
  `;
}

function metric(
  label: string,
  value: number | string,
  warn = false,
): string {
  return `<article class="settlement-metric${warn ? " is-warning" : ""}">
    <span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong>
  </article>`;
}

function fleetSection(
  title: string,
  caption: string,
  groups: readonly SettlementVehicleGroup[],
  tone: string,
): string {
  const total = groups.reduce((sum, group) => sum + group.dots.length, 0);
  return `
    <section class="settlement-fleet-section">
      <header><h3>${escapeHtml(title)}</h3><span>${total.toLocaleString("zh-CN")}</span>
        <p>${escapeHtml(caption)}</p></header>
      <div class="settlement-fleet">
        ${
          groups.length === 0
            ? '<p class="settlement-empty">本次没有相关记录</p>'
            : groups.map((group) => vehicleRow(group, tone)).join("")
        }
      </div>
    </section>`;
}

function vehicleRow(group: SettlementVehicleGroup, tone: string): string {
  return `
    <article class="settlement-vehicle-row">
      <div class="settlement-vehicle-model">
        <img alt="${escapeHtml(typeLabel(group.type))}"
          data-vehicle-thumbnail="${escapeHtml(String(group.type))}">
      </div>
      <div class="settlement-vehicle-data">
        <header><strong>${escapeHtml(typeLabel(group.type))}</strong>
          <span>× ${group.dots.length.toLocaleString("zh-CN")}</span></header>
        <div class="settlement-dots settlement-dots-${tone}">
          ${group.dots
            .map(
              (dot) =>
                `<button type="button" class="settlement-dot" title="${escapeHtml(dot.label)}"
                  aria-label="${escapeHtml(dot.label)}"></button>`,
            )
            .join("")}
        </div>
      </div>
    </article>`;
}

function typeLabel(type: string): string {
  const raw = type.includes(":") ? (type.split(":").at(-1) ?? type) : type;
  return raw.replaceAll(/[-_]/g, " ").toUpperCase();
}

function cssEscape(value: string): string {
  return globalThis.CSS?.escape(value) ?? value.replaceAll('"', '\\"');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
