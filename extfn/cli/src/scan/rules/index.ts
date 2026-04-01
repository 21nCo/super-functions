import type { ScanRule } from '../report.js';
import { contentSocketsRule } from './contentSockets.js';
import { cspRule } from './csp.js';
import { dynamicExecutionRule } from './dynamicExecution.js';
import { externallyConnectableRule } from './externallyConnectable.js';
import { insecureTransportRule } from './insecureTransport.js';
import { manualReviewRule } from './manualReview.js';
import { permissionsRule } from './permissions.js';
import { remoteHostedCodeRule } from './remoteHostedCode.js';

export const SCAN_RULES: readonly ScanRule[] = [
  remoteHostedCodeRule,
  insecureTransportRule,
  dynamicExecutionRule,
  permissionsRule,
  externallyConnectableRule,
  cspRule,
  contentSocketsRule,
  manualReviewRule,
];
