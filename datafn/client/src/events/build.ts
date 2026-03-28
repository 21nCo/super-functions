/**
 * Event emission factory (EVT-001)
 */

import type { DatafnEvent } from "@datafn/core";

export function buildEvent(
  type: DatafnEvent["type"],
  overrides?: Partial<Omit<DatafnEvent, "type" | "timestampMs">>,
): DatafnEvent {
  return { type, timestampMs: Date.now(), ...overrides } as DatafnEvent;
}
