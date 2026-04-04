import { expect, test } from '@playwright/test';
import { documentedTestIds, resetDemoScenario } from '../../shared/src/e2e/helpers.js';

const ids = documentedTestIds();
const clientBaseUrl = 'http://localhost:4015';
const serverBaseUrl = 'http://127.0.0.1:4315';

test.beforeEach(async () => {
  const reset = await resetDemoScenario(serverBaseUrl, 'baseline');
  expect(reset.ok).toBe(true);
  expect(reset.data.seeded).toBe(true);
});

test('covers lookup, wrong-authority rejection, and correct-authority continuation', async ({ page }) => {
  await page.goto(clientBaseUrl);

  await expect(page.getByTestId(ids.regionUsRuntimePanel)).toContainText('us-east-1');
  await expect(page.getByTestId(ids.regionUsRuntimePanel)).toContainText('http://127.0.0.1:4315');
  await expect(page.getByTestId(ids.regionEuRuntimePanel)).toContainText('eu-west-1');
  await expect(page.getByTestId(ids.regionEuRuntimePanel)).toContainText('4316');

  await page.getByTestId(ids.regionLookupIdentifierInput).fill('ada@example.com');
  await page.getByTestId(ids.regionLookupSubmitButton).click();
  await expect(page.getByTestId(ids.regionLookupResultPanel)).toContainText('eu-west-1');
  await expect(page.getByTestId(ids.regionLookupResultPanel)).toContainText('http://localhost:4316');
  await expect(page.getByTestId(ids.regionLookupResultPanel)).toContainText('"continueLocally": false');

  await page.getByTestId(ids.regionWrongAuthorityButton).click();
  await expect(page.getByTestId(ids.authErrorPanel)).toContainText('AUTHFN_REGION_MISMATCH');
  await expect(page.getByTestId(ids.authErrorPanel)).toContainText('http://localhost:4316');

  await page.getByTestId(ids.regionCorrectAuthorityButton).click();
  await expect(page.getByTestId(ids.authStatePanel)).toContainText('ada@example.com');
  await expect(page.getByTestId(ids.authStatePanel)).toContainText('eu-west-1');
  await expect(page.getByTestId(ids.eventLogPanel)).toContainText('authfn.region.lookup');
});
