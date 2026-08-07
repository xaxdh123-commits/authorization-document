export type ManualEntry = { platform: string; version: string; device: string; executedAt: string; result: 'PASS'; evidence: string; executor: string; signature: string };

export function validateManualMatrix(value: unknown): ManualEntry[] {
  if (!Array.isArray(value)) throw new Error('人工浏览器矩阵必须是数组');
  const required = ['iOS Safari 最新主版本', 'iOS Safari 前一主版本', '目标微信内置浏览器'];
  for (const platform of required) {
    const entry = value.find((item): item is ManualEntry => Boolean(item && typeof item === 'object' && (item as ManualEntry).platform === platform));
    if (!entry || !entry.version || !entry.device || !entry.executedAt || entry.result !== 'PASS' || !entry.evidence || !entry.executor || !entry.signature) {
      throw new Error(`人工浏览器矩阵缺少有效签署条目：${platform}`);
    }
  }
  return value as ManualEntry[];
}
