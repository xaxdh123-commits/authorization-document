import { createHash } from 'node:crypto';
import { FONT_FACE_CSS, PDF_ENGINE_OPTIONS, PDF_LAYOUT, PDF_RENDERER_FINGERPRINT_PLACEHOLDER } from './font-asset.js';
type TemplateStyle = Record<string, string | number | undefined>;
type Styled = { styles?: TemplateStyle };
type TemplateNode =
  | (Styled & { type:'text'; text:string })
  | (Styled & { type:'variable'; key:string })
  | (Styled & { type:'heading'; level:1|2|3; children:TemplateNode[] })
  | (Styled & { type:'paragraph'; children:TemplateNode[] })
  | (Styled & { type:'image'; source:string; alt:string })
  | (Styled & { type:'table'; rows:Array<Array<Styled & { children:TemplateNode[] }>> })
  | (Styled & { type:'loopTable'; source:'materials'; columns:Array<Styled & {header:string; variable:string}> })
  | (Styled & { type:'signatureSlot'; slotId:string; signer:'PARTY_A'; page:number; x:number; y:number; width:number; height:number; required:boolean })
  | { type:'pageBreak' };
type TemplateAst = { type: 'page'; children: TemplateNode[]; header?: TemplateNode[]; footer?: TemplateNode[]; styles?: TemplateStyle };

export type PdfRenderInput = {
  templateVersionId: string;
  ast: TemplateAst;
  snapshot: Record<string, unknown>;
  draftVersion: number;
  contentDigest: string;
  answers?: Record<string, unknown>;
  files?: Array<Record<string, unknown>>;
  signatureOverlays?: Record<string,{source:string;page:number;x:number;y:number;width:number;height:number}>;
};
export type PdfContentInput = Omit<PdfRenderInput,'contentDigest'>;
export type PdfOptions = { format: 'A4'; printBackground: true; preferCSSPageSize: true };
export interface BrowserPdfEngine { render(html: string, options: PdfOptions): Promise<Buffer> }
export const PDF_OPTIONS:PdfOptions={...PDF_ENGINE_OPTIONS};

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]!));
const stable = (value: unknown): string => Array.isArray(value) ? `[${value.map(stable).join(',')}]` : value && typeof value === 'object' ? `{${Object.entries(value as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b)).map(([key,item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}` : JSON.stringify(value);
export function computePdfContentDigest(input:PdfContentInput):string { const {draftVersion:_,...content}=input; return createHash('sha256').update(stable(content)).digest('hex'); }
const get = (root: Record<string, unknown>, key: string): unknown => key.split('.').reduce<unknown>((value, part) => value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined, root);
const css = (styles?: TemplateStyle): string => !styles ? '' : Object.entries(styles).map(([key,value]) => {
  const names: Record<string,string> = { fontFamily:'font-family',fontSize:'font-size',fontWeight:'font-weight',color:'color',backgroundColor:'background-color',textAlign:'text-align',lineHeight:'line-height',paragraphSpacing:'margin-bottom',width:'width',height:'height',marginTop:'margin-top',marginRight:'margin-right',marginBottom:'margin-bottom',marginLeft:'margin-left' };
  const numericUnit = ['fontSize','paragraphSpacing','width','height','marginTop','marginRight','marginBottom','marginLeft'].includes(key) ? 'px' : '';
  return `${names[key] ?? key}:${escapeHtml(value)}${numericUnit}`;
}).join(';');

