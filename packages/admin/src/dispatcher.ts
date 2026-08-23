import { auditFailureDefinitelyNotPersisted, createAdminAuditId, redactAdminOutputValue, redactAdminValue, type AdminAuditIdFactory, type AdminAuditSink } from "./audit.js";
import { AdminError, normalizeAdminError } from "./errors.js";
import {
  beginAdminIdempotency,
  claimAdminCompensation,
  type AdminIdempotencyClaim,
  type AdminIdempotencyIdentity,
  type AdminIdempotencyRecord,
  type AdminIdempotencyStore,
} from "./idempotency.js";
import type { AdminCapabilityRegistry, AdminRegistryOperation } from "./registry.js";
import { adminOperationMinimumScope, assertAdminScopeHierarchy, assertAdminScopeMinimum, canonicalAdminScope } from "./scope.js";
import { assertAdminValue, validateAdminValue } from "./validator.js";
import type {
  AdminOperationContext,
  AdminOperationError,
  AdminOperationResult,
  AdminResult,
} from "./types.js";

export interface AdminPolicyDecision {
  allowed: boolean;
  reason?: string;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface AdminPolicyEvaluator {
  authorize(request: {
    entry: AdminRegistryOperation;
    input: unknown;
    context: AdminOperationContext;
  }): Promise<AdminPolicyDecision> | AdminPolicyDecision;
  /**
   * Context-only discovery decision. If omitted, authorize is invoked with an
   * undefined input so existing contextual policies still fail closed.
   */
  discover?(request: {
    entry: AdminRegistryOperation;
    context: AdminOperationContext;
  }): Promise<AdminPolicyDecision> | AdminPolicyDecision;
}

export async function evaluateAdminDiscoveryPolicy(
  policy: AdminPolicyEvaluator | undefined,
  entry: AdminRegistryOperation,
  context: AdminOperationContext,
): Promise<AdminPolicyDecision> {
  const permissions = context.actor.permissions ?? [];
  if (!permissions.includes("*") && !permissions.includes(entry.operation.permission)) {
    return { allowed: false, reason: "The active actor cannot discover this operation." };
  }
  if (!policy) return { allowed: true };
  try {
    return policy.discover
      ? await policy.discover({ entry, context })
      : await policy.authorize({ entry, input: undefined, context });
  } catch {
    return { allowed: false, reason: "The contextual policy could not authorize discovery." };
  }
}

export interface AdminConfirmationVerifier {
  verify(request: {
    entry: AdminRegistryOperation;
    input: unknown;
    context: AdminOperationContext;
    token: string;
  }): Promise<boolean> | boolean;
}

export interface CreateAdminDispatcherOptions {
  registry: AdminCapabilityRegistry;
  policy?: AdminPolicyEvaluator;
  confirmation?: AdminConfirmationVerifier;
  audit?: AdminAuditSink;
  idempotency?: AdminIdempotencyStore;
  createAuditId?: AdminAuditIdFactory;
  now?: () => Date;
}

export interface AdminDispatchRequest {
  operationId: string;
  input: unknown;
  context: AdminOperationContext;
}

function deepFreezeAdminValue<T>(value: T): T {
  if (!value || typeof value !== "object") return value;
  if (typeof AbortSignal !== "undefined" && value instanceof AbortSignal) return value;
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreezeAdminValue(child);
  }
  return Object.freeze(value);
}

function immutableDispatchRequest(request: AdminDispatchRequest): AdminDispatchRequest {
  const { signal, ...cloneableContext } = request.context;
  const context = structuredClone(cloneableContext) as Omit<AdminOperationContext, "signal">;
  return {
    operationId: request.operationId,
    input: deepFreezeAdminValue(structuredClone(request.input)),
    context: deepFreezeAdminValue({ ...context, ...(signal ? { signal } : {}) }),
  };
}

function outwardAdminResult<T>(
  result: AdminResult<T>,
  entry: AdminRegistryOperation,
): AdminResult<T> {
  const fields = entry.operation.redaction?.outputFields ?? [];
  const allowed = entry.operation.redaction?.allowOutputPaths ?? [];
  if (result.ok === false) {
    return result.error.details === undefined
      ? result
      : {
          ...result,
          error: { ...result.error, details: redactAdminValue(result.error.details, fields) },
        };
  }
  return {
    ...result,
    data: redactAdminOutputValue(result.data, fields, allowed) as T,
    ...(result.meta === undefined
      ? {}
      : { meta: redactAdminOutputValue(result.meta, fields) as Readonly<Record<string, unknown>> }),
  };
}

