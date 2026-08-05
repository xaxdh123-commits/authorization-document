import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
@Injectable() export class PrismaService implements OnModuleInit,OnModuleDestroy { async onModuleInit(){} async onModuleDestroy(){} }
