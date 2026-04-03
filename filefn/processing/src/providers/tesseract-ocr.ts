import sharp from 'sharp';
import { createWorker, PSM } from 'tesseract.js';

import type { OCRProcessorProvider, OCRProviderRequest, OCRProviderResult } from '../types.js';

async function preprocessImage(imageData: Uint8Array): Promise<Buffer> {
  return await sharp(Buffer.from(imageData))
    .grayscale()
    .normalize()
    .sharpen()
    .png()
    .toBuffer();
}

export function createTesseractJsOCRProvider(): OCRProcessorProvider {
  return {
    async recognize(request: OCRProviderRequest): Promise<OCRProviderResult> {
      const worker = await createWorker(request.language, 1, {
        logger: () => {},
      });

      try {
        const normalized = await preprocessImage(request.imageData);
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
          preserve_interword_spaces: '1',
        });

        const result = await worker.recognize(
          normalized,
          {},
          request.includeHOCR ? { hocr: true } : undefined,
        );

        return {
          text: result.data.text.trim(),
          confidence: result.data.confidence,
          hocr: result.data.hocr,
        };
      } finally {
        await worker.terminate();
      }
    },
  };
}