export class AdminDispatcher {
  private readonly registry: AdminCapabilityRegistry;
  private readonly policy?: AdminPolicyEvaluator;
  private readonly confirmation?: AdminConfirmationVerifier;
  private readonly audit?: AdminAuditSink;
  private readonly idempotency?: AdminIdempotencyStore;
  private readonly createAuditId: AdminAuditIdFactory;
  private readonly now: () => Date;

  constructor(options: CreateAdminDispatcherOptions) {
    if (options.audit && options.audit.idempotentById !== true) {
      throw new AdminError(
        "invalid_argument",
        "Administration audit sinks must provide durable first-write-wins idempotency by event ID.",
      );
    }
    if (options.idempotency && typeof options.idempotency.finalizeAudit !== "function") {
      throw new AdminError(
        "invalid_argument",
        "Administration idempotency storage must implement atomic terminal-audit reconciliation.",
      );
    }
    if (options.idempotency && typeof options.idempotency.prepareCompensation !== "function") {
      throw new AdminError(
        "invalid_argument",
        "Administration idempotency storage must implement atomic compensation preparation.",
      );
    }
    if (
      options.idempotency &&
      (typeof options.idempotency.claimCompensation !== "function" ||
        typeof options.idempotency.releaseCompensation !== "function")
    ) {
      throw new AdminError(
        "invalid_argument",
        "Administration idempotency storage must implement atomic compensation reconciliation.",
      );
    }
    this.registry = options.registry;
    this.policy = options.policy;
    this.confirmation = options.confirmation;
    this.audit = options.audit;
    this.idempotency = options.idempotency;
    this.createAuditId = options.createAuditId ?? createAdminAuditId;
    this.now = options.now ?? (() => new Date());
  }

