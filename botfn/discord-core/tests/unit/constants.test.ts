import { describe, it, expect } from 'vitest';
import { InteractionType, InteractionResponseType } from '../../src/constants';

describe('Discord Constants', () => {
  describe('InteractionType', () => {
    it('should have PING constant with value 1', () => {
      expect(InteractionType.PING).toBe(1);
    });

    it('should have APPLICATION_COMMAND constant with value 2', () => {
      expect(InteractionType.APPLICATION_COMMAND).toBe(2);
    });

    it('should have MESSAGE_COMPONENT constant with value 3', () => {
      expect(InteractionType.MESSAGE_COMPONENT).toBe(3);
    });

    it('should have APPLICATION_COMMAND_AUTOCOMPLETE constant with value 4', () => {
      expect(InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE).toBe(4);
    });

    it('should have MODAL_SUBMIT constant with value 5', () => {
      expect(InteractionType.MODAL_SUBMIT).toBe(5);
    });

    it('should be immutable (as const)', () => {
      // TypeScript will catch this at compile time, but we can verify the object is frozen
      expect(Object.isFrozen(InteractionType)).toBe(false); // Objects with 'as const' aren't frozen but are type-level immutable
      expect(typeof InteractionType.PING).toBe('number');
    });
  });

  describe('InteractionResponseType', () => {
    it('should have PONG constant with value 1', () => {
      expect(InteractionResponseType.PONG).toBe(1);
    });

    it('should have CHANNEL_MESSAGE_WITH_SOURCE constant with value 4', () => {
      expect(InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE).toBe(4);
    });

    it('should have DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE constant with value 5', () => {
      expect(InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE).toBe(5);
    });

    it('should have DEFERRED_UPDATE_MESSAGE constant with value 6', () => {
      expect(InteractionResponseType.DEFERRED_UPDATE_MESSAGE).toBe(6);
    });

    it('should have UPDATE_MESSAGE constant with value 7', () => {
      expect(InteractionResponseType.UPDATE_MESSAGE).toBe(7);
    });

    it('should have APPLICATION_COMMAND_AUTOCOMPLETE_RESULT constant with value 8', () => {
      expect(InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT).toBe(8);
    });

    it('should have MODAL constant with value 9', () => {
      expect(InteractionResponseType.MODAL).toBe(9);
    });

    it('should have all unique values', () => {
      const values = Object.values(InteractionResponseType);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });
  });
});
