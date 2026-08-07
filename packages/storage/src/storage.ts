import type { Readable } from 'node:stream';
export interface StoredFile { storageKey: string; relativePath: string; sha256: string; }
export type BoundedRead={bytes:Buffer;sha256:string;sizeBytes:number};
export interface Storage { write(input: Readable, fileId: string, originalName: string): Promise<StoredFile>;writeOnce(input:Readable,storageKey:string,maxBytes:number):Promise<StoredFile>;writeContentAddressed(input:Readable,sha256:string,extension:string):Promise<StoredFile>;read(storageKey: string): Promise<Readable>;readWithLimit(storageKey:string,maxBytes:number):Promise<BoundedRead>; exists(storageKey: string): Promise<boolean>; remove(storageKey: string): Promise<void>; }
