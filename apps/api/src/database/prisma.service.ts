import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly db = new PrismaClient();

  async onModuleInit() {
    await this.db.$connect();
  }

  async onModuleDestroy() {
    await this.db.$disconnect();
  }
}
