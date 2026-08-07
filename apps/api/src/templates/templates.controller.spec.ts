import { REQUIRED_ABILITY } from '../auth/require-ability.decorator';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';

describe('TemplatesController', () => {
  it('delegates complete version lifecycle without an in-memory fallback', async () => {
    const service = {
      list: jest.fn().mockResolvedValue([]), get: jest.fn().mockResolvedValue({ id: 't1' }), create: jest.fn().mockResolvedValue({ id: 't1' }),
      copy: jest.fn().mockResolvedValue({ id: 't2' }), saveDraft: jest.fn().mockResolvedValue({ id: 'v1' }), publish: jest.fn().mockResolvedValue({ status: 'PUBLISHED' }),
      disable: jest.fn().mockResolvedValue({ status: 'DISABLED' }), history: jest.fn().mockResolvedValue([]),
    };
    const controller = new TemplatesController(service as unknown as TemplatesService);
    const request = { auth: { user: { userId: 'u1' } } } as any;
    await controller.publish('v1', request);
    expect(service.publish).toHaveBeenCalledWith('v1', 'u1');
  });

  it('uses publish permission only for publication and management elsewhere', () => {
    expect(Reflect.getMetadata(REQUIRED_ABILITY, TemplatesController.prototype.publish)).toBe('TEMPLATE_PUBLISH');
    for (const name of ['list', 'get', 'create', 'copy', 'saveDraft', 'disable', 'history']) {
      expect(Reflect.getMetadata(REQUIRED_ABILITY, TemplatesController.prototype[name as keyof TemplatesController])).toBe('TEMPLATE_MANAGE');
    }
  });
});

