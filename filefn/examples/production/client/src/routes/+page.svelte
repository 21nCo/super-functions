<script lang="ts">
  import { onMount } from 'svelte';
  import { createFileFnClient } from '@filefn/client';

  const SERVER_URL = import.meta.env.VITE_FILEFN_SERVER_URL || 'http://localhost:3001';
  const API_BASE = `${SERVER_URL}/filefn`;

  const getAuthHeaders = async () => ({ Authorization: 'Bearer demo-token' });

  const client = createFileFnClient({
    baseUrl: API_BASE,
    getAuthHeaders,
    retryOptions: { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 15000 },
  });

  let files: any[] = [];
  let error = '';
  let uploading = false;
  let uploadStatus = '';
  let uploadProgress = 0;
  let uploadParts = { completed: 0, total: 0 };
  let selectedPolicy = 'images';
  let dragOver = false;
  let currentUploadSessionId = '';
  let abortedFile: File | null = null;
  let shareModalFileId = '';
  let shareModalFileName = '';
  let shareLinks: any[] = [];
  let shareExpiry = '';
  let shareMaxDownloads: number | null = null;
  let createdShareUrl = '';
  let versionsFileId = '';
  let versionsFileName = '';
  let versions: any[] = [];
  let activityLog: string[] = [];

  function log(msg: string) {
    activityLog = [`[${new Date().toLocaleTimeString()}] ${msg}`, ...activityLog.slice(0, 49)];
  }

  async function apiFetch(input: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    for (const [key, value] of Object.entries(await getAuthHeaders())) {
      headers.set(key, value);
    }
    return fetch(input, { ...init, headers });
  }

  async function loadFiles() {
    try {
      const res = await apiFetch(`${API_BASE}/?limit=50`);
      const body = await res.json();
      if (body.ok) files = body.data.files;
      else error = body.error?.message || 'Failed to list files';
    } catch (e: any) { error = 'Failed to load files: ' + e.message; }
  }

  async function startUpload(file: File) {
    uploading = true; uploadStatus = 'Initializing...'; uploadProgress = 0;
    uploadParts = { completed: 0, total: 0 }; error = ''; abortedFile = null;
    try {
      const handle = client.uploadFile({ file, policy: selectedPolicy });
      currentUploadSessionId = handle.uploadSessionId || '';
      handle.onProgress((p) => {
        uploadProgress = Math.round((p.bytesUploaded / p.bytesTotal) * 100);
        uploadParts = { completed: p.partsCompleted, total: p.totalParts };
        uploadStatus = `Uploading: ${uploadProgress}% (part ${p.partsCompleted}/${p.totalParts})`;
      });
      const result = await handle.done();
      currentUploadSessionId = handle.uploadSessionId || '';
      uploadStatus = 'Upload complete!';
      log(`Uploaded ${file.name} -> ${result.fileId}`);
      await loadFiles();
    } catch (err: any) {
      if (err.name === 'AbortError') {
        uploadStatus = 'Aborted. You can resume.'; abortedFile = file;
      } else { error = 'Upload failed: ' + err.message; }
    } finally { uploading = false; }
  }

  async function resumeUpload() {
    if (!abortedFile || !currentUploadSessionId) return;
    uploading = true; uploadStatus = 'Resuming...'; error = '';
    try {
      const handle = client.resumeUpload(currentUploadSessionId, abortedFile);
      handle.onProgress((p) => {
        uploadProgress = Math.round((p.bytesUploaded / p.bytesTotal) * 100);
        uploadParts = { completed: p.partsCompleted, total: p.totalParts };
        uploadStatus = `Resuming: ${uploadProgress}%`;
      });
      const result = await handle.done();
      uploadStatus = 'Done!'; abortedFile = null; currentUploadSessionId = '';
      log(`Resumed -> ${result.fileId}`); await loadFiles();
    } catch (err: any) { error = 'Resume failed: ' + err.message; }
    finally { uploading = false; }
  }

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files?.length) return;
    startUpload(input.files[0]); input.value = '';
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault(); dragOver = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) startUpload(file);
  }

  async function downloadFile(fileId: string) {
    try { const url = await client.downloadUrl(fileId); window.open(url, '_blank'); }
    catch (e: any) { alert('Download error: ' + e.message); }
  }

  async function downloadVersion(fileId: string, versionId: string) {
    try { const url = await client.downloadUrl(fileId, { versionId }); window.open(url, '_blank'); }
    catch (e: any) { alert('Download error: ' + e.message); }
  }

  async function deleteFile(fileId: string) {
    if (!confirm('Delete this file?')) return;
    try { await client.deleteFile(fileId); log(`Deleted ${fileId}`); await loadFiles(); }
    catch (e: any) { alert('Delete failed: ' + e.message); }
  }

  async function showVersions(fileId: string, fileName: string) {
    versionsFileId = fileId; versionsFileName = fileName;
    try {
      const res = await apiFetch(`${API_BASE}/${fileId}/versions`);
      const body = await res.json();
      versions = body.ok ? body.data.versions : [];
    } catch { versions = []; }
  }

  async function openShareModal(fileId: string, fileName: string) {
    shareModalFileId = fileId; shareModalFileName = fileName;
    shareExpiry = ''; shareMaxDownloads = null; createdShareUrl = '';
    try {
      const res = await apiFetch(`${API_BASE}/${fileId}/share-links`);
      const body = await res.json();
      shareLinks = body.ok ? body.data.shareLinks : [];
    } catch { shareLinks = []; }
  }

  async function createShareLink() {
    try {
      const payload: any = {};
      if (shareExpiry) payload.expiresAt = new Date(shareExpiry).toISOString();
      if (shareMaxDownloads && shareMaxDownloads > 0) payload.maxDownloads = shareMaxDownloads;
      const res = await apiFetch(`${API_BASE}/${shareModalFileId}/share-links`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (body.ok) {
        createdShareUrl = `${API_BASE}/share-links/${body.data.token}/download`;
        log(`Created share link for ${shareModalFileName}`);
        const res2 = await apiFetch(`${API_BASE}/${shareModalFileId}/share-links`);
        const body2 = await res2.json();
        shareLinks = body2.ok ? body2.data.shareLinks : [];
      } else { alert('Failed: ' + (body.error?.message || 'Unknown')); }
    } catch (e: any) { alert('Error: ' + e.message); }
  }

  async function revokeShareLink(token: string) {
    try {
      await apiFetch(`${API_BASE}/${shareModalFileId}/share-links/${token}`, { method: 'DELETE' });
      log('Revoked share link');
      const res = await apiFetch(`${API_BASE}/${shareModalFileId}/share-links`);
      const body = await res.json();
      shareLinks = body.ok ? body.data.shareLinks : [];
    } catch (e: any) { alert('Revoke failed: ' + e.message); }
  }

  async function getThumbnailUrl(fileId: string): Promise<string | null> {
    try {
      const res = await apiFetch(`${API_BASE}/${fileId}/artifacts`);
      const body = await res.json();
      if (!body.ok || !body.data.artifacts?.length) return null;
      const thumb = body.data.artifacts.find((a: any) => a.kind.startsWith('thumbnail-'));
      if (!thumb) return null;
      const dlRes = await apiFetch(`${API_BASE}/${fileId}/artifacts/${thumb.artifactId}/download`);
      const dlBody = await dlRes.json();
      return dlBody.ok ? dlBody.data.url : null;
    } catch { return null; }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1073741824).toFixed(1) + ' GB';
  }

  function formatDate(iso: string): string { return new Date(iso).toLocaleString(); }

  onMount(loadFiles);
