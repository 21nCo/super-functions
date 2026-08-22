import { execFile } from "node:child_process";
import net from "node:net";
import { promisify } from "node:util";

import type { ListenerInfo } from "./types.js";

const execFileAsync = promisify(execFile);

export async function isPortAvailable(port: number, protocol: "tcp" | "udp" = "tcp", host = "127.0.0.1"): Promise<boolean> {
  if (protocol === "udp") {
    const dgram = await import("node:dgram");
    return await new Promise<boolean>((resolve) => {
      const socket = dgram.createSocket("udp4");
      socket.once("error", () => { socket.close(); resolve(false); });
      socket.bind(port, host, () => { socket.close(() => resolve(true)); });
    });
  }
  return await new Promise<boolean>((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ port, host, exclusive: true }, () => server.close(() => resolve(true)));
  });
}

export async function allocateEphemeralPort(host = "127.0.0.1", protocol: "tcp" | "udp" = "tcp"): Promise<number> {
  if (protocol === "udp") {
    const dgram = await import("node:dgram");
    return await new Promise<number>((resolve, reject) => {
      const socket = dgram.createSocket("udp4");
      socket.unref();
      socket.once("error", reject);
      socket.bind(0, host, () => {
        const address = socket.address();
        socket.close(() => resolve(address.port));
      });
    });
  }
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen({ port: 0, host, exclusive: true }, () => {
      const address = server.address();
      if (!address || typeof address === "string") { server.close(); reject(new Error("Unable to allocate ephemeral port.")); return; }
      const port = address.port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function parseLsof(output: string): ListenerInfo[] {
  const listeners: ListenerInfo[] = [];
  for (const line of output.split("\n").slice(1)) {
    const columns = line.trim().split(/\s+/);
    if (columns.length < 9) continue;
    const address = columns[8];
    const match = address.match(/(?:\*|\[[^\]]+\]|[^:]+):(\d+)$/);
    if (!match) continue;
    listeners.push({ protocol: "tcp", host: address.slice(0, address.lastIndexOf(":")), port: Number(match[1]), pid: Number(columns[1]), process: columns[0], source: "os" });
  }
  return listeners;
}

function parseDocker(output: string): ListenerInfo[] {
  const listeners: ListenerInfo[] = [];
  for (const line of output.split("\n")) {
    const [name, ports = ""] = line.split("\t");
    for (const match of ports.matchAll(/(?:0\.0\.0\.0|127\.0\.0\.1|\[::\]):(\d+)->\d+\/(tcp|udp)/g)) {
      listeners.push({ protocol: match[2] as "tcp" | "udp", host: match[0].split(":")[0], port: Number(match[1]), process: name, source: "docker" });
    }
  }
  return listeners;
}

export async function scanListeners(): Promise<ListenerInfo[]> {
  const results: ListenerInfo[] = [];
  if (process.platform !== "win32") {
    try { results.push(...parseLsof((await execFileAsync("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN"])).stdout)); } catch { /* diagnostic callers report unavailable tools separately */ }
  } else {
    try {
      const output = (await execFileAsync("netstat", ["-ano", "-p", "tcp"])).stdout;
      for (const line of output.split("\n")) {
        const match = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/i);
        if (match) results.push({ protocol: "tcp", host: "*", port: Number(match[1]), pid: Number(match[2]), source: "os" });
      }
    } catch { /* optional */ }
  }
  try { results.push(...parseDocker((await execFileAsync("docker", ["ps", "--format", "{{.Names}}\\t{{.Ports}}"])).stdout)); } catch { /* Docker is optional */ }
  return results.sort((a, b) => a.port - b.port || a.source.localeCompare(b.source));
}
