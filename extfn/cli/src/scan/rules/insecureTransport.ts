import { createScanFinding, type ScanRule } from '../report.js';

// Well-known XML/SVG namespace URIs are declarative identifiers, never network
// transport. They appear in virtually every bundle that inlines an SVG icon, so
// they must not be treated as insecure http:// usage.
const NAMESPACE_URI_PATTERN =
  /https?:\/\/(?:[a-z0-9-]+\.)*w3\.org\/[^\s'"`)]*/gi;

const HTTP_PATTERN = /http:\/\//i;

function containsInsecureTransport(text: string): boolean {
  return HTTP_PATTERN.test(text.replace(NAMESPACE_URI_PATTERN, ''));
}

export const insecureTransportRule: ScanRule = {
  id: 'SCAN-HTTP-001',
  evaluate(input) {
    const manifestContents = JSON.stringify(input.manifest);
    const findings = [];

    if (containsInsecureTransport(manifestContents)) {
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
        .filter((file) => containsInsecureTransport(file.contents))
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
