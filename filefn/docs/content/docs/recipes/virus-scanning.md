---
title: Virus scanning
description: Plug ClamAV (or any AV provider) into the filefn processing pipeline as a custom processor.
---

# Virus scanning

Goal: every uploaded file is scanned for malware before it's served. Infected files are quarantined.

## Processor

```ts
import type { Processor, ProcessorResult } from "@filefn/processing";
import { exec } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { promisify } from "node:util";

const execP = promisify(exec);

export function createClamAVProcessor(): Processor {
  return {
    name: "clamav",
    supportedMimeTypes: ["*/*"],
    async process(input, getData): Promise<ProcessorResult> {
      const data = await getData();
      const tmpPath = `/tmp/filefn-${input.fileId}-${input.versionId}`;
      await writeFile(tmpPath, data);

      try {
        await execP(`clamscan --no-summary "${tmpPath}"`);
        return {
          success: true,
          artifacts: [
            {
              kind: "av-scan",
              mimeType: "application/json",
              data: new TextEncoder().encode(JSON.stringify({
                clean: true,
                scannedAt: new Date().toISOString(),
              })),
              storageKey: input.storageKey + ".av-scan.json",
            },
          ],
        };
      } catch (error) {
        // clamscan exits non-zero on detection
        return {
          success: false,
          error: "av-scan-failed",
          artifacts: [
            {
              kind: "av-scan",
              mimeType: "application/json",
              data: new TextEncoder().encode(JSON.stringify({
                clean: false,
                detection: String(error),
                scannedAt: new Date().toISOString(),
              })),
              storageKey: input.storageKey + ".av-scan.json",
            },
          ],
        };
      } finally {
        await unlink(tmpPath).catch(() => {});
      }
    },
  };
}
```

## Wire it

```ts
const fileFn = createFileFn({
  db, storage,
  processing: {
    enabled: true,
    processors: [createClamAVProcessor() /* + others */],
  },
});
```

## Quarantine

When `processing.failed` fires with the `clamav` processor name, mark the file in your app as quarantined:

```ts
fileFn.events.on("processing.failed", async (event) => {
  if (event.processor === "clamav") {
    await db.update("filefn_files", { metadata: { quarantined: true } }, { fileId: event.fileId });
    await alertTeam({ fileId: event.fileId, reason: "av-scan-failed" });
  }
});
```

Add a custom `Authorizer` that denies reads for quarantined files:

```ts
const quarantineGuard: AuthorizerStrategy = {
  async canRead(file) {
    if (file.metadata?.quarantined) return false;
    return undefined;
  },
};
```

## Async scanning

For multi-GB files, run scanning via `@flowfn/server` so the upload request returns immediately. The user can be told "your file is being scanned" and the UI polls the renderable until it's safe to render.

## See also

- [Recipes › Custom processor](./custom-processor) — the general pattern.
