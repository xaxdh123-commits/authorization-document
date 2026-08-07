import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TemplateAstSchema, type TemplateAst } from '@auth/contracts';
import { Prisma, SignatureMode } from '@prisma/client';
import { CatalogVersionRepository } from '../database/repositories/catalog-version.repository';
import { validateTemplateForPublish, validateTemplateStructure, type TemplateRequirementSource } from './template-publish.validator';

type TemplateInput = { key: string; name: string; description?: string; ast: TemplateAst; signatureMode: SignatureMode; requirementVersionIds: string[] };
type DraftInput = Omit<TemplateInput, 'key' | 'name'> & { name?: string };

@Injectable()
export class TemplatesService {
  constructor(private readonly catalog: CatalogVersionRepository) {}
  list() { return this.catalog.listTemplates(); }
  async get(id: string) { const value = await this.catalog.getTemplate(id); if (!value) throw new NotFoundException('模板不存在'); return value; }
  history(id: string) { return this.catalog.templateHistory(id); }
  async create(input: unknown, actorUserId: string) {
    const value = this.parseTemplate(input, true) as TemplateInput;
    await this.validateEditor(value.ast, value.requirementVersionIds, false);
    return this.catalog.createTemplate({ ...value, ast: value.ast as unknown as Prisma.InputJsonValue }, actorUserId);
  }
  copy(id: string, input: unknown, actorUserId: string) {
    const value = this.record(input);
    if (!this.machineKey(value.key) || typeof value.name !== 'string' || !value.name.trim()) throw this.fields('复制模板参数无效', ['key', 'name']);
    return this.catalog.copyTemplate(id, { key: value.key as string, name: value.name }, actorUserId);
  }
  async saveDraft(id: string, input: unknown, actorUserId: string) {
    const value = this.parseTemplate(input, false) as DraftInput;
    await this.validateEditor(value.ast, value.requirementVersionIds, false);
    return this.catalog.saveTemplateDraft(id, { ...value, ast: value.ast as unknown as Prisma.InputJsonValue }, actorUserId);
  }
  async publish(versionId: string, actorUserId: string) {
    return this.catalog.publishTemplateAtomically(versionId, actorUserId, (version) => {
      if (version.status !== 'DRAFT') throw new BadRequestException('只有草稿版本可以发布');
      this.runValidation(() => validateTemplateForPublish(version.ast, version.requirements.map((link) => link.requirementVersion as TemplateRequirementSource)));
    });
  }
  disable(versionId: string, actorUserId: string) { return this.catalog.disableTemplate(versionId, actorUserId); }

  private parseTemplate(input: unknown, creating: boolean): TemplateInput | DraftInput {
    const value = this.record(input);
    const ast = TemplateAstSchema.safeParse(value.ast);
    const ids = Array.isArray(value.requirementVersionIds) && value.requirementVersionIds.every((id) => typeof id === 'string' && id.length > 0) ? value.requirementVersionIds as string[] : undefined;
    const mode = value.signatureMode === SignatureMode.STAMP_UPLOAD ? SignatureMode.STAMP_UPLOAD : value.signatureMode === undefined || value.signatureMode === SignatureMode.HANDWRITTEN ? SignatureMode.HANDWRITTEN : undefined;
    const invalid = [...(!ast.success ? ['ast'] : []), ...(!ids?.length ? ['requirementVersionIds'] : []), ...(!mode ? ['signatureMode'] : [])];
    if (creating && (!this.machineKey(value.key) || typeof value.name !== 'string' || !value.name.trim())) invalid.push('key/name');
    if (ids) {
      const seen = new Set<string>();
      ids.forEach((id, index) => { if (seen.has(id)) invalid.push(`requirementVersionIds.${index}`); seen.add(id); });
    }
    if (invalid.length) throw this.fields('模板校验失败', invalid);
    return { ...(creating ? { key: value.key as string, name: value.name as string } : { name: typeof value.name === 'string' ? value.name : undefined }), description: typeof value.description === 'string' ? value.description : undefined, ast: ast.data!, signatureMode: mode!, requirementVersionIds: ids! };
  }
  private async validateEditor(ast: TemplateAst, requirementVersionIds: string[], publishing: boolean) {
    const versions = await this.catalog.getRequirementVersions(requirementVersionIds);
    if (versions.length !== new Set(requirementVersionIds).size) throw new BadRequestException('引用的资料字段版本不存在');
    this.runValidation(() => (publishing ? validateTemplateForPublish : validateTemplateStructure)(ast, versions as TemplateRequirementSource[]));
  }
  private runValidation(work: () => unknown) { try { return work(); } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : '模板校验失败'); } }
  private record(input: unknown): Record<string, unknown> { if (!input || typeof input !== 'object' || Array.isArray(input)) throw this.fields('请求格式无效', ['body']); return input as Record<string, unknown>; }
  private machineKey(value: unknown): value is string { return typeof value === 'string' && /^[a-z][a-z0-9_]*$/.test(value); }
  private fields(message: string, paths: string[]) { return new BadRequestException({ message, fields: paths.map((path) => ({ path, message: '格式无效' })) }); }
}
