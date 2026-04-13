import { describe, expect, it } from 'vitest';
import { FlowFnQueueAdapter, MemoryQueueAdapter } from '../index.js';

describe('queue adapters', () => {
  it('memory queue preserves FIFO order', async () => {
    const queue = new MemoryQueueAdapter<string>();

    await queue.enqueue('q', 'a');
    await queue.enqueue('q', 'b');

    expect(await queue.dequeue('q')).toBe('a');
    expect(await queue.dequeue('q')).toBe('b');
  });

  it('dequeue on empty queue returns null', async () => {
    const queue = new MemoryQueueAdapter<string>();
    expect(await queue.dequeue('q')).toBeNull();
  });

  it('memory queue preserves undefined payloads', async () => {
    const queue = new MemoryQueueAdapter<string | undefined>();

    await queue.enqueue('q', undefined);

    expect(await queue.dequeue('q')).toBeUndefined();
    expect(await queue.dequeue('q')).toBeNull();
  });

  it('normalizes queue names consistently in memory adapter', async () => {
    const queue = new MemoryQueueAdapter<string>();

    await queue.enqueue(' jobs ', 'a');

    expect(queue.peek('jobs')).toEqual(['a']);
    expect(queue.size(' jobs ')).toBe(1);
    expect(await queue.dequeue('jobs')).toBe('a');
  });

  it('rejects invalid queue names in memory adapter', async () => {
    const queue = new MemoryQueueAdapter<string>();

    await expect(queue.enqueue('../jobs', 'a')).rejects.toThrow('FLOWFN_QUEUE_NAME_INVALID');
    expect(() => queue.peek('')).toThrow('FLOWFN_QUEUE_NAME_INVALID');
  });

  it('flowfn adapter sends authenticated enqueue/dequeue requests', async () => {
    const calls: Array<{ url: string; method: string; auth?: string }> = [];

    const adapter = new FlowFnQueueAdapter<{ id: string }>({
      baseUrl: 'https://flowfn.example.com',
      apiKey: 'flowfn-key',
      fetch: (async (url, init) => {
        calls.push({
          url: String(url),
          method: String(init?.method ?? 'GET'),
          auth: (init?.headers as Record<string, string> | undefined)?.Authorization,
        });

        if (String(url).includes('/dequeue')) {
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({ payload: { id: 'job_1' } }),
          } as Response;
        }

        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({}),
        } as Response;
      }) as typeof globalThis.fetch,
    });

    await adapter.enqueue('jobs', { id: 'job_1' });
    const payload = await adapter.dequeue('jobs');

    expect(payload).toEqual({ id: 'job_1' });
    expect(calls[0].url).toContain('/queues/jobs/enqueue');
    expect(calls[1].url).toContain('/queues/jobs/dequeue');
    expect(calls[0].auth).toBe('Bearer flowfn-key');
    expect(calls[1].auth).toBe('Bearer flowfn-key');
  });

  it('flowfn adapter preserves an explicit undefined payload', async () => {
    const adapter = new FlowFnQueueAdapter<string | undefined>({
      baseUrl: 'https://flowfn.example.com',
      apiKey: 'flowfn-key',
      fetch: (async (_url) => {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ payload: undefined }),
        } as Response;
      }) as typeof globalThis.fetch,
    });

    expect(await adapter.dequeue('jobs')).toBeUndefined();
  });

  it('flowfn adapter aborts stalled requests using timeoutMs', async () => {
    const adapter = new FlowFnQueueAdapter<{ id: string }>({
      baseUrl: 'https://flowfn.example.com',
      apiKey: 'flowfn-key',
      timeoutMs: 5,
      fetch: (async (_url, init) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        });
      }) as typeof globalThis.fetch,
    });

    await expect(adapter.enqueue('jobs', { id: 'job_1' })).rejects.toThrow('The operation was aborted.');
  });

  it('rejects a non-finite timeoutMs value', async () => {
    expect(
      () =>
        new FlowFnQueueAdapter({
          baseUrl: 'https://flowfn.example.com',
          apiKey: 'flowfn-key',
          timeoutMs: Number.NaN,
        })
    ).toThrow('FLOWFN_QUEUE_TIMEOUT_INVALID');
  });

  it('flowfn adapter normalizes a trailing slash in baseUrl', async () => {
    const calls: string[] = [];
    const adapter = new FlowFnQueueAdapter<{ id: string }>({
      baseUrl: 'https://flowfn.example.com/',
      apiKey: 'flowfn-key',
      fetch: (async (url) => {
        calls.push(String(url));
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({}),
        } as Response;
      }) as typeof globalThis.fetch,
    });

    await adapter.enqueue('jobs', { id: 'job_1' });

    expect(calls).toEqual(['https://flowfn.example.com/queues/jobs/enqueue']);
  });
});
