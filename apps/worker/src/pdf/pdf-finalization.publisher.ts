export type PdfFinalizedEvent={jobId:string;caseId:string;businessVersion:number;fileObjectId:string;sha256:string};
export type PdfQueueOutboxMessage={id:string;taskId:string;queueName:string;generation:number;payload:unknown};
export interface BossPublisher{send(name:string,data:unknown,options:Record<string,unknown>):Promise<string|null|undefined>}
export interface PdfQueueOutboxStore{pending(limit:number):Promise<PdfQueueOutboxMessage[]>;markPublished(id:string,bossJobId:string):Promise<void>;recordFailure(id:string,reason:string):Promise<void>}
const options=(message:{taskId:string;generation:number;queueName:string})=>({singletonKey:`${message.taskId}:${message.generation}`,retryLimit:message.queueName.endsWith('finalized')?5:3,retryDelay:5,retryBackoff:true,expireInSeconds:45});

export class PdfFinalizationPublisher{
  constructor(private readonly boss:BossPublisher,private readonly outbox?:PdfQueueOutboxStore){}
  async publish(event:PdfFinalizedEvent,generation=0){return this.boss.send('authorization-pdf-finalized',event,options({taskId:event.jobId,generation,queueName:'authorization-pdf-finalized'}));}
  async publishOutbox(message:PdfQueueOutboxMessage){try{const id=await this.boss.send(message.queueName,message.payload,options(message));if(!id){await this.outbox?.recordFailure(message.id,'PG_BOSS_SEND_RETURNED_NULL');return false;}await this.outbox?.markPublished(message.id,id);return true;}catch(error){await this.outbox?.recordFailure(message.id,error instanceof Error?error.message:'PG_BOSS_SEND_FAILED');return false;}}
  async reconcile(limit=50){if(!this.outbox)return 0;const rows=await this.outbox.pending(limit);let published=0;for(const row of rows)if(await this.publishOutbox(row))published++;return published;}
}
