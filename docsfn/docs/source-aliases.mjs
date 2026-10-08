import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
/** @param {...string} segments */
const fromDocsRoot = (...segments) => path.resolve(root, ...segments);

export const sourceAliases = {
  "@docsfn/core/search-runtime": fromDocsRoot("../core/src/search-runtime.ts"),
  "@docsfn/core/search": fromDocsRoot("../core/src/search.ts"),
  "@docsfn/core/analytics": fromDocsRoot("../core/src/analytics.ts"),
  "@docsfn/core/browser": fromDocsRoot("../core/src/browser.ts"),
  "@uifn/svelte": fromDocsRoot("../../uifn/svelte/lib/index.ts"),
  "@searchfn/client": fromDocsRoot("../../searchfn/client/src/index.ts"),
  "@searchfn/core": fromDocsRoot("../../searchfn/core/src/index.ts"),
  "@searchfn/adapter-contracts": fromDocsRoot("../../searchfn/adapter-contracts/src/index.ts"),
  "@searchfn/adapter-memory": fromDocsRoot("../../searchfn/adapter-memory/src/index.ts"),
  "@searchfn/adapter-indexeddb": fromDocsRoot("../../searchfn/adapter-indexeddb/src/index.ts"),
};
