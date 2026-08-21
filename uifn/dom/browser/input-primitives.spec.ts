import { expect, test } from '@playwright/test';

test('selection and input primitives preserve native form, IME, security, and touch semantics', async ({ page }, testInfo) => {
  await page.goto('/browser/index.html');
  const result = await page.evaluate(() => window.__UIFN_INPUT_HARNESS__.run());
  expect(result.outcome).toBe('pass');
  expect(result.vectorId).toBe('TV-PRIM-004-P/N+TV-PRIM-005-P/N');
  expect(result.formData).toEqual(['city:27', '2,0']);
  expect(result.validity).toEqual([false, true]);
  expect(result.capabilityErrors).toEqual(['UIFN_CLIPBOARD_DENIED', 'UIFN_FILE_REJECTED']);
  expect(result.redaction).toEqual({ password: true, pin: true, files: true });
  expect(result.resourceTotal).toBe(0);
  await testInfo.attach('phase-09-input-result', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  });
  await page.screenshot({ path: testInfo.outputPath('phase-09-input.png'), fullPage: true });
});
