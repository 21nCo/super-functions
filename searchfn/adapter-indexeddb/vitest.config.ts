import { searchfnAdapterVitestConfig } from "../adapter-contracts/adapter-vitest.config";

export default searchfnAdapterVitestConfig({
  test: { setupFiles: ["__tests__/setup.ts"] }
});
