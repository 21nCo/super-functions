#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const outputRoot = path.resolve(process.cwd(), 'uifn/.conduct/generated/phase-06');
const mode = process.argv.includes('--write') ? 'write' : process.argv.includes('--check') ? 'check' : null;
if (!mode) { console.error('Usage: node scripts/generate-uifn-phase-06.mjs (--write|--check)'); process.exit(2); }

const algorithms = ['AsyncList', 'ListCollection', 'TreeCollection', 'ListSelection', 'LocaleMatcher', 'CollectionNavigation', 'Range', 'Typeahead', 'VirtualizerContract'];
const primitives = [
  { name: 'Accordion', kind: 'interactive-controller', symbols: ['AccordionController', 'createAccordionController'] },
  { name: 'Avatar', kind: 'typed-static-contract', symbols: ['AvatarContract'] },
  { name: 'Button', kind: 'typed-static-contract', symbols: ['ButtonContract'] },
  { name: 'Collapsible', kind: 'interactive-controller', symbols: ['CollapsibleController', 'createCollapsibleController'] },
  { name: 'Field', kind: 'typed-static-contract', symbols: ['FieldContract'] },
  { name: 'Fieldset', kind: 'typed-static-contract', symbols: ['FieldsetContract'] },
  { name: 'Form', kind: 'typed-static-contract', symbols: ['FormContract'] },
  { name: 'ImageCropper', kind: 'interactive-controller', symbols: ['ImageCropperController', 'createImageCropperController'] },
  { name: 'Input', kind: 'typed-static-contract', symbols: ['InputContract'] },
  { name: 'Marquee', kind: 'typed-static-contract', symbols: ['MarqueeContract'] },
  { name: 'QRCode', kind: 'typed-static-contract', symbols: ['QRCodeContract'] },
  { name: 'ScrollArea', kind: 'interactive-controller', symbols: ['ScrollAreaController', 'createScrollAreaController'] },
  { name: 'Separator', kind: 'typed-static-contract', symbols: ['SeparatorContract'] },
  { name: 'Toolbar', kind: 'interactive-controller', symbols: ['ToolbarController', 'createToolbarController'] },
];
const header = { schemaVersion: 1, generatedBy: 'generate-uifn-phase-06.mjs', phase: 'PHASE_06', implementationEvidence: true };
const outputs = {
  'phase-06-exports.json': `${JSON.stringify({ ...header, algorithms, primitives }, null, 2)}\n`,
  'phase-06-test-manifest.json': `${JSON.stringify({ ...header, requirements: ['CAT-002', 'PRIM-001'], vectors: ['TV-CAT-002-P', 'TV-CAT-002-N', 'TV-PRIM-001-P', 'TV-PRIM-001-N'], generatedSequenceSeeds: { first: 1, last: 64 }, frameworks: ['react', 'svelte', 'solid'], modes: ['package', 'source'], suites: ['uifn/core/src/__tests__/phase-06-algorithms.test.ts', 'uifn/core/src/__tests__/phase-06-primitives.test.ts', 'scripts/verify-uifn-phase-06-contract.test.mjs', 'scripts/verify-uifn-foundation-pack.mjs'] }, null, 2)}\n`,
};

try {
  if (mode === 'write') {
    await mkdir(outputRoot, { recursive: true });
    await Promise.all(Object.entries(outputs).map(([name, contents]) => writeFile(path.join(outputRoot, name), contents, 'utf8')));
  } else {
    for (const [name, expected] of Object.entries(outputs)) {
      const actual = await readFile(path.join(outputRoot, name), 'utf8');
      const matches = name.endsWith('.json')
        ? JSON.stringify(JSON.parse(actual)) === JSON.stringify(JSON.parse(expected))
        : actual === expected;
      if (!matches) throw new Error(`UIFN_PHASE_06_GENERATED_DRIFT: ${name}`);
    }
  }
  console.log(JSON.stringify({ ok: true, command: `generate:uifn-phase-06:${mode}`, outputCount: Object.keys(outputs).length, primitiveCount: primitives.length, algorithmCount: algorithms.length }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, command: `generate:uifn-phase-06:${mode}`, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
}
