import type {
  AuthFnDeliveryProvider,
  AuthFnDeliveryRequest,
  AuthFnDeliveryResult,
  AuthFnOtpPurpose
} from 'authfn';

export interface ExampleOtpMessage {
  challengeId: string;
  purpose: AuthFnOtpPurpose;
  email: string;
  code: string;
  metadata?: Record<string, unknown>;
  recordedAt: string;
}

export interface ExampleOtpLookup {
  purpose: AuthFnOtpPurpose;
  email: string;
}

export class ExampleOtpInbox {
  #messages: ExampleOtpMessage[] = [];

  push(request: AuthFnDeliveryRequest): ExampleOtpMessage {
    const message: ExampleOtpMessage = {
      challengeId: request.challengeId,
      purpose: request.purpose,
      email: request.email,
      code: request.code,
      metadata: request.metadata,
      recordedAt: new Date().toISOString()
    };
    this.#messages.push(message);
    return message;
  }

  list(): ExampleOtpMessage[] {
    return [...this.#messages];
  }

  latest(input: ExampleOtpLookup): ExampleOtpMessage | undefined {
    for (let index = this.#messages.length - 1; index >= 0; index -= 1) {
      const current = this.#messages[index];
      if (current && current.email === input.email && current.purpose === input.purpose) {
        return current;
      }
    }
    return undefined;
  }

  reset(): void {
    this.#messages = [];
  }
}

export function createOtpInboxDeliveryProvider(
  inbox: ExampleOtpInbox
): AuthFnDeliveryProvider {
  return {
    send(input: AuthFnDeliveryRequest): AuthFnDeliveryResult {
      inbox.push(input);
      return {
        sent: true,
        metadata: {
          transport: 'example-inbox'
        }
      };
    }
  };
}
