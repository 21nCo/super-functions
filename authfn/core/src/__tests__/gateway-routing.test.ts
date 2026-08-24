import { describe, expect, it } from 'vitest';
import { createRouter, type Router } from '@superfunctions/http';
import type { ConditionalKVStoreAdapter } from '@superfunctions/db';
import {
  authFnVerifiedRoutingIdentityKey,
  classifyAuthFnRoute,
  createAuthFnCanonicalGateway,
  createAuthFnCellPlacementMiddleware,
  createInMemoryAuthFnPlacementDirectory,
  createInMemoryAuthFnRoutingReplayStore,
  createStoreBackedAuthFnPlacementDirectory,
  moveAuthFnIdentityPlacement
} from '../core/gateway-routing.js';
import type {
  AuthFnIdentityPlacement,
  AuthFnRoutingReplayStore,
  AuthFnRoutingKeyring,
  MultiRegionPluginRuntimeConfig
} from '../plugin-types.js';
import { authFnMultiRegionEnvironment } from '../core/regions.js';

const keyring: AuthFnRoutingKeyring = {
  active: {
    keyId: 'routing-2026-08',
    secret: 'test-routing-secret-with-enough-entropy'
  }
};

describe('AuthFn canonical gateway routing', () => {
  it('claims placement only for explicitly approved first-use routes', async () => {
    const directory = createInMemoryAuthFnPlacementDirectory();
    const effects: string[] = [];
    const events: Array<{ type: string; outcome?: string; metadata?: Record<string, unknown> }> = [];
    const cell = createCell('us-east-1', directory, effects);
    let allowInitialPlacement = false;
    let dispatches = 0;
    const gateway = createAuthFnCanonicalGateway<Router>({
      publicAuthority: 'https://account.example.com',
      placementDirectory: directory,
      keyring,
      placementCacheTtlMs: 60_000,
      resolveIdentity: () => ({ identityKey: 'person:new', allowInitialPlacement }),
      selectInitialRegion: () => 'us-east-1',
      resolveCell: () => ({ regionId: 'us-east-1', audience: 'cell:us-east-1', target: cell }),
      async dispatch(target, request) {
        dispatches += 1;
        return target.handle(request);
      },
      onEvent: (event) => { events.push(event); }
    });

    const rejected = await gateway.handle(identityRequest());
    expect(rejected.status).toBe(404);
    expect(dispatches).toBe(0);

    allowInitialPlacement = true;
    const claimed = await gateway.handle(identityRequest());
    expect(claimed.status).toBe(200);
    expect(dispatches).toBe(1);
    await expect(directory.get('person:new')).resolves.toMatchObject({
      regionId: 'us-east-1',
      epoch: 1,
      state: 'active'
    });
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'authfn.routing.placement_claimed', outcome: 'success' }),
      expect.objectContaining({ type: 'authfn.routing.forwarded', outcome: 'success' })
    ]));
    expect(events.every((event) => event.metadata?.outcome === undefined)).toBe(true);
  });

  it('reports dispatch failures as indeterminate because execution may have started', async () => {
    const directory = createInMemoryAuthFnPlacementDirectory([
      placement('person:ada', 'us-east-1', 1)
    ]);
    const events: Array<{ type: string; outcome?: string }> = [];
    const gateway = createAuthFnCanonicalGateway<unknown>({
      publicAuthority: 'https://account.example.com',
      placementDirectory: directory,
      keyring,
      resolveIdentity: () => ({ identityKey: 'person:ada' }),
      selectInitialRegion: () => 'us-east-1',
      resolveCell: () => ({ regionId: 'us-east-1', audience: 'cell:us-east-1', target: {} }),
      dispatch: async () => { throw new Error('transport failed after write'); },
      onEvent: (event) => { events.push(event); }
    });

    const response = await gateway.handle(identityRequest());

    expect(response.status).toBe(503);
    expect(events).toContainEqual(expect.objectContaining({
      type: 'authfn.routing.cell_unavailable',
      outcome: 'unknown'
    }));
  });

  it('retains replay claims through the accepted clock-skew window', async () => {
    const fixedNow = Math.floor(Date.now() / 1000) * 1000;
    const directory = createInMemoryAuthFnPlacementDirectory([
      placement('person:ada', 'us-east-1', 1)
    ]);
    const replayExpiries: number[] = [];
    const effects: string[] = [];
    const claimedNonces = new Set<string>();
    let forwardedRequest: Request | undefined;
    const cell = createCell('us-east-1', directory, effects, {
      async claim(nonce, expiresAt) {
        if (claimedNonces.has(nonce)) return false;
        claimedNonces.add(nonce);
        replayExpiries.push(expiresAt);
        return true;
      }
    });
    const gateway = createAuthFnCanonicalGateway<Router>({
      publicAuthority: 'https://account.example.com',
      placementDirectory: directory,
      keyring,
      now: () => new Date(fixedNow),
      resolveIdentity: () => ({ identityKey: 'person:ada' }),
      selectInitialRegion: () => 'us-east-1',
      resolveCell: () => ({ regionId: 'us-east-1', audience: 'cell:us-east-1', target: cell }),
      dispatch: (target, request) => {
        forwardedRequest = request.clone();
        return target.handle(request);
      }
    });

    expect((await gateway.handle(identityRequest())).status).toBe(200);
    expect(replayExpiries).toEqual([Math.floor(fixedNow / 1000) + 25]);
    expect(forwardedRequest).toBeDefined();
    expect((await cell.handle(forwardedRequest!)).status).toBe(401);
    expect(effects).toEqual(['us-east-1']);
  });

  it('makes the verified routing identity available only after cell validation', async () => {
    const directory = createInMemoryAuthFnPlacementDirectory([
      placement('person:session-handle', 'us-east-1', 1)
    ]);
    const middleware = createAuthFnCellPlacementMiddleware(
      { basePath: '/auth' },
      cellPluginConfig('us-east-1', directory, createInMemoryAuthFnRoutingReplayStore())
    );
    if (!middleware) throw new Error('cell middleware missing');
    const observed: Array<string | null> = [];
    const cell = createRouter({
      basePath: '/auth',
      middleware: [middleware],
      routes: [{
        method: 'POST',
        path: '/sign-in/password',
        handler: (request) => {
          observed.push(authFnVerifiedRoutingIdentityKey(request));
          return Response.json({ ok: true });
        }
      }]
    });
    let routedRequest: Request | undefined;
    const gateway = createAuthFnCanonicalGateway<Router>({
      publicAuthority: 'https://account.example.com',
      placementDirectory: directory,
      keyring,
      resolveIdentity: () => ({ identityKey: 'person:session-handle' }),
      selectInitialRegion: () => 'us-east-1',
      resolveCell: () => ({ regionId: 'us-east-1', audience: 'cell:us-east-1', target: cell }),
      dispatch: (target, request) => {
        routedRequest = request;
        return target.handle(request);
      }
    });

    expect(authFnVerifiedRoutingIdentityKey(identityRequest())).toBeNull();
    expect((await gateway.handle(identityRequest())).status).toBe(200);
    expect(observed).toEqual(['person:session-handle']);
    expect(authFnVerifiedRoutingIdentityKey(routedRequest)).toBeNull();
  });

  it('routes by canonical placement, strips spoofed headers, and retries once before execution', async () => {
    const directory = createInMemoryAuthFnPlacementDirectory([placement('person:ada', 'us-east-1', 1)]);
    const effects: string[] = [];
    const calls: string[] = [];
    const cells = new Map<string, Router>([
      ['us-east-1', createCell('us-east-1', directory, effects)],
      ['eu-west-1', createCell('eu-west-1', directory, effects)]
    ]);
    const gateway = createAuthFnCanonicalGateway<Router>({
      publicAuthority: 'https://account.example.com',
      placementDirectory: directory,
      keyring,
      placementCacheTtlMs: 60_000,
      resolveIdentity: async (request) => {
        expect(request.headers.get('x-authfn-routing-attacker')).toBeNull();
        const body = await request.json() as { identityKey: string };
        return { identityKey: body.identityKey };
      },
      selectInitialRegion: () => 'us-east-1',
      resolveCell: (regionId) => {
        const target = cells.get(regionId);
        return target ? { regionId, audience: `cell:${regionId}`, target } : null;
      },
      async dispatch(target, request) {
        const regionId = [...cells].find(([, router]) => router === target)?.[0] ?? 'unknown';
        calls.push(regionId);
        expect(request.headers.get('x-authfn-routing-attacker')).toBeNull();
        return target.handle(request);
      }
    });

    const first = await gateway.handle(identityRequest({
      'x-authfn-routing-assertion': 'spoofed',
      'x-authfn-routing-attacker': 'spoofed'
    }));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ executedIn: 'us-east-1' });

    const moved = await directory.compareAndSet({
      identityKey: 'person:ada',
      expectedEpoch: 1,
      expectedState: 'active',
      placement: placement('person:ada', 'eu-west-1', 2)
    });
    expect(moved.updated).toBe(true);

    const second = await gateway.handle(identityRequest());
    expect(second.status).toBe(200);
    expect(second.headers.get('x-authfn-routing-mismatch')).toBeNull();
    expect(await second.json()).toEqual({ executedIn: 'eu-west-1' });
    expect(calls).toEqual(['us-east-1', 'us-east-1', 'eu-west-1']);
    expect(effects).toEqual(['us-east-1', 'eu-west-1']);
  });

  it('never retries a second mismatch and never starts the stale cell handler', async () => {
    const directory = createInMemoryAuthFnPlacementDirectory([placement('person:ada', 'us-east-1', 1)]);
    const effects: string[] = [];
    const us = createCell('us-east-1', directory, effects);
    const eu = createCell('eu-west-1', directory, effects);
    let dispatches = 0;
    const gateway = createAuthFnCanonicalGateway<Router>({
      publicAuthority: 'https://account.example.com',
      placementDirectory: directory,
      keyring,
      resolveIdentity: () => ({ identityKey: 'person:ada' }),
      selectInitialRegion: () => 'us-east-1',
      resolveCell: (regionId) => ({
        regionId,
        audience: `cell:${regionId}`,
        target: regionId === 'us-east-1' ? us : eu
      }),
      async dispatch(target, request) {
        dispatches += 1;
        if (dispatches === 1) {
          await directory.compareAndSet({
            identityKey: 'person:ada',
            expectedEpoch: 1,
            expectedState: 'active',
            placement: placement('person:ada', 'eu-west-1', 2)
          });
        } else {
          await directory.compareAndSet({
            identityKey: 'person:ada',
            expectedEpoch: 2,
            expectedState: 'active',
            placement: placement('person:ada', 'us-east-1', 3)
          });
        }
        return target.handle(request);
      }
    });

    const response = await gateway.handle(identityRequest());
    expect(response.status).toBe(409);
    expect(dispatches).toBe(2);
    expect(effects).toEqual([]);
  });

  it('does not retry an unsigned mismatch response', async () => {
    const directory = createInMemoryAuthFnPlacementDirectory([placement('person:ada', 'us-east-1', 1)]);
    let dispatches = 0;
    const gateway = createAuthFnCanonicalGateway<string>({
      publicAuthority: 'https://account.example.com',
      placementDirectory: directory,
      keyring,
      resolveIdentity: () => ({ identityKey: 'person:ada' }),
      selectInitialRegion: () => 'us-east-1',
      resolveCell: () => ({ regionId: 'us-east-1', audience: 'cell:us-east-1', target: 'private-cell' }),
      async dispatch() {
        dispatches += 1;
        return Response.json({ upstream: 'mismatch' }, {
          status: 409,
          headers: { 'x-authfn-routing-mismatch': 'not-signed' }
        });
      }
    });
    const response = await gateway.handle(identityRequest());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ upstream: 'mismatch' });
    expect(response.headers.get('x-authfn-routing-mismatch')).toBeNull();
    expect(dispatches).toBe(1);
  });

  it('binds the forwarded request ID to the signed routing assertion', async () => {
    const directory = createInMemoryAuthFnPlacementDirectory([placement('person:ada', 'us-east-1', 1)]);
    const effects: string[] = [];
    const cell = createCell('us-east-1', directory, effects);
    const gateway = createAuthFnCanonicalGateway<Router>({
      publicAuthority: 'https://account.example.com',
      placementDirectory: directory,
      keyring,
      resolveIdentity: () => ({ identityKey: 'person:ada' }),
      selectInitialRegion: () => 'us-east-1',
      resolveCell: () => ({ regionId: 'us-east-1', audience: 'cell:us-east-1', target: cell }),
      async dispatch(target, request) {
        const headers = new Headers(request.headers);
        headers.set('x-request-id', 'req_tampered');
        return target.handle(new Request(request.clone(), { headers }));
      }
    });

    const response = await gateway.handle(identityRequest({ 'x-request-id': 'req_original' }));
    expect(response.status).toBe(401);
    expect(effects).toEqual([]);
  });

  it('binds the forwarded query string to the signed routing assertion', async () => {
    const directory = createInMemoryAuthFnPlacementDirectory([placement('person:ada', 'us-east-1', 1)]);
    const effects: string[] = [];
    const cell = createCell('us-east-1', directory, effects);
    const gateway = createAuthFnCanonicalGateway<Router>({
      publicAuthority: 'https://account.example.com',
      placementDirectory: directory,
      keyring,
      resolveIdentity: () => ({ identityKey: 'person:ada' }),
      selectInitialRegion: () => 'us-east-1',
      resolveCell: () => ({ regionId: 'us-east-1', audience: 'cell:us-east-1', target: cell }),
      async dispatch(target, request) {
        const body = await request.clone().arrayBuffer();
        return target.handle(new Request(
          'https://account.example.com/auth/sign-in/password?returnTo=%2Fattacker',
          { method: request.method, headers: request.headers, body }
        ));
      }
    });
    const request = new Request(
      'https://account.example.com/auth/sign-in/password?returnTo=%2Faccount',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identityKey: 'person:ada' })
      }
    );

    const response = await gateway.handle(request);
    expect(response.status).toBe(401);
    expect(effects).toEqual([]);
  });

  it('rejects moving placements, direct cell access, and assertion replay', async () => {
    const directory = createInMemoryAuthFnPlacementDirectory([{
      ...placement('person:ada', 'us-east-1', 2),
      state: 'moving',
      movingToRegionId: 'eu-west-1'
    }]);
    const effects: string[] = [];
    const cell = createCell('us-east-1', directory, effects);
    let captured: Request | null = null;
    const gateway = createAuthFnCanonicalGateway<Router>({
      publicAuthority: 'https://account.example.com',
      placementDirectory: directory,
      keyring,
      resolveIdentity: () => ({ identityKey: 'person:ada' }),
      selectInitialRegion: () => 'us-east-1',
      resolveCell: () => ({ regionId: 'us-east-1', audience: 'cell:us-east-1', target: cell }),
      async dispatch(target, request) {
        captured = request.clone();
        return target.handle(request);
      }
    });

    const moving = await gateway.handle(identityRequest());
    expect(moving.status).toBe(503);
    expect(captured).toBeNull();
    expect(effects).toEqual([]);

    await directory.compareAndSet({
      identityKey: 'person:ada',
      expectedEpoch: 2,
      expectedState: 'moving',
      placement: {
        ...placement('person:ada', 'us-east-1', 3),
        state: 'deleting'
      }
    });
    gateway.invalidate('person:ada');
    const deleting = await gateway.handle(identityRequest());
    expect(deleting.status).toBe(503);
    expect(captured).toBeNull();

    await directory.compareAndSet({
      identityKey: 'person:ada',
      expectedEpoch: 3,
      expectedState: 'deleting',
      placement: placement('person:ada', 'us-east-1', 4)
    });
    gateway.invalidate('person:ada');
    const routed = await gateway.handle(identityRequest());
    expect(routed.status).toBe(200);
    expect(captured).not.toBeNull();
    const replay = await cell.handle((captured as unknown as Request).clone());
    expect(replay.status).toBe(401);

    const direct = await cell.handle(identityRequest());
    expect(direct.status).toBe(401);
    expect(effects).toEqual(['us-east-1']);
  });

  it('terminates discovery and public lookup globally without consulting placement', async () => {
    let directoryReads = 0;
    const directory = createInMemoryAuthFnPlacementDirectory();
    const gateway = createAuthFnCanonicalGateway<never>({
      publicAuthority: 'https://account.example.com',
      placementDirectory: {
        ...directory,
        async get(identityKey) {
          directoryReads += 1;
          return directory.get(identityKey);
        }
      },
      keyring,
      resolveIdentity: () => null,
      selectInitialRegion: () => 'unused',
      resolveCell: () => null,
      dispatch: async () => new Response(null, { status: 500 }),
      handleGlobal: (_request, classification) => Response.json({
        issuer: 'https://account.example.com',
        family: classification.family
      })
    });

    const environment = await gateway.handle(new Request('https://account.example.com/auth/environment'));
    const lookup = await gateway.handle(new Request('https://account.example.com/auth/regions/lookup', {
      method: 'POST',
      body: '{}'
    }));
    expect(await environment.json()).toEqual({ issuer: 'https://account.example.com', family: 'discovery' });
    expect(await lookup.json()).toEqual({ issuer: 'https://account.example.com', family: 'region-lookup' });
    expect(directoryReads).toBe(0);
  });
});

