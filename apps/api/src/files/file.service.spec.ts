import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { FileService, type IncomingFile } from './file.service';

const MB = 1024 * 1024;

function pdf(size: number, name = 'proof.pdf'): IncomingFile {
  const buffer = Buffer.alloc(size, 0x20);
  Buffer.from('%PDF-1.4\n').copy(buffer, 0);
  Buffer.from('\n%%EOF').copy(buffer, size - 6);
  return { originalname: name, mimetype: 'application/pdf', size, buffer };
}
function png():IncomingFile{const buffer=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),Buffer.from('0000IEND')]);return{originalname:'seal.png',mimetype:'image/png',size:buffer.length,buffer};}

function removedSigningEvidenceAggregate(sizeBytes: number) {
  return jest.fn(async ({ where }: any) => {
    const filters = where.OR ?? [];
    const countsSigningResource = filters.some((filter: any) => filter.signingResources?.some);
    const countsDerivedSealOriginal = filters.some((filter: any) => filter.derivedFileVersions?.some?.signingResources?.some);
    return { _sum: { sizeBytes: countsSigningResource && countsDerivedSealOriginal ? sizeBytes : 0 } };
  });
}

function fixture(overrides: Record<string, unknown> = {}) {
  const tx: any = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'case-1' }]),
    caseSnapshot: { findFirst: jest.fn().mockResolvedValue({ requirements: [{ requirementVersionId: 'rv-1', requirementVersion: { definition: {}, requirement: { key: 'license' } } }] }) },
    fileRecord: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...data })),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    fileVersion: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { sizeBytes: 0 } }),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'version-1', ...data })),
    },
    signingRecord: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    ...overrides,
  };
  const db: any = { ...tx, $transaction: jest.fn(async (work: any) => work(tx)) };
  const tokens = {
    resolve: jest.fn().mockResolvedValue({ caseId: 'case-1' }),
    resolveForMutation: jest.fn().mockResolvedValue({ caseId: 'case-1' }),
  };
  const storage = {
    write: jest.fn(async (input: Readable) => { const chunks:Buffer[]=[]; for await(const chunk of input)chunks.push(Buffer.from(chunk)); return { storageKey: 'private/key.pdf', sha256: createHash('sha256').update(Buffer.concat(chunks)).digest('hex') }; }),
    read: jest.fn().mockResolvedValue(Readable.from('content')),
    exists: jest.fn().mockResolvedValue(true),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  return { service: new FileService({ db } as any, tokens as any, storage as any), tx, db, tokens, storage };
}

