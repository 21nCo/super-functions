import { createEffect, createSignal, onCleanup, splitProps, type Accessor, type Component, type JSX } from "solid-js";
import { createAdapterBridge, type AdapterSnapshot } from "@mdfn/adapter-kit";
import { smallestSourceChange, Transaction, type EditorController } from "@mdfn/core";
import type { DomCommand, DomEditor } from "@mdfn/dom";
import type { EditorMode, SourceEditor } from "@mdfn/source";

export function createMdfnSignal(controller: EditorController | Accessor<EditorController>): Accessor<AdapterSnapshot> {
  const resolveController = typeof controller === "function" ? controller : () => controller;
  let currentController = resolveController();
  let bridge = createAdapterBridge(currentController);
  const [snapshot, setSnapshot] = createSignal(bridge.getSnapshot());
  let unsubscribe = bridge.subscribe(() => setSnapshot(bridge.getSnapshot()));
  createEffect(() => {
    const nextController = resolveController();
    if (nextController === currentController) return;
    unsubscribe();
    bridge.destroy();
    currentController = nextController;
    bridge = createAdapterBridge(currentController);
    setSnapshot(bridge.getSnapshot());
    unsubscribe = bridge.subscribe(() => setSnapshot(bridge.getSnapshot()));
  });
  onCleanup(() => { unsubscribe(); bridge.destroy(); });
  return snapshot;
}

export interface MdfnEditorProps extends JSX.HTMLAttributes<HTMLDivElement> {
  readonly controller: EditorController;
  readonly mode?: EditorMode;
  readonly readOnly?: boolean;
  readonly ariaLabel?: string;
  readonly onLoadError?: (error: Error) => void;
  readonly editorRef?: (value: MdfnEditorHandle | null) => void;
  readonly onFiles?: (files: readonly File[]) => void | Promise<void>;
}

export interface MdfnEditorHandle { focus(): void; run(command: DomCommand): boolean; can(command: DomCommand): boolean; setLink(href: string, title?: string): boolean; removeLink(): boolean; insertTable(rows?: number, columns?: number): boolean; insertMarkdown(markdown: string): boolean; }

