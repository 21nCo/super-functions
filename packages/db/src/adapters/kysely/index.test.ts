import { describe, expect, it } from 'vitest';
import { kyselyAdapter } from './index.js';

describe('kyselyAdapter', () => {
  it('uses IS NULL and IS NOT NULL for public adapter null predicates', async () => {
    const predicates: unknown[][] = [];
    const expressionBuilder = Object.assign(
      (...args: unknown[]) => args,
      {
        and: (expressions: unknown[]) => ['and', ...expressions],
        or: (expressions: unknown[]) => ['or', ...expressions],
      }
    );
    const query = {
      where(...args: unknown[]) {
        const expression = args[0];
        predicates.push(
          typeof expression === 'function' ? expression(expressionBuilder) : args
        );
        return this;
      },
      orWhere(...args: unknown[]) {
        predicates.push(args);
        return this;
      },
      selectAll() {
        return this;
      },
      async execute() {
        return [];
      }
    };
    const adapter = kyselyAdapter({
      db: {
        selectFrom() {
          return query;
        }
      },
      dialect: 'postgres',
      schema: { records: 'records' }
    });

    await adapter.findMany({
      model: 'records',
      where: [{ field: 'deletedAt', operator: 'eq', value: null }]
    });
    await adapter.findMany({
      model: 'records',
      where: [{ field: 'deletedAt', operator: 'ne', value: null }]
    });

    expect(predicates).toEqual([
      ['deletedAt', 'is', null],
      ['deletedAt', 'is not', null]
    ]);
  });
});
