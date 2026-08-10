import { createScanFinding, type ScanRule } from '../report.js';

const SOCKET_PATTERN = /\bnew WebSocket\s*\(|\bnew EventSource\s*\(/;

export const contentSocketsRule: ScanRule = {
  id: 'SCAN-SOCKET-001',
  evaluate(input) {
    const contentScriptFiles = readContentScriptFiles(input.manifest);
    if (contentScriptFiles.size === 0) {
      return [];
    }

    const outputDirPrefix = readOutputDirPrefix(input.outputDir);

    return input.files
      .filter((file) => {
        // Manifest content-script paths are relative to the target output dir
        // (e.g. `content/feed.js`), while scan file paths are relative to the
        // dist root and may carry an output-directory prefix. Compare on the
        // output-relative form so the rule matches in real scans.
        const targetRelative = file.relativePath.startsWith(outputDirPrefix)
          ? file.relativePath.slice(outputDirPrefix.length)
          : file.relativePath;
        return (
          contentScriptFiles.has(targetRelative) &&
          SOCKET_PATTERN.test(file.contents)
        );
      })
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

function readOutputDirPrefix(outputDir: string): string {
  const segments = outputDir.replace(/\\/g, '/').split('/').filter(Boolean);
  const directoryName = segments[segments.length - 1];
  return directoryName ? `${directoryName}/` : '';
}

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
