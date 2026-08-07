export const statusLabels: Record<string, string> = {
  DRAFT: '草稿', AWAITING_CUSTOMER: '待客户填写', CUSTOMER_FILLING: '客户填写中', PENDING_REVIEW: '待审核',
  NEEDS_SUPPLEMENT: '需补件', PENDING_RE_REVIEW: '待复审', PENDING_FINAL_PDF: '待生成最终文件',
  FINAL_PDF_FAILED: '最终文件生成失败', COMPLETED: '已完成', CLOSED: '已关闭',
  draft: '草稿', awaitingCustomer: '待客户填写', customerFilling: '客户填写中', pendingReview: '待审核',
  needsSupplement: '需补件', pendingReReview: '待复审', pendingFinalPdf: '待生成最终文件', finalPdfFailed: '最终文件生成失败', completed: '已完成', closed: '已关闭',
};
export const demoStatusCounts: Record<string, number> = { draft: 4, awaitingCustomer: 8, customerFilling: 6, pendingReview: 12, needsSupplement: 3, pendingReReview: 5, pendingFinalPdf: 2, finalPdfFailed: 1, completed: 86, closed: 7 };
export const demoCases = [
  { id: 'WT20260806001', title: '杭州云岚科技有限公司', customerName: '杭州云岚科技有限公司', factory: '华东印刷一厂', owner: '王小雨', status: 'PENDING_REVIEW', updatedAt: '2026-08-06 10:32', materialCount: 3 },
  { id: 'WT20260805018', title: '上海新橙品牌管理有限公司', customerName: '上海新橙品牌管理有限公司', factory: '包装材料二厂', owner: '陈静', status: 'CUSTOMER_FILLING', updatedAt: '2026-08-06 09:48', materialCount: 2 },
  { id: 'WT20260805012', title: '宁波木棉日用品有限公司', customerName: '宁波木棉日用品有限公司', factory: '华东印刷一厂', owner: '王小雨', status: 'NEEDS_SUPPLEMENT', updatedAt: '2026-08-05 17:20', materialCount: 1 },
  { id: 'WT20260804009', title: '苏州青禾食品有限公司', customerName: '苏州青禾食品有限公司', factory: '食品标签车间', owner: '赵敏', status: 'FINAL_PDF_FAILED', updatedAt: '2026-08-05 14:06', materialCount: 4 },
  { id: 'WT20260803026', title: '嘉兴沐光文创有限公司', customerName: '嘉兴沐光文创有限公司', factory: '包装材料二厂', owner: '陈静', status: 'COMPLETED', updatedAt: '2026-08-04 16:41', materialCount: 2 },
  { id: 'WT20260802015', title: '湖州拾光母婴用品有限公司', customerName: '湖州拾光母婴用品有限公司', factory: '华东印刷一厂', owner: '王小雨', status: 'AWAITING_CUSTOMER', updatedAt: '2026-08-03 11:10', materialCount: 5 },
];
export const demoReviews = demoCases.filter(c => ['PENDING_REVIEW', 'NEEDS_SUPPLEMENT', 'PENDING_RE_REVIEW'].includes(c.status)).map((c, i) => ({ id: c.id, caseTitle: c.customerName, caseNo: c.id, status: c.status, submittedAt: i ? '2026-08-05 17:10' : '2026-08-06 10:25', owner: c.owner, itemCount: i ? 3 : 6 }));
export const requirementCatalog = [
  { key: 'authorization_letter', name: '盖章授权书', type: '文件', required: true, status: '已发布', version: 'v3' },
  { key: 'business_license', name: '营业执照', type: '文件', required: false, status: '已发布', version: 'v2' },
  { key: 'trademark_certificate', name: '商标注册证', type: '文件', required: false, status: '已发布', version: 'v1' },
  { key: 'brand_authorization_chain', name: '品牌授权链', type: '多文件', required: false, status: '已发布', version: 'v2' },
  { key: 'legal_representative_id', name: '法人身份证', type: '图片', required: false, status: '已发布', version: 'v1' },
  { key: 'electronic_signature', name: '电子签名', type: '图片', required: false, status: '草稿', version: 'v1' },
  { key: 'production_description', name: '委托生产说明', type: '长文本', required: false, status: '已发布', version: 'v1' },
  { key: 'validity_date', name: '授权有效期', type: '日期', required: false, status: '已发布', version: 'v1' },
];
