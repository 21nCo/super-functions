import { applyExtensionTextRules, Transaction as MdfnTransaction, inspectMdfnUrl, type EditorController, type ExtensionRenderNode, type MdfnDocument, type MdfnNode } from "@mdfn/core";
import { baseKeymap, createParagraphNear, exitCode, liftEmptyBlock, newlineInCode, setBlockType, splitBlock, toggleMark, wrapIn } from "prosemirror-commands";
import { dropCursor } from "prosemirror-dropcursor";
import { gapCursor } from "prosemirror-gapcursor";
import { keymap } from "prosemirror-keymap";
import { liftListItem, sinkListItem, splitListItem, wrapInList } from "prosemirror-schema-list";
import { EditorState as PmEditorState, Plugin as PmPlugin, TextSelection as PmTextSelection, type Command as PmCommand } from "prosemirror-state";
import { addColumnAfter, addRowAfter, deleteColumn, deleteRow, tableEditing } from "prosemirror-tables";
import { EditorView } from "prosemirror-view";
import { documentToProseMirror, mdfnSchema, proseMirrorToDocument } from "./schema";

export type DomCommand =
  | "undo" | "redo" | "bold" | "italic" | "strike" | "inline-code"
  | "paragraph" | "heading-1" | "heading-2" | "heading-3" | "blockquote" | "code-block"
  | "bullet-list" | "ordered-list" | "split-list-item" | "sink-list-item" | "lift-list-item"
  | "add-table-column" | "delete-table-column" | "add-table-row" | "delete-table-row";

export interface DomEditorOptions {
  readonly target: HTMLElement;
  readonly controller: EditorController;
  readonly readOnly?: boolean;
  readonly attributes?: Readonly<Record<string, string>>;
  readonly onFocus?: () => void;
  readonly onBlur?: () => void;
  readonly onFiles?: (files: readonly File[]) => void | Promise<void>;
}

export interface DomEditor {
  readonly view: EditorView;
  run(command: DomCommand): boolean;
  can(command: DomCommand): boolean;
  setLink(href: string, title?: string): boolean;
  removeLink(): boolean;
  insertTable(rows?: number, columns?: number): boolean;
  insertMarkdown(markdown: string): boolean;
  focus(): void;
  setReadOnly(readOnly: boolean): void;
  destroy(): void;
}

function controllerHistoryCommand(controller: EditorController, direction: "undo" | "redo"): PmCommand {
  return (_state, dispatch) => {
    const available = direction === "undo" ? controller.canUndo() : controller.canRedo();
    if (!available || !dispatch) return available;
    return direction === "undo" ? controller.undo() : controller.redo();
  };
}

function commandMap(controller: EditorController): Readonly<Record<DomCommand, PmCommand>> {
  return {
    undo: controllerHistoryCommand(controller, "undo"),
    redo: controllerHistoryCommand(controller, "redo"),
    bold: toggleMark(mdfnSchema.marks.strong),
    italic: toggleMark(mdfnSchema.marks.em),
    strike: toggleMark(mdfnSchema.marks.strike),
    "inline-code": toggleMark(mdfnSchema.marks.code),
    paragraph: setBlockType(mdfnSchema.nodes.paragraph),
    "heading-1": setBlockType(mdfnSchema.nodes.heading, { level: 1 }),
    "heading-2": setBlockType(mdfnSchema.nodes.heading, { level: 2 }),
    "heading-3": setBlockType(mdfnSchema.nodes.heading, { level: 3 }),
    blockquote: wrapIn(mdfnSchema.nodes.blockquote),
    "code-block": setBlockType(mdfnSchema.nodes.code_block),
    "bullet-list": wrapInList(mdfnSchema.nodes.bullet_list),
    "ordered-list": wrapInList(mdfnSchema.nodes.ordered_list),
    "split-list-item": splitListItem(mdfnSchema.nodes.list_item),
    "sink-list-item": sinkListItem(mdfnSchema.nodes.list_item),
    "lift-list-item": liftListItem(mdfnSchema.nodes.list_item),
    "add-table-column": addColumnAfter,
    "delete-table-column": deleteColumn,
    "add-table-row": addRowAfter,
    "delete-table-row": deleteRow,
  };
}

