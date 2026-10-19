import { execFile } from 'child_process';

export interface RunResult { exitCode: number; stdout: string; stderr: string; }
export type Runner = (bin: string, args: string[]) => Promise<RunResult>;

export const nodeRunner: Runner = (bin, args) =>
  new Promise((resolve) => {
    execFile(bin, args, { timeout: 30 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err && typeof (err as NodeJS.ErrnoException & { code?: number }).code === 'number'
        ? ((err as unknown as { code: number }).code)
        : err ? 1 : 0;
      const stderrStr = String(stderr);
      const finalStderr = err && !stderrStr ? String((err as Error).message ?? err) : stderrStr;
      resolve({ exitCode: code, stdout: String(stdout), stderr: finalStderr });
    });
  });
