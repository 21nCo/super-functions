import { expect, test } from '@playwright/test';

test('TV-PRIM-002-P/N overlay and modal browser matrix', async ({ page }, testInfo) => {
  await page.goto('/browser/index.html');
  const result = await page.evaluate(() => window.__UIFN_OVERLAY_HARNESS__.run());
  expect(result.outcome).toBe('pass');
  expect(result.primitives).toHaveLength(8);
  expect(result.negativeCodes).toEqual(['UIFN_ALERT_DIALOG_DISMISSAL', 'UIFN_ACCESSIBLE_NAME_MISSING']);
  expect(result.resourceTotals.every((total) => total === 0)).toBe(true);
  expect(result.traceKinds).toEqual(expect.arrayContaining([
    'dom-layer', 'dom-focus-scope', 'dom-modal', 'dom-portal', 'dom-position', 'dom-presence',
  ]));
  expect(result.nestedDismissal).toEqual([
    'menu:pointer-outside', 'popover:pointer-outside', 'dialog:pointer-outside',
  ]);
  await testInfo.attach('TV-PRIM-002-result', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  });
  await page.screenshot({ path: testInfo.outputPath('TV-PRIM-002.png'), fullPage: true });
});
