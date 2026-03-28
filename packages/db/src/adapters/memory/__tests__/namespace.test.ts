/**
 * Memory adapter — row-level namespace contract tests.
 *
 * Verifies the memory adapter passes all namespace isolation contract tests
 * when wrapped with `wrapWithRowLevelNamespace`.
 */

import { describe } from 'vitest';
import { memoryAdapter } from '../index.js';
import { runRowLevelNamespaceContractTests } from '../../../testing/namespace-contract-tests.js';

describe('Memory Adapter — Row-Level Namespace Isolation', () => {
  runRowLevelNamespaceContractTests(() => memoryAdapter({ debug: false }));
});
