import { describe, expect, it, vi, beforeEach } from 'vitest';
import { FileSync } from '../../core/sync.js';

const { execaMock } = vi.hoisted(() => ({
  execaMock: vi.fn(),
}));

vi.mock('execa', () => ({
  execa: execaMock,
}));

describe('FileSync.syncLocal', () => {
  beforeEach(() => {
    execaMock.mockReset();
    execaMock.mockResolvedValue({
      exitCode: 0,
      stdout: '',
      stderr: '',
    });
  });

  it('applies include filters before exclude filters so rsync overrides work', async () => {
    await FileSync.syncLocal('/tmp/source', '/tmp/destination', {
      include: ['.env.production'],
      exclude: ['.env.*'],
    });

    expect(execaMock).toHaveBeenCalledWith(
      'rsync',
      expect.arrayContaining([
        '--include',
        '.env.production',
        '--exclude',
        '.env.*',
      ]),
      expect.any(Object),
    );

    const args = execaMock.mock.calls[0][1] as string[];
    expect(args.indexOf('--include')).toBeLessThan(args.indexOf('--exclude'));
  });
});
