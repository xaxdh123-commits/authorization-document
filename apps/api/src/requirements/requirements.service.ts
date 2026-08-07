import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RequirementDefinitionSchema } from '@auth/contracts';
import type { Prisma } from '@prisma/client';
import { CatalogVersionRepository } from '../database/repositories/catalog-version.repository';

@Injectable()
export class RequirementsService {
  constructor(private readonly catalog: CatalogVersionRepository) {}
  list() { return this.catalog.listRequirements(); }
  async get(id: string) { const value = await this.catalog.getRequirement(id); if (!value) throw new NotFoundException('资料字段不存在'); return value; }
  history(id: string) { return this.catalog.requirementHistory(id); }
  create(input: unknown, actorUserId: string) {
    const definition = this.parse(input);
    return this.catalog.createRequirement({ key: definition.key, name: definition.label, definition: definition as Prisma.InputJsonValue }, actorUserId);
  }
  async saveDraft(id: string, input: unknown, actorUserId: string) {
    const definition = this.parse(input);
    const requirement = await this.catalog.getRequirement(id);
    if (!requirement) throw new NotFoundException('资料字段不存在');
    if (definition.key !== requirement.key) throw new BadRequestException({ message: '资料字段校验失败', fields: [{ path: 'definition.key', message: '机器 key 创建后不可修改' }] });
    return this.catalog.saveRequirementDraft(id, definition as Prisma.InputJsonValue, actorUserId);
  }
  publish(versionId: string, actorUserId: string) {
    return this.catalog.publishRequirementAtomically(versionId, actorUserId, (version) => {
      const definition = this.parse(version.definition);
      if (definition.key !== version.requirement.key) throw new BadRequestException({ message: '资料字段校验失败', fields: [{ path: 'definition.key', message: '机器 key 与字段主键不一致' }] });
    });
  }
  disable(versionId: string, actorUserId: string) { return this.catalog.disableRequirement(versionId, actorUserId); }
  private parse(input: unknown) {
    try {
      const definition = RequirementDefinitionSchema.parse(input);
      this.validateSemantics(definition);
      return definition;
    }
    catch (error) {
      if (error && typeof error === 'object' && 'issues' in error) {
        const issues = (error as { issues: Array<{ path: PropertyKey[]; message: string }> }).issues;
        throw new BadRequestException({ message: '资料字段校验失败', fields: issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) });
      }
      throw error;
    }
  }

  private validateSemantics(definition: ReturnType<typeof RequirementDefinitionSchema.parse>) {
    const issues: Array<{ path: string; message: string }> = [];
    const select = definition.type === 'SINGLE_SELECT' || definition.type === 'MULTI_SELECT';
    if (select && !definition.options?.length) issues.push({ path: 'options', message: '选择类型必须配置选项' });
    if (!select && definition.options !== undefined) issues.push({ path: 'options', message: '当前字段类型不支持选项' });
    if (definition.defaultValue !== undefined) {
      const value = definition.defaultValue;
      const optionValues = new Set(definition.options?.map((option) => option.value));
      const valid = definition.type === 'NUMBER' ? typeof value === 'number' && Number.isFinite(value)
        : definition.type === 'MULTI_SELECT' ? Array.isArray(value) && value.every((item) => typeof item === 'string' && optionValues.has(item))
          : definition.type === 'SINGLE_SELECT' ? typeof value === 'string' && optionValues.has(value)
            : definition.type === 'DATE' ? typeof value === 'string' && this.validDate(value)
              : definition.type === 'TEXT' || definition.type === 'LONG_TEXT' ? typeof value === 'string'
                : false;
      if (!valid) issues.push({ path: 'defaultValue', message: '默认值与字段类型不匹配' });
    }
    const validation = definition.validation;
    let compiledPattern: RegExp | undefined;
    if (validation) {
      if (!['TEXT', 'LONG_TEXT'].includes(definition.type) && (validation.minLength !== undefined || validation.maxLength !== undefined || validation.pattern !== undefined)) issues.push({ path: 'validation', message: '当前字段类型不支持文本校验' });
      if (definition.type !== 'NUMBER' && (validation.min !== undefined || validation.max !== undefined)) issues.push({ path: 'validation', message: '当前字段类型不支持数值范围' });
      if (!['FILE', 'IMAGE'].includes(definition.type) && (validation.maxFiles !== undefined || validation.maxFileSizeBytes !== undefined || validation.allowedMimeTypes !== undefined)) issues.push({ path: 'validation', message: '当前字段类型不支持文件校验' });
      if (validation.min !== undefined && validation.max !== undefined && validation.min > validation.max) issues.push({ path: 'validation.min', message: '最小值不能大于最大值' });
      if (validation.minLength !== undefined && validation.maxLength !== undefined && validation.minLength > validation.maxLength) issues.push({ path: 'validation.minLength', message: '最小长度不能大于最大长度' });
      if (validation.pattern !== undefined) {
        try { compiledPattern = new RegExp(validation.pattern); }
        catch { issues.push({ path: 'validation.pattern', message: '正则表达式无效' }); }
      }
    }
    if (select && definition.options) {
      const seen = new Set<string>();
      definition.options.forEach((option, index) => {
        if (seen.has(option.value)) issues.push({ path: `options.${index}.value`, message: '选项值不能重复' });
        seen.add(option.value);
      });
    }
    if (['FILE', 'IMAGE'].includes(definition.type)) {
      const allowed = definition.type === 'IMAGE' ? new Set(['image/png', 'image/jpeg']) : new Set(['application/pdf', 'image/png', 'image/jpeg']);
      if (!validation?.maxFiles || validation.maxFiles > 10) issues.push({ path: 'validation.maxFiles', message: '单项最多 10 个文件' });
      if (!validation?.maxFileSizeBytes || validation.maxFileSizeBytes > 20 * 1024 * 1024) issues.push({ path: 'validation.maxFileSizeBytes', message: '单文件最大 20MB' });
      if (!validation?.allowedMimeTypes?.length || validation.allowedMimeTypes.some((mime) => !allowed.has(mime))) issues.push({ path: 'validation.allowedMimeTypes', message: '文件类型仅支持 PDF、PNG、JPEG' });
    }
    if (definition.defaultValue !== undefined && validation) {
      const value = definition.defaultValue;
      if (definition.type === 'NUMBER' && typeof value === 'number' && (validation.min !== undefined && value < validation.min || validation.max !== undefined && value > validation.max)) issues.push({ path: 'defaultValue', message: '默认值超出数值范围' });
      if (['TEXT', 'LONG_TEXT'].includes(definition.type) && typeof value === 'string') {
        if (validation.minLength !== undefined && value.length < validation.minLength || validation.maxLength !== undefined && value.length > validation.maxLength) issues.push({ path: 'defaultValue', message: '默认值长度不符合校验规则' });
        if (compiledPattern && !compiledPattern.test(value)) issues.push({ path: 'defaultValue', message: '默认值不符合正则校验' });
      }
    }
    if (issues.length) throw new BadRequestException({ message: '资料字段校验失败', fields: issues });
  }
  private validDate(value: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;
    const [year, month, day] = match.slice(1).map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }
}
