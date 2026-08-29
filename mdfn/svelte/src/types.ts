import type { EditorController } from "@mdfn/core";
import type { EditorMode } from "@mdfn/source";
import type { DomCommand } from "@mdfn/dom";

export interface MdfnEditorHandle {
  focus(): void;
  run(command: DomCommand): boolean;
  can(command: DomCommand): boolean;
  setLink(href: string, title?: string): boolean;
  removeLink(): boolean;
  insertTable(rows?: number, columns?: number): boolean;
  insertMarkdown(markdown: string): boolean;
}

export interface MdfnEditorProps {
  controller: EditorController;
  mode?: EditorMode;
  readOnly?: boolean;
  ariaLabel?: string;
  class?: string;
  onLoadError?: (error: Error) => void;
  editorRef?: (value: MdfnEditorHandle | null) => void;
  onFiles?: (files: readonly File[]) => void | Promise<void>;
}
