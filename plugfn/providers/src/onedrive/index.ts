import { applySelectedResources } from '../shared/selected-resources.js';
import { graphPageUrl } from "../shared/graph-pagination.js";
import { z } from "zod";
import { AuthType, type Provider, type ActionContext } from "plugfn";
import {
  restAction,
  remoteId,
  segment,
  jsonObject,
} from "../shared/rest-action.js";
const base = "https://graph.microsoft.com/v1.0";
const read = ["Files.Read"];
const write = ["Files.ReadWrite"];
const item = z.object({ driveId: remoteId, itemId: remoteId });
const path = (p: any) =>
  `${base}/drives/${segment(p.driveId)}/items/${segment(p.itemId)}`;
const page = z
  .object({
    value: z.array(jsonObject),
    "@odata.nextLink": z.string().optional(),
  })
  .passthrough();
const binary = z.object({
  base64: z.string(),
  byteLength: z.number().int(),
  mimeType: z.string(),
});
function capabilityUrl(raw: string): string {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    ![".sharepoint.com", ".1drv.com", ".onedrive.com"].some((suffix) =>
      url.hostname.endsWith(suffix),
    )
  )
    throw new Error("ONEDRIVE_UNTRUSTED_CAPABILITY_URL");
  return url.toString();
}
export const onedriveProvider: Provider = {
  name: "onedrive",
  displayName: "OneDrive",
  description: "Microsoft Graph delegated OneDrive actions",
  version: "1.0.0",
  baseUrl: base,
  auth: {
    type: AuthType.OAuth2,
    config: {
      authorizationUrl:
        "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      scopes: ["offline_access", ...read, ...write],
    },
  },
  actions: {
    "drives.list": restAction({
      name: "drives.list",
      method: "GET",
      path: (p) => graphPageUrl(`${base}/me/drives`, p.nextLink),
      parameters: z
        .object({ nextLink: z.string().url().max(16384).optional() })
        .strict(),
      returns: page,
      scopes: read,
      pagination: { kind: "cursor", cursorParameter: "nextLink" },
    }),
    "items.search": restAction({
      name: "items.search",
      method: "GET",
      path: (p) =>
        graphPageUrl(
          `${base}/drives/${segment(p.driveId)}/root/search(q='${segment(p.q.replace(/'/g, "''"))}')`,
          p.nextLink,
        ),
      parameters: z
        .object({
          driveId: remoteId,
          q: z.string().min(1),
          nextLink: z.string().url().max(16384).optional(),
          top: z.number().int().min(1).max(200).optional(),
        })
        .strict(),
      query: (p) => (p.nextLink ? {} : { $top: p.top }),
      returns: page,
      scopes: read,
      pagination: {
        kind: "cursor",
        cursorParameter: "nextLink",
        maxPageSize: 200,
      },
    }),
    "items.get": restAction({
      name: "items.get",
      method: "GET",
      path,
      parameters: item.strict(),
      returns: z.object({ id: z.string(), name: z.string() }).passthrough(),
      scopes: read,
    }),
    "permissions.list": restAction({
      name: "permissions.list",
      method: "GET",
      path: (p) => graphPageUrl(`${path(p)}/permissions`, p.nextLink),
      parameters: item
        .extend({ nextLink: z.string().url().max(16384).optional() })
        .strict(),
      returns: page,
      scopes: read,
      pagination: { kind: "cursor", cursorParameter: "nextLink" },
    }),
    "permissions.create": restAction({
      name: "permissions.create",
      method: "POST",
      path: (p) => `${path(p)}/invite`,
      parameters: item
        .extend({
          recipients: z
            .array(z.object({ email: z.string().email() }).strict())
            .min(1),
          roles: z.array(z.enum(["read", "write"])).min(1),
          requireSignIn: z.boolean().default(true),
          sendInvitation: z.boolean().default(false),
          message: z.string().optional(),
        })
        .strict(),
      body: ({ driveId: _, itemId: __, ...body }) => body,
      returns: page,
      scopes: write,
    }),
    "permissions.delete": restAction({
      name: "permissions.delete",
      method: "DELETE",
      path: (p) => `${path(p)}/permissions/${segment(p.permissionId)}`,
      parameters: item.extend({ permissionId: remoteId }).strict(),
      returns: z.object({ success: z.literal(true) }),
      scopes: write,
    }),
  },
};
const downloadInput = item.strict();
onedriveProvider.actions["items.download"] = {
  name: "items.download",
  displayName: "Download item",
  description: "Read up to 20 MiB of file contents",
  parameters: downloadInput,
  returns: binary,
  idempotent: true,
  contract: {
    version: "1.0.0",
    effect: "read",
    requiredScopes: read,
    resources: [{ kind: "drive-item", parameter: "itemId" }],
    sensitiveKeys: ["base64"],
    pagination: { kind: "none" },
    retry: "safe",
  },
  async execute(input: unknown, context: ActionContext) {
    const p = downloadInput.parse(input);
    const metadata = await context.http.get(path(p), { redirect: "error" });
    const raw = metadata.data["@microsoft.graph.downloadUrl"];
    if (typeof raw !== "string")
      throw new Error("ONEDRIVE_DOWNLOAD_URL_MISSING");
    const response = await context.http.get(capabilityUrl(raw), {
      omitAuth: true,
      responseType: "arrayBuffer",
      maxResponseBytes: 20 * 1024 * 1024,
      redirect: "error",
    });
    const bytes = new Uint8Array(response.data);
    let text = "";
    for (let i = 0; i < bytes.length; i += 8192)
      text += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return {
      base64: btoa(text),
      byteLength: bytes.length,
      mimeType: response.headers["content-type"] ?? "application/octet-stream",
    };
  },
};
const uploadInput = z
  .object({
    driveId: remoteId,
    parentId: remoteId,
    fileName: z
      .string()
      .min(1)
      .max(255)
      .regex(/^[^/\\]+$/),
    base64: z.string().max(28 * 1024 * 1024),
    conflictBehavior: z.enum(["fail", "replace", "rename"]).default("fail"),
  })
  .strict();
