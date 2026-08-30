import { Transaction, mapSelection, type EditorController, type MdfnDiagnostic, type MdfnNode, type ReviewState, type TextSelection } from "@mdfn/core";

export type EditorMode = "visual" | "source" | "split" | "preview" | "read-only";

export interface ToolbarAction {
  readonly id: string;
  readonly label: string;
  readonly command?: string;
  readonly shortcut?: string;
  readonly pressed?: boolean;
  readonly disabled?: boolean;
}

export interface ToolbarGroup {
  readonly id: string;
  readonly label: string;
  readonly actions: readonly ToolbarAction[];
}

export interface ToolbarModel {
  readonly ariaLabel: string;
  readonly groups: readonly ToolbarGroup[];
}

export interface ToolbarCommandTarget {
  can?(command: string): boolean;
  run(command: string): boolean;
}

export interface MarkdownInsertionTarget {
  insertMarkdown(markdown: string): boolean;
}

/** Insert through the active visual surface, or fall back to the canonical controller selection. */
export function insertMarkdownAtSelection(
  controller: EditorController,
  target: MarkdownInsertionTarget | null | undefined,
  markdown: string,
  selection?: TextSelection,
): void {
  if (!selection && target?.insertMarkdown(markdown)) return;
  const state = controller.getState();
  const insertionSelection = selection ?? (state.selection?.kind === "text"
    ? state.selection
    : { kind: "text", anchor: state.markdown.length, head: state.markdown.length });
  const from = Math.min(insertionSelection.anchor, insertionSelection.head);
  const to = Math.max(insertionSelection.anchor, insertionSelection.head);
  controller.dispatch(
    new Transaction()
      .replaceSource(from, to, markdown)
      .setSelection({ kind: "text", anchor: from + markdown.length, head: from + markdown.length })
      .withSource("components:file-insert"),
  );
}

/** Keep an asynchronous file insertion anchored to the selection where it started. */
export function captureMarkdownInsertion(controller: EditorController, signal?: AbortSignal): {
  insert(markdown: string): void;
  cancel(): void;
} {
  const state = controller.getState();
  let selection: TextSelection = state.selection?.kind === "text"
    ? state.selection
    : { kind: "text", anchor: state.markdown.length, head: state.markdown.length };
  let active = true;
  const unsubscribe = controller.subscribe((change) => {
    if (!active || change.changedRanges.length === 0) return;
    const mapped = mapSelection(selection, change.changedRanges);
    if (mapped?.kind === "text") selection = mapped;
  });
  const cancel = (): void => {
    if (!active) return;
    active = false;
    unsubscribe();
    signal?.removeEventListener("abort", cancel);
  };
  if (signal?.aborted) cancel();
  else signal?.addEventListener("abort", cancel, { once: true });
  return {
    insert(markdown) {
      if (!active) return;
      cancel();
      insertMarkdownAtSelection(controller, null, markdown, selection);
    },
    cancel,
  };
}

export const defaultToolbarGroups: readonly ToolbarGroup[] = Object.freeze([
  { id: "history", label: "History", actions: [{ id: "undo", label: "Undo", shortcut: "Mod-z" }, { id: "redo", label: "Redo", shortcut: "Mod-Shift-z" }] },
  { id: "inline", label: "Inline formatting", actions: [{ id: "bold", label: "Bold", command: "bold", shortcut: "Mod-b" }, { id: "italic", label: "Italic", command: "italic", shortcut: "Mod-i" }, { id: "code", label: "Code", command: "inline-code" }] },
  { id: "blocks", label: "Blocks", actions: [{ id: "heading-2", label: "Heading", command: "heading-2" }, { id: "bullet-list", label: "Bullet list", command: "bullet-list" }, { id: "ordered-list", label: "Numbered list", command: "ordered-list" }, { id: "blockquote", label: "Quote", command: "blockquote" }, { id: "code-block", label: "Code block", command: "code-block" }] },
]);

export interface SlashCommand {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly keywords: readonly string[];
  readonly kind: "command" | "link" | "table" | "file" | "comment";
  readonly command?: string;
}

export const defaultSlashCommands: readonly SlashCommand[] = Object.freeze([
  { id: "paragraph", label: "Paragraph", description: "Start a text paragraph", keywords: ["text", "body"], kind: "command", command: "paragraph" },
  { id: "heading-1", label: "Heading 1", description: "Insert a top-level heading", keywords: ["title", "h1"], kind: "command", command: "heading-1" },
  { id: "heading-2", label: "Heading 2", description: "Insert a section heading", keywords: ["subtitle", "h2"], kind: "command", command: "heading-2" },
  { id: "bullet-list", label: "Bullet list", description: "Create an unordered list", keywords: ["ul", "list"], kind: "command", command: "bullet-list" },
  { id: "ordered-list", label: "Numbered list", description: "Create an ordered list", keywords: ["ol", "steps"], kind: "command", command: "ordered-list" },
  { id: "blockquote", label: "Quote", description: "Create a block quote", keywords: ["quote", "citation"], kind: "command", command: "blockquote" },
  { id: "code-block", label: "Code block", description: "Create a fenced code block", keywords: ["code", "fence"], kind: "command", command: "code-block" },
  { id: "link", label: "Link", description: "Add or edit a safe link", keywords: ["url", "href"], kind: "link" },
  { id: "table", label: "Table", description: "Insert a table", keywords: ["grid", "rows", "columns"], kind: "table" },
  { id: "file", label: "File or image", description: "Select or upload an asset", keywords: ["asset", "upload", "image"], kind: "file" },
  { id: "comment", label: "Comment", description: "Comment on the current selection", keywords: ["review", "note"], kind: "comment" },
]);

