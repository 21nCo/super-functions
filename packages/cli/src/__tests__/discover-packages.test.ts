import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { discoverSuperfunctionsPackages } from "../utils/discover-packages.js";

const TEST_DIR = path.join(__dirname, "discover-test-env");

describe("discoverSuperfunctionsPackages", () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_DIR);
    fs.mkdirSync(path.join(TEST_DIR, "node_modules"));
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("should discover regular packages", () => {
    const pkgPath = path.join(TEST_DIR, "node_modules/my-lib");
    fs.mkdirSync(pkgPath, { recursive: true });
    fs.writeFileSync(
      path.join(pkgPath, "package.json"),
      JSON.stringify({
        name: "my-lib",
        superfunctions: { initFunction: "init" },
      })
    );

    const result = discoverSuperfunctionsPackages(TEST_DIR);
    expect(result).toHaveLength(1);
    expect(result[0].packageName).toBe("my-lib");
  });

  it("should discover symlinked packages", () => {
    // Create package outside node_modules
    const libPath = path.join(TEST_DIR, "lib");
    fs.mkdirSync(libPath);
    fs.writeFileSync(
      path.join(libPath, "package.json"),
      JSON.stringify({
        name: "linked-lib",
        superfunctions: { initFunction: "initLinked" },
      })
    );

    // Symlink it
    const linkPath = path.join(TEST_DIR, "node_modules/linked-lib");
    try {
      fs.symlinkSync(libPath, linkPath, "dir");
    } catch (e) {
      console.warn(
        "Symlink creation might fail depending on permissions/OS",
        e
      );
      return; // Skip if can't symlink
    }

    const result = discoverSuperfunctionsPackages(TEST_DIR);
    expect(result).toHaveLength(1);
    expect(result[0].packageName).toBe("linked-lib");
  });
});
