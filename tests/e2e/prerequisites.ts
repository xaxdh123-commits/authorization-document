export type E2EPrerequisites = { ready: boolean; reason?: string; apiUrl?: string; databaseUrl?: string };

export function inspectE2EPrerequisites(env: NodeJS.ProcessEnv): E2EPrerequisites {
  const databaseUrl = env.TEST_DATABASE_URL?.trim();
  const apiUrl = env.E2E_API_URL?.trim();
  if (!databaseUrl) return { ready: false, reason: '未设置 TEST_DATABASE_URL；真实数据库集成未运行' };
  let databaseName = '';
  try { databaseName = new URL(databaseUrl).pathname.replace(/^\//, ''); } catch { return { ready: false, reason: 'TEST_DATABASE_URL 不是有效 URL' }; }
  if (!databaseName.endsWith('_test')) return { ready: false, reason: 'TEST_DATABASE_URL 数据库名必须以 _test 结尾' };
  if (!apiUrl) return { ready: false, reason: '未设置 E2E_API_URL；未启动专用 E2E API' };
  return { ready: true, apiUrl, databaseUrl };
}
