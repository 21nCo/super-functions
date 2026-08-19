import { describe, expect, it, vi } from 'vitest';
import { prismaAdapter } from './index.js';

describe('prismaAdapter singular write guards', () => {
  it('rejects empty update and delete filters without calling Prisma', async () => {
    const model = {
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    };
    const adapter = prismaAdapter({
      prisma: { user: model },
      provider: 'postgresql',
      modelMap: { users: 'user' },
    });

    await expect(adapter.update({ model: 'users', where: [], data: { name: 'Changed' } }))
      .rejects.toThrow('update requires a non-empty where clause');
    await expect(adapter.delete({ model: 'users', where: [] }))
      .rejects.toThrow('delete requires a non-empty where clause');
    expect(model.updateMany).not.toHaveBeenCalled();
    expect(model.deleteMany).not.toHaveBeenCalled();
  });
});
