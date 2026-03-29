import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const DEMO_SERVER_ORIGIN = "http://127.0.0.1:3001";

export type DemoSession = {
  workspaceId: "acme" | "globex";
  userId: "user:alice" | "user:bob" | "user:charlie";
};

export function demoHeaders(session: DemoSession): Record<string, string> {
  return {
    "x-demo-workspace-id": session.workspaceId,
    "x-demo-user-id": session.userId,
  };
}

export async function resetBaseline(request: APIRequestContext) {
  const response = await request.post(`${DEMO_SERVER_ORIGIN}/demo/reset`, {
    data: {
      scenario: "baseline",
    },
  });

  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  expect(payload.ok).toBe(true);
}

export async function openAppAs(page: Page, session: DemoSession) {
  await page.goto("/");
  await expect(page.getByTestId("workspace-select")).toBeVisible();
  await expect(page.getByTestId("context-actor")).toHaveText(/user:/);
  await setSession(page, session);
}

export async function setSession(page: Page, session: DemoSession) {
  await page.getByTestId("workspace-select").selectOption(session.workspaceId);
  await page.getByTestId("user-select").selectOption(session.userId);

  await expect(page.getByTestId("context-workspace")).toHaveText(session.workspaceId);
  await expect(page.getByTestId("context-actor")).toHaveText(session.userId);
  await expect(page.getByTestId("context-local-namespace")).toHaveText(
    `demo:${session.workspaceId}:${session.userId}`,
  );
  await expect(page.getByTestId("activity-list")).toContainText(
    `Clone completed for ${session.workspaceId}/${session.userId}`,
  );
}

export async function selectDocumentById(page: Page, documentId: string) {
  const button = page.getByTestId(`doc-item-${documentId}`);
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.getByText(`Editing: ${documentId}`)).toBeVisible();
}

export async function selectDocumentByTitle(page: Page, title: string) {
  const button = page.locator(".document-list button", { hasText: title }).first();
  await expect(button).toBeVisible();
  await button.click();
}

export async function expectDocumentVisibleById(
  page: Page,
  documentId: string,
  visible: boolean,
) {
  const locator = page.getByTestId(`doc-item-${documentId}`);
  if (visible) {
    await expect(locator).toBeVisible();
  } else {
    await expect(locator).toHaveCount(0);
  }
}

export async function expectDocumentVisibleByTitle(
  page: Page,
  title: string,
  visible: boolean,
) {
  const locator = page.locator(".document-list button", { hasText: title });
  if (visible) {
    await expect(locator.first()).toBeVisible();
  } else {
    await expect(locator).toHaveCount(0);
  }
}

export async function pullNowAndWait(page: Page) {
  await page.getByTestId("pull-now-submit").click();
  await expect(page.getByTestId("sync-status-line")).toContainText(
    "pull_succeeded",
  );
  await expect(page.getByTestId("activity-list")).toContainText(
    "Pull completed successfully",
  );
}

export async function queryVisibleDocumentIds(
  request: APIRequestContext,
  session: DemoSession,
): Promise<string[]> {
  const rows = await queryVisibleDocuments(request, session);
  return rows.map((row) => row.id);
}

export async function queryVisibleDocumentTitles(
  request: APIRequestContext,
  session: DemoSession,
): Promise<string[]> {
  const rows = await queryVisibleDocuments(request, session);
  return rows.map((row) => row.title);
}

export async function waitForDocumentIdVisibility(
  request: APIRequestContext,
  session: DemoSession,
  documentId: string,
  visible: boolean,
) {
  await expect
    .poll(
      async () => {
        const ids = await queryVisibleDocumentIds(request, session);
        return ids.includes(documentId);
      },
      { timeout: 30_000 },
    )
    .toBe(visible);
}

export async function waitForDocumentTitleVisibility(
  request: APIRequestContext,
  session: DemoSession,
  title: string,
  visible: boolean,
) {
  await expect
    .poll(
      async () => {
        const titles = await queryVisibleDocumentTitles(request, session);
        return titles.includes(title);
      },
      { timeout: 30_000 },
    )
    .toBe(visible);
}

type VisibleDocumentRow = {
  id: string;
  title: string;
};

async function queryVisibleDocuments(
  request: APIRequestContext,
  session: DemoSession,
): Promise<VisibleDocumentRow[]> {
  const response = await request.post(`${DEMO_SERVER_ORIGIN}/datafn/query`, {
    headers: demoHeaders(session),
    data: {
      resource: "documents",
      version: 1,
      operation: "find",
      sort: ["id:asc"],
    },
  });

  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  expect(payload.ok).toBe(true);
  return payload.result?.data ?? [];
}

export async function runMutation(
  request: APIRequestContext,
  session: DemoSession,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await request.post(`${DEMO_SERVER_ORIGIN}/datafn/mutation`, {
    headers: demoHeaders(session),
    data: payload,
  });

  const body = await response.json();
  if (body.ok === true) {
    return body.result as Record<string, unknown>;
  }

  return {
    ok: false,
    errors: body.error?.code ? [{ code: body.error.code }] : [],
    error: body.error,
    status: response.status(),
  };
}
