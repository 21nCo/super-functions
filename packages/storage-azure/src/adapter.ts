import { createHash, randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  ContainerClient,
  BlobSASPermissions,
  generateBlobSASQueryParameters,
  SASProtocol,
} from '@azure/storage-blob';
import type {
  StorageAdapter,
  StorageAdapterCapabilities,
  StorageObjectStat,
  SignedUrlConstraints,
} from '@superfunctions/storage';
import {
  assertMultipartParts,
  createNotFoundError,
  isNotFoundError,
} from '@superfunctions/storage/internal/errors';

export interface AzureStorageConfig {
  containerName: string;
  connectionString?: string;
  accountName?: string;
  accountKey?: string;
  sasToken?: string;
  endpoint?: string;
}

type AzureMultipartUploadId = {
  key: string;
  sessionId: string;
};

function toAzureUploadError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function normalizeSasToken(sasToken: string): string {
  return sasToken.replace(/^\?+/, '');
}

function encodeUploadId(key: string): string {
  return Buffer.from(
    JSON.stringify({
      key,
      sessionId: randomUUID(),
    } satisfies AzureMultipartUploadId),
    'utf8'
  ).toString('base64');
}

function decodeUploadId(uploadId: string): AzureMultipartUploadId {
  const decoded = Buffer.from(uploadId, 'base64').toString('utf8');

  try {
    const parsed = JSON.parse(decoded) as Partial<AzureMultipartUploadId>;
    if (
      typeof parsed.key === 'string' &&
      parsed.key.length > 0 &&
      typeof parsed.sessionId === 'string' &&
      parsed.sessionId.length > 0
    ) {
      return {
        key: parsed.key,
        sessionId: parsed.sessionId,
      };
    }
  } catch {
    // Fall through to support legacy uploadIds that were just base64(key).
  }

  if (decoded.length > 0) {
    return {
      key: decoded,
      sessionId: uploadId,
    };
  }

  throw new Error('Invalid Azure multipart uploadId');
}

function createContainerClient(config: AzureStorageConfig): {
  containerClient: ContainerClient;
  credential?: StorageSharedKeyCredential;
  accountName?: string;
} {
  const { containerName, connectionString, accountName, accountKey, sasToken, endpoint } = config;

  if (connectionString) {
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    
    // Extract account name and credential from connection string for SAS generation
    const accountNameMatch = connectionString.match(/AccountName=([^;]+)/);
    const accountKeyMatch = connectionString.match(/AccountKey=([^;]+)/);
    const extractedAccountName = accountNameMatch?.[1];
    const extractedAccountKey = accountKeyMatch?.[1];
    
    const credential = extractedAccountName && extractedAccountKey
      ? new StorageSharedKeyCredential(extractedAccountName, extractedAccountKey)
      : undefined;

    return { containerClient, credential, accountName: extractedAccountName };
  }

  if (accountName && accountKey) {
    const credential = new StorageSharedKeyCredential(accountName, accountKey);
    const blobServiceClient = new BlobServiceClient(
      endpoint || `https://${accountName}.blob.core.windows.net`,
      credential
    );
    const containerClient = blobServiceClient.getContainerClient(containerName);
    return { containerClient, credential, accountName };
  }

  if (accountName && sasToken) {
    const blobServiceClient = new BlobServiceClient(
      `${endpoint || `https://${accountName}.blob.core.windows.net`}?${normalizeSasToken(sasToken)}`
    );
    const containerClient = blobServiceClient.getContainerClient(containerName);
    return { containerClient, accountName };
  }

  throw new Error('Azure storage config requires either connectionString or (accountName + accountKey) or (accountName + sasToken)');
}

function generateBlockId(uploadId: string, partNumber: number): string {
  return createHash('sha256')
    .update(`${uploadId}:${String(partNumber).padStart(6, '0')}`, 'utf8')
    .digest('base64');
}

