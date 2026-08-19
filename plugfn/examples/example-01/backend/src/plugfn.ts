import { plugFn, type AuthProvider, type PlugFn } from "plugfn";
import type { Adapter } from "@superfunctions/db";

export function createExamplePlug(options: {
  database: Adapter;
  auth: AuthProvider;
}): PlugFn {
  return plugFn({
    database: options.database,
    auth: options.auth,
    baseUrl: "http://localhost:3000",
    encryptionKey:
      process.env.ENCRYPTION_KEY || "supersecretencryptionkey1234567890",
    integrations: {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID || "",
        clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
      },
      linear: {
        clientId: process.env.LINEAR_CLIENT_ID || "",
        clientSecret: process.env.LINEAR_CLIENT_SECRET || "",
      },
      gmail: {
        clientId: process.env.GMAIL_CLIENT_ID || "",
        clientSecret: process.env.GMAIL_CLIENT_SECRET || "",
      },
    },
  });
}
