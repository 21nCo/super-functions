# GitHub Provider

Integration with GitHub for repository management, issues, and pull requests.

## Setup

### 1. Create GitHub OAuth App

1. Go to https://github.com/settings/developers
2. Click "New OAuth App"
3. Fill in the details:
   - **Application name**: Your App Name
   - **Homepage URL**: https://yourapp.com
   - **Authorization callback URL**: https://yourapp.com/api/plugfn/callback
4. Save and note your Client ID and Client Secret

### 2. Configure PlugFn

```typescript
import { plugFn } from 'plugfn';
import { githubProvider } from '@plugfn/providers';

const plug = plugFn({
  integrations: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      scopes: ['repo', 'issues', 'user']
    }
  }
});

plug.providers.register(githubProvider);
```

```python
# Python
plug = PlugFn(
    integrations={
        "github": {
            "client_id": os.getenv("GITHUB_CLIENT_ID"),
            "client_secret": os.getenv("GITHUB_CLIENT_SECRET"),
            "scopes": ["repo", "issues", "user"]
        }
    }
)

plug.providers.register(github_provider)
```

## Available Scopes

- `repo` - Full control of repositories
- `repo:status` - Access commit status
- `repo_deployment` - Access deployment status
- `public_repo` - Access public repositories
- `repo:invite` - Access repository invitations
- `user` - Read/write user profile data
- `read:user` - Read user profile data
- `user:email` - Access user email
- `read:org` - Read organization data

## Actions

### repos.get

Get repository information.

```typescript
const repo = await plug.github['repos.get']({
  userId: 'user-123',
  params: {
    owner: 'myorg',
    repo: 'myrepo'
  }
});
```

**Parameters:**
- `owner` (string): Repository owner
- `repo` (string): Repository name

**Returns:**
- `id`, `name`, `full_name`, `description`, `html_url`, `clone_url`, etc.

### issues.list

List issues in a repository.

```typescript
const issues = await plug.github['issues.list']({
  userId: 'user-123',
  params: {
    owner: 'myorg',
    repo: 'myrepo',
    state: 'open',
    labels: ['bug', 'high-priority']
  }
});
```

**Parameters:**
- `owner` (string): Repository owner
- `repo` (string): Repository name
- `state` (optional): `'open'`, `'closed'`, or `'all'`
- `labels` (optional): Array of label names

**Returns:** Array of issues

### issues.create

Create a new issue.

```typescript
const issue = await plug.github['issues.create']({
  userId: 'user-123',
  params: {
    owner: 'myorg',
    repo: 'myrepo',
    title: 'Bug: Something broke',
    body: 'Description of the bug',
    labels: ['bug', 'high-priority'],
    assignees: ['username']
  }
});
```

**Parameters:**
- `owner` (string): Repository owner
- `repo` (string): Repository name
- `title` (string): Issue title
- `body` (optional): Issue description
- `labels` (optional): Array of label names
- `assignees` (optional): Array of usernames

**Returns:** Created issue object

### issues.createComment

Add a comment to an issue.

```typescript
const comment = await plug.github['issues.createComment']({
  userId: 'user-123',
  params: {
    owner: 'myorg',
    repo: 'myrepo',
    issueNumber: 42,
    body: 'This is a comment'
  }
});
```

**Parameters:**
- `owner` (string): Repository owner
- `repo` (string): Repository name
- `issueNumber` (number): Issue number
- `body` (string): Comment text

**Returns:** Created comment object

### issues.get

Fetch a single issue by number.

```typescript
const issue = await plug.github['issues.get']({
  userId: 'user-123',
  params: {
    owner: '21nCo',
    repo: 'super-functions',
    issueNumber: 42
  }
});
```

### issues.update

Update an existing issue (title/body/state/labels/assignees).

```typescript
const issue = await plug.github['issues.update']({
  userId: 'user-123',
  params: {
    owner: '21nCo',
    repo: 'super-functions',
    issueNumber: 42,
    state: 'closed'
  }
});
```

### pulls.create

Create a pull request.

