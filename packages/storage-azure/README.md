# @superfunctions/storage-azure

Azure Blob Storage adapter for `@superfunctions/storage`.

## Installation

```bash
npm install @superfunctions/storage-azure
```

## Usage

```typescript
import { createAzureStorageAdapter } from '@superfunctions/storage-azure';

const connectionStringAdapter = createAzureStorageAdapter({
  containerName: 'my-container',
  connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
});

// Or use account name and key
const accountKeyAdapter = createAzureStorageAdapter({
  containerName: 'my-container',
  accountName: 'myaccount',
  accountKey: process.env.AZURE_STORAGE_ACCOUNT_KEY,
});

// Or use SAS token
const sasTokenAdapter = createAzureStorageAdapter({
  containerName: 'my-container',
  accountName: 'myaccount',
  sasToken: process.env.AZURE_STORAGE_SAS_TOKEN,
});
```

## Features

- ✅ Signed upload URLs (SAS tokens)
- ✅ Signed download URLs (SAS tokens)
- ✅ Multipart uploads (Azure block blobs)
- ✅ Proxy streaming upload
- ✅ Proxy streaming download

## Azure Block Blob Semantics

Azure Blob Storage uses "block blobs" with "block IDs" instead of S3-style multipart uploads. This adapter maps:

- **uploadId**: Azure commitment placeholder (client-generated)
- **partNumber**: Mapped to block ID (base64-encoded)
- **etag**: Block ID returned as the ETag for consistency

When completing a multipart upload, the adapter commits all blocks to finalize the blob.

## License

MIT
