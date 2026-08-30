import { createMemo, createSignal, For, Index, onCleanup, Show, type Component } from "solid-js";
import { Button, Card, Input, ToolbarButton, ToolbarRoot } from "@uifn/components-solid";
import { captureMarkdownInsertion, createAuthoringModel, createToolbarModel, runToolbarAction, type AuthoringVersion, type SlashCommand, type ToolbarCommandTarget, type ToolbarGroup } from "@mdfn/components";
import { Transaction, canTransitionReview, createCommentThread, createSuggestion, decideSuggestion, replyToComment, setCommentResolved, transitionReview, type EditorController, type EditorialActor, type ReviewState } from "@mdfn/core";
import { MdfnEditor, createMdfnSignal, type MdfnEditorHandle, type MdfnEditorProps } from "@mdfn/solid";

type EditorMode = NonNullable<MdfnEditorProps["mode"]>;

export const MdfnToolbar: Component<{ controller: EditorController; groups?: readonly ToolbarGroup[]; ariaLabel?: string; class?: string; commandTarget?: ToolbarCommandTarget | null }> = (props) => {
  const snapshot = createMdfnSignal(props.controller);
  const model = () => { snapshot().version; return createToolbarModel(props.controller, props.groups, props.ariaLabel, props.commandTarget); };
  return <ToolbarRoot class={props.class} data-mdfn-component="toolbar" aria-label={model().ariaLabel}>
    <Index each={model().groups}>{(group) => <span role="group" aria-label={group().label} data-mdfn-toolbar-group={group().id}>
      <Index each={group().actions}>{(action) => <ToolbarButton value={action().id} type="button" disabled={action().disabled} aria-label={action().label} aria-pressed={action().pressed} title={action().shortcut ? `${action().label} (${action().shortcut})` : action().label} onClick={() => runToolbarAction(props.controller, action(), props.commandTarget)}>{action().label}</ToolbarButton>}</Index>
    </span>}</Index>
  </ToolbarRoot>;
};

export interface MdfnEditorShellProps extends MdfnEditorProps { readonly toolbarGroups?: readonly ToolbarGroup[]; readonly hideToolbar?: boolean; readonly hideAuthoringChrome?: boolean; readonly actor?: EditorialActor; readonly onSelectFiles?: (files: readonly File[]) => Promise<string | undefined>; readonly onModeChange?: (mode: EditorMode) => void; readonly versions?: readonly AuthoringVersion[]; readonly onRestoreVersion?: (version: number) => void | Promise<void>; }
export const MdfnEditorShell: Component<MdfnEditorShellProps> = (props) => {
  const readOnly = (): boolean => props.readOnly === true || props.mode === "read-only";
  const insertionLifecycle = createMemo(() => {
    props.controller;
    const lifecycle = new AbortController();
    onCleanup(() => lifecycle.abort());
    return lifecycle;
  });
  const [commandTarget, setCommandTarget] = createSignal<ToolbarCommandTarget | null>(null);
  const [editor, setEditorHandle] = createSignal<MdfnEditorHandle | null>(null);
  const setEditor = (value: MdfnEditorHandle | null): void => {
    setEditorHandle(value);
    setCommandTarget(value ? {
      can: (command) => value.can(command as Parameters<MdfnEditorHandle["can"]>[0]),
      run: (command) => value.run(command as Parameters<MdfnEditorHandle["run"]>[0]),
    } : null);
    props.editorRef?.(value);
  };
  return <div class={props.class} data-mdfn-component="editor-shell">
    {!props.hideToolbar && !readOnly() && <MdfnToolbar controller={props.controller} groups={props.toolbarGroups} commandTarget={commandTarget()} />}
    {!props.hideAuthoringChrome && <MdfnAuthoringChrome controller={props.controller} editor={editor()} mode={props.mode} readOnly={readOnly()} actor={props.actor} onSelectFiles={props.onSelectFiles} onModeChange={props.onModeChange} versions={props.versions} onRestoreVersion={props.onRestoreVersion} />}
    <MdfnEditor
      controller={props.controller}
      mode={props.mode}
      readOnly={readOnly()}
      ariaLabel={props.ariaLabel}
      onLoadError={props.onLoadError}
      onFiles={async (files) => {
        const insertion = captureMarkdownInsertion(props.controller, insertionLifecycle().signal);
        try {
          const markdown = await props.onSelectFiles?.(files);
          if (markdown) insertion.insert(markdown);
          else insertion.cancel();
          await props.onFiles?.(files);
        } catch (error) {
          insertion.cancel();
          throw error;
        }
      }}
      editorRef={setEditor}
    />
  </div>;
};

