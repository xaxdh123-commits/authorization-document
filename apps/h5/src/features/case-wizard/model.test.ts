import { describe, expect, it } from 'vitest';
import { createDemoCase, validateStep, validateUpload } from './model';

describe('客户问卷模型', () => {
  it('包含八种动态资料类型与必选授权书', () => {
    const demo = createDemoCase('demo');
    expect(new Set(demo.requirements.map((item) => item.type))).toEqual(
      new Set(['text', 'longText', 'single', 'multi', 'date', 'number', 'file', 'image']),
    );
    expect(demo.requirements.find((item) => item.key === 'authorization_letter')?.required).toBe(true);
  });

  it('在继续前返回中文字段错误', () => {
    const demo = createDemoCase('demo');
    expect(validateStep(0, demo, {})).toMatchObject({ contactName: '请填写联系人姓名' });
  });

  it('拒绝超过 20MB 或类型不符的文件', () => {
    expect(validateUpload({ name: '危险文件.exe', size: 1, type: 'application/octet-stream' }, 0)).toContain('仅支持');
    expect(validateUpload({ name: '大文件.pdf', size: 20 * 1024 * 1024 + 1, type: 'application/pdf' }, 0)).toContain('20MB');
  });
});