  async dispatch<T = unknown>(request: AdminDispatchRequest): Promise<AdminResult<T>> {
    const startedAt = this.now();
    let entry: AdminRegistryOperation | undefined;
    let auditId: string | undefined;
    let idempotencyClaim: AdminIdempotencyClaim | undefined;
    let idempotencyIdentity: AdminIdempotencyIdentity | undefined;
    let inputValidated = false;
    let attemptedAuditAttempted = false;
    let terminalAuditAttempted = false;
    let terminalAuditWritten = false;
    let terminalAuditId: string | undefined;
    let domainInvoked = false;
    let domainCompleted = false;
    let domainCompensated = false;
    let domainResponse: AdminOperationResult<T> | undefined;
    let compensationDomainResponse: AdminOperationResult<T> | undefined;
    let idempotencyPersisted = false;
    let policyMetadata: Readonly<Record<string, unknown>> | undefined;
    let compensationAuditMetadata: Readonly<Record<string, unknown>> | undefined;
    try {
      this.assertContext(request.context);
      entry = this.registry.requireOperation(request.operationId);
      const inputSchema = entry.operation.inputSchema;
      if (!inputSchema) throw new AdminError("internal", `Operation ${entry.operation.id} has no input schema.`);
      assertAdminValue(inputSchema, request.input);
      inputValidated = true;
      // Policy, confirmation, audit and domain execution observe one immutable
      // post-validation snapshot, preventing hooks from changing IDs, payloads,
      // actor permissions or tenant scope after validation.
      request = immutableDispatchRequest(request);

      assertAdminScopeMinimum(
        request.context.scope,
        adminOperationMinimumScope(entry.manifest, entry.operation),
      );
      const permissionDecision = this.defaultPolicy(entry, request.context);
      if (!permissionDecision.allowed) {
        throw new AdminError("forbidden", "The active actor cannot perform this operation.");
      }
      const decision = this.policy
        ? await this.policy.authorize({ entry, input: request.input, context: request.context })
        : permissionDecision;
      policyMetadata = decision.metadata === undefined
        ? undefined
        : this.redactAuditMetadata(entry, decision.metadata);
      if (!decision.allowed) throw new AdminError("forbidden", decision.reason || "The active actor cannot perform this operation.");

      if (entry.operation.safety.requiresConfirmation) {
        const token = request.context.confirmationToken;
        if (!token) throw new AdminError("precondition_failed", "This operation requires explicit confirmation.");
        if (!this.confirmation) {
          throw new AdminError("dependency_unavailable", "Administration confirmation verification is unavailable.");
        }
        if (!(await this.confirmation.verify({ entry, input: request.input, context: request.context, token }))) {
          throw new AdminError("precondition_failed", "The operation confirmation is invalid or expired.");
        }
      }

      if (entry.operation.safety.audit === "required" && !this.audit) {
        throw new AdminError("dependency_unavailable", "A required administration audit sink is unavailable.");
      }

      const identity = this.idempotencyIdentity(entry, request.context);
      if (entry.operation.safety.classification !== "read" && entry.operation.safety.idempotent && !identity) {
        throw new AdminError("precondition_failed", "This operation requires an idempotency key.");
      }
      if (identity && !this.idempotency) {
        throw new AdminError("dependency_unavailable", "Durable administration idempotency storage is unavailable.");
      }
      if (identity && this.idempotency) {
        const reservation = await beginAdminIdempotency<T>(this.idempotency, identity, request.input);
        if (reservation.status === "replay") {
          let replayRecord = reservation.record;
          if (
            replayRecord.compensation?.status === "pending" ||
            replayRecord.compensation?.status === "failed"
          ) {
            const reconciliation = await this.reconcileCompensation(
              entry,
              request,
              startedAt,
              replayRecord,
            );
            if (reconciliation.status === "result") return reconciliation.result;
            replayRecord = reconciliation.record;
          }
          const prior = outwardAdminResult(replayRecord.result, entry);
          const originalAuditId = replayRecord.auditId ?? prior.auditId;
          const recoveringAudit = replayRecord.audit?.status === "pending";
          let replayAuditId: string | undefined;
          if (this.shouldAudit(entry)) {
            terminalAuditAttempted = true;
            const candidateAuditId = recoveringAudit
              ? replayRecord.audit?.auditId
              : this.createAuditId();
            if (!candidateAuditId) {
              throw new AdminError("internal", "A pending terminal audit is missing its stable event ID.");
            }
            try {
              await this.writeAudit(
                entry,
                request,
                startedAt,
                candidateAuditId,
                recoveringAudit ? replayRecord.audit?.outcome ?? "succeeded" : "replayed",
                recoveringAudit ? replayRecord.audit?.errorCode : undefined,
                recoveringAudit ? replayRecord.audit?.metadata : policyMetadata,
              );
              terminalAuditWritten = true;
              replayAuditId = candidateAuditId;
              if (recoveringAudit) {
                await this.idempotency.finalizeAudit(
                  replayRecord.identity,
                  replayRecord.fingerprint,
                  { auditId: candidateAuditId, completedAt: this.now().toISOString() },
                );
              }
            } catch (error) {
              if (entry.operation.safety.audit === "required") throw error;
            }
          }
          const { auditId: _originalReceipt, ...priorWithoutReceipt } = prior;
          return {
            ...priorWithoutReceipt,
            ...(replayAuditId ? { auditId: replayAuditId } : {}),
            meta: {
              ...prior.meta,
              idempotencyReplay: true,
              ...(recoveringAudit ? { recoveredTerminalAudit: Boolean(replayAuditId) } : {}),
              ...(originalAuditId ? { originalAuditId } : {}),
            },
          };
        }
        idempotencyClaim = reservation.claim;
        idempotencyIdentity = identity;
      }

      if (
        entry.operation.safety.classification !== "read" &&
        entry.operation.safety.audit === "required"
      ) {
        attemptedAuditAttempted = true;
        await this.writeAudit(
          entry,
          request,
          startedAt,
          this.createAuditId(),
          "attempted",
          undefined,
          policyMetadata,
        );
      }

      domainInvoked = true;
      const result = await entry.adapter.invoke<T>(entry.operation.id, request.input, request.context);
      const outputSchema = entry.operation.outputSchema;
      if (!outputSchema) throw new AdminError("internal", `Operation ${entry.operation.id} has no output schema.`);
      if (validateAdminValue(outputSchema, result.data).length > 0) {
        throw new AdminError("internal", "The administration service returned an invalid response.");
      }
      if (
        result.page !== undefined &&
        (result.page === null ||
          typeof result.page !== "object" ||
          (result.page.nextCursor !== undefined &&
            result.page.nextCursor !== null &&
            typeof result.page.nextCursor !== "string") ||
          (result.page.hasMore !== undefined &&
            typeof result.page.hasMore !== "boolean"))
      ) {
        throw new AdminError("internal", "The administration service returned invalid pagination metadata.");
      }
      if (
        result.warnings !== undefined &&
        (!Array.isArray(result.warnings) ||
          result.warnings.some((warning) => typeof warning !== "string"))
      ) {
        throw new AdminError("internal", "The administration service returned invalid warnings.");
      }
      if (
        result.meta !== undefined &&
        (result.meta === null ||
          typeof result.meta !== "object" ||
          Array.isArray(result.meta))
      ) {
        throw new AdminError("internal", "The administration service returned invalid metadata.");
      }
      const externalData = redactAdminOutputValue(result.data, entry.operation.redaction?.outputFields ?? [], entry.operation.redaction?.allowOutputPaths ?? []) as T;
      const externalMeta = result.meta === undefined
        ? undefined
        : redactAdminOutputValue(
            result.meta,
            entry.operation.redaction?.outputFields ?? [],
            [],
          ) as Readonly<Record<string, unknown>>;
      domainCompleted = true;

      domainResponse = {
        data: externalData,
        ok: true,
        ...(result.page ? { page: result.page } : {}),
        ...(result.warnings ? { warnings: result.warnings } : {}),
        requestId: request.context.requestId,
        correlationId: request.context.correlationId,
        ...(externalMeta ? { meta: externalMeta } : {}),
      };
      terminalAuditId = this.shouldAudit(entry) ? this.createAuditId() : undefined;
      if (idempotencyClaim && idempotencyIdentity && this.idempotency) {
        try {
          await this.persistDomainOutcome(
            idempotencyClaim,
            idempotencyIdentity,
            domainResponse,
            this.shouldAudit(entry) ? "pending" : "not-required",
            terminalAuditId,
            policyMetadata,
          );
          idempotencyPersisted = true;
        } catch (cause) {
          throw new AdminError(
            "dependency_unavailable",
            "The domain operation completed, but its result is pending durable idempotency reconciliation.",
            {
              retryable: true,
              details: { outcome: "domain_completed", reconciliationRequired: true },
              cause,
            },
          );
        }
      }

      if (this.shouldAudit(entry)) {
        const candidateAuditId = terminalAuditId ?? this.createAuditId();
        terminalAuditAttempted = true;
        try {
          await this.writeAudit(entry, request, startedAt, candidateAuditId, "succeeded", undefined, policyMetadata);
          terminalAuditWritten = true;
          auditId = candidateAuditId;
        } catch (error) {
          if (entry.operation.safety.audit === "required") throw error;
        }
      }
      const response: AdminOperationResult<T> = {
        ...domainResponse,
        ...(auditId ? { auditId } : {}),
      };
      if (idempotencyPersisted && idempotencyClaim && idempotencyIdentity && this.idempotency) {
        try {
          if (auditId) {
            await this.idempotency.finalizeAudit(
              idempotencyIdentity,
              idempotencyClaim.fingerprint,
              { auditId, completedAt: this.now().toISOString() },
            );
          }
        } catch {
          // The stable terminal event ID was persisted before its idempotent
          // sink write. Replay safely redelivers the same logical event ID.
        }
      }
      return response;
    } catch (error) {
      let dispatchError = error;
      if (
        entry &&
        domainCompleted &&
        domainResponse &&
        terminalAuditAttempted &&
        !terminalAuditWritten &&
        entry.operation.safety.audit === "required"
      ) {
        const compensator = entry.adapter.compensators?.[entry.operation.id];
        if (compensator && auditFailureDefinitelyNotPersisted(error)) {
          const rollbackAuditId = terminalAuditId ?? this.createAuditId();
          compensationAuditMetadata = { ...policyMetadata, compensation: "succeeded" };
          const preparedAt = this.now().toISOString();
          const preparedResult = normalizeAdminError(
            new AdminError(
              "dependency_unavailable",
              "The domain mutation is pending durable compensation.",
              {
                retryable: false,
                details: { outcome: "compensation_pending", reconciliationRequired: true },
              },
            ),
            {
              requestId: request.context.requestId,
              correlationId: request.context.correlationId,
            },
          );
          let compensationPrepared = true;
          try {
            if (idempotencyClaim && idempotencyIdentity && this.idempotency) {
              await this.prepareCompensation(
                idempotencyClaim,
                {
                  identity: idempotencyIdentity,
                  fingerprint: idempotencyClaim.fingerprint,
                  result: preparedResult,
                  audit: {
                    status: "pending",
                    auditId: rollbackAuditId,
                    outcome: "failed",
                    errorCode: "dependency_unavailable",
                    ...(compensationAuditMetadata ? { metadata: compensationAuditMetadata } : {}),
                    updatedAt: preparedAt,
                  },
                  compensation: {
                    status: "pending",
                    domainResult: domainResponse,
                    updatedAt: preparedAt,
                  },
                  createdAt: preparedAt,
                },
              );
            }
          } catch (cause) {
            compensationPrepared = false;
            dispatchError = new AdminError(
              "dependency_unavailable",
              "The domain operation completed, but durable compensation fencing could not be established.",
              {
                retryable: true,
                details: {
                  outcome: "domain_completed",
                  compensationPrepared: false,
                  reconciliationRequired: true,
                },
                cause,
              },
            );
          }
          if (compensationPrepared) {
            compensationDomainResponse = domainResponse;
            try {
              await compensator({
                input: request.input,
                context: request.context,
                result: domainResponse,
                cause: error,
              });
              domainCompleted = false;
              domainCompensated = true;
              domainResponse = undefined;
              try {
                await this.writeAudit(
                  entry,
                  request,
                  startedAt,
                  rollbackAuditId,
                  "failed",
                  "dependency_unavailable",
                  compensationAuditMetadata,
                );
                terminalAuditWritten = true;
                auditId = rollbackAuditId;
              } catch (cause) {
                dispatchError = new AdminError(
                  "dependency_unavailable",
                  "The domain mutation was rolled back, but its terminal audit requires reconciliation.",
                  {
                    retryable: false,
                    details: { outcome: "compensated", reconciliationRequired: true },
                    cause,
                  },
                );
              }
            } catch (cause) {
              dispatchError = new AdminError(
                "dependency_unavailable",
                "The domain operation completed, but its failed audit and compensation require reconciliation.",
                {
                  retryable: false,
                  details: { outcome: "domain_completed", compensationFailed: true },
                  cause,
                },
              );
              if (idempotencyClaim && idempotencyIdentity && this.idempotency) {
                const compensationClaim = idempotencyClaim;
                const failedAt = this.now().toISOString();
                const failedCompensationResult = normalizeAdminError(dispatchError, {
                  requestId: request.context.requestId,
                  correlationId: request.context.correlationId,
                });
                try {
                  await this.idempotency.complete(compensationClaim, {
                    identity: idempotencyIdentity,
                    fingerprint: compensationClaim.fingerprint,
                    result: failedCompensationResult,
                    audit: {
                      status: "pending",
                      auditId: rollbackAuditId,
                      outcome: "failed",
                      errorCode: "dependency_unavailable",
                      ...(compensationAuditMetadata ? { metadata: compensationAuditMetadata } : {}),
                      updatedAt: failedAt,
                    },
                    compensation: {
                      status: "failed",
                      domainResult: compensationDomainResponse!,
                      updatedAt: failedAt,
                    },
                    createdAt: preparedAt,
                  });
                  idempotencyClaim = undefined;
                } catch {
                  // The durable pending marker remains retryable when this
                  // failed-attempt transition cannot be acknowledged.
                  try {
                    await this.idempotency.releaseCompensation(compensationClaim);
                  } catch {
                    // A committed failed transition already settled the claim.
                  }
                }
              }
            }
          }
        } else if (compensator) {
          dispatchError = new AdminError(
            "dependency_unavailable",
            "The domain operation completed, but the terminal audit acknowledgement is ambiguous.",
            {
              retryable: idempotencyPersisted,
              details: {
                outcome: "domain_completed",
                auditAcknowledgement: "unknown",
                reconciliationRequired: true,
              },
              cause: error,
            },
          );
        }
      }
      const normalized = normalizeAdminError(dispatchError, {
        requestId: request.context?.requestId,
        correlationId: request.context?.correlationId,
      });
      const safeNormalized = normalized.error.details === undefined
        ? normalized
        : {
            ...normalized,
            error: {
              ...normalized.error,
              details: redactAdminValue(normalized.error.details, [
                ...(entry?.operation.redaction?.inputFields ?? []),
                ...(entry?.operation.redaction?.outputFields ?? []),
              ]),
            },
          };
      if (
        entry &&
        inputValidated &&
        this.shouldAudit(entry) &&
        this.audit &&
        !terminalAuditAttempted &&
        !(attemptedAuditAttempted && !domainInvoked)
      ) {
        const failureAuditId = this.createAuditId();
        try {
          await this.writeAudit(
            entry,
            request,
            startedAt,
            failureAuditId,
            domainCompleted
              ? "succeeded"
              : normalized.error.code === "forbidden" || normalized.error.code === "precondition_failed"
                ? "denied"
                : "failed",
            normalized.error.code,
            policyMetadata,
          );
          terminalAuditWritten = true;
          auditId = failureAuditId;
        } catch {
          auditId = undefined;
          // The original safe error remains authoritative; deployments observe audit sink failures separately.
        }
      }
      const failedResult = auditId && terminalAuditWritten ? { ...safeNormalized, auditId } : safeNormalized;
      if (idempotencyClaim && idempotencyIdentity && this.idempotency) {
        try {
          if (!domainInvoked) {
            await this.idempotency.release(idempotencyClaim);
          } else if (domainCompleted && domainResponse && !idempotencyPersisted) {
            // Completion is retry-safe for the same fenced claim. This covers
            // stores that committed then lost their acknowledgement as well as
            // one-shot availability faults, without re-running the domain.
            await this.persistDomainOutcome(
              idempotencyClaim,
              idempotencyIdentity,
              domainResponse,
              terminalAuditWritten ? "completed" : entry && this.shouldAudit(entry) ? "pending" : "not-required",
              terminalAuditWritten ? auditId : undefined,
              policyMetadata,
            );
          } else if (!domainCompleted) {
            // Once the handler was entered, even retryable failures stay
            // fenced: execution may have committed before the error surfaced.
            const stableCompensationAuditId = domainCompensated ? terminalAuditId : undefined;
            const timestamp = this.now().toISOString();
            const persistedFailedResult = stableCompensationAuditId
              ? (({ auditId: _failedAuditReceipt, ...withoutReceipt }) => withoutReceipt)(failedResult)
              : failedResult;
            await this.idempotency.complete(idempotencyClaim, {
              identity: idempotencyIdentity,
              fingerprint: idempotencyClaim.fingerprint,
              result: persistedFailedResult,
              ...(stableCompensationAuditId
                ? {
                    audit: {
                      status: "pending" as const,
                      auditId: stableCompensationAuditId,
                      outcome: "failed" as const,
                      errorCode: "dependency_unavailable",
                      ...(compensationAuditMetadata ? { metadata: compensationAuditMetadata } : {}),
                      updatedAt: timestamp,
                    },
                    compensation: {
                      status: "completed" as const,
                      domainResult: compensationDomainResponse as AdminOperationResult<T>,
                      updatedAt: timestamp,
                    },
                  }
                : {}),
              createdAt: timestamp,
            });
            if (stableCompensationAuditId && terminalAuditWritten) {
              await this.idempotency.finalizeAudit(
                idempotencyIdentity,
                idempotencyClaim.fingerprint,
                { auditId: stableCompensationAuditId, completedAt: timestamp },
              );
            }
          }
        } catch {
          // Preserve the operation error. Durable stores retain/fence claims
          // whose release or completion could not be proven.
          if (domainCompensated) {
            try {
              await this.idempotency.releaseCompensation(idempotencyClaim);
            } catch {
              // A committed completion already settled the compensation claim.
            }
          }
        }
      }
      return failedResult;
    }
  }

