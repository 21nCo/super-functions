import type { DatafnError, DatafnEvent, DatafnSignal } from "@datafn/core";
import type { DatafnStorageAdapter } from "../storage.js";

export type DatafnSyncMode = "sync" | "local-only";

export type DatafnSyncPhase =
  | "seed"
  | "clone"
  | "pull"
  | "push"
  | "reconcile"
  | "cloneUp";

export type DatafnSyncStatusKind =
  | "idle"
  | "starting"
  | "ready"
  | "syncing"
  | "offline"
  | "error";

export type DatafnSyncStatus = {
  status: DatafnSyncStatusKind;
  mode: DatafnSyncMode;
  phase: DatafnSyncPhase | null;
  pendingChanges: number;
  lastSyncAt: number | null;
  lastError: string | null;
  online: boolean;
};

type DatafnSyncStatusControllerInput = {
  mode: DatafnSyncMode;
  storage?: DatafnStorageAdapter;
  getOnline?: () => boolean;
  getTimestamp?: () => number;
  refreshDelayMs?: number;
};

type DatafnSyncStatusSubscriber = (status: DatafnSyncStatus) => void;

type DatafnSyncEventContext = {
  phase?: unknown;
  error?: unknown;
  message?: unknown;
  isOnline?: unknown;
};

const defaultRefreshDelayMs = 250;

export function createDatafnSyncStatusController(
  input: DatafnSyncStatusControllerInput,
) {
  return new DatafnSyncStatusController(input);
}

class DatafnSyncStatusController {
  private status: DatafnSyncStatus;
  private subscribers = new Set<DatafnSyncStatusSubscriber>();
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshPending = false;
  private refreshInFlight = false;
  private disposed = false;
  private signalRef: DatafnSignal<DatafnSyncStatus> | null = null;

  constructor(private input: DatafnSyncStatusControllerInput) {
    this.status = {
      status: "idle",
      mode: input.mode,
      phase: null,
      pendingChanges: 0,
      lastSyncAt: null,
      lastError: null,
      online: this.resolveOnline(),
    };
    if (this.status.mode === "local-only") {
      this.status.status = "ready";
    }
  }

  getStatus(): DatafnSyncStatus {
    return { ...this.status };
  }

  statusSignal(): DatafnSignal<DatafnSyncStatus> {
    if (this.signalRef) return this.signalRef;
    const controller = this;
    this.signalRef = {
      get() {
        return controller.getStatus();
      },
      subscribe(handler: DatafnSyncStatusSubscriber) {
        if (controller.disposed) return () => {};
        controller.subscribers.add(handler);
        handler(controller.getStatus());
        return () => {
          controller.subscribers.delete(handler);
        };
      },
      get loading() {
        return false;
      },
      get error(): DatafnError | null {
        return null;
      },
      get refreshing() {
        return controller.refreshInFlight;
      },
      get nextCursor() {
        return null;
      },
      dispose() {
        controller.subscribers.clear();
      },
    };
    return this.signalRef;
  }

  async refreshStatus(): Promise<DatafnSyncStatus> {
    this.cancelScheduledRefresh();
    await this.refreshPendingChanges();
    return this.getStatus();
  }

  markStarting(phase: DatafnSyncPhase | null = null): void {
    this.update({
      status: "starting",
      phase,
      online: this.resolveOnline(),
      lastError: null,
    });
  }

  markSyncing(phase: DatafnSyncPhase): void {
    this.update({
      status: "syncing",
      phase,
      online: this.resolveOnline(),
      lastError: null,
    });
  }

  markReady(): void {
    this.update({
      status: this.resolveOnline() ? "ready" : "offline",
      phase: null,
      online: this.resolveOnline(),
      lastError: null,
    });
  }

  markStopped(): void {
    this.update({
      status: "idle",
      phase: null,
      online: this.resolveOnline(),
    });
  }

  markError(error: unknown, phase: DatafnSyncPhase | null = null): void {
    this.update({
      status: "error",
      phase,
      online: this.resolveOnline(),
      lastError: resolveDatafnSyncErrorMessage(error),
    });
  }

  handleEvent(event: DatafnEvent): void {
    if (event.type === "sync_started") {
      if (this.status.mode === "local-only") return;
      this.markSyncing(resolveDatafnSyncPhase(event.context) ?? "pull");
      return;
    }

    if (event.type === "sync_retry") {
      if (this.status.mode === "local-only") return;
      const phase = resolveDatafnSyncPhase(event.context);
      if (phase) this.markSyncing(phase);
      return;
    }

    if (event.type === "sync_applied") {
      this.update({
        status: this.resolveOnline() ? "ready" : "offline",
        phase: null,
        lastSyncAt: event.timestampMs,
        lastError: null,
        online: this.resolveOnline(),
      });
      this.schedulePendingChangesRefresh();
      return;
    }

    if (event.type === "sync_failed") {
      this.update({
        status: "error",
        phase: resolveDatafnSyncPhase(event.context),
        lastError: resolveDatafnSyncEventErrorMessage(event),
        online: this.resolveOnline(),
      });
      this.schedulePendingChangesRefresh();
      return;
    }

    if (
      event.type === "mutation_applied" ||
      event.type === "mutation_rejected"
    ) {
      this.schedulePendingChangesRefresh();
      this.update({
        lastError:
          event.type === "mutation_rejected"
            ? resolveDatafnSyncEventErrorMessage(event)
            : null,
        status:
          event.type === "mutation_rejected" ? "error" : this.status.status,
      });
      return;
    }

    if (event.type === "connectivity_changed") {
      const online = resolveDatafnSyncOnline(event.context) ?? this.resolveOnline();
      this.update({
        online,
        status: online
          ? this.status.lastError
            ? "error"
            : "ready"
          : "offline",
      });
    }
  }

