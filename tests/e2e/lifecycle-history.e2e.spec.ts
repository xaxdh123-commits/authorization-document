import { expect, test } from '@playwright/test';
import { inspectE2EPrerequisites } from './prerequisites';

const prerequisites = inspectE2EPrerequisites(process.env);
const requiredEnv = (name: string) => { const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required for deterministic lifecycle fixture`);return value; };
const files = [
  { key: 'authorization-letter', name: 'authorization-v1.pdf' },
  { key: 'business-license', name: 'license.pdf' },
  { key: 'trademark-certificate', name: 'trademark.pdf' },
] as const;

test.describe('确定性业务单生命周期、历史与断链', () => {
  test.skip(!prerequisites.ready || !process.env.E2E_H5_URL, !process.env.E2E_H5_URL ? 'E2E_H5_URL 未配置：真实浏览器流程 NOT_RUN' : prerequisites.reason ?? '专用 _test DB/API 未配置');
  test('三文件、自动保存恢复、驳回重签、历史下载与一秒内关链', async ({ request, page }) => {
    const api=(path:string)=>new URL(path,prerequisites.apiUrl).toString();
    const publicToken=requiredEnv('E2E_LIFECYCLE_PUBLIC_TOKEN');const caseId=requiredEnv('E2E_LIFECYCLE_CASE_ID');const adminToken=requiredEnv('E2E_ADMIN_TOKEN');const requirementId=requiredEnv('E2E_AUTHORIZATION_REQUIREMENT_VERSION_ID');
    const publicHeaders={Authorization:`Bearer ${publicToken}`};const adminHeaders={Authorization:`Bearer ${adminToken}`,'content-type':'application/json'};
    const signAndSubmit=async(tokenValue:string)=>{const headers={Authorization:`Bearer ${tokenValue}`};const previewResponse=await request.post(api('/public/signing/preview'),{headers});expect(previewResponse.ok()).toBe(true);const preview=await previewResponse.json();const resourceResponse=await request.post(api('/public/signing/resources'),{headers,multipart:{purpose:'HANDWRITTEN',file:{name:'signature.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nJ8AAAAASUVORK5CYII=','base64')}}});expect(resourceResponse.ok()).toBe(true);const resource=await resourceResponse.json();const preparedResponse=await request.post(api('/public/signing/prepare'),{headers:{...headers,'content-type':'application/json'},data:{mode:'HANDWRITTEN',signatureResourceId:resource.fileVersionId,signatureResourceVersion:resource.version,declaration:true,positions:preview.slots.filter((slot:any)=>slot.required).map((slot:any)=>({slotId:slot.slotId,page:slot.page,x:slot.x,y:slot.y,width:slot.width,height:slot.height}))}});expect(preparedResponse.ok()).toBe(true);const prepared=await preparedResponse.json();const submitted=await request.post(api('/public/submit'),{headers:{...headers,'content-type':'application/json'},data:{signingVersion:prepared.signingVersion,consent:true,declaration:true}});expect(submitted.ok()).toBe(true);};
    const draft={baseVersion:0,answers:{brandName:'确定性品牌',customerName:'测试委托方',factory:'指定工厂',material:'标签',quantity:'1000',spec:'10×10',materialType:'PVC',process:'四色印刷',contact:'张三',phone:'13800000000'}};
    expect((await request.put(api('/public/draft'),{headers:{...publicHeaders,'content-type':'application/json'},data:draft})).ok()).toBe(true);
    for(const file of files){const response=await request.post(api('/public/files'),{headers:publicHeaders,multipart:{requirementKey:file.key,file:{name:file.name,mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n%%EOF')}}});expect(response.ok(),file.name).toBe(true);}
    const url=`${requiredEnv('E2E_H5_URL').replace(/\/$/,'')}/p/${publicToken}`;await page.goto(url);await page.reload();await page.goto('about:blank');await page.goto(url);
    for(const value of Object.values(draft.answers)){const restored=await page.locator('input,textarea').evaluateAll((elements,expected)=>elements.some(element=>(element as HTMLInputElement).value===expected),value);expect(restored,`restored ${value}`).toBe(true);}
    for(const file of files)await expect(page.getByText(file.name)).toBeVisible();
    const readonly=page.locator('input[readonly],textarea[readonly]');expect(await readonly.count()).toBeGreaterThanOrEqual(2);

    await signAndSubmit(publicToken);
    const caseDetail=await (await request.get(api(`/cases/${caseId}`),{headers:adminHeaders})).json();
    const requirementIds=(caseDetail.snapshots?.[0]?.requirements??[]).map((item:any)=>item.requirementVersionId);
    expect(requirementIds).toContain(requirementId);

    expect((await request.post(api(`/review/${caseId}/claim`),{headers:adminHeaders})).ok()).toBe(true);
    for(const id of requirementIds){const decision=id===requirementId?'REJECT':'APPROVE';const reviewed=await request.post(api(`/review/${caseId}/items/${id}`),{headers:adminHeaders,data:{decision,reason:decision==='REJECT'?'授权书盖章位置不正确':undefined}});expect(reviewed.ok()).toBe(true);}
    const rejected=await request.post(api(`/review/${caseId}/confirm`),{headers:adminHeaders});expect(rejected.ok()).toBe(true);
    const supplementToken=(await rejected.json()).supplementToken;expect(supplementToken).toBeTruthy();
    const newHeaders={Authorization:`Bearer ${supplementToken}`};
    const supplementView=await (await request.get(api('/public/case'),{headers:newHeaders})).json();
    expect(supplementView.requirements.filter((item:any)=>item.locked)).toHaveLength(2);
    const replacement=await request.post(api('/public/files'),{headers:newHeaders,multipart:{requirementKey:'authorization-letter',file:{name:'authorization-v2.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n% replacement\n%%EOF')}}});expect(replacement.ok()).toBe(true);
    await signAndSubmit(supplementToken);
    const rereview=await request.post(api(`/review/${caseId}/items/${requirementId}`),{headers:adminHeaders,data:{decision:'APPROVE'}});expect(rereview.ok()).toBe(true);
    const finalizing=await request.post(api(`/review/${caseId}/confirm`),{headers:adminHeaders});expect(finalizing.ok()).toBe(true);
    await expect.poll(async()=>{const response=await request.get(api(`/cases/${caseId}`),{headers:adminHeaders});return (await response.json()).status;},{timeout:60_000}).toBe('COMPLETED');

    const histories=await request.get(api(`/cases/${caseId}/histories`),{headers:adminHeaders});expect(histories.ok()).toBe(true);
    const fileHistory=await request.get(api(`/cases/${caseId}/files/history`),{headers:adminHeaders});expect(fileHistory.ok()).toBe(true);
    const versions=await fileHistory.json();for(const version of versions.flatMap((item:any)=>item.versions??[])){const download=await request.get(api(`/cases/${caseId}/files/${version.id}/download`),{headers:adminHeaders});expect(download.ok()).toBe(true);}
    const started=Date.now();const closed=await request.get(api('/public/case'),{headers:newHeaders});expect([404,410]).toContain(closed.status());expect(Date.now()-started).toBeLessThanOrEqual(1000);
  });
});
