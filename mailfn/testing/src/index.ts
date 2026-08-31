import {
  extractOtp,
  extractVerificationLink,
  type AttachmentDescriptor,
  type CreatedInbox,
  type ExtractedVerification,
  type Message,
  type Page,
  type WaitForMessageInput,
  type WaitForMessageResult,
} from '@mailfn/core';

export interface MailFnTestingClient {
  createInbox(input: {
    kind: 'expiring';
    expirySeconds: number;
    requestedLocalPart?: string;
    metadata?: Record<string, string>;
    idempotencyKey?: string;
  }): Promise<CreatedInbox>;
  deleteInbox(inboxId: string): Promise<unknown>;
  listMessages(inboxId: string, filter?: Record<string, unknown>): Promise<Page<Message>>;
  listAttachments(inboxId: string, messageId: string): Promise<AttachmentDescriptor[]>;
  waitForMessages(
    inboxId: string,
    input: Omit<WaitForMessageInput, 'projectId' | 'inboxId' | 'signal'>,
    options?: { signal?: AbortSignal },
  ): Promise<WaitForMessageResult>;
}

export interface InboxFixture {
  inbox: CreatedInbox['inbox'];
  token: string;
  dispose(): Promise<void>;
}

export async function createInboxFixture(
  client: MailFnTestingClient,
  options: {
    testRunId: string;
    expirySeconds?: number;
    requestedLocalPart?: string;
    metadata?: Record<string, string>;
  },
): Promise<InboxFixture> {
  const created = await client.createInbox({
    kind: 'expiring',
    expirySeconds: options.expirySeconds ?? 60 * 60,
    requestedLocalPart: options.requestedLocalPart,
    metadata: { testRunId: options.testRunId, ...(options.metadata ?? {}) },
    idempotencyKey: `test:${options.testRunId}:${options.requestedLocalPart ?? 'generated'}`,
  });
  let disposed = false;
  let disposing: Promise<void> | undefined;
  return {
    inbox: created.inbox,
    token: created.credential.token,
    async dispose() {
      if (disposed) return;
      if (!disposing) {
        disposing = client.deleteInbox(created.inbox.id).then(() => {
          disposed = true;
        }).finally(() => {
          disposing = undefined;
        });
      }
      await disposing;
    },
  };
}

export async function withInboxFixture<T>(
  client: MailFnTestingClient,
  options: Parameters<typeof createInboxFixture>[1],
  run: (fixture: InboxFixture) => Promise<T>,
): Promise<T> {
  const fixture = await createInboxFixture(client, options);
  try {
    return await run(fixture);
  } finally {
    await fixture.dispose();
  }
}

export async function waitForOtp(
  client: MailFnTestingClient,
  inboxId: string,
  input: Omit<WaitForMessageInput, 'projectId' | 'inboxId' | 'signal'>,
  options?: { signal?: AbortSignal },
): Promise<ExtractedVerification> {
  const result = await client.waitForMessages(inboxId, input, options);
  if (result.status === 'timeout') throw new MailFnAssertionError('Expected OTP message but wait timed out');
  for (const message of result.messages) {
    const extracted = extractOtp(message);
    if (extracted) return extracted;
  }
  throw new MailFnAssertionError('Matching messages did not contain an OTP');
}

export async function waitForVerificationLink(
  client: MailFnTestingClient,
  inboxId: string,
  input: Omit<WaitForMessageInput, 'projectId' | 'inboxId' | 'signal'>,
  options?: { signal?: AbortSignal },
): Promise<ExtractedVerification> {
  const result = await client.waitForMessages(inboxId, input, options);
  if (result.status === 'timeout') throw new MailFnAssertionError('Expected verification message but wait timed out');
  for (const message of result.messages) {
    const extracted = extractVerificationLink(message);
    if (extracted) return extracted;
  }
  throw new MailFnAssertionError('Matching messages did not contain a verification link');
}

export class MailFnAssertionError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'MailFnAssertionError';
  }
}

export function assertMessage(input: {
  message: Message;
  sender?: string;
  recipient?: string;
  subjectIncludes?: string;
  textIncludes?: string;
  header?: { name: string; includes: string };
  attachment?: { filename?: string; contentType?: string };
  attachments?: Array<{ filename: string; contentType: string }>;
  attachmentDescriptors?: AttachmentDescriptor[];
}): void {
  const { message } = input;
  const sender = input.sender?.toLowerCase();
  if (sender && !message.from.some((entry) => entry.address === sender)) {
    throw new MailFnAssertionError(`Expected sender ${sender}`);
  }
  const recipient = input.recipient?.toLowerCase();
  if (recipient && !message.to.some((entry) => entry.address === recipient)) {
    throw new MailFnAssertionError(`Expected recipient ${recipient}`);
  }
  if (input.subjectIncludes && !message.subject.includes(input.subjectIncludes)) {
    throw new MailFnAssertionError(`Expected subject to include ${input.subjectIncludes}`);
  }
  if (input.textIncludes && !`${message.textBody ?? ''}\n${message.htmlBody ?? ''}`.includes(input.textIncludes)) {
    throw new MailFnAssertionError(`Expected message content to include ${input.textIncludes}`);
  }
  if (input.header) {
    const values = Object.entries(message.headers).find(([name]) => name.toLowerCase() === input.header!.name.toLowerCase())?.[1] ?? [];
    if (!values.some((value) => value.includes(input.header!.includes))) {
      throw new MailFnAssertionError(`Expected header ${input.header.name} to include ${input.header.includes}`);
    }
  }
  if (input.attachment || input.attachments) {
    if (!input.attachmentDescriptors) {
      throw new MailFnAssertionError('Attachment assertions require attachmentDescriptors or assertMessageWithClient');
    }
    assertAttachments(input.attachmentDescriptors, input.attachments ?? [input.attachment ?? {}]);
  }
}

export async function assertMessageWithClient(
  client: Pick<MailFnTestingClient, 'listAttachments'>,
  input: Omit<Parameters<typeof assertMessage>[0], 'attachmentDescriptors'>,
): Promise<void> {
  const attachmentDescriptors = input.attachment || input.attachments
    ? await client.listAttachments(input.message.inboxId, input.message.id)
    : undefined;
  assertMessage({ ...input, attachmentDescriptors });
}

export function assertAttachments(
  attachments: Array<{ filename: string; contentType: string; sizeBytes: number; sha256: string }>,
  expected: Array<{ filename?: string; contentType?: string; minSizeBytes?: number; sha256?: string }>,
): void {
  for (const expectation of expected) {
    const match = attachments.find(
      (attachment) =>
        (!expectation.filename || attachment.filename === expectation.filename) &&
        (!expectation.contentType || attachment.contentType === expectation.contentType) &&
        (!expectation.minSizeBytes || attachment.sizeBytes >= expectation.minSizeBytes) &&
        (!expectation.sha256 || attachment.sha256 === expectation.sha256),
    );
    if (!match) throw new MailFnAssertionError(`Expected attachment was not found: ${JSON.stringify(expectation)}`);
  }
}

export function registerMailFnLifecycle(
  hooks: { beforeEach(run: () => void | Promise<void>): void; afterEach(run: () => void | Promise<void>): void },
  create: () => Promise<InboxFixture>,
): { current(): InboxFixture } {
  let fixture: InboxFixture | undefined;
  hooks.beforeEach(async () => { fixture = await create(); });
  hooks.afterEach(async () => { await fixture?.dispose(); fixture = undefined; });
  return {
    current() {
      if (!fixture) throw new MailFnAssertionError('MailFn fixture is not active');
      return fixture;
    },
  };
}