describe('AuthFn placement adapters and migration', () => {
  it('provides atomic placement semantics over conditional KV stores', async () => {
    const values = new Map<string, string>();
    const store: ConditionalKVStoreAdapter = {
      async get(key) { return values.get(key) ?? null; },
      async set(input) { values.set(input.key, input.value); },
      async setIfAbsent(input) {
        const existing = values.get(input.key);
        if (existing) return { inserted: false, existing };
        values.set(input.key, input.value);
        return { inserted: true };
      },
      async compareAndSet(input) {
        const existing = values.get(input.key) ?? null;
        if (existing !== input.expected) return { updated: false, existing: existing ?? undefined };
        values.set(input.key, input.value);
        return { updated: true };
      },
      async delete(key) { values.delete(key); }
    };
    const directory = createStoreBackedAuthFnPlacementDirectory(store);
    expect((await directory.putIfAbsent(placement('person:ada', 'us-east-1', 1))).inserted).toBe(true);
    expect((await directory.putIfAbsent(placement('person:ada', 'eu-west-1', 1))).inserted).toBe(false);
    expect((await directory.compareAndSet({
      identityKey: 'person:ada',
      expectedEpoch: 1,
      expectedState: 'active',
      placement: placement('person:ada', 'eu-west-1', 2)
    })).updated).toBe(true);
    expect(await directory.get('person:ada')).toMatchObject({ regionId: 'eu-west-1', epoch: 2 });
  });

  it('fences, copies, validates, warms, and activates an identity move', async () => {
    const directory = createInMemoryAuthFnPlacementDirectory([placement('person:ada', 'us-east-1', 4)]);
    const calls: string[] = [];
    const moved = await moveAuthFnIdentityPlacement(directory, {
      identityKey: 'person:ada',
      sourceRegionId: 'us-east-1',
      targetRegionId: 'eu-west-1',
      callbacks: {
        async quiesceSource() { calls.push('quiesce'); },
        async drainSource() { calls.push('drain'); },
        async copyToTarget() { calls.push('copy'); },
        async validateTarget() { calls.push('validate'); },
        async warmTarget() { calls.push('warm'); },
        async resumeTarget() { calls.push('resume-target'); }
      }
    });
    expect(moved).toMatchObject({ regionId: 'eu-west-1', epoch: 6, state: 'active' });
    expect(calls).toEqual(['quiesce', 'drain', 'copy', 'validate', 'warm', 'resume-target']);
  });

  it('rolls a failed pre-activation move back to the source at a newer epoch', async () => {
    const directory = createInMemoryAuthFnPlacementDirectory([placement('person:ada', 'us-east-1', 4)]);
    const calls: string[] = [];
    await expect(moveAuthFnIdentityPlacement(directory, {
      identityKey: 'person:ada',
      sourceRegionId: 'us-east-1',
      targetRegionId: 'eu-west-1',
      callbacks: {
        async quiesceSource() { calls.push('quiesce'); },
        async drainSource() { calls.push('drain'); },
        async copyToTarget() { calls.push('copy'); },
        async validateTarget() { throw new Error('copy validation failed'); },
        async warmTarget() { calls.push('warm'); },
        async resumeTarget() { calls.push('resume-target'); },
        async resumeSource() { calls.push('resume-source'); }
      }
    })).rejects.toThrow('copy validation failed');
    expect(await directory.get('person:ada')).toMatchObject({
      regionId: 'us-east-1',
      epoch: 6,
      state: 'active',
      previousRegionId: 'eu-west-1'
    });
    expect(calls).toEqual(['quiesce', 'drain', 'copy', 'resume-source']);
  });

  it('keeps placement fenced when target resume fails without source recovery', async () => {
    const directory = createInMemoryAuthFnPlacementDirectory([placement('person:ada', 'us-east-1', 4)]);
    await expect(moveAuthFnIdentityPlacement(directory, {
      identityKey: 'person:ada',
      sourceRegionId: 'us-east-1',
      targetRegionId: 'eu-west-1',
      callbacks: {
        async quiesceSource() {},
        async drainSource() {},
        async copyToTarget() {},
        async validateTarget() {},
        async warmTarget() {},
        async resumeTarget() { throw new Error('target resume failed'); }
      }
    })).rejects.toThrow('target resume failed');
    await expect(directory.get('person:ada')).resolves.toMatchObject({
      regionId: 'us-east-1',
      epoch: 5,
      state: 'moving',
      movingToRegionId: 'eu-west-1'
    });
  });

  it('keeps placement fenced when target resumes but activation loses its CAS race', async () => {
    const backing = createInMemoryAuthFnPlacementDirectory([
      placement('person:ada', 'us-east-1', 4)
    ]);
    let rejectActivation = true;
    const directory = {
      get: (identityKey: string) => backing.get(identityKey),
      putIfAbsent: (value: AuthFnIdentityPlacement) => backing.putIfAbsent(value),
      compareAndSet: (input: Parameters<typeof backing.compareAndSet>[0]) => {
        if (rejectActivation && input.expectedState === 'moving' && input.placement.state === 'active') {
          rejectActivation = false;
          return Promise.resolve({ updated: false });
        }
        return backing.compareAndSet(input);
      }
    };
    let sourceResumes = 0;
    await expect(moveAuthFnIdentityPlacement(directory, {
      identityKey: 'person:ada',
      sourceRegionId: 'us-east-1',
      targetRegionId: 'eu-west-1',
      callbacks: {
        async quiesceSource() {},
        async drainSource() {},
        async copyToTarget() {},
        async validateTarget() {},
        async warmTarget() {},
        async resumeTarget() {},
        async resumeSource() { sourceResumes += 1; }
      }
    })).rejects.toThrow('changed before activation');
    expect(sourceResumes).toBe(0);
    await expect(backing.get('person:ada')).resolves.toMatchObject({
      regionId: 'us-east-1',
      epoch: 5,
      state: 'moving',
      movingToRegionId: 'eu-west-1'
    });
  });

  it('does not publish source rollback until source resume succeeds', async () => {
    const directory = createInMemoryAuthFnPlacementDirectory([placement('person:ada', 'us-east-1', 4)]);
    await expect(moveAuthFnIdentityPlacement(directory, {
      identityKey: 'person:ada',
      sourceRegionId: 'us-east-1',
      targetRegionId: 'eu-west-1',
      callbacks: {
        async quiesceSource() {},
        async drainSource() {},
        async copyToTarget() { throw new Error('copy failed'); },
        async validateTarget() {},
        async warmTarget() {},
        async resumeTarget() {},
        async resumeSource() { throw new Error('source resume failed'); }
      }
    })).rejects.toThrow('source resume failed');
    await expect(directory.get('person:ada')).resolves.toMatchObject({
      regionId: 'us-east-1',
      epoch: 5,
      state: 'moving'
    });
  });
});

