import { createDatafnExtfnAuthority } from "@datafn/extfn";
import { demoNamespace, demoSchema } from "../demoSchema.js";

const authority = createDatafnExtfnAuthority(
  {
    schema: demoSchema,
    clientId: "authority:svelte-datafn-demo",
    namespace: demoNamespace,
  },
  {
    address: {
      context: "background",
    },
  },
);

authority.attachBrowserRuntimeBridge();
void ensureSeedData();

async function ensureSeedData(): Promise<void> {
  const existing = (await authority.client.query({
    resource: "note",
    version: 1,
    select: ["id"],
  })) as {
    data?: Array<Record<string, unknown>>;
  };

  if ((existing.data?.length ?? 0) > 0) {
    return;
  }

  await authority.client.mutate([
    {
      resource: "note",
      version: 1,
      operation: "insert",
      id: "note:popup",
      record: {
        id: "note:popup",
        title: "Popup note",
        summary: "Loaded through the DataFn proxy client in the popup.",
        surface: "popup",
      },
    },
    {
      resource: "note",
      version: 1,
      operation: "insert",
      id: "note:content",
      record: {
        id: "note:content",
        title: "Content note",
        summary: "Rendered inside a content script mount.",
        surface: "content",
      },
    },
  ]);
}

export { authority };
