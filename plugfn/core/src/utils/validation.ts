import { z } from 'zod';

/**
 * Validate data against a Zod schema
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * Safely validate data and return result with error
 */
export function safeValidate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, error: result.error };
  }
}

/**
 * Common validation schemas
 */
export const schemas = {
  email: z.string().email(),
  url: z.string().url(),
  uuid: z.string().uuid(),
  nonEmptyString: z.string().min(1),
  positiveNumber: z.number().positive(),
  date: z.coerce.date(),
};

