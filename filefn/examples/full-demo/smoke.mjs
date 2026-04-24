#!/usr/bin/env node

const apiBase = process.env.FILEFN_DEMO_BASE_URL || "http://localhost:3001/filefn";
const clientBase = process.env.FILEFN_DEMO_CLIENT_BASE || "http://localhost:5173";
const apiOrigin = new URL(apiBase).origin;
const apiBasePath = new URL(apiBase).pathname.replace(/\/$/, "");
const redirectStatuses = new Set([301, 302, 303, 307, 308]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function parseEnvelope(response, label) {
  const body = await response.json();
  if (!response.ok || !body.ok) {
    throw new Error(`${label} failed: ${JSON.stringify(body)}`);
  }
  return body.data;
}

function resolveDownloadUrl(rawUrl) {
  const url = rawUrl.startsWith("/proxy/")
    ? new URL(`${apiBase.replace(/\/$/, "")}${rawUrl}`)
    : new URL(rawUrl, `${apiBase.replace(/\/$/, "")}/`);
  assert(url.origin === apiOrigin, `Download URL origin is not allowed: ${url.origin}`);
  assert(
    url.pathname === apiBasePath || url.pathname.startsWith(`${apiBasePath}/`),
    `Download URL path is outside API base: ${url.pathname}`,
  );
  return url.toString();
}

async function fetchResolvedDownload(rawUrl) {
  let currentUrl = resolveDownloadUrl(rawUrl);

  for (let redirects = 0; redirects < 5; redirects += 1) {
    const response = await fetch(currentUrl, { redirect: "manual" });
    if (!redirectStatuses.has(response.status)) {
      return response;
    }

    const location = response.headers.get("location");
    assert(location, `download redirect missing Location header from ${currentUrl}`);
    currentUrl = resolveDownloadUrl(new URL(location, currentUrl).toString());
  }

  throw new Error("download failed: too many redirects");
}

function safePathSegment(value, label) {
  assert(typeof value === "string" && value.length > 0, `${label} is missing`);
  assert(/^[A-Za-z0-9._:-]+$/.test(value), `${label} contains unsafe characters`);
  assert(value !== "." && value !== "..", `${label} contains an unsafe dot segment`);
  return encodeURIComponent(value);
}

async function main() {
  const bytes = Buffer.from(`filefn-demo-smoke-${Date.now()}`, "utf-8");

  const initData = await parseEnvelope(
    await fetch(`${apiBase}/upload/init`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        policy: "public-image",
        fileName: "smoke.png",
        size: bytes.length,
        mimeType: "image/png",
      }),
    }),
    "upload init",
  );

  assert(typeof initData.uploadMode === "string", "upload init did not return an upload mode");
  const uploadSessionId = safePathSegment(initData.uploadSessionId, "uploadSessionId");

  await parseEnvelope(
    await fetch(`${apiBase}/upload/${uploadSessionId}/parts/1`, {
      method: "PUT",
      headers: {
        "content-type": "application/octet-stream",
        "content-length": String(bytes.length),
      },
      body: bytes,
    }),
    "upload part",
  );

  const completeData = await parseEnvelope(
    await fetch(`${apiBase}/upload/${uploadSessionId}/complete`, { method: "POST" }),
    "upload complete",
  );
  const fileId = safePathSegment(completeData.fileId, "fileId");
  let deleted = false;

  try {
    const listBeforeDelete = await parseEnvelope(
      await fetch(`${apiBase}/?limit=50`),
      "list files",
    );

    const createdFile = listBeforeDelete.files.find((f) => f.fileId === completeData.fileId);
    assert(Boolean(createdFile), "Uploaded file was not returned by list");

    const downloadData = await parseEnvelope(
      await fetch(`${apiBase}/${fileId}/download`),
      "download descriptor",
    );
    const downloadResponse = await fetchResolvedDownload(downloadData.url);
    assert(downloadResponse.ok, `download failed with HTTP ${downloadResponse.status}`);
    const downloadedBytes = Buffer.from(await downloadResponse.arrayBuffer());
    assert(downloadedBytes.equals(bytes), "downloaded bytes do not match uploaded bytes");

    await parseEnvelope(
      await fetch(`${apiBase}/${fileId}`, { method: "DELETE" }),
      "delete file",
    );
    deleted = true;
  } finally {
    if (!deleted) {
      await fetch(`${apiBase}/${fileId}`, { method: "DELETE" }).catch(() => {});
    }
  }

  const listAfterDelete = await parseEnvelope(
    await fetch(`${apiBase}/?limit=50`),
    "list after delete",
  );
  const stillPresent = listAfterDelete.files.some((f) => f.fileId === completeData.fileId);
  assert(!stillPresent, "Deleted file is still present in listing");

  const clientResponse = await fetch(clientBase);
  assert(clientResponse.ok, `demo client check failed with HTTP ${clientResponse.status}`);

  console.log("Demo smoke passed: upload/list/download/delete all succeeded.");
  console.log(`API base: ${apiBase}`);
  console.log(`Client base: ${clientBase}`);
}

main().catch((error) => {
  console.error("Demo smoke failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
