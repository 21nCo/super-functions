# Cross-Framework Demo

This demo shows the **same router** working identically across 5 different web frameworks:
- Express
- Hono
- Fastify
- Next.js (App Router)
- SvelteKit

## The Magic ✨

All implementations use the **exact same router definition** from `shared-router.ts`. This demonstrates the core value proposition: **write once, deploy anywhere**.

## Quick Start

### 1. Express (Port 3001)

```bash
cd examples/cross-framework-demo
npx tsx express/server.ts
```

Test:
```bash
curl http://localhost:3001/api/users
```

### 2. Hono (Port 3002)

```bash
cd examples/cross-framework-demo
npx tsx hono/server.ts
```

Test:
```bash
curl http://localhost:3002/api/users
```

### 3. Fastify (Port 3003)

```bash
cd examples/cross-framework-demo
npx tsx fastify/server.ts
```

Test:
```bash
curl http://localhost:3003/api/users
```

### 4. Next.js (Port 3004)

The Next.js and SvelteKit examples require full project setup. See their respective directories for instructions.

## API Endpoints

All implementations expose the same REST API:

### Health Check
```bash
GET /api/health
# Returns: { "status": "ok", "timestamp": "..." }
```

### List Users
```bash
GET /api/users
# Returns: { "users": [...], "total": 3 }

# With pagination
GET /api/users?limit=2
```

### Get User by ID
```bash
GET /api/users/:id
# Returns: { "user": { "id": "1", "name": "Alice", ... } }
```

### Create User
```bash
POST /api/users
Content-Type: application/json

{
  "name": "David",
  "email": "david@example.com"
}

# Returns: { "user": { "id": "4", ... } }
```

### Update User
```bash
PUT /api/users/:id
Content-Type: application/json

{
  "name": "Alice Updated"
}

# Returns: { "user": { ... } }
```

### Delete User
```bash
DELETE /api/users/:id
# Returns: { "success": true }
```

## Testing All Frameworks

Run this script to test all three standalone servers:

```bash
# Terminal 1: Start Express
npx tsx express/server.ts

# Terminal 2: Start Hono
npx tsx hono/server.ts

# Terminal 3: Start Fastify
npx tsx fastify/server.ts

# Terminal 4: Test all
curl http://localhost:3001/api/users  # Express
curl http://localhost:3002/api/users  # Hono
curl http://localhost:3003/api/users  # Fastify
```

All three should return identical responses!

## Key Features Demonstrated

### 1. Identical Behavior
The same router logic runs on all frameworks without modification.

### 2. Path Parameters
```typescript
'/api/users/:id'  // Works everywhere
```

### 3. Query Parameters
```typescript
ctx.query.get('limit')  // Same API
```

### 4. Request Body Parsing
```typescript
await ctx.json()  // Unified interface
```

### 5. Middleware
Logging middleware runs on all frameworks:
```
→ GET /api/users
← GET /api/users 200 (5ms)
```

### 6. Error Handling
404s and validation errors work identically.

## Framework-Specific Notes

### Express
- Requires `express.json()` middleware for body parsing
- Uses Express Router internally
- Traditional middleware stack

### Hono
- Zero overhead (uses Web Standards natively)
- Edge runtime compatible
- Smallest adapter (37 lines)

### Fastify
- Uses plugin architecture
- Built-in JSON serialization
- Async-first design

### Next.js
- File-based routing
- Edge runtime compatible
- Export HTTP methods from route files

### SvelteKit
- File-based routing with `+server.ts`
- Edge runtime compatible
- Full TypeScript support

## Architecture

```
shared-router.ts (Framework-Agnostic)
       ↓
   @superfunctions/http (Core)
       ↓
   ┌────┴─────┬─────┬──────┬────────┐
   ↓          ↓     ↓      ↓        ↓
Express    Hono  Fastify  Next.js  SvelteKit
(Adapter) (Adapter) (Adapter) (Adapter) (Adapter)
```

## Benefits

✅ **Write Once**: Single router definition  
✅ **Deploy Anywhere**: Works on 5+ frameworks  
✅ **Zero Lock-in**: Switch frameworks without rewriting  
✅ **Type Safe**: Full TypeScript support  
✅ **Testable**: Test business logic independently  

## What's Different?

### Traditional Approach
```typescript
// express-app.ts
app.get('/users/:id', async (req, res) => { ... });

// hono-app.ts
app.get('/users/:id', async (c) => { ... });

// fastify-app.ts
fastify.get('/users/:id', async (request, reply) => { ... });

// ❌ Three different implementations!
```

### With @superfunctions/http
```typescript
// shared-router.ts
const router = createRouter({
  routes: [
    { method: 'GET', path: '/users/:id', handler: ... }
  ]
});

// ✅ One implementation, use anywhere!
```

## Learn More

- [Core Package](../../packages/http/README.md)
- [Express Adapter](../../packages/http-express/README.md)
- [Hono Adapter](../../packages/http-hono/README.md)
- [Fastify Adapter](../../packages/http-fastify/README.md)
- [Next.js Adapter](../../packages/http-next/README.md)
- [SvelteKit Adapter](../../packages/http-sveltekit/README.md)

## License

MIT
