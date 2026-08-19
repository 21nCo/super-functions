import {
  instrumentMethods,
  type SuperfunctionObservability,
} from "@superfunctions/observability";
import type { StorageAdapter } from "./types.js";

export interface StorageInstrumentationOptions {
  observability?: SuperfunctionObservability;
  kind?: string;
  component?: string;
}

export function instrumentStorageAdapter(
  storage: StorageAdapter,
  options: StorageInstrumentationOptions = {},
): StorageAdapter {
  return instrumentMethods({
    target: storage,
    observability: options.observability,
    kind: options.kind ?? "storage",
    component: options.component,
    extract: ({ property, args }) => {
      const firstArg = args[0];
      return {
        operation: String(property),
        resource: readStringProperty(firstArg, "key"),
        labels: readStringProperty(firstArg, "target")
          ? { storageTarget: readStringProperty(firstArg, "target") as string }
          : undefined,
      };
    },
  });
}

function readStringProperty(value: unknown, property: string): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const propertyValue = (value as Record<string, unknown>)[property];
  return typeof propertyValue === "string" ? propertyValue : undefined;
}
