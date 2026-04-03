# FileFn Python SDK

The **FileFn Python SDK** is a powerful library for implementing robust file management capabilities in your Python applications. It provides a complete "backend-in-a-box" for handling file uploads, storage abstraction, metadata management, processing pipelines (like image thumbnails), and secure sharing.

Designed to integrate seamlessly with the [Superfunctions](https://github.com/21nCo/super-functions) ecosystem, it delegates persistence and storage to pluggable adapters.

## Features

- **Chunked & Resumable Uploads:** Built-in support for creating upload sessions, handling multi-part uploads, and verifying completion.
- **Storage Abstraction:** Works with any `StorageAdapter` (S3, GCS, Azure, Local, etc.) provided by Superfunctions.
- **File Processing:** Extensible processing pipeline. Includes a built-in **Thumbnail Processor** for on-the-fly image resizing.
- **Deduplication:** Optional content-addressable storage logic to avoid storing duplicate files.
- **Security & Permissions:**
  - **Signed URLs:** Secure upload and download links.
  - **Grants System:** Fine-grained permissions (read/write/delete/share) for users/tenants.
  - **Policies:** Define storage and access policies.
- **Sharing:** Generate secure, expiring share links for public or restricted access.
- **Observability:** Built-in event emitter for tracking file operations.

## Installation

```bash
pip install filefn
```

## Quick Start

The core of the library is the `FileFn` class, initialized via `create_file_fn`. You need to provide database and storage adapters.

### 1. Setup & Initialization

```python
import asyncio
from filefn.server import create_file_fn, FileFnConfig
from filefn.processing.processors.thumbnail import create_thumbnail_processor, ThumbnailConfig

# Import adapters from your specific implementation or mocks
# from superfunctions.db.memory import MemoryAdapter
# from superfunctions.storage.local import LocalStorageAdapter

async def main():
    # 1. Initialize Adapters (replace these placeholders with real implementations)
    db_adapter = ...
    storage_adapter = ...

    # 2. Configure FileFn
    config = FileFnConfig(
        db=db_adapter,
        storage=storage_adapter,
        namespace="my-app-files",
        
        # Optional: Enable image thumbnail generation
        processing={
            "enabled": True,
            "processors": [
                create_thumbnail_processor(ThumbnailConfig(
                    format="jpeg",
                    quality=80,
                    sizes=[
                        {"name": "thumb", "width": 150, "height": 150},
                        {"name": "preview", "width": 800, "height": 600}
                    ]
                ))
            ]
        },
        
        # Security settings
        signed_url_ttl_seconds=3600, # 1 hour
    )

    # 3. Create the Service
    filefn = create_file_fn(config)

    # Now you can use filefn to manage files
    print("FileFn Service initialized!")

if __name__ == "__main__":
    asyncio.run(main())
```

### 2. Handling Uploads

FileFn uses a session-based approach for uploads (similar to S3 Multipart Uploads) to handle large files reliably.

```python
# 1. Create an Upload Session
session_input = {
    "fileName": "vacation_photo.jpg",
    "mimeType": "image/jpeg",
    "size": 1024 * 1024 * 5, # 5MB
    "ownerId": "user_123",
    "policy": "default"
}
# ctx is a context object, usually containing request/auth info
ctx = {} 
session = await filefn.create_upload_session(session_input, ctx)
print(f"Session created: {session['uploadSessionId']}")

# 2. Client uploads parts using signed URLs provided in the session...
# (The client would PUT data to session['parts'][0]['url'], etc.)

# 3. Complete the Session (after client finishes uploading)
await filefn.complete_upload_session({
    "uploadSessionId": session['uploadSessionId']
}, ctx)

print("Upload complete & file created!")
```

### 3. Listing & Downloading

```python
# List files for a specific owner
files = await filefn.list_files({
    "limit": 20
}, ctx)

for f in files["files"]:
    print(f"File: {f['name']} ({f['size']} bytes)")

# Get a download URL (Signed URL)
file_data = await filefn.get_file({"fileId": files["files"][0]["fileId"]}, ctx)
print(f"Download URL: {file_data['downloadUrl']}")
```

## Configuration Options

The `FileFnConfig` model accepts the following parameters:

| Parameter | Type | Description |
|-----------|------|-------------|
| `db` | `Adapter` | **Required.** Database adapter instance. |
| `storage` | `StorageAdapter` | **Required.** Storage adapter instance. |
| `namespace` | `str` | Table prefix for database (default: `'filefn'`). |
| `policies` | `List[Policy]` | Custom storage/access policies. |
| `processing` | `Dict` | Configuration for file processing (thumbnails, etc.). |
| `authorizer` | `Authorizer` | Optional custom authorization logic. |
| `quota` | `QuotaProvider` | Optional quota management provider. |
| `signed_url_ttl_seconds` | `int` | TTL for generated signed URLs (default: `900`). |
| `upload_session_ttl_seconds` | `int` | TTL for pending upload sessions (default: `86400`). |

## Processors

### Thumbnail Processor

Automatically generates image thumbnails upon upload completion.

```python
from filefn.processing.processors.thumbnail import create_thumbnail_processor, ThumbnailConfig

processor = create_thumbnail_processor(ThumbnailConfig(
    sizes=[
        {"name": "small", "width": 100, "height": 100},
        {"name": "large", "width": 1024, "height": 1024}
    ],
    format="webp", # 'jpeg', 'png', 'webp'
    quality=90
))
```

## Architecture

FileFn is built on a modular architecture:

- **Core Service (`FileFn`):** Orchestrates all operations.
- **UploadSessionService:** Manages the lifecycle of multipart uploads.
- **FileService:** Handles file metadata (indexing, searching) and deletion.
- **ProcessingService:** Runs background jobs (processors) on new files.
- **Adapters:** Decouples the logic from specific infrastructure (DB/Storage).

This design allows FileFn to run on your local machine, in a serverless function, or a dedicated container with equal ease.
