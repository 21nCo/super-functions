import { defineDevFnConfig } from "@devfn/config";

export default defineDevFnConfig({
  version: 1,
  project: { id: "skillplane", name: "Skillplane" },
  defaultProfile: "default",
  ports: {
    app: { range: [3200, 3299], env: "PORT" },
    postgres: { range: [55432, 55531], internal: 5432, env: "DATABASE_PORT" },
    appWorker: { range: [8787, 8886], env: "APP_WORKER_PORT" },
    mcpWorker: { range: [8987, 9086], env: "MCP_WORKER_PORT" },
  },
  services: {
    postgres: { adapter: "compose", file: "compose.yaml", service: "postgres", ports: { postgres: 5432 }, persistent: true },
  },
  processes: {
    app: { adapter: "pnpm", script: "dev", ports: ["app"], dependsOn: ["postgres"], health: { type: "http", port: "app", path: "/" } },
    appWorker: { adapter: "wrangler", command: ["dev", "--config", "wrangler.app.toml"], ports: ["appWorker"], health: { type: "tcp", port: "appWorker" } },
    mcpWorker: { adapter: "wrangler", command: ["dev", "--config", "wrangler.mcp.toml"], ports: ["mcpWorker"], health: { type: "tcp", port: "mcpWorker" } },
    tunnel: { adapter: "command", exposure: "public", command: ["cloudflared", "tunnel", "run", "skillplane-dev"], dependsOn: ["appWorker", "mcpWorker"] },
  },
  profiles: {
    default: { services: ["postgres"], processes: ["app"], proxy: true },
    oauth: { services: ["postgres"], processes: ["app", "appWorker", "mcpWorker", "tunnel"], proxy: true },
  },
  hostnames: { app: { target: "app", hostname: "skillplane-{instance}.localhost", tls: "off" } },
  prerequisites: [{ command: "pnpm", version: "9.12.0" }, { command: "docker" }, { command: "caddy" }, { command: "cloudflared", profiles: ["oauth"] }],
  environmentOutputs: [{ path: ".devfn/runtime.env", format: "dotenv", mode: 0o600 }],
});
