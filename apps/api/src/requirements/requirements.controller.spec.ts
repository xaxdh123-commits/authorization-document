import { REQUIRED_ABILITY } from '../auth/require-ability.decorator';
import { RequirementsController } from './requirements.controller';
import { RequirementsService } from './requirements.service';

describe('RequirementsController', () => {
  it('delegates versioned catalog actions with the authenticated actor', async () => {
    const service = {
      list: jest.fn().mockResolvedValue([]), get: jest.fn().mockResolvedValue({ id: 'r1' }),
      create: jest.fn().mockResolvedValue({ id: 'r1' }), saveDraft: jest.fn().mockResolvedValue({ id: 'v1' }),
      publish: jest.fn().mockResolvedValue({ status: 'PUBLISHED' }), disable: jest.fn().mockResolvedValue({ status: 'DISABLED' }),
      history: jest.fn().mockResolvedValue([]),
    };
    const controller = new RequirementsController(service as any);
    const request = { auth: { user: { userId: 'u1' } } } as any;
    await controller.create({ key: 'business_license', label: '营业执照', type: 'FILE', validation: { maxFiles: 10, maxFileSizeBytes: 20971520, allowedMimeTypes: ['application/pdf'] } }, request);
    await controller.publish('v1', request);
    expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ key: 'business_license' }), 'u1');
    expect(service.publish).toHaveBeenCalledWith('v1', 'u1');
  });

  it('requires requirement management for every route', () => {
    for (const name of ['list', 'get', 'create', 'saveDraft', 'publish', 'disable', 'history']) {
      expect(Reflect.getMetadata(REQUIRED_ABILITY, RequirementsController.prototype[name as keyof RequirementsController])).toBe('REQUIREMENT_MANAGE');
    }
  });
});

describe('RequirementsService validation', () => {
  const types = ['TEXT', 'LONG_TEXT', 'SINGLE_SELECT', 'MULTI_SELECT', 'DATE', 'NUMBER', 'FILE', 'IMAGE'] as const;
  it.each(types)('accepts the %s requirement type', async (type) => {
    const catalog = { createRequirement: jest.fn().mockResolvedValue({ id: 'r1' }) };
    const service = new RequirementsService(catalog as any);
    const select = ['SINGLE_SELECT', 'MULTI_SELECT'].includes(type);
    const file = ['FILE', 'IMAGE'].includes(type);
    await expect(service.create({ key: `field_${type.toLowerCase()}`, label: '字段', type, options: select ? [{ value: 'a', label: '甲' }] : undefined, validation: file ? { maxFiles: 10, maxFileSizeBytes: 20971520, allowedMimeTypes: type === 'IMAGE' ? ['image/png'] : ['application/pdf'] } : undefined }, 'u1')).resolves.toEqual({ id: 'r1' });
  });

  it('rejects a default value that does not match the field type with a Chinese field path', () => {
    const service = new RequirementsService({} as any);
    expect(() => service.create({ key: 'quantity', label: '数量', type: 'NUMBER', defaultValue: '不是数字' }, 'u1')).toThrow(expect.objectContaining({ response: expect.objectContaining({ message: '资料字段校验失败', fields: expect.arrayContaining([expect.objectContaining({ path: 'defaultValue' })]) }) }));
  });

  it.each([
    [{ key: 'n', label: '数值', type: 'NUMBER', validation: { min: 9, max: 2 } }, 'validation.min'],
    [{ key: 't', label: '文本', type: 'TEXT', validation: { minLength: 9, maxLength: 2 } }, 'validation.minLength'],
    [{ key: 's', label: '选项', type: 'SINGLE_SELECT', options: [{ value: 'a', label: '甲' }, { value: 'a', label: '重复' }] }, 'options.1.value'],
    [{ key: 'f', label: '文件', type: 'FILE', validation: { maxFiles: 11, maxFileSizeBytes: 20971521, allowedMimeTypes: ['text/plain'] } }, 'validation.maxFiles'],
  ])('rejects incompatible limits with field paths', (input, path) => {
    const service = new RequirementsService({} as any);
    expect(() => service.create(input, 'u1')).toThrow(expect.objectContaining({ response: expect.objectContaining({ fields: expect.arrayContaining([expect.objectContaining({ path })]) }) }));
  });

  it('rejects machine-key drift when saving a new version', async () => {
    const catalog = { getRequirement: jest.fn().mockResolvedValue({ id: 'r1', key: 'fixed_key' }), saveRequirementDraft: jest.fn() };
    const service = new RequirementsService(catalog as any);
    await expect(service.saveDraft('r1', { key: 'changed_key', label: '字段', type: 'TEXT' }, 'u1')).rejects.toMatchObject({ response: { fields: expect.arrayContaining([expect.objectContaining({ path: 'definition.key' })]) } });
    expect(catalog.saveRequirementDraft).not.toHaveBeenCalled();
  });

  it('revalidates the stored draft inside the atomic publish transaction', async () => {
    const catalog = { publishRequirementAtomically: jest.fn().mockImplementation(async (_id, _actor, validate) => validate({ status: 'DRAFT', definition: { key: 'quantity', label: '数量', type: 'NUMBER', defaultValue: 20, validation: { max: 10 } }, requirement: { key: 'quantity' } })) };
    const service = new RequirementsService(catalog as any);
    await expect(service.publish('rv1', 'u1')).rejects.toMatchObject({ response: { fields: expect.arrayContaining([expect.objectContaining({ path: 'defaultValue' })]) } });
  });

  it.each([
    [{ key: 'bad_pattern', label: '正则', type: 'TEXT', validation: { pattern: '[' } }, 'validation.pattern'],
    [{ key: 'number_default', label: '数字', type: 'NUMBER', defaultValue: 11, validation: { min: 1, max: 10 } }, 'defaultValue'],
    [{ key: 'short_default', label: '文本', type: 'TEXT', defaultValue: 'a', validation: { minLength: 2 } }, 'defaultValue'],
    [{ key: 'long_default', label: '文本', type: 'TEXT', defaultValue: 'abcd', validation: { maxLength: 3 } }, 'defaultValue'],
    [{ key: 'pattern_default', label: '文本', type: 'TEXT', defaultValue: 'abc', validation: { pattern: '^\\d+$' } }, 'defaultValue'],
    [{ key: 'date_default', label: '日期', type: 'DATE', defaultValue: '2026-02-30' }, 'defaultValue'],
  ])('validates regex compilation and defaults against validation rules', (input, path) => {
    const service = new RequirementsService({} as any);
    expect(() => service.create(input, 'u1')).toThrow(expect.objectContaining({ response: expect.objectContaining({ fields: expect.arrayContaining([expect.objectContaining({ path })]) }) }));
  });
});
