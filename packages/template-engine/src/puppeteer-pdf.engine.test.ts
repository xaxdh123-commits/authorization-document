import { afterEach, expect, it, vi } from 'vitest';
import { PuppeteerPdfEngine } from './puppeteer-pdf.engine.js';

afterEach(() => { delete process.env.CHROMIUM_ALLOW_NO_SANDBOX;delete process.env.CHROMIUM_EXPECTED_MAJOR; });

function fixture() {
  let requestHandler: ((request: any) => void) | undefined;
  const page = {
    setDefaultNavigationTimeout: vi.fn(), setDefaultTimeout: vi.fn(), setRequestInterception: vi.fn(),
    on: vi.fn((event:string,handler:(request:any)=>void)=>{if(event==='request')requestHandler=handler;}),
    setContent: vi.fn(), evaluate:vi.fn(async()=>undefined),pdf: vi.fn(async()=>new Uint8Array(Buffer.from('%PDF-1.4\n%%EOF'))),
  };
  const close=vi.fn();
  const launcher={launch:vi.fn(async()=>({version:async()=>'Chrome/140.0.0.0',newPage:async()=>page,close}))};
  return{page,close,launcher,handler:()=>requestHandler!};
}

it('blocks network and file protocols, applies timeouts, and keeps Chromium sandboxed by default',async()=>{
  const {page,close,launcher,handler}=fixture();
  const engine=new PuppeteerPdfEngine({executablePath:'chrome',timeoutMs:12_000},launcher as any);
  await expect(engine.render('<body data-renderer-fingerprint="__PDF_RENDERER_FINGERPRINT__">授权书</body>',{format:'A4',printBackground:true,preferCSSPageSize:true})).resolves.toEqual(Buffer.from('%PDF-1.4\n%%EOF'));
  expect(launcher.launch).toHaveBeenCalledWith(expect.objectContaining({args:[]}));
  expect(page.setDefaultNavigationTimeout).toHaveBeenCalledWith(12_000);
  expect(page.setDefaultTimeout).toHaveBeenCalledWith(12_000);
  expect(page.setRequestInterception).toHaveBeenCalledWith(true);
  expect(page.setContent).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({waitUntil:'domcontentloaded',timeout:12_000}));
  expect(page.evaluate).toHaveBeenCalledTimes(1);
  expect(page.setContent.mock.calls[0][0]).toMatch(/data-renderer-fingerprint="auth-pdf-v3:[a-f0-9]{64}"/);
  expect(page.setContent.mock.calls[0][0]).not.toContain('__PDF_RENDERER_FINGERPRINT__');
  for(const url of ['https://evil.example/image.png','http://evil.example','file:///etc/passwd']){const request={url:()=>url,abort:vi.fn(),continue:vi.fn()};handler()(request);expect(request.abort).toHaveBeenCalled();expect(request.continue).not.toHaveBeenCalled();}
  for(const url of ['data:image/png;base64,AA==','blob:local','about:blank']){const request={url:()=>url,abort:vi.fn(),continue:vi.fn()};handler()(request);expect(request.continue).toHaveBeenCalled();expect(request.abort).not.toHaveBeenCalled();}
  expect(close).toHaveBeenCalled();
});

it('disables the sandbox only through the explicit controlled environment flag',async()=>{
  process.env.CHROMIUM_ALLOW_NO_SANDBOX='true';
  const {launcher}=fixture();
  await new PuppeteerPdfEngine({executablePath:'chrome'},launcher as any).render('<b>x</b>',{format:'A4',printBackground:true,preferCSSPageSize:true});
  expect(launcher.launch).toHaveBeenCalledWith(expect.objectContaining({args:['--no-sandbox','--disable-setuid-sandbox']}));
});
it('fails closed when Chromium major differs from the pinned deployment fingerprint',async()=>{process.env.CHROMIUM_EXPECTED_MAJOR='140';const {launcher}=fixture();(launcher.launch as any).mockResolvedValueOnce({version:async()=>'Chrome/139.0.1',newPage:async()=>({}),close:async()=>undefined});await expect(new PuppeteerPdfEngine({executablePath:'chrome'},launcher as any).render('<b>x</b>',{format:'A4',printBackground:true,preferCSSPageSize:true})).rejects.toThrow('CHROMIUM_MAJOR_VERSION_MISMATCH');delete process.env.CHROMIUM_EXPECTED_MAJOR;});
it('fails at construction in production when the expected Chromium major is not configured',()=>{const old=process.env.NODE_ENV;process.env.NODE_ENV='production';const {launcher}=fixture();expect(()=>new PuppeteerPdfEngine({executablePath:'chrome'},launcher as any)).toThrow('CHROMIUM_EXPECTED_MAJOR_NOT_CONFIGURED');expect(launcher.launch).not.toHaveBeenCalled();if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old;});
it('probes and closes Chromium before serving work',async()=>{process.env.CHROMIUM_EXPECTED_MAJOR='140';const {launcher,close}=fixture();await expect(new PuppeteerPdfEngine({executablePath:'chrome'},launcher as any).probeChromeMajor()).resolves.toBe('140');expect(close).toHaveBeenCalledTimes(1);});
it('closes the probe browser when the pinned major mismatches',async()=>{process.env.CHROMIUM_EXPECTED_MAJOR='141';const {launcher,close}=fixture();await expect(new PuppeteerPdfEngine({executablePath:'chrome'},launcher as any).probeChromeMajor()).rejects.toThrow('CHROMIUM_MAJOR_VERSION_MISMATCH:141:140');expect(close).toHaveBeenCalledTimes(1);});
it('closes a browser that launches after the startup timeout',async()=>{const close=vi.fn();const launcher={launch:()=>new Promise(resolve=>setTimeout(()=>resolve({close}),20))};await expect(new PuppeteerPdfEngine({executablePath:'chrome',timeoutMs:5},launcher as any).probeChromeMajor()).rejects.toThrow('CHROMIUM_RENDER_TIMEOUT');await new Promise(resolve=>setTimeout(resolve,30));expect(close).toHaveBeenCalledTimes(1);});
