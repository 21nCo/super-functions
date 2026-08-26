import { mkdir, writeFile } from "node:fs/promises";
import net, { type Server } from "node:net";
import path from "node:path";

import type { DevFnConfig } from "@devfn/config";

export async function createFakeListener(port = 0): Promise<{ port: number; close(): Promise<void> }> {
  const server: Server = net.createServer((socket) => socket.end());
  server.unref();
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fake listener did not bind.");
  return { port: address.port, close: async () => await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

export function fixtureConfig(overrides: Partial<DevFnConfig> = {}): DevFnConfig {
  return {
    version: 1,
    project: { id: "fixture" },
    ports: { app: { range: [44000, 44100], env: "PORT" } },
    processes: { app: { adapter: "command", command: [process.execPath, "server.mjs"], ports: ["app"], health: { type: "tcp", port: "app", timeoutMs: 5000 } } },
    profiles: { default: { processes: ["app"] } },
    ...overrides,
  };
}

export async function writeFixtureProject(root: string, config = fixtureConfig()): Promise<void> {
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, "devfn.config.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await writeFile(path.join(root, "server.mjs"), "import net from 'node:net'; const server = net.createServer(); server.listen(Number(process.env.PORT), '127.0.0.1');\n", "utf8");
}
