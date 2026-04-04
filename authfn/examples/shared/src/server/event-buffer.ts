import type { AuthFnEvent } from '@authfn/core';

export interface ExampleEventRecord extends AuthFnEvent {
  recordedAt: string;
}

export class ExampleEventBuffer {
  #events: ExampleEventRecord[] = [];

  append(event: AuthFnEvent): ExampleEventRecord {
    const record: ExampleEventRecord = {
      ...event,
      recordedAt: new Date().toISOString()
    };
    this.#events.push(record);
    return record;
  }

  list(): ExampleEventRecord[] {
    return [...this.#events];
  }

  reset(): void {
    this.#events = [];
  }
}

export function createEventEmitter(buffer: ExampleEventBuffer): (event: AuthFnEvent) => void {
  return (event) => {
    buffer.append(event);
  };
}
