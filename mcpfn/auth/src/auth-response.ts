function json(status: number, body: unknown, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...Object.fromEntries(new Headers(headers)),
    },
  });
}

export function readBearerToken(request: Request): string | undefined {
  if (new URL(request.url).searchParams.has("access_token")) return undefined;
  const authorization = request.headers.get("authorization");
  if (!authorization) return undefined;
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization.trim());
  return match?.[1];
}

export function bearerChallengeResponse(
  status: 401 | 403,
  metadataUrl: URL,
  details: { error: string; description: string; scope?: string },
): Response {
  const fields = [
    `resource_metadata="${metadataUrl.toString()}"`,
    `error="${sanitizeChallengeValue(details.error)}"`,
    `error_description="${sanitizeChallengeValue(details.description)}"`,
  ];
  if (details.scope) fields.push(`scope="${sanitizeChallengeValue(details.scope)}"`);
  return json(
    status,
    { error: details.error, error_description: details.description },
    { "www-authenticate": `Bearer ${fields.join(", ")}` },
  );
}

function sanitizeChallengeValue(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f"\\]/g, "");
}
