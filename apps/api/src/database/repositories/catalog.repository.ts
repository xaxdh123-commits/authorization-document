import { Injectable } from '@nestjs/common';
import { CatalogVersionStatus, Prisma, SignatureMode } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { serializableTransaction } from './transaction';

type RequirementInput = { key: string; name: string; definition: Prisma.InputJsonValue; actorUserId: string };
type TemplateInput = {
  key: string; name: string; description?: string; ast: Prisma.InputJsonValue;
  signatureMode: SignatureMode; requirementVersionIds: string[]; actorUserId: string;
};

@Injectable()
export class CatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  createRequirement(input: RequirementInput) {
    return this.prisma.db.$transaction(async (tx) => tx.requirement.create({
      data: {
        key: input.key, name: input.name,
        versions: { create: { version: 1, definition: input.definition, createdBy: input.actorUserId } },
      },
      include: { versions: true },
    }));
  }

  createRequirementVersion(requirementId: string, definition: Prisma.InputJsonValue, actorUserId: string) {
    return serializableTransaction(this.prisma.db, async (tx) => {
      const latest = await tx.requirementVersion.aggregate({ where: { requirementId }, _max: { version: true } });
      return tx.requirementVersion.create({
        data: { requirementId, version: (latest._max.version ?? 0) + 1, definition, createdBy: actorUserId },
      });
    });
  }

  createTemplate(input: TemplateInput) {
    return this.prisma.db.$transaction(async (tx) => tx.template.create({
      data: {
        key: input.key, name: input.name, description: input.description,
        versions: { create: {
          version: 1, ast: input.ast, signatureMode: input.signatureMode, createdBy: input.actorUserId,
          requirements: { create: input.requirementVersionIds.map((requirementVersionId, position) => ({ requirementVersionId, position })) },
        } },
      },
      include: { versions: { include: { requirements: true } } },
    }));
  }

  async publishTemplateVersion(id: string, _actorUserId: string) {
    return this.prisma.db.templateVersion.update({
      where: { id }, data: { status: CatalogVersionStatus.PUBLISHED, publishedAt: new Date() },
    });
  }
}
