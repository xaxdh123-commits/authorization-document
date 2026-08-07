import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { SettingsRepository } from '../database/repositories/settings.repository';
import { isKnownSettingKey, isSensitiveSettingKey, validatePublicSetting } from './settings.schema';

@Injectable()
export class SettingsService {
  constructor(private readonly settings: SettingsRepository) {}
  async list() { return (await this.settings.listForDisplay()).map((setting) => this.forDisplay(setting)); }
  async get(key: string) { const value = await this.settings.getForDisplay(key); if (!value) throw new NotFoundException('设置项不存在'); return this.forDisplay(value); }
  async update(key: string, input: { value?: unknown; masked?: unknown }, actorUserId: string) {
    if (typeof input?.value !== 'string' || input.masked !== undefined && typeof input.masked !== 'boolean') throw new BadRequestException({ message: '设置项校验失败', fields: [{ path: 'value', message: '格式无效' }] });
    if (!isKnownSettingKey(key)) throw new BadRequestException('不支持的设置项');
    const sensitive = isSensitiveSettingKey(key);
    if (!sensitive && (input.masked === true || !validatePublicSetting(key, input.value))) throw new BadRequestException({ message: '设置项校验失败', fields: [{ path: 'value', message: '值不符合设置项类型' }] });
    try { return await this.settings.setAudited({ key, value: input.value, masked: sensitive, actorUserId }); }
    catch (error) {
      if (error instanceof Error && error.message.startsWith('SETTINGS_ENCRYPTION_KEY_')) throw new ServiceUnavailableException('敏感设置加密配置不可用');
      throw error;
    }
  }
  private forDisplay<T extends { key: string; value: string; masked: boolean }>(setting: T): T { return isSensitiveSettingKey(setting.key) ? { ...setting, value: '******', masked: true } : setting; }
}
