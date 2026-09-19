import {
  buildSecretAad,
  createStaticKeyProvider,
  decryptSecret,
  encryptSecret,
  getSecFnSchema,
} from "../src/index.js";

async function main() {
  const keyProvider = createStaticKeyProvider(
    process.env.SECFN_MASTER_KEY ?? "dev-master-key-change-in-production",
    "local",
  );
  const aad = buildSecretAad({
    tenantId: "tenant-a",
    namespace: "workspace-a",
    secretId: "secret_example",
    version: 1,
  });

  const encrypted = await encryptSecret("sk_live_example", keyProvider, aad);
  const decrypted = await decryptSecret(encrypted, keyProvider, aad);

  console.log("Encrypted algorithm:", encrypted.algorithm);
  console.log("Decrypted length:", decrypted.length);
  console.log("Schema tables:", getSecFnSchema().map((table) => table.modelName).join(", "));


}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
