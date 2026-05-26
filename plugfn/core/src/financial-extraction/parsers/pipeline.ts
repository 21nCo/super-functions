import type { NormalizedMailMessage } from '../../mail/normalization.js';
import {
  type FinancialExtractionRecord,
  type FinancialExtractionResult,
  type FinancialParserMessage,
  type FinancialReviewState,
  createFinancialParserMessageFromNormalizedMail,
  validateFinancialExtractionRecord,
  validateFinancialExtractionResult,
  validateFinancialParserMessage,
} from '../types.js';
import {
  InMemoryFinancialExtractionStorage,
  type FinancialExtractionStorage,
} from '../storage.js';
import { parseFinancialDeterministically } from './deterministic.js';
import { runModelFallback } from './model-fallback.js';

const defaultStorage = new InMemoryFinancialExtractionStorage();

export interface FinancialParserPipelineInput {
  messageId: string;
  message: FinancialParserMessage | NormalizedMailMessage;
  storage?: FinancialExtractionStorage;
  modelExtractor?: (message: FinancialParserMessage) => Promise<FinancialExtractionResult>;
  now?: () => string;
  reviewThreshold?: number;
}

export async function parseFinancialMessage(
  input: FinancialParserPipelineInput
): Promise<FinancialExtractionRecord> {
  if (!input.messageId || input.messageId.trim().length === 0) {
    throw new Error('messageId is required');
  }

  const message = normalizePipelineMessage(input.message);
  const deterministicResult = parseFinancialDeterministically(message);
  const extractionResult = await runModelFallback({
    message,
    deterministicResult,
    modelExtractor: input.modelExtractor,
  });
  const validatedExtraction = validateFinancialExtractionResult(extractionResult);

  const reviewState = deriveReviewState(validatedExtraction.confidence, input.reviewThreshold ?? 0.8);
  const createdAt = (input.now ?? (() => new Date().toISOString()))();
  const record = validateFinancialExtractionRecord({
    ...validatedExtraction,
    messageId: input.messageId.trim(),
    createdAt,
    reviewState,
  });

  const storage = input.storage ?? defaultStorage;
  await storage.save(record);
  return record;
}

export async function parseFinancialMessages(
  inputs: FinancialParserPipelineInput[]
): Promise<FinancialExtractionRecord[]> {
  const output: FinancialExtractionRecord[] = [];
  for (const input of inputs) {
    output.push(await parseFinancialMessage(input));
  }
  return output;
}

function normalizePipelineMessage(
  message: FinancialParserMessage | NormalizedMailMessage
): FinancialParserMessage {
  if (isNormalizedMailMessage(message)) {
    return createFinancialParserMessageFromNormalizedMail(message);
  }
  return validateFinancialParserMessage(message);
}

function deriveReviewState(confidence: number, reviewThreshold: number): FinancialReviewState {
  return confidence < reviewThreshold ? 'required' : 'none';
}

function isNormalizedMailMessage(
  value: FinancialParserMessage | NormalizedMailMessage
): value is NormalizedMailMessage {
  return (
    typeof (value as NormalizedMailMessage).messageId === 'string' &&
    typeof (value as NormalizedMailMessage).providerMessageId === 'string' &&
    typeof (value as NormalizedMailMessage).mailbox === 'string'
  );
}
