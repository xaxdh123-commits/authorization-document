import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';

export async function writeAtomically(root: string, relativePath: string, input: Readable): Promise<string> {
  const target = path.join(root, relativePath); const dir = path.dirname(target); await mkdir(dir, {recursive:true});
  const temp = `${target}.${randomUUID()}.tmp`; const hash = createHash('sha256');
  try {
    await new Promise<void>((resolve,reject)=>{ const out=createWriteStream(temp); input.on('data', c=>hash.update(c)); input.once('error', reject); out.once('error', reject); out.once('finish', resolve); input.pipe(out); });
    await rename(temp,target); return hash.digest('hex');
  } catch (error) {
    await import('node:fs/promises').then(({rm})=>rm(temp,{force:true}));
    throw error;
  }
}