  private assertContext(context: AdminOperationContext): void {
    if (typeof context?.actor?.id !== "string" || !context.actor.id.trim()) throw new AdminError("unauthenticated", "An authenticated administration actor is required.");
    if (typeof context.requestId !== "string" || !context.requestId.trim() || typeof context.source !== "string" || !context.source.trim()) {
      throw new AdminError("invalid_argument", "Request identity and source are required.");
    }
    assertAdminScopeHierarchy(context.scope);
  }

  private defaultPolicy(entry: AdminRegistryOperation, context: AdminOperationContext): AdminPolicyDecision {
    const permissions = context.actor.permissions ?? [];
    return { allowed: permissions.includes("*") || permissions.includes(entry.operation.permission) };
  }

  private idempotencyIdentity(entry: AdminRegistryOperation, context: AdminOperationContext): AdminIdempotencyIdentity | undefined {
    if (entry.operation.safety.classification === "read" || !context.idempotencyKey || !entry.operation.safety.idempotent) return undefined;
    return { key: context.idempotencyKey, actorId: context.actor.id, scope: canonicalAdminScope(context.scope), operationId: entry.operation.id };
  }

  private shouldAudit(entry: AdminRegistryOperation): boolean {
    return entry.operation.safety.audit === "required" || (entry.operation.safety.audit === "optional" && Boolean(this.audit));
  }

