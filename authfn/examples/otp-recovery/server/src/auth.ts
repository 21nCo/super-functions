import { authFnPlugins, authfn, type AuthFnEvent, type AuthFnServer } from 'authfn';
import { authFnEmailOtpPlugin } from '@authfn/email-otp';
import { authFnPasswordPlugin } from '@authfn/password';
import type { ExampleOtpInbox } from '@authfn/examples-shared';
import { createOtpInboxDeliveryProvider } from '@authfn/examples-shared';
import type { Adapter } from '@superfunctions/db';

export const OTP_RECOVERY_NAMESPACE = 'authfn_otp_recovery';
export const OTP_RECOVERY_COOKIE_PREFIX = 'authfn-otp-recovery';

const DEMO_OTP_CODE = '731942';

export function createOtpRecoveryPlugins() {
  return authFnPlugins(
    authFnPasswordPlugin(),
    authFnEmailOtpPlugin()
  );
}

function createOtpRecoveryRuntimeConfig(otpInbox: ExampleOtpInbox) {
  const otpDelivery = createOtpInboxDeliveryProvider(otpInbox);
  const otpConfig = {
    delivery: otpDelivery,
    codeGenerator: () => DEMO_OTP_CODE
  };

  return {
    password: {
      otp: otpConfig
    },
    emailOtp: otpConfig
  };
}

export const otpRecoveryAuthApp = authfn({
  namespace: OTP_RECOVERY_NAMESPACE,
  plugins: createOtpRecoveryPlugins()
});

export const otpRecoverySchema = otpRecoveryAuthApp.getSchema();

export function createOtpRecoveryAuth(options: {
  database: Adapter;
  otpInbox: ExampleOtpInbox;
  onEvent?(event: AuthFnEvent): Promise<void> | void;
}): AuthFnServer {
  return otpRecoveryAuthApp.createServer({
    database: options.database,
    environment: {
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
    pluginRuntime: createOtpRecoveryRuntimeConfig(options.otpInbox)
  });
}

function isLocalHostname(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === 'localhost';
}
