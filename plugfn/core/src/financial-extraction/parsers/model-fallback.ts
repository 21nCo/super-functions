import {
  FINANCIAL_EXTRACTION_PARSER_VERSION,
  type FinancialExtractionResult,
  type FinancialParserMessage,
  validateFinancialExtractionResult,
  validateFinancialParserMessage,
} from '../types.js';

export interface ModelFallbackInput {
  message: FinancialParserMessage;
  deterministicResult: FinancialExtractionResult | null;
  modelExtractor?: (message: FinancialParserMessage) => Promise<FinancialExtractionResult>;
  minDeterministicConfidence?: number;
  minRuleCoverage?: number;
}

export function shouldTriggerModelFallback(
  deterministicResult: FinancialExtractionResult | null,
  minDeterministicConfidence = 0.8,
  minRuleCoverage = 0.6
): boolean {
  if (!deterministicResult) {
    return true;
  }
  const ruleCoverage = deterministicResult.ruleCoverage ?? 0;
  return (
    deterministicResult.confidence < minDeterministicConfidence || ruleCoverage < minRuleCoverage
  );
}

export async function runModelFallback(
  input: ModelFallbackInput
): Promise<FinancialExtractionResult> {
  const message = validateFinancialParserMessage(input.message);
  const minDeterministicConfidence = input.minDeterministicConfidence ?? 0.8;
  const minRuleCoverage = input.minRuleCoverage ?? 0.6;
  const shouldFallback = shouldTriggerModelFallback(
    input.deterministicResult,
    minDeterministicConfidence,
    minRuleCoverage
  );

  if (!shouldFallback && input.deterministicResult) {
    return validateFinancialExtractionResult(input.deterministicResult);
  }

  const fallbackReason = resolveFallbackReason(
    input.deterministicResult,
    minDeterministicConfidence,
    minRuleCoverage
  );
  const extracted =
    (await input.modelExtractor?.(message)) ??
    buildDefaultModelExtraction(message, fallbackReason);

  const validated = validateFinancialExtractionResult(extracted);
  return {
    ...validated,
    method: 'llm',
    fallbackReason,
    parserVersion: validated.parserVersion || FINANCIAL_EXTRACTION_PARSER_VERSION,
  };
}

function resolveFallbackReason(
  deterministicResult: FinancialExtractionResult | null,
  minDeterministicConfidence: number,
  minRuleCoverage: number
): string {
  if (!deterministicResult) {
    return 'no-deterministic-match';
  }
  if (deterministicResult.confidence < minDeterministicConfidence) {
    return 'low-deterministic-confidence';
  }
  const ruleCoverage = deterministicResult.ruleCoverage ?? 0;
  if (ruleCoverage < minRuleCoverage) {
    return 'low-deterministic-coverage';
  }
  return 'fallback-not-required';
}

function buildDefaultModelExtraction(
  message: FinancialParserMessage,
  fallbackReason: string
): FinancialExtractionResult {
  const text = `${message.subject ?? ''}\n${message.bodyText ?? ''}\n${message.bodyHtml ?? ''}`;
  const amountMatch = text.match(/\b([A-Z]{3})\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
  const amount = amountMatch?.[2] ? Number(amountMatch[2].replace(/,/g, '')) : undefined;
  const currency = amountMatch?.[1]?.toUpperCase();

  return {
    extraction: {
      kind: amount ? 'transaction-alert' : 'unknown',
      amount: amount && Number.isFinite(amount) ? amount : undefined,
      currency,
    },
    method: 'llm',
    confidence: 0.52,
    provenance: ['model:fallback'],
    parserVersion: FINANCIAL_EXTRACTION_PARSER_VERSION,
    ruleCoverage: 0.25,
    fallbackReason,
  };
}
