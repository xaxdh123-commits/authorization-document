import puppeteer from 'puppeteer-core';
import type { BrowserPdfEngine, PdfOptions } from './pdf-renderer';
import { createPdfRendererFingerprint, PDF_RENDERER_FINGERPRINT_PLACEHOLDER } from './font-asset.js';

type Launcher = { launch(options: Record<string, unknown>): Promise<any> };
const allowedProtocol = (url: string) => ['data:', 'blob:', 'about:'].some((protocol) => url.startsWith(protocol));
const timeoutError = () => Object.assign(new Error('CHROMIUM_RENDER_TIMEOUT'), { code: 'CHROMIUM_RENDER_TIMEOUT' });
const withTimeout = <T>(operation: T | PromiseLike<T>, timeoutMs: number) => new Promise<T>((resolve, reject) => {
  const timer = setTimeout(() => reject(timeoutError()), timeoutMs);
  Promise.resolve(operation).then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
});
const launchWithTimeout=async(operation:Promise<any>,timeoutMs:number)=>new Promise<any>((resolve,reject)=>{let expired=false;const timer=setTimeout(()=>{expired=true;reject(timeoutError());},timeoutMs);operation.then(browser=>{if(expired){void Promise.resolve(browser.close()).catch(()=>undefined);return;}clearTimeout(timer);resolve(browser);},error=>{if(!expired){clearTimeout(timer);reject(error);}});});

export class PuppeteerPdfEngine implements BrowserPdfEngine {
  constructor(private readonly config: { executablePath?: string; timeoutMs?: number } = {}, private readonly launcher: Launcher = puppeteer as unknown as Launcher) {
    if(process.env.NODE_ENV==='production'){
      if(!config.executablePath?.trim()&&!process.env.CHROMIUM_EXECUTABLE_PATH?.trim())throw new Error('CHROMIUM_EXECUTABLE_PATH_NOT_CONFIGURED');
      if(!process.env.CHROMIUM_EXPECTED_MAJOR?.trim())throw new Error('CHROMIUM_EXPECTED_MAJOR_NOT_CONFIGURED');
    }
  }

  async probeChromeMajor():Promise<string>{
    const executablePath=this.config.executablePath?.trim()||process.env.CHROMIUM_EXECUTABLE_PATH?.trim();if(!executablePath)throw new Error('CHROMIUM_EXECUTABLE_PATH_NOT_CONFIGURED');
    const timeoutMs=this.config.timeoutMs??30_000;const args=process.env.CHROMIUM_ALLOW_NO_SANDBOX==='true'?['--no-sandbox','--disable-setuid-sandbox']:[];const browser=await launchWithTimeout(this.launcher.launch({executablePath,headless:true,args}),timeoutMs);
    try{const version=String(await withTimeout(browser.version(),timeoutMs));const actual=/\/(\d+)(?:\.|$)/.exec(version)?.[1];if(!actual)throw new Error('CHROMIUM_MAJOR_VERSION_UNKNOWN');const expected=process.env.CHROMIUM_EXPECTED_MAJOR?.trim();if(expected&&actual!==expected)throw new Error(`CHROMIUM_MAJOR_VERSION_MISMATCH:${expected}:${actual}`);return actual;}finally{await browser.close();}
  }

  async render(html: string, options: PdfOptions): Promise<Buffer> {
    const executablePath = this.config.executablePath?.trim() || process.env.CHROMIUM_EXECUTABLE_PATH?.trim();
    if (!executablePath) throw Object.assign(new Error('CHROMIUM_EXECUTABLE_PATH_NOT_CONFIGURED'), { code: 'CHROMIUM_EXECUTABLE_PATH_NOT_CONFIGURED' });
    const expectedMajor=process.env.CHROMIUM_EXPECTED_MAJOR?.trim();
    if(process.env.NODE_ENV==='production'&&!expectedMajor)throw new Error('CHROMIUM_EXPECTED_MAJOR_NOT_CONFIGURED');
    const timeoutMs = this.config.timeoutMs ?? 30_000;
    const args = process.env.CHROMIUM_ALLOW_NO_SANDBOX === 'true' ? ['--no-sandbox', '--disable-setuid-sandbox'] : [];
    const browser = await launchWithTimeout(this.launcher.launch({ executablePath, headless: true, args }), timeoutMs);
    try {
      const version=String(await withTimeout(browser.version(),timeoutMs));const actual=/\/(\d+)(?:\.|$)/.exec(version)?.[1];if(!actual)throw new Error('CHROMIUM_MAJOR_VERSION_UNKNOWN');
      if(expectedMajor&&actual!==expectedMajor)throw new Error(`CHROMIUM_MAJOR_VERSION_MISMATCH:${expectedMajor}:${actual}`);
      const renderedHtml=html.replaceAll(PDF_RENDERER_FINGERPRINT_PLACEHOLDER,createPdfRendererFingerprint(actual));
      const page:any = await withTimeout<any>(browser.newPage(), timeoutMs);
      page.setDefaultNavigationTimeout(timeoutMs);
      page.setDefaultTimeout(timeoutMs);
      await withTimeout(page.setRequestInterception(true), timeoutMs);
      page.on('request', (request: any) => { if (allowedProtocol(request.url())) request.continue(); else request.abort('blockedbyclient'); });
      await withTimeout(page.setContent(renderedHtml, { waitUntil: 'domcontentloaded', timeout: timeoutMs }), timeoutMs);
      await withTimeout(page.evaluate(async()=>{await document.fonts.ready;await Promise.all(Array.from(document.images).map(async image=>{if(!image.complete)await new Promise<void>((resolve,reject)=>{image.addEventListener('load',()=>resolve(),{once:true});image.addEventListener('error',()=>reject(new Error('PDF_IMAGE_LOAD_FAILED')),{once:true});});await image.decode();}));}),timeoutMs);
      return Buffer.from(await withTimeout(page.pdf(options), timeoutMs));
    } finally {
      await browser.close();
    }
  }
}