</script>

<div class="app">
  <header>
    <h1>FileFn Production Demo</h1>
    <p class="sub">Postgres + S3 | Upload, Share, Versions, Thumbnails</p>
  </header>

  <section>
    <h2>Upload</h2>
    <div class="row">
      <label>Policy:
        <select bind:value={selectedPolicy} disabled={uploading}>
          <option value="images">Images (50MB)</option>
          <option value="documents">Documents (100MB)</option>
          <option value="general">General (200MB)</option>
        </select>
      </label>
    </div>
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="drop" class:over={dragOver} class:active={uploading}
      on:drop={handleDrop} on:dragover|preventDefault={() => dragOver = true}
      on:dragleave={() => dragOver = false}>
      {#if uploading}
        <div class="bar-bg"><div class="bar" style="width:{uploadProgress}%"></div></div>
        <p class="status">{uploadStatus}</p>
      {:else}
        <p>Drop file here or <input type="file" on:change={handleFileSelect} /></p>
      {/if}
    </div>
    {#if abortedFile}<button class="btn" on:click={resumeUpload}>Resume Upload</button>{/if}
    {#if error}<p class="err">{error}</p>{/if}
  </section>

  <section>
    <h2>Files ({files.length})</h2>
    {#if files.length === 0}<p class="muted">No files yet.</p>
    {:else}
      <div class="grid">
        {#each files as f (f.fileId)}
          <div class="card">
            <div class="preview">
              {#if f.mimeType?.startsWith('image/')}
                {#await getThumbnailUrl(f.fileId) then url}
                  {#if url}<img src={url} alt={f.name} />{:else}<span class="ph">{f.name}</span>{/if}
                {:catch}<span class="ph">{f.name}</span>{/await}
              {:else}<span class="ph ext">{f.name?.split('.').pop()?.toUpperCase()}</span>{/if}
            </div>
            <div class="info">
              <p class="name" title={f.name}>{f.name}</p>
              <p class="meta">{formatSize(f.size)} &middot; {f.mimeType?.split('/')[1]}</p>
            </div>
            <div class="actions">
              <button on:click={() => downloadFile(f.fileId)}>DL</button>
              <button on:click={() => showVersions(f.fileId, f.name)}>Ver</button>
              <button on:click={() => openShareModal(f.fileId, f.name)}>Share</button>
              <button class="dng" on:click={() => deleteFile(f.fileId)}>Del</button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  {#if versionsFileId}
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="overlay" on:click={() => { versionsFileId = ''; }} on:keydown={() => {}}>
      <div class="modal" on:click|stopPropagation={() => {}} on:keydown={() => {}}>
        <h3>Versions: {versionsFileName}</h3>
        <table><thead><tr><th>ID</th><th>Size</th><th>Date</th><th></th></tr></thead>
          <tbody>{#each versions as v}<tr>
            <td class="mono">{v.versionId}</td><td>{formatSize(v.size)}</td>
            <td>{formatDate(v.createdAt)}</td>
            <td><button on:click={() => downloadVersion(versionsFileId, v.versionId)}>DL</button></td>
          </tr>{/each}</tbody></table>
        <button class="btn" on:click={() => { versionsFileId = ''; }}>Close</button>
      </div>
    </div>
  {/if}

  {#if shareModalFileId}
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="overlay" on:click={() => { shareModalFileId = ''; }} on:keydown={() => {}}>
      <div class="modal" on:click|stopPropagation={() => {}} on:keydown={() => {}}>
        <h3>Share: {shareModalFileName}</h3>
        <div class="sform">
          <label>Expires: <input type="datetime-local" bind:value={shareExpiry} /></label>
          <label>Max DL: <input type="number" min="1" bind:value={shareMaxDownloads} placeholder="--" /></label>
          <button class="btn" on:click={createShareLink}>Create</button>
        </div>
        {#if createdShareUrl}
          <div class="sresult">
            <input readonly value={createdShareUrl} />
            <button on:click={() => navigator.clipboard.writeText(createdShareUrl)}>Copy</button>
          </div>
        {/if}
        {#if shareLinks.length}
          <h4>Links</h4>
          <ul class="slinks">{#each shareLinks as l}
            <li>
              <span class="mono">{l.tokenHash?.slice(0,12)}...</span>
              <span>{l.downloads}{l.maxDownloads ? '/'+l.maxDownloads : ''} DLs</span>
              {#if l.revokedAt}<span class="rev">Revoked</span>
              {:else}<button class="dng sm" on:click={() => revokeShareLink(l.tokenHash)}>Revoke</button>{/if}
            </li>
          {/each}</ul>
        {/if}
        <button class="btn" on:click={() => { shareModalFileId = ''; }}>Close</button>
      </div>
    </div>
  {/if}

  <section>
    <h2>Activity</h2>
    <div class="log">
      {#each activityLog as e}<div class="le">{e}</div>{/each}
      {#if !activityLog.length}<p class="muted">No activity yet.</p>{/if}
    </div>
  </section>
</div>

<style>
  :root { --bg:#0f1117; --sf:#1a1d27; --bd:#2a2d3a; --tx:#e1e4ed; --tm:#8b8fa3; --ac:#5b7ff5; --dg:#e5534b; }
  :global(body) { margin:0; background:var(--bg); color:var(--tx); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
  .app { max-width:960px; margin:0 auto; padding:2rem 1.5rem; }
  header h1 { margin:0; font-size:1.5rem; }
  .sub { margin:.25rem 0 0; color:var(--tm); font-size:.85rem; }
  h2 { font-size:1.1rem; margin:0 0 .75rem; }
  section { margin-bottom:2rem; }
  .row { margin-bottom:.75rem; }
  select { background:var(--sf); color:var(--tx); border:1px solid var(--bd); padding:.35rem .5rem; border-radius:4px; }
  .drop { border:2px dashed var(--bd); border-radius:8px; padding:2rem; text-align:center; transition:border-color .2s; }
  .drop.over { border-color:var(--ac); background:rgba(91,127,245,.05); }
  .drop.active { border-style:solid; border-color:var(--ac); }
  .bar-bg { background:var(--bd); border-radius:4px; height:8px; overflow:hidden; margin-bottom:.75rem; }
  .bar { background:var(--ac); height:100%; transition:width .3s; border-radius:4px; }
  .status { color:var(--ac); font-weight:500; }
  .err { color:var(--dg); margin-top:.5rem; }
  .muted { color:var(--tm); }
  .btn { background:var(--ac); color:#fff; border:none; padding:.4rem .8rem; border-radius:4px; cursor:pointer; font-size:.85rem; margin-top:.5rem; }
  .btn:hover { filter:brightness(1.1); }
  button { background:var(--sf); color:var(--tx); border:1px solid var(--bd); padding:.3rem .5rem; border-radius:4px; cursor:pointer; font-size:.8rem; }
  button:hover { border-color:var(--ac); }
  button.dng { color:var(--dg); } button.dng:hover { border-color:var(--dg); }
  button.sm { padding:.15rem .35rem; font-size:.75rem; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:1rem; }
  .card { background:var(--sf); border:1px solid var(--bd); border-radius:8px; overflow:hidden; display:flex; flex-direction:column; }
  .preview { height:120px; background:#12141c; display:flex; align-items:center; justify-content:center; overflow:hidden; }
  .preview img { max-width:100%; max-height:100%; object-fit:contain; }
  .ph { color:var(--tm); font-size:.8rem; text-align:center; padding:.5rem; word-break:break-all; }
  .ext { font-size:1.2rem; font-weight:bold; color:var(--ac); }
  .info { padding:.5rem .75rem; flex:1; }
  .name { margin:0; font-size:.85rem; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .meta { margin:.2rem 0 0; font-size:.75rem; color:var(--tm); }
  .actions { padding:.5rem .75rem; display:flex; gap:.35rem; border-top:1px solid var(--bd); }
  .overlay { position:fixed; inset:0; background:rgba(0,0,0,.6); display:flex; align-items:center; justify-content:center; z-index:100; }
  .modal { background:var(--sf); border:1px solid var(--bd); border-radius:8px; padding:1.5rem; max-width:600px; width:90%; max-height:80vh; overflow-y:auto; }
  .modal h3 { margin:0 0 1rem; } .modal h4 { margin:1rem 0 .5rem; font-size:.9rem; }
  table { width:100%; border-collapse:collapse; font-size:.8rem; margin-bottom:1rem; }
  th,td { text-align:left; padding:.4rem .5rem; border-bottom:1px solid var(--bd); }
  th { color:var(--tm); font-weight:500; }
  .mono { font-family:'SF Mono','Fira Code',monospace; font-size:.75rem; }
  .sform { display:flex; gap:.75rem; align-items:flex-end; flex-wrap:wrap; margin-bottom:1rem; }
  .sform label { display:flex; flex-direction:column; gap:.25rem; font-size:.85rem; }
  .sform input { background:var(--bg); color:var(--tx); border:1px solid var(--bd); padding:.35rem; border-radius:4px; font-size:.85rem; }
  .sresult { display:flex; gap:.5rem; margin-bottom:1rem; }
  .sresult input { flex:1; background:var(--bg); color:var(--ac); border:1px solid var(--ac); padding:.35rem; border-radius:4px; font-family:monospace; font-size:.8rem; }
  .slinks { list-style:none; padding:0; margin:0; }
  .slinks li { display:flex; gap:.75rem; align-items:center; padding:.4rem 0; border-bottom:1px solid var(--bd); font-size:.8rem; flex-wrap:wrap; }
  .rev { color:var(--dg); font-size:.75rem; }
  .log { background:var(--sf); border:1px solid var(--bd); border-radius:8px; padding:.75rem; max-height:200px; overflow-y:auto; font-family:'SF Mono','Fira Code',monospace; font-size:.75rem; }
  .le { padding:.15rem 0; color:var(--tm); }
</style>
