import {
  createDatafnExtfnProxyClient,
  type DatafnExtfnProxyClientOptions,
} from "@datafn/extfn";
import { demoNamespace, demoSchema } from "./demoSchema.js";

export function createDemoProxyClient(
  clientId: string,
  runtimeOptions: DatafnExtfnProxyClientOptions,
) {
  return createDatafnExtfnProxyClient(
    {
      schema: demoSchema,
      clientId,
      namespace: demoNamespace,
    },
    runtimeOptions,
  );
}

export async function loadDemoNotes(
  client: ReturnType<typeof createDemoProxyClient>,
): Promise<Array<Record<string, unknown>>> {
  const result = (await client.query({
    resource: "note",
    version: 1,
    select: ["id", "title", "summary", "surface"],
  })) as {
    data?: Array<Record<string, unknown>>;
  };

  return Array.isArray(result.data) ? result.data : [];
}
