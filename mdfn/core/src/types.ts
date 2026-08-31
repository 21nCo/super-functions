export type MdfnJsonPrimitive = string | number | boolean | null;
export type MdfnJsonValue =
  | MdfnJsonPrimitive
  | readonly MdfnJsonValue[]
  | { readonly [key: string]: MdfnJsonValue };

export type PreservationLevel = "exact" | "semantic" | "opaque";
export type DiagnosticSeverity = "info" | "warning" | "error";

export interface SourceSpan {
  readonly from: number;
  readonly to: number;
  readonly raw?: string;
  readonly syntax?: Readonly<Record<string, MdfnJsonValue>>;
  readonly preservation: PreservationLevel;
  readonly dirty?: boolean;
}

export interface MdfnMark {
  readonly type: string;
  readonly attrs?: Readonly<Record<string, MdfnJsonValue>>;
}

export interface MdfnNode {
  readonly type: string;
  readonly id?: string;
  readonly attrs?: Readonly<Record<string, MdfnJsonValue>>;
  readonly marks?: readonly MdfnMark[];
  readonly content?: readonly MdfnNode[];
  readonly text?: string;
  readonly source?: SourceSpan;
}

export interface MdfnDocument extends MdfnNode {
  readonly type: "doc";
  readonly schemaVersion: number;
  readonly content: readonly MdfnNode[];
}

export interface MdfnDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly severity: DiagnosticSeverity;
  readonly source?: { readonly from: number; readonly to: number };
  readonly nodeId?: string;
  readonly extension?: string;
  readonly details?: Readonly<Record<string, MdfnJsonValue>>;
}

export interface TextSelection {
  readonly kind: "text";
  readonly anchor: number;
  readonly head: number;
}

export interface NodeSelection {
  readonly kind: "node";
  readonly nodeId: string;
}

export type MdfnSelection = TextSelection | NodeSelection | null;

export interface SidecarAnchor {
  readonly from: number;
  readonly to: number;
  readonly affinity?: "before" | "after";
}

export interface CommentMessage {
  readonly id: string;
  readonly authorId: string;
  readonly body: string;
  readonly createdAt: string;
  readonly updatedAt?: string;
}

export interface CommentThread {
  readonly id: string;
  readonly anchor: SidecarAnchor;
  readonly resolved: boolean;
  readonly messages: readonly CommentMessage[];
}

export interface Suggestion {
  readonly id: string;
  readonly anchor: SidecarAnchor;
  readonly replacement: string;
  readonly authorId: string;
  readonly status: "pending" | "accepted" | "rejected";
  readonly createdAt: string;
}

export type ReviewState = "draft" | "in-review" | "changes-requested" | "approved";

export interface EditorialAuditEntry {
  readonly id: string;
  readonly action: "comment-created" | "comment-replied" | "comment-resolved" | "comment-reopened" | "suggestion-created" | "suggestion-accepted" | "suggestion-rejected" | "review-transitioned";
  readonly actorId: string;
  readonly targetId?: string;
  readonly createdAt: string;
  readonly details?: Readonly<Record<string, MdfnJsonValue>>;
}

export interface AssetMetadata {
  readonly id: string;
  readonly mediaType: string;
  readonly name?: string;
  readonly byteSize?: number;
  readonly metadata?: Readonly<Record<string, MdfnJsonValue>>;
}

export interface MdfnSidecar {
  readonly comments?: readonly CommentThread[];
  readonly suggestions?: readonly Suggestion[];
  readonly assets?: readonly AssetMetadata[];
  readonly historyRef?: string;
  readonly reviewState?: ReviewState;
  readonly audit?: readonly EditorialAuditEntry[];
}

export interface MdfnSnapshot {
  readonly format: "mdfn";
  readonly version: 1;
  readonly markdown: string;
  readonly document?: MdfnDocument;
  readonly schemaHash: string;
  readonly sourceHash: string;
  /** Hash of the source-bound projected document; caches are still reparsed before acceptance. */
  readonly documentHash?: string;
  readonly diagnostics: readonly MdfnDiagnostic[];
  readonly sidecar?: MdfnSidecar;
}

export interface ParseResult {
  readonly document: MdfnDocument;
  readonly diagnostics: readonly MdfnDiagnostic[];
  readonly sourceHash?: string;
}

export interface SerializeResult {
  readonly markdown: string;
  readonly diagnostics: readonly MdfnDiagnostic[];
  readonly preservation: {
    readonly exactUntouched: boolean;
    readonly semanticSupported: boolean;
    readonly opaqueUnsupported: boolean;
    readonly touchedRegionOnly: boolean;
  };
}

export interface EditorProjector {
  parse(markdown: string): ParseResult;
  serialize(document: MdfnDocument, originalMarkdown: string): SerializeResult;
}

