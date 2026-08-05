import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
@Injectable() export class PrismaService implements OnModuleInit,OnModuleDestroy {
  readonly client: { $connect:()=>Promise<void>; $disconnect:()=>Promise<void> };
  constructor(){ const Ctor=require('@prisma/client').PrismaClient; this.client=new Ctor(); }
  async onModuleInit(){ await this.client.$connect(); }
  async onModuleDestroy(){ await this.client.$disconnect(); }
}
