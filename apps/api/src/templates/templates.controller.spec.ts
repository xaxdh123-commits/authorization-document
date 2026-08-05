import { TemplatesController } from './templates.controller';

describe('TemplatesController', () => {
  it('creates templates with mandatory authorization letter and optional credentials', () => {
    const controller = new TemplatesController();
    const created = controller.create({ name: '品牌模板', requirements: [{ key: 'business_license', label: '营业执照', type: 'FILE', required: false }] });
    expect(created.versions[0].requirements).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'authorization_letter', required: true, system: true }),
      expect.objectContaining({ key: 'business_license', required: false }),
    ]));
    expect(controller.list()).toHaveLength(2);
  });

  it('updates the latest draft while keeping authorization letter required', () => {
    const controller = new TemplatesController();
    const created = controller.create({ name: '旧名称' });
    const updated = controller.update(created.id, { name: '新名称', requirements: [{ key: 'brand_license', label: '商标注册证', type: 'FILE', required: true }] });
    expect(updated.name).toBe('新名称');
    expect(updated.versions[0].requirements[0]).toMatchObject({ key: 'authorization_letter', required: true });
  });
});
