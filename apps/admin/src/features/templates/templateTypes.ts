export const defaultTemplateTypes = ['授权书', '采购合同', '保密协议'];

const storageKey = 'document-template-types';

export function loadTemplateTypes() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    if (!Array.isArray(saved)) return defaultTemplateTypes;
    return mergeTemplateTypes(saved.filter((item): item is string => typeof item === 'string'));
  } catch {
    return defaultTemplateTypes;
  }
}

export function saveTemplateType(input: string) {
  const name = input.trim();
  if (!name) return loadTemplateTypes();
  const next = mergeTemplateTypes([...loadTemplateTypes(), name]);
  localStorage.setItem(storageKey, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('template-types:changed', { detail: next }));
  return next;
}

export function mergeTemplateTypes(values: string[]) {
  return [...new Set([...defaultTemplateTypes, ...values.map(item => item.trim()).filter(Boolean)])];
}
