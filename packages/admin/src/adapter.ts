import type {
  AdminCapabilityAdapter,
  AdminCapabilityManifest,
  AdminOperationContext,
  AdminOperationCompensators,
  AdminOperationHandlers,
  AdminOperationResult,
} from "./types.js";

export interface CreateAdminCapabilityAdapterOptions<
  TManifest extends AdminCapabilityManifest = AdminCapabilityManifest,
> {
  manifest: TManifest;
  handlers: AdminOperationHandlers;
  compensators?: AdminOperationCompensators;
}

function isResult(value: unknown): value is AdminOperationResult {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { ok?: unknown }).ok === true &&
      "data" in value,
  );
}

export function createAdminCapabilityAdapter<
  const TManifest extends AdminCapabilityManifest,
>(
  manifestOrOptions: TManifest | CreateAdminCapabilityAdapterOptions<TManifest>,
  providedHandlers?: AdminOperationHandlers,
): AdminCapabilityAdapter<TManifest> {
  const manifest = ("manifest" in manifestOrOptions
    ? manifestOrOptions.manifest
    : manifestOrOptions) as TManifest;
  const handlers = ("manifest" in manifestOrOptions
    ? manifestOrOptions.handlers
    : providedHandlers) ?? {};
  const compensators = "manifest" in manifestOrOptions
    ? manifestOrOptions.compensators
    : undefined;

  const invoke = async <T = unknown>(
    operationId: string,
    input: unknown,
    context: AdminOperationContext,
  ): Promise<AdminOperationResult<T>> => {
    const operation = manifest.operations.find((candidate) => candidate.id === operationId);
    if (!operation) {
      throw new Error(`Unknown admin operation: ${manifest.id}.${operationId}`);
    }
    const handler = handlers[operationId];
    if (!handler) {
      throw new Error(`No handler registered for admin operation: ${manifest.id}.${operationId}`);
    }
    const value = await handler({ input, context });
    return (isResult(value)
      ? value
      : {
          ok: true,
          data: value,
          requestId: context.requestId,
          correlationId: context.correlationId,
        }) as AdminOperationResult<T>;
  };

  return { manifest, handlers, ...(compensators ? { compensators } : {}), invoke, execute: invoke };
}

export const createAdminAdapter = createAdminCapabilityAdapter;