function renderNodes(nodes: TemplateNode[] | undefined, data: Record<string, unknown>): string {
  return (nodes ?? []).map((node) => {
    const style = css('styles' in node ? node.styles : undefined);
    if (node.type === 'text') return `<span style="${style}">${escapeHtml(node.text)}</span>`;
    if (node.type === 'variable') return `<span style="${style}">${escapeHtml(get(data, node.key))}</span>`;
    if (node.type === 'heading') return `<h${node.level} style="${style}">${renderNodes(node.children,data)}</h${node.level}>`;
    if (node.type === 'paragraph') return `<p style="${style}">${renderNodes(node.children,data)}</p>`;
    if (node.type === 'image') return `<img alt="${escapeHtml(node.alt)}" src="${escapeHtml(node.source)}" style="${style}" />`;
    if (node.type === 'pageBreak') return '<div class="page-break"></div>';
    if (node.type === 'signatureSlot') return `<div class="signature-slot" data-slot-id="${escapeHtml(node.slotId)}" data-signer="PARTY_A" data-page="${node.page}" style="position:absolute;left:${node.x}px;top:${node.y}px;width:${node.width}px;height:${node.height}px;${style}"></div>`;
    if (node.type === 'table') return `<table style="${style}"><tbody>${node.rows.map((row) => `<tr>${row.map((cell) => `<td style="${css(cell.styles)}">${renderNodes(cell.children,data)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    const materials = Array.isArray(data.materials) ? data.materials as Array<Record<string,unknown>> : [];
    return `<table style="${style}"><thead><tr>${node.columns.map((column) => `<th>${escapeHtml(column.header)}</th>`).join('')}</tr></thead><tbody>${materials.map((item) => `<tr>${node.columns.map((column) => `<td>${escapeHtml(get(item,column.variable))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }).join('');
}

export function buildPdfRenderDocument(input: PdfRenderInput): { html: string; inputDigest: string } {
  const canonical = stable(input);
  const inputDigest = createHash('sha256').update(canonical).digest('hex');
  const data = { ...input.snapshot, answers: input.answers ?? {}, files: input.files ?? [], draftVersion: input.draftVersion, contentDigest: input.contentDigest };
  const pages:TemplateNode[][]=[[]];const signatureSlots:Extract<TemplateNode,{type:'signatureSlot'}>[]=[];
  for(const node of input.ast.children){if(node.type==='pageBreak'){pages.push([]);continue;}if(node.type==='signatureSlot'){signatureSlots.push(node);continue;}pages.at(-1)!.push(node);}
  const pageCount=Math.max(pages.length,...signatureSlots.map(slot=>slot.page),1);while(pages.length<pageCount)pages.push([]);
  const slotHtml=(slot:Extract<TemplateNode,{type:'signatureSlot'}>)=>{const overlay=input.signatureOverlays?.[slot.slotId];if(overlay){if(overlay.page!==slot.page)throw new Error('SIGNATURE_OVERLAY_PAGE_MISMATCH');return `<img class="signature-overlay" data-slot-id="${escapeHtml(slot.slotId)}" data-page="${slot.page}" alt="甲方签章" src="${escapeHtml(overlay.source)}" style="position:absolute;left:${overlay.x}px;top:${overlay.y}px;width:${overlay.width}px;height:${overlay.height}px" />`;}return `<div class="signature-slot" data-slot-id="${escapeHtml(slot.slotId)}" data-signer="PARTY_A" data-page="${slot.page}" style="position:absolute;left:${slot.x}px;top:${slot.y}px;width:${slot.width}px;height:${slot.height}px;${css(slot.styles)}"></div>`;};
  const pageHtml=pages.map((nodes,index)=>{const page=index+1;return `<section class="pdf-page" data-pdf-page="${page}"><header>${renderNodes(input.ast.header,data)}</header><main class="pdf-page-content" style="${css(input.ast.styles)}">${renderNodes(nodes,data)}${signatureSlots.filter(slot=>slot.page===page).map(slotHtml).join('')}</main><footer>${renderNodes(input.ast.footer,data)}</footer></section>`;}).join('');
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>${FONT_FACE_CSS}@page{size:${PDF_LAYOUT.page};margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:"Authorization Noto Sans SC",sans-serif;font-weight:400;color:#111}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:6px}.pdf-page{width:${PDF_LAYOUT.width};height:${PDF_LAYOUT.height};padding:${PDF_LAYOUT.margin};position:relative;break-after:page;overflow:hidden}.pdf-page:last-child{break-after:auto}.pdf-page-content{height:${PDF_LAYOUT.contentHeight};position:relative}.signature-slot{border:1px dashed #999}</style></head><body data-template-version="${escapeHtml(input.templateVersionId)}" data-input-digest="${inputDigest}" data-renderer-fingerprint="${PDF_RENDERER_FINGERPRINT_PLACEHOLDER}">${pageHtml}</body></html>`;
  return { html, inputDigest };
}

export class ChromiumPdfRenderer {
  constructor(private readonly engine: BrowserPdfEngine) {}
  async render(input: PdfRenderInput): Promise<Buffer> {
    try {
      const { html } = buildPdfRenderDocument(input);
      const pdf = await this.engine.render(html, PDF_OPTIONS);
      if (!pdf.subarray(0,5).equals(Buffer.from('%PDF-'))) throw new Error('invalid-pdf');
      return pdf;
    } catch {
      throw new Error('PDF 生成服务暂不可用，请联系管理员检查 Chromium 配置');
    }
  }
}