onedriveProvider.actions["items.upload"] = {
  name: "items.upload",
  displayName: "Upload item",
  description: "Upload up to 20 MiB with a provider upload session",
  parameters: uploadInput,
  returns: z.object({ id: z.string(), name: z.string() }).passthrough(),
  contract: {
    version: "1.0.0",
    effect: "write",
    requiredScopes: write,
    resources: [{ kind: "drive", parameter: "driveId" }],
    sensitiveKeys: ["base64", "uploadUrl"],
    pagination: { kind: "none" },
    retry: "never",
  },
  async execute(input: unknown, context: ActionContext) {
    const p = uploadInput.parse(input);
    const decoded = atob(p.base64);
    if (!decoded.length || decoded.length > 20 * 1024 * 1024)
      throw new Error("ONEDRIVE_UPLOAD_SIZE_LIMIT");
    const bytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
    const session = await context.http.post(
      `${base}/drives/${segment(p.driveId)}/items/${segment(p.parentId)}:/${segment(p.fileName)}:/createUploadSession`,
      {
        item: {
          name: p.fileName,
          "@microsoft.graph.conflictBehavior": p.conflictBehavior,
        },
      },
      { redirect: "error" },
    );
    const url = capabilityUrl(session.data.uploadUrl);
    let result: unknown;
    // Each non-final fragment is a multiple of 320 KiB. Never replay an uncertain fragment.
    for (let start = 0; start < bytes.length; start += 10 * 320 * 1024) {
      const end = Math.min(start + 10 * 320 * 1024, bytes.length);
      const response = await context.http.put(url, bytes.subarray(start, end), {
        omitAuth: true,
        bodyEncoding: "raw",
        redirect: "error",
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Range": `bytes ${start}-${end - 1}/${bytes.length}`,
        },
      });
      if (end < bytes.length && response.status !== 202)
        throw new Error("ONEDRIVE_UPLOAD_PROGRESS_INVALID");
      if (
        end === bytes.length &&
        response.status !== 200 &&
        response.status !== 201
      )
        throw new Error("ONEDRIVE_UPLOAD_NOT_COMMITTED");
      result = response.data;
    }
    return z
      .object({ id: z.string(), name: z.string() })
      .passthrough()
      .parse(result);
  },
};

applySelectedResources(onedriveProvider);
