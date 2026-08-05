export type TemplateRenderInput = { html: string; variables?: Record<string, unknown> };
export function renderTemplate(input: TemplateRenderInput): string { return input.html.replace(/{{\s*([\w.]+)\s*}}/g, (_, key) => String(input.variables?.[key] ?? '')); }
