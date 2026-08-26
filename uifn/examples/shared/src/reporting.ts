import type {
  UifnBrowserQaCheck,
  UifnBrowserQaFailure,
  UifnBrowserQaResult,
} from './qa-contract.js';
import { workbenchFrameworks } from './qa-contract.js';
import { workbenchComponents } from './component-inventory.js';
import { workbenchPatterns } from './pattern-inventory.js';
import { workbenchSfPanels } from './sf-inventory.js';
import { workbenchRoutes } from './routes.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeString(value: string): string {
  return value
    .replace(/\/(?:Users|home|private|tmp|var|Volumes)\/[^\s"',)]+/g, '[REDACTED_LOCAL_PATH]')
    .replace(/[A-Z]:\\[^\s"',)]+/gi, '[REDACTED_LOCAL_PATH]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_PII]')
    .replace(/\b(?:sk_live|sk_test|ghp_|xox[baprs]-|AKIA)[A-Za-z0-9_-]+\b/g, '[REDACTED]');
}

export function sanitizeEvidenceValue(input: unknown, key = ''): unknown {
  if (/(token|secret|password|apiKey|uploadUrl|authorization|cookie)/i.test(key)) return '[REDACTED]';
  if (typeof input === 'string') return sanitizeString(input);
  if (Array.isArray(input)) return input.map((value) => sanitizeEvidenceValue(value));
  if (!isRecord(input)) return input;
  return Object.fromEntries(
    Object.entries(input).map(([entryKey, value]) => [entryKey, sanitizeEvidenceValue(value, entryKey)])
  );
}

export function validateBrowserQaResult(input: unknown): string[] {
  const failures: string[] = [];
  if (!isRecord(input)) return ['result must be an object'];
  if (typeof input.ok !== 'boolean') failures.push('ok must be boolean');
  if (typeof input.command !== 'string' || !input.command) failures.push('command is required');
  if (input.schemaVersion !== 1) failures.push('schemaVersion must be 1');
  for (const field of ['frameworkCount', 'componentCount', 'patternCount', 'sfPanelCount', 'routeCount']) {
    if (!Number.isInteger(input[field]) || Number(input[field]) < 0) failures.push(`${field} must be a non-negative integer`);
  }
  if (!Array.isArray(input.checks)) failures.push('checks array is required');
  if (!Array.isArray(input.failures)) failures.push('failures array is required');

  for (const [index, check] of (Array.isArray(input.checks) ? input.checks : []).entries()) {
    if (!isRecord(check)) {
      failures.push(`checks[${index}] must be an object`);
      continue;
    }
    if (typeof check.id !== 'string' || !check.id) failures.push(`checks[${index}].id is required`);
    if (!['component', 'pattern', 'sf', 'scenario'].includes(String(check.family))) failures.push(`checks[${index}].family is invalid`);
    if (typeof check.slug !== 'string' || !check.slug) failures.push(`checks[${index}].slug is required`);
    if (!workbenchFrameworks.includes(check.framework as never)) failures.push(`checks[${index}].framework is invalid`);
    if (typeof check.route !== 'string' || !check.route.startsWith('/')) failures.push(`checks[${index}].route is invalid`);
    if (!['passed', 'failed'].includes(String(check.status))) failures.push(`checks[${index}].status is invalid`);
    if (!isRecord(check.evidence)) failures.push(`checks[${index}].evidence must be an object`);
  }

  for (const [index, failure] of (Array.isArray(input.failures) ? input.failures : []).entries()) {
    if (!isRecord(failure)) {
      failures.push(`failures[${index}] must be an object`);
      continue;
    }
    if (typeof failure.code !== 'string' || !failure.code) failures.push(`failures[${index}].code is required`);
    if (typeof failure.message !== 'string' || !failure.message) failures.push(`failures[${index}].message is required`);
    if (typeof failure.qaCaseId !== 'string' || !failure.qaCaseId) failures.push(`failures[${index}].qaCaseId is required`);
    if (typeof failure.assertionType !== 'string' || !failure.assertionType) failures.push(`failures[${index}].assertionType is required`);
    if (failure.evidence !== undefined && !isRecord(failure.evidence)) failures.push(`failures[${index}].evidence must be an object`);
  }

  return failures;
}

export function createBrowserQaResult(
  command: string,
  checks: UifnBrowserQaCheck[],
  failures: UifnBrowserQaFailure[] = []
): UifnBrowserQaResult {
  return {
    ok: failures.length === 0 && checks.every((check) => check.status === 'passed'),
    command,
    schemaVersion: 1,
    frameworkCount: workbenchFrameworks.length,
    componentCount: workbenchComponents.length,
    patternCount: workbenchPatterns.length,
    sfPanelCount: workbenchSfPanels.length,
    routeCount: workbenchRoutes.length,
    checks,
    failures,
  };
}

export function sanitizeEvidence(input: Record<string, unknown>): Record<string, unknown> {
  return sanitizeEvidenceValue(input) as Record<string, unknown>;
}
