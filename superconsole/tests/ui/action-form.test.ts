import { describe, expect, it } from 'vitest';
import {
  createActionDraft,
  editableActionFields,
  validateActionInput,
} from '../../src/lib/components/action-form';
import type { AdminActionViewModel } from '../../src/lib/components/view-models';

function action(): AdminActionViewModel {
  return {
    id: 'sendfn.messages.send',
    label: 'Send message',
    targetIdInput: 'messageId',
    input: { messageId: 'message-1', retries: 2, metadata: { source: 'console' } },
    inputSchema: {
      type: 'object',
      properties: {
        messageId: { type: 'string' },
        recipient: { type: 'string', title: 'Recipient' },
        retries: { type: 'integer', minimum: 0 },
        urgent: { type: 'boolean' },
        metadata: { type: 'object' },
        tags: { type: 'array' },
      },
      required: ['messageId', 'recipient', 'metadata'],
      additionalProperties: false,
    },
  };
}

describe('schema-driven action input', () => {
  it('hides the prebound resource identity and initializes editable values', () => {
    const candidate = action();
    expect(editableActionFields(candidate).map((field) => field.name)).toEqual([
      'recipient', 'retries', 'urgent', 'metadata', 'tags',
    ]);
    expect(createActionDraft(candidate)).toMatchObject({
      recipient: '',
      retries: '2',
      metadata: '{\n  "source": "console"\n}',
      tags: '',
    });
  });

  it('collects editable properties and required fields from allOf object branches', () => {
    const candidate: AdminActionViewModel = {
      id: 'examplefn.records.update',
      label: 'Update record',
      targetIdInput: 'id',
      inputSchema: {
        type: 'object',
        allOf: [
          { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } }, required: ['id', 'name'] },
          { type: 'object', properties: { retries: { type: 'integer' } }, required: ['retries'] },
        ],
      },
    };

    expect(editableActionFields(candidate).map(({ name, required }) => ({ name, required }))).toEqual([
      { name: 'name', required: true },
      { name: 'retries', required: true },
    ]);
  });

  it('retains every nested constraint when allOf branches repeat a property', () => {
    const candidate: AdminActionViewModel = {
      id: 'examplefn.records.update',
      label: 'Update record',
      inputSchema: {
        type: 'object',
        allOf: [
          {
            type: 'object',
            properties: { payload: { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] } },
          },
          {
            type: 'object',
            properties: { payload: { type: 'object', properties: { b: { type: 'string' } }, required: ['b'] } },
          },
        ],
      },
    };

    expect(validateActionInput(candidate, { payload: '{"a":"one"}' })).toMatchObject({
      ok: false,
      errors: { payload: 'Payload.b is required.' },
    });
    expect(validateActionInput(candidate, { payload: '{"a":"one","b":"two"}' })).toMatchObject({ ok: true });
  });

  it('parses primitive and JSON fields into the exact dispatch input', () => {
    const candidate = action();
    const result = validateActionInput(candidate, {
      recipient: 'ops@example.test',
      retries: '3',
      urgent: true,
      metadata: '{"source":"operator"}',
      tags: '["production","urgent"]',
    });
    expect(result).toEqual({
      ok: true,
      errors: {},
      input: {
        messageId: 'message-1',
        recipient: 'ops@example.test',
        retries: 3,
        urgent: true,
        metadata: { source: 'operator' },
        tags: ['production', 'urgent'],
      },
    });
  });

  it('rejects missing required values and malformed JSON before dispatch', () => {
    const result = validateActionInput(action(), {
      recipient: '',
      retries: 'not-a-number',
      urgent: false,
      metadata: '{broken',
      tags: '{}',
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toMatchObject({
      recipient: 'Recipient is required.',
      retries: 'Retries must be a valid integer.',
      metadata: 'Metadata must contain valid JSON.',
      tags: 'Tags must be a JSON array.',
    });
    expect(result.input.messageId).toBe('message-1');
  });

  it('recursively validates nested object properties and array items', () => {
    const candidate: AdminActionViewModel = {
      id: 'flowfn.workflows.start',
      label: 'Start workflow',
      inputSchema: {
        type: 'object',
        properties: {
          payload: {
            type: 'object',
            properties: {
              owner: { type: 'string', minLength: 3 },
              steps: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  properties: { retries: { type: 'integer', minimum: 0 } },
                  required: ['retries'],
                  additionalProperties: false,
                },
              },
            },
            required: ['owner', 'steps'],
            additionalProperties: false,
          },
        },
        required: ['payload'],
        additionalProperties: false,
      },
    };

    const invalid = validateActionInput(candidate, {
      payload: JSON.stringify({ owner: 'ok', steps: [{ retries: -1 }] }),
    });
    expect(invalid).toMatchObject({ ok: false, errors: { payload: 'Payload.owner is too short.' } });
    expect(validateActionInput(candidate, {
      payload: JSON.stringify({ owner: 'ops', steps: [{ retries: 0 }] }),
    })).toMatchObject({ ok: true });
  });
});
