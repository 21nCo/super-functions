import { Transaction, type EditorController, type EditorState, type MdfnJsonValue, type StateChange } from "@mdfn/core";

export interface AdapterSnapshot {
  readonly state: EditorState;
  readonly version: number;
  readonly markdown: string;
  readonly dirty: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export interface AdapterBridge {
  getSnapshot(): AdapterSnapshot;
  subscribe(listener: () => void): () => void;
  replaceSource(markdown: string, source?: string): StateChange;
  markSaved(): void;
  undo(): boolean;
  redo(): boolean;
  destroy(): void;
}

export function createAdapterBridge(controller: EditorController): AdapterBridge {
  let destroyed = false;
  const listeners = new Set<() => void>();
  const readSnapshot = (): AdapterSnapshot => {
    const state = controller.getState();
    return { state, version: state.version, markdown: state.markdown, dirty: state.dirty, canUndo: controller.canUndo(), canRedo: controller.canRedo() };
  };
  let snapshot = readSnapshot();
  const unsubscribe = controller.subscribe(() => {
    snapshot = readSnapshot();
    listeners.forEach((listener) => listener());
  });
  const assertAlive = (): void => { if (destroyed) throw new Error("MDFN_ADAPTER_BRIDGE_DESTROYED"); };
  return {
    getSnapshot() {
      assertAlive();
      return snapshot;
    },
    subscribe(listener) { assertAlive(); listeners.add(listener); return () => listeners.delete(listener); },
    replaceSource(markdown, source = "adapter") {
      assertAlive();
      const current = controller.getState().markdown;
      return controller.dispatch(new Transaction().replaceSource(0, current.length, markdown).withSource(source));
    },
    markSaved() { assertAlive(); controller.markSaved(); },
    undo() { assertAlive(); return controller.undo(); },
    redo() { assertAlive(); return controller.redo(); },
    destroy() { if (destroyed) return; destroyed = true; unsubscribe(); listeners.clear(); },
  };
}

export type AdapterFramework = "vanilla" | "react" | "svelte" | "solid";

export interface AdapterTrace {
  readonly schemaVersion: 1;
  readonly framework: AdapterFramework;
  readonly vectorId: string;
  readonly transactions: readonly {
    readonly version: number;
    readonly markdown: string;
    readonly selection: MdfnJsonValue;
    readonly diagnostics: readonly string[];
  }[];
  readonly cleanup: { readonly subscriptions: number; readonly destroyed: boolean };
}

export function recordSemanticTrace(
  framework: AdapterFramework,
  vectorId: string,
  controller: EditorController,
  run: (controller: EditorController) => void,
): AdapterTrace {
  const transactions: AdapterTrace["transactions"][number][] = [];
  const capture = (): void => {
    const state = controller.getState();
    transactions.push({ version: state.version, markdown: state.markdown, selection: state.selection as MdfnJsonValue, diagnostics: state.diagnostics.map((entry) => entry.code) });
  };
  capture();
  let active = 1;
  const unsubscribe = controller.subscribe(capture);
  try { run(controller); } finally { unsubscribe(); active -= 1; }
  return { schemaVersion: 1, framework, vectorId, transactions, cleanup: { subscriptions: active, destroyed: false } };
}

export function compareAdapterTraces(reference: AdapterTrace, traces: readonly AdapterTrace[]): readonly string[] {
  const normalized = (trace: AdapterTrace) => JSON.stringify({ vectorId: trace.vectorId, transactions: trace.transactions });
  return traces.filter((trace) => normalized(trace) !== normalized(reference)).map((trace) => trace.framework);
}

export const MDFN_ADAPTER_KIT_VERSION = "0.1.0" as const;
