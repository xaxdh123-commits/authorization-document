import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import PgBoss from 'pg-boss';
import { PdfFinalizationConsumer } from './pdf-finalization.consumer';

async function ensureFinalizedQueue(boss:PgBoss){const name='authorization-pdf-finalized';const existing=await boss.getQueue(name);if(!existing){await boss.createQueue(name,{name,policy:'singleton'});return;}if(existing.policy!=='singleton'){await boss.updateQueue(name,{name,policy:'singleton'});const verified=await boss.getQueue(name);if(verified?.policy!=='singleton')throw new Error(`PG_BOSS_QUEUE_POLICY_UPDATE_FAILED:${name}:${verified?.policy??'missing'}`);}}

@Injectable()
export class PdfBossConsumer implements OnModuleInit,OnApplicationShutdown{
  private boss?:PgBoss;
  constructor(private readonly consumer:PdfFinalizationConsumer){}
  async onModuleInit(){
    if(process.env.PG_BOSS_ENABLED!=='true')return;const url=process.env.DATABASE_URL?.trim();if(!url)throw new Error('DATABASE_URL_NOT_CONFIGURED');
    this.boss=new PgBoss(url);await this.boss.start();await ensureFinalizedQueue(this.boss);
    await this.boss.work('authorization-pdf-finalized',{pollingIntervalSeconds:1,includeMetadata:true},async jobs=>{for(const job of jobs)await this.consumer.consume({id:job.id,data:job.data as any,retryCount:job.retryCount,retryLimit:job.retryLimit});});
  }
  async onApplicationShutdown(){await this.boss?.stop({graceful:true,timeout:30_000});}
}
