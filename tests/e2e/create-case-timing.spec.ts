import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { inspectE2EPrerequisites } from './prerequisites';

const prerequisites=inspectE2EPrerequisites(process.env);
const required=(name:string)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value;};

test.describe('客服创建业务单并复制链接耗时',()=>{
  test.skip(!prerequisites.ready,prerequisites.reason??'专用 _test DB/API 未配置');
  test('连续五次均在180秒内完成',async({request})=>{
    const api=(path:string)=>new URL(path,prerequisites.apiUrl).toString();const headers={Authorization:`Bearer ${required('E2E_ADMIN_TOKEN')}`,'content-type':'application/json'};const durations:number[]=[];const requirementVersionIds=required('E2E_TIMING_REQUIREMENT_VERSION_IDS').split(',').map(value=>value.trim()).filter(Boolean);expect(requirementVersionIds).toHaveLength(3);
    for (let run = 1; run <= 5; run++) {
      const started=Date.now();const created=await request.post(api('/cases'),{headers,data:{customerName:`计时委托方-${run}`,contactName:'张三',factoryDepartment:'计时工厂',templateVersionId:required('E2E_TIMING_TEMPLATE_VERSION_ID'),requirementVersionIds,materials:[1,2,3].map(index=>({name:`物料-${index}`,specification:'10x10',quantity:100*index,material:'PVC',craft:'四色印刷'})),quotationSource:'MANUAL',quotationSnapshot:{timingRun:run}}});expect(created.ok()).toBe(true);const item=await created.json();const linked=await request.post(api(`/cases/${item.id}/submit`),{headers,data:{linkExpiresInDays:7}});expect(linked.ok()).toBe(true);expect((await linked.json()).accessToken).toBeTruthy();const elapsed=Date.now()-started;expect(elapsed).toBeLessThan(180_000);durations.push(elapsed);
    }
    const path=resolve(import.meta.dirname,'../../docs/acceptance/evidence/create-case-timing.json');mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify({executedAt:new Date().toISOString(),thresholdMs:180_000,durations,status:'PASS'},null,2));
  });
});
