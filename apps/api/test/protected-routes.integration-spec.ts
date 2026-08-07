import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ABILITIES } from '@auth/contracts';
import { AbilityGuard } from '../src/auth/ability.guard';
import { AbilityService } from '../src/auth/ability.service';
import { AuthService } from '../src/auth/auth.service';
import { CaseStore } from '../src/cases/case.store';
import { CaseService } from '../src/cases/case.service';
import { CasesController } from '../src/cases/cases.controller';
import { DashboardController } from '../src/dashboard/dashboard.controller';
import { ReviewController } from '../src/review/review.controller';
import { ReviewService } from '../src/review/review.service';
import { PrismaService } from '../src/database/prisma.service';
import { TemplateStore } from '../src/templates/template.store';
import { TemplatesController } from '../src/templates/templates.controller';
import { TemplatesService } from '../src/templates/templates.service';
import { RequirementsController } from '../src/requirements/requirements.controller';
import { RequirementsService } from '../src/requirements/requirements.service';
import { AuditController } from '../src/audit/audit.controller';
import { AuditService } from '../src/audit/audit.service';
import { SettingsController } from '../src/settings/settings.controller';
import { SettingsService } from '../src/settings/settings.service';

const createCase = {
  customerName: 'C', contactName: 'P', factoryDepartment: 'F',
  materials: [{ name: 'M', specification: 'S', quantity: 1, material: 'Paper', craft: 'Print' }],
  templateVersionId: 't', requirementVersionIds: ['requirement-v1'],
};