describe('AuthFn route classification', () => {
  it('keeps discovery global and identity/session/OAuth mutations regional', () => {
    expect(classifyAuthFnRoute(new Request('https://account.example.com/auth/.well-known/openid-configuration')))
      .toEqual({ scope: 'global', family: 'discovery' });
    expect(classifyAuthFnRoute(new Request('https://account.example.com/auth/oauth/token', { method: 'POST' })))
      .toEqual({ scope: 'identity', family: 'oauth' });
    expect(classifyAuthFnRoute(new Request('https://account.example.com/auth/sessions')))
      .toEqual({ scope: 'identity', family: 'session' });
    expect(classifyAuthFnRoute(
      new Request('https://account.example.com/custom/.well-known/openid-configuration'),
      '/custom/'
    )).toEqual({ scope: 'global', family: 'discovery' });
    expect(classifyAuthFnRoute(new Request('https://account.example.com/authentic/.well-known/trap')))
      .toEqual({ scope: 'identity', family: 'auth' });
  });
});

describe('AuthFn canonical runtime', () => {
  it('allows only global routes in a gateway-only AuthFn runtime', async () => {
    const middleware = createAuthFnCellPlacementMiddleware(
      { basePath: '/auth' },
      {
        routing: {
          mode: 'gateway',
          publicAuthority: 'https://account.example.com',
          placementDirectory: createInMemoryAuthFnPlacementDirectory(),
          identityKeyForIdentifier: (identifier) => identifier
        }
      }
    );
    if (!middleware) throw new Error('gateway guard missing');
    let executions = 0;
    const router = createRouter({
      basePath: '/auth',
      middleware: [middleware],
      routes: [
        {
          method: 'GET',
          path: '/environment',
          handler: () => {
            executions += 1;
            return Response.json({ global: true });
          }
        },
        {
          method: 'POST',
          path: '/sign-in/password',
          handler: () => {
            executions += 1;
            return Response.json({ identity: true });
          }
        }
      ]
    });

    expect((await router.handle(new Request('https://account.example.com/auth/environment'))).status).toBe(200);
    const unavailable = await router.handle(identityRequest());
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toMatchObject({
      error: { code: 'AUTHFN_ROUTING_CELL_UNAVAILABLE', retryable: false }
    });
    expect(executions).toBe(1);
  });

  it('keeps issuer, base URL, cookies, and OAuth canonical while retaining private cell region', async () => {
    const directory = createInMemoryAuthFnPlacementDirectory();
    const gatewayRuntime = authFnMultiRegionEnvironment({
      regions: [{
        regionId: 'eu-west-1',
        authority: 'https://eu.internal.example.com',
        hosts: ['eu.internal.example.com'],
        cookie: { prefix: 'regional' },
        oauth: { google: { clientId: 'regional-google' } }
      }],
      routing: {
        mode: 'gateway',
        publicAuthority: 'https://account.example.com',
        canonicalCookie: { prefix: 'canonical', domain: '.example.com' },
        canonicalOAuth: { google: { clientId: 'canonical-google' } },
        placementDirectory: directory,
        identityKeyForIdentifier: (identifier) => identifier,
        cell: {
          regionId: 'eu-west-1',
          audience: 'cell:eu-west-1',
          keyring,
          replayStore: createInMemoryAuthFnRoutingReplayStore()
        }
      }
    });
    expect(await gatewayRuntime.resolve(new Request('https://eu.internal.example.com/auth/session')))
      .toMatchObject({
        issuer: 'https://account.example.com',
        baseUrl: 'https://account.example.com',
        regionId: 'eu-west-1',
        cookie: { prefix: 'canonical', domain: '.example.com' },
        oauth: { google: { clientId: 'canonical-google' } }
      });

    const directRuntime = authFnMultiRegionEnvironment({
      regions: [{
        regionId: 'eu-west-1',
        authority: 'https://eu.account.example.com',
        hosts: ['eu.account.example.com']
      }]
    });
    expect(await directRuntime.resolve(new Request('https://eu.account.example.com/auth/session')))
      .toMatchObject({
        issuer: 'https://eu.account.example.com',
        baseUrl: 'https://eu.account.example.com',
        regionId: 'eu-west-1'
      });
  });
});