```typescript
const pr = await plug.github['pulls.create']({
  userId: 'user-123',
  params: {
    owner: '21nCo',
    repo: 'super-functions',
    title: 'Conduct phase 1',
    head: 'feat/conduct-phase-1',
    base: 'next'
  }
});
```

### pulls.createReview

Create a pull request review comment/approval/change request.

```typescript
const review = await plug.github['pulls.createReview']({
  userId: 'user-123',
  params: {
    owner: '21nCo',
    repo: 'super-functions',
    pullNumber: 42,
    body: 'Audit summary',
    event: 'COMMENT'
  }
});
```

## Triggers

### issues.opened

Triggered when a new issue is opened.

```typescript
plug.webhooks.on('github', 'issues.opened', async (event) => {
  console.log('New issue:', event.data.issue.title);
  
  // Notify team
  await plug.slack['chat.postMessage']({
    userId: event.userId,
    params: {
      channel: '#engineering',
      text: `🐛 New issue: ${event.data.issue.title}\n${event.data.issue.html_url}`
    }
  });
});
```

**Webhook Setup:**
1. Go to your repository settings
2. Navigate to Webhooks
3. Add webhook URL: `https://yourapp.com/api/plugfn/webhooks/github/issues`
4. Select "Issues" event
5. Set content type to `application/json`
6. Add your webhook secret

**Event Data:**
- `action`: `'opened'`
- `issue`: Issue object
- `repository`: Repository object
- `sender`: User who opened the issue

### pull_request.closed

Triggered when a pull request is closed (including merged PRs).

Sample payload shape:

```json
{
  "action": "closed",
  "pull_request": {
    "id": 9,
    "number": 42,
    "title": "Conduct phase 1",
    "html_url": "https://github.com/21nCo/super-functions/pull/42",
    "merged": true
  },
  "repository": {
    "name": "super-functions",
    "owner": { "login": "21nCo" }
  }
}
```

### issue_comment.created

Triggered when an issue comment is created.

Sample payload shape:

```json
{
  "action": "created",
  "issue": {
    "id": 5,
    "number": 42,
    "title": "Issue title",
    "html_url": "https://github.com/21nCo/super-functions/issues/42"
  },
  "comment": {
    "id": 10,
    "body": "/conduct spec"
  },
  "repository": {
    "name": "super-functions",
    "owner": { "login": "21nCo" }
  }
}
```

## Rate Limits

- **5,000 requests per hour** for authenticated requests
- **60 requests per hour** for unauthenticated requests
- Rate limit resets at the top of each hour

PlugFn automatically respects GitHub's rate limits and will retry requests when appropriate.

## Examples

### Auto-label issues based on title

```typescript
plug.webhooks.on('github', 'issues.opened', async (event) => {
  const title = event.data.issue.title.toLowerCase();
  let labels = [];
  
  if (title.includes('bug')) labels.push('bug');
  if (title.includes('feature')) labels.push('enhancement');
  if (title.includes('urgent')) labels.push('high-priority');
  
  if (labels.length > 0) {
    await plug.github['issues.update']({
      userId: event.userId,
      params: {
        owner: event.data.repository.owner.login,
        repo: event.data.repository.name,
        issueNumber: event.data.issue.number,
        labels
      }
    });
  }
});
```

### Sync issues to Linear

```typescript
plug.webhooks.on('github', 'issues.opened', async (event) => {
  const linearIssue = await plug.linear['issues.create']({
    userId: event.userId,
    params: {
      teamId: 'team-123',
      title: event.data.issue.title,
      description: event.data.issue.body,
      externalId: event.data.issue.id.toString()
    }
  });
  
  await plug.github['issues.createComment']({
    userId: event.userId,
    params: {
      owner: event.data.repository.owner.login,
      repo: event.data.repository.name,
      issueNumber: event.data.issue.number,
      body: `Synced to Linear: ${linearIssue.url}`
    }
  });
});
```

## Resources

- [GitHub API Documentation](https://docs.github.com/en/rest)
- [GitHub OAuth Documentation](https://docs.github.com/en/developers/apps/building-oauth-apps)
- [GitHub Webhooks Documentation](https://docs.github.com/en/developers/webhooks-and-events/webhooks)