describe('protected route integration', () => {
  let app: Awaited<ReturnType<typeof NestFactory.create>>;
  let baseUrl: string;
  let caseId: string;

  beforeAll(async () => {
    const templateStore = new TemplateStore();
    const caseStore = new CaseStore(templateStore);
    const item = caseStore.create(createCase, { ownerUserId: 'owner', reviewerUserId: 'reviewer', departmentId: 'd1' });
    caseStore.updateStatus(item, 'PENDING_REVIEW');
    caseId = item.id;

    const sessions: Record<string, any> = {
      admin: { user: { userId: 'admin', departmentId: 'root', roles: ['admin'] }, abilities: [...ABILITIES], dataScope: 'ALL' },
      reviewer: { user: { userId: 'reviewer', departmentId: 'd1', roles: ['reviewer'] }, abilities: ['CASE_READ', 'FILE_READ', 'REVIEW_ITEM', 'SENSITIVE_FILE_READ', 'PDF_RETRY'], dataScope: 'DEPT' },
      customer: { user: { userId: 'owner', departmentId: 'd1', roles: ['customer_service'] }, abilities: ['CASE_READ', 'CASE_ASSIGN_REVIEWER'], dataScope: 'SELF' },
      denied: { user: { userId: 'denied', departmentId: 'd2', roles: ['denied'] }, abilities: [], dataScope: 'SELF' },
    };
    @Module({
      controllers: [DashboardController, CasesController, ReviewController, TemplatesController, RequirementsController, AuditController, SettingsController],
      providers: [
        AbilityGuard,
        { provide: CaseService, useValue: {
          list: async () => [], detail: async () => ({ id: caseId }), sensitiveFile: async () => ({ authorized: true }),
          answerReviewSigningHistory: async () => ({ answers: [], reviews: [], signings: [], statuses: [] }),
          fileHistory: async () => [{ id: 'ordinary-v1', originalName: '说明.pdf', sha256: 'a'.repeat(64) }],
          sensitiveFileHistory: async () => [{ id: 'sensitive-v1', originalName: '法人身份证.png', sha256: 'b'.repeat(64) }],
        } },
        { provide: ReviewService, useValue: { queue: async () => [], detail: async () => ({}), claim: async () => ({}), assign: async () => ({}), reviewItem: async () => ({}), confirm: async () => ({}), retryPdf: async () => ({ status: 'FINALIZING' }), copyRejectionMessage: async () => ({}) } },
        { provide: PrismaService, useValue: { db: { businessCase: { groupBy: async () => [], findMany: async () => [] } } } },
        { provide: TemplateStore, useValue: templateStore },
        { provide: TemplatesService, useValue: { list: async () => [], get: async () => ({}), create: async () => ({}), copy: async () => ({}), saveDraft: async () => ({}), publish: async () => ({}), disable: async () => ({}), history: async () => [] } },
        { provide: RequirementsService, useValue: { list: async () => [], get: async () => ({}), create: async () => ({}), saveDraft: async () => ({}), publish: async () => ({}), disable: async () => ({}), history: async () => [] } },
        { provide: AuditService, useValue: { list: async () => ({ items: [], total: 0, page: 1, pageSize: 20 }) } },
        { provide: SettingsService, useValue: { list: async () => [], get: async () => ({}), update: async () => ({}) } },
        { provide: AuthService, useValue: { authenticate: async (token: string) => ({ ...sessions[token.replace('Bearer ', '')], tokenDigest: 'digest', upstreamAvailable: true }) } },
        { provide: AbilityService, useValue: { resolve: async (roles: string[]) => {
          const session = Object.values(sessions).find((value: any) => value.user.roles[0] === roles[0]);
          return { abilities: session.abilities, dataScope: session.dataScope, matchedRoles: roles };
        } } },
      ],
    })
    class TestModule {}
    app = await NestFactory.create(TestModule, { logger: false });
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  });

  afterAll(async () => app.close());
  const get = (path: string, session: string) => fetch(`${baseUrl}${path}`, { headers: { authorization: `Bearer ${session}` } });
  const call = (method: string, path: string, session: string) => fetch(`${baseUrl}${path}`, {
    method, headers: { authorization: `Bearer ${session}`, 'content-type': 'application/json' },
    body: ['GET', 'HEAD'].includes(method) ? undefined : JSON.stringify({}),
  });

  it.each([
    ['/dashboard', 'customer'],
    ['/cases', 'customer'],
    ['/review/queue', 'reviewer'],
    ['/templates', 'admin'],
    ['/requirements', 'admin'],
    ['/audit', 'admin'],
    ['/settings', 'admin'],
  ])('allows the authorized existing route %s', async (path, session) => {
    expect((await get(path, session)).status).toBe(200);
  });

  it.each([
    ['/dashboard', 'denied'],
    ['/cases', 'denied'],
    ['/review/queue', 'customer'],
    ['/templates', 'reviewer'],
    ['/requirements', 'reviewer'],
    ['/audit', 'reviewer'],
    ['/settings', 'reviewer'],
  ])('denies the unauthorized existing route %s', async (path, session) => {
    expect((await get(path, session)).status).toBe(403);
  });

  it('uses the real sensitive-file ability policy without v1 row-level restrictions', async () => {
    expect((await get(`/cases/${caseId}/files/file-v1/download`, 'reviewer')).status).toBe(200);
    expect((await get(`/cases/${caseId}/files/file-v1/download`, 'customer')).status).toBe(403);
    expect((await get(`/cases/${caseId}/files/file-v1/download`, 'admin')).status).toBe(200);
  });

  it('enforces assignment, history and retry abilities with redacted history responses', async () => {
    expect((await call('POST', `/review/${caseId}/assign`, 'customer')).status).toBeLessThan(300);
    expect((await call('POST', `/review/${caseId}/reassign`, 'customer')).status).toBeLessThan(300);
    expect((await call('POST', `/review/${caseId}/assign`, 'reviewer')).status).toBe(403);
    expect((await get(`/cases/${caseId}/histories`, 'customer')).status).toBe(200);
    expect((await get(`/cases/${caseId}/histories`, 'denied')).status).toBe(403);
    const ordinary = await get(`/cases/${caseId}/files/history`, 'reviewer');
    expect(ordinary.status).toBe(200);
    expect(JSON.stringify(await ordinary.json())).not.toMatch(/storageKey|nas\//);
    expect((await get(`/cases/${caseId}/files/history`, 'customer')).status).toBe(403);
    const sensitive = await get(`/cases/${caseId}/files/sensitive-history`, 'reviewer');
    expect(sensitive.status).toBe(200);
    expect(JSON.stringify(await sensitive.json())).not.toMatch(/storageKey|nas\//);
    expect((await get(`/cases/${caseId}/files/sensitive-history`, 'customer')).status).toBe(403);
    expect((await call('POST', `/review/${caseId}/retry-pdf`, 'reviewer')).status).toBeLessThan(300);
    expect((await call('POST', `/review/${caseId}/retry-pdf`, 'customer')).status).toBe(403);
    expect((await call('POST', `/review/${caseId}/complete`, 'admin')).status).toBe(404);
  });

  const catalogRoutes = [
    ['GET', '/requirements'], ['GET', '/requirements/r1'], ['POST', '/requirements'], ['PATCH', '/requirements/r1/draft'],
    ['POST', '/requirements/versions/v1/publish'], ['POST', '/requirements/versions/v1/disable'], ['GET', '/requirements/r1/history'],
    ['GET', '/templates'], ['GET', '/templates/t1'], ['POST', '/templates'], ['POST', '/templates/t1/copy'], ['PATCH', '/templates/t1/draft'],
    ['POST', '/templates/versions/v1/publish'], ['POST', '/templates/versions/v1/disable'], ['GET', '/templates/t1/history'],
    ['GET', '/audit'], ['GET', '/settings'], ['GET', '/settings/nas.password'], ['PUT', '/settings/nas.password'],
  ];

  it.each(catalogRoutes)('allows the authorized catalog route %s %s', async (method, path) => {
    expect((await call(method, path, 'admin')).status).toBeLessThan(300);
  });

  it.each(catalogRoutes)('denies the unauthorized catalog route %s %s', async (method, path) => {
    expect((await call(method, path, 'reviewer')).status).toBe(403);
  });
});