describe('FileService active upload quotas', () => {
  it('accepts a file of exactly 20MB', async () => {
    const { service } = fixture();
    await expect(service.uploadPublic('token-a', 'license', pdf(20 * MB))).resolves.toMatchObject({ fileId: expect.any(String), reused: false });
  });

  it('accepts the 10th active material and rejects the 11th', async () => {
    const tenth = fixture();
    tenth.tx.fileRecord.count.mockResolvedValue(9);
    await expect(tenth.service.uploadPublic('token-a', 'license', pdf(16))).resolves.toBeDefined();

    const eleventh = fixture();
    eleventh.tx.fileRecord.count.mockResolvedValue(10);
    await expect(eleventh.service.uploadPublic('token-a', 'license', pdf(16))).rejects.toBeInstanceOf(BadRequestException);
    expect(eleventh.storage.remove).toHaveBeenCalledWith('private/key.pdf');
  });

  it('accepts exactly 200MB active usage and rejects one byte more', async () => {
    const exact = fixture();
    exact.tx.fileVersion.aggregate.mockResolvedValue({ _sum: { sizeBytes: 200 * MB - 16 } });
    await expect(exact.service.uploadPublic('token-a', 'license', pdf(16))).resolves.toBeDefined();

    const over = fixture();
    over.tx.fileVersion.aggregate.mockResolvedValue({ _sum: { sizeBytes: 200 * MB - 15 } });
    await expect(over.service.uploadPublic('token-a', 'license', pdf(16))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('locks the case row before reading active count and capacity', async () => {
    const { service, tx } = fixture();
    await service.uploadPublic('token-a', 'license', pdf(16));
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.fileRecord.count.mock.invocationCallOrder[0]);
    expect(tx.fileRecord.count).toHaveBeenCalledWith({ where: { caseId: 'case-1', requirementVersionId: 'rv-1', removedAt: null } });
    expect(tx.fileVersion.aggregate).toHaveBeenCalledWith({ where: { caseId: 'case-1', OR:[{file:{removedAt:null}},{preSignPdfs:{some:{}}},{signingResources:{some:{}}},{derivedFileVersions:{some:{signingResources:{some:{}}}}},{purpose:'FINAL_PDF'}] }, _sum: { sizeBytes: true } });
  });

  it('counts removed signed previews, signing resources and seal originals when checking a new material upload',async()=>{
    const {service,tx,storage}=fixture();tx.fileVersion.aggregate=removedSigningEvidenceAggregate(200*MB-15);
    await expect(service.uploadPublic('token-a','license',pdf(16))).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.fileVersion.aggregate).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({OR:expect.arrayContaining([{purpose:'FINAL_PDF'}])})}));expect(storage.remove).toHaveBeenCalled();
  });

  it('applies the same retained evidence capacity, including removed signing evidence, to signing resource uploads',async()=>{
    const {service,tx,storage}=fixture();const seal=png();tx.fileVersion.aggregate=removedSigningEvidenceAggregate(200*MB-seal.size+1);
    await expect(service.uploadSigningResource('token-a','SEAL_ORIGINAL',seal)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.fileVersion.aggregate).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({OR:expect.arrayContaining([{purpose:'FINAL_PDF'}])})}));expect(storage.remove).toHaveBeenCalled();
  });

  it('invalidates the active signing exactly once for a new material upload', async () => {
    const { service, tx } = fixture();

    await service.uploadPublic('token-a', 'license', pdf(16));

    expect(tx.signingRecord.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.signingRecord.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { caseId: 'case-1', valid: true } }));
  });

  it('serializes concurrent uploads so only one can consume the last quota bytes', async () => {
    const { service, tx, db } = fixture();
    let activeBytes = 200 * MB - 16;
    let lockTail = Promise.resolve();
    db.$transaction.mockImplementation(async (work: any) => {
      let releaseLock: (() => void) | undefined;
      const localTx: any = {
        ...tx,
        $queryRaw: jest.fn(async () => {
          const previous = lockTail;
          lockTail = new Promise<void>((resolve) => { releaseLock = resolve; });
          await previous;
          return [{ id: 'case-1' }];
        }),
        fileVersion: {
          ...tx.fileVersion,
          aggregate: jest.fn(async () => ({ _sum: { sizeBytes: activeBytes } })),
          create: jest.fn(async ({ data }: any) => {
            activeBytes += data.sizeBytes;
            return { id: randomId(), ...data };
          }),
        },
      };
      try { return await work(localTx); } finally { releaseLock?.(); }
    });
    const outcomes = await Promise.allSettled([
      service.uploadPublic('token-a', 'license', pdf(16, 'first.pdf')),
      service.uploadPublic('token-a', 'license', pdf(16, 'second.pdf')),
    ]);
    expect(outcomes.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(activeBytes).toBe(200 * MB);
  });

  it('retries a P2034 database conflict without writing a second storage object', async () => {
    const { service, db, tx, storage } = fixture();
    db.$transaction
      .mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('write conflict',{code:'P2034',clientVersion:'6.19.3'}))
      .mockImplementationOnce(async (work:any)=>work(tx));

    await expect(service.uploadPublic('token-a','license',pdf(16))).resolves.toMatchObject({reused:false});

    expect(db.$transaction).toHaveBeenCalledTimes(2);
    expect(storage.write).toHaveBeenCalledTimes(1);
    expect(storage.remove).not.toHaveBeenCalled();
  });
});

