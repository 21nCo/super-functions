import { expect, test } from '@playwright/test';

test('Phase 11 React compounds run controller and DOM services in real browsers', async ({ page }, testInfo) => {
  await page.goto('/browser/index.html');
  await page.evaluate(() => window.__UIFN_PHASE11_REACT__.setup());
  await expect(page.locator('[role="dialog"]')).toBeVisible();
  expect(await page.evaluate(() => window.__UIFN_PHASE11_REACT__.state().portalInBody)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('[role="dialog"]')).toBeHidden();

  await expect(page.locator('[data-phase11-accordion-trigger]')).toBeVisible();
  await page.locator('[data-phase11-accordion-trigger]').click();
  await expect(page.locator('[data-phase11-accordion-trigger]')).toHaveAttribute('aria-expanded', 'true');

  const slider = page.locator('[data-phase11-slider]');
  const box = await slider.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width * 0.25, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.75, box!.y + box!.height / 2, { steps: 4 });
  await page.mouse.up();

  await page.getByRole('radio', { name: /4/ }).click();
  await expect(page.locator('input[name="rating"]')).toHaveValue('4');
  await page.locator('#phase11-form').evaluate((form: HTMLFormElement) => form.reset());
  await expect(page.locator('input[name="rating"]')).toHaveValue('2');

  const result = await page.evaluate(() => window.__UIFN_PHASE11_REACT__.finish());
  expect(result.accordionChanges).toBe(1);
  expect(result.sliderValue).toBeGreaterThan(60);
  expect(result.dialogOpen).toBe(false);
  expect(result.warnings).toEqual([]);
  await testInfo.attach('phase-11-react-result', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
});
