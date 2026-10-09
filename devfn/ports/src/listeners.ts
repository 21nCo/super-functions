import { execFile } from "node:child_process";
import net from "node:net";
import { promisify } from "node:util";

import type { ListenerInfo, ListenerScanResult } from "./types.js";

const execFileAsync = promisify(execFile);

export type BindProbe = "available" | "occupied" | "denied";

/** Bind one address once. "denied" (no privilege for the port) proves nothing about occupancy. */
export async function bindProbe(port: number, protocol: "tcp" | "udp" = "tcp", host = "127.0.0.1"): Promise<BindProbe> {
  const outcome = (error: NodeJS.ErrnoException): BindProbe => error.code === "EACCES" || error.code === "EPERM" ? "denied" : "occupied";
  if (protocol === "udp") {
    const dgram = await import("node:dgram");
    return await new Promise<BindProbe>((resolve) => {
      const socket = dgram.createSocket(net.isIPv6(host) ? "udp6" : "udp4");
      socket.once("error", (error: NodeJS.ErrnoException) => { socket.close(); resolve(outcome(error)); });
      socket.bind(port, host, () => { socket.close(() => resolve("available")); });
    });
  }
  return await new Promise<BindProbe>((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", (error: NodeJS.ErrnoException) => resolve(outcome(error)));
    server.listen({ port, host, exclusive: true }, () => server.close(() => resolve("available")));
  });
}

export async function isPortAvailable(port: number, protocol: "tcp" | "udp" = "tcp", host = "127.0.0.1"): Promise<boolean> {
  return await bindProbe(port, protocol, host) === "available";
}

/**
 * A refused TCP connection proves no socket listens on that address and port,
 * including wildcard listeners, without the privilege a bind would need and
 * even when the listener's owner is hidden from socket inspection.
 */
export async function connectionRefused(port: number, host = "127.0.0.1", timeoutMs = 500): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const socket = net.connect({ port, host });
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => { socket.destroy(); resolve(false); });
    socket.once("error", (error: NodeJS.ErrnoException) => { socket.destroy(); resolve(error.code === "ECONNREFUSED"); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
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

function parseLsof(output: string, protocol: "tcp" | "udp"): ListenerInfo[] {
  const listeners: ListenerInfo[] = [];
  for (const line of output.split("\n").slice(1)) {
    const columns = line.trim().split(/\s+/);
    if (columns.length < 9) continue;
    const address = columns[8].split("->", 1)[0];
    const match = address.match(/(?:\*|\[[^\]]+\]|[^:]+):(\d+)$/);
    if (!match) continue;
    listeners.push({ protocol, host: address.slice(0, address.lastIndexOf(":")), port: Number(match[1]), pid: Number(columns[1]), process: columns[0], source: "os" });
  }
  return listeners;
}

export function parseDockerListeners(output: string): ListenerInfo[] {
  const listeners: ListenerInfo[] = [];
  for (const line of output.split("\n")) {
    const [containerId, name, ports = ""] = line.split("\t");
    for (const match of ports.matchAll(/(0\.0\.0\.0|127\.0\.0\.1|\[::\]):(\d+)->\d+\/(tcp|udp)/g)) {
      listeners.push({ protocol: match[3] as "tcp" | "udp", host: match[1], port: Number(match[2]), process: name, containerId, source: "docker" });
    }
  }
  return listeners;
}

function commandProducedNoMatches(error: unknown): error is { code: number; stdout: string } {
  const candidate = error as { code?: unknown; stdout?: unknown };
  return candidate.code === 1 && typeof candidate.stdout === "string";
}

export function parseWindowsNetstatListeners(output: string, protocol: "tcp" | "udp"): ListenerInfo[] {
  const listeners: ListenerInfo[] = [];
  for (const line of output.split("\n")) {
    const fields = line.trim().split(/\s+/);
    if (fields[0]?.toLowerCase() !== protocol) continue;
    const local = fields[1]?.match(/^(\[[^\]]+\]|[^:]+):(\d+)$/);
    if (!local) continue;
    if (protocol === "tcp" && fields[3]?.toUpperCase() !== "LISTENING") continue;
    const pid = Number(fields[protocol === "tcp" ? 4 : 3]);
    if (!Number.isInteger(pid)) continue;
    listeners.push({ protocol, host: local[1], port: Number(local[2]), pid, source: "os" });
  }
  return listeners;
}

async function scanOsListeners(protocol: "tcp" | "udp"): Promise<{ listeners: ListenerInfo[]; inspected: boolean }> {
  if (process.platform === "win32") {
    try {
      const output = (await execFileAsync("netstat", ["-ano", "-p", protocol])).stdout;
      return { listeners: parseWindowsNetstatListeners(output, protocol), inspected: true };
    } catch { return { listeners: [], inspected: false }; }
  }
  const args = protocol === "tcp" ? ["-nP", "-iTCP", "-sTCP:LISTEN"] : ["-nP", "-iUDP"];
  try { return { listeners: parseLsof((await execFileAsync("lsof", args)).stdout, protocol), inspected: true }; }
  catch (error) { return { listeners: [], inspected: commandProducedNoMatches(error) }; }
}

/** Native ownership checks need OS listeners only; diagnostics may include Docker. */
export async function scanListenerState(includeDocker = true): Promise<ListenerScanResult> {
  const results: ListenerInfo[] = [];
  const inspection = { tcp: false, udp: false, docker: false };
  for (const protocol of ["tcp", "udp"] as const) {
    const scanned = await scanOsListeners(protocol);
    results.push(...scanned.listeners);
    inspection[protocol] = scanned.inspected;
  }
  if (includeDocker) {
    try { results.push(...parseDockerListeners((await execFileAsync("docker", ["ps", "--format", String.raw`{{.ID}}\t{{.Names}}\t{{.Ports}}`], { timeout: 10_000 })).stdout)); inspection.docker = true; }
    catch { /* Docker is optional */ }
  }
  results.sort((a, b) => {
    if (a.port !== b.port) return a.port - b.port;
    if (a.source < b.source) return -1;
    if (a.source > b.source) return 1;
    return 0;
  });
  return { listeners: results, inspection };
}

export async function scanListeners(): Promise<ListenerInfo[]> { return (await scanListenerState()).listeners; }
