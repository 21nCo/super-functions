const JSON_CONTENT_TYPE = 'application/json';

function ref(path: string) {
  return { $ref: path };
}

function pathParameter(name: string, description: string) {
  return {
    name,
    in: 'path',
    required: true,
    description,
    schema: { type: 'string' },
  };
}

function queryParameter(name: string, schema: Record<string, unknown>, description: string, required = false) {
  return {
    name,
    in: 'query',
    required,
    description,
    schema,
  };
}

function successResponse(dataRef: string, description = 'Successful response') {
  return {
    description,
    content: {
      [JSON_CONTENT_TYPE]: {
        schema: {
          allOf: [
            ref('#/components/schemas/SuccessEnvelope'),
            {
              type: 'object',
              properties: {
                data: ref(dataRef),
              },
              required: ['data'],
            },
          ],
        },
      },
    },
  };
}

function errorResponse(description = 'Canonical FileFn error envelope') {
  return {
    description,
    content: {
      [JSON_CONTENT_TYPE]: {
        schema: ref('#/components/schemas/ErrorEnvelope'),
      },
    },
  };
}

function withBaseHeaders(parameters: any[], options: { includeAuth?: boolean; includeUploadToken?: boolean; includeIdempotency?: boolean } = {}) {
  const merged = [
    ref('#/components/parameters/XRequestID'),
    ref('#/components/parameters/XFileFnClientVersion'),
    ...parameters,
  ];
  if (options.includeAuth) merged.push(ref('#/components/parameters/Authorization'));
  if (options.includeUploadToken) merged.push(ref('#/components/parameters/XUploadSessionToken'));
  if (options.includeIdempotency) merged.push(ref('#/components/parameters/XIdempotencyKey'));
  return merged;
}

function operation(
  summary: string,
  options: {
    tags: string[];
    parameters?: any[];
    requestBody?: any;
    responses: Record<string, any>;
    includeAuth?: boolean;
    includeUploadToken?: boolean;
    includeIdempotency?: boolean;
  }
) {
  return {
    summary,
    tags: options.tags,
    parameters: withBaseHeaders(options.parameters ?? [], {
      includeAuth: options.includeAuth,
      includeUploadToken: options.includeUploadToken,
      includeIdempotency: options.includeIdempotency,
    }),
    ...(options.requestBody ? { requestBody: options.requestBody } : {}),
    responses: options.responses,
  };
}

const tags = [
  { name: 'files' },
  { name: 'uploads' },
  { name: 'artifacts' },
  { name: 'policies' },
  { name: 'quota' },
  { name: 'grants' },
  { name: 'shares' },
  { name: 'processing' },
];

