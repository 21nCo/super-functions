import type {
  DatafnBridgeEventEnvelope as ClientDatafnBridgeEventEnvelope,
  DatafnNativeHandshakeRequest,
  DatafnNativeHandshakeResult,
  DatafnNativeSyncController,
} from "@datafn/client";
import type { DatafnEnvelope } from "@datafn/core";
import {
  DATAFN_BRIDGE_PROTOCOL,
  createBridgeError,
  nextBridgeRequestId,
  requestBridgeMethod,
  type DatafnBridgeBus,
  type NativeBridgeMarker,
} from "./protocol.js";

function validateRequiredString(
  value: string | undefined,
  path: string,
  message: string,
) {
  if (typeof value === "string" && value.trim().length > 0) {
    return null;
  }
  return createBridgeError("DFQL_INVALID", message, { path });
}

function validateHandshakePayload(
  payload: DatafnNativeHandshakeRequest,
) {
  return (
    validateRequiredString(payload.schemaHash, "payload.schemaHash", "schemaHash is required") ??
    validateRequiredString(payload.namespace, "payload.namespace", "namespace is required") ??
    validateRequiredString(payload.clientId, "payload.clientId", "clientId is required")
  );
}

export function createNativeSyncController(
  bus: DatafnBridgeBus,
): DatafnNativeSyncController & NativeBridgeMarker {
  return {
    __datafnNativeBacked: true,
    async handshake(
      payload: DatafnNativeHandshakeRequest,
    ): Promise<DatafnEnvelope<DatafnNativeHandshakeResult>> {
      const validationError = validateHandshakePayload(payload);
      if (validationError) {
        return { ok: false, error: validationError };
      }

      const response = await bus.request({
        protocol: DATAFN_BRIDGE_PROTOCOL,
        id: nextBridgeRequestId(),
        method: "handshake",
        payload,
      });

      if (!response.ok) {
        return { ok: false, error: response.error };
      }

      return {
        ok: true,
        result: response.result as DatafnNativeHandshakeResult,
      };
    },
    start() {
      return requestBridgeMethod<void>(bus, "sync.start");
    },
    stop() {
      return requestBridgeMethod<void>(bus, "sync.stop");
    },
    pullNow() {
      return requestBridgeMethod<void>(bus, "sync.pullNow");
    },
    cloneNow() {
      return requestBridgeMethod<void>(bus, "sync.cloneNow");
    },
    reconcileNow() {
      return requestBridgeMethod<void>(bus, "sync.reconcileNow");
    },
    schedulePush() {
      return requestBridgeMethod<void>(bus, "sync.schedulePush");
    },
    onEvent(handler: (event: ClientDatafnBridgeEventEnvelope) => void) {
      return bus.subscribe((event) => handler(event));
    },
  };
}
