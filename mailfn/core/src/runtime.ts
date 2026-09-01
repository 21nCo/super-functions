import type {
  MailFnClock,
  MailFnIdGenerator,
  MailFnSecretProtector,
  MailFnTokenCodec,
} from './contracts.js';

const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomHex(bytes: number): string {
  const value = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(value);
  return bytesToHex(value);
}

export const systemClock: MailFnClock = {
  now: () => new Date(),
  sleep(ms, signal) {
    if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
    return new Promise<void>((resolve, reject) => {
      const cleanup = () => signal?.removeEventListener('abort', abort);
      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, Math.max(0, ms));
      const abort = () => {
        clearTimeout(timer);
        cleanup();
        reject(new DOMException('Aborted', 'AbortError'));
      };
      signal?.addEventListener('abort', abort, { once: true });
    });
  },
};

export const defaultIdGenerator: MailFnIdGenerator = {
  generate(prefix) {
    return `${prefix}_${globalThis.crypto.randomUUID().replaceAll('-', '')}`;
  },
};

export const sha256TokenCodec: MailFnTokenCodec = {
  async create(credentialId) {
    const secret = randomHex(32);
    const token = `mfn_${credentialId}_${secret}`;
    return {
      token,
      hash: await this.hash(token),
      prefix: token.slice(0, Math.min(24, token.length)),
    };
  },
  async hash(token) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(token));
    return bytesToHex(new Uint8Array(digest));
  },
  equals(left, right) {
    if (left.length !== right.length) return false;
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) {
      difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }
    return difference === 0;
  },
};

export function createAesGcmSecretProtector(key: CryptoKey): MailFnSecretProtector {
  return {
    async protect(secret) {
      const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await globalThis.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoder.encode(secret),
      );
      return `${bytesToHex(iv)}.${bytesToHex(new Uint8Array(ciphertext))}`;
    },
    async reveal(value) {
      const [ivHex, ciphertextHex] = value.split('.');
      if (!ivHex || !ciphertextHex) throw new Error('MAILFN_SECRET_CIPHERTEXT_INVALID');
      const fromHex = (hex: string) => Uint8Array.from(hex.match(/.{2}/g) ?? [], (part) => Number.parseInt(part, 16));
      const plaintext = await globalThis.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromHex(ivHex) },
        key,
        fromHex(ciphertextHex),
      );
      return new TextDecoder().decode(plaintext);
    },
  };
}

export const noOpSecretProtector: MailFnSecretProtector = {
  protect: async (secret) => secret,
  reveal: async (secret) => secret,
};
