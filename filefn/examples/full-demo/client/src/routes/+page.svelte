<script lang="ts">
  import { onMount } from 'svelte';
  import { createFileFnClient } from '@filefn/client';

  let files: any[] = [];
  let uploadStatus = '';
  let uploading = false;
  let error = '';

  // Use absolute URL to connect directly to server (works with any server)
  // In production, this could be an environment variable
  const SERVER_URL = import.meta.env.VITE_FILEFN_SERVER_URL || 'http://localhost:3001';
  const API_BASE = `${SERVER_URL}/filefn`;

  // Client for uploads - uses absolute URL to work with any server
  const client = createFileFnClient({
    baseUrl: API_BASE,
    getAuthHeaders: async () => ({
      Authorization: 'Bearer demo-token'
    })
  });

  async function loadFiles() {
    try {
      const res = await fetch(`${API_BASE}/?limit=50`);
      const body = await res.json();
      if (body.ok) {
           files = body.data.files;
      } else {
           error = body.error?.message || 'Failed to list files';
      }
    } catch (e) {
      console.error(e);
      error = 'Failed to load files';
    }
  }

  async function getDownloadUrl(fileId: string) {
       const res = await fetch(`${API_BASE}/${fileId}/download`);
       const body = await res.json();
       if(body.ok) return body.data.url;
       throw new Error(body.error?.message || 'Failed to get url');
  }

  function resolveDownloadUrl(rawUrl: string) {
      if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
          return rawUrl;
      }

      // Demo API is mounted under /filefn; proxy routes must keep that prefix.
      if (rawUrl.startsWith('/proxy/')) {
          return `${API_BASE}${rawUrl}`;
      }

      return new URL(rawUrl, `${API_BASE}/`).toString();
  }

  async function downloadFile(fileId: string) {
      try {
          const rawUrl = await getDownloadUrl(fileId);
          const url = resolveDownloadUrl(rawUrl);
          window.open(url, '_blank');
      } catch(e: any) {
          alert('Download error: ' + e.message);
      }
  }

  async function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files?.length) return;

    uploading = true;
    uploadStatus = 'Starting upload...';
    error = '';

    const file = input.files[0];

    try {
        const handle = client.uploadFile({
            file,
            policy: 'public-image',
        });

        // Set up progress callback
        handle.onProgress((progress) => {
            uploadStatus = `Uploading: ${Math.round((progress.bytesUploaded / progress.bytesTotal) * 100)}%`;
        });

        // Actually start and wait for the upload to complete
        await handle.done();

        uploadStatus = 'Upload complete, processing...';
        await loadFiles();
        uploadStatus = 'Done!';
    } catch (err: any) {
        console.error(err);
        error = 'Upload failed: ' + err.message;
    } finally {
        uploading = false;
        input.value = ''; // Reset
    }
  }

  async function deleteFile(fileId: string) {
      if(!confirm('Are you sure?')) return;
      try {
          const res = await fetch(`${API_BASE}/${fileId}`, { method: 'DELETE' });
          const body = await res.json();
          if(!body.ok) throw new Error(body.error?.message);

          await loadFiles();
      } catch(e: any) {
          alert('Delete failed: ' + e.message);
      }
  }

  onMount(loadFiles);
</script>

<div class="container">
  <h1>FileFn Demo</h1>

  <div class="upload-section">
    <h2>Upload File</h2>
    <input type="file" on:change={handleFileSelect} disabled={uploading} />
    {#if uploadStatus}
        <p class="status">{uploadStatus}</p>
    {/if}
    {#if error}
        <p class="error">{error}</p>
    {/if}
  </div>

  <div class="file-list">
    <h2>My Files</h2>
    {#if files.length === 0}
        <p>No files yet.</p>
    {:else}
        <div class="grid">
            {#each files as file}
                <div class="card">
                    {#if file.mimeType.startsWith('image/')}
                         <div class="preview-placeholder">Image: {file.name}</div>
                    {:else}
                         <div class="preview-placeholder">File: {file.name}</div>
                    {/if}
                    <div class="info">
                        <small>{file.size} bytes</small>
                    </div>
                    <div class="actions">
                        <button on:click={() => deleteFile(file.fileId)}>Delete</button>
                        <button on:click={() => downloadFile(file.fileId)}>Download</button>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
  </div>
</div>

<style>
  .container { max-width: 800px; margin: 0 auto; padding: 2rem; font-family: sans-serif; }
  .upload-section { margin-bottom: 2rem; padding: 1rem; border: 2px dashed #ccc; border-radius: 8px; }
  .status { color: blue; }
  .error { color: red; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; }
  .card { border: 1px solid #eee; padding: 1rem; border-radius: 8px; display: flex; flex-direction: column; gap: 0.5rem; }
  .preview-placeholder { background: #f0f0f0; height: 100px; display: flex; align-items: center; justify-content: center; overflow: hidden; font-size: 0.8rem; }
  .actions { display: flex; justify-content: space-between; margin-top: auto; }
</style>
