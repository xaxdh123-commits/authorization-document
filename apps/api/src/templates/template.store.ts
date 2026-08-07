import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { RequirementDefinition, TemplateCreate, TemplateUpdate } from '@auth/contracts';

type StoredRequirement = RequirementDefinition & { system?: boolean };
export type StoredTemplateVersion = {
  id: string;
  version: number;
  status: 'DRAFT' | 'PUBLISHED' | 'DISABLED';
  ast: Record<string, unknown>;
  signatureMode: 'HANDWRITTEN' | 'STAMP_UPLOAD';
  requirements: StoredRequirement[];
  createdAt: string;
  updatedAt: string;
};
export type StoredTemplate = {
  id: string;
  name: string;
  description?: string;
  versions: StoredTemplateVersion[];
  createdAt: string;
  updatedAt: string;
};

const AUTHORIZATION_REQUIREMENT: StoredRequirement = {
  key: 'authorization_letter', label: '授权书', type: 'FILE', required: true, sensitive: true, system: true,
};

@Injectable()
export class TemplateStore {
  private readonly templates = new Map<string, StoredTemplate>();

  constructor() {
    const builtin = this.create({ name: '默认委托生产授权书', description: '系统内置模板' });
    // Stable id for the built-in template keeps existing clients backwards compatible.
    builtin.versions[0].id = 't';
  }

  list(): StoredTemplate[] { return [...this.templates.values()]; }
  get(id: string): StoredTemplate | undefined { return this.templates.get(id); }
  hasVersion(versionId: string): boolean { return this.list().some((t) => t.versions.some((v) => v.id === versionId)); }
  getVersion(versionId: string): StoredTemplateVersion | undefined {
    return this.list().flatMap((t) => t.versions).find((v) => v.id === versionId);
  }

  create(input: TemplateCreate): StoredTemplate {
    const now = new Date().toISOString();
    const id = `tpl-${randomUUID()}`;
    const versionId = `${id}-v1`;
    const version: StoredTemplateVersion = {
      id: versionId, version: 1, status: 'DRAFT', ast: input.ast ?? {},
      signatureMode: input.signatureMode ?? 'HANDWRITTEN',
      requirements: this.requirements(input.requirements), createdAt: now, updatedAt: now,
    };
    const value: StoredTemplate = { id, name: input.name, description: input.description, versions: [version], createdAt: now, updatedAt: now };
    this.templates.set(id, value);
    return value;
  }

  update(id: string, input: TemplateUpdate): StoredTemplate {
    const value = this.templates.get(id);
    if (!value) throw new Error('template not found');
    if (input.name !== undefined) value.name = input.name;
    if (input.description !== undefined) value.description = input.description;
    const current = value.versions[value.versions.length - 1];
    if (input.ast !== undefined) current.ast = input.ast;
    if (input.signatureMode !== undefined) current.signatureMode = input.signatureMode;
    if (input.requirements !== undefined) current.requirements = this.requirements(input.requirements);
    value.updatedAt = new Date().toISOString(); current.updatedAt = value.updatedAt;
    return value;
  }

  private requirements(items: RequirementDefinition[] | undefined): StoredRequirement[] {
    const others = (items ?? []).filter((item) => item.key !== AUTHORIZATION_REQUIREMENT.key).map((item) => ({ ...item, required: item.required ?? false }));
    return [AUTHORIZATION_REQUIREMENT, ...others];
  }
}
