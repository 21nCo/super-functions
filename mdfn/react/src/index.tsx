"use client";

import * as React from "react";
import type { AdapterSnapshot } from "@mdfn/adapter-kit";
import { smallestSourceChange, Transaction, type EditorController } from "@mdfn/core";
import type { DomCommand, DomEditor } from "@mdfn/dom";
import type { EditorMode, SourceEditor } from "@mdfn/source";

export function useMdfn(controller: EditorController): AdapterSnapshot {
  const subscribe = React.useCallback((listener: () => void) => controller.subscribe(listener), [controller]);
  const getSnapshot = React.useCallback(() => controller.getState(), [controller]);
  const state = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return React.useMemo(() => ({
    state,
    version: state.version,
    markdown: state.markdown,
    dirty: state.dirty,
    canUndo: controller.canUndo(),
    canRedo: controller.canRedo(),
  }), [controller, state]);
}

export interface MdfnEditorHandle {
  focus(): void;
  run(command: DomCommand): boolean;
  can(command: DomCommand): boolean;
  setLink(href: string, title?: string): boolean;
  removeLink(): boolean;
  insertTable(rows?: number, columns?: number): boolean;
  insertMarkdown(markdown: string): boolean;
}

export interface MdfnEditorProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  readonly controller: EditorController;
  readonly mode?: EditorMode;
  readonly readOnly?: boolean;
  readonly ariaLabel?: string;
  readonly onLoadError?: (error: Error) => void;
  readonly onReady?: (handle: MdfnEditorHandle) => void;
  readonly onFiles?: (files: readonly File[]) => void | Promise<void>;
}

export const MdfnEditor = React.forwardRef<MdfnEditorHandle, MdfnEditorProps>(function MdfnEditor(
  { controller, mode = "visual", readOnly = false, ariaLabel = "Markdown editor", onLoadError, onReady, onFiles, className, ...props },
  forwardedRef,
) {
  const effectiveReadOnly = readOnly || mode === "read-only";
  const snapshot = useMdfn(controller);
  const visualRef = React.useRef<HTMLDivElement>(null);
  const sourceRef = React.useRef<HTMLDivElement>(null);
  const previewRef = React.useRef<HTMLDivElement>(null);
  const visual = React.useRef<DomEditor | null>(null);
  const source = React.useRef<SourceEditor | null>(null);
  const [loadError, setLoadError] = React.useState<Error | null>(null);

  const createHandle = React.useCallback((): MdfnEditorHandle => ({
    focus() { visual.current?.focus(); source.current?.focus(); },
    run(command) { return visual.current?.run(command) ?? false; },
    can(command) { return visual.current?.can(command) ?? false; },
    setLink(href, title) { return visual.current?.setLink(href, title) ?? false; },
    removeLink() { return visual.current?.removeLink() ?? false; },
    insertTable(rows, columns) { return visual.current?.insertTable(rows, columns) ?? false; },
    insertMarkdown(markdown) { return visual.current?.insertMarkdown(markdown) ?? false; },
  }), []);
  React.useImperativeHandle(forwardedRef, createHandle, [createHandle]);

  React.useEffect(() => {
    let cancelled = false;
    const destroyers: Array<() => void> = [];
    const cleanup = (): void => {
      for (const destroy of destroyers.splice(0).reverse()) destroy();
    };
    setLoadError(null);
    const mount = async (): Promise<void> => {
      try {
        if ((mode === "visual" || mode === "split") && visualRef.current) {
          const { createDomEditor } = await import("@mdfn/dom");
          if (cancelled || !visualRef.current) return;
          const mountedVisual = createDomEditor({ target: visualRef.current, controller, readOnly: effectiveReadOnly, attributes: { "aria-label": ariaLabel }, onFiles });
          visual.current = mountedVisual;
          destroyers.push(() => {
            mountedVisual.destroy();
            if (visual.current === mountedVisual) visual.current = null;
          });
        }
        if ((mode === "source" || mode === "split") && sourceRef.current) {
          const { createSourceEditor } = await import("@mdfn/source");
          if (cancelled || !sourceRef.current) return;
          const mountedSource = createSourceEditor({ target: sourceRef.current, controller, readOnly: effectiveReadOnly, ariaLabel: `${ariaLabel} source` });
          source.current = mountedSource;
          destroyers.push(() => {
            mountedSource.destroy();
            if (source.current === mountedSource) source.current = null;
          });
        }
        if ((mode === "preview" || mode === "read-only") && previewRef.current) {
          const { createPreview } = await import("@mdfn/source");
          if (cancelled || !previewRef.current) return;
          previewRef.current.innerHTML = createPreview(controller).html;
        }
        onReady?.(createHandle());
      } catch (error) {
        cleanup();
        if (cancelled) return;
        const resolved = error instanceof Error ? error : new Error(String(error));
        setLoadError(resolved);
        onLoadError?.(resolved);
      }
    };
    void mount();
    return () => { cancelled = true; cleanup(); visual.current = null; source.current = null; };
  }, [ariaLabel, controller, createHandle, effectiveReadOnly, mode, onFiles, onLoadError, onReady]);

  React.useEffect(() => {
    if ((mode !== "preview" && mode !== "read-only") || !previewRef.current) return;
    let cancelled = false;
    void import("@mdfn/source").then(({ createPreview }) => {
      if (!cancelled && previewRef.current) previewRef.current.innerHTML = createPreview(controller).html;
    }).catch((error: unknown) => {
      if (cancelled) return;
      const resolved = error instanceof Error ? error : new Error(String(error));
      setLoadError(resolved);
      onLoadError?.(resolved);
    });
    return () => { cancelled = true; };
  }, [controller, mode, onLoadError, snapshot.version]);

  if (loadError) {
    return <SourceFallback controller={controller} ariaLabel={`${ariaLabel} source fallback`} readOnly={effectiveReadOnly} error={loadError} />;
  }

  return (
    <div {...props} className={className} data-mdfn-react="editor" data-mode={mode}>
      {(mode === "visual" || mode === "split") && <div ref={visualRef} data-mdfn-surface="visual" />}
      {(mode === "source" || mode === "split") && <div ref={sourceRef} data-mdfn-surface="source" />}
      {(mode === "preview" || mode === "read-only") && <div ref={previewRef} data-mdfn-surface="preview" aria-label={ariaLabel} />}
    </div>
  );
});

function SourceFallback({ controller, ariaLabel, readOnly, error }: { controller: EditorController; ariaLabel: string; readOnly: boolean; error: Error }) {
  const snapshot = useMdfn(controller);
  return (
    <div data-mdfn-source-fallback="true">
      <div role="status">Visual editor unavailable: {error.message}</div>
      <textarea
        aria-label={ariaLabel}
        value={snapshot.markdown}
        readOnly={readOnly}
        onChange={(event) => {
          const textarea = event.currentTarget;
          const current = controller.getState().markdown;
          const change = smallestSourceChange(current, textarea.value);
          if (!change) return;
          try {
            controller.dispatch(new Transaction().replaceSource(change.from, change.to, change.insert).withSource("react:fallback"));
          } catch {
            textarea.value = controller.getState().markdown;
          }
        }}
      />
    </div>
  );
}

export const MDFN_REACT_VERSION = "0.1.0" as const;
