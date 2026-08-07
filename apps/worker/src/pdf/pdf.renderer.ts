import { createHash } from 'node:crypto';
import type { ChromiumPdfRenderer, PdfRenderInput } from '@auth/template-engine';

export type SignaturePlacement = { slotId:string; page:number; x:number; y:number; width:number; height:number };
export type FinalRenderInput = {
  renderInput: PdfRenderInput;
  resource: { bytes:Buffer; mimeType:'image/png'|'image/jpeg'; sha256:string };
  placements: SignaturePlacement[];
};

const sha256=(value:Buffer)=>createHash('sha256').update(value).digest('hex');
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;

/** Final rendering deliberately delegates to Task10's only Chromium renderer. */
export class PdfRenderer {
  constructor(private readonly shared: Pick<ChromiumPdfRenderer,'render'>) {}
  async renderFinal(input:FinalRenderInput):Promise<Buffer>{
    if(sha256(input.resource.bytes)!==input.resource.sha256)throw new Error('SIGNATURE_RESOURCE_SHA_MISMATCH');
    const placements=new Map(input.placements.map((item)=>[item.slotId,item]));const required:string[]=[];const ast=clone(input.renderInput.ast) as any;
    const visit=(nodes:any[]):void=>nodes.forEach((node:any)=>{
      if(node.type==='signatureSlot'&&node.signer==='PARTY_A'&&node.required){
        required.push(node.slotId);
        const placement=placements.get(node.slotId);
        if(!placement||placement.page!==node.page)throw new Error('SIGNATURE_PLACEMENT_MISSING');
        if(placement.x<node.x||placement.y<node.y||placement.x+placement.width>node.x+node.width||placement.y+placement.height>node.y+node.height)throw new Error('SIGNATURE_PLACEMENT_OUT_OF_BOUNDS');
        return;
      }
      if(Array.isArray(node.children))visit(node.children);if(Array.isArray(node.rows))node.rows.forEach((row:any[])=>row.forEach((cell:any)=>visit(cell.children??[])));
    });
    visit(ast.children??[]);visit(ast.header??[]);visit(ast.footer??[]);
    if(required.length===0||new Set(required).size!==placements.size)throw new Error('SIGNATURE_PLACEMENT_SET_MISMATCH');
    const source=`data:${input.resource.mimeType};base64,${input.resource.bytes.toString('base64')}`;return this.shared.render({...input.renderInput,ast,signatureOverlays:Object.fromEntries(input.placements.map(item=>[item.slotId,{...item,source}]))});
  }
}
