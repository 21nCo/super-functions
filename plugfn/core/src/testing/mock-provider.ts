import { z } from 'zod';
import type { Provider, AuthType } from '../types/provider.js';
import type { Action } from '../types/action.js';

/**
 * Mock response configuration
 */
export interface MockResponse<T = any> {
  data: T;
  delay?: number;
  error?: Error;
}

/**
 * Create a mock response
 */
export function mockResponse<T>(data: T, options?: { delay?: number }): MockResponse<T> {
  return {
    data,
    delay: options?.delay,
  };
}

/**
 * Create a mock error response
 */
export function mockError(error: Error, delay?: number): MockResponse {
  return {
    data: null,
    error,
    delay,
  };
}

/**
 * Create a mock provider for testing
 */
export function mockProvider(
  name: string,
  actions: Record<string, MockResponse>
): Provider {
  const mockActions: Record<string, Action> = {};

  for (const [actionName, response] of Object.entries(actions)) {
    mockActions[actionName] = {
      name: actionName,
      displayName: actionName,
      description: `Mock action: ${actionName}`,
      parameters: z.any(),
      returns: z.any(),
      execute: async (_params, _context) => {
        if (response.delay) {
          await new Promise((resolve) => setTimeout(resolve, response.delay));
        }

        if (response.error) {
          throw response.error;
        }

        return response.data;
      },
    };
  }

  return {
    name,
    displayName: `Mock ${name}`,
    version: '1.0.0-mock',
    description: `Mock provider for ${name}`,
    baseUrl: `https://mock-${name}.com`,
    auth: {
      type: 'api-key' as AuthType.ApiKey,
      config: {
        headerName: 'Authorization',
      },
    },
    actions: mockActions,
  };
}

/**
 * Create a mock connection for testing
 */
export function mockConnection(userId: string, provider: string) {
  return {
    id: `mock-conn-${Date.now()}`,
    userId,
    provider,
    status: 'active' as const,
    credentials: {
      encrypted: 'mock-encrypted-data',
      algorithm: 'aes-256-gcm',
    },
    connectedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Wait for a specified duration
 */
export async function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Mock HTTP client for testing
 */
export function mockHttpClient(responses: Record<string, any>) {
  return {
    get: async (url: string) => {
      const response = responses[url] || responses['*'];
      if (!response) {
        throw new Error(`No mock response for ${url}`);
      }
      return { data: response, status: 200, statusText: 'OK', headers: {} };
    },
    post: async (url: string, _data: any) => {
      const response = responses[url] || responses['*'];
      if (!response) {
        throw new Error(`No mock response for ${url}`);
      }
      return { data: response, status: 200, statusText: 'OK', headers: {} };
    },
    put: async (url: string, _data: any) => {
      const response = responses[url] || responses['*'];
      if (!response) {
        throw new Error(`No mock response for ${url}`);
      }
      return { data: response, status: 200, statusText: 'OK', headers: {} };
    },
    patch: async (url: string, _data: any) => {
      const response = responses[url] || responses['*'];
      if (!response) {
        throw new Error(`No mock response for ${url}`);
      }
      return { data: response, status: 200, statusText: 'OK', headers: {} };
    },
    delete: async (url: string) => {
      const response = responses[url] || responses['*'];
      if (!response) {
        throw new Error(`No mock response for ${url}`);
      }
      return { data: response, status: 200, statusText: 'OK', headers: {} };
    },
  };
}