let sequence = 0;
function randomId() { sequence += 1; return `version-${sequence}`; }

describe('FileService public active files', () => {
  it('lists only token-owned active uploads grouped by requirement', async () => {
    const { service, db, tokens } = fixture();
    db.fileRecord.findMany.mockResolvedValue([
      { id: 'file-1', requirementVersionId: 'rv-1', requirementVersion: { requirement: { key: 'license' }, definition: { label: '营业执照' } }, versions: [{ id: 'version-1', version: 1, originalName: 'proof.pdf', mimeType: 'application/pdf', sizeBytes: 8, createdAt: new Date('2026-08-06T00:00:00Z') }] },
    ]);
    await expect(service.listPublic('token-a')).resolves.toEqual({ totalBytes: 8, groups: [{ requirementKey: 'license', requirementVersionId: 'rv-1', label: '营业执照', files: [expect.objectContaining({ fileId: 'file-1', fileVersionId: 'version-1', downloadUrl: '/public/files/version-1' })] }] });
    expect(tokens.resolve).toHaveBeenCalledWith('token-a');
    expect(db.fileRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { caseId: 'case-1', removedAt: null, versions: { some: { purpose: 'MATERIAL' } } } }));
    expect(JSON.stringify(await service.listPublic('token-a'))).not.toContain('storageKey');
  });

  it('tombstones an owned active material without deleting immutable bytes', async () => {
    const { service, tx, storage } = fixture();
    tx.fileRecord.findFirst.mockResolvedValue({ id: 'file-1' });
    await expect(service.removePublic('token-a', 'file-1')).resolves.toEqual({ removed: true });
    expect(tx.fileRecord.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'file-1', caseId: 'case-1', removedAt: null, versions: { some: { purpose: 'MATERIAL' } } } }));
    expect(tx.fileRecord.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'file-1', caseId: 'case-1', removedAt: null }, data: expect.objectContaining({ removedBy: 'CUSTOMER', removeReason: '客户主动移除' }) }));
    expect(tx.auditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorType: 'CUSTOMER', action: 'FILE_REMOVED', targetType: 'FileRecord', targetId: 'file-1', source: 'PUBLIC_H5', detail: { caseId: 'case-1', reason: '客户主动移除' } }) });
    expect(tx.signingRecord.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.signingRecord.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { caseId: 'case-1', valid: true } }));
    expect(JSON.stringify(tx.auditEvent.create.mock.calls)).not.toContain('private/');
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('does not list, remove or download a file belonging to another token case', async () => {
    const listing = fixture();
    listing.tokens.resolve.mockResolvedValue({ caseId: 'case-2' });
    await listing.service.listPublic('token-b');
    expect(listing.db.fileRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ caseId: 'case-2' }) }));

    const removal = fixture();
    removal.tokens.resolveForMutation.mockResolvedValue({ caseId: 'case-2' });
    removal.tx.fileRecord.findFirst.mockResolvedValue(null);
    await expect(removal.service.removePublic('token-b', 'file-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(removal.tx.fileRecord.updateMany).not.toHaveBeenCalled();

    const download = fixture();
    download.tokens.resolve.mockResolvedValue({ caseId: 'case-2' });
    download.db.fileVersion.findFirst = jest.fn().mockResolvedValue(null);
    await expect(download.service.getPublic('token-b', 'version-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not write a download success audit before the controller finishes streaming', async () => {
    const download = fixture();
    download.db.fileVersion.findFirst = jest.fn().mockResolvedValue({ id:'version-1',caseId:'case-1',storageKey:'private/key.pdf',purpose:'MATERIAL',file:{requirementVersion:{definition:{sensitive:false}}} });
    await download.service.getPublic('public-token-secret', 'version-1');
    expect(download.tx.auditEvent.create).not.toHaveBeenCalled();
    expect(JSON.stringify(download.tx.auditEvent.create.mock.calls)).not.toContain('public-token-secret');
    expect(JSON.stringify(download.tx.auditEvent.create.mock.calls)).not.toContain('private/key.pdf');
  });
});
