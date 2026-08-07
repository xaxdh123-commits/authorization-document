import { describe, expect, it, vi } from 'vitest';
import { ChromiumPdfRenderer, buildPdfRenderDocument, type PdfRenderInput } from './pdf-renderer.js';

const ast = { type: 'page' as const, children: [
  { type: 'heading', level: 1, children: [{ type: 'text', text: '委托生产物料授权书' }] },
  { type: 'paragraph', children: [{ type: 'variable', key: 'customerName' }] },
  { type: 'loopTable', source: 'materials', columns: [{ header: '物料名称', variable: 'name' }] },
  { type: 'signatureSlot', slotId: 'party-a-1', signer: 'PARTY_A', page: 1, x: 40, y: 600, width: 160, height: 80, required: true },
] } satisfies PdfRenderInput['ast'];

describe('shared deterministic PDF renderer', () => {
  it('builds stable HTML and digest from immutable inputs', () => {
    const input = { templateVersionId: 'tv1', ast, snapshot: { customerName: '甲方公司', materials: [{ name: '标签' }] }, draftVersion: 2, contentDigest: 'a'.repeat(64) };
    expect(buildPdfRenderDocument(input)).toEqual(buildPdfRenderDocument(structuredClone(input)));
    expect(buildPdfRenderDocument(input).html).toContain('甲方公司');
    expect(buildPdfRenderDocument(input).html).toContain('标签');
  });
  it('delegates the exact deterministic HTML to the injected browser engine', async () => {
    const pdf = Buffer.from('%PDF-1.7\n%%EOF');
    const engine = { render: vi.fn(async () => pdf) };
    const renderer = new ChromiumPdfRenderer(engine);
    await expect(renderer.render({ templateVersionId: 'tv1', ast, snapshot: { customerName: '甲方公司', materials: [] }, draftVersion: 1, contentDigest: 'b'.repeat(64) })).resolves.toEqual(pdf);
    expect(engine.render).toHaveBeenCalledWith(expect.stringContaining('party-a-1'), expect.objectContaining({ format: 'A4' }));
  });
  it('fails closed when the browser engine does not return a readable PDF', async () => {
    const renderer = new ChromiumPdfRenderer({ render: async () => Buffer.from('not-pdf') });
    await expect(renderer.render({ templateVersionId: 'tv1', ast, snapshot: {}, draftVersion: 1, contentDigest: 'c'.repeat(64) })).rejects.toThrow('PDF 生成服务暂不可用');
  });
  it('builds fixed A4 page containers and attaches page-two signature slots to page two',()=>{const input={templateVersionId:'two-pages',ast:{type:'page' as const,children:[{type:'paragraph' as const,children:[{type:'text' as const,text:'第一页'}]},{type:'pageBreak' as const},{type:'paragraph' as const,children:[{type:'text' as const,text:'第二页'}]},{type:'signatureSlot' as const,slotId:'p2',signer:'PARTY_A' as const,page:2,x:10,y:10,width:80,height:40,required:true}]},snapshot:{},draftVersion:1,contentDigest:'d'.repeat(64)};const {html}=buildPdfRenderDocument(input);expect(html).toMatch(/data-pdf-page="1"[\s\S]*第一页[\s\S]*data-pdf-page="2"[\s\S]*第二页/);expect(html).toMatch(/data-pdf-page="2"[\s\S]*data-slot-id="p2"/);expect(html).toContain('height:261mm');});
  it('renders Chinese Unicode with the pinned embedded font rather than a system fallback',()=>{const html=buildPdfRenderDocument({templateVersionId:'zh',ast:{type:'page',children:[{type:'paragraph',children:[{type:'text',text:'委托生产物料授权书'}]}]},snapshot:{},draftVersion:1,contentDigest:'a'.repeat(64)}).html;expect(html).toContain('委托生产物料授权书');expect(html).toContain('font-family:"Authorization Noto Sans SC"');expect(html).toContain('data:font/otf;base64,');});
});
