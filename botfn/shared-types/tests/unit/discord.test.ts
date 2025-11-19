import { describe, it, expect } from 'vitest';
import {
  DiscordOptionSchema,
  DiscordInteractionDataSchema,
  DiscordInteractionSchema,
} from '../../src/discord';

describe('Discord Schemas', () => {
  describe('DiscordOptionSchema', () => {
    it('should validate string option', () => {
      const valid = {
        name: 'repository',
        value: 'owner/repo',
      };

      const result = DiscordOptionSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should validate number option', () => {
      const valid = {
        name: 'count',
        value: 42,
      };

      const result = DiscordOptionSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should validate boolean option', () => {
      const valid = {
        name: 'enabled',
        value: true,
      };

      const result = DiscordOptionSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should validate option with type and focused', () => {
      const valid = {
        name: 'search',
        value: 'bug',
        type: 3,
        focused: true,
      };

      const result = DiscordOptionSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject option without name', () => {
      const invalid = {
        value: 'test',
      };

      const result = DiscordOptionSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject option without value', () => {
      const invalid = {
        name: 'test',
      };

      const result = DiscordOptionSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject invalid value type', () => {
      const invalid = {
        name: 'test',
        value: { nested: 'object' },
      };

      const result = DiscordOptionSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('DiscordInteractionDataSchema', () => {
    it('should validate minimal interaction data', () => {
      const valid = {
        name: 'link-github',
      };

      const result = DiscordInteractionDataSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should validate interaction data with options', () => {
      const valid = {
        id: 'cmd123',
        name: 'link-github',
        type: 1,
        options: [
          { name: 'repository', value: 'owner/repo' },
          { name: 'search', value: 'bug' },
        ],
      };

      const result = DiscordInteractionDataSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject data without name', () => {
      const invalid = {
        id: 'cmd123',
        type: 1,
      };

      const result = DiscordInteractionDataSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should validate empty options array', () => {
      const valid = {
        name: 'test',
        options: [],
      };

      const result = DiscordInteractionDataSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });
  });

  describe('DiscordInteractionSchema', () => {
    it('should validate complete interaction', () => {
      const valid = {
        id: '123',
        application_id: 'app456',
        type: 2,
        data: {
          name: 'link-github',
          options: [{ name: 'repository', value: 'owner/repo' }],
        },
        guild_id: 'guild789',
        channel_id: 'channel012',
        token: 'token_abc',
        version: 1,
      };

      const result = DiscordInteractionSchema.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('123');
        expect(result.data.type).toBe(2);
      }
    });

    it('should validate minimal interaction', () => {
      const valid = {
        id: '123',
        application_id: 'app456',
        type: 1,
        token: 'token_abc',
        version: 1,
      };

      const result = DiscordInteractionSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject interaction without id', () => {
      const invalid = {
        application_id: 'app456',
        type: 1,
        token: 'token',
        version: 1,
      };

      const result = DiscordInteractionSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject interaction without application_id', () => {
      const invalid = {
        id: '123',
        type: 1,
        token: 'token',
        version: 1,
      };

      const result = DiscordInteractionSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject interaction without type', () => {
      const invalid = {
        id: '123',
        application_id: 'app456',
        token: 'token',
        version: 1,
      };

      const result = DiscordInteractionSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject interaction without token', () => {
      const invalid = {
        id: '123',
        application_id: 'app456',
        type: 1,
        version: 1,
      };

      const result = DiscordInteractionSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject interaction without version', () => {
      const invalid = {
        id: '123',
        application_id: 'app456',
        type: 1,
        token: 'token',
      };

      const result = DiscordInteractionSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should allow optional fields', () => {
      const valid = {
        id: '123',
        application_id: 'app456',
        type: 1,
        token: 'token',
        version: 1,
        member: { user: { id: 'user123' } },
        user: { id: 'user123' },
        message: { id: 'msg456' },
      };

      const result = DiscordInteractionSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });
  });
});
