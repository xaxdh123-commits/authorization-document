import { decryptSettingValue, encryptSettingValue } from './setting-crypto';

const key = Buffer.alloc(32, 7).toString('base64');
const otherKey = Buffer.alloc(32, 8).toString('base64');

describe('setting encryption', () => {
  test('encrypts with authenticated versioned AES-256-GCM payload', () => {
    const encrypted = encryptSettingValue('very-secret', key);
    expect(encrypted).toMatchObject({ version: 1 });
    expect(JSON.stringify(encrypted)).not.toContain('very-secret');
    expect(decryptSettingValue(encrypted, key)).toBe('very-secret');
    expect(() => decryptSettingValue(encrypted, otherKey)).toThrow('SETTINGS_DECRYPTION_FAILED');
  });

  test('fails closed when key is missing or invalid', () => {
    expect(() => encryptSettingValue('secret', '')).toThrow('SETTINGS_ENCRYPTION_KEY_REQUIRED');
    expect(() => encryptSettingValue('secret', 'not-a-valid-key')).toThrow('SETTINGS_ENCRYPTION_KEY_INVALID');
  });
});
