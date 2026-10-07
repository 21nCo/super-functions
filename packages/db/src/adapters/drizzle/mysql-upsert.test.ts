import { describe, expect, it, vi } from 'vitest';
import { mysqlTable, varchar } from 'drizzle-orm/mysql-core';
import { drizzleAdapter } from './index.js';
import { normalizeInternalResultCount } from '../internal-utils.js';

const users = mysqlTable('users', {
  id: varchar('id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 255 }),
  email: varchar('email', { length: 255 }),
});

describe('DrizzleAdapter - MySQL upsert follow-ups', () => {
  it('preserves postgres-js count metadata on array results', () => {
    const result = Object.assign([], { count: 2 });
    expect(normalizeInternalResultCount(result)).toBe(2);
  });

  it('reads affected rows from the mysql2 result tuple', async () => {
    const execute = vi.fn(async () => [{ affectedRows: 1 }, []]);
    const mockDb = {
      _: { fullSchema: { users } },
      update() {
        return {
          set() {
            return {
              where() {
                return { execute };
              },
            };
          },
        };
      },
    };
    const adapter = drizzleAdapter({ db: mockDb, dialect: 'mysql' });

    await expect(adapter.updateMany({
      model: 'users',
      where: [{ field: 'id', operator: 'eq', value: 'u1' }],
      data: { name: 'Ada' },
    })).resolves.toBe(1);
  });

  it('throws when MySQL upsert cannot reselect the inserted row', async () => {
    const insertExecute = vi.fn(async () => ({ rowsAffected: 1 }));
    const duplicateExecute = vi.fn(async () => ({ rowsAffected: 1 }));
    const onDuplicateKeyUpdate = vi.fn(() => ({
      execute: duplicateExecute,
    }));
    const reselectExecute = vi.fn(async () => []);

    const mockDb = {
      _: {
        fullSchema: {
          users,
        },
      },
      insert() {
        return {
          values() {
            return {
              execute: insertExecute,
              onDuplicateKeyUpdate,
            };
          },
        };
      },
      select() {
        return {
          from() {
            return {
              where() {
                return {
                  limit() {
                    return {
                      execute: reselectExecute,
                    };
                  },
                };
              },
            };
          },
        };
      },
    };

    const adapter = drizzleAdapter({
      db: mockDb,
      dialect: 'mysql',
      debug: false,
    });

    await expect(
      adapter.upsert({
        model: 'users',
        where: [{ field: 'id', operator: 'eq', value: 'u1' }],
        create: { id: 'u1', name: 'Ada', email: 'ada@example.com' },
        update: {},
      }),
    ).rejects.toThrow('Upsert failed to return a row');

    expect(insertExecute).toHaveBeenCalledTimes(1);
    expect(onDuplicateKeyUpdate).not.toHaveBeenCalled();
    expect(duplicateExecute).not.toHaveBeenCalled();
    expect(reselectExecute).toHaveBeenCalledTimes(1);
  });
});
