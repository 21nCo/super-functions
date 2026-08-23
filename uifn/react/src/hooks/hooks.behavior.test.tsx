import * as React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { HookEnvironment, MediaQueryChangeLike } from '@uifn/dom';
import { useCopyToClipboard } from './use-copy-to-clipboard';
import { useMediaQuery } from './use-media-query';

function createMediaEnvironment(initialMatches: boolean) {
  const listeners = new Set<(event: MediaQueryChangeLike) => void>();
  const queryList = {
    matches: initialMatches,
    addEventListener: vi.fn((_type: 'change', listener: (event: MediaQueryChangeLike) => void) => {
      listeners.add(listener);
    }),
    removeEventListener: vi.fn((_type: 'change', listener: (event: MediaQueryChangeLike) => void) => {
      listeners.delete(listener);
    }),
  };
  const environment: HookEnvironment = {
    matchMedia: vi.fn(() => queryList),
  };

  return {
    environment,
    queryList,
    emit(matches: boolean) {
      queryList.matches = matches;
      listeners.forEach((listener) => listener({ matches }));
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

function MediaProbe({
  environment,
  defaultValue,
}: {
  environment: HookEnvironment;
  defaultValue?: boolean;
}) {
  const matches = useMediaQuery('(min-width: 768px)', { defaultValue, environment });
  return <output data-testid="matches">{String(matches)}</output>;
}

function ClipboardProbe({
  environment,
  text = 'copy me',
}: {
  environment: HookEnvironment;
  text?: string;
}) {
  const clipboard = useCopyToClipboard({ environment });
  return (
    <div>
      <button type="button" onClick={() => void clipboard.copy(text)}>
        Copy
      </button>
      <button type="button" onClick={clipboard.reset}>
        Reset
      </button>
      <output data-testid="status">{clipboard.status}</output>
      <output data-testid="copied">{clipboard.copiedText ?? ''}</output>
      <output data-testid="error">{clipboard.error?.code ?? ''}</output>
    </div>
  );
}

describe('React hook equivalents', () => {
  it('uses the configured media-query fallback without matchMedia access', () => {
    render(<MediaProbe environment={{}} defaultValue />);

    expect(screen.getByTestId('matches')).toHaveTextContent('true');
  });

  it('subscribes to media-query changes and removes the listener on unmount', async () => {
    const media = createMediaEnvironment(false);
    const { unmount } = render(<MediaProbe environment={media.environment} />);

    expect(screen.getByTestId('matches')).toHaveTextContent('false');
    expect(media.queryList.addEventListener).toHaveBeenCalledTimes(1);
    expect(media.listenerCount()).toBe(1);

    React.act(() => media.emit(true));

    await waitFor(() => expect(screen.getByTestId('matches')).toHaveTextContent('true'));

    unmount();
    expect(media.queryList.removeEventListener).toHaveBeenCalledTimes(1);
    expect(media.listenerCount()).toBe(0);
  });

  it('reports unavailable, rejected, successful, and reset clipboard states', async () => {
    const { rerender } = render(<ClipboardProbe environment={{}} text="missing" />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'));
    expect(screen.getByTestId('error')).toHaveTextContent('clipboard-unavailable');

    const rejectedWrite = vi.fn(async () => {
      throw new Error('denied');
    });
    rerender(<ClipboardProbe environment={{ clipboard: { writeText: rejectedWrite } }} text="denied" />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('clipboard-write-failed'));
    expect(rejectedWrite).toHaveBeenCalledWith('denied');

    const successfulWrite = vi.fn(async () => undefined);
    rerender(<ClipboardProbe environment={{ clipboard: { writeText: successfulWrite } }} text="copied" />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('success'));
    expect(screen.getByTestId('copied')).toHaveTextContent('copied');

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByTestId('status')).toHaveTextContent('idle');
    expect(screen.getByTestId('copied')).toHaveTextContent('');
    expect(screen.getByTestId('error')).toHaveTextContent('');
  });
});
