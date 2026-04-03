import type { OCRProcessorProvider, Processor, ProcessorInput, ProcessorResult } from '../types.js';
import { createTesseractJsOCRProvider } from '../providers/tesseract-ocr.js';
import type { OCRConfig } from '../types.js';

const SUPPORTED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/tiff',
  'image/bmp',
];

function resolveProvider(provider?: OCRProcessorProvider): OCRProcessorProvider {
  return provider ?? createTesseractJsOCRProvider();
}

function generateHOCR(text: string, fileName: string): string {
  const lines = text.split('\n').filter((line) => line.trim().length > 0);

  const wordBlocks = lines
    .map((line, idx) => {
      return `    <span class='ocr_line' id='line_${idx + 1}' title='bbox 0 ${idx * 30} 800 ${(idx + 1) * 30}'>${escapeHtml(line)}</span>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">
<head>
  <title>${escapeHtml(fileName)} - OCR Output</title>
  <meta http-equiv="content-type" content="text/html; charset=utf-8" />
  <meta name='ocr-system' content='filefn-ocr' />
  <meta name='ocr-capabilities' content='ocr_page ocr_carea ocr_par ocr_line' />
</head>
<body>
  <div class='ocr_page' id='page_1' title='bbox 0 0 800 ${Math.max(lines.length, 1) * 30}'>
${wordBlocks}
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function createOCRProcessor(config: OCRConfig = {}): Processor {
  const { language = 'eng', outputFormat = 'text', provider } = config;

  return {
    name: 'ocr',
    supportedMimeTypes: SUPPORTED_MIME_TYPES,

    async process(input: ProcessorInput, getData: () => Promise<Uint8Array>): Promise<ProcessorResult> {
      if (!SUPPORTED_MIME_TYPES.includes(input.mimeType)) {
        return {
          success: false,
          artifacts: [],
          error: `Unsupported MIME type: ${input.mimeType}`,
        };
      }

      try {
        const imageData = await getData();
        const artifacts = [];
        const baseKey = input.storageKey.replace(/\.[^/.]+$/, '');
        const runtime = resolveProvider(provider);
        const needsHOCR = outputFormat === 'hocr' || outputFormat === 'all';
        const extracted = await runtime.recognize({
          input,
          imageData,
          language,
          includeHOCR: needsHOCR,
        });
        const extractedAt = new Date().toISOString();

        if (outputFormat === 'text' || outputFormat === 'all') {
          const textData = new TextEncoder().encode(extracted.text);

          artifacts.push({
            kind: 'ocr-text',
            data: textData,
            mimeType: 'text/plain',
            storageKey: `${baseKey}-ocr.txt`,
            metadata: {
              language,
              format: 'text',
              sourceFileId: input.fileId,
              sourceVersionId: input.versionId,
              originalSize: imageData.length,
              textLength: extracted.text.length,
              confidence: extracted.confidence,
              extractedAt,
            },
          });
        }

        if (outputFormat === 'json' || outputFormat === 'all') {
          const jsonData = JSON.stringify(
            {
              text: extracted.text,
              language,
              confidence: extracted.confidence,
              extractedAt,
            },
            null,
            2,
          );
          const jsonBytes = new TextEncoder().encode(jsonData);

          artifacts.push({
            kind: 'ocr-json',
            data: jsonBytes,
            mimeType: 'application/json',
            storageKey: `${baseKey}-ocr.json`,
            metadata: {
              language,
              format: 'json',
              sourceFileId: input.fileId,
              sourceVersionId: input.versionId,
              textLength: extracted.text.length,
              confidence: extracted.confidence,
            },
          });
        }

        if (outputFormat === 'hocr' || outputFormat === 'all') {
          const hocrData = extracted.hocr && extracted.hocr.trim().length > 0
            ? extracted.hocr
            : generateHOCR(extracted.text, input.fileName);
          const hocrBytes = new TextEncoder().encode(hocrData);

          artifacts.push({
            kind: 'ocr-hocr',
            data: hocrBytes,
            mimeType: 'text/html',
            storageKey: `${baseKey}-ocr.hocr`,
            metadata: {
              language,
              format: 'hocr',
              sourceFileId: input.fileId,
              sourceVersionId: input.versionId,
              confidence: extracted.confidence,
            },
          });
        }

        return {
          success: true,
          artifacts,
        };
      } catch (error) {
        return {
          success: false,
          artifacts: [],
          error: error instanceof Error ? error.message : 'Unknown OCR error',
        };
      }
    },
  };
}

export { SUPPORTED_MIME_TYPES as OCR_SUPPORTED_MIME_TYPES };
