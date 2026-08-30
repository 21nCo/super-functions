import { applyTransaction, Transaction } from "./transaction";
import type {
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

export function createEditor(input: CreateEditorInput): EditorController {
  const extensions = resolveExtensions(input.extensions ?? []);
  let state = createEditorState({ markdown: input.markdown, projector: input.projector, schemaHash: extensions.schemaHash, selection: input.selection, sidecar: input.sidecar });
  const listeners = new Set<EditorListener>();
  const undoStack: EditorState[] = [];
  const redoStack: EditorState[] = [];
  const historyLimit = Math.max(1, input.historyLimit ?? 100);
  let savedRevision = { sourceHash: state.sourceHash, sidecar: JSON.stringify(state.sidecar) };
  let destroyed = false;

  const assertAlive = (): void => {
    if (destroyed) throw new Error("MDFN_EDITOR_DESTROYED");
  };

  const notify = (change: StateChange): void => {
    for (const listener of [...listeners]) listener(change);
  };

  const changedRanges = (previous: string, next: string): StateChange["changedRanges"] => {
    if (previous === next) return [];
    let prefix = 0;
    while (prefix < previous.length && prefix < next.length && previous.charCodeAt(prefix) === next.charCodeAt(prefix)) prefix += 1;
    let previousEnd = previous.length;
    let nextEnd = next.length;
    while (previousEnd > prefix && nextEnd > prefix && previous.charCodeAt(previousEnd - 1) === next.charCodeAt(nextEnd - 1)) {
      previousEnd -= 1;
      nextEnd -= 1;
    }
    const before = previous.slice(prefix, previousEnd);
    const after = next.slice(prefix, nextEnd);
    if (before.length * after.length > 250_000) return [{ from: prefix, to: previousEnd, insertedLength: after.length }];
    const width = after.length + 1;
    const lcs = new Uint32Array((before.length + 1) * width);
    for (let left = before.length - 1; left >= 0; left -= 1) {
      for (let right = after.length - 1; right >= 0; right -= 1) {
        const index = left * width + right;
        lcs[index] = before.charCodeAt(left) === after.charCodeAt(right)
          ? lcs[(left + 1) * width + right + 1] + 1
          : Math.max(lcs[(left + 1) * width + right], lcs[index + 1]);
      }
    }
    const ranges: Array<{ from: number; to: number; insertedLength: number }> = [];
    let left = 0;
    let right = 0;
    let position = prefix;
    while (left < before.length || right < after.length) {
      if (left < before.length && right < after.length && before.charCodeAt(left) === after.charCodeAt(right)) {
        left += 1; right += 1; position += 1; continue;
      }
      const from = position;
      let removed = 0;
      let insertedLength = 0;
      while (left < before.length || right < after.length) {
        if (left < before.length && right < after.length && before.charCodeAt(left) === after.charCodeAt(right)) break;
        if (right < after.length && (left === before.length || lcs[left * width + right + 1] >= lcs[(left + 1) * width + right])) {
          right += 1; insertedLength += 1;
        } else {
          left += 1; removed += 1;
        }
      }
      ranges.push({ from, to: from + removed, insertedLength });
      position += insertedLength;
    }
    return ranges;
  };

  const restore = (next: EditorState, source: string): boolean => {
    const previous = state;
    const dirty = next.sourceHash !== savedRevision.sourceHash || JSON.stringify(next.sidecar) !== savedRevision.sidecar;
    state = Object.freeze({ ...next, dirty, version: previous.version + 1 });
    notify({
      previous,
      current: state,
      changedRanges: changedRanges(previous.markdown, state.markdown),
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
        if ((change.documentChanged || change.sidecarChanged) && transaction.metadata.addToHistory !== false) {
          undoStack.push(state);
          if (undoStack.length > historyLimit) undoStack.shift();
          redoStack.length = 0;
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
      redoStack.push(state);
      return restore(previous, "history:undo");
    },
    redo() {
      assertAlive();
      const next = redoStack.pop();
      if (!next) return false;
      undoStack.push(state);
      return restore(next, "history:redo");
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
