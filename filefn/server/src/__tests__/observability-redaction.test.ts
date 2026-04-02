/**
 * Test vectors for observability and redaction (OBS-001)
 * 
 * These tests encode the audit gap for correlation ID preservation:
 * - TV-OBS-REDACTION-001: Correlation IDs like requestId are preserved (NOT redacted)
 * - TV-OBS-LOG-001: Logs contain correlation IDs
 * - TV-OBS-LOG-NEG-001: Signed URLs are NOT logged
 */

import { describe, it, expect } from 'vitest';
import { redactSecrets, type LogContext } from '../index.js';

describe('@filefn/server observability redaction', () => {
  describe('TV-OBS-REDACTION-001: Correlation IDs are preserved', () => {
    it('should preserve short requestId values', () => {
      const context: LogContext = {
        requestId: 'req_001',
        uploadSessionId: 'upl_0001',
        fileId: 'file_0001',
        versionId: 'ver_0001',
      };

      const redacted = redactSecrets(context);

      // These should NOT be redacted - this is the audit gap
      // Current implementation redacts these which is wrong
      expect(redacted.requestId).toBe('req_001');
      expect(redacted.uploadSessionId).toBe('upl_0001');
      expect(redacted.fileId).toBe('file_0001');
      expect(redacted.versionId).toBe('ver_0001');
    });

    it('should preserve requestId in log context with other fields', () => {
      const context: LogContext = {
        requestId: 'req_001',
        fileName: 'avatar.png',
        size: 1024,
        mimeType: 'image/png',
      };

      const redacted = redactSecrets(context);

      expect(redacted.requestId).toBe('req_001');
      expect(redacted.fileName).toBe('avatar.png');
      expect(redacted.size).toBe(1024);
      expect(redacted.mimeType).toBe('image/png');
    });

    it('should mark redacted field as false for correlation IDs', () => {
      const context: LogContext = {
        requestId: 'req_001',
      };

      const redacted = redactSecrets(context);

      // The test vector expects this specific shape
      // This verifies correlation IDs are not redacted
      expect(redacted.requestId).toBe('req_001');
      expect(redacted.requestId).not.toBe('[REDACTED]');
    });
  });

  describe('TV-OBS-LOG-001: Logs contain correlation IDs', () => {
    it('should preserve all correlation IDs together', () => {
      const context: LogContext = {
        requestId: 'req_001',
        uploadSessionId: 'upl_0001',
        fileId: 'file_0001',
        versionId: 'ver_0001',
        operation: 'upload.init',
      };

      const redacted = redactSecrets(context);

      // All correlation IDs should be preserved
      expect(redacted.requestId).toBe('req_001');
      expect(redacted.uploadSessionId).toBe('upl_0001');
      expect(redacted.fileId).toBe('file_0001');
      expect(redacted.versionId).toBe('ver_0001');
      expect(redacted.operation).toBe('upload.init');
    });
  });

  describe('TV-OBS-LOG-NEG-001: Signed URLs are NOT logged', () => {
    it('should still redact signed URLs while preserving correlation IDs', () => {
      const context: LogContext = {
        requestId: 'req_001',
        signedUrl: 'https://storage.test/upload/stor_upl_0001/part/1?X-Amz-Signature=secret',
      };

      const redacted = redactSecrets(context);

      // requestId should be preserved
      expect(redacted.requestId).toBe('req_001');
      // signedUrl should be redacted
      expect(redacted.signedUrl).toBe('[REDACTED]');
    });

    it('should redact URLs containing X-Amz-Signature', () => {
      const context: LogContext = {
        requestId: 'req_005',
        url: 'https://s3.amazonaws.com/bucket/key?X-Amz-Signature=abc123',
      };

      const redacted = redactSecrets(context);

      expect(redacted.requestId).toBe('req_005');
      expect(redacted.url).toBe('[REDACTED]');
    });

    it('should redact URLs containing token parameter', () => {
      const context: LogContext = {
        requestId: 'req_006',
        downloadUrl: 'https://storage.example.com/file?token=jwt.token.here',
      };

      const redacted = redactSecrets(context);

      expect(redacted.requestId).toBe('req_006');
      expect(redacted.downloadUrl).toBe('[REDACTED]');
    });
  });

  describe('Upload session token redaction', () => {
    it('should redact upload session token fields while preserving safe IDs', () => {
      const context: LogContext = {
        requestId: 'req_001',
        uploadSessionToken: 'upls_live_0001_secret',
        uploadSessionId: 'upl_0001',
      };

      const redacted = redactSecrets(context);

      expect(redacted.requestId).toBe('req_001');
      expect(redacted.uploadSessionId).toBe('upl_0001');
      expect(redacted.uploadSessionToken).toBe('[REDACTED]');
    });

    it('should recurse into arrays and nested objects for token redaction', () => {
      const context: LogContext = {
        requestId: 'req_001',
        nested: {
          values: ['safe', 'upls_live_abc123'],
        },
      };

      const redacted = redactSecrets(context);

      expect(redacted.requestId).toBe('req_001');
      expect((redacted.nested as any).values).toEqual(['safe', '[REDACTED]']);
    });
  });

  describe('Correlation ID patterns', () => {
    it('should recognize standard correlation ID patterns', () => {
      const patterns = [
        { requestId: 'req_001' },
        { requestId: 'req_010' },
        { requestId: 'req_100' },
        { uploadSessionId: 'upl_0001' },
        { uploadSessionId: 'upl_expired_1' },
        { fileId: 'file_0001' },
        { fileId: 'file_pub_0001' },
        { versionId: 'ver_0001' },
        { versionId: 'ver_other_file' },
      ];

      for (const context of patterns) {
        const redacted = redactSecrets(context as LogContext);
        const key = Object.keys(context)[0];
        const value = Object.values(context)[0];
        
        // All these should be preserved
        expect(redacted[key]).toBe(value);
      }
    });
  });
});
