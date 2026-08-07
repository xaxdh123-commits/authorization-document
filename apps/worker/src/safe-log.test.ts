import { expect, it } from 'vitest';
import { redactWorkerLog } from './safe-log.js';
it('redacts worker credentials, ids, paths and stacks', () => {
  const text = JSON.stringify(redactWorkerLog({ token: 'secret-token', cookie: 'secret-cookie', password: 'secret-password', fileId: 'secret-file', path: '/private/a', stack: 'trace' }));
  expect(text).not.toMatch(/secret|private|trace/);
});
