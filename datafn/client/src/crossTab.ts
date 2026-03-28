/**
 * Cross-Tab Coordination via BroadcastChannel
 *
 * Enables event relay between browser tabs for near-instant cross-tab reactivity.
 * Opt-in via `crossTab: true` config.
 */

import type { EventBus } from "./events/bus.js";
import type { DatafnEvent } from "@datafn/core";

/**
 * Sanitized event payload for cross-tab broadcast.
 * Strips full record data, keeping only metadata.
 */
interface RelayEvent {
  sourceTabId: string;
  event: Omit<DatafnEvent, "context"> & {
    // Only metadata fields - no full record data
    type: DatafnEvent["type"];
    resource?: string;
    ids?: string[];
    mutationId?: string;
    clientId?: string;
    timestampMs: number;
    action?: string;
    fields?: string[];
    system?: boolean;
  };
}

/**
 * Known valid relay event type values (SEC-012)
 */
const KNOWN_EVENT_TYPES: ReadonlySet<string> = new Set([
  "mutation_applied",
  "mutation_rejected",
  "sync_applied",
  "sync_failed",
  "sync_retry",
  "connectivity_changed",
  "ws_connected",
  "ws_disconnected",
]);

/**
 * SEC-012: Runtime type guard for RelayEvent.
 * Validates that incoming cross-tab message has expected shape before processing.
 */
function isValidRelayEvent(data: unknown): data is RelayEvent {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  // Must have sourceTabId string
  if (typeof d.sourceTabId !== "string") return false;
  // Must have event object with a valid type
  if (typeof d.event !== "object" || d.event === null) return false;
  const event = d.event as Record<string, unknown>;
  if (typeof event.type !== "string" || !KNOWN_EVENT_TYPES.has(event.type)) return false;
  return true;
}

/**
 * Strip full record data from event, keeping only metadata for relay.
 */
function sanitizeForRelay(event: DatafnEvent): RelayEvent["event"] {
  return {
    type: event.type,
    resource: event.resource,
    ids: event.ids,
    mutationId: event.mutationId,
    clientId: event.clientId,
    timestampMs: event.timestampMs,
    action: event.action,
    fields: event.fields,
    system: event.system,
  };
}

/**
 * CrossTabRelay - relays mutation events between browser tabs via BroadcastChannel
 */
export class CrossTabRelay {
  private channel: BroadcastChannel | null = null;
  private tabId: string;
  private eventBus: EventBus;

  constructor(namespace: string, eventBus: EventBus) {
    this.tabId = crypto.randomUUID();
    this.eventBus = eventBus;

    // Check if BroadcastChannel is available (not available in all environments)
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel(`datafn:${namespace}`);
      this.channel.onmessage = (messageEvent) => {
        // SEC-012: Validate message shape before casting to RelayEvent
        const data = messageEvent.data;
        if (!isValidRelayEvent(data)) {
          // Silently discard invalid messages (rogue extension / XSS injection)
          return;
        }
        const relayEvent = data as RelayEvent;

        // Echo prevention: ignore messages from this tab
        if (relayEvent.sourceTabId === this.tabId) return;

        // Emit the event on local event bus with fromRemoteTab flag
        this.eventBus.emit({
          ...relayEvent.event,
          fromRemoteTab: true,
        } as DatafnEvent & { fromRemoteTab: true });
      };
    }
  }

  /**
   * Broadcast an event to other tabs.
   * Should only be called for non-silent, non-fromRemoteTab mutations.
   */
  broadcast(event: DatafnEvent): void {
    if (!this.channel) return;

    const relayEvent: RelayEvent = {
      sourceTabId: this.tabId,
      event: sanitizeForRelay(event),
    };

    this.channel.postMessage(relayEvent);
  }

  /**
   * Close the broadcast channel and release resources.
   */
  close(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
  }
}
