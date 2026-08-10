import { createScanFinding, type ScanRule } from '../report.js';

// These exact XML/SVG namespace identifiers are declarative, not network
// transport. The boundary check keeps paths, queries, and other w3.org URLs
// subject to the insecure-transport rule.
const HTTP_PATTERN = /http:\/\//gi;
const NAMESPACE_URI_BOUNDARY_PATTERN = /[\s'"`),\]}>]/;
const EXPLICIT_HTTP_TRANSPORT_PATTERNS = [
  /\b(?:fetch|Request|sendBeacon|WebSocket|EventSource|importScripts)\s*\(\s*['"`]http:\/\//i,
  /\.open\s*\(\s*['"`][^'"`]*['"`]\s*,\s*['"`]http:\/\//i,
  /\b(?:src|href|action|formaction)\s*=\s*['"]?http:\/\//i,
  /\burl\s*\(\s*['"]?http:\/\//i,
] as const;
const WELL_KNOWN_NAMESPACE_URIS = [
  'http://www.w3.org/1998/Math/MathML',
  'http://www.w3.org/1999/xhtml',
  'http://www.w3.org/1999/xlink',
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/2000/xmlns/',
  'http://www.w3.org/XML/1998/namespace',
] as const;

function containsInsecureTransport(text: string): boolean {
  if (EXPLICIT_HTTP_TRANSPORT_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }

  for (const match of text.matchAll(HTTP_PATTERN)) {
    const matchIndex = match.index;
    const isNamespaceIdentifier = WELL_KNOWN_NAMESPACE_URIS.some((uri) => {
      if (!text.startsWith(uri, matchIndex)) {
        return false;
      }

      const nextCharacter = text[matchIndex + uri.length];
      return (
        nextCharacter === undefined ||
        NAMESPACE_URI_BOUNDARY_PATTERN.test(nextCharacter)
      );
    });

    if (!isNamespaceIdentifier) {
      return true;
    }
  }

  return false;
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
