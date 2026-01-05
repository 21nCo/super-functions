/**
 * Shared Router Definition
 * 
 * This router is framework-agnostic and works identically across
 * Express, Hono, Fastify, Next.js, and SvelteKit.
 */

import { createRouter } from '@superfunctions/http';

// Mock database
const users = [
  { id: '1', name: 'Alice', email: 'alice@example.com' },
  { id: '2', name: 'Bob', email: 'bob@example.com' },
  { id: '3', name: 'Charlie', email: 'charlie@example.com' },
];

// Shared API router
export const apiRouter = createRouter({
  routes: [
    // Health check
    {
      method: 'GET',
      path: '/api/health',
      handler: async () => {
        return Response.json({ 
          status: 'ok', 
          timestamp: new Date().toISOString() 
        });
      },
    },

    // List all users
    {
      method: 'GET',
      path: '/api/users',
      handler: async (req, ctx) => {
        // Support pagination via query params
        const limit = ctx.query.get('limit');
        const userList = limit ? users.slice(0, Number(limit)) : users;
        
        return Response.json({ 
          users: userList,
          total: users.length 
        });
      },
    },

    // Get user by ID
    {
      method: 'GET',
      path: '/api/users/:id',
      handler: async (req, ctx) => {
        const user = users.find(u => u.id === ctx.params.id);
        
        if (!user) {
          return Response.json(
            { error: 'User not found' },
            { status: 404 }
          );
        }
        
        return Response.json({ user });
      },
    },

    // Create new user
    {
      method: 'POST',
      path: '/api/users',
      handler: async (req, ctx) => {
        const body = await ctx.json();
        
        if (!body.name || !body.email) {
          return Response.json(
            { error: 'Name and email are required' },
            { status: 400 }
          );
        }
        
        const newUser = {
          id: String(users.length + 1),
          name: body.name,
          email: body.email,
        };
        
        users.push(newUser);
        
        return Response.json(
          { user: newUser },
          { status: 201 }
        );
      },
    },

    // Update user
    {
      method: 'PUT',
      path: '/api/users/:id',
      handler: async (req, ctx) => {
        const user = users.find(u => u.id === ctx.params.id);
        
        if (!user) {
          return Response.json(
            { error: 'User not found' },
            { status: 404 }
          );
        }
        
        const body = await ctx.json();
        
        if (body.name) user.name = body.name;
        if (body.email) user.email = body.email;
        
        return Response.json({ user });
      },
    },

    // Delete user
    {
      method: 'DELETE',
      path: '/api/users/:id',
      handler: async (req, ctx) => {
        const index = users.findIndex(u => u.id === ctx.params.id);
        
        if (index === -1) {
          return Response.json(
            { error: 'User not found' },
            { status: 404 }
          );
        }
        
        users.splice(index, 1);
        
        return Response.json({ success: true });
      },
    },
  ],

  // Middleware for logging
  middleware: [
    async (req, ctx, next) => {
      const start = Date.now();
      const url = new URL(req.url);
      
      console.log(`→ ${req.method} ${url.pathname}`);
      
      const response = await next();
      
      const duration = Date.now() - start;
      console.log(`← ${req.method} ${url.pathname} ${response.status} (${duration}ms)`);
      
      return response;
    },
  ],
});
