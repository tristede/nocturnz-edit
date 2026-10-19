import { describe, expect, it } from 'vitest';
import { appendAudit, formatAuditLine, parseAuditLog } from './log';

describe('audit log', () => {
  const entry = { ts: '2026-07-08T12:00:00Z', url: 'https://huggingface.co/x', purpose: 'whisper model download' };
  it('formats JSONL and parses it back', () => {
    const line = formatAuditLine(entry);
    expect(line.endsWith('\n')).toBe(true);
    expect(parseAuditLog(line + formatAuditLine(entry))).toHaveLength(2);
  });
  it('appends via injected fs', () => {
    const writes: string[] = [];
    appendAudit('/tmp/audit.jsonl', entry, (_p, d) => void writes.push(d));
    expect(writes[0]).toContain('whisper model download');
  });
  it('skips truncated/corrupt lines without throwing', () => {
    const text = formatAuditLine(entry) + '{"ts":"2026-' + '\n' + formatAuditLine(entry);
    let result: ReturnType<typeof parseAuditLog> | undefined;
    expect(() => { result = parseAuditLog(text); }).not.toThrow();
    expect(result).toHaveLength(2);
  });
});
