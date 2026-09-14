import { expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createSecurityScanner } from '../scanner/scanner.js';
vi.mock('node:fs/promises', () => ({ stat: vi.fn(async () => ({ size: 1000 })), readFile: vi.fn() }));
it('skips oversized files before reading their contents', async () => {
  expect(await createSecurityScanner({ maxFileSize: 10 }).scanFile('large')).toEqual([]);
  expect(readFile).not.toHaveBeenCalled();
});