interface PositionSegment {
  readonly pmFrom: number;
  readonly pmTo: number;
  readonly sourceFrom: number;
  readonly sourceTo: number;
}

function inlineLeaves(node: MdfnNode): readonly MdfnNode[] {
  if (["text", "inlineCode", "image", "asset", "opaque", "hardBreak"].includes(node.type)) return [node];
  return (node.content ?? []).flatMap(inlineLeaves);
}

function visualLength(node: MdfnNode): number {
  if (node.type === "text" || node.type === "inlineCode" || node.type === "codeBlock") return node.text?.length ?? 0;
  return 1;
}

function contentSourceRange(node: MdfnNode): { readonly from: number; readonly to: number } | undefined {
  const source = node.source;
  if (!source) return undefined;
  const text = node.text ?? "";
  const raw = source.raw;
  if (text && raw === text) return { from: source.from, to: source.to };
  if (text && typeof raw === "string") {
    if (node.type === "inlineCode" || node.type === "codeBlock") {
      const index = raw.indexOf(text);
      if (index >= 0) return { from: source.from + index, to: source.from + index + text.length };
    }
    if (node.type === "text" && raw.startsWith("\\") && raw.slice(1) === text) {
      return { from: source.from + 1, to: source.to };
    }
  }
  return { from: source.from, to: source.to };
}

function positionSegments(pmDocument: import("prosemirror-model").Node, document: MdfnDocument): readonly PositionSegment[] {
  const segments: PositionSegment[] = [];
  const walk = (pmNode: import("prosemirror-model").Node, mdfnNode: MdfnNode | undefined, before: number, root = false): void => {
    if (!mdfnNode) return;
    if (pmNode.isTextblock) {
      const segmentCount = segments.length;
      const leaves = mdfnNode.type === "codeBlock" ? [mdfnNode] : inlineLeaves(mdfnNode);
      let offset = 0;
      for (const leaf of leaves) {
        const length = visualLength(leaf);
        const source = contentSourceRange(leaf);
        if (source && length > 0 && offset < pmNode.content.size) {
          const available = Math.min(length, pmNode.content.size - offset);
          segments.push({ pmFrom: before + 1 + offset, pmTo: before + 1 + offset + available, sourceFrom: source.from, sourceTo: source.to });
        }
        offset += length;
      }
      if (segments.length === segmentCount && mdfnNode.source) {
        segments.push({ pmFrom: before + 1, pmTo: before + 1, sourceFrom: mdfnNode.source.from, sourceTo: mdfnNode.source.to });
      }
      return;
    }
    if (pmNode.isAtom || pmNode.childCount === 0) {
      if (mdfnNode.source) segments.push({ pmFrom: before, pmTo: before + pmNode.nodeSize, sourceFrom: mdfnNode.source.from, sourceTo: mdfnNode.source.to });
      return;
    }
    pmNode.forEach((child, offset, index) => {
      walk(child, mdfnNode.content?.[index], root ? offset : before + 1 + offset);
    });
  };
  walk(pmDocument, document, -1, true);
  return segments;
}

function interpolate(position: number, from: number, to: number, mappedFrom: number, mappedTo: number): number {
  if (to <= from || mappedTo <= mappedFrom) return mappedFrom;
  const ratio = Math.max(0, Math.min(1, (position - from) / (to - from)));
  return Math.round(mappedFrom + ratio * (mappedTo - mappedFrom));
}

function pmPositionToSource(segments: readonly PositionSegment[], documentSize: number, position: number, fallback: number): number {
  const resolved = Math.max(0, Math.min(position, documentSize));
  const containing = segments.find((segment) => resolved >= segment.pmFrom && resolved <= segment.pmTo);
  if (containing) return interpolate(resolved, containing.pmFrom, containing.pmTo, containing.sourceFrom, containing.sourceTo);
  let nearest: { readonly distance: number; readonly source: number } | undefined;
  for (const segment of segments) {
    for (const [pm, source] of [[segment.pmFrom, segment.sourceFrom], [segment.pmTo, segment.sourceTo]] as const) {
      const distance = Math.abs(resolved - pm);
      if (!nearest || distance < nearest.distance) nearest = { distance, source };
    }
  }
  return Math.max(0, Math.min(nearest?.source ?? resolved, fallback));
}

