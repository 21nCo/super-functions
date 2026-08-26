import * as React from 'react';
import {
  copyTextToClipboard,
  type CopyToClipboardError,
  type CopyToClipboardOptions,
  type CopyToClipboardResult,
} from '@uifn/dom';

export type CopyToClipboardStatus = 'idle' | 'success' | 'error';
export type UseCopyToClipboardOptions = CopyToClipboardOptions;

export interface UseCopyToClipboardReturn {
  status: CopyToClipboardStatus;
  copiedText: string | null;
  error: CopyToClipboardError | null;
  copy: (text: string) => Promise<CopyToClipboardResult>;
  reset: () => void;
}

export function useCopyToClipboard(options: UseCopyToClipboardOptions = {}): UseCopyToClipboardReturn {
  const [status, setStatus] = React.useState<CopyToClipboardStatus>('idle');
  const [copiedText, setCopiedText] = React.useState<string | null>(null);
  const [error, setError] = React.useState<CopyToClipboardError | null>(null);

  const copy = React.useCallback(
    async (text: string) => {
      const result = await copyTextToClipboard(text, options);
      setCopiedText(result.ok ? result.text : null);
      setError(result.error);
      setStatus(result.ok ? 'success' : 'error');
      return result;
    },
    [options.environment]
  );

  const reset = React.useCallback(() => {
    setStatus('idle');
    setCopiedText(null);
    setError(null);
  }, []);

  return {
    status,
    copiedText,
    error,
    copy,
    reset,
  };
}
