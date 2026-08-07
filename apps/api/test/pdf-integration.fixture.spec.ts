import { PDF_FIXTURE_CHINESE_TEXT, requireSafeTestUrl } from './pdf-integration.fixture';
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('PDF integration database safety', () => {
  const originalTest = process.env.TEST_DATABASE_URL;
  const originalDatabase = process.env.DATABASE_URL;
  afterEach(() => {
    if (originalTest === undefined) delete process.env.TEST_DATABASE_URL; else process.env.TEST_DATABASE_URL = originalTest;
    if (originalDatabase === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalDatabase;
  });
  it('accepts only the retained TEST_DATABASE_URL and verifies wrapper propagation', () => {
    process.env.TEST_DATABASE_URL = 'postgresql://user:pass@localhost:5432/auth_test';
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    expect(requireSafeTestUrl()).toBe(process.env.TEST_DATABASE_URL);
    const wrapper = readFileSync(path.resolve(process.cwd(), '../../scripts/test-db.mjs'), 'utf8');
    expect(wrapper).toContain('TEST_DATABASE_URL: testDatabaseUrl, DATABASE_URL: testDatabaseUrl');
  });
  it('ignores a development DATABASE_URL', () => {delete process.env.TEST_DATABASE_URL;process.env.DATABASE_URL='postgresql://user:pass@localhost:5432/authorization';expect(requireSafeTestUrl()).toBeUndefined();});
  it('never falls back to DATABASE_URL even when it points to a test-looking database',()=>{delete process.env.TEST_DATABASE_URL;process.env.DATABASE_URL='postgresql://user:pass@localhost:5432/auth_test';expect(requireSafeTestUrl()).toBeUndefined();});
  it('keeps fixture evidence text as real Chinese Unicode',()=>{expect(PDF_FIXTURE_CHINESE_TEXT).toEqual(['第一页','第二页','甲方','授权书']);expect(PDF_FIXTURE_CHINESE_TEXT.join('')).not.toContain('�');});
});
