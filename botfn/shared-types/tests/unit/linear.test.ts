import { describe, it, expect } from 'vitest';
import {
  LinearTeamSchema,
  LinearIssueSchema,
  LinkLinearCommandOptionsSchema,
  CreateLinearCommandOptionsSchema,
} from '../../src/linear';

describe('Linear Schemas', () => {
  describe('LinearTeamSchema', () => {
    it('should validate valid team', () => {
      const valid = {
        id: 'team123',
        name: 'Engineering',
        key: 'ENG',
      };

      const result = LinearTeamSchema.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.key).toBe('ENG');
      }
    });

    it('should reject team without id', () => {
      const invalid = {
        name: 'Engineering',
        key: 'ENG',
      };

      const result = LinearTeamSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject team without name', () => {
      const invalid = {
        id: 'team123',
        key: 'ENG',
      };

      const result = LinearTeamSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject team without key', () => {
      const invalid = {
        id: 'team123',
        name: 'Engineering',
      };

      const result = LinearTeamSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('LinearIssueSchema', () => {
    it('should validate complete issue', () => {
      const valid = {
        id: 'issue123',
        identifier: 'ENG-456',
        title: 'Fix login bug',
        description: 'Users cannot login with SSO',
        url: 'https://linear.app/team/issue/ENG-456',
      };

      const result = LinearIssueSchema.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.identifier).toBe('ENG-456');
      }
    });

    it('should validate issue with null description', () => {
      const valid = {
        id: 'issue123',
        identifier: 'ENG-456',
        title: 'No description',
        description: null,
        url: 'https://linear.app/team/issue/ENG-456',
      };

      const result = LinearIssueSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject issue without id', () => {
      const invalid = {
        identifier: 'ENG-456',
        title: 'Issue',
        description: 'Desc',
        url: 'https://linear.app/team/issue/ENG-456',
      };

      const result = LinearIssueSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject issue without identifier', () => {
      const invalid = {
        id: 'issue123',
        title: 'Issue',
        description: 'Desc',
        url: 'https://linear.app/team/issue/ENG-456',
      };

      const result = LinearIssueSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject issue without title', () => {
      const invalid = {
        id: 'issue123',
        identifier: 'ENG-456',
        description: 'Desc',
        url: 'https://linear.app/team/issue/ENG-456',
      };

      const result = LinearIssueSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject issue without url', () => {
      const invalid = {
        id: 'issue123',
        identifier: 'ENG-456',
        title: 'Issue',
        description: 'Desc',
      };

      const result = LinearIssueSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('LinkLinearCommandOptionsSchema', () => {
    it('should validate valid link options', () => {
      const valid = {
        team: 'ENG',
        search: 'login',
      };

      const result = LinkLinearCommandOptionsSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject empty team', () => {
      const invalid = {
        team: '',
        search: 'login',
      };

      const result = LinkLinearCommandOptionsSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Team is required');
      }
    });

    it('should reject empty search', () => {
      const invalid = {
        team: 'ENG',
        search: '',
      };

      const result = LinkLinearCommandOptionsSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Search query is required');
      }
    });

    it('should reject missing fields', () => {
      const invalid = {};

      const result = LinkLinearCommandOptionsSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('CreateLinearCommandOptionsSchema', () => {
    it('should validate valid create options', () => {
      const valid = {
        team: 'ENG',
        title: 'New feature',
        description: 'Add dark mode',
      };

      const result = CreateLinearCommandOptionsSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should validate create options without description', () => {
      const valid = {
        team: 'ENG',
        title: 'New feature',
      };

      const result = CreateLinearCommandOptionsSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject empty team', () => {
      const invalid = {
        team: '',
        title: 'New feature',
      };

      const result = CreateLinearCommandOptionsSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject empty title', () => {
      const invalid = {
        team: 'ENG',
        title: '',
      };

      const result = CreateLinearCommandOptionsSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Title is required');
      }
    });

    it('should reject missing required fields', () => {
      const invalid = {
        description: 'Only description',
      };

      const result = CreateLinearCommandOptionsSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });
});
