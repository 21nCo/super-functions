import { describe, expect, it } from 'vitest';
import { parseFinancialMessage } from '../../src/financial-extraction/parsers/pipeline.js';
import { InMemoryFinancialExtractionStorage } from '../../src/financial-extraction/storage.js';
import {
  FinancialExtractionValidationError,
  type FinancialExtractionResult,
} from '../../src/financial-extraction/types.js';
import { validateNormalizedMailMessage } from '../../src/mail/normalization.js';

describe('financial extraction parser pipeline', () => {
  it('executes deterministic parser first and skips model fallback on high-confidence extraction', async () => {
    const storage = new InMemoryFinancialExtractionStorage();
    let modelCalls = 0;

    const record = await parseFinancialMessage({
      messageId: 'msg-1',
      message: {
        subject: 'Your bank statement',
        bodyText: 'Txn INR 450',
      },
      storage,
      modelExtractor: async () => {
        modelCalls += 1;
        return {
          extraction: {
            kind: 'unknown',
          },
          method: 'llm',
          confidence: 0.51,
          provenance: ['model:fallback'],
          parserVersion: '2026-03-11',
        };
      },
      now: () => '2026-03-12T00:00:00.000Z',
    });

    expect(modelCalls).toBe(0);
    expect(record.method).toBe('deterministic');
    expect(record.confidence).toBe(0.98);
    expect(record.provenance).toEqual(['regex:txn_amount']);
    expect(record.reviewState).toBe('none');

    const saved = await storage.getByMessageId('msg-1');
    expect(saved?.confidence).toBe(0.98);
    expect(saved?.provenance).toEqual(['regex:txn_amount']);
  });

  it('runs model fallback only when deterministic confidence/coverage is insufficient', async () => {
    let modelCalls = 0;
    const modelResult: FinancialExtractionResult = {
      extraction: {
        kind: 'statement',
      },
      method: 'llm',
      confidence: 0.61,
      provenance: ['model:fallback:statement'],
      parserVersion: '2026-03-11',
      ruleCoverage: 0.3,
    };

    const record = await parseFinancialMessage({
      messageId: 'msg-2',
      message: {
        subject: 'Your monthly statement is available',
        bodyText: 'Log in to review your account statement',
      },
      modelExtractor: async () => {
        modelCalls += 1;
        return modelResult;
      },
      now: () => '2026-03-12T00:01:00.000Z',
    });

    expect(modelCalls).toBe(1);
    expect(record.method).toBe('llm');
    expect(record.fallbackReason).toBe('low-deterministic-confidence');
  });

  it('persists confidence/provenance and marks low-confidence outputs for review', async () => {
    const storage = new InMemoryFinancialExtractionStorage();
    const record = await parseFinancialMessage({
      messageId: 'msg-3',
      message: {
        subject: 'hello',
        bodyText: 'unstructured content',
      },
      storage,
      modelExtractor: async () => ({
        extraction: {
          kind: 'unknown',
        },
        method: 'llm',
        confidence: 0.52,
        provenance: ['model:fallback'],
        parserVersion: '2026-03-11',
      }),
      now: () => '2026-03-12T00:02:00.000Z',
    });

    expect(record.reviewState).toBe('required');
    expect(record.confidence).toBe(0.52);
    expect(record.provenance).toEqual(['model:fallback']);

    const reviewQueue = await storage.listByReviewState('required');
    expect(reviewQueue.map((item) => item.messageId)).toContain('msg-3');
  });

  it('rejects malformed parser outputs that omit provenance before persistence', async () => {
    await expect(
      parseFinancialMessage({
        messageId: 'msg-4',
        message: {
          subject: 'hello',
          bodyText: 'no deterministic rules',
        },
        modelExtractor: async () => ({
          extraction: {
            kind: 'unknown',
          },
          method: 'llm',
          confidence: 0.52,
          provenance: [],
          parserVersion: '2026-03-11',
        }),
      })
    ).rejects.toBeInstanceOf(FinancialExtractionValidationError);

    await expect(
      parseFinancialMessage({
        messageId: 'msg-5',
        message: {
          subject: 'hello',
          bodyText: 'no deterministic rules',
        },
        modelExtractor: async () => ({
          extraction: {
            kind: 'unknown',
          },
          method: 'llm',
          confidence: 0.52,
          provenance: [],
          parserVersion: '2026-03-11',
        }),
      })
    ).rejects.toThrowError('financial extraction must include provenance');
  });

  it('accepts normalized mail model input and produces auditable extraction records', async () => {
    const normalized = validateNormalizedMailMessage({
      messageId: 'gmail_g1',
      providerMessageId: 'g1',
      mailbox: 'inbox',
      from: 'bank@example.com',
      to: ['user@example.com'],
      subject: 'Transaction alert',
      bodyText: 'Txn INR 120',
      receivedAt: '2026-03-12T00:03:00.000Z',
      hasAttachments: false,
    });

    const record = await parseFinancialMessage({
      messageId: normalized.messageId,
      message: normalized,
      now: () => '2026-03-12T00:03:10.000Z',
    });

    expect(record.method).toBe('deterministic');
    expect(record.extraction.amount).toBe(120);
    expect(record.extraction.currency).toBe('INR');
  });
});
