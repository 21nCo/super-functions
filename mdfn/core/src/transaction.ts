import { mapSelection, mapSidecar } from "./anchors";
import { hashString } from "./hash";
import { validateMdfnSidecar } from "./sidecar";
import type {
  ChangedRange,
  EditorProjector,
  EditorState,
  MdfnDocument,
  MdfnJsonValue,
  MdfnSelection,
  MdfnSidecar,
  StateChange,
} from "./types";

type Operation =
  | { readonly kind: "replace-source"; readonly from: number; readonly to: number; readonly text: string }
  | { readonly kind: "replace-document"; readonly document: MdfnDocument }
  | { readonly kind: "selection"; readonly selection: MdfnSelection }
  | { readonly kind: "sidecar"; readonly sidecar: MdfnSidecar | undefined };

export class Transaction {
  readonly operations: readonly Operation[];
  readonly source: string;
  readonly metadata: Readonly<Record<string, MdfnJsonValue>>;

  constructor(
    operations: readonly Operation[] = [],
    source = "command",
    metadata: Readonly<Record<string, MdfnJsonValue>> = {},
  ) {
    this.operations = operations;
    this.source = source;
    this.metadata = metadata;
  }

  replaceSource(from: number, to: number, text: string): Transaction {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from) {
      throw new RangeError("MDFN_TRANSACTION_RANGE_INVALID");
    }
    return new Transaction([...this.operations, { kind: "replace-source", from, to, text }], this.source, this.metadata);
  }

  replaceDocument(document: MdfnDocument): Transaction {
    return new Transaction([...this.operations, { kind: "replace-document", document }], this.source, this.metadata);
  }

  setSelection(selection: MdfnSelection): Transaction {
    return new Transaction([...this.operations, { kind: "selection", selection }], this.source, this.metadata);
  }

  setSidecar(sidecar: MdfnSidecar | undefined): Transaction {
    return new Transaction([...this.operations, { kind: "sidecar", sidecar }], this.source, this.metadata);
  }

  withSource(source: string): Transaction {
    return new Transaction(this.operations, source, this.metadata);
  }

  withMetadata(metadata: Readonly<Record<string, MdfnJsonValue>>): Transaction {
    return new Transaction(this.operations, this.source, { ...this.metadata, ...metadata });
  }
}

export function applyTransaction(state: EditorState, transaction: Transaction, projector: EditorProjector): StateChange {
  let markdown = state.markdown;
  let document = state.document;
  let selection = state.selection;
  let sidecar = state.sidecar;
  let diagnostics = state.diagnostics;
  let documentChanged = false;
  let selectionChanged = false;
  let sidecarChanged = false;
  const ranges: ChangedRange[] = [];

  for (const operation of transaction.operations) {
    if (operation.kind === "replace-source") {
      if (operation.to > markdown.length) throw new RangeError("MDFN_TRANSACTION_RANGE_OUT_OF_BOUNDS");
      markdown = `${markdown.slice(0, operation.from)}${operation.text}${markdown.slice(operation.to)}`;
      const range = { from: operation.from, to: operation.to, insertedLength: operation.text.length };
      ranges.push(range);
      const mappedSelection = mapSelection(selection, [range]);
      selectionChanged ||= mappedSelection !== selection;
      selection = mappedSelection;
      const mappedSidecar = mapSidecar(sidecar, [range]);
      sidecarChanged ||= mappedSidecar !== sidecar;
      sidecar = mappedSidecar;
      const parsed = projector.parse(markdown);
      document = parsed.document;
      diagnostics = parsed.diagnostics;
      documentChanged = true;
      continue;
    }
    if (operation.kind === "replace-document") {
      const serialized = projector.serialize(operation.document, markdown);
      const previousMarkdown = markdown;
      markdown = serialized.markdown;
      const parsed = projector.parse(markdown);
      document = parsed.document;
      diagnostics = Object.freeze([...serialized.diagnostics, ...parsed.diagnostics]);
      if (previousMarkdown !== markdown) {
        let from = 0;
        const shared = Math.min(previousMarkdown.length, markdown.length);
        while (from < shared && previousMarkdown.charCodeAt(from) === markdown.charCodeAt(from)) from += 1;
        let previousTo = previousMarkdown.length;
        let nextTo = markdown.length;
        while (previousTo > from && nextTo > from && previousMarkdown.charCodeAt(previousTo - 1) === markdown.charCodeAt(nextTo - 1)) {
          previousTo -= 1;
          nextTo -= 1;
        }
        const range = { from, to: previousTo, insertedLength: nextTo - from };
        ranges.push(range);
        const mappedSelection = mapSelection(selection, [range]);
        selectionChanged ||= mappedSelection !== selection;
        selection = mappedSelection;
        const mappedSidecar = mapSidecar(sidecar, [range]);
        sidecarChanged ||= mappedSidecar !== sidecar;
        sidecar = mappedSidecar;
      }
      documentChanged = true;
      continue;
    }
    if (operation.kind === "selection") {
      selection = operation.selection;
      selectionChanged = true;
      continue;
    }
    sidecar = validateMdfnSidecar(operation.sidecar, { markdownLength: markdown.length });
    sidecarChanged = true;
  }

  if (transaction.operations.length === 0) {
    return {
      previous: state,
      current: state,
      changedRanges: [],
      documentChanged: false,
      selectionChanged: false,
      sidecarChanged: false,
      source: transaction.source,
      metadata: transaction.metadata,
    };
  }

  const current: EditorState = Object.freeze({
    ...state,
    version: state.version + 1,
    markdown,
    document,
    selection,
    sidecar,
    diagnostics: Object.freeze([...diagnostics]),
    sourceHash: hashString(markdown),
    dirty: state.dirty || documentChanged || sidecarChanged,
  });
  return {
    previous: state,
    current,
    changedRanges: Object.freeze(ranges),
    documentChanged,
    selectionChanged,
    sidecarChanged,
    source: transaction.source,
    metadata: transaction.metadata,
  };
}
