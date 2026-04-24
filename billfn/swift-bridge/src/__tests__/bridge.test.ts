import { describe, expect, it } from 'vitest';
import { BILLFN_BRIDGE_PROTOCOL, createNativeBackedBillFnClient } from '../index.js';

describe('@billfn/swift-bridge', () => {
  it('requires handshake before native-backed requests', async () => {
    const client = createNativeBackedBillFnClient(
      {
        clientId: 'client_1',
        mode: 'native-backed',
        baseURL: 'https://billfn.example.test/billfn'
      },
      {
        async request(message) {
          if (message.method === 'handshake') {
            return {
              protocol: BILLFN_BRIDGE_PROTOCOL,
              id: message.id,
              ok: true,
              result: {
                bridgeVersion: 1,
                billingOwner: 'native',
                authOwner: 'native',
                capabilities: ['billing', 'entitlements']
              }
            };
          }
          return {
            protocol: BILLFN_BRIDGE_PROTOCOL,
            id: message.id,
            ok: true,
            result: {}
          };
        },
        subscribe() {
          return () => undefined;
        }
      }
    );

    await expect(client.getBillingStatus()).rejects.toMatchObject({
      code: 'BRIDGE_HANDSHAKE_REQUIRED'
    });

    const handshake = await client.handshake();
    expect(handshake.bridgeVersion).toBe(1);
  });
});
