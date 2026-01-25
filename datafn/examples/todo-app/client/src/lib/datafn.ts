import { createDatafnClient, IndexedDbStorageAdapter } from "@datafn/client";
import type { DatafnSchema } from "@datafn/core";
import type { DatafnRemoteAdapter } from "@datafn/client";

const schema: DatafnSchema = {
  resources: [
    {
      name: "todos",
      version: 1,
      fields: [
        { name: "id", type: "string", required: true, unique: true },
        { name: "text", type: "string", required: true },
        { name: "completed", type: "boolean", required: true, default: false },
        { name: "createdAt", type: "date", required: true },
        { name: "updatedAt", type: "date", required: true },
      ],
      indices: {
        base: ["createdAt"],
      },
    },
  ],
};

class HttpRemoteAdapter implements DatafnRemoteAdapter {
  constructor(private baseUrl: string) {}

  private async post(path: string, payload: unknown) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || res.statusText);
    }
    const env = await res.json();
    return env.result; // Unwrap
  }

  query(q: unknown) {
    return this.post("/query", q);
  }
  mutation(m: unknown) {
    return this.post("/mutation", m);
  }
  transact(t: unknown) {
    return this.post("/transact", t);
  }
  seed(p: unknown) {
    return this.post("/seed", p);
  }
  clone(p: unknown) {
    return this.post("/clone", p);
  }
  pull(p: unknown) {
    return this.post("/pull", p);
  }
  push(p: unknown) {
    return this.post("/push", p);
  }
}

export const client = createDatafnClient({
  schema,
  storage: new IndexedDbStorageAdapter("todo-app-db"),
  remote: new HttpRemoteAdapter("http://localhost:3000/datafn"),
  clientId: "client-" + Math.random().toString(36).slice(2),
});

// Simple Sync Loop
export function startSync() {
  setInterval(async () => {
    try {
      // Push local changes
      await client.sync.push({});
      // Pull remote changes
      await client.sync.pull({});
    } catch (e) {
      console.error("Sync failed", e);
    }
  }, 5000);
}
