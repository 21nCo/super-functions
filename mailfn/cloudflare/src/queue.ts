import type { MailFnQueue, ParseJob } from '@mailfn/core';

import type { Queue } from './bindings.js';

export class CloudflareMailFnQueue implements MailFnQueue {
  public constructor(private readonly queue: Queue<ParseJob>) {}

  public enqueue(job: ParseJob): Promise<void> {
    return this.queue.send(job, { contentType: 'json' });
  }
}
