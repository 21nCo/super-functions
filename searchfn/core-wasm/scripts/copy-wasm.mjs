import { access, copyFile, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, "..");
const sourcePath = join(packageRoot, ".wasm", "searchfn_core_wasm.wasm");
const destinationDir = join(packageRoot, "dist");
const destinationPath = join(destinationDir, "searchfn_core_wasm.wasm");

await access(sourcePath, constants.R_OK);
await mkdir(destinationDir, { recursive: true });
await copyFile(sourcePath, destinationPath);
