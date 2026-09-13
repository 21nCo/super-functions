import {
  buildSecretAad,
  createSecurityScanner,
  createStaticKeyProvider,
  decryptSecret,
  encryptSecret,
  formatFindingsTable,
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

  const scanner = createSecurityScanner();
  const findings = scanner.scanContent(
    "const token = 'ghp_aB3dE5gH7jK9mN2pQ4sT6vW8xY1zA3cD5fG7';",
    { path: "example.ts" },
  );
  console.log(formatFindingsTable(findings));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
