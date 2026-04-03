import { mkdir, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, "..");
const rustRoot = join(packageRoot, "rust");
const wasmTargetPath = join(
  rustRoot,
  "target",
  "wasm32-unknown-unknown",
  "release",
  "searchfn_core_wasm.wasm"
);
const wasmOutputDir = join(packageRoot, ".wasm");
const wasmOutputPath = join(wasmOutputDir, "searchfn_core_wasm.wasm");

await execFileAsync("cargo", ["build", "--target", "wasm32-unknown-unknown", "--release"], {
  cwd: rustRoot
});

await mkdir(wasmOutputDir, { recursive: true });
await copyFile(wasmTargetPath, wasmOutputPath);
