import { describe, it, expect } from 'vitest';
import {
  GitHubIssueSchema,
  GitHubRepositorySchema,
  LinkCommandOptionsSchema,
  CreateCommandOptionsSchema,
} from '../../src/github';

describe('GitHub Schemas', () => {
  describe('GitHubIssueSchema', () => {
    it('should validate complete issue', () => {
      const valid = {
        id: 123,
        number: 42,
        title: 'Bug in login',
        body: 'Users cannot login',
        state: 'open',
        html_url: 'https://github.com/owner/repo/issues/42',
        user: {
          login: 'testuser',
          avatar_url: 'https://avatars.github.com/u/123',
        },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      };

      const result = GitHubIssueSchema.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.number).toBe(42);
        expect(result.data.state).toBe('open');
      }
    });

    it('should validate issue with null body', () => {
      const valid = {
        id: 123,
        number: 42,
        title: 'No description',
        body: null,
        state: 'closed',
        html_url: 'https://github.com/owner/repo/issues/42',
        user: {
          login: 'testuser',
          avatar_url: 'https://avatars.github.com/u/123',
        },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      };

      const result = GitHubIssueSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject issue with invalid state', () => {
      const invalid = {
        id: 123,
        number: 42,
        title: 'Issue',
        body: 'Body',
        state: 'pending',
        html_url: 'https://github.com/owner/repo/issues/42',
        user: {
          login: 'testuser',
          avatar_url: 'https://avatars.github.com/u/123',
        },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      };

      const result = GitHubIssueSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject issue without required fields', () => {
      const invalid = {
        id: 123,
        title: 'Issue',
      };

      const result = GitHubIssueSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('GitHubRepositorySchema', () => {
    it('should validate complete repository', () => {
      const valid = {
        id: 456,
        name: 'repo',
        full_name: 'owner/repo',
        private: false,
        html_url: 'https://github.com/owner/repo',
        description: 'A test repository',
        owner: {
          login: 'owner',
          avatar_url: 'https://avatars.github.com/u/456',
        },
      };

      const result = GitHubRepositorySchema.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.full_name).toBe('owner/repo');
        expect(result.data.private).toBe(false);
      }
    });

    it('should validate repository with null description', () => {
      const valid = {
        id: 456,
        name: 'repo',
        full_name: 'owner/repo',
        private: true,
        html_url: 'https://github.com/owner/repo',
        description: null,
        owner: {
          login: 'owner',
          avatar_url: 'https://avatars.github.com/u/456',
        },
      };

      const result = GitHubRepositorySchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject repository without required fields', () => {
      const invalid = {
        id: 456,
        name: 'repo',
      };

      const result = GitHubRepositorySchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('LinkCommandOptionsSchema', () => {
    it('should validate valid link options', () => {
      const valid = {
        repository: 'owner/repo',
        search: 'bug',
      };

      const result = LinkCommandOptionsSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject empty repository', () => {
      const invalid = {
        repository: '',
        search: 'bug',
      };

      const result = LinkCommandOptionsSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Repository is required');
      }
    });

    it('should reject empty search', () => {
      const invalid = {
        repository: 'owner/repo',
        search: '',
      };

      const result = LinkCommandOptionsSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Search query is required');
      }
    });

    it('should reject missing fields', () => {
      const invalid = {};

      const result = LinkCommandOptionsSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('CreateCommandOptionsSchema', () => {
    it('should validate valid create options', () => {
      const valid = {
        repository: 'owner/repo',
        title: 'Bug Report',
        description: 'Found a bug',
      };

      const result = CreateCommandOptionsSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should validate create options without description', () => {
      const valid = {
        repository: 'owner/repo',
        title: 'Bug Report',
      };

      const result = CreateCommandOptionsSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject empty repository', () => {
      const invalid = {
        repository: '',
        title: 'Bug Report',
      };

      const result = CreateCommandOptionsSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject empty title', () => {
      const invalid = {
        repository: 'owner/repo',
        title: '',
      };

      const result = CreateCommandOptionsSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Title is required');
      }
    });
  });
});