export function createAzureStorageAdapter(config: AzureStorageConfig): StorageAdapter {
  const { containerClient, credential, accountName } = createContainerClient(config);
  const supportsSignedUrls = Boolean(credential && accountName);

  const capabilities: StorageAdapterCapabilities = {
    signedUploadUrls: supportsSignedUrls,
    signedDownloadUrls: supportsSignedUrls,
    multipart: supportsSignedUrls,
    proxyStreamingUpload: true,
    proxyStreamingDownload: true,
  };

  // Stateless adapter: no activeUploads map

  return {
    name: 'azure',
    capabilities,

    async statObject(input: { key: string }): Promise<StorageObjectStat> {
      try {
        const blobClient = containerClient.getBlobClient(input.key);
        const properties = await blobClient.getProperties();

        return {
          key: input.key,
          size: properties.contentLength ?? 0,
          contentType: properties.contentType,
          etag: properties.etag,
          lastModifiedAt: properties.lastModified?.toISOString(),
        };
      } catch (err: unknown) {
        if (isNotFoundError(err, { statusCode: 404, stringCodes: ['BlobNotFound'] })) {
          throw createNotFoundError();
        }
        throw err;
      }
    },

    async deleteObject(input: { key: string }): Promise<void> {
      const blobClient = containerClient.getBlobClient(input.key);
      await blobClient.deleteIfExists();
    },

    async signUploadUrl(input: {
      key: string;
      expiresInSeconds: number;
      constraints?: SignedUrlConstraints;
    }): Promise<{ url: string; headers?: Record<string, string> }> {
      if (!credential || !accountName) {
        throw new Error('SAS URL generation requires accountName and credential (accountKey)');
      }

      const blobClient = containerClient.getBlobClient(input.key);
      const blockBlobClient = blobClient.getBlockBlobClient();

      const startsOn = new Date();
      const expiresOn = new Date(startsOn.getTime() + input.expiresInSeconds * 1000);

      const permissions = BlobSASPermissions.parse('w'); // write

      const sasToken = generateBlobSASQueryParameters(
        {
          containerName: config.containerName,
          blobName: input.key,
          permissions,
          startsOn,
          expiresOn,
          protocol: SASProtocol.Https,
          contentType: input.constraints?.contentType,
        },
        credential
      ).toString();

      const url = `${blockBlobClient.url}?${sasToken}`;

      const headers: Record<string, string> = {
        'x-ms-blob-type': 'BlockBlob',
      };
      if (input.constraints?.contentType) {
        headers['x-ms-blob-content-type'] = input.constraints.contentType;
      }

      return { url, headers: Object.keys(headers).length > 0 ? headers : undefined };
    },

    async signDownloadUrl(input: {
      key: string;
      expiresInSeconds: number;
      constraints?: { responseContentType?: string };
    }): Promise<{ url: string; headers?: Record<string, string> }> {
      if (!credential || !accountName) {
        throw new Error('SAS URL generation requires accountName and credential (accountKey)');
      }

      const blobClient = containerClient.getBlobClient(input.key);

      const startsOn = new Date();
      const expiresOn = new Date(startsOn.getTime() + input.expiresInSeconds * 1000);

      const permissions = BlobSASPermissions.parse('r'); // read

      const sasToken = generateBlobSASQueryParameters(
        {
          containerName: config.containerName,
          blobName: input.key,
          permissions,
          startsOn,
          expiresOn,
          protocol: SASProtocol.Https,
          contentType: input.constraints?.responseContentType,
        },
        credential
      ).toString();

      const url = `${blobClient.url}?${sasToken}`;

      return { url };
    },

    async createMultipartUpload(input: {
      key: string;
      contentType?: string;
      metadata?: Record<string, string>;
    }): Promise<{ uploadId: string }> {
      const uploadId = encodeUploadId(input.key);
      return { uploadId };
    },

    async signMultipartUploadPartUrl(input: {
      key: string;
      uploadId: string;
      partNumber: number;
      expiresInSeconds: number;
      constraints?: SignedUrlConstraints;
    }): Promise<{ url: string; headers?: Record<string, string> }> {
      if (!credential || !accountName) {
        throw new Error('SAS URL generation requires accountName and credential (accountKey)');
      }

      // Verify uploadId matches key (stateless check)
      const decodedUpload = decodeUploadId(input.uploadId);
      if (decodedUpload.key !== input.key) {
        throw new Error(`Invalid uploadId for key: ${input.key}`);
      }

      const blockBlobClient = containerClient.getBlockBlobClient(input.key);
      const blockId = generateBlockId(input.uploadId, input.partNumber);

      const startsOn = new Date();
      const expiresOn = new Date(startsOn.getTime() + input.expiresInSeconds * 1000);

      const permissions = BlobSASPermissions.parse('w'); // write

      const sasToken = generateBlobSASQueryParameters(
        {
          containerName: config.containerName,
          blobName: input.key,
          permissions,
          startsOn,
          expiresOn,
          protocol: SASProtocol.Https,
        },
        credential
      ).toString();

      // The URL must include the blockid query parameter for PutBlock operation
      const url = `${blockBlobClient.url}?comp=block&blockid=${encodeURIComponent(blockId)}&${sasToken}`;

      return { url };
    },

    async completeMultipartUpload(input: {
      key: string;
      uploadId: string;
      parts: Array<{ partNumber: number; etag: string }>;
    }): Promise<void> {
      assertMultipartParts(input.parts);

      // Verify uploadId
      const decodedUpload = decodeUploadId(input.uploadId);
      if (decodedUpload.key !== input.key) {
        throw new Error(`Invalid uploadId for key: ${input.key}`);
      }

      const blockBlobClient = containerClient.getBlockBlobClient(input.key);

      // In Azure, the etag from each part is actually the blockId we generated
      // Sort parts and commit blocks
      const sortedParts = [...input.parts].sort((a, b) => a.partNumber - b.partNumber);
      const blockList = sortedParts.map((part) => generateBlockId(input.uploadId, part.partNumber));

      await blockBlobClient.commitBlockList(blockList);
    },

    async abortMultipartUpload(input: { key: string; uploadId: string }): Promise<void> {
      // Azure automatically garbage-collects uncommitted blocks after 7 days
      // No explicit cleanup needed for stateless tracking
    },

    async openUploadStream(input: { key: string; contentType?: string }): Promise<WritableStream> {
      const blockBlobClient = containerClient.getBlockBlobClient(input.key);
      const stream = new PassThrough();
      let uploadError: Error | undefined;
      stream.on('error', (error) => {
        uploadError = toAzureUploadError(error);
      });
      const uploadPromise = blockBlobClient.uploadStream(stream, 4 * 1024 * 1024, 5, {
        blobHTTPHeaders: {
          blobContentType: input.contentType,
        },
      });
      void uploadPromise.catch((error) => {
        uploadError = toAzureUploadError(error);
      });
      return new WritableStream({
        async write(chunk) {
          if (uploadError) {
            throw uploadError;
          }
          const buf = chunk instanceof Uint8Array ? Buffer.from(chunk) : chunk;
          if (stream.write(buf)) {
            return;
          }
          await new Promise<void>((resolve, reject) => {
            const cleanup = () => {
              stream.off('drain', onDrain);
              stream.off('error', onError);
            };
            const onDrain = () => {
              cleanup();
              resolve();
            };
            const onError = (err: Error) => {
              cleanup();
              reject(err);
            };
            stream.once('drain', onDrain);
            stream.once('error', onError);
          });
        },
        async close() {
          if (uploadError) {
            throw uploadError;
          }
          stream.end();
          await uploadPromise;
        },
        abort(reason) {
          stream.destroy(reason instanceof Error ? reason : new Error(String(reason)));
          void uploadPromise.catch(() => undefined);
        },
      });
    },

    async openDownloadStream(input: {
      key: string;
      range?: { start: number; endInclusive: number };
    }): Promise<ReadableStream> {
      const blobClient = containerClient.getBlobClient(input.key);

      try {
        const exists = await blobClient.exists();
        if (!exists) {
          const notFoundError = new Error('Object not found') as Error & { code: string };
          notFoundError.code = 'STORAGE_NOT_FOUND';
          throw notFoundError;
        }
      } catch (err: unknown) {
        if (err instanceof Error && 'code' in err && err.code === 'STORAGE_NOT_FOUND') {
          throw err;
        }
        throw err;
      }

      const downloadOptions = input.range
        ? { offset: input.range.start, count: input.range.endInclusive - input.range.start + 1 }
        : undefined;

      const response = await blobClient.download(downloadOptions?.offset, downloadOptions?.count);

      if (!response.readableStreamBody) {
        throw new Error('No readable stream in download response');
      }

      const nodeStream = response.readableStreamBody as NodeJS.ReadableStream;

      return new ReadableStream({
        start(controller) {
          nodeStream.on('data', (chunk: Buffer | string) => {
            const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
            controller.enqueue(new Uint8Array(buffer));
          });
          nodeStream.on('end', () => {
            controller.close();
          });
          nodeStream.on('error', (err) => {
            controller.error(err);
          });
        },
        cancel() {
          if ('destroy' in nodeStream && typeof nodeStream.destroy === 'function') {
            nodeStream.destroy();
          }
        },
      });
    },
  };
}
