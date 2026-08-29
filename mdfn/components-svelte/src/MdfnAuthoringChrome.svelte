<script lang="ts">
  import { ButtonRoot, CardContent, CardHeader, CardRoot, CardTitle, InputRoot } from '@uifn/components-svelte';
  import { createAuthoringModel, insertMarkdownAtSelection, type AuthoringVersion, type SlashCommand } from '@mdfn/components';
  import { Transaction, canTransitionReview, createCommentThread, createSuggestion, decideSuggestion, replyToComment, setCommentResolved, transitionReview, type EditorController, type EditorialActor, type ReviewState } from '@mdfn/core';
  import type { MdfnEditorHandle, MdfnEditorProps } from '@mdfn/svelte';
  import MdfnToolbar from './MdfnToolbar.svelte';

  type EditorMode = NonNullable<MdfnEditorProps['mode']>;

  let { controller, editor = null, mode = 'visual', readOnly = false, compact = false, actor, onSelectFiles, onModeChange, versions = [], onRestoreVersion }: {
    controller: EditorController;
    editor?: MdfnEditorHandle | null;
    mode?: EditorMode;
    readOnly?: boolean;
    compact?: boolean;
    actor?: EditorialActor;
    onSelectFiles?: (files: readonly File[]) => Promise<string | undefined>;
    onModeChange?: (mode: EditorMode) => void;
    versions?: readonly AuthoringVersion[];
    onRestoreVersion?: (version: number) => void | Promise<void>;
  } = $props();
  let version = $state(0);
  let slashQuery = $state('');
  let link = $state('');
  let rows = $state(2);
  let columns = $state(2);
  let comment = $state('');
  let suggestion = $state('');
  let replies = $state<Record<string, string>>({});
  let slashOpen = $state(false);
  const modes: readonly EditorMode[] = ['visual', 'source', 'split', 'preview', 'read-only'];
  $effect(() => {
    version = controller.getState().version;
    return controller.subscribe((change) => { version = change.current.version; });
  });
  const model = $derived.by(() => { void version; return createAuthoringModel(controller, { mode, compact, slashQuery, slashOpen }); });
  const currentActor = $derived(actor ?? { id: 'local-author' });
  const commandTarget = $derived(editor ? ({ can: (command: string) => editor?.can(command as Parameters<MdfnEditorHandle['can']>[0]) ?? false, run: (command: string) => editor?.run(command as Parameters<MdfnEditorHandle['run']>[0]) ?? false }) : null);

  function updateSidecar(sidecar: NonNullable<ReturnType<EditorController['getState']>['sidecar']>, source: string) {
    controller.dispatch(new Transaction().setSidecar(sidecar).withSource(source));
  }
  function addComment() {
    const state = controller.getState();
    const selection = state.selection?.kind === 'text' ? state.selection : { anchor: 0, head: 0 };
    const result = createCommentThread({ sidecar: state.sidecar, anchor: { from: Math.min(selection.anchor, selection.head), to: Math.max(selection.anchor, selection.head) }, body: comment, actor: currentActor, markdownLength: state.markdown.length });
    updateSidecar(result.sidecar, 'editorial:comment');
    comment = '';
  }
  function setReview(to: ReviewState) {
    updateSidecar(transitionReview({ sidecar: controller.getState().sidecar, to, actor: currentActor }), 'editorial:review');
  }
  function selectionRange() {
    const selection = controller.getState().selection;
    return selection?.kind === 'text' ? { from: Math.min(selection.anchor, selection.head), to: Math.max(selection.anchor, selection.head) } : { from: 0, to: 0 };
  }
  function addSuggestion() {
    const state = controller.getState();
    const result = createSuggestion({ sidecar: state.sidecar, anchor: selectionRange(), replacement: suggestion, actor: currentActor, markdownLength: state.markdown.length });
    updateSidecar(result.sidecar, 'editorial:suggestion');
    suggestion = '';
  }
  function runSlash(item: SlashCommand) {
    if (item.kind === 'command' && item.command) editor?.run(item.command as Parameters<MdfnEditorHandle['run']>[0]);
    if (item.kind === 'table') editor?.insertTable(rows, columns);
    if (item.kind === 'link' && link) editor?.setLink(link);
    slashOpen = false;
  }
  function selectFiles(event: Event) {
    const files = [...((event.currentTarget as HTMLInputElement).files ?? [])];
    void onSelectFiles?.(files).then((markdown) => { if (markdown) insertMarkdownAtSelection(controller, editor, markdown); });
  }
