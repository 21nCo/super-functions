function timingSafeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);

  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < leftBytes.length; i += 1) {
    diff |= leftBytes[i] ^ rightBytes[i];
  }

  return diff === 0;
}

export async function verifySlackRequest(
  req: Request,
  signingSecret: string
): Promise<boolean> {
  const timestamp = req.headers.get('x-slack-request-timestamp');
  const signature = req.headers.get('x-slack-signature');

  if (!timestamp || !signature) {
    return false;
  }

  // Prevent replay attacks (5 minutes)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 60 * 5) {
    return false;
  }

  const body = await req.clone().text();
  const base = `v0:${timestamp}:${body}`;

  // Node.js crypto (works in Workers if using node compatibility or crypto polyfill)
  // Or use Web Crypto API if preferred, but HMAC in Web Crypto is more verbose
  // Here assuming standard crypto available or polyfilled

  // Actually, let's use SubtleCrypto for better compatibility with Workers/Edge
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(base)
  );

  const hash = 'v0=' + Array.from(new Uint8Array(signed))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return timingSafeEqual(signature, hash);
}
