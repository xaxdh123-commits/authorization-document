export const SENSITIVE_SETTING_KEYS = new Set([
  'upstream.clientSecret', 'upstream.token', 'nas.username', 'nas.password',
  'evidence.apiSecret', 'evidence.providerToken', 'pdf.apiSecret',
]);

const publicValidators: Record<string, (value: string) => boolean> = {
  'upstream.baseUrl': isHttpUrl,
  'h5.baseUrl': isHttpUrl,
  'storage.basePath': nonEmpty,
  'storage.nasMountPath': nonEmpty,
  'link.defaultExpiryHours': integerBetween(1, 720),
  'pdf.workerConcurrency': integerBetween(1, 20),
  'signing.evidenceMode': (value) => ['ORDINARY', 'TRUSTED_TIMESTAMP', 'CA_CERTIFICATE', 'E_CONTRACT_PROVIDER'].includes(value),
};

export function isSensitiveSettingKey(key: string) { return SENSITIVE_SETTING_KEYS.has(key); }
export function isKnownSettingKey(key: string) { return isSensitiveSettingKey(key) || key in publicValidators; }
export function validatePublicSetting(key: string, value: string) { return publicValidators[key]?.(value) ?? false; }

function nonEmpty(value: string) { return value.trim().length > 0; }
function isHttpUrl(value: string) { try { const url = new URL(value); return url.protocol === 'http:' || url.protocol === 'https:'; } catch { return false; } }
function integerBetween(min: number, max: number) { return (value: string) => { const parsed = Number(value); return Number.isInteger(parsed) && parsed >= min && parsed <= max; }; }
