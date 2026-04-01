import { createScanFinding, type ScanRule } from '../report.js';

const REMOTE_HOSTED_CODE_PATTERN =
  /\b(?:importScripts|import)\s*\(\s*['"]https?:\/\/[^'")\s]+(?:[?#][^'")\s]*)?['"]|<script\b[^>]*\bsrc\s*=\s*['"]https?:\/\/[^'"]+(?:[?#][^'"]*)?['"][^>]*>|<link\b[^>]*\bhref\s*=\s*['"]https?:\/\/[^'"]+\.(?:css|js)(?:[?#][^'"]*)?['"][^>]*>/i;

export const remoteHostedCodeRule: ScanRule = {
  id: 'SCAN-RHC-001',
  evaluate(input) {
    return input.files
      .filter((file) => REMOTE_HOSTED_CODE_PATTERN.test(file.contents))
      .map((file) =>
        createScanFinding({
          ruleId: 'SCAN-RHC-001',
          severity: 'error',
          category: 'security',
          actionability: 'enforceable',
          target: input.target,
          file: file.relativePath,
          message:
            'Detected remote-hosted code or runtime remote module loading in the built extension output.',
        })
      );
  },
};
