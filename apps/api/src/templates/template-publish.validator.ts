import { RequirementDefinitionSchema, TemplateAstSchema, type RequirementDefinition, type TemplateAst, type TemplateNode } from '@auth/contracts';

export type TemplateRequirementSource = {
  status: string;
  disabledAt?: Date | string | null;
  definition: unknown;
  requirement: { key: string };
};

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const BUILTIN_VARIABLES = new Set(['customer_name', 'contact_name', 'factory_department', 'case_number']);
const MATERIAL_VARIABLES = new Set(['name', 'specification', 'quantity', 'material', 'craft', 'optionalPrice']);

export function validateTemplateStructure(astInput: unknown, sources: TemplateRequirementSource[]): TemplateAst {
  return validate(astInput, sources, false);
}

export function validateTemplateForPublish(astInput: unknown, sources: TemplateRequirementSource[]): TemplateAst {
  return validate(astInput, sources, true);
}

function validate(astInput: unknown, sources: TemplateRequirementSource[], publishing: boolean): TemplateAst {
  const astResult = TemplateAstSchema.safeParse(astInput);
  if (!astResult.success) fail('模板结构无效');
  const ast = astResult.data;
  const definitions = new Map<string, RequirementDefinition>();
  for (const source of sources) {
    const parsed = RequirementDefinitionSchema.safeParse(source.definition);
    if (!parsed.success) fail(`资料来源定义无效：${source.requirement.key}`);
    if (parsed.data.key === 'authorization_letter' && source.requirement.key !== 'authorization_letter') fail('必须引用系统授权书字段');
    if (parsed.data.key !== source.requirement.key) fail(`资料来源 key 不一致：${source.requirement.key}`);
    if (definitions.has(parsed.data.key)) fail(`资料来源重复：${parsed.data.key}`);
    definitions.set(parsed.data.key, parsed.data);
    if (publishing && (source.status === 'DISABLED' || source.disabledAt)) fail(`资料来源 ${parsed.data.key} 已停用`);
    if (publishing && source.status !== 'PUBLISHED') fail(`资料来源 ${parsed.data.key} 必须是已发布版本`);
  }
  const authorization = sources.find((source) => source.requirement.key === 'authorization_letter');
  const authorizationDefinition = authorization ? RequirementDefinitionSchema.safeParse(authorization.definition) : undefined;
  if (!authorization || !authorizationDefinition?.success || authorizationDefinition.data.key !== 'authorization_letter' || !authorizationDefinition.data.required) fail('模板必须引用系统授权书且设为必填');
  if (authorizationDefinition.data.type !== 'FILE') fail('系统授权书必须是 FILE 类型');
  if (publishing && (authorization.status !== 'PUBLISHED' || authorization.disabledAt)) fail(authorization.status === 'DISABLED' || authorization.disabledAt ? '系统授权书版本已停用' : '系统授权书版本必须是已发布版本');

  const margins = ast.styles ?? {};
  const horizontal = (margins.marginLeft ?? 0) + (margins.marginRight ?? 0);
  const vertical = (margins.marginTop ?? 0) + (margins.marginBottom ?? 0);
  if (horizontal >= PAGE_WIDTH) fail('页面左右边距超出页面范围');
  if (vertical >= PAGE_HEIGHT) fail('页面上下边距超出页面范围');

  const referenced = new Set<string>();
  const signatureSlotIds = new Set<string>();
  let requiredPartyASignatures = 0;
  let pageCount = 1;
  const visit = (node: TemplateNode, region: 'body' | 'header' | 'footer') => {
    if (region !== 'body' && ['pageBreak', 'signatureSlot', 'loopTable'].includes(node.type)) fail('页眉页脚不支持分页、签名或物料循环组件');
    if (node.type === 'pageBreak') pageCount += 1;
    if (node.type === 'variable') {
      if (node.key.startsWith('material.')) fail(`变量 ${node.key} 只能在物料循环中使用`);
      if (!BUILTIN_VARIABLES.has(node.key) && !definitions.has(node.key)) fail(`模板变量来源未知：${node.key}`);
      const definition = definitions.get(node.key);
      if (definition && ['FILE', 'IMAGE'].includes(definition.type)) fail(`字段 ${node.key} 与文本变量组件类型不匹配`);
      if (definition) referenced.add(node.key);
    }
    if (node.type === 'image') {
      const definition = definitions.get(node.source);
      if (!definition || definition.type !== 'IMAGE') fail(`图片组件来源类型不匹配：${node.source}`);
      referenced.add(node.source);
    }
    if (node.type === 'loopTable') {
      for (const [index, column] of node.columns.entries()) if (!MATERIAL_VARIABLES.has(column.variable)) fail(`物料列变量无效：columns.${index}.variable`);
    }
    if (node.type === 'signatureSlot') {
      if (signatureSlotIds.has(node.slotId)) fail('签名位 slotId 不能重复');
      signatureSlotIds.add(node.slotId);
      if (node.signer === 'PARTY_A' && node.required) requiredPartyASignatures += 1;
      if (node.x + node.width > PAGE_WIDTH || node.y + node.height > PAGE_HEIGHT) fail(`签名区域 ${node.slotId} 超出页面边界`);
    }
    if ('children' in node && Array.isArray(node.children)) node.children.forEach((child) => visit(child, region));
    if (node.type === 'table') node.rows.flat().forEach((cell) => cell.children.forEach((child) => visit(child, region)));
  };
  ast.children.forEach((node) => visit(node, 'body'));
  ast.header?.forEach((node) => visit(node, 'header'));
  ast.footer?.forEach((node) => visit(node, 'footer'));

  const validateSignaturePage = (node: TemplateNode) => {
    if (node.type === 'signatureSlot' && node.page > pageCount) fail(`签名区域 ${node.slotId} 页码超出文档页数`);
    if ('children' in node && Array.isArray(node.children)) node.children.forEach(validateSignaturePage);
    if (node.type === 'table') node.rows.flat().forEach((cell) => cell.children.forEach(validateSignaturePage));
  };
  ast.children.forEach(validateSignaturePage);
  if (publishing) {
    if (requiredPartyASignatures < 1) fail('必须配置至少一个必填的甲方签名位');
    for (const definition of definitions.values()) {
      if (definition.required && !['authorization_letter'].includes(definition.key) && !['FILE', 'IMAGE'].includes(definition.type) && !referenced.has(definition.key)) fail(`必填资料来源未在模板中使用：${definition.key}`);
    }
  }
  return ast;
}

function fail(message: string): never { throw new Error(message); }
