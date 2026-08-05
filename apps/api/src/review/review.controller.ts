import { Controller, Get } from '@nestjs/common'; @Controller('review') export class ReviewController { @Get('queue') queue(){ return {items:[] as unknown[]}; } }
