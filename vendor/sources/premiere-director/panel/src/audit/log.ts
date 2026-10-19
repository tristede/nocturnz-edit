export interface AuditEntry { ts: string; url: string; purpose: string; destFile?: string; }

export function formatAuditLine(e: AuditEntry): string {
  return JSON.stringify(e) + '\n';
}

export function appendAudit(
  filePath: string, e: AuditEntry,
  appendFileSyncFn?: (p: string, d: string) => void,
): void {
  const append = appendFileSyncFn ?? ((p: string, d: string) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    (require('fs') as typeof import('fs')).appendFileSync(p, d);
  });
  append(filePath, formatAuditLine(e));
}

export function parseAuditLog(text: string): AuditEntry[] {
  const entries: AuditEntry[] = [];
  for (const line of text.split('\n').filter(Boolean)) {
    try {
      entries.push(JSON.parse(line) as AuditEntry);
    } catch {
      // skip corrupt/truncated line (e.g. process killed mid-append)
    }
  }
  return entries;
}
