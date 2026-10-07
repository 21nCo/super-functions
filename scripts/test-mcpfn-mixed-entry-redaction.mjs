#!/usr/bin/env node

import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { createMcpFnClient, customTarget } from "../mcpfn/client/dist/index.js";

const require = createRequire(import.meta.url);
const { McpFnInspector } = require("../mcpfn/inspector/dist/index.cjs");

const client = createMcpFnClient({
  target: customTarget({
    kind: "mixed-entry",
    open: () => {
      throw new Error("unused");
    },
    redact: () => {
      throw new Error("forced redaction failure");
    },
  }),
});
const inspector = new McpFnInspector(client);

const emitEvent = Reflect.get(client, "emitEvent");
assert.equal(typeof emitEvent, "function");
await emitEvent.call(client, "notification", { secret: "must-not-survive" });

const timeline = inspector.timeline();
assert.deepEqual(client.getRedactionOmissionCounts(), {
  clientEvents: 1,
  diagnostics: 0,
});
assert.equal(timeline.length, 0);
assert.doesNotMatch(JSON.stringify(timeline), /must-not-survive/);

await inspector.close();
console.log("mixed ESM client / CJS inspector omission provenance passed");
