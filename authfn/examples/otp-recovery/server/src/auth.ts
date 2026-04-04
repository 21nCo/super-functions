import {
  authFnEmailOtpPlugin,
  authFnPasswordPlugin,
  createAuthFn,
  getSchema,
  type AuthFnEvent,
  type AuthFnInstance,
  type AuthFnPlugin
} from '@authfn/core';
import type { ExampleOtpInbox } from '@authfn/examples-shared';
import { createOtpInboxDeliveryProvider } from '@authfn/examples-shared';
import type { Adapter } from '@superfunctions/db';

export const OTP_RECOVERY_NAMESPACE = 'authfn_otp_recovery';
export const OTP_RECOVERY_COOKIE_PREFIX = 'authfn-otp-recovery';

const DEMO_OTP_CODE = '731942';

export function createOtpRecoverySchemaPlugins(): AuthFnPlugin[] {
  return [
    authFnPasswordPlugin({
      otp: {}
    }),
    authFnEmailOtpPlugin()
  ];
}

export function createOtpRecoveryPlugins(otpInbox: ExampleOtpInbox): AuthFnPlugin[] {
  const otpDelivery = createOtpInboxDeliveryProvider(otpInbox);
  const otpConfig = {
    delivery: otpDelivery,
    codeGenerator: () => DEMO_OTP_CODE
  };

  return [
    authFnPasswordPlugin({
      otp: otpConfig
    }),
    authFnEmailOtpPlugin(otpConfig)
  ];
}

export const otpRecoverySchema = getSchema({
  database: {} as Adapter,
  namespace: OTP_RECOVERY_NAMESPACE,
  plugins: createOtpRecoverySchemaPlugins()
});

export function createOtpRecoveryAuth(options: {
  database: Adapter;
  otpInbox: ExampleOtpInbox;
  onEvent?(event: AuthFnEvent): Promise<void> | void;
}): AuthFnInstance {
  return createAuthFn({
    database: options.database,
    namespace: OTP_RECOVERY_NAMESPACE,
    runtime: {
      resolve(request) {
        const url = new URL(request.url);
        return {
          issuer: url.origin,
          baseUrl: url.origin,
          cookie: {
            prefix: OTP_RECOVERY_COOKIE_PREFIX,
            secure: !isLocalHostname(url.hostname),
            sameSite: 'lax'
          }
        };
      }
    },
    observability: {
      emit: options.onEvent
    },
    plugins: createOtpRecoveryPlugins(options.otpInbox)
  });
}

function isLocalHostname(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === 'localhost';
}
