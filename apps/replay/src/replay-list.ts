import {
  sortRuns,
  type RunCatalogEntry,
  type RunSortDirection,
  type RunSortKey,
} from "@replay/run-catalog.js";

export interface ReplayListCallbacks {
  onPick(replayFile: string): void;
}

export class ReplayList {
  private runs: RunCatalogEntry[] = [];
  private sortKey: RunSortKey = "time";
  private sortDirection: RunSortDirection = "desc";
  private status = "";
  private openPanel = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly callbacks: ReplayListCallbacks,
  ) {
    this.root.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest("[data-run-close]") !== null) {
        this.close();
        return;
      }
      const sortButton = target.closest<HTMLButtonElement>("[data-sort-column]");
      if (sortButton !== null) {
        event.preventDefault();
        this.sortBy(sortKey(sortButton.dataset.sortColumn ?? ""));
        return;
      }
      const copyButton = target.closest<HTMLButtonElement>("[data-copy-log]");
      if (copyButton !== null) {
        event.preventDefault();
        event.stopPropagation();
        const path = copyButton.dataset.copyLog;
        if (path !== undefined && path.length > 0) {
          void copyLogPath(copyButton, path);
        }
        return;
      }
      const row = target.closest<HTMLButtonElement>("[data-replay-file]");
      const replayFile = row?.dataset.replayFile;
      if (replayFile !== undefined && replayFile.length > 0) {
        this.callbacks.onPick(replayFile);
      }
    });
    this.root.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) {
        return;
      }
      if (target.dataset.sortKey !== undefined) {
        this.sortKey = sortKey(target.value);
      }
      if (target.dataset.sortDirection !== undefined) {
        this.sortDirection = target.value === "asc" ? "asc" : "desc";
      }
      this.paint();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.openPanel) {
        this.close();
      }
    });
  }

  get isOpen(): boolean {
    return this.openPanel;
  }

  open(): void {
    this.openPanel = true;
    this.status = "正在读取运行记录…";
    this.runs = [];
    this.root.hidden = false;
    this.paint();
    void this.load();
  }

  close(): void {
    this.openPanel = false;
    this.root.hidden = true;
  }

  setStatus(status: string): void {
    this.status = status;
    this.paint();
  }

  private sortBy(key: RunSortKey): void {
    if (this.sortKey === key) {
      this.sortDirection = this.sortDirection === "asc" ? "desc" : "asc";
    } else {
      this.sortKey = key;
      this.sortDirection = key === "model" || key === "file" ? "asc" : "desc";
    }
    this.paint();
  }

  private async load(): Promise<void> {
    try {
      const response = await fetch("/api/runs");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const body: unknown = await response.json();
      this.runs = readRuns(body);
      this.status = this.runs.length === 0 ? "logs 里还没有运行报告。" : "";
    } catch {
      this.runs = [];
      this.status = "读不到运行列表。请用 replay 开发服务器打开这个页面。";
    }
    if (this.openPanel) {
      this.paint();
    }
  }

  private paint(): void {
    const rows = sortRuns(this.runs, this.sortKey, this.sortDirection);
    this.root.innerHTML = `
      <div class="run-list-backdrop" data-run-close></div>
      <section class="run-list" role="dialog" aria-labelledby="run-list-title">
        <header class="run-list-bar">
          <h2 id="run-list-title">运行记录</h2>
          <div class="run-sort">
            <label>排序
              <select data-sort-key>
                ${SORT_COLUMNS.map((column) =>
                  option(column.key, column.label, this.sortKey),
                ).join("")}
              </select>
            </label>
            <label>顺序
              <select data-sort-direction>
                ${option("desc", "倒序", this.sortDirection)}
                ${option("asc", "正序", this.sortDirection)}
              </select>
            </label>
          </div>
          <button type="button" data-run-close>关闭</button>
        </header>
        <p class="run-list-status">${escapeHtml(this.status)}</p>
        <div class="run-table-wrap">
          <table class="run-table">
            <thead>
              <tr>
                ${SORT_COLUMNS.map((column) =>
                  headerCell(column, this.sortKey, this.sortDirection),
                ).join("")}
              </tr>
            </thead>
            <tbody>
              ${rows.map((run) => rowHtml(run)).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }
}

function rowHtml(run: RunCatalogEntry): string {
  const seed = run.seed === null ? "" : `<small>seed ${run.seed}</small>`;
  const scoreClass = run.score !== null && run.score < 0 ? "score-down" : "score-up";
  const replay = run.replayFile === null ? "" : ` data-replay-file="${escapeHtml(run.replayFile)}"`;
  const sourceFileName = run.sourceFileName.length > 0 ? run.sourceFileName : run.id;
  const logPath = `logs/${sourceFileName}`;
  return `
    <tr${replay}${run.replayFile === null ? "" : " role=\"button\" tabindex=\"0\""}>
      <td>${escapeHtml(run.model)}${seed}</td>
      <td class="file-name">
        <span class="file-name-line">
          <span class="file-name-text" title="${escapeHtml(sourceFileName)}">${escapeHtml(sourceFileName)}</span>
          <button
            type="button"
            class="copy-log"
            data-copy-log="${escapeHtml(logPath)}"
            aria-label="复制日志相对地址"
            title="复制 ${escapeHtml(logPath)}"
          >${copyIcon()}</button>
        </span>
      </td>
      <td>${formatVersions(run.schemaVersion, run.animationVersion)}</td>
      <td class="${scoreClass}">${formatScore(run.score)}</td>
      <td>${formatTokens(run.totalTokens)}</td>
      <td>${formatCount(run.apiCalls)}</td>
      <td>${formatElapsed(run.elapsedMs)}</td>
      <td>${escapeHtml(run.dateLabel)}${run.replayFile === null ? "<small>无回放文件</small>" : ""}</td>
    </tr>
  `;
}

const SORT_COLUMNS: readonly { key: RunSortKey; label: string }[] = [
  { key: "model", label: "模型名称" },
  { key: "file", label: "原始文件" },
  { key: "schema", label: "Schema" },
  { key: "score", label: "得分" },
  { key: "tokens", label: "总计 token" },
  { key: "api", label: "API 调用" },
  { key: "duration", label: "运行时长" },
  { key: "time", label: "执行日期" },
];

function headerCell(
  column: { key: RunSortKey; label: string },
  sortKey: RunSortKey,
  direction: RunSortDirection,
): string {
  const active = column.key === sortKey;
  const ariaSort = active
    ? direction === "asc"
      ? "ascending"
      : "descending"
    : "none";
  const mark = active
    ? `<span class="sort-mark" data-direction="${direction}" aria-hidden="true"></span>`
    : "";
  return `<th aria-sort="${ariaSort}"><button type="button" class="run-sort-header${active ? " is-active" : ""}" data-sort-column="${column.key}">${escapeHtml(column.label)}${mark}</button></th>`;
}

function option(value: string, label: string, selected: string): string {
  return `<option value="${value}"${value === selected ? " selected" : ""}>${label}</option>`;
}

function formatVersions(
  schemaVersion: number | null,
  animationVersion: number | null,
): string {
  const schema = schemaVersion === null ? "—" : `v${schemaVersion}`;
  const animation =
    animationVersion === null ? "—" : `v${animationVersion}`;
  return `${schema}<small>动画 ${animation}</small>`;
}

function formatScore(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}

function formatTokens(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("zh-CN");
}

function formatCount(value: number | null): string {
  return value === null ? "—" : Math.trunc(value).toLocaleString("zh-CN");
}

function formatElapsed(durationMs: number | null): string {
  if (durationMs === null) {
    return "—";
  }
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function readRuns(body: unknown): RunCatalogEntry[] {
  if (typeof body !== "object" || body === null || !("runs" in body)) {
    return [];
  }
  const runs = body.runs;
  if (!Array.isArray(runs)) {
    return [];
  }
  return runs.flatMap((item) => {
    const entry = toEntry(item);
    return entry === null ? [] : [entry];
  });
}

function toEntry(value: unknown): RunCatalogEntry | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Partial<RunCatalogEntry>;
  if (typeof record.id !== "string" || typeof record.model !== "string") {
    return null;
  }
  const replayFile = typeof record.replayFile === "string" ? record.replayFile : null;
  const sourceFileName =
    typeof record.sourceFileName === "string" && record.sourceFileName.length > 0
      ? record.sourceFileName
      : (replayFile ?? record.id);
  return {
    id: record.id,
    model: record.model,
    dateLabel: typeof record.dateLabel === "string" ? record.dateLabel : "",
    executedAtMs: finiteNumber(record.executedAtMs),
    score: finiteNumber(record.score),
    totalTokens: finiteNumber(record.totalTokens),
    promptTokens: finiteNumber(record.promptTokens),
    completionTokens: finiteNumber(record.completionTokens),
    apiCalls: finiteNumber(record.apiCalls),
    elapsedMs: finiteNumber(record.elapsedMs),
    seed: finiteNumber(record.seed),
    replayFile,
    sourceFileName,
    schemaVersion: finiteNumber(record.schemaVersion),
    animationVersion: finiteNumber(record.animationVersion),
  };
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sortKey(value: string): RunSortKey {
  const column = SORT_COLUMNS.find((item) => item.key === value);
  return column?.key ?? "time";
}

function copyIcon(): string {
  return `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <rect x="5.2" y="3.2" width="8" height="10" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.4"/>
    <rect x="2.8" y="1.2" width="8" height="10" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.4"/>
  </svg>`;
}

async function copyLogPath(button: HTMLButtonElement, path: string): Promise<void> {
  button.focus();
  try {
    await navigator.clipboard.writeText(path);
  } catch {
    if (!copyWithSelection(path)) {
      return;
    }
  }
  button.classList.add("is-copied");
  button.setAttribute("aria-label", "已复制");
  button.title = "已复制";
  window.setTimeout(() => {
    button.classList.remove("is-copied");
    button.setAttribute("aria-label", "复制日志相对地址");
    button.title = `复制 ${path}`;
  }, 1200);
}

function copyWithSelection(path: string): boolean {
  const field = document.createElement("textarea");
  field.value = path;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.left = "-9999px";
  document.body.append(field);
  field.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  field.remove();
  return copied;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
