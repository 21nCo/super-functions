---
title: Document uploads
description: PDF / DOCX / plain text uploads with first-page previews, OCR text extraction, and download URLs.
---

# Document uploads

Goal:

- PDFs uploaded with first-page raster previews.
- OCR text extracted into a searchable artifact.
- Plain text and DOCX downloadable; PDFs renderable inline.

## Policy

```ts
fileFn.definePolicy("user-document", {
  contentTypes: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/markdown",
  ],
  maxSizeBytes: 100 * 1024 * 1024,
  visibility: "private",
  storageTarget: "durable",
  artifactStorageTarget: "hot-cdn",
  storagePath: ({ tenantId, fileId, versionId, fileName }) =>
    `tenants/${tenantId}/docs/${fileId}/${versionId}/${fileName}`,
});
```

## Processors

```ts
import {
  createPdfPreviewProcessor,
  createOCRProcessor,
  createTesseractJsOCRProvider,
} from "@filefn/processing";

const pdfPreview = createPdfPreviewProcessor({
  sizes: [{ name: "preview", width: 1024, height: 1024 }],
});

const ocr = createOCRProcessor({
  provider: createTesseractJsOCRProvider({ languages: ["eng"] }),
  outputs: ["text"],
});

const fileFn = createFileFn({
  db, storage,
  processing: {
    enabled: true,
    processors: [pdfPreview, ocr],
  },
});
```

For production OCR, swap `createTesseractJsOCRProvider` for a cloud OCR provider (Google Vision, AWS Textract). Same processor, different `provider`.

## Searching

The OCR artifact's `kind` is `ocr-text`. Index it after `processing.completed`:

```ts
fileFn.events.on("processing.completed", async (event) => {
  for (const artifact of event.artifactsCreated) {
    if (artifact.kind === "ocr-text") {
      const url = await fileFn.signArtifactUrl({ artifactId: artifact.artifactId });
      const text = await fetch(url).then((r) => r.text());
      await searchIndex.add({ fileId: event.fileId, text });
    }
  }
});
```

## Rendering

```ts
const renderable = await client.resolveRenderable({ fileId, intent: "preview" });

if (renderable.source.mode === "url") {
  embedElement.src = renderable.source.url; // PDF: native browser preview
                                            // PDF preview artifact: image
                                            // text/plain: text
}
```

## See also

- [Recipes › Image uploads](./image-uploads) — same pattern, image-shaped.
