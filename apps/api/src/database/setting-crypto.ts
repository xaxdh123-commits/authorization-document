import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export type EncryptedSettingValue = { version: 1; ciphertext: string; iv: string; tag: string };
const AAD = Buffer.from('authorization-document:settings:v1', 'utf8');

function parseKey(value = process.env.SETTINGS_ENCRYPTION_KEY): Buffer {
  if (!value) throw new Error('SETTINGS_ENCRYPTION_KEY_REQUIRED');
  const key = /^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('SETTINGS_ENCRYPTION_KEY_INVALID');
  return key;
}

export function encryptSettingValue(value: string, keyValue?: string): EncryptedSettingValue {
  const key = parseKey(keyValue);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return { version: 1, ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}

export function decryptSettingValue(value: EncryptedSettingValue, keyValue?: string): string {
  try {
    if (value.version !== 1) throw new Error('unsupported');
    const decipher = createDecipheriv('aes-256-gcm', parseKey(keyValue), Buffer.from(value.iv, 'base64'));
    decipher.setAAD(AAD);
    decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('SETTINGS_ENCRYPTION_KEY_')) throw error;
    throw new Error('SETTINGS_DECRYPTION_FAILED');
  }
}