export function filterSlashCommands(query: string, commands: readonly SlashCommand[] = defaultSlashCommands): readonly SlashCommand[] {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return commands;
  return commands.filter((command) => {
    const haystack = [command.label, command.description, command.id, ...command.keywords].join(" ").toLocaleLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

export interface OutlineItem {
  readonly id: string;
  readonly level: number;
  readonly text: string;
  readonly from?: number;
}

function plainText(node: MdfnNode): string {
  if (node.type === "text" || node.type === "inlineCode") return node.text ?? "";
  return (node.content ?? []).map(plainText).join("");
}

export interface AuthoringModel {
  readonly version: number;
  readonly mode: EditorMode;
  readonly compact: boolean;
  readonly toolbar: ToolbarModel;
  readonly bubble: ToolbarModel;
  readonly floating: ToolbarModel;
  readonly bubbleVisible: boolean;
  readonly floatingVisible: boolean;
  readonly slashOpen: boolean;
  readonly slashCommands: readonly SlashCommand[];
  readonly outline: readonly OutlineItem[];
  readonly diagnostics: readonly MdfnDiagnostic[];
  readonly comments: NonNullable<ReturnType<EditorController["getState"]>["sidecar"]>["comments"];
  readonly suggestions: NonNullable<ReturnType<EditorController["getState"]>["sidecar"]>["suggestions"];
  readonly reviewState: ReviewState;
  readonly audit: NonNullable<ReturnType<EditorController["getState"]>["sidecar"]>["audit"];
}

export function createAuthoringModel(
  controller: EditorController,
  options: { readonly mode?: EditorMode; readonly compact?: boolean; readonly slashQuery?: string; readonly slashOpen?: boolean; readonly commandTarget?: ToolbarCommandTarget | null } = {},
): AuthoringModel {
  const state = controller.getState();
  const selection = state.selection?.kind === "text" ? state.selection : null;
  const selectionFrom = selection ? Math.min(selection.anchor, selection.head) : 0;
  const selectionTo = selection ? Math.max(selection.anchor, selection.head) : 0;
  const beforeCaret = selection && selectionFrom === selectionTo ? state.markdown.slice(state.markdown.lastIndexOf("\n", selectionFrom - 1) + 1, selectionFrom) : "";
  const slashMatch = /^\s*\/([^\s/]*)$/.exec(beforeCaret);
  const inlineGroups = defaultToolbarGroups.filter((group) => group.id === "inline");
  const blockGroups = defaultToolbarGroups.filter((group) => group.id === "blocks");
  return {
    version: state.version,
    mode: options.mode ?? "visual",
    compact: options.compact ?? false,
    toolbar: createToolbarModel(controller, defaultToolbarGroups, "Markdown authoring toolbar", options.commandTarget),
    bubble: createToolbarModel(controller, inlineGroups, "Selection formatting", options.commandTarget),
    floating: createToolbarModel(controller, blockGroups, "Block formatting", options.commandTarget),
    bubbleVisible: Boolean(selection && selectionFrom !== selectionTo),
    floatingVisible: Boolean(selection && selectionFrom === selectionTo),
    slashOpen: options.slashOpen === true || Boolean(slashMatch),
    slashCommands: filterSlashCommands(options.slashQuery ?? slashMatch?.[1] ?? ""),
    outline: state.document.content.flatMap((node, index) => node.type === "heading" ? [{ id: node.id ?? `heading-${index}`, level: typeof node.attrs?.level === "number" ? node.attrs.level : 1, text: plainText(node), from: node.source?.from }] : []),
    diagnostics: state.diagnostics,
    comments: state.sidecar?.comments ?? [],
    suggestions: state.sidecar?.suggestions ?? [],
    reviewState: state.sidecar?.reviewState ?? "draft",
    audit: state.sidecar?.audit ?? [],
  };
}

/** Framework-neutral version descriptor used by every authoring adapter. */
export interface AuthoringVersion {
  readonly version: number;
  readonly createdAt?: string;
  readonly authorId?: string;
  readonly changeSource?: string;
}

export function createToolbarModel(controller: EditorController, groups: readonly ToolbarGroup[] = defaultToolbarGroups, ariaLabel = "Markdown formatting", commandTarget?: ToolbarCommandTarget | null): ToolbarModel {
  const canRun = (command: string): boolean => commandTarget?.can?.(command) ?? controller.can(command);
  return {
    ariaLabel,
    groups: groups.map((group) => ({
      ...group,
      actions: group.actions.map((action) => ({
        ...action,
        disabled: action.id === "undo" ? !(commandTarget?.can?.("undo") ?? controller.canUndo()) : action.id === "redo" ? !(commandTarget?.can?.("redo") ?? controller.canRedo()) : action.command ? !canRun(action.command) : action.disabled,
      })),
    })),
  };
}

export function runToolbarAction(controller: EditorController, action: ToolbarAction, commandTarget?: ToolbarCommandTarget | null): boolean {
  if (action.disabled) return false;
  if (commandTarget) return commandTarget.run(action.command ?? action.id);
  if (action.id === "undo") return controller.undo();
  if (action.id === "redo") return controller.redo();
  return action.command ? controller.run(action.command) : false;
}

export const MDFN_COMPONENTS_VERSION = "0.1.0" as const;
