export class CSInterface {
  evalScript(script: string, callback: (result: string) => void): void;
  getSystemPath(pathType: string): string;
}
export const SystemPath: { EXTENSION: string; USER_DATA: string };