</script>

<section data-mdfn-component="authoring-chrome" data-compact={model.compact ? 'true' : 'false'} aria-label="Markdown authoring controls">
  <nav aria-label="Editor mode" data-mdfn-surface="mode-switcher">{#each modes as item}<ButtonRoot type="button" aria-pressed={mode === item} disabled={!onModeChange} onclick={() => onModeChange?.(item)}>{item}</ButtonRoot>{/each}</nav>
  {#if !readOnly && model.bubbleVisible}<div data-mdfn-surface="bubble-toolbar"><MdfnToolbar {controller} groups={model.bubble.groups} {commandTarget} ariaLabel="Selection formatting" /></div>{/if}
  {#if !readOnly && model.floatingVisible}<div data-mdfn-surface="floating-toolbar"><MdfnToolbar {controller} groups={model.floating.groups} {commandTarget} ariaLabel="Block formatting" /></div>{/if}
  {#if !readOnly}
    <ButtonRoot type="button" aria-expanded={model.slashOpen} aria-controls="mdfn-insert-menu" onclick={() => slashOpen = !slashOpen}>Insert</ButtonRoot>
    {#if model.slashOpen}<CardRoot id="mdfn-insert-menu" data-mdfn-surface="slash-menu"><CardHeader><CardTitle>Insert</CardTitle></CardHeader><CardContent><InputRoot aria-label="Filter insert commands" value={slashQuery} oninput={(event: Event) => slashQuery = (event.currentTarget as HTMLInputElement).value} /><div role="listbox" aria-label="Insert commands">{#each model.slashCommands as item (item.id)}<ButtonRoot type="button" role="option" onclick={() => runSlash(item)}>{item.label}</ButtonRoot>{/each}</div></CardContent></CardRoot>{/if}
    <CardRoot data-mdfn-surface="link-editor"><CardHeader><CardTitle>Link</CardTitle></CardHeader><CardContent><InputRoot type="url" aria-label="Link URL" value={link} oninput={(event: Event) => link = (event.currentTarget as HTMLInputElement).value} /><ButtonRoot type="button" onclick={() => editor?.setLink(link)}>Apply link</ButtonRoot><ButtonRoot type="button" onclick={() => editor?.removeLink()}>Remove link</ButtonRoot></CardContent></CardRoot>
    <CardRoot data-mdfn-surface="table-controls"><CardHeader><CardTitle>Table</CardTitle></CardHeader><CardContent><InputRoot type="number" min={1} max={100} aria-label="Table rows" value={rows} oninput={(event: Event) => rows = Number((event.currentTarget as HTMLInputElement).value)} /><InputRoot type="number" min={1} max={100} aria-label="Table columns" value={columns} oninput={(event: Event) => columns = Number((event.currentTarget as HTMLInputElement).value)} /><ButtonRoot type="button" onclick={() => editor?.insertTable(rows, columns)}>Insert table</ButtonRoot></CardContent></CardRoot>
    <CardRoot data-mdfn-surface="file-controls"><CardHeader><CardTitle>Files</CardTitle></CardHeader><CardContent><input type="file" aria-label="Select files" multiple onchange={selectFiles} data-uifn-component="input" data-uifn-part="root" /></CardContent></CardRoot>
  {/if}
  <nav data-mdfn-surface="outline" aria-label="Document outline"><ol>{#each model.outline as item (item.id)}<li data-level={item.level}><ButtonRoot type="button" onclick={() => item.from !== undefined && controller.dispatch(new Transaction().setSelection({ kind: 'text', anchor: item.from, head: item.from }).withSource('outline'))}>{item.text}</ButtonRoot></li>{/each}</ol></nav>
  <aside data-mdfn-surface="diagnostics" aria-label="Markdown diagnostics" aria-live="polite"><ul>{#each model.diagnostics as diagnostic, index (`${diagnostic.code}-${index}`)}<li data-severity={diagnostic.severity}>{diagnostic.message}</li>{/each}</ul></aside>
  <CardRoot data-mdfn-surface="editorial"><CardHeader><CardTitle>Review</CardTitle></CardHeader><CardContent><p>State: {model.reviewState}</p>{#if !readOnly}<InputRoot aria-label="Comment" value={comment} oninput={(event: Event) => comment = (event.currentTarget as HTMLInputElement).value} /><ButtonRoot type="button" disabled={!comment.trim()} onclick={addComment}>Add comment</ButtonRoot><InputRoot aria-label="Suggestion replacement" value={suggestion} oninput={(event: Event) => suggestion = (event.currentTarget as HTMLInputElement).value} /><ButtonRoot type="button" onclick={addSuggestion}>Add suggestion</ButtonRoot>{/if}<ul aria-label="Comments">{#each model.comments ?? [] as thread (thread.id)}<li>{#each thread.messages as message (message.id)}<p>{message.body}</p>{/each}{thread.resolved ? 'Resolved' : 'Open'} {#if !readOnly}<InputRoot aria-label={`Reply to comment ${thread.id}`} value={replies[thread.id] ?? ''} oninput={(event: Event) => replies[thread.id] = (event.currentTarget as HTMLInputElement).value} /><ButtonRoot type="button" disabled={!(replies[thread.id] ?? '').trim()} onclick={() => { updateSidecar(replyToComment({ sidecar: controller.getState().sidecar ?? {}, threadId: thread.id, body: replies[thread.id] ?? '', actor: currentActor }), 'editorial:comment-reply'); replies[thread.id] = ''; }}>Reply</ButtonRoot><ButtonRoot type="button" onclick={() => updateSidecar(setCommentResolved({ sidecar: controller.getState().sidecar ?? {}, threadId: thread.id, resolved: !thread.resolved, actor: currentActor }), 'editorial:comment-resolution')}>{thread.resolved ? 'Reopen' : 'Resolve'}</ButtonRoot>{/if}</li>{/each}</ul><ul aria-label="Suggestions">{#each model.suggestions ?? [] as entry (entry.id)}<li>{entry.replacement} ({entry.status}) {#if entry.status === 'pending' && !readOnly}<ButtonRoot type="button" onclick={() => decideSuggestion({ controller, suggestionId: entry.id, decision: 'accepted', actor: currentActor })}>Accept</ButtonRoot><ButtonRoot type="button" onclick={() => decideSuggestion({ controller, suggestionId: entry.id, decision: 'rejected', actor: currentActor })}>Reject</ButtonRoot>{/if}</li>{/each}</ul>{#if !readOnly}<div aria-label="Review transitions">{#each ['draft', 'in-review', 'changes-requested', 'approved'] as state}<ButtonRoot type="button" disabled={state === model.reviewState || !canTransitionReview(model.reviewState, state as ReviewState)} onclick={() => setReview(state as ReviewState)}>{state}</ButtonRoot>{/each}</div>{/if}</CardContent></CardRoot>
  <CardRoot data-mdfn-surface="history"><CardHeader><CardTitle>Version history</CardTitle></CardHeader><CardContent><ol aria-label="Document versions">{#each versions as entry (entry.version)}<li>Version {entry.version}{entry.authorId ? ` by ${entry.authorId}` : ''} {#if onRestoreVersion && !readOnly}<ButtonRoot type="button" onclick={() => void onRestoreVersion?.(entry.version)}>Restore</ButtonRoot>{/if}</li>{/each}</ol><ol aria-label="Editorial activity">{#each model.audit ?? [] as entry (entry.id)}<li>{entry.action} by {entry.actorId}</li>{/each}</ol></CardContent></CardRoot>
</section>
