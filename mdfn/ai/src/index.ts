import { Transaction, type EditorController, type SidecarAnchor, type Suggestion } from "@mdfn/core";

export interface ProposedEdit {
  readonly from: number;
  readonly to: number;
  readonly replacement: string;
  readonly explanation?: string;
}

export interface AiEditPolicy {
  readonly allowedRange?: SidecarAnchor;
  readonly maxReplacementLength?: number;
}

function validate(markdown: string, edit: ProposedEdit, policy: AiEditPolicy): void {
  if (!Number.isInteger(edit.from) || !Number.isInteger(edit.to) || edit.from < 0 || edit.to < edit.from || edit.to > markdown.length) throw new RangeError("MDFN_AI_EDIT_RANGE_INVALID");
  if (typeof edit.replacement !== "string") throw new TypeError("MDFN_AI_EDIT_REPLACEMENT_INVALID");
  if (policy.allowedRange && (edit.from < policy.allowedRange.from || edit.to > policy.allowedRange.to)) throw new Error("MDFN_AI_EDIT_OUTSIDE_ALLOWED_RANGE");
  if (edit.replacement.length > (policy.maxReplacementLength ?? 100_000)) throw new RangeError("MDFN_AI_EDIT_TOO_LARGE");
}

export function transactionFromAiEdit(controller: EditorController, edit: ProposedEdit, policy: AiEditPolicy = {}): Transaction {
  validate(controller.getState().markdown, edit, policy);
  return new Transaction().replaceSource(edit.from, edit.to, edit.replacement).withSource("ai:edit").withMetadata({ explanation: edit.explanation ?? "" });
}

export function suggestionFromAiEdit(controller: EditorController, id: string, authorId: string, edit: ProposedEdit, policy: AiEditPolicy = {}): Suggestion {
  validate(controller.getState().markdown, edit, policy);
  return Object.freeze({ id, authorId, anchor: { from: edit.from, to: edit.to }, replacement: edit.replacement, status: "pending", createdAt: new Date().toISOString() });
}

export function applyAiEdit(controller: EditorController, edit: ProposedEdit, policy: AiEditPolicy = {}): void {
  controller.dispatch(transactionFromAiEdit(controller, edit, policy));
}

export const MDFN_AI_VERSION = "0.1.0" as const;
