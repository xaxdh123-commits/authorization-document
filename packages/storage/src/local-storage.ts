import { createReadStream } from 'node:fs';
import { access, rm } from 'node:fs/promises';
import path from 'node:path';
import { writeAtomically } from './atomic-file-writer.js';
import type { Storage, StoredFile } from './storage.js';
import type { Readable } from 'node:stream';

export class LocalStorage implements Storage {
  constructor(private readonly root: string) {}
  private safe(key: string): string { const normalized=path.posix.normalize(key.replaceAll('\\','/')); if (normalized.startsWith('../') || normalized==='..' || path.isAbsolute(normalized)) throw new Error('STORAGE_KEY_INVALID'); return path.join(this.root, normalized); }
  async write(input: Readable, storageKey: string): Promise<StoredFile> { this.safe(storageKey); const sha256=await writeAtomically(this.root, storageKey, input); return {storageKey,relativePath:storageKey,sha256}; }
  async read(storageKey: string): Promise<Readable> { return createReadStream(this.safe(storageKey)); }
  async exists(storageKey: string): Promise<boolean> { try { await access(this.safe(storageKey)); return true; } catch { return false; } }
  async remove(storageKey: string): Promise<void> { await rm(this.safe(storageKey), {force:true}); }
}