  private async persistDomainOutcome<T>(
    claim: AdminIdempotencyClaim,
    identity: AdminIdempotencyIdentity,
    result: AdminResult<T>,
    auditStatus: "pending" | "completed" | "not-required",
    auditId?: string,
    metadata?: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    if (!this.idempotency) return;
    const timestamp = this.now().toISOString();
    await this.idempotency.complete(claim, {
      identity,
      fingerprint: claim.fingerprint,
      result,
      ...(auditId ? { auditId } : {}),
      audit: {
        status: auditStatus,
        ...(auditId ? { auditId } : {}),
        ...(auditStatus === "not-required"
          ? {}
          : {
              outcome: "succeeded" as const,
              ...(metadata ? { metadata } : {}),
            }),
        updatedAt: timestamp,
      },
      createdAt: timestamp,
    });
  }

  private async prepareCompensation<T>(
    claim: AdminIdempotencyClaim,
    record: AdminIdempotencyRecord<T> & {
      compensation: { status: "pending"; updatedAt: string };
    },
  ): Promise<void> {
    if (!this.idempotency) return;
    try {
      await this.idempotency.prepareCompensation(claim, record);
    } catch {
      // A retry resolves both one-shot before-write failures and lost
      // acknowledgements after the atomic transition was already committed.
      await this.idempotency.prepareCompensation(claim, record);
    }
  }

