import { expect, test } from "@playwright/test";
import {
  openAppAs,
  pullNowAndWait,
  queryVisibleDocumentTitles,
  resetBaseline,
  runMutation,
  selectDocumentById,
  setSession,
  waitForDocumentTitleVisibility,
} from "./helpers/demo";

const ACME_PRIVATE_DOC_ID = "doc:acme-private-alice";
const ACME_PRIVATE_DOC_TITLE = "Acme private notes";
const GLOBEX_PRIVATE_DOC_TITLE = "Globex private notes";

test.describe("scope grant and workspace isolation", () => {
  test.beforeEach(async ({ request }) => {
    await resetBaseline(request);
  });

  test("team scope grant affects only in-namespace members and keeps isolation", async ({
    browser,
    request,
  }) => {
    const aliceContext = await browser.newContext();
    const bobContext = await browser.newContext();
    const charlieContext = await browser.newContext();
    const alicePage = await aliceContext.newPage();
    const bobPage = await bobContext.newPage();
    const charliePage = await charlieContext.newPage();

    try {
      await openAppAs(alicePage, { workspaceId: "acme", userId: "user:alice" });
      await openAppAs(bobPage, { workspaceId: "acme", userId: "user:bob" });
      await openAppAs(charliePage, {
        workspaceId: "acme",
        userId: "user:charlie",
      });

      await expect(
        await queryVisibleDocumentTitles(request, {
          workspaceId: "acme",
          userId: "user:bob",
        }),
      ).not.toContain(ACME_PRIVATE_DOC_TITLE);
      await expect(
        await queryVisibleDocumentTitles(request, {
          workspaceId: "acme",
          userId: "user:charlie",
        }),
      ).not.toContain(ACME_PRIVATE_DOC_TITLE);

      await selectDocumentById(alicePage, ACME_PRIVATE_DOC_ID);
      await alicePage.getByTestId("scope-grant-submit").click();
      await expect(alicePage.getByText("Scope grant failed:")).toHaveCount(0);
      await expect(alicePage.getByTestId("activity-list")).toContainText(
        "scope grant",
      );

      await pullNowAndWait(bobPage);
      await pullNowAndWait(charliePage);
      await waitForDocumentTitleVisibility(
        request,
        {
          workspaceId: "acme",
          userId: "user:bob",
        },
        ACME_PRIVATE_DOC_TITLE,
        true,
      );
      await waitForDocumentTitleVisibility(
        request,
        {
          workspaceId: "acme",
          userId: "user:charlie",
        },
        ACME_PRIVATE_DOC_TITLE,
        false,
      );

      await setSession(bobPage, { workspaceId: "globex", userId: "user:bob" });
      await expect(bobPage.getByTestId("context-namespace")).toHaveText("org:globex");
      await expect(
        await queryVisibleDocumentTitles(request, {
          workspaceId: "globex",
          userId: "user:bob",
        }),
      ).toContain(GLOBEX_PRIVATE_DOC_TITLE);
      await expect(
        await queryVisibleDocumentTitles(request, {
          workspaceId: "globex",
          userId: "user:bob",
        }),
      ).not.toContain(ACME_PRIVATE_DOC_TITLE);

      await setSession(alicePage, { workspaceId: "acme", userId: "user:alice" });
      await selectDocumentById(alicePage, ACME_PRIVATE_DOC_ID);
      const crossWorkspaceShare = await runMutation(
        request,
        { workspaceId: "acme", userId: "user:alice" },
        {
          resource: "documents",
          version: 1,
          operation: "share",
          id: ACME_PRIVATE_DOC_ID,
          shareWith: {
            principalId: "workspace:globex:user:bob",
            level: "viewer",
          },
        },
      );
      expect(crossWorkspaceShare.ok).toBe(false);
      expect(crossWorkspaceShare.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "DEMO_CROSS_WORKSPACE_DENIED" }),
        ]),
      );
    } finally {
      await aliceContext.close();
      await bobContext.close();
      await charlieContext.close();
    }
  });
});
