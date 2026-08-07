import { BadRequestException, Controller, Delete, ForbiddenException, Get, Headers, InternalServerErrorException, NotFoundException, Param, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { pipeline } from 'node:stream/promises';
import { AbilityGuard } from '../auth/ability.guard';
import { RequireAbility } from '../auth/require-ability.decorator';
import { FileService, type IncomingFile } from './file.service';
import { safeAttachmentDisposition } from './file-policy';
import { PublicUploadGateGuard, PublicUploadGateInterceptor } from './public-upload-gate';

const uploadOptions={limits:{fileSize:20*1024*1024,files:1}};
const tokenFrom=(authorization?:string)=>{const token=authorization?.replace(/^Bearer\s+/i,'').trim();if(!token)throw new BadRequestException('缺少访问令牌');return token;};
async function download(files:FileService,response:any,result:Awaited<ReturnType<FileService['get']>>,request?:any){
  const audit={caseId:result.audit.caseId,fileVersionId:result.version.id,actorType:result.audit.actorType,actorUserId:request?.auth?.user?.userId,requestId:request?.headers?.['x-request-id']};
  await files.authorizeDownload(audit);
  response.setHeader('Content-Type',result.version.mimeType);response.setHeader('Content-Disposition',safeAttachmentDisposition(result.version.originalName));response.setHeader('X-Content-Type-Options','nosniff');
  const recordOutcome=async(input:Parameters<FileService['recordDownload']>[0])=>{try{await files.recordDownload(input);}catch{process.stderr.write(`${JSON.stringify({level:'error',message:'DOWNLOAD_RESULT_AUDIT_FAILED',requestId:input.requestId??null,targetType:'FileVersion',targetId:input.fileVersionId,result:input.result})}\n`);}};
  try{await pipeline(result.stream,response);await recordOutcome({...audit,result:'SUCCESS'});}catch(error){await recordOutcome({...audit,result:'FAILURE',reason:(error as NodeJS.ErrnoException)?.code??'STREAM_FAILED'});if((error as NodeJS.ErrnoException)?.code==='ENOENT')throw new NotFoundException('文件内容不存在');throw new InternalServerErrorException('文件下载失败',{cause:error instanceof Error?error:undefined});}
}

@Controller('cases') @UseGuards(AbilityGuard)
export class FilesController {
  constructor(private readonly files:FileService){}
  @Get(':caseId/files/:fileVersionId/download') @RequireAbility('FILE_READ') async ordinary(@Param('caseId')caseId:string,@Param('fileVersionId')id:string,@Res()response:any,@Req()request?:any){const result=await this.files.get(caseId,id);if(result.sensitive)throw new ForbiddenException('敏感文件需使用敏感资料权限入口');return download(this.files,response,result,request);}
  @Get(':caseId/files/:fileVersionId/sensitive-download') @RequireAbility('SENSITIVE_FILE_READ') async sensitive(@Param('caseId')caseId:string,@Param('fileVersionId')id:string,@Res()response:any,@Req()request?:any){return download(this.files,response,await this.files.get(caseId,id),request);}
}

@Controller('public')
export class PublicFilesController {
  constructor(private readonly files:FileService){}
  @Post('files') @UseGuards(PublicUploadGateGuard) @UseInterceptors(PublicUploadGateInterceptor,FileInterceptor('file',uploadOptions)) upload(@Req()request:any,@UploadedFile()file:IncomingFile){if(!file)throw new BadRequestException('请选择文件');return this.files.uploadPublic(request.publicUploadToken,String(request.body?.requirementKey??''),file);}
  @Get('files') list(@Headers('authorization')auth:string|undefined){return this.files.listPublic(tokenFrom(auth));}
  @Delete('files/:fileId') remove(@Headers('authorization')auth:string|undefined,@Param('fileId')fileId:string){return this.files.removePublic(tokenFrom(auth),fileId);}
  @Post('signing/resources') @UseGuards(PublicUploadGateGuard) @UseInterceptors(PublicUploadGateInterceptor,FileInterceptor('file',uploadOptions)) uploadSigning(@Req()request:any,@UploadedFile()file:IncomingFile){if(!file)throw new BadRequestException('请选择签名或印章图片');return this.files.uploadSigningResource(request.publicUploadToken,String(request.body?.purpose??'') as 'HANDWRITTEN'|'SEAL_ORIGINAL'|'SEAL_PROCESSED',file,request.body?.originalFileVersionId ? String(request.body.originalFileVersionId) : undefined);}
  @Get('files/:fileVersionId') async get(@Headers('authorization')auth:string|undefined,@Param('fileVersionId')id:string,@Res()response:any,@Req()request?:any){return download(this.files,response,await this.files.getPublic(tokenFrom(auth),id),request);}
}