  private async reconcileCompensation<T>(
    entry: AdminRegistryOperation,
    request: AdminDispatchRequest,
    startedAt: Date,
    record: AdminIdempotencyRecord<T>,
  ): Promise<
    | { status: "replay"; record: AdminIdempotencyRecord<T> }
    | { status: "result"; result: AdminResult<T> }
  > {
    if (!this.idempotency) return { status: "replay", record };
    const reservation = await claimAdminCompensation<T>(
      this.idempotency,
      record.identity,
      record.fingerprint,
    );
    if (reservation.status === "replay") return reservation;

    const claimedRecord = reservation.record;
    const compensation = claimedRecord.compensation;
    const compensator = entry.adapter.compensators?.[entry.operation.id];
    const auditId = claimedRecord.audit?.auditId;
    if (!compensation || compensation.status === "completed" || !compensator || !auditId) {
      try {
        await this.idempotency.releaseCompensation(reservation.claim);
      } catch {
        // Preserve the deterministic incomplete-record error.
      }
      const invalid = normalizeAdminError(
        new AdminError("internal", "The durable compensation record is incomplete."),
        { requestId: request.context.requestId, correlationId: request.context.correlationId },
      );
      return { status: "result", result: invalid };
    }

    try {
      await compensator({
        input: request.input,
        context: request.context,
        result: compensation.domainResult,
        cause: new AdminError(
          "dependency_unavailable",
          "Retrying compensation after the required terminal audit could not be persisted.",
        ),
      });
    } catch (cause) {
      const failedAt = this.now().toISOString();
      const failedResult = normalizeAdminError(
        new AdminError(
          "dependency_unavailable",
          "The domain operation completed, but its failed audit and compensation still require reconciliation.",
          {
            retryable: true,
            details: { outcome: "domain_completed", compensationFailed: true, reconciliationRequired: true },
            cause,
          },
        ),
        { requestId: request.context.requestId, correlationId: request.context.correlationId },
      );
      try {
        await this.idempotency.complete(reservation.claim, {
          ...claimedRecord,
          result: failedResult,
          compensation: { ...compensation, status: "failed", updatedAt: failedAt },
        });
      } catch {
        try {
          await this.idempotency.releaseCompensation(reservation.claim);
        } catch {
          // A committed completion makes releasing the reconciliation claim unnecessary.
        }
      }
      return {
        status: "result",
        result: {
          ...outwardAdminResult(failedResult, entry),
          meta: { idempotencyReplay: true, compensationFailed: true },
        },
      };
    }

    let terminalAuditWritten = false;
    try {
      await this.writeAudit(
        entry,
        request,
        startedAt,
        auditId,
        "failed",
        claimedRecord.audit?.errorCode ?? "dependency_unavailable",
        claimedRecord.audit?.metadata,
      );
      terminalAuditWritten = true;
    } catch {
      // The completed compensation is persisted below with the stable pending
      // audit ID so a later replay redelivers the event without compensating.
    }

    const completedAt = this.now().toISOString();
    const completedResult = normalizeAdminError(
      new AdminError(
        "dependency_unavailable",
        terminalAuditWritten
          ? "The domain mutation was rolled back because its required terminal audit initially failed."
          : "The domain mutation was rolled back, but its terminal audit requires reconciliation.",
        {
          retryable: false,
          details: {
            outcome: "compensated",
            ...(terminalAuditWritten ? {} : { reconciliationRequired: true }),
          },
        },
      ),
      { requestId: request.context.requestId, correlationId: request.context.correlationId },
    );
    const resultWithReceipt = terminalAuditWritten
      ? { ...completedResult, auditId }
      : completedResult;
    let completionPersisted = true;
    try {
      await this.idempotency.complete(reservation.claim, {
        ...claimedRecord,
        result: completedResult,
        audit: {
          ...claimedRecord.audit,
          status: "pending",
          updatedAt: completedAt,
        },
        compensation: { ...compensation, status: "completed", updatedAt: completedAt },
      });
      if (terminalAuditWritten) {
        await this.idempotency.finalizeAudit(
          claimedRecord.identity,
          claimedRecord.fingerprint,
          { auditId, completedAt },
        );
      }
    } catch {
      completionPersisted = false;
      try {
        await this.idempotency.releaseCompensation(reservation.claim);
      } catch {
        // A committed completion makes releasing the reconciliation claim unnecessary.
      }
    }
    return {
      status: "result",
      result: {
        ...outwardAdminResult(resultWithReceipt, entry),
        meta: {
          idempotencyReplay: true,
          compensationCompleted: true,
          ...(!completionPersisted ? { idempotencyReconciliationPending: true } : {}),
        },
      },
    };
  }

