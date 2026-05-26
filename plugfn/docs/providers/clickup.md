# ClickUp Provider

Integration with ClickUp for task lifecycle automation through PlugFn public actions and verified webhook triggers.

## Setup

1. Create a ClickUp OAuth app and capture client credentials.
2. Configure the provider in PlugFn integrations.
3. Register the provider in your runtime.

```ts
import { plugFn } from 'plugfn';
import { clickupProvider } from '@plugfn/providers';

const plug = plugFn({
  integrations: {
    clickup: {
      clientId: process.env.CLICKUP_CLIENT_ID!,
      clientSecret: process.env.CLICKUP_CLIENT_SECRET!,
    },
  },
});

plug.providers.register(clickupProvider);
```

## Actions

### `tasks.create`

Create a task in a ClickUp list.

```ts
await plug.clickup['tasks.create']({
  userId: 'user-123',
  params: {
    listId: '901234',
    name: 'Implement phase report',
    description: 'Add final verification report',
  },
});
```

### `tasks.get`

Fetch a single task.

```ts
await plug.clickup['tasks.get']({
  userId: 'user-123',
  params: { taskId: 'abc123' },
});
```

### `tasks.update`

Update task fields such as name, description, assignees, or status.

```ts
await plug.clickup['tasks.update']({
  userId: 'user-123',
  params: {
    taskId: 'abc123',
    status: 'in progress',
  },
});
```

### `tasks.list`

List tasks in a list.

```ts
await plug.clickup['tasks.list']({
  userId: 'user-123',
  params: { listId: '901234' },
});
```

### `comments.create`

Create a task comment.

```ts
await plug.clickup['comments.create']({
  userId: 'user-123',
  params: {
    taskId: 'abc123',
    commentText: 'Phase 4 complete',
  },
});
```

### `spaces.list`

List spaces for a team.

```ts
await plug.clickup['spaces.list']({
  userId: 'user-123',
  params: { teamId: '777' },
});
```

## Triggers

### `task.updated`

Webhook trigger emitted when task updates arrive with a valid signature.

### `task.statusChanged`

Webhook trigger emitted when task status transitions are received with a valid signature.

## Signature verification

ClickUp webhook triggers enforce HMAC SHA256 signature verification before event emission. Invalid or missing signatures are rejected and do not emit workflow events.
