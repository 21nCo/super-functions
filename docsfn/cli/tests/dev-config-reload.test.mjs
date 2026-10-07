import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const cli = process.env.DOCSFN_WATCH_TEST_CLI ?? fileURLToPath(new URL("../dist/index.js", import.meta.url));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function fixture(run) {
  const base = await fs.realpath(await fs.mkdtemp(join(tmpdir(), "docsfn-dev-config-")));
  const root = join(base, "project");
  await fs.mkdir(join(root, "content/docs"), { recursive: true });
  await fs.writeFile(join(root, "content/docs/index.md"), "# Page\n");
  let child,
    output = "";
  const wait = async (predicate) => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (await predicate()) return;
      if (child?.exitCode !== null && child?.exitCode !== undefined)
        throw new Error(`Dev exited ${child.exitCode}:\n${output}`);
      await sleep(75);
    }
    throw new Error(`Timed out:\n${output}`);
  };
  const start = async (args = [], flags = [], waitReady = true) => {
    child = spawn(process.execPath, [...flags, cli, "dev", root, "--out-dir", ".docsfn", ...args], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    for (const stream of [child.stdout, child.stderr])
      stream.on("data", (data) => {
        output += data;
      });
    if (waitReady) await wait(() => output.includes("Watching for changes"));
  };
  const manifest = async () => {
    try {
      return JSON.parse(await fs.readFile(join(root, ".docsfn/manifest.json"), "utf8"));
    } catch {
      return undefined;
    }
  };
  const title = (expected) => wait(async () => (await manifest())?.site.title === expected);
  let probes = 0;
  // Synchronizes on observable watcher state instead of elapsed time: a
  // detected probe proves `directory` is subscribed, and a later completed
  // rebuild proves every earlier queued event has been built.
  const settle = async (directory) => {
    const probe = join(directory, `.probe-${++probes}`);
    const detected = `Change detected: ${probe}`;
    let writes = 0;
    await wait(async () => {
      if (output.includes(detected)) return true;
      await fs.writeFile(probe, String(++writes));
      return false;
    });
    await wait(() => output.slice(output.lastIndexOf(detected)).includes("dev:rebuild:"));
  };
  const stop = async () => {
    if (child && child.exitCode === null) {
      const closed = new Promise((resolve) => child.once("close", resolve));
      child.kill("SIGTERM");
      const deadline = setTimeout(() => child.kill("SIGKILL"), 5000);
      await closed;
      clearTimeout(deadline);
    }
  };
  try {
    await run({ base, root, start, stop, wait, title, settle, manifest, output: () => output });
  } finally {
    await stop();
    await fs.rm(base, { recursive: true, force: true });
  }
}
const config = (title) =>
  `{schemaVersion:1,site:{title:${title}},content:{root:'.',docsDir:'content/docs'},search:{enabled:false,scopes:['docs']}}`;

for (const kind of ["esm", "cjs-json", "typescript"]) {
  test(`dev refreshes transitive ${kind} dependencies in fresh build processes`, () =>
    fixture(async ({ root, start, title }) => {
      let dependency;
      if (kind === "esm") {
        dependency = join(root, ".docsfn.settings.mjs");
        await fs.writeFile(
          join(root, "theme.mjs"),
          "export {default} from './.docsfn.settings.mjs';"
        );
        await fs.writeFile(
          join(root, "docsfn.config.mjs"),
          `import title from './theme.mjs'; export default ${config("title")};`
        );
        await fs.writeFile(dependency, "export default 'Before';");
      } else if (kind === "cjs-json") {
        dependency = join(root, "title.json");
        await fs.writeFile(
          join(root, "theme.cjs"),
          "module.exports=require('./title.json').title;"
        );
        await fs.writeFile(
          join(root, "docsfn.config.js"),
          `module.exports=${config("require('./theme.cjs')")};`
        );
        await fs.writeFile(dependency, '{"title":"Before"}');
      } else {
        dependency = join(root, "title.ts");
        await fs.writeFile(join(root, "theme.ts"), "export {title} from './title';");
        await fs.writeFile(
          join(root, "docsfn.config.ts"),
          `import {title} from './theme'; export default ${config("title")};`
        );
        await fs.writeFile(dependency, "export const title: string = 'Before';");
      }
      await start();
      await title("Before");
      await fs.writeFile(
        dependency,
        kind === "esm"
          ? "export default 'After';"
          : kind === "cjs-json"
            ? '{"title":"After"}'
            : "export const title: string = 'After';"
      );
      await title("After");
    }));
}

test("dev recovers from an initial missing import and invalidates stale outputs on later failure", () =>
  fixture(async ({ root, start, wait, title, manifest }) => {
    await fs.writeFile(
      join(root, "docsfn.config.ts"),
      `import {title} from './missing'; export default ${config("title")};`
    );
    await start();
    assert.equal(await manifest(), undefined);
    await fs.writeFile(join(root, "missing.ts"), "export const title = 'Recovered';");
    await title("Recovered");
    await fs.writeFile(join(root, "missing.ts"), "throw new Error('broken again');");
    await wait(async () => (await manifest()) === undefined);
    await fs.writeFile(join(root, "missing.ts"), "export const title = 'Repaired';");
    await title("Repaired");
  }));