  private redactAuditMetadata(
    entry: AdminRegistryOperation,
    metadata: Readonly<Record<string, unknown>>,
  ): Readonly<Record<string, unknown>> {
    return redactAdminValue(metadata, [
      ...(entry.operation.redaction?.inputFields ?? []),
      ...(entry.operation.redaction?.outputFields ?? []),
    ]) as Readonly<Record<string, unknown>>;
  }

  private async writeAudit(
    entry: AdminRegistryOperation,
    request: AdminDispatchRequest,
    startedAt: Date,
    auditId: string,
    outcome: "attempted" | "succeeded" | "failed" | "denied" | "replayed",
    errorCode?: string,
    metadata?: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    if (!this.audit) {
      if (entry.operation.safety.audit === "required") throw new AdminError("dependency_unavailable", "A required administration audit sink is unavailable.");
      return;
    }
    try {
      const safeInput = redactAdminValue(request.input, entry.operation.redaction?.inputFields ?? []);
      const target = entry.operation.target.collection === true
        ? { resource: entry.operation.target.resource, collection: true as const }
        : {
            resource: entry.operation.target.resource,
            idInput: entry.operation.target.idInput,
            ...(() => {
              const value = safeInput && typeof safeInput === "object" && !Array.isArray(safeInput)
                ? (safeInput as Record<string, unknown>)[entry.operation.target.idInput]
                : undefined;
              return typeof value === "string" || typeof value === "number" ? { id: value } : {};
            })(),
          };
      await this.audit.write({
        id: auditId,
        timestamp: this.now().toISOString(),
        actorId: request.context.actor.id,
        actorType: request.context.actor.type,
        scope: request.context.scope,
        moduleId: entry.moduleId,
        operationId: entry.operation.id,
        classification: entry.operation.safety.classification,
        permission: entry.operation.permission,
        source: request.context.source,
        requestId: request.context.requestId,
        correlationId: request.context.correlationId,
        idempotencyKey: request.context.idempotencyKey,
        target,
        input: safeInput,
        outcome,
        errorCode,
        durationMs: Math.max(0, this.now().getTime() - startedAt.getTime()),
        ...(metadata === undefined
          ? {}
          : {
              metadata: redactAdminValue(metadata, [
                ...(entry.operation.redaction?.inputFields ?? []),
                ...(entry.operation.redaction?.outputFields ?? []),
              ]) as Readonly<Record<string, unknown>>,
            }),
      });
    } catch (cause) {
      throw new AdminError(
        "dependency_unavailable",
        "The administration audit event could not be recorded.",
        { cause },
      );
    }
  }
}

export function createAdminDispatcher(options: CreateAdminDispatcherOptions): AdminDispatcher {
  return new AdminDispatcher(options);
}
