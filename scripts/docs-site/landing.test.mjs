import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
for (const product of ["authfn", "filefn"]) {
  it(`${product} delegates landing structure/styles while retaining product data`, () => {
    const source = readFileSync(resolve(root, product, "docs/src/routes/+page.svelte"), "utf8");
    expect(source).toContain('import LandingPage from "../../../../scripts/docs-site/LandingPage.svelte"');
    expect(source).toContain(`<LandingPage name="${product}"`);
    expect(source).toContain("siteTitle={data.source.siteTitle}");
    expect(source).toContain("description={data.source.config.site.description}");
    expect(source).toContain("{tagline} {features} {quickLinks}");
    expect(source).not.toContain("<style>");
    expect(source).not.toContain('<div class="landing docsfn-layout">');
  });
}
