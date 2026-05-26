import { describe, expect, it } from 'vitest';
import { parseFinancialDeterministically } from '../../src/financial-extraction/parsers/deterministic.js';
import { parseFinancialMessage } from '../../src/financial-extraction/parsers/pipeline.js';
import {
  FinancialExtractionValidationError,
  validateFinancialExtractionResult,
} from '../../src/financial-extraction/types.js';

describe('financial extraction parser vectors', () => {
  it('TV-MAIL-PARSER-POS: deterministic parser runs first and records confidence/provenance', async () => {
    const result = await parseFinancialMessage({
      messageId: 'tv-mail-parser-pos',
      message: {
        subject: 'Your bank statement',
        bodyText: 'Txn INR 450',
      },
      now: () => '2026-03-12T00:10:00.000Z',
    });

    expect(result).toMatchObject({
      extraction: {
        amount: 450,
        currency: 'INR',
      },
      method: 'deterministic',
      confidence: 0.98,
      provenance: ['regex:txn_amount'],
      reviewState: 'none',
    });
  });

  it('TV-MAIL-PARSER-NEG: output without provenance is rejected', () => {
    expect(() =>
      validateFinancialExtractionResult({
        extraction: {
          kind: 'transaction-alert',
          amount: 450,
        },
        method: 'llm',
        confidence: 0.52,
        provenance: [],
      })
    ).toThrowError(FinancialExtractionValidationError);

    expect(() =>
      validateFinancialExtractionResult({
        extraction: {
          kind: 'transaction-alert',
          amount: 450,
        },
        method: 'llm',
        confidence: 0.52,
        provenance: [],
      })
    ).toThrowError('financial extraction must include provenance');
  });

  it('parses invoice messages with deterministic rules', () => {
    const result = parseFinancialDeterministically({
      subject: 'Invoice INV-778 issued',
      bodyText: 'Amount due USD 1200 by 2026-03-31',
    });

    expect(result).not.toBeNull();
    expect(result?.extraction.kind).toBe('invoice');
    expect(result?.extraction.invoiceId).toBe('INV-778');
    expect(result?.extraction.amount).toBe(1200);
    expect(result?.extraction.currency).toBe('USD');
  });

  it('parses receipt messages with deterministic rules', () => {
    const result = parseFinancialDeterministically({
      subject: 'Receipt from Coffee Shop',
      bodyText: 'Total paid USD 45.67',
    });

    expect(result).not.toBeNull();
    expect(result?.extraction.kind).toBe('receipt');
    expect(result?.extraction.amount).toBe(45.67);
    expect(result?.extraction.currency).toBe('USD');
  });

  it('parses statement messages with deterministic rules', () => {
    const result = parseFinancialDeterministically({
      subject: 'Your monthly bank statement',
      bodyText: 'Statement period is now available.',
    });

    expect(result).not.toBeNull();
    expect(result?.extraction.kind).toBe('statement');
    expect(result?.method).toBe('deterministic');
    expect(result?.provenance).toEqual(['regex:statement_marker']);
  });
});
