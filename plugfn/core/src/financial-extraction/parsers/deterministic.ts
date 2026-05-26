import {
  FINANCIAL_EXTRACTION_PARSER_VERSION,
  type FinancialExtractionResult,
  type FinancialParserMessage,
  validateFinancialParserMessage,
} from '../types.js';

const TRANSACTION_REGEX = /\btxn\b[\s:-]*([A-Z]{3}|\$|₹|€|£)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i;
const TRANSACTION_ALT_REGEX =
  /\btransaction\b[\s:-]*([A-Z]{3}|\$|₹|€|£)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i;
const INVOICE_ID_REGEX = /\binvoice(?:\s*(?:id|#|no\.?)\s*)?\s*([A-Z0-9-]{3,})/i;
const INVOICE_AMOUNT_REGEX =
  /\b(?:amount due|due amount|invoice total)\b[\s:]*([A-Z]{3}|\$|₹|€|£)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i;
const RECEIPT_TOTAL_REGEX =
  /\b(?:total paid|amount paid|total)\b[\s:]*([A-Z]{3}|\$|₹|€|£)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i;

export function parseFinancialDeterministically(
  message: FinancialParserMessage
): FinancialExtractionResult | null {
  const normalized = validateFinancialParserMessage(message);
  const subject = normalized.subject ?? '';
  const bodyText = normalized.bodyText ?? '';
  const bodyHtml = normalized.bodyHtml ?? '';
  const joinedText = `${subject}\n${bodyText}\n${bodyHtml}`;

  const transactionMatch = joinedText.match(TRANSACTION_REGEX) ?? joinedText.match(TRANSACTION_ALT_REGEX);
  if (transactionMatch?.[1] && transactionMatch[2]) {
    const amount = parseAmount(transactionMatch[2]);
    if (amount !== undefined) {
      return {
        extraction: {
          kind: 'transaction-alert',
          amount,
          currency: normalizeCurrency(transactionMatch[1]),
          transactionAt: normalized.receivedAt,
        },
        method: 'deterministic',
        confidence: 0.98,
        provenance: ['regex:txn_amount'],
        parserVersion: FINANCIAL_EXTRACTION_PARSER_VERSION,
        ruleCoverage: 1,
      };
    }
  }

  if (/\binvoice\b/i.test(joinedText)) {
    const invoiceId = joinedText.match(INVOICE_ID_REGEX)?.[1];
    const amountMatch = joinedText.match(INVOICE_AMOUNT_REGEX);
    const amount = amountMatch?.[2] ? parseAmount(amountMatch[2]) : undefined;
    const currency = amountMatch?.[1] ? normalizeCurrency(amountMatch[1]) : undefined;

    return {
      extraction: {
        kind: 'invoice',
        invoiceId,
        amount,
        currency,
      },
      method: 'deterministic',
      confidence: 0.93,
      provenance: ['regex:invoice_marker', 'regex:invoice_amount'],
      parserVersion: FINANCIAL_EXTRACTION_PARSER_VERSION,
      ruleCoverage: amount !== undefined ? 0.9 : 0.65,
    };
  }

  if (/\breceipt\b|\bpayment received\b/i.test(joinedText)) {
    const amountMatch = joinedText.match(RECEIPT_TOTAL_REGEX);
    const amount = amountMatch?.[2] ? parseAmount(amountMatch[2]) : undefined;
    const currency = amountMatch?.[1] ? normalizeCurrency(amountMatch[1]) : undefined;

    return {
      extraction: {
        kind: 'receipt',
        amount,
        currency,
      },
      method: 'deterministic',
      confidence: amount !== undefined ? 0.9 : 0.76,
      provenance: ['regex:receipt_marker', 'regex:receipt_total'],
      parserVersion: FINANCIAL_EXTRACTION_PARSER_VERSION,
      ruleCoverage: amount !== undefined ? 0.82 : 0.58,
    };
  }

  if (/\bstatement\b|\bbank statement\b/i.test(joinedText)) {
    return {
      extraction: {
        kind: 'statement',
      },
      method: 'deterministic',
      confidence: 0.74,
      provenance: ['regex:statement_marker'],
      parserVersion: FINANCIAL_EXTRACTION_PARSER_VERSION,
      ruleCoverage: 0.5,
    };
  }

  return null;
}

function parseAmount(value: string): number | undefined {
  const normalized = value.replace(/,/g, '').trim();
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

function normalizeCurrency(value: string): string {
  const trimmed = value.trim().toUpperCase();
  if (trimmed === '$') {
    return 'USD';
  }
  if (trimmed === '₹') {
    return 'INR';
  }
  if (trimmed === '€') {
    return 'EUR';
  }
  if (trimmed === '£') {
    return 'GBP';
  }
  return trimmed;
}
