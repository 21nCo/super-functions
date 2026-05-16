import type { AuthFnClient } from "../types.js";

export interface AuthfnHttpClientRequest {
    method: string;
    url: string;
    headers: Record<string, string>;
    [key: string]: any;
}

export interface AuthfnHttpClientResponse {
    status: number;
    headers: Record<string, string>;
    body: string;
    [key: string]: any;
}

export interface AuthfnHttpClient {
    send(request: AuthfnHttpClientRequest): Promise<AuthfnHttpClientResponse>;
}

export interface MintTestTokenOptions {
    ttl: number; // in seconds
    scopes?: string[];
    resourceIds?: string[];
}

export interface MintTestTokenResponse {
    token: string;
    expiresAt: string;
}

/**
 * Mints a short-lived test API key using authfn's admin API (AUTH-001, AUTH-002).
 * Validates that TTL does not exceed 3600 seconds.
 */
export async function mintTestToken(
    client: AuthFnClient,
    options: MintTestTokenOptions
): Promise<MintTestTokenResponse> {
    if (options.ttl > 3600) {
        throw new Error("TTL cannot exceed 3600 seconds for test tokens");
    }

    const url = new URL("/admin/keys/test", client.baseUrl.replace(/\/$/, ""));
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
    };
    if (client.adminKey) {
        headers["Authorization"] = `Bearer ${client.adminKey}`;
    }

    const res = await fetch(url.toString(), {
        method: "POST",
        headers,
        body: JSON.stringify({
            ttl: options.ttl,
            scopes: options.scopes ?? [],
            resourceIds: options.resourceIds ?? [],
        }),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Failed to mint test token: HTTP ${res.status} ${text}`);
    }

    const data = (await res.json()) as MintTestTokenResponse;
    return data;
}

/**
 * A higher-order HttpClient wrapper that injects an Authorization header
 * into all requests (AUTH-003). Useful for collection runner integration.
 */
export function createAuthfnCollectionMiddleware(
    baseClient: AuthfnHttpClient,
    token: string
): AuthfnHttpClient {
    return {
        async send(req: AuthfnHttpClientRequest): Promise<AuthfnHttpClientResponse> {
            const headers = { ...req.headers };
            // Inject Authorization unless already present
            const hasAuth = Object.keys(headers).some(
                (k) => k.toLowerCase() === "authorization"
            );
            if (!hasAuth) {
                headers["Authorization"] = `Bearer ${token}`;
            }

            return baseClient.send({ ...req, headers });
        },
    };
}
