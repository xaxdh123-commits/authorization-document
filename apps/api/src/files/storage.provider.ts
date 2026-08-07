import path from 'node:path';
import { LocalStorage, type Storage } from '@auth/storage';

export const STORAGE = Symbol('STORAGE');
export const storageProvider = {
  provide: STORAGE,
  useFactory: (): Storage => {
    const mode = process.env.STORAGE_MODE?.trim() || 'local';
    if (mode !== 'local') throw new Error(`尚未配置存储后端：${mode}`);
    return new LocalStorage(path.resolve(process.env.STORAGE_LOCAL_ROOT?.trim() || './data/private-files'));
  },
};
