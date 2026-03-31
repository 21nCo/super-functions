import type { DatafnRemoteAdapter } from "@datafn/client";
import {
  requestBridgeMethod,
  type DatafnBridgeBus,
  type NativeBridgeMarker,
} from "./protocol.js";

export function createNativeBackedRemoteAdapter(
  bus: DatafnBridgeBus,
): DatafnRemoteAdapter & NativeBridgeMarker {
  return {
    __datafnNativeBacked: true,
    query(q) {
      return requestBridgeMethod(bus, "remote.query", q);
    },
    mutation(m) {
      return requestBridgeMethod(bus, "remote.mutation", m);
    },
    transact(t) {
      return requestBridgeMethod(bus, "remote.transact", t);
    },
    seed(payload) {
      return requestBridgeMethod(bus, "remote.seed", payload);
    },
    clone(payload) {
      return requestBridgeMethod(bus, "remote.clone", payload);
    },
    pull(payload) {
      return requestBridgeMethod(bus, "remote.pull", payload);
    },
    push(payload) {
      return requestBridgeMethod(bus, "remote.push", payload);
    },
    reconcile(payload) {
      return requestBridgeMethod(bus, "remote.reconcile", payload);
    },
  };
}
