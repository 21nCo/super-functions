import type {
  ExampleErrorEnvelope,
  ExampleSuccessEnvelope
} from '../server/demo-routes.js';
import { EXAMPLE_TEST_IDS, testIdSelector, type ExampleTestId } from '../client/testids.js';

export async function resetDemoScenario(
  baseUrl: string,
  scenario: string = 'baseline'
): Promise<ExampleSuccessEnvelope<{ scenario: string; seeded: boolean }>> {
  return fetchDemoJson<{ scenario: string; seeded: boolean }>(`${baseUrl}/demo/reset`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      scenario
    })
  }) as Promise<ExampleSuccessEnvelope<{ scenario: string; seeded: boolean }>>;
}

export async function getDemoEvents(
  baseUrl: string
): Promise<ExampleSuccessEnvelope<{ events: unknown[] }>> {
  return fetchDemoJson<{ events: unknown[] }>(`${baseUrl}/demo/events`);
}

export async function getLatestDemoOtp(
  baseUrl: string,
  input: {
    purpose: 'verify-email' | 'sign-in' | 'reset-password';
    email: string;
  }
): Promise<ExampleSuccessEnvelope<{ message: unknown }>> {
  const url = new URL('/demo/otp/latest', baseUrl);
  url.searchParams.set('purpose', input.purpose);
  url.searchParams.set('email', input.email);
  return fetchDemoJson<{ message: unknown }>(url.toString());
}

export function documentedTestIds(): Record<string, ExampleTestId> {
  return EXAMPLE_TEST_IDS;
}

export function selectorFor(testId: ExampleTestId): string {
  return testIdSelector(testId);
}

export function assertOkEnvelope<T>(value: unknown): asserts value is ExampleSuccessEnvelope<T> {
  if (
    !value
    || typeof value !== 'object'
    || !('ok' in value)
    || value.ok !== true
    || !('requestId' in value)
  ) {
    throw new Error('Expected an authfn example success envelope');
  }
}

async function fetchDemoJson<TData>(
  input: string,
  init?: RequestInit
): Promise<ExampleSuccessEnvelope<TData>> {
  const response = await fetch(input, init);
  const payload = await response.json() as ExampleSuccessEnvelope<TData> | ExampleErrorEnvelope;
  if (!('ok' in payload) || payload.ok !== true) {
    throw new Error(
      'error' in payload ? payload.error.message : 'Expected an authfn example success envelope'
    );
  }
  return payload;
}
