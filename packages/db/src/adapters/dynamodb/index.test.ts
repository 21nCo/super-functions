import { GetCommand, PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it } from 'vitest';

import { dynamoDbAtomicKVStore } from './index.js';

describe('dynamoDbAtomicKVStore', () => {
  it('uses an atomic conditional write for compare-and-set', async () => {
    let storedValue: string | undefined = 'before';
    const putCommands: PutCommand[] = [];
    const documentClient = {
      async send(command: unknown): Promise<Record<string, unknown>> {
        if (command instanceof PutCommand) {
          putCommands.push(command);
          const expected = command.input.ExpressionAttributeValues?.[':expected'];
          if (storedValue !== expected) {
            throw conditionalCheckFailed();
          }
          storedValue = command.input.Item?.value as string;
          return {};
        }
        if (command instanceof GetCommand) {
          return storedValue === undefined ? {} : {
            Item: { value: storedValue },
          };
        }
        throw new Error('Unexpected DynamoDB command');
      },
    } as unknown as DynamoDBDocumentClient;
    const store = dynamoDbAtomicKVStore({
      tableName: 'runtime-store',
      documentClient,
    });

    const results = await Promise.all([
      store.compareAndSet!({ key: 'lease', expected: 'before', value: 'first' }),
      store.compareAndSet!({ key: 'lease', expected: 'before', value: 'second' }),
    ]);

    expect(results.filter((result) => result.updated)).toHaveLength(1);
    expect(results.filter((result) => !result.updated)).toHaveLength(1);
    expect(storedValue).toBe('first');
    expect(putCommands).toHaveLength(2);
    expect(putCommands[0]?.input.ConditionExpression).toContain('#value = :expected');
  });

  it('treats an absent or expired item as the null compare-and-set state', async () => {
    let putCommand: PutCommand | undefined;
    const documentClient = {
      async send(command: unknown): Promise<Record<string, unknown>> {
        if (command instanceof PutCommand) {
          putCommand = command;
          return {};
        }
        throw new Error('Unexpected DynamoDB command');
      },
    } as unknown as DynamoDBDocumentClient;
    const store = dynamoDbAtomicKVStore({
      tableName: 'runtime-store',
      documentClient,
    });

    await expect(store.compareAndSet!({
      key: 'lease',
      expected: null,
      value: 'claimed',
    })).resolves.toEqual({ updated: true });

    expect(putCommand?.input.ConditionExpression).toBe(
      '(attribute_not_exists(#pk) OR #expiresAt <= :now)',
    );
    expect(putCommand?.input.ExpressionAttributeValues).not.toHaveProperty(':expected');
  });
});

function conditionalCheckFailed(): Error {
  const error = new Error('The conditional request failed');
  error.name = 'ConditionalCheckFailedException';
  return error;
}
