import { MailFnClient, type MailFnClientConfig } from '@mailfn/client';
import {
  MailFn,
  MemoryMailFnObjectStore,
  MemoryMailFnStore,
  noOpSecretProtector,
  type MailFnSendAdapter,
} from '@mailfn/core';

export function createStandaloneMailbox(sendAdapter?: MailFnSendAdapter): MailFn {
  return new MailFn({
    store: new MemoryMailFnStore(),
    objects: new MemoryMailFnObjectStore(),
    secretProtector: noOpSecretProtector,
    defaultDomain: 'mail.example.test',
    sendAdapter,
  });
}

export function createMailboxClient(config: MailFnClientConfig): MailFnClient {
  const client = new MailFnClient(config);
  void client.listInboxes;
  void client.listAttachments;
  void client.createReplyDraft;
  void client.exportCompliance;
  return client;
}
