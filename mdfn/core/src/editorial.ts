import { mapSidecar } from "./anchors";
import { Transaction } from "./transaction";
import type { EditorController } from "./controller";
import type {
  CommentMessage,
  CommentThread,
  EditorialAuditEntry,
  MdfnJsonValue,
  MdfnSidecar,
  ReviewState,
  SidecarAnchor,
  Suggestion,
} from "./types";

export interface EditorialActor {
  readonly id: string;
  readonly now?: () => string;
  readonly createId?: () => string;
}

function now(actor: EditorialActor): string {
  return actor.now?.() ?? new Date().toISOString();
}

function createId(actor: EditorialActor): string {
  return actor.createId?.() ?? crypto.randomUUID();
}

function audit(
  sidecar: MdfnSidecar,
  actor: EditorialActor,
  action: EditorialAuditEntry["action"],
  targetId?: string,
  details?: Readonly<Record<string, MdfnJsonValue>>,
): MdfnSidecar {
  const entry: EditorialAuditEntry = {
    id: createId(actor),
    action,
    actorId: actor.id,
    targetId,
    createdAt: now(actor),
    details,
  };
  return { ...sidecar, audit: [...(sidecar.audit ?? []), entry] };
}

function base(sidecar: MdfnSidecar | undefined): MdfnSidecar {
  return sidecar ?? { reviewState: "draft" };
}

function assertAnchor(anchor: SidecarAnchor, markdownLength: number): void {
  if (!Number.isInteger(anchor.from) || !Number.isInteger(anchor.to) || anchor.from < 0 || anchor.to < anchor.from || anchor.to > markdownLength) {
    throw new RangeError("MDFN_EDITORIAL_ANCHOR_INVALID");
  }
}

export function createCommentThread(input: {
  readonly sidecar?: MdfnSidecar;
  readonly anchor: SidecarAnchor;
  readonly body: string;
  readonly actor: EditorialActor;
  readonly markdownLength: number;
}): { readonly sidecar: MdfnSidecar; readonly thread: CommentThread } {
  assertAnchor(input.anchor, input.markdownLength);
  if (!input.body.trim()) throw new Error("MDFN_COMMENT_BODY_REQUIRED");
  const timestamp = now(input.actor);
  const threadId = createId(input.actor);
  const message: CommentMessage = { id: createId(input.actor), authorId: input.actor.id, body: input.body, createdAt: timestamp };
  const thread: CommentThread = { id: threadId, anchor: input.anchor, resolved: false, messages: [message] };
  const next = { ...base(input.sidecar), comments: [...(input.sidecar?.comments ?? []), thread] };
  return { sidecar: audit(next, input.actor, "comment-created", threadId), thread };
}

export function replyToComment(input: { readonly sidecar: MdfnSidecar; readonly threadId: string; readonly body: string; readonly actor: EditorialActor }): MdfnSidecar {
  if (!input.body.trim()) throw new Error("MDFN_COMMENT_BODY_REQUIRED");
  let found = false;
  const comments = (input.sidecar.comments ?? []).map((thread) => {
    if (thread.id !== input.threadId) return thread;
    found = true;
    const message: CommentMessage = { id: createId(input.actor), authorId: input.actor.id, body: input.body, createdAt: now(input.actor) };
    return { ...thread, messages: [...thread.messages, message] };
  });
  if (!found) throw new Error(`MDFN_COMMENT_NOT_FOUND:${input.threadId}`);
  return audit({ ...input.sidecar, comments }, input.actor, "comment-replied", input.threadId);
}

export function setCommentResolved(input: { readonly sidecar: MdfnSidecar; readonly threadId: string; readonly resolved: boolean; readonly actor: EditorialActor }): MdfnSidecar {
  let found = false;
  const comments = (input.sidecar.comments ?? []).map((thread) => {
    if (thread.id !== input.threadId) return thread;
    found = true;
    return { ...thread, resolved: input.resolved };
  });
  if (!found) throw new Error(`MDFN_COMMENT_NOT_FOUND:${input.threadId}`);
  return audit({ ...input.sidecar, comments }, input.actor, input.resolved ? "comment-resolved" : "comment-reopened", input.threadId);
}

export function createSuggestion(input: {
  readonly sidecar?: MdfnSidecar;
  readonly anchor: SidecarAnchor;
  readonly replacement: string;
  readonly actor: EditorialActor;
  readonly markdownLength: number;
}): { readonly sidecar: MdfnSidecar; readonly suggestion: Suggestion } {
  assertAnchor(input.anchor, input.markdownLength);
  const suggestion: Suggestion = {
    id: createId(input.actor),
    anchor: input.anchor,
    replacement: input.replacement,
    authorId: input.actor.id,
    status: "pending",
    createdAt: now(input.actor),
  };
  const next = { ...base(input.sidecar), suggestions: [...(input.sidecar?.suggestions ?? []), suggestion] };
  return { sidecar: audit(next, input.actor, "suggestion-created", suggestion.id), suggestion };
}

export function decideSuggestion(input: { readonly controller: EditorController; readonly suggestionId: string; readonly decision: "accepted" | "rejected"; readonly actor: EditorialActor }): void {
  const state = input.controller.getState();
  const suggestion = state.sidecar?.suggestions?.find((candidate) => candidate.id === input.suggestionId);
  if (!suggestion) throw new Error(`MDFN_SUGGESTION_NOT_FOUND:${input.suggestionId}`);
  if (suggestion.status !== "pending") throw new Error(`MDFN_SUGGESTION_ALREADY_DECIDED:${input.suggestionId}`);
  assertAnchor(suggestion.anchor, state.markdown.length);

  let nextSidecar = base(state.sidecar);
  if (input.decision === "accepted") {
    const range = { from: suggestion.anchor.from, to: suggestion.anchor.to, insertedLength: suggestion.replacement.length };
    nextSidecar = mapSidecar(nextSidecar, [range]) ?? nextSidecar;
  }
  nextSidecar = {
    ...nextSidecar,
    suggestions: (nextSidecar.suggestions ?? []).map((candidate) => candidate.id === input.suggestionId ? { ...candidate, status: input.decision } : candidate),
  };
  nextSidecar = audit(nextSidecar, input.actor, input.decision === "accepted" ? "suggestion-accepted" : "suggestion-rejected", input.suggestionId);

  let transaction = new Transaction().withSource(`editorial:suggestion-${input.decision}`);
  if (input.decision === "accepted") {
    transaction = transaction.replaceSource(suggestion.anchor.from, suggestion.anchor.to, suggestion.replacement);
  }
  input.controller.dispatch(transaction.setSidecar(nextSidecar));
}

const REVIEW_TRANSITIONS: Readonly<Record<ReviewState, readonly ReviewState[]>> = {
  draft: ["in-review"],
  "in-review": ["draft", "changes-requested", "approved"],
  "changes-requested": ["draft", "in-review"],
  approved: ["draft", "in-review"],
};

export function canTransitionReview(from: ReviewState, to: ReviewState): boolean {
  return from === to || REVIEW_TRANSITIONS[from].includes(to);
}

export function transitionReview(input: { readonly sidecar?: MdfnSidecar; readonly to: ReviewState; readonly actor: EditorialActor }): MdfnSidecar {
  const current = input.sidecar?.reviewState ?? "draft";
  if (current === input.to) return base(input.sidecar);
  if (!canTransitionReview(current, input.to)) throw new Error(`MDFN_REVIEW_TRANSITION_INVALID:${current}:${input.to}`);
  return audit({ ...base(input.sidecar), reviewState: input.to }, input.actor, "review-transitioned", undefined, { from: current, to: input.to });
}
