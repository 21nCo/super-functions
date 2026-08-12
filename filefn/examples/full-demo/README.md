# FileFn Full Demo

This project demonstrates the full capabilities of FileFn including:

- Client-side file uploading with `@filefn/client`
- Server-side file handling with `@filefn/server`
- Custom storage adapter (in-memory for demo)
- Processing integration (configured but using defaults)
- File listing and downloading

## Structure

- `server`: Node.js server using Hono
- `client`: SvelteKit application

## Running the Demo

1. **Install Dependencies**
   Run from the root of the workspace:

   ```bash
   npm install
   ```

2. **Start Server**
   Navigate to `examples/full-demo/server`:

   ```bash
   cd filefn/examples/full-demo/server
   npm run dev
   ```

   Server will start on `http://localhost:3001`.

3. **Start Client**
   Navigate to `examples/full-demo/client`:

   ```bash
   cd filefn/examples/full-demo/client
   npm run dev
   ```

   Client will start on `http://localhost:5173`.
   If the demo server is on a different port, set `VITE_FILEFN_SERVER_URL` when starting the client.

4. **Verify**
   - Open `http://localhost:5173`
   - Upload a file (e.g., an image)
   - See it appear in the list
   - Click Download or Delete

## Automated Smoke Check (Optional)

With the server running, execute from the repository root:

```bash
node filefn/examples/full-demo/smoke.mjs
```

This verifies upload, list, download, and delete using the demo's canonical `@filefn/*` package flow.

If default ports are already in use, run:

```bash
PORT=3101 npm --prefix filefn/examples/full-demo/server run dev
VITE_FILEFN_SERVER_URL=http://localhost:3101 npm --prefix filefn/examples/full-demo/client run dev -- --port 5174
FILEFN_DEMO_BASE_URL=http://localhost:3101/filefn FILEFN_DEMO_CLIENT_BASE=http://localhost:5174 node filefn/examples/full-demo/smoke.mjs
```
