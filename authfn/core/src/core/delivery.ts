import type {
  AuthFnDeliveryProvider,
  AuthFnDeliveryRequest,
  AuthFnDeliveryResult,
  AuthFnOtpChallengeLifecycleEvent
} from '../types.js';
import { AuthFnDeliveryFailedError } from './errors.js';

export async function deliverChallenge(
  provider: AuthFnDeliveryProvider | undefined,
  input: AuthFnDeliveryRequest
): Promise<AuthFnDeliveryResult> {
  if (!provider) {
    throw new AuthFnDeliveryFailedError('No OTP delivery provider configured');
  }

  try {
    const result = await provider.send(input);
    if (!result?.sent) {
      throw new AuthFnDeliveryFailedError('OTP delivery provider reported an unsent challenge', {
        challengeId: input.challengeId,
        purpose: input.purpose,
        email: input.email
      });
    }
    return result;
  } catch (error) {
    if (error instanceof AuthFnDeliveryFailedError) {
      throw error;
    }

    throw new AuthFnDeliveryFailedError('OTP delivery failed', {
      challengeId: input.challengeId,
      purpose: input.purpose,
      email: input.email,
      cause: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function emitOtpEvent(
  provider: AuthFnDeliveryProvider | undefined,
  event: AuthFnOtpChallengeLifecycleEvent
): Promise<void> {
  try {
    await provider?.emit?.(event);
  } catch {
    // Fail-open by contract for post-commit observability.
  }
}
