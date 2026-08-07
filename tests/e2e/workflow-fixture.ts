export const workflowFileValidation = { maxFiles: 10, maxFileSizeBytes: 20 * 1024 * 1024, allowedMimeTypes: ['application/pdf'] } as const;

export const authorizationRequirementDefinition = {
  key: 'authorization_letter', label: '授权书', type: 'FILE', required: true, sensitive: false, validation: workflowFileValidation,
} as const;

export const optionalRequirementDefinition = (suffix: number) => ({
  key: `e2e_license_${suffix}`, label: 'E2E 营业执照', type: 'FILE' as const, required: false, sensitive: false, validation: workflowFileValidation,
});

export const workflowTemplateInput = (authorizationVersionId: string, optionalVersionId: string, suffix: number) => ({
  key: `e2e_authorization_${suffix}`,
  name: 'E2E 委托生产授权书',
  signatureMode: 'HANDWRITTEN' as const,
  requirementVersionIds: [authorizationVersionId, optionalVersionId],
  ast: { type: 'page' as const, children: [
    { type: 'paragraph' as const, children: [{ type: 'text' as const, text: '委托生产授权书' }] },
    { type: 'signatureSlot' as const, slotId: 'party_a_signature', signer: 'PARTY_A' as const, page: 1, x: 320, y: 650, width: 180, height: 80, required: true },
  ] },
});

export const workflowCaseInput = (templateVersionId: string, requirementVersionIds: string[]) => ({
  customerName: 'E2E 品牌方', contactName: 'E2E 联系人', factoryDepartment: 'E2E 工厂', templateVersionId, requirementVersionIds,
  materials: [{ name: '标签', specification: '10x10cm', quantity: 100, material: 'PVC', craft: '四色印刷' }],
});

export const workflowPdf = (variant: number) => {
  const objects=['1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n','2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n','3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>\nendobj\n'];let body='%PDF-1.4\n';const offsets=objects.map(object=>{const offset=Buffer.byteLength(body);body+=object;return offset;});const xref=Buffer.byteLength(body);body+=`xref\n0 4\n0000000000 65535 f \n${offsets.map(offset=>String(offset).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n% workflow-${variant}`;return Buffer.from(body);
};
