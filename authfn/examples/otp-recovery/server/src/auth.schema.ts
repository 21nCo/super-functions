import { authFnEmailOtpPlugin, authFnPasswordPlugin, createAuthFn } from '@authfn/core';
import type { Adapter } from '@superfunctions/db';
import { OTP_RECOVERY_NAMESPACE } from './auth.js';

export const otpRecoverySchemaSource = createAuthFn({
  database: {} as Adapter,
  namespace: OTP_RECOVERY_NAMESPACE,
  plugins: [
    authFnPasswordPlugin({
      otp: {}
    }),
    authFnEmailOtpPlugin()
  ]
});
