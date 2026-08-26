import { writable } from 'svelte/store';
import {
  copyTextToClipboard,
  type CopyToClipboardError,
  type CopyToClipboardOptions,
  type CopyToClipboardResult,
} from '@uifn/dom';

export type CopyToClipboardStatus = 'idle' | 'success' | 'error';
export type UseCopyToClipboardOptions = CopyToClipboardOptions;

export interface CopyToClipboardActionOptions extends UseCopyToClipboardOptions {
  text?: string | (() => string);
  onResult?: (result: CopyToClipboardResult) => void;
}

function resolveActionText(text: string | (() => string) | undefined, node: HTMLElement): string {
  return typeof text === 'function' ? text() : text ?? node.textContent ?? '';
}

export function createCopyToClipboard(options: UseCopyToClipboardOptions = {}) {
  const status = writable<CopyToClipboardStatus>('idle');
  const copiedText = writable<string | null>(null);
  const error = writable<CopyToClipboardError | null>(null);
  async function copy(text: string): Promise<CopyToClipboardResult> {
    const result = await copyTextToClipboard(text, options);
    copiedText.set(result.ok ? result.text : null);
    error.set(result.error);
    status.set(result.ok ? 'success' : 'error');
    return result;
  }
  function reset(): void {
    status.set('idle');
    copiedText.set(null);
    error.set(null);
  }
  return { status, copiedText, error, copy, reset };
}

export const useCopyToClipboard = createCopyToClipboard;

export function copyToClipboardAction(node: HTMLElement, options: CopyToClipboardActionOptions = {}) {
  let currentOptions = options;
  const handleClick = async () => {
    const result = await copyTextToClipboard(resolveActionText(currentOptions.text, node), currentOptions);
    currentOptions.onResult?.(result);
  };
  node.addEventListener('click', handleClick);
  return {
    update(nextOptions: CopyToClipboardActionOptions = {}) {
      currentOptions = nextOptions;
    },
    destroy() {
      node.removeEventListener('click', handleClick);
    },
  };
}
