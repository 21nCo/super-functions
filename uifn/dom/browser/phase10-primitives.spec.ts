import { expect, test } from '@playwright/test';

test('Phase 10 real pointer, mobile touch, locale, status, announcement, and lifecycle matrix', async ({ page }, testInfo) => {
  await page.goto('/browser/index.html');
  const rect = await page.evaluate(() => window.__UIFN_PHASE10_HARNESS__.setup({ zoom: 2 }));
  await page.mouse.move(rect.left + rect.width * 0.75, rect.top + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.left + rect.width * 0.25, rect.top + rect.height / 2, { steps: 4 });
  await page.mouse.up();
  let state = await page.evaluate(() => window.__UIFN_PHASE10_HARNESS__.state());
  expect(state.starts).toContain('mouse');
  expect(state.moves).toBeGreaterThan(0);
  expect(state.ends).toBeGreaterThan(0);
  expect(state.value[0]).toBeGreaterThanOrEqual(70);
  expect(state.touchAction).toBe('pan-y');

  await page.mouse.move(rect.left + rect.width / 2, rect.top + rect.height / 2);
  await page.mouse.down();
  await page.evaluate(() => window.__UIFN_PHASE10_HARNESS__.releaseCapture());
  await page.waitForTimeout(20);
  await page.mouse.up();
  state = await page.evaluate(() => window.__UIFN_PHASE10_HARNESS__.terminal());
  expect(state.cancellations.some((entry) => entry.endsWith(':lostpointercapture'))).toBe(true);
  expect(state.cancellations).toContain('73:pointercancel');
  expect(state.activePointerIds).toEqual([]);

  if (testInfo.project.name.startsWith('mobile-')) {
    await page.locator('#phase10-track').tap({ position: { x: 10, y: 10 } });
    state = await page.evaluate(() => window.__UIFN_PHASE10_HARNESS__.state());
    expect(state.starts).toContain('touch');
  }

  state = await page.evaluate(() => window.__UIFN_PHASE10_HARNESS__.keyboard());
  expect(state.keyboard.after).toBe(state.keyboard.before - 1);
  const liveRegion = await page.evaluate(() => window.__UIFN_PHASE10_HARNESS__.liveRegion());
  expect(liveRegion).toEqual(expect.objectContaining({ deduped: true, publishCount: 1 }));
  const result = await page.evaluate((live) => window.__UIFN_PHASE10_HARNESS__.finish(live), liveRegion);
  expect(result.outcome).toBe('pass');
  expect(result.locale).toEqual(expect.objectContaining({ calendar: 'japanese', timeZone: 'Asia/Tokyo', grid: 42, roundTripError: 0 }));
  expect(result.status).toEqual(expect.objectContaining({ meterRole: 'meter', meterState: 'critical', progressRole: 'progressbar', indeterminate: true, stepCurrent: 'step', toastVisible: 1, toastQueued: 1, toastPaused: true }));
  expect(result.resources).toBe(0);
  expect(result.touchActionRestored).toBe(true);
  await testInfo.attach('phase-10-result', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  await page.screenshot({ path: testInfo.outputPath('phase-10.png'), fullPage: true });
});
