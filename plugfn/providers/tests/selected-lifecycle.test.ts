import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import * as providers from "../src/index.js";
import { selectedCatalog } from "./selected-catalog.js";
import { plugFn } from "../../core/src/core/plug-fn.js";
import { MemoryAdapter } from "../../core/src/storage/adapters/memory.js";
import type { Provider, OAuth2Config } from "../../core/src/types/provider.js";
import { oauthProviderDescriptors } from "@superfunctions/oauth-providers";
import { zodToJsonSchema } from "zod-to-json-schema";

const entries = Object.entries(selectedCatalog).flatMap(([exportName, names]) =>
  names.split(" ").map((name) => ({ exportName, name })),
);
const callback = "https://rex.test/callback";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("covers the complete independently declared catalog", () =>
  expect(entries).toHaveLength(111));

// These exercise the REAL connection manager, encrypted vault, OAuth exchange,
// refresh, disconnect and authenticated HTTP executor for each selected action.
// Only action payload/result handling is replaced: provider wire fixtures remain
// a separate suite and this is not evidence of live provider consent or effects.
describe.each(entries)(
  "$exportName $name shared credential lifecycle",
  ({ exportName, name }) => {
    it("publishes useful resource hints that reference actual input fields", () => {
      const action = (providers as any)[exportName].actions[name];
      const schema = zodToJsonSchema(action.parameters) as any;
      expect(action.contract.resources.length).toBeGreaterThan(0);
      for (const hint of action.contract.resources) {
        expect(hint.kind.length).toBeGreaterThan(0);
        if (hint.parameter)
          expect(Object.keys(schema.properties ?? {})).toContain(
            hint.parameter,
          );
      }
      expect(action.parameters.safeParse(null).success).toBe(false);
    });
    it("binds the selected account, refreshes safely, denies invalid authority and disconnects", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-09-13T12:00:00Z"));
      const source = (providers as any)[exportName] as Provider;
      const original = source.actions[name];
      const oauth = {
        ...(source.auth.config as OAuth2Config),
        ...((oauthProviderDescriptors as any)[source.name] ?? {}),
      };
      const unexpected: string[] = [];
      let tokenNumber = 0,
        refreshes = 0,
        dispatches = 0,
        status = 200,
        denyScope = false,
        failRefresh = false,
        failRevoke = false,
        transportFailure = false;
      let returnedScope: string | undefined;
      const received: string[] = [];
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        });
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
          const href = String(url);
          if (href === "https://wire.test/action") {
            dispatches++;
            received.push(new Headers(init?.headers).get("authorization")!);
            if (transportFailure)
              throw Object.assign(new Error("uncertain transport"), {
                code: "ETIMEDOUT",
              });
            return json({ ok: true }, status);
          }
          if (href === oauth.tokenUrl) {
            const raw = String(init?.body ?? "");
            const body = raw.startsWith("{")
              ? JSON.parse(raw)
              : Object.fromEntries(new URLSearchParams(raw));
            const refresh = body.grant_type === "refresh_token";
            if (refresh) {
              refreshes++;
              if (failRefresh || oauth.supportsRefreshToken === false)
                return json({ error: "invalid_grant" }, 400);
            }
            const token = {
              access_token: `access-${++tokenNumber}`,
              refresh_token: "refresh-fixture",
              token_type: "Bearer",
              expires_in: 3600,
              scope:
                returnedScope ??
                original.contract!.requiredScopes.join(
                  oauth.scopeSeparator ?? " ",
                ),
            };
            return json({
              ok: true,
              ...token,
              ...(!refresh && oauth.authorizationCodeTokenPath
                ? { authed_user: token }
                : {}),
            });
          }
          if (
            href === oauth.revocationUrl?.replace("{client_id}", "fixture-id")
          )
            return failRevoke
              ? json({ error: "revoke_denied" }, 400)
              : json({ ok: true });
          unexpected.push(href);
          return json({ error: "unexpected_fixture_url" }, 400);
        }),
      );
      const plug = plugFn({
        database: new MemoryAdapter(),
        auth: { authenticate: async () => ({ userId: "owner" }) },
        baseUrl: "https://rex.test",
        encryptionKey:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        integrations: {
          [source.name]: {
            type: "oauth2",
            clientId: "fixture-id",
            clientSecret: "fixture-secret",
            redirectUris: [callback],
          },
        },
        cache: { enabled: false },
        rateLimit: { enabled: false },
        retry: { enabled: true, maxAttempts: 2, delay: 0 },
        logger: { debug() {}, info() {}, warn() {}, error() {} },
        authorization: {
          authorizeConnection: ({ operation, connection }) =>
            operation !== "action" ||
            (!denyScope &&
              original.contract!.requiredScopes.every((scope) =>
                connection.scopes?.includes(scope),
              )),
        },
      });
      plug.providers.register({
        ...source,
        actions: {
          [name]: {
            ...original,
            parameters: z.object({}).strict(),
            returns: z.object({ ok: z.boolean() }),
            execute: async (_, context) => {
              const response =
                original.contract!.effect === "read"
                  ? await context.http.get("https://wire.test/action")
                  : await context.http.post("https://wire.test/action", {});
              return response.data;
            },
          },
        },
      });
      async function connect(userId: string) {
        const url = await plug.connections.getAuthUrl({
          userId,
          provider: source.name,
          redirectUri: callback,
          scopes: original.contract!.requiredScopes,
        });
        const state = new URL(url).searchParams.get("state")!;
        const result = await plug.connections.handleCallback({
          code: "code",
          state,
          provider: source.name,
          redirectUri: callback,
        });
        await expect(
          plug.connections.handleCallback({
            code: "replayed",
            state,
            provider: source.name,
            redirectUri: callback,
          }),
        ).rejects.toThrow();
        return result.connection;
      }
      const connection = await connect("owner");
      expect(JSON.stringify(connection.credentials)).not.toContain("access-1");
      const call = (
        userId = "owner",
        connectionId = connection.id,
        params: unknown = {},
      ) =>
        (plug as any)[source.name][name]({
          userId,
          connectionId,
          params,
          cache: false,
          retry: { maxAttempts: 2, delay: 0 },
        });
      await expect(call()).resolves.toEqual({ ok: true });
      expect(received).toEqual(["Bearer access-1"]);
      const other = await connect("other");
      await expect(call("owner", other.id)).rejects.toThrow();
      await expect(call("owner", connection.id, null)).rejects.toThrow();
      denyScope = true;
      await expect(call()).rejects.toThrow();
      await expect(
        (plug as any)[source.name][name]({
          userId: "owner",
          params: {},
          cache: false,
        }),
      ).rejects.toThrow();
      denyScope = false;
      expect(dispatches).toBe(1);
      if (original.contract!.requiredScopes.length) {
        returnedScope = "fixture:unrelated";
        const reduced = await connect("owner");
        returnedScope = undefined;
        expect(reduced.scopes).toEqual(["fixture:unrelated"]);
        await expect(call("owner", reduced.id)).rejects.toThrow();
        expect(dispatches).toBe(1);
      }
      for (const failureStatus of [401, 403, 429, 500]) {
        status = failureStatus;
        const before = dispatches;
        await expect(call()).rejects.toThrow();
        const retryable =
          original.contract!.retry === "safe" && [429, 500].includes(status);
        expect(dispatches - before).toBe(retryable ? 2 : 1);
      }
      status = 200;
      transportFailure = true;
      {
        const before = dispatches;
        await expect(call()).rejects.toThrow();
        expect(dispatches - before).toBe(
          original.contract!.retry === "safe" ? 2 : 1,
        );
      }
      transportFailure = false;
      if (oauth.supportsRefreshToken !== false) {
        vi.setSystemTime(new Date("2026-09-13T14:00:00Z"));
        await expect(call()).resolves.toEqual({ ok: true });
        expect(refreshes).toBe(1);
        expect(received.at(-1)).toBe(`Bearer access-${tokenNumber}`);
        if (original.contract!.requiredScopes.length) {
          returnedScope = "fixture:unrelated";
          vi.setSystemTime(new Date("2026-09-13T16:00:00Z"));
          const before = dispatches;
          await expect(call()).rejects.toThrow();
          expect(dispatches).toBe(before);
          expect((await plug.connections.get(connection.id)).scopes).toEqual([
            "fixture:unrelated",
          ]);
          returnedScope = undefined;
          await plug.connections.refresh(connection.id);
        }
        vi.setSystemTime(new Date("2026-09-13T18:00:00Z"));
        failRefresh = true;
        const before = dispatches;
        await expect(call()).rejects.toThrow();
        expect(dispatches).toBe(before);
      } else {
        vi.setSystemTime(new Date("2026-09-13T14:00:00Z"));
        const before = dispatches;
        await expect(call()).rejects.toThrow();
        expect(dispatches).toBe(before);
      }
      failRevoke = true;
      const disconnected = await plug.connections.disconnect({
        userId: "owner",
        provider: source.name,
        connectionId: connection.id,
      });
      expect(disconnected.localDeleted).toBe(true);
      if (oauth.revocationUrl)
        expect(disconnected.remoteRevokeSucceeded).toBe(false);
      const before = dispatches;
      await expect(call()).rejects.toThrow();
      expect(dispatches).toBe(before);
      expect(unexpected).toEqual([]);
    });
  },
);
