import {
  instrumentMethods,
  type SuperfunctionObservability,
} from "@superfunctions/observability";
import type { Adapter, InternalCrud, KVStoreAdapter } from "./adapter/types.js";

export interface AdapterInstrumentationOptions {
  observability?: SuperfunctionObservability;
  kind?: string;
  component?: string;
}

export interface KVStoreInstrumentationOptions {
  observability?: SuperfunctionObservability;
  kind?: string;
  component?: string;
}

export function instrumentAdapter(
  adapter: Adapter,
  options: AdapterInstrumentationOptions = {},
): Adapter {
  const observability = options.observability;
  if (!observability) {
    return adapter;
  }

  return new Proxy(adapter, {
    get(target, property, receiver) {
      if (property === "internal") {
        return instrumentInternalCrud(
          Reflect.get(target, property, receiver) as InternalCrud,
          options,
        );
      }

      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") {
        return value;
      }

      return async (...args: unknown[]) => {
        const metadata = extractAdapterMetadata(property, args);
        const span = observability.span({
          kind: options.kind ?? "db",
          component: options.component,
          operation: metadata.operation,
          resource: metadata.resource,
          labels: metadata.labels,
        });
        try {
          const result = await value.apply(target, args);
          span.end({ ok: true });
          return result;
        } catch (error) {
          span.end({ ok: false });
          throw error;
        }
      };
    },
  }) as Adapter;
}

export function instrumentKVStore<TStore extends KVStoreAdapter>(
  store: TStore,
  options: KVStoreInstrumentationOptions = {},
): TStore {
  return instrumentMethods({
    target: store,
    observability: options.observability,
    kind: options.kind ?? "cache",
    component: options.component,
    extract: ({ property, args }) => ({
      operation: String(property),
      resource: typeof args[0] === "string"
        ? args[0]
        : readStringProperty(args[0], "key"),
      }),
  }) as TStore;
}

function instrumentInternalCrud(
  internal: InternalCrud,
  options: AdapterInstrumentationOptions,
): InternalCrud {
  return instrumentMethods({
    target: internal,
    observability: options.observability,
    kind: options.kind ?? "db",
    component: options.component,
    extract: ({ property, args }) => ({
      operation: `internal.${String(property)}`,
      resource: typeof args[0] === "string" ? args[0] : undefined,
    }),
  });
}

function extractAdapterMetadata(
  property: PropertyKey,
  args: unknown[],
): {
  operation: string;
  resource?: string;
  labels?: Record<string, string>;
} {
  const firstArg = args[0];
  const model = readStringProperty(firstArg, "model");
  const namespace = readStringProperty(firstArg, "namespace");
  return {
    operation: String(property),
    resource: model,
    labels: namespace ? { dbNamespace: namespace } : undefined,
  };
}

function readStringProperty(value: unknown, property: string): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const propertyValue = (value as Record<string, unknown>)[property];
  return typeof propertyValue === "string" ? propertyValue : undefined;
}
