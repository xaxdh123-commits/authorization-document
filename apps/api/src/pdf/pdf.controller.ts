import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AbilityGuard, type RequestAuthContext } from '../auth/ability.guard';
import { RequireAbility } from '../auth/require-ability.decorator';
import { PrismaService } from '../database/prisma.service';
import { PdfRetryService } from './pdf-retry.service';
@Controller('cases/:caseId/pdf')@UseGuards(AbilityGuard)
export class PdfController{
  constructor(private readonly prisma:PrismaService,private readonly retryService:PdfRetryService){}
  @RequireAbility('CASE_READ')@Get('status')status(@Param('caseId')caseId:string){return this.prisma.db.pdfTask.findFirst({where:{caseId},select:{id:true,status:true,attempts:true,maxAttempts:true,failureCode:true,failureMessage:true,outputSha256:true,finishedAt:true,finalizationStatus:true,finalizationAttempts:true,finalizationFailure:true,finalizationFailedAt:true,finalizedAt:true},orderBy:{createdAt:'desc'}});}
  @RequireAbility('PDF_RETRY')@Post('retry')retry(@Param('caseId')caseId:string,@Body()body:any,@Req()request:{auth:RequestAuthContext}){return this.retryService.retry(caseId,request.auth.user.userId,body?.reason);}
}