export const MdfnEditor: Component<MdfnEditorProps> = (props) => {
  type ShellForwardedProps = MdfnEditorProps & {
    readonly toolbarGroups?: unknown;
    readonly hideToolbar?: boolean;
    readonly hideAuthoringChrome?: boolean;
    readonly actor?: unknown;
    readonly onSelectFiles?: unknown;
    readonly onModeChange?: unknown;
  };
  const [local, , rest] = splitProps(
    props as ShellForwardedProps,
    ["controller", "mode", "readOnly", "ariaLabel", "onLoadError", "editorRef", "onFiles"],
    ["toolbarGroups", "hideToolbar", "hideAuthoringChrome", "actor", "onSelectFiles", "onModeChange"],
  );
  let visualTarget: HTMLDivElement | undefined;
  let sourceTarget: HTMLDivElement | undefined;
  let previewTarget: HTMLDivElement | undefined;
  let visual: DomEditor | undefined;
  let source: SourceEditor | undefined;
  const [loadError, setLoadError] = createSignal<Error | null>(null);
  const [fallbackValue, setFallbackValue] = createSignal(local.controller.getState().markdown);
  const [version, setVersion] = createSignal(local.controller.getState().version);

  createEffect(() => {
    const controller = local.controller;
    setFallbackValue(controller.getState().markdown);
    setVersion(controller.getState().version);
    const unsubscribe = controller.subscribe((change) => {
      setFallbackValue(change.current.markdown);
      setVersion(change.current.version);
    });
    onCleanup(unsubscribe);
  });

  const handle: MdfnEditorHandle = { focus() { visual?.focus(); source?.focus(); }, run(command) { return visual?.run(command) ?? false; }, can(command) { return visual?.can(command) ?? false; }, setLink(href, title) { return visual?.setLink(href, title) ?? false; }, removeLink() { return visual?.removeLink() ?? false; }, insertTable(rows, columns) { return visual?.insertTable(rows, columns) ?? false; }, insertMarkdown(markdown) { return visual?.insertMarkdown(markdown) ?? false; } };
  createEffect(() => {
    const mode = local.mode ?? "visual";
    const controller = local.controller;
    const readOnly = local.readOnly === true || mode === "read-only";
    const ariaLabel = local.ariaLabel ?? "Markdown editor";
    const onFiles = local.onFiles;
    const editorRef = local.editorRef;
    const onLoadError = local.onLoadError;
    let cancelled = false;
    let mountedVisual: DomEditor | undefined;
    let mountedSource: SourceEditor | undefined;
    const destroyMounted = (): void => {
      mountedVisual?.destroy();
      mountedSource?.destroy();
      if (visual === mountedVisual) visual = undefined;
      if (source === mountedSource) source = undefined;
      mountedVisual = undefined;
      mountedSource = undefined;
    };
    visual?.destroy();
    source?.destroy();
    visual = undefined;
    source = undefined;
    setLoadError(null);
    const mount = async (): Promise<void> => {
      try {
        await Promise.resolve();
        if (cancelled) return;
        if ((mode === "visual" || mode === "split") && visualTarget) {
          const module = await import("@mdfn/dom");
          if (cancelled) return;
          mountedVisual = module.createDomEditor({ target: visualTarget, controller, readOnly, attributes: { "aria-label": ariaLabel }, onFiles });
          visual = mountedVisual;
        }
        if ((mode === "source" || mode === "split") && sourceTarget) {
          const module = await import("@mdfn/source");
          if (cancelled) return;
          mountedSource = module.createSourceEditor({ target: sourceTarget, controller, readOnly, ariaLabel: `${ariaLabel} source` });
          source = mountedSource;
        }
        if ((mode === "preview" || mode === "read-only") && previewTarget) {
          const module = await import("@mdfn/source");
          if (cancelled) return;
          previewTarget.innerHTML = module.createPreview(controller).html;
        }
        editorRef?.(handle);
      } catch (error) {
        destroyMounted();
        if (cancelled) return;
        const resolved = error instanceof Error ? error : new Error(String(error));
        setLoadError(resolved);
        onLoadError?.(resolved);
      }
    };
    void mount();
    onCleanup(() => { cancelled = true; editorRef?.(null); destroyMounted(); });
  });

  createEffect(() => {
    version();
    const mode = local.mode ?? "visual";
    const controller = local.controller;
    const onLoadError = local.onLoadError;
    if ((mode !== "preview" && mode !== "read-only") || !previewTarget) return;
    let cancelled = false;
    void import("@mdfn/source").then((module) => {
      if (!cancelled && previewTarget) previewTarget.innerHTML = module.createPreview(controller).html;
    }).catch((error: unknown) => {
      if (cancelled) return;
      const resolved = error instanceof Error ? error : new Error(String(error));
      setLoadError(resolved);
      onLoadError?.(resolved);
    });
    onCleanup(() => { cancelled = true; });
  });

  const updateFallback: JSX.EventHandler<HTMLTextAreaElement, InputEvent> = (event) => {
    const markdown = event.currentTarget.value;
    const current = local.controller.getState().markdown;
    const change = smallestSourceChange(current, markdown);
    if (!change) return;
    try {
      local.controller.dispatch(new Transaction().replaceSource(change.from, change.to, change.insert).withSource("solid:fallback"));
    } catch {
      const canonical = local.controller.getState().markdown;
      setFallbackValue(canonical);
      event.currentTarget.value = canonical;
    }
  };

  return (
    <div {...rest} data-mdfn-solid="editor" data-mode={local.mode ?? "visual"}>
      {loadError() ? (
        <div data-mdfn-source-fallback="true">
          <div role="status">Visual editor unavailable: {loadError()!.message}</div>
          <textarea aria-label={`${local.ariaLabel ?? "Markdown editor"} source fallback`} value={fallbackValue()} readOnly={local.readOnly === true || local.mode === "read-only"} onInput={updateFallback} />
        </div>
      ) : (
        <>
          {((local.mode ?? "visual") === "visual" || local.mode === "split") && <div ref={visualTarget} data-mdfn-surface="visual" />}
          {(local.mode === "source" || local.mode === "split") && <div ref={sourceTarget} data-mdfn-surface="source" />}
          {(local.mode === "preview" || local.mode === "read-only") && <div ref={previewTarget} data-mdfn-surface="preview" aria-label={local.ariaLabel ?? "Markdown editor"} />}
        </>
      )}
    </div>
  );
};

export const MDFN_SOLID_VERSION = "0.1.0" as const;
