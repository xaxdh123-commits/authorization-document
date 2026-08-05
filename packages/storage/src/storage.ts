import type { Readable } from 'node:stream';
export interface StoredFile { storageKey: string; relativePath: string; sha256: string; }
export interface Storage { write(input: Readable, storageKey: string): Promise<StoredFile>; read(storageKey: string): Promise<Readable>; exists(storageKey: string): Promise<boolean>; remove(storageKey: string): Promise<void>; }
