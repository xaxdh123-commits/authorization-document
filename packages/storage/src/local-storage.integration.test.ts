import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { LocalStorage } from './local-storage.js';
describe('LocalStorage', () => it('writes atomically, reads and blocks traversal', async () => {
  const root = await mkdtemp(join(tmpdir(),'auth-storage-')); const storage = new LocalStorage(root);
  const result = await storage.write(Readable.from(['hello']), 'case/file.pdf');
  expect(result.relativePath).toBe('case/file.pdf'); expect(result.sha256).toHaveLength(64); expect(await storage.exists('case/file.pdf')).toBe(true);
  expect((await readFile(join(root,'case/file.pdf'),'utf8'))).toBe('hello');
  await expect(storage.read('../secret')).rejects.toThrow('STORAGE_KEY_INVALID');
}));
