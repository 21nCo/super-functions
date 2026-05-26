import { z } from 'zod';
import type { NormalizedMailMessage } from '../mail/normalization.js';

export const FINANCIAL_EXTRACTION_PARSER_VERSION = '2026-03-11';

export const FinancialMessageKindSchema = z.enum([
  'statement',
  'transaction-alert',
  'invoice',
  'receipt',
  'unknown',
]);

export type FinancialMessageKind = z.infer<typeof FinancialMessageKindSchema>;

export const FinancialParserMethodSchema = z.enum(['deterministic', 'llm']);
export type FinancialParserMethod = z.infer<typeof FinancialParserMethodSchema>;

export const FinancialParserMessageSchema = z.object({
  subject: z.string().optional(),
  bodyText: z.string().optional(),
  bodyHtml: z.string().optional(),
  from: z.string().optional(),
  receivedAt: z.string().datetime({ offset: true }).optional(),
});

export type FinancialParserMessage = z.infer<typeof FinancialParserMessageSchema>;

export const FinancialExtractionSchema = z.object({
  kind: FinancialMessageKindSchema,
  amount: z.number().positive().optional(),
  currency: z.string().length(3).optional(),
  merchant: z.string().min(1).optional(),
  invoiceId: z.string().min(1).optional(),
  dueDate: z.string().datetime({ offset: true }).optional(),
  transactionAt: z.string().datetime({ offset: true }).optional(),
  statementPeriodStart: z.string().datetime({ offset: true }).optional(),
  statementPeriodEnd: z.string().datetime({ offset: true }).optional(),
});

export type FinancialExtraction = z.infer<typeof FinancialExtractionSchema>;

export const FinancialExtractionResultSchema = z.object({
  extraction: FinancialExtractionSchema,
  method: FinancialParserMethodSchema,
  confidence: z.number().min(0).max(1),
  provenance: z.array(z.string().min(1)).min(1),
  parserVersion: z.string().min(1).default(FINANCIAL_EXTRACTION_PARSER_VERSION),
  ruleCoverage: z.number().min(0).max(1).optional(),
  fallbackReason: z.string().min(1).optional(),
});

export type FinancialExtractionResult = z.infer<typeof FinancialExtractionResultSchema>;

export const FinancialReviewStateSchema = z.enum(['none', 'required']);
export type FinancialReviewState = z.infer<typeof FinancialReviewStateSchema>;

export const FinancialExtractionRecordSchema = FinancialExtractionResultSchema.extend({
  messageId: z.string().min(1),
  createdAt: z.string().datetime({ offset: true }),
  reviewState: FinancialReviewStateSchema,
});

export type FinancialExtractionRecord = z.infer<typeof FinancialExtractionRecordSchema>;

export class FinancialExtractionValidationError extends Error {
  readonly code = 'VALIDATION_ERROR';
  readonly status = 400;
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = 'FinancialExtractionValidationError';
    this.field = field;
  }
}

export function validateFinancialParserMessage(input: unknown): FinancialParserMessage {
  const parsed = FinancialParserMessageSchema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path?.join('.') || undefined;
    throw new FinancialExtractionValidationError('invalid financial parser message', field);
  }
  return parsed.data;
}

export function validateFinancialExtractionResult(input: unknown): FinancialExtractionResult {
  const value = input as Record<string, unknown>;
  if (!Array.isArray(value?.provenance) || value.provenance.length === 0) {
    throw new FinancialExtractionValidationError('financial extraction must include provenance', 'provenance');
  }
  if (typeof value?.confidence !== 'number') {
    throw new FinancialExtractionValidationError('financial extraction must include confidence', 'confidence');
  }

  const parsed = FinancialExtractionResultSchema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path?.join('.') || undefined;
    throw new FinancialExtractionValidationError('invalid financial extraction result', field);
  }
  return parsed.data;
}

export function validateFinancialExtractionRecord(input: unknown): FinancialExtractionRecord {
  const parsed = FinancialExtractionRecordSchema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path?.join('.') || undefined;
    throw new FinancialExtractionValidationError('invalid financial extraction record', field);
  }
  return parsed.data;
}

export function createFinancialParserMessageFromNormalizedMail(
  message: NormalizedMailMessage
): FinancialParserMessage {
  return {
    subject: message.subject,
    bodyText: message.bodyText,
    bodyHtml: message.bodyHtml,
    from: message.from,
    receivedAt: message.receivedAt,
  };
}
