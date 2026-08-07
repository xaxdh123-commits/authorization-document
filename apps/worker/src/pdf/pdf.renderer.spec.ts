import { describe, expect, it } from 'vitest';
import { PdfRenderer } from './pdf.renderer.js';

describe('PdfRenderer', () => {
  it('rejects a signature resource whose persisted digest changed before Chromium is invoked', async () => {
    const inputs: any[]=[];
    const renderer = new PdfRenderer({ render: async (input: unknown) => { inputs.push(input); return Buffer.from('%PDF-1.4\n%%EOF'); } } as any);
    await renderer.renderFinal({
      renderInput: { templateVersionId:'t1',draftVersion:2,contentDigest:'c',snapshot:{},ast:{type:'page',children:[{type:'signatureSlot',slotId:'a',signer:'PARTY_A',page:1,x:10,y:20,width:30,height:40,required:true}]} },
      resource: { bytes: Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x49,0x45,0x4e,0x44]), mimeType:'image/png', sha256:'bad' },
      placements: [{ slotId:'a',page:1,x:10,y:20,width:30,height:40 }],
    } as any).catch(() => undefined);
    expect(inputs).toHaveLength(0);
  });
});
