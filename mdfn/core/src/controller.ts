import { applyTransaction, Transaction } from "./transaction";
import type {
  ChangedRange,
  EditorCommand,
  EditorListener,
  EditorProjector,
  EditorState,
  MdfnExtension,
  StateChange,
  MdfnSelection,
  MdfnSidecar,
} from "./types";
import { resolveExtensions, type ResolvedExtensionRegistry } from "./extensions";
import { createEditorState } from "./state";

export interface EditorController {
  getState(): EditorState;
  validateMarkdown(markdown: string): void;
  dispatch(transaction: Transaction): StateChange;
  subscribe(listener: EditorListener): () => void;
  can(command: string): boolean;
  run(command: string): boolean;
  canUndo(): boolean;
  canRedo(): boolean;
  undo(): boolean;
  redo(): boolean;
  markSaved(): void;
  destroy(): void;
  readonly extensions: ResolvedExtensionRegistry;
}

export interface CreateEditorInput {
  readonly markdown: string;
  readonly projector: EditorProjector;
  readonly extensions?: readonly MdfnExtension[];
  readonly historyLimit?: number;
  readonly selection?: MdfnSelection;
  readonly sidecar?: MdfnSidecar;
}

export function smallestSourceChange(previous: string, next: string): { from: number; to: number; insert: string } | undefined {
  if (previous === next) return undefined;
  let from = 0;
  const shared = Math.min(previous.length, next.length);
  while (from < shared && previous.charCodeAt(from) === next.charCodeAt(from)) from += 1;
  let previousTo = previous.length;
  let nextTo = next.length;
  while (previousTo > from && nextTo > from && previous.charCodeAt(previousTo - 1) === next.charCodeAt(nextTo - 1)) {
    previousTo -= 1;
    nextTo -= 1;
  }
  return { from, to: previousTo, insert: next.slice(from, nextTo) };
}

interface HistoryEntry {
  readonly state: EditorState;
  readonly changedRanges: readonly ChangedRange[];
}

function invertChangedRanges(ranges: readonly ChangedRange[]): readonly ChangedRange[] {
  return Object.freeze([...ranges].reverse().map((range) => Object.freeze({
    from: range.from,
    to: range.from + range.insertedLength,
    insertedLength: range.to - range.from,
  })));
}

export function createEditor(input: CreateEditorInput): EditorController {
  const extensions = resolveExtensions(input.extensions ?? []);
  let state = createEditorState({ markdown: input.markdown, projector: input.projector, schemaHash: extensions.schemaHash, selection: input.selection, sidecar: input.sidecar });
  const listeners = new Set<EditorListener>();
  const undoStack: HistoryEntry[] = [];
  const redoStack: HistoryEntry[] = [];
  const historyLimit = Math.max(1, input.historyLimit ?? 100);
  let savedRevision = { sourceHash: state.sourceHash, sidecar: JSON.stringify(state.sidecar) };
  let destroyed = false;

  const assertAlive = (): void => {
    if (destroyed) throw new Error("MDFN_EDITOR_DESTROYED");
  };

  const notify = (change: StateChange): void => {
    for (const listener of [...listeners]) listener(change);
  };

  const restore = (next: EditorState, source: string, changedRanges: readonly ChangedRange[]): boolean => {
    const previous = state;
    const dirty = next.sourceHash !== savedRevision.sourceHash || JSON.stringify(next.sidecar) !== savedRevision.sidecar;
    state = Object.freeze({ ...next, dirty, version: previous.version + 1 });
    notify({
      previous,
      current: state,
      changedRanges,
      documentChanged: previous.markdown !== state.markdown,
      selectionChanged: previous.selection !== state.selection,
      sidecarChanged: previous.sidecar !== state.sidecar,
      source,
      metadata: {},
    });
    return true;
  };

  const controller: EditorController = {
    extensions,
    getState() {
      assertAlive();
      return state;
    },
    validateMarkdown(markdown) {
      assertAlive();
      input.projector.parse(markdown);
    },
    dispatch(transaction) {
      assertAlive();
      const change = applyTransaction(state, transaction, input.projector);
      if (change.current !== state) {
        if (change.documentChanged || change.sidecarChanged) {
          if (transaction.metadata.addToHistory !== false) {
            undoStack.push({ state, changedRanges: invertChangedRanges(change.changedRanges) });
            if (undoStack.length > historyLimit) undoStack.shift();
            redoStack.length = 0;
          } else {
            undoStack.length = 0;
            redoStack.length = 0;
          }
        }
        state = change.current;
        notify(change);
      }
      return change;
    },
    subscribe(listener) {
      assertAlive();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    can(command) {
      assertAlive();
      const resolved = extensions.commands[command];
      if (!resolved) return false;
      return resolved({
        state,
        dispatch: (transaction) => applyTransaction(state, transaction as Transaction, input.projector),
      });
    },
    run(command) {
      assertAlive();
      const resolved: EditorCommand | undefined = extensions.commands[command];
      if (!resolved) return false;
      return resolved({ state, dispatch: (transaction) => controller.dispatch(transaction as Transaction) });
    },
    canUndo() {
      assertAlive();
      return undoStack.length > 0;
    },
    canRedo() {
      assertAlive();
      return redoStack.length > 0;
    },
    undo() {
      assertAlive();
      const previous = undoStack.pop();
      if (!previous) return false;
      redoStack.push({ state, changedRanges: invertChangedRanges(previous.changedRanges) });
      return restore(previous.state, "history:undo", previous.changedRanges);
    },
    redo() {
      assertAlive();
      const next = redoStack.pop();
      if (!next) return false;
      undoStack.push({ state, changedRanges: invertChangedRanges(next.changedRanges) });
      return restore(next.state, "history:redo", next.changedRanges);
    },
    markSaved() {
      assertAlive();
      if (!state.dirty) return;
      const previous = state;
      savedRevision = { sourceHash: state.sourceHash, sidecar: JSON.stringify(state.sidecar) };
      state = Object.freeze({ ...state, dirty: false, version: previous.version + 1 });
      notify({
        previous,
        current: state,
        changedRanges: [],
        documentChanged: false,
        selectionChanged: false,
        sidecarChanged: false,
        source: "state:saved",
        metadata: {},
      });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const cleanup of pluginCleanups.splice(0).reverse()) cleanup();
      listeners.clear();
      undoStack.length = 0;
      redoStack.length = 0;
    },
  };
  const pluginCleanups: Array<() => void> = [];
  for (const plugin of extensions.plugins) {
    const cleanup = plugin.setup({ getState: controller.getState, dispatch: (transaction) => controller.dispatch(transaction as Transaction), subscribe: controller.subscribe });
    if (cleanup) pluginCleanups.push(cleanup);
  }
  return controller;
}

export function replaceAll(currentMarkdown: string, markdown: string, source = "source"): Transaction {
  return new Transaction().replaceSource(0, currentMarkdown.length, markdown).withSource(source);
}