export interface MdfnAuthoringChromeProps { readonly controller: EditorController; readonly editor?: MdfnEditorHandle | null; readonly mode?: EditorMode; readonly readOnly?: boolean; readonly compact?: boolean; readonly actor?: EditorialActor; readonly onSelectFiles?: (files: readonly File[]) => Promise<string | undefined>; readonly onModeChange?: (mode: EditorMode) => void; readonly versions?: readonly AuthoringVersion[]; readonly onRestoreVersion?: (version: number) => void | Promise<void>; }
const editorModes: readonly EditorMode[] = ["visual", "source", "split", "preview", "read-only"];

export const MdfnAuthoringChrome: Component<MdfnAuthoringChromeProps> = (props) => {
  const readOnly = (): boolean => props.readOnly === true || props.mode === "read-only";
  const insertionLifecycle = createMemo(() => {
    props.controller;
    const lifecycle = new AbortController();
    onCleanup(() => lifecycle.abort());
    return lifecycle;
  });
  const snapshot = createMdfnSignal(props.controller);
  const [slashQuery, setSlashQuery] = createSignal("");
  const [link, setLink] = createSignal("");
  const [rows, setRows] = createSignal(2);
  const [columns, setColumns] = createSignal(2);
  const [comment, setComment] = createSignal("");
  const [suggestion, setSuggestion] = createSignal("");
  const [replies, setReplies] = createSignal<Record<string, string>>({});
  const [slashOpen, setSlashOpen] = createSignal(false);
  const actor = () => props.actor ?? { id: "local-author" };
  const model = createMemo(() => { snapshot().version; return createAuthoringModel(props.controller, { mode: props.mode, compact: props.compact, slashQuery: slashQuery(), slashOpen: slashOpen() }); });
  const commandTarget = (): ToolbarCommandTarget | null => props.editor ? { can: (command) => props.editor?.can(command as Parameters<MdfnEditorHandle["can"]>[0]) ?? false, run: (command) => props.editor?.run(command as Parameters<MdfnEditorHandle["run"]>[0]) ?? false } : null;
  const updateSidecar = (sidecar: NonNullable<ReturnType<EditorController["getState"]>["sidecar"]>, source: string): void => { props.controller.dispatch(new Transaction().setSidecar(sidecar).withSource(source)); };
  const addComment = (): void => {
    const state = props.controller.getState();
    const selection = state.selection?.kind === "text" ? state.selection : { anchor: 0, head: 0 };
    const result = createCommentThread({ sidecar: state.sidecar, anchor: { from: Math.min(selection.anchor, selection.head), to: Math.max(selection.anchor, selection.head) }, body: comment(), actor: actor(), markdownLength: state.markdown.length });
    updateSidecar(result.sidecar, "editorial:comment"); setComment("");
  };
  const setReview = (to: ReviewState): void => updateSidecar(transitionReview({ sidecar: props.controller.getState().sidecar, to, actor: actor() }), "editorial:review");
  const selectionRange = (): { from: number; to: number } => {
    const selection = props.controller.getState().selection;
    return selection?.kind === "text" ? { from: Math.min(selection.anchor, selection.head), to: Math.max(selection.anchor, selection.head) } : { from: 0, to: 0 };
  };
  const addSuggestion = (): void => {
    const state = props.controller.getState();
    const result = createSuggestion({ sidecar: state.sidecar, anchor: selectionRange(), replacement: suggestion(), actor: actor(), markdownLength: state.markdown.length });
    updateSidecar(result.sidecar, "editorial:suggestion");
    setSuggestion("");
  };
  const runSlash = (item: SlashCommand): void => {
    if (item.kind === "command" && item.command) props.editor?.run(item.command as Parameters<MdfnEditorHandle["run"]>[0]);
    if (item.kind === "table") props.editor?.insertTable(rows(), columns());
    if (item.kind === "link" && link()) props.editor?.setLink(link());
    setSlashOpen(false);
  };
  return <section data-mdfn-component="authoring-chrome" data-compact={model().compact ? "true" : "false"} aria-label="Markdown authoring controls">
    <nav aria-label="Editor mode" data-mdfn-surface="mode-switcher"><For each={editorModes}>{(mode) => <Button type="button" aria-pressed={props.mode === mode} disabled={!props.onModeChange} onClick={() => props.onModeChange?.(mode)}>{mode}</Button>}</For></nav>
    <Show when={!readOnly() && model().bubbleVisible}><div data-mdfn-surface="bubble-toolbar"><MdfnToolbar controller={props.controller} groups={model().bubble.groups} commandTarget={commandTarget()} ariaLabel="Selection formatting" /></div></Show>
    <Show when={!readOnly() && model().floatingVisible}><div data-mdfn-surface="floating-toolbar"><MdfnToolbar controller={props.controller} groups={model().floating.groups} commandTarget={commandTarget()} ariaLabel="Block formatting" /></div></Show>
    <Show when={!readOnly()}><Button type="button" aria-expanded={model().slashOpen} aria-controls="mdfn-insert-menu" onClick={() => setSlashOpen((value) => !value)}>Insert</Button></Show>
    <Show when={!readOnly() && model().slashOpen}><Card id="mdfn-insert-menu" data-mdfn-surface="slash-menu"><Card.Header><Card.Title>Insert</Card.Title></Card.Header><Card.Content><Input aria-label="Filter insert commands" value={slashQuery()} onInput={(event) => setSlashQuery(event.currentTarget.value)} /><div role="listbox" aria-label="Insert commands"><For each={model().slashCommands}>{(item) => <Button type="button" role="option" onClick={() => runSlash(item)}>{item.label}</Button>}</For></div></Card.Content></Card></Show>
    <Show when={!readOnly()}><Card data-mdfn-surface="link-editor"><Card.Header><Card.Title>Link</Card.Title></Card.Header><Card.Content><Input type="url" aria-label="Link URL" value={link()} onInput={(event) => setLink(event.currentTarget.value)} /><Button type="button" onClick={() => props.editor?.setLink(link())}>Apply link</Button><Button type="button" onClick={() => props.editor?.removeLink()}>Remove link</Button></Card.Content></Card></Show>
    <Show when={!readOnly()}><Card data-mdfn-surface="table-controls"><Card.Header><Card.Title>Table</Card.Title></Card.Header><Card.Content><Input type="number" min={1} max={100} aria-label="Table rows" value={rows()} onInput={(event) => setRows(Number(event.currentTarget.value))} /><Input type="number" min={1} max={100} aria-label="Table columns" value={columns()} onInput={(event) => setColumns(Number(event.currentTarget.value))} /><Button type="button" onClick={() => props.editor?.insertTable(rows(), columns())}>Insert table</Button></Card.Content></Card></Show>
    <Show when={!readOnly()}><Card data-mdfn-surface="file-controls"><Card.Header><Card.Title>Files</Card.Title></Card.Header><Card.Content><Input type="file" aria-label="Select files" multiple onChange={(event) => { const files = [...(event.currentTarget.files ?? [])]; const insertion = captureMarkdownInsertion(props.controller, insertionLifecycle().signal); const upload = props.onSelectFiles?.(files); if (!upload) { insertion.cancel(); return; } void upload.then((markdown) => { if (markdown) insertion.insert(markdown); else insertion.cancel(); }, () => insertion.cancel()); }} /></Card.Content></Card></Show>
    <nav data-mdfn-surface="outline" aria-label="Document outline"><ol><For each={model().outline}>{(item) => <li data-level={item.level}><Button type="button" onClick={() => item.from !== undefined && props.controller.dispatch(new Transaction().setSelection({ kind: "text", anchor: item.from, head: item.from }).withSource("outline"))}>{item.text}</Button></li>}</For></ol></nav>
    <aside data-mdfn-surface="diagnostics" aria-label="Markdown diagnostics" aria-live="polite"><ul><For each={model().diagnostics}>{(diagnostic) => <li data-severity={diagnostic.severity}>{diagnostic.message}</li>}</For></ul></aside>
    <Card data-mdfn-surface="editorial"><Card.Header><Card.Title>Review</Card.Title></Card.Header><Card.Content><p>State: {model().reviewState}</p><Show when={!readOnly()}><Input aria-label="Comment" value={comment()} onInput={(event) => setComment(event.currentTarget.value)} /><Button type="button" disabled={!comment().trim()} onClick={addComment}>Add comment</Button><Input aria-label="Suggestion replacement" value={suggestion()} onInput={(event) => setSuggestion(event.currentTarget.value)} /><Button type="button" onClick={addSuggestion}>Add suggestion</Button></Show><ul aria-label="Comments"><For each={model().comments ?? []}>{(thread) => <li><For each={thread.messages}>{(message) => <p>{message.body}</p>}</For>{thread.resolved ? "Resolved" : "Open"} <Show when={!readOnly()}><Input aria-label={`Reply to comment ${thread.id}`} value={replies()[thread.id] ?? ""} onInput={(event) => setReplies((current) => ({ ...current, [thread.id]: event.currentTarget.value }))} /><Button type="button" disabled={!(replies()[thread.id] ?? "").trim()} onClick={() => { updateSidecar(replyToComment({ sidecar: props.controller.getState().sidecar ?? {}, threadId: thread.id, body: replies()[thread.id] ?? "", actor: actor() }), "editorial:comment-reply"); setReplies((current) => ({ ...current, [thread.id]: "" })); }}>Reply</Button><Button type="button" onClick={() => updateSidecar(setCommentResolved({ sidecar: props.controller.getState().sidecar ?? {}, threadId: thread.id, resolved: !thread.resolved, actor: actor() }), "editorial:comment-resolution")}>{thread.resolved ? "Reopen" : "Resolve"}</Button></Show></li>}</For></ul><ul aria-label="Suggestions"><For each={model().suggestions ?? []}>{(entry) => <li>{entry.replacement} ({entry.status}) <Show when={entry.status === "pending" && !readOnly()}><Button type="button" onClick={() => decideSuggestion({ controller: props.controller, suggestionId: entry.id, decision: "accepted", actor: actor() })}>Accept</Button><Button type="button" onClick={() => decideSuggestion({ controller: props.controller, suggestionId: entry.id, decision: "rejected", actor: actor() })}>Reject</Button></Show></li>}</For></ul><Show when={!readOnly()}><div aria-label="Review transitions"><For each={["draft", "in-review", "changes-requested", "approved"] as const}>{(state) => <Button type="button" disabled={state === model().reviewState || !canTransitionReview(model().reviewState, state)} onClick={() => setReview(state)}>{state}</Button>}</For></div></Show></Card.Content></Card>
    <Card data-mdfn-surface="history"><Card.Header><Card.Title>Version history</Card.Title></Card.Header><Card.Content><ol aria-label="Document versions"><For each={props.versions ?? []}>{(entry) => <li>Version {entry.version}{entry.authorId ? ` by ${entry.authorId}` : ""} <Show when={props.onRestoreVersion && !readOnly()}><Button type="button" onClick={() => void props.onRestoreVersion?.(entry.version)}>Restore</Button></Show></li>}</For></ol><ol aria-label="Editorial activity"><For each={model().audit ?? []}>{(entry) => <li>{entry.action} by {entry.actorId}</li>}</For></ol></Card.Content></Card>
  </section>;
};

export { MdfnEditor } from "@mdfn/solid";
export const MDFN_COMPONENTS_SOLID_VERSION = "0.1.0" as const;
