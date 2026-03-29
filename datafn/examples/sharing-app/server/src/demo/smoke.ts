import assert from "node:assert/strict";
import { createSharingDemoApp } from "../index.js";

async function run() {
  const { app, datafn, db } = await createSharingDemoApp();

  try {
    const bootstrapRes = await app.request("/demo/bootstrap");
    assert.equal(bootstrapRes.status, 200);
    const bootstrapBody = await bootstrapRes.json();
    assert.equal(bootstrapBody.ok, true);
    assert.equal(bootstrapBody.result.defaultWorkspaceId, "acme");

    const contextRes = await app.request("/demo/context", {
      method: "GET",
      headers: {
        "x-demo-workspace-id": "acme",
        "x-demo-user-id": "user:alice",
      },
    });
    assert.equal(contextRes.status, 200);
    const contextBody = await contextRes.json();
    assert.deepEqual(
      [...contextBody.result.effectivePrincipals].sort(),
      ["team:design", "user:alice"].sort(),
    );

    const resetRes = await app.request("/demo/reset", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ scenario: "baseline" }),
    });
    assert.equal(resetRes.status, 200);
    const resetBody = await resetRes.json();
    assert.equal(resetBody.ok, true);
    assert.deepEqual(resetBody.result.documentCounts, {
      "org:acme": 2,
      "org:globex": 1,
    });

    const invalidIdentityRes = await app.request("/datafn/query", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-demo-workspace-id": "acme",
      },
      body: JSON.stringify({ resource: "documents", version: 1, operation: "find" }),
    });
    assert.equal(invalidIdentityRes.status, 400);
    const invalidIdentityBody = await invalidIdentityRes.json();
    assert.equal(invalidIdentityBody.ok, false);
    assert.equal(invalidIdentityBody.error.code, "DEMO_IDENTITY_INVALID");

    console.log("sharing-app demo smoke checks passed");
  } finally {
    await datafn.close();
    await db.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
