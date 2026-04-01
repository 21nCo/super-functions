import { createScanFinding, type ScanRule } from '../report.js';

const SOCKET_PATTERN = /\bnew WebSocket\s*\(|\bnew EventSource\s*\(/;

export const contentSocketsRule: ScanRule = {
  id: 'SCAN-SOCKET-001',
  evaluate(input) {
    const contentScriptFiles = readContentScriptFiles(input.manifest);
    if (contentScriptFiles.size === 0) {
      return [];
    }

    return input.files
      .filter(
        (file) =>
          contentScriptFiles.has(file.relativePath) &&
          SOCKET_PATTERN.test(file.contents)
      )
      .map((file) =>
        createScanFinding({
          ruleId: 'SCAN-SOCKET-001',
          severity: 'warning',
          category: 'performance',
          actionability: 'enforceable',
          target: input.target,
          file: file.relativePath,
          message:
            'Detected socket-style network APIs in built assets; verify content-script network behavior is necessary and store-compliant.',
        })
      );
  },
};

function readContentScriptFiles(manifest: Record<string, unknown>): Set<string> {
  const files = new Set<string>();
  const contentScriptEntries = Array.isArray(manifest.content_scripts)
    ? manifest.content_scripts
    : [];

  for (const entry of contentScriptEntries) {
    if (!isRecord(entry) || !Array.isArray(entry.js)) {
      continue;
    }

    for (const filePath of entry.js) {
      if (typeof filePath === 'string') {
        files.add(filePath);
      }
    }
  }

  return files;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