function selectionFromPm(state: PmEditorState, document: MdfnDocument, markdownLength: number) {
  const segments = positionSegments(state.doc, document);
  return {
    kind: "text" as const,
    anchor: pmPositionToSource(segments, state.doc.content.size, state.selection.anchor, markdownLength),
    head: pmPositionToSource(segments, state.doc.content.size, state.selection.head, markdownLength),
  };
}

function sourcePositionToPm(segments: readonly PositionSegment[], documentSize: number, sourcePosition: number): number {
  const containing = segments.find((segment) => sourcePosition >= segment.sourceFrom && sourcePosition <= segment.sourceTo);
  if (containing) return interpolate(sourcePosition, containing.sourceFrom, containing.sourceTo, containing.pmFrom, containing.pmTo);
  let nearest: { readonly distance: number; readonly position: number } | undefined;
  for (const segment of segments) {
    for (const [source, position] of [[segment.sourceFrom, segment.pmFrom], [segment.sourceTo, segment.pmTo]] as const) {
      const distance = Math.abs(sourcePosition - source);
      if (!nearest || distance < nearest.distance) nearest = { distance, position };
    }
  }
  return Math.max(1, Math.min(documentSize, nearest?.position ?? sourcePosition + 1));
}

export function sanitizePastedHtml(html: string): string {
  const parser = new DOMParser();
  const document = parser.parseFromString(html, "text/html");
  document.querySelectorAll("script,style,iframe,object,embed").forEach((element) => element.remove());
  document.querySelectorAll("*").forEach((element) => {
    for (const attribute of [...element.attributes]) {
      if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name);
      const name = attribute.name.toLowerCase();
      if (name === "href" && !inspectMdfnUrl(attribute.value, { allowedSchemes: ["http", "https", "mailto"], allowRelative: true }).safe) element.removeAttribute(attribute.name);
      if (name === "src" && !inspectMdfnUrl(attribute.value, { allowedSchemes: ["http", "https"], allowRelative: true }).safe) element.removeAttribute(attribute.name);
    }
  });
  return document.body.innerHTML;
}

