import type { RulePack, ScanTarget, SecurityFinding } from "../types.js";
import { defaultSecretRulePack } from "./rules.js";


export interface SecurityScannerOptions {
  rulePacks?: RulePack[];
  excludePaths?: string[];
  maxFileSize?: number;
}

export interface ScanDirectoryOptions {
  saveContent?: false;
}

export interface GitHistoryScanOptions {
  commits?: number;
  branch?: string;
  /** Fail explicitly if one commit exceeds this many bytes; default 32 MiB. */
  maxCommitBytes?: number;
}

export class SecurityScanner {
  private readonly rulePacks: RulePack[];
  private readonly excludePaths: string[];
  private readonly maxFileSize: number;

  constructor(options: SecurityScannerOptions = {}) {
    this.rulePacks = options.rulePacks ?? [defaultSecretRulePack];
    this.excludePaths = options.excludePaths ?? [
      "node_modules/**",
      "dist/**",
      "build/**",
      ".git/**",
      ".next/**",
      "coverage/**",
    ];
    this.maxFileSize = options.maxFileSize ?? 1024 * 1024;
    if (!Number.isSafeInteger(this.maxFileSize) || this.maxFileSize < 0 || this.maxFileSize >= 2 ** 32) {
      throw new RangeError("maxFileSize must be a nonnegative integer below 2^32");
    }
  }

  scanContent(content: string, target: ScanTarget): SecurityFinding[] {
    return this.rulePacks.flatMap((pack) =>
      pack.rules.flatMap((rule) => rule.evaluate({ content, target })),
    );
  }

  async scanFile(filePath: string): Promise<SecurityFinding[]> {
    const content = await this.readFileContent(filePath);
    return content === undefined ? [] : this.scanContent(content, { path: filePath });
  }

  private async readFileContent(filePath: string): Promise<string | undefined> {
    const { open } = await import("node:fs/promises");
    const file = await open(filePath, "r");
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      while (size <= this.maxFileSize) {
        const buffer = Buffer.alloc(Math.min(64 * 1024, this.maxFileSize + 1 - size));
        const { bytesRead } = await file.read(buffer, 0, buffer.length, null);
        if (!bytesRead) break;
        size += bytesRead;
        if (size > this.maxFileSize) return undefined;
        chunks.push(buffer.subarray(0, bytesRead));
      }
      return Buffer.concat(chunks, size).toString("utf8");
    } finally {
      await file.close();
    }
  }

  async scanDirectory(dir: string): Promise<SecurityFinding[]> {
    const { default: glob } = await import("fast-glob");
    const files = await glob("**/*", {
      cwd: dir,
      absolute: true,
      onlyFiles: true,
      followSymbolicLinks: false,
      ignore: this.excludePaths,
    });
    const findings: SecurityFinding[] = [];
    for (const file of files) {
      let content: string | undefined;
      try {
        content = await this.readFileContent(file);
      } catch {
        // Unreadable files are ignored by design; rule failures run outside this boundary.
        continue;
      }
      if (content !== undefined) findings.push(...this.scanContent(content, { path: file }));
    }
    return findings;
  }

  async scanGitHistory(options: GitHistoryScanOptions = {}): Promise<SecurityFinding[]> {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);
    const maxBuffer = options.maxCommitBytes ?? 32 * 1024 * 1024;
    if (!Number.isSafeInteger(maxBuffer) || maxBuffer < 1) throw new RangeError("maxCommitBytes must be a positive safe integer");
    const commits = String(options.commits ?? 100);
    const branch = options.branch ?? "HEAD";
    const { stdout } = await execFileAsync("git", ["log", branch, `-n${commits}`, "--format=%H"]);
    const findings: SecurityFinding[] = [];
    for (const hash of stdout.split("\n").filter(Boolean)) {
      const shown = await execFileAsync("git", ["show", "--format=medium", "--no-ext-diff", hash], { maxBuffer });
      const commitFindings = this.scanContent(shown.stdout, {
        path: `commit:${hash}`,
        displayPath: `commit:${hash.slice(0, 12)}`,
      });
      for (const finding of commitFindings) {
        finding.metadata = { ...(finding.metadata ?? {}), commit: hash };
      }
      findings.push(...commitFindings);
    }
    return findings;
  }
}

export function createSecurityScanner(options?: SecurityScannerOptions): SecurityScanner {
  return new SecurityScanner(options);
}
