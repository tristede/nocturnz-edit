import type { SequenceInfo } from '../operations/model';
import { validateBatch, type OperationBatch } from '../operations/schema';
import { sequenceHash, type ApplyResult, type HostAdapter } from './HostAdapter';

export { sequenceHash } from './HostAdapter';

export type EvalScriptFn = (script: string, cb: (result: string) => void) => void;

function defaultEvalScript(): EvalScriptFn {
  // Lazy so tests never touch CEP. __adobe_cep__ exists only inside a CEP host.
  const cep = (window as unknown as { __adobe_cep__?: { evalScript: EvalScriptFn } }).__adobe_cep__;
  if (!cep) throw new Error('Not running inside a CEP host');
  return cep.evalScript.bind(cep);
}

export class CepAdapter implements HostAdapter {
  private readonly evalScript: EvalScriptFn;

  constructor(evalScript?: EvalScriptFn) {
    this.evalScript = evalScript ?? defaultEvalScript();
  }

  private call(script: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.evalScript(script, (result) => {
        if (typeof result === 'string' && result.indexOf('EvalScript error') !== -1) {
          reject(new Error(`EvalScript failed for: ${script.slice(0, 60)}`));
        } else resolve(result);
      });
    });
  }

  async ping(): Promise<boolean> {
    try { return (await this.call('PD_ping()')) === 'pong'; } catch { return false; }
  }

  async getSequenceInfo(): Promise<SequenceInfo> {
    const raw = await this.call('PD_getSequenceInfo()');
    const parsed = JSON.parse(raw) as SequenceInfo | { error: string };
    if ('error' in parsed) throw new Error(parsed.error);
    return parsed;
  }

  async exportAudio(outPath: string, presetPath: string): Promise<string> {
    const raw = await this.call(`PD_exportAudio(${JSON.stringify(outPath)}, ${JSON.stringify(presetPath)})`);
    const parsed = JSON.parse(raw) as { ok: boolean; path?: string; error?: string };
    if (!parsed.ok || !parsed.path) throw new Error(parsed.error ?? 'audio export failed');
    return parsed.path;
  }

  async applyOperations(batch: OperationBatch, expectedHash?: string): Promise<ApplyResult> {
    const valid = validateBatch(batch);
    if (!valid.ok) return { ok: false, applied: 0, error: `invalid batch: ${valid.errors.join('; ')}` };
    if (expectedHash) {
      const current = sequenceHash(await this.getSequenceInfo());
      if (current !== expectedHash) {
        return { ok: false, applied: 0, error: 'sequence changed since analysis — re-run analysis before applying' };
      }
    }
    const payload = JSON.stringify(JSON.stringify(valid.batch)); // double-encode: JS string literal containing JSON
    const raw = await this.call(`PD_execute(${payload})`);
    return JSON.parse(raw) as ApplyResult;
  }
}
