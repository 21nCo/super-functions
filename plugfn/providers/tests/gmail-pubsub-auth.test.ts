import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { describe, expect, it } from 'vitest';
import { verifyGmailPubSubAuthorization } from '../src/gmail/index.js';

const audience = 'https://app.example.com/webhooks/gmail';
const serviceAccountEmail =
  'gmail-push@example-project.iam.gserviceaccount.com';
const verificationConfig = JSON.stringify({ audience, serviceAccountEmail });

describe('Gmail Pub/Sub push authentication', () => {
  it('accepts a Google-signed bearer JWT with the configured audience and service account', async () => {
    const fixture = await createTokenFixture();
    const token = await fixture.sign({
      audience,
      email: serviceAccountEmail,
      emailVerified: true,
    });

    await expect(
      verifyGmailPubSubAuthorization(
        `Bearer ${token}`,
        verificationConfig,
        fixture.keySet
      )
    ).resolves.toBe(true);
  });

  it('rejects JWTs with mismatched claims or incomplete verification configuration', async () => {
    const fixture = await createTokenFixture();
    const wrongAudience = await fixture.sign({
      audience: 'https://attacker.example.com',
      email: serviceAccountEmail,
      emailVerified: true,
    });
    const wrongEmail = await fixture.sign({
      audience,
      email: 'other@example-project.iam.gserviceaccount.com',
      emailVerified: true,
    });
    const unverifiedEmail = await fixture.sign({
      audience,
      email: serviceAccountEmail,
      emailVerified: false,
    });

    await expect(
      verifyGmailPubSubAuthorization(
        `Bearer ${wrongAudience}`,
        verificationConfig,
        fixture.keySet
      )
    ).resolves.toBe(false);
    await expect(
      verifyGmailPubSubAuthorization(
        `Bearer ${wrongEmail}`,
        verificationConfig,
        fixture.keySet
      )
    ).resolves.toBe(false);
    await expect(
      verifyGmailPubSubAuthorization(
        `Bearer ${unverifiedEmail}`,
        verificationConfig,
        fixture.keySet
      )
    ).resolves.toBe(false);
    await expect(
      verifyGmailPubSubAuthorization(
        `Bearer ${wrongEmail}`,
        JSON.stringify({ audience }),
        fixture.keySet
      )
    ).resolves.toBe(false);
  });
});

async function createTokenFixture() {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  publicJwk.alg = 'RS256';
  publicJwk.kid = 'test-key';
  publicJwk.use = 'sig';
  const keySet = createLocalJWKSet({ keys: [publicJwk] });

  return {
    keySet,
    sign: ({
      audience: tokenAudience,
      email,
      emailVerified,
    }: {
      audience: string;
      email: string;
      emailVerified: boolean;
    }) =>
      new SignJWT({ email, email_verified: emailVerified })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
        .setIssuer('https://accounts.google.com')
        .setAudience(tokenAudience)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey),
  };
}
