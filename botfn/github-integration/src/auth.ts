/**
 * Get GitHub App installation access token
 */
export async function getGitHubAppToken(
  appId: string,
  installationId: string,
  privateKey: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60,
    exp: now + 10 * 60,
    iss: appId,
  };

  const jwt = await generateJWT(payload, privateKey);

  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Discord-GitHub-Bot',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get GitHub App token: ${response.status}`);
  }

  const data = await response.json();
  return (data as any).token;
}

/**
 * Generate JWT for GitHub App authentication
 */
async function generateJWT(
  payload: Record<string, any>,
  privateKey: string
): Promise<string> {
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const message = `${encodedHeader}.${encodedPayload}`;

  // Import private key
  const pemKey = privateKey
    .replace(/-----BEGIN RSA PRIVATE KEY-----/, '')
    .replace(/-----END RSA PRIVATE KEY-----/, '')
    .replace(/\s/g, '');

  const binaryKey = base64ToArrayBuffer(pemKey);

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );

  // Sign
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(message)
  );

  const encodedSignature = base64UrlEncode(signature);
  return `${message}.${encodedSignature}`;
}

/**
 * Base64 URL encode
 */
function base64UrlEncode(data: string | ArrayBuffer | Uint8Array): string {
  let base64: string;
  if (typeof data === 'string') {
    base64 = btoa(data);
  } else if (data instanceof ArrayBuffer) {
    base64 = btoa(String.fromCharCode(...new Uint8Array(data)));
  } else {
    base64 = btoa(String.fromCharCode(...data));
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Convert base64 to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
