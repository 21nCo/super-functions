import { readFileSync } from 'node:fs';
import path from 'node:path';
import { findRepoRoot } from './paths';

export interface DocsFieldMapping {
  field: string;
  section: string;
}

export interface GeneratedDocsPage {
  primitive: string;
  page: string;
  renderedPage: string;
  requiredSections: string[];
  renderedSections: string[];
  fieldMappings: DocsFieldMapping[];
  fieldCount: number;
  sampleIds: string[];
  markdownSha256: string;
  htmlSha256: string;
}

export interface GeneratedDocsResult {
  ok: boolean;
  primitiveCount: number;
  requiredSectionCount: number;
  mappedFieldCount: number;
  sampleCount: number;
  pages: GeneratedDocsPage[];
  errors: Array<{ code: string; message: string }>;
}

interface DocsCoveragePayload {
  primitiveCount: number;
  requiredSectionCount: number;
  mappedFieldCount: number;
  sampleCount: number;
  pages: GeneratedDocsPage[];
}

const LOCAL_PATH_PATTERN = /\/(?:tmp|private|home|workspace|var|opt|Volumes)\/[^\s"',)]+/;

export function generateDocs(repoRoot = findRepoRoot()): GeneratedDocsResult {
  const coveragePath = path.join(repoRoot, 'uifn/docs/generated/docs-coverage.json');
  const payload = JSON.parse(readFileSync(coveragePath, 'utf8')) as DocsCoveragePayload;
  const errors: Array<{ code: string; message: string }> = [];

  for (const page of payload.pages) {
    const missing = page.requiredSections.filter((section) => !page.renderedSections.includes(section));
    if (missing.length) errors.push({ code: 'UIFN_DOCS_COVERAGE_MISSING', message: `${page.primitive} is missing ${missing.join(', ')}` });
    if (page.fieldMappings.length !== page.fieldCount || page.fieldMappings.some((mapping) => !page.renderedSections.includes(mapping.section))) {
      errors.push({ code: 'UIFN_DOCS_FIELD_UNMAPPED', message: `${page.primitive} has an unmapped canonical field.` });
    }
    const markdown = readFileSync(path.join(repoRoot, page.page), 'utf8');
    const html = readFileSync(path.join(repoRoot, page.renderedPage), 'utf8');
    if (LOCAL_PATH_PATTERN.test(markdown) || LOCAL_PATH_PATTERN.test(html)) {
      errors.push({ code: 'UIFN_DOCS_ABSOLUTE_PATH_FORBIDDEN', message: `${page.primitive} contains a local absolute path.` });
    }
  }

  return {
    ok: errors.length === 0,
    primitiveCount: payload.primitiveCount,
    requiredSectionCount: payload.requiredSectionCount,
    mappedFieldCount: payload.mappedFieldCount,
    sampleCount: payload.sampleCount,
    pages: payload.pages,
    errors,
  };
}
