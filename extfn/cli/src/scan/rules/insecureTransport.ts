import { createScanFinding, type ScanRule } from '../report.js';

const HTTP_PATTERN = /http:\/\//i;

export const insecureTransportRule: ScanRule = {
  id: 'SCAN-HTTP-001',
  evaluate(input) {
    const manifestContents = JSON.stringify(input.manifest);
    const findings = [];

    if (HTTP_PATTERN.test(manifestContents)) {
      findings.push(
        createScanFinding({
          ruleId: 'SCAN-HTTP-001',
          severity: 'error',
          category: 'security',
          actionability: 'enforceable',
          target: input.target,
          file: 'manifest.json',
          message:
            'Detected insecure http:// transport in manifest metadata or configuration.',
        })
      );
    }

    return findings.concat(
      input.files
        .filter((file) => HTTP_PATTERN.test(file.contents))
        .map((file) =>
          createScanFinding({
            ruleId: 'SCAN-HTTP-001',
            severity: 'error',
            category: 'security',
            actionability: 'enforceable',
            target: input.target,
            file: file.relativePath,
            message:
              'Detected insecure http:// transport in built extension assets.',
          })
        )
    );
  },
};