export interface EditorState {
  readonly version: number;
  readonly markdown: string;
  readonly document: MdfnDocument;
  readonly schemaHash: string;
  readonly sourceHash: string;
  readonly selection: MdfnSelection;
  readonly diagnostics: readonly MdfnDiagnostic[];
  readonly sidecar?: MdfnSidecar;
  readonly dirty: boolean;
}

export interface ChangedRange {
  readonly from: number;
  readonly to: number;
  readonly insertedLength: number;
}

export interface StateChange {
  readonly previous: EditorState;
  readonly current: EditorState;
  readonly changedRanges: readonly ChangedRange[];
  readonly documentChanged: boolean;
  readonly selectionChanged: boolean;
  readonly sidecarChanged: boolean;
  readonly source: string;
  readonly metadata: Readonly<Record<string, MdfnJsonValue>>;
}

export type EditorListener = (change: StateChange) => void;

export interface EditorCommandContext {
  readonly state: EditorState;
  dispatch(transaction: unknown): StateChange;
}

export type EditorCommand = (context: EditorCommandContext) => boolean;

export interface SchemaContribution {
  readonly nodes?: readonly string[];
  readonly marks?: readonly string[];
}

export interface ExtensionParseInput {
  readonly source: string;
  readonly offset: number;
  readonly line: string;
}

export interface ExtensionParseResult {
  readonly node: MdfnNode;
  readonly consumed: number;
  readonly diagnostics?: readonly MdfnDiagnostic[];
}

export interface ExtensionSerializeInput {
  readonly node: MdfnNode;
}

export interface ExtensionRenderInput {
  readonly node: MdfnNode;
  readonly escape: (value: string) => string;
}

export interface ExtensionRenderNode {
  readonly tag: string;
  readonly attrs?: Readonly<Record<string, string | number | boolean | null | undefined>>;
  readonly text?: string;
  readonly children?: readonly ExtensionRenderNode[];
}

export interface ExtensionTextRuleInput {
  readonly text: string;
  readonly source: string;
  readonly from: number;
  readonly to: number;
}

export interface ExtensionTextRule {
  readonly name: string;
  readonly match: RegExp;
  replace(match: RegExpMatchArray, input: ExtensionTextRuleInput): string | null;
}

export interface ExtensionPluginContext {
  getState(): EditorState;
  dispatch(transaction: unknown): StateChange;
  subscribe(listener: EditorListener): () => void;
}

export interface ExtensionPlugin {
  readonly name: string;
  setup(context: ExtensionPluginContext): void | (() => void);
}

export interface ExtensionCertificationManifest {
  readonly schemaVersion: 1;
  readonly fixtures: readonly string[];
  readonly capabilities: readonly ("parse" | "serialize" | "render" | "visual" | "commands" | "keymap" | "input" | "paste" | "plugins" | "diagnostics" | "migrations" | "security")[];
}

export interface ExtensionMigration {
  readonly from: number;
  readonly to: number;
  migrate(document: MdfnDocument): MdfnDocument;
}

export interface PreservationDeclaration {
  readonly noEdit: "exact" | "semantic";
  readonly edited: "touched-region" | "semantic";
  readonly unsupported: "opaque" | "diagnostic-only";
}

export interface MdfnExtension {
  readonly name: string;
  readonly version: string;
  readonly priority?: number;
  readonly dependencies?: readonly string[];
  readonly conflicts?: readonly string[];
  readonly schema?: SchemaContribution;
  readonly parseMarkdown?: (input: ExtensionParseInput) => ExtensionParseResult | null;
  readonly serializeMarkdown?: (input: ExtensionSerializeInput) => string | null;
  /** Structured, policy-checked output. Arbitrary HTML strings are rejected by the renderer. */
  readonly render?: (input: ExtensionRenderInput) => ExtensionRenderNode | null;
  /** Optional additional policy pass over structured render output. */
  readonly sanitizeRender?: (node: ExtensionRenderNode) => ExtensionRenderNode | null;
  /** Structured visual representation consumed by browser adapters. */
  readonly visual?: (input: ExtensionRenderInput) => ExtensionRenderNode | null;
  readonly commands?: Readonly<Record<string, EditorCommand>>;
  readonly keymap?: Readonly<Record<string, string>>;
  readonly inputRules?: readonly ExtensionTextRule[];
  readonly pasteRules?: readonly ExtensionTextRule[];
  readonly plugins?: readonly ExtensionPlugin[];
  readonly migrations?: readonly ExtensionMigration[];
  readonly diagnostics?: (document: MdfnDocument) => readonly MdfnDiagnostic[];
  readonly preservation: PreservationDeclaration;
  readonly security?: {
    readonly allowsRawHtml?: boolean;
    readonly urlSchemes?: readonly string[];
    readonly executesContent?: boolean;
  };
  readonly certification?: ExtensionCertificationManifest;
}
