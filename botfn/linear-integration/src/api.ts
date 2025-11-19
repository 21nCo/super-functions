export interface LinearClientConfig {
  apiKey: string;
}

/**
 * GraphQL response wrapper structure
 */
interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: Array<string | number>;
  }>;
}

/**
 * Linear API client using GraphQL
 */
export class LinearClient {
  private config: LinearClientConfig;

  constructor(config: LinearClientConfig) {
    this.config = config;
  }

  /**
   * Make authenticated GraphQL request to Linear API
   */
  async request<T>(
    query: string,
    variables?: Record<string, any>
  ): Promise<T> {
    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.config.apiKey,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`Linear API error: ${response.status}`);
    }

    const result = await response.json() as GraphQLResponse<T>;
    
    if (result.errors && result.errors.length > 0) {
      throw new Error(`Linear GraphQL error: ${result.errors[0].message}`);
    }
    
    if (!result.data) {
      throw new Error('Linear API returned no data');
    }

    return result.data;
  }
}

/**
 * Simple helper for one-off requests
 */
export async function linearRequest<T>(
  query: string,
  config: LinearClientConfig,
  variables?: Record<string, any>
): Promise<T> {
  const client = new LinearClient(config);
  return client.request<T>(query, variables);
}

/**
 * Get all teams for the authenticated user
 */
export async function getTeams(config: LinearClientConfig) {
  const query = `
    query {
      teams {
        nodes {
          id
          name
          key
        }
      }
    }
  `;

  const result = await linearRequest<{ teams: { nodes: Array<{ id: string; name: string; key: string }> } }>(
    query,
    config
  );

  return result.teams.nodes;
}

/**
 * Search issues in a team
 */
export async function searchIssues(
  config: LinearClientConfig,
  teamId: string,
  searchQuery: string
) {
  const query = `
    query($teamId: String!, $filter: IssueFilter) {
      issues(filter: $filter, first: 25) {
        nodes {
          id
          identifier
          title
          description
          url
        }
      }
    }
  `;

  const result = await linearRequest<{
    issues: {
      nodes: Array<{
        id: string;
        identifier: string;
        title: string;
        description: string | null;
        url: string;
      }>;
    };
  }>(query, config, {
    teamId,
    filter: {
      team: { id: { eq: teamId } },
      or: [
        { title: { containsIgnoreCase: searchQuery } },
        { description: { containsIgnoreCase: searchQuery } },
      ],
    },
  });

  return result.issues.nodes;
}

/**
 * Get a specific issue by identifier (e.g., "ENG-123")
 */
export async function getIssue(config: LinearClientConfig, identifier: string) {
  const query = `
    query($identifier: String!) {
      issue(id: $identifier) {
        id
        identifier
        title
        description
        url
      }
    }
  `;

  const result = await linearRequest<{
    issue: {
      id: string;
      identifier: string;
      title: string;
      description: string | null;
      url: string;
    };
  }>(query, config, { identifier });

  return result.issue;
}

/**
 * Create a comment on a Linear issue
 */
export async function createComment(
  config: LinearClientConfig,
  issueId: string,
  body: string
) {
  const mutation = `
    mutation($issueId: String!, $body: String!) {
      commentCreate(input: { issueId: $issueId, body: $body }) {
        success
        comment {
          id
          body
        }
      }
    }
  `;

  const result = await linearRequest<{
    commentCreate: {
      success: boolean;
      comment: { id: string; body: string };
    };
  }>(mutation, config, { issueId, body });

  return result.commentCreate;
}

/**
 * Create a new issue in Linear
 */
export async function createIssue(
  config: LinearClientConfig,
  teamId: string,
  title: string,
  description?: string
) {
  const mutation = `
    mutation($teamId: String!, $title: String!, $description: String) {
      issueCreate(input: { teamId: $teamId, title: $title, description: $description }) {
        success
        issue {
          id
          identifier
          title
          url
        }
      }
    }
  `;

  const result = await linearRequest<{
    issueCreate: {
      success: boolean;
      issue: {
        id: string;
        identifier: string;
        title: string;
        url: string;
      };
    };
  }>(mutation, config, { teamId, title, description });

  return result.issueCreate.issue;
}
