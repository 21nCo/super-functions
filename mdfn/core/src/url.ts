export interface MdfnUrlPolicy {
  readonly allowedSchemes: readonly string[];
  readonly allowRelative: boolean;
  readonly allowProtocolRelative?: boolean;
}

export interface MdfnUrlInspection {
  readonly safe: boolean;
  readonly normalized: string;
  readonly scheme?: string;
  readonly reason?: "empty" | "control" | "backslash" | "protocol-relative" | "scheme";
}

export interface MdfnAssetUrl {
  readonly provider: string;
  readonly id: string;
  readonly documentId?: string;
  readonly versionId?: string;
}

/** Parse MDFN's durable asset identifier without treating it as a delivery URL. */
export function parseMdfnAssetUrl(value: string): MdfnAssetUrl | null {
  const match = /^mdfn-asset:([^/?#]+)\/([^?#]+)(?:\?([^#]*))?$/i.exec(value.trim());
  if (!match) return null;
  try {
    const provider = decodeURIComponent(match[1]);
    const id = decodeURIComponent(match[2]);
    if (!provider || !id || /[\u0000-\u001f\u007f]/.test(`${provider}${id}`)) return null;
    const query = new URLSearchParams(match[3] ?? "");
    const documentId = query.get("document") ?? undefined;
    const versionId = query.get("version") ?? undefined;
    return { provider, id, documentId, versionId };
  } catch {
    return null;
  }
}

export function formatMdfnAssetUrl(asset: MdfnAssetUrl): string {
  if (!asset.provider || !asset.id) throw new TypeError("MDFN_ASSET_ID_REQUIRED");
  const query = new URLSearchParams();
  if (asset.documentId) query.set("document", asset.documentId);
  if (asset.versionId) query.set("version", asset.versionId);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return `mdfn-asset:${encodeURIComponent(asset.provider)}/${encodeURIComponent(asset.id)}${suffix}`;
}

function decodedForInspection(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Validate a URL without resolving it or losing the original Markdown value. */
export function inspectMdfnUrl(value: string, policy: MdfnUrlPolicy): MdfnUrlInspection {
  const normalized = value.trim();
  if (!normalized) return { safe: policy.allowRelative, normalized, reason: policy.allowRelative ? undefined : "empty" };
  const inspected = decodedForInspection(normalized);
  if (/[\u0000-\u001f\u007f]/.test(inspected)) return { safe: false, normalized, reason: "control" };
  const queryIndex = inspected.search(/[?#]/);
  const authorityPortion = queryIndex === -1 ? inspected : inspected.slice(0, queryIndex);
  if (authorityPortion.includes("\\")) return { safe: false, normalized, reason: "backslash" };
  if (inspected.startsWith("//")) {
    return { safe: policy.allowProtocolRelative === true, normalized, reason: policy.allowProtocolRelative ? undefined : "protocol-relative" };
  }
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(inspected);
  if (!match) return { safe: policy.allowRelative, normalized, reason: policy.allowRelative ? undefined : "scheme" };
  const scheme = match[1].toLowerCase();
  const safe = policy.allowedSchemes.some((allowed) => allowed.toLowerCase() === scheme);
  return { safe, normalized, scheme, reason: safe ? undefined : "scheme" };
}