export const fileFnClientContract = {
  openapi: '3.1.0',
  info: {
    title: 'FileFn Client Contract',
    version: 'v1',
    description: 'Deterministic OpenAPI contract for the FileFn HTTP surface supported by the Swift client.',
  },
  jsonSchemaDialect: 'https://spec.openapis.org/oas/3.1/dialect/base',
  servers: [
    {
      url: '/filefn',
      description: 'Canonical FileFn base path',
    },
  ],
  tags,
  paths: {
    '/': {
      get: operation('List files', {
        tags: ['files'],
        parameters: [
          queryParameter('cursor', { type: 'string' }, 'Opaque pagination cursor'),
          queryParameter('limit', { type: 'integer', minimum: 1, maximum: 100 }, 'Maximum number of files to return'),
        ],
        includeAuth: true,
        responses: {
          '200': successResponse('#/components/schemas/FilePage'),
          default: errorResponse(),
        },
      }),
    },
    '/{fileId}': {
      get: operation('Get file details', {
        tags: ['files'],
        parameters: [ref('#/components/parameters/FileID')],
        includeAuth: true,
        responses: {
          '200': successResponse('#/components/schemas/FileDetail'),
          default: errorResponse(),
        },
      }),
      delete: operation('Delete a file', {
        tags: ['files'],
        parameters: [ref('#/components/parameters/FileID')],
        includeAuth: true,
        responses: {
          '200': successResponse('#/components/schemas/DeleteResponse'),
          default: errorResponse(),
        },
      }),
    },
    '/{fileId}/download': {
      get: operation('Resolve file download', {
        tags: ['files'],
        parameters: [ref('#/components/parameters/FileID')],
        includeAuth: true,
        responses: {
          '200': successResponse('#/components/schemas/DownloadDescriptor'),
          default: errorResponse(),
        },
      }),
    },
    '/{fileId}/render': {
      get: operation('Resolve renderable file representation', {
        tags: ['files'],
        parameters: [
          ref('#/components/parameters/FileID'),
          queryParameter('intent', { type: 'string', enum: ['thumbnail', 'preview', 'full', 'download'] }, 'Requested render intent', true),
          queryParameter('versionId', { type: 'string' }, 'Optional version override'),
        ],
        includeAuth: true,
        responses: {
          '200': successResponse('#/components/schemas/RenderDescriptor'),
          default: errorResponse(),
        },
      }),
    },
    '/{fileId}/versions': {
      get: operation('List file versions', {
        tags: ['files'],
        parameters: [ref('#/components/parameters/FileID')],
        includeAuth: true,
        responses: {
          '200': successResponse('#/components/schemas/VersionPage'),
          default: errorResponse(),
        },
      }),
    },
    '/{fileId}/versions/{versionId}': {
      get: operation('Get version details', {
        tags: ['files'],
        parameters: [ref('#/components/parameters/FileID'), ref('#/components/parameters/VersionID')],
        includeAuth: true,
        responses: {
          '200': successResponse('#/components/schemas/VersionDetail'),
          default: errorResponse(),
        },
      }),
    },
    '/{fileId}/versions/{versionId}/download': {
      get: operation('Resolve version download', {
        tags: ['files'],
        parameters: [ref('#/components/parameters/FileID'), ref('#/components/parameters/VersionID')],
        includeAuth: true,
        responses: {
          '200': successResponse('#/components/schemas/DownloadDescriptor'),
          default: errorResponse(),
        },
      }),
    },
    '/upload/init': {
      post: operation('Initialize an upload session', {
        tags: ['uploads'],
        includeAuth: true,
        includeIdempotency: true,
        requestBody: {
          required: true,
          content: {
            [JSON_CONTENT_TYPE]: {
              schema: ref('#/components/schemas/CreateUploadSessionRequest'),
            },
          },
        },
        responses: {
          '200': successResponse('#/components/schemas/UploadSession'),
          default: errorResponse(),
        },
      }),
    },
    '/upload/{uploadSessionId}/status': {
      get: operation('Get upload session status', {
        tags: ['uploads'],
        parameters: [ref('#/components/parameters/UploadSessionID')],
        includeAuth: true,
        includeUploadToken: true,
        responses: {
          '200': successResponse('#/components/schemas/UploadStatus'),
          default: errorResponse(),
        },
      }),
    },
    '/upload/{uploadSessionId}/parts/{partNumber}/sign': {
      post: operation('Sign an upload part', {
        tags: ['uploads'],
        parameters: [ref('#/components/parameters/UploadSessionID'), ref('#/components/parameters/PartNumber')],
        includeAuth: true,
        includeUploadToken: true,
        requestBody: {
          required: true,
          content: {
            [JSON_CONTENT_TYPE]: {
              schema: ref('#/components/schemas/SignPartRequest'),
            },
          },
        },
        responses: {
          '200': successResponse('#/components/schemas/UploadPartSignature'),
          default: errorResponse(),
        },
      }),
    },
    '/upload/{uploadSessionId}/parts/{partNumber}': {
      put: operation('Upload part bytes', {
        tags: ['uploads'],
        parameters: [ref('#/components/parameters/UploadSessionID'), ref('#/components/parameters/PartNumber')],
        includeAuth: true,
        includeUploadToken: true,
        requestBody: {
          required: true,
          content: {
            'application/octet-stream': {
              schema: {
                type: 'string',
                format: 'binary',
              },
            },
          },
        },
        responses: {
          '200': successResponse('#/components/schemas/UploadedPart'),
          default: errorResponse(),
        },
      }),
    },
    '/upload/{uploadSessionId}/parts/{partNumber}/complete': {
      post: operation('Record upload part completion', {
        tags: ['uploads'],
        parameters: [ref('#/components/parameters/UploadSessionID'), ref('#/components/parameters/PartNumber')],
        includeAuth: true,
        includeUploadToken: true,
        requestBody: {
          required: true,
          content: {
            [JSON_CONTENT_TYPE]: {
              schema: ref('#/components/schemas/CompletePartRequest'),
            },
          },
        },
        responses: {
          '200': successResponse('#/components/schemas/RecordedPart'),
          default: errorResponse(),
        },
      }),
    },
    '/upload/{uploadSessionId}/complete': {
      post: operation('Complete an upload session', {
        tags: ['uploads'],
        parameters: [ref('#/components/parameters/UploadSessionID')],
        includeAuth: true,
        includeUploadToken: true,
        responses: {
          '200': successResponse('#/components/schemas/CompletedUpload'),
          default: errorResponse(),
        },
      }),
    },
    '/upload/{uploadSessionId}/abort': {
      post: operation('Abort an upload session', {
        tags: ['uploads'],
        parameters: [ref('#/components/parameters/UploadSessionID')],
        includeAuth: true,
        includeUploadToken: true,
        responses: {
          '200': successResponse('#/components/schemas/AbortResponse'),
          default: errorResponse(),
        },
      }),
    },
    '/{fileId}/artifacts': {
      get: operation('List processing artifacts', {
        tags: ['artifacts'],
        parameters: [ref('#/components/parameters/FileID')],
        includeAuth: true,
        responses: {
          '200': successResponse('#/components/schemas/ArtifactPage'),
          default: errorResponse(),
        },
      }),
    },
    '/{fileId}/artifacts/{artifactId}/download': {
      get: operation('Resolve artifact download', {
        tags: ['artifacts'],
        parameters: [ref('#/components/parameters/FileID'), ref('#/components/parameters/ArtifactID')],
        includeAuth: true,
        responses: {
          '200': successResponse('#/components/schemas/DownloadDescriptor'),
          default: errorResponse(),
        },
      }),
    },
    '/policies': {
      get: operation('List policies', {
        tags: ['policies'],
        includeAuth: true,
        responses: {
          '200': successResponse('#/components/schemas/PolicyPage'),
          default: errorResponse(),
        },
      }),
    },
    '/quota/storage': {
      get: operation('Get storage quota', {
        tags: ['quota'],
        includeAuth: true,
        responses: {
          '200': successResponse('#/components/schemas/StorageQuota'),
          default: errorResponse(),
        },
      }),
    },
    '/{fileId}/permissions': {
      post: operation('Create a grant', {
        tags: ['grants'],
        parameters: [ref('#/components/parameters/FileID')],
        includeAuth: true,
        requestBody: {
          required: true,
          content: {
            [JSON_CONTENT_TYPE]: {
              schema: ref('#/components/schemas/CreateGrantRequest'),
            },
          },
        },
        responses: {
          '201': successResponse('#/components/schemas/PermissionGrant', 'Created'),
          default: errorResponse(),
        },
      }),
      get: operation('List grants', {
        tags: ['grants'],
        parameters: [ref('#/components/parameters/FileID')],
        includeAuth: true,
        responses: {
          '200': successResponse('#/components/schemas/GrantPage'),
          default: errorResponse(),
        },
      }),
    },
    '/{fileId}/permissions/{permissionId}': {
      delete: operation('Revoke a grant', {
        tags: ['grants'],
        parameters: [ref('#/components/parameters/FileID'), ref('#/components/parameters/PermissionID')],
        includeAuth: true,
        responses: {
          '200': successResponse('#/components/schemas/RevokeResponse'),
          default: errorResponse(),
        },
      }),
    },
    '/{fileId}/share-links': {
      post: operation('Create a share link', {
        tags: ['shares'],
        parameters: [ref('#/components/parameters/FileID')],
        includeAuth: true,
        requestBody: {
          required: true,
          content: {
            [JSON_CONTENT_TYPE]: {
              schema: ref('#/components/schemas/CreateShareLinkRequest'),
            },
          },
        },
        responses: {
          '201': successResponse('#/components/schemas/ShareLink', 'Created'),
          default: errorResponse(),
        },
      }),
      get: operation('List share links', {
        tags: ['shares'],
        parameters: [ref('#/components/parameters/FileID')],
        includeAuth: true,
        responses: {
          '200': successResponse('#/components/schemas/SharePage'),
          default: errorResponse(),
        },
      }),
    },
    '/{fileId}/share-links/{token}': {
      delete: operation('Revoke a share link', {
        tags: ['shares'],
        parameters: [ref('#/components/parameters/FileID'), ref('#/components/parameters/Token')],
        includeAuth: true,
        responses: {
          '200': successResponse('#/components/schemas/RevokeResponse'),
          default: errorResponse(),
        },
      }),
    },
    '/share-links/{token}/download': {
      get: operation('Resolve a share-link download', {
        tags: ['shares'],
        parameters: [ref('#/components/parameters/Token')],
        responses: {
          '200': successResponse('#/components/schemas/ShareDownloadDescriptor'),
          default: errorResponse(),
        },
      }),
    },
    '/{fileId}/process': {
      post: operation('Trigger processing', {
        tags: ['processing'],
        parameters: [ref('#/components/parameters/FileID')],
        includeAuth: true,
        requestBody: {
          required: true,
          content: {
            [JSON_CONTENT_TYPE]: {
              schema: ref('#/components/schemas/TriggerProcessingRequest'),
            },
          },
        },
        responses: {
          '200': successResponse('#/components/schemas/ProcessingEnvelope'),
          default: errorResponse(),
        },
      }),
    },
  },
  components: {
    parameters: {
      XRequestID: {
        name: 'x-request-id',
        in: 'header',
        required: false,
        description: 'Opaque request correlation ID forwarded through FileFn envelopes.',
        schema: { type: 'string' },
      },
      XFileFnClientVersion: {
        name: 'x-filefn-client-version',
        in: 'header',
        required: false,
        description: 'Optional client version header emitted by FileFn clients.',
        schema: { type: 'string' },
      },
      Authorization: {
        name: 'Authorization',
        in: 'header',
        required: false,
        description: 'Bearer or custom authorization header resolved by the host app.',
        schema: { type: 'string' },
      },
      XIdempotencyKey: {
        name: 'x-idempotency-key',
        in: 'header',
        required: false,
        description: 'Optional idempotency key used for upload initialization.',
        schema: { type: 'string' },
      },
      XUploadSessionToken: {
        name: 'x-upload-session-token',
        in: 'header',
        required: false,
        description: 'Anonymous upload-session token required by protected upload routes.',
        schema: { type: 'string' },
      },
      FileID: pathParameter('fileId', 'Opaque FileFn file identifier.'),
      VersionID: pathParameter('versionId', 'Opaque FileFn version identifier.'),
      UploadSessionID: pathParameter('uploadSessionId', 'Opaque FileFn upload-session identifier.'),
      PermissionID: pathParameter('permissionId', 'Opaque FileFn permission grant identifier.'),
      ArtifactID: pathParameter('artifactId', 'Opaque FileFn artifact identifier.'),
      Token: pathParameter('token', 'Opaque FileFn share-link token.'),
      PartNumber: {
        name: 'partNumber',
        in: 'path',
        required: true,
        description: '1-based multipart upload part number.',
        schema: { type: 'integer', minimum: 1 },
      },
    },
    schemas: {
      SuccessEnvelope: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', const: true },
          requestId: { type: 'string' },
        },
        required: ['ok'],
      },
      ErrorEnvelope: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', const: false },
          requestId: { type: 'string' },
          error: ref('#/components/schemas/ServerError'),
        },
        required: ['ok', 'error'],
      },
      ServerError: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          message: { type: 'string' },
          details: {
            type: 'object',
            additionalProperties: true,
          },
        },
        required: ['code', 'message'],
      },
      JSONValue: {
        oneOf: [
          { type: 'string' },
          { type: 'number' },
          { type: 'integer' },
          { type: 'boolean' },
          { type: 'object', additionalProperties: true },
          { type: 'array', items: {} },
          { type: 'null' },
        ],
      },
      FileSummary: {
        type: 'object',
        properties: {
          fileId: { type: 'string' },
          currentVersionId: { type: 'string' },
          ownerId: { type: 'string' },
          tenantId: { type: 'string' },
          visibility: { type: 'string' },
          policy: { type: 'string' },
          mimeType: { type: 'string' },
          size: { type: 'integer' },
          name: { type: 'string' },
          metadata: { type: 'object', additionalProperties: ref('#/components/schemas/JSONValue') },
          createdAt: { type: 'string' },
          updatedAt: { type: 'string' },
        },
        required: ['fileId', 'currentVersionId', 'ownerId', 'tenantId', 'visibility', 'mimeType', 'size', 'name', 'createdAt', 'updatedAt'],
      },
      FilePage: {
        type: 'object',
        properties: {
          files: { type: 'array', items: ref('#/components/schemas/FileSummary') },
          nextCursor: { type: 'string' },
        },
        required: ['files'],
      },
      FileDetail: {
        type: 'object',
        properties: {
          fileId: { type: 'string' },
          currentVersionId: { type: 'string' },
          ownerId: { type: 'string' },
          tenantId: { type: 'string' },
          visibility: { type: 'string' },
          mimeType: { type: 'string' },
          size: { type: 'integer' },
          name: { type: 'string' },
          createdAt: { type: 'string' },
          updatedAt: { type: 'string' },
        },
        required: ['fileId', 'currentVersionId', 'ownerId', 'tenantId', 'visibility', 'mimeType', 'size', 'name', 'createdAt', 'updatedAt'],
      },
      DeleteResponse: {
        type: 'object',
        properties: {
          deleted: { type: 'boolean' },
        },
        required: ['deleted'],
      },
      DownloadDescriptor: {
        type: 'object',
        properties: {
          url: { type: 'string', format: 'uri-reference' },
          headers: {
            type: 'object',
            additionalProperties: { type: 'string' },
          },
          fileName: { type: 'string' },
          mimeType: { type: 'string' },
        },
        required: ['url'],
      },
      ShareDownloadDescriptor: {
        type: 'object',
        properties: {
          url: { type: 'string', format: 'uri-reference' },
          headers: {
            type: 'object',
            additionalProperties: { type: 'string' },
          },
          fileName: { type: 'string' },
          mimeType: { type: 'string' },
        },
        required: ['url', 'fileName', 'mimeType'],
      },
      RenderDescriptor: {
        type: 'object',
        properties: {
          fileId: { type: 'string' },
          versionId: { type: 'string' },
          intent: { type: 'string' },
          state: { type: 'string' },
          mimeType: { type: 'string' },
          name: { type: 'string' },
          size: { type: 'integer' },
          warnings: { type: 'array', items: { type: 'string' } },
          source: {
            type: 'object',
            properties: {
              mode: { type: 'string' },
              artifactId: { type: 'string' },
              artifactKind: { type: 'string' },
              url: { type: 'string', format: 'uri-reference' },
              headers: { type: 'object', additionalProperties: { type: 'string' } },
              placeholderKind: { type: 'string' },
            },
            required: ['mode'],
          },
        },
        required: ['fileId', 'versionId', 'intent', 'state', 'mimeType', 'name', 'size', 'source'],
      },
      VersionSummary: {
        type: 'object',
        properties: {
          versionId: { type: 'string' },
          size: { type: 'integer' },
          mimeType: { type: 'string' },
          createdAt: { type: 'string' },
        },
        required: ['versionId', 'size', 'mimeType', 'createdAt'],
      },
      VersionPage: {
        type: 'object',
        properties: {
          versions: { type: 'array', items: ref('#/components/schemas/VersionSummary') },
        },
        required: ['versions'],
      },
      VersionDetail: {
        type: 'object',
        properties: {
          versionId: { type: 'string' },
          fileId: { type: 'string' },
          size: { type: 'integer' },
          mimeType: { type: 'string' },
          createdAt: { type: 'string' },
        },
        required: ['versionId', 'fileId', 'size', 'mimeType', 'createdAt'],
      },
      CreateUploadSessionRequest: {
        type: 'object',
        properties: {
          policy: { type: 'string' },
          fileName: { type: 'string' },
          size: { type: 'integer' },
          mimeType: { type: 'string' },
          fileId: { type: 'string' },
          metadata: { type: 'object', additionalProperties: ref('#/components/schemas/JSONValue') },
        },
        required: ['policy', 'fileName', 'size', 'mimeType'],
      },
      UploadSession: {
        type: 'object',
        properties: {
          uploadSessionId: { type: 'string' },
          uploadSessionToken: { type: 'string' },
          uploadMode: { type: 'string', enum: ['multipart-signed-url', 'proxy'] },
          chunkSizeBytes: { type: 'integer' },
          totalParts: { type: 'integer' },
          expiresAt: { type: 'string' },
        },
        required: ['uploadSessionId', 'uploadMode', 'chunkSizeBytes', 'totalParts', 'expiresAt'],
      },
      UploadStatus: {
        type: 'object',
        properties: {
          uploadSessionId: { type: 'string' },
          status: { type: 'string' },
          totalParts: { type: 'integer' },
          recordedParts: { type: 'array', items: { type: 'integer' } },
          uploadedParts: { type: 'array', items: { type: 'integer' } },
          chunkSizeBytes: { type: 'integer' },
          fileSize: { type: 'integer' },
          expiresAt: { type: 'string' },
        },
        required: ['uploadSessionId', 'status', 'totalParts', 'recordedParts', 'uploadedParts', 'chunkSizeBytes', 'fileSize', 'expiresAt'],
      },
      SignPartRequest: {
        type: 'object',
        properties: {
          contentLength: { type: 'integer' },
        },
        required: ['contentLength'],
      },
      UploadPartSignature: {
        type: 'object',
        properties: {
          url: { type: 'string', format: 'uri-reference' },
          headers: { type: 'object', additionalProperties: { type: 'string' } },
          expiresAt: { type: 'string' },
        },
        required: ['url', 'headers', 'expiresAt'],
      },
      CompletePartRequest: {
        type: 'object',
        properties: {
          etag: { type: 'string' },
          size: { type: 'integer' },
        },
        required: ['etag', 'size'],
      },
      UploadedPart: {
        type: 'object',
        properties: {
          etag: { type: 'string' },
          size: { type: 'integer' },
          recorded: { type: 'boolean' },
        },
        required: ['etag', 'size', 'recorded'],
      },
      RecordedPart: {
        type: 'object',
        properties: {
          recorded: { type: 'boolean' },
        },
        required: ['recorded'],
      },
      CompletedUpload: {
        type: 'object',
        properties: {
          fileId: { type: 'string' },
          versionId: { type: 'string' },
        },
        required: ['fileId', 'versionId'],
      },
      AbortResponse: {
        type: 'object',
        properties: {
          aborted: { type: 'boolean' },
        },
        required: ['aborted'],
      },
      ArtifactDescriptor: {
        type: 'object',
        properties: {
          artifactId: { type: 'string' },
          kind: { type: 'string' },
          mimeType: { type: 'string' },
          size: { type: 'integer' },
          createdAt: { type: 'string' },
        },
        required: ['artifactId', 'kind', 'mimeType', 'size', 'createdAt'],
      },
      ArtifactPage: {
        type: 'object',
        properties: {
          artifacts: { type: 'array', items: ref('#/components/schemas/ArtifactDescriptor') },
        },
        required: ['artifacts'],
      },
      PolicySummary: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          maxSizeBytes: { type: 'integer' },
          contentTypes: { type: 'array', items: { type: 'string' } },
          visibility: { type: 'string' },
        },
        required: ['name', 'maxSizeBytes', 'contentTypes', 'visibility'],
      },
      PolicyPage: {
        type: 'object',
        properties: {
          policies: { type: 'array', items: ref('#/components/schemas/PolicySummary') },
        },
        required: ['policies'],
      },
      StorageQuota: {
        type: 'object',
        properties: {
          current: { type: 'integer' },
          limit: { type: 'integer' },
        },
        required: ['current', 'limit'],
      },
      CreateGrantRequest: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          role: { type: 'string' },
          tenantId: { type: 'string' },
          canRead: { type: 'boolean' },
          canWrite: { type: 'boolean' },
          canDelete: { type: 'boolean' },
          canShare: { type: 'boolean' },
          expiresAt: { type: 'string' },
        },
      },
      PermissionGrant: {
        type: 'object',
        properties: {
          permissionId: { type: 'string' },
          fileId: { type: 'string' },
          userId: { type: 'string' },
          role: { type: 'string' },
          tenantId: { type: 'string' },
          canRead: { type: 'boolean' },
          canWrite: { type: 'boolean' },
          canDelete: { type: 'boolean' },
          canShare: { type: 'boolean' },
          expiresAt: { type: 'string' },
          createdAt: { type: 'string' },
        },
        required: ['permissionId', 'fileId', 'canRead', 'canWrite', 'canDelete', 'canShare', 'createdAt'],
      },
      GrantPage: {
        type: 'object',
        properties: {
          permissions: { type: 'array', items: ref('#/components/schemas/PermissionGrant') },
        },
        required: ['permissions'],
      },
      RevokeResponse: {
        type: 'object',
        properties: {
          revoked: { type: 'boolean' },
        },
        required: ['revoked'],
      },
      CreateShareLinkRequest: {
        type: 'object',
        properties: {
          versionId: { type: 'string' },
          expiresAt: { type: 'string' },
          requiresAuth: { type: 'boolean' },
          maxDownloads: { type: 'integer' },
        },
      },
      ShareLink: {
        type: 'object',
        properties: {
          token: { type: 'string' },
          url: { type: 'string', format: 'uri-reference' },
          expiresAt: { type: 'string' },
          versionId: { type: 'string' },
          requiresAuth: { type: 'boolean' },
          maxDownloads: { type: 'integer' },
        },
        required: ['token'],
      },
      ShareLinkSummary: {
        type: 'object',
        properties: {
          tokenHashPrefix: { type: 'string' },
          fileId: { type: 'string' },
          versionId: { type: 'string' },
          expiresAt: { type: 'string' },
          requiresAuth: { type: 'boolean' },
          maxDownloads: { type: 'integer' },
          downloads: { type: 'integer' },
          createdAt: { type: 'string' },
          revokedAt: { type: 'string' },
        },
        required: ['tokenHashPrefix', 'fileId', 'requiresAuth', 'downloads', 'createdAt'],
      },
      SharePage: {
        type: 'object',
        properties: {
          shares: { type: 'array', items: ref('#/components/schemas/ShareLinkSummary') },
        },
        required: ['shares'],
      },
      TriggerProcessingRequest: {
        type: 'object',
        properties: {
          versionId: { type: 'string' },
          storageKey: { type: 'string' },
          mimeType: { type: 'string' },
          size: { type: 'integer' },
          fileName: { type: 'string' },
          processors: { type: 'array', items: { type: 'string' } },
        },
        required: ['storageKey', 'mimeType', 'size', 'fileName'],
      },
      ProcessingStatus: {
        type: 'object',
        properties: {
          started: { type: 'boolean' },
          enqueued: { type: 'boolean' },
          jobId: { type: 'string' },
        },
        required: ['started', 'enqueued'],
      },
      ProcessingEnvelope: {
        type: 'object',
        properties: {
          processing: ref('#/components/schemas/ProcessingStatus'),
        },
        required: ['processing'],
      },
    },
  },
} as const;

export function stringifyFileFnClientContract() {
  return JSON.stringify(fileFnClientContract, null, 2) + '\n';
}
