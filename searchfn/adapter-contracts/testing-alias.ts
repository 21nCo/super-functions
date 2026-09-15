import { fileURLToPath } from "node:url";

/** Workspace Vitest alias so adapter tests resolve the harness source without a prior dist build. */
export const adapterContractsTestingAlias = {
  "@searchfn/adapter-contracts/testing": fileURLToPath(new URL("./src/testing.ts", import.meta.url))
};