function createCell(
  regionId: string,
  directory: ReturnType<typeof createInMemoryAuthFnPlacementDirectory>,
  effects: string[],
  replayStore: AuthFnRoutingReplayStore = createInMemoryAuthFnRoutingReplayStore()
): Router {
  const pluginConfig = cellPluginConfig(regionId, directory, replayStore);
  const middleware = createAuthFnCellPlacementMiddleware({ basePath: '/auth' }, pluginConfig);
  if (!middleware) throw new Error('cell middleware missing');
  return createRouter({
    basePath: '/auth',
    middleware: [middleware],
    routes: [{
      method: 'POST',
      path: '/sign-in/password',
      handler: () => {
        effects.push(regionId);
        return Response.json({ executedIn: regionId });
      }
    }]
  });
}

function cellPluginConfig(
  regionId: string,
  directory: ReturnType<typeof createInMemoryAuthFnPlacementDirectory>,
  replayStore: AuthFnRoutingReplayStore
): MultiRegionPluginRuntimeConfig {
  return {
    routing: {
      mode: 'gateway',
      publicAuthority: 'https://account.example.com',
      placementDirectory: directory,
      identityKeyForIdentifier: (identifier) => identifier,
      cell: {
        regionId,
        audience: `cell:${regionId}`,
        keyring,
        replayStore
      }
    }
  };
}

function identityRequest(headers: Record<string, string> = {}): Request {
  return new Request('https://account.example.com/auth/sign-in/password', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers
    },
    body: JSON.stringify({ identityKey: 'person:ada' })
  });
}

function placement(identityKey: string, regionId: string, epoch: number): AuthFnIdentityPlacement {
  return {
    identityKey,
    regionId,
    epoch,
    state: 'active',
    updatedAt: '2026-08-23T00:00:00.000Z'
  };
}
