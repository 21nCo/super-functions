import { expect, test } from '@playwright/test';

test('TV-PRIM-003-P/N navigation browser matrix', async ({ page }, testInfo) => {
  await page.goto('/browser/index.html');
  const result = await page.evaluate(() => window.__UIFN_NAVIGATION_HARNESS__.run());
  expect(result.outcome).toBe('pass');
  expect(result.primitives).toEqual(['ContextMenu', 'Menu', 'Menubar', 'NavigationMenu', 'Pagination', 'Tabs', 'TreeView']);
  expect(result.submenu).toEqual(['keyboard-open', 'keyboard-return', 'pointer-grace-preserved', 'pointer-grace-closed']);
  expect(result.touch).toEqual(['long-press-open']);
  expect(result.negativeCodes).toEqual(['UIFN_KEYBOARD_MODEL_DIVERGED']);
  expect(result.resourceTotals.every((total) => total === 0)).toBe(true);
  expect(result.keyboard.Menubar).toEqual(expect.objectContaining({ rtlArrowDown: 'open-first' }));
  expect(result.dynamicRepair).toEqual(expect.objectContaining({ Menubar: 'file', Pagination: '2', Tabs: 'a', TreeView: 'blog' }));
  await testInfo.attach('TV-PRIM-003-result', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  await page.screenshot({ path: testInfo.outputPath('TV-PRIM-003.png'), fullPage: true });
});
