import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { createPdfFixture, requireSafeTestUrl } from './pdf-integration.fixture';

const url = requireSafeTestUrl();
const suite = url ? describe : describe.skip;
suite('PDF fixture setup smoke', () => {
  let prisma: PrismaClient; let root: string;
  beforeAll(async () => { root = await mkdtemp(path.join(os.tmpdir(), 'auth-pdf-fixture-')); prisma = new PrismaClient({ datasources: { db: { url } } }); });
  afterAll(async () => { await prisma.$disconnect(); await rm(root, { recursive: true, force: true }); });
  it('creates a trigger-compliant catalog and derived seal resource', async () => {
    const fixture = await createPdfFixture(prisma, root, 'QUEUED');
    const [template, requirement, seal, signing] = await Promise.all([
      prisma.templateVersion.findUniqueOrThrow({ where: { id: fixture.ids.templateVersion } }),
      prisma.requirementVersion.findUniqueOrThrow({ where: { id: fixture.ids.requirementVersion } }),
      prisma.fileVersion.findUniqueOrThrow({ where: { id: fixture.ids.resourceVersion } }),
      prisma.signingRecord.findUniqueOrThrow({ where: { id: fixture.ids.signing } }),
    ]);
    expect([template.status, requirement.status]).toEqual(['PUBLISHED', 'PUBLISHED']);
    expect((await prisma.caseSnapshot.findUniqueOrThrow({where:{id:fixture.ids.snapshot}})).frozenAt).not.toBeNull();
    expect(seal.originalFileVersionId).toBe(fixture.ids.originalVersion);
    expect(signing.valid).toBe(true);
  });
});
