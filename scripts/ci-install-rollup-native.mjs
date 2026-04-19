import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);

if (process.platform !== "linux") {
  console.log("Skipping optional native package install on non-Linux runner.");
  process.exit(0);
}

const libcFamily =
  process.report?.getReport?.().header?.glibcVersionRuntime != null ? "gnu" : "musl";

const packages = [
  {
    packageName: "rollup",
    nativePackages: {
      arm64: {
        gnu: "@rollup/rollup-linux-arm64-gnu",
        musl: "@rollup/rollup-linux-arm64-musl",
      },
      x64: {
        gnu: "@rollup/rollup-linux-x64-gnu",
        musl: "@rollup/rollup-linux-x64-musl",
      },
    },
  },
  {
    packageName: "lightningcss",
    nativePackages: {
      arm64: {
        gnu: "lightningcss-linux-arm64-gnu",
        musl: "lightningcss-linux-arm64-musl",
      },
      arm: {
        gnu: "lightningcss-linux-arm-gnueabihf",
      },
      x64: {
        gnu: "lightningcss-linux-x64-gnu",
        musl: "lightningcss-linux-x64-musl",
      },
    },
  },
  {
    packageName: "@tailwindcss/oxide",
    nativePackages: {
      arm64: {
        gnu: "@tailwindcss/oxide-linux-arm64-gnu",
        musl: "@tailwindcss/oxide-linux-arm64-musl",
      },
      arm: {
        gnu: "@tailwindcss/oxide-linux-arm-gnueabihf",
      },
      x64: {
        gnu: "@tailwindcss/oxide-linux-x64-gnu",
        musl: "@tailwindcss/oxide-linux-x64-musl",
      },
    },
  },
  {
    packageName: "next",
    nativePackages: {
      arm64: {
        gnu: "@next/swc-linux-arm64-gnu",
        musl: "@next/swc-linux-arm64-musl",
      },
      x64: {
        gnu: "@next/swc-linux-x64-gnu",
        musl: "@next/swc-linux-x64-musl",
      },
    },
  },
];

function isModuleNotFound(error) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "MODULE_NOT_FOUND");
}

function findPackageJsonPath(packageName) {
  try {
    const packageEntryPath = require.resolve(packageName, { paths: [process.cwd()] });
    let directory = path.dirname(packageEntryPath);

    while (true) {
      const packageJsonPath = path.join(directory, "package.json");

      if (existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

        if (packageJson.name === packageName) {
          return packageJsonPath;
        }
      }

      const parentDirectory = path.dirname(directory);
      if (parentDirectory === directory) {
        throw new Error(`Could not locate package.json for ${packageName} from ${packageEntryPath}`);
      }

      directory = parentDirectory;
    }
  } catch (error) {
    if (isModuleNotFound(error)) {
      console.log(`${packageName} is not installed in this workspace; skipping native package install.`);
      return null;
    }
    throw error;
  }
}

function resolvePackageVersion(packageName) {
  const packageJsonPath = findPackageJsonPath(packageName);
  if (!packageJsonPath) {
    return null;
  }

  return JSON.parse(readFileSync(packageJsonPath, "utf8")).version;
}

function hasInstalledPackage(packageName) {
  try {
    require.resolve(packageName, { paths: [process.cwd()] });
    return true;
  } catch (error) {
    if (isModuleNotFound(error)) {
      return false;
    }

    throw error;
  }
}

function getMissingNativePackage({ packageName, nativePackages }) {
  const nativePackageName = nativePackages[process.arch]?.[libcFamily];

  if (!nativePackageName) {
    console.log(`No ${packageName} native package mapping for linux/${process.arch}/${libcFamily}; skipping.`);
    return null;
  }

  const packageVersion = resolvePackageVersion(packageName);
  if (!packageVersion) {
    return null;
  }

  if (hasInstalledPackage(nativePackageName)) {
    console.log(`${nativePackageName} is already installed.`);
    return null;
  }

  return {
    packageName,
    nativePackageName,
    packageVersion,
  };
}

const missingNativePackages = packages
  .map(getMissingNativePackage)
  .filter(Boolean);

if (missingNativePackages.length === 0) {
  console.log("All optional native packages are already installed.");
  process.exit(0);
}

for (const { nativePackageName, packageVersion, packageName } of missingNativePackages) {
  console.log(`Queueing ${nativePackageName}@${packageVersion} for ${packageName}.`);
}

console.log(
  `Installing ${missingNativePackages
    .map(({ nativePackageName, packageVersion }) => `${nativePackageName}@${packageVersion}`)
    .join(", ")}.`,
);

execFileSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  [
    "install",
    "--no-save",
    "--ignore-scripts",
    ...missingNativePackages.map(({ nativePackageName, packageVersion }) => `${nativePackageName}@${packageVersion}`),
  ],
  {
    cwd: process.cwd(),
    stdio: "inherit",
  },
);
