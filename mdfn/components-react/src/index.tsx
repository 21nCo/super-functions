"use client";

import * as React from "react";
import { Button, Card, Input, ToolbarButton, ToolbarRoot } from "@uifn/components-react";
import { createAuthoringModel, createToolbarModel, insertMarkdownAtSelection, runToolbarAction, type AuthoringVersion, type SlashCommand, type ToolbarCommandTarget, type ToolbarGroup } from "@mdfn/components";
import { Transaction, canTransitionReview, createCommentThread, createSuggestion, decideSuggestion, replyToComment, setCommentResolved, transitionReview, type EditorController, type EditorialActor, type ReviewState } from "@mdfn/core";
import { MdfnEditor, useMdfn, type MdfnEditorHandle, type MdfnEditorProps } from "@mdfn/react";

export interface MdfnToolbarProps extends Omit<React.ComponentProps<typeof ToolbarRoot>, "children"> {
  readonly controller: EditorController;
  readonly groups?: readonly ToolbarGroup[];
  readonly ariaLabel?: string;
  readonly commandTarget?: ToolbarCommandTarget | null;
}

export function MdfnToolbar({ controller, groups, ariaLabel, commandTarget, ...props }: MdfnToolbarProps): React.ReactElement {
  useMdfn(controller);
  const model = createToolbarModel(controller, groups, ariaLabel, commandTarget);
  return (
    <ToolbarRoot {...props} data-mdfn-component="toolbar" aria-label={model.ariaLabel}>
      {model.groups.map((group) => (
        <span key={group.id} role="group" aria-label={group.label} data-mdfn-toolbar-group={group.id}>
          {group.actions.map((action) => (
            <ToolbarButton key={action.id} value={action.id} type="button" disabled={action.disabled} aria-label={action.label} aria-pressed={action.pressed} title={action.shortcut ? `${action.label} (${action.shortcut})` : action.label} onClick={() => runToolbarAction(controller, action, commandTarget)}>
              {action.label}
            </ToolbarButton>
          ))}
        </span>
      ))}
    </ToolbarRoot>
  );
}

export interface MdfnEditorShellProps extends MdfnEditorProps {
  readonly toolbarGroups?: readonly ToolbarGroup[];
  readonly hideToolbar?: boolean;
  readonly hideAuthoringChrome?: boolean;
  readonly actor?: EditorialActor;
  readonly onSelectFiles?: (files: readonly File[]) => Promise<string | undefined>;
  readonly onModeChange?: (mode: MdfnEditorProps["mode"]) => void;
  readonly versions?: readonly AuthoringVersion[];
  readonly onRestoreVersion?: (version: number) => void | Promise<void>;
}

export const MdfnEditorShell = React.forwardRef<React.ElementRef<typeof MdfnEditor>, MdfnEditorShellProps>(function MdfnEditorShell(
  { toolbarGroups, hideToolbar, hideAuthoringChrome, actor, onSelectFiles, onModeChange, versions, onRestoreVersion, className, onReady, ...props }, forwardedRef,
) {
  const [commandTarget, setCommandTarget] = React.useState<ToolbarCommandTarget | null>(null);
  const [editorHandle, setEditorHandle] = React.useState<MdfnEditorHandle | null>(null);
  const editorHandleRef = React.useRef<MdfnEditorHandle | null>(null);
  const setEditorRef = React.useCallback((handle: MdfnEditorHandle | null) => {
    editorHandleRef.current = handle;
    setEditorHandle(handle);
    setCommandTarget(handle ? {
      can: (command) => handle.can(command as Parameters<MdfnEditorHandle["can"]>[0]),
      run: (command) => handle.run(command as Parameters<MdfnEditorHandle["run"]>[0]),
    } : null);
    if (typeof forwardedRef === "function") forwardedRef(handle);
    else if (forwardedRef) forwardedRef.current = handle;
  }, [forwardedRef]);
  const editorReady = React.useCallback((handle: MdfnEditorHandle) => {
    setCommandTarget({
      can: (command) => handle.can(command as Parameters<MdfnEditorHandle["can"]>[0]),
      run: (command) => handle.run(command as Parameters<MdfnEditorHandle["run"]>[0]),
    });
    onReady?.(handle);
  }, [onReady]);
  const handleFiles = React.useCallback(async (files: readonly File[]) => {
    const markdown = await onSelectFiles?.(files);
    if (markdown) insertMarkdownAtSelection(props.controller, editorHandleRef.current, markdown);
    await props.onFiles?.(files);
  }, [onSelectFiles, props.controller, props.onFiles]);
  return (
    <div className={className} data-mdfn-component="editor-shell">
      {!hideToolbar && !props.readOnly && <MdfnToolbar controller={props.controller} groups={toolbarGroups} commandTarget={commandTarget} />}
      {!hideAuthoringChrome && <MdfnAuthoringChrome controller={props.controller} editor={editorHandle} mode={props.mode} readOnly={props.readOnly} actor={actor} onSelectFiles={onSelectFiles} onModeChange={onModeChange} versions={versions} onRestoreVersion={onRestoreVersion} />}
      <MdfnEditor {...props} onFiles={handleFiles} ref={setEditorRef} onReady={editorReady} />
    </div>
  );
});