test("dev watches declared external computed imports and uses live factory values in the consumer", () =>
  fixture(async ({ base, root, start, title }) => {
    const shared = join(base, "shared"),
      second = join(base, "second");
    await fs.mkdir(shared);
    await fs.mkdir(second);
    await fs.writeFile(join(shared, "title.mjs"), "export default 'Before';");
    await fs.writeFile(join(second, "suffix.cjs"), "module.exports='One';");
    await fs.writeFile(
      join(root, "docsfn.config.mjs"),
      `import {createRequire} from 'node:module';
    const require = createRequire(import.meta.url); class Label { constructor(value) { this.value=value; } read() { return this.value; } }
    export default async () => { const file='../shared/title.mjs'; const label = new Label((await import(file)).default);
      const live = () => label.read()+'/'+require('../second/suffix.cjs');
      const settings = ${config("live()")}; settings.site.theme={live,label}; return settings; };`
    );
    await start(["--watch-root", "../shared", "--watch-root", "../second"]);
    await title("Before/One");
    await fs.writeFile(join(shared, "title.mjs"), "export default 'After';");
    await title("After/One");
    await fs.writeFile(join(second, "suffix.cjs"), "module.exports='Two';");
    await title("After/Two");
  }));

test("dev watches explicit external config scope and recovers after package manifest repair", () =>
  fixture(async ({ base, start, title }) => {
    const settings = join(base, "settings");
    await fs.mkdir(settings);
    await fs.writeFile(join(settings, "package.json"), "{invalid");
    await fs.writeFile(join(settings, "title.mjs"), "export default 'External';");
    await fs.writeFile(
      join(settings, "settings.mjs"),
      `import title from '#title'; export default ${config("title")};`
    );
    await start(["--config", "../settings/settings.mjs"]);
    await fs.writeFile(
      join(settings, "package.json"),
      JSON.stringify({ type: "module", imports: { "#title": "./title.mjs" } })
    );
    await title("External");
    await fs.writeFile(join(settings, "title.mjs"), "export default 'Changed';");
    await title("Changed");
  }));

test("dev inherits native resolver flags and watches a symlink's physical dependencies", () =>
  fixture(async ({ base, root, start, title }) => {
    const settings = join(base, "physical");
    await fs.mkdir(settings);
    await fs.writeFile(
      join(settings, "package.json"),
      JSON.stringify({
        type: "module",
        imports: { "#title": { development: "./dev.mjs", default: "./prod.mjs" } }
      })
    );
    await fs.writeFile(join(settings, "dev.mjs"), "export default 'Development';");
    await fs.writeFile(join(settings, "prod.mjs"), "export default 'Production';");
    await fs.writeFile(
      join(settings, "settings.mjs"),
      `import title from '#title'; export default ${config("title")};`
    );
    await fs.symlink(join(settings, "settings.mjs"), join(root, "docsfn.config.mjs"));
    await start([], ["--conditions=development"]);
    await title("Development");
    await fs.writeFile(join(settings, "dev.mjs"), "export default 'Changed';");
    await title("Changed");
  }));

test("dev queues dependency changes that arrive during an active build", () =>
  fixture(async ({ root, start, wait, title, output }) => {
    await fs.writeFile(join(root, "title.mjs"), "export default 'Before';");
    await fs.writeFile(
      join(root, "docsfn.config.mjs"),
      `import title from './title.mjs'; export default async () => {
    console.log('factory started '+title); await new Promise(resolve => setTimeout(resolve,500)); return ${config("title")}; };`
    );
    await start();
    await title("Before");
    await fs.writeFile(join(root, "title.mjs"), "export default 'Middle';");
    await wait(() => output().includes("factory started Middle"));
    await fs.writeFile(join(root, "title.mjs"), "export default 'Final';");
    await title("Final");
  }));

test("stopping dev terminates an active build process", () =>
  fixture(async ({ root, start, stop, wait, output }) => {
    await fs.writeFile(
      join(root, "docsfn.config.mjs"),
      `export default async () => {
    console.log('active build pid '+process.pid);
    await new Promise(resolve => setTimeout(resolve,60000)); return ${config("'Slow'")}; };`
    );
    await start([], [], false);
    await wait(() => /active build pid (\d+)/.test(output()));
    const worker = Number(output().match(/active build pid (\d+)/)[1]);
    await stop();
    await wait(() => {
      try {
        process.kill(worker, 0);
        return false;
      } catch (error) {
        if (error.code === "ESRCH") return true;
        throw error;
      }
    });
  }));

test("declared symlink roots opt into physical package dependencies after settled retargeting", () =>
  fixture(async ({ base, root, start, title, settle }) => {
    const first = join(base, "node_modules/first-settings");
    const second = join(base, "node_modules/second-settings");
    const shared = join(root, "shared");
    await fs.mkdir(first, { recursive: true });
    await fs.mkdir(second, { recursive: true });
    await fs.writeFile(join(first, "title.mjs"), "export default 'First';");
    await fs.writeFile(join(second, "title.mjs"), "export default 'Second';");
    await fs.symlink(first, shared, "dir");
    await fs.writeFile(join(root, "docsfn.config.mjs"), `import title from './shared/title.mjs'; export default ${config("title")};`);
    await start(["--watch-root", "shared"]);
    await title("First");
    // Drain startup events so only the retargeted link can trigger the next build.
    await settle(first);
    await fs.unlink(shared);
    await fs.symlink(second, shared, "dir");
    await title("Second");
    // The retargeted physical directory must be subscribed before it changes.
    await settle(second);
    await fs.writeFile(join(second, "title.mjs"), "export default 'Updated';");
    await title("Updated");
  })
);
