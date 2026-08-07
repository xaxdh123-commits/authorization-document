export type RequirementType = 'text' | 'longText' | 'single' | 'multi' | 'date' | 'number' | 'file' | 'image';

export interface RequirementOption { label: string; value: string }
export interface RequirementItem {
  key: string;
  label: string;
  type: RequirementType;
  required: boolean;
  description?: string;
  example?: string;
  defaultValue?: string | string[];
  options?: RequirementOption[];
  rejectionReason?: string;
  locked?: boolean;
}
export interface MaterialItem { id: string; name: string; specification: string; quantity: number; unit: string; material: string; craft: string; editable: boolean }
export interface PublicCaseModel {
  id: string;
  caseNo: string;
  customerName: string;
  trusteeName: string;
  contactName: string;
  contactPhone: string;
  deadline: string;
  materials: MaterialItem[];
  requirements: RequirementItem[];
  mode: 'normal' | 'supplement' | 'completed';
  version: number;
}
export type DraftAnswers = Record<string, string | string[] | number | boolean | undefined>;
export type FieldErrors = Record<string, string>;

const options = (...values: string[]): RequirementOption[] => values.map((value) => ({ label: value, value }));

export function createDemoCase(token: string, materialCount = 2): PublicCaseModel {
  const mode: PublicCaseModel['mode'] = token.includes('completed') ? 'completed' : token.includes('supplement') ? 'supplement' : 'normal';
  const materials: MaterialItem[] = Array.from({ length: materialCount }, (_, index) => ({
    id: `material-${index + 1}`,
    name: index === 0 ? '乳白 PVC 不干胶标签' : index === 1 ? '彩色包装盒' : `定制物料 ${index + 1}`,
    specification: index === 0 ? '100 × 100 mm' : index === 1 ? '210 × 148 × 60 mm' : `${80 + index * 5} × 60 mm`,
    quantity: index === 0 ? 1000 : 500 + index * 100,
    unit: index === 1 ? '个' : '张',
    material: index === 0 ? '8 丝乳白 PVC' : '350g 白卡纸',
    craft: index === 0 ? '四色印刷、覆膜、模切' : '四色印刷、哑膜、粘盒',
    editable: mode !== 'supplement',
  }));
  const requirements: RequirementItem[] = [
    { key: 'brand_name', label: '品牌名称', type: 'text', required: true, description: '请填写本次委托生产所使用的品牌全称。', example: '例如：星河优选', defaultValue: '星河优选' },
    { key: 'production_note', label: '生产与使用说明', type: 'longText', required: false, description: '可补充使用场景、交付要求或其他注意事项。', example: '例如：用于 2026 年秋季新品包装' },
    { key: 'authorization_scope', label: '授权范围', type: 'single', required: true, description: '请选择本次授权的使用范围。', options: options('仅限本业务单物料', '同系列物料', '指定期限内全部物料'), defaultValue: '仅限本业务单物料' },
    { key: 'sales_channels', label: '销售渠道', type: 'multi', required: true, description: '可多选。', options: options('线下门店', '电商平台', '直播渠道', '经销商') },
    { key: 'authorization_end', label: '授权截止日期', type: 'date', required: true, description: '不得早于预计交付日期。' },
    { key: 'planned_batches', label: '计划生产批次', type: 'number', required: false, description: '请填写预计批次数量。', defaultValue: '1' },
    { key: 'authorization_letter', label: '盖章授权书', type: 'file', required: true, description: '系统必选资料。请上传盖章后的 PDF、PNG 或 JPEG 文件。' },
    { key: 'business_license', label: '营业执照', type: 'image', required: true, description: '请上传清晰完整、在有效期内的营业执照。' },
    { key: 'trademark_certificate', label: '商标注册证', type: 'file', required: false, description: '如使用注册商标，请上传证书或受理通知书。' },
    { key: 'brand_chain', label: '品牌授权链', type: 'file', required: false, description: '存在多级授权时，请按授权顺序上传。' },
    { key: 'legal_identity', label: '法人身份证', type: 'image', required: false, description: '请上传正反面，敏感信息仅用于本次审核。' },
    { key: 'electronic_signature', label: '电子签名资料', type: 'image', required: false, description: '可选；也可以在签署步骤中手写签名。' },
  ];
  if (mode === 'supplement') requirements.forEach((item) => { if (item.key === 'business_license') item.rejectionReason = '图片右下角被裁切，统一社会信用代码不完整，请重新上传清晰完整原件。'; else item.locked = true; });
  return {
    id: `case-${token.slice(0, 8)}`,
    caseNo: 'WT-20260806-0018',
    customerName: '杭州星河品牌管理有限公司',
    trusteeName: '杭州某某包装制品有限公司（第一工厂）',
    contactName: '张女士',
    contactPhone: '138****6688',
    deadline: '2026-08-13 18:00',
    version: 3,
    mode,
    materials,
    requirements,
  };
}

export function validateStep(step: number, model: PublicCaseModel, answers: DraftAnswers): FieldErrors {
  const errors: FieldErrors = {};
  if (step === 0) {
    if (!String(answers.contactName ?? '').trim()) errors.contactName = '请填写联系人姓名';
    if (!/^1\d{10}$/.test(String(answers.contactPhone ?? ''))) errors.contactPhone = '请输入 11 位手机号码';
    model.requirements.filter((item) => !['file', 'image'].includes(item.type)).forEach((item) => {
      const value = answers[item.key] ?? item.defaultValue;
      if (item.required && (value === undefined || value === '' || (Array.isArray(value) && value.length === 0))) errors[item.key] = `请填写${item.label}`;
    });
  }
  if (step === 1 && model.materials.some((item) => !item.name.trim() || item.quantity <= 0)) errors.materials = '请完整填写物料名称和有效数量';
  return errors;
}

export function validateUpload(file: Pick<File, 'name' | 'size' | 'type'>, currentTotalBytes: number): string | undefined {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !['pdf', 'png', 'jpg', 'jpeg'].includes(extension) || !['application/pdf', 'image/png', 'image/jpeg'].includes(file.type)) return '仅支持 PDF、PNG、JPEG 文件';
  if (file.size > 20 * 1024 * 1024) return '单个文件不能超过 20MB';
  if (currentTotalBytes + file.size > 200 * 1024 * 1024) return '本业务单全部文件不能超过 200MB';
  return undefined;
}
