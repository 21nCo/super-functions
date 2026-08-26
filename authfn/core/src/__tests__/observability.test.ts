import { describe, expect, it } from 'vitest';
import type { AuthFnEvent } from '../types.js';
import { emitAuthEvent } from '../core/observability.js';

describe('AuthFn observability sanitization', () => {
  it('preserves canonical error codes while redacting secret-like metadata', async () => {
    let emitted: AuthFnEvent | undefined;

    await emitAuthEvent({
      observability: {
        events: {
          emit: async (event: AuthFnEvent) => {
            emitted = event;
          }
        }
      }
    } as never, {
      type: 'authfn.region.lookup',
      requestId: 'req_observability',
      outcome: 'projection-failed',
      metadata: {
        errorCode: 'AUTHFN_PLACEMENT_DIRECTORY_UNAVAILABLE',
        authorizationCode: 'sensitive'
      }
    });

    expect(emitted?.metadata).toEqual({
      errorCode: 'AUTHFN_PLACEMENT_DIRECTORY_UNAVAILABLE',
      authorizationCode: '[redacted]'
    });
  });
});
