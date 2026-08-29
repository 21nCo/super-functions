import { hashString, hashValue } from "./hash";
import { validateMdfnSidecar } from "./sidecar";
import type { EditorProjector, EditorState, MdfnSelection, MdfnSidecar, MdfnSnapshot } from "./types";

export interface CreateEditorStateInput {
  readonly markdown: string;
  readonly projector: EditorProjector;
  readonly schemaHash: string;
  readonly selection?: MdfnSelection;
  readonly sidecar?: MdfnSidecar;
  readonly version?: number;
}

export function createEditorState(input: CreateEditorStateInput): EditorState {
  const parsed = input.projector.parse(input.markdown);
  return Object.freeze({
    version: input.version ?? 0,
    markdown: input.markdown,
    document: parsed.document,
    schemaHash: input.schemaHash,
    sourceHash: parsed.sourceHash ?? hashString(input.markdown),
    selection: input.selection ?? null,
    diagnostics: Object.freeze([...parsed.diagnostics]),
    sidecar: validateMdfnSidecar(input.sidecar, { markdownLength: input.markdown.length }),
    dirty: false,
  });
}

export function createSnapshot(state: EditorState, includeDocument = true): MdfnSnapshot {
  return {
    format: "mdfn",
    version: 1,
    markdown: state.markdown,
    document: includeDocument ? state.document : undefined,
    schemaHash: state.schemaHash,
    sourceHash: state.sourceHash,
    documentHash: hashValue({ sourceHash: state.sourceHash, schemaHash: state.schemaHash, document: state.document }),
    diagnostics: state.diagnostics,
    sidecar: state.sidecar,
  };
}

export function restoreSnapshot(snapshot: MdfnSnapshot, projector: EditorProjector, expectedSchemaHash: string): EditorState {
  if (snapshot.format !== "mdfn" || snapshot.version !== 1) throw new Error("MDFN_SNAPSHOT_VERSION_UNSUPPORTED");
  if (hashString(snapshot.markdown) !== snapshot.sourceHash) throw new Error("MDFN_SNAPSHOT_SOURCE_HASH_MISMATCH");
  const state = createEditorState({
    markdown: snapshot.markdown,
    projector,
    schemaHash: expectedSchemaHash,
    sidecar: snapshot.sidecar,
  });
  if (snapshot.document && snapshot.schemaHash === expectedSchemaHash) {
    const expectedDocumentHash = hashValue({ sourceHash: state.sourceHash, schemaHash: expectedSchemaHash, document: state.document });
    const cachedDocumentHash = hashValue({ sourceHash: snapshot.sourceHash, schemaHash: snapshot.schemaHash, document: snapshot.document });
    if (snapshot.documentHash === expectedDocumentHash && cachedDocumentHash === expectedDocumentHash) {
      return Object.freeze({ ...state, document: snapshot.document, diagnostics: snapshot.diagnostics });
    }
  }
  return state;
}
