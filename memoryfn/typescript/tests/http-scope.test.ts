import { describe, it, expect, vi } from 'vitest';
import { createMemoryRouter } from '../src/http/router';
describe('HTTP memory authority', () => {
  it('authenticates each request and refuses caller-selected tenants', async () => {
    const memory = { add: vi.fn().mockResolvedValue({}), search: vi.fn().mockResolvedValue({ results: [] }) };
    const authorize = vi.fn().mockResolvedValue({ tenantId: 'trusted', containerTags: ['private'] });
    const router = createMemoryRouter(memory, { authorize });
    const request = (data: unknown) => new Request('https://test/v1/memories/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
    expect((await router.handle(request({ q: 'x', tenantId: 'other' }))).status).toBe(400);
    expect(memory.search).not.toHaveBeenCalled();
    expect((await router.handle(request({ q: 'x', containerTags: [] }))).status).toBe(200);
    expect(memory.search.mock.calls[0][0]).toMatchObject({ tenantId: 'trusted', containerTags: ['private'] });
    authorize.mockResolvedValue(null);
    expect((await router.handle(request({ q: 'x' }))).status).toBe(401);
    expect(memory.search).toHaveBeenCalledTimes(1);
  });
});
