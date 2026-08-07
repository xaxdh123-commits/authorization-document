import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { decryptSettingValue, encryptSettingValue } from '../setting-crypto';
import { AuditWriter } from './audit-writer';

@Injectable()
export class SettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  set(input: { key: string; value: string; masked: boolean; actorUserId: string }) {
    const encrypted = input.masked ? encryptSettingValue(input.value) : null;
    const data = {
      value: encrypted?.ciphertext ?? input.value,
      masked: input.masked,
      encryptionVersion: encrypted?.version ?? null,
      encryptionIv: encrypted?.iv ?? null,
      encryptionTag: encrypted?.tag ?? null,
      updatedBy: input.actorUserId,
    };
    return this.prisma.db.systemSetting.upsert({ where: { key: input.key }, create: { key: input.key, ...data }, update: data });
  }

  async getForDisplay(key: string) {
    const setting = await this.prisma.db.systemSetting.findUnique({ where: { key } });
    if (!setting) return null;
    const { encryptionVersion: _version, encryptionIv: _iv, encryptionTag: _tag, ...display } = setting;
    return { ...display, value: setting.masked ? '******' : setting.value };
  }

  async listForDisplay() {
    const settings = await this.prisma.db.systemSetting.findMany({ orderBy: { key: 'asc' } });
    return settings.map(({ encryptionVersion: _version, encryptionIv: _iv, encryptionTag: _tag, ...setting }) => ({
      ...setting, value: setting.masked ? '******' : setting.value,
    }));
  }

  setAudited(input: { key: string; value: string; masked: boolean; actorUserId: string }) {
    const encrypted = input.masked ? encryptSettingValue(input.value) : null;
    const data = {
      value: encrypted?.ciphertext ?? input.value, masked: input.masked,
      encryptionVersion: encrypted?.version ?? null, encryptionIv: encrypted?.iv ?? null, encryptionTag: encrypted?.tag ?? null,
      updatedBy: input.actorUserId,
    };
    return this.prisma.db.$transaction(async (tx) => {
      const before = await tx.systemSetting.findUnique({ where: { key: input.key }, select: { key: true, masked: true } });
      const setting = await tx.systemSetting.upsert({ where: { key: input.key }, create: { key: input.key, ...data }, update: data });
      await AuditWriter.append(tx, { data: { actorUserId: input.actorUserId, action: 'SETTING_UPDATE', targetType: 'SETTING', targetId: input.key, detail: { before: before ? { exists: true, masked: before.masked } : null, after: { exists: true, masked: input.masked }, result: 'SUCCESS', note: '设置值已更新，审计日志不记录值内容' } } });
      const { encryptionVersion: _version, encryptionIv: _iv, encryptionTag: _tag, ...display } = setting;
      return { ...display, value: setting.masked ? '******' : setting.value };
    });
  }

  async getInternal(key: string) {
    const setting = await this.prisma.db.systemSetting.findUnique({ where: { key } });
    if (!setting || !setting.masked) return setting;
    if (setting.encryptionVersion !== 1 || !setting.encryptionIv || !setting.encryptionTag) {
      throw new Error('SETTINGS_CIPHERTEXT_INVALID');
    }
    return {
      ...setting,
      value: decryptSettingValue({
        version: 1,
        ciphertext: setting.value,
        iv: setting.encryptionIv,
        tag: setting.encryptionTag,
      }),
    };
  }
}
