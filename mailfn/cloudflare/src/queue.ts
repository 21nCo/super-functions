import type { MailFnQueue, ParseJob, WebhookDeliveryJob } from '@mailfn/core';

import type { Queue } from './bindings.js';

export class CloudflareMailFnQueue implements MailFnQueue {
  public constructor(
    private readonly parseQueue: Queue<ParseJob>,
    private readonly webhookQueue: Queue<WebhookDeliveryJob>,
  ) {}

  public enqueue(job: ParseJob): Promise<void> {
    return this.parseQueue.send(job, { contentType: 'json' });
  }

  public enqueueWebhook(job: WebhookDeliveryJob): Promise<void> {
    return this.webhookQueue.send(job, { contentType: 'json' });
  }
}
