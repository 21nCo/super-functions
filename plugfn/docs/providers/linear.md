# Linear Provider

Integration with Linear for issue lifecycle workflows, comment automation, and webhook-driven updates.

## Action Contracts

### `issues.get`

Fetch a single issue by ID.

```ts
const issue = await plug.linear['issues.get']({
  userId: 'user-123',
  params: {
    issueId: 'issue_abc123',
  },
});
```

### `comments.create`

Create a comment on an issue.

```ts
const result = await plug.linear['comments.create']({
  userId: 'user-123',
  params: {
    issueId: 'issue_abc123',
    body: 'Phase 2 complete',
  },
});
```

### `issues.search`

Search issues by free-text query.

```ts
const result = await plug.linear['issues.search']({
  userId: 'user-123',
  params: {
    query: 'OAuth',
    first: 20,
  },
});
```

## Trigger Contracts

### `issue.updated`

Emitted when a Linear issue update event is received and signature verification passes.

Sample payload:

```json
{
  "action": "update",
  "data": {
    "id": "issue_abc123",
    "identifier": "ENG-1234",
    "title": "OAuth PKCE follow-up"
  }
}
```

### `issue_comment.created`

Emitted when an issue comment create event is received and signature verification passes.

Sample payload:

```json
{
  "action": "create",
  "data": {
    "id": "comment_1",
    "body": "/conduct spec",
    "issue": {
      "id": "issue_abc123",
      "identifier": "ENG-1234"
    }
  }
}
```

## Signature Verification

Linear webhook triggers in PlugFn enforce signature verification before any trigger event is emitted.

- Header expected: `x-signature`
- Supported format: `sha256=<hex>` (or raw hex)
- Unsigned/invalid signatures are rejected with `WEBHOOK_SIGNATURE_INVALID`.
