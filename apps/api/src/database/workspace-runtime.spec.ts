import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

describe('compiled workspace package runtime', () => {
  it('loads @auth/contracts from the API package with Node', () => {
    const apiRoot = join(__dirname, '../..');

    expect(() =>
      execFileSync(process.execPath, ['-e', 'require("@auth/contracts")'], {
        cwd: apiRoot,
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });
});
