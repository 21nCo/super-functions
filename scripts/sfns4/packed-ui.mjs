import { writeFileSync, realpathSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, basename, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire(resolve("uifn/svelte/package.json"));
const { createServer } = await import(
  pathToFileURL(require.resolve("vite")).href
);
const { svelte } = await import(
  pathToFileURL(require.resolve("@sveltejs/vite-plugin-svelte")).href
);
const { chromium } = await import("playwright");
const candidate = process.argv[2];
if (!candidate || lstatSync(candidate).isSymbolicLink()) throw new Error("Temporary packed consumer directory is required");
const root = realpathSync(candidate);
if (dirname(root) !== realpathSync(tmpdir()) || !/^sfns4-packed-[A-Za-z0-9]+$/.test(basename(root))) {
  throw new Error("Use a fresh sfns4-packed directory directly inside the OS temporary directory");
}
writeFileSync(
  join(root, "App.svelte"),
  `<script>import { Accordion } from '@uifn/svelte';</script>
<Accordion.Root><Accordion.Item value="one"><Accordion.Header value="one"><Accordion.Trigger value="one">Section</Accordion.Trigger></Accordion.Header><Accordion.Content value="one">Packed content</Accordion.Content></Accordion.Item></Accordion.Root>`,
  { flag: "wx" },
);
writeFileSync(
  join(root, "server.js"),
  `import {render} from 'svelte/server'; import App from './App.svelte'; export const output = render(App);`,
  { flag: "wx" },
);
writeFileSync(
  join(root, "client.js"),
  `import {hydrate} from 'svelte'; import App from './App.svelte'; hydrate(App,{target:document.querySelector('#app')}); window.ready = true;`,
  { flag: "wx" },
);
const vite = await createServer({
  root,
  configFile: false,
  plugins: [svelte()],
  logLevel: "error",
  ssr: { noExternal: ["@uifn/svelte"] },
  optimizeDeps: { exclude: ["@uifn/svelte"] },
  server: { host: "127.0.0.1", port: 0, hmr: false },
});
let browser;
try {
  const { output } = await vite.ssrLoadModule("/server.js");
  if (!output.body.includes("Section"))
    throw new Error("Packed SSR output missing");
  writeFileSync(
    join(root, "index.html"),
    `<!doctype html><html><head><title>Packed UI test</title>${output.head}</head><body><main id="app">${output.body}</main><script type="module" src="/client.js"></script></body></html>`,
  );
  await vite.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (event) => {
    if (event.type() === "error" || event.text().includes("hydration_mismatch"))
      errors.push(event.text());
  });
  await page.goto(vite.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.ready === true);
  const trigger = page.getByRole("button", { name: "Section" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  if ((await trigger.getAttribute("aria-expanded")) !== "true")
    throw new Error("Packed keyboard interaction failed");
  if (errors.length)
    throw new Error(`Packed UI diagnostics: ${errors.join("; ")}`);
  console.log("packed Svelte SSR, hydration and keyboard interaction passed");
} finally {
  await browser?.close();
  await vite.close();
}
