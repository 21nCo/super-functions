/**
 * `apifn serve [router-or-spec]` — interactive API explorer server (CLI-006, SERVE-001, SERVE-002)
 *
 * Starts a local HTTP server serving a basic API explorer HTML page.
 * Hot-reloads via Server-Sent Events when the spec file changes.
 * --port (default 4100), --open
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { parseOpenAPI } from "@apifn/core";
import type { Output } from "../utils/output.js";

export interface ServeCommandOptions {
    /** Path to spec or router file */
    specPath?: string;
    /** Port to bind (default: 4100) */
    port?: number;
    /** Auto-open browser */
    open?: boolean;
    /** Current working directory */
    cwd?: string;
    output: Output;
}

// ---------------------------------------------------------------------------
// HTML template for the basic explorer page
// ---------------------------------------------------------------------------

function toSafeScriptJson(value: unknown): string {
    return JSON.stringify(value, null, 2)
        .replace(/</g, "\\u003c")
        .replace(/>/g, "\\u003e")
        .replace(/\//g, "\\u002f");
}

function buildHtml(spec: unknown, port: number): string {
    const specJson = toSafeScriptJson(spec);
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ApiFn Explorer</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f1117; color: #e2e8f0; }
    header { background: #1a1d2e; border-bottom: 1px solid #2d3748; padding: 16px 24px; display: flex; align-items: center; gap: 12px; }
    header h1 { font-size: 18px; font-weight: 700; color: #7c3aed; }
    header span { font-size: 14px; color: #64748b; }
    main { padding: 24px; max-width: 1200px; margin: 0 auto; }
    .endpoint { background: #1a1d2e; border: 1px solid #2d3748; border-radius: 8px; margin-bottom: 12px; overflow: hidden; }
    .endpoint-header { padding: 12px 16px; display: flex; align-items: center; gap: 12px; cursor: pointer; }
    .method { font-size: 12px; font-weight: 700; padding: 2px 8px; border-radius: 4px; text-transform: uppercase; min-width: 60px; text-align: center; }
    .get { background: #065f46; color: #6ee7b7; }
    .post { background: #1e3a5f; color: #93c5fd; }
    .put { background: #78350f; color: #fcd34d; }
    .patch { background: #5b21b6; color: #c4b5fd; }
    .delete { background: #7f1d1d; color: #fca5a5; }
    .endpoint-path { font-family: monospace; font-size: 14px; }
    .endpoint-summary { font-size: 13px; color: #64748b; margin-left: auto; }
    #reload-indicator { position: fixed; top: 12px; right: 12px; background: #7c3aed; color: white; padding: 6px 12px; border-radius: 20px; font-size: 12px; display: none; }
    .badge { background: #7c3aed22; border: 1px solid #7c3aed44; color: #a78bfa; padding: 2px 8px; border-radius: 12px; font-size: 11px; }
  </style>
</head>
<body>
<div id="reload-indicator">🔄 Reloading…</div>
<header>
  <h1>ApiFn Explorer</h1>
  <span id="api-title">Loading…</span>
  <span class="badge" id="api-version"></span>
</header>
<main id="endpoints"></main>
<script>
const spec = ${specJson};
document.getElementById('api-title').textContent = spec.info?.title ?? 'API Explorer';
document.getElementById('api-version').textContent = 'v' + (spec.info?.version ?? '?');

const main = document.getElementById('endpoints');
const METHODS = ['get','post','put','patch','delete','head','options'];
const paths = spec.paths ?? {};

for (const [apiPath, pathItem] of Object.entries(paths)) {
  for (const method of METHODS) {
    const op = pathItem[method];
    if (!op) continue;
    const el = document.createElement('div');
    el.className = 'endpoint';
    el.innerHTML = \`<div class="endpoint-header">
      <span class="method \${method}">\${method}</span>
      <span class="endpoint-path">\${apiPath}</span>
      <span class="endpoint-summary">\${op.summary ?? ''}</span>
    </div>\`;
    main.appendChild(el);
  }
}

// Hot reload via Server-Sent Events
const ev = new EventSource('/sse');
ev.onmessage = (e) => {
  if (e.data === 'reload') {
    document.getElementById('reload-indicator').style.display = 'block';
    setTimeout(() => location.reload(), 300);
  }
};
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// runServeCommand
// ---------------------------------------------------------------------------

export async function runServeCommand(options: ServeCommandOptions): Promise<number> {
    const cwd = options.cwd ?? process.cwd();
    const port = options.port ?? 4100;
    const specPath = options.specPath
        ? path.resolve(cwd, options.specPath)
        : undefined;

    // SSE clients for hot reload
    const sseClients: http.ServerResponse[] = [];

    function notifyReload(): void {
        for (const client of sseClients) {
            client.write("data: reload\n\n");
        }
        sseClients.length = 0;
    }

    // Load spec
    async function loadSpec(): Promise<unknown> {
        if (!specPath) return { openapi: "3.1.0", info: { title: "No spec loaded", version: "1.0.0" }, paths: {} };
        const raw = await readFile(specPath, "utf8");
        return parseOpenAPI(raw);
    }

    let currentSpec: unknown = await loadSpec().catch(() => ({
        openapi: "3.1.0",
        info: { title: "Error loading spec", version: "1.0.0" },
        paths: {},
    }));

    // File watcher for hot reload (SERVE-002)
    let watcher: fs.FSWatcher | undefined;
    if (specPath) {
        watcher = fs.watch(specPath, async () => {
            try {
                await new Promise<void>((r) => setTimeout(r, 50)); // debounce
                currentSpec = await loadSpec();
                options.output.info(`Spec reloaded: ${specPath}`);
                notifyReload();
            } catch (err) {
                options.output.error(`Failed to reload spec: ${err}`);
            }
        });
    }

    // HTTP server
    const server = http.createServer((req, res) => {
        const url = req.url ?? "/";

        // SSE endpoint for live reload
        if (url === "/sse") {
            res.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "Access-Control-Allow-Origin": "*",
            });
            res.write(": connected\n\n");
            sseClients.push(res);
            req.on("close", () => {
                const idx = sseClients.indexOf(res);
                if (idx !== -1) sseClients.splice(idx, 1);
            });
            return;
        }

        // Serve spec as JSON
        if (url === "/spec.json") {
            res.setHeader("Content-Type", "application/json");
            res.writeHead(200);
            res.end(JSON.stringify(currentSpec, null, 2));
            return;
        }

        // Explorer HTML
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.writeHead(200);
        res.end(buildHtml(currentSpec, port));
    });

    return new Promise((resolve) => {
        const cleanup = () => {
            process.off("SIGINT", cleanup);
            process.off("SIGTERM", cleanup);
            watcher?.close();
            for (const client of sseClients) {
                client.end();
            }
            sseClients.length = 0;
            server.close(() => resolve(0));
        };

        server.listen(port, () => {
            const url = `http://localhost:${port}`;
            options.output.success(`API Explorer running at ${url}`);
            if (specPath) options.output.info(`Watching: ${specPath}`);
            options.output.info("Press Ctrl+C to stop");

            // Auto-open browser
            if (options.open) {
                import("node:child_process").then(({ exec }) => {
                    const cmd = process.platform === "darwin" ? `open ${url}`
                        : process.platform === "win32" ? `start ${url}`
                            : `xdg-open ${url}`;
                    exec(cmd);
                });
            }
        });

        process.on("SIGINT", cleanup);
        process.on("SIGTERM", cleanup);
    });
}