describe('TemplatesService editor validation', () => {
  const authorization = { id: 'rv1', status: 'PUBLISHED', disabledAt: null, requirement: { key: 'authorization_letter' }, definition: { key: 'authorization_letter', label: '授权书', type: 'FILE', required: true } };
  const signature = { type: 'signatureSlot', slotId: 'party-a', signer: 'PARTY_A', page: 1, x: 400, y: 700, width: 100, height: 80, required: true };
  const input = (children: any[]) => ({ key: 'production', name: '委托生产', ast: { type: 'page', children }, signatureMode: 'HANDWRITTEN', requirementVersionIds: ['rv1'] });
  const publishInput = (children: any[] = []) => input([...children, signature]);
  it('accepts material-list loops and known header/footer sources', async () => {
    const catalog = { getRequirementVersions: jest.fn().mockResolvedValue([authorization]), createTemplate: jest.fn().mockResolvedValue({ id: 't1' }) };
    const service = new TemplatesService(catalog as any);
    await expect(service.create({ ...input([{ type: 'loopTable', source: 'materials', columns: [{ header: '名称', variable: 'name' }] }]), ast: { type: 'page', children: [{ type: 'loopTable', source: 'materials', columns: [{ header: '名称', variable: 'name' }] }], header: [{ type: 'variable', key: 'customer_name' }], footer: [{ type: 'text', text: '页脚' }], styles: { marginTop: 20, marginBottom: 20 } } }, 'u1')).resolves.toEqual({ id: 't1' });
  });

  it('rejects unknown variables and out-of-page signature bounds', async () => {
    const catalog = { getRequirementVersions: jest.fn().mockResolvedValue([authorization]), createTemplate: jest.fn() };
    const service = new TemplatesService(catalog as any);
    await expect(service.create(input([{ type: 'variable', key: 'unknown' }]), 'u1')).rejects.toThrow('模板变量来源未知');
    await expect(service.create(input([{ type: 'signatureSlot', slotId: 'party-a', signer: 'PARTY_A', page: 1, x: 580, y: 800, width: 30, height: 50, required: true }]), 'u1')).rejects.toThrow('超出页面边界');
  });

  it('publishes through one atomic repository transaction using the current locked snapshot', async () => {
    const catalog = {
      publishTemplateAtomically: jest.fn().mockImplementation(async (_id, _actor, validate) => {
        validate({ id: 'tv1', status: 'DRAFT', ast: publishInput().ast, requirements: [{ requirementVersion: authorization }] });
        return { status: 'PUBLISHED' };
      }),
    };
    const service = new TemplatesService(catalog as any);
    await expect(service.publish('tv1', 'u1')).resolves.toMatchObject({ status: 'PUBLISHED' });
    expect(catalog.publishTemplateAtomically).toHaveBeenCalledWith('tv1', 'u1', expect.any(Function));
  });

  it.each([
    [{ ...authorization, status: 'DRAFT' }, '必须是已发布'],
    [{ ...authorization, status: 'DISABLED', disabledAt: new Date() }, '已停用'],
    [{ ...authorization, requirement: { key: 'lookalike' } }, '系统授权书'],
  ])('rejects noncanonical or unavailable authorization source at publish', async (source, message) => {
    const catalog = { publishTemplateAtomically: jest.fn().mockImplementation(async (_id, _actor, validate) => validate({ id: 'tv1', status: 'DRAFT', ast: publishInput().ast, requirements: [{ requirementVersion: source }] })) };
    const service = new TemplatesService(catalog as any);
    await expect(service.publish('tv1', 'u1')).rejects.toThrow(message);
  });

  it.each(['TEXT', 'IMAGE', 'NUMBER'])('rejects a canonical authorization source with %s type', async (type) => {
    const source = { ...authorization, definition: { ...authorization.definition, type } };
    const catalog = { publishTemplateAtomically: jest.fn().mockImplementation(async (_id, _actor, validate) => validate({ id: 'tv1', status: 'DRAFT', ast: publishInput().ast, requirements: [{ requirementVersion: source }] })) };
    await expect(new TemplatesService(catalog as any).publish('tv1', 'u1')).rejects.toThrow('系统授权书必须是 FILE 类型');
  });

  it.each([
    [[{ type: 'loopTable', source: 'materials', columns: [{ header: '非法', variable: 'unknown' }] }], '物料列变量'],
    [[{ type: 'variable', key: 'material.name' }], '只能在物料循环'],
    [[{ type: 'signatureSlot', slotId: 's', signer: 'PARTY_A', page: 2, x: 1, y: 1, width: 20, height: 20, required: true }], '页码超出'],
  ])('validates publish-only editor invariants', async (children, message) => {
    const catalog = { publishTemplateAtomically: jest.fn().mockImplementation(async (_id, _actor, validate) => validate({ id: 'tv1', status: 'DRAFT', ast: publishInput(children as any[]).ast, requirements: [{ requirementVersion: authorization }] })) };
    const service = new TemplatesService(catalog as any);
    await expect(service.publish('tv1', 'u1')).rejects.toThrow(message);
  });

  it('rejects zero signature slots, duplicate slot ids and duplicate requirement sources', async () => {
    const noSignature = { publishTemplateAtomically: jest.fn().mockImplementation(async (_id, _actor, validate) => validate({ id: 'tv1', status: 'DRAFT', ast: input([]).ast, requirements: [{ requirementVersion: authorization }] })) };
    await expect(new TemplatesService(noSignature as any).publish('tv1', 'u1')).rejects.toThrow('必须配置至少一个必填的甲方签名位');
    const duplicateSlots = publishInput([{ ...signature }]);
    const slotCatalog = { publishTemplateAtomically: jest.fn().mockImplementation(async (_id, _actor, validate) => validate({ id: 'tv1', status: 'DRAFT', ast: duplicateSlots.ast, requirements: [{ requirementVersion: authorization }] })) };
    await expect(new TemplatesService(slotCatalog as any).publish('tv1', 'u1')).rejects.toThrow('签名位 slotId 不能重复');
    const service = new TemplatesService({} as any);
    await expect(service.create({ ...publishInput(), requirementVersionIds: ['rv1', 'rv1'] }, 'u1')).rejects.toMatchObject({ response: { fields: expect.arrayContaining([expect.objectContaining({ path: 'requirementVersionIds.1' })]) } });
  });

  it('allows a required FILE questionnaire source by membership without forcing an AST render node', async () => {
    const businessLicense = { id: 'rv2', status: 'PUBLISHED', disabledAt: null, requirement: { key: 'business_license' }, definition: { key: 'business_license', label: '营业执照', type: 'FILE', required: true } };
    const catalog = { publishTemplateAtomically: jest.fn().mockImplementation(async (_id, _actor, validate) => validate({ id: 'tv1', status: 'DRAFT', ast: publishInput().ast, requirements: [{ requirementVersion: authorization }, { requirementVersion: businessLicense }] })) };
    await expect(new TemplatesService(catalog as any).publish('tv1', 'u1')).resolves.toBeUndefined();
  });

  it('rejects an AST source that is missing from template membership', async () => {
    const ast = publishInput([{ type: 'variable', key: 'business_license' }]).ast;
    const catalog = { publishTemplateAtomically: jest.fn().mockImplementation(async (_id, _actor, validate) => validate({ id: 'tv1', status: 'DRAFT', ast, requirements: [{ requirementVersion: authorization }] })) };
    await expect(new TemplatesService(catalog as any).publish('tv1', 'u1')).rejects.toThrow('模板变量来源未知');
  });
});