export interface MdfnAuthoringChromeProps {
  readonly controller: EditorController;
  readonly editor?: MdfnEditorHandle | null;
  readonly mode?: MdfnEditorProps["mode"];
  readonly readOnly?: boolean;
  readonly compact?: boolean;
  readonly actor?: EditorialActor;
  readonly onSelectFiles?: (files: readonly File[]) => Promise<string | undefined>;
  readonly onModeChange?: (mode: MdfnEditorProps["mode"]) => void;
  readonly versions?: readonly AuthoringVersion[];
  readonly onRestoreVersion?: (version: number) => void | Promise<void>;
}

const modes = ["visual", "source", "split", "preview", "read-only"] as const;

export function MdfnAuthoringChrome({ controller, editor, mode = "visual", readOnly, compact, actor, onSelectFiles, onModeChange, versions = [], onRestoreVersion }: MdfnAuthoringChromeProps): React.ReactElement {
  useMdfn(controller);
  const [slashQuery, setSlashQuery] = React.useState("");
  const [link, setLink] = React.useState("");
  const [rows, setRows] = React.useState(2);
  const [columns, setColumns] = React.useState(2);
  const [comment, setComment] = React.useState("");
  const [suggestion, setSuggestion] = React.useState("");
  const [replies, setReplies] = React.useState<Record<string, string>>({});
  const [slashOpen, setSlashOpen] = React.useState(false);
  const model = createAuthoringModel(controller, { mode, compact, slashQuery, slashOpen });
  const runSlash = (item: SlashCommand): void => {
    if (item.kind === "command" && item.command) editor?.run(item.command as Parameters<MdfnEditorHandle["run"]>[0]);
    if (item.kind === "table") editor?.insertTable(rows, columns);
    if (item.kind === "link" && link) editor?.setLink(link);
    setSlashOpen(false);
  };
  const currentActor = actor ?? { id: "local-author" };
  const updateSidecar = (sidecar: NonNullable<ReturnType<EditorController["getState"]>["sidecar"]>, source: string): void => {
    controller.dispatch(new Transaction().setSidecar(sidecar).withSource(source));
  };
  const setReview = (next: ReviewState): void => updateSidecar(transitionReview({ sidecar: controller.getState().sidecar, to: next, actor: currentActor }), "editorial:review");
  const addComment = (): void => {
    const state = controller.getState();
    const selection = state.selection?.kind === "text" ? state.selection : { anchor: 0, head: 0 };
    const result = createCommentThread({ sidecar: state.sidecar, anchor: { from: Math.min(selection.anchor, selection.head), to: Math.max(selection.anchor, selection.head) }, body: comment, actor: currentActor, markdownLength: state.markdown.length });
    updateSidecar(result.sidecar, "editorial:comment");
    setComment("");
  };
  const selectionRange = (): { from: number; to: number } => {
    const selection = controller.getState().selection;
    return selection?.kind === "text"
      ? { from: Math.min(selection.anchor, selection.head), to: Math.max(selection.anchor, selection.head) }
      : { from: 0, to: 0 };
  };
  const addSuggestion = (): void => {
    const state = controller.getState();
    const result = createSuggestion({ sidecar: state.sidecar, anchor: selectionRange(), replacement: suggestion, actor: currentActor, markdownLength: state.markdown.length });
    updateSidecar(result.sidecar, "editorial:suggestion");
    setSuggestion("");
  };
  return (
    <section data-mdfn-component="authoring-chrome" data-compact={model.compact ? "true" : "false"} aria-label="Markdown authoring controls">
      <nav aria-label="Editor mode" data-mdfn-surface="mode-switcher">
        {modes.map((item) => <Button key={item} type="button" aria-pressed={mode === item} disabled={!onModeChange} onClick={() => onModeChange?.(item)}>{item}</Button>)}
      </nav>
      {!readOnly && model.bubbleVisible && <MdfnToolbar controller={controller} groups={model.bubble.groups} commandTarget={editor ? { can: (command) => editor.can(command as Parameters<MdfnEditorHandle["can"]>[0]), run: (command) => editor.run(command as Parameters<MdfnEditorHandle["run"]>[0]) } : null} ariaLabel="Selection formatting" data-mdfn-surface="bubble-toolbar" />}
      {!readOnly && model.floatingVisible && <div data-mdfn-surface="floating-toolbar"><MdfnToolbar controller={controller} groups={model.floating.groups} commandTarget={editor ? { can: (command) => editor.can(command as Parameters<MdfnEditorHandle["can"]>[0]), run: (command) => editor.run(command as Parameters<MdfnEditorHandle["run"]>[0]) } : null} ariaLabel="Block formatting" /></div>}
      {!readOnly && <Button type="button" aria-expanded={model.slashOpen} aria-controls="mdfn-insert-menu" onClick={() => setSlashOpen((value) => !value)}>Insert</Button>}
      {!readOnly && model.slashOpen && <Card id="mdfn-insert-menu" data-mdfn-surface="slash-menu">
        <Card.Header><Card.Title>Insert</Card.Title></Card.Header>
        <Card.Content>
          <Input aria-label="Filter insert commands" value={slashQuery} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSlashQuery(event.currentTarget.value)} />
          <div role="listbox" aria-label="Insert commands">{model.slashCommands.map((item) => <Button key={item.id} type="button" role="option" onClick={() => runSlash(item)}>{item.label}</Button>)}</div>
        </Card.Content>
      </Card>}
      {!readOnly && <Card data-mdfn-surface="link-editor">
        <Card.Header><Card.Title>Link</Card.Title></Card.Header>
        <Card.Content><Input type="url" aria-label="Link URL" value={link} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setLink(event.currentTarget.value)} /><Button type="button" onClick={() => editor?.setLink(link)}>Apply link</Button><Button type="button" onClick={() => editor?.removeLink()}>Remove link</Button></Card.Content>
      </Card>}
      {!readOnly && <Card data-mdfn-surface="table-controls">
        <Card.Header><Card.Title>Table</Card.Title></Card.Header>
        <Card.Content><Input type="number" min={1} max={100} aria-label="Table rows" value={rows} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setRows(Number(event.currentTarget.value))} /><Input type="number" min={1} max={100} aria-label="Table columns" value={columns} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setColumns(Number(event.currentTarget.value))} /><Button type="button" onClick={() => editor?.insertTable(rows, columns)}>Insert table</Button></Card.Content>
      </Card>}
      {!readOnly && <Card data-mdfn-surface="file-controls">
        <Card.Header><Card.Title>Files</Card.Title></Card.Header>
        <Card.Content><Input type="file" aria-label="Select files" multiple onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
          const files = [...(event.currentTarget.files ?? [])];
          void onSelectFiles?.(files).then((markdown) => { if (markdown) insertMarkdownAtSelection(controller, editor, markdown); });
        }} /></Card.Content>
      </Card>}
      <MdfnOutline controller={controller} />
      <MdfnDiagnostics controller={controller} />
      <Card data-mdfn-surface="editorial">
        <Card.Header><Card.Title>Review</Card.Title></Card.Header>
        <Card.Content>
          <p>State: {model.reviewState}</p>
          {!readOnly && <><Input aria-label="Comment" value={comment} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setComment(event.currentTarget.value)} /><Button type="button" disabled={!comment.trim()} onClick={addComment}>Add comment</Button></>}
          {!readOnly && <><Input aria-label="Suggestion replacement" value={suggestion} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSuggestion(event.currentTarget.value)} /><Button type="button" onClick={addSuggestion}>Add suggestion</Button></>}
          <ul aria-label="Comments">{(model.comments ?? []).map((thread) => <li key={thread.id}>{thread.messages.map((message) => <p key={message.id}>{message.body}</p>)} {thread.resolved ? "Resolved" : "Open"} {!readOnly && <><Input aria-label={`Reply to comment ${thread.id}`} value={replies[thread.id] ?? ""} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setReplies((current) => ({ ...current, [thread.id]: event.currentTarget.value }))} /><Button type="button" disabled={!(replies[thread.id] ?? "").trim()} onClick={() => { updateSidecar(replyToComment({ sidecar: controller.getState().sidecar ?? {}, threadId: thread.id, body: replies[thread.id] ?? "", actor: currentActor }), "editorial:comment-reply"); setReplies((current) => ({ ...current, [thread.id]: "" })); }}>Reply</Button><Button type="button" onClick={() => updateSidecar(setCommentResolved({ sidecar: controller.getState().sidecar ?? {}, threadId: thread.id, resolved: !thread.resolved, actor: currentActor }), "editorial:comment-resolution")}>{thread.resolved ? "Reopen" : "Resolve"}</Button></>}</li>)}</ul>
          <ul aria-label="Suggestions">{(model.suggestions ?? []).map((suggestion) => <li key={suggestion.id}>{suggestion.replacement} ({suggestion.status}) {suggestion.status === "pending" && !readOnly && <><Button type="button" onClick={() => decideSuggestion({ controller, suggestionId: suggestion.id, decision: "accepted", actor: currentActor })}>Accept</Button><Button type="button" onClick={() => decideSuggestion({ controller, suggestionId: suggestion.id, decision: "rejected", actor: currentActor })}>Reject</Button></>}</li>)}</ul>
          {!readOnly && <div aria-label="Review transitions">{(["draft", "in-review", "changes-requested", "approved"] as const).map((state) => <Button key={state} type="button" disabled={state === model.reviewState || !canTransitionReview(model.reviewState, state)} onClick={() => setReview(state)}>{state}</Button>)}</div>}
        </Card.Content>
      </Card>
      <Card data-mdfn-surface="history"><Card.Header><Card.Title>Version history</Card.Title></Card.Header><Card.Content><ol aria-label="Document versions">{versions.map((entry) => <li key={entry.version}>Version {entry.version}{entry.authorId ? ` by ${entry.authorId}` : ""} {onRestoreVersion && !readOnly && <Button type="button" onClick={() => void onRestoreVersion(entry.version)}>Restore</Button>}</li>)}</ol><ol aria-label="Editorial activity">{(model.audit ?? []).map((entry) => <li key={entry.id}>{entry.action} by {entry.actorId}</li>)}</ol></Card.Content></Card>
    </section>
  );
}

export function MdfnOutline({ controller }: { readonly controller: EditorController }): React.ReactElement {
  useMdfn(controller);
  const outline = createAuthoringModel(controller).outline;
  return <nav data-mdfn-surface="outline" aria-label="Document outline"><ol>{outline.map((item) => <li key={item.id} data-level={item.level}><Button type="button" onClick={() => item.from !== undefined && controller.dispatch(new Transaction().setSelection({ kind: "text", anchor: item.from, head: item.from }).withSource("outline"))}>{item.text}</Button></li>)}</ol></nav>;
}

export function MdfnDiagnostics({ controller }: { readonly controller: EditorController }): React.ReactElement {
  useMdfn(controller);
  const diagnostics = controller.getState().diagnostics;
  return <aside data-mdfn-surface="diagnostics" aria-label="Markdown diagnostics" aria-live="polite"><ul>{diagnostics.map((entry, index) => <li key={`${entry.code}-${index}`} data-severity={entry.severity}>{entry.message}</li>)}</ul></aside>;
}

export { MdfnEditor } from "@mdfn/react";
export const MDFN_COMPONENTS_REACT_VERSION = "0.1.0" as const;
