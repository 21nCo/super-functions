import { expect, test } from '@playwright/test';

const vectors = [
  ['DOM-001', ['UIFN_TABBABLE_INVALID', 'UIFN_ROOT_LISTENER_DUPLICATE']],
  ['DOM-002', ['UIFN_LAYER_OUTSIDE_CLASSIFICATION']],
  ['DOM-003', ['UIFN_FOCUS_SCOPE_ESCAPE', 'UIFN_FOCUS_RESTORE_FAILED']],
  ['DOM-004', ['UIFN_SCROLL_LOCK_NESTING', 'UIFN_MODAL_ISOLATION_STALE']],
  ['DOM-005', ['UIFN_POSITION_OUT_OF_BOUNDARY', 'UIFN_POSITION_OBSERVER_LEAK']],
  ['DOM-006', ['UIFN_PORTAL_HYDRATION_DUPLICATE']],
  ['DOM-007', ['UIFN_FORM_BRIDGE_DUPLICATE', 'UIFN_LIVE_REGION_STALE_MESSAGE']],
] as const;

for (const [vector, negativeCodes] of vectors) {
  test(`${vector} positive and controlled negative vectors`, async ({ page }, testInfo) => {
    await page.goto('/browser/index.html');
    const result = await page.evaluate((id) => window.__UIFN_DOM_HARNESS__.run(id), vector);
    expect(result.outcome).toBe('pass');
    expect(result.vectorId).toBe(`TV-${vector}-P/N`);
    expect(result.negativeCodes).toEqual(negativeCodes);
    expect(result.resources.total).toBe(0);
    await testInfo.attach(`${vector}-result`, {
      body: JSON.stringify(result, null, 2),
      contentType: 'application/json',
    });
    await page.screenshot({
      path: testInfo.outputPath(`${vector}.png`),
      fullPage: true,
    });
  });
}
