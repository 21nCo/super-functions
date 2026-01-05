/**
 * Testing utilities
 */

// Re-export memory adapter for testing
export { memoryAdapter } from '../adapters/memory/index.js';
export type { MemoryAdapterConfig } from '../adapters/memory/index.js';

// Contract test utilities
export { testAdapterContract, describeAdapterContract } from './contract-tests.js';
export type { AdapterTestConfig } from './contract-tests.js';

// Mock adapter
export { MockAdapter, createMockAdapter } from './mocks.js';
export type { MockCall } from './mocks.js';
