import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
export type VisualManifest = {
  dpi: 144;
  chromeMajor: string;
  fontSha256: string;
  platform: string;
  status: 'READY' | 'NOT_RUN';
  pages?: Array<{ name: string; sha256: string }>;
};
export const twentyMaterialFixture = { name:'twenty-materials-long-text-pagination-signature-bounds',materials:Array.from({length:20},(_,index)=>({name:`物料-${index+1}-超长中文名称用于验证自动换行与分页稳定性`,quantity:(index+1)*100,specification:'10×10cm / PVC不干胶 / 四色印刷覆膜模切'})),longText:'委托方确认所提交资料真实、完整并授权受托方按照资料生产指定物料。'.repeat(80),signatureBounds:{page:3,x:300,y:650,width:180,height:80} };
export async function sha256File(path:string){return createHash('sha256').update(await readFile(path)).digest('hex');}
export function assertVisualEnvironment(manifest:VisualManifest,actual:{chromeMajor?:string;fontSha256?:string;platform:string}){if(manifest.status!=='READY')throw new Error('PDF_VISUAL_BASELINE_NOT_RUN');if(manifest.dpi!==144||manifest.chromeMajor!==actual.chromeMajor||manifest.fontSha256!==actual.fontSha256||manifest.platform!==actual.platform)throw new Error('PDF_VISUAL_ENVIRONMENT_MISMATCH');}
export async function compareRasterPng(actual:Buffer,baseline:Buffer){const a=await sharp(actual).removeAlpha().raw().toBuffer({resolveWithObject:true});const b=await sharp(baseline).removeAlpha().raw().toBuffer({resolveWithObject:true});if(a.info.width!==b.info.width||a.info.height!==b.info.height||a.info.channels!==b.info.channels)return{differentPixels:a.info.width*a.info.height,totalPixels:a.info.width*a.info.height,ratio:1};let differentPixels=0;for(let i=0;i<a.data.length;i+=a.info.channels){let changed=false;for(let channel=0;channel<a.info.channels;channel++)if(Math.abs(a.data[i+channel]-b.data[i+channel])>8)changed=true;if(changed)differentPixels++;}const totalPixels=a.info.width*a.info.height;return{differentPixels,totalPixels,ratio:differentPixels/totalPixels};}

export async function verifyPdfVisualBaseline(
  pdf: Buffer,
  manifest: VisualManifest,
  actualEnvironment: { chromeMajor?: string; fontSha256?: string; platform: string },
  rasterize: (pdf: Buffer, dpi: 144) => Promise<Buffer[]>,
  loadBaseline: (name: string) => Promise<Buffer>,
) {
  assertVisualEnvironment(manifest, actualEnvironment);
  if (!manifest.pages?.length) throw new Error('PDF_VISUAL_BASELINE_PAGES_MISSING');

  const actualPages = await rasterize(pdf, manifest.dpi);
  if (actualPages.length !== manifest.pages.length) {
    throw new Error('PDF_VISUAL_PAGE_COUNT_MISMATCH');
  }

  const pages = [];
  for (let index = 0; index < manifest.pages.length; index += 1) {
    const expected = manifest.pages[index];
    const baseline = await loadBaseline(expected.name);
    if (expected.sha256 !== 'ignored') {
      const baselineHash = createHash('sha256').update(baseline).digest('hex');
      if (baselineHash !== expected.sha256) throw new Error('PDF_VISUAL_BASELINE_HASH_MISMATCH');
    }
    const comparison = await compareRasterPng(actualPages[index], baseline);
    if (comparison.ratio > 0.005) throw new Error('PDF_VISUAL_DIFF_EXCEEDED');
    pages.push({ name: expected.name, ...comparison });
  }
  return { pages };
}
