import { safeAttachmentDisposition, validateSigningCommand, validateSigningResourceBinding, ORDINARY_SIGNING_DISCLAIMER, ORDINARY_SIGNING_DECLARATION_V1 } from './file-policy';

describe('file download and ordinary signing policy', () => {
  it('always creates a safe attachment disposition', () => {
    expect(safeAttachmentDisposition('授权书\r\nX-Evil: yes.pdf')).toBe("attachment; filename=\"download.pdf\"; filename*=UTF-8''%E6%8E%88%E6%9D%83%E4%B9%A6X-Evil%3A%20yes.pdf");
  });
  it('accepts exactly one v1 method and trusted declaration fields', () => {
    expect(validateSigningCommand({ mode:'HANDWRITTEN', signatureResourceId:'f1', signatureResourceVersion:1, positions:[{slotId:'party-a',page:1,x:10,y:10,width:80,height:40}], declaration:true }, [{slotId:'party-a',page:1,x:0,y:0,width:200,height:100,required:true}])).toMatchObject({ mode:'HANDWRITTEN', declaration:true });
    expect(() => validateSigningCommand({ mode:'SEAL', signatureResourceId:'f1', signatureResourceVersion:1, positions:[], declaration:true, signedAt:'client-time' }, [])).toThrow('签署请求包含不受信任字段');
    expect(() => validateSigningCommand({ mode:'SEAL', signatureResourceId:'f1', signatureResourceVersion:1, positions:[], declaration:{version:'v1',accepted:true} }, [])).toThrow('声明只能由客户确认');
  });
  it('requires all PARTY_A slots and placement bounds', () => {
    const slots = [{slotId:'party-a',page:1,x:10,y:10,width:100,height:50,required:true}];
    const base = { mode:'SEAL', signatureResourceId:'f1', signatureResourceVersion:1, declaration:true };
    expect(() => validateSigningCommand({...base,positions:[]}, slots)).toThrow('必须覆盖全部甲方签署位置');
    expect(() => validateSigningCommand({...base,positions:[{slotId:'party-a',page:1,x:90,y:20,width:30,height:30}]}, slots)).toThrow('签署位置超出签署区域');
  });
  it('keeps the exact v1 ordinary signing disclaimer', () => {
    expect(ORDINARY_SIGNING_DISCLAIMER).toBe('当前为普通电子签署，不等同于第三方可靠电子签名。');
    expect(ORDINARY_SIGNING_DECLARATION_V1).toBe('ORDINARY_SIGNING_DECLARATION_V1');
  });
  it('binds signature mode to a server-classified resource lineage', () => {
    expect(() => validateSigningResourceBinding('HANDWRITTEN',{purpose:'SEAL_ORIGINAL'})).toThrow('签署方式与资源类型不一致');
    expect(() => validateSigningResourceBinding('SEAL',{purpose:'SEAL_PROCESSED',originalFileVersionId:'original-1'},'original-1')).not.toThrow();
    expect(() => validateSigningResourceBinding('SEAL',{purpose:'SEAL_PROCESSED',originalFileVersionId:'other'},'original-1')).toThrow('印章原图与处理结果关系无效');
  });
});