  dispose(): void {
    this.disposed = true;
    this.cancelScheduledRefresh();
    this.subscribers.clear();
  }

  private schedulePendingChangesRefresh(): void {
    if (!this.input.storage || this.disposed) return;
    this.refreshPending = true;
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.runScheduledPendingChangesRefresh();
    }, this.input.refreshDelayMs ?? defaultRefreshDelayMs);
  }

  private async runScheduledPendingChangesRefresh(): Promise<void> {
    if (!this.refreshPending || this.disposed) return;
    if (this.refreshInFlight) {
      this.schedulePendingChangesRefresh();
      return;
    }
    this.refreshPending = false;
    await this.refreshPendingChanges();
    if (this.refreshPending) {
      this.schedulePendingChangesRefresh();
    }
  }

  private async refreshPendingChanges(): Promise<void> {
    if (this.refreshInFlight || this.disposed) return;
    this.refreshInFlight = true;
    try {
      const pendingChanges = this.input.storage
        ? await this.input.storage.changelogList().then(
            (items) => items.length,
            () => 0,
          )
        : 0;
      this.update({ pendingChanges, online: this.resolveOnline() });
    } finally {
      this.refreshInFlight = false;
    }
  }

  private cancelScheduledRefresh(): void {
    this.refreshPending = false;
    if (!this.refreshTimer) return;
    clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
  }

  private resolveOnline(): boolean {
    return this.input.getOnline
      ? this.input.getOnline()
      : typeof navigator === "undefined"
        ? true
        : navigator.onLine !== false;
  }

  private update(partial: Partial<DatafnSyncStatus>): void {
    if (this.disposed) return;
    const next = { ...this.status, ...partial };
    if (isSameDatafnSyncStatus(this.status, next)) return;
    this.status = next;
    const snapshot = this.getStatus();
    this.subscribers.forEach((subscriber) => subscriber(snapshot));
  }
}

function isSameDatafnSyncStatus(
  left: DatafnSyncStatus,
  right: DatafnSyncStatus,
): boolean {
  return (
    left.status === right.status &&
    left.mode === right.mode &&
    left.phase === right.phase &&
    left.pendingChanges === right.pendingChanges &&
    left.lastSyncAt === right.lastSyncAt &&
    left.lastError === right.lastError &&
    left.online === right.online
  );
}

function resolveDatafnSyncOnline(context: unknown): boolean | null {
  if (typeof context !== "object" || context === null) return null;
  const value = (context as DatafnSyncEventContext).isOnline;
  return typeof value === "boolean" ? value : null;
}

function resolveDatafnSyncPhase(context: unknown): DatafnSyncPhase | null {
  if (typeof context !== "object" || context === null) return null;
  const phase = (context as DatafnSyncEventContext).phase;
  return isDatafnSyncPhase(phase) ? phase : null;
}

function isDatafnSyncPhase(value: unknown): value is DatafnSyncPhase {
  return (
    value === "seed" ||
    value === "clone" ||
    value === "pull" ||
    value === "push" ||
    value === "reconcile" ||
    value === "cloneUp"
  );
}

function resolveDatafnSyncEventErrorMessage(
  event: Pick<DatafnEvent, "context" | "type">,
): string | null {
  const context = event.context as DatafnSyncEventContext | undefined;
  if (event.type === "mutation_rejected") {
    return (
      resolveExplicitErrorMessage(context) ??
      resolveExplicitErrorMessage(context?.error) ??
      resolveDatafnSyncErrorMessage(context) ??
      "Mutation rejected"
    );
  }
  if (event.type === "sync_failed") {
    return (
      resolveExplicitErrorMessage(context?.error) ??
      resolveExplicitErrorMessage(context) ??
      resolveDatafnSyncErrorMessage(context?.error) ??
      resolveDatafnSyncErrorMessage(context) ??
      "Data sync failed"
    );
  }
  return null;
}

function resolveDatafnSyncErrorMessage(error: unknown): string | null {
  const message = resolveExplicitErrorMessage(error);
  if (message !== null) return message;
  if (!error) return null;
  return "Data sync failed";
}

function resolveExplicitErrorMessage(error: unknown): string | null {
  if (!error) return null;
  if (typeof error === "string") return error;
  if (typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return null;
}
