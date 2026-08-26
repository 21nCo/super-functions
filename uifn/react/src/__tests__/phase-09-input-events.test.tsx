import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UIFnPartEvent } from '@uifn/core';
import { toReactPartProps } from '../core-props';

describe('React Phase 09 input event bridge', () => {
  it('forwards native input, composition, clipboard, value, and caret data with React event names', () => {
    const received: UIFnPartEvent[] = [];
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const props = toReactPartProps({
      attributes: { maxlength: 8, autocomplete: 'one-time-code' },
      on: {
        input: (event) => event && received.push(event),
        compositionend: (event) => event && received.push(event),
        paste: (event) => event && received.push(event),
      },
    });

    render(<input aria-label="phase-09-react-input" {...props} />);
    const input = screen.getByLabelText('phase-09-react-input') as HTMLInputElement;
    input.setSelectionRange(2, 2);
    fireEvent.input(input, { target: { value: '東京' }, inputType: 'insertText' });
    fireEvent.compositionEnd(input, { data: '東京' });
    fireEvent.paste(input, { clipboardData: { getData: () => '貼付' } });

    expect(input.maxLength).toBe(8);
    expect(input.autocomplete).toBe('one-time-code');
    expect(received.map((event) => event.type)).toEqual(['input', 'compositionend', 'paste']);
    expect(received[0]).toMatchObject({ value: '東京', inputType: 'insertText' });
    expect(received[1]).toMatchObject({ data: '東京', value: '東京' });
    expect(received[2]).toMatchObject({ data: '貼付', value: '東京' });
    expect(received.every((event) => event.currentTarget === input)).toBe(true);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('normalizes SVG progress attributes without React DOM warnings', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const props = toReactPartProps({ attributes: { 'stroke-dashoffset': 65 } });

    const { container } = render(<svg aria-label="phase-10-progress-circle" {...props} />);

    expect(container.querySelector('svg')).toHaveAttribute('stroke-dashoffset', '65');
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('preserves an explicit React label target over a generated core for attribute', () => {
    const props = toReactPartProps(
      { attributes: { for: 'generated-control' } },
      { htmlFor: 'native-input' },
    );

    render(
      <>
        <label {...props}>Work email</label>
        <input id="native-input" />
      </>,
    );

    expect(screen.getByLabelText('Work email')).toHaveAttribute('id', 'native-input');
  });

  it('does not forward descendant focus or blur to an ancestor core part handler', () => {
    const coreFocus = vi.fn();
    const coreBlur = vi.fn();
    const userFocus = vi.fn();
    const userBlur = vi.fn();
    const props = toReactPartProps(
      { on: { focus: coreFocus, blur: coreBlur } },
      { onFocus: userFocus, onBlur: userBlur },
    );

    render(
      <div data-testid="focus-owner" {...props}>
        <button type="button">Nested focus target</button>
      </div>,
    );
    const owner = screen.getByTestId('focus-owner');
    const nested = screen.getByRole('button', { name: 'Nested focus target' });

    fireEvent.focus(nested);
    fireEvent.blur(nested);
    expect(coreFocus).not.toHaveBeenCalled();
    expect(coreBlur).not.toHaveBeenCalled();
    expect(userFocus).toHaveBeenCalledTimes(1);
    expect(userBlur).toHaveBeenCalledTimes(1);

    fireEvent.focus(owner);
    fireEvent.blur(owner);
    expect(coreFocus).toHaveBeenCalledTimes(1);
    expect(coreBlur).toHaveBeenCalledTimes(1);
  });
});
