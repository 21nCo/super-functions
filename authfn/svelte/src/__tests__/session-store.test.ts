import { get } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import { createAuthFnSessionStore } from '../session-store.js';

describe('@authfn/svelte session store', () => {
  it('wraps client.getSession without reimplementing auth logic', async () => {
    const calls: string[] = [];
    const store = createAuthFnSessionStore({
      async getSession() {
        calls.push('getSession');
        return {
          ok: true,
          data: {
            session: {
              id: 'sess_01',
              type: 'session',
              subject: {
                actorId: 'user_01',
                actorType: 'user',
                email: 'ada@example.com'
              },
              actorType: 'user',
              actorId: 'user_01',
              resourceIds: [],
              methods: ['password'],
              primaryEmail: 'ada@example.com'
            }
          },
          requestId: 'req_01'
        };
      }
    } as any);

    await store.refresh();

    expect(get(store)).toMatchObject({
      id: 'sess_01',
      primaryEmail: 'ada@example.com',
      methods: ['password']
    });
    expect(calls).toEqual(['getSession', 'getSession']);
  });

  it('clears the store and treats client errors as empty session state', async () => {
    const responses = [
      Promise.resolve({
        ok: false,
        error: {
          code: 'AUTHFN_UNAUTHENTICATED',
          message: 'Authentication required',
          retryable: false
        },
        requestId: 'req_02'
      }),
      Promise.resolve({
        ok: false,
        error: {
          code: 'AUTHFN_UNAUTHENTICATED',
          message: 'Authentication required',
          retryable: false
        },
        requestId: 'req_02'
      })
    ];

    const store = createAuthFnSessionStore({
      async getSession() {
        return responses.shift()!;
      }
    } as any);

    await store.refresh();
    expect(get(store)).toBeNull();

    store.clear();
    expect(get(store)).toBeNull();
  });

  it('does not let an older refresh overwrite a newer session state', async () => {
    let resolveFirst: ((value: any) => void) | undefined;
    const store = createAuthFnSessionStore({
      async getSession() {
        if (!resolveFirst) {
          return await new Promise((resolve) => {
            resolveFirst = resolve;
          }) as never;
        }

        return {
          ok: true,
          data: {
            session: {
              id: 'sess_newer',
              type: 'session',
              actorType: 'user',
              actorId: 'user_1',
              resourceIds: [],
              methods: ['password']
            }
          },
          requestId: 'req_newer'
        };
      }
    } as any);

    const firstRefresh = store.refresh();
    const secondRefresh = store.refresh();
    await secondRefresh;

    resolveFirst?.({
      ok: true,
      data: {
        session: {
          id: 'sess_older',
          type: 'session',
          actorType: 'user',
          actorId: 'user_1',
          resourceIds: [],
          methods: ['password']
        }
      },
      requestId: 'req_older'
    });
    await firstRefresh;

    expect(get(store)?.id).toBe('sess_newer');
  });

  it('returns the current store state when an older refresh resolves late', async () => {
    let callCount = 0;
    let resolveStale: ((value: any) => void) | undefined;
    const store = createAuthFnSessionStore({
      async getSession() {
        callCount += 1;
        if (callCount === 1) {
          return {
            ok: true,
            data: {
              session: null
            },
            requestId: 'req_initial'
          };
        }

        if (callCount === 2) {
          return await new Promise((resolve) => {
            resolveStale = resolve;
          }) as never;
        }

        return {
          ok: true,
          data: {
            session: {
              id: 'sess_current',
              type: 'session',
              actorType: 'user',
              actorId: 'user_1',
              resourceIds: [],
              methods: ['password']
            }
          },
          requestId: 'req_current'
        };
      }
    } as any);

    const firstRefresh = store.refresh();
    const secondResult = await store.refresh();

    resolveStale?.({
      ok: true,
      data: {
        session: {
          id: 'sess_stale',
          type: 'session',
          actorType: 'user',
          actorId: 'user_1',
          resourceIds: [],
          methods: ['password']
        }
      },
      requestId: 'req_stale'
    });

    const firstResult = await firstRefresh;

    expect(secondResult?.id).toBe('sess_current');
    expect(firstResult?.id).toBe('sess_current');
    expect(get(store)?.id).toBe('sess_current');
  });
});
