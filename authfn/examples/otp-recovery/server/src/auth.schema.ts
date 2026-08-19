import { authFnPlugins, authfn } from 'authfn';
import { authFnEmailOtpPlugin } from '@authfn/email-otp';
import { authFnPasswordPlugin } from '@authfn/password';
import { OTP_RECOVERY_NAMESPACE } from './auth.js';

export const otpRecoverySchemaSource = authfn({
  namespace: OTP_RECOVERY_NAMESPACE,
  plugins: authFnPlugins(
    authFnPasswordPlugin(),
    authFnEmailOtpPlugin()
  )
});
