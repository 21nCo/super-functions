import { z } from 'zod';

/**
 * Discord interaction body schema for runtime validation
 */
const DiscordInteractionBodySchema = z.object({
  type: z.number(),
  data: z.any().optional(),
  guild_id: z.string().optional(),
  channel_id: z.string().optional(),
  member: z.any().optional(),
  user: z.any().optional(),
  token: z.string().optional(),
  version: z.number().optional(),
  id: z.string().optional(),
  application_id: z.string().optional(),
});

export type DiscordInteractionBody = z.infer<typeof DiscordInteractionBodySchema>;

/**
 * Verify Discord request signature using Ed25519
 */
export async function verifyDiscordRequest(
  request: Request,
  publicKey: string
): Promise<
  | { isValid: true; body: DiscordInteractionBody }
  | { isValid: false; body?: undefined }
> {
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  const body = await request.text();

  if (!signature || !timestamp) {
    return { isValid: false };
  }

  const isValid = await verifyKey(body, signature, timestamp, publicKey);

  if (!isValid) {
    return { isValid: false };
  }

  try {
    const parsed = JSON.parse(body);
    const validated = DiscordInteractionBodySchema.safeParse(parsed);
    
    if (!validated.success) {
      console.error('Invalid Discord interaction body structure:', validated.error);
      return { isValid: false };
    }
    
    return {
      isValid: true,
      body: validated.data,
    };
  } catch (error) {
    return { isValid: false };
  }
}

/**
 * Verify Ed25519 signature
 */
async function verifyKey(
  body: string,
  signature: string,
  timestamp: string,
  publicKey: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const message = encoder.encode(timestamp + body);

    const signatureBytes = hexToBytes(signature);
    const publicKeyBytes = hexToBytes(publicKey);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      publicKeyBytes,
      { name: 'Ed25519', namedCurve: 'Ed25519' },
      false,
      ['verify']
    );

    return await crypto.subtle.verify(
      'Ed25519',
      cryptoKey,
      signatureBytes,
      message
    );
  } catch (err) {
    console.error('Verification error:', err);
    return false;
  }
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}
