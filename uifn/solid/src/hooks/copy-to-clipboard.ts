import { createSignal, type Accessor } from 'solid-js';
import {
  copyTextToClipboard,
  type CopyToClipboardError,
  type CopyToClipboardOptions,
  type CopyToClipboardResult,
} from '@uifn/dom';

export type CopyToClipboardStatus = 'idle' | 'success' | 'error';
export type UseCopyToClipboardOptions = CopyToClipboardOptions;

export interface CopyToClipboardApi {
  status: Accessor<CopyToClipboardStatus>;
  copiedText: Accessor<string | null>;
  error: Accessor<CopyToClipboardError | null>;
  copy: (text: string) => Promise<CopyToClipboardResult>;
  reset: () => void;
}

export function createCopyToClipboard(options: UseCopyToClipboardOptions = {}): CopyToClipboardApi {
  const [status, setStatus] = createSignal<CopyToClipboardStatus>('idle');
  const [copiedText, setCopiedText] = createSignal<string | null>(null);
  const [error, setError] = createSignal<CopyToClipboardError | null>(null);

  async function copy(text: string): Promise<CopyToClipboardResult> {
    const result = await copyTextToClipboard(text, options);
    setCopiedText(result.ok ? result.text : null);
    setError(result.error);
    setStatus(result.ok ? 'success' : 'error');
    return result;
  }

  function reset(): void {
    setStatus('idle');
    setCopiedText(null);
    setError(null);
  }

  return { status, copiedText, error, copy, reset };
}

export const useCopyToClipboard = createCopyToClipboard;
