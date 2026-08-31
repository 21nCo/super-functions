import type { MailFnJob, MailFnQueue, ParseJob, WebhookDeliveryJob } from '@mailfn/core';

import type { Queue } from './bindings.js';

export class CloudflareMailFnQueue implements MailFnQueue {
  public constructor(private readonly queue: Queue<MailFnJob>) {}

  public enqueue(job: ParseJob): Promise<void> {
    return this.queue.send(job, { contentType: 'json' });
  }

  public enqueueWebhook(job: WebhookDeliveryJob): Promise<void> {
    return this.queue.send(job, { contentType: 'json' });
  }
}
