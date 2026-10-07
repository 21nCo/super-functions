import { execFile, type ChildProcess } from "node:child_process";
import path from "node:path";

/** Internal bounded best-effort process-tree cleanup after capture overflow. */
export async function terminateConformanceRunner(
  child: ChildProcess,
  platform = process.platform,
  systemRoot = process.env.SystemRoot,
): Promise<void> {
  const killWrapper = () => { try { child.kill("SIGKILL"); } catch { /* Report remains failed. */ } };
  try {
    if (platform === "win32" && child.pid) {
      if (!systemRoot || !path.win32.isAbsolute(systemRoot)) { killWrapper(); return; }
      await new Promise<void>(resolve => {
        const timer = setTimeout(() => { killWrapper(); resolve(); }, 2500);
        const done = (error: Error | null) => {
          clearTimeout(timer);
          if (error) killWrapper();
          resolve();
        };
        try {
          execFile(path.win32.join(systemRoot, "System32", "taskkill.exe"),
            ["/pid", String(child.pid), "/T", "/F"], { timeout: 2000, windowsHide: true }, done);
        } catch (error) { done(error as Error); }
      });
    } else if (child.pid) {
      try { process.kill(-child.pid, "SIGKILL"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") killWrapper(); }
    } else killWrapper();
  } finally {
    child.stdout?.destroy();
    child.stderr?.destroy();
  }
}
