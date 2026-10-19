import { createWriteStream } from 'fs';
import { get } from 'https';

export const WHISPER_MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin';

export function downloadFile(url: string, destPath: string, onProgress?: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadFile(res.headers.location, destPath, onProgress).then(resolve, reject);
        res.resume();
        return;
      }
      if (res.statusCode !== 200) { reject(new Error(`download HTTP ${res.statusCode} for ${url}`)); return; }
      const total = Number(res.headers['content-length'] ?? 0);
      let got = 0;
      const out = createWriteStream(destPath);
      res.on('data', (chunk: Buffer) => { got += chunk.length; if (total && onProgress) onProgress(Math.round((got / total) * 100)); });
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve()));
      out.on('error', reject);
      res.on('error', reject);
    }).on('error', reject);
  });
}
