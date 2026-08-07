import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('acceptance runner gates its own release tools and deploy mocks', async () => {
  const source = await readFile(new URL('./run-acceptance.mjs', import.meta.url), 'utf8');
  assert.match(source, /\['release-tools',\s*pnpm,\s*\['test:release-tools'\],\s*true\]/);
  assert.match(source, /\['deploy-script-mocks',\s*'powershell'.*deploy\/deploy-scripts\.test\.ps1.*true\]/);
  assert.match(source, /localCodePass/);
  assert.match(source, /RELEASE_BLOCKED/);
  assert.match(source, /runId/);
  assert.match(source, /gitRef/);
  assert.match(source, /full-gate\.txt/);
});
