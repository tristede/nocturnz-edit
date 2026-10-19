import { describe, expect, it } from 'vitest';
import { nodeRunner } from './run';

describe('nodeRunner', () => {
  it('captures ENOENT error message in stderr when binary does not exist', async () => {
    const result = await nodeRunner('/nonexistent/pd-binary-xyz', []);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/ENOENT|nonexistent/i);
  });

  it('preserves numeric exit codes for normal process exits', async () => {
    const result = await nodeRunner(process.execPath, ['-e', 'process.exit(3)']);
    expect(result.exitCode).toBe(3);
  });

  it('prefers captured stderr over error message', async () => {
    const result = await nodeRunner(process.execPath, ['-e', 'console.error("boom"); process.exit(1)']);
    expect(result.stderr).toContain('boom');
    expect(result.exitCode).toBe(1);
  });
});
