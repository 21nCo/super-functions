import { expect, test } from "@playwright/test";
import {
  openAppAs,
  pullNowAndWait,
  queryVisibleDocumentTitles,
  resetBaseline,
  selectDocumentByTitle,
  waitForDocumentTitleVisibility,
} from "./helpers/demo";

test.describe("multi-context sync", () => {
  test.beforeEach(async ({ request }) => {
    await resetBaseline(request);
  });

  test("grant backfill and revoke removal across two contexts", async ({
    browser,
    request,
  }) => {
    const aliceContext = await browser.newContext();
    const bobContext = await browser.newContext();
    const alicePage = await aliceContext.newPage();
    const bobPage = await bobContext.newPage();

    const title = `Sync Backfill ${Date.now()}`;
    const content = `sync-content-${Date.now()}`;

    try {
      await openAppAs(alicePage, { workspaceId: "acme", userId: "user:alice" });
      await openAppAs(bobPage, { workspaceId: "acme", userId: "user:bob" });

      await alicePage.getByTestId("create-title").fill(title);
      await alicePage.getByTestId("create-content").fill(content);
      await alicePage.getByTestId("create-submit").click();
      await expect(alicePage.getByTestId("activity-list")).toContainText(
        `Created document "${title}"`,
      );

      await selectDocumentByTitle(alicePage, title);
      await expect(
        await queryVisibleDocumentTitles(request, {
          workspaceId: "acme",
          userId: "user:bob",
        }),
      ).not.toContain(title);

      await alicePage.getByTestId("share-principal").selectOption("user:bob");
      await alicePage.getByTestId("share-level").selectOption("viewer");
      await alicePage.getByTestId("share-submit").click();
      await expect(alicePage.getByText("Share failed:")).toHaveCount(0);
      await expect(alicePage.getByTestId("activity-list")).toContainText(
        "Granted viewer to user:bob",
      );

      await pullNowAndWait(bobPage);
      await waitForDocumentTitleVisibility(
        request,
        {
          workspaceId: "acme",
          userId: "user:bob",
        },
        title,
        true,
      );

      await selectDocumentByTitle(alicePage, title);
      await alicePage.getByTestId("share-principal").selectOption("user:bob");
      await alicePage.getByTestId("unshare-submit").click();
      await expect(alicePage.getByText("Unshare failed:")).toHaveCount(0);
      await expect(alicePage.getByTestId("activity-list")).toContainText(
        "Revoked user:bob",
      );

      await pullNowAndWait(bobPage);
      await waitForDocumentTitleVisibility(
        request,
        {
          workspaceId: "acme",
          userId: "user:bob",
        },
        title,
        false,
      );
      await expect(bobPage.getByTestId("activity-list")).toContainText(
        "Pull completed successfully",
      );
    } finally {
      await aliceContext.close();
      await bobContext.close();
    }
  });
});
