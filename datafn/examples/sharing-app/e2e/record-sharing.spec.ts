import { expect, test } from "@playwright/test";
import {
  openAppAs,
  pullNowAndWait,
  resetBaseline,
  runMutation,
  selectDocumentById,
  waitForDocumentIdVisibility,
} from "./helpers/demo";

const PRIVATE_DOC_ID = "doc:acme-private-alice";
const PRIVATE_DOC_TITLE = "Acme private notes";

test.describe("record sharing lifecycle", () => {
  test.beforeEach(async ({ request }) => {
    await resetBaseline(request);
  });

  test("viewer denial, editor upgrade, and revoke", async ({ browser, request }) => {
    const aliceContext = await browser.newContext();
    const bobContext = await browser.newContext();
    const alicePage = await aliceContext.newPage();
    const bobPage = await bobContext.newPage();

    try {
      await openAppAs(alicePage, { workspaceId: "acme", userId: "user:alice" });
      await openAppAs(bobPage, { workspaceId: "acme", userId: "user:bob" });

      await selectDocumentById(alicePage, PRIVATE_DOC_ID);
      await alicePage.getByTestId("share-principal").selectOption("user:bob");
      await alicePage.getByTestId("share-level").selectOption("viewer");
      await alicePage.getByTestId("share-submit").click();
      await expect(alicePage.getByText("Share failed:")).toHaveCount(0);
      await expect(alicePage.getByTestId("activity-list")).toContainText(
        `Granted viewer to user:bob on ${PRIVATE_DOC_ID}`,
      );

      await pullNowAndWait(bobPage);
      await waitForDocumentIdVisibility(
        request,
        {
          workspaceId: "acme",
          userId: "user:bob",
        },
        PRIVATE_DOC_ID,
        true,
      );

      const viewerSave = await runMutation(
        request,
        { workspaceId: "acme", userId: "user:bob" },
        {
          resource: "documents",
          version: 1,
          operation: "merge",
          id: PRIVATE_DOC_ID,
          record: {
            title: PRIVATE_DOC_TITLE,
            content: "viewer should not save",
          },
        },
      );
      expect(viewerSave.ok).toBe(false);
      expect(viewerSave.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "FORBIDDEN" }),
        ]),
      );

      await selectDocumentById(alicePage, PRIVATE_DOC_ID);
      await alicePage.getByTestId("share-principal").selectOption("user:bob");
      await alicePage.getByTestId("share-level").selectOption("editor");
      await alicePage.getByTestId("share-submit").click();
      await expect(alicePage.getByText("Share failed:")).toHaveCount(0);
      await expect(alicePage.getByTestId("activity-list")).toContainText(
        `Granted editor to user:bob on ${PRIVATE_DOC_ID}`,
      );

      await pullNowAndWait(bobPage);
      const editorSave = await runMutation(
        request,
        { workspaceId: "acme", userId: "user:bob" },
        {
          resource: "documents",
          version: 1,
          operation: "merge",
          id: PRIVATE_DOC_ID,
          record: {
            title: PRIVATE_DOC_TITLE,
            content: "editor can save",
          },
        },
      );
      expect(editorSave.ok).toBe(true);

      const editorReshare = await runMutation(
        request,
        { workspaceId: "acme", userId: "user:bob" },
        {
          resource: "documents",
          version: 1,
          operation: "share",
          id: PRIVATE_DOC_ID,
          shareWith: { principalId: "user:charlie", level: "viewer" },
        },
      );
      expect(editorReshare.ok).toBe(false);
      expect(editorReshare.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "FORBIDDEN" }),
        ]),
      );

      await selectDocumentById(alicePage, PRIVATE_DOC_ID);
      await alicePage.getByTestId("share-principal").selectOption("user:bob");
      await alicePage.getByTestId("unshare-submit").click();
      await expect(alicePage.getByTestId("activity-list")).toContainText(
        `Revoked user:bob on ${PRIVATE_DOC_ID}`,
      );

      await pullNowAndWait(bobPage);
      await waitForDocumentIdVisibility(
        request,
        {
          workspaceId: "acme",
          userId: "user:bob",
        },
        PRIVATE_DOC_ID,
        false,
      );
    } finally {
      await aliceContext.close();
      await bobContext.close();
    }
  });
});
