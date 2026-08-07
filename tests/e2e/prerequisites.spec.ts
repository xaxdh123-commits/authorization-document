import { describe, expect, it } from 'vitest';
import { inspectE2EPrerequisites } from './prerequisites';

describe('E2E 安全前置条件', () => {
  it('拒绝非 _test 数据库且不暴露连接串', () => {
    const result = inspectE2EPrerequisites({ TEST_DATABASE_URL: 'postgresql://user:secret@db/prod', E2E_API_URL: 'http://127.0.0.1:3999' });
    expect(result).toEqual({ ready: false, reason: 'TEST_DATABASE_URL 数据库名必须以 _test 结尾' });
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('缺少环境时给出可审计的中文跳过原因', () => {
    expect(inspectE2EPrerequisites({})).toEqual({ ready: false, reason: '未设置 TEST_DATABASE_URL；真实数据库集成未运行' });
  });

  it('仅接受专用测试数据库和 E2E API', () => {
    expect(inspectE2EPrerequisites({ TEST_DATABASE_URL: 'postgresql://user:secret@db/authorization_test', E2E_API_URL: 'http://127.0.0.1:3999' })).toMatchObject({ ready: true, apiUrl: 'http://127.0.0.1:3999' });
  });
});
