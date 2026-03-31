import { mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createScaffold } from "../src/scaffold.js";

describe("createScaffold", () => {
  it("applies deterministic mkdir and write-file operations", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "clifn-scaffold-"));
    const scaffold = createScaffold();

    try {
      const result = await scaffold.apply(
        [
          { kind: "mkdir", path: "src" },
          { kind: "write-file", path: "src/index.ts", content: "export {};\n", ifExists: "error" },
        ],
        { cwd }
      );

      expect(result).toEqual({
        written: ["src/index.ts"],
        skipped: [],
      });
      await expect(readFile(path.join(cwd, "src/index.ts"), "utf8")).resolves.toBe("export {};\n");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("supports skip and overwrite policies", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "clifn-scaffold-"));
    const scaffold = createScaffold();

    try {
      const target = path.join(cwd, "README.md");
      await writeFile(target, "first\n", "utf8");

      await expect(
        scaffold.apply([{ kind: "write-file", path: "README.md", content: "second\n", ifExists: "error" }], { cwd })
      ).rejects.toMatchObject({
        code: "CLIFN_SCAFFOLD_EXISTS",
      });

      const skipped = await scaffold.apply(
        [{ kind: "write-file", path: "README.md", content: "second\n", ifExists: "skip" }],
        { cwd }
      );
      expect(skipped).toEqual({
        written: [],
        skipped: ["README.md"],
      });
      await expect(readFile(target, "utf8")).resolves.toBe("first\n");

      const overwritten = await scaffold.apply(
        [{ kind: "write-file", path: "README.md", content: "third\n", ifExists: "overwrite" }],
        { cwd }
      );
      expect(overwritten).toEqual({
        written: ["README.md"],
        skipped: [],
      });
      await expect(readFile(target, "utf8")).resolves.toBe("third\n");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("supports dry-run mode without mutating files", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "clifn-scaffold-"));
    const scaffold = createScaffold();

    try {
      const result = await scaffold.apply(
        [{ kind: "write-file", path: "src/index.ts", content: "export {};\n", ifExists: "error" }],
        { cwd, dryRun: true }
      );

      expect(result).toEqual({
        written: ["src/index.ts"],
        skipped: [],
      });
      await expect(stat(path.join(cwd, "src/index.ts"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("rejects path traversal outside the configured working directory", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "clifn-scaffold-"));
    const scaffold = createScaffold();

    try {
      await expect(
        scaffold.apply([{ kind: "write-file", path: "../outside.txt", content: "nope\n", ifExists: "error" }], { cwd })
      ).rejects.toMatchObject({
        code: "CLIFN_SCAFFOLD_INVALID_PATH",
        message: "Scaffold path escapes the configured working directory.",
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("treats occupied directories as existing scaffold targets", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "clifn-scaffold-"));
    const scaffold = createScaffold();

    try {
      await scaffold.apply([{ kind: "mkdir", path: "nested" }], { cwd });

      await expect(
        scaffold.apply([{ kind: "write-file", path: "nested", content: "nope\n", ifExists: "error" }], { cwd })
      ).rejects.toMatchObject({
        code: "CLIFN_SCAFFOLD_EXISTS",
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("rejects symlink escapes outside the configured working directory", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "clifn-scaffold-"));
    const outside = await mkdtemp(path.join(os.tmpdir(), "clifn-scaffold-outside-"));
    const scaffold = createScaffold();

    try {
      await symlink(outside, path.join(cwd, "linked-outside"));

      await expect(
        scaffold.apply(
          [{ kind: "write-file", path: "linked-outside/escape.txt", content: "nope\n", ifExists: "error" }],
          { cwd }
        )
      ).rejects.toMatchObject({
        code: "CLIFN_SCAFFOLD_INVALID_PATH",
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});
