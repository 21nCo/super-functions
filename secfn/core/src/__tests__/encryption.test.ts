import { describe, expect, it } from "vitest";
import {
  buildSecretAad,
  createStaticKeyProvider,
  decryptSecret,
  encryptSecret,
} from "../encryption.js";

describe("secret encryption", () => {
  it("roundtrips with per-record randomness", async () => {
    const provider = createStaticKeyProvider("master-key");
    const aad = buildSecretAad({ tenantId: "tenant:1", secretId: "secret_1", version: 1 });

    const first = await encryptSecret("secret-value", provider, aad);
    const second = await encryptSecret("secret-value", provider, aad);

    expect(first.ciphertext).not.toEqual(second.ciphertext);
    expect(first.iv).not.toEqual(second.iv);
    await expect(decryptSecret(first, provider, aad)).resolves.toBe("secret-value");
  });

  it("rejects wrong keys and AAD", async () => {
    const provider = createStaticKeyProvider("master-key");
    const wrongProvider = createStaticKeyProvider("wrong-key");
    const aad = buildSecretAad({ secretId: "secret_1", version: 1 });
    const encrypted = await encryptSecret("secret-value", provider, aad);

    await expect(decryptSecret(encrypted, wrongProvider, aad)).rejects.toMatchObject({
      code: "SECFN_ENCRYPTION_FAILED",
    });
    await expect(decryptSecret(encrypted, provider, "wrong-aad")).rejects.toMatchObject({
      code: "SECFN_ENCRYPTION_FAILED",
    });
  });
});

it("allows other event-loop work during key derivation", async () => {
  let completed = false;
  const encryption = encryptSecret("value", createStaticKeyProvider("key"), "aad").then(value => { completed = true; return value; });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(completed).toBe(false);
  await encryption;
});
