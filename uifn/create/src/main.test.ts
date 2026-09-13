// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';

vi.mock('react-dom/client', () => ({ createRoot: () => ({ render: vi.fn(), unmount: vi.fn() }) }));

it('ignores injected mode and viewport attributes and renders valid controls and output', async () => {
  document.body.innerHTML = '<div id="app"></div>';
  await import('./main');
  const frame = () => document.querySelector<HTMLElement>('.preview-frame')!;
  const attack = document.createElement('button');
  attack.dataset.mode = '\"><img src=x onerror=alert(1)>';
  attack.dataset.viewport = '__proto__';
  document.body.append(attack);
  attack.click();
  expect(frame().dataset.mode).toBe('light');
  expect(frame().style.width).toBe('1120px');
  expect(document.querySelector('img')).toBeNull();
  document.querySelector<HTMLButtonElement>('button[data-mode="dark"]')!.click();
  document.querySelector<HTMLButtonElement>('button[data-viewport="mobile"]')!.click();
  expect(frame().dataset.mode).toBe('dark');
  expect(frame().style.width).toBe('390px');
  const output = document.querySelector('[data-output="init"]')!;
  expect(output.textContent).toContain('uifn');
  expect(output.children).toHaveLength(0);
  expect(document.querySelector('[data-output="applyFont"]')!.textContent).toContain('--only font');
  expect(document.querySelector('style')!.textContent).toContain('--uifn');
});
