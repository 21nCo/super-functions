import type {
  DatafnChangelogEntry,
  DatafnHydrationState,
  DatafnStorageAdapter,
} from "@datafn/client";
import {
  requestBridgeMethod,
  type DatafnBridgeBus,
  type NativeBridgeMarker,
} from "./protocol.js";

export function createNativeBackedStorageAdapter(
  bus: DatafnBridgeBus,
): DatafnStorageAdapter & NativeBridgeMarker {
  return {
    __datafnNativeBacked: true,
    getRecord(resource, id) {
      return requestBridgeMethod<Record<string, unknown> | null>(
        bus,
        "storage.getRecord",
        { resource, id },
      );
    },
    listRecords(resource) {
      return requestBridgeMethod<Record<string, unknown>[]>(
        bus,
        "storage.listRecords",
        { resource },
      );
    },
    upsertRecord(resource, record) {
      return requestBridgeMethod<void>(bus, "storage.upsertRecord", {
        resource,
        record,
      });
    },
    deleteRecord(resource, id) {
      return requestBridgeMethod<void>(bus, "storage.deleteRecord", {
        resource,
        id,
      });
    },
    mergeRecord(resource, id, partial, options) {
      return requestBridgeMethod<Record<string, unknown>>(
        bus,
        "storage.mergeRecord",
        { resource, id, partial, ...(options ? { options } : {}) },
      );
    },
    listJoinRows(relationKey) {
      return requestBridgeMethod<Array<Record<string, unknown>>>(
        bus,
        "storage.listJoinRows",
        { relationKey },
      );
    },
    getJoinRows(relationKey, fromId) {
      return requestBridgeMethod<Array<Record<string, unknown>>>(
        bus,
        "storage.getJoinRows",
        { relationKey, fromId },
      );
    },
    getJoinRowsInverse(relationKey, toId) {
      return requestBridgeMethod<Array<Record<string, unknown>>>(
        bus,
        "storage.getJoinRowsInverse",
        { relationKey, toId },
      );
    },
    upsertJoinRow(relationKey, row) {
      return requestBridgeMethod<void>(bus, "storage.upsertJoinRow", {
        relationKey,
        row,
      });
    },
    setJoinRows(relationKey, rows) {
      return requestBridgeMethod<void>(bus, "storage.setJoinRows", {
        relationKey,
        rows,
      });
    },
    deleteJoinRow(relationKey, from, to) {
      return requestBridgeMethod<void>(bus, "storage.deleteJoinRow", {
        relationKey,
        from,
        to,
      });
    },
    findRecords(resource, field, value) {
      return requestBridgeMethod<Record<string, unknown>[]>(
        bus,
        "storage.findRecords",
        { resource, field, value },
      );
    },
    getCursor(resource) {
      return requestBridgeMethod<string | null>(bus, "storage.getCursor", {
        resource,
      });
    },
    setCursor(resource, cursor) {
      return requestBridgeMethod<void>(bus, "storage.setCursor", {
        resource,
        cursor,
      });
    },
    getHydrationState(resource) {
      return requestBridgeMethod<DatafnHydrationState>(
        bus,
        "storage.getHydrationState",
        { resource },
      );
    },
    setHydrationState(resource, state) {
      return requestBridgeMethod<void>(bus, "storage.setHydrationState", {
        resource,
        state,
      });
    },
    changelogAppend(entry) {
      return requestBridgeMethod<DatafnChangelogEntry>(
        bus,
        "storage.changelogAppend",
        { entry },
      );
    },
    changelogList(options) {
      return requestBridgeMethod<DatafnChangelogEntry[]>(
        bus,
        "storage.changelogList",
        { options },
      );
    },
    changelogAck(options) {
      return requestBridgeMethod<void>(bus, "storage.changelogAck", {
        options,
      });
    },
    countRecords(resource) {
      return requestBridgeMethod<number>(bus, "storage.countRecords", {
        resource,
      });
    },
    countJoinRows(relationKey) {
      return requestBridgeMethod<number>(bus, "storage.countJoinRows", {
        relationKey,
      });
    },
    close() {
      return requestBridgeMethod<void>(bus, "storage.close");
    },
    clearAll() {
      return requestBridgeMethod<void>(bus, "storage.clearAll");
    },
    healthCheck() {
      return requestBridgeMethod<{ ok: boolean; issues: string[] }>(
        bus,
        "storage.healthCheck",
      );
    },
  };
}