export function createDomEditor(options: DomEditorOptions): DomEditor {
  if (typeof document === "undefined") throw new Error("MDFN_DOM_BROWSER_REQUIRED");
  let readOnly = options.readOnly ?? false;
  let syncing = false;
  const commands = commandMap(options.controller);
  const whenEditable = (command: PmCommand): PmCommand => (state, dispatch, view) => !readOnly && command(state, dispatch, view);
  const extensionKeymap = Object.fromEntries(Object.entries(options.controller.extensions.keymap).map(([key, command]) => [key, () => !readOnly && options.controller.run(command)]));
  const editableBaseKeymap = Object.fromEntries(Object.entries(baseKeymap).map(([key, command]) => [key, whenEditable(command)]));
  const plugins = [
    new PmPlugin({ filterTransaction: (transaction) => !readOnly || !transaction.docChanged }),
    keymap(extensionKeymap),
    keymap({
      "Mod-z": whenEditable(commands.undo),
      "Shift-Mod-z": whenEditable(commands.redo),
      "Mod-y": whenEditable(commands.redo),
      "Mod-b": whenEditable(commands.bold),
      "Mod-i": whenEditable(commands.italic),
      "Mod-`": whenEditable(commands["inline-code"]),
      Enter: whenEditable(splitListItem(mdfnSchema.nodes.list_item)),
      "Mod-[": whenEditable(liftListItem(mdfnSchema.nodes.list_item)),
      "Mod-]": whenEditable(sinkListItem(mdfnSchema.nodes.list_item)),
    }),
    keymap({ Enter: whenEditable(createParagraphNear), "Mod-Enter": whenEditable(exitCode), Backspace: whenEditable(liftEmptyBlock), "Shift-Enter": whenEditable(newlineInCode), "Mod-Shift-\\": whenEditable(splitBlock) }),
    keymap(editableBaseKeymap),
    tableEditing(),
    gapCursor(),
    dropCursor(),
  ];
  let previousPmDocument = documentToProseMirror(options.controller.getState().document);
  const state = PmEditorState.create({ schema: mdfnSchema, doc: previousPmDocument, plugins });
  const view = new EditorView(options.target, {
    state,
    editable: () => !readOnly,
    attributes: { role: "textbox", "aria-multiline": "true", "data-mdfn-editor": "visual", ...(options.attributes ?? {}) },
    transformPastedHTML: sanitizePastedHtml,
    transformPastedText: (text) => {
      const state = options.controller.getState();
      const selection = state.selection?.kind === "text" ? state.selection : { anchor: 0, head: 0 };
      return applyExtensionTextRules(text, state.markdown, selection.anchor, selection.head, options.controller.extensions.pasteRules);
    },
    nodeViews: {
      extension_block(node) {
        let attrs: Record<string, unknown> = {};
        let content: readonly MdfnNode[] = [];
        try { attrs = JSON.parse(String(node.attrs.nodeAttrs)); } catch { attrs = {}; }
        try { content = JSON.parse(String(node.attrs.nodeContent)); } catch { content = []; }
        const extensionNode: MdfnNode = { type: String(node.attrs.nodeType), attrs: attrs as never, content, text: String(node.attrs.text ?? "") || undefined };
        let descriptor: ExtensionRenderNode | null = null;
        for (const extension of options.controller.extensions.extensions) {
          descriptor = extension.visual?.({ node: extensionNode, escape: (value) => value }) ?? null;
          if (descriptor) break;
        }
        if (!descriptor) return { dom: document.createElement("span") };
        const create = (entry: ExtensionRenderNode): HTMLElement => {
          if (!/^(?:aside|blockquote|code|div|em|figure|figcaption|kbd|mark|p|pre|section|small|span|strong|sub|sup)$/.test(entry.tag)) throw new Error("MDFN_EXTENSION_VISUAL_TAG_FORBIDDEN");
          const element = document.createElement(entry.tag);
          for (const [name, value] of Object.entries(entry.attrs ?? {})) {
            if (value == null || value === false || /^on/i.test(name) || name === "style" || name === "srcdoc" || name === "href" || name === "src") continue;
            if (name === "class" || name === "title" || name === "role" || name.startsWith("aria-") || name.startsWith("data-")) element.setAttribute(name, value === true ? "" : String(value));
          }
          if (entry.text) element.append(document.createTextNode(entry.text));
          for (const child of entry.children ?? []) element.append(create(child));
          return element;
        };
        const dom = create(descriptor);
        dom.contentEditable = "false";
        return { dom };
      },
    },
    handleDOMEvents: {
      focus: () => { options.onFocus?.(); return false; },
      blur: () => { options.onBlur?.(); return false; },
      drop: (_view, event) => {
        const files = [...((event as DragEvent).dataTransfer?.files ?? [])];
        if (files.length === 0) return false;
        event.preventDefault();
        if (options.onFiles && !readOnly) void options.onFiles(files);
        return true;
      },
      paste: (_view, event) => {
        const files = [...((event as ClipboardEvent).clipboardData?.files ?? [])];
        if (files.length === 0) return false;
        event.preventDefault();
        if (options.onFiles && !readOnly) void options.onFiles(files);
        return true;
      },
    },
    handleTextInput(_view, from, to, text) {
      const controllerState = options.controller.getState();
      const segments = positionSegments(_view.state.doc, controllerState.document);
      const sourceFrom = pmPositionToSource(segments, _view.state.doc.content.size, from, controllerState.markdown.length);
      const sourceTo = pmPositionToSource(segments, _view.state.doc.content.size, to, controllerState.markdown.length);
      const replacement = applyExtensionTextRules(text, controllerState.markdown, sourceFrom, sourceTo, options.controller.extensions.inputRules);
      if (replacement === text) return false;
      view.dispatch(view.state.tr.insertText(replacement, from, to));
      return true;
    },
    dispatchTransaction(transaction) {
      const next = view.state.apply(transaction);
      const before = view.state.doc;
      view.updateState(next);
      if (syncing) return;
      let edit = new MdfnTransaction().withSource(transaction.docChanged ? "visual:document" : "visual:selection");
      if (transaction.docChanged) {
        const document = proseMirrorToDocument(next.doc, before, options.controller.getState().document.schemaVersion);
        edit = edit.replaceDocument(document);
        previousPmDocument = next.doc;
      }
      if (transaction.selectionSet || transaction.docChanged) {
        const controllerState = options.controller.getState();
        edit = edit.setSelection(selectionFromPm(next, controllerState.document, controllerState.markdown.length));
      }
      if (edit.operations.length > 0) options.controller.dispatch(edit);
    },
  });

  const unsubscribe = options.controller.subscribe((change) => {
    if (change.source.startsWith("visual:")) return;
    if (!change.documentChanged && change.selectionChanged && change.current.selection?.kind === "text") {
      const segments = positionSegments(view.state.doc, change.current.document);
      const anchor = sourcePositionToPm(segments, view.state.doc.content.size, change.current.selection.anchor);
      const head = sourcePositionToPm(segments, view.state.doc.content.size, change.current.selection.head);
      const selection = PmTextSelection.create(view.state.doc, anchor, head);
      view.updateState(view.state.apply(view.state.tr.setSelection(selection).setMeta("addToHistory", false)));
      return;
    }
    const nextDoc = documentToProseMirror(change.current.document);
    if (view.state.doc.eq(nextDoc)) return;
    syncing = true;
    previousPmDocument = nextDoc;
    const nextState = PmEditorState.create({ schema: mdfnSchema, doc: nextDoc, plugins });
    if (change.current.selection?.kind === "text") {
      const segments = positionSegments(nextDoc, change.current.document);
      const anchor = sourcePositionToPm(segments, nextDoc.content.size, change.current.selection.anchor);
      const head = sourcePositionToPm(segments, nextDoc.content.size, change.current.selection.head);
      view.updateState(nextState.apply(nextState.tr.setSelection(PmTextSelection.create(nextDoc, anchor, head))));
    } else view.updateState(nextState);
    syncing = false;
  });

  return {
    view,
    run(command) {
      if (readOnly) return false;
      const resolved = commands[command];
      return resolved(view.state, view.dispatch, view);
    },
    can(command) {
      if (readOnly) return false;
      return commands[command](view.state, undefined, view);
    },
    setLink(href, title) {
      if (readOnly || !inspectMdfnUrl(href, { allowedSchemes: ["http", "https", "mailto"], allowRelative: true }).safe) return false;
      return toggleMark(mdfnSchema.marks.link, { href, title: title ?? null })(view.state, view.dispatch, view);
    },
    removeLink() {
      if (readOnly) return false;
      const { from, to } = view.state.selection;
      if (from === to) return false;
      view.dispatch(view.state.tr.removeMark(from, to, mdfnSchema.marks.link));
      return true;
    },
    insertTable(rows = 2, columns = 2) {
      if (readOnly || !Number.isInteger(rows) || !Number.isInteger(columns) || rows < 1 || columns < 1 || rows > 100 || columns > 100) return false;
      const tableRows = Array.from({ length: rows }, () => mdfnSchema.nodes.table_row.create(
        null,
        Array.from({ length: columns }, () => mdfnSchema.nodes.table_cell.create(
          null,
          mdfnSchema.nodes.paragraph.create(),
        )),
      ));
      const table = mdfnSchema.nodes.table.create(null, tableRows);
      view.dispatch(view.state.tr.replaceSelectionWith(table).scrollIntoView());
      return true;
    },
    insertMarkdown(markdown) {
      if (readOnly) return false;
      const state = options.controller.getState();
      const selection = state.selection?.kind === "text" ? state.selection : { anchor: state.markdown.length, head: state.markdown.length };
      const from = Math.min(selection.anchor, selection.head);
      const to = Math.max(selection.anchor, selection.head);
      options.controller.dispatch(new MdfnTransaction().replaceSource(from, to, markdown).setSelection({ kind: "text", anchor: from + markdown.length, head: from + markdown.length }).withSource("command:insert-markdown"));
      return true;
    },
    focus() { view.focus(); },
    setReadOnly(value) { readOnly = value; view.setProps({ editable: () => !readOnly }); },
    destroy() { unsubscribe(); view.destroy(); },
  };
}

export { mdfnSchema, documentToProseMirror, proseMirrorToDocument } from "./schema";
export const MDFN_DOM_VERSION = "0.1.0" as const;
